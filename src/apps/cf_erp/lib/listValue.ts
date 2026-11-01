/**
 * A LIST VALUE (user, 2026-11-01: "a linked array store"): rows of named columns held on one piece — HOLE_SET is
 * [{ DIA: 22, COUNT: 12, KIND: 'drilled' }, { DIA: 26, COUNT: 4, KIND: 'countersunk', DEPTH: 40 }]. The spec's
 * table_config says the columns. The server's rules are multi_app_be/apps/cf_erp/lib/listSpec.js; this mirrors what a
 * screen needs: the summary in words, the rows as a form edits them, and the same checks before a save (the server
 * checks again). Pure.
 */

export interface ListColumn {
  code: string;
  name: string;
  kind: 'number' | 'word';
  unit?: string;
  /** the words a 'word' column takes */
  options?: string[];
  required?: boolean;
  /** a whole number */
  integer?: boolean;
  /** what an empty cell means, in words ("the part's thickness") — shown, never stored */
  blank?: string;
}
export type ListRow = Record<string, number | string>;
/** A row as the form holds it: every cell a string. */
export type DraftRow = Record<string, string>;

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** The columns of a list spec's table_config, codes upper case; [] when it has none. */
export function listColumns(config: { columns?: unknown } | null | undefined): ListColumn[] {
  const cols = config?.columns;
  if (!Array.isArray(cols)) return [];
  return cols.filter((c) => c && typeof c === 'object').map((c: Record<string, unknown>) => ({
    ...(c as object),
    code: String(c.code ?? '').toUpperCase(),
    name: String(c.name ?? c.code ?? ''),
    kind: c.kind === 'word' ? 'word' : 'number',
  } as ListColumn));
}

/** Is this raw value a list (an array of rows)? */
export const isListValue = (raw: unknown): raw is ListRow[] => Array.isArray(raw) && raw.every((r) => r !== null && typeof r === 'object' && !Array.isArray(r));

/** A list carried as input text (JSON) → its rows; null when the text is empty or not a list. */
export function parseList(text: string | null | undefined): ListRow[] | null {
  if (text == null || String(text).trim() === '') return null;
  try {
    const v = JSON.parse(String(text));
    return isListValue(v) ? v : null;
  } catch { return null; }
}

/**
 * A list in a few words, the server's listSummary: "12 × Ø22 · 4 × Ø26 countersunk (40 deep)" for a hole set (a list
 * with DIA and COUNT), "3 rows" otherwise, "none" for an empty list. Read from the rows' own keys when the columns are
 * not at hand.
 */
export function listSummary(rows: ListRow[] | null | undefined, columns?: ListColumn[] | null): string | null {
  if (!Array.isArray(rows)) return null;
  if (!rows.length) return 'none';
  const has = (c: string) => (columns?.length ? columns.some((x) => x.code === c) : rows.some((r) => c in r));
  if (has('DIA') && has('COUNT')) {
    return rows.map((r) => `${r.COUNT ?? '?'} × Ø${r.DIA ?? '?'}${r.KIND && r.KIND !== 'drilled' ? ` ${r.KIND}` : ''}${r.DEPTH != null ? ` (${r.DEPTH} deep)` : ''}`).join(' · ');
  }
  return `${rows.length} row${rows.length === 1 ? '' : 's'}`;
}

/** Whether two lists say the same (rows in order, cells by value). */
export function sameList(a: ListRow[] | null | undefined, b: ListRow[] | null | undefined): boolean {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((r, i) => {
    const s = b[i] ?? {};
    const keys = new Set([...Object.keys(r ?? {}), ...Object.keys(s)]);
    return [...keys].every((k) => {
      const x = r?.[k] ?? null, y = s[k] ?? null;
      return x === y || (typeof x === 'number' && typeof y === 'number' && Math.abs(x - y) < 1e-6);
    });
  });
}

/** Rows → the form's rows (strings). */
export const toDraft = (rows: ListRow[] | null | undefined, columns: ListColumn[]): DraftRow[] =>
  (rows ?? []).map((r) => Object.fromEntries(columns.map((c) => [c.code, r[c.code] == null ? '' : String(r[c.code])])));

/** An empty form row. */
export const blankRow = (columns: ListColumn[]): DraftRow => Object.fromEntries(columns.map((c) => [c.code, '']));

/**
 * The form's rows → the list to save, checked the way the server checks it (lib/listSpec.checkListValue): wholly empty
 * rows dropped, required cells filled, numbers numbers (not below 0, whole where asked), words one of the options.
 * → { rows } | { problem, row?, code? }.
 */
export function fromDraft(draft: DraftRow[], columns: ListColumn[]): { rows: ListRow[] } | { problem: string; row?: number; code?: string } {
  const rows: ListRow[] = [];
  for (const [i, d] of draft.entries()) {
    if (columns.every((c) => isBlank(d[c.code]))) continue;
    const row: ListRow = {};
    for (const c of columns) {
      const v = d[c.code];
      const at = { row: i, code: c.code };
      if (isBlank(v)) {
        if (c.required) return { problem: `Row ${i + 1}: ${c.name} is needed.`, ...at };
        continue;
      }
      if (c.kind === 'number') {
        const n = Number(String(v).trim());
        if (!Number.isFinite(n)) return { problem: `Row ${i + 1}: ${c.name} needs a number.`, ...at };
        if (n < 0) return { problem: `Row ${i + 1}: ${c.name} cannot be below 0.`, ...at };
        if (c.integer && !Number.isInteger(n)) return { problem: `Row ${i + 1}: ${c.name} is a whole number.`, ...at };
        row[c.code] = Number(n.toFixed(6));
      } else {
        const w = String(v).trim();
        const hit = c.options?.length ? c.options.find((o) => o.toLowerCase() === w.toLowerCase()) : w;
        if (!hit) return { problem: `Row ${i + 1}: "${w}" is not one of ${c.options!.join(', ')}.`, ...at };
        row[c.code] = hit;
      }
    }
    rows.push(row);
  }
  return { rows };
}

/** A value in words whatever its type — a list's summary, a chart's row count, else the value itself. For exports and messages. */
export function valueWords(raw: unknown, columns?: ListColumn[] | null): string {
  if (raw === null || raw === undefined) return '';
  if (isListValue(raw)) return listSummary(raw, columns) ?? '';
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (typeof raw === 'object') {
    const rows = (raw as { rows?: unknown[]; x?: unknown[] }).rows ?? (raw as { x?: unknown[] }).x;
    return Array.isArray(rows) ? `${rows.length} row${rows.length === 1 ? '' : 's'}` : '';
  }
  return String(raw);
}

/**
 * A list spec's state on one piece, from its resolution (resolutionService): what it holds now, what is typed, and
 * the drawing's (or worked-out) set it stands over or follows.
 *   typed     the piece's own rows, or null when it follows the drawing
 *   drawing   the worked-out set ("from the drawing" or "calculated"), null when there is none
 */
export function listState(s: {
  value: { raw: unknown; display: string | null; source: string } | null;
  derived?: { source: string; calculated?: { raw: unknown; display: string } | null; calculatedFrom?: string; held?: boolean } | null;
}): { current: ListRow[] | null; typed: ListRow[] | null; drawing: { rows: ListRow[]; display: string | null; from: 'drawing' | 'calculated' } | null } {
  const raw = isListValue(s.value?.raw) ? s.value!.raw as ListRow[] : null;
  const d = s.derived ?? null;
  if (d?.source === 'typed') {
    const calc = isListValue(d.calculated?.raw) ? d.calculated!.raw as ListRow[] : null;
    return { current: raw, typed: raw, drawing: calc ? { rows: calc, display: d.calculated?.display ?? null, from: d.calculatedFrom === 'drawing' ? 'drawing' : 'calculated' } : null };
  }
  if (d && raw) return { current: raw, typed: null, drawing: { rows: raw, display: s.value?.display ?? null, from: d.source === 'drawing' ? 'drawing' : 'calculated' } };
  return { current: raw, typed: s.value?.source === 'entered' ? raw : null, drawing: null };
}

/** A list config made from the setup form's column rows (code upper case; empty extras left out). */
export function listConfigOf(columns: (Partial<ListColumn> & { optionsText?: string })[]): { columns: ListColumn[] } {
  return {
    columns: columns.map((c) => {
      const options = (c.optionsText ?? (c.options ?? []).join(', ')).split(',').map((o) => o.trim()).filter(Boolean);
      return {
        code: String(c.code ?? '').trim().toUpperCase(), name: String(c.name ?? '').trim() || String(c.code ?? '').trim().toUpperCase(),
        kind: c.kind === 'word' ? 'word' : 'number',
        ...(c.unit?.trim() ? { unit: c.unit.trim() } : {}),
        ...(c.kind === 'word' && options.length ? { options } : {}),
        ...(c.required ? { required: true } : {}),
        ...(c.kind !== 'word' && c.integer ? { integer: true } : {}),
        ...(c.blank?.trim() ? { blank: c.blank.trim() } : {}),
      };
    }),
  };
}

/** The setup form's problem with a list's columns, or null (the server's checkListConfig). */
export function listConfigProblem(cfg: { columns: ListColumn[] }): string | null {
  if (!cfg.columns.length) return 'A list needs at least one column.';
  const seen = new Set<string>();
  for (const c of cfg.columns) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(c.code)) return `"${c.code || '(empty)'}" is not a column code (letters, digits and _).`;
    if (seen.has(c.code)) return `Column ${c.code} is there twice.`;
    seen.add(c.code);
  }
  return null;
}
