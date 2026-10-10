import { bookBackward, bookForward, bookSpread, emptyShopEnd, forwardEnd, pctOf, type Cells } from './load';
import { earliestWords, materialOf, type MaterialResult } from './material';
import { activeUnits, getModel, type Model } from './model';
import type { CanPlaceResult, CanStretchResult, EngineOptions, Evaluation, LineEval, LoadCell, MonthEval, Plan, PlannerSnapshot, UnitEval } from './types';

export const fmtQty = (q: number) => (Math.abs(q) >= 10 ? String(Math.round(q)) : String(Number(q.toFixed(2))));

/** Ship period position of each active unit (−1 unplanned). */
export function shipPeriods(m: Model, plan: Plan, act: number[]): Int32Array {
  const ship = new Int32Array(m.N).fill(-1);
  for (const u of act) {
    const e = plan[m.units[u].key];
    if (e) ship[u] = m.periodIdx.get(e.period) ?? -1;
  }
  return ship;
}

/**
 * The order units claim material and machine hours in (planner v2): cards PINNED by hand first (a
 * person put them there), then the rest — each group by priority, so the orders ahead come first.
 */
export const rankOf = (m: Model, plan: Plan, u: number) => (plan[m.units[u].key]?.pinned ? 0 : m.N) + m.prio[u];

/**
 * The server's material answer for each active unit. Nothing is handed out here any more: the
 * server already assigned stock and POs in claim order, so units do not compete in the browser.
 * (`plan` and `ship` are kept so older callers still fit.)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function allocate(m: Model, _plan?: Plan, act: number[] = [], _ship?: Int32Array): Map<number, MaterialResult> {
  const out = new Map<number, MaterialResult>();
  for (const u of act) out.set(u, materialOf(m, u));
  return out;
}

/** The week material lets u's work start (0 = no gate; P = after the plan). */
export const floorOf = (m: Model, r: MaterialResult | undefined) => (!r || r.short ? 0 : Math.max(0, Math.min(r.period, m.P)));

/** Stretched start position of a plan entry, or −1. */
export function startOf(m: Model, plan: Plan, u: number, s: number): number {
  const k = plan[m.units[u].key]?.start;
  const a = k == null ? undefined : m.periodIdx.get(k);
  return a === undefined || a >= s ? -1 : a;
}

/**
 * Book one planned unit (see load.ts): a stretched entry spreads over start…ship; a card PINNED by
 * hand books back from its ship week (as late as it can, not before its material); an auto-placed
 * card books forward from its material (as early as it can — where auto-plan found it finishes).
 */
export function bookUnit(m: Model, rem: Float64Array, plan: Plan, u: number, s: number, floor: number, cells: Cells): { start: number; overflow: number } {
  const a = startOf(m, plan, u, s);
  if (a >= 0) { bookSpread(m, rem, u, a, s, cells); return { start: a, overflow: 0 }; }
  if (plan[m.units[u].key]?.pinned) return bookBackward(m, rem, u, s, floor, cells);
  return bookForward(m, rem, u, floor, s, cells);
}

export interface Booking {
  start: Int32Array;
  overflow: Float64Array;
  cells: (Cells | undefined)[];
  rem: Float64Array;
}

/** Every planned active unit booked in claim order (rankOf) — the units ahead keep their hours. `below`: only ranks under it. */
export function bookAll(m: Model, plan: Plan, act: number[], ship: Int32Array, mat: Map<number, MaterialResult>, below = Infinity): Booking {
  const rem = Float64Array.from(m.cap);
  const start = new Int32Array(m.N).fill(-1);
  const overflow = new Float64Array(m.N);
  const cells: (Cells | undefined)[] = new Array(m.N);
  const rank = (u: number) => rankOf(m, plan, u);
  const order = act.filter((u) => ship[u] >= 0 && rank(u) < below).sort((a, b) => rank(a) - rank(b));
  for (const u of order) {
    const c: Cells = [];
    const r = bookUnit(m, rem, plan, u, ship[u], floorOf(m, mat.get(u)), c);
    start[u] = r.start;
    overflow[u] = r.overflow;
    cells[u] = c;
  }
  return { start, overflow, cells, rem };
}

const emptyEndCache = new WeakMap<Model, Map<number, number>>();
/** Cached emptyShopEnd. */
export function emptyEnd(m: Model, u: number, a: number): number {
  let c = emptyEndCache.get(m);
  if (!c) { c = new Map(); emptyEndCache.set(m, c); }
  const key = u * (m.P + 1) + Math.max(0, a);
  let v = c.get(key);
  if (v === undefined) { v = emptyShopEnd(m, u, a); c.set(key, v); }
  return v;
}

/**
 * Why a unit cannot be where it is because of its material (the server's rule, plain words); null
 * when it can. A unit that waits cannot be planned; a dated one cannot ship — or start — before its
 * earliest week. `late` (overdue) has no date to hold it to. `s` = ship period, `a` = stretched start (−1 none).
 */
function placeRefusal(m: Model, u: number, r: MaterialResult, s: number, a: number): { reason: string; earliest: number | null } | null {
  if (r.short) return { reason: r.short.text, earliest: null };
  if (r.period < 0) return null;
  const say = (tail: string) => `${r.text ? `${r.text} ` : ''}${tail}`;
  if (r.period >= m.P) return { reason: say('Its material arrives after the last week of this plan.'), earliest: m.P };
  if (s < r.period) return { reason: say(`It cannot ship before then — plan it for ${earliestWords(m, r)}.`), earliest: r.period };
  // The work itself takes time after the material date, even in an empty shop (the server only knows the material date).
  if (r.period > 0) {
    const end = emptyEnd(m, u, r.period);
    if (end >= m.P) return { reason: say('Its work cannot finish inside this plan.'), earliest: m.P };
    if (s < end) return { reason: say(`Its work takes until ${m.periods[end].label} at the earliest, so ship it in ${m.periods[end].label} or later.`), earliest: end };
  }
  if (a >= 0 && a < r.period) return { reason: say(`The work cannot start before then — start it in ${earliestWords(m, r)}.`), earliest: r.period };
  return null;
}

/** The card sits where the plan was saved (same ship week and start). */
function atSaved(m: Model, key: string, plan: Plan): boolean {
  const sv = m.saved.get(key), e = plan[key];
  return !!sv && !!e && sv.period === e.period && (sv.start ?? null) === (e.start ?? null);
}

/** Evaluate a plan: month scoreboard, function load, per-card state, lines, score. */
export function evaluate(snapshot: PlannerSnapshot, plan: Plan, opts?: EngineOptions): Evaluation {
  const m = getModel(snapshot);
  const act = activeUnits(m, plan, opts);
  const ship = shipPeriods(m, plan, act);
  const mat = allocate(m, plan, act, ship);
  const { P, F, periods } = m;
  const bk = bookAll(m, plan, act, ship, mat);

  const load = new Float64Array(F * P);
  for (const u of act) {
    const c = bk.cells[u];
    if (c) for (let i = 0; i < c.length; i += 3) load[c[i] * P + c[i + 1]] += c[i + 2];
  }

  // load cells
  const loadOut: Record<string, Record<string, LoadCell>> = {};
  const over = new Uint8Array(F * P);
  let overloadedCells = 0;
  for (let f = 0; f < F; f++) {
    const row: Record<string, LoadCell> = {};
    for (let p = 0; p < P; p++) {
      const c = m.cap[f * P + p];
      const minutes = load[f * P + p];
      const pct = pctOf(minutes, c);
      if (pct > 100 + 1e-6) { over[f * P + p] = 1; overloadedCells++; }
      row[periods[p].key] = { minutes, capacity: Number.isFinite(c) ? c : null, pct };
    }
    loadOut[m.fnKeys[f]] = row;
  }

  // lines
  const planned = new Map<string, number>();
  const last = new Map<string, number>();
  for (const u of act) {
    const s = ship[u];
    if (s < 0) continue;
    for (const [g, n] of m.covers[u]) {
      planned.set(g, (planned.get(g) ?? 0) + n);
      if ((last.get(g) ?? -1) < s) last.set(g, s);
    }
  }
  const lines: Record<string, LineEval> = {};
  const lineShip = new Map<string, number>();
  for (const g of m.groups) {
    const total = m.groupTotal.get(g) ?? 1;
    const done = planned.get(g) ?? 0;
    const s = done >= total ? last.get(g)! : -1;
    if (s >= 0) lineShip.set(g, s);
    lines[g] = { period: s >= 0 ? periods[s].key : null, month: s >= 0 ? periods[s].month : null, marks: total, marksPlanned: done };
  }

  // months
  const months: Record<string, MonthEval> = {};
  const monthMin = new Float64Array(F * m.months.length);
  const monthCap = new Float64Array(F * m.months.length);
  for (let f = 0; f < F; f++) for (let p = 0; p < P; p++) {
    const mi = m.periodMonth[p];
    monthMin[f * m.months.length + mi] += load[f * P + p];
    monthCap[f * m.months.length + mi] += m.cap[f * P + p];
  }
  m.months.forEach((ym, mi) => {
    let fn: string | null = null, name = '', pct = 0;
    for (let f = 0; f < F; f++) {
      if (m.unlimited[f]) continue;
      const x = pctOf(monthMin[f * m.months.length + mi], monthCap[f * m.months.length + mi]);
      if (x > pct) { pct = x; fn = m.fnKeys[f]; name = m.fnNames[f]; }
    }
    const t = snapshot.targets?.[ym];
    months[ym] = { tonnes: 0, target: t == null ? null : Number(t), linesShipped: 0, marksShipped: 0, bottleneck: { fn, name, pct } };
  });
  for (const [, s] of lineShip) months[periods[s].month].linesShipped++;

  // units
  const unitsOut: Record<string, UnitEval> = {};
  let tonnesInHorizon = 0, lateUnits = 0, unplannedUnits = 0, blockedUnits = 0;
  for (const u of act) {
    const unit = m.units[u];
    const s = ship[u];
    const r = mat.get(u)!;
    const ls = s >= 0 ? bk.start[u] : -1;
    const stretched = s >= 0 ? startOf(m, plan, u, s) : -1;
    let blocked: string | null = null;
    let blockedKind: UnitEval['blockedKind'] = null;
    const flag = s >= 0 && atSaved(m, unit.key, plan) ? snapshot.entries?.[unit.key]?.blocked : undefined;
    if (s >= 0 && atSaved(m, unit.key, plan)) {
      // Where it was saved: the server says whether that can still stand (and nothing is moved for it).
      if (flag) { blocked = flag.message; blockedKind = flag.kind === 'waiting' ? 'waiting' : 'material_late'; }
    } else {
      const ref = s >= 0 || r.short ? placeRefusal(m, u, r, s, stretched) : null;
      if (ref) { blocked = ref.reason; blockedKind = r.short ? 'waiting' : 'material_late'; }
    }
    const committed = m.committed[u];
    const late = s >= 0 && !!committed && periods[s].end > committed;
    let overload = false;
    const booked: Record<string, Record<string, number>> = {};
    const c = bk.cells[u];
    if (s >= 0 && c) for (let i = 0; i < c.length; i += 3) {
      const f = c[i], p = c[i + 1];
      if (over[f * P + p]) overload = true;
      const pk = periods[p].key, fk = m.fnKeys[f];
      const row = booked[pk] ?? (booked[pk] = {});
      row[fk] = (row[fk] ?? 0) + c[i + 2];
    }
    const from = r.short ? 0 : Math.max(0, r.period);
    const end = from >= P ? P : emptyEnd(m, u, from);
    const completesLines: string[] = [];
    if (s >= 0) {
      for (const g of m.covers[u].keys()) if (lineShip.get(g) === s) completesLines.push(g);
      const mo = months[periods[s].month];
      mo.tonnes += Number(unit.tonnes) || 0;
      for (const n of m.covers[u].values()) mo.marksShipped += n;
      tonnesInHorizon += Number(unit.tonnes) || 0;
    } else unplannedUnits++;
    if (late) lateUnits++;
    if (blocked) blockedUnits++;
    unitsOut[unit.key] = {
      period: s >= 0 ? periods[s].key : null,
      pinned: s >= 0 ? !!plan[unit.key]?.pinned : false,
      leadStart: s >= 0 ? periods[ls].key : null,
      lead: s >= 0 ? s - ls + 1 : 0,
      start: stretched >= 0 ? periods[stretched].key : null,
      minWeeks: end < P ? end - from + 1 : null,
      booked,
      materialDate: r.short ? null : r.date,
      materialSource: null,
      materialState: r.state,
      materialText: r.short ? r.short.text : r.text,
      blocked, blockedKind, late, overload, completesLines,
    };
  }

  return {
    months, load: loadOut, units: unitsOut, lines,
    score: { tonnesInHorizon, linesShipped: lineShip.size, lateUnits, overloadedCells, unplannedUnits, blockedUnits },
    labels: m.labels,
  };
}

/**
 * Can this card ship in this period? Refuses what material makes impossible (not ordered, or its
 * work could not finish between its material and that week even in an empty shop) with a plain
 * reason; overload is allowed (the board shows it red).
 */
export function canPlace(snapshot: PlannerSnapshot, plan: Plan, unitKey: string, period: string, opts?: EngineOptions): CanPlaceResult {
  const m = getModel(snapshot);
  const u = m.unitIdx.get(unitKey);
  if (u === undefined) return { ok: false, reason: 'This card is not in the plan any more — reload.' };
  const s = m.periodIdx.get(period);
  if (s === undefined) return { ok: false, reason: 'That week is outside the plan.' };
  const cur = plan[unitKey];
  // A stretched bar moves whole: its start shifts with it (moves.ts does the same).
  let start: string | undefined;
  if (cur?.start != null) {
    const a = m.periodIdx.get(cur.start), was = m.periodIdx.get(cur.period);
    if (a !== undefined && was !== undefined) start = m.periods[Math.max(0, a + s - was)].key;
  }
  const next: Plan = { ...plan, [unitKey]: { period, pinned: cur?.pinned ?? true, ...(start ? { start } : {}) } };
  const act = activeUnits(m, next, opts);
  if (!act.includes(u)) return { ok: false, reason: 'This card sits above the level the line is planned at — change the line’s level first.' };
  const ship = shipPeriods(m, next, act);
  const r = allocate(m, next, act, ship).get(u)!;
  const ref = placeRefusal(m, u, r, s, startOf(m, next, u, s));
  if (ref) return { ok: false, reason: ref.reason, earliest: ref.earliest != null && ref.earliest < m.P ? m.periods[ref.earliest].key : null };
  return { ok: true };
}

/**
 * The cards that `to` PLACES or MOVES (their ship week or start differs from `from`) and the server
 * would refuse — waiting for stock, or before their earliest week — each with the plain reason.
 * A card that stays where it is is never refused (the page flags it instead); taking one off is never refused.
 */
export function refusedMoves(snapshot: PlannerSnapshot, from: Plan, to: Plan, opts?: EngineOptions): { unitKey: string; reason: string; earliest: string | null }[] {
  const m = getModel(snapshot);
  const act = new Set(activeUnits(m, to, opts));
  const out: { unitKey: string; reason: string; earliest: string | null }[] = [];
  for (const [k, e] of Object.entries(to)) {
    const f = from[k];
    if (f && f.period === e.period && (f.start ?? null) === (e.start ?? null)) continue;
    const u = m.unitIdx.get(k);
    const s = m.periodIdx.get(e.period);
    if (u === undefined || s === undefined || !act.has(u)) continue;
    const a = e.start != null ? m.periodIdx.get(e.start) : undefined;
    const ref = placeRefusal(m, u, materialOf(m, u), s, a !== undefined && a < s ? a : -1);
    if (ref) out.push({ unitKey: k, reason: ref.reason, earliest: ref.earliest != null && ref.earliest < m.P ? m.periods[ref.earliest].key : null });
  }
  return out;
}

/** May this planned card's bar start in `startPeriod` (a stretch)? Not before its material. */
export function canStretch(snapshot: PlannerSnapshot, plan: Plan, unitKey: string, startPeriod: string, opts?: EngineOptions): CanStretchResult {
  const m = getModel(snapshot);
  const u = m.unitIdx.get(unitKey);
  const e = plan[unitKey];
  if (u === undefined || !e) return { ok: false, reason: 'Plan the card first.' };
  const a = m.periodIdx.get(startPeriod), s = m.periodIdx.get(e.period);
  if (a === undefined || s === undefined) return { ok: false, reason: 'That week is outside the plan.' };
  if (a > s) return { ok: false, reason: 'A bar cannot start after the week it ships.' };
  const act = activeUnits(m, plan, opts);
  const r = allocate(m, plan, act, shipPeriods(m, plan, act)).get(u);
  if (!r || r.short) return { ok: true, earliestStart: null };
  if (r.period > 0 && a < r.period) {
    const at = Math.min(r.period, m.P - 1);
    return { ok: false, reason: `${r.text ? `${r.text} ` : ''}The work cannot start before ${m.periods[at].label}.`, earliestStart: m.periods[at].key };
  }
  return { ok: true, earliestStart: r.period > 0 ? m.periods[Math.min(r.period, m.P - 1)].key : null };
}

/**
 * The earliest week this card can ship: its chain booked as EARLY as its material and the hours
 * left by the planned cards AHEAD of it allow (cards behind it make room). null = not inside the plan.
 */
export function fastest(snapshot: PlannerSnapshot, plan: Plan, unitKey: string, opts?: EngineOptions): string | null {
  const m = getModel(snapshot);
  const u = m.unitIdx.get(unitKey);
  if (u === undefined) return null;
  const rest: Plan = { ...plan };
  delete rest[unitKey];
  const act = activeUnits(m, rest, opts, unitKey);
  const ship = shipPeriods(m, rest, act);
  // Placed by hand it is pinned: it books after the pins ahead of it in priority, before the rest.
  const trial: Plan = { ...rest, [unitKey]: { period: m.periods[0].key, pinned: true } };
  const mat = allocate(m, trial, act, shipPeriods(m, trial, act));
  const r = mat.get(u);
  if (!r || r.short) return null;
  const { rem } = bookAll(m, rest, act, ship, mat, m.prio[u]);
  const end = forwardEnd(m, rem, u, floorOf(m, r));
  return end < m.P ? m.periods[end].key : null;
}
