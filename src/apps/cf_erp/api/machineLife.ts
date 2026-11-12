import { cfApi, qs } from './client';

/**
 * THE MACHINE LIFECYCLE (backend init.sql §104, routes/machineLife.js, services/machineLifeService.js; user 2026-11-12).
 * Received → Setup (a setup ticket for Maintenance) → Live (depreciation from that day) → Condemn asked (the MD) →
 * Condemned (then its disposal). Machines and durable tools alike. Stores checks them out and in; Stores or Maintenance
 * moves them between areas. An order pays the days a machine worked on it (shared by run hours).
 */

export type MachineStage = 'setup' | 'live' | 'condemn_requested' | 'condemned';
export type MachineKind = 'machine' | 'tool';
export type CheckoutKind = 'user' | 'employee' | 'contractor' | 'order' | 'area';
export const STAGE_LABEL: Record<MachineStage, string> = { setup: 'Setup', live: 'Live', condemn_requested: 'Condemn asked', condemned: 'Condemned' };
export const STAGE_FAMILY: Record<MachineStage, 'info' | 'success' | 'warning' | 'neutral'> = { setup: 'info', live: 'success', condemn_requested: 'warning', condemned: 'neutral' };
export const CHECKOUT_KINDS: { value: CheckoutKind; label: string; person: boolean }[] = [
  { value: 'user', label: 'A person', person: true },
  { value: 'employee', label: 'An employee', person: true },
  { value: 'contractor', label: 'A contractor', person: false },
  { value: 'order', label: 'An order', person: false },
  { value: 'area', label: 'An area', person: false },
];

export interface AreaRef { id: number; code: string; name: string; purpose?: string }
export interface Custodian { kind: CheckoutKind; kindLabel: string; id: number; code: string | null; name: string | null }
export interface Checkout {
  id: number; machineId: number; to: Custodian; takenBy: string | null; outAt: string; dueOn: string | null; overdue: boolean; note: string | null;
  inAt: string | null; inNote: string | null;
}
export interface SetupItem { itemId: number; code: string; name: string; qty: number; uom: string | null; value: number | null; tickets: string[]; treatment: 'capital' | 'expense'; defaultTreatment: 'capital' | 'expense' }
export interface Depreciation { base: number; salvage: number; lifeYears: number; perDay: number; perYear: number; accumulated: number; bookValue: number; endsOn: string }
export interface MachineUse { orders: { id: number; code: string | null; title: string | null; days: number; amount: number }[]; usedDays: number; idleDays: number; charged: number; unrecovered: number }

export interface MachineLife {
  id: number; code: string; name: string; kind: MachineKind; stage: MachineStage; stageLabel: string; today: string;
  area: AreaRef | null; checkout: Checkout | null; receivedOn: string | null; liveOn: string | null; condemnedOn: string | null;
  setupTicket: { id: number; code: string; status: string; title: string } | null;
  setupTickets: { id: number; code: string; status: string }[];
  condemn: { approvalId: number; status: string; note: string | null; askedAt: string } | null;
  disposal: { kind: 'scrapped' | 'sold'; on: string; amount: number; note: string | null; writtenOff: number | null } | null;
  cost: {
    cost: number | null; salvageValue: number | null; lifeYears: number | null; setupCapital: number; setupExpense: number;
    setupItems: SetupItem[]; depreciation: Depreciation | null; use: MachineUse | null;
  };
  lastMaintenance: string | null; maintenanceCost: number;
}

export interface LogRow {
  at: string; kind: 'event' | 'maintenance' | 'work'; event: string; label: string; by?: string | null; area?: string | null; fromArea?: string | null;
  ref?: string | null; refId?: number; note?: string | null; status?: string; doneAt?: string | null; hours?: number; day?: string;
}

export interface ToRegister {
  billLineId: number; billId: number; grnDate: string | null; purchaseOrder: string | null; supplier: string | null;
  item: { id: number; code: string; name: string }; kind: MachineKind; quantity: number; registered: number; left: number; unitCost: number | null; area: AreaRef | null;
}
export interface CheckoutRow extends Checkout { machine: { id: number; code: string; name: string; kind: MachineKind } }
export interface CustodianOption { id: number; code: string | null; name: string; sub: string | null }

export const getMachineLife = (id: number) => cfApi.get<MachineLife>(`/machines/${id}/life`);
export const getMachineLog = (id: number) => cfApi.get<{ rows: LogRow[] }>(`/machines/${id}/log`);
export const moveMachine = (id: number, areaId: number, note?: string) => cfApi.post<MachineLife>(`/machines/${id}/move`, { areaId, note });
export const raiseSetupTicket = (id: number) => cfApi.post<MachineLife>(`/machines/${id}/setup-ticket`, {});
export const checkOut = (id: number, body: { toKind: CheckoutKind; toId: number; takenBy?: string; dueOn?: string | null; note?: string }) => cfApi.post<MachineLife>(`/machines/${id}/check-out`, body);
export const checkIn = (id: number, body: { areaId?: number | null; note?: string }) => cfApi.post<MachineLife>(`/machines/${id}/check-in`, body);
export const askCondemn = (id: number, reason: string) => cfApi.post<MachineLife>(`/machines/${id}/condemn`, { reason });
export const recordDisposal = (id: number, body: { disposal: 'scrapped' | 'sold'; on: string; amount?: number | null; note?: string }) => cfApi.post<MachineLife>(`/machines/${id}/disposal`, body);
export const setMachineCost = (id: number, body: { cost?: number | null; salvageValue?: number | null; lifeYears?: number | null; liveOn?: string }) => cfApi.put<MachineLife>(`/machines/${id}/cost`, body);
export const setSetupTreatment = (id: number, itemId: number, treatment: 'capital' | 'expense') => cfApi.put<MachineLife>(`/machines/${id}/setup-items/${itemId}`, { treatment });
export const listToRegister = (billId?: number | null) => cfApi.get<ToRegister[]>(`/machines-to-register${qs({ billId: billId ?? undefined })}`);
export const registerReceived = (body: { billLineId: number; needsSetup?: boolean; lifeYears?: number | null; salvageValue?: number | null; units: { name?: string; code?: string; classificationId?: number | null; serialNumber?: string; notes?: string }[] }) =>
  cfApi.post<{ machines: { id: number; code: string; name: string }[]; stage: MachineStage; left: number }>('/machines-to-register', body);
export const listCheckouts = (q: { open?: boolean; search?: string; machineId?: number } = {}) =>
  cfApi.get<{ rows: CheckoutRow[]; today: string }>(`/machine-checkouts${qs({ open: q.open === false ? '0' : '1', search: q.search || undefined, machineId: q.machineId })}`);
export const listCustodians = (kind: CheckoutKind, search: string) => cfApi.get<CustodianOption[]>(`/machine-custodians${qs({ kind, search: search || undefined })}`);
