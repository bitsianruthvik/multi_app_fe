import type { BomType, BomView, Explosion, Kind, Resolution, ResolvedSpec, StructureNode } from '../../api/types';
import { toInputString } from '../../lib/tree';

/**
 * One shape for every BOM on screen. A record's BOM tab reads its own lines and
 * an order's Structure tab reads the whole structure below a line, so the two
 * answers arrive differently — here they become the same tree, and one component
 * draws both.
 */

/**
 * What each kind of BOM may hold — a copy of the backend's ALLOWED_CHILDREN
 * (bomService.js), and only a fallback. `GET /records/:id/bom` answers the same
 * question for the BOM on screen, and that answer wins: this table is what the
 * add row offers for a node the server has not answered for (a node deeper in
 * an order's structure, or before the first read lands). Two copies of a rule
 * agree until one of them changes, so the copy is never asked first.
 */
export const ALLOWED_CHILDREN: Record<BomType, Kind[]> = {
  standard: ['catalog'],
  template: ['catalog', 'template', 'selection'],
  custom: ['catalog', 'template', 'selection'],
};

/**
 * What may be added under a node: the server's answer when there is one, the
 * local table otherwise — and nothing at all when the node holds no BOM, which
 * is the one case the table cannot answer (a selection definition chooses a
 * catalog item; it is made of nothing).
 */
export function allowedChildren(bomType: BomType | null, fromServer?: Kind[] | null): Kind[] {
  if (fromServer) return fromServer;
  return bomType ? ALLOWED_CHILDREN[bomType] : [];
}

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

// ── Specification values on the tree ──────────────────────────────────────────

/**
 * The grant `PUT /records/:id/values` asks for: `PERM.catalog`
 * (`routes/records.js`). Setting a value is a catalog-side write even on an
 * order's own temporary item, so the tree has to ask *this* question as well as
 * the BOM-line one — asking only `bomPermission('custom')` would offer inputs
 * whose save comes back 403.
 */
export const VALUES_PERMISSION = 'cf_erp_catalog_manage';

/** What `PUT /records/:id/values` answers with — the fresh resolution comes back with it. */
export interface SaveValuesResult {
  changes: unknown[];
  materialized: unknown;
  specs: Resolution;
}

/** One entry of `PUT /records/:id/values`. `null` clears the value. */
export interface ValueWrite { specCode: string; value: string | null }

/**
 * Can a person type this value here? The same rule as `SpecsTable.editableHere`,
 * which is itself the frontend's copy of what `valueService.setValues` refuses:
 * on an item, only `entered` and `defaulted` may be typed — `fixed` belongs to
 * the level that fixed it, and `calculated` / `rollup` / `inherited` are worked
 * out. A definition is in `setup` mode, where a Fixed value *is* set by hand
 * (that is what makes it fixed for the items below), so only the computed three
 * are closed there. Anything captured on a batch or a unit is not typed here at
 * all.
 */
export function valueEditable(s: ResolvedSpec, mode: Resolution['mode']): boolean {
  if (!s.applicable || s.captureAt !== 'item') return false;
  if (mode === 'item') return s.rule.valueRule === 'entered' || s.rule.valueRule === 'defaulted';
  return !['calculated', 'rollup', 'inherited'].includes(s.rule.valueRule);
}

/** The specs a person may fill in on this record, in the order the rules give. */
export function specsToFill(r: Resolution): ResolvedSpec[] {
  return r.specs.filter((s) => valueEditable(s, r.mode));
}

/** The applicable specs that are shown but cannot be typed — the answer is already decided. */
export function specsToShow(r: Resolution): ResolvedSpec[] {
  return r.specs.filter((s) => s.applicable && !valueEditable(s, r.mode));
}

/**
 * The value this record itself holds, as input text — `SpecsTable.ownInput`.
 * A default shown from above is not the record's own, so its input starts empty
 * (the default is offered as the field's label) and leaving it empty keeps
 * following that default.
 */
export function ownInput(s: ResolvedSpec, mode: Resolution['mode']): string {
  const own = s.value && (mode === 'setup' ? s.value.from === 'here' : s.value.source === 'entered' || s.rule.valueRule === 'entered');
  return own ? toInputString(s.value?.raw) : '';
}

/** Every editable spec of a record with the text its input starts at. */
export function baseInputs(r: Resolution): Record<string, string> {
  return Object.fromEntries(specsToFill(r).map((s) => [s.spec.code, ownInput(s, r.mode)]));
}

/** A node with the key of the node above it, so a path back to the root can be walked. */
export interface FlatNode { node: StructureNode; parentKey: string | null }

/** Every node of the tree in tree order, open or not — what a jump-to-the-next-gap walks. */
export function walkNodes(root: StructureNode): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (n: StructureNode, parentKey: string | null) => {
    out.push({ node: n, parentKey });
    n.children.forEach((c) => walk(c, n.key));
  };
  walk(root, null);
  return out;
}

/** The keys between a node and the root — what has to be open for it to be on screen. */
export function ancestorKeys(flat: FlatNode[], key: string): string[] {
  const byKey = new Map(flat.map((f) => [f.node.key, f]));
  const keys: string[] = [];
  let cur = byKey.get(key)?.parentKey ?? null;
  while (cur) { keys.push(cur); cur = byKey.get(cur)?.parentKey ?? null; }
  return keys;
}
