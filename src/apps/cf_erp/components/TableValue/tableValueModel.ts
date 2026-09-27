/**
 * tableValueModel.ts — pure logic for editing a table specification's chart:
 * building/mutating the grid, validating it (the same rules valueService.js
 * checks — ascending axes, a number or blank in every cell), turning it into
 * the JSON string SpecValueInput carries like every other data type, and the
 * short summary shown wherever a table is not being edited.
 *
 * The grid dialog shows rows = axis 1 (x), columns = axis 2 (y) — a 1-D table
 * has no columns of its own, just one v value per row.
 * Storage always remains v[yIndex][xIndex], matching the API and LOOKUP.
 */
import type { TableAxis, TableConfig, TableValue, TableValue2D } from '../../api/types';
import { isTable2D } from '../../api/types';

export const axisCountOf = (config: TableConfig | null | undefined): 1 | 2 => (config?.axes?.length === 2 ? 2 : 1);

export function emptyTable(axisCount: 1 | 2): TableValue {
  return axisCount === 2 ? { x: [], y: [], v: [] } : { x: [], v: [] };
}

/** SpecValueInput's `value` is a plain string, same as every other data type — '' means no chart yet. */
export function parseTableValue(raw: string): TableValue | null {
  if (!raw || !raw.trim()) return null;
  try {
    const j = JSON.parse(raw);
    if (j && Array.isArray(j.x) && Array.isArray(j.v)) return j as TableValue;
  } catch {
    // fall through — an unreadable string is treated as "nothing set"
  }
  return null;
}

export function serializeTableValue(t: TableValue | null): string {
  return t ? JSON.stringify(t) : '';
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));

/** Mirrors resolutionService.js's tableSummary, so the trigger reads the same everywhere. */
export function summaryOf(config: TableConfig | null | undefined, t: TableValue | null): string {
  if (!t || !t.x.length) return 'No chart set yet';
  const axes = config?.axes ?? [];
  const range = (arr: number[], axis?: TableAxis) => {
    const unit = axis?.unit ? ` ${axis.unit}` : '';
    return arr.length > 1 ? `${fmt(arr[0])}–${fmt(arr[arr.length - 1])}${unit}` : `${fmt(arr[0])}${unit}`;
  };
  if (isTable2D(t) && t.y.length) return `${t.x.length} × ${t.y.length} rows, ${range(t.x, axes[0])} / ${range(t.y, axes[1])}`;
  return `${t.x.length} row${t.x.length === 1 ? '' : 's'}, ${range(t.x, axes[0])}`;
}

/** In words, the same checks valueService.validateTableValue makes on save — shown before that round trip. */
export function validateTable(t: TableValue, config: TableConfig | null | undefined): string[] {
  const problems: string[] = [];
  const axisLabel = (i: number, fallback: string) => config?.axes?.[i]?.label || fallback;
  const ascending = (arr: number[], label: string) => {
    if (arr.some((n) => !Number.isFinite(n))) problems.push(`${label} must contain only numbers.`);
    for (let i = 1; i < arr.length; i++) {
      if (!(arr[i] > arr[i - 1])) problems.push(`${label} must keep increasing top to bottom — row ${i + 1} (${fmt(arr[i])}) is not more than row ${i} (${fmt(arr[i - 1])}).`);
    }
  };
  if (!t.x.length) problems.push('Add at least one row.');
  else ascending(t.x, axisLabel(0, 'The rows'));
  if (isTable2D(t)) {
    if (!t.y.length) problems.push('Add at least one column.');
    else ascending(t.y, axisLabel(1, 'The columns'));
    if (axisCountOf(config) !== 2 || t.v.length !== t.y.length || t.v.some((row) => !Array.isArray(row) || row.length !== t.x.length)) {
      problems.push('Every row and column needs its own rate cell.');
    }
  } else if (axisCountOf(config) !== 1 || t.v.length !== t.x.length) {
    problems.push('Every row needs its own rate cell.');
  }
  const rates = isTable2D(t) ? t.v.flat() : t.v;
  if (rates.some((v) => v !== null && !Number.isFinite(v))) problems.push('Rates must be numbers or blank.');
  return problems;
}

export function addRow(t: TableValue): TableValue {
  const next = t.x.length ? t.x[t.x.length - 1] + 1 : 0;
  if (isTable2D(t)) return { x: [...t.x, next], y: t.y, v: t.v.map((series) => [...series, null]) };
  return { x: [...t.x, next], v: [...t.v, null] };
}

export function removeRow(t: TableValue, index: number): TableValue {
  const x = t.x.filter((_, i) => i !== index);
  if (isTable2D(t)) return { x, y: t.y, v: t.v.map((series) => series.filter((_, i) => i !== index)) };
  return { x, v: t.v.filter((_, i) => i !== index) };
}

export function addColumn(t: TableValue2D): TableValue2D {
  const next = t.y.length ? t.y[t.y.length - 1] + 1 : 0;
  return { x: t.x, y: [...t.y, next], v: [...t.v, t.x.map(() => null)] };
}

export function removeColumn(t: TableValue2D, index: number): TableValue2D {
  return { x: t.x, y: t.y.filter((_, i) => i !== index), v: t.v.filter((_, i) => i !== index) };
}

export function setRowHeader(t: TableValue, index: number, value: number): TableValue {
  const x = [...t.x];
  x[index] = value;
  return isTable2D(t) ? { ...t, x } : { ...t, x };
}

export function setColumnHeader(t: TableValue2D, index: number, value: number): TableValue2D {
  const y = [...t.y];
  y[index] = value;
  return { ...t, y };
}

export function setCell(t: TableValue, rowIndex: number, colIndex: number, value: number | null): TableValue {
  if (isTable2D(t)) {
    const v = t.v.map((series, j) => (j === colIndex ? series.map((c, i) => (i === rowIndex ? value : c)) : series));
    return { ...t, v };
  }
  const v = t.v.map((c, i) => (i === rowIndex ? value : c));
  return { ...t, v };
}

/**
 * A block copied from Excel: for a 1-D table, one "x\tv" pair per line; for a
 * 2-D one, the first row is the column (axis 2) headers with a blank or any
 * text in its first cell, and every row after is "x\tv1\tv2…" — the same shape
 * the plant's own rate-chart sheets are already laid out in.
 */
export function parsePastedBlock(text: string, axisCount: 1 | 2): { table: TableValue } | { error: string } {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  if (!lines.length) return { error: 'Nothing to paste — copy a block from Excel first.' };
  const rows = lines.map((l) => l.split('\t'));
  const num = (s: string | undefined): number | null | typeof NaN => {
    const t = (s ?? '').trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  };

  if (axisCount === 1) {
    const x: number[] = [];
    const v: (number | null)[] = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].length !== 2) return { error: `Row ${i + 1}: needs exactly two columns (the value, then the rate) separated by a tab.` };
      const xi = num(rows[i][0]);
      if (xi === null || Number.isNaN(xi)) return { error: `Row ${i + 1}: "${rows[i][0]}" is not a number.` };
      const vi = num(rows[i][1]);
      if (Number.isNaN(vi)) return { error: `Row ${i + 1}: "${rows[i][1]}" is not a number — leave it blank if the machine cannot.` };
      x.push(xi);
      v.push(vi);
    }
    return { table: { x, v } };
  }

  const header = rows[0];
  const y: number[] = [];
  for (let j = 1; j < header.length; j++) {
    const yj = num(header[j]);
    if (yj === null || Number.isNaN(yj)) return { error: `The header row's column ${j + 1} ("${header[j]}") is not a number.` };
    y.push(yj);
  }
  if (!y.length) return { error: 'The first row needs the column (second axis) values, one per column after the first cell.' };
  const x: number[] = [];
  const v: (number | null)[][] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length > header.length) return { error: `Row ${i + 1}: has more rates than the header has columns.` };
    const xi = num(row[0]);
    if (xi === null || Number.isNaN(xi)) return { error: `Row ${i + 1}: "${row[0]}" is not a number.` };
    x.push(xi);
    const vRow: (number | null)[] = [];
    for (let j = 1; j <= y.length; j++) {
      const vi = num(row[j]);
      if (Number.isNaN(vi)) return { error: `Row ${i + 1}, column ${j + 1}: "${row[j]}" is not a number — leave it blank if the machine cannot.` };
      vRow.push(vi);
    }
    v.push(vRow);
  }
  if (!x.length) return { error: 'Paste needs at least one row under the header.' };
  return { table: { x, y, v: y.map((_, j) => v.map((row) => row[j])) } };
}
