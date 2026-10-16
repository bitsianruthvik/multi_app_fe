import { api } from './client';
import type { Effective } from './leave';

/**
 * Leave requests and balances — the client side of CF_HRMS_HIRING_SPEC.md §22.5.
 * The types are that section's wire shapes.
 *
 * TWO DOORS, ONE SHAPE.
 *   myLeaveApi   the signed-in person's own leave (`/user/me/leave…`, self view).
 *                There is no employee id anywhere in it: the server takes the
 *                person from the login, exactly like `api/self.ts`.
 *   hrLeaveApi   HR's view of everybody in their scope (`/leave/requests…`,
 *                `/leave/balances`, leave view / edit).
 * A request, its preview and its context read the same through either door, so
 * the screens share their parts (`components/leave/*`).
 *
 * EVERY SENTENCE IS THE SERVER'S. The summary, a day's "why", a balance's "why",
 * a check's text and the rule sentence are written by the server
 * (`services/leave/balance.js` is the only place a balance is computed). Nothing
 * here composes one.
 */

export type HalfDay = 'FIRST' | 'SECOND';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface Person {
  employeeId: number;
  name: string;
  employeeCode: string | null;
  positionTitle: string | null;
  departmentName: string | null;
}

export interface LeaveYear {
  /** "2026-27" */ key: string;
  /** "Apr 2026 – Mar 2027" */ label: string;
  from: string;
  to: string;
}

export interface Balance {
  leaveTypeId: number;
  code: string;
  name: string;
  isPaid: boolean;
  /** False for unpaid leave with no limit: `available` is then null. */
  limited: boolean;
  opening: number;
  earned: number;
  taken: number;
  held: number;
  available: number | null;
  /** "12 a year, given in April · 2 carried from 2025-26 · 3 taken · 1 waiting for approval" */
  why: string;
  /** The rule in one sentence (the policy screen's summary). */
  rule: string;
  halfDayAllowed: boolean;
  canAsk: boolean;
  cannotWhy?: string;
}

export interface DayLine {
  date: string;
  weekday: string;
  counts: boolean;
  amount: 0 | 0.5 | 1;
  /** "Sunday — weekly off", "Diwali — holiday", or null for an ordinary working day. */
  why: string | null;
}

export interface Check {
  level: 'BLOCK' | 'NOTE';
  code: string;
  text: string;
}

export interface Preview {
  days: DayLine[];
  quantity: number;
  balance: { before: number | null; after: number | null; why: string };
  checks: Check[];
  approver: Person | null;
  canSubmit: boolean;
  /** "3 days of Casual leave, 12–15 Oct (Sunday is a weekly off). 4 left after this." */
  summary: string;
}

export interface LeaveRequest {
  id: number;
  person: Person;
  leaveType: { id: number; code: string; name: string; isPaid: boolean };
  from: string;
  to: string;
  halfDay: HalfDay | null;
  quantity: number;
  reason: string | null;
  status: LeaveStatus;
  approver: Person | null;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  cancelNote: string | null;
  raisedByHr: boolean;
  can: { approve: boolean; reject: boolean; cancel: boolean };
}

export interface LeaveContext {
  balance: Balance;
  checks: Check[];
  days: DayLine[];
  /** This person's other leave this year. */
  yearSoFar: { leaveTypeName: string; quantity: number; from: string; to: string; status: LeaveStatus }[];
  /** Others with the same approver, or in the same department, off on any of these days. */
  teamOff: { person: Person; from: string; to: string; leaveTypeName: string; status: LeaveStatus }[];
  policyLine: string;
  ruleSentence: string;
  /** Days between asking and the first day of leave. */
  noticeDays: number;
}

export interface RequestWithContext {
  request: LeaveRequest;
  context: LeaveContext;
}

export interface MyLeave {
  /** Absent from the spec; sent when the login has no employee record. */
  linked?: boolean;
  reason?: string;
  year: LeaveYear;
  policy: Effective | null;
  balances: Balance[];
  requests: LeaveRequest[];
  approver: Person | null;
  /** "No shift on your position: Monday to Saturday count as working days." — or null. */
  calendarNote: string | null;
}

/** What is asked for. One day = `from` and `to` the same. */
export interface AskBody {
  leaveTypeId: number;
  from: string;
  to: string;
  halfDay?: HalfDay;
}

/** One row of the HR balances grid: a person, their policy, and one balance per leave type of it. */
export interface BalanceGridRow {
  person: Person;
  policy: { id: number; name: string; status?: string } | null;
  /** The person's own leave year (their policy's start month); null without a policy. */
  year: LeaveYear | null;
  balances: Balance[];
}

export interface BalanceGrid {
  /**
   * The year shown. `?year=` takes the start year ("2026", or "2026-27"); each
   * person's year is the one of their policy that starts in that calendar year.
   */
  year: { key: string; label: string } | null;
  leaveTypes: { id: number; code: string; name: string; isPaid: boolean }[];
  rows: BalanceGridRow[];
}

const qs = (q: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const myLeaveApi = {
  get: (year?: string) => api.get<MyLeave>(`/user/me/leave${qs({ year })}`),
  preview: (body: AskBody) => api.post<Preview>('/user/me/leave/preview', body),
  /** 422 INVALID with `problems` = the BLOCK lines. */
  submit: (body: AskBody & { reason: string }) =>
    api.post<{ request: LeaveRequest }>('/user/me/leave', body).then((r) => r.request),
  cancel: (id: number, note?: string) =>
    api.post<{ request: LeaveRequest }>(`/user/me/leave/${id}/cancel`, { note: note || undefined }).then((r) => r.request),
};

export const hrLeaveApi = {
  list: (filters: Record<string, string>) =>
    api.get<{ items: LeaveRequest[]; total?: number; count?: number }>(`/leave/requests${qs(filters)}`),
  get: (id: number) => api.get<RequestWithContext>(`/leave/requests/${id}`),
  preview: (body: AskBody & { employeeId: number }) => api.post<Preview>('/leave/requests/preview', body),
  submit: (body: AskBody & { employeeId: number; reason: string }) =>
    api.post<{ request: LeaveRequest }>('/leave/requests', body).then((r) => r.request),
  approve: (id: number, note?: string) =>
    api.post<{ request: LeaveRequest }>(`/leave/requests/${id}/approve`, { note: note || undefined }).then((r) => r.request),
  reject: (id: number, note: string) =>
    api.post<{ request: LeaveRequest }>(`/leave/requests/${id}/reject`, { note }).then((r) => r.request),
  cancel: (id: number, note: string) =>
    api.post<{ request: LeaveRequest }>(`/leave/requests/${id}/cancel`, { note }).then((r) => r.request),
  balances: (q: { year?: string; departmentId?: string; q?: string }) =>
    api.get<BalanceGrid>(`/leave/balances${qs(q)}`),
  /** `opening: null` clears HR's number (it is then carried by the rule) — that also needs leave remove. */
  setOpening: (body: { employeeId: number; leaveTypeId: number; yearKey: string; opening: number | null; note: string }) =>
    api.put<{ balance: Balance | null; yearKey: string }>('/leave/balances', body),
};

/* ── words ────────────────────────────────────────────────────────────── */

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: 'Waiting',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

/** "1 day", "0.5 day", "2.5 days" */
export function daysWord(n: number | null | undefined): string {
  if (n == null) return '—';
  const v = Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
  return `${v} ${n === 1 || n === 0.5 ? 'day' : 'days'}`;
}

/** A number of days, no unit: "4", "2.5", "No limit". */
export function numberWord(n: number | null | undefined, limited = true): string {
  if (!limited || n == null) return 'No limit';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

/** "12 Oct 2026" */
export function dateWord(iso: string | null | undefined): string {
  if (!iso) return '—';
  const { y, m, d } = parts(iso);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "12 Oct", "12–15 Oct", "30 Oct – 2 Nov", with the year only when it is not this year. */
export function rangeWord(from: string, to: string, halfDay?: HalfDay | null): string {
  const a = parts(from);
  const b = parts(to || from);
  const thisYear = new Date().getFullYear();
  const yr = (y: number) => (y === thisYear ? '' : ` ${y}`);
  const half = halfDay ? ` (${halfDay === 'FIRST' ? 'first half' : 'second half'})` : '';
  if (from === to || !to) return `${a.d} ${MONTHS[a.m - 1]}${yr(a.y)}${half}`;
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS[a.m - 1]}${yr(a.y)}`;
  if (a.y === b.y) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]}${yr(a.y)}`;
  return `${a.d} ${MONTHS[a.m - 1]} ${a.y} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
}

/** "Casual leave · 3 days · 12–15 Oct" */
export function requestLine(r: Pick<LeaveRequest, 'leaveType' | 'quantity' | 'from' | 'to' | 'halfDay'>): string {
  return `${r.leaveType.name} · ${daysWord(r.quantity)} · ${rangeWord(r.from, r.to, r.halfDay)}`;
}

/** "Ravi Kumar · Operator · Production" */
export function personLine(p: Person | null | undefined): string {
  if (!p) return '';
  return [p.name, p.positionTitle, p.departmentName].filter(Boolean).join(' · ');
}

/** Today in the browser's own calendar, YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
