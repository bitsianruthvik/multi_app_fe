/**
 * fab_erp Actuals Board API.
 *
 * Wraps routes/actuals.js (mounted under /api/:companySlug/fab_erp). Read-only:
 * there is one endpoint and one verb, because there is nothing on this board to
 * change. Gated by `fab_erp_actuals_view`; admins bypass it.
 *
 * The payload is deliberately shaped so `boardModel.buildGrouping` — written for
 * the Plan Board — consumes it unchanged. `ActualsBoardResponse` is therefore a
 * structural superset of `BoardResponse`: same lanes of flat number tuples, same
 * `items`/`orders`/`lines` lookup tables, plus three things the plan has no need
 * of (per-block status, per-block operation, and the packed units).
 */

import { fabGet } from './client';
import type { BoardItem, BoardNamed, BoardOrder, BoardLine } from './planner';

// ── levels ───────────────────────────────────────────────────────────────────

/**
 * The ladder, plus the rung the BOM does not have.
 *
 * `operation` is deliberately NOT added to `boardModel.GROUP_LEVELS`: that tuple
 * is the Plan Board's level selector as well, and `planUnitService` — which
 * resolves the bars a drag moves — has no notion of an operation-level unit. A
 * seventh entry there would put a level in the planner's menu that its server
 * refuses. So the extra rung lives here, and only this board offers it.
 */
export const ACTUALS_LEVELS = [
  'order', 'line', 'span', 'girder', 'segment', 'part', 'operation',
] as const;
export type ActualsLevel = (typeof ACTUALS_LEVELS)[number];

export const ACTUALS_LEVEL_LABEL: Record<ActualsLevel, string> = {
  order: 'Order',
  line: 'Line item',
  span: 'Span',
  girder: 'Girder',
  segment: 'Segment',
  part: 'Part',
  operation: 'Operation',
};

export type ActualsMode = 'unit' | 'machine';

// ── status ───────────────────────────────────────────────────────────────────

/**
 * What a block is, as one small integer per block.
 *
 * Mirrors the ST_* constants in actualsBoardService. A parallel array rather
 * than a sixth number in the block tuple, so `BLOCK_STRIDE` stays 5 and the Plan
 * Board's canvas maths is untouched by this feature existing.
 */
export const ST_NONE = 0;
export const ST_IN_PROGRESS = 1;
export const ST_DONE = 2;
export const ST_PAUSED = 3;
export const ST_REWORK = 4;
export const ST_DONE_LATE = 5;

export const STATUS_LABEL: Record<number, string> = {
  [ST_NONE]: 'Unknown',
  [ST_IN_PROGRESS]: 'In progress',
  [ST_DONE]: 'Done',
  [ST_PAUSED]: 'Paused',
  [ST_REWORK]: 'Rework',
  [ST_DONE_LATE]: 'Done late',
};

// ── payload ──────────────────────────────────────────────────────────────────

export interface ActualsLane {
  /** `machine` rows are real resources; `pack` rows are packing lanes. */
  kind: 'machine' | 'pack';
  resourceTypeId: number;
  machineId: number | null;
  typeName: string;
  name: string;
  code: string | null;
  totalUnits: number;
  unbounded: boolean;
  resourceCount: number;
  /** Units sharing this packing lane. Zero on a machine lane. */
  unitCount: number;
  /** [startRel, endRel, coveredUnits] × n. */
  coverage: number[];
  /** [startRel, durationMs, itemId, taskId, 0] × blockCount. */
  blocks: number[];
  /** One ST_* code per block. */
  blockStatus: number[];
  /** One operation id per block; 0 where a block spans many. */
  blockOp: number[];
  blockCount: number;
}

/** One unit at the chosen level, as the packer laid it out. */
export interface ActualsUnit {
  key: string;
  /** An item inside the unit — what the client's own walk re-derives the key from. */
  anchorItemId: number;
  laneIdx: number;
  startRel: number;
  endRel: number;
  /** How many separate stretches of work. More than one means it idled. */
  runCount: number;
  /** Labour inside the unit, summed across machines. */
  workMs: number;
  taskCount: number;
}

export interface ActualsStats {
  hours: number;
  /** Null when the window touched more items than the roll-up will load. */
  tonnes: number | null;
  taskCount: number;
  tasksCompleted: number;
  tasksStarted: number;
  reworkHours: number;
  /**
   * Hours whose item has no ancestor at the chosen level.
   *
   * Drawn in the ungrouped grey rather than dropped, and reported here so the
   * reader is told once instead of having to notice the shade.
   */
  ungroupedHours: number;
  machinesActive: number;
  /** Lanes the packer needed — peak concurrent units. Unit mode only. */
  peakParallel: number;
  unitsCompleted: number;
  unitsStarted: number;
  unitsOpen: number;
  unitsCarriedIn: number;
  /** True when the unit counters and the tonnage were skipped as too large. */
  degraded: boolean;
}

export interface ActualsBoardResponse {
  ok: boolean;
  from: string;
  to: string;
  timezone: string;
  mode: ActualsMode;
  level: ActualsLevel;
  /** The server's clock at the moment it answered — the live edge. */
  now: string;
  lanes: ActualsLane[];
  items: BoardItem[];
  orders: BoardOrder[];
  lines: BoardLine[];
  /** Always empty: an actual is not a plan entry. Present so BoardResponse fits. */
  entries: never[];
  operations: BoardNamed[];
  resources: BoardNamed[];
  units: ActualsUnit[];
  /**
   * Tonnes credited to each unit key in this window.
   *
   * Sent for both modes: in machine mode the units are the collapsible headers,
   * which have the same keys and the same right to a tonnage. Empty when the
   * roll-up was skipped — see `stats.degraded`.
   */
  unitTonnes: Record<string, number>;
  laneCount: number;
  stats: ActualsStats;
}

/** GET /actuals/board — what the shop did in this window. */
export async function getActualsBoard(params: {
  from: string;
  to: string;
  mode: ActualsMode;
  level: ActualsLevel;
  orderIds?: number[];
  resourceTypeIds?: number[];
}): Promise<ActualsBoardResponse> {
  return fabGet<ActualsBoardResponse>('actuals/board', {
    from: params.from,
    to: params.to,
    mode: params.mode,
    level: params.level,
    ...(params.orderIds?.length ? { orderIds: params.orderIds.join(',') } : {}),
    ...(params.resourceTypeIds?.length
      ? { resourceTypeIds: params.resourceTypeIds.join(',') }
      : {}),
  });
}
