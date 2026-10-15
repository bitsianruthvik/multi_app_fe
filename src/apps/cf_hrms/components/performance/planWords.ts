/**
 * The words of performance plans (CF_HRMS_HIRING_SPEC.md §18), in one place so
 * the Plans list, the plan page, the employee's Performance tab and My place
 * say the same thing. Wording rule: "plan", "period", "weight", "target" —
 * never "goal sheet", "appraisal" or "OKR".
 */
import type { StatusTone } from '@shared/ui';
import type { Direction, Frequency, PlanStatus } from '../../api/performance';
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
