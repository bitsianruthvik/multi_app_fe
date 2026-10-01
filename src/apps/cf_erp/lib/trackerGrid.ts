import type { GridCell, GridOperation, GridOwnCell, GridRow } from '../api/trackerGrid';
import type { OpState } from '../api/trackerTree';
import { pctText } from './trackerTree';

/**
 * The order line's Production grid, the parts that are not drawing: holding
 * the rows read so far (a big line comes a branch at a time), which rows show,
 * and what one cell says — its text, its colour and its sentence on hover.
 * Pure, so it is tested (scripts/cf_erp_order_production_grid_test.mjs).
 */

export interface GridState { byId: Map<string, GridRow>; loaded: Set<string> }

export const emptyGrid = (): GridState => ({ byId: new Map(), loaded: new Set() });

/** A fresh read replaces everything. */
export function gridFromNodes(nodes: GridRow[]): GridState {
  const byId = new Map<string, GridRow>();
  for (const n of nodes) byId.set(n.id, n);
  return { byId, loaded: new Set(nodes.filter((n) => n.childrenIncluded && n.childCount > 0).map((n) => n.id)) };
}

function kidsIndex(byId: Map<string, GridRow>): Map<string, string[]> {
  const kids = new Map<string, string[]>();
  for (const n of byId.values()) {
    if (!n.parentId) continue;
    const list = kids.get(n.parentId);
    if (list) list.push(n.id); else kids.set(n.parentId, [n.id]);
  }
  return kids;
}

/** A branch arrives for `parentId`: its old descendants go, the fresh node and its branch go in, in the server's order. */
export function mergeGridBranch(state: GridState, parentId: string, parent: GridRow | null, nodes: GridRow[]): GridState {
  const kids = kidsIndex(state.byId);
  const drop = new Set<string>();
  const stack = [...(kids.get(parentId) ?? [])];
  while (stack.length) { const id = stack.pop() as string; drop.add(id); stack.push(...(kids.get(id) ?? [])); }
  const byId = new Map<string, GridRow>();
  for (const [id, n] of state.byId) if (!drop.has(id)) byId.set(id, id === parentId && parent ? parent : n);
  for (const n of nodes) byId.set(n.id, n);
  const loaded = new Set([...state.loaded].filter((id) => !drop.has(id)));
  loaded.add(parentId);
  for (const n of nodes) if (n.childrenIncluded && n.childCount > 0) loaded.add(n.id);
  return { byId, loaded };
}

export interface VisibleGridRow { row: GridRow; depth: number; open: boolean; hasChildren: boolean }

/** The rows on screen: depth-first from the line, into every open row whose children are here. */
export function visibleGridRows(state: GridState, open: Set<string>): VisibleGridRow[] {
  const kids = kidsIndex(state.byId);
  const out: VisibleGridRow[] = [];
  const roots = [...state.byId.values()].filter((n) => !n.parentId || !state.byId.has(n.parentId));
  const stack: [GridRow, number][] = roots.reverse().map((n) => [n, 0]);
  while (stack.length) {
    const [n, depth] = stack.pop() as [GridRow, number];
    const isOpen = open.has(n.id) && state.loaded.has(n.id);
    out.push({ row: n, depth, open: isOpen, hasChildren: n.childCount > 0 });
    if (!isOpen) continue;
    const ks = kids.get(n.id) ?? [];
    for (let i = ks.length - 1; i >= 0; i--) {
      const k = state.byId.get(ks[i]);
      if (k) stack.push([k, depth + 1]);
    }
  }
  return out;
}

/** Open every row above `level` (the line 0, its top pieces 1 …) whose children were read. */
export function openGridToLevel(state: GridState, level: number): Set<string> {
  return new Set([...state.byId.values()].filter((n) => n.level < level && n.childCount > 0 && state.loaded.has(n.id)).map((n) => n.id));
}

/** Whether opening a row needs its children fetched first. */
export const gridNeedsChildren = (state: GridState, n: GridRow) => n.childCount > 0 && !state.loaded.has(n.id);

/** The open rows deeper than the default read — what a re-read after recording work must bring back (`open=`). */
export function openBeyond(state: GridState, open: Set<string>, defaultDepth: number): string[] {
  return [...open].filter((id) => { const n = state.byId.get(id); return !!n && n.level >= defaultDepth && state.loaded.has(id); });
}

// --- one cell ------------------------------------------------------------------------

const num = (n: number) => String(Number(n.toFixed(3)));
export const isOwn = (c: GridCell): c is GridOwnCell => !c.rollup;

/** What a cell says: ✓ · 2/6 · ▸ · ! · • (ready) · a faint dot (not started) · 37% (gathered from below). */
export function gridCellText(c: GridCell): string {
  if (!isOwn(c)) return c.total > 0 && c.done >= c.total ? '✓' : pctText(c.total > 0 ? c.done / c.total : null);
  const count = c.total > 1 && c.done > 0 ? `${num(c.done)}/${num(c.total)}` : '';
  switch (c.state) {
    case 'done': return '✓';
    case 'partial': return count || '…';
    case 'running': return count ? `▸ ${count}` : '▸';
    case 'blocked': return count ? `! ${count}` : '!';
    default: return c.ready ? '•' : '·';
  }
}

/** The state a cell is drawn as (a gathered cell: done when all of it is, partial when some, todo when none). */
export function gridCellState(c: GridCell): OpState {
  if (isOwn(c)) return c.state;
  if (c.total > 0 && c.done >= c.total) return 'done';
  return c.done > 0 ? 'partial' : 'todo';
}

/** Soft backgrounds and ink, from the design tokens so dark mode follows. Colour is never the only sign — the text carries a mark. */
export const GRID_TONE: Record<OpState, { tint?: string; ink: string }> = {
  done: { tint: 'color-mix(in srgb, var(--c-success-600) 22%, var(--c-surface))', ink: 'var(--c-success-800)' },
  partial: { tint: 'color-mix(in srgb, var(--c-warning-600) 20%, var(--c-surface))', ink: 'var(--c-warning-800)' },
  running: { tint: 'color-mix(in srgb, var(--c-info-600) 22%, var(--c-surface))', ink: 'var(--c-info-800)' },
  blocked: { tint: 'color-mix(in srgb, var(--c-danger-600) 22%, var(--c-surface))', ink: 'var(--c-danger-800)' },
  todo: { ink: 'var(--c-text-3)' },
};

/** A gathered cell's tint grows with how much is done, so a column reads at a glance. */
export function rollupTint(done: number, total: number): string | undefined {
  if (total <= 0 || done <= 0) return undefined;
  if (done >= total) return GRID_TONE.done.tint;
  const share = Math.round(8 + 14 * (done / total));
  return `color-mix(in srgb, var(--c-success-600) ${share}%, var(--c-surface))`;
}

const STATE_WORDS: Record<OpState, string> = { done: 'done', partial: 'partly done', running: 'running now', blocked: 'blocked', todo: 'not started' };

/** The sentence on hover. */
export function gridCellTitle(c: GridCell, opName: string, code: string): string {
  if (!isOwn(c)) {
    return `${opName} under ${code}: ${num(c.done)} of ${num(c.total)} done (${pctText(c.total > 0 ? c.done / c.total : null)}). Open the row to see which.`;
  }
  const parts = [`${opName} on ${code} — ${c.state === 'todo' && c.ready ? 'ready to start' : STATE_WORDS[c.state]}`];
  if (c.total > 1) parts.push(`${num(c.done)} of ${num(c.total)} done`);
  if (c.reason) parts.push(c.reason);
  if (c.passes?.length) parts.push(c.passes.map((p, i) => `${p.name ?? `pass ${i + 1}`}: ${STATE_WORDS[p.state]}`).join('; '));
  if (c.below) parts.push(`below it: ${num(c.below.done)} of ${num(c.below.total)} done`);
  return parts.join(' · ');
}

/** "Fit-up is not in G2-3's flow" — the hover of a hatched cell. */
export const naTitle = (opName: string, code: string, isLeaf: boolean) =>
  isLeaf ? `${opName} is not in ${code}'s flow` : `${opName} is not in the flow of ${code} or anything under it`;

/** The part of a code its parent already says, so the rest — what this piece adds — can stand out. */
export function codePrefix(row: GridRow, parent: GridRow | undefined): string {
  return parent?.kind === 'piece' && row.code.startsWith(parent.code) ? parent.code : '';
}

/** A column header's figure: how much of this operation the whole line has done. */
export const opHeadPct = (op: GridOperation) => (op.total > 0 ? pctText(op.done / op.total) : '');
