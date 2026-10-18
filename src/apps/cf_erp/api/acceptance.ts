import { cfApi, qs } from './client';
import type { OrderValue } from '../lib/orderValue';

/**
 * CUSTOMER ACCEPTANCE — the sales order's confirm step (backend init.sql §73, routes/acceptance.js; contract
 * TM/CF_ERP_ORDER_FLOW_PLAN.md "2026-10-18 — Step 3A"). Saving the terms sends them to Management; their approval
 * confirms the order, releases its MR to Purchase and locks the terms. A later change is a rate change, approved again.
 */

export type WeightSource = 'drawing' | 'actual';
/** Scrap & offcuts (2026-10-18): scrap kg × rate, offcut kg × rate, or a % of the material. */
export type ScrapOf = 'scrap' | 'offcut' | 'material_pct';
export type ChargeBasis = { type: 'weight'; weight: WeightSource } | { type: 'formula'; expression: string; unit: string } | { type: 'scrap'; of: ScrapOf };
export type ChargeBilling = 'pro_rata' | 'on_completion';

export interface ChargeRow {
  key: string;
  label: string;
  operationId: number | null;
  basis: ChargeBasis | null;
  rate: number | null;
  billing: ChargeBilling | null;
}
export interface MaterialRow { rate: number | null; weight: WeightSource }
export interface LumpSumRow { key: string; label: string; amount: number | null }

export type TriggerType = 'order_accepted' | 'design_frozen' | 'material_in_place' | 'customer_material_received' | 'production_started'
  | 'operation_completed' | 'dispatched' | 'fully_dispatched' | 'post_stage' | 'days_after' | 'fixed_date' | 'retention';
export interface Trigger {
  type: TriggerType | '';
  operationId?: number | null;
  mode?: 'each' | 'all';
  stageKey?: string;
  days?: number | null;
  after?: Trigger | null;
  date?: string;
  months?: number | null;
  milestoneKey?: string;
}
export interface MilestoneRow {
  key: string;
  label: string;
  kind: 'percent' | 'amount' | null;
  value: number | null;
  trigger: Trigger | null;
  proRata: boolean;
  creditDays: number;
}
export interface StageRow { key: string; name: string }

export interface Terms {
  charges: ChargeRow[];
  material: MaterialRow | null;
  lumpSums: LumpSumRow[];
  milestones: MilestoneRow[];
  stages: StageRow[];
  supply?: { order: 'we_buy' | 'customer'; lines: { lineId: number; lineNo: number; supply: 'we_buy' | 'customer' }[] };
}

export interface Estimate {
  tonnes: number;
  ourTonnes: number;
  unweighedLines: number[];
  charges: { key: string; label: string; operation: string | null; quantity: number | null; unit: string | null; rate: number | null; amount: number | null; note: string | null; basisKind?: 'scrap'; scrapOf?: ScrapOf; rateUnit?: string }[];
  material: { quantity: number; unit: string; rate: number; amount: number } | null;
  lumpSums: { key: string; label: string; amount: number }[];
  value: number;
  materialCost: number | null;
  materialCostNote: string;
  /** MR materials with no price paid and no list price — "not costed, set the plate rate" (2026-10-18). */
  materialNotCosted?: { itemId: number; code: string | null; name: string | null }[];
  /** What the order's saved nesting leaves over (when a scrap & offcuts charge asks). */
  waste?: { plates: number; plateKg: number; partsKg: number; scrapKg: number; offcutKg: number; kerfKg: number; unsplit: number } | null;
  marginOverMaterial: number | null;
  marginPct: number | null;
  milestones: { key: string; label: string; amount: number }[];
  milestonesTotal: number;
  milestonesNote: string | null;
}

export type AcceptanceStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'superseded';
export interface AcceptanceVersion {
  id: number;
  version: number;
  kind: 'acceptance' | 'rate_change';
  status: AcceptanceStatus;
  terms?: Terms | null;
  estimate?: Estimate | null;
  note: string | null;
  savedBy: { id: number; name: string | null } | null;
  savedAt: string;
  decidedBy: { id: number; name: string | null } | null;
  decidedAt: string | null;
  decisionNote: string | null;
  approvalId: number | null;
}

export interface PostStage {
  id: number;
  key: string;
  name: string;
  sequence: number;
  done: boolean;
  doneOn: string | null;
  doneNote: string | null;
  doneBy: { id: number; name: string | null } | null;
  doneAt: string | null;
}

export interface AcceptanceLine {
  id: number;
  lineNo: number;
  name: string;
  code: string | null;
  quantity: number;
  committedDate: string | null;
  ownSupply: 'we_buy' | 'customer' | null;
  supply: 'we_buy' | 'customer';
  weightKgEach: number | null;
  weightT: number | null;
}

export interface TermTemplate {
  id: number;
  kind: 'charges' | 'milestones' | 'stages';
  name: string;
  isDefault: boolean;
  rows: Partial<Terms>;
  notes: string | null;
  updatedAt?: string;
}

export interface AcceptanceView {
  order: {
    id: number; code: string; status: string; orderType: 'customer' | 'stock'; title: string | null;
    customer: { id: number; code: string | null; name: string | null } | null;
    committedDate: string | null; materialSupply: 'we_buy' | 'customer'; confirmedAt: string | null;
    lines: AcceptanceLine[];
  };
  state: 'none' | 'pending' | 'approved' | 'rejected' | 'withdrawn';
  locked: boolean;
  editable: boolean;
  editReason: string | null;
  saveMeans: string | null;
  supplyEditable: boolean;
  terms: Terms;
  fromTemplates: boolean;
  estimate: Estimate;
  approved: AcceptanceVersion | null;
  pending: AcceptanceVersion | null;
  sentBack: AcceptanceVersion | null;
  versions: AcceptanceVersion[];
  confirmProblems: string[];
  mrs: { id: number; code: string; lineNo: number; supply: 'we_buy' | 'customer'; held: boolean }[];
  mrNote: string;
  postStages: PostStage[];
  lists: {
    operations: { id: number; code: string; name: string }[];
    formulaFields: { code: string; name: string; dataType: 'number'; unit: string | null }[];
    triggers: { key: TriggerType; label: string; proRata: boolean; needs: string[] }[];
    afterTriggers: TriggerType[];
    dispatchModes: Record<'each' | 'all', string>;
    billing: Record<ChargeBilling, string>;
    weightSources: Record<WeightSource, string>;
    scrapBases?: Record<ScrapOf, string>;
  };
  templates: TermTemplate[];
  /** ONE order value (2026-10-18): what the order header shows — and the estimate from the line rates. */
  orderValue?: OrderValue | null;
}

export interface AcceptanceDryRun { dryRun: true; terms: Terms; estimate: Estimate; problems: string[]; changes: string[] }

export interface OrderEvent { id: number; type: string; label: string | null; date: string; quantity: number | null; uom: string | null; note: string | null; recordedBy: { id: number; name: string | null } | null }

export const getAcceptance = (orderId: number) => cfApi.get<AcceptanceView>(`/orders/${orderId}/acceptance`);
export const checkAcceptance = (orderId: number, terms: Terms) => cfApi.put<AcceptanceDryRun>(`/orders/${orderId}/acceptance`, { ...terms, dryRun: true });
export const saveAcceptance = (orderId: number, terms: Terms, note?: string) => cfApi.put<AcceptanceView>(`/orders/${orderId}/acceptance`, { ...terms, ...(note ? { note } : {}) });
export const withdrawAcceptance = (orderId: number) => cfApi.post<AcceptanceView>(`/orders/${orderId}/acceptance/withdraw`, {});
export const orderEvents = (orderId: number) => cfApi.get<OrderEvent[]>(`/orders/${orderId}/events`);
export const mrDocument = (orderId: number, format: 'pdf' | 'xlsx') => cfApi.getBlob(`/orders/${orderId}/mr-document${qs({ format })}`);

export const listTemplates = (kind?: TermTemplate['kind'], lists = false) => cfApi.get<{ rows: TermTemplate[]; starter: Record<TermTemplate['kind'], Partial<Terms>>; lists?: AcceptanceView['lists'] }>(`/term-templates${qs({ kind, lists: lists ? 1 : undefined })}`);
export const createTemplate = (body: { kind: TermTemplate['kind']; name: string; isDefault?: boolean; rows: Partial<Terms>; notes?: string | null }) => cfApi.post<TermTemplate>('/term-templates', body);
export const updateTemplate = (id: number, body: { name?: string; isDefault?: boolean; rows?: Partial<Terms>; notes?: string | null }) => cfApi.put<TermTemplate>(`/term-templates/${id}`, body);
export const deleteTemplate = (id: number) => cfApi.del<{ ok: true }>(`/term-templates/${id}`);

// ── the Orders board ──

export type BoardLaneKey = 'inquiry' | 'pending_approval' | 'material' | 'in_production' | 'dispatched' | 'post_production' | 'closed';
export interface BoardCard {
  id: number;
  code: string;
  title: string | null;
  customer: string | null;
  status: string;
  lane: BoardLaneKey;
  committedDate: string | null;
  overdue: boolean;
  /** ONE order value (2026-10-18): accepted terms, else the estimate from the line rates. */
  value?: OrderValue | null;
  facts: {
    lines: number; released: number; dispatched: string; material: string; materialInPlace: boolean;
    acceptance: { status: string; version?: number; note?: string | null } | null;
    rateChangePending: boolean;
    /** §74: the money of an order with accepted terms — it closes only when fully paid. */
    payment?: { fullyPaid: boolean; outstanding: number; due: number; upcoming: number; received: number; text: string } | null;
  };
  stages: PostStage[];
  stagesDone: number;
  canClose: boolean;
}
export interface OrderBoard { lanes: { key: BoardLaneKey; label: string; cards: BoardCard[] }[]; today: string }

export const getOrderBoard = (search?: string) => cfApi.get<OrderBoard>(`/order-board${qs({ search })}`);
export const markStageDone = (stageId: number, body: { date?: string; note?: string }) => cfApi.post<{ stage: PostStage; orderClosed: boolean }>(`/order-post-stages/${stageId}/done`, body);
export const undoStageDone = (stageId: number, note?: string) => cfApi.post<{ stage: PostStage }>(`/order-post-stages/${stageId}/undo`, { note });
