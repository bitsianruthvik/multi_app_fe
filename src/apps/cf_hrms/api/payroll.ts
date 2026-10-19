import { api } from './client';

/**
 * Payroll — the client side of CF_HRMS_HIRING_SPEC.md §25.2 (backend
 * `routes/payroll.js`, `services/payroll/*`). The types are the services' wire
 * shapes.
 *
 * TWO DOORS.
 *   payrollApi   HR: components, structures, statutory settings (payroll view),
 *                and salaries, runs, payslips, the bank file (payroll view AND
 *                the named pay view — every read of another person's pay is
 *                audited by the server).
 *   myPayApi     the signed-in person's own salary and payslips (`/user/me/…`,
 *                self view). There is no employee id in it: the server takes
 *                the person from the login, like `api/self.ts`.
 *
 * Files come back as `{ fileName, mimeType, contentBase64 }`; hand them to
 * `saveBase64File` (api/excel.ts).
 */

/* ── shared ───────────────────────────────────────────────────────────── */

export type ComponentKind = 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION' | 'REIMBURSEMENT';
export type PfMode = 'CEILING' | 'FULL' | 'NONE';
export type RunStatus = 'DRAFT' | 'CALCULATED' | 'LOCKED' | 'RELEASED' | 'PAID';
export type StatutoryKind = 'PF' | 'ESI' | 'PT' | 'LWF';

export interface PayFile {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

/* ── components ───────────────────────────────────────────────────────── */

export interface PayComponent {
  id: number;
  code: string;
  name: string;
  kind: ComponentKind;
  taxable: 'YES' | 'PARTLY' | 'NO';
  exemptionRule: string | null;
  inPfWage: boolean;
  inEsiWage: boolean;
  inGratuityWage: boolean;
  frequency: 'MONTHLY' | 'YEARLY';
  prorateOnLop: boolean;
  /** Set on the ready-made components the run works out by law (PF_EE, PT, TDS …). */
  statutoryKey: string | null;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
  readyMade: boolean;
  description: string | null;
  updatedAt: string | null;
  /** How many structures have a line for it. */
  structureCount?: number;
}

export interface ComponentList {
  components: PayComponent[];
  kinds: ComponentKind[];
  statutoryKeys: { key: string; label: string }[];
  exemptionRules: string[];
}

export interface ComponentInput {
  code?: string;
  name?: string;
  kind?: ComponentKind;
  taxable?: 'YES' | 'PARTLY' | 'NO';
  exemptionRule?: string | null;
  inPfWage?: boolean;
  inEsiWage?: boolean;
  inGratuityWage?: boolean;
  frequency?: 'MONTHLY' | 'YEARLY';
  prorateOnLop?: boolean;
  sortOrder?: number;
  status?: 'ACTIVE' | 'INACTIVE';
  description?: string | null;
}

/* ── structures and the breakdown ─────────────────────────────────────── */

export interface StructureLine {
  id: number;
  componentId: number;
  code: string | null;
  name: string;
  kind: ComponentKind | null;
  formula: string;
  sortOrder: number;
}

export interface PayStructure {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  updatedAt: string | null;
  lines: StructureLine[];
  /** People whose salary today uses it (the list only). */
  peopleCount?: number;
}

export interface BreakdownLine {
  componentId: number;
  code: string;
  name: string;
  kind: ComponentKind;
  frequency: 'MONTHLY' | 'YEARLY';
  formula: string;
  monthly: number;
  annual: number;
  overridden: boolean;
  inCtc: boolean;
  statutoryKey: string | null;
}

export interface BreakdownTotals {
  earnings: number;
  employer: number;
  reimbursements: number;
  deductions: number;
  ctcLines: number;
}

/** A structure worked out for a CTC (the preview, and every salary's breakdown). */
export interface Breakdown {
  ok: boolean;
  /** Why it cannot be worked out, in words. */
  problems: string[];
  /** It works out, but something looks wrong. */
  warnings: string[];
  annualCtc?: number;
  monthlyCtc?: number;
  lines: BreakdownLine[];
  totals?: BreakdownTotals;
  /** The ceilings the formulas used (from the statutory settings in force). */
  vars?: { PF_CEILING: number | null; ESI_CEILING: number | null };
  structure?: { id: number; name: string; code: string };
}

export interface PreviewInput {
  lines: { componentId: number; formula: string }[];
  annualCtc: number | string;
  /** { [componentId]: monthly amount } */
  overrides?: Record<string, number>;
  pfMode?: PfMode;
  /** The day whose ceilings to use (YYYY-MM-DD); today when left out. */
  on?: string;
}

/* ── statutory settings ───────────────────────────────────────────────── */

export interface StatutoryRow {
  id: number;
  kind: StatutoryKind;
  stateCode: string;
  effectiveFrom: string;
  settings: Record<string, unknown>;
  source: string | null;
  sourceUrl: string | null;
  verification: 'VERIFIED' | 'UNVERIFIED';
  note: string | null;
  updatedAt: string | null;
}

export interface PaySettings {
  stateCode: string;
  debitAccountNo: string | null;
  debitIfsc: string | null;
  narration: string;
  updatedAt: string | null;
}

export interface StatutoryList {
  settings: StatutoryRow[];
  company: PaySettings;
  /** The row in force today, by kind (for the company's state). */
  inForce: Partial<Record<StatutoryKind, number | null>>;
  states: { code: string; name: string }[];
  unverified: number;
}

export interface StatutoryInput {
  kind: StatutoryKind;
  stateCode: string;
  effectiveFrom: string;
  settings: Record<string, unknown>;
  source: string | null;
  sourceUrl?: string | null;
  verification?: 'VERIFIED' | 'UNVERIFIED';
  note?: string | null;
}

/* ── salaries ─────────────────────────────────────────────────────────── */

export interface SalaryPerson {
  id: number;
  code: string;
  name: string;
  status: string;
  joiningDate: string | null;
  exitDate: string | null;
  positionTitle?: string | null;
  departmentName?: string | null;
}

export interface SalaryListItem {
  employee: SalaryPerson;
  salary: {
    id: number;
    annualCtc: number;
    monthlyCtc: number;
    effectiveFrom: string;
    structure: { id: number; name: string } | null;
    pfMode: PfMode;
    /** Starts after today: the person has no salary today. */
    future: boolean;
  } | null;
  revisions: number;
}

export interface SalaryList {
  items: SalaryListItem[];
  total: number;
  structures: { id: number; name: string; status: string }[];
}

export interface SalaryRow {
  id: number;
  employeeId: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  annualCtc: number;
  monthlyCtc: number;
  structureId: number;
  overrides: { componentId: number; amount: number }[];
  pfMode: PfMode;
  stateCode: string | null;
  reason: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  structure: { id: number; name: string } | null;
  current: boolean;
  future: boolean;
  /** A locked payroll paid on it: kept as it was — revise, never correct. */
  paidInLockedRun: boolean;
  breakdown: Breakdown;
}

export interface SalaryDetail {
  employee: SalaryPerson;
  current: SalaryRow | null;
  /** Newest first. */
  history: SalaryRow[];
}

export interface SalaryInput {
  employeeId?: number;
  annualCtc?: number | string;
  structureId?: number;
  effectiveFrom?: string;
  overrides?: { componentId: number; amount: number | string }[];
  pfMode?: PfMode;
  stateCode?: string | null;
  reason?: string | null;
}

export interface SalaryCreated {
  salary: SalaryRow;
  /** Months a locked run paid that the revision is dated back over. */
  arrearsFor: string[];
  /** "Dated back over 2 paid months (…): the next run pays the arrears." */
  note: string | null;
}

/* ── runs ─────────────────────────────────────────────────────────────── */

export interface RunTotals {
  gross: number;
  deductions: number;
  employer: number;
  net: number;
  reimbursements: number;
  people: number;
  pfAdmin: number;
  edli: number;
  pfEmployee: number;
  pfEmployer: number;
  eps: number;
  esiEmployee: number;
  esiEmployer: number;
  pt: number;
  lwfEmployee: number;
  lwfEmployer: number;
  tds: number;
  /** People per warning code. */
  warnings: Record<string, number>;
  missingSettings?: string[];
  unverifiedSettings?: string[];
  statutoryFrom?: Record<string, string | null>;
  strayItems?: number;
}

export interface PayRun {
  id: number;
  month: string;
  /** "September 2026" */
  label: string;
  status: RunStatus;
  note: string | null;
  peopleCount: number;
  gross: number;
  deductions: number;
  employer: number;
  net: number;
  totals: RunTotals | null;
  calculatedAt: string | null;
  lockedAt: string | null;
  releasedAt: string | null;
  paidAt: string | null;
  paidNote: string | null;
  reopenCount: number;
  reopenNote: string | null;
  /** Marked paid at least once (kept through a re-open): then only the Owner removes the run. */
  everPaid?: boolean;
  createdAt: string | null;
  /** The list only. */
  peopleWithWarnings?: number;
}

export interface RunList {
  runs: PayRun[];
  /** The month after the latest run (or last month): the "New run" default. */
  suggestedMonth: string;
}

export interface RunWarning {
  code: string;
  text: string;
}

export interface RunPerson {
  /** The person's row in this run — the id of GET …/people/:personId. */
  id: number;
  employee: { id: number; code: string; name: string; positionTitle?: string | null; departmentName?: string | null };
  /** False: not paid in this run (no salary for the month). */
  included: boolean;
  daysInMonth: number;
  employedDays: number;
  lopDays: number;
  payableDays: number;
  annualCtc: number | null;
  gross: number;
  reimbursements: number;
  deductions: number;
  employer: number;
  net: number;
  tds: number;
  tdsSource: string | null;
  /** The engine's working in a few words (spec §25.4); the detail carries the whole of it. */
  tax?: RunTax | null;
  esiCovered: boolean;
  warnings: RunWarning[];
}

/** The month's income tax of a person in a run (hrms_pay_run_people.tax_json). */
export interface RunTax {
  year: string | null;
  regime: 'OLD' | 'NEW' | null;
  engineTds: number | null;
  projectedTax: number | null;
  noPan: boolean | { rate: number; section: string; yearTax: number } | null;
  override: { amount: number; reason: string } | null;
  available?: boolean;
  lines?: { label: string; amount: number | null }[];
  warnings?: string[];
  source?: string;
}

export interface RunCan {
  calculate: boolean;
  lock: boolean;
  release: boolean;
  paid: boolean;
  /** The Owner only. */
  reopen: boolean;
  remove: boolean;
  bankFile: boolean;
  /** One-time items and TDS may change (a DRAFT or CALCULATED run). */
  items: boolean;
}

export interface RunDetail {
  run: PayRun;
  people: RunPerson[];
  items: { count: number; total: number };
  /** Released payslips. */
  payslips: number;
  /** What was paid for the month, and what a re-open recovers (hrms_pay_payments). */
  payments?: RunPayments;
  /** What changed since the calculation ("a salary", "a one-time item" …): calculate again. */
  stale: string[];
  can: RunCan;
  /** Release only: payslips written. */
  released?: number;
}

/** Paid so far for the run's month (each "Mark paid" records the bank file's amounts per person). */
export interface RunPayments {
  paid: number;
  paidPeople: number;
  lastPaidOn: string | null;
  /** People this month paid more than the re-calculated net: recovered in a later run (inMonth), or waiting for the next run (null). */
  recoveries: { employee: { id: number; code: string; name: string }; amount: number; inMonth: string | null }[];
  /** Recoveries of earlier months this run deducts. */
  recoveriesIn: { employee: { id: number; code: string; name: string }; amount: number; forMonth: string }[];
}

export interface RunLine {
  id: number;
  componentId: number;
  code: string;
  name: string;
  kind: ComponentKind;
  amount: number;
  /** The month's full amount before LOP and days, when it was prorated. */
  fullAmount: number | null;
  /** How it was worked out, in words. */
  basis: string | null;
  source: 'STRUCTURE' | 'ONE_TIME' | 'ARREARS' | 'STATUTORY' | 'TDS' | string;
  forMonth: string | null;
}

export interface RunItem {
  id: number;
  componentId: number;
  code: string;
  name: string;
  kind: ComponentKind;
  amount: number;
  note: string | null;
}

export interface RunPersonDetail {
  run: PayRun;
  person: RunPerson & {
    lopDates: string[];
    segments: { salaryId: number; from: string; to: string; days: number; lop: number }[];
    pfWage: number;
    esiWage: number;
    bank: { account: string | null; ifsc: string | null };
  };
  lines: RunLine[];
  items: RunItem[];
}

/** After a change to an item or the TDS: `recalculate` = the run was calculated, so calculate again. */
export interface ItemChange {
  recalculate: boolean;
}

export interface BankFile extends PayFile {
  rows: number;
  total: number;
  skipped: { code: string | null; name: string; why: string }[];
  /** True after a re-open: the file pays only the difference from what was paid for the month. */
  difference?: boolean;
  /** Paid more than now due: not in the file, recovered in the next run. */
  recover?: { code: string | null; name: string; amount: number }[];
}

export interface RunPayslip {
  id: number;
  employee: { id: number; code: string; name: string };
  status: 'RELEASED' | 'WITHDRAWN' | string;
  version: number;
  net: number;
  releasedAt: string | null;
}

/* ── my pay ───────────────────────────────────────────────────────────── */

export interface MySalary {
  effectiveFrom: string;
  effectiveTo: string | null;
  annualCtc: number;
  monthlyCtc: number;
  structureName: string | null;
  pfMode: PfMode;
  lines: { code: string; name: string; kind: ComponentKind; frequency: 'MONTHLY' | 'YEARLY'; monthly: number; annual: number }[];
  totals: Partial<BreakdownTotals>;
  note: string;
}

export interface MyPay {
  employee: { name: string; code: string; joiningDate: string | null };
  salary: MySalary | null;
  upcoming: MySalary | null;
  history: { effectiveFrom: string; effectiveTo: string | null; annualCtc: number; monthlyCtc: number; reason: string | null }[];
}

export interface MyPayslip {
  id: number;
  month: string;
  label: string;
  net: number;
  releasedAt: string | null;
}

/* ── the calls ────────────────────────────────────────────────────────── */

const qs = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const payrollApi = {
  /** The ready-made components, "Staff standard" and the statutory rows (edit). Idempotent. */
  setup: () =>
    api.post<{ created: { components: string[]; structure: string | null; statutory: string[]; settings: boolean } }>('/payroll/setup'),

  // Components
  components: () => api.get<ComponentList>('/payroll/components'),
  createComponent: (body: ComponentInput) => api.post<{ component: PayComponent }>('/payroll/components', body),
  updateComponent: (id: number, body: ComponentInput) => api.put<{ component: PayComponent }>(`/payroll/components/${id}`, body),
  removeComponent: (id: number) => api.del<{ ok: true }>(`/payroll/components/${id}`),

  // Structures
  structures: () => api.get<{ structures: PayStructure[] }>('/payroll/structures'),
  structure: (id: number) => api.get<{ structure: PayStructure; variables: string[] }>(`/payroll/structures/${id}`),
  createStructure: (body: { code: string; name: string; description?: string | null; lines?: { componentId: number; formula: string }[]; copyOf?: number | null }) =>
    api.post<{ structure: PayStructure; variables: string[] }>('/payroll/structures', body),
  updateStructure: (id: number, body: { name?: string; description?: string | null; status?: 'ACTIVE' | 'INACTIVE'; lines?: { componentId: number; formula: string }[] }) =>
    api.put<{ structure: PayStructure; variables: string[] }>(`/payroll/structures/${id}`, body),
  removeStructure: (id: number) => api.del<{ ok: true }>(`/payroll/structures/${id}`),
  /** The live preview. Writes nothing; problems come back in the answer, not as an error. */
  preview: (body: PreviewInput) => api.post<Breakdown>('/payroll/structures/preview', body),

  // Statutory settings and the company's payroll settings
  statutory: () => api.get<StatutoryList>('/payroll/statutory'),
  createStatutory: (body: StatutoryInput) => api.post<{ setting: StatutoryRow }>('/payroll/statutory', body),
  updateStatutory: (id: number, body: Partial<StatutoryInput>) => api.put<{ setting: StatutoryRow }>(`/payroll/statutory/${id}`, body),
  removeStatutory: (id: number) => api.del<{ ok: true }>(`/payroll/statutory/${id}`),
  putSettings: (body: Partial<Pick<PaySettings, 'stateCode' | 'debitAccountNo' | 'debitIfsc' | 'narration'>>) =>
    api.put<{ company: PaySettings }>('/payroll/settings', body),

  // Salaries (+ pay view; audited)
  salaries: (params: { q?: string; structureId?: string; has?: string } = {}) => api.get<SalaryList>(`/payroll/salaries${qs(params)}`),
  salary: (employeeId: number) => api.get<SalaryDetail>(`/payroll/salaries/${employeeId}`),
  createSalary: (body: SalaryInput) => api.post<SalaryCreated>('/payroll/salaries', body),
  /** A correction of a row no locked run paid on. */
  updateSalary: (id: number, body: SalaryInput) => api.put<{ salary: SalaryRow }>(`/payroll/salaries/${id}`, body),
  /** The latest row only, unpaid. */
  removeSalary: (id: number) => api.del<{ ok: true }>(`/payroll/salaries/${id}`),

  // Runs (+ pay view)
  runs: () => api.get<RunList>('/payroll/runs'),
  createRun: (body: { month: string; note?: string | null }) => api.post<{ run: PayRun }>('/payroll/runs', body),
  run: (id: number) => api.get<RunDetail>(`/payroll/runs/${id}`),
  removeRun: (id: number) => api.del<{ ok: true }>(`/payroll/runs/${id}`),
  /** `personId` is the person's row in the run (RunPerson.id), not the employee id. */
  runPerson: (id: number, personId: number) => api.get<RunPersonDetail>(`/payroll/runs/${id}/people/${personId}`),
  calculate: (id: number) => api.post<RunDetail>(`/payroll/runs/${id}/calculate`),
  /** 409 STALE when something changed since the calculation. */
  lock: (id: number) => api.post<RunDetail>(`/payroll/runs/${id}/lock`),
  release: (id: number) => api.post<RunDetail>(`/payroll/runs/${id}/release`),
  markPaid: (id: number, note?: string | null) => api.post<RunDetail>(`/payroll/runs/${id}/paid`, { note: note || null }),
  /** The Owner only, with a reason. */
  reopen: (id: number, reason: string) => api.post<RunDetail>(`/payroll/runs/${id}/reopen`, { reason }),
  items: (id: number) => api.get<{ items: (Omit<RunItem, 'componentId'> & { componentId: number; employee: { id: number; code: string; name: string }; updatedAt: string | null })[] }>(`/payroll/runs/${id}/items`),
  addItem: (id: number, body: { employeeId: number; componentId: number; amount: number | string; note?: string | null }) =>
    api.post<ItemChange & { item: { id: number } }>(`/payroll/runs/${id}/items`, body),
  /** The month's TDS for one person — `employeeId` is the EMPLOYEE id. 0 clears it. */
  setTds: (id: number, employeeId: number, body: { amount: number | string; reason: string }) =>
    api.put<ItemChange>(`/payroll/runs/${id}/people/${employeeId}/tds`, body),
  clearTds: (id: number, employeeId: number) => api.del<ItemChange>(`/payroll/runs/${id}/people/${employeeId}/tds`),
  updateItem: (itemId: number, body: { amount?: number | string; note?: string | null }) => api.put<ItemChange>(`/payroll/items/${itemId}`, body),
  removeItem: (itemId: number) => api.del<ItemChange & { ok: true }>(`/payroll/items/${itemId}`),
  /** LOCKED or later. */
  bankFile: (id: number) => api.get<BankFile>(`/payroll/runs/${id}/bank-file`),
  payslips: (id: number) => api.get<{ payslips: RunPayslip[] }>(`/payroll/runs/${id}/payslips`),
  payslipFile: (payslipId: number) => api.get<PayFile>(`/payroll/payslips/${payslipId}/file`),
};

/** The signed-in person's own pay. No ids: the server takes the person from the login. */
export const myPayApi = {
  pay: () => api.get<MyPay>('/user/me/pay'),
  payslips: () => api.get<{ payslips: MyPayslip[] }>('/user/me/payslips'),
  payslipFile: (payslipId: number) => api.get<PayFile>(`/user/me/payslips/${payslipId}/file`),
};
