import dagre from '@dagrejs/dagre';
import { Position, type Node, type Edge } from '@xyflow/react';
import type { RawEdge } from './criticalPath';

export const STEP_NODE_W = 216;
export const STEP_NODE_H = 104;

export interface StepDatum {
  id: number;
  processStepCode: string;
  processName: string;
  processType: string | null;
  sequenceNo: number | null;
  parallelGroup: string | null;
  estimatedTimeValue: number | null;
  estimatedTimeUnit: string | null;
  mandatory: boolean;
  machineOrWorkcentreType: string | null;
  notes: string | null;
  nodeMaps: Array<{
    id: number;
    nodeId: number;
    nodeRole: string;
    nodeCode: string;
    nodeDisplayName: string;
    quantity: number | null;
    notes: string | null;
  }>;
  preconditions: Array<{
    id: number;
    requiredProcessStepId: number | null;
    requiredNodeId: number | null;
    requiredCondition: string | null;
    notes: string | null;
    requiredStepCode: string | null;
    requiredStepName: string | null;
    requiredNodeCode: string | null;
  }>;
  ready: boolean;
}

export function buildEdges(steps: StepDatum[]): RawEdge[] {
  // Priority 1: explicit preconditions (step → step)
  const explicit: RawEdge[] = [];
  for (const s of steps) {
    for (const pc of s.preconditions) {
      if (pc.requiredProcessStepId != null) {
        explicit.push({ source: pc.requiredProcessStepId, target: s.id, isInferred: false });
      }
    }
  }
  if (explicit.length > 0) return explicit;

  // Priority 2: infer from shared node participation + sequence_no
  const nodeSteps: Record<number, StepDatum[]> = {};
  for (const s of steps) {
    for (const nm of s.nodeMaps) {
      if (['Worked-On', 'Output', 'Input'].includes(nm.nodeRole)) {
        (nodeSteps[nm.nodeId] ??= []).push(s);
      }
    }
  }

  const seen = new Set<string>();
  const inferred: RawEdge[] = [];

  for (const nodeStepList of Object.values(nodeSteps)) {
    const sorted = [...nodeStepList].sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0));
    for (let i = 0; i < sorted.length - 1; i++) {
      const src = sorted[i].id;
      const tgt = sorted[i + 1].id;
      if (src === tgt) continue;
      const key = `${src}→${tgt}`;
      if (!seen.has(key)) {
        seen.add(key);
        inferred.push({ source: src, target: tgt, isInferred: true });
      }
    }
  }

  if (inferred.length > 0) return inferred;

  // Priority 3: fallback — sequence within parallel_group
  const groups: Record<string, StepDatum[]> = {};
  for (const s of steps) {
    const key = s.parallelGroup ?? '__root';
    (groups[key] ??= []).push(s);
  }
  for (const group of Object.values(groups)) {
    const sorted = [...group].sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0));
    for (let i = 0; i < sorted.length - 1; i++) {
      const src = sorted[i].id;
      const tgt = sorted[i + 1].id;
      if (src === tgt) continue;
      const key = `${src}→${tgt}`;
      if (!seen.has(key)) {
        seen.add(key);
        inferred.push({ source: src, target: tgt, isInferred: true });
      }
    }
  }

  return inferred;
}

const CP_STROKE  = '#ef4444';
const DEF_STROKE = '#cbd5e1';

export function layoutSteps(
  steps: StepDatum[],
  rawEdges: RawEdge[],
  criticalIds: Set<number>,
): { nodes: Node[]; edges: Edge[] } {
  if (steps.length === 0) return { nodes: [], edges: [] };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 36 });

  for (const s of steps) g.setNode(String(s.id), { width: STEP_NODE_W, height: STEP_NODE_H });
  for (const e of rawEdges) g.setEdge(String(e.source), String(e.target));

  dagre.layout(g);

  // Pre-populate handle positions so React Flow can render edges immediately
  // without waiting for ResizeObserver to fire in constrained viewports.
  const HANDLE_H = 8;
  const TARGET_HANDLE = { id: null, type: 'target' as const, position: Position.Left, x: 0, y: STEP_NODE_H / 2 - HANDLE_H / 2, width: HANDLE_H, height: HANDLE_H };
  const SOURCE_HANDLE = { id: null, type: 'source' as const, position: Position.Right, x: STEP_NODE_W - HANDLE_H, y: STEP_NODE_H / 2 - HANDLE_H / 2, width: HANDLE_H, height: HANDLE_H };

  const nodes: Node[] = steps.map((s) => {
    const pos = g.node(String(s.id)) ?? { x: 0, y: 0 };
    return {
      id: String(s.id),
      type: 'processStep',
      position: { x: pos.x - STEP_NODE_W / 2, y: pos.y - STEP_NODE_H / 2 },
      width: STEP_NODE_W,
      height: STEP_NODE_H,
      handles: [TARGET_HANDLE, SOURCE_HANDLE],
      data: { ...s, onCriticalPath: criticalIds.has(s.id) } as Record<string, unknown>,
    };
  });

  const edges: Edge[] = rawEdges.map((e) => {
    const isCp = criticalIds.has(e.source) && criticalIds.has(e.target);
    return {
      id: `e-${e.source}-${e.target}`,
      source: String(e.source),
      target: String(e.target),
      type: 'smoothstep',
      animated: isCp,
      style: {
        stroke: isCp ? CP_STROKE : DEF_STROKE,
        strokeWidth: isCp ? 3 : 1.5,
        opacity: isCp ? 1 : 0.6,
      },
    };
  });

  return { nodes, edges };
}

// ─── Shared helper ───────────────────────────────────────────────────────────

export function toMinutes(
  value: number | null | undefined,
  unit: string | null | undefined,
): number {
  if (!value) return 0;
  const u = (unit ?? 'min').toLowerCase();
  return u === 'hr' || u === 'hrs' || u === 'hour' || u === 'hours' ? value * 60 : value;
}

// ─── Node-centric ("dot") graph ───────────────────────────────────────────────

export const FAB_DOT_W  = 184;
export const FAB_DOT_H  = 32;
export const FAB_DOT_CY = 16; // vertical centre of pill within the node box

export function getPrimaryNodeId(step: StepDatum): number | null {
  for (const role of ['Worked-On', 'Output', 'Input']) {
    const m = step.nodeMaps.filter((nm) => nm.nodeRole === role);
    if (m.length > 0) return m[0].nodeId;
  }
  return step.nodeMaps[0]?.nodeId ?? null;
}

export interface NodeGraphResult {
  nodes: Node[];
  edges: Edge[];
  edgePipelines: Map<string, StepDatum[]>;
  nodePipelines: Map<number, StepDatum[]>;
  cpNodeIds: Set<number>;
}

// Longest weighted time path through the BOM hierarchy (child → parent).
// Edges: childNodeId → parentNodeId. Leaves (parts) have inDeg=0; roots (assemblies) have adj=[].
// Node weight = total process minutes for that node; falls back to hop-count if all are zero.
// endId is restricted to root nodes so the traceback always covers the full leaf→root chain.
function computeNodeCP(
  nodeIds: number[],
  rels: { parentNodeId: number; childNodeId: number }[],
  nodeMinutes: Map<number, number>,
): Set<number> {
  if (nodeIds.length === 0) return new Set();

  const adj: Record<number, number[]> = {};
  const inDeg: Record<number, number> = {};
  for (const id of nodeIds) { adj[id] = []; inDeg[id] = 0; }
  for (const r of rels) {
    if (adj[r.childNodeId] !== undefined && adj[r.parentNodeId] !== undefined) {
      adj[r.childNodeId].push(r.parentNodeId);
      inDeg[r.parentNodeId]++;
    }
  }

  // Kahn topological sort (leaves first, roots last)
  const inDegWork = { ...inDeg };
  const queue     = nodeIds.filter((id) => inDegWork[id] === 0);
  const topo: number[] = [];
  while (queue.length) {
    const v = queue.shift()!;
    topo.push(v);
    for (const w of adj[v]) { if (--inDegWork[w] === 0) queue.push(w); }
  }

  // Fall back to hop-count (weight=1) when no step has an estimated time
  const hasTime = nodeIds.some((id) => (nodeMinutes.get(id) ?? 0) > 0);
  const weight  = (id: number) => hasTime ? (nodeMinutes.get(id) ?? 0) : 1;

  // DP: dist[v] = longest weighted path from any leaf up to v
  const dist: Record<number, number> = {};
  const prev: Record<number, number | null> = {};
  for (const id of nodeIds) { dist[id] = weight(id); prev[id] = null; }
  for (const v of topo) {
    for (const w of adj[v]) {
      const cand = dist[v] + weight(w);
      if (cand > dist[w]) { dist[w] = cand; prev[w] = v; }
    }
  }

  // Restrict endId to root nodes (adj[id] empty = no parent in BOM).
  // This ensures the traceback covers root→leaf, not just an isolated high-minute leaf.
  const rootIds    = nodeIds.filter((id) => adj[id].length === 0);
  const candidates = rootIds.length > 0 ? rootIds : nodeIds;

  let maxDist = -Infinity;
  let endId   = candidates[0];
  for (const id of candidates) { if (dist[id] > maxDist) { maxDist = dist[id]; endId = id; } }

  // Trace back to get the full chain
  const cp = new Set<number>();
  let cur: number | null = endId;
  while (cur !== null) { cp.add(cur); cur = prev[cur] ?? null; }
  return cp;
}

function fmtDurMin(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

// Uses the fab-node hierarchy (child → parent relationships) to build a
// left-to-right BOM flow: parts on the left merge into assemblies on the right.
// Wire time = total process time for the child node's steps.
export function buildNodeGraph(
  steps: StepDatum[],
  fabNodes: Array<{ id: number; nodeCode: string; displayName: string; levelName: string | null; quantity: number | null; unit: string | null }>,
  fabNodeRels: { parentNodeId: number; childNodeId: number }[],
): NodeGraphResult {
  if (fabNodes.length === 0) {
    return { nodes: [], edges: [], edgePipelines: new Map(), nodePipelines: new Map(), cpNodeIds: new Set() };
  }

  // step → primary fab node
  const stepPrimary = new Map<number, number | null>(
    steps.map((s) => [s.id, getPrimaryNodeId(s)]),
  );

  // group steps by primary node, sorted by sequenceNo
  const nodePipelines = new Map<number, StepDatum[]>();
  for (const s of steps) {
    const nid = stepPrimary.get(s.id);
    if (nid != null) {
      if (!nodePipelines.has(nid)) nodePipelines.set(nid, []);
      nodePipelines.get(nid)!.push(s);
    }
  }
  for (const list of nodePipelines.values()) {
    list.sort((a, b) => (a.sequenceNo ?? 999) - (b.sequenceNo ?? 999));
  }

  // edge pipelines: for each child→parent relationship,
  // pipeline = all steps primarily assigned to the child node
  const edgePipelines = new Map<string, StepDatum[]>();
  for (const rel of fabNodeRels) {
    const key = `${rel.childNodeId}→${rel.parentNodeId}`;
    edgePipelines.set(key, nodePipelines.get(rel.childNodeId) ?? []);
  }

  // per-node total minutes
  const nodeMinutes = new Map<number, number>();
  for (const fn of fabNodes) {
    const list = nodePipelines.get(fn.id) ?? [];
    nodeMinutes.set(fn.id, list.reduce((s, st) => s + toMinutes(st.estimatedTimeValue, st.estimatedTimeUnit), 0));
  }

  // critical path through the BOM hierarchy (longest time chain, leaf → root)
  const cpNodeIds = computeNodeCP(fabNodes.map((fn) => fn.id), fabNodeRels, nodeMinutes);
  const nodeCp    = new Map<number, boolean>(fabNodes.map((fn) => [fn.id, cpNodeIds.has(fn.id)]));

  // dagre layout — edges go child → parent so leaves (parts) land on the left,
  // root assemblies on the right, naturally forming a converging BOM flow
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 120, nodesep: 20 });
  for (const fn of fabNodes) g.setNode(String(fn.id), { width: FAB_DOT_W, height: FAB_DOT_H });
  for (const rel of fabNodeRels) {
    if (g.hasNode(String(rel.childNodeId)) && g.hasNode(String(rel.parentNodeId))) {
      g.setEdge(String(rel.childNodeId), String(rel.parentNodeId));
    }
  }
  dagre.layout(g);

  const HANDLE_H = 8;
  const TH = { id: null, type: 'target' as const, position: Position.Left,  x: 0,                   y: FAB_DOT_CY - HANDLE_H / 2, width: HANDLE_H, height: HANDLE_H };
  const SH = { id: null, type: 'source' as const, position: Position.Right, x: FAB_DOT_W - HANDLE_H, y: FAB_DOT_CY - HANDLE_H / 2, width: HANDLE_H, height: HANDLE_H };

  const nodes: Node[] = fabNodes.map((fn) => {
    const pos = g.node(String(fn.id)) ?? { x: 0, y: 0 };
    return {
      id:     String(fn.id),
      type:   'fabNodeDot',
      position: { x: pos.x - FAB_DOT_W / 2, y: pos.y - FAB_DOT_H / 2 },
      width:  FAB_DOT_W,
      height: FAB_DOT_H,
      handles: [TH, SH],
      data: {
        nodeCode:       fn.nodeCode,
        displayName:    fn.displayName,
        levelName:      fn.levelName,
        quantity:       fn.quantity,
        unit:           fn.unit,
        totalMinutes:   nodeMinutes.get(fn.id) ?? 0,
        stepCount:      nodePipelines.get(fn.id)?.length ?? 0,
        onCriticalPath: nodeCp.get(fn.id) ?? false,
      } as Record<string, unknown>,
    };
  });

  const CP_STROKE  = '#ef4444';
  const DEF_STROKE = '#94a3b8';
  const edges: Edge[] = fabNodeRels.map((rel) => {
    const key      = `${rel.childNodeId}→${rel.parentNodeId}`;
    const pipeline = edgePipelines.get(key) ?? [];
    const mins     = pipeline.reduce((s, st) => s + toMinutes(st.estimatedTimeValue, st.estimatedTimeUnit), 0);
    const isCp     = (nodeCp.get(rel.childNodeId) ?? false) && (nodeCp.get(rel.parentNodeId) ?? false);
    return {
      id:       `ne-${rel.childNodeId}-${rel.parentNodeId}`,
      source:   String(rel.childNodeId),
      target:   String(rel.parentNodeId),
      type:     'smoothstep',
      animated: isCp,
      label:     mins > 0 ? fmtDurMin(mins) : undefined,
      labelStyle:          { fontSize: 10, fontWeight: isCp ? 700 : 500, fill: isCp ? '#b45309' : '#64748b' },
      labelBgStyle:        { fill: '#ffffff', fillOpacity: 0.92 },
      labelBgPadding:      [4, 2] as [number, number],
      labelBgBorderRadius: 3,
      style: {
        stroke:      isCp ? CP_STROKE : DEF_STROKE,
        strokeWidth: isCp ? 2.5 : 1.5,
        opacity:     isCp ? 1 : 0.75,
      },
    };
  });

  return { nodes, edges, edgePipelines, nodePipelines, cpNodeIds };
}
