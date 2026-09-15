/**
 * shared.ts — small utilities used by more than one file of the split Item
 * Catalog page (EU-16 item 1). Nothing here is a component; anything that
 * renders lives in its own file.
 */
import { useEffect, useState } from 'react';
import { listFieldDefs, type FieldDefRow } from '../../api/fields';

export const TH = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
export const TD = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

/** Extract a human-readable message from an unknown caught error. */
export function errMsg(e: unknown): string {
  const ax = e as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.message ?? 'Something went wrong';
}

/** Auto-generate a code slug from a name — used only for taxonomy nodes; catalog items get theirs from the server (see `createCatalogItem`). */
export function autoCode(name: string): string {
  const c = name.trim().toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
  return c || 'CODE';
}

/** Definitions for the whole company, loaded while a dialog is open. */
export function useFieldDefs(active: boolean): FieldDefRow[] {
  const [defs, setDefs] = useState<FieldDefRow[]>([]);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    listFieldDefs()
      .then((r) => { if (alive) setDefs(r.data ?? []); })
      .catch(() => { /* an empty registry just means every row is new */ });
    return () => { alive = false; };
  }, [active]);
  return defs;
}

export interface ItemDraft {
  name: string; code: string; unit: string; description: string;
  categoryId: number | null; groupId: number | null; subgroupId: number | null;
  hsnCode: string;
  // BUG-05: make-vs-buy (and MRP policy) must be settable at creation. Left
  // unset, fab_item_catalog.procurement_type defaults to 'buy', so a finished
  // good you intend to manufacture would be planned as a purchased part.
  procurementType: string; mrpPolicy: string;
}

export const BLANK_ITEM = (): ItemDraft => ({
  name: '', code: '', unit: 'PC', description: '',
  categoryId: null, groupId: null, subgroupId: null,
  hsnCode: '',
  procurementType: 'buy', mrpPolicy: 'manual',
});

/**
 * Mirrors the fuller ItemCatalogDetail controls so the quick add/edit dialog
 * exposes the same make/buy/free-issue + planning choices.
 *
 * `'both'` is gone (EU-16 item 9) — `fab_item_catalog.procurement_type` never
 * had a third value THEN — the backend only validated `make`/`buy` at that
 * point, so offering it here just let a save pick a value the column had no
 * room for. EU-14 later gave the column its real third value, `free_issue`
 * (material the customer supplies), added to `itemGuards.PROCUREMENT_TYPES`
 * — this list fell out of sync with the backend and needs the same value.
 */
export const PROCUREMENT_TYPES = [
  { value: 'buy', label: 'Buy (external procurement)' },
  { value: 'make', label: 'Make (in-house production)' },
  { value: 'free_issue', label: 'Free issue (supplied by customer)' },
];
export const MRP_POLICIES = [
  { value: 'manual', label: 'Manual' },
  { value: 'reorder_point', label: 'Reorder Point' },
  { value: 'lot_for_lot', label: 'Lot-for-Lot' },
];
