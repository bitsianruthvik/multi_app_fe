import type { DashMachine, DashOrder, MachineState, MaterialStatus, RiskStatus } from '../api/dashboard';

/**
 * The management dashboard's pure helpers: periods, how numbers read, what a
 * status means and how lists sort. No React — the jsdom test drives these too.
 */

export type PeriodKey = 'today' | 'week' | 'month' | 'last30' | 'custom';
export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: 'week', label: 'This week' }, { key: 'month', label: 'This month' },
  { key: 'last30', label: 'Last 30 days' }, { key: 'custom', label: 'Custom' },
];
/** The backend's cap on a period. */
export const MAX_PERIOD_DAYS = 92;

const DAY = 86400000;
export const addDays = (ds: string, n: number) => new Date(Date.parse(`${ds}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
/** Today as the browser sees it (the plant is in the same zone for every tenant today); the server's own `today` wins once it answers. */
export function localToday(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** from / to of a preset. The week starts on Monday; "this month" runs to today. */
export function periodRange(key: PeriodKey, today: string, custom?: { from?: string | null; to?: string | null }): { from: string; to: string } {
  switch (key) {
    case 'today': return { from: today, to: today };
    case 'month': return { from: `${today.slice(0, 8)}01`, to: today };
    case 'last30': return { from: addDays(today, -29), to: today };
    case 'custom': {
      const from = custom?.from || today;
      let to = custom?.to || from;
      if (to < from) to = from;
      if (daysBetween(from, to) + 1 > MAX_PERIOD_DAYS) to = addDays(from, MAX_PERIOD_DAYS - 1);
      return { from, to };
    }
    case 'week':
    default: {
      const wd = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
      return { from: addDays(today, -wd), to: today };
    }
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "30 Sep" · "30 Sep 2027" when not this year. */
export function dateLabel(ds: string | null | undefined, thisYear?: string): string {
  if (!ds) return '—';
  const [y, m, d] = ds.slice(0, 10).split('-');
  const base = `${Number(d)} ${MONTHS[Number(m) - 1]}`;
  return thisYear && y !== thisYear ? `${base} ${y}` : base;
}
export function periodLabel(from: string, to: string): string {
  const y = to.slice(0, 4);
  return from === to ? dateLabel(from, y) : `${dateLabel(from, y)} – ${dateLabel(to, y)}`;
}
/** "10:40" of a plant wall-clock time. */
export const clockText = (t: string | null | undefined) => (t ? t.replace(' ', 'T').slice(11, 16) : '');

/** Minutes as hours: 0 h · 45 min · 7.5 h · 1,240 h. */
export function hoursText(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—';
  if (min === 0) return '0 h';
  if (Math.abs(min) < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: h < 10 ? 1 : 0 }).format(h)} h`;
}
/** Tonnes: 12.4 t · 0.35 t · null "not weighed". */
export function tonnesText(t: number | null | undefined, missing = 'not weighed'): string {
  if (t == null || !Number.isFinite(t)) return missing;
  if (t === 0) return '0 t';
  const digits = Math.abs(t) < 1 ? 2 : Math.abs(t) < 100 ? 1 : 0;
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(t)} t`;
}
export const pctText = (p: number | null | undefined) => (p == null || !Number.isFinite(p) ? '—' : `${Math.round(p)}%`);
/** "2 h ago" / "3 days ago" between two plant wall-clock times. */
export function agoText(then: string | null | undefined, now: string): string {
  if (!then) return 'no activity recorded';
  const min = Math.max(0, Math.round((Date.parse(`${now.slice(0, 19)}Z`) - Date.parse(`${then.replace(' ', 'T').slice(0, 19)}Z`)) / 60000));
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
}

/** Utilisation bands, as a plant manager reads them. */
export function utilisationTone(p: number | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (p == null) return 'neutral';
  if (p >= 75) return 'success';
  if (p >= 50) return 'warning';
  return 'danger';
}

export const MACHINE_STATE: Record<MachineState, { label: string; color: string; family: 'success' | 'danger' | 'warning' | 'neutral' }> = {
  running: { label: 'Running', color: 'var(--c-state-running)', family: 'success' },
  stopped: { label: 'Stopped', color: 'var(--c-state-down)', family: 'danger' },
  idle: { label: 'Idle in shift', color: 'var(--c-state-wait)', family: 'warning' },
  off_shift: { label: 'Off shift', color: 'var(--c-state-off)', family: 'neutral' },
};

/** One plain sentence: what the machine is doing now. */
export function machineNowText(m: DashMachine, now: string): string {
  const n = m.now;
  if (n.state === 'running') {
    const first = n.running[0];
    const more = n.running.length > 1 ? ` +${n.running.length - 1} more` : '';
    return `${first.operation}${first.pieceCode ? ` on ${first.pieceCode}` : ''} since ${clockText(first.since)}${more}`;
  }
  if (n.state === 'stopped' && n.stop) return `${n.stop.reason} since ${clockText(n.stop.since)}`;
  if (n.state === 'idle') return `In a shift, nothing recorded — last activity ${agoText(n.lastActivityAt, now)}`;
  return m.hasShifts ? `Outside its shifts — last activity ${agoText(n.lastActivityAt, now)}` : 'No shifts set up';
}

export type MachineSort = 'utilisation' | 'stops' | 'notRecorded' | 'tonnes' | 'code';
export const MACHINE_SORTS: { key: MachineSort; label: string }[] = [
  { key: 'utilisation', label: 'Lowest utilisation' }, { key: 'stops', label: 'Most stop time' },
  { key: 'notRecorded', label: 'Most not recorded' }, { key: 'tonnes', label: 'Most tonnes' }, { key: 'code', label: 'Code' },
];
export function sortMachines(ms: DashMachine[], by: MachineSort): DashMachine[] {
  const code = (a: DashMachine, b: DashMachine) => a.code.localeCompare(b.code);
  const cmp: Record<MachineSort, (a: DashMachine, b: DashMachine) => number> = {
    // A machine with no shifts has no utilisation: it goes last, not first.
    utilisation: (a, b) => (a.utilisationPct ?? 1e9) - (b.utilisationPct ?? 1e9) || code(a, b),
    stops: (a, b) => b.stopMin - a.stopMin || code(a, b),
    notRecorded: (a, b) => b.notRecordedMin - a.notRecordedMin || code(a, b),
    tonnes: (a, b) => (b.output.tonnes ?? -1) - (a.output.tonnes ?? -1) || code(a, b),
    code,
  };
  return [...ms].sort(cmp[by]);
}

/**
 * The shift bar of a machine as shares of its shift time: run (in shift), stopped
 * (in shift), not recorded, and the rest (breaks and work run past the shift
 * cannot push it over 100 %). Percentages that add up to 100.
 */
export function shiftShares(m: Pick<DashMachine, 'shiftMin' | 'runInShiftMin' | 'stopInShiftMin' | 'notRecordedMin'>) {
  if (!m.shiftMin) return null;
  const s = m.shiftMin;
  const run = Math.min(100, (m.runInShiftMin / s) * 100);
  const stop = Math.min(100 - run, (m.stopInShiftMin / s) * 100);
  const gap = Math.min(100 - run - stop, (m.notRecordedMin / s) * 100);
  return { run, stop, gap, other: Math.max(0, 100 - run - stop - gap) };
}

export const RISK: Record<RiskStatus, { label: string; family: 'danger' | 'warning' | 'success' | 'neutral' | 'info'; help: string }> = {
  late: { label: 'Late', family: 'danger', help: 'Past its committed date and not all dispatched.' },
  at_risk: { label: 'At risk', family: 'warning', help: 'The forecast finish is after the committed date, or it is due within a week and far from done.' },
  no_forecast: { label: 'No forecast', family: 'neutral', help: 'No recent progress to measure a pace from, and not every line is on the plan.' },
  on_track: { label: 'On track', family: 'success', help: 'The forecast finish is on or before the committed date.' },
  no_date: { label: 'No date', family: 'neutral', help: 'No committed date on the order or its lines.' },
  done: { label: 'Dispatched', family: 'info', help: 'Every line has been dispatched.' },
};
export const RISK_FILTERS: { key: 'all' | RiskStatus; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'late', label: 'Late' }, { key: 'at_risk', label: 'At risk' },
  { key: 'on_track', label: 'On track' }, { key: 'no_forecast', label: 'No forecast' }, { key: 'no_date', label: 'No date' },
];

export const MATERIAL_STATUS: Record<MaterialStatus, { label: string; family: 'success' | 'info' | 'warning' | 'danger' }> = {
  covered: { label: 'Reserved', family: 'success' },
  in_stock: { label: 'In stock — reserve it', family: 'info' },
  on_order: { label: 'On order', family: 'warning' },
  to_buy: { label: 'To buy', family: 'danger' },
};

/** "in 12 days" / "today" / "3 days late". */
export function daysLeftText(n: number | null): string {
  if (n == null) return '';
  if (n === 0) return 'due today';
  return n > 0 ? `in ${n} day${n === 1 ? '' : 's'}` : `${-n} day${n === -1 ? '' : 's'} late`;
}

/** How the order's % was worked out, in words (for the tooltip). */
export function progressBasisText(o: DashOrder): string {
  const inLine = o.progress.lineBasis === 'work' ? 'estimated work minutes of its steps' : o.progress.lineBasis === 'count' ? 'steps done (too few steps have a time estimate to weigh them)' : 'what has been made';
  const across = o.lines.total > 1 ? (o.progress.basis === 'tonnes' ? ' Lines are weighed by their tonnes.' : ' Lines count equally (not every line has a weight).') : '';
  return `Each line by ${inLine}.${across}`;
}

export function filterOrders(os: DashOrder[], risk: 'all' | RiskStatus, search: string): DashOrder[] {
  const term = search.trim().toLowerCase();
  return os.filter((o) => (risk === 'all' || o.risk.status === risk)
    && (!term || [o.code, o.title, o.customer?.name].some((t) => t && t.toLowerCase().includes(term))));
}
export function filterMachines(ms: DashMachine[], typeId: number | null, search: string): DashMachine[] {
  const term = search.trim().toLowerCase();
  return ms.filter((m) => (typeId == null || m.type?.id === typeId)
    && (!term || [m.code, m.name, m.type?.name].some((t) => t && t.toLowerCase().includes(term))));
}

/**
 * Shift time with nothing at all in the machine log — no work, no stop. Utilisation
 * would read 0 %, which says "idle" when the truth is "nobody wrote it down".
 */
export const nothingLogged = (x: { shiftMin: number; runMin: number; stopMin: number }) => x.shiftMin > 0 && x.runMin === 0 && x.stopMin === 0;

/**
 * Big rupee figures the way Indian management reads them: ₹17.07 Cr, ₹5.1 L;
 * below a lakh the plain amount. null → `missing` (never ₹0).
 */
export function croreText(n: number | null | undefined, missing = '—'): string {
  if (n == null || !Number.isFinite(n)) return missing;
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const f = (x: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: x < 10 ? 2 : x < 100 ? 1 : 0 }).format(x);
  if (a >= 1e7) return `${sign}₹${f(a / 1e7)} Cr`;
  if (a >= 1e5) return `${sign}₹${f(a / 1e5)} L`;
  return `${sign}₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(a)}`;
}
