import { api } from './client';
import type { Person } from './leaveRequests';

/**
 * Attendance — the client side of CF_HRMS_HIRING_SPEC.md §28 (services/attendance/ on the server).
 *
 *   attendanceApi   HR (the `attendance` area: view / edit / remove / upload)
 *   myAttendanceApi the signed-in person's own month (`/user/me/attendance`, self view, no ids)
 *   teamAttendanceApi a manager's team (`/user/me/team/attendance`, the §7 rule on the server)
 *
 * Every sentence (a day's why, a policy's rules, a penalty's reason) is written by the server.
 * Times are WALL-CLOCK text 'YYYY-MM-DD HH:MM:SS' where the punch happened.
 */

export type DayStatus = 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'LEAVE' | 'WEEKLY_OFF' | 'HOLIDAY' | 'UNKNOWN';

export interface Cell {
  date: string;
  letter: string;
  status?: DayStatus;
  late?: boolean;
  missing?: boolean;
  overtime?: number;
  inTime?: string | null;
  outTime?: string | null;
  why?: string | null;
  source?: string;
}

export interface MonthTotals {
  employeeId: number; employeeCode: string | null; name: string;
  daysInEmployment: number; recordedDays: number; present: number; halfDays: number; absent: number; absentLop: number;
  leave: { paid: number; unpaid: number; byType: { leaveTypeId: number | null; code: string | null; name: string; isPaid: boolean; days: number }[] };
  weeklyOffs: number; holidays: number; unknownDays: number;
  overtime: { minutes: number; hours: number; multiplier: number | null };
  penalties: { leaveDays: number; lopDays: number; amount: number; warnings: number };
  lopDays: number; payableDays: number; ncpDays: number; esiDays: number; lateMarks: number; lateMinutes: number; earlyMinutes: number;
}

export interface MonthGrid {
  month: string; label: string;
  dates: { date: string; day: number; weekday: string }[];
  rows: { person: Person; cells: Cell[]; totals: MonthTotals | null }[];
  legend: { letter: string; words: string }[];
  status: 'OPEN' | 'CLOSED'; final?: boolean; live: boolean; liveFrom?: string | null;
  team?: number;
}

export type BoardState = 'PRESENT' | 'LATE' | 'HALF' | 'ABSENT' | 'LEAVE' | 'OFF' | 'NOT_PUNCHED';
export interface TodayBoard {
  date: string; now: string; live: boolean; liveFrom: string | null;
  counts: { people: number; present: number; late: number; absent: number; leave: number; off: number; notPunched: number; missing: number };
  departments: {
    department: string;
    counts: { people: number; present: number; late: number; absent: number; leave: number; off: number; notPunched: number };
    people: { person: Person; state: BoardState; status: DayStatus | null; inTime: string | null; outTime: string | null; lateMinutes: number; missing: boolean; why: string | null; shift: string | null }[];
  }[];
}

export interface Punch { at: string; direction: 'IN' | 'OUT' | 'UNKNOWN'; method: string; source: string }

export interface PersonDay {
  date: string; weekday: string; letter: string; status: DayStatus | null;
  inTime: string | null; outTime: string | null; workedMinutes: number | null; lateMinutes: number; earlyMinutes: number; overtimeMinutes: number;
  late: boolean; missing: boolean; why: string | null; source: string | null; shift: string | null; punches: Punch[]; future: boolean;
}

export interface Penalty {
  id: number; person: Person; date: string; month: string; rule: string; action: 'LEAVE' | 'LOP' | 'AMOUNT' | 'WARNING'; actionWords: string;
  quantity: number; amount: number; leaveType: { id: number; name: string | null } | null; leaveRequestId: number | null;
  dates: string[]; reason: string; status: 'APPLIED' | 'WAIVED' | 'REVERSED'; statusNote: string | null; decidedAt: string | null;
}

export type RequestKind = 'CORRECTION' | 'SHORT_PERMISSION' | 'ON_DUTY';
export interface MyRequest {
  id: number; kind: RequestKind; date: string; status: string; minutes: number | null; requestedStatus: string | null;
  inTime: string | null; outTime: string | null; reason: string; decisionNote: string | null; submittedAt: string | null;
}

export interface PersonMonth {
  month: string; label: string; person: Person | null; liveFrom: string | null; live: boolean;
  shift: { id: number; name: string } | null;
  policy: { line: string; sentences: string[]; shortPermission: { perMonth: number; maxMinutes: number } | null };
  days: PersonDay[]; summary: MonthTotals | null; status: 'OPEN' | 'CLOSED'; penalties: Penalty[]; requests: MyRequest[];
  approver: Person | null;
  webPunch: { enabled: boolean; needsLocation: boolean; today: Punch[]; next: 'IN' | 'OUT' };
  lateWords: string | null;
}

export interface AttRequest {
  id: number; kind: RequestKind; kindWords: string; title: string; person: Person; date: string; requestedStatus: string | null;
  inTime: string | null; outTime: string | null; minutes: number | null; reason: string; status: string; approver: Person | null;
  submittedAt: string | null; decidedAt: string | null; decidedBy: string | null; decisionNote: string | null; raisedByHr: boolean;
  can: { approve: boolean; reject: boolean; cancel: boolean };
}
export interface AttContext {
  day: { status: DayStatus; inTime: string | null; outTime: string | null; workedMinutes: number | null; lateMinutes: number; earlyMinutes: number; why: string | null; source: string } | null;
  shift: { name: string; plan: string } | null;
  punches: Punch[]; policyLine: string; policySentences: string[];
  lateMarksThisMonth: { date: string; minutes: number }[];
  earlierThisMonth: { id: number; kind: RequestKind; title: string; date: string; status: string }[];
}
export interface AttRequestWithContext { request: AttRequest; context: AttContext }

export interface AskBody { kind: RequestKind; date: string; reason: string; status?: 'PRESENT' | 'HALF_DAY' | null; inTime?: string | null; outTime?: string | null; minutes?: number | null }

export interface Action { type: 'LEAVE' | 'LOP' | 'AMOUNT' | 'WARNING'; days?: number; leaveTypeIds?: number[]; elseLop?: boolean; amount?: number }
export interface Rules {
  graceInMinutes: number | null; graceOutMinutes: number | null;
  lateMarks: { count: number; includeEarlyOut: boolean; action: Action } | null;
  shortDay: { halfDayBelowHours: number | null; absentBelowHours: number | null } | null;
  missingPunch: { treatAs: 'HALF_DAY' | 'ABSENT' | 'ASK'; askWithinDays: number | null } | null;
  absentIsLop: boolean; sandwich: boolean;
  shortPermission: { perMonth: number; maxMinutes: number } | null;
  overtime: { afterMinutes: number; rateMultiplier: number; minMinutes: number; maxMinutesPerDay: number | null } | null;
}
export interface AssignmentRow { id: number; scope: 'COMPANY' | 'LOCATION' | 'ROLE' | 'LABEL'; locationId: number | null; roleId: number | null; labelId: number | null; policyId: number; target: string }
export interface AttPolicy { id: number; code: string | null; name: string; description: string | null; status: string; rules: Rules; sentences: string[]; assignments: AssignmentRow[] }

/** What a device did that HR should see: it talked from a new address, or from one outside its allowed addresses. */
export interface DeviceEvent { id: number; kind: 'IP_CHANGED' | 'IP_REFUSED'; ip: string | null; previousIp: string | null; note: string | null; at: string | null }
export interface Device {
  /** serialNumber is "••••1234" (serialMasked) for a login without attendance edit; allowedIps is then null. */
  id: number; name: string; serialNumber: string; serialMasked?: boolean; make: string | null; model: string | null; locationId: number | null; locationName: string | null;
  timezone: string; protocol: 'ADMS' | 'API' | 'IMPORT'; status: 'ACTIVE' | 'DISABLED'; lastSeenAt: string | null; lastPunchAt: string | null; lastIp: string | null;
  online: boolean; state: string; mapped: number; unmapped: number; punchesToday: number; info: string | null; notes: string | null;
  allowedIps: string[] | null; events: DeviceEvent[];
}
export interface Mapping { id: number; deviceId: number | null; deviceName: string; deviceUserId: string; employee: { employeeId: number; name: string; employeeCode: string | null } }
export interface Unmapped { deviceId: number | null; deviceName: string; serialNumber: string | null; deviceUserId: string; punches: number; firstAt: string; lastAt: string }
export interface ApiKey { id: number; name: string; prefix: string; status: 'ACTIVE' | 'REVOKED'; lastUsedAt: string | null; useCount: number; createdAt: string | null; createdBy: string | null; revokedAt: string | null }

export interface Settings { liveFrom: string | null; webPunch: { enabled: boolean; ipAllowList: string[]; geofences: { locationId: number | null; lat: number; lng: number; radiusM: number }[] }; defaultTimezone: string }
export interface MonthState { month: string; label: string; status: 'OPEN' | 'CLOSED'; live: boolean; closedAt: string | null; closedBy: string | null; reopenedAt: string | null; reopenedBy: string | null; reopenReason: string | null; totals: { people: number; present: number; absentLop: number; lopDays: number; overtimeMinutes: number; penaltyAmount: number } | null }
export interface ImportPreview { kind: string; fileName: string | null; fileProblems: string[]; summary: { rows: number; ok: number; problems: number }; rows: { row: number; label: string; problems: string[] }[] }
export interface FileOut { fileName: string; mimeType: string; contentBase64: string }

const qs = (o: Record<string, string | number | null | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join('&')}` : '';
};

export const attendanceApi = {
  today: (q: { date?: string; departmentId?: number | null } = {}) => api.get<TodayBoard>(`/attendance/today${qs(q)}`),
  month: (q: { month?: string; q?: string; departmentId?: number | null } = {}) => api.get<MonthGrid>(`/attendance/month${qs(q)}`),
  musterRoll: (month: string) => api.get<FileOut>(`/attendance/month/workbook${qs({ month })}`),
  person: (employeeId: number, month?: string) => api.get<PersonMonth>(`/attendance/people/${employeeId}${qs({ month })}`),
  setDay: (body: { employeeId: number; date: string; status: DayStatus | null; inTime?: string | null; outTime?: string | null; note?: string }) => api.put<{ ok: true }>('/attendance/days', body),
  process: (body: { from: string; to: string; employeeIds?: number[] }) => api.post<{ daysWritten: number; kept: number; penalties: { applied: number; reversed: number } }>('/attendance/process', body),
  requests: (q: { status?: string; month?: string; q?: string } = {}) => api.get<{ items: AttRequest[] }>(`/attendance/requests${qs(q)}`).then((r) => r.items),
  request: (id: number) => api.get<AttRequestWithContext>(`/attendance/requests/${id}`),
  approve: (id: number, note?: string) => api.post<{ request: AttRequest }>(`/attendance/requests/${id}/approve`, { note: note || undefined }),
  reject: (id: number, note: string) => api.post<{ request: AttRequest }>(`/attendance/requests/${id}/reject`, { note }),
  askOnBehalf: (body: AskBody & { employeeId: number }) => api.post<{ request: AttRequest }>('/attendance/requests', body),
  penalties: (q: { month?: string; status?: string; q?: string } = {}) => api.get<{ items: Penalty[] }>(`/attendance/penalties${qs(q)}`).then((r) => r.items),
  waive: (id: number, note: string) => api.post<{ penalty: Penalty }>(`/attendance/penalties/${id}/waive`, { note }),
  policies: () => api.get<{ policies: AttPolicy[]; assignments: AssignmentRow[] }>('/attendance/policies'),
  sentences: (rules: Partial<Rules>) => api.post<{ sentences: string[]; problems: string[] }>('/attendance/policies/sentences', { rules }),
  createPolicy: (body: { name: string; description?: string | null; status?: string; rules: Partial<Rules> }) => api.post<{ policy: AttPolicy }>('/attendance/policies', body),
  updatePolicy: (id: number, body: Partial<{ name: string; description: string | null; status: string; rules: Partial<Rules> }>) => api.put<{ policy: AttPolicy }>(`/attendance/policies/${id}`, body),
  removePolicy: (id: number) => api.del<{ ok: true }>(`/attendance/policies/${id}`),
  assign: (body: { scope: AssignmentRow['scope']; targetId?: number | null; policyId: number | null }) => api.put<unknown>('/attendance/policy-assignments', body),
  devices: () => api.get<{ devices: Device[]; onlineMinutes: number; alerts: number }>('/attendance/devices'),
  createDevice: (body: Partial<Device> & { name: string; serialNumber: string }) => api.post<{ device: Device }>('/attendance/devices', body),
  updateDevice: (id: number, body: Partial<Device>) => api.put<{ device: Device }>(`/attendance/devices/${id}`, body),
  removeDevice: (id: number) => api.del<{ ok: true }>(`/attendance/devices/${id}`),
  mappings: (deviceId?: number | null) => api.get<{ mappings: Mapping[]; employeesWithout: { employeeId: number; name: string; employeeCode: string | null; suggested: string | null }[] }>(`/attendance/device-users${qs({ deviceId })}`),
  map: (body: { deviceId: number | null; deviceUserId: string; employeeId: number | null }) => api.put<{ attached: number }>('/attendance/device-users', body),
  autoMap: () => api.post<{ made: number; skipped: { why: string }[] }>('/attendance/device-users/auto', {}),
  unmapped: () => api.get<{ items: Unmapped[] }>('/attendance/unmapped').then((r) => r.items),
  keys: () => api.get<{ keys: ApiKey[] }>('/attendance/api-keys').then((r) => r.keys),
  createKey: (name: string) => api.post<{ key: ApiKey; secret: string; note: string }>('/attendance/api-keys', { name }),
  revokeKey: (id: number) => api.post<{ ok: true }>(`/attendance/api-keys/${id}/revoke`, {}),
  template: (kind: 'punches' | 'days') => api.get<FileOut>(`/attendance/imports/template${qs({ kind })}`),
  previewImport: (kind: 'punches' | 'days', file: { fileName: string; contentBase64: string }) => api.post<ImportPreview>(`/attendance/imports/${kind}/preview`, file),
  applyImport: (kind: 'punches' | 'days', file: { fileName: string; contentBase64: string; skipProblemRows?: boolean }) => api.post<Record<string, unknown>>(`/attendance/imports/${kind}/apply`, file),
  settings: () => api.get<{ settings: Settings }>('/attendance/settings').then((r) => r.settings),
  putSettings: (body: Partial<Settings>) => api.put<{ settings: Settings }>('/attendance/settings', body).then((r) => r.settings),
  months: (year?: number) => api.get<{ year: number; months: MonthState[] }>(`/attendance/months${qs({ year })}`),
  close: (month: string) => api.post<{ month: MonthState; pendingRequests: number }>(`/attendance/months/${month}/close`, {}),
  reopen: (month: string, reason: string) => api.post<{ month: MonthState }>(`/attendance/months/${month}/reopen`, { reason }),
};

export const myAttendanceApi = {
  get: (month?: string) => api.get<PersonMonth>(`/user/me/attendance${qs({ month })}`),
  punch: (body: { direction: 'IN' | 'OUT'; lat?: number; lng?: number }) => api.post<{ punch: { at: string; direction: string } }>('/user/me/attendance/punch', body),
  ask: (body: AskBody) => api.post<{ request: AttRequest }>('/user/me/attendance/requests', body),
  cancel: (id: number) => api.post<{ request: AttRequest }>(`/user/me/attendance/requests/${id}/cancel`, {}),
};

export const teamAttendanceApi = {
  month: (month?: string) => api.get<MonthGrid>(`/user/me/team/attendance${qs({ month })}`),
  person: (employeeId: number, month?: string) => api.get<PersonMonth>(`/user/me/team/attendance/${employeeId}${qs({ month })}`),
  waive: (penaltyId: number, note: string) => api.post<{ penalty: Penalty }>(`/user/me/team/attendance/penalties/${penaltyId}/waive`, { note }),
};

/* ── words ─────────────────────────────────────────────────────────────── */

/** '2026-10-05 09:12:00' -> '09:12'. */
export const hm = (w: string | null | undefined) => (w ? w.slice(11, 16) : '');
/** 75 -> '1 h 15 min'. */
export function minutesWord(n: number | null | undefined): string {
  const v = Math.max(0, Math.round(Number(n) || 0));
  const h = Math.floor(v / 60);
  const m = v % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
/** 'YYYY-MM' of today. */
/** Today on this device's clock (not UTC): 'YYYY-MM-DD'. */
export const todayLocal = () => new Date().toLocaleDateString('en-CA');
export const thisMonth = () => todayLocal().slice(0, 7);
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
export const dayLabel = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1].slice(0, 3)}`;

export const STATUS_WORDS: Record<DayStatus, string> = {
  PRESENT: 'Present', HALF_DAY: 'Half day', ABSENT: 'Absent', LEAVE: 'Leave', WEEKLY_OFF: 'Weekly off', HOLIDAY: 'Holiday', UNKNOWN: 'Not known yet',
};
export const KIND_WORDS: Record<RequestKind, string> = { CORRECTION: 'Correct a day', SHORT_PERMISSION: 'Short permission', ON_DUTY: 'On duty' };
