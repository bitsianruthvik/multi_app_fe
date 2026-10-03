import { cfApi, qs } from './client';
import type { PurchaseOrder } from './types';

/**
 * The RFQ under a purchase order: suppliers, quotes, comparison (CF_ERP_PURCHASE_FLOW_PLAN).
 * Money is INR: amounts 2 dp, unit prices 4 dp, all net of tax. A price that is null was NOT QUOTED — never zero.
 */

export type RfqStatus = 'draft' | 'sent' | 'closed' | 'awarded' | 'cancelled';
export type RfqSupplierStatus = 'invited' | 'sent' | 'quoted' | 'declined';

export interface ItemRef { id: number; code: string | null; name: string; uom: string }
export interface DocRef { id: number; code: string }

export interface RfqLine {
  id: number;
  lineNo: number;
  item: ItemRef;
  quantity: number;
  neededBy: string | null;
  awardedQuoteLineId?: number | null;
}

export interface RfqSupplier {
  id: number;
  supplier: { id: number; name: string; email: string | null };
  /** The address used for this RFQ when it differs from the party's. */
  contactEmail?: string | null;
  status: RfqSupplierStatus;
  sentAt: string | null;
  quote: { id: number } | null;
}

export interface RfqDetail {
  id: number;
  code: string;
  status: RfqStatus;
  quotesDue: string | null;
  terms: string | null;
  notes: string | null;
  sentAt: string | null;
  lines: RfqLine[];
  suppliers: RfqSupplier[];
  purchaseOrders?: { id: number; code: string; supplier?: { id: number; name: string } | null }[];
  quotes?: { id: number; supplierId: number; expired?: boolean; validUntil?: string | null; linesQuoted?: number }[];
}

export interface QuoteLine {
  id?: number;
  rfqLineId: number;
  unitPrice: number | null;
  gstRate: number | null;
  leadTimeDays: number | null;
  qtyOffered: number | null;
  remark: string | null;
}

export interface Quote {
  id: number;
  supplierId: number;
  quoteRef: string | null;
  receivedOn: string | null;
  validUntil: string | null;
  paymentTerms: string | null;
  freightAmount: number | null;
  notes: string | null;
  lines: QuoteLine[];
}

/** What the quote dialog sends: the plan's POST /rfqs/:id/quotes body. */
export interface QuoteInput {
  supplierId: number;
  quoteRef: string | null;
  receivedOn: string | null;
  validUntil: string | null;
  paymentTerms: string | null;
  freightAmount: number | null;
  notes: string | null;
  lines: { rfqLineId: number; unitPrice: number | null; gstRate: number | null; leadTimeDays: number | null; qtyOffered: number | null; remark: string | null }[];
}

export interface ComparisonCell {
  supplierId: number;
  /** Needed to award: the quote line this cell prices. */
  quoteLineId?: number | null;
  unitPrice: number | null;
  amount: number | null;
  freightShare: number | null;
  landedUnit: number | null;
  gstRate: number | null;
  leadTimeDays: number | null;
  valid: boolean;
  /** The quote's validity date has passed (it may still be awarded, but is never recommended). */
  expired?: boolean;
  /** The supplier offered less than the quantity asked. */
  partial?: boolean;
  qtyOffered?: number | null;
  cheapest: boolean;
  fastest: boolean;
  lastPaid: { price: number; date: string | null } | null;
  /** true when this is the line's current award. */
  awarded?: boolean;
}

export interface ComparisonLine {
  rfqLine: RfqLine & { uom?: string };
  cells: ComparisonCell[];
}

export interface ComparisonSupplier { id: number; name: string; total: number | null; landedTotal: number | null; linesQuoted: number }

export interface Comparison {
  lines: ComparisonLine[];
  suppliers: ComparisonSupplier[];
  recommendation?: { perLine: { rfqLineId: number; supplierId: number }[] };
  /** The awards already made, when the server says so. */
  awards?: { rfqLineId: number; quoteLineId: number | null; supplierId?: number }[];
}

export interface RfqEmail { to: string | null; subject: string; body: string }

export const rfqEmail = (id: number, supplierId: number) => cfApi.get<RfqEmail>(`/rfqs/${id}/email${qs({ supplierId })}`);
export const getQuote = (id: number) => cfApi.get<Quote>(`/quotes/${id}`);
export const rfqPrintBlob = (id: number, supplierId: number) => cfApi.getBlob(`/rfqs/${id}/print${qs({ supplierId })}`);

// ---- Purchase orders bought FOR a sales order ------------------------------------

export interface LineOrderInput { orderId: number; quantity: number }

/** What a receipt held for the orders it was bought for. */
export interface HeldReceipt { orderId: number; orderCode: string; quantity: number }

/** Replaces the line's allocations; answers with the whole purchase order. */
export const setLineOrders = (lineId: number, orders: LineOrderInput[]) => cfApi.put<PurchaseOrder>(`/purchase-lines/${lineId}/orders`, { orders });

/** Lets go of held stock: it becomes free for any job. */
export const releaseHold = (id: number) => cfApi.post<{ ok: true }>(`/stock/holds/${id}/release`);
