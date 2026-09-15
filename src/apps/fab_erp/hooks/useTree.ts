/**
 * useTree — the pure tree-editing helpers `StructureEditor.tsx` used to keep to
 * itself (`cloneSubtree`, `mapNode`, `dropNode`, `moveWithinSiblings`,
 * `duplicateNode`, `countPieces`, `unanswered`, `countRows`), now generic over
 * the node payload `T` so `ItemBomDesigner`'s recipe tree and the order's
 * structure tree can share one implementation (EU-17 item 1).
 *
 * UNDO/REDO IS A HISTORY ARRAY OF ROOTS, and that is the whole implementation
 * (X4): every edit already produces a brand-new, structurally-shared root
 * (nothing here ever mutates a node in place), so "undo" is just "look at the
 * previous root" and "redo" is "look at the next one". No inverse operations,
 * no patch log.
 */

import { useCallback, useMemo, useState } from 'react';

/** One node of a generic tree: the caller's own fields, plus a key and children. */
export type TreeNode<T = Record<string, unknown>> = T & {
  key: string;
  children: TreeNode<T>[];
};

let seq = 0;
/** A local id for a node that does not exist on the server yet. */
export const newTreeKey = () => `local${++seq}`;

// ── pure helpers, generic over T ────────────────────────────────────────────

/**
 * Deep copy with fresh keys, so a copied subtree is addressable on its own.
 * A clone must not carry its source's server identity forward: StructureEditor's
 * `DraftNodeData.itemId` (api/templates.ts) is what `applyTree` treats as "this
 * row already exists" — two tree nodes sharing one `itemId` collapse to ONE
 * database row on save, silently dropping the copy. Duck-typed so trees whose
 * `T` has no `itemId` (e.g. a BOM recipe, which never adopted `useTree`) are
 * untouched.
 */
export function cloneSubtree<T>(node: TreeNode<T>): TreeNode<T> {
  const reset = ('itemId' in node) ? { ...node, itemId: null } : node;
  return { ...reset, key: newTreeKey(), children: node.children.map(cloneSubtree) };
}

/** Replace one node anywhere in the tree, returning a new tree. */
export function mapNode<T>(node: TreeNode<T>, key: string, fn: (n: TreeNode<T>) => TreeNode<T>): TreeNode<T> {
  if (node.key === key) return fn(node);
  if (!node.children.length) return node;
  let changed = false;
  const children = node.children.map((c) => {
    const next = mapNode(c, key, fn);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...node, children } : node;
}

/** Remove one node, and its subtree, from anywhere below the root. */
export function dropNode<T>(node: TreeNode<T>, key: string): TreeNode<T> {
  if (!node.children.length) return node;
  const kept = node.children.filter((c) => c.key !== key);
  const children = (kept.length === node.children.length ? kept : kept).map((c) => dropNode(c, key));
  if (kept.length === node.children.length && children.every((c, i) => c === node.children[i])) return node;
  return { ...node, children };
}

/** Insert a node as a child of `parentKey`, at `at` (default: the end). */
export function insertChild<T>(node: TreeNode<T>, parentKey: string, child: TreeNode<T>, at?: number): TreeNode<T> {
  return mapNode(node, parentKey, (n) => {
    const children = [...n.children];
    children.splice(at ?? children.length, 0, child);
    return { ...n, children };
  });
}

/**
 * Move `dragKey` so it sits where `overKey` is, AMONG THE SAME SIBLINGS.
 *
 * Reordering only — a row cannot be dropped into a different parent this way.
 * Dragging a Top Flange out of a Segment and into a Diaphragm is a different
 * operation with different consequences (its quantity is per-parent, its flow
 * came from a BOM line that no longer applies), and doing it by accident while
 * aiming two rows further down is exactly how that would happen. `indentNode`/
 * `outdentNode` below are the deliberate way to change level.
 */
export function moveWithinSiblings<T>(node: TreeNode<T>, dragKey: string, overKey: string): TreeNode<T> {
  const kids = node.children;
  const from = kids.findIndex((c) => c.key === dragKey);
  const to = kids.findIndex((c) => c.key === overKey);

  if (from >= 0 && to >= 0 && from !== to) {
    const next = [...kids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return { ...node, children: next };
  }
  if (!kids.length) return node;
  // Not this level's business — ask the children.
  const children = kids.map((c) => moveWithinSiblings(c, dragKey, overKey));
  return children.every((c, i) => c === kids[i]) ? node : { ...node, children };
}

export function duplicateNode<T>(node: TreeNode<T>, key: string): TreeNode<T> {
  if (!node.children.length) return node;
  const children: TreeNode<T>[] = [];
  let changed = false;
  for (const c of node.children) {
    if (c.key === key) { children.push(c, cloneSubtree(c)); changed = true; } else {
      // A match two-or-more levels down only changes THIS level's `children`
      // array by reference, not by length or direct key — `changed` must
      // also fire on that, or a nested duplicate (the common case: every
      // BOM row past depth 1) silently no-ops (Copy button did nothing).
      const next = duplicateNode(c, key);
      if (next !== c) changed = true;
      children.push(next);
    }
  }
  return changed ? { ...node, children } : node;
}

/**
 * Move a node UP one level (Alt+←): it becomes a sibling of its own parent,
 * placed directly after it. A no-op at the top level — there is nowhere higher
 * to go, and the root itself is never a row somebody reorders.
 */
export function outdentNode<T>(root: TreeNode<T>, key: string): TreeNode<T> {
  function walk(node: TreeNode<T>): { tree: TreeNode<T>; lifted: TreeNode<T> | null } {
    const idx = node.children.findIndex((c) => c.key === key);
    if (idx >= 0) {
      const lifted = node.children[idx];
      const children = node.children.filter((c) => c.key !== key);
      return { tree: { ...node, children }, lifted };
    }
    let lifted: TreeNode<T> | null = null;
    const children = node.children.map((c) => {
      if (lifted) return c;
      const r = walk(c);
      if (r.lifted) { lifted = r.lifted; return r.tree; }
      return c;
    });
    return { tree: { ...node, children }, lifted };
  }

  function place(node: TreeNode<T>, parentKey: string, child: TreeNode<T>): TreeNode<T> {
    // `parentKey`'s PARENT gets the lifted node inserted right after `parentKey`.
    if (node.children.some((c) => c.key === parentKey)) {
      const idx = node.children.findIndex((c) => c.key === parentKey);
      const children = [...node.children];
      children.splice(idx + 1, 0, child);
      return { ...node, children };
    }
    return { ...node, children: node.children.map((c) => place(c, parentKey, child)) };
  }

  // Find the node's current parent key before removing it, so `place` knows
  // where "directly after its parent" is.
  const parentKey = findParentKey(root, key);
  if (!parentKey || parentKey === root.key) return root; // top-level or not found — nowhere to go.
  const { tree: withoutNode, lifted } = walk(root);
  if (!lifted) return root;
  return place(withoutNode, parentKey, lifted);
}

/**
 * Move a node DOWN one level (Alt+→): it becomes the last child of the
 * PREVIOUS sibling. A no-op on the first child of its parent — there is no
 * sibling above it to become a child of.
 */
export function indentNode<T>(root: TreeNode<T>, key: string): TreeNode<T> {
  return mapParent(root, key, (parent) => {
    const idx = parent.children.findIndex((c) => c.key === key);
    if (idx <= 0) return parent; // first child — nothing above to indent under.
    const node = parent.children[idx];
    const newParent = parent.children[idx - 1];
    const children = parent.children.filter((c) => c.key !== key);
    const grownSibling = { ...newParent, children: [...newParent.children, node] };
    return { ...parent, children: children.map((c) => (c.key === newParent.key ? grownSibling : c)) };
  });
}

function findParentKey<T>(node: TreeNode<T>, childKey: string): string | null {
  for (const c of node.children) {
    if (c.key === childKey) return node.key;
    const found = findParentKey(c, childKey);
    if (found) return found;
  }
  return null;
}

/** Apply `fn` to the PARENT of `key`, wherever it is. A no-op if `key` is the root or absent. */
function mapParent<T>(root: TreeNode<T>, key: string, fn: (parent: TreeNode<T>) => TreeNode<T>): TreeNode<T> {
  if (root.children.some((c) => c.key === key)) return fn(root);
  if (!root.children.length) return root;
  const children = root.children.map((c) => mapParent(c, key, fn));
  return children.every((c, i) => c === root.children[i]) ? root : { ...root, children };
}

/** Every piece this tree would produce, quantities multiplied down. */
export function countPieces<T extends { qty?: number | string | null }>(node: TreeNode<T>, carried = 1): number {
  const here = carried * (Number(node.qty) || 0);
  return node.children.reduce((sum, c) => sum + countPieces(c, here), here);
}

/** Rows still waiting for a number. The recipe no longer guesses on their behalf. */
export function unanswered<T extends { qty?: number | string | null; name?: string }>(
  node: TreeNode<T>, out: string[] = [],
): string[] {
  if (node.qty == null) out.push(node.name ?? '');
  node.children.forEach((c) => unanswered(c, out));
  return out;
}

export function countRows<T>(node: TreeNode<T>): number {
  return 1 + node.children.reduce((s, c) => s + countRows(c), 0);
}

/** Find one node by key, or null. Used by bulk actions that need the node's own fields. */
export function findNode<T>(node: TreeNode<T>, key: string): TreeNode<T> | null {
  if (node.key === key) return node;
  for (const c of node.children) {
    const found = findNode(c, key);
    if (found) return found;
  }
  return null;
}

/** Every leaf (no children) under `node`, itself included if it has none. */
export function leaves<T>(node: TreeNode<T>, out: TreeNode<T>[] = []): TreeNode<T>[] {
  if (!node.children.length) out.push(node);
  else node.children.forEach((c) => leaves(c, out));
  return out;
}

// ── the hook ─────────────────────────────────────────────────────────────

export interface UseTreeApi<T> {
  tree: TreeNode<T> | null;
  /** The tree as last loaded or saved — a diff base for "what would Save remove". */
  baseline: TreeNode<T> | null;
  /** Replace the whole tree AND reset history/dirty — for loading fresh data. */
  set: (tree: TreeNode<T> | null) => void;
  /** Apply a patch (object or updater function) to one node, pushing history. */
  update: (key: string, patch: Partial<T> | ((n: TreeNode<T>) => TreeNode<T>)) => void;
  insert: (parentKey: string, child: TreeNode<T>, at?: number) => void;
  remove: (key: string) => void;
  move: (dragKey: string, overKey: string) => void;
  duplicate: (key: string) => void;
  indent: (key: string) => void;
  outdent: (key: string) => void;
  /** True once the tree has diverged from what `set()` last loaded. */
  dirty: boolean;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * History and pointer live in ONE state value, and every mutator schedules a
 * FUNCTIONAL updater that recomputes `next` from whatever tree the updater
 * actually sees — never from a `tree`/`pointer` variable closed over at call
 * time. That is not a style preference: a bulk action calls `update` several
 * times in the same tick (`applyFlowToKeys` iterates every selected row), and
 * React applies that tick's `setState` calls in order against the REAL
 * evolving state, not against however many stale snapshots were captured when
 * each call was made. The first version of this hook computed `next` up front
 * and split `history`/`pointer` into two separate `useState`s — two calls in
 * one tick then each read the SAME stale `pointer`, so the second commit's
 * `history.slice(0, pointer + 1)` chopped the first commit's entry back off
 * while `pointer` itself still advanced twice, and `history[pointer]` came
 * back `undefined` — a bulk flow-set silently emptying the tree it had just
 * edited, caught by hand in the browser (EU-17), not by any type check.
 */
interface TreeHistory<T> {
  entries: (TreeNode<T> | null)[];
  pointer: number;
}

export function useTree<T>(initial: TreeNode<T> | null = null): UseTreeApi<T> {
  const [state, setState] = useState<TreeHistory<T>>({ entries: [initial], pointer: 0 });
  // The tree as last loaded (via `set`) or saved — dirty is "have we moved
  // away from that", not "have we ever made an edit this session".
  const [baseline, setBaseline] = useState<TreeNode<T> | null>(initial);

  const tree = state.entries[state.pointer] ?? null;

  /** Schedule an edit computed from whatever tree is CURRENT when it lands. */
  const commit = useCallback((fn: (current: TreeNode<T> | null) => TreeNode<T> | null) => {
    setState((s) => {
      const current = s.entries[s.pointer] ?? null;
      const next = fn(current);
      if (next === current) return s; // no-op — also what lets `dirty` be exact.
      return { entries: [...s.entries.slice(0, s.pointer + 1), next], pointer: s.pointer + 1 };
    });
  }, []);

  const set = useCallback((next: TreeNode<T> | null) => {
    setState({ entries: [next], pointer: 0 });
    setBaseline(next);
  }, []);

  const update = useCallback((key: string, patch: Partial<T> | ((n: TreeNode<T>) => TreeNode<T>)) => {
    const fn = typeof patch === 'function'
      ? patch as (n: TreeNode<T>) => TreeNode<T>
      : (n: TreeNode<T>) => ({ ...n, ...patch });
    commit((current) => (current ? mapNode(current, key, fn) : current));
  }, [commit]);

  const insert = useCallback((parentKey: string, child: TreeNode<T>, at?: number) => {
    commit((current) => (current ? insertChild(current, parentKey, child, at) : current));
  }, [commit]);

  const remove = useCallback((key: string) => {
    commit((current) => (current ? dropNode(current, key) : current));
  }, [commit]);

  const move = useCallback((dragKey: string, overKey: string) => {
    if (!dragKey || dragKey === overKey) return;
    commit((current) => (current ? moveWithinSiblings(current, dragKey, overKey) : current));
  }, [commit]);

  const duplicate = useCallback((key: string) => {
    commit((current) => (current ? duplicateNode(current, key) : current));
  }, [commit]);

  const indent = useCallback((key: string) => {
    commit((current) => (current ? indentNode(current, key) : current));
  }, [commit]);

  const outdent = useCallback((key: string) => {
    commit((current) => (current ? outdentNode(current, key) : current));
  }, [commit]);

  const undo = useCallback(() => setState((s) => ({ ...s, pointer: Math.max(0, s.pointer - 1) })), []);
  const redo = useCallback(() => setState((s) => (
    { ...s, pointer: Math.min(s.entries.length - 1, s.pointer + 1) }
  )), []);

  return useMemo(() => ({
    tree, baseline, set, update, insert, remove, move, duplicate, indent, outdent,
    dirty: tree !== baseline,
    undo, redo,
    canUndo: state.pointer > 0,
    canRedo: state.pointer < state.entries.length - 1,
  }), [tree, set, update, insert, remove, move, duplicate, indent, outdent, baseline, undo, redo, state.pointer, state.entries.length]);
}
