import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Breadcrumbs, Button, CircularProgress, Link,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';

import { fabQuery } from '../../api/client';
import type { FilterValue } from '../../api/client';
import { Surface } from '../../components';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Minimal row shape needed for the drill picker — not the full item record. */
interface FabItemRow {
  id: number;
  orderId: number;
  parentItemId: number | null;
  name: string;
  qty: number;
  unit: string | null;
}

export type BomDrillScope = 'self' | 'subtree';

export interface BomDrillPickerValue {
  itemId: number | null;
  scope: BomDrillScope;
}

export interface BomDrillPickerProps {
  orderId: number;
  value: BomDrillPickerValue;
  onChange: (v: BomDrillPickerValue) => void;
}

const LEVEL_PAGE_SIZE = 200;

function errMsg(e: unknown, fallback = 'Something went wrong'): string {
  const ax = e as { response?: { status?: number; data?: { message?: string; error?: string } }; message?: string };
  if (ax.response?.status === 404) return 'Not found — row may have been deleted by someone else.';
  return ax.response?.data?.message ?? ax.response?.data?.error ?? ax.message ?? fallback;
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Presentational BOM drill picker. Lets the user narrow the task graph down
 * to a single item (and choose whether that means just that item, or it plus
 * everything under it), by walking the item tree one level at a time.
 *
 * CONTROLLED: the parent owns `{ itemId, scope }` and passes it as `value`.
 * This component keeps only UI-local state (fetched rows per level, the
 * breadcrumb drill path) and calls `onChange` on every user-driven change —
 * it never treats the emitted selection as its own source of truth.
 */
export default function BomDrillPicker({ orderId, value, onChange }: BomDrillPickerProps) {
  // Top-level items (parentItemId === null) — loaded once, reused whenever
  // the user jumps back to "All items".
  const [topItems, setTopItems] = useState<FabItemRow[]>([]);
  const [topLoading, setTopLoading] = useState(true);
  const [topError, setTopError] = useState('');

  // Drill path: the chain of items the user has selected, root-first.
  // path[] is empty at the root ("All items"). The *last* entry, if any,
  // is the active `value.itemId`.
  const [path, setPath] = useState<FabItemRow[]>([]);

  // Items selectable at the current level — children of path's last item,
  // or topItems when path is empty.
  const [levelItems, setLevelItems] = useState<FabItemRow[]>([]);
  const [levelLoading, setLevelLoading] = useState(false);
  const [levelError, setLevelError] = useState('');

  // Cache of already-fetched children, keyed by parent item id, so hopping
  // back and forth across the breadcrumb doesn't re-fetch.
  const childrenCacheRef = useRef<Map<number, FabItemRow[]>>(new Map());

  // Tracks the itemId this component last emitted via onChange (or resolved
  // `value` into), so the sync effect below can tell "value changed because
  // we drove it" apart from "value changed out from under us" (e.g. parent
  // reset it, or it arrived pre-populated on mount) without re-fetching.
  const internalItemIdRef = useRef<number | null | undefined>(undefined);

  async function loadChildrenFor(parentId: number): Promise<FabItemRow[]> {
    const cached = childrenCacheRef.current.get(parentId);
    if (cached) return cached;
    const filters: Record<string, FilterValue> = { parentItemId: parentId };
    const res = await fabQuery<{ data: FabItemRow[] }>('fabErpItem', {
      filters,
      orderBy: [{ field: 'id', direction: 'asc' }],
      pagination: { limit: LEVEL_PAGE_SIZE },
    });
    const rows = res.data ?? [];
    childrenCacheRef.current.set(parentId, rows);
    return rows;
  }

  // Load top-level items once per order.
  useEffect(() => {
    let cancelled = false;
    setTopLoading(true); setTopError('');
    const filters: Record<string, FilterValue> = { orderId, parentItemId: null };
    fabQuery<{ data: FabItemRow[] }>('fabErpItem', {
      filters,
      orderBy: [{ field: 'id', direction: 'asc' }],
      pagination: { limit: LEVEL_PAGE_SIZE },
    }).then((res) => {
      if (cancelled) return;
      const rows = res.data ?? [];
      setTopItems(rows);
      if (value.itemId == null) {
        setLevelItems(rows);
        internalItemIdRef.current = null;
      }
    }).catch((e) => {
      if (!cancelled) setTopError(errMsg(e, 'Failed to load items'));
    }).finally(() => {
      if (!cancelled) setTopLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Reflect external `value.itemId` changes (initial mount with a
  // pre-populated value, or the parent resetting/overriding the selection)
  // by resolving the full ancestor chain so the breadcrumb stays accurate.
  useEffect(() => {
    if (internalItemIdRef.current === value.itemId) return;

    if (value.itemId == null) {
      internalItemIdRef.current = null;
      setPath([]);
      setLevelItems(topItems);
      return;
    }

    const targetId = value.itemId;
    internalItemIdRef.current = targetId;
    let cancelled = false;
    setLevelLoading(true); setLevelError('');

    (async () => {
      try {
        const chain: FabItemRow[] = [];
        let currentId: number | null = targetId;
        let guard = 0;
        while (currentId != null && guard < 25) {
          guard += 1;
          const res = await fabQuery<{ data: FabItemRow[] }>('fabErpItem', {
            filters: { id: currentId },
            pagination: { limit: 1 },
          });
          const row = res.data?.[0];
          if (!row) break;
          chain.unshift(row);
          currentId = row.parentItemId;
        }
        if (cancelled) return;
        setPath(chain);
        const active = chain[chain.length - 1];
        const children = active ? await loadChildrenFor(active.id) : [];
        if (cancelled) return;
        setLevelItems(children);
      } catch (e) {
        if (!cancelled) setLevelError(errMsg(e, 'Failed to resolve selected item'));
      } finally {
        if (!cancelled) setLevelLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [value.itemId, topItems]);

  function goToRoot() {
    internalItemIdRef.current = null;
    setPath([]);
    setLevelItems(topItems);
    onChange({ itemId: null, scope: value.scope });
  }

  async function goToHop(index: number) {
    const newPath = path.slice(0, index + 1);
    const active = newPath[newPath.length - 1];
    if (!active) { goToRoot(); return; }
    internalItemIdRef.current = active.id;
    setPath(newPath);
    onChange({ itemId: active.id, scope: value.scope });
    setLevelLoading(true); setLevelError('');
    try {
      const children = await loadChildrenFor(active.id);
      setLevelItems(children);
    } catch (e) {
      setLevelError(errMsg(e, 'Failed to load sub-items'));
    } finally {
      setLevelLoading(false);
    }
  }

  async function selectItem(item: FabItemRow) {
    const newPath = [...path, item];
    internalItemIdRef.current = item.id;
    setPath(newPath);
    onChange({ itemId: item.id, scope: value.scope });
    setLevelLoading(true); setLevelError('');
    try {
      // Lazily load this item's children so the user can keep drilling. If
      // there are none, the level below simply renders empty — that IS the
      // "it's a leaf" signal, and the item remains selected as the target.
      const children = await loadChildrenFor(item.id);
      setLevelItems(children);
    } catch (e) {
      setLevelError(errMsg(e, 'Failed to load sub-items'));
      setLevelItems([]);
    } finally {
      setLevelLoading(false);
    }
  }

  function handleScopeChange(_: unknown, newScope: BomDrillScope | null) {
    if (!newScope) return;
    onChange({ itemId: value.itemId, scope: newScope });
  }

  const activeItem = path[path.length - 1] ?? null;

  return (
    <Surface e={1} sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Breadcrumbs
          separator="›"
          sx={{ fontSize: 13, flex: '1 1 auto', '& .MuiBreadcrumbs-separator': { color: 'var(--c-text)', opacity: 0.4 } }}
        >
          <Link
            component="button"
            type="button"
            underline={path.length === 0 ? 'none' : 'hover'}
            onClick={goToRoot}
            sx={{
              fontSize: 13,
              fontWeight: path.length === 0 ? 700 : 400,
              color: path.length === 0 ? 'var(--c-text)' : 'text.secondary',
            }}
          >
            All items
          </Link>
          {path.map((p, i) => (
            <Link
              key={p.id}
              component="button"
              type="button"
              underline={i === path.length - 1 ? 'none' : 'hover'}
              onClick={() => goToHop(i)}
              sx={{
                fontSize: 13,
                fontWeight: i === path.length - 1 ? 700 : 400,
                color: i === path.length - 1 ? 'var(--c-text)' : 'text.secondary',
              }}
            >
              {p.name}
            </Link>
          ))}
        </Breadcrumbs>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={value.scope}
          onChange={handleScopeChange}
          sx={{ flexShrink: 0 }}
        >
          <ToggleButton value="subtree" sx={{ fontSize: 12, py: 0.25, px: 1 }}>
            Whole subtree
          </ToggleButton>
          <ToggleButton value="self" sx={{ fontSize: 12, py: 0.25, px: 1 }}>
            Selected item only
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {topError && <Alert severity="error" sx={{ fontSize: 12 }}>{topError}</Alert>}
      {levelError && <Alert severity="error" sx={{ fontSize: 12 }}>{levelError}</Alert>}

      <Box
        sx={{
          display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center',
          minHeight: 32, p: 0.5,
          border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)',
          bgcolor: 'var(--c-surface)',
        }}
      >
        {(topLoading && path.length === 0) || levelLoading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, px: 0.5 }}>
            <CircularProgress size={14} />
            <Typography variant="caption" color="text.disabled">Loading…</Typography>
          </Box>
        ) : levelItems.length === 0 ? (
          <Typography variant="caption" color="text.disabled" sx={{ px: 0.5 }}>
            {activeItem ? `"${activeItem.name}" has no sub-items.` : 'No items on this order yet.'}
          </Typography>
        ) : (
          levelItems.map((item) => (
            <Button
              key={item.id}
              size="small"
              variant="outlined"
              onClick={() => selectItem(item)}
              sx={{ fontSize: 12, textTransform: 'none', py: 0.25 }}
            >
              {item.name}
              {item.unit ? ` (${item.qty}${item.unit})` : ''}
            </Button>
          ))
        )}
      </Box>
    </Surface>
  );
}
