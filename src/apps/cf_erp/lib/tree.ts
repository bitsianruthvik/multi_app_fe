import type { Tree, TreeNode } from '../api/types';

export interface FlatNode {
  id: number;
  depth: number;
  level: string;
  code: string;
  name: string;
  path: string;
  family: string;
  scope: TreeNode['scope'];
  status: string;
  isLeaf: boolean;
}

/** Flattens the classification tree into rows with their full path, in tree order. */
export function flattenTree(tree: Tree | null): FlatNode[] {
  if (!tree) return [];
  const out: FlatNode[] = [];
  const walk = (node: TreeNode, trail: string[]) => {
    const path = [...trail, node.name];
    out.push({
      id: node.id, depth: node.depth, level: node.level, code: node.code, name: node.name, path: path.join(' › '),
      family: path[0], scope: node.scope, status: node.status, isLeaf: node.depth === tree.leafDepth,
    });
    node.children.forEach((c) => walk(c, path));
  };
  tree.roots.forEach((r) => walk(r, []));
  return out;
}

/** A stored raw value as the string an input edits. */
export function toInputString(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'boolean') return raw ? 'true' : 'false';
  if (typeof raw === 'object') return JSON.stringify(raw);
  return String(raw);
}

/** One node of the classification tree by id, however deep. */
export function findNode(roots: TreeNode[], id: number): TreeNode | null {
  for (const r of roots) {
    if (r.id === id) return r;
    const hit = findNode(r.children, id);
    if (hit) return hit;
  }
  return null;
}
