/**
 * batches.ts — typed client for the batching endpoints (Issue 4).
 * Backend: multi_app_be/apps/fab_erp/routes/batches.js
 */

import { fabGet, fabPost } from './client';

export type BatchMode = 'none' | 'shared_setup' | 'fixed_cycle' | 'capacity_cycle';

export const BATCH_MODE_LABELS: Record<BatchMode, string> = {
  none: 'Not batchable',
  shared_setup: 'Shared setup',
  fixed_cycle: 'Fixed cycle',
  capacity_cycle: 'Capacity cycle',
};

/** What each mode means in the operator's terms, for tooltips and settings help. */
export const BATCH_MODE_HELP: Record<BatchMode, string> = {
  none: 'Tasks run one at a time on this machine.',
  shared_setup: 'Each piece is still worked individually, but setup is paid once — stack and drill.',
  fixed_cycle: 'One run costs the same however many pieces go in — a galvanising dip, one nested cut.',
  capacity_cycle: 'Like fixed cycle, but the machine holds a limited number, so more pieces means more cycles.',
};

export interface BatchPolicy {
  operationId: number;
  operationName: string | null;
  resourceId: number;
  resourceName: string;
  resourceTypeId: number | null;
  batchMode: BatchMode;
  capacity: number | null;
  capacitySource: 'mapping' | 'machine' | null;
  matchKeys: string[];
  setupMinutes: number;
}

export interface BatchEstimate {
  totalMinutes: number;
  setupMinutes: number;
  runMinutes: number;
  cycles: number;
  soloMinutes: number;
  savedMinutes: number;
}

export interface BatchCandidate {
  taskId: number;
  itemId: number | null;
  itemName: string | null;
  itemMark: string | null;
  itemQty: number | null;
  orderId: number | null;
  orderNumber: string | null;
  status: string;
  computedHours: number | null;
  eligible: boolean;
  reason: string | null;
}

export interface CandidatesResponse {
  ok: boolean;
  policy: BatchPolicy;
  anchorTaskId: number;
  batchable: boolean;
  candidates: BatchCandidate[];
}

export interface PreviewResponse {
  ok: boolean;
  policy: BatchPolicy;
  taskCount: number;
  estimate: BatchEstimate;
}

export interface BatchMember {
  taskId: number;
  status: string;
  itemId: number | null;
  orderId: number | null;
  computedHours: number | null;
  attributedMinutes: number | null;
  producedQty: number | null;
  scrapQty: number | null;
  qcResult: string | null;
  itemName: string | null;
  itemMark: string | null;
  itemQty: number | string | null;
  itemUnit: string | null;
  orderNumber: string | null;
}

export interface BatchDetail {
  ok: boolean;
  batch: {
    id: number;
    resourceId: number;
    operationId: number;
    batchMode: BatchMode;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    totalMinutes: number | null;
    setupMinutes: number | null;
    resourceName: string | null;
    operationName: string | null;
  };
  members: BatchMember[];
}

export interface CompleteOutcome {
  producedQty?: number;
  scrapQty?: number;
  qcResult?: 'pass' | 'fail';
}

export function getBatchCandidates(resourceId: number, taskId: number) {
  return fabGet<CandidatesResponse>('batches/candidates', { resourceId, taskId });
}

export function previewBatch(resourceId: number, taskIds: number[]) {
  return fabPost<PreviewResponse>('batches/preview', { resourceId, taskIds });
}

export function startBatch(resourceId: number, taskIds: number[], force = false) {
  return fabPost<{ ok: boolean; batchId: number; taskIds: number[]; policy: BatchPolicy; estimate: BatchEstimate }>(
    'batches/start',
    { resourceId, taskIds, force },
  );
}

export function getBatch(batchId: number) {
  return fabGet<BatchDetail>(`batches/${batchId}`);
}

export function completeBatch(batchId: number, outcomes: Record<number, CompleteOutcome>) {
  return fabPost<{
    ok: boolean;
    batchId: number;
    totalMinutes: number;
    setupMinutes: number;
    runMinutes: number;
    members: Array<{ taskId: number; attributedMinutes: number | null; reworkTaskId: number | null; qcResult: string }>;
    successorsCleared: number;
    variance: { planMinutes: number; actualMinutes: number; varianceMinutes: number };
  }>(`batches/${batchId}/complete`, { outcomes });
}
