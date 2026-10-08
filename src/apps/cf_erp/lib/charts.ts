/**
 * Pure helpers for the charts on a machine type / machine: headings that carry
 * their units, the short formula name, the grid shape for a preview, and the
 * checks the add / edit dialog makes before it asks the server.
 */
import type { Chart, ChartAxis, ChartInput, ChartMode, ChartValue } from '../api/charts';

/** "Thickness (mm)"; no unit, no brackets. */
export const withUnit = (label: string, unit: string | null | undefined) => (unit && unit.trim() ? `${label} (${unit.trim()})` : label);

export const axisHeading = (a: ChartAxis) => withUnit(a.label, a.unit);
export const resultHeading = (c: Pick<Chart, 'name' | 'resultUnit'>) => withUnit(c.name, c.resultUnit);

/** "Thickness (mm) → Gas cutting speed (mm/min)"; two columns: "Thickness (mm) × Hole diameter (mm) → …". */
export function chartHeadingLine(c: Pick<Chart, 'name' | 'resultUnit' | 'axes'>): string {
  return `${c.axes.map(axisHeading).join(' × ')} → ${resultHeading(c)}`;
}

export const modeText = (m: ChartMode) => (m === 'linear' ? 'Between rows: a straight line' : 'Between rows: steps up to the next row');

/** How a time formula names the chart: the bare name, else the LOOKUP it stands for. */
export const formulaNameText = (c: Pick<Chart, 'shortForm' | 'code'>) => c.shortForm ?? `LOOKUP(machine.${c.code}, …)`;

/** Where the shown values come from, in words. */
export function valueSourceText(c: Chart, subject: 'classification' | 'machine'): string {
  if (!c.value) return 'No values yet';
  if (c.own) return subject === 'machine' ? 'This machine’s own chart' : 'Set on this machine type';
  const f = c.valueFrom;
  if (!f) return 'Values set elsewhere';
  return `From ${f.name} (${f.type === 'machine' ? 'machine' : 'machine type'})`;
}

export interface PreviewGrid {
  /** Heading of the first column (the rows). */
  rowHeading: string;
  /** One column: its heading is the result. Two: the column values go across. */
  columns: { heading: string; key: number }[];
  twoD: boolean;
  /** Shown on top of a two-column grid: what the cells hold. */
  caption: string | null;
  rows: { x: number; cells: (number | null)[] }[];
  more: number;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));
export const cellText = (n: number | null | undefined) => (n == null ? '—' : num(n));

/** The preview table of a chart: rows = first column; a second column's values go across the top (storage is v[col][row]). */
export function previewGrid(c: Pick<Chart, 'name' | 'resultUnit' | 'axes' | 'value'>, limit = 8): PreviewGrid | null {
  const v: ChartValue = c.value;
  if (!v || !v.x.length) return null;
  const rows = v.x.slice(0, limit);
  const more = Math.max(0, v.x.length - rows.length);
  const first = c.axes[0] ? axisHeading(c.axes[0]) : 'Row';
  if ('y' in v) {
    const second = c.axes[1] ? axisHeading(c.axes[1]) : 'Column';
    return {
      rowHeading: `${first} ↓ · ${second} →`, twoD: true, caption: resultHeading(c), more,
      columns: v.y.map((y, j) => ({ heading: num(y), key: j })),
      rows: rows.map((x, i) => ({ x, cells: v.y.map((_, j) => v.v[j]?.[i] ?? null) })),
    };
  }
  return {
    rowHeading: first, twoD: false, caption: null, more,
    columns: [{ heading: resultHeading(c), key: 0 }],
    rows: rows.map((x, i) => ({ x, cells: [v.v[i] ?? null] })),
  };
}

/** A name as a formula would write it: upper snake case. A preview only; the server decides. */
export const shortNameGuess = (name: string) => name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** A column as the dialog holds it. */
export interface ColumnForm { kind: 'spec' | 'other'; specCode: string; specName: string; specUnit: string; label: string; unit: string }
export const blankColumn = (): ColumnForm => ({ kind: 'spec', specCode: '', specName: '', specUnit: '', label: '', unit: '' });

export function columnFromAxis(a: ChartAxis): ColumnForm {
  return a.field
    ? { kind: 'spec', specCode: a.field.code, specName: a.field.name, specUnit: a.field.unit ?? '', label: '', unit: a.field.unit ? '' : (a.unit ?? '') }
    : { kind: 'other', specCode: '', specName: '', specUnit: '', label: a.label, unit: a.unit ?? '' };
}

/** What the column's heading will read. */
export function columnHeading(c: ColumnForm): string {
  return c.kind === 'spec' ? withUnit(c.specName || 'Pick a value', c.specUnit || c.unit) : withUnit(c.label || 'Column', c.unit);
}

export interface ChartForm { name: string; resultUnit: string; mode: ChartMode; columns: ColumnForm[] }

/** The heading line the dialog previews while it is being filled. */
export function formHeadingLine(f: ChartForm): string {
  return `${f.columns.map(columnHeading).join(' × ')} → ${withUnit(f.name.trim() || 'What it gives', f.resultUnit)}`;
}

/** True when every column is read by a piece's value: then the chart gets a bare name for formulas. */
export const isBound = (f: ChartForm) => f.columns.length > 0 && f.columns.every((c) => c.kind === 'spec' && !!c.specCode);

/** Problems in words, in the order the form reads. Empty = ready to send. */
export function formProblems(f: ChartForm): string[] {
  const out: string[] = [];
  if (!f.name.trim()) out.push('Give the chart a name, e.g. Gas cutting speed.');
  if (!f.resultUnit.trim()) out.push('Say what unit it gives, e.g. mm/min.');
  const seen = new Set<string>();
  f.columns.forEach((c, i) => {
    const n = i + 1;
    if (c.kind === 'spec') {
      if (!c.specCode) { out.push(`Column ${n}: pick the piece’s value it is read by, or choose Other.`); return; }
      if (!c.specUnit && !c.unit.trim()) out.push(`Column ${n}: ${c.specName} has no unit. Say which one.`);
      if (seen.has(c.specCode)) out.push(`Column ${n}: ${c.specName} is already the other column.`);
      seen.add(c.specCode);
    } else {
      if (!c.label.trim()) out.push(`Column ${n}: give it a label.`);
      if (!c.unit.trim()) out.push(`Column ${n}: give it a unit.`);
    }
  });
  return out;
}

/** The axes as the server takes them. */
export function axesInput(f: ChartForm): ChartInput['axes'] {
  return f.columns.map((c) => (c.kind === 'spec'
    ? (c.specUnit ? { field: c.specCode } : { field: c.specCode, unit: c.unit.trim() })
    : { label: c.label.trim(), unit: c.unit.trim() }));
}

/** The grid dialog's axis config for a form: labels and units for its headings. */
export function formTableConfig(f: ChartForm, mode: ChartMode = f.mode) {
  return {
    axes: f.columns.map((c) => ({
      label: c.kind === 'spec' ? c.specName || 'Value' : c.label || 'Column',
      unit: (c.kind === 'spec' ? c.specUnit || c.unit : c.unit).trim() || null,
    })),
    mode,
  };
}

/** The grid dialog's axis config for a chart already saved. */
export const chartTableConfig = (c: Pick<Chart, 'axes' | 'mode'>) => ({ axes: c.axes.map((a) => ({ label: a.label, unit: a.unit })), mode: c.mode });

/** The grid dialog hands back text; '' means cleared. */
export const valueFromText = (s: string): ChartValue => {
  if (!s || !s.trim()) return null;
  try { return JSON.parse(s) as ChartValue; } catch { return null; }
};
export const valueToText = (v: ChartValue): string => (v ? JSON.stringify(v) : '');

/** Charts whose every column names a piece's value: the ones a time formula can write by a bare name. */
export const boundCharts = <T extends { tableConfig?: { axes?: { field?: unknown }[] } | null }>(fields: T[]) =>
  fields.filter((f) => !!f.tableConfig?.axes?.length && f.tableConfig.axes.every((a) => !!a.field));
