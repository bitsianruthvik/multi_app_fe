import type { StructureNode } from '../../api/types';
import { flattenBom, parseQuantity, walkNodes, type BomRow, type Pending, type PendingPaste } from './bomModel';

export type DropPosition = 'before' | 'inside' | 'after';
export const rowRef = (row: BomRow) => row.paste?.key ?? String(row.node.lineId);

/** Drop no-op lists, including after undoing the last copy or moving back.
 * Compare against the post-copy tree: copies are inserted before arrangement
 * by the server, so their original parent must stay in a cross-parent move. */
export function pruneArrangement(pending: Pending, root?: StructureNode): Pending {
  if (!root || !pending.arrangement) return pending;
  const nodes = new Map(walkNodes(root).map((f) => [f.node.id, f.node]));
  const arrangement = Object.fromEntries(Object.entries(pending.arrangement).filter(([id, refs]) => {
    const original = [...(nodes.get(Number(id))?.children.map((n) => String(n.lineId)) ?? []), ...pending.pastes.filter((p) => p.parentId === Number(id)).map((p) => p.key)];
    return original.length !== refs.length || refs.some((ref, i) => original[i] !== ref);
  }));
  return { ...pending, arrangement };
}

/** Project pending sibling order and parent moves without mutating saved data. */
export function arrangedRows(root: StructureNode, expanded: Set<string>, pending: Pending): BomRow[] {
  const byLine = new Map(walkNodes(root).filter((f) => f.node.lineId != null).map((f) => [String(f.node.lineId), f.node]));
  const copies = new Map(pending.pastes.map((p) => [p.key, p]));
  for (const p of pending.pastes) byLine.set(p.key, { ...p.source, key: p.key, lineId: null, lineNo: null, children: [] });
  const walk = (n: StructureNode, depth: number, total: number, seen: Set<number>): StructureNode => {
    const copy = copies.get(n.key);
    const text = copy?.quantity ?? (n.lineId == null ? undefined : pending.quantity[n.lineId]);
    const quantity = text == null ? n.quantity : parseQuantity(text) ?? n.quantity;
    const ownCopies = pending.pastes.filter((p) => p.parentId === n.id).map((p) => p.key);
    const refs = copy ? [] : pending.arrangement?.[n.id] ?? [...n.children.map((c) => String(c.lineId)), ...ownCopies];
    const nextSeen = new Set(seen).add(n.id);
    const children = seen.has(n.id) ? [] : refs.flatMap((ref) => {
      // A shared assembly may appear twice. Preserve each occurrence's key
      // instead of borrowing the last occurrence from the global line map.
      const child = n.children.find((c) => String(c.lineId) === ref) ?? byLine.get(ref);
      return child ? [walk(child, depth + 1, total * quantity, nextSeen)] : [];
    });
    return { ...n, quantity, depth, total: Number((total * quantity).toFixed(6)), children };
  };
  // Root total already includes the order line quantity.
  const projected = walk(root, 0, root.total / root.quantity, new Set());
  return flattenBom(projected, expanded).map((r) => ({ ...r, paste: copies.get(r.node.key) }));
}

export function siblingRefs(parent: StructureNode, pending: Pending): string[] {
  return pending.arrangement?.[parent.id] ?? [
    ...parent.children.map((n) => String(n.lineId)),
    ...pending.pastes.filter((p) => p.parentId === parent.id).map((p) => p.key),
  ];
}

export function duplicateBelow(pending: Pending, row: BomRow, copy: PendingPaste): Pending {
  if (!row.parent) return pending;
  const order = [...siblingRefs(row.parent, pending)];
  order.splice(order.indexOf(rowRef(row)) + 1, 0, copy.key);
  return { ...pending, pastes: [...pending.pastes, copy], arrangement: { ...pending.arrangement, [row.parent.id]: order } };
}

export function moveRow(pending: Pending, source: BomRow, target: BomRow, position: DropPosition): Pending {
  const parent = position === 'inside' ? target.node : target.parent;
  if (!source.parent || !parent) return pending;
  const sourceRef = rowRef(source);
  const arrangement = { ...pending.arrangement, [source.parent.id]: siblingRefs(source.parent, pending).filter((ref) => ref !== sourceRef) };
  const order = [...(arrangement[parent.id] ?? siblingRefs(parent, pending))].filter((ref) => ref !== sourceRef);
  const index = position === 'inside' ? order.length : order.indexOf(rowRef(target)) + (position === 'after' ? 1 : 0);
  order.splice(Math.max(0, index), 0, sourceRef);
  arrangement[parent.id] = order;
  return { ...pending, arrangement };
}

export function undoCopy(pending: Pending, key: string): Pending {
  return { ...pending, pastes: pending.pastes.filter((p) => p.key !== key), arrangement: Object.fromEntries(Object.entries(pending.arrangement ?? {}).map(([id, refs]) => [id, refs.filter((ref) => ref !== key)])) };
}
