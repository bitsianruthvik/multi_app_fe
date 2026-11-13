import { cfApi, qs } from './client';

/**
 * PLANNING (backend init.sql §105, routes/planning.js; user 2026-11-13): the month plan (optimised for the most tonnes
 * of finished shipping units, frozen by the MD), the week plan re-made from each week's reality, the daily roster for
 * production, the alerts when something the plan assumed changes, and the review of past months.
 */

export interface PlanWeek { no: number; start: string; end: string; tonnes?: number; units?: number }
export interface PlanUnitStep { fn: string; fnName: string; from: string; to: string; minutes: number; byDay: Record<string, number> }
export interface PlanUnit {
  key: string; orderId: number; order: string | null; code: string; name: string | null; tonnes: number; start: string | null; finish: string | null; inMonth: boolean; week: number | null;
  reason: { kind: 'material' | 'capacity' | 'work' | 'horizon'; fn: string | null; fnName: string | null; days?: number } | null;
  materialDate: string | null; materialAssumed: boolean; productionOrders: string[]; steps: PlanUnitStep[];
}
export interface PlanOrder {
  id: number; code: string; customer: string | null; committedDate: string | null; rank: number; productionOrders: string[]; tonnes: number; units: number; doneUnits: number;
  tonnesInMonth: number; unitsInMonth: number; finish: string | null; priorityFinish: string | null; late: boolean; byWeek: number[];
}
export interface PlanLoad { fn: string; name: string; area: string | null; machines: number; hours: number; capacityHours: number; usedPct: number; byWeek: { hours: number; capacityHours: number }[] }
export interface Pivot { fns: { fn: string; name: string }[]; rows: { orderId: number; code: string; customer?: string | null; rank?: number; tonnes: number; units?: number; hours: Record<string, number> }[] }
export interface MachineOption { key: string; label: string; machineIds: number[]; tonnes: number; gain: number; best?: boolean }
export interface MonthResult {
  month: string; from: string; last: string; today: string; tonnes: number; priorityTonnes: number; boundTonnes: number; boundBy: string | null; gapPct: number;
  doneTonnes: number; doneUnits: number; totalTonnes: number; totalUnits: number; notInMonth: number; assumedMaterial: number; feasible: boolean;
  weeks: Required<PlanWeek>[]; orders: PlanOrder[]; units: PlanUnit[]; load: PlanLoad[]; pivot: Pivot;
  suggestions?: { options: MachineOption[]; noSpare: string[] };
}
export interface PlanHead { id: number; month: string; version: number; status: 'draft' | 'pending' | 'frozen' | 'superseded' | 'rejected'; toleranceDays: number; tonnes: number | null; boundTonnes: number | null; note: string | null; approvalId: number | null; runAt: string | null; sentAt: string | null; frozenAt: string | null }
export interface AreaMachines {
  area: string; total: number; inPlan: number; on: number;
  machines: { id: number; code: string; name: string; typeId: string; typeName: string; on: boolean; stage: string; inPlan: boolean; hours: number; contractor: { id: number; name: string } | null }[];
}
export interface MonthScreen {
  month: string; today: string; weeks: PlanWeek[]; plan: PlanHead | null; frozen: PlanHead | null; frozenTonnes: number | null; versions: PlanHead[];
  inputs: { machineIds: number[]; ranks: number[]; toleranceDays: number }; result: MonthResult; areas: AreaMachines[]; canEdit: boolean; fresh: boolean;
}
export interface MonthRun { saved: boolean; planId: number | null; inputs: { machineIds: number[]; ranks: number[]; toleranceDays: number }; result: MonthResult; areas: AreaMachines[] }

export interface WorkOrderStanding { id: number; code: string; status: string; contractor: { id: number; name: string }; productionOrder: { id: number; code: string } | null; start: string | null; due: string | null; tonnes: number; paid: number; paidInRange: number; expected: number | null; behind: number; overdue: boolean }
export interface ContractorStanding { id: number; name: string; workOrders: number; tonnes: number; paid: number; paidInRange: number; behind: number; overdue: number; donePct: number | null; machines: { id: number; code: string; name: string }[] }
export interface Contractors { orders: WorkOrderStanding[]; contractors: ContractorStanding[]; machinesOut: { id: number; code: string; name: string; contractor: { id: number; name: string } }[] }
export interface ConsumableNeed { itemId: number; code: string | null; name: string | null; uom: string | null; need: number; needBy: string | null; inStock: number; onOrder: number; onOrderDue: string | null; short: number }
export interface Reason { kind: string; unit: string | null; order: string | null; tonnes: number | null; progress?: number | null; cause: string }

export interface WeekResult {
  week: PlanWeek & { month: string }; month: string; from: string; tonnesWeek: number; doneTonnes: number; planTonnes: number; tonnesMonth: number; frozenTonnes: number | null;
  against: { frozenTonnes: number; out: { key: string; order: string | null; code: string; tonnes: number; was: string | null; now: string | null }[]; into: { key: string; order: string | null; code: string; tonnes: number; was: string | null; now: string | null }[]; outTonnes: number; inTonnes: number } | null;
  finishing: { key: string; order: string | null; orderId: number; code: string; name: string | null; tonnes: number; finish: string }[];
  pivot: Pivot; load: { fn: string; name: string; hours: number; byDay: Record<string, number> }[]; orders: PlanOrder[]; units: PlanUnit[];
  suggestions?: { options: MachineOption[]; noSpare: string[] }; contractors: Contractors; consumables: ConsumableNeed[]; assumedMaterial: number;
}
export interface WeekActual {
  week: PlanWeek; asOf: string; plannedTonnes: number; doneTonnes: number; donePlannedTonnes: number; extraTonnes: number;
  units: { key: string; order: string | null; code: string; tonnes: number; finish: string; done: boolean; gone: boolean; progress: number | null; materialDate: string | null }[];
  extra: { key: string; code: string; order: string | null; tonnes: number; plannedFinish: string | null }[];
  load: { fn: string; name: string; plannedHours: number; runHours: number; stopHours: number }[];
  stops: { machineId: number; code: string; fn: string; hours: number; reason: string | null }[];
  contractors: ContractorStanding[]; workOrders: WorkOrderStanding[]; right: Reason[]; wrong: Reason[];
}
export interface WeekListItem extends PlanWeek { id: number | null; status: 'draft' | 'published' | 'closed' | null; tonnesWeek: number | null; doneTonnes: number | null; current: boolean; past: boolean }
export interface WeekScreen {
  today: string; week: PlanWeek & { month: string }; weeks: WeekListItem[]; frozen: { id: number; tonnes: number; version: number } | null; frozenWeekTonnes: number | null;
  plan: { id: number; weekStart: string; weekEnd: string; status: 'draft' | 'published' | 'closed'; tonnesWeek: number | null; tonnesMonth: number | null; note: string | null; runAt: string | null; publishedAt: string | null; closedAt: string | null; inputs: { machineIds: number[]; asOf: string } | null; result: WeekResult; review: { right: Reason[]; wrong: Reason[]; notes: string | null } | null } | null;
  actual: WeekActual | null;
}

export interface RosterTask { id: string; unitKey: string | null; unit: string; order: string | null; orderId: number | null; fn: string | null; fnName: string | null; minutes: number; machineId: number | null; tonnes: number | null; finish: string | null; source: 'auto' | 'manual'; note: string | null; done: boolean }
export interface RosterMachine { id: number; code: string; name: string; typeId: string; typeName: string; area: string; minutes: number; contractor: { id: number; name: string } | null }
export interface DayScreen { today: string; day: string; status: 'draft' | 'published' | null; publishedAt: string | null; note: string | null; tasks: RosterTask[]; machines: RosterMachine[]; saved: boolean; suggestion: boolean }
export interface PublishedRoster { today: string; day: string; published: boolean; publishedAt: string | null; note: string | null; tasks: RosterTask[]; machines: RosterMachine[] }

export interface PlanAlert { id: number; kind: string; severity: 'info' | 'warning' | 'danger'; title: string; detail: string | null; subject: { type: string; id: number } | null; link: string | null; impactTonnes: number | null; impact: { itemId?: number; qty?: number; needBy?: string } | null; status: 'open' | 'dismissed' | 'resolved'; at: string | null }
export interface PlanningHome {
  today: string; month: string;
  monthPlan: { id: number; status: 'frozen'; version: number; tonnes: number; boundTonnes: number | null; weeks: Required<PlanWeek>[] } | null;
  working: { id: number; status: 'draft' | 'pending'; version: number; tonnes: number } | null;
  week: { week: PlanWeek & { month: string }; weeks: WeekListItem[]; plan: { id: number; status: string; tonnesWeek: number | null; tonnesMonth: number | null } | null; actual: { plannedTonnes: number; doneTonnes: number } | null };
  doneTonnes: number; forecastTonnes: number | null; tomorrow: { date: string; status: 'draft' | 'published' | null }; alerts: PlanAlert[]; alertSource: string | null;
}
export interface ReviewWeek extends PlanWeek { status: string | null; id: number | null; current: boolean; past: boolean; frozenTonnes: number | null; plannedTonnes: number | null; doneTonnes: number | null; forecastMonth: number | null; right: Reason[]; wrong: Reason[]; notes: string | null; load: { fn: string; name: string; plannedHours: number; runHours: number; stopHours: number }[] }
export interface Review {
  month: string; today: string; frozen: { id: number; version: number; tonnes: number; boundTonnes: number | null; frozenAt: string | null; priorityTonnes: number | null; orders: PlanOrder[] } | null;
  doneTonnes: number; forecastTonnes: number | null; weeks: ReviewWeek[]; causes: { kind: string; count: number; tonnes: number; examples: string[] }[];
  contractors: ContractorStanding[]; workOrders: WorkOrderStanding[]; notTaken: MachineOption[];
}

export const getPlanningHome = () => cfApi.get<PlanningHome>('/planning');
export const getMonthPlan = (month?: string) => cfApi.get<MonthScreen>(`/planning/month${qs({ month })}`);
export const runMonthPlan = (body: { month: string; machineIds?: number[]; ranks?: number[]; toleranceDays?: number; save?: boolean; note?: string }) => cfApi.post<MonthRun>('/planning/month/run', body);
export const sendMonthPlan = (id: number, note?: string) => cfApi.post<MonthScreen>(`/planning/month/${id}/send`, { note });
export const withdrawMonthPlan = (id: number) => cfApi.post<MonthScreen>(`/planning/month/${id}/withdraw`, {});
export const listPlanMonths = () => cfApi.get<{ months: { month: string; frozen: PlanHead | null; versions: PlanHead[] }[] }>('/planning/months');
export const getWeekPlan = (q: { week?: string; id?: number } = {}) => cfApi.get<WeekScreen>(`/planning/week${qs(q)}`);
export const runWeekPlan = (body: { weekStart?: string; note?: string } = {}) => cfApi.post<WeekScreen>('/planning/week/run', body);
export const publishWeekPlan = (id: number) => cfApi.post<WeekScreen>(`/planning/week/${id}/publish`, {});
export const closeWeekPlan = (id: number, notes?: string) => cfApi.post<WeekScreen>(`/planning/week/${id}/close`, { notes });
export const setWeekNotes = (id: number, notes: string) => cfApi.put<WeekScreen>(`/planning/week/${id}/notes`, { notes });
export const getDayRoster = (date?: string, fresh = false) => cfApi.get<DayScreen>(`/planning/day${qs({ date, fresh: fresh ? '1' : undefined })}`);
export const saveDayRoster = (body: { date: string; tasks: RosterTask[]; machines?: RosterMachine[]; note?: string | null; publish?: boolean }) => cfApi.put<DayScreen>('/planning/day', body);
export const getPublishedRoster = (date?: string) => cfApi.get<PublishedRoster>(`/planning/roster${qs({ date })}`);
export const getPlanAlerts = (all = false) => cfApi.get<{ alerts: PlanAlert[]; source: string | null }>(`/planning/alerts${qs({ all: all ? '1' : undefined })}`);
export const dismissPlanAlert = (id: number) => cfApi.post<{ ok: boolean }>(`/planning/alerts/${id}/dismiss`, {});
export const getPlanReview = (month?: string) => cfApi.get<Review>(`/planning/review${qs({ month })}`);
export const getPlanContractors = () => cfApi.get<Contractors>('/planning/contractors');
export const raiseConsumableMr = (body: { month: string; items: { itemId: number; qty: number; needBy: string | null }[] }) => cfApi.post<{ requisition: { id: number; code: string }; needBy: string | null }>('/planning/consumables/mr', body);

export const tonnesText = (t: number | null | undefined) => (t == null ? '—' : `${(Math.round(t * 10) / 10).toLocaleString('en-IN')} t`);
export const dayText = (s: string | null | undefined) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—');
export const monthText = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
export const hoursText = (min: number) => `${Math.round((min / 60) * 10) / 10} h`;
