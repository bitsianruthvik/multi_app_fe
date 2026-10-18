/** Percent change from `before` to `now`; null when there is no base to compare with. */
export function pctChange(now: number, before: number): number | null {
  if (!before) return null;
  return ((now - before) / Math.abs(before)) * 100;
}
