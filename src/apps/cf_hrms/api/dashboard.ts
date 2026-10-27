import { api } from './client';
import type { FileOut } from './attendance';

/**
 * The management dashboard, the manpower report and a login's own notifications — the client side of
 * CF_HRMS_HIRING_SPEC.md §42 (services/dashboard/, services/notifications.js on the server).
 *
 * Every tile is there only with its right; a missing one is named in `hidden` (a sentence), never a zero.
 * `department`: one or more org units, comma-separated, each with everything under it (spec §34.2).
 */

export interface Counts { required: number; filled: number; vacant: number; present: number | null; leave: number; absent: number; off: number; notPunched: number; short: number }

export interface UnitRow { unitId: number; name: string; kind: string | null; itself?: boolean }

export interface Dashboard {
  month: string; label: string; on: string; today: string; months: string[]; live: boolean; liveFrom: string | null;
  filters: { department: number[]; shift: number | null };
  shifts: { id: number; code: string | null; name: string }[];
  scope: 'COMPANY' | 'UNITS';
  breakdown: { id: number; name: string; kind: string | null; itself: boolean }[];
  hidden: Partial<Record<'headcount' | 'absenteeism' | 'overtime' | 'manpower' | 'payroll', string>>;
  headcount?: {
    total: number;
    byUnit: (UnitRow & { count: number })[];
    byKind: { kind: string; count: number }[];
    byRole: { roleId: number | null; title: string; count: number }[];
    byShift: { shiftId: number | null; name: string; count: number }[];
    joiners: { employeeId: number; name: string; code: string | null; date: string }[];
    leavers: { employeeId: number; name: string; code: string | null; date: string }[];
    trend: { month: string; count: number }[];
  };
  absenteeism?: {
    live: boolean; status: string;
    today: { date: string; people: number; present: number; absent: number; leave: number; off: number; notPunched: number; rate: number | null };
    month: { absentDays: number; presentDays: number; leaveDays: number; rate: number | null };
    byUnit: (UnitRow & { absentDays: number; presentDays: number; leaveDays: number; rate: number | null })[];
    daily: { date: string; absent: number; rate: number | null }[];
    trend: { month: string; rate: number | null; absentDays: number }[];
  };
  overtime?: {
    month: { hours: number };
    byUnit: (UnitRow & { hours: number; cost?: number | null })[];
    trend: { month: string; hours: number; cost: number | null }[];
    cost: number | null;
    costHidden?: boolean;
  };
  manpower?: {
    date: string; attendanceKnown: boolean; totals: Counts;
    byUnit: (UnitRow & Counts)[];
    byShift: ({ shiftId: number | null; name: string } & Counts)[];
  };
  payroll?: {
    run: { id: number; status: string; people: number } | null;
    month: { cost: number; gross: number; people: number };
    byUnit: (UnitRow & { cost: number; people: number })[];
    trend: { month: string; cost: number | null; status: string | null }[];
  };
  drill: Record<'headcount' | 'absenteeism' | 'overtime' | 'manpower' | 'payroll', string>;
}

export type ChairState = 'VACANT' | 'PRESENT' | 'LEAVE' | 'ABSENT' | 'OFF' | 'NOT_PUNCHED' | 'FILLED';
export interface Manpower {
  date: string; today: string; live: boolean; liveFrom: string | null; attendanceKnown: boolean; note: string | null;
  filters: { department: number[]; shift: number | null };
  shiftsAll: { id: number; code: string | null; name: string }[];
  totals: Counts;
  units: { id: number; code: string | null; name: string; kind: string | null; parentId: number | null; depth: number; path: string; own: Counts; total: Counts }[];
  roles: { roleId: number | null; title: string; code: string | null; counts: Counts }[];
  shifts: { shiftId: number | null; name: string; code: string | null; counts: Counts }[];
  positions: {
    id: number; code: string | null; title: string; roleTitle: string | null; unitId: number | null; unitName: string | null; kind: string | null;
    shiftId: number | null; shiftName: string | null; employeeId: number | null; employeeName: string | null; employeeCode: string | null; state: ChairState;
  }[];
}

export interface AppNotification {
  id: number; kind: string; title: string; body: string; link: string | null; read: boolean; readAt: string | null; createdAt: string | null;
  data: { date?: string; shift?: string; shiftId?: number; count?: number; forWhom?: 'HR' | 'MANAGER'; people?: { employeeId: number; code: string | null; name: string; unit: string | null; why: string }[] } | null;
}

const qs = (o: Record<string, string | number | null | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join('&')}` : '';
};

export interface DashQuery { month?: string; department?: string; shift?: number | string | null }
export interface ManpowerQuery { date?: string; department?: string; shift?: number | string | null }

export const dashboardApi = {
  get: (q: DashQuery = {}) => api.get<Dashboard>(`/dashboard${qs({ ...q })}`),
  manpower: (q: ManpowerQuery = {}) => api.get<Manpower>(`/dashboard/manpower${qs({ ...q })}`),
  manpowerWorkbook: (q: ManpowerQuery = {}) => api.get<FileOut>(`/dashboard/manpower/workbook${qs({ ...q })}`),
};

/** Fired when the login reads notifications, so the bell re-reads its count at once. */
export const NOTIFICATIONS_CHANGED = 'cf-hrms-notifications-changed';

export const notificationsApi = {
  list: (unreadOnly = false) => api.get<{ items: AppNotification[]; unread: number }>(`/notifications${unreadOnly ? '?unread=1' : ''}`),
  read: (id: number) => api.post<{ updated: number }>(`/notifications/${id}/read`, {}),
  readAll: () => api.post<{ updated: number }>('/notifications/read-all', {}),
};

/* ── words ─────────────────────────────────────────────────────────────── */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-10' → 'Oct'. */
export const shortMonth = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1];
/** 3017570 → '₹30.18 L'; 52000 → '₹52,000'. */
export function rupeesShort(n: number | null | undefined): string {
  if (n == null) return '—';
  const v = Number(n);
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
}
export const CHAIR_WORDS: Record<ChairState, string> = {
  VACANT: 'Vacant', PRESENT: 'Present', LEAVE: 'On leave', ABSENT: 'Absent', OFF: 'Day off', NOT_PUNCHED: 'Not punched', FILLED: 'Filled',
};
