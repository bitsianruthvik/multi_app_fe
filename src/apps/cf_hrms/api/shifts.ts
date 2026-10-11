import { api } from './client';

/**
 * Shifts by weekday, and holiday calendars — the client side of
 * CF_HRMS_HIRING_SPEC.md §6.2. The types are that section's.
 *
 * A SHIFT HAS HOURS PER DAY OF THE WEEK: seven rows, always, Monday (1) to
 * Sunday (7). A day is working or not; a working day has both times or neither
 * ("flexible hours"); a day whose end is at or before its start ends the next
 * day. `hours`, `weeklyHours` and `summary` are worked out by the server — the
 * editor shows its own running figures while typing and the server's after a save.
 *
 * A HOLIDAY CALENDAR is a named list of dated holidays. A shift selects one, or
 * none. Several shifts may share a calendar.
 */

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ShiftDay { weekday: Weekday; isWorking: boolean; startTime: string | null /* HH:MM */; endTime: string | null;
                            crossesMidnight: boolean; breakMinutes: number; hours: number | null /* worked hours that day, break removed */ }

export interface Shift { id: number; code: string; name: string; status: string; days: ShiftDay[];
  weeklyHours: number | null; workingDays: number;
  /** "Mon–Sat 08:00–20:00" / "Mon–Fri 09:00–18:00, Sat 09:00–13:00" / "Mon–Sat, flexible hours" */ summary: string;
  holidayCalendar: { id: number; name: string } | null; positionCount: number; graceInMinutes: number; graceOutMinutes: number }

export interface Holiday { id: number; date: string; weekday: string; name: string; isOptional: boolean }

export interface ShiftInput {
  code: string;
  name: string;
  status?: string;
  holidayCalendarId: number | null;
  graceInMinutes?: number;
  graceOutMinutes?: number;
  /** Exactly seven. */
  days: Pick<ShiftDay, 'weekday' | 'isWorking' | 'startTime' | 'endTime' | 'breakMinutes'>[];
}

export interface HolidayCalendar {
  id: number;
  name: string;
  description: string | null;
  status: string;
  holidayCount: number;
  nextHoliday: { date: string; name: string } | null;
  shiftCount: number;
}

export interface CopyYearResult {
  copied: number;
  skipped: { date: string; name: string; why: string }[];
  /** The server's own reminder that festival dates move each year, where it sends one. */
  message?: string;
  note?: string;
}

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday',
};
export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** "08:00" from "08:00:00" or "8:00"; '' for nothing. Times are always shown as HH:MM. */
export function hhmm(value: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

const minutesOf = (t: string): number | null => {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * One day while it is being typed — the same arithmetic the server does, so
 * the figure beside the row is right before the save: an end at or before the
 * start is the next day; the break comes off.
 */
export function dayFigures(d: { isWorking: boolean; startTime: string; endTime: string; breakMinutes: number }): {
  hours: number | null;
  nextDay: boolean;
  problem: string | null;
} {
  if (!d.isWorking) return { hours: null, nextDay: false, problem: null };
  const s = minutesOf(d.startTime);
  const e = minutesOf(d.endTime);
  if (s == null && e == null) return { hours: null, nextDay: false, problem: null };
  if (s == null || e == null) return { hours: null, nextDay: false, problem: 'Needs both a start and an end, or neither.' };
  const nextDay = e <= s;
  const span = (nextDay ? e + 24 * 60 : e) - s;
  const worked = span - (d.breakMinutes || 0);
  if (worked <= 0) return { hours: null, nextDay, problem: 'The break is as long as the day.' };
  return { hours: Math.round((worked / 60) * 100) / 100, nextDay, problem: null };
}

/** 12 -> "12 h", 7.5 -> "7.5 h". */
export const hoursText = (h: number | null | undefined): string =>
  h == null ? '—' : `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, '')} h`;

export const shiftsApi = {
  /** `{ shifts }` by the contract; `{ rows }` is what the route answered before §6 and is still read. */
  list: () =>
    api.get<{ shifts?: Shift[]; rows?: Shift[] }>('/organisation/shifts').then((r) => r.shifts ?? r.rows ?? []),
  get: (id: number) => api.get<{ shift: Shift }>(`/organisation/shifts/${id}`).then((r) => r.shift),
  create: (body: ShiftInput) => api.post<{ shift: Shift }>('/organisation/shifts', body),
  update: (id: number, body: ShiftInput) => api.put<{ shift: Shift }>(`/organisation/shifts/${id}`, body),
  /** 409 IN_USE (with the count) when positions are on it. */
  remove: (id: number) => api.del<unknown>(`/organisation/shifts/${id}`),
};

export const calendarsApi = {
  list: () => api.get<{ calendars: HolidayCalendar[] }>('/organisation/holiday-calendars').then((r) => r.calendars ?? []),
  get: (id: number, year?: number) =>
    api.get<{ calendar: HolidayCalendar; holidays: Holiday[]; years: number[] }>(
      `/organisation/holiday-calendars/${id}${year ? `?year=${year}` : ''}`,
    ),
  create: (body: { name: string; description?: string | null }) =>
    api.post<{ calendar: HolidayCalendar }>('/organisation/holiday-calendars', body),
  update: (id: number, body: { name: string; description?: string | null }) =>
    api.put<{ calendar: HolidayCalendar }>(`/organisation/holiday-calendars/${id}`, body),
  /** 409 IN_USE when a shift selects it. */
  remove: (id: number) => api.del<unknown>(`/organisation/holiday-calendars/${id}`),
  /** 409 DUPLICATE for a date the calendar already has. */
  addHoliday: (id: number, body: { date: string; name: string; isOptional?: boolean }) =>
    api.post<{ holiday: Holiday }>(`/organisation/holiday-calendars/${id}/holidays`, body),
  updateHoliday: (holidayId: number, body: { date: string; name: string; isOptional?: boolean }) =>
    api.put<unknown>(`/organisation/holidays/${holidayId}`, body),
  removeHoliday: (holidayId: number) => api.del<unknown>(`/organisation/holidays/${holidayId}`),
  /** Same day and month in the new year; dates the new year already has are skipped and named. */
  copyYear: (id: number, body: { fromYear: number; toYear: number }) =>
    api.post<CopyYearResult>(`/organisation/holiday-calendars/${id}/copy-year`, body),
};

/** The three national holidays — the only list this app offers; everything else is entered by the company. */
export const NATIONAL_HOLIDAYS: { month: number; day: number; name: string }[] = [
  { month: 1, day: 26, name: 'Republic Day' },
  { month: 8, day: 15, name: 'Independence Day' },
  { month: 10, day: 2, name: 'Gandhi Jayanti' },
];
