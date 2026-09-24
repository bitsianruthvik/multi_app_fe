/**
 * The non-visual half of the Organisation + Setup screens: loading, searching
 * and collapsing. No components here, so the four screens that import it keep
 * fast refresh.
 *
 * The tree helpers work on the PRE-ORDER flat array the backend returns rather
 * than on a nested structure. That is deliberate: a hierarchy screen renders one
 * row per line, so a flat list in render order is the shape the screen actually
 * wants, and "which rows are visible" becomes a single pass instead of a
 * recursive walk that has to be kept in step with the search filter.
 */
import { useCallback, useEffect, useState } from 'react';
import type { StatusTone } from '@shared/ui';
import type { TreeMeta } from '../api/organisation';

/** ACTIVE / INACTIVE, the only status these seven tables carry. */
export const ORG_STATUS_TONES: Record<string, StatusTone> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
};

export const ORG_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
};

/**
 * One load with its own loading / error / reload, so every screen reports a
 * failure the same way and a retry does not need a page refresh.
 *
 * `load` must be stable (wrap it in useCallback) — it is the effect's only
 * dependency, and an inline lambda would refetch on every render.
 */
export function useOrgLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    load()
      .then((d) => {
        if (current) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (current) setError(e);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [load, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}

/** Case- and accent-insensitive enough for names and codes people type badly. */
export const norm = (v: unknown) => String(v ?? '').toLowerCase().trim();

/**
 * Search a tree without breaking it.
 *
 * A plain `rows.filter(matches)` on a hierarchy is a bug: it leaves matched
 * rows indented under parents that are no longer there, so "Pelican Machine"
 * appears floating at depth 2 with nothing above it. This keeps every matched
 * row, every ancestor that leads to one (so the indentation still means
 * something), and every descendant of a match (so searching for an area shows
 * what is inside it).
 */
export function filterTree<T extends TreeMeta>(
  rows: T[],
  query: string,
  haystack: (row: T) => string,
): T[] {
  const q = norm(query);
  if (!q) return rows;

  // Ancestors by render position, not by parentId — an orphaned row renders at
  // the top level and must be treated as one here too.
  const stack: number[] = [];
  const ancestorsOf = new Map<number, number[]>();
  for (const r of rows) {
    stack.length = r.depth;
    ancestorsOf.set(r.id, [...stack]);
    stack[r.depth] = r.id;
  }

  const matched = new Set<number>();
  for (const r of rows) if (norm(haystack(r)).includes(q)) matched.add(r.id);
  if (!matched.size) return [];

  const keep = new Set<number>(matched);
  for (const id of matched) for (const a of ancestorsOf.get(id) ?? []) keep.add(a);
  for (const r of rows) {
    if (keep.has(r.id)) continue;
    if ((ancestorsOf.get(r.id) ?? []).some((a) => matched.has(a))) keep.add(r.id);
  }
  return rows.filter((r) => keep.has(r.id));
}

/**
 * The rows that are actually on screen: everything except what sits under a
 * collapsed ancestor. One pass over the pre-order array — a row is hidden while
 * its depth is greater than the depth of the nearest collapsed row above it.
 */
export function visibleRows<T extends TreeMeta>(rows: T[], collapsed: Set<number>): T[] {
  const out: T[] = [];
  let hideBelow = -1;
  for (const r of rows) {
    if (hideBelow >= 0 && r.depth > hideBelow) continue;
    hideBelow = -1;
    out.push(r);
    if (collapsed.has(r.id)) hideBelow = r.depth;
  }
  return out;
}

/**
 * Which rows have a child IN THIS LIST. `childCount` counts the whole tree, so
 * after a search a row can claim children that were filtered out — and a
 * chevron that expands into nothing is worse than no chevron.
 */
export function idsWithVisibleChildren<T extends TreeMeta>(rows: T[]): Set<number> {
  const ids = new Set<number>();
  for (let i = 0; i < rows.length - 1; i += 1) {
    if (rows[i + 1].depth > rows[i].depth) ids.add(rows[i].id);
  }
  return ids;
}

/**
 * A row and everything under it, by render position. Used to keep a branch out
 * of its own "Parent" picker: the backend refuses a cycle anyway, but offering
 * the choice and then refusing it is a worse screen than not offering it.
 */
export function descendantIds<T extends TreeMeta>(rows: T[], id: number): Set<number> {
  const out = new Set<number>([id]);
  const start = rows.findIndex((r) => r.id === id);
  if (start < 0) return out;
  const depth = rows[start].depth;
  for (let i = start + 1; i < rows.length && rows[i].depth > depth; i += 1) out.add(rows[i].id);
  return out;
}

/** "Production › Printing" minus its own name — the trail shown under a row. */
export function parentPath(row: TreeMeta): string | null {
  const cut = row.path.lastIndexOf(' › ');
  return cut > 0 ? row.path.slice(0, cut) : null;
}

/** "␠␠␠Printing" — a flat <select> that still shows the shape of the tree. */
export const indentedLabel = (depth: number, name: string) => `${'  '.repeat(depth)}${name}`;

/** Expand / collapse state for a tree screen, plus expand-all and collapse-all. */
export function useTreeCollapse<T extends TreeMeta>(rows: T[]) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const toggle = useCallback((id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const expandAll = useCallback(() => setCollapsed(new Set()), []);
  const collapseAll = useCallback(
    () => setCollapsed(new Set(rows.filter((r) => r.childCount > 0).map((r) => r.id))),
    [rows],
  );
  const anyCollapsed = collapsed.size > 0;
  return { collapsed, toggle, expandAll, collapseAll, anyCollapsed };
}

/** "08:00 – 20:00", or the word a flexible shift deserves. */
export function shiftHours(startTime: string | null, endTime: string | null): string {
  if (!startTime || !endTime) return 'Flexible';
  return `${startTime} – ${endTime}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "26 Jan 2026 · Monday" without dragging a date library into a setup screen. */
export function formatHolidayDate(iso: string): { day: string; weekday: string } {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getUTCDay()];
  return { day: `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`, weekday };
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
