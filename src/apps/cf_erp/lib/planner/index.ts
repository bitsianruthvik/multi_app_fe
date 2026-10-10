/**
 * CF_ERP Planner engine — pure functions, no React. Contract: TM/CF_ERP_PLANNER_PLAN.md §1–3.
 *
 *   evaluate(snapshot, plan, opts?)                  → Evaluation
 *   canPlace(snapshot, plan, unitKey, period, opts?) → { ok, reason?, earliest? }
 *   canStretch(snapshot, plan, unitKey, start, opts?) → { ok, reason?, earliestStart? }
 *   refusedMoves(snapshot, from, to, opts?)           → cards `to` places/moves that the server would refuse
 *   fastest(snapshot, plan, unitKey, opts?)          → the earliest ship week (period key) or null
 *   autoPlan(snapshot, plan, options?)               → { plan, notes }
 *   feedback(before, after)                          → string[]
 *
 * `opts.levels` overrides order-line levels (see types.ts header).
 */
import { activeUnits, getModel } from './model';
import { periodContaining } from './periods';
import type { EngineOptions, Plan, PlannerSnapshot } from './types';

export { evaluate, canPlace, canStretch, fastest, refusedMoves } from './evaluate';
export { autoPlan } from './autoPlan';
export { feedback } from './feedback';
export { buildPeriods, periodContaining, monthShort, monthLong } from './periods';
export { machineAreas, workingFunctions, areaUsage, functionUsage, usageBand, cellDrivers, AREA_MIN, AREA_MAX } from './areas';
export type { MachineArea, AreaSet, UsageCell, UsageRow, Band } from './areas';
export { dragTo, shiftBy, unplan, stretchTo, reorderKeys, rankLine, rankChanges } from './moves';
export type { Ranks } from './moves';
export type * from './types';

/** Each unit's place in the planning order (0 = first): order rank, line, the line's hand-dragged ranks, committed date, structure. */
export function unitPriority(snapshot: PlannerSnapshot): Map<string, number> {
  const m = getModel(snapshot);
  return new Map(m.units.map((u, i) => [u.key, m.prio[i]]));
}

/** The saved entries (`snapshot.entries`, ship dates) as a plan (period keys). Dates outside the horizon are dropped. */
export function planFromEntries(snapshot: PlannerSnapshot): Plan {
  const periods = snapshot.horizon.periods;
  const out: Plan = {};
  for (const [key, e] of Object.entries(snapshot.entries || {})) {
    if (!e?.shipDate) continue;
    const i = periodContaining(periods, e.shipDate.slice(0, 10));
    if (i < 0 || i >= periods.length) continue;
    out[key] = { period: periods[i].key, pinned: !!e.pinned };
    const a = e.startDate ? periodContaining(periods, e.startDate.slice(0, 10)) : -1;
    if (a >= 0 && a < i) out[key].start = periods[a].key;
  }
  return out;
}

/**
 * What to send to `PUT /planner/entries` to turn plan `before` into plan `after`
 * (shipDate = period start, startDate = a stretched bar's first week start; null = unplan). Only changed rows.
 */
export function entriesDiff(snapshot: PlannerSnapshot, before: Plan, after: Plan): { unitKey: string; shipDate: string | null; startDate: string | null; pinned: boolean }[] {
  const start = new Map(snapshot.horizon.periods.map((p) => [p.key, p.start]));
  const out: { unitKey: string; shipDate: string | null; startDate: string | null; pinned: boolean }[] = [];
  for (const [k, e] of Object.entries(after)) {
    const b = before[k];
    if (!b || b.period !== e.period || b.pinned !== e.pinned || (b.start ?? null) !== (e.start ?? null)) {
      out.push({ unitKey: k, shipDate: start.get(e.period) ?? null, startDate: e.start ? start.get(e.start) ?? null : null, pinned: e.pinned });
    }
  }
  for (const k of Object.keys(before)) if (!(k in after)) out.push({ unitKey: k, shipDate: null, startDate: null, pinned: false });
  return out;
}

/** A copy of the plan without any entry of this order line — use it when the line's level changes. */
export function dropLineEntries(snapshot: PlannerSnapshot, plan: Plan, lineId: string | number): Plan {
  const m = getModel(snapshot);
  const out: Plan = {};
  for (const [k, e] of Object.entries(plan)) {
    const i = m.unitIdx.get(k);
    if (i === undefined || String(m.units[i].lineId) !== String(lineId)) out[k] = e;
  }
  return out;
}

/** Keys of the cards on the board for this plan (same set as `evaluate(...).units`), in board order. */
export function activeUnitKeys(snapshot: PlannerSnapshot, plan: Plan, opts?: EngineOptions): string[] {
  const m = getModel(snapshot);
  return activeUnits(m, plan, opts).map((i) => m.units[i].key);
}
