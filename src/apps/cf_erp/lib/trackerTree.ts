import type { OpState, TreeNode, TreeOp } from '../api/trackerTree';

/**
 * The Tracker's progress tree, the parts that are not drawing: holding the
 * nodes read so far (the tree comes a branch at a time), which rows show, and
 * the words and colours of an operation's state. Pure, so it is tested.
 */

/** What each state is called and how it is drawn — colour AND a mark, never colour alone. */
export const OP_STATE: Record<OpState, { label: string; mark: string; fill: string; border: string; ink: string }> = {
  done: { label: 'Done', mark: '✓', fill: 'var(--c-success-600)', border: 'var(--c-success-600)', ink: '#fff' },
  partial: { label: 'Partly done', mark: '', fill: 'var(--c-warning-50)', border: 'var(--c-warning-600)', ink: 'var(--c-warning-800)' },
  running: { label: 'Running now', mark: '▸', fill: 'var(--c-info-600)', border: 'var(--c-info-600)', ink: '#fff' },
  blocked: { label: 'Blocked', mark: '!', fill: 'var(--c-danger-600)', border: 'var(--c-danger-600)', ink: '#fff' },
  todo: { label: 'Not started', mark: '', fill: 'var(--c-neutral-50)', border: 'var(--c-neutral-200)', ink: 'var(--c-text-3)' },
};
export const OP_STATE_ORDER: OpState[] = ['done', 'partial', 'running', 'blocked', 'todo'];

const num = (n: number) => String(Number(n.toFixed(3)));

/** The text inside a pill: "2/6" when some of a count is done, a mark otherwise. */
export function opPillText(op: TreeOp): string {
  if (op.total > 1 && (op.state === 'partial' || ((op.state === 'running' || op.state === 'blocked') && op.done > 0))) return `${num(op.done)}/${num(op.total)}`;
  return OP_STATE[op.state].mark;
}

/** The sentence on hover: "Fit-up — 2 of 6 done", "Welding — blocked: On hold: crane". */
export function opTitle(op: TreeOp): string {
  const count = op.total > 1 ? ` — ${num(op.done)} of ${num(op.total)} done` : '';
  switch (op.state) {
    case 'done': return `${op.name} — done`;
    case 'running': return `${op.name} — running now${count}`;
    case 'partial': return `${op.name}${count || ' — started, paused'}`;
    case 'blocked': return `${op.name} — blocked${op.reason ? `: ${op.reason}` : ''}${count}`;
    default: return `${op.name} — ${op.ready ? 'ready to start' : 'not started'}${count}`;
  }
}

/** "37%" — a sliver shows as "<1%" and anything short of all as at most 99%, so neither 0% nor 100% lies. */
export function pctText(c: number | null | undefined): string {
  if (c == null) return '—';
  if (c <= 0) return '0%';
  if (c >= 1) return '100%';
  const p = Math.floor(c * 100);
  return p < 1 ? '<1%' : `${Math.min(p, 99)}%`;
}

/** The nodes read so far, in display order, with their children. */
export interface TreeState { byId: Map<string, TreeNode>; loaded: Set<string> }

export const emptyTree = (): TreeState => ({ byId: new Map(), loaded: new Set() });

/** A fresh read replaces everything. */
export function fromNodes(nodes: TreeNode[]): TreeState {
  const byId = new Map<string, TreeNode>();
  for (const n of nodes) byId.set(n.id, n);
  return { byId, loaded: new Set(nodes.filter((n) => n.childrenIncluded && n.childCount > 0).map((n) => n.id)) };
}

/**
 * A branch arrives for `parentId`: its old descendants go (a search may have
 * brought only some), then the branch goes in, in the server's order.
 */
export function mergeBranch(state: TreeState, parentId: string, parent: TreeNode | null, nodes: TreeNode[]): TreeState {
  const kids = childrenIndex(state.byId);
  const drop = new Set<string>();
  const stack = [...(kids.get(parentId) ?? [])];
  while (stack.length) { const id = stack.pop() as string; drop.add(id); stack.push(...(kids.get(id) ?? [])); }
  const byId = new Map<string, TreeNode>();
  for (const [id, n] of state.byId) if (!drop.has(id)) byId.set(id, id === parentId && parent ? parent : n);
  for (const n of nodes) byId.set(n.id, n);
  const loaded = new Set([...state.loaded].filter((id) => !drop.has(id)));
  loaded.add(parentId);
  for (const n of nodes) if (n.childrenIncluded && n.childCount > 0) loaded.add(n.id);
  return { byId, loaded };
}

/** Fresh figures for nodes already shown (after work was recorded): same place, new values; the rest stays. */
export function refreshNodes(state: TreeState, nodes: TreeNode[]): TreeState {
  const byId = new Map(state.byId);
  for (const n of nodes) if (byId.has(n.id)) byId.set(n.id, n);
  return { byId, loaded: state.loaded };
}

export function childrenIndex(byId: Map<string, TreeNode>): Map<string, string[]> {
  const kids = new Map<string, string[]>();
  for (const n of byId.values()) {
    if (!n.parentId) continue;
    const list = kids.get(n.parentId);
    if (list) list.push(n.id); else kids.set(n.parentId, [n.id]);
  }
  return kids;
}

export interface VisibleRow { node: TreeNode; depth: number; open: boolean; hasChildren: boolean }

/**
 * The rows on screen: depth-first from the orders, into every open node.
 * `onlyBlocked` leaves out branches with nothing blocked (a branch opened
 * later brings all its children).
 */
export function visibleRows(state: TreeState, open: Set<string>, { onlyBlocked = false } = {}): VisibleRow[] {
  const kids = childrenIndex(state.byId);
  const out: VisibleRow[] = [];
  const roots = [...state.byId.values()].filter((n) => !n.parentId || !state.byId.has(n.parentId));
  const stack: [TreeNode, number][] = roots.reverse().map((n) => [n, 0]);
  while (stack.length) {
    const [n, depth] = stack.pop() as [TreeNode, number];
    if (onlyBlocked && !n.blockedCount) continue;
    const isOpen = open.has(n.id);
    out.push({ node: n, depth, open: isOpen, hasChildren: n.childCount > 0 });
    if (!isOpen) continue;
    const ks = kids.get(n.id) ?? [];
    for (let i = ks.length - 1; i >= 0; i--) {
      const k = state.byId.get(ks[i]);
      if (k) stack.push([k, depth + 1]);
    }
  }
  return out;
}

/** Every node that has children among those read — for a search or a filter, which opens what it found. */
export function openAllLoaded(state: TreeState): Set<string> {
  const kids = childrenIndex(state.byId);
  return new Set([...kids.keys()].filter((id) => state.byId.has(id)));
}

/** Open everything above tree level `level` (order 0, line 1, top piece 2 …). */
export function openToLevel(state: TreeState, level: number): Set<string> {
  return new Set([...state.byId.values()].filter((n) => n.level < level && n.childCount > 0).map((n) => n.id));
}

/** Whether opening a node needs its children fetched first. */
export const needsChildren = (state: TreeState, n: TreeNode) => n.childCount > 0 && !state.loaded.has(n.id);

/** "Done 1,204 of 16,972 operations" style counts for a parent's hover. */
export function byOperationLines(n: TreeNode, names: Record<string, { code: string; name: string }>): string[] {
  return (n.byOperation ?? []).map((b) => `${names[b.operationId]?.name ?? `Operation ${b.operationId}`}: ${num(b.done)} of ${num(b.total)}`);
}

/** "1 of 3 done" beside a piece's strip — the plain-words version of the pills. */
export function opsDoneText(ops: TreeOp[]): string {
  if (!ops.length) return '';
  const done = ops.filter((o) => o.state === 'done').length;
  return done === ops.length ? 'All done' : `${done} of ${ops.length} done`;
}
