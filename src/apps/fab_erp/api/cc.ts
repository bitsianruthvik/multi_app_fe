/**
 * fab_erp Critical Chain (CCPM) API helpers.
 *
 * Wraps the backend routes on routes/criticalChain.js (mounted under
 * /api/:companySlug/fab_erp). All reads are gated by `fab_erp_cc_view`, writes
 * by `fab_erp_cc_manage` (admins bypass). Response keys are camelCase.
 *
 * CC_FEVER mirrors the backend `ccBufferService.CC_FEVER` thresholds EXACTLY —
 * frontend is a separate build, so the two diagonal lines are duplicated here.
 * Keep in sync with multi_app_be/apps/fab_erp/services/ccBufferService.js.
 */

import { fabGet, fabPost } from './client';

export type CcZone = 'green' | 'yellow' | 'red';

/** Fever-chart zone boundaries. c = % critical chain complete, b = % buffer consumed. */
export const CC_FEVER = {
  greenLine: (c: number) => 15 + 0.45 * c,
  redLine: (c: number) => 35 + 0.5 * c,
  zoneFor(c: number, b: number): CcZone {
    if (b < CC_FEVER.greenLine(c)) return 'green';
    if (b > CC_FEVER.redLine(c)) return 'red';
    return 'yellow';
  },
};

// ── portfolio ────────────────────────────────────────────────────────────────

export interface CcPortfolioProject {
  planId: number;
  orderId: number;
  orderNumber: string;
  customerName: string | null;
  committedFinish: string | null;
  dueDate: string | null;
  /** committedFinish − dueDate in whole days; >0 = finishing after promised. */
  deltaDays: number | null;
  feverZone: CcZone | null;
  bufferConsumedPct: number | null;
  chainCompletePct: number | null;
  drumPlannedStart: string | null;
  drumSeq: number | null;
}

export interface CcPortfolioResponse {
  ok: boolean;
  projects: CcPortfolioProject[];
}

/** GET /cc/portfolio — one row per baselined sales-order plan, most at-risk first. */
export async function getCcPortfolio(): Promise<CcPortfolioResponse> {
  return fabGet<CcPortfolioResponse>('cc/portfolio');
}

// ── plan detail ────────────────────────────────────────────────────────────────

export interface CcPlan {
  id: number;
  orderId: number;
  status: string;
  dueDate: string | null;
  chainLengthMinutes: number | null;
  projectBufferMinutes: number | null;
  aggressiveFinish: string | null;
  committedFinish: string | null;
  feverZone: CcZone | null;
  bufferConsumedPct: number | null;
  chainCompletePct: number | null;
  drumPlannedStart: string | null;
  baselinedAt: string | null;
}

export interface CcChainTask {
  taskId: number;
  seq: number;
  chainRole: 'critical' | 'feeding';
  feedingGroupId: number | null;
  aggressiveMinutes: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  status: string | null;
  operationId: number | null;
  itemId: number | null;
  operationName: string | null;
}

export interface CcBuffer {
  kind: 'project' | 'feeding';
  sizeMinutes: number;
  consumedMinutes: number;
  consumedPct: number;
  feedsTaskId: number | null;
  afterTaskId: number | null;
  warnPct: number;
  actPct: number;
}

export interface CcFeverPoint {
  at: string;
  chainCompletePct: number;
  bufferConsumedPct: number;
  zone: CcZone;
}

export interface CcPlanDetailResponse {
  ok: boolean;
  plan: CcPlan;
  chainTasks: CcChainTask[];
  buffers: CcBuffer[];
  feverTrail: CcFeverPoint[];
}

/** GET /cc/plans/:orderId — active plan + chain tasks + buffers + fever trail. */
export async function getCcPlan(orderId: number): Promise<CcPlanDetailResponse> {
  return fabGet<CcPlanDetailResponse>(`cc/plans/${orderId}`);
}

// ── replan / baseline ────────────────────────────────────────────────────────

export interface CcReplanResponse {
  ok: boolean;
  drum: { resourceTypeId: number | null; drumId: number | null; loadMinutes: number } | null;
  resourceTypeId?: number | null;
  loadMinutes?: number;
  projectCount: number;
  committedCount?: number;
}

/** POST /cc/replan — re-detect the drum and re-sequence every project on it. */
export async function runCcReplan(): Promise<CcReplanResponse> {
  return fabPost<CcReplanResponse>('cc/replan');
}

/** POST /cc/plans/:orderId/baseline — (re)build the CCPM baseline for one order. */
export async function baselineCcOrder(orderId: number): Promise<{ ok: boolean; created?: boolean; planId?: number }> {
  return fabPost<{ ok: boolean; created?: boolean; planId?: number }>(`cc/plans/${orderId}/baseline`);
}

// ── drum ────────────────────────────────────────────────────────────────────

export interface CcDrumSlot {
  orderId: number;
  orderNumber: string;
  seq: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  isCommitted: boolean;
}

export interface CcDrumResponse {
  ok: boolean;
  drum: {
    drumId: number;
    resourceTypeId: number | null;
    resourceTypeName: string | null;
    loadMinutes: number | null;
    computedAt: string | null;
  } | null;
  slots: CcDrumSlot[];
}

/** GET /cc/drum — the current constraint + its sequenced slot timeline. */
export async function getCcDrum(): Promise<CcDrumResponse> {
  return fabGet<CcDrumResponse>('cc/drum');
}

// ── alerts ────────────────────────────────────────────────────────────────────

export interface CcAlert {
  type: 'zone' | 'wakeup';
  severity: CcZone | 'info';
  orderId: number;
  orderNumber: string;
  fromZone?: CcZone;
  toZone?: CcZone;
  drumName?: string | null;
  at: string;
  message: string;
}

export interface CcAlertsResponse {
  ok: boolean;
  alerts: CcAlert[];
}

/** GET /cc/alerts — zone-worsening transitions + near-term drum wake-ups. */
export async function getCcAlerts(): Promise<CcAlertsResponse> {
  return fabGet<CcAlertsResponse>('cc/alerts');
}

// ── what-if (detour) ────────────────────────────────────────────────────────────

export interface CcWhatIfImpact {
  orderId: number;
  orderNumber: string;
  oldFinish: string | null;
  newFinish: string | null;
  deltaDays: number;
  oldZone: CcZone;
  newZone: CcZone;
}

export interface CcWhatIfResponse {
  ok: boolean;
  taskId: number;
  resourceId: number | null;
  isCritical: boolean;
  delayMinutes: number;
  impacts: CcWhatIfImpact[];
  recommended: { taskId: number; orderNumber: string; label: string } | null;
}

/**
 * GET /cc/whatif — would starting `taskId` on `resourceId` push any project?
 * Called before a task Start to gate it with a detour warning.
 */
export async function getCcWhatIf(taskId: number, resourceId?: number | null): Promise<CcWhatIfResponse> {
  const params: Record<string, unknown> = { taskId };
  if (resourceId != null) params.resourceId = resourceId;
  return fabGet<CcWhatIfResponse>('cc/whatif', params);
}
