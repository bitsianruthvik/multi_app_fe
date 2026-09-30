import { cfApi, qs } from './client';
import type { ProductionStep } from './types';

/**
 * The Tracker's progress tree (services/trackerTreeService.js): order › line ›
 * the frozen piece codes, each node with its own operations and, over its
 * subtree, how much is done and what is blocked.
 */
export type OpState = 'done' | 'partial' | 'todo' | 'running' | 'blocked';

export interface TreeOp {
  stepId: number;
  operationId: number;
  /**
   * The operation's name, or which pass of it ("SAW Welding (pass 2 of 3)"). The
   * server sends it only for a pass; the fetchers below fill the rest in from the read's operations.
   */
  name: string;
  done: number;
  total: number;
  state: OpState;
  /** A todo step that could start now. */
  ready?: boolean;
  /** Why it is blocked, in a few words. */
  reason?: string;
}

export interface TreeNode {
  id: string;                     // o<order> · l<line> · p<piece>
  parentId: string | null;
  kind: 'order' | 'line' | 'piece';
  level: number;                  // order 0, line 1, top piece 2 …
  code: string;
  name: string | null;
  qty: number | null;
  ops: TreeOp[];
  /** Over the whole subtree, 0–1; null when nothing under it has a step. */
  completion: number | null;
  weight: 'minutes' | 'count' | null;
  blocked: boolean;
  blockedCount: number;
  blockedReason: string | null;
  /** The piece the reason belongs to, when it is not this node. */
  blockedAt: string | null;
  running: number;
  childCount: number;
  childrenIncluded: boolean;
  match?: boolean;
  pieceNo?: number | null;
  /** piece = counted for this piece; row = a group of identical parts, counted for the group. */
  basis?: 'piece' | 'row';
  itemId?: number;
  lineId?: number;
  releaseId?: number;
  orderId?: number;
  pieces?: number;
  steps?: number;
  stepsDone?: number;
  byOperation?: { operationId: number; done: number; total: number }[];
}

export interface TreeOrderChoice {
  id: number; code: string; title: string | null; customer: string | null; status: string; open: boolean;
  lines: { id: number; lineNo: number; releaseId: number; itemName: string }[];
}

export type OperationNames = Record<string, { code: string; name: string }>;

export interface TrackerTreeResponse {
  scope: { orderId: number | null; lineId: number | null; includeClosed: boolean };
  orders: TreeOrderChoice[];
  summary: { orders: number; lines: number; pieces: number; blockedPieces: number; runningSteps: number; steps: number; stepsDone: number; completion: number | null; weight: 'minutes' | 'count' | null };
  depth: number;
  search: string | null;
  onlyBlocked: boolean;
  total: number;
  returned: number;
  truncated: boolean;
  basisNote: { piece: string; row: string };
  operations: OperationNames;
  nodes: TreeNode[];
}

export interface TreeChildrenResponse { node: TreeNode; operations: OperationNames; nodes: TreeNode[] }

export interface TreePieceResponse {
  node: TreeNode;
  operations: OperationNames;
  path: { id: string; kind: TreeNode['kind']; code: string }[];
  order: { id: number; code: string } | null;
  line: { id: number; lineNo: number } | null;
  steps: ProductionStep[];
}

export interface TreeQuery { orderId?: number | null; lineId?: number | null; depth?: number | null; search?: string | null; onlyBlocked?: boolean }

/** A big line's tree is read in full on the server every time (~1 s locally, more on production). */
const SLOW = { timeoutMs: 120_000 };

/** Every op gets its name: its own (a pass) or its operation's. */
export function withNames<T extends { operations: OperationNames }>(r: T, nodes: TreeNode[]): TreeNode[] {
  return nodes.map((n) => (n.ops.length ? { ...n, ops: n.ops.map((o) => (o.name ? o : { ...o, name: r.operations[o.operationId]?.name ?? `Operation ${o.operationId}` })) } : n));
}

export const getTrackerTree = async (q: TreeQuery = {}): Promise<TrackerTreeResponse> => {
  const r = await cfApi.get<TrackerTreeResponse>(`/tracker/tree${qs({
  orderId: q.orderId ?? undefined, lineId: q.lineId ?? undefined, depth: q.depth ?? undefined,
  search: q.search?.trim() || undefined, onlyBlocked: q.onlyBlocked ? 1 : undefined,
})}`, SLOW);
  return { ...r, nodes: withNames(r, r.nodes) };
};
export const getTreeChildren = async (nodeId: string, depth = 1): Promise<TreeChildrenResponse> => {
  const r = await cfApi.get<TreeChildrenResponse>(`/tracker/tree/children${qs({ nodeId, depth })}`, SLOW);
  return { ...r, node: withNames(r, [r.node])[0], nodes: withNames(r, r.nodes) };
};
export const getTreePiece = async (nodeId: string): Promise<TreePieceResponse> => {
  const r = await cfApi.get<TreePieceResponse>(`/tracker/tree/node${qs({ nodeId })}`, SLOW);
  return { ...r, node: withNames(r, [r.node])[0] };
};
