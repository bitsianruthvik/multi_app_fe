import type { PlanOrder, PlanType, ReasonKind } from '../api/planner3';

/**
 * PRODUCTION › PLANNER (Step 5) — pure helpers for the day view: where a bar sits on the day columns, how full a machine
 * type is on a day, the words of a reason, moving a rank by keyboard. No React here (the suite tests these directly).
 */

export const MODE_WORDS: Record<'auto' | 'manual', { label: string; made: string; hint: string }> = {
  auto: { label: 'Automatic', made: 'Planned by AI', hint: 'Committed dates first, then the money each production order unlocks, then your priority. Pin a production order to keep its rank.' },
  manual: { label: 'Manual', made: 'Planned by Management', hint: 'Your rank and earliest start for each production order. A higher rank takes what it can; a lower one stretches.' },
};

export const REASON_WORDS: Record<ReasonKind, string> = {
  material: 'Material', capacity: 'Machine busy', down: 'Machine down', start: 'Earliest start', no_capacity: 'No shift time',
  horizon: 'Beyond a year', predecessor: 'Earlier steps', other: 'Other',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "21 Oct" — a date (or a 'YYYY-MM-DD HH:MM:SS') in short words. */
export function dayShort(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, dd] = d.slice(0, 10).split('-').map(Number);
  if (!y || !m || !dd) return '—';
  return `${dd} ${MONTHS[m - 1]}`;
}
/** The weekday letter row of a day column. */
export function weekday(d: string): string {
  const [y, m, dd] = d.split('-').map(Number);
  return WD[new Date(y, m - 1, dd).getDay()];
}

/** Minutes as plain words: 45 min, 3.5 h, 2 d 4 h (8-hour days are NOT assumed — 24 h a day of clock). */
export function minutesText(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—';
  if (m < 1) return m <= 0 ? '0 min' : `${Math.max(1, Math.round(m * 60))} s`;
  if (m < 90) return `${Math.round(m)} min`;
  const h = m / 60;
  return h < 48 ? `${Math.round(h * 10) / 10} h` : `${Math.floor(h / 24)} d ${Math.round(h % 24)} h`;
}

/** Where a planned span sits on the day columns: left column and width in columns (fractions), clipped to the view. */
export function barOf(start: string | null, end: string | null, days: string[]): { left: number; width: number } | null {
  if (!start || !end || !days.length) return null;
  const col = (t: string) => {
    const day = t.slice(0, 10);
    const i = days.indexOf(day);
    const [hh, mm, ss] = (t.slice(11) || '00:00:00').split(':').map(Number);
    const frac = ((hh || 0) * 60 + (mm || 0) + (ss || 0) / 60) / 1440;
    if (i >= 0) return i + frac;
    return day < days[0] ? 0 : days.length;
  };
  const a = Math.max(0, col(start));
  const b = Math.min(days.length, col(end));
  if (b < a) return null;
  return { left: a, width: Math.max(b - a, 0.08) };
}

/** How full a machine type is on a day: 0–100+ (%), null when it has no capacity that day. */
export function loadPct(t: PlanType, i: number): number | null {
  const cap = t.capacity[i] ?? 0;
  if (t.unlimited || cap <= 0) return (t.load[i] ?? 0) > 0 && !t.unlimited ? Infinity : null;
  return Math.round(((t.load[i] ?? 0) / cap) * 100);
}
export function loadTone(p: number | null): 'none' | 'low' | 'mid' | 'full' | 'over' {
  if (p == null) return 'none';
  if (p === Infinity || p > 100) return 'over';
  if (p >= 90) return 'full';
  if (p >= 40) return 'mid';
  return p > 0 ? 'low' : 'none';
}

/** The production orders on a type's day, biggest first: "SO260008 · Span 2 of 3 — 3.5 h". */
export function dayOrders(t: PlanType, i: number, orders: PlanOrder[]): { id: number; label: string; minutes: number }[] {
  const byId = new Map(orders.map((o) => [o.id, o]));
  return Object.entries(t.byPo[i] ?? {}).map(([id, m]) => ({ id: Number(id), label: byId.get(Number(id))?.label ?? `#${id}`, minutes: m }))
    .sort((a, b) => b.minutes - a.minutes);
}

/** The rank order after moving one production order up (-1) or down (+1): every row's new rank, 1…n. */
export function moveRank(orders: PlanOrder[], id: number, by: -1 | 1): { id: number; rank: number }[] {
  const list = [...orders].sort((a, b) => a.rank - b.rank);
  const i = list.findIndex((o) => o.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return list.map((o, k) => ({ id: o.id, rank: k + 1 }));
  [list[i], list[j]] = [list[j], list[i]];
  return list.map((o, k) => ({ id: o.id, rank: k + 1 }));
}

/** One line of what slows a production order: "Slowed by material — PL-12: due 23 Oct on PO-000163 (+2 more)". */
export function slowedText(o: PlanOrder): string | null {
  if (o.waitingFor && !o.slowedBy.length) return o.waitingFor;
  if (!o.slowedBy.length) return null;
  const first = o.slowedBy[0];
  return `Slowed by ${first.text}${o.slowedBy.length > 1 ? ` (+${o.slowedBy.length - 1} more)` : ''}`;
}

/** "+3 d" / "on time" / "−1 d" against the baseline. */
export function slipText(o: PlanOrder): string {
  if (!o.baseline?.end) return '—';
  if (o.end == null) return 'cannot finish';
  const d = o.slipDays ?? 0;
  return d > 0 ? `+${d} d late` : d < 0 ? `${d} d early` : 'on time';
}
