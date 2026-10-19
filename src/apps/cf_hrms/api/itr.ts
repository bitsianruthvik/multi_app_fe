/**
 * My tax › File my return (CF_HRMS_HIRING_SPEC.md §25.6, P4 the ITR helper, option A).
 *
 * The person's OWN return, worked out by the server (services/tax/itr.js). Like every
 * self-view module there is no employee id anywhere here: the server answers for the login
 * and for nobody else, and nobody else (HR, the Owner) can read it. Nothing is filed or sent
 * anywhere — the PDF and the JSON are for the person to upload on incometax.gov.in.
 */
import { api } from './client';

export type Regime = 'OLD' | 'NEW';
export type FormCode = 'ITR1' | 'ITR2';
export type Source = 'EMPLOYER' | 'TYPED';

export interface ItrYear {
  year: string;
  assessmentYear: string;
  act: string;
  filedFrom: string;
  dueDate: string;
  yearOver: boolean;
  formsPublished: boolean;
  formsNote: string;
  payslipMonths: number;
  draft: { status: 'DRAFT' | 'FINALISED'; updatedAt: string } | null;
  jsonAvailable: boolean;
  certificate: string;
}

export interface Address { flat?: string | null; premises?: string | null; road?: string | null; area?: string | null; city?: string | null; stateCode?: string | null; pinCode?: string | null }
export interface PersonalPart {
  residentialStatus?: 'RESIDENT' | 'RNOR' | 'NON_RESIDENT';
  dateOfBirth?: string | null;
  agriculturalIncome?: number | null;
  isDirector?: boolean;
  unlistedShares?: boolean;
  foreignAssetsOrIncome?: boolean;
  broughtForwardLosses?: boolean;
  fatherName?: string | null;
  mobile?: string | null;
  email?: string | null;
  employerCategory?: string;
  address?: Address | null;
}
export interface PreviousEmployer { name?: string | null; tan?: string | null; salary?: number | null; professionalTax?: number | null; tds?: number | null }
export interface EmployerPart {
  useTyped?: boolean;
  matchesCertificate?: boolean;
  employerName?: string | null;
  tan?: string | null;
  grossSalary?: number | null;
  perquisites?: number | null;
  exemptHra?: number | null;
  exemptLta?: number | null;
  exemptOther?: number | null;
  exemptOtherSection?: string;
  professionalTax?: number | null;
  tds?: number | null;
  employerNps?: number | null;
  /** The year's Basic and DA (empty = from the released payslips): the 80CCD(2) limit and the HRA working. */
  basic?: number | null;
  da?: number | null;
  previous?: PreviousEmployer | null;
}
export interface HouseProperty { kind: 'LET_OUT' | 'SELF_OCCUPIED'; name?: string | null; rentReceived?: number | null; municipalTaxPaid?: number | null; interest?: number | null; lenderName?: string | null }
export interface CapitalGains { stcg111A?: number | null; ltcg112A?: number | null; ltcg112?: number | null; stcgOther?: number | null; ltcg112ASale?: number | null; ltcg112ACost?: number | null }
export interface IncomePart {
  savingsInterest?: number | null;
  depositInterest?: number | null;
  dividends?: number | null;
  other?: { description?: string | null; amount?: number | null }[];
  houseProperties?: HouseProperty[];
  capitalGains?: CapitalGains;
}
/* The details the ITR-1's schedules ask for (old regime). A list, when given, is the claim. */
export interface Item80C { description?: string | null; documentNo?: string | null; amount?: number | null }
export interface Policy80D { for: 'SELF_FAMILY' | 'PARENTS'; insurer?: string | null; policyNo?: string | null; amount?: number | null }
export interface Loan80E { lenderType: 'B' | 'I'; lender?: string | null; loanAccount?: string | null; loanDate?: string | null; loanAmount?: number | null; outstanding?: number | null; interest?: number | null }
export type DonationCategory = 'NO_LIMIT_100' | 'NO_LIMIT_50' | 'LIMIT_100' | 'LIMIT_50';
export interface Donation80G {
  name?: string | null; pan?: string | null; address?: string | null; city?: string | null; stateCode?: string | null; pinCode?: string | null;
  category: DonationCategory; cash?: number | null; otherMode?: number | null; transactionRef?: string | null; ifsc?: string | null; arn?: string | null; eligible?: number | null;
}
export interface HraPart { placeOfWork?: string | null; rentPaid?: number | null; received?: number | null }
export interface DeductionsPart {
  '80C'?: number | null;
  '80CItems'?: Item80C[];
  '80CCD1B'?: number | null;
  '80D'?: { selfFamily?: number | null; parents?: number | null; selfFamilySenior?: boolean | null; parentsSenior?: boolean; preventive?: number | null; policies?: Policy80D[] };
  '80E'?: number | null;
  '80ELoans'?: Loan80E[];
  '80G'?: number | null;
  '80GDonations'?: Donation80G[];
  hra?: HraPart;
}
export interface Challan { kind: 'ADVANCE' | 'SELF_ASSESSMENT'; bsrCode?: string | null; date?: string | null; challanNo?: string | null; amount?: number | null }
export interface OtherTds { kind: 'TDS' | 'TCS'; deductor?: string | null; tan?: string | null; section?: string | null; income?: number | null; amount?: number | null }
export interface TaxesPart { paid?: Challan[]; otherTds?: OtherTds[] }
export interface BankPart { bankName?: string | null; ifsc?: string | null; account?: string | null; type?: 'SAVINGS' | 'CURRENT' }
export interface ChoicesPart { form?: FormCode | null; regime?: Regime | null; filingDate?: string | null }

export interface ItrParts {
  personal?: PersonalPart;
  employer?: EmployerPart;
  income?: IncomePart;
  deductions?: DeductionsPart;
  taxes?: TaxesPart;
  bank?: BankPart;
  choices?: ChoicesPart;
}

export interface Line { label: string; amount: number | null; rule?: string | null; source?: string | null; url?: string | null; verified?: boolean | null; refused?: boolean }
export interface Computation {
  regime: Regime;
  grossSalary: number;
  netSalary: number;
  standardDeduction: number;
  professionalTax: number;
  incomeFromSalary: number;
  otherIncome: number;
  houseProperty: number;
  hpLossCarriedForward: number;
  grossTotalIncome: number;
  totalDeductions: number;
  taxableIncome: number;
  slabTax: number;
  specialRateTax: number;
  rebate: number;
  surcharge: number;
  cess: number;
  totalTax: number;
  refused: { key: string; what: string; amount: number; reason: string }[];
  lines: Line[];
  warnings: string[];
}
export interface Figure { value: number; source: Source }
export interface ScheduleRow { label: string; amount: number | null; source?: Source; rate?: number }
export interface ItrResult {
  year: string;
  assessmentYear: string;
  act: string;
  forms: { certificate: { label: string }; annualStatement: { label: string } };
  regime: Regime;
  regimeChosen: Regime | null;
  compare: { cheaper: Regime; difference: number; sentence: string; oldTax: number; newTax: number };
  old: Computation;
  new: Computation;
  computation: Computation;
  form: {
    suggested: FormCode; form: FormCode; chosen: FormCode | null; note: string | null; reason: string;
    checks: { key: string; ok: boolean; text: string }[]; published: boolean; formsNote: string;
  };
  salary: {
    fromPayroll: boolean; employerName: string | null; tan: string | null;
    grossSalary: Figure; perquisites: Figure; exemptHra: Figure; exemptLta: Figure; exemptOther: Figure; professionalTax: Figure; tds: Figure; employerNps: Figure;
    basic: Figure; da: Figure; basicDa: Figure; hraReceived: Figure;
    previous: PreviousEmployer | null;
  };
  prepaid: { salaryTds: number; otherTds: number; tcs: number; advance: number; selfAssessment: number; total: number };
  interest: { a: number; b: number; c: number; fee: number; total: number; notes: string[]; dueDate: string; filingDate: string; late: boolean };
  filingDate: string;
  payable: number;
  refund: number;
  sentence: string;
  warnings: string[];
  unverifiedRules: string[];
  schedules: { BTI: ScheduleRow[]; BTTI: ScheduleRow[] };
}
export interface EmployerLive {
  source: 'PAYROLL'; months: number; monthList: string[]; employerName: string | null;
  grossSalary: number; professionalTax: number; tds: number; pfEmployee: number; hraReceived: number; basic: number; da: number; provisional: boolean; note: string;
}
export interface GuideScreen { screen: string; items: { field: string; value: string | number | null; note: string | null }[] }
export interface ItrReturn {
  year: string;
  status: 'NEW' | 'DRAFT' | 'FINALISED';
  saved: boolean;
  updatedAt: string | null;
  finalisedAt: string | null;
  person: { name: string; code: string; panMasked: string | null; hasPan: boolean };
  draft: Omit<ItrParts, 'bank'> & { bank: { bankName: string | null; ifsc: string | null; type: 'SAVINGS' | 'CURRENT'; accountMasked: string | null; hasAccount: boolean } };
  employer: EmployerLive;
  result: ItrResult;
  json: { available: boolean; form: FormCode | null; version: string | null; note: string | null };
  guide: { form: FormCode; intro: string; screens: GuideScreen[] };
  notice: string;
}
export interface ItrFile { fileName: string; mimeType: string; contentBase64: string; version?: string }

const y = (year: string) => `/user/me/itr/${encodeURIComponent(year)}`;
export const itrApi = {
  years: () => api.get<{ years: ItrYear[]; today: string }>('/user/me/itr/years'),
  get: (year: string) => api.get<ItrReturn>(y(year)),
  save: (year: string, parts: ItrParts) => api.put<ItrReturn>(y(year), parts),
  finalise: (year: string) => api.post<ItrReturn>(`${y(year)}/finalise`),
  remove: (year: string) => api.del<{ removed: number }>(y(year)),
  summaryPdf: (year: string) => api.get<ItrFile>(`${y(year)}/summary.pdf`),
  returnJson: (year: string) => api.get<ItrFile>(`${y(year)}/return.json`),
};

/** ₹ in Indian grouping: 1234567 → "₹12,34,567". */
export function inr(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  const s = String(Math.abs(Math.round(n)));
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${n < 0 ? '−' : ''}₹${rest ? `${rest},` : ''}${last3}`;
}

/** The ITR's state codes (the ones a Karni employee will need first, then the rest). */
export const STATE_CODES: [string, string][] = [
  ['36', 'Telangana'], ['02', 'Andhra Pradesh'], ['15', 'Karnataka'], ['19', 'Maharashtra'], ['29', 'Tamil Nadu'], ['09', 'Delhi'],
  ['01', 'Andaman and Nicobar'], ['03', 'Arunachal Pradesh'], ['04', 'Assam'], ['05', 'Bihar'], ['06', 'Chandigarh'], ['07', 'Dadra Nagar Haveli'], ['08', 'Daman and Diu'],
  ['10', 'Goa'], ['11', 'Gujarat'], ['12', 'Haryana'], ['13', 'Himachal Pradesh'], ['14', 'Jammu and Kashmir'], ['16', 'Kerala'], ['17', 'Lakshadweep'], ['18', 'Madhya Pradesh'],
  ['20', 'Manipur'], ['21', 'Meghalaya'], ['22', 'Mizoram'], ['23', 'Nagaland'], ['24', 'Odisha'], ['25', 'Puducherry'], ['26', 'Punjab'], ['27', 'Rajasthan'], ['28', 'Sikkim'],
  ['30', 'Tripura'], ['31', 'Uttar Pradesh'], ['32', 'West Bengal'], ['33', 'Chhattisgarh'], ['34', 'Uttarakhand'], ['35', 'Jharkhand'], ['37', 'Ladakh'],
];
