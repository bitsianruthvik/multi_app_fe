/** Money and quantities, in the way the plant says them. */
export function crore(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v); const sign = v < 0 ? '−' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(1)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)} L`;
  return `${sign}₹${new Intl.NumberFormat('en-IN').format(Math.round(a))}`;
}
export const perKg = (v: number | null | undefined) => (v == null ? '—' : `₹${new Intl.NumberFormat('en-IN').format(Math.round(v))}`);
export const pct = (v: number | null | undefined, d = 0) => (v == null ? '—' : `${v.toFixed(d)}%`);
export const tonnes = (v: number | null | undefined, d = 0) => (v == null ? '—' : `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: d }).format(v)} t`);
export const dayCount = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v)} ${Math.round(v) === 1 ? 'day' : 'days'}`);
export const num = (v: number | null | undefined) => (v == null ? '—' : new Intl.NumberFormat('en-IN').format(Math.round(v)));
export function monthLabel(mo: string): string {
  const [y, m] = mo.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}
export function dateLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
/** Traffic light for on-time delivery. */
export const onTimeTone = (v: number | null | undefined): 'danger' | 'warning' | 'success' | 'neutral' => (v == null ? 'neutral' : v < 20 ? 'danger' : v < 50 ? 'warning' : 'success');
