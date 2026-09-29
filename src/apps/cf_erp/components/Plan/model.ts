import type { LoadCell, Plan, PlannerSnapshot, PlannerUnit } from '../../lib/planner/types';

/** Tonnes with at most one decimal ("412", "12.5"). */
export const tonnes = (n: number) => (Math.round(n * 10) / 10).toLocaleString();
export const mins = (n: number) => `${Math.round(n).toLocaleString()} min`;

/** Load as a fraction of capacity; minutes on no capacity count as far over. */
export function loadFraction(c: LoadCell | undefined): number {
  if (!c || c.minutes <= 0) return 0;
  if (c.capacity == null) return 0;
  if (c.capacity <= 0) return 9.99;
  return c.minutes / c.capacity;
}

/** green under 85 %, amber up to 100 %, red beyond. */
export function heat(frac: number, unlimited = false): 'none' | 'ok' | 'warn' | 'over' {
  if (unlimited || frac <= 0) return 'none';
  if (frac < 0.85) return 'ok';
  if (frac <= 1) return 'warn';
  return 'over';
}

export const pctText = (frac: number) => (frac >= 9.99 ? 'no shifts' : `${Math.round(frac * 100)}%`);

export function unitMap(s: PlannerSnapshot): Map<string, PlannerUnit> {
  return new Map(s.units.map((u) => [u.key, u]));
}

/** The plan without any unit of one order line (used when its level changes). */
export function dropLine(plan: Plan, units: Map<string, PlannerUnit>, lineId: number | string): Plan {
  const next: Plan = {};
  for (const [k, v] of Object.entries(plan)) if (String(units.get(k)?.lineId) !== String(lineId)) next[k] = v;
  return next;
}

/** '2026-10' → 'October' (the month header). */
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (ym: string) => MONTH_NAMES[Number(ym.slice(5, 7)) - 1] ?? ym;
export const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTH_NAMES[Number(d.slice(5, 7)) - 1]?.slice(0, 3) ?? ''}`;

/** Period start dates by key, for saving. */
export const TODAY = () => new Date().toISOString().slice(0, 10);
export const FN_COLORS = ['var(--c-chart-1)', 'var(--c-chart-2)', 'var(--c-chart-3)', 'var(--c-chart-4)', 'var(--c-chart-5)', 'var(--c-chart-6)', 'var(--c-chart-7)', 'var(--c-chart-8)'];
