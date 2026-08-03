/**
 * "48 min" / "1h 12m" — batch and setup durations, which are short enough that
 * minutes should lead.
 *
 * Its own module, not a second export from BatchBar.tsx: a file that exports
 * both a component and a helper loses fast refresh (react-refresh/only-export-
 * components), and the same rule already moved backendMessage and formatElapsed
 * out of their component files.
 */
export function formatMinutes(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—';
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
