import { cfApi } from './client';

/**
 * GET /order-lines/:id/placeholders — the code each row of a line's structure
 * will give its pieces when the line is LOCKED, with # where each piece's own
 * number goes (placeholderService). A row is a design, not an item: it has no
 * code of its own until then.
 */
export interface PlaceholderRow {
  /** The BOM row; null for what the line itself sells. */
  bomLineId: number | null;
  itemId: number;
  /** Null when the coding rule leans on something the row has not got — see `missing`. */
  code: string | null;
  /** How many physical pieces the row becomes on this line. */
  pieces: number;
  /** What the # after its short name runs over under each parent piece — [1, 21] — or null when its number does not vary. */
  seqRange: [number, number] | null;
}

export interface LinePlaceholders {
  lineId: number;
  locked: boolean;
  /** The line's number among the order's lines of the same design — what lock gives (or gave) it. */
  position: number | null;
  rows: PlaceholderRow[];
  missing: { bomLineId: number | null; itemId: number; schemeCode: string | null; missing: string[] }[];
}

export const getLinePlaceholders = (lineId: number) => cfApi.get<LinePlaceholders>(`/order-lines/${lineId}/placeholders`);

/** The words beside a placeholder: what it is, and what its # runs over. */
export function placeholderTitle(row: PlaceholderRow): string {
  const range = row.seqRange ? ` Its own number runs ${row.seqRange[0]}–${row.seqRange[1]} under each parent.` : '';
  return `The code its pieces get when the design is frozen — # is where each piece’s own number goes.${range}`;
}

/** How a structure node finds its row: by its BOM line, or by item for what the line sells. */
export const placeholderKey = (bomLineId: number | null, itemId: number) => (bomLineId != null ? `l${bomLineId}` : `i${itemId}`);
