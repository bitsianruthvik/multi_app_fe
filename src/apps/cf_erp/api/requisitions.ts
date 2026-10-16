import { cfApi, qs } from './client';
import type { PurchaseOrder } from './types';

/**
 * Buying v2 (TM/CF_ERP_BUYING_V2.md): the REQUISITION is its own record — one per sales-order line, one line per
 * material — and the server's material-ready engine says when each unit of work may go on. Nothing about a
 * requisition's state is stored: every figure below is the server's, worked out on the read.
 *
 * MATERIAL REQUEST (§66, 2026-10-16): on every screen the requisition is a MATERIAL REQUEST (MR); new ones are
 * numbered MR-<order>-<line>. Who supplies the material is set on the order (a line may differ) and fixed on the
 * MR when it is raised: "We buy" (earmark from stock, buy the rest) or "Customer supplies" (their own lots, and a
 * purchase order to the customer as vendor for the rest, made by the server when the MR is raised).
 */

/** Who supplies a line's material (§66). */
export type MaterialSupply = 'we_buy' | 'customer';
export const SUPPLY_LABEL: Record<MaterialSupply, string> = { we_buy: 'We buy', customer: 'Customer supplies' };

export type ReqLineStatus = 'from_stock' | 'covered' | 'ordered_undated' | 'asked' | 'skipped' | 'part' | 'open' | 'not_needed';
export type ReqStatus = 'empty' | 'fulfilled_from_stock' | 'covered' | 'skipped' | 'mixed' | 'partly_covered' | 'open';
/** waiting: something is short, undated or only asked for · late: a delivery is overdue · dated: it comes on a date · ready: here. */
export type ReadyState = 'ready' | 'dated' | 'late' | 'waiting';

export interface ReqItem { id: number; code: string | null; name: string; uom: string; trackedBy?: 'quantity' | 'batch' | 'individual' }

export interface CoverPart {
  kind: 'issued' | 'reserved' | 'held' | 'free' | 'po' | 'none';
  date: string | null;
  qty: number;
  poCode?: string;
  poLineId?: number;
  poId?: number;
  status?: 'dated' | 'undated' | 'asked';
  pooled?: boolean;
  late?: boolean;
  owner?: string;
}

/** One material's readiness: the engine's answer for a line, a unit or a requisition line. */
export interface ReadyReason {
  item: ReqItem;
  need: number;
  short: number;
  state: ReadyState;
  date: string | null;
  skipped: boolean;
  requisitionLineId: number | null;
  cover: CoverPart[];
  text: string;
}

export interface MaterialReady {
  state: ReadyState | null;
  readyDate: string | null;
  soft: boolean;
  text: string;
}

export interface ReqCover {
  issued: number; reserved: number; held: number; stock: number; ordered: number; undated: number; asked: number; total: number;
  open: number; over: number; freeNow: number; pooledOnOrder: number; firstDate: string | null; lastDate: string | null; late: boolean;
  /** MR figures (§66): earmarked = held + reserved + issued · onPo = still to come on live POs · received on its POs. */
  earmarked?: number; onPo?: number; received?: number;
}

export interface ReqHold { id: number; quantity: number; batch: { id: number; code: string } | null; purchaseOrder: { id: number; code: string } | null }

export interface ReqPurchase {
  allocationId: number;
  purchaseOrder: { id: number; code: string; status: string; suppliedByCustomer?: boolean };
  purchaseLineId: number;
  supplier: { id: number; name: string } | null;
  quantity: number;
  received: number;
  outstanding: number;
  date: string | null;
  state: 'dated' | 'undated' | 'asked' | 'received' | 'closed';
  late: boolean;
}

export interface ReqLine {
  id: number;
  item: ReqItem;
  need: number;
  needRaised: number;
  needKnown: boolean;
  status: ReqLineStatus;
  statusLabel: string;
  resolved: boolean;
  sentence: string;
  skipped: { by: { id: number; name: string } | null; at: string; note: string | null } | null;
  cover: ReqCover;
  holds: ReqHold[];
  purchase: ReqPurchase[];
  ready: { state: ReadyState; date: string | null; text: string; cover: CoverPart[] } | null;
}

export interface ReqCounts {
  lines: number; over: number; from_stock: number; covered: number; ordered_undated: number; asked: number; skipped: number;
  part: number; open: number; not_needed: number; waiting: number;
}

export interface Requisition {
  id: number;
  code: string;
  /** §66: who supplies its material — fixed when it was raised (an MR from before §66 is 'we_buy'). */
  supply?: MaterialSupply;
  supplyLabel?: string;
  order: { id: number; code: string; status: string; customer?: { id: number; name: string } | null };
  line: { id: number; lineNo: number; name: string; quantity: number; frozen: boolean; released: boolean };
  status: ReqStatus;
  statusLabel: string;
  done: boolean;
  sentence: string;
  raisedAt: string;
  raisedBy: { id: number; name: string } | null;
  syncedAt: string | null;
  needKnown: boolean;
  needComplete: boolean;
  stale: boolean;
  missing: unknown[];
  counts: ReqCounts;
  materialReady: MaterialReady | null;
  lines: ReqLine[];
}

export interface LineWithout {
  line: { id: number; lineNo: number; name?: string; quantity?: number };
  /** §66: who supplies it (the line's own answer, else the order's) and the line's own answer (null = as the order). */
  supply?: MaterialSupply;
  supplyLabel?: string;
  ownSupply?: MaterialSupply | null;
  /** §68: the customer's promised date the raise proposes (the line's committed date, else the order's). */
  customerDateDefault?: string | null;
  canRaise: boolean;
  reason: string | null;
  materials: { item: ReqItem; need: number }[];
  materialReady: MaterialReady | null;
}

export interface EarmarkedOnRaise { requisition: { id: number; code: string }; lineId: number; item: ReqItem; quantity: number; owner: 'ours' | 'customer' }

export interface OrderRequisitions {
  order: { id: number; code: string; status: string; open?: boolean; materialSupply?: MaterialSupply; materialSupplyLabel?: string };
  today: string;
  reason: string | null;
  requisitions: Requisition[];
  linesWithout: LineWithout[];
  /** Raise / refresh only. */
  raised?: number;
  refreshed?: number;
  notRaised?: { lineId: number; lineNo: number; reason: string }[];
  /** Raise only (§66): what was earmarked as it was raised, and the purchase orders made to the customer. */
  earmarked?: EarmarkedOnRaise[];
  customerPurchaseOrders?: PurchaseOrder[];
}

export interface LineMaterialReady {
  line: { id: number; lineNo: number };
  order: { id: number; code: string; status: string };
  today: string;
  requisition: { id: number; code: string } | null;
  state: ReadyState | null;
  readyDate: string | null;
  soft: boolean;
  known: boolean;
  complete: boolean;
  why: string | null;
  text: string;
  materials: ReadyReason[];
}

// ---- stock check -------------------------------------------------------------

export interface ReqStockCheckLine {
  lineId: number;
  item: ReqItem;
  need: number;
  covered: number;
  open: number;
  status: string;
  /** Free for THIS order: stock earmarked for anybody else is simply not counted. */
  freeInStock: number;
  /** The most that may be held (need − stock). */
  room: number;
  proposeHold: number;
}

export interface ReqStockCheck {
  applied: false;
  requisition: { id: number; code: string; status: string };
  canApply: boolean;
  lines: ReqStockCheckLine[];
  sentence: string;
}

export interface ReqStockHeld { applied: true; held: { lineId: number; item: ReqItem; quantity: number }[]; requisition: Requisition }

// ---- purchase orders from requisition lines -------------------------------------

export interface MakePoLine { prLineId: number; quantity?: number; expectedDate?: string | null; unitPrice?: number | null }
export interface MakePo { supplierId?: number | null; expectedDate?: string | null; place?: boolean; notes?: string | null; lines: MakePoLine[] }
export interface MadePos { purchaseOrders: PurchaseOrder[]; requisitions: Requisition[] }

export interface ReleaseExcessPlan { kind: 'allocation' | 'hold'; id: number; quantity: number; leaves: number; text: string; purchaseOrder?: { id: number; code: string } }
export interface ReleaseExcess {
  applied?: boolean;
  requisitionLineId: number;
  item: ReqItem;
  need: number;
  excess: number;
  plan: ReleaseExcessPlan[];
  requisition?: Requisition;
}

// ---- board -------------------------------------------------------------------------

export interface BuyingCard {
  id: number;
  code: string;
  order: { id: number; code: string; status?: string };
  line: { id: number; lineNo: number; name?: string };
  status: ReqStatus;
  statusLabel: string;
  done: boolean;
  sentence: string;
  counts: ReqCounts;
  stale: boolean;
  materialReady: MaterialReady | null;
  lastDate: string | null;
  late: boolean;
  purchaseOrders: { id: number; code: string; status: string }[];
}
export interface BuyingColumn { key: ReqStatus; label: string; hint: string; count: number; cards: BuyingCard[] }
export interface WaitingCard extends BuyingCard { waitingLines: { id: number; item: ReqItem; need: number; short: number }[] }
export interface BuyingBoard {
  today: string;
  columns: BuyingColumn[];
  /** Requisitions with a skipped material that is not in stock right now — from the server; also in their status column. */
  waitingForStock?: { key: 'waiting_for_stock'; label: string; hint: string; count: number; cards: WaitingCard[] };
  notRaised: { order: { id: number; code: string }; line: { id: number; lineNo: number }; materials: number; materialReady: MaterialReady | null }[];
}

// ---- calls ---------------------------------------------------------------------------

export const getOrderRequisitions = (orderId: number) => cfApi.get<OrderRequisitions>(`/orders/${orderId}/requisitions`);
/**
 * Raise (or bring up to date) the material requests of an order: every line whose material is known, or only
 * `lineIds`. `earmark: true` earmarks free stock as it raises (the screen's "Raise the MR"); a line the customer
 * supplies always takes the customer's own lots and gets a purchase order to the customer for the rest.
 */
export const raiseRequisitions = (orderId: number, body: { lineIds?: number[]; notes?: string | null; earmark?: boolean; customerDate?: string } = {}) => cfApi.post<OrderRequisitions>(`/orders/${orderId}/requisitions`, body);
/** §68: the date the customer promised to send the material on their PO (a PO made before dates were asked). */
export const setPromisedDate = (poId: number, date: string) => cfApi.put<PurchaseOrder>(`/purchase-orders/${poId}`, { expectedDate: date });

/** §68: customer material to go back (extra, a substitute not accepted) and the substitutes, worked out on the read. */
export interface CustomerReturnRow {
  party: { id: number; name: string | null };
  order: { id: number; code: string } | null;
  item: { id: number; code: string | null; name: string; uom: string | null };
  batch: { id: number; code: string; status: string };
  quantity: number;
  why: 'extra' | 'substitute_rejected';
  text: string;
}
export interface SubstituteRow {
  id: number; status: 'pending' | 'approved' | 'rejected'; statusLabel: string;
  order: { id: number; code: string } | null; line: { id: number; lineNo: number } | null;
  purchaseOrder: { id: number; code: string };
  ordered: { id: number; code: string | null; name: string | null }; received: { id: number; code: string | null; name: string | null };
  quantity: number; batch: { id: number; code: string } | null; reason: string;
  request: { id: number; code: string; status: string } | null;
  text: string;
}
export interface CustomerReturns { toReturn: CustomerReturnRow[]; substitutes: SubstituteRow[] }
export const getCustomerReturns = (q: { orderId?: number | null; partyId?: number | null } = {}) =>
  cfApi.get<CustomerReturns>(`/customer-material/returns${qs({ orderId: q.orderId ?? undefined, partyId: q.partyId ?? undefined })}`);

/** Who supplies one line's material (§66); null = as the order. Refused once the line's MR is raised. */
export const setLineSupply = (lineId: number, supply: MaterialSupply | null) =>
  cfApi.put<{ lineId: number; lineNo: number; materialSupply: MaterialSupply | null; supply: MaterialSupply }>(`/order-lines/${lineId}/material-supply`, { supply });
export const getRequisition = (id: number) => cfApi.get<Requisition>(`/requisitions/${id}`);
export const getLineMaterialReady = (lineId: number) => cfApi.get<LineMaterialReady>(`/order-lines/${lineId}/material-ready`);

/** A dry run: what would be held. Holds nothing. */
export const checkStock = (id: number, lineIds?: number[]) => cfApi.post<ReqStockCheck>(`/requisitions/${id}/stock-check`, lineIds?.length ? { lineIds } : {});
/** Holds the given quantities for the requisition's lines. */
export const holdStock = (id: number, lines: { lineId: number; hold: number }[]) => cfApi.post<ReqStockHeld>(`/requisitions/${id}/stock-check`, { apply: true, lines });

export type LineSet = { lineIds: number[] } | { all: true };
export const skipLines = (id: number, set: LineSet, note?: string | null) => cfApi.post<{ changed: number; lineIds: number[]; requisition: Requisition }>(`/requisitions/${id}/skip`, { ...set, ...(note ? { note } : {}) });
export const unskipLines = (id: number, set: LineSet) => cfApi.post<{ changed: number; lineIds: number[]; requisition: Requisition }>(`/requisitions/${id}/unskip`, set);

export const makePurchaseOrders = (orders: MakePo[]) => cfApi.post<MadePos>('/requisitions/purchase-orders', { orders });

export const releaseExcessPlan = (prLineId: number) => cfApi.post<ReleaseExcess>(`/requisition-lines/${prLineId}/release-excess`, {});
export const releaseExcess = (prLineId: number) => cfApi.post<ReleaseExcess>(`/requisition-lines/${prLineId}/release-excess`, { apply: true });

export const getBuyingBoard = (q: { orderId?: number | null; search?: string } = {}) =>
  cfApi.get<BuyingBoard>(`/buying/board${qs({ orderId: q.orderId ?? undefined, search: q.search?.trim() || undefined })}`);

/** A PO line's date and/or quantity (the existing route); answers with the purchase order. */
export const updatePurchaseLine = (lineId: number, body: { expectedDate?: string | null; quantity?: number }) => cfApi.put<WithPlanned<PurchaseOrder>>(`/purchase-lines/${lineId}`, body);

// ---- what a changed date does to the plan -----------------------------------------------

/** The planned cards a PO-line date or quantity change made late or waiting (the PUT and the PO cancel answer with it). */
export interface PlannedUnit {
  unitKey: string; code: string; name?: string;
  order: { id: number; code: string }; line: { id: number; lineNo: number };
  kind: 'material_late' | 'waiting';
  week: string | null; startDate: string | null; wasDate: string | null; wasState: string | null;
  readyDate: string | null; earliest: string | null; message: string;
}
export interface PlannedUnits {
  change?: { purchaseLineId: number; purchaseOrder: { id: number; code: string }; date?: { from: string | null; to: string | null } };
  orderIds: number[]; late: number; waiting: number; units: PlannedUnit[];
}
export type WithPlanned<T> = T & { plannedUnits?: PlannedUnits | null };

/** One sentence for the note under a PO line edit: how many planned cards it made late or waiting, and which. */
export function plannedUnitsSentence(p: PlannedUnits | null | undefined): string | null {
  if (!p || !p.units.length) return null;
  const names = p.units.map((u) => u.code);
  const shown = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
  const parts = p.late && p.waiting ? 'late or waiting' : p.waiting ? 'wait for stock' : 'late';
  return `This makes ${p.units.length} planned ${p.units.length === 1 ? 'card' : 'cards'} ${parts}: ${shown}. Move ${p.units.length === 1 ? 'it' : 'them'} on the Plan board.`;
}

/** Cancel a purchase order; the answer carries `plannedUnits` (the planned cards it made late or waiting). */
export const cancelPurchaseOrder = (id: number, reason: string) => cfApi.post<WithPlanned<PurchaseOrder>>(`/purchase-orders/${id}/cancel`, { reason });
