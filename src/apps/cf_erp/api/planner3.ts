import { cfApi, LONG_WRITE_MS, qs } from './client';

/**
 * PRODUCTION › PLANNER — STEP 5 (backend init.sql §84, routes/planner3.js, services/plannerV3Service.js; contract
 * TM/CF_ERP_ORDER_FLOW_PLAN.md "2026-10-18 — Step 5: the planner"). The plan per production order at step level, worked
 * out on the server on every read; days on screen, minutes in the engine.
 */
export type PlanMode = 'auto' | 'manual';
export type ReasonKind = 'material' | 'capacity' | 'down' | 'start' | 'no_capacity' | 'horizon' | 'predecessor' | 'other';
export type PoPlanState = 'not_released' | 'planned' | 'in_production' | 'finished';

export interface SlowedBy { kind: ReasonKind; text: string; days: number }
export interface PlanOrder {
  id: number; code: string; label: string; orderId: number; orderCode: string;
  status: 'yet_to_plan' | 'planned' | 'closed'; released: boolean; state: PoPlanState;
  rank: number; manual: { earliestStart: string | null; rank: number | null; pinned: boolean };
  committedDate: string | null; money: number; minutesLeft: number;
  steps: number; stepsDone: number; unplanned: number; noRate: number;
  start: string | null; end: string | null; late: boolean;
  baseline: { start: string | null; end: string | null } | null; slipDays: number | null;
  slowedBy: SlowedBy[]; waitingFor: string | null;
}
export interface PlanType {
  key: string; name: string; unlimited: boolean;
  machines: { id: number; code: string; name: string; hasShifts: boolean; down: boolean }[];
  capacity: number[]; load: number[]; byPo: Record<string, number>[];
}
export interface PlanStep {
  id: number; productionOrderId: number; label: string; operation: string; typeKey: string; machineId: number | null;
  state: 'pending' | 'in_progress' | 'done' | 'on_hold'; minutes: number; planned: number; noRate: boolean;
  start: string | null; end: string | null; real: boolean; binding: string | null; why: string | null;
}
export interface Health {
  compared: number; onTime: number; late: number; onTimePct: number | null; slipDays: number;
  byReason: { kind: ReasonKind; label: string; orders: number; days: number }[];
  worst: { id: number; code: string; label: string; slipDays: number | null; reason: string | null }[];
}
export interface Plan3 {
  today: string; now: string; mode: PlanMode; storedMode: PlanMode; madeBy: 'AI' | 'Management';
  days: string[]; horizonDays: number; passes: number;
  productionOrders: PlanOrder[]; machineTypes: PlanType[]; steps?: PlanStep[];
  baseline: { id: number; version: number; savedAt: string; approvedAt: string | null } | null;
  pendingRebaseline: { id: number; version: number; askedAt: string; note: string | null; approvalId: number | null } | null;
  saved: { at: string; mode: PlanMode | null } | null;
  health: Health | null;
  counts: { productionOrders: number; steps: number; unplanned: number; late: number };
}
export interface PlanHealth extends Health {
  baseline: { id: number; version: number; savedAt: string; approvedAt: string | null } | null;
  savedAt: string | null;
}
export interface OrderInput { id: number; earliestStart?: string | null; rank?: number | null; pinned?: boolean }

export const getPlan3 = (q: { mode?: PlanMode; steps?: boolean; po?: number } = {}) =>
  cfApi.get<Plan3>(`/planner3${qs({ mode: q.mode, steps: q.steps ? 1 : undefined, po: q.po })}`, { timeoutMs: LONG_WRITE_MS });
export const getPlanHealth = () => cfApi.get<PlanHealth>('/planner3/health');
export const putPlanMode = (mode: PlanMode) => cfApi.put<{ mode: PlanMode }>('/planner3/settings', { mode });
export const putOrderInputs = (rows: OrderInput[]) => cfApi.put<{ saved: number }>('/planner3/orders', { rows });
export const savePlan = (mode?: PlanMode) =>
  cfApi.post<{ saved: { at: string; mode: PlanMode; madeBy: string; steps: number; productionOrders: number }; baseline: { id: number; version: number; first: boolean } | null; late: number; unplanned: number }>(
    '/planner3/run', { mode }, { timeoutMs: LONG_WRITE_MS });
export const askRebaseline = (note: string) => cfApi.post<{ baseline: { id: number; version: number; status: string }; approvalId: number }>('/planner3/rebaseline', { note });
