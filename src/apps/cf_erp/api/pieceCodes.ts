import { cfApi, LONG_WRITE_MS } from './client';

/**
 * The piece codes release would write — GET /order-lines/:id/release-preview
 * (releaseService.releasePreview). Read-only: nothing is written and no
 * running number is drawn; a rule's running numbers show as the ones release
 * would draw next.
 */

/**
 * One node of the tree release would lay out. A numbered PIECE has `pieceNo`;
 * a GROUP of identical parts under its parent piece has none, shares one code,
 * and `quantity` says how many it holds.
 */
export interface PieceCodeNode {
  /** Its place in `nodes` — the order release writes them, a parent before its children. */
  k: number;
  parentK: number | null;
  depth: number;
  code: string;
  pieceNo: number | null;
  /** The number under its parent piece (24), or a group's range ("1-4"). */
  pieceSeq: number | string | null;
  quantity: number;
  itemId: number;
  /** The coding rule that chose the code; null means none applies and the built-in shape was used. */
  rule: string | null;
  /** A group only: what it is and how many — "<item> ×6". */
  label?: string;
}

export interface PieceCodeItem {
  code: string | null;
  name: string | null;
  uom: string | null;
}

/** A node whose coding rule has a hole: its code here is the built-in one, and release refuses. */
export interface PieceCodeHole {
  k: number;
  itemCode: string | null;
  schemeCode: string;
  missing: string[];
}

export interface PieceCodesPreview {
  line: {
    id: number;
    lineNo: number;
    orderId: number;
    orderCode: string;
    orderStatus: string;
    quantity: number;
    item: { id: number; code: string | null; name: string | null } | null;
  };
  /** Set when the line is already released — then nothing is laid out: the tracker holds the real pieces. */
  released: { id: number; releasedAt: string; pieces: number } | null;
  /** What still stops release. While one stands, what it names may be missing from the tree. */
  problems: string[];
  /** Over the size cap: the tree is incomplete. */
  truncated: boolean;
  summary: {
    nodes: number;
    pieces: number;
    groups: number;
    /** Distinct codes. */
    codes: number;
    byRule: number;
    builtIn: number;
    /** Codes given to more than one node, and how many nodes carry one of them. */
    duplicates: number;
    duplicatePieces: number;
    /** Codes a piece of another release already carries. */
    taken: number;
    /** Nodes whose rule has a hole. */
    missing: number;
  };
  nodes: PieceCodeNode[];
  /** Keyed by item id: each item once, not once per node. */
  items: Record<string, PieceCodeItem>;
  duplicates: string[];
  taken: string[];
  missing: PieceCodeHole[];
}

/**
 * Heavy: a two-span bridge is ~6,000 pieces. It is a read, but it gets the long
 * wait a structure-sized write gets, so a slow link does not give up on it.
 */
export function loadPieceCodes(lineId: number): Promise<PieceCodesPreview> {
  return cfApi.get<PieceCodesPreview>(`/order-lines/${lineId}/release-preview`, { timeoutMs: LONG_WRITE_MS });
}
