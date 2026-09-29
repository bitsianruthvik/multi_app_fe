import { useMemo, useState } from 'react';

/**
 * Collapse / expand for a flat, depth-first list of tree rows (each names its
 * parent). Shared by the Times and Contractors grids so both fold the same way.
 * `subtree(key)` is the row and everything under it — what clicking a row
 * header selects.
 *
 * `openDepth` (rows carry a `depth`): rows deeper than it start collapsed — once
 * per `resetKey` (the line), when its rows first arrive, never on a refresh.
 */
export function useTreeRows<T extends { key: string; parentKey: string | null; depth?: number }>(
  rows: T[], opts: { openDepth?: number; resetKey?: string | number } = {},
) {
  const { openDepth, resetKey } = opts;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [appliedFor, setAppliedFor] = useState<string | number | null | undefined>(undefined);
  // Adjusting state during render (not in an effect) so the first paint is already folded.
  if (openDepth != null && rows.length > 0 && appliedFor !== (resetKey ?? null)) {
    const kids = new Set<string>();
    for (const r of rows) if (r.parentKey) kids.add(r.parentKey);
    setCollapsed(new Set(rows.filter((r) => (r.depth ?? 0) >= openDepth && kids.has(r.key)).map((r) => r.key)));
    setAppliedFor(resetKey ?? null);
  }
  const model = useMemo(() => {
    const parentOf = new Map(rows.map((r) => [r.key, r.parentKey]));
    const kids = new Set<string>();
    for (const r of rows) if (r.parentKey) kids.add(r.parentKey);
    const hidden = (r: T) => { for (let p = r.parentKey; p; p = parentOf.get(p) ?? null) if (collapsed.has(p)) return true; return false; };
    const visible = rows.filter((r) => !hidden(r));
    const subtree = (key: string) => {
      const inside = new Set([key]);
      for (const r of visible) if (r.parentKey && inside.has(r.parentKey)) inside.add(r.key);
      return visible.filter((r) => inside.has(r.key)).map((r) => r.key);
    };
    return { visible, hasChildren: (k: string) => kids.has(k), subtree };
  }, [rows, collapsed]);
  const toggle = (key: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  return { ...model, isCollapsed: (k: string) => collapsed.has(k), toggle };
}
