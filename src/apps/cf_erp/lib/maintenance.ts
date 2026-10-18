import type { BoardStatus, DowntimeInput, DowntimeKind, MaintenanceOrder, MoStatus, MoSource } from '../api/maintenance';
import type { Family } from '../components/ui';

/** Words and rules of the Maintenance screens (backend maintenanceService.js; init.sql §82). Pure, for the tests. */

export const MO_STATUS: Record<MoStatus, { label: string; family: Family }> = {
  open: { label: 'Open', family: 'warning' },
  in_progress: { label: 'In progress', family: 'info' },
  waiting_parts: { label: 'Waiting for parts', family: 'warning' },
  done: { label: 'Done', family: 'success' },
  cancelled: { label: 'Cancelled', family: 'neutral' },
};
export const SOURCE_LABEL: Record<MoSource, string> = { fault: 'Fault', preventive: 'Preventive', manual: 'Raised by maintenance' };

export const BOARD_STATUS: Record<BoardStatus, { label: string; family: Family; order: number }> = {
  down: { label: 'Down', family: 'danger', order: 0 },
  planned: { label: 'Planned downtime', family: 'warning', order: 1 },
  stopped: { label: 'Stopped', family: 'warning', order: 2 },
  running: { label: 'Running', family: 'success', order: 3 },
  idle: { label: 'Up, no job', family: 'neutral', order: 4 },
};

/** Status buttons an MO shows, in order (done / cancel / false alarm are their own). */
export const NEXT_LABEL: Partial<Record<MoStatus, string>> = { in_progress: 'Start work', waiting_parts: 'Waiting for parts' };

/** "2 h 05 min", "45 min", "3 d 4 h". */
export function durationText(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')} min` : ''}`;
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return `${d} d${h ? ` ${h} h` : ''}`;
}

/** 'YYYY-MM-DD HH:MM(:SS)' → 'Sun 18 Oct, 08:00' (the plant clock; no zone arithmetic). */
export function whenText(wall: string | null | undefined): string {
  if (!wall) return '—';
  const [d, t] = wall.replace('T', ' ').split(' ');
  const date = new Date(`${d}T00:00:00Z`);
  const day = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return t ? `${day}, ${t.slice(0, 5)}` : day;
}

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const WEEKDAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const DAY_NAME: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
export const NTH = [{ v: 1, l: '1st' }, { v: 2, l: '2nd' }, { v: 3, l: '3rd' }, { v: 4, l: '4th' }, { v: 5, l: 'last' }];

/** The same words the backend's ruleText says — so the dialog can show them as you type. */
export function ruleText(r: Pick<DowntimeInput, 'kind' | 'startsOn' | 'startTime' | 'durationMinutes' | 'weekdays' | 'everyN' | 'monthDay' | 'monthWeek' | 'monthWeekday'>): string {
  const len = r.durationMinutes % 60 === 0 ? `${r.durationMinutes / 60} h` : `${r.durationMinutes} min`;
  const at = `${r.startTime} for ${len}`;
  const n = r.everyN ?? 1;
  if (r.kind === 'once') return `Once, ${r.startsOn} ${at}`;
  if (r.kind === 'weekly') return `${n > 1 ? `Every ${n} weeks on` : 'Every'} ${(r.weekdays ?? []).map((w) => DAY_NAME[w]).join(', ')}, ${at}`;
  if (r.monthDay) return `Day ${r.monthDay}${n > 1 ? ` of every ${n} months` : ' of the month'}, ${at}`;
  const nth = NTH.find((x) => x.v === r.monthWeek)?.l ?? '?';
  return `Every ${nth} ${DAY_NAME[r.monthWeekday ?? ''] ?? '?'}${n > 1 ? ` (every ${n} months)` : ''}, ${at}`;
}

/** The "every 1st Sunday, 8 h" shortcuts the dialog offers. */
export interface DowntimePreset { key: string; label: string; apply: (d: DowntimeForm) => DowntimeForm }
export interface DowntimeForm {
  kind: DowntimeKind; reason: string; startsOn: string; endsOn: string; startTime: string; hours: string;
  weekdays: string[]; everyN: string; monthMode: 'day' | 'nth'; monthDay: string; monthWeek: number; monthWeekday: string; notes: string;
}
export const blankDowntime = (today: string): DowntimeForm => ({
  kind: 'monthly', reason: 'Preventive maintenance', startsOn: today, endsOn: '', startTime: '08:00', hours: '8',
  weekdays: ['sun'], everyN: '1', monthMode: 'nth', monthDay: '1', monthWeek: 1, monthWeekday: 'sun', notes: '',
});
export const PRESETS: DowntimePreset[] = [
  { key: 'first-sunday', label: 'Every 1st Sunday, 8 h', apply: (d) => ({ ...d, kind: 'monthly', monthMode: 'nth', monthWeek: 1, monthWeekday: 'sun', startTime: '08:00', hours: '8', everyN: '1' }) },
  { key: 'every-sunday', label: 'Every Sunday, 4 h', apply: (d) => ({ ...d, kind: 'weekly', weekdays: ['sun'], startTime: '08:00', hours: '4', everyN: '1' }) },
  { key: 'once', label: 'Once, a whole day', apply: (d) => ({ ...d, kind: 'once', startTime: '00:00', hours: '24' }) },
];

/** The form as the backend's input; problems the screen can say before sending. */
export function downtimeBody(machineId: number | null, f: DowntimeForm): { body: DowntimeInput | null; problems: string[] } {
  const problems: string[] = [];
  if (!machineId) problems.push('Choose the machine.');
  const hours = Number(f.hours);
  if (!(hours > 0)) problems.push('Say how many hours it is down.');
  if (!f.reason.trim()) problems.push('Say why (the reason).');
  if (f.kind === 'weekly' && !f.weekdays.length) problems.push('Choose the days of the week.');
  if (problems.length) return { body: null, problems };
  const body: DowntimeInput = {
    machineId: machineId!, kind: f.kind, reason: f.reason.trim(), startsOn: f.startsOn, endsOn: f.kind === 'once' || !f.endsOn ? null : f.endsOn,
    startTime: f.startTime, durationMinutes: Math.round(hours * 60), everyN: Math.max(1, Number(f.everyN) || 1), notes: f.notes.trim() || null,
  };
  if (f.kind === 'weekly') body.weekdays = f.weekdays;
  if (f.kind === 'monthly') {
    if (f.monthMode === 'day') body.monthDay = Number(f.monthDay) || 1;
    else { body.monthWeek = f.monthWeek; body.monthWeekday = f.monthWeekday; }
  }
  return { body, problems };
}

/** Sort for the board: down first, then planned, stopped, running, idle; by code within. */
export const boardOrder = <T extends { status: BoardStatus; code: string }>(rows: T[]) =>
  [...rows].sort((a, b) => BOARD_STATUS[a.status].order - BOARD_STATUS[b.status].order || a.code.localeCompare(b.code));

/** What an MO's money line says. */
export function costText(mo: Pick<MaintenanceOrder, 'partsCost' | 'otherCost' | 'cost'>, money: (n: number) => string): string {
  if (mo.cost == null) return '—';
  const parts = mo.partsCost != null ? `parts ${money(mo.partsCost)}` : null;
  const other = mo.otherCost ? `other ${money(mo.otherCost)}` : null;
  return `${money(mo.cost)}${parts || other ? ` (${[parts, other].filter(Boolean).join(' + ')})` : ''}`;
}

/** Keys that should not fire while typing in a field or when a dialog is open. */
export function plainKey(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return false;
  return !document.querySelector('.MuiDialog-root, .MuiPopover-root, .MuiMenu-root');
}
