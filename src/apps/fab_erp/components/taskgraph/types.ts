/**
 * types.ts — shared types for the Task DAG / Task Engine React Flow graph
 * renderer (EU-3). Mirrors the backend GET /tasks/graph response contract
 * exactly; import these everywhere instead of re-declaring the shape.
 */

import type { Edge, Node } from '@xyflow/react';

export type TaskStatus = 'blocked' | 'eligible' | 'in_progress' | 'paused' | 'done' | 'cancelled';

/** One task/operation node, as returned by GET /tasks/graph. */
export interface TaskGraphNode {
  id: number;
  operationId: number | null;
  operationName: string | null;
  itemId: number;
  itemName: string | null;
  parentItemId: number | null;
  flowId: number;
  seqNo: number;
  status: TaskStatus;
  dependsOn: string | null;
  resourceTypeId: number | null;
  resourceTypeName: string | null;
  assignedResourceId: number | null;
  depsClearedAt: string | null;
  waitWorkingMinutes: number;
  blockedByOtherTasksMinutes: number;
  idleWaitMinutes: number;
  delayReason: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  computedHours: number | null;
}

export type TaskGraphEdgeKind = 'flow' | 'component';

/** One dependency edge between two task ids, as returned by GET /tasks/graph. */
export interface TaskGraphEdge {
  from: number;
  to: number;
  kind: TaskGraphEdgeKind;
}

// ─── Status legend ──────────────────────────────────────────────────────────
// Copied from OrderTaskDag.tsx (that file is due for refactor per this unit's
// brief, so we keep a local copy here instead of importing from it).

export const STATUS_COLOR: Record<TaskStatus, string> = {
  eligible: '#ef4444',
  blocked: '#9ca3af',
  in_progress: '#eab308',
  done: '#86efac',
  paused: '#f97316',
  cancelled: '#475569',
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  eligible: 'Not yet started',
  blocked: 'Blocked',
  in_progress: 'In progress',
  done: 'Done',
  paused: 'Paused',
  cancelled: 'Cancelled',
};

export const STATUS_ORDER: TaskStatus[] = ['eligible', 'blocked', 'in_progress', 'paused', 'done', 'cancelled'];

// ─── React Flow node data shapes ────────────────────────────────────────────
//
// NOTE on typing approach: fab_flow's reference nodes (ProcessStepNode.tsx,
// FabNodeDot.tsx) use the *plain* `Node`/`NodeProps` types from `@xyflow/react`
// (no generic type argument, so `data` is `Record<string, unknown>`) and cast
// `data as Record<string, unknown>` inside the component before reading
// individual fields. We follow the same convention here rather than
// parameterizing `Node<TData, TType>` with these interfaces directly — TS
// does not allow asserting an already-typed interface value to
// `Record<string, unknown>` (no index signature), it only works for a fresh
// object literal (e.g. `{ ...task, onOpen } as Record<string, unknown>`),
// which is exactly the pattern graphLayout.ts uses when building node data.
// These interfaces describe *that* literal's shape for callers/readers.

/** Data payload carried by an `operation` custom node (see OperationNode.tsx). */
export interface OperationNodeData extends TaskGraphNode {
  /** Called with this task's id when the card is clicked. */
  onOpen?: (taskId: number) => void;
}

export type PartStatusCounts = Record<TaskStatus, number>;

/** Data payload carried by a `partGroup` custom group/container node (see PartGroupNode.tsx). */
export interface PartGroupNodeData {
  itemId: number;
  itemName: string | null;
  collapsed: boolean;
  statusCounts: PartStatusCounts;
  totalCount: number;
  doneCount: number;
  /** Called with this group's itemId when the collapse/expand toggle is clicked. */
  onToggle: (itemId: number) => void;
}

// ─── Layout ─────────────────────────────────────────────────────────────────

/** Result of graphLayout.ts's layout pass — ready to hand straight to <ReactFlow>. */
export interface GraphLayoutResult {
  nodes: Node[];
  edges: Edge[];
}

/** Options passed through to graphLayout.ts to wire node interactivity. */
export interface GraphLayoutOptions {
  onOpenTask?: (taskId: number) => void;
  onToggleGroup?: (itemId: number) => void;
}
