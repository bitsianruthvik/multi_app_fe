import { api } from './client';
import type { TaxFile } from './tax';

/**
 * Payroll extras P3a — the client side of CF_HRMS_HIRING_SPEC.md §25.5 (backend `routes/payrollExtras.js`,
 * `services/payrollExtras/*`, the pure valuation `services/tax/perquisites.js` and `services/tax/relief.js`).
 *
 *   extrasApi    HR: the month's statutory return files (Payroll › Statutory returns — amounts and files need
 *                the named pay view), the perquisites register (Tax › Perquisites) and the Form 10E / 39
 *                worksheets (Tax › Form 10E). Each read of other people's amounts is audited.
 *   myReliefApi  the signed-in person's own Form 10E / 39 worksheets (My tax › Forms). No employee id in it.
 */

export type Level = 'ERROR' | 'WARNING' | 'INFO';
export interface Check { level: Level; kind: 'PF' | 'ESI' | 'PT'; what: string; employee: { id: number; code: string; name: string } | null }
interface Person { id: number; code: string; name: string }

export interface PfRow {
  employee: Person; uan: string | null; name: string; grossWages: number; epfWages: number; epsWages: number; edliWages: number;
  epfEe: number; eps: number; epfDiff: number; ncpDays: number; refund: number; ncpFrom: 'ATTENDANCE' | 'RUN';
}
export interface EsiRow {
  employee: Person; ip: string | null; name: string; days: number; daysExact: number; wages: number; reason: number; reasonWords: string;
  lastWorkingDay: string | null; employeeShare: number; employerShare: number; daysFrom: 'ATTENDANCE' | 'RUN';
}
export interface PtSlab { from: number; upTo: number | null; rate: number; words: string; employees: number; deducted: number | null; amount: number | null }
export interface FormatNote { name: string; rules: string; source: string; verified?: boolean }
export interface MonthReturns {
  month: string; monthLabel: string; ready: boolean; reason?: string; amountsHidden?: boolean;
  formats: { ECR: FormatNote; ESI: FormatNote; PT: FormatNote };
  run: { id: number; status: string; lockedAt?: string | null } | null;
  attendance?: { live: boolean; final: boolean; used: boolean; status: string | null };
  pf: { rows: PfRow[]; members: number; inFile: number; ceiling?: number | null; totals: Record<string, number> | null } | null;
  esi: { rows: EsiRow[]; members: number; inFile: number; totals: Record<string, number> | null } | null;
  pt: { state: string; slabs: PtSlab[]; totals: { employees: number; deducted?: number; amount?: number }; dueDate: string } | null;
  validation: Check[];
}

export type PerqKind = 'CAR' | 'ACCOMMODATION' | 'LOAN' | 'GIFT' | 'CREDIT_CARD' | 'CLUB' | 'OTHER';
export type Facts = Record<string, string | number | boolean | Record<string, string | number> | null | undefined>;
export interface Valued { kind: PerqKind; label: string | null; nature: string; row: number; byMonth: Record<string, number>; value: number; recovered: number; taxable: number; lines: string[] }
export interface PerqEntry {
  id: number; employeeId: number; year: string; kind: PerqKind; label: string | null; fromDate: string; toDate: string | null; facts: Facts; note: string | null; valued?: Valued;
}
export interface PerqRegister {
  year: string; rule: Record<string, unknown> | null; source: { note: string; url: string; verified: boolean } | null; rulesMissing: string | null;
  kinds: { kind: PerqKind; row: number; nature: string }[];
  people: { employee: Person; total: number; salaryKnown: boolean; entries: PerqEntry[] }[];
  totals: { people: number; entries: number; value: number };
}
export interface PerqInput { employeeId?: number; kind?: PerqKind; label?: string | null; fromDate?: string; toDate?: string | null; facts?: Facts; note?: string | null; id?: number }

export interface ReliefLaw { section: string; rule: string; formNumber: string; formLabel: string; employerSection: string; employerNote: string; source: string; verified: boolean }
export interface EarlierYear { year: string; arrears: number; how: 'ENGINE' | 'ENGINE_TYPED_INCOME' | 'TYPED' | 'MISSING'; rules: boolean; regime: 'OLD' | 'NEW' | null; totalIncome?: number | null; taxWithout?: number | null; taxWith?: number | null; need?: string[] }
export interface ReliefSnapshot {
  year: string; law: ReliefLaw; employee: Person & { pan: string | null }; regime: 'OLD' | 'NEW';
  receipt: { year: string; regime: string; how: 'PAYROLL' | 'TYPED'; totalIncome: number; taxWith: number; taxWithout: number };
  earlier: EarlierYear[];
  worksheet: { complete: boolean; missing: string[]; a: number; b: number; relief: number; sentence: string; rows: Record<string, number>; table: { year: string; arrears: number; totalIncome: number | null; increasedIncome: number | null; taxWithout: number | null; taxWith: number | null; difference: number | null; how: string }[] };
  notes: string[];
}
export interface KeptRelief { id: number; year: string; status: 'INCOMPLETE' | 'READY'; relief: number; inputs: { earlier?: Record<string, EarlierInput>; receipt?: { totalIncome?: number | null } }; result: ReliefSnapshot | null; generatedAt: string | null }
export interface EarlierInput { regime?: string | null; totalIncome?: number | string | null; taxWithout?: number | string | null; taxWith?: number | string | null }
export interface ReliefList {
  year: string; law: ReliefLaw | null;
  people: { employee: Person; arrears: { total: number; years: { year: string; amount: number }[] } | null; worksheet: { status: string; relief: number; generatedAt: string | null; missing: string[] } | null }[];
}

const enc = encodeURIComponent;
export const extrasApi = {
  returns: (month: string) => api.get<MonthReturns>(`/payroll/returns/${enc(month)}`),
  returnFile: (month: string, kind: 'ECR' | 'ESI' | 'PT') => api.get<TaxFile>(`/payroll/returns/${enc(month)}/files/${kind}`),
  perquisites: (y: string) => api.get<PerqRegister>(`/tax/${y}/perquisites`),
  previewPerquisite: (y: string, body: PerqInput) => api.post<{ valued: Valued; total: number }>(`/tax/${y}/perquisites/preview`, body),
  addPerquisite: (y: string, body: PerqInput) => api.post<{ entry: PerqEntry; valued: Valued; total: number }>(`/tax/${y}/perquisites`, body),
  updatePerquisite: (id: number, body: PerqInput) => api.put<{ entry: PerqEntry; valued: Valued; total: number }>(`/tax/perquisites/${id}`, body),
  removePerquisite: (id: number) => api.del<{ ok: true }>(`/tax/perquisites/${id}`),
  reliefList: (y: string) => api.get<ReliefList>(`/tax/${y}/form10e`),
  relief: (y: string, employeeId: number) => api.get<{ kept: KeptRelief | null; fresh: ReliefSnapshot | null }>(`/tax/${y}/form10e/${employeeId}`),
  generateRelief: (y: string, employeeId: number, body: { earlier?: Record<string, EarlierInput>; receipt?: { totalIncome?: number | string | null } }) => api.post<{ worksheet: KeptRelief }>(`/tax/${y}/form10e/${employeeId}`, body),
  removeRelief: (y: string, employeeId: number) => api.del<{ ok: true }>(`/tax/${y}/form10e/${employeeId}`),
  reliefFile: (y: string, employeeId: number) => api.get<TaxFile>(`/tax/${y}/form10e/${employeeId}/file`),
};

export interface MyRelief { year: string; status: 'INCOMPLETE' | 'READY'; relief: number; form: string; generatedAt: string | null; sentence: string | null; earlier: EarlierYear[] }
export const myReliefApi = {
  list: () => api.get<{ worksheets: MyRelief[] }>('/user/me/form10e'),
  save: (y: string, earlier: Record<string, EarlierInput>) => api.put<{ worksheet: KeptRelief }>(`/user/me/form10e/${y}`, { earlier }),
  file: (y: string) => api.get<TaxFile>(`/user/me/form10e/${y}/file`),
};
