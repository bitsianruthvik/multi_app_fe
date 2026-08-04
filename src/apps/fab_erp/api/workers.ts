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
}

export function getRoster() {
  return fabGet<{ ok: boolean; workers: Worker[] }>('workers');
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

/** One shape for "off today", "left at 4" and "at training all week". */
export function setAway(workerId: number, body: { from: string; to?: string | null; reason?: string; note?: string }) {
  return fabPost<{ ok: boolean; id: number }>(`workers/${workerId}/away`, body as unknown as Record<string, unknown>);
}

export function removeInterval(id: number) {
  return fabDel<{ ok: boolean; removed: number }>(`worker-intervals/${id}`);
}
