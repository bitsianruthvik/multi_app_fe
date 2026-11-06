import type { DrawingRow, DrawingTree, DrawingTreeRow } from '../api/drawings';
import type { StandardDetail, StandardFile, StandardTreeRow } from '../api/standards';

/*
 * A STANDARD DRAWING'S LEVELS for the drawing viewer (user, 2026-11-01: "I want the same tool in the Drawings tab as in
 * the SO"). The viewer walks an order line's drawing tree (lib/drawingLevels.ts); a standard's version tree has the same
 * shape — rows with a parent, a depth, a mark and the file each is drawn on — so it is turned into one. Pure.
 *
 *   rowId    1-based position in the version tree (catalog rows have no row id of their own)
 *   drawing  the row's part file; the top row, with no file of its own, gets the standard's sheet (kind 'source')
 */

const thicknessOf = (r: StandardTreeRow): number | null => {
  const v = r.values.find((x) => x.code === 'THICKNESS');
  const n = v?.text != null ? parseFloat(v.text) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const sizeOf = (r: StandardTreeRow, code: string): number | null => {
  const n = parseFloat(r.values.find((x) => x.code === code)?.text ?? '');
  return Number.isFinite(n) ? n : null;
};

export interface StandardLevels {
  tree: DrawingTree;
  /** the file each tree row (by rowId) is drawn on */
  fileOf: Map<number, StandardFile>;
  /** the version-tree row behind each rowId */
  rowOf: Map<number, StandardTreeRow>;
}

export function standardLevels(d: Pick<StandardDetail, 'id' | 'number' | 'tree' | 'files' | 'modelLevels'>): StandardLevels {
  const files = new Map(d.files.map((f) => [f.id, f]));
  // The levels the standard's ONE model draws (no file per level): such a row has a drawing too.
  const drawn = new Set((d.modelLevels ?? []).map((m) => m.toUpperCase()));
  const sheet = d.files.find((f) => f.kind === 'source') ?? null;
  const idOf = new Map(d.tree.map((r, i) => [r.key, i + 1]));
  const minDepth = d.tree.reduce((m, r) => Math.min(m, r.depth), Infinity);
  const fileOf = new Map<number, StandardFile>(); const rowOf = new Map<number, StandardTreeRow>();
  const rows: DrawingTreeRow[] = d.tree.map((r, i) => {
    const rowId = i + 1;
    rowOf.set(rowId, r);
    const own = r.fileId != null ? files.get(r.fileId) ?? null : null;
    const f = own ?? (r.depth === minDepth && sheet ? sheet : null);
    if (f) fileOf.set(rowId, f);
    return {
      rowId, parentId: r.parentKey != null ? idOf.get(r.parentKey) ?? null : null,
      code: r.mark, name: r.mark && !r.name.includes(r.mark) ? `${r.name} ${r.mark}` : r.name,
      level: r.role ?? r.definition?.name ?? (r.depth === minDepth ? 'Structure' : 'Row'),
      depth: r.depth, seq: r.lineNo ?? i, mark: r.mark,
      hasDrawing: !!f, inModel: !!r.mark && drawn.has(r.mark.toUpperCase()), drawingId: f?.id ?? null, fileKind: f?.fileKind ?? null, fileName: f?.fileName ?? null,
      number: null, revision: null, status: null,
      isPlatePart: thicknessOf(r) != null && f?.fileKind === 'dxf', cutPlateIds: [],
    };
  });
  return { tree: { line: { id: 0, lineNo: 0, orderId: 0, orderCode: d.number, released: false }, rows }, fileOf, rowOf };
}

/** The tree row to open for a file: the first row drawn on it (the top row for the sheet); null when no row uses it. */
export function rowOfFile(l: StandardLevels, fileId: number): number | null {
  for (const [rowId, f] of l.fileOf) if (f.id === fileId) return rowId;
  return null;
}

/** The viewer's "Rows" for a file: every row drawn on it, with its size and thickness (a plate part's 3D thickness). */
export function rowsOfFile(l: StandardLevels, fileId: number): DrawingRow[] {
  const out: DrawingRow[] = [];
  for (const [rowId, f] of l.fileOf) {
    if (f.id !== fileId) continue;
    const r = l.rowOf.get(rowId)!;
    const t = thicknessOf(r);
    out.push({ id: rowId, code: r.mark, name: r.name, level: r.role ?? r.definition?.name ?? '', isPlatePart: t != null && f.fileKind === 'dxf', pieces: r.total, lengthMm: sizeOf(r, 'LENGTH'), widthMm: sizeOf(r, 'WIDTH'), thicknessMm: t, sizeMatches: null });
  }
  return out;
}
