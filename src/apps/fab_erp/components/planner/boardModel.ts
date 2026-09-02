/**
 * boardModel.ts — turning the board payload into things that can be drawn.
 *
 * Two jobs, both of which exist so the canvas can stay a canvas:
 *
 *   1. GROUPING. A planner does not move an operation, they move a girder. The
 *      BOM already knows which girder an operation belongs to, so grouping is a
 *      walk up parent_item_id — but the level asked for may not exist above a
 *      given item (a girder-level weld has no segment above it), so the walk
 *      stops at the first node at that level OR COARSER. The closest containing
 *      unit is always a truthful answer; refusing to group would not be.
 *
 *   2. COLOUR. Every unit at the chosen level gets its own hue, because the
 *      whole point of drawing thousands of tiny blocks is to see WHOSE work is
 *      where — where girder 1 stops and girder 2 could slide in. Hues come off a
 *      golden-angle sequence rather than a fixed palette: the level can be
 *      "part", and one order has hundreds of those.
 */

import type { BoardResponse, BoardItem } from '../../api/planner';
import { BLOCK_STRIDE, BLOCK_START, BLOCK_DUR, BLOCK_ITEM } from '../../api/planner';

/**
 * The two rungs ABOVE the item tree. Everything below is a DEPTH — `d0`, `d1`…
 *
 * Must match `planUnitService` exactly. The two copies of this walk are
 * deliberately cross-checked rather than trusted (`assertContains` on the
 * server refuses a drag whose bars it does not agree are in the unit), so a
 * mismatch here is a loud refusal rather than a plan quietly moving the wrong
 * work — see the header of that file.
 *
 * This used to be a fixed ladder of six with a `KIND_RANK` lookup. A company
 * whose structure is five deep had nowhere to put the fifth rung and a flat one
 * carried two dead ones. `material` needed a rank of its own purely so that an
 * operation sitting on a plate row walked UP rather than falling out of every
 * group; with depth that falls out for free, because a material row is simply
 * one deeper than the part it belongs to.
 */
export const FIXED_GROUP_LEVELS = ['order', 'line'] as const;
export type GroupLevel = string;

export const isDepthLevel = (l: string) => /^d\d+$/.test(l);
export const depthOfLevel = (l: string) => Number(l.slice(1));

/**
 * The levels this board can offer, given the depths its items actually have.
 *
 * Labels come from `board.depthLabels` — the commonest item name at each depth —
 * so the picker still reads "Span / Girder / Segment", named by the data rather
 * than by a constant in this file.
 */
export function groupLevelsFor(
  depths: number[],
  depthLabels: Record<string, string> = {},
): { key: GroupLevel; label: string }[] {
  const uniq = [...new Set(depths.filter((d) => Number.isFinite(d)))].sort((a, b) => a - b);
  return [
    { key: 'order', label: 'Order' },
    { key: 'line', label: 'Line item' },
    ...uniq.map((d) => ({ key: `d${d}`, label: depthLabels[`d${d}`] ?? `Level ${d + 1}` })),
  ];
}

export interface BoardGroup {
  key: string;
  /** What the planner calls it: a mark, a code, an order number. */
  label: string;
  /**
   * The label with its shared prefix dropped.
   *
   * A generated code is a path — BRDG-SO-20260820-0002-SPAN1-G1 — and every
   * girder in an order shares all of it but the last segment or two. Clipped
   * from the left, as a fixed-width column does, two different girders come out
   * identical. What distinguishes them is the tail, so the tail is what is kept.
   */
  shortLabel: string;
  /** Where it sits — the order, or the parent unit. */
  sublabel: string;
  orderId: number | null;
  colorIdx: number;
  /**
   * The containing unit two levels up, and this group's rank within it.
   *
   * Used only when there are more units on screen than hue alone can separate
   * — see buildColors. Below that, they are ignored.
   */
  familyIdx: number;
  shadeIdx: number;
  blockCount: number;
  /** Working milliseconds inside this group, summed across lanes. */
  workMs: number;
  /** Envelope across every lane, relative ms. -1 when the group has no work. */
  startRel: number;
  endRel: number;
  /** Lanes this group touches, by index into the drawn lane list. */
  laneIdxs: number[];
}

export interface BoardGrouping {
  level: GroupLevel;
  groups: BoardGroup[];
  byKey: Map<string, number>;
  /** Per lane, one group index per block. -1 = ungrouped. */
  laneGroupIdx: Int32Array[];
  /** More units than hue alone can separate — colour falls back to families. */
  shaded: boolean;
}

/**
 * How many units one board can hold before it stops trying to give each of them
 * its own hue, and before a handle each stops being a control and becomes a
 * wall. One number because it is one fact: past this, individual units are no
 * longer what the eye is picking out.
 */
export const LEGIBLE_UNIT_LIMIT = 16;

interface ItemIndex {
  byId: Map<number, BoardItem>;
}

function buildItemIndex(board: BoardResponse): ItemIndex {
  return { byId: new Map(board.items.map((i) => [i.id, i])) };
}

/** Guards a malformed parent chain; a cycle would otherwise hang the render. */
const MAX_WALK = 24;

function groupKeyFor(idx: ItemIndex, itemId: number, level: GroupLevel): string | null {
  const start = idx.byId.get(itemId) ?? null;
  if (!start) return null;

  if (level === 'order' || level === 'line') {
    // order / line are not BOM nodes. Climb until the ids appear: a deep part
    // usually carries them, but an item created outside the wizard may only
    // have them on its root.
    let cur: BoardItem | null = start;
    for (let i = 0; i < MAX_WALK && cur; i += 1) {
      if (level === 'order' && cur.orderId != null) return `o:${cur.orderId}`;
      if (level === 'line' && cur.orderLineId != null) return `l:${cur.orderLineId}`;
      cur = cur.parentItemId != null ? idx.byId.get(cur.parentItemId) ?? null : null;
    }
    return null;
  }
  if (!isDepthLevel(level)) return null;

  const wanted = depthOfLevel(level);
  let node: BoardItem | null = start;
  for (let i = 0; i < MAX_WALK && node; i += 1) {
    // At the wanted depth, or already shallower because that depth does not
    // exist on this branch. Either way this is the closest containing unit.
    if ((node.depth ?? 0) <= wanted) return `i:${node.id}`;
    node = node.parentItemId != null ? idx.byId.get(node.parentItemId) ?? null : null;
  }
  return null;
}

function labelForKey(
  board: BoardResponse,
  idx: ItemIndex,
  key: string,
): { label: string; sublabel: string; orderId: number | null } {
  const [kind, rawId] = key.split(':');
  const id = Number(rawId);
  if (kind === 'o') {
    const o = board.orders.find((x) => x.id === id);
    return { label: o?.orderNumber ?? `Order ${id}`, sublabel: o?.customerName ?? '', orderId: id };
  }
  if (kind === 'l') {
    const l = board.lines.find((x) => x.id === id);
    const o = l ? board.orders.find((x) => x.id === l.orderId) : null;
    return {
      label: l?.code || l?.description || (l?.lineNo != null ? `Line ${l.lineNo}` : `Line ${id}`),
      sublabel: o?.orderNumber ?? '',
      orderId: l?.orderId ?? null,
    };
  }
  const it = idx.byId.get(id);
  const parent = it?.parentItemId != null ? idx.byId.get(it.parentItemId) : null;
  const o = it?.orderId != null ? board.orders.find((x) => x.id === it.orderId) : null;
  return {
    // A mark is what the drawing calls it and what the floor writes in chalk;
    // the code is the system's name for the same thing. Prefer the mark.
    label: it?.mark || it?.code || it?.name || `Item ${id}`,
    sublabel: parent?.mark || parent?.code || parent?.name || o?.orderNumber || '',
    orderId: it?.orderId ?? null,
  };
}

/** Keep the tail of a coded label; see BoardGroup.shortLabel. */
export function shortenLabel(label: string, max = 22): string {
  if (label.length <= max) return label;
  const parts = label.split(/[-_/]/).filter(Boolean);
  if (parts.length >= 3) {
    for (let take = 2; take <= parts.length; take += 1) {
      const tail = parts.slice(-take).join('-');
      if (tail.length > max) break;
      if (tail.length >= 6 || take === parts.length) return `…${tail}`;
    }
    return `…${parts.slice(-2).join('-')}`;
  }
  return `${label.slice(0, max - 1)}…`;
}

/**
 * Group every block in the window at one level of the ladder.
 *
 * Groups come back sorted by when their work STARTS, not alphabetically: the
 * colours are read left to right across the board, so an ordering that does not
 * match the board makes the legend useless.
 */
export function buildGrouping(board: BoardResponse, level: GroupLevel): BoardGrouping {
  const idx = buildItemIndex(board);
  const memo = new Map<number, string | null>();
  const keyOf = (itemId: number) => {
    if (memo.has(itemId)) return memo.get(itemId) ?? null;
    const k = groupKeyFor(idx, itemId, level);
    memo.set(itemId, k);
    return k;
  };

  /**
   * The level whose hue a fine-grained group borrows.
   *
   * Two steps coarser, not one: at the leaves, one step up is the assembly
   * holding them, and a bridge has nearly as many of those as leaves —
   * borrowing from it would swap one rainbow for another. Two steps lands on
   * the unit a planner actually moves.
   *
   * Below `d0` the two rungs above the tree take over, which is what the old
   * fixed ladder did by running off the front of the array.
   */
  const familyLevel: GroupLevel = (() => {
    if (!isDepthLevel(level)) return 'order';
    const d = depthOfLevel(level) - 2;
    if (d >= 0) return `d${d}`;
    return d === -1 ? 'line' : 'order';
  })();
  const familyMemo = new Map<number, string | null>();
  const familyOf = (itemId: number) => {
    if (familyMemo.has(itemId)) return familyMemo.get(itemId) ?? null;
    const k = groupKeyFor(idx, itemId, familyLevel);
    familyMemo.set(itemId, k);
    return k;
  };
  const familyByGroupKey = new Map<string, string>();

  const byKey = new Map<string, number>();
  const groups: BoardGroup[] = [];
  const laneGroupIdx: Int32Array[] = [];

  board.lanes.forEach((lane, laneIdx) => {
    const n = lane.blockCount;
    const gi = new Int32Array(n).fill(-1);
    for (let b = 0; b < n; b += 1) {
      const o = b * BLOCK_STRIDE;
      const itemId = lane.blocks[o + BLOCK_ITEM];
      const key = itemId > 0 ? keyOf(itemId) : null;
      if (!key) continue;
      let g = byKey.get(key);
      if (g === undefined) {
        g = groups.length;
        byKey.set(key, g);
        familyByGroupKey.set(key, familyOf(itemId) ?? key);
        const named = labelForKey(board, idx, key);
        groups.push({
          key,
          ...named,
          shortLabel: shortenLabel(named.label),
          colorIdx: 0,
          familyIdx: 0,
          shadeIdx: 0,
          blockCount: 0,
          workMs: 0,
          startRel: -1,
          endRel: -1,
          laneIdxs: [],
        });
      }
      const grp = groups[g];
      const s = lane.blocks[o + BLOCK_START];
      const e = s + lane.blocks[o + BLOCK_DUR];
      grp.blockCount += 1;
      grp.workMs += lane.blocks[o + BLOCK_DUR];
      if (grp.startRel < 0 || s < grp.startRel) grp.startRel = s;
      if (e > grp.endRel) grp.endRel = e;
      if (!grp.laneIdxs.includes(laneIdx)) grp.laneIdxs.push(laneIdx);
      gi[b] = g;
    }
    laneGroupIdx.push(gi);
  });

  // Re-sort by start, then rewrite every reference — the per-block indices point
  // at positions in `groups`, so sorting without remapping would recolour the
  // whole board at random.
  const order = groups.map((_, i) => i).sort((a, b) => {
    const ga = groups[a];
    const gb = groups[b];
    return (ga.startRel - gb.startRel) || ga.label.localeCompare(gb.label);
  });
  const remap = new Int32Array(groups.length);
  order.forEach((oldIdx, newIdx) => { remap[oldIdx] = newIdx; });
  const sorted = order.map((oldIdx, newIdx) => ({ ...groups[oldIdx], colorIdx: newIdx }));
  for (const gi of laneGroupIdx) {
    for (let i = 0; i < gi.length; i += 1) if (gi[i] >= 0) gi[i] = remap[gi[i]];
  }
  const newByKey = new Map<string, number>();
  sorted.forEach((g, i) => newByKey.set(g.key, i));

  // Families numbered in the same left-to-right order as the groups, so the
  // legend, the rail and the board all agree about which colour came first.
  const familyIdxByKey = new Map<string, number>();
  const shadeCount = new Map<string, number>();
  for (const g of sorted) {
    const fk = familyByGroupKey.get(g.key) ?? g.key;
    if (!familyIdxByKey.has(fk)) familyIdxByKey.set(fk, familyIdxByKey.size);
    g.familyIdx = familyIdxByKey.get(fk) as number;
    g.shadeIdx = shadeCount.get(fk) ?? 0;
    shadeCount.set(fk, g.shadeIdx + 1);
  }

  return {
    level,
    groups: sorted,
    byKey: newByKey,
    laneGroupIdx,
    shaded: sorted.length > LEGIBLE_UNIT_LIMIT && familyIdxByKey.size < sorted.length,
  };
}

// ─── colour ──────────────────────────────────────────────────────────────────

/**
 * Golden-angle hues: consecutive indices land far apart on the wheel, and the
 * sequence does not repeat until it has to. A fixed palette cannot do this —
 * the grouping level can be `part`, and one order has hundreds.
 *
 * The blue-greens around 190°–210° are stepped over because that is where the
 * selection ring and the "now" line live, and a girder the same colour as the
 * cursor is a girder nobody can find.
 */
const GOLDEN = 137.508;
export function hueFor(colorIdx: number): number {
  const h = (colorIdx * GOLDEN + 18) % 360;
  return h > 188 && h < 212 ? h + 26 : h;
}

export interface ColorSet {
  /** The block itself. */
  fill: string;
  /** Its edge, for blocks wide enough to have one. */
  edge: string;
  /** The same unit while another one is selected. */
  dim: string;
  /** The group's handle in the rail — lighter, so the blocks stay dominant. */
  rail: string;
}

export function colorsFor(colorIdx: number, dark: boolean): ColorSet {
  const h = Math.round(hueFor(colorIdx));
  return dark
    ? {
      fill: `hsl(${h} 62% 58%)`,
      edge: `hsl(${h} 70% 74%)`,
      dim: `hsl(${h} 15% 33%)`,
      rail: `hsl(${h} 55% 48%)`,
    }
    : {
      fill: `hsl(${h} 58% 50%)`,
      edge: `hsl(${h} 64% 32%)`,
      dim: `hsl(${h} 13% 80%)`,
      rail: `hsl(${h} 52% 60%)`,
    };
}

/**
 * One colour per group, resolved for the whole board at once.
 *
 * Two schemes, and which one applies is a fact about the board rather than a
 * setting:
 *
 *   few units    hue per unit. Six girders in six hues is the clearest thing
 *                this screen does.
 *   many units   hue per FAMILY, lightness per unit inside it. Three hundred
 *                parts cannot each have a distinguishable hue — attempting it
 *                produces a rainbow in which no stretch of the row means
 *                anything. Borrowing the girder's hue keeps the one reading
 *                that matters at this zoom ("this run belongs to girder 2")
 *                while the shading still separates the parts inside it.
 */
export function buildColors(grouping: BoardGrouping, dark: boolean): ColorSet[] {
  if (!grouping.shaded) return grouping.groups.map((g) => colorsFor(g.colorIdx, dark));
  // Steps chosen to alternate around the base rather than walk away from it, so
  // no unit in a family is left almost invisible against the lane.
  const STEPS = dark ? [58, 68, 48, 74, 42, 63, 53, 78] : [50, 38, 60, 44, 66, 33, 55, 71];
  return grouping.groups.map((g) => {
    const h = Math.round(hueFor(g.familyIdx));
    const l = STEPS[g.shadeIdx % STEPS.length];
    const sat = dark ? 60 : 56;
    return {
      fill: `hsl(${h} ${sat}% ${l}%)`,
      edge: `hsl(${h} ${sat + 8}% ${dark ? Math.min(88, l + 16) : Math.max(20, l - 18)}%)`,
      dim: `hsl(${h} 14% ${dark ? 33 : 80}%)`,
      rail: `hsl(${h} ${sat - 4}% ${dark ? 48 : 60}%)`,
    };
  });
}

/** "18h 20m" from milliseconds — the shop floor talks in hours. */
export function fmtWorkMs(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}
