import { cfApi, LONG_WRITE_MS } from './client';
import type { PieceCodesPreview } from './pieceCodes';
import type { SalesOrderLine } from './types';

/**
 * LOCK — GET / POST /order-lines/:id/lock (services/lockService.js).
 *
 * Locking rolls a line's structure out into pieces, each with its real code,
 * and from then on the line's structure, values and cut pieces no longer
 * change: a change is a new revision of the order. It sits right after the
 * Structure stage (values included) and before nesting and buying; the cut
 * pieces are made by the freeze itself (no stage of their own since 2026-10-02).
 *
 * The view has the Piece codes card's shape (PieceCodesPreview) so the same
 * tree draws it, plus what only the Lock stage says: the checks, the line's
 * position among the order's lines of the same design, and whether (and when)
 * it was locked.
 */

/** One thing lock checks, in words — what it found, and what to do about it. */
export interface LockCheck {
  key: 'line' | 'values' | 'structure' | 'cut_pieces' | 'codes' | 'cut_method' | 'section_parts' | 'cut_places' | string;
  ok: boolean;
  /** False when there is nothing of this kind on the line — e.g. no plate parts to cut. */
  applies: boolean;
  title: string;
  detail: string;
  todo?: string | null;
  /** The stage where it is put right. */
  stageKey?: string;
  /** A heads-up that never stops the freeze (e.g. a line with parts where none makes a cut piece). Shown amber, not counted as in the way. */
  warning?: boolean;
  /** Every sentence lock would refuse with for this check. */
  problems: string[];
}

export interface LockView extends Omit<PieceCodesPreview, 'released' | 'line'> {
  line: {
    id: number;
    lineNo: number;
    lineType: 'standard' | 'custom';
    orderId: number;
    orderCode: string;
    orderStatus: string;
    quantity: number;
    item: { id: number; code: string | null; name: string | null } | null;
  };
  released: { id: number } | null;
  /** Set once the line is locked: when, by whom, at which position, how many pieces it wrote. */
  locked: { at: string; by: { id: number; name: string | null } | null; position: number; pieces: number } | null;
  /** Its number among the order's lines selling the same design — the code's line position (01, 02). */
  position: { value: number; text: string; lines: number } | null;
  /** Every check passes and it is not locked yet. */
  canLock: boolean;
  checks: LockCheck[];
}

/**
 * What locking would do (or, once locked, what it wrote). With `nodes`, the
 * piece tree itself — a two-span bridge is ~6,000 pieces, so it is asked for
 * only when somebody wants to look, and gets the long wait a structure-sized
 * read gets.
 */
export function loadLock(lineId: number, { nodes = false }: { nodes?: boolean } = {}): Promise<LockView> {
  return cfApi.get<LockView>(`/order-lines/${lineId}/lock${nodes ? '?nodes=1' : ''}`, nodes ? { timeoutMs: LONG_WRITE_MS } : undefined);
}

/** Locks the line. Every piece's code is written here, so it gets the long wait a structure-sized write gets. */
export function lockLine(lineId: number): Promise<LockView> {
  return cfApi.post<LockView>(`/order-lines/${lineId}/lock`, {}, { timeoutMs: LONG_WRITE_MS });
}

/**
 * Whether an order line is locked — the order's own answer (GET /orders/:id
 * returns `lock` on each line). Read through here because the shared line type
 * predates lock.
 */
export function lineLock(line: SalesOrderLine | null | undefined): { lockedAt: string; position: number | null } | null {
  const lock = (line as (SalesOrderLine & { lock?: { lockedAt: string; position: number | null } | null }) | null | undefined)?.lock;
  return lock ?? null;
}
