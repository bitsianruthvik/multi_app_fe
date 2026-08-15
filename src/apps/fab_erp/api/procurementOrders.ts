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
  /**
   * The same requirement broken down by the PLATE SIZE nesting asked for.
   *
   * A catalog item is a thickness and a grade, not a size, so matching on it
   * alone let a 2000×1000 offcut cover a nest needing 12000×2500. Each entry
   * compares one size against stock pieces of exactly that size.
   */
  sizes?: ShortfallSize[];
  /** Pieces of this item in stock whose length/width nobody recorded. */
  unsizedOnHand?: number;
}

export interface ShortfallSize {
  thick: number | null;
  length: number | null;
  width: number | null;
  required: number;
  /** In stock at EXACTLY this size. */
  onHand: number;
  /** In stock for this item but with no size recorded — cannot be matched. */
  unsized: number;
  /** False when the requirement itself carries no size, so nothing to match on. */
  sized: boolean;
  /** null when `sized` is false — the catalog-level number applies instead. */
  short: number | null;
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
export const raiseProduction = async (
  orderId: number,
  /**
   * Proceed despite parts missing values their operations need. Raising is what
   * freezes every formula onto its task, so those tasks get a duration of zero —
   * the escape hatch is real, but it must be a deliberate second act.
   */
  force = false,
): Promise<ProductionView['production'] & {
  created: boolean; tasksClaimed: number; tasksMaterialized: number; itemsSkipped: number;
}> => (await api.post(`${base()}/orders/${orderId}/production/raise`, force ? { force: true } : {})).data;

/** Approve it: draft → waiting, or straight to in production if steel is already in. */
export const approveProduction = async (moId: number) =>
  (await api.post(`${base()}/production-orders/${moId}/approve`, {})).data;

/** Book delivered stock against the line that ordered it. */
export const receiveAgainstLine = async (
  lineId: number,
  payload: {
    plant_id: number; stock_location_id: number; received_date: string;
    /**
     * `length_mm`/`width_mm` are the piece's own size — what procurement
     * matches a nest against. Optional because it is not always known at
     * receipt, but a piece received without it cannot satisfy a sized nest.
     */
    pieces: Array<{
      qty: number; heat_no?: string; batch_no?: string;
      length_mm?: number; width_mm?: number;
    }>;
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
