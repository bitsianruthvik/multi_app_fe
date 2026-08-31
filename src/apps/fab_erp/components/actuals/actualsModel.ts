/**
 * actualsModel.ts — turning the actuals payload into things the canvas can draw.
 *
 * Everything the Plan Board's `boardModel` already does — the walk up the BOM,
 * the golden-angle hues, the family-shade fallback past sixteen units — applies
 * unchanged here and is reused rather than reimplemented. This module adds only
 * what the plan has no equivalent of:
 *
 *   1. The OPERATION rung. `GROUP_LEVELS` stops at `part` because that is as
 *      fine as a thing the planner can drag; this board can also be read one
 *      operation at a time, and an operation is not a BOM node, so its grouping
 *      is built here instead of being forced into a walk that cannot express it.
 *
 *   2. NESTING. "Machine level, grouped by the hierarchy" means a machine lane
 *      appears under every unit it touched, showing only that unit's work — so
 *      the flat lane list is expanded into (unit × machine) rows before it
 *      reaches the canvas, which then needs no idea that any of this happened.
 *
 *   3. SPINES. In rolled-up mode a unit is drawn as the stretches it was
 *      actually worked in, so something has to say where the unit as a whole
 *      began and ended. Without it a girder that idled for a fortnight looks
 *      like two unrelated girders.
 */

import {
  BLOCK_STRIDE, BLOCK_ITEM, BLOCK_START, BLOCK_DUR,
} from '../../api/planner';
import type { BoardResponse } from '../../api/planner';
import {
  buildGrouping, shortenLabel, type BoardGroup, type BoardGrouping, type GroupLevel,
} from '../planner/boardModel';
import type { BlockStyle, BoardSpine } from '../planner/BoardCanvas';
import {
  ST_DONE, ST_DONE_LATE, ST_IN_PROGRESS, ST_NONE, ST_PAUSED, ST_REWORK,
  type ActualsBoardResponse, type ActualsLane, type ActualsLevel,
} from '../../api/actuals';

/**
 * Status as a fill treatment, never as a hue.
 *
 * The unit's colour comes off a golden-angle wheel, so at any moment one unit is
 * about to be the colour you would have picked for "late" — the same reason the
 * Plan Board ghosts a refused drag instead of reddening it. Two meanings cannot
 * share one channel, so hue stays the unit and the fill carries the state.
 */
export const ACTUALS_STATUS_STYLE: Record<number, BlockStyle> = {
  [ST_NONE]: 'solid',
  [ST_IN_PROGRESS]: 'live',
  [ST_DONE]: 'solid',
  [ST_PAUSED]: 'hatched',
  [ST_REWORK]: 'outlined',
  [ST_DONE_LATE]: 'ruled',
};

/** The legend, in the order a reader meets these on the board. */
export const STATUS_LEGEND: { code: number; label: string; style: BlockStyle }[] = [
  { code: ST_DONE, label: 'Done', style: 'solid' },
  { code: ST_IN_PROGRESS, label: 'In progress', style: 'live' },
  { code: ST_PAUSED, label: 'Paused', style: 'hatched' },
  { code: ST_REWORK, label: 'Rework', style: 'outlined' },
  { code: ST_DONE_LATE, label: 'Done late', style: 'ruled' },
];

// ── grouping ─────────────────────────────────────────────────────────────────

/** A blank group, so the two builders below cannot disagree about its shape. */
function emptyGroup(key: string, label: string, sublabel: string): BoardGroup {
  return {
    key,
    label,
    shortLabel: shortenLabel(label),
    sublabel,
    orderId: null,
    colorIdx: 0,
    familyIdx: 0,
    shadeIdx: 0,
    blockCount: 0,
    workMs: 0,
    startRel: -1,
    endRel: -1,
    laneIdxs: [],
  };
}

/**
 * Grouping at the operation rung: one group per operation, keyed `p:<id>`.
 *
 * Read off `blockOp` rather than off the BOM, because that is the only place the
 * answer is. Ordered by first appearance like `buildGrouping`, so the legend and
 * the board are read left to right in the same order.
 */
function buildOperationGrouping(board: ActualsBoardResponse): BoardGrouping {
  const opName = new Map(board.operations.map((o) => [o.id, o.name ?? `Operation ${o.id}`]));
  const byKey = new Map<string, number>();
  const groups: BoardGroup[] = [];
  const laneGroupIdx: Int32Array[] = [];

  board.lanes.forEach((lane, laneIdx) => {
    const gi = new Int32Array(lane.blockCount).fill(-1);
    for (let b = 0; b < lane.blockCount; b += 1) {
      const opId = lane.blockOp[b] ?? 0;
      if (!opId) continue;
      const key = `p:${opId}`;
      let g = byKey.get(key);
      if (g === undefined) {
        g = groups.length;
        byKey.set(key, g);
        groups.push(emptyGroup(key, opName.get(opId) ?? `Operation ${opId}`, 'Operation'));
      }
      const grp = groups[g];
      const s = lane.blocks[b * BLOCK_STRIDE + BLOCK_START];
      const e = s + lane.blocks[b * BLOCK_STRIDE + BLOCK_DUR];
      grp.blockCount += 1;
      grp.workMs += lane.blocks[b * BLOCK_STRIDE + BLOCK_DUR];
      if (grp.startRel < 0 || s < grp.startRel) grp.startRel = s;
      if (e > grp.endRel) grp.endRel = e;
      if (!grp.laneIdxs.includes(laneIdx)) grp.laneIdxs.push(laneIdx);
      gi[b] = g;
    }
    laneGroupIdx.push(gi);
  });

  // Sorted by start, then every reference rewritten — the per-block indices are
  // positions in `groups`, so sorting without remapping recolours at random.
  const order = groups.map((_, i) => i).sort((a, b) => (
    (groups[a].startRel - groups[b].startRel) || groups[a].label.localeCompare(groups[b].label)
  ));
  const remap = new Int32Array(groups.length);
  order.forEach((oldIdx, newIdx) => { remap[oldIdx] = newIdx; });
  const sorted = order.map((oldIdx, newIdx) => ({
    ...groups[oldIdx], colorIdx: newIdx, familyIdx: newIdx, shadeIdx: 0,
  }));
  for (const gi of laneGroupIdx) {
    for (let i = 0; i < gi.length; i += 1) if (gi[i] >= 0) gi[i] = remap[gi[i]];
  }

  return {
    level: 'part',
    groups: sorted,
    byKey: new Map(sorted.map((g, i) => [g.key, i])),
    laneGroupIdx,
    // A shop has tens of operations, not hundreds, and they have no family to
    // borrow a hue from. Hue per operation, always.
    shaded: false,
  };
}

/** Group the board at `level`, whichever kind of rung that is. */
export function buildActualsGrouping(
  board: ActualsBoardResponse,
  level: ActualsLevel,
): BoardGrouping {
  if (level === 'operation') return buildOperationGrouping(board);
  return buildGrouping(board as unknown as BoardResponse, level as GroupLevel);
}

/**
 * Per group, its blocks merged across lanes: [startRel, durMs, startRel] × n.
 *
 * The canvas draws these inside a rail row. The third number exists for the Plan
 * Board's stretch preview — a block has to know which BAR it belongs to so that
 * stretching moves bars and not work. Nothing here can be stretched, so a block
 * is its own anchor and the value is simply its start.
 */
export function buildGroupBlocks(
  lanes: ActualsLane[],
  grouping: BoardGrouping,
): Float64Array[] {
  const counts = new Int32Array(grouping.groups.length);
  lanes.forEach((lane, laneIdx) => {
    const gi = grouping.laneGroupIdx[laneIdx];
    if (!gi) return;
    for (let b = 0; b < lane.blockCount; b += 1) if (gi[b] >= 0) counts[gi[b]] += 1;
  });
  const out = grouping.groups.map((_, g) => new Float64Array(counts[g] * 3));
  const at = new Int32Array(grouping.groups.length);
  lanes.forEach((lane, laneIdx) => {
    const gi = grouping.laneGroupIdx[laneIdx];
    if (!gi) return;
    for (let b = 0; b < lane.blockCount; b += 1) {
      const g = gi[b];
      if (g < 0) continue;
      const s = lane.blocks[b * BLOCK_STRIDE + BLOCK_START];
      const o = at[g] * 3;
      out[g][o] = s;
      out[g][o + 1] = lane.blocks[b * BLOCK_STRIDE + BLOCK_DUR];
      out[g][o + 2] = s;
      at[g] += 1;
    }
  });
  for (const arr of out) {
    // The canvas bisects rail blocks the same way it bisects lane blocks.
    const triples: number[][] = [];
    for (let i = 0; i < arr.length; i += 3) triples.push([arr[i], arr[i + 1], arr[i + 2]]);
    triples.sort((a, b) => a[0] - b[0]);
    triples.forEach((t, i) => { arr[i * 3] = t[0]; arr[i * 3 + 1] = t[1]; arr[i * 3 + 2] = t[2]; });
  }
  return out;
}

// ── nesting (machine mode) ───────────────────────────────────────────────────

export interface NestedLaneMeta {
  /** Which unit's header this row sits under. */
  groupIdx: number;
  /** The machine, as the gutter should name it. */
  name: string;
  /** Where it came from in `board.lanes`. */
  sourceLaneIdx: number;
  blockCount: number;
  workMs: number;
}

export interface NestedBoard {
  lanes: ActualsLane[];
  blockStatus: number[][];
  grouping: BoardGrouping;
  meta: NestedLaneMeta[];
  /** Rows belonging to each group, in the order they should be drawn. */
  laneIdxsByGroup: number[][];
}

/**
 * Expand flat machine lanes into (unit × machine) rows.
 *
 * A machine that touched three girders appears under all three headers with only
 * that girder's blocks in each — the same "a bar is drawn in pieces, one per
 * machine" rule the Plan Board applies to a bundle, turned ninety degrees.
 *
 * THE COUNTING TRAP that comes with it: a shared machine now occupies several
 * rows, so anything summing rows double-counts it. Every figure here is summed
 * from BLOCKS, and each block lands in exactly one row, so the totals survive
 * the expansion. Do not add a machine-count derived from `lanes.length`.
 */
export function nestByHierarchy(
  board: ActualsBoardResponse,
  grouping: BoardGrouping,
): NestedBoard {
  const lanes: ActualsLane[] = [];
  const blockStatus: number[][] = [];
  const meta: NestedLaneMeta[] = [];
  const laneGroupIdx: Int32Array[] = [];
  const laneIdxsByGroup: number[][] = grouping.groups.map(() => []);

  grouping.groups.forEach((_, g) => {
    board.lanes.forEach((lane, srcIdx) => {
      const gi = grouping.laneGroupIdx[srcIdx];
      if (!gi) return;
      const picked: number[] = [];
      for (let b = 0; b < lane.blockCount; b += 1) if (gi[b] === g) picked.push(b);
      if (picked.length === 0) return;

      const blocks: number[] = [];
      const sts: number[] = [];
      const ops: number[] = [];
      let workMs = 0;
      for (const b of picked) {
        const o = b * BLOCK_STRIDE;
        blocks.push(
          lane.blocks[o], lane.blocks[o + 1], lane.blocks[o + 2],
          lane.blocks[o + 3], lane.blocks[o + 4],
        );
        sts.push(lane.blockStatus[b] ?? ST_DONE);
        ops.push(lane.blockOp[b] ?? 0);
        workMs += lane.blocks[o + BLOCK_DUR];
      }

      const idx = lanes.length;
      lanes.push({
        ...lane,
        blocks,
        blockStatus: sts,
        blockOp: ops,
        blockCount: picked.length,
      });
      blockStatus.push(sts);
      laneGroupIdx.push(new Int32Array(picked.length).fill(g));
      meta.push({ groupIdx: g, name: lane.name, sourceLaneIdx: srcIdx, blockCount: picked.length, workMs });
      laneIdxsByGroup[g].push(idx);
    });
  });

  return {
    lanes,
    blockStatus,
    grouping: { ...grouping, laneGroupIdx },
    meta,
    laneIdxsByGroup,
  };
}

// ── spines (unit mode) ───────────────────────────────────────────────────────

/**
 * Where each unit reaches, per packing lane.
 *
 * Keyed through the grouping rather than off `units[].key` directly, because the
 * hue a spine is dimmed against belongs to the group index, and the server's key
 * and the client's key are only guaranteed to agree — not to be the same object.
 * A unit the client could not group (an item outside the loaded ancestry) simply
 * gets no spine, which is better than one drawn in the ungrouped grey.
 */
export function buildSpines(
  board: ActualsBoardResponse,
  grouping: BoardGrouping,
): BoardSpine[] {
  const out: BoardSpine[] = [];
  for (const u of board.units) {
    const g = grouping.byKey.get(u.key);
    if (g === undefined) continue;
    out.push({ laneIdx: u.laneIdx, startRel: u.startRel, endRel: u.endRel, groupIdx: g });
  }
  return out;
}

/** The unit a block belongs to, for a tooltip. Cheap enough to call per hover. */
export function itemLabel(board: ActualsBoardResponse, itemId: number): string {
  const it = board.items.find((i) => i.id === itemId);
  return it?.mark || it?.code || it?.name || (itemId ? `Item ${itemId}` : '—');
}

/** Every block on the board carries an itemId; this is the lane-local reader. */
export function blockItemId(lane: ActualsLane, blockIdx: number): number {
  return lane.blocks[blockIdx * BLOCK_STRIDE + BLOCK_ITEM];
}
