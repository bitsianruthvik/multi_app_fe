import { api } from './client';
import type { TaxFile } from './tax';

/**
 * Payroll P3b — the client side of the payroll policy, attendance in a run, full and final settlements,
 * claims (reimbursements against bills, LTA) and employer retirement contributions above the yearly limit.
 *
 *   policyApi       HR: the company's payroll policy (overtime, encashment and notice-pay formulas, the flexible
 *                   year-end, whether a claim goes to the manager first).
 *   runAttendanceApi HR: pay a month without attendance (with a reason), or use attendance again.
 *   settlementApi   HR: Exits and the full and final page.
 *   claimTypesApi   HR: the claim types.
 *   claimsApi       HR: every claim in scope, decide them.
 *   retirementApi   HR: Tax › Perquisites, employer contributions above ₹7.5 lakh.
 *   myClaimsApi     the signed-in person's own claims (My pay › Claims). No employee id in it.
 *   mySettlementApi the signed-in person's own full and final (My pay › Full and final).
 *   claimApprovalsApi a manager deciding a claim (Approvals). Lives here so Approvals' own file stays kind-neutral.
 */

const enc = encodeURIComponent;
function qs(params: Record<string, string | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export interface Person { id: number; code: string; name: string }

/* ── policy ───────────────────────────────────────────────────────────── */

export type FlexiYearEnd = 'PAY_TAXABLE' | 'LAPSE';
export interface PolicyValues {
  overtimeRateFormula: string;
  encashRateFormula: string;
  noticeRateFormula: string;
  flexiYearEnd: FlexiYearEnd;
  claimsManagerFirst: boolean;
}
export interface PayrollPolicy extends PolicyValues {
  defaults: PolicyValues;
  updatedAt: string | null;
}
export const policyApi = {
  get: () => api.get<{ policy: PayrollPolicy }>('/payroll/policy').then((r) => r.policy),
  save: (body: Partial<PolicyValues>) => api.put<{ policy: PayrollPolicy }>('/payroll/policy', body).then((r) => r.policy),
};

/* ── attendance in a run ──────────────────────────────────────────────── */

export type AttendanceMode = 'LEAVE' | 'ATTENDANCE' | 'OVERRIDE' | 'REFUSE';
export interface RunAttendance {
  live: boolean;
  liveFrom: string | null;
  status: 'OPEN' | 'CLOSED' | null;
  closedAt: string | null;
  override: { reason: string; at: string | null; by: string | null } | null;
  mode: AttendanceMode;
  message: string | null;
  label: string | null;
}
export const runAttendanceApi = {
  override: (runId: number, reason: string) => api.post<{ override: RunAttendance['override'] }>(`/payroll/runs/${runId}/attendance-override`, { reason }),
  clear: (runId: number) => api.del<{ cleared: boolean }>(`/payroll/runs/${runId}/attendance-override`),
};

/* ── full and final ───────────────────────────────────────────────────── */

export type SettlementStatus = 'DRAFT' | 'APPROVED' | 'PAID';
export interface ExitSummary {
  statusLine: string | null;
  lastWorkingDay: string | null;
  exitType: string | null;
  typeLabel: string | null;
  reasonLabel: string | null;
  status: string | null;
}
export interface SettlementSummary {
  id: number;
  status: SettlementStatus;
  statusWords: string;
  payMonth: string | null;
  payMonthLabel: string | null;
  netAmount: number;
  updatedAt: string | null;
}
export interface LeavingPerson {
  employee: Person & { status: string };
  exit: ExitSummary | null;
  settlement: SettlementSummary | null;
}
export interface SettlementList {
  people: LeavingPerson[];
  counts: { leaving: number; drafts: number; approved: number };
}

export interface SettlementInputs {
  noticeDays?: number | null;
  waiveNotice?: boolean;
  waiveNote?: string;
  encashDays?: number | null;
  gratuityAmount?: number | null;
  gratuityNote?: string;
  gratuityExemptedBefore?: number;
  leaveExemptedBefore?: number;
  bonus?: { label: string; amount: number }[];
  recoveries?: { kind: 'LOAN' | 'ASSET' | 'OTHER'; label: string; amount: number }[];
  note?: string;
}

export interface StatementLine { code: string; name: string; kind: string; amount: number }
export interface Statement {
  employee: Person & { joiningDate: string | null; status: string };
  exit: { id: number; type: 'RESIGNED' | 'REMOVED'; status: 'OPEN' | 'CLOSED'; noticeDate: string | null; lastWorkingDay: string | null };
  year: string;
  service: { years: number; months: number; days: number; text: string };
  payMonth: string | null;
  payMonthLabel: string | null;
  exitMonth: string | null;
  lastMonth: {
    how: 'RUN' | 'RUN_LOCKED' | 'ESTIMATE'; label: string; payableDays: number; daysInMonth: number; lopDays: number;
    gross: number; reimbursements: number; deductions: number; net: number; lines: StatementLine[]; note?: string | null;
  } | null;
  gratuity: { eligible: boolean; years: number; amount: number; formulaAmount: number; cappedAt: number | null; lines: string[]; wage: number; paid: number; typed: boolean };
  encashment: {
    types: { code: string; name: string; available: number; capDays: number | null; days: number }[];
    days: number; rate: number; amount: number; formula: string; typed?: boolean;
    exempt: { formulaAmount: number; limbC: number; limbD: number; averageSalary: number; lines: string[] } | null;
  };
  notice: {
    requiredDays: number | null; servedDays: number; source: 'TYPED' | 'APPOINTMENT' | 'APPOINTMENT_PROBATION' | null;
    shortDays: number; action: 'NONE' | 'RECOVER' | 'PAY' | 'WAIVED'; amount: number; line: string | null; dayRate: number; formula: string;
  };
  claims: { approved: { id: number; name: string; amount: number }[]; waiting: { id: number; name: string; amount: number }[] };
  items: { code: string; name: string; kind: 'EARNING' | 'DEDUCTION' | 'REIMBURSEMENT'; amount: number; label: string; basis: string | null }[];
  totals: { earnings: number; deductions: number; settlement: number; claims: number; lastMonthNet: number; tds: number; net: number };
  tds: {
    amount: number; regime: string; yearTax: number; tdsSoFar: number; monthsLeft: number; month: string | null;
    exemptions: { label: string; section: string; received: number; exempt: number }[]; note: string | null;
  } | null;
  rule: { year: string; verified: boolean; source: string | null; url: string | null; notApplied: string[] | string | null };
  notes: string[];
  problems: string[];
}
export interface Settlement {
  id: number;
  employeeId: number;
  exitId: number;
  lastDay: string | null;
  status: SettlementStatus;
  statusWords: string;
  payMonth: string | null;
  payMonthLabel: string | null;
  runId: number | null;
  netAmount: number;
  approvedAt: string | null;
  paidAt: string | null;
  note: string | null;
  inputs: SettlementInputs;
  statement: Statement | null;
  updatedAt: string | null;
}
export interface SettlementFresh { ok: boolean; problems: string[]; statement: Statement | null }
export interface SettlementDetail { settlement: Settlement | null; fresh: SettlementFresh | null }

export const settlementApi = {
  list: (q?: string) => api.get<SettlementList>(`/payroll/settlements${qs({ q })}`),
  forEmployee: (employeeId: number) => api.get<SettlementDetail>(`/payroll/settlements/employees/${employeeId}`),
  preview: (employeeId: number, inputs: SettlementInputs) => api.post<SettlementFresh>(`/payroll/settlements/employees/${employeeId}/preview`, inputs),
  save: (employeeId: number, inputs: SettlementInputs) => api.put<SettlementDetail>(`/payroll/settlements/employees/${employeeId}`, inputs),
  /** 409 NOT_CLOSED, 409 PROBLEMS (problems[]), 403 OWN_RECORD. */
  approve: (id: number) => api.post<SettlementDetail>(`/payroll/settlements/${id}/approve`),
  unapprove: (id: number, note?: string) => api.post<SettlementDetail>(`/payroll/settlements/${id}/unapprove`, { note: note || undefined }),
  remove: (id: number) => api.del<{ ok: true }>(`/payroll/settlements/${id}`),
  file: (id: number) => api.get<TaxFile>(`/payroll/settlements/${id}/file`),
};

/* ── claim types ──────────────────────────────────────────────────────── */

export type TaxTreatment = 'EXEMPT' | 'TAXABLE' | 'LTA';
export interface ClaimType {
  id: number;
  code: string;
  name: string;
  yearlyLimit: number | null;
  taxTreatment: TaxTreatment;
  taxRule: string | null;
  billsNeeded: boolean;
  flexible: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  sortOrder: number;
  description: string | null;
}
export interface ClaimTypeInput {
  code?: string;
  name?: string;
  yearlyLimit?: number | null;
  taxTreatment?: TaxTreatment;
  taxRule?: string | null;
  billsNeeded?: boolean;
  flexible?: boolean;
  description?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
}
export const claimTypesApi = {
  list: () => api.get<{ types: ClaimType[]; treatments: TaxTreatment[]; readyMade: string[] }>('/payroll/claim-types'),
  setup: () => api.post<{ made: string[]; types: ClaimType[] }>('/payroll/claim-types/setup'),
  create: (body: ClaimTypeInput) => api.post<{ type: ClaimType }>('/payroll/claim-types', body),
  update: (id: number, body: ClaimTypeInput) => api.put<{ type: ClaimType }>(`/payroll/claim-types/${id}`, body),
  /** 409 IN_USE. */
  remove: (id: number) => api.del<{ ok: true }>(`/payroll/claim-types/${id}`),
};

/* ── claims ───────────────────────────────────────────────────────────── */

export type ClaimStatus = 'WAITING' | 'PENDING' | 'SUBMITTED' | 'RECOMMENDED' | 'APPROVED' | 'PAID' | 'REJECTED' | 'WITHDRAWN';
export interface Journey { from: string; to: string; startDate: string; endDate?: string | null; mode?: string | null }
export interface ClaimBill { id: number; fileName: string; mimeType: string; sizeBytes: number; uploadedAt: string | null }
export interface Claim {
  id: number;
  employee: Person;
  type: { id: number; code: string; name: string; taxTreatment: TaxTreatment; taxRule: string | null; flexible: boolean };
  year: string;
  billDate: string;
  amount: number;
  approvedAmount: number | null;
  description: string | null;
  journeys: Journey[] | null;
  ltaExempt: boolean | null;
  ltaNote: string | null;
  status: ClaimStatus;
  statusWords: string;
  managerNote: string | null;
  managerAt: string | null;
  managerBy: string | null;
  withManager: boolean;
  decisionNote: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  payMonth: string | null;
  payMonthLabel: string | null;
  paidAt: string | null;
  submittedAt: string | null;
  bills: ClaimBill[];
}
export interface ClaimContext { limit: number | null; usedThisYear: number; note?: string | null }

export const claimsApi = {
  list: (p: { status?: string; year?: string; q?: string } = {}) =>
    api.get<{ claims: Claim[]; counts: Record<string, number> }>(`/payroll/claims${qs(p)}`),
  get: (id: number) => api.get<{ claim: Claim; context: ClaimContext }>(`/payroll/claims/${id}`),
  /** The note is required when the amount is lower. 409 OVER_LIMIT, 403 OWN_RECORD. */
  approve: (id: number, body: { amount?: number; note?: string }) => api.post<{ claim: Claim }>(`/payroll/claims/${id}/approve`, body),
  reject: (id: number, note: string) => api.post<{ claim: Claim }>(`/payroll/claims/${id}/reject`, { note }),
  reopen: (id: number, note?: string) => api.post<{ claim: Claim }>(`/payroll/claims/${id}/reopen`, { note: note || undefined }),
  bill: (id: number, fileId: number) => api.get<TaxFile>(`/payroll/claims/${id}/bills/${fileId}`),
};

/* ── retirement contributions above the limit ─────────────────────────── */

export interface RetirementFacts {
  previousExcess: number | null;
  previousAccretion: number | null;
  ratePct: number | null;
  fundIncome: number | null;
  fundOpening: number | null;
  fundClosing: number | null;
  note: string | null;
}
export interface RetirementList {
  year: string;
  asOf: string | null;
  rule: { limit: number; section: string; accretionSection: string; accretionRule: string; source: string; url: string | null; verified: boolean } | null;
  rulesMissing?: string | null;
  people: { employee: Person; total: number; excess: number; accretion: number; lines: string[]; facts: RetirementFacts | null }[];
  overLimit: number;
}
export type RetirementInput = Partial<Record<keyof RetirementFacts, number | string | null>>;
export const retirementApi = {
  list: (year: string) => api.get<RetirementList>(`/tax/${enc(year)}/retirement`),
  save: (year: string, employeeId: number, body: RetirementInput) => api.put<{ facts: RetirementFacts }>(`/tax/${enc(year)}/retirement/${employeeId}`, body),
};

/* ── the person: my claims, my full and final ─────────────────────────── */

export interface MyClaimType extends ClaimType { used: { pending: number; approved: number; left: number | null } }
export interface NewClaim {
  claimTypeId: number;
  billDate: string;
  amount: number;
  description?: string;
  journeys?: Journey[];
  bills: { fileName: string; contentBase64: string }[];
}
export const myClaimsApi = {
  list: (year?: string) => api.get<{ year: string; types: MyClaimType[]; claims: Claim[] }>(`/user/me/claims${qs({ year })}`),
  /** 409 OVER_LIMIT { message, left }; 422 INVALID problems[]. */
  create: (body: NewClaim) => api.post<{ claim: Claim }>('/user/me/claims', body),
  addBill: (id: number, bill: { fileName: string; contentBase64: string }) => api.post<{ claim: Claim }>(`/user/me/claims/${id}/bills`, bill),
  withdraw: (id: number) => api.post<{ claim: Claim }>(`/user/me/claims/${id}/withdraw`),
  bill: (id: number, fileId: number) => api.get<TaxFile>(`/user/me/claims/${id}/bills/${fileId}`),
};

export interface MySettlement {
  id: number;
  status: SettlementStatus;
  statusWords: string;
  payMonth: string | null;
  payMonthLabel: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  statement: Statement | null;
}
export const mySettlementApi = {
  get: () => api.get<{ settlement: MySettlement | null }>('/user/me/settlement').then((r) => r.settlement),
  file: () => api.get<TaxFile>('/user/me/settlement/file'),
};

/* ── a manager deciding a claim (Approvals) ───────────────────────────── */

export const claimApprovalsApi = {
  get: (id: number) => api.get<{ request: Claim; context: ClaimContext }>(`/user/me/approvals/claim/${id}`),
  approve: (id: number, note?: string) => api.post<{ request: Claim }>(`/user/me/approvals/claim/${id}/approve`, { note: note || undefined }),
  reject: (id: number, note: string) => api.post<{ request: Claim }>(`/user/me/approvals/claim/${id}/reject`, { note }),
  bill: (id: number, fileId: number) => api.get<TaxFile>(`/user/me/approvals/claim/${id}/bills/${fileId}`),
};

/* ── words ────────────────────────────────────────────────────────────── */

export const TREATMENT_WORD: Record<TaxTreatment, string> = {
  EXEMPT: 'Not taxed (against bills)',
  TAXABLE: 'Taxed',
  LTA: 'Leave travel (LTA)',
};
export const RECOVERY_WORD: Record<'LOAN' | 'ASSET' | 'OTHER', string> = { LOAN: 'Loan or advance', ASSET: 'Company asset not returned', OTHER: 'Other' };
