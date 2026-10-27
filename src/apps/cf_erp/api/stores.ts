import { cfApi, qs } from './client';
import type { MrFor, MrScreen, PrSummary } from './purchaseRequests';

/**
 * THE STORES CHAIN (BE routes/stores.js, init.sql §79; TM/CF_ERP_ORDER_FLOW_PLAN.md "2026-10-18 — Stores chain").
 * Need → MR → STORES (take from stock, raise the PR) → Purchase (quotes → PO) → Management → Stores GRN → stock.
 *   createRequisition   the general MR ("New MR") — a REQUEST TO STORES: For = sales order | maintenance order | stock | general
 *   raiseStoresPr       Stores' own purchase ("New PR", user 2026-10-27): straight to a PR for Purchase (the MR underneath
 *                       is internal — not in the MR inbox)
 *   reorder             Stores › To reorder (by AI): min / max and periodic items that need buying now
 *   procurement         how an item / definition is procured (the "Procurement" card)
 */

export interface NewMrLine { itemId: number; qty: number; uom?: string | null }
export interface NewMr { forType: MrFor; orderId?: number | null; maintenanceOrderId?: number | null; note?: string | null; lines: NewMrLine[] }

/** POST /requisitions → { id, code }. The MR goes to Stores' inbox. */
export const createRequisition = (body: NewMr) => cfApi.post<{ id: number; code: string }>('/requisitions', body);
/** POST /stores/purchase-requests → the PR made at once (and the internal MR under it). Stores only. */
export const raiseStoresPr = (body: NewMr) =>
  cfApi.post<{ requisition: { id: number; code: string }; materialRequest: MrScreen; purchaseRequest: PrSummary | null }>('/stores/purchase-requests', body);

export type ProcurementMethod = 'make' | 'buy_on_requirement' | 'buy_min_max' | 'buy_periodic' | 'customer_supplies' | 'subcontract';
export const PROCUREMENT_LABEL: Record<ProcurementMethod, string> = {
  make: 'Make (in-house)', buy_on_requirement: 'Buy on requirement', buy_min_max: 'Buy to min / max',
  buy_periodic: 'Buy periodically', customer_supplies: 'Customer supplies', subcontract: 'Subcontract',
};
export const PROCUREMENT_METHODS = Object.keys(PROCUREMENT_LABEL) as ProcurementMethod[];

export interface ReorderRow {
  item: { id: number; code: string | null; name: string; uom: string | null; trackedBy: string | null };
  method: 'buy_min_max' | 'buy_periodic';
  methodLabel: string;
  free: number;
  /** Already coming for stock: stock MRs' lines not yet received. */
  coming: number;
  min: number | null;
  max: number | null;
  periodDays: number | null;
  periodFrom: string | null;
  dueOn: string | null;
  used: number | null;
  /** The suggestion (by AI), raised to the minimum order and a whole order multiple. */
  suggest: number;
  why: string;
  leadTimeDays: number | null;
  minOrderQty: number | null;
  orderMultiple: number | null;
  preferredVendors: { id: number; name: string }[];
}

export const getReorder = (search?: string) =>
  cfApi.get<{ today: string; rows: ReorderRow[]; counts: { all: number; buy_min_max: number; buy_periodic: number } }>(`/stores/reorder${qs({ search: search?.trim() || undefined })}`);
/** To reorder › "Raise PR": the ticked rows → ONE PR for stock (an internal MR for stock underneath, saved at once). */
export const raiseReorder = (rows: { itemId: number; qty: number }[], note?: string | null) =>
  cfApi.post<{ requisition: { id: number; code: string }; materialRequest: MrScreen; purchaseRequest: PrSummary | null }>('/stores/reorder/raise', { rows, ...(note ? { note } : {}) });

export interface ProcurementSettings {
  method: ProcurementMethod;
  methodLabel: string;
  minQty: number | null;
  maxQty: number | null;
  periodDays: number | null;
  periodicFrom: string | null;
  leadTimeDays: number | null;
  orderMultiple: number | null;
  minOrderQty: number | null;
  preferredVendorIds: number[];
  preferredVendors?: { id: number; code: string | null; name: string }[];
}
export interface Procurement {
  subject: { id: number; code: string | null; name: string; kind: 'item' | 'definition'; itemType: string | null; definitionType: string | null };
  methods: { key: ProcurementMethod; label: string }[];
  own: ProcurementSettings | null;
  inherited: { from: { id: number; code: string | null; name: string }; settings: ProcurementSettings | null } | null;
  effective: ProcurementSettings;
  source: 'own' | 'definition' | 'default';
  defaultMethod: ProcurementMethod;
  sourceWords: string;
}
export interface ProcurementInput {
  method: ProcurementMethod | null;
  minQty?: number | null; maxQty?: number | null; periodDays?: number | null; leadTimeDays?: number | null;
  orderMultiple?: number | null; minOrderQty?: number | null; preferredVendorIds?: number[];
}
export const getProcurement = (masterId: number) => cfApi.get<Procurement>(`/procurement/${masterId}`);
/** method null = clear: inherit from the definition / the default again. */
export const setProcurement = (masterId: number, body: ProcurementInput) => cfApi.put<Procurement>(`/procurement/${masterId}`, body);
