import type { TreeNode } from '../api/trackerTree';
import { needsChildren, type TreeState } from './trackerTree';

/**
 * Dashboard › By order › the piece-code tree under each line. Pure parts: the
 * level picker, what is remembered on the device, and which open nodes still
 * need their children read.
 */

/** How many levels below a line show: 0 = lines only, 1 = spans / shipping units … */
export type TreeLevel = 0 | 1 | 2 | 3 | 'all';
export const TREE_LEVELS: { key: TreeLevel; label: string }[] = [
  { key: 0, label: 'Lines' }, { key: 1, label: 'Level 1' }, { key: 2, label: 'Level 2' }, { key: 3, label: 'Level 3' }, { key: 'all', label: 'All' },
];
export const DEFAULT_LEVEL: TreeLevel = 1;
/** An order with more released lines than this does not open them all by itself. */
export const AUTO_OPEN_MAX_LINES = 6;

export const levelDepth = (l: TreeLevel): number => (l === 'all' ? 99 : l);
export const lineNodeId = (lineId: number) => `l${lineId}`;

/** Every node with children, down to `level` levels under the line (a line is tree level 1). */
export function openForLevel(states: TreeState[], level: TreeLevel): Set<string> {
  const out = new Set<string>();
  if (level === 0) return out;
  const max = levelDepth(level);
  for (const st of states) for (const n of st.byId.values()) if (n.childCount > 0 && n.level <= max) out.add(n.id);
  return out;
}

/** Open nodes whose children have not been read yet. */
export const nodesToFill = (st: TreeState, open: Set<string>): TreeNode[] =>
  [...st.byId.values()].filter((n) => open.has(n.id) && needsChildren(st, n));

export interface SavedTree { level: TreeLevel | null; open: string[] }
const KEY = (orderId: number) => `cf_erp.dash.tree.${orderId}`;
const LEVELS = new Set<unknown>([0, 1, 2, 3, 'all']);

/** What this device remembers for an order; null when nothing (storage may be blocked or hold junk). */
export function loadSavedTree(orderId: number): SavedTree | null {
  try {
    const raw = window.localStorage.getItem(KEY(orderId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedTree>;
    return {
      level: LEVELS.has(v.level) ? (v.level as TreeLevel) : null,
      open: Array.isArray(v.open) ? v.open.filter((s): s is string => typeof s === 'string' && /^[lp]\d+$/.test(s)).slice(0, 500) : [],
    };
  } catch { return null; }
}
export function saveTree(orderId: number, s: SavedTree) {
  try { window.localStorage.setItem(KEY(orderId), JSON.stringify(s)); } catch { /* private window or blocked: not remembered */ }
}

/** "3 of 7 operations" for a node with no strip of its own, "All done" / "1 of 3 done" when it has. */
export function opsSummary(n: TreeNode): string {
  if (n.ops.length) {
    const done = n.ops.filter((o) => o.state === 'done').length;
    return done === n.ops.length ? 'All done' : `${done} of ${n.ops.length} done`;
  }
  if (n.steps) return `${n.stepsDone ?? 0} of ${n.steps} operations`;
  return '';
}
