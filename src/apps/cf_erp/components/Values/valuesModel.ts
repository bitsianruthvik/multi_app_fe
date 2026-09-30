import type { DataType, Kind, OrderStatus, RecordStatus, SpecOption, ValueRule } from '../../api/types';
/**
 * The Values stage's data: `GET /order-lines/:id/values` and what
 * `PUT /order-lines/:id/values` answers (apps/cf_erp/services/orderValuesService.js).
 *
 * The view is compact on purpose — the backend sends JSON uncompressed and a
 * bridge is ~220 rows of ~11 values — so what a whole column shares (its rule,
 * whether it is required, why it is not typed, its option list) sits on the
 * column, and a cell carries a field only when it differs or says something.
 * `effectiveCell` puts the two back together; nothing else should read a
 * column default straight off a cell.
 */

export interface ValuesColumn {
  code: string;
  name: string;
  dataType: DataType;
  unit: string | null;
  decimals: number | null;
  rule: ValueRule;
  required: boolean;
  /** Why the column is not typed here, when that is the same for every row. */
  why?: string | null;
  /** Key into `optionLists`, for an option spec. */
  options?: string | null;
  /** Some row of the group may type it. */
  editable: boolean;
}

export interface ValuesCell {
  /** The record's OWN typed value, as an input edits it (an option's id). */
  input?: string;
  /** The value in words, for a value that is not typed here. */
  display?: string;
  /** A Defaulted rule's default, shown while nothing is typed. */
  defaultDisplay?: string;
  missing?: boolean;
  rule?: ValueRule;
  required?: boolean;
  why?: string | null;
  problem?: string;
  note?: string;
  options?: string | null;
}

export interface ValuesRow {
  id: number;
  code: string | null;
  name: string;
  kind: Kind;
  status: RecordStatus;
  depth: number;
  /** The parent it is shown under — the first place the tree meets it. */
  parent: { id: number; code: string | null; name: string } | null;
  /** How many BOM lines hold it (a cut plate several parts are cut from has more than one). */
  places: number;
  lineNo: number | null;
  position: number | null;
  quantity: number;
  missing: number;
  /** Why no value on this row can be typed here — a shared record, a frozen one. */
  readOnly?: string;
  cells: Record<string, ValuesCell>;
}

export interface ValuesGroup {
  key: string;
  /** The order's own temporary items, or shared records under them. */
  own: boolean;
  classification: { id: number | null; code: string | null; name: string; path: string };
  columns: ValuesColumn[];
  rows: ValuesRow[];
}

export interface ValuesView {
  line: { id: number; lineNo: number; lineType: 'standard' | 'custom'; quantity: number };
  order: { id: number; code: string; status: OrderStatus };
  root: { id: number; code: string | null; name: string };
  /** False when the order is closed, lost or cancelled, or the line is released. */
  editable: boolean;
  lock: { reason: 'closed' | 'released'; message: string } | null;
  truncated: boolean;
  counts: {
    rows: number; own: number; shared: number; missingOwn: number; missingShared: number;
    rowsMissing: number; unresolved: number; noValues: number;
  };
  optionLists: Record<string, SpecOption[]>;
  groups: ValuesGroup[];
}

/** A cell with its column's shared fields put back, and whether it can be typed right now. */
export interface EffectiveCell {
  rule: ValueRule;
  required: boolean;
  why: string | null;
  options: SpecOption[] | undefined;
  input: string;
  display: string | null;
  defaultDisplay: string | null;
  missing: boolean;
  problem: string | null;
  note: string | null;
  /** entered or defaulted — what valueService.setValues lets a person type. */
  typeable: boolean;
  editable: boolean;
}

const pick = <K extends keyof ValuesCell & keyof ValuesColumn>(cell: ValuesCell, col: ValuesColumn, key: K) =>
  (key in cell ? cell[key] : col[key]) as ValuesColumn[K];

export function effectiveCell(view: ValuesView, col: ValuesColumn, row: ValuesRow, cell: ValuesCell, canEdit: boolean): EffectiveCell {
  const rule = pick(cell, col, 'rule') as ValueRule;
  const optionsKey = pick(cell, col, 'options');
  // A table is never typed into a grid cell here, whatever its rule — it opens
  // its own dialog (orderValuesService refuses a write of one from this stage).
  const typeable = col.dataType !== 'table' && (rule === 'entered' || rule === 'defaulted');
  return {
    rule,
    required: !!pick(cell, col, 'required'),
    why: (pick(cell, col, 'why') as string | null | undefined) ?? null,
    options: optionsKey ? view.optionLists[optionsKey] : undefined,
    input: cell.input ?? '',
    display: cell.display ?? null,
    defaultDisplay: cell.defaultDisplay ?? null,
    missing: !!cell.missing,
    problem: cell.problem ?? null,
    note: cell.note ?? null,
    typeable,
    editable: canEdit && view.editable && !row.readOnly && typeable,
  };
}

/**
 * Is it still a gap, with what is typed but not saved taken into account?
 * The server's answer until the cell is touched; after that, a required typed
 * value with nothing in it and no default to fall back on.
 */
export function stillMissing(c: EffectiveCell, pending: string | undefined): boolean {
  if (pending === undefined) return c.missing;
  return c.required && c.typeable && pending.trim() === '' && !c.defaultDisplay;
}


// ── the gaps, for the Values stage's view of the Structure tree ──

/** Spec codes still missing on each of the order's own records: the server's answer, with what is typed but unsaved laid over it. */
export function computeGaps(
  view: ValuesView | null, typed: Record<number, Record<string, string>> | undefined, only?: ReadonlySet<number>,
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  if (!view) return out;
  for (const g of view.groups) {
    if (!g.own) continue;
    for (const row of g.rows) {
      if (only && !only.has(row.id)) continue;
      for (const col of g.columns) {
        const cell = row.cells[col.code];
        if (!cell) continue;
        if (stillMissing(effectiveCell(view, col, row, cell, true), typed?.[row.id]?.[col.code])) {
          const list = out.get(row.id);
          if (list) list.push(col.code); else out.set(row.id, [col.code]);
        }
      }
    }
  }
  return out;
}

/** "N values missing · M rows", or the all-clear. */
export function gapSentence(gaps: ReadonlyMap<number, string[]>): string {
  let n = 0;
  for (const list of gaps.values()) n += list.length;
  if (n === 0) return 'Every required value is filled';
  return `${n} ${n === 1 ? 'value' : 'values'} missing · ${gaps.size} ${gaps.size === 1 ? 'row' : 'rows'}`;
}

/**
 * The rows that hold a gap, and every row above them — so the tree still reads.
 * `rows` are in tree order; a row's parent is found by key.
 */
export function keepGapRows<R extends { node: { id: number; key: string }; parent: { key: string } | null }>(
  rows: R[], gapIds: ReadonlySet<number>,
): R[] {
  const parentOf = new Map(rows.map((r) => [r.node.key, r.parent?.key ?? null]));
  const keep = new Set<string>();
  for (const r of rows) {
    if (!gapIds.has(r.node.id)) continue;
    for (let k: string | null = r.node.key; k && !keep.has(k); k = parentOf.get(k) ?? null) keep.add(k);
  }
  return rows.filter((r) => keep.has(r.node.key));
}
