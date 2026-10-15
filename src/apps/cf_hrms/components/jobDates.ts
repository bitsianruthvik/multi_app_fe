/**
 * Days, as job content is dated (CF_HRMS_HIRING_SPEC.md §16): a change takes
 * effect today by default, on a later day if chosen, and on a past day only for
 * the Owner, with a reason. Every screen that reads a job "as on" a day, and
 * every dialog that dates a change, uses these — the server's own calendar day,
 * not UTC (an evening in India is already tomorrow in UTC).
 */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "3 Nov 2026". */
export function longDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** The body a dated write sends: nothing for today (the server's default). */
export function datedBody(day: string, reason: string): { takesEffect?: string; reason?: string } {
  const out: { takesEffect?: string; reason?: string } = {};
  if (day && day !== todayIso()) out.takesEffect = day;
  if (reason.trim()) out.reason = reason.trim();
  return out;
}

/** A past day needs a reason; anything else is ready. */
export const takesEffectReady = (day: string, reason: string) => !(day && day < todayIso()) || reason.trim().length > 0;
