import { cfApi, LONG_WRITE_MS } from './client';
import type { CutPiecesFollowUp } from './cutPieces';

/**
 * Edit mode's one request: many changes to the structure on one BOM screen,
 * saved together (POST /bom-changes, services/bomChangeService.js).
 *
 * All or nothing. A refusal is a 422 whose `problems` lists every problem at
 * once and nothing is applied; a frozen structure (closed order, released
 * line, obsolete record) is a 409. `dryRun` does the real thing and rolls it
 * back, so it answers exactly what Save would do — the codes the copies would
 * get included.
 */

export type BomChangeScope = { recordId: number } | { orderLineId: number };

export type BomChange =
  | { op: 'quantity'; lineId: number; quantity: number }
  /** null goes back to the way the child is usually made. */
  | { op: 'flow'; lineId: number; flowId: number | null }
  /**
   * The ROW'S OWN flow (an order row keeps the flow it was made with) — the only flow the top row of an
   * order line has. null = no flow. With `flow: null` on the row's line it is "take the definition's flow again".
   */
  | { op: 'ownFlow'; recordId: number; flowId: number | null }
  /** The row's description (the text after the dot). null / empty clears it. Only before the line is locked. */
  | { op: 'role'; lineId: number; role: string | null }
  | { op: 'remove'; lineId: number }
  | { op: 'arrange'; groups: { parentId: number; lineIds: (number | string)[] }[] }
  | { op: 'values'; writes: { recordId: number; specCode: string; value: string | null }[] }
  /**
   * Into a Custom BOM (an order's temporary items) a deep copy: new temporary
   * items with their values, lines and flows; catalog items, templates,
   * selections and cut plates referenced. Into a Template or Standard BOM,
   * another line to the same child. `quantity` defaults to the source line's.
   */
  | { op: 'paste'; key?: string; sourceLineId: number; parentId: number; afterLineId?: number | null; quantity?: number; role?: string | null };

export interface BomChangesRequest {
  scope: BomChangeScope;
  dryRun?: boolean;
  changes: BomChange[];
}

export interface BomChangeCounts {
  quantity: number;
  flow: number;
  /** Rows whose own flow changed, and rows whose flow changed either way (a row counted once). */
  ownFlow?: number;
  flowRows?: number;
  role?: number;
  pasted: number;
  /** New temporary items the pastes created. */
  copiedItems: number;
  removed: number;
  /** Rows drawn below removed lines that go with them. */
  removedBeneath: number;
  unchanged: number;
  changes: number;
  rearranged?: number;
  moved?: number;
  values?: number;
}

export interface BomChangeCopy { id: number | null; code: string | null; name: string; depth: number }

export type BomChangeResult =
  | { op: 'quantity'; lineId: number; from: number; to: number; changed: boolean }
  | { op: 'flow'; lineId: number; from: number | null; to: number | null; changed: boolean }
  | { op: 'ownFlow'; recordId: number; from: number | null; to: number | null; changed: boolean }
  | { op: 'role'; lineId: number; from: string | null; to: string | null; changed: boolean }
  | { op: 'remove'; lineId: number; beneath: number; withParent: boolean }
  | { op: 'arrange'; moved: number; reordered: number }
  | { op: 'values'; changed: number; records: number }
  | {
    op: 'paste'; sourceLineId: number; parentId: number; mode: 'copy' | 'line' | 'reference';
    /** Null on a dry run — the row was never kept. */
    lineId: number | null;
    quantity: number;
    created: number;
    items: BomChangeCopy[];
    notes: string[];
  };

export interface BomChangesResponse {
  applied: boolean;
  dryRun: boolean;
  summary: { sentence: string; counts: BomChangeCounts };
  /** One per change, in the order they were sent. */
  results: (BomChangeResult | null)[];
  /** What the line's cut pieces did after a save on an order's structure (absent on a dry run). */
  cutPieces?: CutPiecesFollowUp | null;
}

/**
 * A deep copy of a large sub-structure is a few hundred round trips, and the
 * production database is ~49 ms away — a girder line measured 730 of them. The
 * platform's default 30 s timeout would give up on a save that then commits,
 * and a person who saves again gets two copies. So this call waits longer.
 */
export function postBomChanges(body: BomChangesRequest): Promise<BomChangesResponse> {
  return cfApi.post<BomChangesResponse>('/bom-changes', body, { timeoutMs: LONG_WRITE_MS });
}
