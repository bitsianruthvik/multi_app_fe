import type { StructureNode } from '../api/types';
import type { ValuesCell, ValuesColumn, ValuesView } from '../components/Values/valuesModel';
import type { LinkChoiceValue, LinksBlock } from '../api/links';

/**
 * Linked copies ("same design"): what the screen works out from the server's `links` block and
 * from the changes waiting to be saved. Pure — no React, no requests. The server decides what
 * "the same design" is; this only reads its answer and says which waiting changes reach rows
 * that have copies (so Save can ask once), and what each choice would send.
 */

// ── what one row says ─────────────────────────────────────────────────────────

export type LinkState =
  /** Copies of each other. `others` = the rows that are the same as this one. */
  | { kind: 'linked'; group: string; members: number[]; others: number }
  /** Identical to these rows but not linked — offered, never done by itself. */
  | { kind: 'suggest'; others: number[] }
  /** A person said "keep this one apart". */
  | { kind: 'apart' }
  | { kind: 'none' };

export const NO_LINK: LinkState = { kind: 'none' };

export function linkState(links: LinksBlock | null | undefined, recordId: number): LinkState {
  const info = links?.rows?.[String(recordId)];
  if (!info) return NO_LINK;
  if ('g' in info) {
    const members = links?.groups?.[info.g] ?? [];
    const others = Math.max(0, (members.length || info.n) - 1);
    return others > 0 ? { kind: 'linked', group: info.g, members, others } : NO_LINK;
  }
  if ('same' in info) return info.same.length ? { kind: 'suggest', others: info.same } : NO_LINK;
  return info.apart ? { kind: 'apart' } : NO_LINK;
}

/** The chip's words. */
export const linkedTitle = (others: number): string => `Same design as ${others} other ${others === 1 ? 'row' : 'rows'} — click to see them`;
export const suggestTitle = (others: number): string => `Identical to ${others} other ${others === 1 ? 'row' : 'rows'} — link them`;
export const CHANGING_TITLE = 'You are changing this row. When you save, you choose whether its copies change too.';

// ── what is waiting ───────────────────────────────────────────────────────────

/** The keys a choice is kept under: one per value typed, per quantity, per removal. */
export const valueKey = (recordId: number, specCode: string): string => `v:${recordId}:${specCode}`;
export const quantityKey = (lineId: number): string => `q:${lineId}`;
export const removeKey = (lineId: number): string => `r:${lineId}`;

/** One waiting change that reaches rows that have copies. */
export interface LinkTouch {
  key: string;
  kind: 'value' | 'quantity' | 'remove';
  /** The row the change is on. */
  recordId: number;
  label: string;
  /** "Thickness 25 → 30", "Quantity 2 → 3", "Remove". */
  what: string;
  /** How many other rows share the design this change is on. */
  copies: number;
  /** The record ids of that group (this design row included). */
  members: number[];
  /** The group key, for the server. */
  group: string;
  /** A value: the variable's code. A quantity or a removal: the line. */
  specCode?: string;
  lineId?: number;
}

/** A row above a change that will stop matching its copies if the copies are left alone. */
export interface LinkAbove { recordId: number; label: string; copies: number }

export interface TouchContext {
  links: LinksBlock | null | undefined;
  /** Every node of the tree (bomModel.walkNodes). */
  flat: { node: StructureNode; parentKey: string | null }[];
  byLine: ReadonlyMap<number, StructureNode>;
  /** How a typed value reads: "Thickness 25 → 30". */
  describeValue?: (recordId: number, specCode: string, to: string) => string;
}

/** The bits of the pending state this file reads (the full Pending is bomModel's). */
export interface PendingForLinks {
  values?: Record<number, Record<string, string>>;
  quantity: Record<number, string>;
  remove: Record<number, true>;
  linkChoice?: Record<string, LinkChoiceValue>;
}

const same = (a: string, b: string) => a.trim() === b.trim();

/** The linked rows among a node and everything above it — what a change to that node's design makes differ from its copies. */
export function linkedFrom(flat: TouchContext['flat'], startKey: string, links: LinksBlock | null | undefined, includeSelf = true): LinkAbove[] {
  const byKey = new Map(flat.map((f) => [f.node.key, f]));
  const out: LinkAbove[] = [];
  const seen = new Set<number>();
  let cur: string | null = startKey, first = true;
  while (cur) {
    const f = byKey.get(cur);
    if (!f) break;
    if (!(first && !includeSelf) && !seen.has(f.node.id)) {
      const st = linkState(links, f.node.id);
      if (st.kind === 'linked') { out.push({ recordId: f.node.id, label: f.node.name, copies: st.others }); seen.add(f.node.id); }
    }
    first = false;
    cur = f.parentKey;
  }
  return out;
}

/**
 * Which waiting changes reach rows that have copies, and which rows above them will stop matching.
 *  - a typed value: asks for the row's own copies — unless every copy was given the same value (nothing to ask);
 *  - a quantity or a removal: the line belongs to its PARENT's design, so it asks for the parent's copies.
 * `unanimous` lists the keys that need no question and are sent as "all copies".
 */
export function touchedByPending(p: PendingForLinks, c: TouchContext): { touches: LinkTouch[]; above: LinkAbove[]; unanimous: string[] } {
  const touches: LinkTouch[] = [], unanimous: string[] = [];
  if (!c.links) return { touches, above: [], unanimous };
  const byKey = new Map(c.flat.map((f) => [f.node.key, f]));
  const byRecord = new Map<number, StructureNode>();
  for (const f of c.flat) if (!byRecord.has(f.node.id)) byRecord.set(f.node.id, f.node);
  const startKeys: string[] = [];

  for (const [id, cells] of Object.entries(p.values ?? {})) {
    const recordId = Number(id), st = linkState(c.links, recordId);
    if (st.kind !== 'linked') continue;
    const node = byRecord.get(recordId);
    for (const [code, text] of Object.entries(cells)) {
      // The same value given to every copy: it stays the same design, so nobody is asked.
      if (st.members.length > 1 && st.members.every((m) => p.values?.[m]?.[code] !== undefined && same(p.values[m][code], text))) { unanimous.push(valueKey(recordId, code)); continue; }
      touches.push({ key: valueKey(recordId, code), kind: 'value', recordId, label: node?.name ?? `Row ${recordId}`, what: c.describeValue?.(recordId, code, text) ?? `${code} → ${text.trim() || 'empty'}`, copies: st.others, members: st.members, group: st.group, specCode: code });
      if (node) startKeys.push(node.key);
    }
  }

  const holder = (lineId: number): { line: StructureNode; parent: StructureNode | null } | null => {
    const line = c.byLine.get(lineId);
    if (!line) return null;
    const pk = c.flat.find((f) => f.node.key === line.key)?.parentKey;
    return { line, parent: pk ? byKey.get(pk)?.node ?? null : null };
  };
  for (const [id, text] of Object.entries(p.quantity)) {
    const h = holder(Number(id));
    if (!h?.parent) continue;
    const q = Number(text);
    if (!Number.isFinite(q) || q <= 0 || Math.abs(q - h.line.quantity) < 1e-9) continue;
    const st = linkState(c.links, h.parent.id);
    if (st.kind !== 'linked') continue;
    touches.push({ key: quantityKey(Number(id)), kind: 'quantity', recordId: h.line.id, label: h.line.name, what: `Quantity ${h.line.quantity} → ${text.trim()} in ${h.parent.name}`, copies: st.others, members: st.members, group: st.group, lineId: Number(id) });
    startKeys.push(h.parent.key);
  }
  for (const id of Object.keys(p.remove)) {
    const h = holder(Number(id));
    if (!h?.parent) continue;
    const st = linkState(c.links, h.parent.id);
    if (st.kind !== 'linked') continue;
    touches.push({ key: removeKey(Number(id)), kind: 'remove', recordId: h.line.id, label: h.line.name, what: `Remove from ${h.parent.name}`, copies: st.others, members: st.members, group: st.group, lineId: Number(id) });
    startKeys.push(h.parent.key);
  }

  // The rows above the changes that have copies: they stop matching them unless the copies change as well.
  const touched = new Set(touches.map((t) => t.recordId));
  const touchedGroups = new Set(touches.map((t) => t.group));
  const above: LinkAbove[] = [];
  const seen = new Set<number>();
  for (const start of startKeys) {
    for (const a of linkedFrom(c.flat, start, c.links, true)) {
      if (seen.has(a.recordId) || touched.has(a.recordId)) continue;
      const st = linkState(c.links, a.recordId);
      if (st.kind === 'linked' && touchedGroups.has(st.group)) continue;   // asked about already, as the group being changed
      seen.add(a.recordId); above.push(a);
    }
  }
  return { touches, above, unanimous };
}

/** The touches nobody has decided yet. */
export const undecided = (touches: LinkTouch[], choice: Record<string, LinkChoiceValue> | undefined): LinkTouch[] => touches.filter((t) => !choice?.[t.key]);

/** Every touch given the same answer. */
export const chooseAll = (touches: LinkTouch[], value: LinkChoiceValue, into: Record<string, LinkChoiceValue> = {}): Record<string, LinkChoiceValue> => {
  const out = { ...into };
  for (const t of touches) out[t.key] = value;
  return out;
};

/** "5 pieces", "1 piece". */
export const piecesWords = (n: number): string => `${n.toLocaleString('en-US')} ${n === 1 ? 'piece' : 'pieces'}`;

/** "3 rows are no longer the same as their copies." */
export const brokenSentence = (n: number): string => `${n} ${n === 1 ? 'row is' : 'rows are'} no longer the same as ${n === 1 ? 'its' : 'their'} copies.`;

/** The words for a row that is about to differ from its copies (before an immediate action). */
export function breakWords(rows: LinkAbove[]): string {
  const names = rows.map((r) => r.label).join(', ');
  return rows.length === 1
    ? `${names} is the same design as ${rows[0].copies} other ${rows[0].copies === 1 ? 'row' : 'rows'}. This makes it different from them, so they stop being copies.`
    : `${names} are the same design as other rows. This makes them different from their copies, so they stop being copies.`;
}

// ── reading the values view ───────────────────────────────────────────────────

/** What a record's cell holds now, and how a change to it reads ("Thickness 25 → 30"). */
export function valueReader(view: ValuesView | null | undefined) {
  const rows = new Map<number, { cols: Map<string, ValuesColumn>; cells: Record<string, ValuesCell> }>();
  for (const g of view?.groups ?? []) {
    const cols = new Map(g.columns.map((c) => [c.code, c]));
    for (const r of g.rows) if (!rows.has(r.id)) rows.set(r.id, { cols, cells: r.cells });
  }
  const show = (recordId: number, code: string, v: string): string => {
    if (v.trim() === '') return 'empty';
    const e = rows.get(recordId), col = e?.cols.get(code);
    const key = e?.cells[code]?.options ?? col?.options;
    const opt = key ? view?.optionLists[key]?.find((o) => String(o.id) === v) : undefined;
    if (opt) return opt.label || opt.value;
    if (col?.dataType === 'boolean') return v === 'true' ? 'Yes' : 'No';
    return v.trim();
  };
  return {
    /** The value the record holds now, as the cell edits it. */
    saved: (recordId: number, code: string): string => rows.get(recordId)?.cells[code]?.input ?? '',
    describe: (recordId: number, code: string, to: string): string => {
      const name = rows.get(recordId)?.cols.get(code)?.name ?? code;
      return `${name} ${show(recordId, code, rows.get(recordId)?.cells[code]?.input ?? '')} → ${show(recordId, code, to)}`;
    },
  };
}
