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
  /**
   * Weight, not just area — a square metre of 40 mm plate is 3.3 times the
   * steel of a square metre of 12 mm, so area alone flatters a plan that
   * wastes thick plate. This is the figure that converts to money.
   */
  steelTonnes?: number;
  wasteTonnes?: number;
  wasteValueInr?: number;
  unplaced?: number;
  skipped?: number;
  byThickness: { thickness: number; grade: string | null; plates: number; wastePct: number }[];
}

/**
 * What is ALREADY nested on the order, sent with every proposal.
 *
 * The search is random, so a re-run is not reliably better — a deep re-plan of
 * a 1,090-part order came back 6 m² worse than the nesting already on it. These
 * figures are what the proposal has to beat.
 *
 * `comparable` is false when the proposal covers a different set of parts from
 * the accepted nesting (the ordinary case: only the un-nested ones). The two
 * are still both worth showing then, but subtracting them would be meaningless.
 */
export interface AcceptedNesting {
  plates: number;
  parts: number;
  plateAreaM2: number;
  partAreaM2: number;
  wasteAreaM2: number;
  utilisationPct: number;
  steelTonnes: number;
  wasteTonnes: number;
  comparable: boolean;
}

export interface NestingSuggestion {
  ok: boolean;
  groups: SuggestedNest[];
  unplaced: SuggestProblem[];
  skipped: SuggestProblem[];
  summary?: SuggestSummary;
  /** Null when the order has nothing nested yet — then there is nothing to beat. */
  current?: AcceptedNesting | null;
  message?: string;
}

/**
 * HOW HARD TO LOOK. Measured on the KEPL order — 1,090 parts, 2 mm cutting gap,
 * MS plate around Rs 85,000 a tonne — not guessed:
 *
 *   quick      ~5 s   697.15 t        —              —
 *   standard  ~60 s   691.03 t   6.12 t   ~Rs 5.2 lakh
 *   deep     ~300 s   690.57 t   6.58 t   ~Rs 5.6 lakh
 *
 * Standard is the default: 93% of the saving in a fifth of the time. Deep buys
 * the last 0.46 t, about Rs 39,000 — worth waiting for before a large purchase,
 * not while somebody is still editing the BOQ.
 */
export type NestingEffort = 'quick' | 'standard' | 'deep';

export const EFFORT_CHOICES: {
  key: NestingEffort; label: string; takes: string; note: string;
}[] = [
  { key: 'quick', label: 'Quick', takes: 'a few seconds', note: 'A first look while the order is still changing.' },
  { key: 'standard', label: 'Standard', takes: 'about a minute', note: 'Most of the saving. The right choice nearly always.' },
  { key: 'deep', label: 'Deep', takes: 'up to five minutes', note: 'The last fraction of a percent. Worth it before a large purchase.' },
];

export interface SuggestOptions {
  /** Re-plan parts already on a plate, not just the ones with none. */
  includeNested?: boolean;
  /** Force a grade for parts whose material does not state one. */
  grade?: string | null;
  /** How hard to look. Omitted means the server's default, which is standard. */
  effort?: NestingEffort;
}

export const suggestNesting = (orderId: number, opts: SuggestOptions = {}) =>
  fabGet<NestingSuggestion>(`orders/${orderId}/nesting/suggest`, {
    ...(opts.includeNested ? { includeNested: 'true' } : {}),
    ...(opts.grade ? { grade: opts.grade } : {}),
    ...(opts.effort ? { effort: opts.effort } : {}),
  });

export const acceptNesting = (orderId: number, nests: SuggestedNest[]) =>
  fabPost<{ nestsCreated: number; partsNested: number; offcutsClaimed: number }>(
    `orders/${orderId}/nesting/suggest/accept`,
    { nests },
  );
