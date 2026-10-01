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

/**
 * GET /records/:id/bom/codes — a catalog item's or definition's BOM coded the
 * way an order codes its rows (placeholderService.recordBomCodes): the record's
 * own code (or short name, while it has none) on top, then each row's position
 * — short name, quantity range or # — by the same rules. A preview: nothing is
 * stored. Rows are keyed by the tree node key, so the same child twice is two
 * rows with two codes.
 */
export interface RecordBomCodeRow extends PlaceholderRow {
  /** The explode() node key the row is drawn by. */
  key: string;
}

export interface RecordBomCodes {
  recordId: number;
  rootCode: string | null;
  rows: RecordBomCodeRow[];
  missing: LinePlaceholders['missing'];
  problems: string[];
  truncated: boolean;
}

export const getRecordBomCodes = (recordId: number) => cfApi.get<RecordBomCodes>(`/records/${recordId}/bom/codes`);

/** The words beside a catalog row's position code. */
export function positionCodeTitle(row: PlaceholderRow, itemCode: string | null): string {
  const range = row.seqRange ? ` # runs ${row.seqRange[0]}–${row.seqRange[1]} under each parent.` : '';
  return `The code this row gets from where it sits — parent, short name, quantity — by the rules an order codes its rows with. Only shown; nothing is stored.${range}${itemCode ? ` The item’s own code is ${itemCode}.` : ''}`;
}
