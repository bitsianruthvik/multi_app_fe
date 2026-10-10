import { api, type ApiProblem } from './client';
import { saveBlob } from './documents';

/**
 * Hiring on a vacant position — the client side of CF_HRMS_HIRING_SPEC.md §2.4.
 * The types below are that section's, verbatim.
 *
 *   JD  ->  OFFER  ->  APPOINTMENT  ->  DONE
 *                 \->  CLOSED (DECLINED | LAPSED | CANCELLED), from any stage before DONE
 *
 * THE CANDIDATE IS A DRAFT UNTIL DONE: no employee, no employee code, not in
 * any headcount. The appointment step is the one write that creates the
 * employee, issues the code and puts the person in the position — together.
 *
 * `can` and `missing` are the server's. A screen enables a button from `can`
 * and says what is missing from `missing`; it never works either out itself.
 */

export type HiringStage = 'JD' | 'OFFER' | 'APPOINTMENT' | 'DONE' | 'CLOSED';

export interface HiringSummary {
  id: number; stage: HiringStage; closeReason: string | null; refNo: string | null;
  positionId: number; positionCode: string | null; roleId: number; roleTitle: string;
  departmentName: string | null; shift: { id: number; code: string; name: string } | null;
  candidateName: string | null; offerAccepted: boolean;
  proposedJoiningDate: string | null; createdAt: string; updatedAt: string;
  employee: { id: number; employeeCode: string; fullName: string } | null;
  /** One short line for a row: "Offer sent to Pabitra Kumar Panda" / "Job description to confirm". */
  statusLine: string;
}

export interface Hiring extends HiringSummary {
  candidate: { salutation: string | null; name: string | null; phone: string | null; email: string | null;
               address: string | null; gender: string | null; dateOfBirth: string | null };
  terms: { designation: string | null; departmentName: string | null; reportingToTitle: string | null;
           reportingToName: string | null; placeOfPosting: string | null; proposedJoiningDate: string | null;
           offerDate: string | null; offerValidUntil: string | null; annualCtc: number | null;
           probationMonths: number; noticeDaysProbation: number; noticeDaysConfirmed: number;
           signatoryName: string | null; signatoryDesignation: string | null };
  offerAcceptedOn: string | null; joiningDate: string | null; appointmentDate: string | null;
  /** Not in §2.4: the note typed when the hiring was closed. The backend sends it; shown when present. */
  closeNote?: string | null;
  jd: { documentId: number; generatedAt: string } | null;
  letters: LetterMeta[];                       // every version, newest first
  /** What the next action needs and does not have yet, in plain words. Empty = ready. */
  missing: { offerLetter: string[]; appoint: string[] };
  /** Which actions the server will accept right now. */
  can: { edit: boolean; confirmJd: boolean; generateOffer: boolean; acceptOffer: boolean; appoint: boolean; close: boolean };
}

export interface LetterMeta { id: number; kind: 'OFFER' | 'APPOINTMENT'; version: number; isCurrent: boolean;
                              fileName: string; sizeBytes: number; generatedAt: string; generatedByName: string | null }

/** What other reads gain (§2.5): the OPEN hiring on a position, or null. */
export interface HiringRef {
  id: number;
  stage: HiringStage;
  candidateName: string | null;
  statusLine: string;
}

/** The words every list uses for a vacant position that is being hired for: "Hiring · Asha Rao". */
export const hiringLabel = (h: { candidateName: string | null }): string =>
  h.candidateName?.trim() ? `Hiring · ${h.candidateName.trim()}` : 'Hiring';

/**
 * A person appointed to a position who has not joined yet. Until `date` the
 * position is still VACANT in every count; it is only drawn with who is coming.
 */
export interface JoiningRef {
  employeeId: number;
  employeeCode: string | null;
  name: string;
  /** YYYY-MM-DD */
  date: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayParts = (date: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return m ? { y: m[1], month: MONTHS[Number(m[2]) - 1] ?? m[2], d: String(Number(m[3])) } : null;
};
/** "Joins 23 Oct · Asha Rao" — the quiet row text, beside "Hiring · name". */
export const joiningLabel = (j: JoiningRef): string => {
  const p = dayParts(j.date);
  return `Joins ${p ? `${p.d} ${p.month.slice(0, 3)}` : j.date} · ${j.name}`;
};
/** "Asha Rao joins on 23 October 2026" — the sentence of the vacant-position views. */
export const joiningSentence = (j: JoiningRef): string => {
  const p = dayParts(j.date);
  return `${j.name} joins on ${p ? `${p.d} ${p.month} ${p.y}` : j.date}`;
};
/** What a vacant row says: who is joining, who is being hired, or null for plain "Vacant". */
export const vacantLabel = (p: { hiring?: HiringRef | null; joining?: JoiningRef | null }): string | null =>
  p.joining ? joiningLabel(p.joining) : p.hiring ? hiringLabel(p.hiring) : null;

/** A placeholder as it is typed into the Word file. The server sends the bare key. */
export const braced = (key: string): string => (key.startsWith('{') ? key : `{${key}}`);

export type CloseReason = 'DECLINED' | 'LAPSED' | 'CANCELLED';
export const CLOSE_REASON_LABEL: Record<CloseReason, string> = {
  DECLINED: 'The candidate declined',
  LAPSED: 'The offer lapsed',
  CANCELLED: 'Hiring cancelled',
};

/**
 * `PUT /hirings/:id` — "any candidate / terms field of §2.2 in camelCase".
 * Flat, by the column names; the read model nests the same values under
 * `candidate` and `terms`.
 */
export interface HiringInput {
  candidateSalutation?: string | null;
  candidateName?: string | null;
  candidatePhone?: string | null;
  candidateEmail?: string | null;
  candidateAddress?: string | null;
  candidateGender?: string | null;
  candidateDateOfBirth?: string | null;
  designation?: string | null;
  departmentName?: string | null;
  reportingToTitle?: string | null;
  reportingToName?: string | null;
  placeOfPosting?: string | null;
  proposedJoiningDate?: string | null;
  offerDate?: string | null;
  offerValidUntil?: string | null;
  annualCtc?: number | null;
  probationMonths?: number | null;
  noticeDaysProbation?: number | null;
  noticeDaysConfirmed?: number | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
}

/** A file as the hiring routes send it. */
export interface HiringFile { fileName: string; mimeType: string; contentBase64: string }

export interface HiringSettings {
  companyLegalName: string | null;
  signatoryName: string | null;
  signatoryDesignation: string | null;
  placeOfPosting: string | null;
  jurisdiction: string | null;
  probationMonths: number | null;
  noticeDaysProbation: number | null;
  noticeDaysConfirmed: number | null;
  offerValidDays: number | null;
}

export type LetterKind = 'OFFER' | 'APPOINTMENT';
export interface LetterTemplate {
  kind: LetterKind;
  fileName: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
  /** No file of the company's own: the plain built-in letter is used. */
  builtIn: boolean;
}
export interface LetterPlaceholder { key: string; label: string; example: string }

export interface AppointResult {
  hiring: Hiring;
  employee: { id: number; employeeCode: string; fullName: string };
  assignmentId: number;
  letter: LetterMeta;
  unfilled: string[];
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const hiringApi = {
  list: (f: { status?: 'open' | 'done' | 'closed' | 'all'; positionId?: number } = {}) =>
    api.get<{ hirings: HiringSummary[] }>(`/hirings${qs(f)}`),
  get: (id: number) => api.get<{ hiring: Hiring }>(`/hirings/${id}`),
  /** Starts at stage JD. 409 POSITION_FILLED · HIRING_OPEN (names the open one) · POSITION_CLOSED. */
  start: (positionId: number) => api.post<{ hiring: Hiring }>(`/positions/${positionId}/hiring`, {}),
  confirmJd: (id: number) => api.post<{ hiring: Hiring }>(`/hirings/${id}/confirm-jd`, {}),
  update: (id: number, body: HiringInput) => api.put<{ hiring: Hiring }>(`/hirings/${id}`, body),
  /** Issues the reference number on the first call; every call is a new version. */
  offerLetter: (id: number) =>
    api.post<{ hiring: Hiring; letter: LetterMeta; unfilled: string[] }>(`/hirings/${id}/offer-letter`, {}),
  acceptOffer: (id: number, acceptedOn?: string) =>
    api.post<{ hiring: Hiring }>(`/hirings/${id}/accept-offer`, acceptedOn ? { acceptedOn } : {}),
  /** ONE transaction: the appointment letter, the employee, the employee code, the assignment. */
  appoint: (id: number, body: { joiningDate: string; appointmentDate?: string }) =>
    api.post<AppointResult>(`/hirings/${id}/appoint`, body),
  close: (id: number, body: { reason: CloseReason; note?: string }) =>
    api.post<{ hiring: Hiring }>(`/hirings/${id}/close`, body),

  letterFile: (id: number, letterId: number) => api.get<HiringFile>(`/hirings/${id}/letters/${letterId}/file`),
  jdFile: (id: number) => api.get<HiringFile>(`/hirings/${id}/jd/file`),

  settings: () => api.get<{ settings: HiringSettings }>('/hiring/settings'),
  saveSettings: (body: Partial<HiringSettings>) => api.put<{ settings: HiringSettings }>('/hiring/settings', body),
  templates: () => api.get<{ templates: LetterTemplate[] }>('/hiring/templates'),
  uploadTemplate: (kind: LetterKind, body: { fileName: string; contentBase64: string }) =>
    api.put<{ template: LetterTemplate; placeholders: string[]; unknown: string[] }>(`/hiring/templates/${kind}`, body),
  templateFile: (kind: LetterKind) => api.get<HiringFile>(`/hiring/templates/${kind}/file`),
  placeholders: () => api.get<{ placeholders: LetterPlaceholder[] }>('/hiring/placeholders'),
};

/** Turns a `{ fileName, mimeType, contentBase64 }` answer into a browser download. */
export function saveHiringFile(file: HiringFile): void {
  const bytes = Uint8Array.from(atob(file.contentBase64), (ch) => ch.charCodeAt(0));
  saveBlob(new Blob([bytes], { type: file.mimeType || 'application/octet-stream' }), file.fileName);
}

/** Reads a chosen file as bare base64 (no `data:` prefix), for the template upload. */
export function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma > -1 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * The id of the hiring a 409 `HIRING_OPEN` is about. The contract says the
 * refusal "returns the open one's id" without naming the field; the backend
 * sends it as `existing.id` and `detail.hiringId`. Other likely spellings are
 * read too, and a caller that gets null asks the list instead.
 */
export function openHiringIdOf(error: unknown): number | null {
  const e = error as ApiProblem | null;
  if (!e || e.code !== 'HIRING_OPEN') return null;
  const b = e.body ?? {};
  const existing = b.existing as { id?: unknown } | undefined;
  const detail = b.detail as { hiringId?: unknown } | undefined;
  const nested = b.hiring as { id?: unknown } | undefined;
  const raw = existing?.id ?? detail?.hiringId ?? b.hiringId ?? nested?.id ?? b.openHiringId ?? b.id;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The server's code on a refusal, if it sent one. */
export const errorCode = (error: unknown): string | undefined => (error as ApiProblem | null)?.code;

/** "12 Aug 2026" from an ISO date or timestamp; the text itself when it does not parse. */
export function niceDate(value: string | null | undefined): string {
  if (!value) return '';
  // A bare date is that calendar day; a timestamp is shown as the day it was HERE.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = iso ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const todayIso = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
