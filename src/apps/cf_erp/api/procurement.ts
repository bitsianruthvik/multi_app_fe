import { cfApi, qs } from './client';

/**
 * Purchase request -> RFQ -> quotes -> comparison -> award -> purchase orders
 * (CF_ERP_PROCUREMENT_PLAN, "API"). Money is INR: amounts 2 dp, unit prices 4 dp,
 * all net of tax. A price that is null was NOT QUOTED — never zero.
 */

export type RequestStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'closed' | 'cancelled';
export type RequestLineStatus = 'open' | 'in_rfq' | 'ordered' | 'cancelled';
export type RfqStatus = 'draft' | 'sent' | 'closed' | 'awarded' | 'cancelled';
export type RfqSupplierStatus = 'invited' | 'sent' | 'quoted' | 'declined';

export interface ItemRef { id: number; code: string | null; name: string; uom: string }
export interface PersonRef { id: number; name: string }
export interface DocRef { id: number; code: string }

export interface RequestRow {
  id: number;
  code: string;
  status: RequestStatus;
  /** How many lines. */
  lines: number;
  estTotal: number | null;
  /** Lines with no price: left out of estTotal, which is then a floor, not a total. */
  unpricedLines?: number;
  neededBy: string | null;
  requestedBy: PersonRef | null;
  submittedAt: string | null;
  decidedBy: PersonRef | null;
  decidedAt: string | null;
}

export interface RequestLine {
  id: number;
  lineNo: number;
  item: ItemRef;
  quantity: number;
  neededBy: string | null;
  estUnitPrice: number | null;
  estAmount: number | null;
  status: RequestLineStatus;
  source?: unknown;
  rfq: (DocRef & { status?: string }) | null;
  po: DocRef | null;
}

export interface RequestAllowed { edit: boolean; submit: boolean; approve: boolean; reject: boolean; cancel: boolean; makeRfq: boolean }

export interface HistoryEntry {
  at?: string | null;
  /** 'submitted', 'approved', 'rejected', ... */
  action?: string | null;
  status?: string | null;
  by?: PersonRef | string | null;
  note?: string | null;
}

export interface RequestDetail extends Omit<RequestRow, 'lines'> {
  notes: string | null;
  decisionNote: string | null;
  lines: RequestLine[];
  allowed: RequestAllowed;
  history: HistoryEntry[];
}

export interface RfqRow {
  id: number;
  code: string;
  status: RfqStatus;
  lines?: number;
  suppliers?: number;
  quotes?: number;
  quotesDue: string | null;
  sentAt?: string | null;
  createdAt?: string | null;
}

export interface RfqLine {
  id: number;
  lineNo: number;
  item: ItemRef;
  quantity: number;
  neededBy: string | null;
  request?: DocRef | null;
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

export interface RfqAllowed {
  edit?: boolean; addSupplier?: boolean; enterQuote?: boolean; quote?: boolean; award?: boolean; createPos?: boolean; close?: boolean; cancel?: boolean;
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
  allowed?: RfqAllowed;
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

export interface CreatedPos { purchaseOrders: { id: number; code: string; supplier?: { id: number; name: string } | null; lines?: unknown[] }[]; rfq?: RfqDetail }

export interface RfqEmail { to: string | null; subject: string; body: string }

export interface BuyRequestRow { itemId: number; quantity: number }

export const listRequests = (status?: string, q?: string) => cfApi.get<{ rows: RequestRow[] }>(`/purchase-requests${qs({ status: status && status !== 'all' ? status : undefined, q })}`);
export const getRequest = (id: number) => cfApi.get<RequestDetail>(`/purchase-requests/${id}`);
export const requestAction = (id: number, action: 'submit' | 'approve' | 'reject' | 'cancel', note?: string) =>
  cfApi.post<RequestDetail>(`/purchase-requests/${id}/${action}`, note !== undefined ? { note } : {});
export interface RaisedRequest extends RequestDetail { skipped?: { itemId: number; code?: string | null; reason: string; requested?: number; taken?: number }[] }
export const raiseFromBuyList = (body: { rows: BuyRequestRow[] } | { all: true }) => cfApi.post<RaisedRequest>('/buy-list/request', body);
export const updateRequest = (id: number, body: { neededBy?: string | null; notes?: string | null }) => cfApi.put<RequestDetail>(`/purchase-requests/${id}`, body);
export const addRequestLine = (id: number, body: { itemId: number; quantity: number | string; neededBy?: string | null; estUnitPrice?: number | string | null }) => cfApi.post<RequestDetail>(`/purchase-requests/${id}/lines`, body);
export const putRequestLine = (lineId: number, body: Record<string, unknown>) => cfApi.put<RequestDetail>(`/purchase-request-lines/${lineId}`, body);
export const deleteRequestLine = (lineId: number) => cfApi.del<RequestDetail>(`/purchase-request-lines/${lineId}`);

export const listRfqs = (status?: string) => cfApi.get<{ rows: RfqRow[] }>(`/rfqs${qs({ status: status && status !== 'all' ? status : undefined })}`);
export const getRfq = (id: number) => cfApi.get<RfqDetail>(`/rfqs/${id}`);
export const makeRfq = (body: { requestLineIds?: number[]; requestId?: number; quotesDue?: string | null; terms?: string | null }) => cfApi.post<RfqDetail>('/rfqs', body);
export const updateRfq = (id: number, body: { quotesDue?: string | null; terms?: string | null; notes?: string | null }) => cfApi.put<RfqDetail>(`/rfqs/${id}`, body);
export const addRfqSupplier = (id: number, body: { supplierId: number; contactEmail?: string | null }) => cfApi.post<RfqDetail>(`/rfqs/${id}/suppliers`, body);
export const removeRfqSupplier = (id: number, supplierId: number) => cfApi.del<RfqDetail>(`/rfqs/${id}/suppliers/${supplierId}`);
export const rfqEmail = (id: number, supplierId: number) => cfApi.get<RfqEmail>(`/rfqs/${id}/email${qs({ supplierId })}`);
export const markRfqSent = (id: number, supplierId: number) => cfApi.post<RfqDetail>(`/rfqs/${id}/mark-sent`, { supplierId });
export const declineRfqSupplier = (id: number, supplierId: number) => cfApi.post<RfqDetail>(`/rfqs/${id}/suppliers/${supplierId}/decline`);
export const getQuote = (id: number) => cfApi.get<Quote>(`/quotes/${id}`);
export const saveQuote = (rfqId: number, body: QuoteInput) => cfApi.post<RfqDetail>(`/rfqs/${rfqId}/quotes`, body);
export const getComparison = (id: number) => cfApi.get<Comparison>(`/rfqs/${id}/comparison`);
export const awardLines = (id: number, awards: { rfqLineId: number; quoteLineId: number | null }[]) => cfApi.post<RfqDetail>(`/rfqs/${id}/award`, { awards });
export const closeRfq = (id: number) => cfApi.post<RfqDetail>(`/rfqs/${id}/close`);
export const cancelRfq = (id: number) => cfApi.post<RfqDetail>(`/rfqs/${id}/cancel`);
export const createPos = (id: number) => cfApi.post<CreatedPos>(`/rfqs/${id}/create-pos`);
export const rfqPrintBlob = (id: number, supplierId: number) => cfApi.getBlob(`/rfqs/${id}/print${qs({ supplierId })}`);
