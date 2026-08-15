/**
 * fab_erp API client
 *
 * fabQuery  — generic read via POST /api/query/v1/base_resource
 * fabMutate — permission-gated write via POST /api/:companySlug/fab_erp/mutate
 *
 * Both functions reuse the shared axios instance from @core/utils/axiosConfig,
 * which already attaches `Authorization: Bearer <token>` from localStorage and
 * handles 401 redirects automatically.
 */

import api, { API_HOST } from '@core/utils/axiosConfig';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Filter value for a single field — mirrors what the backend generic query API accepts. */
export type FilterValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[]
  | { gte?: string | number; lte?: string | number; between?: [string | number, string | number] };

/** A single sort directive as accepted by the backend generic query API. */
export interface OrderByClause {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Optional parameters for fabQuery.
 * Param names match the generic query API body observed in fab_flow pages:
 *   fields, filters, orderBy, pagination.
 */
export interface FabQueryParams {
  /** Specific columns to return.  Omit for all allowed columns. */
  fields?: string[];
  /** Column-keyed filter map.  Values follow the backend filter shape. */
  filters?: Record<string, FilterValue>;
  /** Sort order — array of { field, direction } objects. */
  orderBy?: OrderByClause[];
  /** Limit / cursor-based pagination. */
  pagination?: {
    limit?: number;
    cursor?: string;
  };
  /**
   * Ask the backend for a true `COUNT(*)` over the same secured WHERE, returned
   * as `total` alongside `data`.
   *
   * Opt-in because it costs a second round trip. **Never infer a total from
   * `data.length`** — with pagination that is the page size, which is how the
   * cockpit came to report "1 part defined" against 8 items.
   */
  includeTotal?: boolean;
}

// ---------------------------------------------------------------------------
// fabQuery — generic read
// ---------------------------------------------------------------------------

/**
 * Read rows from any resource via the generic query API.
 *
 * Calls: POST {API_HOST}/api/query/v1/base_resource
 * Body:  { operation: 'query', resource, fields?, filters?, orderBy?, pagination? }
 *
 * Returns the full Axios response `.data` (shape: { data: T[], total?: number, ... }).
 */
export async function fabQuery<T = unknown>(
  resource: string,
  params: FabQueryParams = {},
): Promise<T> {
  const { fields, filters, orderBy, pagination, includeTotal } = params;

  const body: Record<string, unknown> = {
    operation: 'query',
    resource,
  };

  if (fields !== undefined)      body.fields       = fields;
  if (filters !== undefined)     body.filters      = filters;
  if (orderBy !== undefined)     body.orderBy      = orderBy;
  if (pagination !== undefined)  body.pagination   = pagination;
  if (includeTotal)              body.includeTotal = true;

  const res = await api.post<T>(
    `${API_HOST}/api/query/v1/base_resource`,
    body,
  );

  return res.data;
}

// ---------------------------------------------------------------------------
// fabMutate — permission-gated write
// ---------------------------------------------------------------------------

/**
 * Write (insert / update / delete) a row through the fab_erp mutate endpoint.
 *
 * Calls: POST {API_HOST}/api/:companySlug/fab_erp/mutate
 * Body:  { resource, op, payload }
 *
 * companySlug is read from localStorage key "companySlug" — the same key set
 * by AuthContext on login (see src/core/contexts/AuthContext.tsx).
 * The JWT is not included in the body; the shared axios instance injects it as
 * `Authorization: Bearer <token>` via its request interceptor.
 *
 * Returns the full Axios response `.data`.
 */
/** Generic POST to a fab_erp user endpoint, e.g. /bom/copy-template */
export async function fabPost<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const companySlug = localStorage.getItem('companySlug');
  if (!companySlug) throw new Error('fabPost: companySlug not found in localStorage.');
  const res = await api.post<T>(`${API_HOST}/api/${companySlug}/fab_erp/${path}`, body);
  return res.data;
}

/** Generic PUT to a fab_erp user endpoint */
export async function fabPut<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const companySlug = localStorage.getItem('companySlug');
  if (!companySlug) throw new Error('fabPut: companySlug not found in localStorage.');
  const res = await api.put<T>(`${API_HOST}/api/${companySlug}/fab_erp/${path}`, body);
  return res.data;
}

/** Generic PATCH to a fab_erp user endpoint */
export async function fabPatch<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const companySlug = localStorage.getItem('companySlug');
  if (!companySlug) throw new Error('fabPatch: companySlug not found in localStorage.');
  const res = await api.patch<T>(`${API_HOST}/api/${companySlug}/fab_erp/${path}`, body);
  return res.data;
}

/** Generic DELETE to a fab_erp user endpoint */
export async function fabDel<T = unknown>(
  path: string,
): Promise<T> {
  const companySlug = localStorage.getItem('companySlug');
  if (!companySlug) throw new Error('fabDel: companySlug not found in localStorage.');
  const res = await api.delete<T>(`${API_HOST}/api/${companySlug}/fab_erp/${path}`);
  return res.data;
}

/** Generic GET to a fab_erp user endpoint */
export async function fabGet<T = unknown>(
  path: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const companySlug = localStorage.getItem('companySlug');
  if (!companySlug) throw new Error('fabGet: companySlug not found in localStorage.');
  const res = await api.get<T>(`${API_HOST}/api/${companySlug}/fab_erp/${path}`, { params });
  return res.data;
}

export async function fabMutate<T = unknown>(
  resource: string,
  op: 'insert' | 'update' | 'delete',
  payload: Record<string, unknown>,
): Promise<T> {
  const companySlug = localStorage.getItem('companySlug');
  if (!companySlug) {
    throw new Error('fabMutate: companySlug not found in localStorage. User may not be logged in.');
  }

  const res = await api.post<T>(
    `${API_HOST}/api/${companySlug}/fab_erp/mutate`,
    { resource, op, payload },
  );

  return res.data;
}

// ---------------------------------------------------------------------------
// Task wait-breakdown (EU-5) — GET /tasks/:id/wait-breakdown
// ---------------------------------------------------------------------------

/** Wait-time reason enum, as returned by GET /tasks/:id/wait-breakdown. */
export type WaitReason =
  | 'waiting_predecessors'
  | 'waiting_materials'
  | 'no_shift'
  | 'machine_down'
  | 'no_operator'
  | 'machine_busy'
  | 'output_blocked'
  | 'unexplained_idle'
  // Asserted causes — a supervisor said so, rather than the engine inferring it.
  | 'waiting_inspection'
  | 'weather'
  | 'drawing_hold'
  | 'other_explained';

/** One contiguous wait segment within the breakdown. */
export interface WaitBreakdownSegment {
  /** What was holding the task during this slice — named when exactly one thing was outstanding. */
  blockerType?: string | null;
  blockerRefId?: number | null;
  blockerLabel?: string | null;
  reason: WaitReason;
  segStart: string;
  segEnd: string;
  workingMinutes: number;
}

export interface WaitBreakdownResponse {
  ok: boolean;
  taskId: number;
  /** Per-reason total working minutes. Reasons with no wait time are omitted. */
  totals: Partial<Record<WaitReason, number>>;
  totalWaitMinutes: number;
  /** Ordered by segStart. */
  segments: WaitBreakdownSegment[];
}

/** Fetch the per-reason wait-time breakdown for one task. */
export async function getWaitBreakdown(taskId: number): Promise<WaitBreakdownResponse> {
  return fabGet<WaitBreakdownResponse>(`tasks/${taskId}/wait-breakdown`);
}

// ---------------------------------------------------------------------------
// Task backfill (EU-10 backend, EU-11 UI) — POST /tasks/:id/events/backfill
// ---------------------------------------------------------------------------

/** One pause interval to backfill. Omitting `resumed_at` records a still-open pause. */
export interface BackfillPause {
  paused_at: string;
  resumed_at?: string;
}

export interface BackfillTaskWorkBody {
  /** Datetime string (no timezone suffix — interpreted the same way native date/time inputs are elsewhere in this app). */
  started_at: string;
  completed_at?: string;
  pauses?: BackfillPause[];
  note?: string;
}

/**
 * Response from a successful backfill. `warnings` are non-blocking advisories
 * (e.g. a timestamp falls outside the shift calendar, or overlaps another task
 * on the same machine) — the write already happened by the time you see them.
 */
export interface BackfillTaskWorkResponse {
  ok: true;
  warnings: string[];
}

/**
 * Log or correct a task's past start/pause/complete times in one call
 * (EU-11 "Log past work" / "Adjust times" dialogs). Hard validation errors
 * (e.g. completed_at <= started_at) reject with a 400 `{message}`; the caller
 * should surface that inline and keep its dialog open.
 */
export async function backfillTaskWork(
  taskId: number,
  body: BackfillTaskWorkBody,
): Promise<BackfillTaskWorkResponse> {
  return fabPost<BackfillTaskWorkResponse>(`tasks/${taskId}/events/backfill`, { ...body });
}

// ---------------------------------------------------------------------------
// Event correction / backfill (EU-10 / EU-12) — used by MachineTimeline
// ---------------------------------------------------------------------------

/** Non-blocking advisory warnings both endpoints may return alongside `ok`. */
export interface EventWarnings { ok: boolean; warnings: string[] }

/** Response from POST /task-events/:eventId/correct. */
export interface CorrectEventResponse extends EventWarnings {
  oldEventId: number;
  newEventId: number;
}

/**
 * Correct one task event's timestamp. Inserts a superseding event (append-only)
 * and mirrors the value onto the task's matching timestamp column.
 * Calls: POST /api/:companySlug/fab_erp/task-events/:eventId/correct
 */
export async function correctTaskEvent(
  eventId: number,
  body: { at: string; note?: string },
): Promise<CorrectEventResponse> {
  return fabPost<CorrectEventResponse>(`task-events/${eventId}/correct`, body);
}

// NOTE (EU-11): a `backfillTaskEvents` helper + second `BackfillPause` interface
// briefly existed here too (added concurrently while this ticket was in
// progress) — removed as an exact duplicate of `backfillTaskWork`/`BackfillPause`
// above (same endpoint, same shape) and unreferenced anywhere else in the tree.

// ---------------------------------------------------------------------------
// Reconciliation feed (EU-13) — GET /reconciliation/feed, /reconciliation/count,
// POST /reconciliation/resolve
// ---------------------------------------------------------------------------

/** Discriminant for the anomaly kinds the backend currently computes. */
export type ReconciliationAnomalyType = 'longRunning' | 'stuckBuffer' | 'unexplainedIdle';

/**
 * One anomaly row from GET /reconciliation/feed. Fields beyond `type`/`label`/
 * `detail` are anomaly-specific — see multi_app_be/apps/fab_erp/routes/reconciliation.js
 * for exactly which fields each `type` populates.
 */
export interface ReconciliationAnomaly {
  type: ReconciliationAnomalyType;
  label: string;
  detail: string;
  taskId?: number;
  resourceId?: number | null;
  segmentId?: number;
  /** The segment start — decides which machine-day sheet to open. */
  segStart?: string;
  minutes?: number;
  contentId?: number;
  bufferId?: number;
  placedAt?: string;
  ageDays?: number;
  startedAt?: string;
  operationName?: string | null;
  itemName?: string | null;
}

export interface ReconciliationFeedResponse {
  ok: boolean;
  anomalies: ReconciliationAnomaly[];
}

export interface ReconciliationCountResponse {
  ok: boolean;
  count: number;
}

/** Fetch the live list of reconciliation anomalies for the current company. */
export async function getReconciliationFeed(): Promise<ReconciliationFeedResponse> {
  return fabGet<ReconciliationFeedResponse>('reconciliation/feed');
}

/** Cheap anomaly count — same computation as the feed, count-only response. */
export async function getReconciliationCount(): Promise<ReconciliationCountResponse> {
  return fabGet<ReconciliationCountResponse>('reconciliation/count');
}

/**
 * Resolve an `unexplainedIdle` anomaly: records a supervisor-entered `state_note`
 * event on the task explaining the idle time (see the backend route's honesty
 * note — this does not reclassify the underlying wait segment, just annotates it).
 */
export async function resolveAnomaly(body: {
  type: ReconciliationAnomalyType;
  taskId?: number;
  segmentId?: number;
  reason: string;
  note?: string;
}): Promise<{ ok: boolean }> {
  return fabPost<{ ok: boolean }>('reconciliation/resolve', body);
}

// ---------------------------------------------------------------------------
// Buffers — board/move (EU-7) + config (EU-9)
// See multi_app_be/apps/fab_erp/routes/buffers.js for the exact contracts.
// ---------------------------------------------------------------------------

export type BufferKind = 'input' | 'output';
export type BufferStatus = 'ok' | 'warn' | 'block';

/** One side (input or output) of a machine's buffer board entry. */
export interface BufferSide {
  load: number;
  capacity: number | null;
  pct: number;
  status: BufferStatus;
}

export interface BufferBoardMachine {
  resourceId: number;
  resourceName: string | null;
  input: BufferSide | null;
  output: BufferSide | null;
}

export interface BufferBoardResponse {
  ok: boolean;
  machines: BufferBoardMachine[];
}

/** GET /buffers/board — per-machine input/output load, fetched once for the whole board. */
export async function getBufferBoard(): Promise<BufferBoardResponse> {
  return fabGet<BufferBoardResponse>('buffers/board');
}

export type MoveBufferContentBody = {
  contentId?: number;
  taskId?: number;
  toBufferId?: number;
}

export interface MoveBufferContentResponse {
  ok: true;
  movedContentId: number;
  newContentId: number;
  fromBufferId: number;
  toBufferId: number;
  taskId?: number;
}

/** POST /buffers/move — one-tap move of a buffer content row (destination auto-resolved when omitted). */

/** One fab_buffers row, as returned by GET /buffers/config. */
export interface BufferConfigRow {
  id: number;
  resourceId: number;
  kind: BufferKind;
  stockLocationId: number | null;
  capacityValue: number;
  capacityUom: string;
  weightMetricKey: string;
  warnPct: number;
  blockPct: number;
  active: boolean;
}

export interface BufferConfigResponse {
  ok: boolean;
  buffers: BufferConfigRow[];
}

/** GET /buffers/config?resourceId= — both buffer rows (input/output, incl. inactive) for one machine. */
export async function getBufferConfig(resourceId: number): Promise<BufferConfigResponse> {
  return fabGet<BufferConfigResponse>('buffers/config', { resourceId });
}

export type SaveBufferConfigBody = {
  resourceId: number;
  kind: BufferKind;
  stockLocationId?: number;
  capacityValue: number;
  capacityUom?: string;
  weightMetricKey?: string;
  warnPct?: number;
  blockPct?: number;
  active?: boolean;
}

/** POST /buffers/config — upsert the (resourceId, kind) buffer. */
export async function saveBufferConfig(body: SaveBufferConfigBody): Promise<{ ok: boolean; id: number }> {
  return fabPost<{ ok: boolean; id: number }>('buffers/config', body);
}

/** DELETE /buffers/config/:id — soft-delete one buffer row. */
export async function deleteBufferConfig(id: number): Promise<{ ok: boolean }> {
  return fabDel<{ ok: boolean }>(`buffers/config/${id}`);
}

// ---------------------------------------------------------------------------
// Shop-floor analytics (EU-16) — GET /analytics/{machines,constraint,
// wait-pareto,project/:orderId}. All accept an optional { from, to } date range
// (YYYY-MM-DD or datetime); default is the last 30 days.
// See multi_app_be/apps/fab_erp/routes/analytics.js for the exact contracts.
// ---------------------------------------------------------------------------

/** A machine-state key used in the time-in-state breakdown. */
export type MachineStateKey = 'running' | 'idle' | 'down' | 'off';

/** Optional date-range for every analytics endpoint. */
export type AnalyticsRange = {
  from?: string;
  to?: string;
}

/** One machine's time-in-state (minutes) + utilization + current input-buffer fullness. */
export interface AnalyticsMachine {
  resourceId: number;
  name: string;
  states: Record<MachineStateKey, number>;
  /** running / (running + idle + down), as a percent. 0 when no logged time. */
  utilizationPct: number;
  /** Latest input-buffer fullness pct, or null when the machine has no input buffer. */
  inputBufferPct: number | null;
}

export interface AnalyticsMachinesResponse {
  ok: boolean;
  from: string;
  to: string;
  machines: AnalyticsMachine[];
}

/** GET /analytics/machines — per-machine time-in-state + utilization + input-buffer pct. */
export async function getAnalyticsMachines(range: AnalyticsRange = {}): Promise<AnalyticsMachinesResponse> {
  return fabGet<AnalyticsMachinesResponse>('analytics/machines', range);
}

/** One machine's row in the constraint ranking. */
export interface ConstraintRankRow {
  resourceId: number;
  name: string;
  /** Heuristic score in [0,1]; higher = more constraint-like. */
  score: number;
  utilizationPct: number;
  inputBufferPct: number | null;
  downstreamStarvationPct: number;
  reason: string;
}

/** One reason bucket in the wait Pareto. */
export interface WaitParetoRow {
  reason: WaitReason;
  minutes: number;
}

/** One item's touch-vs-wait row within a project. */
export interface ProjectAnalyticsItem {
  itemId: number;
  name: string;
  touchMinutes: number;
  waitMinutes: number;
  /** touch / wait, or null when there is no wait time. */
  ratio: number | null;
}

// ── Factory Pulse cockpit (GET /pulse) ──────────────────────────────────────

export type PulseKpis = {
  openOrders?: number;
  overdueOrders?: number;
  tasksInProgress?: number;
  tasksBlocked?: number;
  tasksEligible?: number;
  machinesRunning?: number;
  machinesTotal?: number;
  redBuffers?: number;
  draftSalesOrders?: number;
  posInTransit?: number;
  items?: number;
};

export type PulseExceptions = {
  /** `daysLate` is negative when the service is due but not yet late. */
  maintenanceDue?: {
    planId: number; resourceId: number; resourceName: string;
    planName: string; nextDueAt: string; daysLate: number;
  }[];
  overdueOrders?: { id: number; orderNumber: string; status: string; requiredDate: string; daysLate: number }[];
  blockedWork?: { orderId: number; orderNumber: string; blockedCount: number }[];
  flowsMissingFormula?: { id: number; code: string; name: string }[];
  redBuffers?: { id: number; kind: string; orderId: number | null; orderNumber: string | null; consumedPct: number }[];
};

export type PulseResponse = { kpis: PulseKpis; exceptions: PulseExceptions };

/**
 * One round trip for the whole cockpit. Every field is optional: the endpoint
 * omits any aggregate whose query failed rather than failing the response, so
 * the UI must treat a missing key as "no card" and never as zero.
 */
export async function getPulse(): Promise<PulseResponse> {
  return fabGet<PulseResponse>('pulse');
}

// ── Piece marks (Issue 2 — FAB_ERP_SHOPFLOOR_REALITY_PLAN.md) ───────────────

export interface CutListItem {
  id: number;
  mark: string | null;
  name: string;
  qty: number | string;
  unit: string | null;
  parentMark: string | null;
  catalogCode: string | null;
  catalogName: string | null;
}

/**
 * Assign marks to every *unmarked* item on an order. Never renumbers an
 * existing mark — someone may already have painted it on a plate — so this is
 * safe to run repeatedly. `skipped` counts rows left untouched.
 */
export async function generateMarks(orderId: number): Promise<{
  ok: boolean; assigned: number; skipped: number; total: number;
}> {
  return fabPost(`orders/${orderId}/marks/generate`, {});
}

/**
 * Set or clear one mark by hand — fabricators inherit marks from client
 * drawings more often than they invent them.
 *
 * Renaming a parent leaves children on the old stem. The server does NOT
 * cascade by default (that would rename possibly-painted steel) and instead
 * returns `childrenOnOldStem`; call again with `cascadeChildren` once the user
 * has decided.
 */
export async function setItemMark(
  itemId: number,
  mark: string,
  cascadeChildren = false,
): Promise<{ ok: boolean; mark: string | null; childrenRenamed: number; childrenOnOldStem: number }> {
  return fabPatch(`items/${itemId}/mark`, { mark, cascadeChildren });
}

/** The flat, mark-ordered parts list the shop actually carries. */
export async function getCutList(orderId: number): Promise<{ ok: boolean; items: CutListItem[] }> {
  return fabGet(`orders/${orderId}/cut-list`);
}
