/**
 * One definition of "does the shop MAKE this or BUY it", for the screens.
 *
 * The rule, for any node in an order's BOM:
 *
 *   linked to a catalog item  →  whatever the CATALOG says. That is what
 *                                "explicitly selected from the item catalog"
 *                                means, and it is how raw materials come out
 *                                'buy' without anything here knowing the word.
 *   no catalog link           →  'make'. The structural levels of a BOQ — span,
 *                                girder, segment, part — are built here.
 *
 * The server applies this on every import and stores the answer, so the screens
 * READ the column rather than re-deriving it; re-deriving in the browser would
 * be a second opinion that quietly disagrees the moment the rule changes.
 *
 * This mirrors procurementService.js on the backend. The two cannot share code
 * — separate repos — so the rule is stated once on each side.
 */

export type Procurement = 'make' | 'buy';

/** The default for a row nothing has classified — rows created before the column existed. */
export const DEFAULT_PROCUREMENT: Procurement = 'make';

/**
 * What to do with a row, tolerating the unclassified case.
 *
 * Absent is deliberately NOT distinguished from 'make' at the point of reading.
 * The distinction matters to the backfill, which must not flatten an override,
 * and nowhere else.
 */
export function procurementOf(item?: { procurementType?: string | null } | null): Procurement {
  return item?.procurementType === 'buy' ? 'buy' : DEFAULT_PROCUREMENT;
}

/** How it reads to a person. */
export const procurementLabel = (p: Procurement): string =>
  (p === 'buy' ? 'Bought in' : 'Made here');
