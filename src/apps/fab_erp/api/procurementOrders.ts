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

export const raiseProduction = async (orderId: number): Promise<ProductionView['production'] & {
  created: boolean; tasksClaimed: number;
}> => (await api.post(`${base()}/orders/${orderId}/production/raise`, {})).data;

/** Book delivered stock against the line that ordered it. */
export const receiveAgainstLine = async (
  lineId: number,
  payload: {
    plant_id: number; stock_location_id: number; received_date: string;
    pieces: Array<{ qty: number; heat_no?: string; batch_no?: string }>;
  },
) => (await api.post(`${base()}/purchase-lines/${lineId}/receive`, payload)).data;
