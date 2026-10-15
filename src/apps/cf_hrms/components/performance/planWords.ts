/**
 * The words of performance plans (CF_HRMS_HIRING_SPEC.md §18), in one place so
 * the Plans list, the plan page, the employee's Performance tab and My place
 * say the same thing. Wording rule: "plan", "period", "weight", "target" —
 * never "goal sheet", "appraisal" or "OKR".
 */
import type { StatusTone } from '@shared/ui';
import type { Actual, Band, Direction, Frequency, PlanStatus } from '../../api/performance';
import { longDay } from '../jobDates';

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  HALF_YEARLY: 'Half-yearly',
  YEARLY: 'Yearly',
};

/** How often actuals are entered — a wider list than plan frequencies. */
const ENTRY_LABEL: Record<string, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  ...FREQUENCY_LABEL,
};

export const frequencyWord = (f: string | null | undefined): string =>
  f ? ENTRY_LABEL[f] ?? f.charAt(0) + f.slice(1).toLowerCase().replace(/_/g, '-') : 'Same as the plan';

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

export const PLAN_STATUS_TONE: Record<PlanStatus, StatusTone> = {
  DRAFT: 'warning',
  ACTIVE: 'success',
  CLOSED: 'neutral',
  CANCELLED: 'neutral',
};

export const DIRECTION_LABEL: Record<Direction, string> = {
  HIGHER_BETTER: 'Higher is better',
  LOWER_BETTER: 'Lower is better',
  EXACT: 'Exactly',
  TEXT: 'Written as words',
};

/** "1 Jul 2026 – 30 Sep 2026". */
export const periodDates = (start: string, end: string) => `${longDay(start)} – ${longDay(end)}`;

/** "3 KRAs · 9 KPIs". */
export function countWords(kraCount: number, kpiCount: number): string {
  return `${kraCount} KRA${kraCount === 1 ? '' : 's'} · ${kpiCount} KPI${kpiCount === 1 ? '' : 's'}`;
}

/** A weight for reading: "25%" or "—". */
export const weightWord = (w: number | null | undefined) => (w == null ? '—' : `${Number(w)}%`);

/* ── actuals (spec §19): "on track / at risk / behind" ── */

export const BAND_LABEL: Record<Band, string> = { ON_TRACK: 'On track', AT_RISK: 'At risk', BEHIND: 'Behind', NO_DATA: 'No data' };
export const BAND_TONE: Record<Band, StatusTone> = { ON_TRACK: 'success', AT_RISK: 'warning', BEHIND: 'danger', NO_DATA: 'neutral' };
export const BAND_OPTIONS = (['ON_TRACK', 'AT_RISK', 'BEHIND', 'NO_DATA'] as Band[]).map((b) => ({ value: b, label: BAND_LABEL[b] }));

/** An actual for reading: "92", "Met", "Not met", "—". */
export function actualWord(a: Actual | null, unit?: string | null): string {
  if (!a) return '—';
  if (a.met) return a.met === 'YES' ? 'Met' : 'Not met';
  if (a.value == null) return '—';
  const n = Number(a.value).toLocaleString('en-IN', { maximumFractionDigits: 4 });
  return unit === '%' ? `${n}%` : unit === '₹' ? `₹${n}` : unit ? `${n} ${unit}` : n;
}
