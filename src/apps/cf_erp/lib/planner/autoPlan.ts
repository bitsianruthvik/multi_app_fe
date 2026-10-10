import { bookUnit, emptyEnd, evaluate, floorOf, rankOf, shipPeriods } from './evaluate';
import { bookForward, forwardEnd } from './load';
import { materialOf } from './material';
import { activeUnits, getModel, type Model } from './model';
import { monthLong } from './periods';
import type { AutoPlanOptions, AutoPlanResult, Plan, PlannerSnapshot } from './types';

/**
 * Auto-plan (planner v2, TM/CF_ERP_PLANNER_V2_PLAN.md). Deterministic; never moves a pinned card.
 *
 * Every active unit, in PRIORITY order, books its chain of steps as EARLY as its material and the
 * hours the units ahead of it left allow (finite capacity); the week its last step finishes is its
 * ship week. `evaluate` books an unpinned card the same way (forward from its material), in the
 * same order — so the board shows exactly what auto-plan saw. A pinned unit books where it is pinned. Projects run in
 * parallel by themselves: a later order takes whatever hours the earlier ones leave free in a week.
 * Material is the server's answer (units[].material): a card that WAITS for stock is never placed, and nothing
 * starts before its earliest week. Finally `evaluate` re-checks; a card left blocked is taken off again.
 */
export function autoPlan(snapshot: PlannerSnapshot, plan: Plan, options: AutoPlanOptions = {}): AutoPlanResult {
  const m = getModel(snapshot);
  const { P, periods } = m;

  const pins: Plan = {};
  for (const [k, e] of Object.entries(plan || {})) if (e?.pinned) pins[k] = e;
  const act = activeUnits(m, pins, options);
  const pinShip = shipPeriods(m, pins, act);

  // Hours go in claim order — pins first, then by priority — exactly evaluate's order (rankOf).
  const ship = new Int32Array(m.N).fill(-1);
  const rem = Float64Array.from(m.cap);
  for (const u of [...act].sort((a, b) => rankOf(m, pins, a) - rankOf(m, pins, b))) {
    if (pinShip[u] >= 0) {
      ship[u] = pinShip[u];
      bookUnit(m, rem, pins, u, ship[u], floorOf(m, materialOf(m, u)), []);
      continue;
    }
    const res = materialOf(m, u);
    if (res.short) continue; // waits for stock — never placed
    const a = floorOf(m, res);
    const end = a >= P ? P : forwardEnd(m, rem, u, a);
    if (end >= P) continue;
    bookForward(m, rem, u, a, end, []);
    ship[u] = end;
  }

  const out: Plan = { ...pins };
  for (const u of act) if (ship[u] >= 0 && pinShip[u] < 0) out[m.units[u].key] = { period: periods[ship[u]].key, pinned: false };

  // Repair: re-check the plan as the board will read it; a card left blocked is taken off.
  let ev = evaluate(snapshot, out, options);
  for (let round = 0; round < 5; round++) {
    const bad = Object.entries(ev.units).filter(([k, x]) => x.period && x.blocked && !out[k]?.pinned).map(([k]) => k);
    if (!bad.length) break;
    for (const k of bad) delete out[k];
    ev = evaluate(snapshot, out, options);
  }

  // notes
  const notes: string[] = [];
  const pinCount = Object.keys(pins).length;
  if (pinCount) notes.push(`Kept ${pinCount} pinned card${pinCount > 1 ? 's' : ''} where ${pinCount > 1 ? 'they are' : 'it is'}.`);

  // Why the cards left off the board wait, counted — what the planner can act on.
  const why = waitingReasons(m, ev, out);
  const lastMonth = monthLong(m.months[m.months.length - 1]);
  const cards = (n: number) => `${n} card${n === 1 ? '' : 's'}`;
  if (why.waiting) notes.push(`${cards(why.waiting)} wait${why.waiting === 1 ? 's' : ''} for stock (buying skipped or no date yet) — see ${why.waiting === 1 ? 'its' : 'their'} reasons.`);
  if (why.dueAfter) notes.push(`${cards(why.dueAfter)} wait${why.dueAfter === 1 ? 's' : ''} for material due after ${lastMonth}.`);
  if (why.tooLate) notes.push(`${cards(why.tooLate)} get${why.tooLate === 1 ? 's' : ''} ${why.tooLate === 1 ? 'its' : 'their'} material too late to finish by the end of ${lastMonth}.`);
  if (why.capacity) notes.push(`${cards(why.capacity)} ${why.capacity === 1 ? "doesn't" : "don't"} fit the machine hours left before the end of ${lastMonth}.`);

  for (const ym of m.months) {
    const mo = ev.months[ym];
    const t = Math.round(mo.tonnes);
    const goal = mo.target != null ? ` of the ${Math.round(mo.target)} t goal` : '';
    const lines = `${mo.linesShipped} line${mo.linesShipped === 1 ? '' : 's'} ship${mo.linesShipped === 1 ? 's' : ''}`;
    const limit = mo.bottleneck.fn && mo.bottleneck.pct >= 85 ? ` ${mo.bottleneck.name} is the limit (${Math.round(mo.bottleneck.pct)}%).` : '';
    notes.push(`${monthLong(ym)}: ${t} t${goal}, ${lines}.${limit}`);
  }

  // Orders worked on side by side — the parallel projects finite booking produced.
  const busy = parallelOrders(m, ev);
  if (busy.max > 1) notes.push(`Up to ${busy.max} orders are in work at once (${periods[busy.at].label}).`);

  // Machine types with no shift time: their work cannot be timed.
  const noShift = m.fnKeys.map((k, f) => ({ f, k })).filter(({ f }) => m.noCap[f] && Object.values(ev.load[m.fnKeys[f]] ?? {}).some((c) => c.minutes > 1e-6));
  for (const { f } of noShift) notes.push(`${m.fnNames[f]} has no shift time in this plan — its work is shown but cannot be timed; set its shifts.`);
  return { plan: out, notes };
}

/** The most orders with work booked in one week, and that week. */
function parallelOrders(m: Model, ev: ReturnType<typeof evaluate>): { max: number; at: number } {
  const per: Set<string>[] = m.periods.map(() => new Set());
  for (const [k, x] of Object.entries(ev.units)) {
    if (!x.period) continue;
    const u = m.unitIdx.get(k);
    if (u === undefined) continue;
    for (const pk of Object.keys(x.booked)) per[m.periodIdx.get(pk) ?? 0].add(String(m.units[u].orderId));
  }
  let max = 0, at = 0;
  per.forEach((s, p) => { if (s.size > max) { max = s.size; at = p; } });
  return { max, at };
}

/**
 * Why each unplaced card is off the board. Material is the server's answer, so a card "waits for
 * stock" exactly when the board says so.
 */
function waitingReasons(m: Model, ev: ReturnType<typeof evaluate>, plan: Plan) {
  const out = { waiting: 0, dueAfter: 0, tooLate: 0, capacity: 0 };
  for (const k of Object.keys(ev.units)) {
    const u = m.unitIdx.get(k);
    if (u === undefined || plan[k] || m.units[u].done) continue;
    const r = materialOf(m, u);
    if (r.short) out.waiting++;
    else if (r.period >= m.P) out.dueAfter++;
    else if (emptyEnd(m, u, Math.max(0, r.period)) >= m.P) out.tooLate++;
    else out.capacity++;
  }
  return out;
}
