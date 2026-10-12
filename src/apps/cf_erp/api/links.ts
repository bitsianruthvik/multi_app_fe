import { cfApi, qs } from './client';
import type { CodeSegment } from '../lib/codeSegments';

/**
 * Linked copies ("same design") — the contract with the server (CF_ERP_LINKED_COPIES_PLAN.md §3).
 * A row that was copied is linked to its original: the same design, drawn once, filled once.
 * Everything here is read from the server; the screen never decides what "the same design" is.
 */

/** What one row says about its copies: linked (with its group), identical to others but not linked, or kept apart. */
export type LinkRowInfo = { g: string; n: number } | { same: number[] } | { apart: true };

/** `GET /order-lines/:id/values` (and every view it returns) carries this block, keyed by record id. */
export interface LinksBlock {
  rows: Record<string, LinkRowInfo>;
  /** Group key → the record ids in it. */
  groups: Record<string, number[]>;
}

/** What a person chose for a change that reaches rows with copies. */
export type LinkChoiceValue = 'all' | 'one';

/** A change that touched rows with copies, as the server answers it (dry run and save). */
export interface LinkTouchedAnswer {
  recordId: number;
  label: string;
  group: string | null;
  count: number;
  members: number[];
  specs: string[];
  /** 'values' | 'quantity' | 'remove' | 'add' — for the last three `recordId` is the PARENT row (its design changed). */
  reason: 'values' | 'quantity' | 'remove' | 'add' | string;
  choice: LinkChoiceValue | null;
}

/** A row that stopped being the same as its copies. */
/** `now`: the group the row ended in — null = not linked any more. */
export interface LinkBreakAnswer { recordId: number; label: string; was: string | null; now?: string | null; because: string }

/** The `links` part of a bom-changes answer. */
export interface LinksAnswer {
  needsChoice: boolean;
  touched: LinkTouchedAnswer[];
  breaks: LinkBreakAnswer[];
  skipped?: unknown[];
  /** Null when the batch touched nothing link-relevant. */
  after?: LinksBlock | null;
}

/** `GET /order-lines/:id/design-uses` — the pieces made to one design. */
export interface DesignUses {
  /** Before the freeze: `code` + `segments` and a count. After: no code, and (possibly) the piece codes in `pieces`. */
  rows: { recordId: number; label: string; code: string | null; segments?: CodeSegment[] | null; pieces: number | unknown[] }[];
  pieces: { code: string; recordId: number }[];
  total: number;
  /** True once the line is locked and the pieces have their real codes. */
  frozen: boolean;
}

export type DesignUsesQuery = { group?: string; recordId?: number; drawingId?: number };

export const getDesignUses = (lineId: number, q: DesignUsesQuery) =>
  cfApi.get<DesignUses>(`/order-lines/${lineId}/design-uses${qs({ group: q.group, recordId: q.recordId, drawingId: q.drawingId })}`);
