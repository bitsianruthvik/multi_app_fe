import type { BomType, BomView, Explosion, Kind, Resolution, ResolvedSpec, StructureNode } from '../../api/types';
import type { BomChange } from '../../api/bomChanges';
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
  /** Edit mode: a copy waiting to be saved, drawn where it will go. It has no line yet. */
  paste?: PendingPaste;
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
    // Only the FIRST level is known from `/bom`. This shape is now the fallback
    // that fills the tab while `/bom/tree` is on its way — useBom swaps in the
    // full explosion as soon as it lands. Until then no chevron is drawn, because
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

// ── Edit mode ─────────────────────────────────────────────────────────────────
//
// Changes pile up here and nothing reaches the server until Save sends them
// all at once (POST /bom-changes). The rules the server applies are its own;
// what is mirrored below is only what lets the screen say "not here" before
// it is asked, never what decides.

/** A paste waiting to be saved: a copy of one line, going under one node. */
export interface PendingPaste {
  /** The row's key while it is pending. */
  key: string;
  sourceLineId: number;
  /** The node that was copied, as it was when Copy was pressed. */
  source: StructureNode;
  /** The record it goes under, and that record's node in the tree. */
  parentId: number;
  parentKey: string;
  /** The text in its quantity field. */
  quantity: string;
}

/** Everything edit mode holds, keyed by BOM line id. */
export interface Pending {
  /** The text typed in a line's quantity field. */
  quantity: Record<number, string>;
  /** The flow chosen for a line; null goes back to the way the child is usually made. */
  flow: Record<number, number | null>;
  remove: Record<number, true>;
  pastes: PendingPaste[];
}

export const NO_PENDING: Pending = { quantity: {}, flow: {}, remove: {}, pastes: [] };

/** A quantity as typed, or null when it is not one — the server's rule: above zero, below a billion. */
export function parseQuantity(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const q = Number(t);
  if (!Number.isFinite(q) || q <= 0 || q >= 1e9) return null;
  return Number(q.toFixed(6));
}

/** The flow a line names for its child — not the one it falls back to when it names none. */
export const lineFlowId = (node: StructureNode): number | null => (node.flow?.from === 'line' ? node.flow.id : null);

const sameNumber = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** Every node of the tree by its BOM line id. */
export function nodesByLine(root: StructureNode): Map<number, StructureNode> {
  const out = new Map<number, StructureNode>();
  const walk = (n: StructureNode) => { if (n.lineId != null && !out.has(n.lineId)) out.set(n.lineId, n); n.children.forEach(walk); };
  walk(root);
  return out;
}

/**
 * What Save sends: only what differs from what is saved. `invalid` holds the
 * row keys whose quantity field does not hold a quantity — those cannot be
 * sent, and Save waits for them.
 */
export function pendingChanges(p: Pending, byLine: Map<number, StructureNode>): { changes: BomChange[]; invalid: string[] } {
  const changes: BomChange[] = [];
  const invalid: string[] = [];
  for (const pasted of p.pastes) {
    const q = parseQuantity(pasted.quantity);
    if (q == null) { invalid.push(pasted.key); continue; }
    changes.push({ op: 'paste', sourceLineId: pasted.sourceLineId, parentId: pasted.parentId, ...(sameNumber(q, pasted.source.quantity) ? {} : { quantity: q }) });
  }
  for (const [id, text] of Object.entries(p.quantity)) {
    const node = byLine.get(Number(id));
    if (!node) continue;
    const q = parseQuantity(text);
    if (q == null) { invalid.push(node.key); continue; }
    if (!sameNumber(q, node.quantity)) changes.push({ op: 'quantity', lineId: Number(id), quantity: q });
  }
  for (const [id, flowId] of Object.entries(p.flow)) {
    const node = byLine.get(Number(id));
    if (node && (flowId ?? null) !== lineFlowId(node)) changes.push({ op: 'flow', lineId: Number(id), flowId: flowId ?? null });
  }
  for (const id of Object.keys(p.remove)) if (byLine.has(Number(id))) changes.push({ op: 'remove', lineId: Number(id) });
  return { changes, invalid };
}

/** Every key below a node (not the node itself). */
export function keysBelow(node: StructureNode, into = new Set<string>()): Set<string> {
  node.children.forEach((k) => { into.add(k.key); keysBelow(k, into); });
  return into;
}

/** Temporary items under (and including) a node — what a removal deletes with it. */
export function temporaryCount(node: StructureNode): number {
  return (node.kind === 'temporary' ? 1 : 0) + node.children.reduce((n, k) => n + temporaryCount(k), 0);
}

/**
 * The tree as rows in edit mode: `flattenBom`, with each pending paste drawn
 * as the last child of the node it goes into, and every total worked out
 * again from the quantities being typed — so "in total" answers the question
 * while it is still being asked.
 */
export function flattenForEdit(root: StructureNode, open: Set<string>, pastes: PendingPaste[], qtyOf: (node: StructureNode) => number): BomRow[] {
  const rows: BomRow[] = [];
  const byParent = new Map<string, PendingPaste[]>();
  for (const p of pastes) {
    if (!byParent.has(p.parentKey)) byParent.set(p.parentKey, []);
    byParent.get(p.parentKey)?.push(p);
  }
  const round = (n: number) => Number(n.toFixed(6));
  const walk = (node: StructureNode, parent: StructureNode | null, total: number) => {
    const own = byParent.get(node.key) ?? [];
    const isOpen = open.has(node.key);
    rows.push({
      node: { ...node, total: round(total) },
      parent,
      hasChildren: node.children.length > 0 || own.length > 0,
      open: isOpen,
      bomType: parent ? bomTypeOfKind(parent.kind) : null,
    });
    if (!isOpen) return;
    node.children.forEach((child) => walk(child, node, total * qtyOf(child)));
    for (const p of own) {
      const q = parseQuantity(p.quantity) ?? p.source.quantity;
      rows.push({
        node: { ...p.source, key: p.key, depth: node.depth + 1, lineId: null, lineNo: null, position: null, quantity: q, total: round(total * q), children: [] },
        parent: node,
        hasChildren: false,
        open: false,
        bomType: bomTypeOfKind(node.kind),
        paste: p,
      });
    }
  };
  walk(root, null, root.total);
  return rows;
}

/**
 * Why a copied line may not go under a node, or null when it may — the
 * server's rules (bomChangeService), asked here only so the Paste button
 * appears where a paste can work. A Custom BOM takes a copy of anything but a
 * template line; a Template or Standard BOM takes what it may hold; nothing
 * goes under itself.
 */
export function pasteRefusal(source: StructureNode, sourceKey: string, target: StructureNode, flat: FlatNode[]): string | null {
  const targetType = bomTypeOfKind(target.kind);
  if (!targetType) return `${target.code ?? target.name} holds no BOM.`;
  if (targetType === 'custom' ? source.kind === 'template' : !ALLOWED_CHILDREN[targetType].includes(source.kind)) {
    return targetType === 'standard' ? 'A Standard BOM holds catalog items only.'
      : targetType === 'template' ? 'A Template BOM holds catalog items and definitions — temporary items belong to one order.'
        : 'A template becomes a temporary item when it is added — use Add line.';
  }
  if (target.id === source.id || target.key === sourceKey) return 'A thing cannot go under itself.';
  if (ancestorKeys(flat, target.key).includes(sourceKey)) return `${target.code ?? target.name} is inside what was copied — a thing cannot go under itself.`;
  return null;
}
