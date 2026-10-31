import { cfApi, qs } from './client';
import type { PurchaseOrder, PurchaseStage, PurchaseType } from './types';
import type { MaterialSupply, ReqItem, ReqPurchase } from './requisitions';

/**
 * PURCHASE FLOW v3 (BE routes/purchaseRequests.js + purchase.js, init.sql §71; TM/CF_ERP_BUYING_V2.md "2026-10-18").
 * The MR is raised from the sales order; everything after it is in Purchase:
 *   MR screen   Required · In stock (free; the customer's for a customer-supplied MR) · Take from stock · To buy ·
 *               Locked for this order. Saving earmarks what is taken and makes / updates ONE PR for the rest.
 *   PR          the RFQ itself: rows = lines to buy, columns = vendors, a cell = that vendor's rate (₹ per the line's
 *               unit), delivery days and a remark. "PO raised" = on live POs for the line.
 *   Raise PO    per vendor column → a PO for that vendor, PENDING MD APPROVAL.
 * Every figure is the server's, worked out on the read.
 */

export interface MrScreenLine {
  id: number;
  item: ReqItem;
  required: number;
  /** Free for this order now (never stock earmarked for anybody, this MR's own holds included). */
  inStock: number;
  takeFromStock: number;
  /** true once somebody saved a "take from stock" for this line. */
  takeChosen: boolean;
  /** Not chosen yet: what the screen pre-fills — min(required, what could be taken). Nothing is earmarked until saved. */
  proposedTake?: number | null;
  heldFromStock: number;
  /** The most "take from stock" may be now. */
  takeMax: number;
  toBuy: number;
  poRaised: number;
  received: number;
  onOrder: number;
  /** Held from stock + received on its POs (+ reserved / issued once released): nobody else can use it. */
  locked: number;
  open: number;
  status: string;
  statusLabel: string;
  sentence: string;
  /** §95: issued so far — "Issue now" on an MR raised by hand; an order's own MR: issued to its production order. */
  issued: number;
  /** §95: earmarked for the MR and still in the store (held from stock or received on its POs) — what "Issue now" takes. */
  toIssue: number;
  purchase: ReqPurchase[];
}

export interface PrSummary { id: number; code: string; status: PrStatus; statusLabel: string }

/** §79: what an MR is for — the cost follows it. */
export type MrFor = 'sales_order' | 'maintenance_order' | 'stock' | 'general';
export const MR_FOR_LABEL: Record<MrFor, string> = { sales_order: 'Sales order', maintenance_order: 'Maintenance order', stock: 'Stock', general: 'General' };
/** §79: the 'For' of an MR, and whether it was raised by hand (no order line; may have no order). */
export interface MrForFields {
  forType: MrFor; forLabel: string; manual: boolean; maintenanceOrderId: number | null; notes: string | null;
  /** §93 (user 2026-10-27): the MR under Stores' own PR (To reorder › Raise PR, New PR) — not a request to Stores, not in the MR inbox. */
  internal?: boolean;
}

export interface MrScreen extends MrForFields {
  id: number;
  code: string;
  supply: MaterialSupply;
  supplyLabel: string;
  /** null: an MR for stock / general / maintenance with no sales order (§79). */
  order: { id: number; code: string; status: string; customer?: { id: number; name: string } | null } | null;
  /** null: an MR raised by hand (§79) — no order line. */
  line: { id: number; lineNo: number; name: string; quantity: number; frozen: boolean; released: boolean } | null;
  raisedAt?: string;
  raisedBy?: { id: number; name: string | null } | null;
  status: string;
  statusLabel: string;
  stale: boolean;
  needKnown: boolean;
  needComplete: boolean;
  /** §73: raised before the customer accepted — shared with the customer, not released to Purchase yet. */
  heldForAcceptance?: boolean;
  canEdit: boolean;
  reason: string | null;
  /** §95: "Issue now" — offered when something is earmarked and still in the store (and the MR is issued from here). */
  canIssue?: boolean;
  /** §95: why an MR is not issued from here (an order's own MR, a stock MR, waiting for acceptance); null = it is. */
  issueReason?: string | null;
  /** §95: what an issue from this MR is used for: its sales order, or General. */
  issueUsedFor?: 'order' | 'general';
  lines: MrScreenLine[];
  purchaseRequest: PrSummary | null;
  purchaseOrders: { id: number; code: string; status: string; suppliedByCustomer?: boolean; supplier: { id: number; name: string } | null }[];
  sentence: string;
  /** On save only. */
  saved?: { held: number; released: number };
  customerPurchaseOrders?: PurchaseOrder[];
}

export interface MrRow extends MrForFields {
  id: number; code: string; supply: MaterialSupply; supplyLabel: string;
  order: { id: number; code: string; status: string; customer?: { id: number; name: string } | null } | null;
  line: { id: number; lineNo: number; name: string } | null;
  status: string; statusLabel: string; materials: number; lockedLines: number; lockedWords: string;
  /** §73: shared with the customer, waiting for the acceptance — nothing to do in Purchase yet. */
  heldForAcceptance?: boolean;
  purchaseRequest: PrSummary | null; raisedAt: string;
}

export type PrStatus = 'open' | 'partly_ordered' | 'ordered' | 'closed';
export type PrLineStatus = 'open' | 'part' | 'ordered' | 'received' | 'none';

export interface PrLine {
  id: number;
  mrLineId: number;
  item: ReqItem;
  needed: number;
  poRaised: number;
  received: number;
  pending: number;
  /** needed − PO raised: what a new PO may still take. */
  open: number;
  status: PrLineStatus;
  statusLabel: string;
}

export interface PrQuote { rate: number; deliveryDays: number | null; remark: string | null }
export interface PrPoRef { id: number; code: string; stage: PurchaseStage; stageLabel: string }

export interface PrVendor {
  id: number;
  position: number;
  supplier: { id: number; code: string | null; name: string };
  /** By PR line id; no key = no quote. */
  quotes: Record<number, PrQuote>;
  purchaseOrders: PrPoRef[];
}

export interface PurchaseRequest {
  id: number;
  code: string;
  status: PrStatus;
  statusLabel: string;
  today: string;
  requisition: { id: number; code: string; forType?: MrFor; forLabel?: string };
  /** §79: the PR of an MR raised by hand (no order line; order may be null). */
  manual?: boolean;
  order: { id: number; code: string; status: string; customer: { id: number; name: string } | null } | null;
  line: { id: number; lineNo: number; name: string } | null;
  canEdit: boolean;
  createdAt: string;
  notes: string | null;
  lines: PrLine[];
  vendors: PrVendor[];
  purchaseOrders: (PrPoRef & { supplier: { id: number; name: string } | null; lines: { lineId: number; quantity: number; received: number }[] })[];
  counts: { lines: number; open: number; vendors: number };
}

export interface PrRow {
  id: number; code: string; status: PrStatus; statusLabel: string;
  requisition: { id: number; code: string; forType?: MrFor; forLabel?: string };
  order: { id: number; code: string; status: string; customer: { id: number; name: string } | null } | null;
  line: { id: number; lineNo: number; name: string } | null;
  lines: number; toOrder: number; vendors: number; purchaseOrders: { id: number; code: string; stage: PurchaseStage }[]; createdAt: string;
}

export interface PendingLine {
  purchaseOrder: { id: number; code: string; status: string; suppliedByCustomer: boolean; type: PurchaseType };
  supplier: { id: number; name: string } | null;
  line: { id: number; lineNo: number };
  item: ReqItem & { trackedBy: 'quantity' | 'batch' | 'individual' | null };
  ordered: number; received: number; pending: number;
  expectedDate: string | null;
  forOrders: string[];
}

// ---- the MR ------------------------------------------------------------------------------
/** §79: Stores' MR inbox — every MR, filtered by its 'For' (and a maintenance order). */
export const listMaterialRequests = (q: { orderId?: number | null; search?: string; open?: boolean; forType?: MrFor | null; maintenanceOrderId?: number | null } = {}) =>
  cfApi.get<{ rows: MrRow[]; counts?: Record<string, number> }>(`/material-requests${qs({ orderId: q.orderId ?? undefined, search: q.search?.trim() || undefined, open: q.open === false ? 'false' : undefined, for: q.forType || undefined, maintenanceOrderId: q.maintenanceOrderId ?? undefined })}`);
export const getMaterialRequest = (id: number) => cfApi.get<MrScreen>(`/material-requests/${id}`);
/** Saves "take from stock" per line: earmarks it, and makes / updates the PR (or asks the customer for the rest). */
export const saveMaterialRequest = (id: number, body: { lines: { lineId: number; takeFromStock: number }[]; customerDate?: string }) =>
  cfApi.put<MrScreen>(`/material-requests/${id}`, body);

/** §95: what "Issue now" will do (dry run) or did. */
export interface MrIssueResult {
  dryRun?: boolean;
  usedFor: 'order' | 'general';
  order: { id: number; code: string } | null;
  maintenanceOrderId: number | null;
  lines: { lineId: number; item: ReqItem; quantity: number; from: { area: string; batch: string | null; quantity: number }[] }[];
  movement?: { id: number; code: string };
  materialRequest?: MrScreen;
  message?: string;
}
/** §95: ISSUE NOW — one issue for what is earmarked for the MR and still in the store (lines: none = all of it). */
export const issueMaterialRequest = (id: number, body: { lines?: { lineId: number; quantity?: number }[]; movementDate?: string; notes?: string; dryRun?: boolean } = {}) =>
  cfApi.post<MrIssueResult>(`/material-requests/${id}/issue`, body);

// ---- the PR ------------------------------------------------------------------------------
export const listPurchaseRequests = (q: { status?: string; search?: string; orderId?: number | null } = {}) =>
  cfApi.get<{ rows: PrRow[]; counts: Record<PrStatus | 'notClosed' | 'all', number> }>(`/purchase-requests${qs({ status: q.status || undefined, search: q.search?.trim() || undefined, orderId: q.orderId ?? undefined })}`);
export const getPurchaseRequest = (id: number) => cfApi.get<PurchaseRequest>(`/purchase-requests/${id}`);
export const addVendor = (prId: number, supplierId: number) => cfApi.post<PurchaseRequest>(`/purchase-requests/${prId}/vendors`, { supplierId });
export const setVendor = (vendorId: number, supplierId: number) => cfApi.put<PurchaseRequest>(`/purchase-request-vendors/${vendorId}`, { supplierId });
export const removeVendor = (vendorId: number) => cfApi.del<PurchaseRequest>(`/purchase-request-vendors/${vendorId}`);
/** One or more cells of a vendor's column; rate null / '' clears a cell. */
export const setQuotes = (vendorId: number, quotes: { lineId: number; rate: number | null; deliveryDays?: number | null; remark?: string | null }[]) =>
  cfApi.put<PurchaseRequest>(`/purchase-request-vendors/${vendorId}/quotes`, { quotes });
export const pendingPosOfVendor = (vendorId: number) =>
  cfApi.get<{ vendor: { id: number; supplier: { id: number; name: string } }; purchaseOrders: { id: number; code: string }[] }>(`/purchase-request-vendors/${vendorId}/pending-pos`);
export const raisePurchaseOrder = (vendorId: number, body: { lines: { lineId: number; quantity: number }[]; addToPoId?: number | null; notes?: string | null; expectedDate?: string | null }) =>
  cfApi.post<{ purchaseOrder: PurchaseOrder; purchaseRequest: PurchaseRequest }>(`/purchase-request-vendors/${vendorId}/purchase-orders`, body);

// ---- the PO: Management approval, close short, receiving ------------------------------------------------
export const approvePurchaseOrder = (id: number, note?: string | null) => cfApi.post<PurchaseOrder>(`/purchase-orders/${id}/approve`, note ? { note } : {});
/** §73: ASKS Management to close the PO short — nothing changes until it is approved in Management › Approvals. */
export const closePurchaseOrder = (id: number, reason: string) => cfApi.post<PurchaseOrder>(`/purchase-orders/${id}/close`, { reason });
/** §73: Management sends the PO back to the buyer (not placed), with the reason. */
export const rejectPurchaseOrder = (id: number, note: string) => cfApi.post<PurchaseOrder>(`/purchase-orders/${id}/reject`, { note });
/** The PO's own expected delivery date (a line without its own date takes it); the change is recorded with who and when. */
export const setPoExpectedDate = (id: number, expectedDate: string | null) => cfApi.put<PurchaseOrder>(`/purchase-orders/${id}`, { expectedDate });
/** Send a PO made by hand for Management approval (it is placed when Management approves it). */
export const sendForApproval = (id: number, supplierId?: number | null) => cfApi.post<PurchaseOrder>(`/purchase-orders/${id}/order`, supplierId ? { supplierId } : {});
export const getPendingLines = (q: { search?: string; supplierId?: number | null } = {}) =>
  cfApi.get<{ rows: PendingLine[] }>(`/purchase-orders/pending-lines${qs({ search: q.search?.trim() || undefined, supplierId: q.supplierId ?? undefined })}`);
