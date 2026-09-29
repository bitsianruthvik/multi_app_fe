import type { FloorDay, FloorReopened, FloorRunning, FloorStep } from '../../api/types';

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

/** The stretch of time the shift bar draws: the shifts, widened to cover anything outside them. */
export function barWindow(day: FloorDay, now: Date): { from: number; to: number } {
  const points: number[] = [];
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

/** The first moment a typed clock time may mean: two hours before the earliest shift (early starters), else midnight of the day. */
export function dayStart(day: FloorDay | null, dateStr: string): Date {
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
