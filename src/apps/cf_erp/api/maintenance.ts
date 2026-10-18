import { cfApi, qs } from './client';

/**
 * MAINTENANCE (backend init.sql §82, routes/maintenance.js; contract TM/CF_ERP_ORDER_FLOW_PLAN.md
 * "2026-10-18 — Maintenance (S6)"): the machines board, raise a fault, maintenance orders (MO), preventive plans,
 * planned downtime written into the machine calendar.
 */
export const MAINTENANCE = 'cf_erp_maintenance';

export type MoStatus = 'open' | 'in_progress' | 'waiting_parts' | 'done' | 'cancelled';
export type MoSource = 'fault' | 'preventive' | 'manual';
export type BoardStatus = 'down' | 'planned' | 'stopped' | 'running' | 'idle';

export interface StopReason { id: number; code: string; label: string; sortOrder: number; needsNote: boolean; status: string }
export interface Occurrence { start: string; end: string; minutes: number }
export interface PlannedWindow extends Occurrence { ruleId: number; machineId: number; machineCode?: string; reason: string; now: boolean }

export interface BoardMachine {
  id: number; code: string; name: string; type: string | null; status: BoardStatus;
  since: string | null; stopReason: string | null; downMinutes: number | null;
  fault: { id: number; code: string; status: MoStatus; title: string } | null;
  plannedNow: PlannedWindow | null; nextPlanned: PlannedWindow | null;
  openOrders: { id: number; code: string; status: MoStatus; source: MoSource; title: string }[];
  jobsRunning: number;
}
export interface Board {
  now: string; today: string;
  counts: { machines: number; down: number; planned: number; stopped: number; running: number; idle: number; openOrders: number };
  machines: BoardMachine[]; planned: PlannedWindow[]; reasons: StopReason[];
}

export interface MaintenanceOrder {
  id: number; code: string; status: MoStatus; statusLabel: string; source: MoSource;
  machine: { id: number; code: string; name: string };
  title: string; note: string | null; reason: string | null; plan: { id: number; title: string } | null;
  raisedAt: string; raisedBy: string | null; startedAt: string | null; doneAt: string | null; cancelledAt: string | null;
  falseAlarm: boolean; workDone: string | null;
  stop: { id: number; startedAt: string | null; endedAt: string | null; open: boolean } | null;
  machineDown: boolean; downtimeMinutes: number | null;
  partsCost: number | null; otherCost: number; costNote: string | null; cost: number | null;
  requisitions: { id: number; code: string }[];
  canFalseAlarm: boolean; next: MoStatus[];
  events?: { id: number; event: string; from: string | null; to: string | null; note: string | null; by: string | null; at: string }[];
  now?: string;
}

export interface Plan {
  id: number; machine: { id: number; code: string; name: string }; title: string; status: 'active' | 'inactive'; notes: string | null;
  everyDays: number | null; everyRunHours: number | null; everyTonnes: number | null;
  baselineAt: string; since: { days: number; runHours: number; tonnes: number }; nextDueOn: string | null;
  progressPct: number; due: boolean; openOrder: { id: number; code: string } | null;
}
export interface PlanInput { machineId?: number; title: string; everyDays?: number | null; everyRunHours?: number | null; everyTonnes?: number | null; status?: string; notes?: string | null; lastDoneOn?: string | null }

export type DowntimeKind = 'once' | 'weekly' | 'monthly';
export interface DowntimeRule {
  id: number; machineId: number; machineCode?: string; machineName?: string; kind: DowntimeKind; reason: string;
  startsOn: string; endsOn: string | null; startTime: string; durationMinutes: number; weekdays: string[]; everyN: number;
  monthDay: number | null; monthWeek: number | null; monthWeekday: string | null; expandedTo: string | null; notes: string | null;
  text: string; next?: Occurrence[];
}
export interface DowntimeInput {
  machineId: number; kind: DowntimeKind; reason: string; startsOn: string; endsOn?: string | null; startTime: string; durationMinutes: number;
  weekdays?: string[]; everyN?: number; monthDay?: number | null; monthWeek?: number | null; monthWeekday?: string | null; notes?: string | null;
}

export interface Summary {
  weekFrom: string; now: string; faultHours: number; maintenanceHours: number; plannedHours: number; downtimeHours: number;
  cost: number; doneThisWeek: number; openOrders: number; machinesDown: number;
}
export interface MrLine { itemId: number; code: string | null; name: string | null; kind: string | null; qty: number; uom: string | null }

export const getBoard = () => cfApi.get<Board>('/maintenance/board');
export const getSummary = () => cfApi.get<Summary>('/maintenance/summary');
export const raiseFault = (body: { machineId: number; reasonId?: number | null; note?: string | null; operatorId?: number | null }) =>
  cfApi.post<{ order: { id: number; code: string }; stopId: number; message: string }>('/maintenance/faults', body);

export const listOrders = (q: { status?: string; machineId?: number; search?: string } = {}) =>
  cfApi.get<{ now: string; rows: MaintenanceOrder[] }>(`/maintenance/orders${qs(q)}`);
export const getOrder = (id: number) => cfApi.get<MaintenanceOrder>(`/maintenance/orders/${id}`);
export const createOrder = (body: { machineId: number; title: string; note?: string | null }) => cfApi.post<{ order: { id: number; code: string } }>('/maintenance/orders', body);
export const setOrderStatus = (id: number, body: { status: MoStatus; note?: string | null; stopMachine?: boolean }) => cfApi.post<MaintenanceOrder>(`/maintenance/orders/${id}/status`, body);
export const falseAlarm = (id: number, note?: string | null) => cfApi.post<{ order: MaintenanceOrder; message: string }>(`/maintenance/orders/${id}/false-alarm`, { note });
export const cancelOrder = (id: number, note: string) => cfApi.post<{ order: MaintenanceOrder }>(`/maintenance/orders/${id}/cancel`, { note });
export const closeOrder = (id: number, body: { workDone?: string | null; otherCost?: number | null; costNote?: string | null }) =>
  cfApi.post<{ order: MaintenanceOrder; downtimeMinutes: number | null; message: string }>(`/maintenance/orders/${id}/close`, body);
export const getMrLines = (id: number) => cfApi.get<{ resourcesKnown: boolean; canRaise: boolean; lines: MrLine[] }>(`/maintenance/orders/${id}/mr-lines`);
export const raiseMr = (id: number, body: { lines: { itemId: number; qty: number; uom?: string | null }[]; note?: string | null; orderId?: number | null }) =>
  cfApi.post<{ requisition: { id: number; code: string }; order: MaintenanceOrder; message: string }>(`/maintenance/orders/${id}/requisition`, body);

export const listPlans = (machineId?: number) => cfApi.get<{ now: string; raised: number; rows: Plan[] }>(`/maintenance/plans${qs({ machineId })}`);
export const createPlan = (body: PlanInput) => cfApi.post<{ id: number }>('/maintenance/plans', body);
export const updatePlan = (id: number, body: Partial<PlanInput>) => cfApi.put<{ id: number }>(`/maintenance/plans/${id}`, body);
export const deletePlan = (id: number) => cfApi.del<{ ok: boolean }>(`/maintenance/plans/${id}`);

export const listDowntimes = (machineId?: number) => cfApi.get<{ today: string; rows: DowntimeRule[] }>(`/maintenance/downtime${qs({ machineId })}`);
export const previewDowntime = (body: DowntimeInput) => cfApi.post<{ next: Occurrence[] }>('/maintenance/downtime', { ...body, dryRun: true });
export const createDowntime = (body: DowntimeInput) => cfApi.post<{ id: number; calendarRows: number; next: Occurrence[] }>('/maintenance/downtime', body);
export const updateDowntime = (id: number, body: Partial<DowntimeInput>) => cfApi.put<{ id: number; calendarRows: number; next: Occurrence[] }>(`/maintenance/downtime/${id}`, body);
export const deleteDowntime = (id: number) => cfApi.del<{ ok: boolean }>(`/maintenance/downtime/${id}`);
