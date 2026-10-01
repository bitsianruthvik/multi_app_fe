/**
 * The plan as a tree of rows — order › line › the units the plan schedules (girder lines, a span,
 * lots …) › what is inside each unit (read-only: it rides with its unit). Pure; the grid renders it.
 *
 * Which rows are open is an ExpandState: a LEVEL (how many row depths are open by default) plus
 * the rows toggled against it. "Expand to level N" sets the level and forgets the toggles.
 * Row depth: order 0, line 1, plan unit 2, inside a unit 3, 4 …
 */
import type { Evaluation, PlannerSnapshot, PlannerUnit } from '../../lib/planner/types';

export type RowKind = 'order' | 'line' | 'unit' | 'child';

export interface TreeRow {
  id: string;
  kind: RowKind;
  depth: number;
  orderId: string;
  lineId?: string;
  /** unit rows and child rows */
  unitKey?: string;
  /** child rows: the plan unit they ride with */
  carrierKey?: string;
  hasChildren: boolean;
  open: boolean;
}

export interface ExpandState {
  /** rows at depth < level − 1 are open unless toggled closed; 3 = orders, lines and units showing */
  level: number;
  open: string[];
  closed: string[];
}

export const DEFAULT_EXPAND: ExpandState = { level: 3, open: [], closed: [] };
export const EXPAND_ALL = 99;
const MAX_TOGGLES = 3000;

export function isOpen(e: ExpandState, id: string, depth: number): boolean {
  return openTest(e)(id, depth);
}

/** isOpen for many rows at once (sets built once). */
export function openTest(e: ExpandState): (id: string, depth: number) => boolean {
  const open = new Set(e.open), closed = new Set(e.closed);
  return (id, depth) => (open.has(id) ? true : closed.has(id) ? false : depth < e.level - 1);
}

/** Flip one row against the level. */
export function toggle(e: ExpandState, id: string, depth: number): ExpandState {
  const now = isOpen(e, id, depth);
  const byLevel = depth < e.level - 1;
  const open = e.open.filter((x) => x !== id);
  const closed = e.closed.filter((x) => x !== id);
  if (!now !== byLevel) (now ? closed : open).push(id);
  return { level: e.level, open: open.slice(-MAX_TOGGLES), closed: closed.slice(-MAX_TOGGLES) };
}

export const toLevel = (level: number): ExpandState => ({ level, open: [], closed: [] });

/** Read / write the state per device (localStorage may be missing or throw — then the default). */
export function loadExpand(storageKey: string): ExpandState {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_EXPAND;
    const v = JSON.parse(raw);
    if (typeof v?.level !== 'number') return DEFAULT_EXPAND;
    return { level: v.level, open: Array.isArray(v.open) ? v.open.map(String) : [], closed: Array.isArray(v.closed) ? v.closed.map(String) : [] };
  } catch { return DEFAULT_EXPAND; }
}
export function saveExpand(storageKey: string, e: ExpandState) {
  try { window.localStorage.setItem(storageKey, JSON.stringify(e)); } catch { /* private window: not remembered */ }
}

/** Children of every unit key (a line unit's children are its line's top pieces). */
export function childIndex(snapshot: PlannerSnapshot): Map<string, PlannerUnit[]> {
  const out = new Map<string, PlannerUnit[]>();
  const lineUnit = new Map<string, string>();
  for (const u of snapshot.units) if (u.pieceId == null) lineUnit.set(String(u.lineId), u.key);
  for (const u of snapshot.units) {
    const p = u.parentKey ?? (u.pieceId != null ? lineUnit.get(String(u.lineId)) ?? null : null);
    if (!p) continue;
    const list = out.get(p);
    if (list) list.push(u); else out.set(p, [u]);
  }
  return out;
}

/**
 * The visible rows. Plan units of a line are the evaluation's active units, in planning order
 * (`prio`); a unit's inside comes from `children`.
 */
export function buildRows(snapshot: PlannerSnapshot, evaluation: Evaluation, prio: Map<string, number>, children: Map<string, PlannerUnit[]>, expand: ExpandState): TreeRow[] {
  const byLine = new Map<string, string[]>();
  const units = new Map(snapshot.units.map((u) => [u.key, u]));
  for (const key of Object.keys(evaluation.units)) {
    const u = units.get(key);
    if (!u) continue;
    const l = String(u.lineId);
    const list = byLine.get(l);
    if (list) list.push(key); else byLine.set(l, [key]);
  }
  for (const list of byLine.values()) list.sort((a, b) => (prio.get(a) ?? 0) - (prio.get(b) ?? 0));

  const rows: TreeRow[] = [];
  const isOpenRow = openTest(expand);
  const addInside = (key: string, carrier: string, depth: number) => {
    for (const c of children.get(key) ?? []) {
      const id = `u:${c.key}`;
      const has = (children.get(c.key)?.length ?? 0) > 0;
      const open = has && isOpenRow(id, depth);
      rows.push({ id, kind: 'child', depth, orderId: String(c.orderId), lineId: String(c.lineId), unitKey: c.key, carrierKey: carrier, hasChildren: has, open });
      if (open) addInside(c.key, carrier, depth + 1);
    }
  };
  for (const o of snapshot.orders) {
    const oid = `o:${o.id}`;
    const lines = o.lines.filter((l) => byLine.has(String(l.id)));
    const oOpen = lines.length > 0 && isOpenRow(oid, 0);
    rows.push({ id: oid, kind: 'order', depth: 0, orderId: String(o.id), hasChildren: lines.length > 0, open: oOpen });
    if (!oOpen) continue;
    for (const l of lines) {
      const lid = `l:${l.id}`;
      const keys = byLine.get(String(l.id)) ?? [];
      const lOpen = keys.length > 0 && isOpenRow(lid, 1);
      rows.push({ id: lid, kind: 'line', depth: 1, orderId: String(o.id), lineId: String(l.id), hasChildren: keys.length > 0, open: lOpen });
      if (!lOpen) continue;
      for (const key of keys) {
        const id = `u:${key}`;
        const has = (children.get(key)?.length ?? 0) > 0;
        const open = has && isOpenRow(id, 2);
        rows.push({ id, kind: 'unit', depth: 2, orderId: String(o.id), lineId: String(l.id), unitKey: key, hasChildren: has, open });
        if (open) addInside(key, key, 3);
      }
    }
  }
  return rows;
}

/** How deep the tree can go (for the "expand to" menu): 3 + the deepest inside of any plan unit. */
export function maxTreeDepth(evaluation: Evaluation, children: Map<string, PlannerUnit[]>): number {
  const depthOf = (key: string): number => {
    const kids = children.get(key);
    if (!kids?.length) return 0;
    let d = 0;
    for (const c of kids) d = Math.max(d, 1 + depthOf(c.key));
    return d;
  };
  let inside = 0;
  for (const key of Object.keys(evaluation.units)) inside = Math.max(inside, depthOf(key));
  return 3 + inside;
}
