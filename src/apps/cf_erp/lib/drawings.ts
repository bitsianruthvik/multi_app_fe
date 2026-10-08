import type { DrawingGeometry, DrawingRow, DrawingsSummary, DrawingsUploadFile } from '../api/drawings';

/** Pure helpers for the Part drawings dialog: numbers, the outline as an SVG path, and the sentences. */

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

export const isDxf = (name: string): boolean => /\.dxf$/i.test(name);

export const NO_DRAWINGS = 'Upload the DXF of each plate part, named by its drawing mark, e.g. BIC-01.dxf.';

/** "12 of 40 plate parts have a drawing (96 of 310 pieces). Their shapes use 71% of their rectangles — true-shape nesting could save up to 1,240 kg on them." */
export function summaryWords(s: DrawingsSummary): string {
  if (!s.partsWithDrawing) return NO_DRAWINGS;
  const have = s.parts === 1 ? 'plate part has' : 'plate parts have';
  const first = `${group(s.partsWithDrawing, 0)} of ${group(s.parts, 0)} ${have} a drawing (${group(s.piecesWithDrawing, 0)} of ${group(s.pieces, 0)} ${s.pieces === 1 ? 'piece' : 'pieces'}).`;
  const use = s.usePct == null ? '' : ` Their shapes use ${group(s.usePct, s.usePct >= 99.5 && s.usePct < 100 ? 1 : 0)}% of their rectangles`;
  if (s.savingKg > 0.5) return `${first}${use}${use ? ' —' : ''} true-shape nesting could save up to ${fmtKg(s.savingKg)} on them.`;
  return use ? `${first}${use} — there is little for true-shape nesting to save on them.` : first;
}

/** The button label: "Part drawings", with "n of m" once the line's plate parts are known. */
export function buttonLabel(s: Pick<DrawingsSummary, 'parts' | 'partsWithDrawing'> | null | undefined): string {
  return s && s.parts > 0 ? `Part shapes (DXF) (${s.partsWithDrawing} of ${s.parts})` : 'Part shapes (DXF)';
}
