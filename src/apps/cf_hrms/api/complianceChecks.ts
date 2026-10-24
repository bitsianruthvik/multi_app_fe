import { api } from './client';
import type { PayFile } from './payroll';

/**
 * Compliance checks, to-dos with a proposed fix, the bonus run — the client side of
 * CF_HRMS_HIRING_SPEC.md §36.2–36.3 (backend `routes/complianceChecks.js`,
 * `services/complianceChecks/*`). A check RESULT names its rule, the rule's source,
 * effective date and verified flag; an unverified rule never blocks (WARN only).
 */

export type Severity = 'HARD' | 'WARN' | 'INFO';

export interface CheckRule {
  id: number | null;
  domain: string | null;
  jurisdiction: string | null;
  ruleKey: string | null;
  title: string | null;
  sourceUrl: string | null;
  effectiveFrom: string | null;
  version: number | null;
  verified: boolean;
}

export interface CheckResult {
  check: string;
  title: string;
  severity: Severity;
  hardIfVerified: boolean;
  unverifiedNote: string | null;
  rule: CheckRule | null;
  message: string;
  numbers: Record<string, unknown>;
  /** The run panel: who accepted a WARN, and why. */
  acknowledged?: { reason: string; by: string | null; at: string } | null;
}

export interface CompliancePreview {
  place: { state?: string; zone?: string | null; skill?: string | null; employment?: string | null; roleId?: number };
  results: CheckResult[];
  summary: { hard: number; warn: number; info: number };
}

export interface RunCompliance {
  runId: number;
  month: string;
  status: string;
  people: { employee: { id: number; code: string; name: string }; salaryId: number | null; structureId: number | null; place: { state: string; zone: string | null; skill: string | null }; results: CheckResult[] }[];
  counts: { hard: number; warn: number; warnOpen: number; info: number; people: number };
  canLock: boolean;
}

export type TodoStatus = 'OPEN' | 'CHOSEN' | 'APPLIED' | 'RESOLVED' | 'DISMISSED';

export interface Todo {
  id: number;
  key: string;
  check: string;
  checkName: string;
  severity: Severity;
  status: TodoStatus;
  title: string;
  message: string | null;
  rule: CheckRule | null;
  hardIfVerified: boolean;
  unverifiedNote: string | null;
  effectiveFrom: string | null;
  deadline: string | null;
  overdue: boolean;
  peopleCount: number;
  structuresCount: number;
  remedies: string[];
  chosenOption: string | null;
  chosenNote: string | null;
  chosenBy: { id: number; name: string | null } | null;
  chosenAt: string | null;
  approvedBy: { id: number; name: string | null } | null;
  approvedAt: string | null;
  appliedAt: string | null;
  applied: { salaries?: { employeeId: number; salaryId: number; effectiveFrom: string; arrearsFor: string[] }[]; structures?: { id: number; code: string }[]; components?: { code: string; action: string }[]; skipped?: { employeeId: number; note: string }[] } | null;
  letters: boolean;
  dismissedReason: string | null;
  reminders: number;
  lastCheckedAt: string | null;
  lastTrigger: string | null;
  topUpActive: boolean;
  topUpFrom: string | null;
}

export interface Pay { gross: number; takeHome: number; cost: number; pfEe: number; pfEr: number; esiEe: number; esiEr: number; pt?: number }

export interface FixPerson {
  employeeId: number;
  code: string;
  name: string;
  structureId: number;
  feasible: boolean;
  before: Pay | null;
  after?: Pay | null;
  change?: { takeHome: number; cost: number; gross: number; pfEe: number; pfEr: number; esiEe: number; esiEr: number } | null;
  losesTakeHome?: boolean;
  effectiveFrom?: string;
  note?: string | null;
  detail?: string;
  newCtc?: number;
}

export interface FixOption {
  key: string;
  label: string;
  description: string;
  feasible: boolean;
  infeasible: { employeeId: number; name: string; note: string }[];
  totals: { people: number; feasible: number; losers: number; extraCostMonthly: number; extraCostAnnual: number; takeHomeChangeMonthly: number };
  perStructure: { structureId: number; name: string | null; newStructure: string | null; people: number; losers: number; before: Pay; after: Pay }[];
  perPerson: FixPerson[];
  structures?: { code: string; name: string; basicFormula: string; basicPct: number; fromName: string }[];
  components?: { action: string; code: string; name: string }[];
}

export interface TodoDetail {
  todo: Todo;
  people: { employeeId: number; code: string; name: string; structureName?: string; annualCtc?: number; message: string; place?: { state: string; zone: string | null; skill: string | null } }[];
  structures: { id: number; code: string; name: string; people: number }[];
  policies: { kind: string; id: number; name: string; message: string }[];
  options: FixOption[];
  chosen: FixOption | null;
  can: { choose: boolean; approve: boolean; dismiss: boolean };
}

export interface TodoList {
  todos: Todo[];
  counts: { open: number; hard: number; waitingApproval: number; overdue: number };
}

export interface BonusRun {
  id: number;
  year: string;
  from: string;
  to: string;
  ratePct: number;
  status: 'DRAFT' | 'APPROVED' | 'SCHEDULED';
  allocableSurplus: number | null;
  deadline: string | null;
  late: boolean;
  totals: { people?: number; eligible?: number; amount?: number; calcWageTotal?: number; monthsPaid?: string[]; setOnOff?: { allocableSurplus: number; minBonus: number; maxBonus: number; setOn: number; setOff: number } | null };
  law: { rules?: Record<string, { id: number; version: number; verified: boolean; title: string | null; effectiveFrom: string }>; unverified?: string[] };
  note: string | null;
  preparedBy: { id: number; name: string | null } | null;
  preparedAt: string | null;
  approvedBy: { id: number; name: string | null } | null;
  approvedAt: string | null;
  payRunId: number | null;
  payMonth: string | null;
  paid: boolean;
  payRunStatus: string | null;
}

export interface BonusMonth { month: string; payableDays: number; daysInMonth: number; wage: number; fullWage: number; counted: boolean; ceiling: number; calcWage: number; minimumWage?: number | null }
export interface BonusLine { id: number; employee: { id: number; code: string; name: string }; eligible: boolean; reason: string | null; daysWorked: number; wagesTotal: number; calcWageTotal: number; ceiling: number | null; amount: number; months: BonusMonth[]; itemId: number | null }
export interface BonusDetail {
  run: BonusRun;
  warnings: string[];
  setOnOff: { year: string; kind: 'SET_ON' | 'SET_OFF'; amount: number; carryUntil: string | null }[];
  lines: BonusLine[];
  can: { prepare: boolean; approve: boolean; schedule: boolean; unschedule: boolean };
}

export const complianceChecksApi = {
  runCompliance: (runId: number) => api.get<RunCompliance>(`/payroll/runs/${runId}/compliance`),
  acknowledgeRun: (runId: number, reason: string) => api.post<{ acknowledged: number; panel: RunCompliance }>(`/payroll/runs/${runId}/compliance/acknowledge`, { reason }),

  todoSummary: () => api.get<{ counts: TodoList['counts']; latest: Pick<Todo, 'id' | 'title' | 'severity' | 'status' | 'deadline' | 'overdue' | 'peopleCount'>[] }>('/payroll/compliance-todos/summary'),
  todos: (status: 'open' | 'done' | 'all' = 'open') => api.get<TodoList>(`/payroll/compliance-todos?status=${status}`),
  checkNow: () => api.post<TodoList & { sync: { created: number[]; updated: number[]; resolved: number[]; breaches: number } }>('/payroll/compliance-todos/check-now'),
  todo: (id: number) => api.get<TodoDetail>(`/payroll/compliance-todos/${id}`),
  choose: (id: number, body: { option: string; note?: string | null; letters?: boolean }) => api.post<TodoDetail>(`/payroll/compliance-todos/${id}/choose`, body),
  approve: (id: number, note?: string | null) => api.post<TodoDetail>(`/payroll/compliance-todos/${id}/approve`, { note: note || null }),
  dismiss: (id: number, reason: string) => api.post<TodoDetail>(`/payroll/compliance-todos/${id}/dismiss`, { reason }),

  bonusRuns: () => api.get<{ runs: BonusRun[]; ratePct: number | null }>('/payroll/bonus'),
  prepareBonus: (body: { year: string; ratePct?: number | string | null; allocableSurplus?: number | string | null; note?: string | null }) => api.post<BonusDetail>('/payroll/bonus/prepare', body),
  bonus: (id: number) => api.get<BonusDetail>(`/payroll/bonus/${id}`),
  approveBonus: (id: number) => api.post<BonusDetail>(`/payroll/bonus/${id}/approve`),
  scheduleBonus: (id: number, runId: number) => api.post<BonusDetail>(`/payroll/bonus/${id}/schedule`, { runId }),
  unscheduleBonus: (id: number) => api.post<BonusDetail>(`/payroll/bonus/${id}/unschedule`),
  removeBonus: (id: number) => api.del<{ ok: true }>(`/payroll/bonus/${id}`),
  bonusRegister: (id: number, format: 'xlsx' | 'pdf') => api.get<PayFile>(`/payroll/bonus/${id}/register?format=${format}`),
};

export const SEVERITY_TONE: Record<Severity, 'danger' | 'warning' | 'info'> = { HARD: 'danger', WARN: 'warning', INFO: 'info' };
export const SEVERITY_WORD: Record<Severity, string> = { HARD: 'Breaks the law', WARN: 'Warning', INFO: 'Note' };
