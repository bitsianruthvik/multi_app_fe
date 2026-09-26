import type { PieceCodeHole, PieceCodeNode, PieceCodesPreview } from '../../api/pieceCodes';

/**
 * The piece-code tree as rows. Pure, so the card can recompute it on every
 * keystroke: a two-span bridge is ~6,000 nodes, and nothing here is worse than
 * one pass over them.
 *
 * Nodes arrive in the order release writes them — a parent before its
 * children, siblings as the rows are shown (pre-order) — and `k` is each one's
 * place in that list. Everything below leans on that order.
 */

/** Children shown under one parent before a "show more" row. */
export const CHILD_PAGE = 100;
/** Matches shown for a search before a "show more" row. */
export const MATCH_PAGE = 200;
/** The top of the tree, as a key for its page count. */
export const TOP = -1;

export interface PieceIndex {
  nodes: PieceCodeNode[];
  /** Children of each node, in order. */
  kids: number[][];
  tops: number[];
  /**
   * Lower-case text a search looks in: the piece's code and its item's name.
   * Not the item's own code: a copied row's item is "…-IS24-26", so its pieces
   * IS25 and IS26 would turn up for "IS24" with nothing on screen saying why.
   */
  hay: string[];
  duplicate: Uint8Array;
  taken: Uint8Array;
  hole: Map<number, PieceCodeHole>;
}

export function indexPieces(p: PieceCodesPreview): PieceIndex {
  const n = p.nodes.length;
  const kids: number[][] = Array.from({ length: n }, () => []);
  const tops: number[] = [];
  const hay: string[] = new Array(n);
  const dup = new Set(p.duplicates);
  const taken = new Set(p.taken);
  const duplicate = new Uint8Array(n);
  const takenAt = new Uint8Array(n);
  for (const node of p.nodes) {
    if (node.parentK == null) tops.push(node.k); else kids[node.parentK].push(node.k);
    const item = p.items[String(node.itemId)];
    hay[node.k] = `${node.code}\u0000${item?.name ?? ''}`.toLowerCase();
    if (dup.has(node.code)) duplicate[node.k] = 1;
    if (taken.has(node.code)) takenAt[node.k] = 1;
  }
  return { nodes: p.nodes, kids, tops, hay, duplicate, taken: takenAt, hole: new Map(p.missing.map((m) => [m.k, m])) };
}

export type PieceRow =
  | { kind: 'node'; k: number; depth: number; open: boolean; hasKids: boolean; match: boolean }
  /** More children of `parentK` (TOP for the top of the tree) than are shown. */
  | { kind: 'more'; parentK: number; depth: number; shown: number; total: number }
  /** More matches than are shown. */
  | { kind: 'moreMatches'; depth: number; shown: number; total: number };

/**
 * The tree as a person has opened it: top pieces first, a node's children
 * only while it is open, CHILD_PAGE of them at a time (`pages` raises that per
 * parent). Only what is on screen is walked, so a closed 6,000-node tree costs
 * its top rows and nothing more.
 */
export function treeRows(ix: PieceIndex, open: ReadonlySet<number>, pages: ReadonlyMap<number, number>): PieceRow[] {
  const rows: PieceRow[] = [];
  const walk = (list: number[], parentK: number, depth: number) => {
    const limit = pages.get(parentK) ?? CHILD_PAGE;
    const shown = Math.min(list.length, limit);
    for (let i = 0; i < shown; i++) {
      const k = list[i];
      const hasKids = ix.kids[k].length > 0;
      const isOpen = hasKids && open.has(k);
      rows.push({ kind: 'node', k, depth, open: isOpen, hasKids, match: false });
      if (isOpen) walk(ix.kids[k], k, depth + 1);
    }
    if (list.length > shown) rows.push({ kind: 'more', parentK, depth, shown, total: list.length });
  };
  walk(ix.tops, TOP, 0);
  return rows;
}

/** Search words: every one must appear, in any order ("span-01-2 is24"). */
export const searchTerms = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

/**
 * A search: every node whose code or item holds all the words, with the
 * ancestors that lead to it, in tree order — the first `limit` matches.
 * Ancestors are found in one backward pass: in pre-order a child always comes
 * after its parent, so "something below matched" can be handed up as it goes.
 */
export function searchRows(ix: PieceIndex, terms: string[], limit: number): { rows: PieceRow[]; matches: number } {
  const n = ix.nodes.length;
  const match = new Uint8Array(n);
  let matches = 0;
  for (let k = 0; k < n; k++) {
    const text = ix.hay[k];
    if (terms.every((t) => text.includes(t))) { match[k] = 1; matches += 1; }
  }
  const below = new Uint8Array(n);
  for (let k = n - 1; k >= 0; k--) {
    const parent = ix.nodes[k].parentK;
    if ((match[k] || below[k]) && parent != null) below[parent] = 1;
  }
  const rows: PieceRow[] = [];
  let shown = 0;
  for (let k = 0; k < n; k++) {
    if (!match[k] && !below[k]) continue;
    if (match[k]) {
      if (shown >= limit) break;
      shown += 1;
    }
    rows.push({ kind: 'node', k, depth: ix.nodes[k].depth, open: below[k] === 1, hasKids: ix.kids[k].length > 0, match: match[k] === 1 });
  }
  // Ancestors laid down for matches past the limit would lead nowhere.
  while (rows.length) {
    const last = rows[rows.length - 1];
    if (last.kind === 'node' && !last.match) rows.pop(); else break;
  }
  if (matches > shown) rows.push({ kind: 'moreMatches', depth: 0, shown, total: matches });
  return { rows, matches };
}

/** Every ancestor of a node, nearest first. */
export function ancestorsOf(ix: PieceIndex, k: number): number[] {
  const out: number[] = [];
  let p = ix.nodes[k]?.parentK ?? null;
  while (p != null) { out.push(p); p = ix.nodes[p].parentK; }
  return out;
}

/**
 * What it takes to show a node in the whole tree: its ancestors open, and each
 * ancestor's page of children long enough to reach the next one down.
 */
export function revealPlan(ix: PieceIndex, k: number, pages: ReadonlyMap<number, number>): { open: number[]; pages: Map<number, number> } {
  const chain = ancestorsOf(ix, k);
  const next = new Map(pages);
  let child = k;
  for (const parent of chain) {
    const at = ix.kids[parent].indexOf(child);
    if (at >= (next.get(parent) ?? CHILD_PAGE)) next.set(parent, Math.ceil((at + 1) / CHILD_PAGE) * CHILD_PAGE);
    child = parent;
  }
  const atTop = ix.tops.indexOf(child);
  if (atTop >= (next.get(TOP) ?? CHILD_PAGE)) next.set(TOP, Math.ceil((atTop + 1) / CHILD_PAGE) * CHILD_PAGE);
  return { open: chain, pages: next };
}

/** How many nodes sit below one — for "54 parts" on a closed row. */
export function subtreeSizes(ix: PieceIndex): Int32Array {
  const n = ix.nodes.length;
  const size = new Int32Array(n);
  for (let k = n - 1; k >= 0; k--) {
    const parent = ix.nodes[k].parentK;
    if (parent != null) size[parent] += size[k] + 1;
  }
  return size;
}

/**
 * A code cut into what it inherits from its parent and what it adds, and the
 * search words marked — so a row reads "…-G1-1" + "-IS24" at a glance.
 */
export interface CodePart { text: string; inherited: boolean; mark: boolean }

export function codeParts(code: string, parentCode: string | null, terms: string[]): CodePart[] {
  const inheritedLen = parentCode && code.length > parentCode.length && code.startsWith(parentCode) ? parentCode.length : 0;
  const marked = markedRanges(code, terms);
  const cuts = new Set<number>([0, code.length, inheritedLen]);
  for (const [a, b] of marked) { cuts.add(a); cuts.add(b); }
  const points = [...cuts].sort((a, b) => a - b);
  const parts: CodePart[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    if (a === b) continue;
    parts.push({ text: code.slice(a, b), inherited: b <= inheritedLen, mark: marked.some(([x, y]) => a >= x && b <= y) });
  }
  return parts;
}

/** Plain text with the search words marked. */
export function textParts(text: string, terms: string[]): { text: string; mark: boolean }[] {
  const marked = markedRanges(text, terms);
  if (!marked.length) return [{ text, mark: false }];
  const out: { text: string; mark: boolean }[] = [];
  let at = 0;
  for (const [a, b] of marked) {
    if (a > at) out.push({ text: text.slice(at, a), mark: false });
    out.push({ text: text.slice(a, b), mark: true });
    at = b;
  }
  if (at < text.length) out.push({ text: text.slice(at), mark: false });
  return out;
}

/** Where the words occur, merged where they overlap. */
function markedRanges(text: string, terms: string[]): [number, number][] {
  if (!terms.length) return [];
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const t of terms) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(t, from);
      if (at < 0) break;
      ranges.push([at, at + t.length]);
      from = at + t.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([r[0], r[1]]);
  }
  return merged;
}
