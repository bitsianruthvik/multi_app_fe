import { fabGet, fabPost } from './client';

/**
 * The nesting suggestor.
 *
 * Two calls, deliberately not one. `suggestNesting` proposes and writes
 * nothing; `acceptNesting` saves the nests a person chose. Looking at a
 * suggestion must never be able to change an order, and the accepted nests are
 * sent back verbatim rather than re-derived, so what is saved is what was on
 * screen.
 */

export interface SuggestedPart {
  linkId: number;
  partId: number;
  partCode: string | null;
  partName: string;
  qty: number;
  length: number;
  width: number;
}

/** One proposed plate: a catalogued size, and what would be cut from it. */
export interface SuggestedNest {
  thickness: number;
  grade: string | null;
  plate: {
    /** The CATALOG item the part is linked to. For an offcut this is the item it was cut from. */
    id: number;
    /** The single physical offcut, when this plate is one. Null for a catalogue size. */
    pieceId: number | null;
    /** Already-paid-for steel rather than a sheet to buy. */
    isOffcut: boolean;
    /** The offcut's size was computed from a nesting layout, not measured. */
    estimatedSize: boolean;
    code: string;
    name: string;
    length: number;
    width: number;
  };
  parts: SuggestedPart[];
  pieces: number;
  utilisationPct: number;
  usedAreaMm2: number;
  wasteAreaMm2: number;
}

/** A part the suggestor could not place, and why — always with a reason. */
export interface SuggestProblem {
  linkId: number;
  partCode: string | null;
  partName: string;
  reason: string;
}

export interface SuggestSummary {
  plates: number;
  parts: number;
  pieces: number;
  meanUtilisationPct: number;
  usedAreaM2: number;
  plateAreaM2: number;
  wasteAreaM2: number;
  wastePct: number;
  unplaced?: number;
  skipped?: number;
  byThickness: { thickness: number; grade: string | null; plates: number; wastePct: number }[];
}

export interface NestingSuggestion {
  ok: boolean;
  groups: SuggestedNest[];
  unplaced: SuggestProblem[];
  skipped: SuggestProblem[];
  summary?: SuggestSummary;
  message?: string;
}

export interface SuggestOptions {
  /** Re-plan parts already on a plate, not just the ones with none. */
  includeNested?: boolean;
  /** Force a grade for parts whose material does not state one. */
  grade?: string | null;
}

export const suggestNesting = (orderId: number, opts: SuggestOptions = {}) =>
  fabGet<NestingSuggestion>(`orders/${orderId}/nesting/suggest`, {
    ...(opts.includeNested ? { includeNested: 'true' } : {}),
    ...(opts.grade ? { grade: opts.grade } : {}),
  });

export const acceptNesting = (orderId: number, nests: SuggestedNest[]) =>
  fabPost<{ nestsCreated: number; partsNested: number; offcutsClaimed: number }>(
    `orders/${orderId}/nesting/suggest/accept`,
    { nests },
  );
