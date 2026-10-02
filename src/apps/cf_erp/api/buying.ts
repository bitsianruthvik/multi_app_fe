import { cfApi, qs } from './client';

/**
 * The Buying board and the procurement trace (BE services/buyingBoardService.js).
 * A card is a DOCUMENT in exactly one column; money is INR, net of tax, and a
 * value that is null is NOT PRICED — never zero.
 */

export type BuyingStageKey = 'to_buy' | 'requested' | 'approved' | 'rfq_out' | 'quotes_in' | 'awarded' | 'ordered' | 'part_received' | 'received';
export type BoardColumnKey = BuyingStageKey | 'closed';
export type BuyingDocType = 'request' | 'rfq' | 'po';

export interface BuyingStage { key: BuyingStageKey; label: string; hint: string }

export interface BoardCard {
  type: BuyingDocType | 'to_buy';
  id: number;
  code: string;
  status: string;
  statusLabel: string;
  column: BoardColumnKey;
  /** The document's own furthest stage (what its stage bar highlights). */
  stage: BuyingStageKey | null;
  /** null while it is work in hand; 'passed' when the next document carries it on. */
  ended: null | 'passed' | 'closed' | 'cancelled';
  party: { role: string; id: number | null; name: string | null } | null;
  items: number;
  value: number | null;
  /** full = every line priced; part = some lines; none = nothing priced. */
  valueState: 'full' | 'part' | 'none';
  valueBasis: 'estimate' | 'quoted' | 'awarded' | 'mixed' | 'ordered';
  unpricedLines: number;
  currency: string;
  since: string | null;
  ageDays: number | null;
  due: { date: string; overdue: boolean } | null;
  tags: string[];
  /** Path under the app, e.g. "rfqs/12". */
  link: string;
  suppliers?: { id: number; name: string; status: string; quoted: boolean }[];
  quotes?: number;
  ordered?: number;
  received?: number;
  receipts?: { count: number; lastDate: string | null } | null;
}

export interface BoardColumn {
  key: BoardColumnKey;
  label: string;
  hint: string;
  count: number;
  value: number | null;
  /** Cards not fully priced (their value is a floor, or missing). */
  unpriced: number;
  currency: string;
  cards: BoardCard[];
  /** Cards left out by the per-column cap. */
  more: number;
  moreLink: { path: string; query: Record<string, string> };
}

export interface OrderBuyRow {
  item: { id: number; code: string | null; name: string | null; uom: string | null };
  planned: boolean;
  toBuy: number;
  toRequest: number;
  inRequest: number;
  inRfq: number;
  onOrder: number;
  estUnitPrice: number | null;
  estCost: number | null;
  purchaseRequests: { id: number; code: string }[];
  rfqs: { id: number; code: string }[];
  purchaseOrders: { id: number; code: string; status: string }[];
  /** Other orders that want the same item — a released buy-list row is per item, not per order. */
  sharedWith: { id: number; code: string }[];
}

export interface ReceiptRef { id: number; code: string; date: string; quantity: number; purchaseOrder: { id: number; code: string }; link: string }

export interface BuyingBoard {
  stages: BuyingStage[];
  columns: BoardColumn[];
  filters: {
    supplier: { id: number; code: string; name: string } | null;
    order: { id: number; code: string; status: string } | null;
    search: string | null;
    includeClosed: boolean;
  };
  toBuy: { items: number; value: number | null; unpricedItems: number; currency: string; rows?: OrderBuyRow[] };
  receipts?: ReceiptRef[];
  links?: { requestLines: number };
  generatedAt: string;
}

export interface BoardQuery {
  supplierId?: number | null;
  orderId?: number | null;
  search?: string;
  includeClosed?: boolean;
  limit?: number;
  withRows?: boolean;
}

/** The query string the board is read with — every filter is applied on the server. */
export const boardParams = (q: BoardQuery) => qs({
  supplierId: q.supplierId ?? undefined,
  orderId: q.orderId ?? undefined,
  search: q.search?.trim() || undefined,
  includeClosed: q.includeClosed ? 1 : undefined,
  limit: q.limit,
  withRows: q.withRows ? 1 : undefined,
});

export const getBuyingBoard = (q: BoardQuery = {}) => cfApi.get<BuyingBoard>(`/buying/board${boardParams(q)}`);

export interface TraceDoc {
  type: BuyingDocType;
  id: number;
  code: string;
  status: string;
  statusLabel: string;
  stage: BuyingStageKey | null;
  ended: BoardCard['ended'];
  party: BoardCard['party'];
  items: number;
  value: number | null;
  valueState: BoardCard['valueState'];
  link: string;
}

export interface ProcurementTrace {
  type: BuyingDocType;
  id: number;
  stages: BuyingStage[];
  stage: BuyingStageKey | null;
  ended: BoardCard['ended'];
  document: TraceDoc;
  requests: TraceDoc[];
  rfqs: TraceDoc[];
  purchaseOrders: TraceDoc[];
  receipts: ReceiptRef[];
  /** The furthest stage any linked document stands at. */
  reached: BuyingStageKey | null;
}

export const getProcurementTrace = (type: BuyingDocType, id: number) => cfApi.get<ProcurementTrace>(`/procurement/trace${qs({ type, id })}`);
