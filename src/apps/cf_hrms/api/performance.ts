import { api } from './client';

/**
 * Performance plans — the client side of CF_HRMS_HIRING_SPEC.md §18.
 *
 * KRAs and KPIs stay on the job (role → position → person). Each period a
 * PLAN is created per person by copying the KRA headings and KPIs of their job
 * as it stood on the period's start; the manager then changes only what
 * differs (a KRA weight, a target, an extra KPI).
 *
 *   DRAFT      freely editable
 *   ACTIVE     the list is locked; a target can still change — from a date, with a reason
 *   CLOSED     the period was closed
 *   CANCELLED  made by mistake; kept
 *
 * Every sentence (a target as words, a refusal, a skip reason) is the server's.
 */

export type Frequency = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';
export type PlanStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'CANCELLED';
export type Direction = 'HIGHER_BETTER' | 'LOWER_BETTER' | 'EXACT' | 'TEXT';
/** "From the job" / "Changed for this period" / "Added for this period". */
export type Mark = 'FROM_JOB' | 'CHANGED' | 'ADDED';
/** How a KPI's slots make one actual (spec §19.1). */
export type CombineRule = 'SUM' | 'AVERAGE' | 'LAST';
/** A status band: on track / at risk / behind / no data. */
export type Band = 'ON_TRACK' | 'AT_RISK' | 'BEHIND' | 'NO_DATA';
export interface Bands { onTrack: number; atRisk: number }
export interface BasedOn { counted: number; total: number }

export interface Option<T extends string = string> { value: T; label: string }

/* ── settings ─────────────────────────────────────────────────────────── */

export interface RatingStep { value: number; label: string }
export interface RoleFrequency {
  id: number; roleCode: string | null; title: string; status: string; positionCount: number;
  /** null = the company default. */ frequency: Frequency | null;
  effectiveFrequency: Frequency;
}
export interface PerformanceSettings {
  yearStartMonth: number; yearStartMonthName: string; defaultFrequency: Frequency; ratingScale: RatingStep[]; saved: boolean;
  /** The achievement a plan needs to be "on track" / "at risk"; below that it is "behind". */
  bands: Bands; bandWords: Record<Band, string>;
  /** Days after a period ends that its FINAL reviews are due (spec §20.1). */ reviewGraceDays: number;
  frequencies: Option<Frequency>[]; roles: RoleFrequency[];
}

/* ── periods ──────────────────────────────────────────────────────────── */

export interface Period {
  /** null until a plan is made for it (periods are made on demand). */ id: number | null;
  frequency: Frequency; name: string; start: string; end: string; status: 'OPEN' | 'CLOSED'; made: boolean; planCount: number;
  /** Holds today. */ current: boolean;
}
export interface PeriodYear {
  year: number; yearLabel: string; years: { value: number; label: string }[]; yearStartMonth: number; defaultFrequency: Frequency;
  frequencies: Option<Frequency>[]; periods: Period[];
}

/* ── making plans ─────────────────────────────────────────────────────── */

export interface PreviewPerson {
  employeeId: number; name: string; employeeCode: string | null;
  positionId: number | null; positionCode: string | null; positionTitle: string | null;
  roleId: number | null; roleTitle: string | null; departmentId: number | null; departmentName: string | null;
  /** The day the job is copied as on: the period start, or a joiner's first day. */ copyOn?: string;
  joinedOn?: string;
  kraCount?: number; kpiCount?: number; noKpis?: boolean;
  /** For skipped people. */ reason?: 'HAS_PLAN' | 'NO_POSITION' | 'OTHER_FREQUENCY'; line?: string; planId?: number; frequency?: Frequency;
}
export interface Preview {
  period: { id: number | null; frequency: Frequency; name: string; start: string; end: string; status: string; made: boolean };
  willGet: PreviewPerson[];
  /** Joined during the period: no plan unless chosen. */ joiners: PreviewPerson[];
  skipped: PreviewPerson[];
  counts: { willGet: number; noKpis: number; joiners: number; hasPlan: number; noPosition: number; otherFrequency: number };
}
export interface CreateResult {
  period: Preview['period']; created: number;
  plans: { id: number; employeeId: number; name: string; kraCount: number; kpiCount: number; noKpis: boolean; copiedOn: string }[];
  kpis?: { total: number; targetsAsNumbers: number; targetsAsWords: number };
  skipped: number; line?: string;
}

/* ── plans ────────────────────────────────────────────────────────────── */

export interface PlanRow {
  id: number; status: PlanStatus;
  period: { id: number; name: string; frequency: Frequency; start: string; end: string; status: string };
  employee: { id: number; name: string; employeeCode: string | null };
  employeeName: string; employeeCode: string | null;
  positionId: number | null; positionCode: string | null; positionTitle: string | null;
  roleId: number | null; roleTitle: string | null; departmentId: number | null; departmentName: string | null;
  frequency: Frequency; copiedOn: string;
  kraCount: number; kpiCount: number; noKpis: boolean;
  weightsOk: boolean; weightTotal: number; weightsSet: boolean;
  activatedAt: string | null; cancelledAt: string | null; cancelReason: string | null;
  /** The plan's score (spec §19.1): null until an actual is in. */
  score: number | null; band: Band; bandLabel: string; basedOn: BasedOn;
  /** "Based on 4 of 6 KPIs." / "No actuals yet." */ scoreLine: string | null;
}
export interface PlanList { items: PlanRow[]; total?: number; count?: number }

/** One actual, as entered. Never overwritten: a correction is a new one (`corrected`, with its `reason`). */
export interface Actual {
  id: number; value: number | null; valueText: string | null; met: 'YES' | 'NO' | null; note: string | null;
  source: 'MANUAL' | 'EXCEL' | 'SYSTEM' | 'FORMULA'; by: string | null; at: string; corrected: boolean; reason: string | null;
}
export interface Slot { start: string; end: string; name: string; open: boolean; actual: Actual | null }
/** A KPI's actuals on the plan page: its slots, the combined actual, the achievement and band. */
export interface KpiActuals {
  combine: CombineRule; combineLabel: string;
  slots: Slot[];
  /** A number, or for words "2 of 3 met" / "YES" / "NO". */ combined: number | string | null;
  /** The target the combined actual is held to (a SUM target taken pro rata). */ combinedTarget: number | null;
  achievement: number | null; band: Band; bandLabel: string; counted: number; slotCount: number;
}
export interface TargetChange { id: number; effectiveFrom: string; reason: string; by: string | null; at: string; from: string; to: string }
export interface PlanKpi {
  id: number; planKraId: number | null; name: string; lineKey: string | null;
  unit: string | null; direction: Direction; targetNumber: number | null; targetText: string | null;
  /** "at least 95%", "at most 30 minutes", or the words. */ target: string;
  /** How often actuals are entered; null = the plan's frequency. */ frequency: string | null;
  weightPercent: number | null;
  combine: CombineRule;
  mark: Mark; markLabel: string;
  /** What the job says (null for one added for this period). `target` is the job's own words ("95%", "Max 30 minutes"). */
  job: { direction: Direction; targetNumber: number | null; targetText: string | null; unit: string | null; weightPercent: number | null; written: string | null; target: string } | null;
  targetChanges: TargetChange[];
  actuals: KpiActuals;
}
export interface PlanKra {
  id: number; name: string; lineKey: string | null; weightPercent: number | null; jobWeightPercent: number | null; mark: Mark; kpis: PlanKpi[];
  score: number | null; band: Band; basedOn: BasedOn;
}
export interface Plan {
  plan: PlanRow & {
    manager: { positionId: number; positionCode: string | null; positionTitle: string | null; name: string | null } | null;
    weights: { anySet: boolean; total: number; ok: boolean; problems: string[] };
    /** What THIS login may do here. */ can: { edit: boolean; activate: boolean; cancel: boolean; changeTarget: boolean; enterActuals: boolean };
    /** Why this plan takes no actuals now (a draft, closed, cancelled), or null. */ actualsLine: string | null;
  };
  kras: PlanKra[];
  ungroupedKpis: PlanKpi[];
  ungroupedScore: { score: number | null; band: Band; basedOn: BasedOn } | null;
  bands: Bands;
  combineRules: Option<CombineRule>[];
  marks: Record<Mark, string>;
  directions: Option<Direction>[];
  entryFrequencies: string[];
}
export interface KpiInput {
  planKraId?: number | null; name?: string; direction?: Direction; targetNumber?: number | null; targetText?: string | null;
  unit?: string | null; frequency?: string | null; weightPercent?: number | null; combine?: CombineRule;
}
export interface TargetChangeInput { direction?: Direction; targetNumber?: number | null; targetText?: string | null; unit?: string | null; effectiveFrom?: string; reason: string }
export interface BulkResult { done: number; doneIds: number[]; refused: { id: number; code: string; message: string; problems: string[] }[] }

export interface EmployeePlans { current: PlanRow[]; past: PlanRow[]; upcoming: PlanRow[]; cancelled: PlanRow[] }
export interface MyPlans {
  linked: boolean; line: string | null; plans: Plan[];
  past: { id: number; period: PlanRow['period']; status: PlanStatus; kraCount: number; kpiCount: number }[];
}

/* ── actuals (spec §19) ───────────────────────────────────────────────── */

export interface ActualRow {
  key: string; planId: number; kpiId: number; slotStart: string; slotEnd: string; slotName: string; slotIndex: number;
  periodId: number; periodName: string; planStatus: PlanStatus;
  employeeId: number; employeeName: string; employeeCode: string | null;
  positionId: number | null; positionCode: string | null; positionTitle: string | null;
  roleId: number | null; roleTitle: string | null; departmentId: number | null; departmentName: string | null; managerPositionId: number | null;
  kraName: string | null; kpiName: string; unit: string | null; direction: Direction;
  targetNumber: number | null; targetText: string | null; target: string;
  actual: Actual | null;
  /** This slot's actual on its own. */ achievement: number | null; band: Band; bandLabel: string;
  canEnter: boolean; /** Why not, when it cannot be entered. */ locked: string | null;
}
export interface ActualsPeriod { id: number; name: string; frequency: Frequency; start: string; end: string; status: 'OPEN' | 'CLOSED'; plans?: number; current?: boolean }
export interface ActualsGrid {
  period: ActualsPeriod | null;
  periods: ActualsPeriod[];
  slots: { key: string; start: string; end: string; name: string; whole: boolean; open: boolean; rows: number }[];
  /** The slot shown: its key ("start|end"), or 'all'. */ slot: string | null;
  rows: ActualRow[];
  total?: number; count?: number;
  counts: { rows?: number; entered?: number; drafts: number };
  managers: { id: number; code: string | null; title: string | null }[];
  roles: { id: number; title: string }[];
  bands: Bands; bandWords: Record<Band, string>;
  line: string | null;
  /** Manager login: how many people are below them. */ people?: number;
}
export interface ActualInput { planId: number; kpiId: number; slotStart: string; value?: number | null; met?: 'YES' | 'NO' | null; note?: string | null; reason?: string }
export interface ActualSaved {
  action: 'ENTERED' | 'CORRECTED' | 'NOTE' | 'UNCHANGED';
  actual: Actual | null; achievement: number | null; band: Band; bandLabel: string;
  kpi: KpiActuals | null;
  plan: { id: number; score: number | null; band: Band; bandLabel: string; basedOn: BasedOn; scoreLine: string | null };
}
export interface ActualHistoryRow extends Actual { slotStart: string; slotEnd: string; live: boolean; replacedAt: string | null; replacedBy: string | null }
export interface ActualHistory { kpi: { id: number; name: string; unit: string | null; direction: Direction }; rows: ActualHistoryRow[] }
export interface ChartBands {
  periods: ActualsPeriod[]; periodId: number | null; bandWords: Record<Band, string>;
  people: { employeeId: number; positionId: number | null; planId: number; periodName: string; score: number | null; band: Band; bandLabel: string; basedOn: BasedOn }[];
}

const q = (params: Record<string, string | number | null | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const t = s.toString();
  return t ? `?${t}` : '';
};

/** HR routes (`/performance/…`). */
export const performanceApi = {
  settings: () => api.get<PerformanceSettings>('/performance/settings'),
  saveSettings: (body: { yearStartMonth?: number; defaultFrequency?: Frequency; ratingScale?: (string | RatingStep)[]; bands?: Bands; reviewGraceDays?: number }) =>
    api.put<PerformanceSettings>('/performance/settings', body),
  setRoleFrequencies: (roleIds: number[], frequency: Frequency | null) =>
    api.put<PerformanceSettings & { changed: number }>('/performance/role-frequencies', { roleIds, frequency }),

  periods: (params: { year?: number; frequency?: Frequency } = {}) => api.get<PeriodYear>(`/performance/periods${q(params)}`),
  closePeriod: (id: number) => api.post<{ period: Period; plansClosed: number }>(`/performance/periods/${id}/close`, {}),

  preview: (frequency: Frequency, start: string) => api.post<Preview>('/performance/plans/preview', { frequency, start }),
  create: (frequency: Frequency, start: string, employeeIds?: number[]) =>
    api.post<CreateResult>('/performance/plans/create', { frequency, start, ...(employeeIds ? { employeeIds } : {}) }),

  /** `search` is the address's own query string (useListFilters), e.g. "?periodId=3&status=DRAFT". */
  list: (search: string) => api.get<PlanList>(`/performance/plans${search && !search.startsWith('?') ? `?${search}` : search}`),
  activateMany: (ids: number[]) => api.post<BulkResult>('/performance/plans/activate', { ids }),
  cancelMany: (ids: number[], reason?: string) => api.post<BulkResult>('/performance/plans/cancel', { ids, reason }),

  plan: (id: number) => api.get<Plan>(`/performance/plans/${id}`),
  activate: (id: number) => api.post<{ ok: true }>(`/performance/plans/${id}/activate`, {}),
  cancel: (id: number, reason?: string) => api.post<{ ok: true }>(`/performance/plans/${id}/cancel`, { reason }),
  setKraWeight: (id: number, kraId: number, weightPercent: number | null) => api.put<{ ok: true }>(`/performance/plans/${id}/kras/${kraId}`, { weightPercent }),
  addKpi: (id: number, body: KpiInput) => api.post<{ ok: true; id: number }>(`/performance/plans/${id}/kpis`, body),
  changeKpi: (id: number, kpiId: number, body: KpiInput) => api.put<{ ok: true; changedFromJob: boolean }>(`/performance/plans/${id}/kpis/${kpiId}`, body),
  removeKpi: (id: number, kpiId: number) => api.del<{ ok: true }>(`/performance/plans/${id}/kpis/${kpiId}`),
  changeTarget: (id: number, kpiId: number, body: TargetChangeInput) => api.post<{ ok: true; effectiveFrom: string }>(`/performance/plans/${id}/kpis/${kpiId}/target`, body),

  employeePlans: (employeeId: number) => api.get<EmployeePlans>(`/performance/employees/${employeeId}/plans`),

  /** `search`: the address's own query string, e.g. "?periodId=3&slot=all&department=7". */
  actuals: (search: string) => api.get<ActualsGrid>(`/performance/actuals${search && !search.startsWith('?') ? `?${search}` : search}`),
  enterActual: (body: ActualInput) => api.put<ActualSaved>('/performance/actuals', body),
  actualHistory: (planId: number, kpiId: number) => api.get<ActualHistory>(`/performance/plans/${planId}/kpis/${kpiId}/actuals`),
  bands: (periodId?: number | null) => api.get<ChartBands>(`/performance/bands${q({ periodId })}`),
};

/**
 * A manager login (self view): the DRAFT plans of people below them — view and
 * change; never activate or cancel. And everybody's own plan, read-only.
 */
export const teamPlanApi = {
  myPlans: () => api.get<MyPlans>('/user/me/plan'),
  list: () => api.get<{ items: PlanRow[]; people: number }>('/user/me/team/plans'),
  plan: (id: number) => api.get<Plan>(`/user/me/team/plans/${id}`),
  setKraWeight: (id: number, kraId: number, weightPercent: number | null) => api.put<{ ok: true }>(`/user/me/team/plans/${id}/kras/${kraId}`, { weightPercent }),
  addKpi: (id: number, body: KpiInput) => api.post<{ ok: true; id: number }>(`/user/me/team/plans/${id}/kpis`, body),
  changeKpi: (id: number, kpiId: number, body: KpiInput) => api.put<{ ok: true; changedFromJob: boolean }>(`/user/me/team/plans/${id}/kpis/${kpiId}`, body),
  removeKpi: (id: number, kpiId: number) => api.del<{ ok: true }>(`/user/me/team/plans/${id}/kpis/${kpiId}`),
  /** Actuals for the people below me (spec §19.2) — the same grid and writer as HR's. */
  actuals: (search: string) => api.get<ActualsGrid>(`/user/me/team/actuals${search && !search.startsWith('?') ? `?${search}` : search}`),
  enterActual: (body: ActualInput) => api.put<ActualSaved>('/user/me/team/actuals', body),
  actualHistory: (planId: number, kpiId: number) => api.get<ActualHistory>(`/user/me/team/plans/${planId}/kpis/${kpiId}/actuals`),
  /** A KPI's actuals on one of MY plans. */
  myActualHistory: (planId: number, kpiId: number) => api.get<ActualHistory>(`/user/me/plan/${planId}/kpis/${kpiId}/actuals`),
};
