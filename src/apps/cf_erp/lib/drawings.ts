import type { DrawingGeometry, DrawingRow, DrawingsSummary, DrawingsUploadFile } from '../api/drawings';

/** Pure helpers for the Drawings dialog: numbers, the outline as an SVG path, and the sentences. */

const group = (n: number, digits: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const ok = (n: number | null | undefined): n is number => n != null && Number.isFinite(n);

export const fmtMm = (n: number | null | undefined): string => (ok(n) ? group(Math.round(n), 0) : '—');
export const fmtKg = (n: number | null | undefined): string => (ok(n) ? `${group(Math.round(n), 0)} kg` : '—');
export const fmtM2 = (n: number | null | undefined): string => (ok(n) ? `${group(n, 2)} m²` : '—');
export const fmtPct = (n: number | null | undefined): string => (ok(n) ? `${group(n, 1)}%` : '—');
/** Cut length in metres, one decimal. */
export const fmtCutM = (mmLen: number | null | undefined): string => (ok(mmLen) ? `${group(mmLen / 1000, 1)} m` : '—');
export const sizeText = (l: number | null | undefined, w: number | null | undefined): string => `${fmtMm(l)} × ${fmtMm(w)} mm`;

/**
 * The outline and its cut-outs as ONE SVG path in the drawing's own millimetres, y flipped so the part is not
 * upside down (DXF y runs up, SVG y runs down). Use it with fill-rule="evenodd" and the viewBox from outlineShape.
 */
export function ringsPath(rings: number[][][], widthMm: number): string {
  const r = (v: number) => Math.round(v * 100) / 100;
  const parts: string[] = [];
  for (const ring of rings) {
    const pts = ring.filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length < 2) continue;
    parts.push(`M${pts.map(([x, y]) => `${r(x)} ${r(widthMm - y)}`).join('L')}Z`);
  }
  return parts.join('');
}

export function outlineShape(g: DrawingGeometry): { d: string; viewBox: string } {
  return { d: ringsPath(g.rings, g.widthMm), viewBox: `0 0 ${g.lengthMm} ${g.widthMm}` };
}

/** The size check on one matched row: ✓ matches, ⚠ differs, · not compared. `text` is the tooltip. */
export function sizeCheck(row: DrawingRow, g: DrawingGeometry | null): { mark: '✓' | '⚠' | '·'; text: string } {
  const rowSize = sizeText(row.lengthMm, row.widthMm);
  if (!g) return { mark: '·', text: `Row ${rowSize}` };
  const drawn = sizeText(g.lengthMm, g.widthMm);
  if (row.sizeMatches === true) return { mark: '✓', text: `Row ${rowSize} · drawing ${drawn}` };
  if (row.sizeMatches === false) return { mark: '⚠', text: `Row ${rowSize} but the drawing is ${drawn}` };
  return { mark: '·', text: `Row ${rowSize} · drawing ${drawn} · not compared` };
}

export const rowCodes = (rows: DrawingRow[]): string => rows.map((r) => r.code ?? r.name).join(', ') || '—';

/** "4 × Ø22 mm, 2 × Ø18 mm" */
export function holesTitle(g: DrawingGeometry): string {
  if (!g.holes) return 'No holes to drill.';
  const counts = new Map<number, number>();
  for (const d of g.holeDiameters) counts.set(d, (counts.get(d) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${n} × Ø${group(d, d % 1 ? 1 : 0)} mm`).join(', ');
}

export const STATUS_WORDS: Record<DrawingsUploadFile['status'], string> = {
  new: 'New', replaces: 'Replaces', unmatched: 'No matching row', error: 'Cannot read',
};

/** Files a non-dry run would save: not unmatched, not in error. */
export const savable = (files: DrawingsUploadFile[]): DrawingsUploadFile[] =>
  files.filter((f) => f.status === 'new' || f.status === 'replaces');

/** The kind of drawing a file name is, in any case; null for anything else. */
export const drawingKind = (name: string): 'dxf' | 'pdf' | null => {
  const m = /\.(dxf|pdf)$/i.exec(name);
  return m ? (m[1].toLowerCase() as 'dxf' | 'pdf') : null;
};
export const isDxf = (name: string): boolean => drawingKind(name) === 'dxf';
export const isDrawingFile = (name: string): boolean => drawingKind(name) != null;

/** The server refuses a file over this. */
export const MAX_DRAWING_BYTES = 4 * 1024 * 1024;

export const NO_DRAWINGS = 'Upload a drawing for each row, named by its drawing mark.';
export const NO_MARK_HINT = 'A row needs a drawing mark (Structure or Values) before a drawing can be matched to it.';
export const INTRO = 'A drawing for any row of this line — DXF or PDF, named by the row\u2019s drawing mark (e.g. G1-1.pdf, BF1.dxf). A plate part\u2019s DXF is also read as its shape: true area, cut length and piercings.';

/** The levels a drawing covers, comma-joined; a dash when none. */
export const levelText = (levels: string[] | null | undefined): string => (levels && levels.length ? levels.join(', ') : '—');
/** The levels of some matched rows, each once, in the order met. */
export const levelsOfRows = (rows: DrawingRow[]): string[] => [...new Set(rows.map((r) => r.level))];

/** Rows grouped by level, in the order each level is first met (the server's order within a level). */
export function groupByLevel<T extends { level: string }>(rows: T[]): { level: string; rows: T[] }[] {
  const out: { level: string; rows: T[] }[] = [];
  const at = new Map<string, { level: string; rows: T[] }>();
  for (const r of rows) {
    let g = at.get(r.level);
    if (!g) { g = { level: r.level, rows: [] }; at.set(r.level, g); out.push(g); }
    g.rows.push(r);
  }
  return out;
}

/** Picked files sorted into those to read, those that are not DXF or PDF, and those over the size limit. */
export function sortPicked<T extends { name: string; size: number }>(picked: T[]): { ok: T[]; wrongKind: string[]; tooBig: string[] } {
  const ok: T[] = [], wrongKind: string[] = [], tooBig: string[] = [];
  for (const f of picked) {
    if (!isDrawingFile(f.name)) wrongKind.push(f.name);
    else if (f.size > MAX_DRAWING_BYTES) tooBig.push(f.name);
    else ok.push(f);
  }
  return { ok, wrongKind, tooBig };
}

/** Two plain sentences: the rows covered, then (only when a plate part has a shape) the measure. */
export function summaryWords(s: DrawingsSummary): string {
  const first = `${group(s.rowsWithDrawing, 0)} of ${group(s.rows, 0)} ${s.rows === 1 ? 'row has' : 'rows have'} a drawing.`;
  if (!s.partsWithShape) return first;
  const have = s.parts === 1 ? 'plate part has' : 'plate parts have';
  const second = `${group(s.partsWithShape, 0)} of ${group(s.parts, 0)} ${have} a shape (${group(s.piecesWithShape, 0)} of ${group(s.pieces, 0)} ${s.pieces === 1 ? 'piece' : 'pieces'}).`;
  const use = s.usePct == null ? '' : ` Their shapes use ${group(s.usePct, s.usePct >= 99.5 && s.usePct < 100 ? 1 : 0)}% of their rectangles`;
  if (s.savingKg > 0.5) return `${first} ${second}${use}${use ? ' —' : ''} true-shape nesting could save up to ${fmtKg(s.savingKg)} on them.`;
  return use ? `${first} ${second}${use} — there is little for true-shape nesting to save on them.` : `${first} ${second}`;
}

/** The button label: "Drawings", with "(n of m rows)" once the line's rows are known. */
export function buttonLabel(s: Pick<DrawingsSummary, 'rows' | 'rowsWithDrawing'> | null | undefined): string {
  return s && s.rows > 0 ? `Drawings (${s.rowsWithDrawing} of ${s.rows} rows)` : 'Drawings';
}
