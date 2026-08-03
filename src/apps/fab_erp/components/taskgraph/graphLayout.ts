/**
 * graphLayout.ts — two-level dagre layout for the Task DAG / Task Engine (EU-3).
 *
 * Level 1: within each EXPANDED BOM-part group, lay out that part's operation
 * tasks left→right using the intra-item `flow` edges.
 * Level 2: lay out the part groups themselves left→right using the cross-BOM
 * `component` edges between them.
 *
 * Collapsed groups render as a single fixed-size chip (no children). Component
 * edges attach container↔container when a side is collapsed, and task↔task only
 * when both endpoints' parts are expanded (per plan clarification #9).
 */

import dagre from '@dagrejs/dagre';
import { MarkerType, type Node, type Edge } from '@xyflow/react';
import type {
  TaskGraphNode, TaskGraphEdge, PartStatusCounts,
  GraphLayoutOptions, GraphLayoutResult,
} from './types';

export const OP_W = 210;
export const OP_H = 78;
export const HEADER_H = 36;
export const GROUP_PAD = 16;
export const COLLAPSED_W = 250;
export const COLLAPSED_H = 84;

// SVG stroke accepts var(), so edges follow the theme like the rest of the
// canvas instead of staying light-mode grey on a dark surface.
const FLOW_STROKE = 'var(--c-graph-edge-flow)';
const COMPONENT_STROKE = 'var(--c-graph-edge-component)';

function emptyCounts(): PartStatusCounts {
  return { blocked: 0, eligible: 0, in_progress: 0, paused: 0, done: 0, cancelled: 0 };
}

interface GroupInfo {
  itemId: number;
  itemName: string | null;
  collapsed: boolean;
  width: number;
  height: number;
  counts: PartStatusCounts;
  total: number;
  done: number;
  /** How many direct sub-assemblies this part has — what the "+" will reveal. */
  childPartCount: number;
  depth: number;
  children: Array<{ task: TaskGraphNode; x: number; y: number }>;
}

/**
 * Lay out the task graph as a BOM DRILL-DOWN, not a flat wall of swimlanes.
 *
 * This used to render every distinct item in the order as its own lane, all at
 * once. A girder with fifty parts produced fifty stacked lanes — technically
 * complete, and unreadable: you opened the graph to a wall and had to hunt for
 * where the thing you cared about was. The BOM already carries the answer to
 * "what should I see first" (`fab_items.parent_item_id`), and it was being
 * flattened away.
 *
 * Now the graph starts at the top level — the finished good, and anything else
 * with no parent in this scope — and each part opens ONE level at a time:
 * expanding a part reveals its own operations *and* its direct sub-assemblies,
 * each of which is collapsed in turn. So the canvas only ever holds what you
 * asked to see.
 *
 * `expandedItemIds` therefore drives BOTH what is drawn and how much of it:
 * an item is visible only when every ancestor above it is expanded.
 */
export function buildTaskGraphLayout(
  taskNodes: TaskGraphNode[],
  taskEdges: TaskGraphEdge[],
  expandedItemIds: Set<number>,
  options: GraphLayoutOptions = {},
): GraphLayoutResult {
  if (taskNodes.length === 0) return { nodes: [], edges: [] };

  // Group tasks by item, preserving first-seen order.
  const allItemOrder: number[] = [];
  const tasksByItem = new Map<number, TaskGraphNode[]>();
  const itemOfTask = new Map<number, number>();
  const parentOfItem = new Map<number, number | null>();
  for (const t of taskNodes) {
    if (!tasksByItem.has(t.itemId)) { tasksByItem.set(t.itemId, []); allItemOrder.push(t.itemId); }
    tasksByItem.get(t.itemId)!.push(t);
    itemOfTask.set(t.id, t.itemId);
    if (!parentOfItem.has(t.itemId)) parentOfItem.set(t.itemId, t.parentItemId ?? null);
  }

  // Direct children, and the depth of each item within THIS scope. A parent that
  // isn't in the payload (the graph is filtered to a sub-BOM) makes its child a
  // root here — otherwise a drill-down into a sub-assembly would render nothing.
  const childrenOfItem = new Map<number, number[]>();
  const roots: number[] = [];
  for (const itemId of allItemOrder) {
    const parent = parentOfItem.get(itemId) ?? null;
    if (parent != null && tasksByItem.has(parent)) {
      if (!childrenOfItem.has(parent)) childrenOfItem.set(parent, []);
      childrenOfItem.get(parent)!.push(itemId);
    } else {
      roots.push(itemId);
    }
  }

  // Walk down from the roots, descending only through expanded items. Depth is
  // capped defensively — a self-referencing parent_item_id would otherwise spin.
  const depthOfItem = new Map<number, number>();
  const itemOrder: number[] = [];
  const walk = (itemId: number, depth: number) => {
    if (depth > 20 || depthOfItem.has(itemId)) return;
    depthOfItem.set(itemId, depth);
    itemOrder.push(itemId);
    if (!expandedItemIds.has(itemId)) return;
    for (const child of childrenOfItem.get(itemId) ?? []) walk(child, depth + 1);
  };
  for (const r of roots) walk(r, 0);

  // Intra-item flow edges, grouped by item (backend only emits these within a
  // single (item, flow) group, but we defensively re-check same-item here).
  const flowEdgesByItem = new Map<number, TaskGraphEdge[]>();
  for (const e of taskEdges) {
    if (e.kind !== 'flow') continue;
    const fi = itemOfTask.get(e.from);
    const ti = itemOfTask.get(e.to);
    if (fi == null || ti == null || fi !== ti) continue;
    if (!flowEdgesByItem.has(fi)) flowEdgesByItem.set(fi, []);
    flowEdgesByItem.get(fi)!.push(e);
  }

  // ── Level 1: inner layout + group sizing ──────────────────────────────────
  const groups: GroupInfo[] = [];
  for (const itemId of itemOrder) {
    const tasks = tasksByItem.get(itemId)!;
    const counts = emptyCounts();
    for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
    const itemName = tasks[0].itemName;
    const collapsed = !expandedItemIds.has(itemId);
    const childPartCount = (childrenOfItem.get(itemId) ?? []).length;
    const depth = depthOfItem.get(itemId) ?? 0;

    if (collapsed) {
      groups.push({
        itemId, itemName, collapsed, width: COLLAPSED_W, height: COLLAPSED_H,
        counts, total: tasks.length, done: counts.done, childPartCount, depth, children: [],
      });
      continue;
    }

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', ranksep: 60, nodesep: 22, marginx: 0, marginy: 0 });
    for (const t of tasks) g.setNode(String(t.id), { width: OP_W, height: OP_H });
    for (const e of flowEdgesByItem.get(itemId) ?? []) {
      if (g.hasNode(String(e.from)) && g.hasNode(String(e.to))) g.setEdge(String(e.from), String(e.to));
    }
    dagre.layout(g);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of tasks) {
      const p = g.node(String(t.id)) ?? { x: 0, y: 0 };
      minX = Math.min(minX, p.x - OP_W / 2); minY = Math.min(minY, p.y - OP_H / 2);
      maxX = Math.max(maxX, p.x + OP_W / 2); maxY = Math.max(maxY, p.y + OP_H / 2);
    }
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = OP_W; maxY = OP_H; }
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const children = tasks.map((t) => {
      const p = g.node(String(t.id)) ?? { x: 0, y: 0 };
      return {
        task: t,
        x: (p.x - OP_W / 2 - minX) + GROUP_PAD,
        y: (p.y - OP_H / 2 - minY) + HEADER_H + GROUP_PAD,
      };
    });
    groups.push({
      itemId, itemName, collapsed,
      width: contentW + GROUP_PAD * 2,
      height: contentH + HEADER_H + GROUP_PAD * 2,
      counts, total: tasks.length, done: counts.done, childPartCount, depth, children,
    });
  }

  const groupById = new Map<number, GroupInfo>();
  for (const gi of groups) groupById.set(gi.itemId, gi);

  // A hidden item's dependencies still have to show up somewhere, or collapsing
  // a level would look like the work simply vanished. Every edge endpoint is
  // therefore lifted to its nearest VISIBLE ancestor: with everything collapsed
  // you still see how the top-level parts feed each other, and the detail
  // appears as you drill in.
  const visibleAncestor = (itemId: number): number | null => {
    let cur: number | null = itemId;
    for (let hops = 0; cur != null && hops <= 20; hops += 1) {
      if (groupById.has(cur)) return cur;
      cur = parentOfItem.get(cur) ?? null;
    }
    return null;
  };

  // ── Level 2: outer layout of groups via component edges ───────────────────
  const interSeen = new Set<string>();
  const interEdges: Array<{ from: number; to: number }> = [];
  for (const e of taskEdges) {
    if (e.kind !== 'component') continue;
    const fi = visibleAncestor(itemOfTask.get(e.from) ?? -1);
    const ti = visibleAncestor(itemOfTask.get(e.to) ?? -1);
    if (fi == null || ti == null || fi === ti) continue;
    const k = `${fi}->${ti}`;
    if (interSeen.has(k)) continue;
    interSeen.add(k);
    interEdges.push({ from: fi, to: ti });
  }

  const og = new dagre.graphlib.Graph();
  og.setDefaultEdgeLabel(() => ({}));
  og.setGraph({ rankdir: 'LR', ranksep: 130, nodesep: 40, marginx: 20, marginy: 20 });
  for (const gi of groups) og.setNode(String(gi.itemId), { width: gi.width, height: gi.height });
  for (const e of interEdges) {
    if (og.hasNode(String(e.from)) && og.hasNode(String(e.to))) og.setEdge(String(e.from), String(e.to));
  }
  dagre.layout(og);

  // ── Assemble React Flow nodes (parents before children) ───────────────────
  const groupNodes: Node[] = [];
  const childNodes: Node[] = [];
  for (const gi of groups) {
    const p = og.node(String(gi.itemId)) ?? { x: 0, y: 0 };
    groupNodes.push({
      id: `g-${gi.itemId}`,
      type: 'partGroup',
      position: { x: p.x - gi.width / 2, y: p.y - gi.height / 2 },
      width: gi.width,
      height: gi.height,
      style: { width: gi.width, height: gi.height },
      data: {
        itemId: gi.itemId,
        itemName: gi.itemName,
        collapsed: gi.collapsed,
        statusCounts: gi.counts,
        totalCount: gi.total,
        doneCount: gi.done,
        childPartCount: gi.childPartCount,
        depth: gi.depth,
        onToggle: options.onToggleGroup ?? (() => {}),
      } as Record<string, unknown>,
    });
    for (const c of gi.children) {
      childNodes.push({
        id: `op-${c.task.id}`,
        type: 'operation',
        parentId: `g-${gi.itemId}`,
        extent: 'parent',
        position: { x: c.x, y: c.y },
        width: OP_W,
        height: OP_H,
        data: { ...c.task, onOpen: options.onOpenTask } as Record<string, unknown>,
      });
    }
  }

  // ── Edges ─────────────────────────────────────────────────────────────────
  const edges: Edge[] = [];
  const seen = new Set<string>();

  // flow edges — only within expanded groups (children rendered)
  for (const e of taskEdges) {
    if (e.kind !== 'flow') continue;
    const fi = itemOfTask.get(e.from);
    if (fi == null) continue;
    const gi = groupById.get(fi);
    if (!gi || gi.collapsed) continue;
    const id = `fe-${e.from}-${e.to}`;
    if (seen.has(id)) continue; seen.add(id);
    edges.push({
      id, source: `op-${e.from}`, target: `op-${e.to}`, type: 'smoothstep',
      style: { stroke: FLOW_STROKE, strokeWidth: 1.5, opacity: 0.85 },
      markerEnd: { type: MarkerType.ArrowClosed, color: FLOW_STROKE, width: 14, height: 14 },
    });
  }

  // component edges — endpoints resolve to container or task by collapse state
  for (const e of taskEdges) {
    if (e.kind !== 'component') continue;
    const rawFrom = itemOfTask.get(e.from);
    const rawTo = itemOfTask.get(e.to);
    if (rawFrom == null || rawTo == null) continue;
    const fi = visibleAncestor(rawFrom);
    const ti = visibleAncestor(rawTo);
    if (fi == null || ti == null) continue;
    // Attach to the task itself only when that task is actually on screen —
    // i.e. its own group is visible AND expanded. Otherwise attach to the
    // container standing in for it.
    const fromCollapsed = fi !== rawFrom || (groupById.get(fi)?.collapsed ?? true);
    const toCollapsed = ti !== rawTo || (groupById.get(ti)?.collapsed ?? true);
    const source = fromCollapsed ? `g-${fi}` : `op-${e.from}`;
    const target = toCollapsed ? `g-${ti}` : `op-${e.to}`;
    if (source === target) continue;
    const id = `ce-${source}-${target}`;
    if (seen.has(id)) continue; seen.add(id);
    edges.push({
      id, source, target, type: 'smoothstep', animated: true, zIndex: 5,
      style: { stroke: COMPONENT_STROKE, strokeWidth: 2, strokeDasharray: '6 4', opacity: 0.9 },
      markerEnd: { type: MarkerType.ArrowClosed, color: COMPONENT_STROKE, width: 16, height: 16 },
    });
  }

  return { nodes: [...groupNodes, ...childNodes], edges };
}
