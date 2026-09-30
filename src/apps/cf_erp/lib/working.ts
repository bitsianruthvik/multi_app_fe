/**
 * Words for the slow checks. A bare spinner on a 6,072-piece line said nothing
 * for forty seconds; these say what is being worked out and roughly how big it
 * is, from counts the page has already seen (kept per line, per browser tab).
 * Pure functions, so the wording is tested without a screen.
 */

export type LineSize = { rows?: number; pieces?: number };

const KEY = 'cf_erp:line-size:';
const memory = new Map<number, LineSize>();

/** Remember what a response said about a line's size; the next slow screen quotes it. */
export function rememberLineSize(lineId: number, size: LineSize): void {
  const next: LineSize = { ...memory.get(lineId) };
  if (size.rows != null && size.rows >= 0) next.rows = size.rows;
  if (size.pieces != null && size.pieces >= 0) next.pieces = size.pieces;
  memory.set(lineId, next);
  try { sessionStorage.setItem(`${KEY}${lineId}`, JSON.stringify(next)); } catch { /* a private window: the memory copy is enough */ }
}

export function knownLineSize(lineId: number): LineSize {
  const seen = memory.get(lineId);
  if (seen) return seen;
  try {
    const raw = sessionStorage.getItem(`${KEY}${lineId}`);
    if (raw) { const parsed = JSON.parse(raw) as LineSize; memory.set(lineId, parsed); return parsed; }
  } catch { /* nothing stored, or unreadable */ }
  return {};
}

const n = (v: number) => v.toLocaleString('en-US');

/** 0:07, 1:05, 12:30 — minutes and seconds, like a stopwatch. */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The timer only appears once the wait is long enough to need one. */
export const TIMER_AFTER_SECONDS = 5;

const BIG = '(a big line takes up to a minute)';

/** The Freeze design stage's first read: values, cut pieces, structure, and every piece's code. */
export function lockCheckingText(size: LineSize, quantity?: number): string {
  if (size.pieces) return `Checking values, cut pieces and working out ${n(size.pieces)} codes… ${BIG}`;
  if (size.rows) return `Checking values, cut pieces and working out the codes for ${n(size.rows)} rows of structure${quantity && quantity > 1 ? ` × ${n(quantity)}` : ''}… ${BIG}`;
  return `Checking values, cut pieces and working out every piece's code${quantity && quantity > 1 ? ` (line quantity ${n(quantity)})` : ''}… ${BIG}`;
}

/** Freeze design's "Check again" after something changed. */
export function lockRecheckText(pieces?: number): string {
  return `Checking again${pieces ? ` — working out ${n(pieces)} codes` : ''}… (a big line takes up to a minute)`;
}

/** "Show the pieces" / "Show the codes": the tree of every piece. */
export function pieceTreeText(pieces: number | undefined, what: 'pieces' | 'codes'): string {
  return pieces
    ? `Working out ${n(pieces)} ${what} and laying them out… (a big line takes up to a minute)`
    : `Working out every piece and its code… ${BIG}`;
}

/** The Release dialog's preview: what would be created, what stops it, what material it needs. */
export function releaseCheckText(size: LineSize): string {
  const s = size.pieces
    ? `Working out the release of ${n(size.pieces)} pieces, their steps and the material they need…`
    : 'Working out what the release would create, its steps and the material it needs…';
  return `${s} ${BIG}`;
}
