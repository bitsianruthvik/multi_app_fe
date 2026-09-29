import type { Period } from './types';

/** Dates are 'YYYY-MM-DD' strings handled in UTC so no time zone can move a day. */
const DAY = 86400000;
export const toDate = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
export const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => fmtDate(new Date(toDate(s).getTime() + n * DAY));
const lastOfMonth = (s: string) => {
  const d = toDate(s);
  return fmtDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
};

/** ISO week number of a date. */
export const isoWeek = (s: string) => {
  const d = toDate(s);
  const day = (d.getUTCDay() + 6) % 7; // Mon = 0
  const thursday = new Date(d.getTime() + (3 - day) * DAY);
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return 1 + Math.floor((thursday.getTime() - jan1) / (7 * DAY));
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** '2026-10' → 'Oct' */
export const monthShort = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1]?.slice(0, 3) ?? ym;
/** '2026-10' → 'October' */
export const monthLong = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;
/** '2026-11-14' → '14 Nov' */
export const dayLabel = (s: string) => `${Number(s.slice(8, 10))} ${monthShort(s.slice(0, 7))}`;

/**
 * The planner's periods: ISO weeks (Mon–Sun) cut at month ends, from `from` to the end of the
 * month `months − 1` after it. Key = the period's start date; label = "wk 43".
 * The backend sends the same shape in `horizon.periods`; this exists for tests and fallbacks.
 */
export function buildPeriods(from: string, months = 3): Period[] {
  const start = toDate(from);
  const lastDay = fmtDate(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 0)));
  const out: Period[] = [];
  let cur = from.slice(0, 10);
  while (cur <= lastDay) {
    const dow = (toDate(cur).getUTCDay() + 6) % 7;
    const sunday = addDays(cur, 6 - dow);
    const monthEnd = lastOfMonth(cur);
    let end = sunday < monthEnd ? sunday : monthEnd;
    if (end > lastDay) end = lastDay;
    out.push({ key: cur, start: cur, end, month: cur.slice(0, 7), label: `wk ${isoWeek(cur)}` });
    cur = addDays(end, 1);
  }
  return out;
}

/** Index of the period containing `date`; -1 before the first, periods.length after the last. */
export function periodContaining(periods: Period[], date: string): number {
  if (!periods.length || date < periods[0].start) return -1;
  for (let i = 0; i < periods.length; i++) if (date <= periods[i].end) return i;
  return periods.length;
}

/** Index of the first period starting on/after `date`; periods.length when none. */
export function firstPeriodFrom(periods: Period[], date: string): number {
  for (let i = 0; i < periods.length; i++) if (periods[i].start >= date) return i;
  return periods.length;
}
