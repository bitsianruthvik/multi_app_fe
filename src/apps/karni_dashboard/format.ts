/** Indian money: ₹ with lakh/crore grouping; `short` gives "₹7.52 Cr" / "₹82.9 L". */
const full = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export function inr(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `₹${full.format(Math.round(v))}`;
}

export function inrShort(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)} L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1)} K`;
  return `${sign}₹${Math.round(a)}`;
}

export function qty(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(v);
}

/** Short quantity: 1.2 L (lakh), 45.6 K, 950. */
export function qtyShort(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e7) return `${sign}${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}${(a / 1e5).toFixed(1)} L`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(1)} K`;
  return `${sign}${Math.round(a)}`;
}

/** "2026-10-18" → "18 Oct" */
export function dayLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

export const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(1)}%`);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-10" → "Oct 26" */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
}

/** "synced 4 min ago" from an ISO time. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
