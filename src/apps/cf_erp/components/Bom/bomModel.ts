import type { BomType, BomView, Explosion, Kind, StructureNode } from '../../api/types';

/**
 * One shape for every BOM on screen. A record's BOM tab reads its own lines and
 * an order's Structure tab reads the whole structure below a line, so the two
 * answers arrive differently — here they become the same tree, and one component
 * draws both.
 */

/** What each kind of BOM may hold — the backend's ALLOWED_CHILDREN (bomService.js). */
export const ALLOWED_CHILDREN: Record<BomType, Kind[]> = {
  standard: ['catalog'],
  template: ['catalog', 'template', 'selection'],
  custom: ['catalog', 'template', 'selection'],
};

/** The BOM a record owns, from its kind — the backend's BOM_TYPE_BY_KIND. A selection holds nothing. */
export function bomTypeOfKind(kind: Kind): BomType | null {
  if (kind === 'catalog') return 'standard';
  if (kind === 'template') return 'template';
  if (kind === 'temporary') return 'custom';
  return null;
}

/** A row of the tree: the node, and everything needed to draw it and act on it. */
export interface BomRow {
  node: StructureNode;
  /** The record whose BOM holds this line. Null on the root, which is nobody's line. */
  parent: StructureNode | null;
  hasChildren: boolean;
  open: boolean;
  /** The BOM this line sits in — it decides which grant may change the line. */
  bomType: BomType | null;
}

/** The tree as rows, in tree order, with everything under a closed node left out. */
export function flattenBom(root: StructureNode, open: Set<string>): BomRow[] {
  const rows: BomRow[] = [];
  const walk = (node: StructureNode, parent: StructureNode | null) => {
    const isOpen = open.has(node.key);
    rows.push({
      node,
      parent,
      hasChildren: node.children.length > 0,
      open: isOpen,
      bomType: parent ? bomTypeOfKind(parent.kind) : null,
    });
    if (isOpen) node.children.forEach((child) => walk(child, node));
  };
  walk(root, null);
  return rows;
}

/** Every node that can be opened — what "Expand all" opens. */
export function openableKeys(root: StructureNode): string[] {
  const keys: string[] = [];
  const walk = (n: StructureNode) => { if (n.children.length) keys.push(n.key); n.children.forEach(walk); };
  walk(root);
  return keys;
}

/**
 * A record's own BOM as a one-level tree: the record is the root, its lines are
 * the rows below it. The lines' children are not read here, so nothing below
 * them opens — an order's Structure tab is where a whole structure is explored.
 */
export function bomAsTree(b: BomView): Explosion {
  const children: StructureNode[] = b.lines.map((l) => ({
    key: `l${l.id}`,
    id: l.child.id,
    code: l.child.code,
    name: l.child.name,
    kind: l.child.kind,
    status: l.child.status,
    uom: l.child.uom,
    depth: 1,
    quantity: l.quantity,
    // One of the parent, so a line's total for it is the line's own quantity.
    total: l.quantity,
    lineId: l.id,
    lineNo: l.lineNo,
    position: l.position,
    role: l.role,
    selection: l.selection,
    resolved: l.resolved,
    flow: l.effectiveFlow,
    // Whether the child has a BOM of its own is known, but not its lines — and
    // a chevron that opens nothing is worse than none.
    bom: null,
    children: [],
  }));
  const root: StructureNode = {
    key: `r${b.parent.id}`,
    id: b.parent.id,
    code: b.parent.code,
    name: b.parent.name,
    kind: b.parent.kind,
    status: b.parent.status,
    uom: null,
    depth: 0,
    quantity: 1,
    total: 1,
    lineId: null,
    lineNo: null,
    position: null,
    role: null,
    selection: null,
    resolved: true,
    flow: null,
    bom: b.bom ? { id: b.bom.id, bomType: b.bom.bomType, status: b.bom.status, revision: b.bom.revision } : null,
    children,
  };
  return {
    root,
    stats: {
      nodes: children.length + 1,
      temporary: children.filter((c) => c.kind === 'temporary').length,
      drafts: children.filter((c) => c.status === 'draft').length,
      unresolved: b.unresolvedSelections,
      maxDepth: children.length ? 1 : 0,
    },
    truncated: false,
  };
}
