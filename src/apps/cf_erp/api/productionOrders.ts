import { cfApi, LONG_WRITE_MS, qs } from './client';

/**
 * PRODUCTION ORDERS (init.sql §76, services/productionOrderService.js): made from the order's execution plan
 * (per order / line / unit / sub-assembly), released, tracked and dispatched. States: Yet to plan → Planned →
 * In production → Dispatch → Closed. A "work order" stays the contractor's.
 */
export type PoState = 'yet_to_plan' | 'planned' | 'in_production' | 'dispatch' | 'closed';
export type PoFilter = PoState | 'open' | 'all';

export interface ProductionOrder {
  id: number;
  code: string;
  label: string;
  seq: number;
  order: { id: number; code: string; status: string; type: string; title: string | null; customer: { id: number; name: string | null } | null };
  level: 'order' | 'line' | 'unit' | 'assembly';
  levelId: number | null;
  line: { id: number; lineNo: number } | null;
  lineIds: number[];
  unitNo: number | null;
  scopeKey: string;
  dispatch: { level: 'same' | 'line' | 'unit' | 'assembly'; levelId: number | null };
  status: 'yet_to_plan' | 'planned' | 'closed';
  state: PoState;
  stateLabel: string;
  progress: { pct: number; basis: 'minutes' | 'steps'; steps: number; done: number; onHold: number; started: number; minutes: number; minutesDone: number };
  units: { lineId: number; units: number; finished: number; shipped: number }[];
  releasedAt: string | null;
  releasedBy: string | null;
  dispatchedAt: string | null;
  actions: { release: boolean; takeBack: boolean; dispatch: boolean };
}

export interface OrderProductionOrders {
  order: { id: number; code: string; status: string; type: string; timeOverrideSeconds: number | null };
  productionOrders: ProductionOrder[];
  counts: Record<PoState, number>;
  toCreate: { count: number; labels: string[]; why: string | null };
  /** Lines released before production orders (read-only, the old tracker). */
  legacy: { releaseId: number; lineId: number; lineNo: number; releasedAt: string }[];
}

export interface ProductionOrderStep {
  id: number; label: string; operation: { id: number; code: string; name: string }; state: string; status: string;
  quantity: number; qtyGood: number; effMinutes: number | null; machine: { id: number; code: string } | null;
  blockers: { kind: string; text: string }[];
  /** Step 6 (§85): set when the step is with a contractor's work order. */
  workOrder?: { id: number; code: string; contractorName: string | null } | null;
}
export interface ProductionOrderDetail extends ProductionOrder {
  releases: { id: number; lineId: number }[];
  pieces: { id: number; label: string; code: string | null; depth: number; status: string; steps: ProductionOrderStep[] }[];
  piecesTotal: number;
}

export interface ProductionOrdersPage {
  rows: { order: ProductionOrder['order']; productionOrders: ProductionOrder[] }[];
  total: number; limit: number; offset: number; hasMore: boolean;
  counts: Record<PoFilter, number>;
  state: PoFilter;
  states: { key: PoState; label: string }[];
  legacy: { releaseId: number; order: { id: number; code: string }; line: { id: number; lineNo: number }; itemName: string | null; releasedAt: string; steps: number; done: number }[];
}

/** What a line released with a production order took from its MR's earmarks (§66). */
export interface ReleaseFromMr {
  lineId: number;
  requisition: { id: number; code: string } | null;
  reserved: { item: { id: number; code: string; name: string; uom: string | null }; quantity: number }[];
  left: { item: { id: number; code: string; name: string; uom: string | null }; quantity: number }[];
}

const LONG = { timeoutMs: LONG_WRITE_MS };

export const getOrderProductionOrders = (orderId: number) => cfApi.get<OrderProductionOrders>(`/orders/${orderId}/production-orders`);
export const createProductionOrders = (orderId: number) =>
  cfApi.post<OrderProductionOrders & { created: number }>(`/orders/${orderId}/production-orders`, {}, LONG);
export const releaseProductionOrders = (ids: number[], finishedAreaId?: number | null) =>
  cfApi.post<{ released: string[]; productionOrders: ProductionOrder[]; fromMr: ReleaseFromMr[] }>('/production-orders/release', { ids, finishedAreaId: finishedAreaId ?? undefined }, LONG);
export const takeBackProductionOrder = (id: number) =>
  cfApi.post<{ productionOrder: ProductionOrder; releasesTakenBack: number }>(`/production-orders/${id}/take-back`, {}, LONG);
export const dispatchProductionOrder = (id: number) =>
  cfApi.post<{ productionOrder: ProductionOrder; closed: boolean; shipments: { lineId: number; shipped: number }[] }>(`/production-orders/${id}/dispatch`, {});
export const setTimeOverride = (orderId: number, seconds: number | null) =>
  cfApi.put<{ timeOverrideSeconds: number | null; retimed: number }>(`/orders/${orderId}/time-override`, { seconds }, LONG);
export const getProductionOrder = (id: number) => cfApi.get<ProductionOrderDetail>(`/production-orders/${id}`, { timeoutMs: 120_000 });
export const listProductionOrders = (q: { state?: PoFilter; search?: string; orderId?: number; limit?: number; offset?: number }) =>
  cfApi.get<ProductionOrdersPage>(`/production-orders${qs({
    state: q.state, search: q.search || undefined, orderId: q.orderId, limit: q.limit, offset: q.offset,
  })}`);
