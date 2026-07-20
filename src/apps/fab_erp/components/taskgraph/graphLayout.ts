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

const FLOW_STROKE = '#94a3b8';
const COMPONENT_STROKE = '#7c3aed';

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
  children: Array<{ task: TaskGraphNode; x: number; y: number }>;
}

export function buildTaskGraphLayout(
  taskNodes: TaskGraphNode[],
  taskEdges: TaskGraphEdge[],
  collapsedItemIds: Set<number>,
  options: GraphLayoutOptions = {},
): GraphLayoutResult {
  if (taskNodes.length === 0) return { nodes: [], edges: [] };

  // Group tasks by item, preserving first-seen order.
  const itemOrder: number[] = [];
  const tasksByItem = new Map<number, TaskGraphNode[]>();
  const itemOfTask = new Map<number, number>();
  for (const t of taskNodes) {
    if (!tasksByItem.has(t.itemId)) { tasksByItem.set(t.itemId, []); itemOrder.push(t.itemId); }
    tasksByItem.get(t.itemId)!.push(t);
    itemOfTask.set(t.id, t.itemId);
  }

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
    const collapsed = collapsedItemIds.has(itemId);

    if (collapsed) {
      groups.push({
        itemId, itemName, collapsed, width: COLLAPSED_W, height: COLLAPSED_H,
        counts, total: tasks.length, done: counts.done, children: [],
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
      counts, total: tasks.length, done: counts.done, children,
    });
  }

  const groupById = new Map<number, GroupInfo>();
  for (const gi of groups) groupById.set(gi.itemId, gi);

  // ── Level 2: outer layout of groups via component edges ───────────────────
  const interSeen = new Set<string>();
  const interEdges: Array<{ from: number; to: number }> = [];
  for (const e of taskEdges) {
    if (e.kind !== 'component') continue;
    const fi = itemOfTask.get(e.from);
    const ti = itemOfTask.get(e.to);
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
    const fi = itemOfTask.get(e.from);
    const ti = itemOfTask.get(e.to);
    if (fi == null || ti == null) continue;
    const fromCollapsed = groupById.get(fi)?.collapsed ?? true;
    const toCollapsed = groupById.get(ti)?.collapsed ?? true;
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
