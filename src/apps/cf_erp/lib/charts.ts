/**
 * Pure helpers for the charts on a machine type / machine. A chart is a table
 * of rows: any number of INPUT columns (a specification of the piece, or a tree
 * level) and one RESULT. Here: headings that carry their units, the short
 * formula name, the preview shape, the rows editor's text <-> rows conversion
 * (including a paste from Excel), and the checks the add / edit dialog makes
 * before it asks the server.
 */
import type { Chart, ChartAxis, ChartCell, ChartInputSpec, ChartLevel, ChartMode, ChartRow } from '../api/charts';

/** "Thickness (mm)"; no unit, no brackets. */
export const withUnit = (label: string, unit: string | null | undefined) => (unit && unit.trim() ? `${label} (${unit.trim()})` : label);

export const axisHeading = (a: Pick<ChartAxis, 'label' | 'unit'>) => withUnit(a.label, a.unit);
export const resultHeading = (c: Pick<Chart, 'name' | 'resultUnit'>) => withUnit(c.name, c.resultUnit);

/** "Thickness (mm) · Grade · Family → Drill time (s)". */
export function chartHeadingLine(c: Pick<Chart, 'name' | 'resultUnit' | 'axes'>): string {
  return `${c.axes.map(axisHeading).join(' · ')} → ${resultHeading(c)}`;
}

/** "by Thickness (mm), Grade, Family". */
export const byText = (axes: Pick<ChartAxis, 'label' | 'unit'>[]) => `by ${axes.map(axisHeading).join(', ')}`;

export const modeText = (m: ChartMode) => (m === 'linear' ? 'Between rows: worked out on a straight line along every number column' : 'Between rows: steps up to the next row');

/** How a time formula names the chart: the bare name, else the LOOKUP it stands for. */
export const formulaNameText = (c: Pick<Chart, 'shortForm' | 'code'>) => c.shortForm ?? `LOOKUP(machine.${c.code}, …)`;

/* ===========================================================================
 * Rows
 * ======================================================================== */

const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));
export const cellText = (n: number | null | undefined) => (n == null ? '—' : num(n));

/** The chart's rows, from the new shape or (for a moment) an older { x, v } / { x, y, v } value. */
export function chartRows(c: Pick<Chart, 'rows' | 'value'>): ChartRow[] | null {
  if (c.rows) return c.rows;
  const v = c.value as { rows?: ChartRow[]; x?: number[]; y?: number[]; v?: unknown } | null;
  if (!v) return null;
  if (Array.isArray(v.rows)) return v.rows;
  if (Array.isArray(v.x)) {
    if (Array.isArray(v.y)) {
      const grid = v.v as (number | null)[][];
      const out: ChartRow[] = [];
      v.x.forEach((x, i) => v.y!.forEach((y, j) => out.push([x, y, grid[j]?.[i] ?? null])));
      return out;
    }
    const col = v.v as (number | null)[];
    return v.x.map((x, i) => [x, col[i] ?? null]);
  }
  return null;
}

type Nodes = Chart['nodes'];

/** What a cell reads as: a node's name, a number tidied, text as it is. */
export function cellDisplay(axis: ChartAxis | null, cell: ChartCell | undefined, nodes: Nodes | undefined): string {
  if (cell == null || cell === '') return '—';
  if (axis?.kind === 'level') return nodes?.[Number(cell)]?.name ?? String(cell);
  if (typeof cell === 'number') return num(cell);
  return String(cell);
}

export interface PreviewTable {
  /** One heading per input and the result last. */
  headings: string[];
  /** Cells as shown. */
  rows: string[][];
  /** Which columns are numbers (they line up on the right). */
  numeric: boolean[];
  more: number;
}

/** The preview table of a chart: the first rows, every heading with its unit. */
export function previewTable(c: Pick<Chart, 'name' | 'resultUnit' | 'axes' | 'rows' | 'value' | 'nodes'>, limit = 8): PreviewTable | null {
  const all = chartRows(c);
  if (!all || !all.length) return null;
  const shown = all.slice(0, limit);
  return {
    headings: [...c.axes.map(axisHeading), resultHeading(c)],
    numeric: [...c.axes.map((a) => a.kind === 'spec' && a.dataType === 'number'), true],
    rows: shown.map((r) => [...c.axes.map((a, i) => cellDisplay(a, r[i], c.nodes)), cellDisplay(null, r[c.axes.length], c.nodes)]),
    more: Math.max(0, all.length - shown.length),
  };
}

/** Where the shown values come from, in words. */
export function valueSourceText(c: Pick<Chart, 'rows' | 'value' | 'own' | 'valueFrom'>, subject: 'classification' | 'machine'): string {
  if (!chartRows(c)) return 'No values yet';
  if (c.own) return subject === 'machine' ? 'This machine’s own chart' : 'Set on this machine type';
  const f = c.valueFrom;
  if (!f) return 'Values set elsewhere';
  return `From ${f.name} (${f.type === 'machine' ? 'machine' : 'machine type'})`;
}

/** "12 rows · by Thickness (mm), Grade" for the Specifications tab. */
export function chartSummary(config: { axes?: Pick<ChartAxis, 'label' | 'unit'>[] } | null | undefined, value: unknown): string {
  const rows = chartRows({ rows: null, value: value as Chart['value'] });
  if (!rows || !rows.length) return 'No chart set yet';
  const by = config?.axes?.length ? ` · ${byText(config.axes)}` : '';
  return `${rows.length} row${rows.length === 1 ? '' : 's'}${by}`;
}

/** A table specification of the new kind: a chart of rows, not the old x / v grid. */
export const isRowsChart = (config: { version?: number } | null | undefined) => (config?.version ?? 1) >= 2;

/* ===========================================================================
 * The rows editor: text cells <-> rows
 * ======================================================================== */

export interface LevelNode { id: number; code: string; name: string }
export interface OptionChoice { value: string; label: string | null }
export interface EditorLookups {
  /** Tree nodes by the level a cell asks for. */
  levels: Record<ChartLevel, LevelNode[]>;
  /** Choices of each pick-list specification, by its code. */
  options: Record<string, OptionChoice[]>;
}
export const LEVEL_DEPTH: Record<ChartLevel, number> = { FAMILY: 0, SUBFAMILY: 1, VARIANT: 2 };
export const LEVEL_LABEL: Record<ChartLevel, 'Family' | 'Subfamily' | 'Variant'> = { FAMILY: 'Family', SUBFAMILY: 'Subfamily', VARIANT: 'Variant' };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Rows as the editor holds them: every cell is text; a level cell holds a node id. */
export function rowsToDraft(rows: ChartRow[] | null): string[][] {
  return (rows ?? []).map((r) => r.map((c) => (c == null ? '' : String(c))));
}

/** Sorts by the inputs left to right: numbers as numbers, the rest by what they read as. */
export function sortDraft(axes: ChartAxis[], draft: string[][], nameOf: (axis: ChartAxis, text: string) => string): string[][] {
  return [...draft].sort((a, b) => {
    for (let i = 0; i < axes.length; i++) {
      const ax = axes[i];
      if (ax.kind === 'spec' && ax.dataType === 'number') {
        const x = a[i] === '' ? Infinity : Number(a[i]);
        const y = b[i] === '' ? Infinity : Number(b[i]);
        if (x !== y) return x < y ? -1 : 1;
      } else {
        const c = nameOf(ax, a[i] ?? '').localeCompare(nameOf(ax, b[i] ?? ''), undefined, { numeric: true, sensitivity: 'base' });
        if (c) return c;
      }
    }
    return 0;
  });
}

/** A level cell's text as a node: its id, else its name or code at that level. */
export function resolveLevel(text: string, nodes: LevelNode[]): LevelNode | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) { const byId = nodes.find((n) => n.id === Number(t)); if (byId) return byId; }
  return nodes.find((n) => same(n.name, t)) ?? nodes.find((n) => same(n.code, t)) ?? null;
}

/** An option cell's text as the option's value, when it is a value or a label of the list. */
export function resolveOption(text: string, choices: OptionChoice[]): string | null {
  const t = text.trim();
  if (!t) return null;
  return (choices.find((o) => same(o.value, t)) ?? choices.find((o) => o.label && same(o.label, t)))?.value ?? null;
}

/**
 * The editor's text cells as rows to send. A row left entirely blank is dropped. What cannot
 * be a number is reported; names the server maps (level, option) are sent as typed when we
 * cannot place them ourselves, so the server's words reach the person.
 */
export function draftToRows(axes: ChartAxis[], draft: string[][], lookups: EditorLookups): { rows: ChartRow[]; problems: string[] } {
  const rows: ChartRow[] = [];
  const problems: string[] = [];
  draft.forEach((cells, r) => {
    if (cells.every((c) => !c.trim())) return;
    const out: ChartRow = [];
    axes.forEach((a, i) => {
      const t = (cells[i] ?? '').trim();
      if (a.kind === 'level') {
        const node = resolveLevel(t, lookups.levels[a.level] ?? []);
        out.push(node ? node.id : t === '' ? null : t);
        if (!t) problems.push(`Row ${r + 1}: pick a ${a.label.toLowerCase()}.`);
      } else if (a.dataType === 'number') {
        const n = Number(t);
        if (!t || !Number.isFinite(n)) { problems.push(`Row ${r + 1}: ${a.label} needs a number.`); out.push(null); } else out.push(n);
      } else if (a.dataType === 'option') {
        if (!t) problems.push(`Row ${r + 1}: pick a ${a.label}.`);
        out.push(t ? resolveOption(t, lookups.options[a.field] ?? []) ?? t : null);
      } else {
        if (!t) problems.push(`Row ${r + 1}: ${a.label} is empty.`);
        out.push(t || null);
      }
    });
    const res = (cells[axes.length] ?? '').trim();
    if (res === '') out.push(null);
    else if (!Number.isFinite(Number(res))) { problems.push(`Row ${r + 1}: the result needs a number, or leave it empty for “cannot”.`); out.push(null); } else out.push(Number(res));
    rows.push(out);
  });
  return { rows, problems };
}

/**
 * A block pasted from Excel: one row per line, tab-separated, one cell per input and the result.
 * A header line (its result is words) is skipped. Names stay as typed; the server maps them.
 */
export function parsePastedRows(text: string, columns: number): { rows: string[][] } | { error: string } {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  if (!lines.length) return { error: 'Nothing to paste. Copy the cells in Excel first.' };
  let split = lines.map((l) => l.split('\t').map((c) => c.trim()));
  const first = split[0];
  if (first.length === columns && first[columns - 1] !== '' && !Number.isFinite(Number(first[columns - 1]))) split = split.slice(1);
  if (!split.length) return { error: 'Only a heading line came through. Copy the rows too.' };
  const bad = split.findIndex((r) => r.length !== columns);
  if (bad >= 0) return { error: `Line ${bad + 1} has ${split[bad].length} column${split[bad].length === 1 ? '' : 's'}; this chart has ${columns} (${columns - 1} input${columns - 1 === 1 ? '' : 's'} and the result).` };
  return { rows: split };
}

/* ===========================================================================
 * The add / edit dialog
 * ======================================================================== */

/** A name as a formula would write it: upper snake case. A preview only; the server decides. */
export const shortNameGuess = (name: string) => name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** One input as the dialog holds it. */
export type InputForm =
  | { kind: 'spec'; code: string; name: string; dataType: 'number' | 'option' | 'text'; specUnit: string; unit: string }
  | { kind: 'level'; level: ChartLevel };

export function inputFromAxis(a: ChartAxis): InputForm {
  return a.kind === 'level'
    ? { kind: 'level', level: a.level }
    : { kind: 'spec', code: a.field, name: a.label, dataType: a.dataType, specUnit: a.unit ?? '', unit: '' };
}

export function inputHeading(i: InputForm): string {
  return i.kind === 'level' ? LEVEL_LABEL[i.level] : withUnit(i.name, i.dataType === 'number' ? i.specUnit || i.unit : null);
}

export interface ChartForm { name: string; resultUnit: string; mode: ChartMode; inputs: InputForm[] }

/** Straight lines run along number inputs — every one of them at once, wherever they sit; words and tree levels make groups. */
export const canLinear = (f: Pick<ChartForm, 'inputs'>) => f.inputs.some((c) => c.kind === 'spec' && c.dataType === 'number');
export const effectiveMode = (f: ChartForm): ChartMode => (f.mode === 'linear' && canLinear(f) ? 'linear' : 'step_up');

/** The heading line the dialog previews while it is being filled. */
export function formHeadingLine(f: ChartForm): string {
  const ins = f.inputs.length ? f.inputs.map(inputHeading).join(' · ') : 'Add an input';
  return `${ins} → ${withUnit(f.name.trim() || 'What it gives', f.resultUnit)}`;
}

/** Problems in words, in the order the form reads. Empty = ready to send. */
export function formProblems(f: ChartForm): string[] {
  const out: string[] = [];
  if (!f.name.trim()) out.push('Give the result a name, e.g. Drill time.');
  if (!f.resultUnit.trim()) out.push('Say what unit it gives, e.g. s or mm/min.');
  if (!f.inputs.length) out.push('Add at least one input: a specification of the piece, or Family, Subfamily or Variant.');
  const seen = new Set<string>();
  f.inputs.forEach((c, i) => {
    const n = i + 1;
    const key = c.kind === 'level' ? `level:${c.level}` : `spec:${c.code}`;
    if (c.kind === 'spec') {
      if (!c.code) { out.push(`Input ${n}: pick a specification.`); return; }
    }
    if (seen.has(key)) out.push(`Input ${n}: ${inputHeading(c).replace(/ \(.*\)$/, '')} is already an input.`);
    seen.add(key);
  });
  return out;
}

/** The inputs as the server takes them. */
export function inputsPayload(f: ChartForm): ChartInputSpec[] {
  return f.inputs.map((c) => (c.kind === 'level'
    ? { level: c.level }
    : c.dataType === 'number' && !c.specUnit ? { field: c.code, unit: c.unit.trim() } : { field: c.code }));
}

/** Moves item `i` by `by` places; a copy. */
export function moved<T>(list: T[], i: number, by: -1 | 1): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Charts a time formula can write by a bare name: the new kind always; the old kind when every column names a piece's value. */
export const boundCharts = <T extends { tableConfig?: { version?: number; axes?: { field?: unknown; kind?: string }[] } | null }>(fields: T[]) =>
  fields.filter((f) => !!f.tableConfig?.axes?.length && ((f.tableConfig.version ?? 1) >= 2 || f.tableConfig.axes.every((a) => !!a.field)));

/** The column an input will become, for the rows editor before the chart exists. */
export function inputAxis(i: InputForm): ChartAxis {
  return i.kind === 'level'
    ? { kind: 'level', level: i.level, label: LEVEL_LABEL[i.level], unit: null, dataType: 'level' }
    : { kind: 'spec', field: i.code, label: i.name, unit: i.dataType === 'number' ? (i.specUnit || i.unit.trim() || null) : null, dataType: i.dataType };
}
