import type { ProductionOrderFilter, ProductionOrderLine, ProductionOrderStatus } from '../api/productionOrders';

/** Production › Production orders: the words and the pure parts (lib, so the test can drive them). */
export const PO_STATUS: Record<ProductionOrderStatus, { label: string; family: 'neutral' | 'info' | 'warning' | 'success' }> = {
  not_started: { label: 'Not started', family: 'neutral' },
  in_progress: { label: 'In progress', family: 'warning' },
  done: { label: 'Done', family: 'success' },
  dispatched: { label: 'Dispatched', family: 'info' },
};
export const PO_FILTERS: { key: ProductionOrderFilter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'open', label: 'Not dispatched' }, { key: 'not_started', label: 'Not started' },
  { key: 'in_progress', label: 'In progress' }, { key: 'done', label: 'Done' }, { key: 'dispatched', label: 'Dispatched' },
];
export const PO_ORDERS_PER_PAGE = 20;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "16 Nov" (the year only when it is not this year's). */
export function shortDate(ds: string | null | undefined, year?: string): string {
  if (!ds) return '—';
  const [y, m, d] = ds.slice(0, 10).split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? m}${year && y !== year ? ` ${y}` : ''}`;
}
/** "week of 16 Nov" or "not planned". */
export const shipWeekText = (week: string | null | undefined, year?: string) => (week ? `week of ${shortDate(week, year)}` : 'not planned');

/** "2 on hold · 1 waiting for material", or null when nothing is blocked. */
export function blockedText(b: ProductionOrderLine['blocked']): string | null {
  const parts = [b.onHold ? `${b.onHold} on hold` : null, b.material ? `${b.material} waiting for material` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** "3 lines · 1 in progress · 2 not started" — what an order holds, by status. */
export function orderStatusText(t: { lines: number } & Record<ProductionOrderStatus, number>): string {
  const parts = (Object.keys(PO_STATUS) as ProductionOrderStatus[]).filter((k) => t[k] > 0).map((k) => `${t[k]} ${PO_STATUS[k].label.toLowerCase()}`);
  return [`${t.lines} line${t.lines === 1 ? '' : 's'}`, ...parts].join(' · ');
}

/** Where a line's tracker opens: the order's Production step on that line. */
export const lineTrackerPath = (l: { orderId: number; line: { id: number } }) => `orders/${l.orderId}?tab=production&line=${l.line.id}`;

/** Collapsed sales orders on this device (the list opens expanded). */
const KEY = 'cf_erp.productionOrders.collapsed';
export function loadCollapsed(): Set<number> {
  try { const v = JSON.parse(window.localStorage.getItem(KEY) ?? '[]'); return new Set(Array.isArray(v) ? v.filter((x) => Number.isInteger(x)).slice(0, 500) : []); } catch { return new Set(); }
}
export function saveCollapsed(s: Set<number>) {
  try { window.localStorage.setItem(KEY, JSON.stringify([...s].slice(0, 500))); } catch { /* not remembered */ }
}
