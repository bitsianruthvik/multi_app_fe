import { cfApi, qs } from './client';
import type { OpState } from './trackerTree';

/**
 * The order line's Production grid (services/trackerTreeService.js lineGrid):
 * the frozen piece-code tree down the left, the line's operations across in
 * flow order, a cell per piece per operation. Same states as the Tracker tree.
 */

/** The piece's own step(s) for the operation — passes folded into one cell. */
export interface GridOwnCell {
  rollup?: undefined;
  state: OpState;
  done: number;
  total: number;
  stepIds: number[];
  /** A not-started step that could start now. */
  ready?: boolean;
  /** Why it is blocked, in a few words. */
  reason?: string;
  /** When the flow runs the operation more than once on this piece. */
  passes?: { stepId: number; name: string | null; state: OpState; done: number; total: number }[];
  /** The same operation further down the piece. */
  below?: { done: number; total: number };
}

/** No step of its own, but pieces under it have the operation: how much of it is done. */
export interface GridRollupCell { rollup: true; done: number; total: number }

export type GridCell = GridOwnCell | GridRollupCell;

export interface GridRow {
  id: string;                      // l<line> · p<piece>
  parentId: string | null;
  kind: 'line' | 'piece';
  /** The line 0, its top pieces 1, … */
  level: number;
  code: string;
  name: string | null;
  qty: number | null;
  completion: number | null;
  weight: 'minutes' | 'count' | null;
  blockedCount: number;
  blockedReason: string | null;
  blockedAt: string | null;
  running: number;
  childCount: number;
  childrenIncluded: boolean;
  /** Keyed by operation id; an operation missing here is not in this branch's flows (n/a). */
  cells: Record<string, GridCell>;
  pieceNo?: number | null;
  basis?: 'piece' | 'row';
  itemId?: number;
  /** How many steps the piece has of its own (0: it only gathers what is under it). */
  ownSteps?: number;
}

export interface GridOperation { id: number; code: string | null; name: string; done: number; total: number }

export interface LineGridResponse {
  lineId: number;
  released: boolean;
  releaseId?: number;
  order?: { id: number; code: string; status: string };
  summary: {
    pieces: number; blockedPieces: number; runningSteps: number; steps: number; stepsDone: number;
    completion: number | null; weight: 'minutes' | 'count' | null; ready: number; notReady: number;
  } | null;
  operations: GridOperation[];
  depth: number;
  total: number;
  returned: number;
  basisNote: { piece: string; row: string };
  nodes: GridRow[];
}

export interface GridChildrenResponse { node: GridRow; nodes: GridRow[] }

/** The first read of a big line builds its whole tree on the server (~1.6 s on production); later ones are quick. */
const SLOW = { timeoutMs: 120_000 };

export const getLineGrid = (lineId: number, opts: { depth?: number; open?: string[] } = {}) =>
  cfApi.get<LineGridResponse>(`/tracker/grid${qs({ lineId, depth: opts.depth, open: opts.open?.length ? opts.open.join(',') : undefined })}`, SLOW);

export const getGridChildren = (nodeId: string, depth = 1) =>
  cfApi.get<GridChildrenResponse>(`/tracker/grid/children${qs({ nodeId, depth })}`, SLOW);
