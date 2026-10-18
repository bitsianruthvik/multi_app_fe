import type { ReadyState } from '../api/requisitions';

/**
 * The words of the material-ready state (CF_ERP_BUYING_V2.md). Every state comes from the server; this file only
 * words it, colours it and orders it. Nothing here decides whether a material is ready. (§71: the MR table, stock
 * check, skip and PO-draft helpers went with the old MR panels.)
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2026-10-21 → "21 Oct". Anything that is not a date is returned as it came. */
export function shortDate(d: string | null | undefined): string {
  const m = d ? /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d)) : null;
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : d ?? '';
}

export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

/** The words of the material-ready line for one unit of work. */
export function readyLabel(state: ReadyState | null, date: string | null): string {
  if (state === 'ready') return 'Ready';
  if (state === 'dated') return date ? `Ready from ${shortDate(date)}` : 'Ready on a date';
  if (state === 'late') return date ? `Late since ${shortDate(date)}` : 'Late';
  if (state === 'waiting') return 'Waiting for stock';
  return 'Not known yet';
}

export const readyTone = (state: ReadyState | null): Tone =>
  state === 'ready' ? 'success' : state === 'dated' ? 'info' : state === 'late' ? 'danger' : state === 'waiting' ? 'warning' : 'neutral';

/** Waiting first, then late, dated, ready — the order a person should read the reasons in. */
const READY_RANK: Record<string, number> = { waiting: 0, late: 1, dated: 2, ready: 3 };
export const byReadyRank = <T extends { state: ReadyState }>(a: T, b: T) => (READY_RANK[a.state] ?? 9) - (READY_RANK[b.state] ?? 9);
