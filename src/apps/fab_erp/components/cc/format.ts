/**
 * Small formatting/parsing helpers shared across the Critical Chain (CCPM)
 * components — kept tiny and dependency-free so FeverChart / Gantt / page can
 * all import from one place instead of re-deriving the same logic.
 */

/** "Aug 17" style short date. Guards null/invalid input with an em dash. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Minutes → rounded hours string, e.g. 125 -> "2.1h". Guards null/NaN. */
export function fmtMinutesAsHours(mins: number | null | undefined): string {
  if (mins == null || Number.isNaN(mins)) return '—';
  return `${Math.round((mins / 60) * 10) / 10}h`;
}

/** Parse an ISO datetime to epoch ms, or null when missing/invalid. */
export function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Round + clamp a percentage into [0, 100]. Guards null/NaN by returning 0. */
export function clampPct(n: number | null | undefined): number {
  if (n == null || Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** Standard axios/backend error-message extraction used across fab_erp pages. */
export function errMsg(e: unknown, fallback: string): string {
  const ax = e as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.message ?? fallback;
}
