import type { DrawingTree, DrawingTreeRow } from '../api/drawings';

/**
 * The levels of an order line as the drawing viewer walks them (Span › Girder › Segment › Part), from the drawing tree.
 * Pure. A row with no drawing of its own shows the drawing of its nearest ancestor that has one, and says so. A row an
 * RDSO sheet covers (no file on the line, a register drawing with a kept file or a link) counts as having one.
 */

export interface Crumb { rowId: number; name: string; level: string; hasDrawing: boolean; current: boolean }

export interface LevelView {
  /** the row the person is on (they asked for it, or stepped to it) */
  at: DrawingTreeRow;
  /** the row whose drawing is shown: `at`, else its nearest ancestor with one; null when none above has one */
  shown: DrawingTreeRow | null;
  /** the drawing is an ancestor's, not `at`'s own */
  inherited: boolean;
  /** top first, ending at `at` */
  crumbs: Crumb[];
  /** the rows directly under `at` (or under the shown row when `at` has none of its own), in BOM order, with whether they have a drawing */
  parts: DrawingTreeRow[];
}

const byId = (tree: DrawingTree) => new Map(tree.rows.map((r) => [r.rowId, r]));

/** The row a piece, a row id or a cut plate stands for; null when the line does not know it. */
export function findRow(tree: DrawingTree, ref: { rowId?: number | null; cutPlateId?: number | null }): DrawingTreeRow | null {
  if (ref.rowId != null) return tree.rows.find((r) => r.rowId === ref.rowId) ?? null;
  if (ref.cutPlateId != null) return tree.rows.find((r) => r.cutPlateIds.includes(ref.cutPlateId!)) ?? null;
  return null;
}

export const rowLabel = (r: DrawingTreeRow) => r.code ?? r.name;

/** A row has something to show: its own file on the line. A register sheet alone does not count (user, 2026-10-31: a level with no DXF offers an upload). */
export const rowShows = (r: DrawingTreeRow): boolean => r.hasDrawing;

export function levelView(tree: DrawingTree, atId: number): LevelView | null {
  const rows = byId(tree);
  const at = rows.get(atId);
  if (!at) return null;
  const chain: DrawingTreeRow[] = [];
  for (let r: DrawingTreeRow | undefined = at, n = 0; r && n < 64; r = r.parentId != null ? rows.get(r.parentId) : undefined, n++) chain.unshift(r);
  const shown = [...chain].reverse().find(rowShows) ?? null;
  const parts = tree.rows.filter((r) => r.parentId === at.rowId).sort((a, b) => a.seq - b.seq);
  return {
    at, shown, inherited: !!shown && shown.rowId !== at.rowId,
    crumbs: chain.map((r) => ({ rowId: r.rowId, name: r.name, level: r.level, hasDrawing: rowShows(r), current: r.rowId === at.rowId })),
    parts,
  };
}

/** "Drawing of Girder G2" when the drawing on screen is an ancestor's; null when it is the row's own. */
export const inheritedLabel = (v: LevelView): string | null => (v.inherited && v.shown ? `Drawing of ${v.shown.name}` : null);
