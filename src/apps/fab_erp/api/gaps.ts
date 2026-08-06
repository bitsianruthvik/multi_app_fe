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
