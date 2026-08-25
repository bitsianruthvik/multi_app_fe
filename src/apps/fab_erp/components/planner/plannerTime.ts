/**
 * plannerTime.ts — the one place that converts between instants and pixels.
 *
 * Everything the planner draws is a span mapped onto a fixed window, so the
 * mapping lives here rather than being re-derived in each component. Two rules
 * this module exists to enforce:
 *
 *   1. Stored timestamps are UTC. The plant's wall clock is a DIFFERENT zone
 *      (fab_plants.timezone, e.g. Asia/Kolkata) and every hour label, day
 *      boundary and tick the planner shows is in THAT zone, not the browser's.
 *      A supervisor in another country must see the shift they actually run.
 *   2. A day boundary is resolved through the zone, never by adding 24h — that
 *      drifts by an hour across a DST change.
 */

/**
 * The three zooms, named for the unit a planner is thinking in.
 *
 *   day    one day, hour by hour. Where a bar is nudged onto a specific shift.
 *   week   seven days. Where a girder is pushed left into the gaps left by the
 *          one before it.
 *   month  five weeks, starting on a Monday. Where the shape of the quarter is
 *          read: which machines are solid, which are hollow, and whether there
 *          is room for the order being quoted.
 *
 * Five weeks rather than a calendar month because the row is scanned by WEEK. A
 * calendar month starts on a different weekday every time, so Monday would sit
 * under one column in March and another in April, and comparing two rows would
 * become arithmetic. A fixed 35 days always begins on a Monday, so every seventh
 * column is the same weekday and a weekly rhythm is visible as a rhythm.
 */
export type ViewMode = 'day' | 'week' | 'month';

/** Days drawn by each zoom. */
export const MODE_DAYS: Record<ViewMode, number> = { day: 1, week: 7, month: 35 };

/**
 * The Monday on or before `ymd`.
 *
 * Only the month view snaps. The week view deliberately does NOT (see buildScale):
 * "the next week" means from now, and snapping would hide the second half of
 * today every Sunday.
 */
export function weekStartYMD(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const back = (dt.getUTCDay() + 6) % 7; // Sunday = 0 in JS; weeks start Monday here
  dt.setUTCDate(dt.getUTCDate() - back);
  return dt.toISOString().slice(0, 10);
}

/** Local wall-clock parts of an instant, in a given IANA zone. */
export function zonedParts(iso: string | Date, timeZone: string) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    // Intl gives "24" for midnight in some engines; normalise so arithmetic works.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** YYYY-MM-DD for an instant, in the plant's zone. */
export function zonedYMD(iso: string | Date, timeZone: string): string {
  return zonedParts(iso, timeZone).ymd;
}

/** Offset of `timeZone` from UTC at `date`, in ms. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  );
  return asUtc - date.getTime();
}

/**
 * The UTC instant at which local `ymd hh:mm` occurs in `timeZone`.
 * Two passes, because the offset depends on the instant being solved for —
 * mirrors the backend's plantTime.zonedWallClockToUtc.
 */
export function zonedWallClockToUtc(ymd: string, hhmm: string, timeZone: string): Date {
  const naive = new Date(`${ymd}T${hhmm}:00Z`);
  const firstGuess = new Date(naive.getTime() - tzOffsetMs(naive, timeZone));
  return new Date(naive.getTime() - tzOffsetMs(firstGuess, timeZone));
}

/** Start of the local day `ymd`, as a UTC instant. */
export function dayStartUtc(ymd: string, timeZone: string): Date {
  return zonedWallClockToUtc(ymd, '00:00', timeZone);
}

/** The local day after `ymd`, resolved through the calendar rather than +24h. */
export function nextYMD(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

export function addDaysYMD(ymd: string, n: number): string {
  let out = ymd;
  for (let i = 0; i < Math.abs(n); i += 1) {
    if (n > 0) out = nextYMD(out);
    else {
      const [y, m, d] = out.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - 1);
      out = dt.toISOString().slice(0, 10);
    }
  }
  return out;
}

/** Today in the plant's zone — not the browser's. */
export function todayYMD(timeZone: string): string {
  return zonedYMD(new Date(), timeZone);
}

/**
 * The drawing window for a view.
 *
 * Day view spans one local day. Week view spans seven, starting on the given
 * day rather than snapping to Monday: a planner looking at "the next week"
 * means from now, and snapping would hide today's second half every Sunday.
 */
export interface Scale {
  mode: ViewMode;
  timeZone: string;
  /** First local day drawn. */
  fromYMD: string;
  /** Local days drawn, inclusive. */
  days: string[];
  startMs: number;
  endMs: number;
  /** Fraction 0..1 of the window at a given instant, clamped. */
  frac: (iso: string | Date) => number;
  /** Left % and width % for a span, clipped to the window. Null if fully outside. */
  place: (startIso: string | Date, endIso: string | Date) => { leftPct: number; widthPct: number } | null;
}

export function buildScale(mode: ViewMode, fromYMD: string, timeZone: string): Scale {
  const dayCount = MODE_DAYS[mode] ?? 7;
  const days: string[] = [];
  let cursor = fromYMD;
  for (let i = 0; i < dayCount; i += 1) { days.push(cursor); cursor = nextYMD(cursor); }

  const startMs = dayStartUtc(fromYMD, timeZone).getTime();
  const endMs = dayStartUtc(cursor, timeZone).getTime();
  const span = Math.max(1, endMs - startMs);

  const frac = (iso: string | Date) => {
    const t = (typeof iso === 'string' ? new Date(iso) : iso).getTime();
    return Math.min(1, Math.max(0, (t - startMs) / span));
  };

  const place = (startIso: string | Date, endIso: string | Date) => {
    const s = (typeof startIso === 'string' ? new Date(startIso) : startIso).getTime();
    const e = (typeof endIso === 'string' ? new Date(endIso) : endIso).getTime();
    if (e <= startMs || s >= endMs) return null;
    const leftPct = frac(new Date(s)) * 100;
    const rightPct = frac(new Date(e)) * 100;
    // A zero-length bar (a task with no time formula) still has to be clickable.
    return { leftPct, widthPct: Math.max(0.4, rightPct - leftPct) };
  };

  return { mode, timeZone, fromYMD, days, startMs, endMs, frac, place };
}

/** A gridline, and its label if one fits there. An empty label draws the line only. */
export interface Tick { label: string; leftPct: number; major: boolean }

/** Column ticks: hours in day view, days in week view. */
export function buildTicks(scale: Scale, trackPx?: number): Tick[] {
  const out: Tick[] = [];
  if (scale.mode === 'day') {
    /**
     * Gridlines every hour; LABELS only as often as they fit.
     *
     * Every hour was labelled unconditionally, and a day view is 24 of them. In
     * the width this grid actually gets on a laptop — around 690px once the lane
     * headers and the backlog rail have taken theirs — that is 28px per label
     * for a string ("00:00") that needs about 38. They physically overlapped,
     * which is most of why the grid read as crumpled.
     *
     * The step is chosen from the measured track rather than fixed, so a wide
     * screen still gets hourly labels and a narrow one degrades to 2, 3, 4 or 6
     * hourly instead of turning to mush.
     */
    const LABEL_PX = 46;
    const px = trackPx && trackPx > 0 ? trackPx : 690;
    const step = [1, 2, 3, 4, 6, 8, 12].find((s) => (px / (24 / s)) >= LABEL_PX) ?? 12;
    for (let h = 0; h < 24; h += 1) {
      const at = zonedWallClockToUtc(scale.fromYMD, `${String(h).padStart(2, '0')}:00`, scale.timeZone);
      out.push({
        label: h % step === 0 ? `${String(h).padStart(2, '0')}:00` : '',
        leftPct: scale.frac(at) * 100,
        major: h % Math.max(step, 6) === 0,
      });
    }
    return out;
  }
  if (scale.mode === 'month') {
    /**
     * A line per day, a LABEL per week.
     *
     * Thirty-five day labels do not fit and, more to the point, are not what is
     * being read at this zoom: nobody looks at a five-week row to find out what
     * Tuesday the 9th holds. They look for where the solid stretches end. The
     * daily lines give that shape a ruler; the weekly labels say roughly when.
     */
    for (let i = 0; i < scale.days.length; i += 1) {
      const ymd = scale.days[i];
      const at = dayStartUtc(ymd, scale.timeZone);
      const dt = new Date(`${ymd}T12:00:00Z`);
      const weekStart = i % 7 === 0;
      out.push({
        label: weekStart
          ? `${dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
          : '',
        leftPct: scale.frac(at) * 100,
        major: weekStart,
      });
    }
    return out;
  }
  for (const ymd of scale.days) {
    const at = dayStartUtc(ymd, scale.timeZone);
    const dt = new Date(`${ymd}T12:00:00Z`);
    out.push({
      label: `${dt.toLocaleDateString(undefined, { weekday: 'short' })} ${ymd.slice(8)}`,
      leftPct: scale.frac(at) * 100,
      major: true,
    });
  }
  return out;
}

/** "6h 30m" / "45m" — hours are how a shop floor talks about work. */
export function fmtMinutes(min: number | null | undefined): string {
  if (min == null) return '—';
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

/** Local HH:MM for an instant, in the plant's zone. */
export function fmtLocalTime(iso: string | Date, timeZone: string): string {
  const p = zonedParts(iso, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
