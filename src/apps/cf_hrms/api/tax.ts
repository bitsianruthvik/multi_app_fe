import { api } from './client';

/**
 * Income tax in payroll — the client side of CF_HRMS_HIRING_SPEC.md §25.4 (backend
 * `routes/tax.js`, `services/payrollTax/*`, the engine `services/tax/*`).
 *
 * TWO DOORS, like payroll:
 *   taxApi     HR: the year's settings and the deductor (payroll view / edit), profiles, challans;
 *              declarations, proofs, tax sheets, the quarterly return's rows and Forms 16 / 130 also
 *              need the named pay view (each read of another person's tax is audited).
 *   myTaxApi   the signed-in person's own (`/user/me/tax/…`, self view). No employee id in it.
 * Files come back as `{ fileName, mimeType, contentBase64 }` (saveBase64File in api/excel.ts).
 */

export type Regime = 'OLD' | 'NEW';
export type WindowState = 'NOT_YET' | 'OPEN' | 'CLOSED';
export type LineStatus = 'DECLARED' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED';

export interface TaxFile { fileName: string; mimeType: string; contentBase64: string; merged?: boolean; note?: string }
export interface Review { year: string; caReviewed: boolean; banner: string | null }

export interface YearSettings {
  year: string;
  saved: boolean;
  declarationFrom: string; declarationTo: string; proofFrom: string; proofTo: string; regimeCutoff: string;
  declarationWindow: WindowState; proofWindow: WindowState; regimeOpen: boolean;
  caReviewed: boolean; caReviewedAt: string | null; caNote: string | null;
  formsReleased: boolean; formsReleasedAt: string | null;
}
export interface Forms { act: string; salaryTdsSection: string; certificate: string; quarterlyReturn: string; declaration: string; perquisites: string; previousEmployer: string }
export interface Deductor {
  saved: boolean; tan: string | null; pan: string | null; name: string; branch: string | null;
  address: Record<string, string>; responsible: Record<string, string>; category: string; placeOfPosting: string | null;
}
export interface YearView { settings: YearSettings; defaults: Record<string, string>; deductor: Deductor; forms: Forms | null; rulesMissing: string | null; review: Review; canTickReview: boolean }

export interface ProfileRow {
  employee: { id: number; code: string; name: string };
  regime: Regime; regimeSetHow: 'DEFAULT' | 'SELF' | 'HR'; changesAfterCutoff: number;
  panStatus: 'VALID' | 'INVALID' | 'NONE'; ageBand: string; dateOfBirth: boolean;
  city: string | null; metro: boolean; metroFrom: 'HR' | 'CITY' | 'NONE'; declarationOpenUntil: string | null;
  declarations: number; proofsWaiting: number;
}
export interface Profiles { year: string; people: ProfileRow[]; counts: { people: number; NEW: number; OLD: number; noPan: number; noDateOfBirth: number }; settings: YearSettings; review: Review }

export interface FileMeta { id: number; fileName: string; mimeType: string; sizeBytes: number; uploadedAt: string | null }
export interface DeclLine {
  id: number; employeeId: number; year: string; kind: string; label: string; group: string | null;
  declaredAmount: number; details: Record<string, unknown>; status: LineStatus; acceptedAmount: number | null; rejectReason: string | null;
  submittedAt: string | null; reviewedAt: string | null; updatedAt: string | null; files: FileMeta[];
  employee?: { id: number; code: string; name: string }; proofHint?: string | null;
}
export interface Kind { kind: string; group: string; label: string; proof: string; section: string | null; newRegime: boolean | null }
export interface Declarations {
  employee: { id: number; code: string; name: string }; year: string; lines: DeclLine[];
  declare: { open: boolean; window: { from: string; to: string; state: WindowState }; reopenedUntil: string | null };
  prove: { open: boolean; window: { from: string; to: string; state: WindowState } };
  kinds: Kind[]; landlordPanAbove: number; form: string | null; previousEmployerForm: string | null;
}
export interface LineInput { kind?: string; amount?: number | string | null; details?: Record<string, unknown> }
export interface ProofQueue { year: string; lines: DeclLine[]; counts: Partial<Record<LineStatus, number>> }

export interface SheetLine { label: string; amount: number | null; rule?: string | null; source?: string | null; url?: string | null; verified?: boolean | null; refused?: boolean }
export interface Computation {
  regime: Regime; grossSalary: number; totalExempt: number; standardDeduction: number; professionalTax: number; incomeFromSalary: number; otherIncome: number; grossTotalIncome: number;
  totalDeductions: number; taxableIncome: number; rebate: number; surcharge: number; cess: number; totalTax: number;
  refused: { key: string; what: string; amount: number; reason: string }[]; lines: SheetLine[]; warnings: string[];
}
export interface TaxSheet {
  employee: { id: number; code: string; name: string }; year: string; month: string; monthLabel: string; months: string[];
  forms: Forms | null; review: Review; run: { id: number; status: string; tds: number | null; source: string | null } | null;
  available: boolean; reason?: string;
  regime?: Regime; cheaper?: Regime; saving?: number; sentence?: string; chosenIsCheaper?: boolean;
  tds?: { thisMonth: number; yearTax: number; projectedTax: number; soFar: number; previousEmployer: number; monthsLeft: number; excess: number };
  noPan?: { applied: boolean; line?: string; section?: string }; panStatus?: string; proofsStatus?: 'OPEN' | 'CLOSED'; city?: string | null; metro?: boolean;
  regimes?: Record<Regime, { projectedTax: number; thisMonthTds: number; projection: SheetLine[]; computation: Computation; noPan: { line: string } | null }>;
  timeline?: { month: string; kind: string; taxable: number; tds: number }[];
  claims?: { lineId: number; kind: string; label: string; declared: number; counted: number; how: string }[];
  warnings?: string[];
}

export interface Challan { id: number; year: string; month: string; challanSerial: string; bsrCode: string; depositDate: string; tax: number; surcharge: number; cess: number; interest: number; fee: number; others: number; total: number; minorHead: string; note: string | null }
export interface ChallanMonth {
  month: string; label: string; run: { id: number; status: string; people: number } | null; deducted: number; deposited: number; balance: number; due: string;
  status: 'NO_RUN' | 'NOT_LOCKED' | 'NO_TDS' | 'PAID' | 'SHORT' | 'UNPAID'; overdue: boolean; warning: string | null; challans: Challan[];
}
export interface Challans { year: string; months: ChallanMonth[]; warnings: string[]; totals: { deducted: number; deposited: number }; review: Review }
export interface ChallanInput { month: string; challanSerial: string; bsrCode: string; depositDate: string; tax: number | string; interest?: number | string; fee?: number | string; others?: number | string; minorHead?: string; note?: string | null }

export interface Quarter {
  year: string; quarter: string; form: string | null; due: string | null; rulesMissing: string | null;
  months: { month: string; label: string; status: string; deducted: number; deposited: number }[];
  deductor: Deductor;
  challans: (Challan & { no: number; deductees: number; allocated: number })[];
  deductees: { challanNo: number | null; month: string; employee: { id: number; code: string; name: string }; pan: string; panStatus: string; sectionCode: string; datePaid: string; amountPaid: number; tds: number; dateDeposited: string | null; remark: string }[];
  annexureII: { employee: { id: number; code: string; name: string }; pan: string; optingOut: string; grossSalary: number; taxableIncome: number; netTax: number; tdsCurrent: number; tdsPrevious: number; shortfall: number }[] | null;
  validation: { level: 'ERROR' | 'WARNING' | 'INFO'; what: string; who: number | null }[];
  totals: { deducted: number; deposited: number; people: number };
  rpu: string | null; fileFormat: string | null; fvuNote: string; review: Review;
}

export interface FormsList {
  year: string; form: string | null; released: boolean; releasedAt: string | null; review: Review;
  people: { employee: { id: number; code: string; name: string }; partB: boolean; partA: boolean; generatedAt: string | null; provisional: boolean; totalTax: number | null; tds: number | null; regime: Regime | null }[];
  unmatched: { id: number; fileName: string; panFound: string | null; uploadedAt: string | null }[];
}

export interface MyYear {
  year: string; settings: YearSettings; review: Review; forms: Forms | null;
  regime: { chosen: Regime; how: string; canChange: boolean; cutoff: string };
  compare: { sentence: string; cheaper: Regime; saving: number; OLD: number; NEW: number; month: string; refused: Record<Regime, { what: string; amount: number; reason: string }[]> } | null;
}

const enc = encodeURIComponent;
export const taxApi = {
  years: () => api.get<{ years: string[]; current: string }>('/tax/years'),
  year: (y: string) => api.get<YearView>(`/tax/years/${y}`),
  putYear: (y: string, body: Partial<Record<'declarationFrom' | 'declarationTo' | 'proofFrom' | 'proofTo' | 'regimeCutoff', string>>) => api.put<YearView>(`/tax/years/${y}`, body),
  caReview: (y: string, body: { reviewed: boolean; note?: string }) => api.post<YearView>(`/tax/years/${y}/ca-review`, body),
  putDeductor: (body: Partial<Deductor>) => api.put<{ deductor: Deductor }>('/tax/deductor', body),
  profiles: (y: string, query = '') => api.get<Profiles>(`/tax/${y}/profiles${query}`),
  putProfile: (y: string, employeeId: number, body: { city?: string | null; metro?: boolean | null; declarationOpenUntil?: string | null; note?: string | null }) => api.put(`/tax/${y}/profiles/${employeeId}`, body),
  setRegime: (y: string, employeeId: number, body: { regime: Regime; reason?: string }) => api.put(`/tax/${y}/profiles/${employeeId}/regime`, body),
  declarations: (y: string, employeeId: number) => api.get<Declarations>(`/tax/${y}/declarations/${employeeId}`),
  addLine: (y: string, employeeId: number, body: LineInput) => api.post<{ line: DeclLine }>(`/tax/${y}/declarations/${employeeId}`, body),
  updateLine: (id: number, body: LineInput) => api.put<{ line: DeclLine }>(`/tax/declaration-lines/${id}`, body),
  removeLine: (id: number) => api.del<{ ok: true }>(`/tax/declaration-lines/${id}`),
  proofs: (y: string, query = '') => api.get<ProofQueue>(`/tax/${y}/proofs${query}`),
  proofFile: (fileId: number) => api.get<TaxFile>(`/tax/proof-files/${fileId}`),
  uploadProof: (lineId: number, body: { fileName: string; contentBase64: string }) => api.post<{ line: DeclLine }>(`/tax/declaration-lines/${lineId}/proofs`, body),
  verify: (lineId: number, body: { acceptedAmount?: number | string | null }) => api.post<{ line: DeclLine }>(`/tax/declaration-lines/${lineId}/verify`, body),
  reject: (lineId: number, body: { reason: string }) => api.post<{ line: DeclLine }>(`/tax/declaration-lines/${lineId}/reject`, body),
  bulkAccept: (y: string, lineIds: number[]) => api.post<{ accepted: number[]; skipped: { id: number; why: string }[] }>(`/tax/${y}/proofs/bulk-accept`, { lineIds }),
  sheet: (y: string, employeeId: number, month?: string) => api.get<TaxSheet>(`/tax/${y}/sheet/${employeeId}${month ? `?month=${enc(month)}` : ''}`),
  challans: (y: string) => api.get<Challans>(`/tax/${y}/challans`),
  addChallan: (y: string, body: ChallanInput) => api.post<{ challan: Challan }>(`/tax/${y}/challans`, body),
  updateChallan: (id: number, body: Partial<ChallanInput>) => api.put<{ challan: Challan }>(`/tax/challans/${id}`, body),
  removeChallan: (id: number) => api.del<{ ok: true }>(`/tax/challans/${id}`),
  quarter: (y: string, q: string) => api.get<Quarter>(`/tax/${y}/quarters/${q}`),
  quarterWorkbook: (y: string, q: string) => api.get<TaxFile>(`/tax/${y}/quarters/${q}/workbook`),
  forms: (y: string) => api.get<FormsList>(`/tax/${y}/forms`),
  generate: (y: string, employeeIds?: number[]) => api.post<{ made: { employeeId: number }[]; skipped: { employeeId: number; why: string }[]; form: string }>(`/tax/${y}/forms/generate`, employeeIds ? { employeeIds } : {}),
  uploadPartA: (y: string, body: { fileName: string; contentBase64: string }) => api.post<{ files: number; matched: { fileId: number; fileName: string; employeeId: number; by: string }[]; unmatched: { fileId: number; fileName: string; panFound: string | null }[] }>(`/tax/${y}/forms/part-a`, body),
  assignPartA: (y: string, fileId: number, employeeId: number) => api.put(`/tax/${y}/forms/part-a/${fileId}`, { employeeId }),
  formFile: (y: string, employeeId: number, part: 'A' | 'B' | 'merged' = 'merged') => api.get<TaxFile>(`/tax/${y}/forms/${employeeId}/file?part=${part}`),
  release: (y: string, release: boolean) => api.post<YearView>(`/tax/${y}/forms/release`, { release }),
};

export const myTaxApi = {
  home: () => api.get<{ years: string[]; current: string; employee: { code: string; name: string } }>('/user/me/tax'),
  year: (y: string) => api.get<MyYear>(`/user/me/tax/${y}`),
  setRegime: (y: string, regime: Regime) => api.put(`/user/me/tax/${y}/regime`, { regime }),
  declarations: (y: string) => api.get<Declarations>(`/user/me/tax/${y}/declarations`),
  addLine: (y: string, body: LineInput) => api.post<{ line: DeclLine }>(`/user/me/tax/${y}/declarations`, body),
  updateLine: (id: number, body: LineInput) => api.put<{ line: DeclLine }>(`/user/me/tax/declarations/${id}`, body),
  removeLine: (id: number) => api.del<{ ok: true }>(`/user/me/tax/declarations/${id}`),
  uploadProof: (lineId: number, body: { fileName: string; contentBase64: string }) => api.post<{ line: DeclLine }>(`/user/me/tax/declarations/${lineId}/proofs`, body),
  proofFile: (fileId: number) => api.get<TaxFile>(`/user/me/tax/proofs/${fileId}`),
  removeProof: (fileId: number) => api.del<{ ok: true }>(`/user/me/tax/proofs/${fileId}`),
  sheet: (y: string, month?: string) => api.get<TaxSheet>(`/user/me/tax/${y}/sheet${month ? `?month=${enc(month)}` : ''}`),
  forms: () => api.get<{ forms: { year: string; form: string; partA: boolean; partB: boolean; provisional: boolean; releasedAt: string | null; totalTax: number | null; tds: number | null }[] }>('/user/me/tax/forms'),
  formFile: (y: string, part: 'A' | 'B' | 'merged' = 'merged') => api.get<TaxFile>(`/user/me/tax/${y}/forms/file?part=${part}`),
};

/** A browser File → { fileName, contentBase64 }. */
export function readFileBase64(file: File): Promise<{ fileName: string; contentBase64: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? '');
      resolve({ fileName: file.name, contentBase64: s.includes(',') ? s.slice(s.indexOf(',') + 1) : s });
    };
    r.onerror = () => reject(r.error ?? new Error('The file could not be read.'));
    r.readAsDataURL(file);
  });
}
