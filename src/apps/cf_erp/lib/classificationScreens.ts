import type { ClassificationScreen, ScreenTree, ScreenTreeNode, VisibleBecause } from '../api/types';

/**
 * Classification is managed from the screens that use it (2026-10-02). What a
 * screen shows is DERIVED by the backend — never tagged by hand: Items shows
 * the branches holding items, Definitions those holding definitions plus the
 * branches selections pick from, Machines the machine families. An empty node
 * shows where its pop-up made it. No API calls here — just the words and the
 * tree maths, so the pop-up, the pickers and the tests agree.
 */

/** The read a screen makes: its own derived tree, or (all) the whole side of it. */
export function screenTreePath(screen: ClassificationScreen, all = false): string {
  return `/classification?screen=${screen}${all ? '&all=1' : ''}`;
}

export const SCREEN_LABEL: Record<ClassificationScreen, string> = { items: 'Items', definitions: 'Definitions', machines: 'Machines' };

export const REASON_LABEL: Record<VisibleBecause, string> = {
  holds_items: 'holds items',
  holds_definitions: 'holds definitions',
  holds_machines: 'holds machines',
  selection_source: 'a selection picks from it',
  created_here: 'made here, still empty',
  legacy_empty: 'empty, made before screens had their own trees',
  machine_family: 'machine family',
  ancestor: 'leads to the branches below',
};

export function reasonText(reasons: VisibleBecause[]): string {
  return reasons.map((r) => REASON_LABEL[r] ?? r).join(' · ');
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

/** "3 items · 1 definition · 0 machines" — the same words the backend's refusal uses. */
export function holdingsText(h: { items: number; definitions: number; machines: number }): string {
  return `${plural(h.items, 'item', 'items')} · ${plural(h.definitions, 'definition', 'definitions')} · ${plural(h.machines, 'machine', 'machines')}`;
}

export const holdsAnything = (h: { items: number; definitions: number; machines: number }) => h.items + h.definitions + h.machines > 0;

/** The figure a row shows for its screen: what that screen is about, in the whole branch. */
export function screenCount(node: ScreenTreeNode, screen: ClassificationScreen): number {
  if (screen === 'items') return node.subtree.items;
  if (screen === 'definitions') return node.subtree.definitions;
  return node.subtree.machines;
}

/**
 * Who may change this screen's branches. The backend's door follows the side
 * of the tree a write touches: catalog (or setup) for items and definitions,
 * production (or setup) for machines.
 */
export function manageTagsFor(screen: ClassificationScreen): string[] {
  return screen === 'machines' ? ['cf_erp_production_manage', 'cf_erp_setup_manage'] : ['cf_erp_catalog_manage', 'cf_erp_setup_manage'];
}

/**
 * The tree cut down to nodes whose name or code matches, with the chain above
 * each match kept so it can be reached. Returns the ids to open as well.
 */
export function searchTree(roots: ScreenTreeNode[], query: string): { roots: ScreenTreeNode[]; open: Set<number> } {
  const q = query.trim().toLowerCase();
  const open = new Set<number>();
  if (!q) return { roots, open };
  const walk = (n: ScreenTreeNode): ScreenTreeNode | null => {
    const kids = n.children.map(walk).filter((c): c is ScreenTreeNode => !!c);
    const hit = n.name.toLowerCase().includes(q) || n.code.toLowerCase().includes(q);
    if (!hit && !kids.length) return null;
    if (kids.length) open.add(n.id);
    return { ...n, children: kids };
  };
  return { roots: roots.map(walk).filter((r): r is ScreenTreeNode => !!r), open };
}

export function findScreenNode(roots: ScreenTreeNode[], id: number | null): ScreenTreeNode | null {
  if (id == null) return null;
  for (const n of roots) {
    if (n.id === id) return n;
    const hit = findScreenNode(n.children, id);
    if (hit) return hit;
  }
  return null;
}

export function pathOf(roots: ScreenTreeNode[], id: number, trail: ScreenTreeNode[] = []): ScreenTreeNode[] | null {
  for (const n of roots) {
    if (n.id === id) return [...trail, n];
    const hit = pathOf(n.children, id, [...trail, n]);
    if (hit) return hit;
  }
  return null;
}

/**
 * Where a node may move: a live node one level up, on the same side of the
 * machine line, not its current parent. Read from the WHOLE side of the tree
 * (?all=1), so a parent this screen does not show is still a destination.
 */
export function moveTargets(tree: ScreenTree | null, node: ScreenTreeNode): { id: number; path: string }[] {
  if (!tree || node.depth === 0) return [];
  const out: { id: number; path: string }[] = [];
  const walk = (n: ScreenTreeNode, trail: string[]) => {
    const path = [...trail, n.name];
    if (n.depth === node.depth - 1 && n.id !== node.parentId && (n.scope === 'machine') === (node.scope === 'machine')) out.push({ id: n.id, path: path.join(' › ') });
    if (n.depth < node.depth - 1) n.children.forEach((c) => walk(c, path));
  };
  tree.roots.forEach((r) => walk(r, []));
  return out;
}
