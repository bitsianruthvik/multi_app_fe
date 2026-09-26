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

/** One entry of the PUT. `null` clears the value. */
export interface ValueWrite { recordId: number; specCode: string; value: string | null }

export interface SaveValuesResult {
  applied: boolean;
  dryRun: boolean;
  summary: { sentence: string; given: number; changed: number; derived: number; records: number; rowsWritten: number; historyRows: number };
  changes: { recordId: number; code: string | null; specCode: string; change: 'set' | 'changed' | 'cleared' }[];
  view: ValuesView;
}

/**
 * The grants the PUT accepts — either one (routes/orderValues.js). The order's
 * own people hold the orders grant; the catalog grant is what the structure
 * tree's value editor asks today.
 */
export const VALUES_WRITE_PERMISSIONS = ['cf_erp_orders_manage', 'cf_erp_catalog_manage'] as const;

/** Pending edits: record id -> spec code -> the text typed. One object per row, so an untouched row keeps its identity. */
export type Edits = Record<number, Record<string, string>>;

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
  const typeable = rule === 'entered' || rule === 'defaulted';
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

/** A typed value as words, where it is shown rather than edited (a shared record, a locked line). */
export function formatInput(col: ValuesColumn, input: string, options: SpecOption[] | undefined): string {
  if (input === '') return '';
  switch (col.dataType) {
    case 'option': {
      const o = options?.find((x) => String(x.id) === input);
      return o ? (o.label || o.value) : input;
    }
    case 'boolean': return input === 'true' ? 'Yes' : input === 'false' ? 'No' : input;
    case 'number': return col.unit ? `${input} ${col.unit}` : input;
    default: return input;
  }
}

/** How the backend names a record in a sentence (orderValuesService.labelOf). */
export const labelOfRow = (row: ValuesRow) => row.code ?? `${row.name} (#${row.id})`;

/** The rule, in the words a column header can carry. */
export const RULE_LABEL: Record<ValueRule, string> = {
  entered: 'Typed',
  defaulted: 'Default',
  fixed: 'Fixed',
  calculated: 'Calculated',
  rollup: 'Roll-up',
  inherited: 'Inherited',
};

export function countEdits(edits: Edits): number {
  let n = 0;
  for (const row of Object.values(edits)) n += Object.keys(row).length;
  return n;
}

export function writesOf(edits: Edits): ValueWrite[] {
  const out: ValueWrite[] = [];
  for (const [recordId, row] of Object.entries(edits)) {
    for (const [specCode, text] of Object.entries(row)) {
      const value = text.trim();
      out.push({ recordId: Number(recordId), specCode, value: value === '' ? null : value });
    }
  }
  return out;
}

/** Problems from a refused save, placed on the cells and rows they name. */
export interface PlacedProblems {
  cells: Record<number, Record<string, string>>;
  rows: Record<number, string>;
  /** Named nothing on screen — shown only in the list. */
  loose: number;
}

/**
 * The backend writes every problem as "LABEL · SPEC: why" (a cell) or
 * "LABEL: why" (a row) — orderValuesService.writeLineValues — so a problem is
 * placed by matching those heads against the rows that were sent. The full
 * list is always shown as well; this only decides which cells turn red.
 */
export function placeProblems(problems: string[], edits: Edits, rowsById: Map<number, ValuesRow>): PlacedProblems {
  const out: PlacedProblems = { cells: {}, rows: {}, loose: 0 };
  const heads: { head: string; recordId: number; code: string | null }[] = [];
  for (const [id, row] of Object.entries(edits)) {
    const r = rowsById.get(Number(id));
    if (!r) continue;
    const label = labelOfRow(r);
    for (const code of Object.keys(row)) heads.push({ head: `${label} · ${code}:`, recordId: r.id, code });
    heads.push({ head: `${label}:`, recordId: r.id, code: null });
    heads.push({ head: `Record #${r.id} `, recordId: r.id, code: null });
  }
  for (const p of problems) {
    const hit = heads.find((h) => p.startsWith(h.head));
    if (!hit) { out.loose += 1; continue; }
    if (hit.code) (out.cells[hit.recordId] ??= {})[hit.code] = p;
    else out.rows[hit.recordId] = p;
  }
  return out;
}

// ── the unsaved draft, per viewer, so a switch of tab does not lose typing ──

const draftKey = (lineId: number) => `cf_erp.values.draft.${lineId}`;

export function readDraft(lineId: number): Edits | null {
  try {
    const raw = window.sessionStorage.getItem(draftKey(lineId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Edits : null;
  } catch {
    return null;
  }
}

export function writeDraft(lineId: number, edits: Edits) {
  try {
    if (countEdits(edits)) window.sessionStorage.setItem(draftKey(lineId), JSON.stringify(edits));
    else window.sessionStorage.removeItem(draftKey(lineId));
  } catch {
    /* storage can be off (private window, blocked site data); the draft is a convenience */
  }
}

/**
 * A stored draft, kept only where it still means something: a cell that is
 * still typed here, and a value that still differs from what is saved.
 */
export function usableDraft(view: ValuesView, draft: Edits, canEdit: boolean): Edits {
  const out: Edits = {};
  for (const g of view.groups) {
    for (const row of g.rows) {
      const typed = draft[row.id];
      if (!typed) continue;
      for (const col of g.columns) {
        const text = typed[col.code];
        const cell = row.cells[col.code];
        if (text === undefined || !cell) continue;
        const c = effectiveCell(view, col, row, cell, canEdit);
        if (!c.editable || text === c.input) continue;
        (out[row.id] ??= {})[col.code] = text;
      }
    }
  }
  return out;
}
