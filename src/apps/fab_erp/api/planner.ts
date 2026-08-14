/**
 * fab_erp Production Planner API helpers.
 *
 * Wraps routes/planner.js (mounted under /api/:companySlug/fab_erp). Reads are
 * gated by `fab_erp_planner_view`, everything else by `fab_erp_planner_manage`
 * (admins bypass both on the backend).
 *
 * Two shapes matter and are deliberately kept apart:
 *
 *   PlanEntry     a bar that is ON the plan — editable, movable, pinnable.
 *   PlanRunItem   a bar the ENGINE suggested. Frozen. It becomes a PlanEntry
 *                 only when accepted, and the run it came from is kept either
 *                 way so the retrospective has something honest to compare to.
 *
 * A refused placement comes back as HTTP 409 with a `code` — see PlanErrorCode.
 * Those are answers, not faults: the planner is meant to read them and move the
 * bar, so surface the message rather than a generic failure toast.
 */

import { fabGet, fabPost, fabPatch, fabDel } from './client';

// ── errors ───────────────────────────────────────────────────────────────────

export type PlanErrorCode =
  | 'NO_TASKS'
  | 'BAD_START'
  | 'TASK_NOT_FOUND'
  | 'NO_RESOURCE_TYPE'
  | 'ALREADY_PLANNED'
  | 'PREDECESSOR_UNPLANNED'
  | 'PREDECESSOR_LATER'
  | 'ENTRY_NOT_FOUND'
  | 'NOT_SPLITTABLE'
  | 'RUN_NOT_FOUND';

export interface PlanErrorDetail {
  taskId?: number;
  entryId?: number;
  predecessorTaskId?: number;
  predecessorSeqNo?: number;
  predecessorEnd?: string;
}

/** Pull the structured refusal out of an axios error, if it is one. */
export function planErrorOf(err: unknown): { code: PlanErrorCode; message: string; detail: PlanErrorDetail } | null {
  const res = (err as { response?: { status?: number; data?: Record<string, unknown> } })?.response;
  if (res?.status !== 409 || !res?.data?.code) return null;
  return {
    code: res.data.code as PlanErrorCode,
    message: String(res.data.message ?? 'That placement is not possible.'),
    detail: (res.data.detail ?? {}) as PlanErrorDetail,
  };
}

// ── the grid ─────────────────────────────────────────────────────────────────

export interface PlanEntryTask {
  taskId: number;
  plannedMinutes: number;
  status: string;
  seqNo: number | null;
  itemId: number;
  itemName: string | null;
}

export interface PlanEntry {
  id: number;
  planDate: string;
  resourceTypeId: number;
  resourceId: number | null;
  resourceName: string | null;
  plannedStart: string;
  plannedEnd: string;
  plannedMinutes: number;
  kind: 'bundle' | 'task';
  bundleKey: string | null;
  ancestorItemId: number | null;
  orderId: number | null;
  orderNumber: string | null;
  operationId: number | null;
  operationName: string | null;
  source: 'suggested' | 'manual';
  acceptedFromRunId: number | null;
  isPinned: boolean;
  status: string;
  label: string | null;
  notes: string | null;
  requiredDate: string | null;
  mustFinishBy: string | null;
  tasks: PlanEntryTask[];
}

/** One stretch of time in which a fixed number of a lane's machines are manned. */
export interface CoverageSegment {
  start: string;
  end: string;
  coveredUnits: number;
}

export interface PlanDay {
  date: string;
  /** null = this lane has no shift calendar, so the ceiling is unknown, not zero. */
  capacityMinutes: number | null;
  plannedMinutes: number;
  overAllocated: boolean;
  overBy: number;
}

export interface PlanLane {
  resourceTypeId: number;
  name: string;
  code: string | null;
  totalUnits: number;
  /** No shift calendar on this lane — the engine plans it 24/7 and says so. */
  unbounded: boolean;
  resources: { id: number; name: string; machineState: string | null }[];
  coverage: CoverageSegment[];
  days: PlanDay[];
  entries: PlanEntry[];
}

export interface PlanResponse {
  ok: boolean;
  from: string;
  to: string;
  timezone: string;
  days: string[];
  lanes: PlanLane[];
}

/** GET /plan — lanes, coverage shading, bars and per-day load for a window. */
export async function getPlan(params: {
  from: string; to: string; resourceTypeIds?: number[];
}): Promise<PlanResponse> {
  return fabGet<PlanResponse>('plan', {
    from: params.from,
    to: params.to,
    ...(params.resourceTypeIds?.length ? { resourceTypeIds: params.resourceTypeIds.join(',') } : {}),
  });
}

// ── the backlog rail ─────────────────────────────────────────────────────────

export interface BacklogTask {
  id: number;
  orderId: number | null;
  orderNumber: string | null;
  itemId: number;
  itemName: string | null;
  parentItemId: number | null;
  seqNo: number | null;
  status: string;
  resourceTypeId: number | null;
  resourceId: number | null;
  operationId: number | null;
  operationName: string | null;
  computedHours: string | null;
  requiredDate: string | null;
  mustFinishBy: string | null;
}

/** GET /plan/backlog — unplanned work, ranked the way the engine ranks. */
export async function getBacklog(params: {
  resourceTypeIds?: number[]; limit?: number;
} = {}): Promise<{ ok: boolean; tasks: BacklogTask[] }> {
  return fabGet('plan/backlog', {
    ...(params.resourceTypeIds?.length ? { resourceTypeIds: params.resourceTypeIds.join(',') } : {}),
    ...(params.limit ? { limit: params.limit } : {}),
  });
}

// ── suggestions ──────────────────────────────────────────────────────────────

export interface SuggestionItem {
  bundleKey: string;
  resourceTypeId: number;
  resourceId: number | null;
  ancestorItemId: number | null;
  orderId: number | null;
  orderNumber: string | null;
  operationId: number | null;
  plannedStart: string;
  plannedEnd: string;
  planDate: string;
  plannedMinutes: number;
  taskCount: number;
  taskIds: number[];
  label: string;
  reason: string;
  isCriticalChain: boolean;
  mustFinishBy: string | null;
  /** The engine could not fit this inside the order's hard date. Reported, never hidden. */
  breachesPin: boolean;
}

export interface UnschedulableTask {
  taskId: number;
  resourceId: number | null;
  reason: string;
  orderNumber: string | null;
  operationName: string | null;
}

export interface SuggestResponse {
  ok: boolean;
  runId: number;
  windowFrom: string;
  windowTo: string;
  anchorAt: string;
  entryCount: number;
  taskCount: number;
  plannedMinutes: number;
  /** Tasks with no time formula result — they plan as zero-length bars. */
  missingDuration: number;
  unschedulable: UnschedulableTask[];
  items: SuggestionItem[];
}

/**
 * GET /plan/suggest — compute a suggestion and freeze it as a run.
 *
 * This WRITES (the run is persisted whether or not it is accepted) but changes
 * nothing about the plan, which is why it is safe to call on demand.
 */
export async function suggestPlan(params: {
  from: string; to: string; resourceTypeIds?: number[]; bundling?: boolean;
}): Promise<SuggestResponse> {
  return fabGet<SuggestResponse>('plan/suggest', {
    from: params.from,
    to: params.to,
    ...(params.resourceTypeIds?.length ? { resourceTypeIds: params.resourceTypeIds.join(',') } : {}),
    ...(params.bundling === false ? { bundling: 'false' } : {}),
  });
}

/** POST /plan/accept — move a run's bars onto the real plan. */
export async function acceptRun(body: {
  runId: number; runItemIds?: number[]; pin?: boolean;
}): Promise<{ ok: boolean; accepted: number; skipped: { runItemId: number; reason: string }[] }> {
  return fabPost('plan/accept', body);
}

// ── editing ──────────────────────────────────────────────────────────────────

/** POST /plan/entries — place work by hand. Refused (409) if the DAG says no. */
export async function createPlanEntry(body: {
  taskIds: number[];
  plannedStart: string;
  plannedEnd?: string;
  resourceTypeId?: number;
  resourceId?: number | null;
  notes?: string;
}): Promise<{ ok: boolean; entryId: number }> {
  return fabPost('plan/entries', body);
}

/** PATCH /plan/entries/:id — move, resize or pin. A move re-checks the DAG. */
export async function updatePlanEntry(id: number, body: {
  plannedStart?: string;
  plannedEnd?: string;
  resourceId?: number | null;
  isPinned?: boolean;
  notes?: string;
}): Promise<{ ok: boolean; entryId: number }> {
  return fabPatch(`plan/entries/${id}`, body);
}

/** POST /plan/entries/:id/split — explode a bundle, or peel named tasks off it. */
export async function splitPlanEntry(id: number, body: { taskIds?: number[] } = {}): Promise<{ ok: boolean; entryIds: number[] }> {
  return fabPost(`plan/entries/${id}/split`, body);
}

/** DELETE /plan/entries/:id — take a bar off the plan. */
export async function deletePlanEntry(id: number): Promise<{ ok: boolean; removed: boolean }> {
  return fabDel(`plan/entries/${id}`);
}
