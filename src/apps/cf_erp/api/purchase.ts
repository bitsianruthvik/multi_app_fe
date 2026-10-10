import { cfApi, qs } from './client';
import type { Comparison, QuoteInput, RfqDetail } from './procurement';
import type { PurchaseOrder } from './types';

/**
 * ONE purchase order, stage by stage (BE routes/purchaseFlow.js, CF_ERP_PURCHASE_FLOW_PLAN.md):
 * Requested -> Stock checked -> RFQ out -> Quotes in -> Ordered -> Part received -> Received.
 * Money is INR, net of tax; a value that is null is NOT PRICED — never zero.
 */

export type PurchaseLaneKey = 'requested' | 'stock_checked' | 'rfq_out' | 'quotes_in' | 'ordered' | 'part_received' | 'received';

/** The lanes in order, with their words — the same labels the server sends, for the stage strip. */
export const PURCHASE_LANES: { key: PurchaseLaneKey; label: string }[] = [
  { key: 'requested', label: 'Requested' },
  { key: 'stock_checked', label: 'Stock checked' },
  { key: 'rfq_out', label: 'RFQ out' },
  { key: 'quotes_in', label: 'Quotes in' },
  { key: 'ordered', label: 'Ordered' },
  { key: 'part_received', label: 'Part received' },
  { key: 'received', label: 'Received' },
];

export interface PurchaseCard {
  id: number;
  code: string;
  lane: PurchaseLaneKey | 'closed';
  status: string;
  statusLabel: string;
  supplier: { id: number; code: string | null; name: string } | null;
  forOrder: { id: number; code: string } | null;
  lines: number;
  /** null = nothing priced yet. */
  value: number | null;
  nextDue: string | null;
  overdue: boolean;
  createdAt: string;
  tags: string[];
}

export interface PurchaseLane {
  key: PurchaseLaneKey;
  label: string;
  hint: string;
  count: number;
  value: number;
  cards: PurchaseCard[];
}

export interface PurchaseBoard { lanes: PurchaseLane[] }

export interface PurchaseBoardQuery { orderId?: number | null; supplierId?: number | null; search?: string }

export interface ShortfallRow {
  item: { id: number; code: string | null; name: string; uom: string };
  uom: string;
  toBuy: number;
}

export interface HeldRow {
  id: number;
  item: { id: number; code: string | null; name: string; uom: string };
  quantity: number;
  batch: { id: number; code: string } | null;
  purchaseOrder: { id: number; code: string } | null;
}

export interface OrderPurchase {
  shortfall: ShortfallRow[];
  lanes: PurchaseLane[];
  held?: { total: number; rows: HeldRow[] };
}

export interface RequestItemLine { itemId: number; quantity: number }

export interface StockCheckLine {
  lineId: number;
  item: { id: number; code: string | null; name: string; uom: string };
  quantity: number;
  freeInStock: number;
  proposeHold: number;
}

export interface StockCheck {
  purchaseOrder: { id: number; code: string; status: string; stockCheckedAt: string | null };
  orderId: number | null;
  canHold: boolean;
  lines: StockCheckLine[];
}

export interface StockCheckResult {
  held: { lineId: number; itemId: number; quantity: number }[];
  purchaseOrder: PurchaseOrder;
}

export interface PoQuotes {
  purchaseOrder: { id: number; code: string; status: string };
  rfq: (RfqDetail & { quotes?: { id: number; supplierId: number }[] }) | null;
  comparison: Comparison | null;
}

export interface SendRfqInput { supplierIds: number[]; quotesDue?: string | null; terms?: string | null }
export interface Award { rfqLineId: number; quoteLineId: number }

export const purchaseBoardParams = (q: PurchaseBoardQuery) => qs({
  orderId: q.orderId ?? undefined,
  supplierId: q.supplierId ?? undefined,
  search: q.search?.trim() || undefined,
});

export const getPurchaseBoard = (q: PurchaseBoardQuery = {}) => cfApi.get<PurchaseBoard>(`/purchase/board${purchaseBoardParams(q)}`);
export const getOrderPurchase = (orderId: number) => cfApi.get<OrderPurchase>(`/orders/${orderId}/purchase`);
/** One requested purchase order bought for the sales order. */
export const requestItems = (orderId: number, body: { lines: RequestItemLine[]; notes?: string | null }) => cfApi.post<PurchaseOrder>(`/orders/${orderId}/purchase-request`, body);
export const getStockCheck = (poId: number) => cfApi.get<StockCheck>(`/purchase-orders/${poId}/stock-check`);
/** Holds the stock for the sales order and cuts the PO by it; answers with what was held and the PO as it now stands. */
export const applyStockCheck = (poId: number, lines: { lineId: number; hold: number }[]) =>
  cfApi.post<StockCheckResult>(`/purchase-orders/${poId}/stock-check`, { lines });
export const sendRfq = (poId: number, body: SendRfqInput) => cfApi.post<PoQuotes>(`/purchase-orders/${poId}/rfq`, body);
export const getPoQuotes = (poId: number) => cfApi.get<PoQuotes>(`/purchase-orders/${poId}/quotes`);
export const recordQuote = (poId: number, body: QuoteInput) => cfApi.post<PoQuotes>(`/purchase-orders/${poId}/quotes`, body);
export const placeOrder = (poId: number, awards: Award[]) => cfApi.post<{ purchaseOrders: PurchaseOrder[] }>(`/purchase-orders/${poId}/place`, { awards });
/** Place straight with a supplier — no RFQ needed. */
export const placeWithSupplier = (poId: number, supplierId: number) => cfApi.post<PurchaseOrder>(`/purchase-orders/${poId}/order`, { supplierId });
/** One tentative expected date per line. */
export const setLineExpected = (lineId: number, expectedDate: string | null) => cfApi.put<PurchaseOrder & { plannedUnits?: import('./requisitions').PlannedUnits | null }>(`/purchase-lines/${lineId}`, { expectedDate });
