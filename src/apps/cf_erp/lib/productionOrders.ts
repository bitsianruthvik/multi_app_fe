import type { PoFilter, PoState, ProductionOrder, ReleaseFromMr } from '../api/productionOrders';
import type { ReleaseSummary } from '../api/types';
import { releasedMessage } from './materialRequest';

/** Production orders (§76): the words and the pure parts (lib, so the test can drive them). */
export const PO_STATE: Record<PoState, { label: string; family: 'neutral' | 'info' | 'warning' | 'success' }> = {
  yet_to_plan: { label: 'Yet to plan', family: 'neutral' },
  planned: { label: 'Planned', family: 'info' },
  in_production: { label: 'In production', family: 'warning' },
  dispatch: { label: 'Dispatch', family: 'success' },
  closed: { label: 'Closed', family: 'neutral' },
};
export const PO_FILTERS: { key: PoFilter; label: string }[] = [
  { key: 'open', label: 'Open' }, { key: 'yet_to_plan', label: 'Yet to plan' }, { key: 'planned', label: 'Planned' },
  { key: 'in_production', label: 'In production' }, { key: 'dispatch', label: 'Dispatch' }, { key: 'closed', label: 'Closed' }, { key: 'all', label: 'All' },
];
export const PO_ORDERS_PER_PAGE = 20;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "16 Nov" (the year only when it is not this year's). */
export function shortDate(ds: string | null | undefined, year?: string): string {
  if (!ds) return '—';
  const [y, m, d] = String(ds).slice(0, 10).split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? m}${year && y !== year ? ` ${y}` : ''}`;
}

/** "3 of 8 steps · 40 %" — how far a production order is. */
export function progressText(p: ProductionOrder['progress']): string {
  if (!p.steps) return 'no steps';
  return `${p.done} of ${p.steps} step${p.steps === 1 ? '' : 's'} · ${Math.round(p.pct)} %`;
}

/** The one button that moves a production order on, or null. */
export function nextAction(po: Pick<ProductionOrder, 'actions' | 'state'>): 'release' | 'dispatch' | null {
  if (po.actions.release) return 'release';
  if (po.actions.dispatch) return 'dispatch';
  return null;
}

/** The ids "Release all" releases: every production order still Yet to plan. */
export const releasableIds = (list: Pick<ProductionOrder, 'id' | 'actions'>[]) => list.filter((p) => p.actions.release).map((p) => p.id);

/**
 * The override field's text → seconds: blank = off (null), else a number above zero ("0.1", "0,1"). undefined = not a
 * number (the field says so and nothing is saved).
 */
export function readOverride(text: string): number | null | undefined {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * The toast after a release: what went to the floor, and what each line's MR gave it (releasedMessage's words —
 * "Material from MR-…: MA 4 kg reserved for production.").
 */
export function releaseToast(codes: string[], fromMr: ReleaseFromMr[] = []): string {
  const head = codes.length === 1 ? `${codes[0]} released — it is on the floor.` : `Released ${codes.length} production orders — they are on the floor.`;
  const mr = fromMr.map((f) => releasedMessage(undefined, { fromMr: f } as unknown as ReleaseSummary).replace(/^Line\s*released to production\.\s*/, '')).filter(Boolean);
  return [head, ...mr].join(' ');
}

/** "Create 3 production orders" / "Create the production order". */
export const createLabel = (n: number) => (n === 1 ? 'Create the production order' : `Create ${n} production orders`);

/** Where a production order opens. */
export const productionOrderPath = (id: number) => `production-orders/${id}`;
/** The Tracker scoped to one production order. */
export const trackerPathOf = (id: number) => `tracker?order=w${id}`;

/** Collapsed sales orders on this device (the list opens expanded). */
const KEY = 'cf_erp.productionOrders.collapsed';
export function loadCollapsed(): Set<number> {
  try { const v = JSON.parse(window.localStorage.getItem(KEY) ?? '[]'); return new Set(Array.isArray(v) ? v.filter((x) => Number.isInteger(x)).slice(0, 500) : []); } catch { return new Set(); }
}
export function saveCollapsed(s: Set<number>) {
  try { window.localStorage.setItem(KEY, JSON.stringify([...s].slice(0, 500))); } catch { /* not remembered */ }
}
