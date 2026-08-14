/**
 * The two documents a finished BOM leads to: what this order has to buy, and
 * what it has to make.
 *
 * These are their own endpoints rather than generic-query reads because both
 * answers are computed, not stored. A shortfall is required-minus-available at
 * the moment somebody asks, and availability moves as other orders reserve and
 * stock arrives — there is no row to select.
 */

import api, { API_HOST } from '@core/utils/axiosConfig';

const base = () => `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp`;

/** One bought-in catalog item, and whether the shelf can cover it. */
export interface ShortfallLine {
  catalogItemId: number;
  code: string | null;
  name: string | null;
  unit: string | null;
  /** How many BOM rows draw on this item. */
  linesCount: number;
  required: number;
  onHand: number;
  /** Held by OTHER orders. This order's own holding is never counted here. */
  reserved: number;
  available: number;
  /** required − available, floored at zero. The only number a PO is raised for. */
  short: number;
}

/** A bought-in row with no catalog item — unpurchasable, and worth saying so. */
export interface UnmatchedBuy {
  name: string | null;
  linesCount: number;
  required: number;
}

export interface PurchaseOrderRow {
  id: number;
  order_number: string;
  status: string;
  supplier_id: number | null;
  supplier_name: string | null;
  required_date: string | null;
  line_count: number;
  qty_ordered: string | number;
  qty_received: string | number;
}

export interface ProcurementView {
  orderId: number;
  lines: ShortfallLine[];
  unmatched: UnmatchedBuy[];
  shortCount: number;
  purchaseOrders: PurchaseOrderRow[];
}

export interface ProductionView {
  orderId: number;
  production: {
    id: number;
    orderNumber: string;
    status: string;
    progressPct: number;
    requiredDate: string | null;
    tasks: { total: number; done: number; active: number; blocked: number };
  } | null;
  makeItemCount: number;
}

export interface RaiseResult {
  orders: Array<{
    id: number; orderNumber: string; supplierId: number;
    supplierName: string; lineCount: number; shortfallCovered: number;
  }>;
  reserved: Array<{ catalogItemId: number; reserved: number }>;
  /** Lines that could not be ordered, each with the reason. Never silently dropped. */
  skipped: Array<{ catalogItemId: number; qty: number; reason: string }>;
}

export const fetchProcurement = async (orderId: number): Promise<ProcurementView> =>
  (await api.get<ProcurementView>(`${base()}/orders/${orderId}/procurement`)).data;

export const fetchProduction = async (orderId: number): Promise<ProductionView> =>
  (await api.get<ProductionView>(`${base()}/orders/${orderId}/production`)).data;

/**
 * Reserve what stock covers, and raise purchase orders for the rest.
 *
 * `lines` is what the user actually approved, not what was computed — the
 * shortfall moves between rendering the table and pressing the button, and a
 * purchase order should be the list somebody looked at.
 */
export const raiseProcurement = async (
  orderId: number,
  lines: Array<{ catalogItemId: number; qty: number; supplierId: number; expectedDate?: string }>,
): Promise<RaiseResult> =>
  (await api.post<RaiseResult>(`${base()}/orders/${orderId}/procurement/raise`, { lines })).data;

export const releaseReservations = async (orderId: number): Promise<{ released: number }> =>
  (await api.post<{ released: number }>(`${base()}/orders/${orderId}/procurement/release`, {})).data;

/**
 * Raise the production order, which also BUILDS THE DAG.
 *
 * The two were separate steps and are one act: an order describing work that
 * had never been broken down is a document about nothing.
 */
export const raiseProduction = async (orderId: number): Promise<ProductionView['production'] & {
  created: boolean; tasksClaimed: number; tasksMaterialized: number; itemsSkipped: number;
}> => (await api.post(`${base()}/orders/${orderId}/production/raise`, {})).data;

/** Approve it: draft → waiting, or straight to in production if steel is already in. */
export const approveProduction = async (moId: number) =>
  (await api.post(`${base()}/production-orders/${moId}/approve`, {})).data;

/** Book delivered stock against the line that ordered it. */
export const receiveAgainstLine = async (
  lineId: number,
  payload: {
    plant_id: number; stock_location_id: number; received_date: string;
    pieces: Array<{ qty: number; heat_no?: string; batch_no?: string }>;
  },
) => (await api.post(`${base()}/purchase-lines/${lineId}/receive`, payload)).data;

// ── Goods receipt against a purchase order ──────────────────────────────────
// The Stock in screen's second mode. These are not scoped to a sales order,
// unlike everything above: whoever is receiving a delivery has a PO number on
// a note and no idea which sales order caused it.

export interface OpenPurchaseOrder {
  id: number;
  order_number: string;
  status: string;
  supplier_id: number | null;
  supplier_name: string | null;
  required_date: string | null;
  source_order_id: number | null;
  source_order_number: string | null;
  line_count: number;
  qty_ordered: string | number;
  qty_received: string | number;
}

export interface PurchaseOrderLine {
  id: number;
  line_no: number;
  code: string | null;
  description: string | null;
  catalog_item_id: number | null;
  catalog_code: string | null;
  catalog_name: string | null;
  catalog_unit: string | null;
  qty: string | number;
  qty_received: string | number;
  unit: string | null;
  status: string | null;
  expected_date: string | null;
  /** qty − qty_received, floored at zero. */
  outstanding: number;
}

/** Purchase orders still open for receipt; `all` also returns closed ones. */
export const fetchPurchaseOrders = async (all = false): Promise<OpenPurchaseOrder[]> =>
  (await api.get<{ orders: OpenPurchaseOrder[] }>(`${base()}/purchase-orders${all ? '?all=1' : ''}`))
    .data.orders ?? [];

export const fetchPurchaseOrderLines = async (poId: number): Promise<PurchaseOrderLine[]> =>
  (await api.get<{ lines: PurchaseOrderLine[] }>(`${base()}/purchase-orders/${poId}/lines`))
    .data.lines ?? [];

export interface ReceiveOrderResult {
  poId: number;
  poStatus: string;
  orderNumber: string;
  lines: Array<{ lineId: number; qty: number }>;
  qtyTotal: number;
  /** Tasks that were waiting on this material and are now runnable. */
  tasksCleared: number[];
}

/**
 * Book a whole delivery against one purchase order.
 *
 * Lines left blank are simply not received — a delivery note routinely covers
 * part of an order, and a blank row is how somebody says "this did not come".
 */
export const receiveAgainstOrder = async (
  poId: number,
  payload: {
    plant_id: number;
    stock_location_id: number;
    received_date: string;
    notes?: string | null;
    lines: Array<{ line_id: number; qty: number; heat_no?: string | null; batch_no?: string | null }>;
  },
): Promise<ReceiveOrderResult> =>
  (await api.post<ReceiveOrderResult>(`${base()}/purchase-orders/${poId}/receive`, payload)).data;
