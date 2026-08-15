/**
 * shiftLog.ts — typed client for the end-of-day back-entry screen (Issue 3).
 * Backend: multi_app_be/apps/fab_erp/routes/shiftLog.js
 */

import { fabGet, fabPost } from './client';

export interface ShiftLogTask {
  id: number;
  status: string;
  operationId: number | null;
  operationName: string | null;
  itemId: number | null;
  itemName: string | null;
  itemMark: string | null;
  plannedQty: number | string | null;
  orderId: number | null;
  orderNumber: string | null;
  seqNo: number;
  computedHours: number | null;
  assignedResourceId: number | null;
  startedAt: string | null;
  completedAt: string | null;
  producedQty: number | string | null;
  scrapQty: number | string | null;
  /** Already has started/completed events on this date — don't invite a duplicate. */
  alreadyLogged: boolean;
  /**
   * Which bucket the picker files this under. Decided server-side, next to the
   * queries that produced it, so the two cannot disagree.
   *
   *   planned  the Production Planner put it on this machine for this date
   *   open     released work on this machine (eligible / running / paused)
   *   blocked  the engine has NOT released it — see blockedNote
   *   logged   already written up for this date; shown so it is visibly done
   */
  group: 'planned' | 'open' | 'blocked' | 'logged';
  planned: boolean;
  /** Why a blocked task is not released, e.g. "waiting on material". */
  blockedNote: string | null;
}

export interface ShiftLogResponse {
  ok: boolean;
  resource: { id: number; name: string; code: string; plantId: number | null; resourceTypeId: number | null };
  date: string;
  shift: { minutes: number; intervals: Array<{ start: string; end: string }> };
  tasks: ShiftLogTask[];
  /** The candidate list hit its cap — say so rather than letting it just end. */
  tasksTruncated?: boolean;
  downtime: Array<{ id: number; state: string; reasonCode: string | null; at: string; note: string | null }>;
  operators: Array<{ userId: number; name: string; isPrimary: number; absent: boolean }>;
  downtimeReasons: Array<{ code: string; label: string }>;
}

export interface WorkEntry {
  taskId: number;
  startedAt: string;
  completedAt?: string | null;
  producedQty?: number | null;
  scrapQty?: number | null;
  qcResult?: 'pass' | 'fail';
  note?: string | null;
}

export interface DowntimeEntry {
  from: string;
  until?: string | null;
  state?: 'down' | 'off';
  reasonCode?: string | null;
  note?: string | null;
}

export function getShiftLog(resourceId: number, date: string) {
  return fabGet<ShiftLogResponse>('shift-log', { resourceId, date });
}

export function saveShiftLog(payload: {
  resourceId: number;
  date: string;
  work: WorkEntry[];
  downtime: DowntimeEntry[];
  absences: Array<{ userId: number; absent: boolean }>;
}) {
  return fabPost<{
    ok: boolean;
    workLogged: number;
    downtimeLogged: number;
    absencesSet: number;
    warnings: string[];
  }>('shift-log', payload as unknown as Record<string, unknown>);
}
