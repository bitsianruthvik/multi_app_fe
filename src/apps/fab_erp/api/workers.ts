/**
 * workers.ts — the floor roster and machine crews.
 * Backend: multi_app_be/apps/fab_erp/routes/workers.js
 */

import { fabGet, fabPost, fabPatch, fabDel } from './client';

export type WorkerType = 'employee' | 'contractor' | 'vendor';

export const WORKER_TYPE_LABELS: Record<WorkerType, string> = {
  employee: 'Employee',
  contractor: 'Contractor',
  vendor: 'Vendor staff',
};

export interface AwayInterval {
  id: number;
  fromTs?: string;
  toTs?: string | null;
  from?: string;
  to?: string | null;
  reason: string | null;
}

export interface CrewMember {
  assignmentId: number;
  workerId: number;
  name: string;
  code: string | null;
  workerType: WorkerType;
  vendorName: string | null;
  userId: number | null;
  phone: string | null;
  fromTs: string;
  toTs: string | null;
  away: AwayInterval[];
}

export interface Worker {
  id: number;
  name: string;
  code: string | null;
  workerType: WorkerType;
  vendorName: string | null;
  userId: number | null;
  phone: string | null;
  active: number;
  currentResourceId: number | null;
  currentResourceName: string | null;
  /** The shift they're on now — people own the calendar, not machines. */
  currentShiftId?: number | null;
  currentShiftName?: string | null;
  currentShiftStart?: string | null;
  currentShiftEnd?: string | null;
  /** Set once they leave the firm. Distinct from an `away` interval. */
  exitedAt?: string | null;
  /** The away interval covering right now, if any — drives the row status. */
  awayFrom?: string | null;
  awayTo?: string | null;
  awayReason?: string | null;
}

/**
 * What the row shows. Exit wins over away (you cannot be on leave from a job you
 * left), and a bounded away reads differently from an open-ended one.
 */
export type WorkerStatus =
  | { kind: 'exited'; since: string | null }
  | { kind: 'away'; until: string | null; reason: string | null }
  | { kind: 'working' };

export function workerStatus(w: Worker): WorkerStatus {
  if (!w.active || w.exitedAt) return { kind: 'exited', since: w.exitedAt ?? null };
  if (w.awayFrom) return { kind: 'away', until: w.awayTo ?? null, reason: w.awayReason ?? null };
  return { kind: 'working' };
}

/** A machine with nobody rostered on it. */
export interface CoverageGap {
  resourceId: number;
  name: string;
  code: string | null;
  plantId: number | null;
  /** Tasks queued on it right now — 0 means unmanned but not currently blocking. */
  waitingTasks: number;
}

export function getRoster() {
  return fabGet<{ ok: boolean; workers: Worker[] }>('workers');
}

/**
 * Machines with no crew. An unmanned machine has zero capacity and cannot be
 * scheduled at all, so this is asked BEFORE planning rather than discovered as
 * a pile of per-task failures afterwards.
 */
export function getCrewCoverage(params?: { from?: string; to?: string; onlyWithWork?: boolean }) {
  return fabGet<{
    ok: boolean; from: string; to: string; unmanned: CoverageGap[]; blockingCount: number;
  }>('crew-coverage', params as Record<string, unknown> | undefined);
}

export function getCrew(resourceId: number, from?: string, to?: string) {
  return fabGet<{ ok: boolean; resourceId: number; crew: CrewMember[] }>('workers', { resourceId, from, to });
}

/** `resourceId` puts them straight onto that machine — adding happens where you are. */
export function addWorker(body: {
  name: string; workerType?: WorkerType; vendorName?: string | null;
  code?: string | null; phone?: string | null; resourceId?: number;
}) {
  return fabPost<{ ok: boolean; id: number }>('workers', body as unknown as Record<string, unknown>);
}

export function updateWorker(id: number, body: Partial<Omit<Worker, 'id'>>) {
  return fabPatch<{ ok: boolean }>(`workers/${id}`, body as unknown as Record<string, unknown>);
}

export function assignWorker(workerId: number, resourceId: number, at?: string) {
  return fabPost<{ ok: boolean; id: number }>(`workers/${workerId}/assign`, { resourceId, at });
}

export function unassignWorker(workerId: number, resourceId: number, at?: string) {
  return fabPost<{ ok: boolean; closed: number }>(`workers/${workerId}/unassign`, { resourceId, at });
}

/**
 * One shape for "off today", "left at 4" and "at training all week".
 *
 * Two input forms. Prefer the wall-clock one (`date` + `fromTime`/`toTime`, or
 * `date` + `toDate` for whole days): the backend resolves it through the
 * WORKER'S PLANT timezone, so the times mean what the board at the site says.
 * Converting in the browser instead would be right only while whoever is typing
 * sits in the same country as the plant.
 *
 * The `from`/`to` instant form stays for callers that genuinely know the instant
 * (CrewPanel's "left just now", the Shift Log).
 */
export function setAway(workerId: number, body:
  | { date: string; fromTime: string; toTime?: string; reason?: string; note?: string }
  | { date: string; toDate?: string; reason?: string; note?: string }
  | { from: string; to?: string | null; reason?: string; note?: string }) {
  return fabPost<{ ok: boolean; id: number }>(`workers/${workerId}/away`, body as unknown as Record<string, unknown>);
}

export function removeInterval(id: number) {
  return fabDel<{ ok: boolean; removed: number }>(`worker-intervals/${id}`);
}

// ── leaving, and coming back ────────────────────────────────────────────────

/**
 * They left the firm. NOT an away interval — an open-ended absence would keep
 * them on the roster forever with their machine assignment never closing. This
 * closes the intervals, so history stays true and the present goes quiet.
 */
export function exitWorker(workerId: number, body: { at?: string; note?: string } = {}) {
  return fabPost<{
    ok: boolean; name: string; exitedAt: string;
    assignmentsClosed: number; shiftsClosed: number;
  }>(`workers/${workerId}/exit`, body as unknown as Record<string, unknown>);
}

/** They rejoined. Old intervals stay closed; the new stint starts fresh. */
export function reactivateWorker(workerId: number) {
  return fabPost<{ ok: boolean }>(`workers/${workerId}/reactivate`, {});
}

// ── detail + history ─────────────────────────────────────────────────────────

/**
 * A row that may no longer be the current truth.
 *
 * Corrections are append-only: the superseded row stays on disk so the history
 * shows that a change happened, rather than quietly presenting the new value as
 * if it had always been there. The UI greys these rather than hiding them —
 * hiding them would make append-only indistinguishable from edit-in-place.
 */
export interface HistoryRow {
  id: number;
  fromTs: string;
  toTs: string | null;
  source: 'live' | 'backfill' | 'system';
  supersededById: number | null;
  deletedAt: string | null;
  note: string | null;
}

export interface AssignmentRow extends HistoryRow {
  resourceId: number | null;
  resourceName: string | null;
  kind: 'assigned' | 'away';
  reason: string | null;
  enteredBy: number | null;
  enteredByName: string | null;
}

export interface ShiftRow extends HistoryRow {
  shiftId: number;
  shiftName: string | null;
  startTime: string | null;
  endTime: string | null;
  workingMinutes: number | null;
  calendarName: string | null;
}

export interface TaskWorkerRow extends HistoryRow {
  taskId: number;
  role: string | null;
  status: string | null;
  operationName: string | null;
  resourceName: string | null;
}

export interface WorkerDetail {
  ok: boolean;
  worker: Worker;
  assignments: AssignmentRow[];
  shifts: ShiftRow[];
  tasks: TaskWorkerRow[];
}

export function getWorker(id: number) {
  return fabGet<WorkerDetail>(`workers/${id}`);
}

/** A row is the current truth only if it is neither withdrawn nor replaced. */
export const isLive = (r: HistoryRow) => !r.deletedAt && r.supersededById == null;

// ── shift assignment ─────────────────────────────────────────────────────────

/** People own the calendar — a machine's working time is derived from its crew. */
export function assignShift(workerId: number, shiftId: number, at?: string) {
  return fabPost<{ ok: boolean; id: number; spliced: number; source: string }>(
    `workers/${workerId}/shift`, { shiftId, at },
  );
}

// ── bulk add ─────────────────────────────────────────────────────────────────

export interface BulkPerson {
  name: string;
  code?: string | null;
  workerType?: WorkerType;
  vendorName?: string | null;
  phone?: string | null;
  shiftId?: number | null;
  resourceId?: number | null;
}

/** Whole batch is validated before anything is written — see the backend note. */
export function addWorkers(people: BulkPerson[]) {
  return fabPost<{ ok: boolean; created: number; people: { id: number; name: string }[] }>(
    'workers/bulk', { people } as unknown as Record<string, unknown>,
  );
}

export interface ImportResult {
  ok: boolean;
  imported: number;
  withShift?: number;
  withMachine?: number;
  errors: { row: number; message: string }[];
}
