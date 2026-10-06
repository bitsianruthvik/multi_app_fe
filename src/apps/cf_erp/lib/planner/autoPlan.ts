import { allocate, bookUnit, emptyEnd, evaluate, floorOf, rankOf, shipPeriods } from './evaluate';
import { bookForward, forwardEnd } from './load';
import { newSupply, release, takeMaterial } from './material';
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
 * Nothing starts before its material (an ordered PO's date, or stock).
 * Finally `evaluate` re-checks; a card the material order leaves blocked is taken off again.
 */
export function autoPlan(snapshot: PlannerSnapshot, plan: Plan, options: AutoPlanOptions = {}): AutoPlanResult {
  const m = getModel(snapshot);
  const { P, periods } = m;

  const pins: Plan = {};
  for (const [k, e] of Object.entries(plan || {})) if (e?.pinned) pins[k] = e;
  const act = activeUnits(m, pins, options);
  const pinShip = shipPeriods(m, pins, act);

  // Material and hours both go in claim order — pins first, then by priority — exactly evaluate's
  // order (rankOf), since a unit left off gives its material back before the next one takes.
  const supply = newSupply(m);
  const ship = new Int32Array(m.N).fill(-1);
  const rem = Float64Array.from(m.cap);
  for (const u of [...act].sort((a, b) => rankOf(m, pins, a) - rankOf(m, pins, b))) {
    if (pinShip[u] >= 0) {
      ship[u] = pinShip[u];
      bookUnit(m, rem, pins, u, ship[u], floorOf(m, takeMaterial(m, supply, u).res), []);
      continue;
    }
    const { res, takes } = takeMaterial(m, supply, u);
    if (res.short) continue;
    const a = floorOf(m, res);
    const end = a >= P ? P : forwardEnd(m, rem, u, a);
    if (end >= P) { release(m, supply, takes); continue; }
    bookForward(m, rem, u, a, end, []);
    ship[u] = end;
  }

  const out: Plan = { ...pins };
  for (const u of act) if (ship[u] >= 0 && pinShip[u] < 0) out[m.units[u].key] = { period: periods[ship[u]].key, pinned: false };

  // Repair: material handed out in plan order (as evaluate does) can differ from booking order.
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
  if (why.notOrdered) notes.push(`${cards(why.notOrdered)} wait${why.notOrdered === 1 ? 's' : ''} for material that isn't ordered — see the Buy list.`);
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
 * Why each unplaced card is off the board. Material is handed out in plan order, as `evaluate`
 * does, so a card "waits for material" exactly when the board would say so.
 */
function waitingReasons(m: Model, ev: ReturnType<typeof evaluate>, plan: Plan) {
  const act: number[] = [];
  for (const k of Object.keys(ev.units)) { const u = m.unitIdx.get(k); if (u !== undefined) act.push(u); }
  const mat = allocate(m, plan, act, shipPeriods(m, plan, act));
  const out = { notOrdered: 0, dueAfter: 0, tooLate: 0, capacity: 0 };
  for (const u of act) {
    if (plan[m.units[u].key] || m.units[u].done) continue;
    const r = mat.get(u)!;
    if (r.short) out.notOrdered++;
    else if (r.period >= m.P) out.dueAfter++;
    else if (emptyEnd(m, u, r.period) >= m.P) out.tooLate++;
    else out.capacity++;
  }
  return out;
}
