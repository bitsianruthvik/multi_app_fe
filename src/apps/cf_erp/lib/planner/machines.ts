/**
 * What putting a card's work on ANOTHER MACHINE does to the plan (CF_ERP machine times, §58).
 *
 * The planner books on machine TYPES. Inside a type a card's open steps can be put on one machine,
 * and a machine with its own chart takes more or fewer minutes than the standard. This works out,
 * before anything is saved, what that change of minutes means for the card: how many weeks its
 * work needs at the shortest, and the earliest week it can ship — old → new.
 * Pure: it evaluates a COPY of the snapshot in which only this card's minutes on that type differ.
 */
import { evaluate, fastest } from './evaluate';
import type { EngineOptions, Plan, PlannerSnapshot, PlannerUnit } from './types';

export interface MachineWhatIf {
  /** minutes on that machine type: now, and after the move */
  minutesBefore: number;
  minutesAfter: number;
  /** weeks the card's work takes at the shortest (null = cannot finish inside the plan) */
  weeksBefore: number | null;
  weeksAfter: number | null;
  /** earliest ship week (period key; null = not inside the plan) */
  earliestBefore: string | null;
  earliestAfter: string | null;
}

/** The card with `change` more (or fewer) minutes on machine type `fnKey`, its stages scaled to match. */
export function unitWithChange(unit: PlannerUnit, fnKey: string, change: number): PlannerUnit {
  const before = unit.work[fnKey] ?? 0;
  const after = Math.max(0, before + change);
  const ratio = before > 0 ? after / before : 1;
  return {
    ...unit,
    work: { ...unit.work, [fnKey]: after },
    stages: unit.stages?.map((st) => ({ ...st, steps: st.steps.map((s) => (s.fn === fnKey ? { ...s, minutes: s.minutes * ratio } : s)) })),
  };
}

/**
 * `change` = the minutes the move adds on that machine type (negative = it gets faster), as the
 * server's GET /planner/units/:key/machines gives it for each machine.
 */
export function machineWhatIf(snapshot: PlannerSnapshot, plan: Plan, unitKey: string, fnKey: string, change: number, opts?: EngineOptions): MachineWhatIf | null {
  const unit = snapshot.units.find((u) => u.key === unitKey);
  if (!unit) return null;
  const moved = unitWithChange(unit, fnKey, change);
  const after: PlannerSnapshot = { ...snapshot, units: snapshot.units.map((u) => (u.key === unitKey ? moved : u)) };
  return {
    minutesBefore: unit.work[fnKey] ?? 0,
    minutesAfter: moved.work[fnKey] ?? 0,
    weeksBefore: evaluate(snapshot, plan, opts).units[unitKey]?.minWeeks ?? null,
    weeksAfter: evaluate(after, plan, opts).units[unitKey]?.minWeeks ?? null,
    earliestBefore: fastest(snapshot, plan, unitKey, opts),
    earliestAfter: fastest(after, plan, unitKey, opts),
  };
}
