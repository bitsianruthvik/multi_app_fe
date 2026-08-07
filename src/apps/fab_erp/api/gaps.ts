/**
 * gaps.ts — unaccounted machine time, and explaining it.
 * Backend: multi_app_be/apps/fab_erp/routes/gaps.js
 */

import { fabGet, fabPost, fabDel } from './client';

export type GapScope = 'site' | 'machine' | 'task';

export interface GapReason {
  code: string;
  label: string;
  scope: GapScope;
  /** Which fab_task_wait_segments reason this produces. */
  waitReason: string;
  sortOrder: number;
}

export interface Interval { start: string; end: string }

export interface ExplainedSpan {
  kind: 'work' | 'machine' | 'site' | 'task';
  stream: 'task' | 'resource' | 'plant' | 'hold';
  id?: number;
  code: string | null;
  label: string;
  taskId?: number;
  from: string;
  to: string;
  /** Work rows are not removable — they are what the machine actually did. */
  removable: boolean;
}

export interface DayGaps {
  ok: boolean;
  resourceId: number;
  resourceName: string;
  date: string;
  timezone: string;
  dayStart: string;
  dayEnd: string;
  workingMinutes: number;
  explainedMinutes: number;
  /** The residual. This IS `unexplained_idle` — not a UI construct. */
  gapMinutes: number;
  working: Interval[];
  explained: ExplainedSpan[];
  gaps: Interval[];
}

/**
 * One shift as a crew actually worked it. The key is (shiftId, the local date
 * the shift STARTED) — which is what keeps a 22:00–06:00 night shift whole
 * instead of splitting it across two calendar days.
 */
export interface ShiftInstance {
  key: string;
  shiftId: number;
  shiftName: string | null;
  /** The date the shift STARTED, not the date a span falls on. */
  localDate: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  start: string;
  end: string;
  working: Interval[];
  explained: ExplainedSpan[];
  gaps: Interval[];
  workingMinutes: number;
  explainedMinutes: number;
  gapMinutes: number;
}

export interface RangeGaps {
  ok: boolean;
  resourceId: number;
  resourceName: string;
  from: string;
  to: string;
  timezone: string;
  instances: ShiftInstance[];
  workingMinutes: number;
  explainedMinutes: number;
  gapMinutes: number;
}

/** `none` = nothing to account for. Grey, never red — see the backend note. */
export type CoverageState = 'none' | 'partial' | 'complete';

export interface MachineCoverage {
  resourceId: number;
  name: string;
  code: string | null;
  workingMinutes: number;
  explainedMinutes: number;
  gapMinutes: number;
  state: CoverageState;
}

export function getRangeGaps(resourceId: number, from: string, to: string) {
  return fabGet<RangeGaps>('gaps', { resourceId, from, to });
}

/** Totals for every machine in one request — what colours the tab dots. */
export function getCoverage(from: string, to: string) {
  return fabGet<{ ok: boolean; from: string; to: string; machines: MachineCoverage[] }>(
    'gaps/coverage', { from, to },
  );
}

export function getGapReasons() {
  return fabGet<{ ok: boolean; reasons: GapReason[] }>('gap-reasons');
}

export function getDayGaps(resourceId: number, date: string) {
  return fabGet<DayGaps>('gaps', { resourceId, date });
}

/**
 * Assert a reason over a span. Times are WALL CLOCK at the site — the backend
 * resolves them through the plant's timezone, so they mean what the board says.
 */
export function explainGap(body: {
  resourceId: number;
  date: string;
  code: string;
  fromTime: string;
  toTime: string;
  /**
   * The instant the shift being written up began. Wall clock alone is ambiguous
   * on a night shift — a 22:00–06:00 shift's 01:00–06:00 gap has both times after
   * midnight, and without this the server resolves them onto the shift's start
   * date, 24h early, into the previous night. Send it whenever writing a shift.
   */
  windowStart?: string;
  taskId?: number;
  party?: string;
  reference?: string;
  note?: string;
}) {
  return fabPost<DayGaps & { wrote: { stream: string; id: number; scope: GapScope } }>(
    'gaps/explain', body as unknown as Record<string, unknown>,
  );
}

export function withdrawExplained(stream: string, id: number, resourceId: number, date: string) {
  return fabDel<DayGaps>(`gaps/explained/${stream}/${id}?resourceId=${resourceId}&date=${date}`);
}

// ── Excel round-trip ────────────────────────────────────────────────────────

export interface GapImportRow {
  row: number;
  machine: string;
  reason?: string;
  from?: string;
  to?: string;
  ok: boolean;
  message?: string;
}

export interface GapImportResult {
  ok: boolean;
  applied: number;
  rows: GapImportRow[];
  errors: { row: number; message: string }[];
}
