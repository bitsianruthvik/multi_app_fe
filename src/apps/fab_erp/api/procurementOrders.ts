/**
 * Receiving deliveries against purchase orders — the Stock in screen.
 *
 * What an order has to buy, and the purchase requests it raises, live on the
 * order's Production step (api/productionPlan.ts).
 */

import api, { API_HOST } from '@core/utils/axiosConfig';

const base = () => `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp`;

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
