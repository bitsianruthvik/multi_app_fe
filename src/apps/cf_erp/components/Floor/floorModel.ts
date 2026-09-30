import type { FloorDay, FloorMachine, FloorReopened, FloorRunning, FloorStep } from '../../api/types';

/** "Cut plate 25 x 500 · SPAN-01-…" — what the job is done to. */
export const pieceLine = (s: FloorStep) => [s.pieceName || s.pieceCode, s.pieceCode && s.pieceCode !== s.pieceName ? s.pieceCode : null].filter(Boolean).join(' · ');

/**
 * The machine log's arithmetic, kept out of the screens so it can be reasoned
 * about (and tested) alone. Times are full date-times everywhere: a night shift
 * that crosses midnight is one day, and a bare HH:MM would not know which side
 * of midnight it is on. Display is local HH:MM.
 */
/** Touch sizes: nothing pressable under 48 px, primary actions 56 px. */
export const TOUCH = 48;
export const PRIMARY_H = 56;
export const MIN = 60_000;
export const IDLE_AFTER_MIN = 10;

const two = (n: number) => String(n).padStart(2, '0');
export const hhmm = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;
export const dateKey = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
export const addMin = (d: Date, m: number) => new Date(d.getTime() + m * MIN);
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const at = (iso: string) => new Date(iso);

/** 95 -> "1 h 35 m"; 40 -> "40 m". */
export function duration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h ? (m % 60 ? `${h} h ${m % 60} m` : `${h} h`) : `${m} m`;
}

/** A running timer, H:MM:SS. */
export function timer(fromIso: string, now: Date): string {
  const s = Math.max(0, Math.floor((now.getTime() - at(fromIso).getTime()) / 1000));
  return `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}

/** "10:40 – 11:30", with a small hint when the end is on another calendar day. */
export function span(start: Date, end: Date | null, dayKey?: string): string {
  if (!end) return `${hhmm(start)} – now`;
  const next = dayKey && dateKey(end) > dateKey(start) && dateKey(end) !== dayKey ? ' (next day)' : '';
  return `${hhmm(start)} – ${hhmm(end)}${next}`;
}

/** Day rows in time order — work, stops and unrecorded gaps together. */
export type DayItem =
  | { kind: 'work'; start: Date; end: Date | null; session: FloorDay['sessions'][number] }
  | { kind: 'stop'; start: Date; end: Date | null; stop: FloorDay['stops'][number] }
  | { kind: 'gap'; start: Date; end: Date; gap: FloorDay['notRecorded'][number] };

export function dayItems(day: FloorDay): DayItem[] {
  const items: DayItem[] = [
    ...day.sessions.map((session): DayItem => ({ kind: 'work', start: at(session.start), end: session.end ? at(session.end) : null, session })),
    ...day.stops.map((stop): DayItem => ({ kind: 'stop', start: at(stop.start), end: stop.end ? at(stop.end) : null, stop })),
    ...day.notRecorded.map((gap): DayItem => ({ kind: 'gap', start: at(gap.start), end: at(gap.end), gap })),
  ];
  return items.sort((a, b) => a.start.getTime() - b.start.getTime() || a.kind.localeCompare(b.kind));
}

/**
 * Stacked lanes for spans that overlap (jobs together): each span takes the
 * first lane whose last span has ended. Returns each span's lane and the count.
 */
export function assignLanes(spans: { start: number; end: number }[]): { lanes: number[]; count: number } {
  const order = spans.map((_, i) => i).sort((a, b) => spans[a].start - spans[b].start);
  const laneEnds: number[] = [];
  const lanes = new Array<number>(spans.length).fill(0);
  for (const i of order) {
    let lane = laneEnds.findIndex((e) => e <= spans[i].start);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
    laneEnds[lane] = spans[i].end;
    lanes[i] = lane;
  }
  return { lanes, count: Math.max(1, laneEnds.length) };
}

/**
 * The stretch of time the day bar draws: the machine's whole working day (24 h,
 * from the server), widened to cover anything recorded outside it. Without a
 * window (an older server) it is the shifts, widened the same way.
 */
export function barWindow(day: FloorDay, now: Date): { from: number; to: number } {
  const points: number[] = [];
  if (day.window) points.push(at(day.window.start).getTime(), at(day.window.end).getTime());
  day.shifts.forEach((s) => points.push(at(s.start).getTime(), at(s.end).getTime()));
  day.sessions.forEach((s) => points.push(at(s.start).getTime(), (s.end ? at(s.end) : now).getTime()));
  day.stops.forEach((s) => points.push(at(s.start).getTime(), (s.end ? at(s.end) : now).getTime()));
  if (!points.length) {
    const from = new Date(`${day.date || dateKey(now)}T06:00:00`).getTime();
    return { from, to: from + 12 * 60 * MIN };
  }
  const from = Math.min(...points);
  const to = Math.max(...points);
  return { from, to: to > from ? to : from + 60 * MIN };
}

/** The end of the latest thing recorded (or the shift start), which "from the last end" uses. */
export function lastEnd(day: FloorDay | null, now: Date): Date | null {
  if (!day) return null;
  const ends = [
    ...day.sessions.map((s) => (s.end ? at(s.end) : now)),
    ...day.stops.map((s) => (s.end ? at(s.end) : now)),
  ].map((d) => d.getTime());
  if (ends.length) return new Date(Math.max(...ends));
  const first = day.shifts.map((s) => at(s.start).getTime());
  return first.length ? new Date(Math.min(...first)) : null;
}

/** Is `now` inside one of the day's shifts? */
export const inShift = (day: FloorDay | null, now: Date) =>
  !!day && day.shifts.some((s) => at(s.start).getTime() <= now.getTime() && now.getTime() < at(s.end).getTime());

/**
 * Since when has the machine been quiet — or null when it should not nag: not in
 * a shift, something running, a stop already open, or under 10 minutes.
 */
export function idleSince(day: FloorDay | null, running: FloorRunning[], openStop: boolean, now: Date): Date | null {
  if (!day || running.length || openStop || !inShift(day, now)) return null;
  const shift = day.shifts.find((s) => at(s.start).getTime() <= now.getTime() && now.getTime() < at(s.end).getTime());
  if (!shift) return null;
  const shiftStart = at(shift.start).getTime();
  const ends = [...day.sessions, ...day.stops]
    .map((x) => (x.end ? at(x.end).getTime() : null))
    .filter((t): t is number => t !== null && t >= shiftStart);
  const since = new Date(ends.length ? Math.max(...ends) : shiftStart);
  return now.getTime() - since.getTime() >= IDLE_AFTER_MIN * MIN ? since : null;
}

/**
 * Turns a typed clock time into a real date-time near `anchor`: the first moment
 * at or after `windowStart` that shows that HH:MM. A 02:00 typed on a night
 * shift that began at 22:00 is tomorrow's 02:00, not yesterday's.
 */
export function resolveClock(value: string, windowStart: Date): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(windowStart);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() < windowStart.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

/**
 * The first moment a typed clock time may mean: the start of the machine's
 * working day, so any of its 24 hours can be typed (a night-shift machine's day
 * starts before its shift, and 02:00 lands after midnight). Older servers: two
 * hours before the earliest shift, else midnight of the day.
 */
export function dayStart(day: FloorDay | null, dateStr: string): Date {
  if (day?.window) return at(day.window.start);
  const starts = (day?.shifts ?? []).map((s) => at(s.start).getTime());
  return starts.length ? new Date(Math.min(...starts) - 120 * MIN) : new Date(`${dateStr}T00:00:00`);
}

/** A failure in plain words: the server's own list of problems when it sent one (minus its "Row 1:" prefixes), else its message. */
export function errText(e: unknown): string {
  const problems = e && typeof e === 'object' && 'problems' in e ? (e as { problems: unknown }).problems : null;
  if (Array.isArray(problems) && problems.length) return problems.map((p) => {
    const t = String(p).replace(/^Row \d+: /, '').replace(/^[\w-]+ · [^:]+: /, '');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }).join(' ');
  return e instanceof Error ? e.message : 'Something went wrong.';
}

/**
 * The quiet note after a save that put a finished job back in progress (a
 * deleted or lowered count): "Job reopened — 3 left". null when none was.
 */
export function reopenNote(reopened: FloorReopened[] | undefined): string | null {
  if (!reopened?.length) return null;
  if (reopened.length > 1) return `${reopened.length} jobs reopened`;
  const left = Number(reopened[0].qtyLeft.toFixed(3));
  return `Job reopened — ${left} left`;
}

/** The parts of [start, end) outside every shift window of the day — overtime when it is work. */
export function outsideShifts(day: FloorDay | null, start: number, end: number): { start: number; end: number }[] {
  let parts = [{ start, end }];
  for (const s of day?.shifts ?? []) {
    const a = at(s.start).getTime(); const b = at(s.end).getTime();
    parts = parts.flatMap((p) => (b <= p.start || a >= p.end ? [p] : [
      ...(a > p.start ? [{ start: p.start, end: a }] : []),
      ...(b < p.end ? [{ start: b, end: p.end }] : []),
    ]));
  }
  return parts.filter((p) => p.end > p.start);
}

/**
 * The machine picker's type filter: one row per level of the classification
 * tree (typically Family › Subfamily › Variant). A row is shown when it offers a
 * real choice (two or more) or has a choice made; a level with a single option
 * narrows nothing and is skipped, so the rows adapt to however deep the tree is.
 * The next level appears once a choice is made. chosen[i] is the node picked
 * at path position i (null = All); a choice that no longer matches is ignored.
 * The machines passed in are already narrowed by the search, so counts agree with it.
 */
export interface FilterOption { id: number; name: string; count: number }
export interface FilterLevel { index: number; level: string; options: FilterOption[]; chosen: number | null; total: number }
export function machineFilter(machines: FloorMachine[], chosen: (number | null)[]): { levels: FilterLevel[]; shown: FloorMachine[] } {
  let pool = machines;
  const levels: FilterLevel[] = [];
  const depth = Math.max(0, ...machines.map((m) => m.typePath?.length ?? 0));
  for (let i = 0; i < depth; i++) {
    const byId = new Map<number, FilterOption>();
    let level = '';
    for (const m of pool) {
      const n = m.typePath?.[i];
      if (!n) continue;
      level = level || n.level || '';
      const o = byId.get(n.id) ?? { id: n.id, name: n.name, count: 0 };
      o.count++; byId.set(n.id, o);
    }
    const options = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (!options.length) break;
    const pick = chosen[i] != null && byId.has(chosen[i] as number) ? (chosen[i] as number) : null;
    if (options.length < 2 && pick == null) continue;
    levels.push({ index: i, level, options, chosen: pick, total: pool.length });
    if (pick == null) break;
    pool = pool.filter((m) => m.typePath?.[i]?.id === pick);
  }
  return { levels, shown: pool };
}
