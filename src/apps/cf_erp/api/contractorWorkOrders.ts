import { cfApi, qs } from './client';

/**
 * CONTRACTOR WORK ORDERS (backend init.sql §85, routes/contractorWorkOrders.js; contract TM/CF_ERP_ORDER_FLOW_PLAN.md
 * "2026-10-18 — Step 6: contractor work orders"). Made from a production order by picking BOM rows × operations →
 * a contractor PO (one line per operation, tonnes × rate per tonne) → Management approval → the work order is issued.
 * Accounts keeps them in lanes and records the weekly payments.
 */

export interface GridCell {
  workOrder: { id: number; code: string; contractor: { id: number; name: string } } | null;
  started: boolean;
  editable: boolean;
  why: string | null;
}
export interface GridRow {
  /** "<order line id>:<BOM line ids>" — the cell's row */
  key: string;
  lineId: number; lineNo: number; bomLineId: number | null; itemId: number | null;
  depth: number; name: string; code: string | null;
  /** how many the production order makes */
  quantity: number;
  unitKg: number | null;
  tonnes: number | null;
  flowName: string | null;
  cells: Record<string, GridCell>;
}
export type WoLane = 'waiting_approval' | 'issued' | 'in_progress' | 'completed' | 'paid' | 'cancelled';
export interface GridWorkOrder { id: number; code: string; contractor: { id: number; name: string }; purchaseOrder: { id: number; code: string } | null; lane: WoLane; cells: number }
export interface ContractorGrid {
  productionOrder: { id: number; code: string; label: string; state: string; stateLabel: string; order: { id: number; code: string }; level: string };
  editable: boolean; why: string | null;
  operations: { id: number; code: string; name: string }[];
  rows: GridRow[];
  contractors: { id: number; code: string; name: string }[];
  /** contractor id → operation id → the rate per tonne of the contractor's last work order for it */
  lastRates: Record<string, Record<string, number>>;
  workOrders: GridWorkOrder[];
}
export interface CreateInput {
  contractorId: number;
  cells: { rowKey: string; operationId: number }[];
  rates: Record<string, number>;
  dueDate?: string | null;
  notes?: string | null;
}
export interface CreatePlan {
  dryRun: true;
  contractor: { id: number; name: string } | null;
  lines: { operation: { id: number; code: string; name: string }; rows: number; tonnes: number; rate: number | null; amount: number | null; cellCount: number }[];
  tonnes: number; amount: number;
  problems: string[];
}

export interface WoCard {
  id: number; code: string; kind: 'po' | 'cells'; status: string; lane: WoLane; laneLabel: string;
  contractor: { id: number; code: string; name: string };
  order: { id: number; code: string; title: string | null; status: string };
  productionOrder: { id: number; code: string; label: string } | null;
  purchaseOrder: { id: number; code: string; stage: string; stageLabel: string } | null;
  sentBack: string | null;
  tonnes: number; done: number; pending: number; value: number; doneValue: number; paid: number; owed: number; pct: number;
  dueDate: string | null; startDate: string | null; lastPaid: string | null; notes: string | null;
}
export interface WoBoard {
  lanes: { key: Exclude<WoLane, 'cancelled'>; label: string; cards: WoCard[]; value: number; owed: number }[];
  counts: { waitingApproval: number; owed: number; open: number };
  today: string;
}
export interface WoLine {
  id: number; lineNo: number; operation: { id: number; code: string; name: string };
  tonnes: number; done: number; closed: number; pending: number; rate: number | null; value: number; doneValue: number; paid: number;
}
export interface WoPayment {
  id: number; date: string; reference: string | null; notes: string | null; tonnes: number; amount: number; by: string | null; at: string;
  removed: { at: string; by: string | null; reason: string | null } | null;
  lines: { poLineId: number; operationId: number | null; tonnes: number; rate: number | null; amount: number }[];
}
export interface WoDetail extends WoCard {
  pendingApprovals?: { id: number; type: string; typeLabel: string; requestedAt: string }[];
  lines: WoLine[];
  scope: { rowKey: string; lineNo: number; name: string; operation: { id: number; code: string; name: string }; quantity: number; unitKg: number | null; tonnes: number | null }[];
  payments: WoPayment[];
  actions: { pay?: boolean; closeShort?: boolean; cancel?: boolean; sendAgain?: boolean };
}
export interface PaymentInput {
  paymentDate?: string; reference?: string | null; notes?: string | null;
  lines: { poLineId: number; tonnes?: number | string | null; rate?: number | string | null; amount?: number | string | null }[];
}
export interface PaymentPlan { dryRun: true; lines: { poLineId: number; name: string; tonnes: number; rate: number; amount: number }[]; amount: number; tonnes: number; problems: string[] }
export interface PaymentResult { payment: { id: number; amount: number; tonnes: number }; workOrder: WoDetail; closed: boolean }

export const getContractorGrid = (productionOrderId: number) => cfApi.get<ContractorGrid>(`/production-orders/${productionOrderId}/contractor-grid`);
export const previewWorkOrder = (productionOrderId: number, input: CreateInput) =>
  cfApi.post<CreatePlan>(`/production-orders/${productionOrderId}/contractor-work-orders`, { ...input, dryRun: true });
export const createWorkOrder = (productionOrderId: number, input: CreateInput) =>
  cfApi.post<WoDetail>(`/production-orders/${productionOrderId}/contractor-work-orders`, input);

export const getWorkOrderBoard = (q: { search?: string; contractorId?: number; orderId?: number; productionOrderId?: number } = {}) =>
  cfApi.get<WoBoard>(`/accounts/work-orders${qs(q)}`);
export const getContractorWorkOrder = (id: number) => cfApi.get<WoDetail>(`/accounts/work-orders/${id}`);
export const previewPayment = (id: number, input: PaymentInput) => cfApi.post<PaymentPlan>(`/accounts/work-orders/${id}/payments`, { ...input, dryRun: true });
export const recordPayment = (id: number, input: PaymentInput) => cfApi.post<PaymentResult>(`/accounts/work-orders/${id}/payments`, input);
export const removePayment = (paymentId: number, reason: string) => cfApi.delWith<WoDetail>(`/accounts/work-order-payments/${paymentId}`, { reason });
export const closeWorkOrderShort = (id: number, reason: string) => cfApi.post<WoDetail>(`/accounts/work-orders/${id}/close-short`, { reason });
export const cancelWorkOrder = (id: number, reason: string) => cfApi.post<WoDetail>(`/accounts/work-orders/${id}/cancel`, { reason });
export const sendWorkOrderAgain = (id: number) => cfApi.post<WoDetail>(`/accounts/work-orders/${id}/send-again`, {});
