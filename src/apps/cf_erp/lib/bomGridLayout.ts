/**
 * The order grid's layout rules, out of BomGrid so they can be run without a
 * browser: which columns there are, which of them a row shows and in what
 * order, and the text a cell shows for a value read from the line's values view.
 *
 * The order-line Excel is "the BOM as seen on screen", so the backend mirrors
 * these rules (multi_app_be/apps/cf_erp/lib/orderSheetLayout.js) and
 * scripts/cf_erp_order_sheet_layout_test.mjs runs both over one fixture and
 * compares them. Change a rule here and that test fails until the sheet follows.
 */
import { effectiveCell, type EffectiveCell, type ValuesColumn, type ValuesRow, type ValuesView } from '../components/Values/valuesModel';
import { DIMENSION_CODES, dimensionsFirst, hiddenOnGrid, isDimension, rollupsLast, shipUnitRelevant, totalAdds } from './stripLayout';

export interface GridColumn { code: string; name: string; unit?: string | null; dataType?: string }
export interface ViewRecord { row: ValuesRow; columns: Map<string, ValuesColumn> }

/**
 * LINKED COPIES ("same design"). On screen a linked row carries a link chip; the order-line Excel
 * says the same in words, in one grey cell at the END of the row's fields: "Same as". Its text is
 * the twin of the backend's orderSheetLayout.sameAsText — keep the two word for word:
 * how many other rows are the same design, and the first three by the code they show
 * ("2 others: L(2)-1-TFL1, L(3)-1-TFL1"; past three, "+2 more"). '' for a row that is not linked —
 * a suggestion or a row kept apart is not a link, and the sheet says nothing of it.
 */
export const SAME = '$same';
export const SAME_LABEL = 'Same as';
export const SAME_LISTED = 3;
export interface LinksBlockLike {
  rows?: Record<string, { g?: string; n?: number; same?: number[]; apart?: boolean } | undefined>;
  groups?: Record<string, number[] | undefined>;
}
export function sameAsText(links: LinksBlockLike | null | undefined, recordId: number, shownOf: (recordId: number) => string | null | undefined): string {
  const mine = links?.rows?.[String(recordId)];
  const members = mine?.g ? links?.groups?.[mine.g] ?? [] : [];
  const others = members.filter((id) => Number(id) !== Number(recordId));
  if (!others.length) return '';
  const named = others.slice(0, SAME_LISTED).map((id) => String(shownOf(Number(id)) ?? '').trim()).filter(Boolean);
  const more = others.length - named.length;
  const head = `${others.length} ${others.length === 1 ? 'other' : 'others'}`;
  return named.length ? `${head}: ${named.join(', ')}${more > 0 ? ` +${more} more` : ''}` : head;
}

/** Every column of the values view (a column some group may type is typeable), and each record's own row and columns. */
export function viewCatalog(view: ValuesView | null): { cols: Map<string, ValuesColumn>; records: Map<number, ViewRecord> } {
  const cols = new Map<string, ValuesColumn>();
  const records = new Map<number, ViewRecord>();
  for (const group of view?.groups ?? []) {
    for (const col of group.columns) {
      const old = cols.get(col.code);
      cols.set(col.code, old ? { ...old, editable: old.editable || col.editable } : col);
    }
    const columns = new Map(group.columns.map((c) => [c.code, c]));
    for (const row of group.rows) records.set(row.id, { row, columns });
  }
  return { cols, records };
}

/** The columns in grid order: what somebody may type first, each half in the order it arrived. */
export function sortColumns(cols: Map<string, ValuesColumn>): ValuesColumn[] {
  return [...cols.values()].sort((a, b) => Number(b.editable) - Number(a.editable));
}

/** Whether a record has this value at all, by the values view. */
export function viewUses(records: Map<number, ViewRecord>, recordId: number, code: string): boolean {
  const info = records.get(recordId);
  return !!info?.columns.get(code) && !!info.row.cells[code];
}

/**
 * The value columns drawn: the dimensions lead (Thk · L · W) and come as a set
 * — if any column in use is one of them, all three are there — then the rest.
 */
export function shownColumns(all: readonly ValuesColumn[], used: readonly ValuesColumn[]): GridColumn[] {
  const byCode = new Map(all.map((c) => [c.code, c]));
  const dims: GridColumn[] = used.some((c) => isDimension(c.code))
    ? DIMENSION_CODES.map((code) => byCode.get(code) ?? { code, name: code.charAt(0) + code.slice(1).toLowerCase(), unit: 'mm', dataType: 'number' })
    : [];
  return [...dims, ...used.filter((c) => !isDimension(c.code))];
}

/**
 * Strip layout: one row's own cells — quantity and total, then its values with
 * the dimensions first and the roll-ups last.
 *   uses(code)     the row has that value
 *   inputOf(code)  what the cell holds as typed (SHIP_UNIT shows once answered)
 *   missing(code)  required and still empty (a gap brings a hidden value back)
 */
export function rowColumnCodes(
  shown: readonly GridColumn[], row: { quantity: number; total: number; hasChildren: boolean },
  uses: (code: string) => boolean, inputOf: (code: string) => string, missing: (code: string) => boolean,
): string[] {
  const own = shown.filter((c) => uses(c.code) && (c.code !== 'SHIP_UNIT' || shipUnitRelevant(row.hasChildren, inputOf(c.code), missing(c.code))) && !hiddenOnGrid(c.code, missing(c.code))).map((c) => c.code);
  return ['$quantity', ...(totalAdds(row.quantity, row.total) ? ['$total'] : []), ...rollupsLast(dimensionsFirst(own))];
}

export interface ViewCell {
  text: string; input: string; saved: string; editable: boolean; type: string;
  options: EffectiveCell['options']; cell: EffectiveCell;
}

/**
 * A value cell read from the values view: null when the record does not have
 * the value. `pending` is what is typed and not saved yet.
 */
export function viewCell(view: ValuesView, info: ViewRecord | undefined, code: string, canEdit: boolean, pending?: string): ViewCell | null {
  const actual = info?.columns.get(code), raw = info?.row.cells[code];
  if (!info || !actual || !raw) return null;
  const c = effectiveCell(view, actual, info.row, raw, canEdit);
  const input = pending ?? c.input;
  // (A number typed over a calculated value, emptied and not saved yet: the calculated value shows at once — it is what the save brings back.)
  const text = input === '' ? c.defaultDisplay ?? c.display ?? (pending !== undefined ? c.calculated : null) ?? ''
    : actual.dataType === 'option' ? c.options?.find((o) => String(o.id) === input)?.label || c.options?.find((o) => String(o.id) === input)?.value || input
      : actual.dataType === 'boolean' ? input === 'true' ? 'Yes' : 'No' : input;
  return { text, input, saved: c.input, editable: c.editable, type: actual.dataType, options: c.options, cell: c };
}
