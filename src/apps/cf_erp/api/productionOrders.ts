import { cfApi, qs } from './client';

/**
 * Production › Production orders (2026-10-17, services/productionOrdersService.js): every release
 * (released line) grouped by sales order, paged by order. A production order = a release; a "work
 * order" is still the contractor's.
 */
export type ProductionOrderStatus = 'not_started' | 'in_progress' | 'done' | 'dispatched';
export type ProductionOrderFilter = ProductionOrderStatus | 'open' | 'all';

export interface ProductionOrderLine {
  releaseId: number;
  orderId: number;
  line: { id: number; lineNo: number };
  item: { id: number | null; code: string | null; name: string | null };
  quantity: number; made: number; delivered: number;
  releasedAt: string | null;
  committedDate: string | null;
  plan: { shipWeek: string | null; firstShip: string | null; lastShip: string | null; entries: number } | null;
  progress: { pct: number; basis: 'work' | 'count' | 'made' | null; steps: number; stepsDone: number };
  forecast: { date: string | null; pace: string | null; plan: string | null; estimate: true };
  status: ProductionOrderStatus;
  blocked: { onHold: number; material: number; total: number };
}

export interface ProductionOrderGroup {
  order: { id: number; code: string; revision: number; title: string | null; status: string; customer: { id: number; name: string } | null; committedDate: string | null };
  totals: {
    lines: number; not_started: number; in_progress: number; done: number; dispatched: number;
    progressPct: number; basis: 'work' | 'count' | null; steps: number; stepsDone: number; blocked: number;
    lastShipWeek: string | null; planned: number; forecast: string | null;
  };
  lines: ProductionOrderLine[];
}

export interface ProductionOrdersPage {
  rows: ProductionOrderGroup[];
  total: number; limit: number; offset: number; hasMore: boolean;
  lineTotal: number;
  counts: Record<ProductionOrderFilter, number>;
  customers: { id: number; name: string }[];
  status: ProductionOrderFilter;
  today: string;
}

export const listProductionOrders = (q: { status?: ProductionOrderFilter; customerId?: number | null; search?: string; limit?: number; offset?: number }) =>
  cfApi.get<ProductionOrdersPage>(`/production-orders${qs({
    status: q.status && q.status !== 'all' ? q.status : undefined, customerId: q.customerId ?? undefined, search: q.search || undefined, limit: q.limit, offset: q.offset,
  })}`);
