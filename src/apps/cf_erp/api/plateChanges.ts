import { cfApi, LONG_WRITE_MS } from './client';

/**
 * PLATE CHANGES AFTER A PURCHASE ORDER (init.sql §62, 2026-10-16; TM/CF_ERP_NESTING_V2.md "Plate changes after
 * a PO"). Once a PO covers a line, a change to its plates is a request the MD approves. The nesting writes take
 * two extra fields (`reason`, `impact`) and may answer `{ requested: true, plateChange }` instead of a save.
 */

/** What a nesting write may carry for the gate. */
export interface PlateChangeFields {
  /** Why the change is needed. Required once a PO covers the line. */
  reason?: string;
  /** No PO yet: answer the before / after too (plateChange.impact). */
  impact?: boolean;
}

export type PlateChangeKind = 'accept' | 'compare' | 'upload' | 'sheet' | 'delete_lot' | 'choices' | 'nest_plates' | 'untracked' | 'untracked_undo';
export type PlateChangeStatus = 'pending' | 'stale' | 'approved' | 'applied' | 'rejected' | 'withdrawn';

export interface ImpactPlate {
  plateItemId: number; code: string; name: string | null;
  thickness: number; length: number; width: number; grade: string | null;
  count: number; kg: number; customer?: number;
  from?: number; to?: number;
}

export interface ImpactMetrics {
  plates: number; pieces: number;
  tonnesBought: number; partsTonnes: number;
  /** Everything bought that is not a part — offcuts included (the user's rule). */
  wasteKg: number; wastePct: number | null;
  offcutKg: number; offcuts: number;
  cost: { value: number | null; basis: string | null; reason: string | null };
}

export interface ImpactDelta {
  plates: number; pieces: number;
  tonnesBought: number | null; partsTonnes: number | null;
  wasteKg: number | null; wastePct: number | null; offcutKg: number | null;
  cost: number | null; costReason?: string;
}

export interface ImpactBuyingItem {
  itemId: number; code: string | null; name: string | null; uom: string | null; plate: boolean;
  needBefore: number; needAfter: number; change: number;
  ordered: number; received: number; held: number;
  onOrder: { poId: number; poCode: string; status: string; purchaseLineId: number; quantity: number; received: number }[];
}

export interface PlateChangeImpact {
  kind: PlateChangeKind; kindLabel: string; direct: boolean;
  reason: string | null;
  requestedBy: { id: number | null; name: string | null } | null;
  plates: {
    before: ImpactPlate[]; after: ImpactPlate[];
    added: ImpactPlate[]; removed: ImpactPlate[]; changed: ImpactPlate[];
    same: boolean; words: string[];
  };
  before: ImpactMetrics; after: ImpactMetrics; delta: ImpactDelta;
  choice: { text: string } | null;
  buying: {
    purchaseOrders: { id: number; code: string; status: string }[];
    items: ImpactBuyingItem[];
    plates: { ordered: number; received: number; held: number };
    text: string;
  };
  sentence: string;
}

export interface ChecklistAction {
  key: string;
  kind: 'add' | 'order' | 'reduce' | 'keep';
  quantity: number;
  text: string;
  poId?: number; poCode?: string; purchaseLineId?: number; prLineId?: number | null;
  done: boolean;
  doneBy: { id: number | null; name: string | null } | null;
  doneAt: string | null;
}

export interface ChecklistItem {
  itemId: number; code: string | null; name: string | null; uom: string | null; plate: boolean;
  needBefore: number; needAfter: number; change: number;
  ordered: number; received: number; held: number;
  onOrder: ImpactBuyingItem['onOrder'];
  actions: ChecklistAction[];
  note: string | null;
}

export interface PlateChangeChecklist { items: ChecklistItem[]; open: number }

export interface PlateChangeEvent { action: string; note: string | null; at: string; by: { id: number; name: string | null } | null }

export interface PlateChangeRequest {
  id: number; code: string;
  kind: PlateChangeKind; kindLabel: string;
  status: PlateChangeStatus; statusLabel: string; stale: boolean;
  reason: string;
  order: { id: number; code: string | null };
  line: { id: number; lineNo: number | null; name: string | null };
  requestedBy: { id: number; name: string | null } | null; requestedAt: string | null;
  decidedBy: { id: number; name: string | null } | null; decidedAt: string | null; decisionNote: string | null;
  appliedAt: string | null;
  impact: PlateChangeImpact | null;
  checklist: PlateChangeChecklist | null;
  canApprove: boolean; whyNotApprove: string | null;
  canReject: boolean; canWithdraw: boolean; canTick: boolean;
  events?: PlateChangeEvent[];
}

export interface PlateChangeGate {
  covered: boolean;
  purchaseOrders: { id: number; code: string; status: string }[];
  needsApproval: boolean;
  held: boolean;
  pending: { id: number; code: string; kindLabel: string; reason: string; requestedBy: { id: number; name: string | null } | null; stale: boolean } | null;
  message: string | null;
}

export interface LinePlateChanges {
  gate: PlateChangeGate;
  canApprove: boolean;
  requests: PlateChangeRequest[];
}

/** What a nesting write answers when it became a request. */
export interface PlateChangeRequested { requested: true; applied: false; plateChange: PlateChangeRequest; message: string }

/** What a nesting write answers on a line with no PO when `impact: true` was sent. */
export interface PlateChangeDirect { plateChange?: { direct: true; impact: PlateChangeImpact } }

export const isRequested = (x: unknown): x is PlateChangeRequested =>
  !!x && typeof x === 'object' && (x as { requested?: unknown }).requested === true && !!(x as { plateChange?: unknown }).plateChange;

/** The before / after a direct save carried, when it changed any plate. */
export const directImpact = (x: unknown): PlateChangeImpact | null => {
  const pc = (x as PlateChangeDirect | null)?.plateChange;
  return pc?.direct && pc.impact && !pc.impact.plates.same ? pc.impact : null;
};

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const nesting = (orderId: number, lineId: number) => `/orders/${orderId}/lines/${lineId}/nesting`;

export function getLinePlateChanges(orderId: number, lineId: number): Promise<LinePlateChanges> {
  return cfApi.get<Partial<LinePlateChanges>>(`${nesting(orderId, lineId)}/plate-changes`).then((o) => ({
    gate: o.gate ?? { covered: false, purchaseOrders: [], needsApproval: false, held: false, pending: null, message: null },
    canApprove: !!o.canApprove,
    requests: arr<PlateChangeRequest>(o.requests),
  }));
}

export interface PlateChangeList {
  status: string;
  counts: { pending: number; stale: number; approved: number };
  canApprove: boolean;
  requests: PlateChangeRequest[];
}

export function listPlateChanges(status: 'pending' | 'open' | 'done' | 'all' = 'open'): Promise<PlateChangeList> {
  return cfApi.get<Partial<PlateChangeList>>(`/plate-changes?status=${status}`).then((o) => ({
    status: o.status ?? status, counts: o.counts ?? { pending: 0, stale: 0, approved: 0 }, canApprove: !!o.canApprove, requests: arr<PlateChangeRequest>(o.requests),
  }));
}

export const getPlateChange = (id: number) => cfApi.get<PlateChangeRequest>(`/plate-changes/${id}`);
export const approvePlateChange = (id: number, note?: string) =>
  cfApi.post<PlateChangeRequest>(`/plate-changes/${id}/approve`, note ? { note } : {}, { timeoutMs: LONG_WRITE_MS });
export const rejectPlateChange = (id: number, note: string) => cfApi.post<PlateChangeRequest>(`/plate-changes/${id}/reject`, { note });
export const withdrawPlateChange = (id: number, note?: string) => cfApi.post<PlateChangeRequest>(`/plate-changes/${id}/withdraw`, note ? { note } : {});
export const tickPlateChange = (id: number, key: string, done: boolean) => cfApi.post<PlateChangeRequest>(`/plate-changes/${id}/checklist`, { key, done });
