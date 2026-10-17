import type { DashWorkOrder, WorkOrderStatus } from '../api/dashboard';

/** The Work orders tab's pure helpers: filters and sorts. */

export type WoStatusFilter = 'open' | 'overdue' | 'done' | 'all';
export const WO_STATUS_FILTERS: { key: WoStatusFilter; label: string }[] = [
  { key: 'open', label: 'Open' }, { key: 'overdue', label: 'Overdue' }, { key: 'done', label: 'Done' }, { key: 'all', label: 'All' },
];
export const WO_STATUS: Record<WorkOrderStatus, { label: string; family: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  draft: { label: 'Draft', family: 'neutral' }, issued: { label: 'Issued', family: 'info' }, in_progress: { label: 'In progress', family: 'warning' },
  done: { label: 'Done', family: 'success' }, cancelled: { label: 'Cancelled', family: 'danger' },
};
export type WoSort = 'attention' | 'least' | 'due' | 'activity';
export const WO_SORTS: { key: WoSort; label: string }[] = [
  { key: 'attention', label: 'Overdue first' }, { key: 'least', label: 'Least complete first' }, { key: 'due', label: 'Due soonest' }, { key: 'activity', label: 'Latest activity' },
];

export function inWoStatus(w: DashWorkOrder, f: WoStatusFilter): boolean {
  if (f === 'open') return w.open;
  if (f === 'overdue') return w.overdue;
  if (f === 'done') return w.status === 'done';
  return true;
}

export function filterWorkOrders(ws: DashWorkOrder[], contractorId: number | null, status: WoStatusFilter, search: string): DashWorkOrder[] {
  const term = search.trim().toLowerCase();
  return ws.filter((w) => (contractorId == null || w.contractor.id === contractorId) && inWoStatus(w, status)
    && (!term || [w.code, w.contractor.name, w.order.code, w.line.itemCode, w.line.itemName].some((t) => t && t.toLowerCase().includes(term))));
}

/** The reply is already "overdue first, then open by least complete"; the other sorts are made here. A missing number sorts last. */
export function sortWorkOrders(ws: DashWorkOrder[], by: WoSort): DashWorkOrder[] {
  if (by === 'attention') return ws;
  const last = (a: number | null, z: number | null, dir: 1 | -1) => (a == null && z == null ? 0 : a == null ? 1 : z == null ? -1 : dir * (a - z));
  const time = (t: string | null) => (t ? Date.parse(t) : null);
  const cmp: Record<Exclude<WoSort, 'attention'>, (a: DashWorkOrder, z: DashWorkOrder) => number> = {
    least: (a, z) => last(a.operations.pct, z.operations.pct, 1),
    due: (a, z) => last(a.open && a.dueDate ? Date.parse(a.dueDate) : null, z.open && z.dueDate ? Date.parse(z.dueDate) : null, 1),
    activity: (a, z) => last(time(a.lastActivityAt), time(z.lastActivityAt), -1),
  };
  return [...ws].sort((a, z) => cmp[by](a, z) || a.code.localeCompare(z.code));
}

/** "12 of 40" — operations done of those released (or of those assigned while nothing is released). */
export function opsText(w: DashWorkOrder): string {
  return w.released ? `${w.operations.done} of ${w.operations.steps}` : `0 of ${w.operations.assigned}`;
}
/** "Operations to do" shown on a work order that is not released. */
export const NOT_RELEASED_HINT = 'The order line is not released yet, so there is nothing on the shop floor to complete. The operations are assigned; completion starts once it is released.';

/* ---- Group by (2026-10-17): Contractor (as before) or Sales order ---- */
export type WoGroupBy = 'contractor' | 'order';
export const WO_GROUPS: { key: WoGroupBy; label: string }[] = [{ key: 'contractor', label: 'Contractor' }, { key: 'order', label: 'Sales order' }];

export interface WoOrderGroup {
  order: DashWorkOrder['order'];
  workOrders: DashWorkOrder[];
  totals: { workOrders: number; open: number; overdue: number; contractors: number; steps: number; done: number; assigned: number; pct: number | null };
}

/**
 * The work orders shown, one group per sales order, in the order first seen (the list's sort
 * decides). Totals over the work orders in the group: done of released steps (a work order not
 * released counts its assigned operations only), weighted like the tab's % (operations, part-made
 * counts part — from each work order's own %).
 */
export function groupBySalesOrder(ws: DashWorkOrder[]): WoOrderGroup[] {
  const by = new Map<number, { order: DashWorkOrder['order']; workOrders: DashWorkOrder[] }>();
  for (const w of ws) {
    let g = by.get(w.order.id);
    if (!g) { g = { order: w.order, workOrders: [] }; by.set(w.order.id, g); }
    g.workOrders.push(w);
  }
  return [...by.values()].map((g) => {
    const steps = g.workOrders.reduce((t, w) => t + w.operations.steps, 0);
    const fracDone = g.workOrders.reduce((t, w) => t + (w.operations.pct != null ? (w.operations.pct / 100) * w.operations.steps : 0), 0);
    return {
      ...g,
      totals: {
        workOrders: g.workOrders.length,
        open: g.workOrders.filter((w) => w.open).length,
        overdue: g.workOrders.filter((w) => w.overdue).length,
        contractors: new Set(g.workOrders.map((w) => w.contractor.id)).size,
        steps, done: g.workOrders.reduce((t, w) => t + w.operations.done, 0),
        assigned: g.workOrders.reduce((t, w) => t + w.operations.assigned, 0),
        pct: steps > 0 ? Math.round((fracDone / steps) * 1000) / 10 : null,
      },
    };
  });
}
