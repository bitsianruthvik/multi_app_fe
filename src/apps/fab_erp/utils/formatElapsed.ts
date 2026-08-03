/**
 * Elapsed time since an ISO instant, as "1h 12m" / "43m" / "2m".
 * Returns null for missing/unparseable input so callers can render a dash
 * rather than "NaNm".
 */
export function formatElapsed(sinceIso: string | null | undefined, now: number): string | null {
  if (!sinceIso) return null;
  const t = new Date(sinceIso).getTime();
  if (Number.isNaN(t)) return null;
  const min = Math.max(0, Math.floor((now - t) / 60_000));
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}
