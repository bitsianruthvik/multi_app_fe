/**
 * ItemsTab — the virtualized catalog grid.
 *
 * EU-16 item 6: reads `GET /catalog/items` (EU-15) instead of
 * `fabQuery('fabErpItemCatalog', { limit: 20000 })` plus a per-item
 * `/catalog/sizes` follow-up — the server now pages, filters, sorts and joins
 * size + derived weight in one call. Item 2 keeps the hand-rolled virtualized
 * grid (§13 "Which screens must NOT be migrated to DataTable") — this only
 * changes where the rows come from, not how they render.
 *
 * REPAIR-C: the Category/Group/Sub-group filter dropdowns are back, now that
 * REPAIR-B added `categoryId`/`groupId`/`subgroupId`/`uncategorized` to
 * `GET /catalog/items` — they filter server-side, across the whole catalog,
 * not just the loaded page, so they compose correctly with paging. The
 * per-column text filters further down still narrow what's on the current
 * page only.
 *
 * Catalog pass (2026-09-17): every filter option carries its item count
 * (`GET /catalog/items/facets`), Material form / Material / Grade filter on
 * what the data actually holds instead of free text, ticked rows get a bulk
 * bar (`POST /catalog/items/bulk`), each row has hover actions (open,
 * duplicate, stock, where-used), Thk/Width/Length are click-to-edit
 * (`PATCH /catalog/items/:id/fields`), and the search box understands sizes
 * and grades — parsed on the server so every caller benefits.
 */
import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Checkbox, CircularProgress, FormControlLabel, IconButton, InputAdornment,
  MenuItem, Popover, Select, Switch, TableSortLabel, TextField, Tooltip, Typography,
} from '@mui/material';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';
import SearchIcon from '@mui/icons-material/Search';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import {
  listCatalogItems, getCatalogFacets, bulkUpdateCatalogItems, patchCatalogItemFields, createCatalogItem,
  getCatalogItemUsage,
  type CatalogItemRow, type CatalogItemsQuery, type CatalogFacets, type CatalogBulkPatch, type CatalogItemUsage,
  type ItemKind,
} from '../../api/catalog';
import type { FabItemCategory, FabItemGroup, FabItemSubgroup } from '../../types';
import {
  Surface, EmptyState, ListSkeleton, useToast, FormDialog, TaxonomyPicker, FacetChip, backendMessage,
  type SortableColumn, type TaxonomyValue,
} from '../../components';
import { useSortableData } from '../../hooks/useSortableData';
import { displayUom } from '../../constants/uom';
import { PROCUREMENT_TYPES } from './shared';

const TH = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
const TD = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

/** A catalog row with its display-only `size`/`material` strings joined in for the grid. */
type ItemRow = CatalogItemRow & { size: string; material: string; thicknessMm: string; widthMm: string; lengthMm: string };

/** One dimension as the grid shows it: the number, or '' when the item states none. */
function dim(v: number | string | null | undefined): string {
  return v == null || v === '' ? '' : String(v);
}

// Item 6: procurement type, material form, material/grade and thickness join
// Description/HSN as default columns — they are what a fabricator actually
// searches a plate catalog by.
const ITEM_COLUMNS: SortableColumn<ItemRow>[] = [
  { key: 'name',            label: 'Name',            sx: { ...TH, minWidth: 200 } },
  { key: 'code',            label: 'Code',            sx: { ...TH, width: 110 } },
  { key: 'unit',            label: 'Unit',            sx: { ...TH, width: 70 } },
  // One column per dimension, so a plate catalog filters the way a planner
  // asks for it — "25 thick", "1500 wide" — instead of substring-matching a
  // "25 × 1500 × 9000" string.
  { key: 'thicknessMm',     label: 'Thk (mm)',        sx: { ...TH, width: 84 }, align: 'right' },
  { key: 'widthMm',         label: 'Width (mm)',      sx: { ...TH, width: 96 }, align: 'right' },
  { key: 'lengthMm',        label: 'Length (mm)',     sx: { ...TH, width: 100 }, align: 'right' },
  { key: 'procurementType', label: 'Procurement',     sx: { ...TH, width: 100 } },
  { key: 'materialForm',    label: 'Material form',   sx: { ...TH, width: 110 } },
  { key: 'material',        label: 'Material / grade', sx: { ...TH, width: 140 } },
  { key: 'unitWeightKg',    label: 'Weight (kg)',     sx: { ...TH, width: 100 }, align: 'right' },
  { key: 'description',     label: 'Description',     sx: { ...TH, minWidth: 180 } },
  { key: 'categoryName',    label: 'Category',        sx: { ...TH, width: 130 } },
  { key: 'groupName',       label: 'Group',           sx: { ...TH, width: 130 } },
  { key: 'subgroupName',    label: 'Sub-group',       sx: { ...TH, width: 130 } },
  { key: 'hsnCode',         label: 'HSN',             sx: { ...TH, width: 100 } },
];

/**
 * Columns that mean nothing for a list, hidden rather than shown as a wall of
 * dashes. A TEMPLATE part has no size, steel or weight of its own (it gets
 * them on an order) and is never bought, so procurement and HSN go too. A CUT
 * PLATE is sized but is made, never bought.
 */
const HIDDEN_COLUMNS: Record<ItemKind, ReadonlySet<string>> = {
  catalog: new Set(),
  template: new Set(['thicknessMm', 'widthMm', 'lengthMm', 'procurementType', 'materialForm', 'material', 'unitWeightKg', 'hsnCode']),
  cutplate: new Set(['procurementType', 'materialForm', 'hsnCode']),
};

/** What an empty list says, per tab. */
const EMPTY_TITLE: Record<ItemKind, string> = {
  catalog: 'Catalog is empty',
  template: 'No template parts yet',
  cutplate: 'No cut plates yet — nesting an order creates them',
};

const DEFAULT_ITEM_COL_WIDTH: Record<string, number> = {
  name: 220, code: 110, unit: 70, thicknessMm: 84, widthMm: 96, lengthMm: 100, procurementType: 100, materialForm: 110,
  material: 140, unitWeightKg: 100, description: 220, categoryName: 130, groupName: 130,
  subgroupName: 130, hsnCode: 100,
};
const COL_WIDTH_STORAGE_KEY = 'fab_erp_item_catalog_col_widths';
const MIN_COL_WIDTH = 60;
const SELECT_COL_WIDTH = 36;
/** One 28px icon button per action, plus a little breathing room. */
const ACTION_BUTTON_WIDTH = 28;
const ROW_HEIGHT = 38;
const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];

const SIZE_KEYS = ['thicknessMm', 'widthMm', 'lengthMm'] as const;
type SizeKey = typeof SIZE_KEYS[number];
/** Grid column → the field key `PATCH /catalog/items/:id/fields` takes. */
const SIZE_FIELD: Record<SizeKey, 'thickness_mm' | 'width_mm' | 'length_mm'> = {
  thicknessMm: 'thickness_mm', widthMm: 'width_mm', lengthMm: 'length_mm',
};

function rowSize(it: CatalogItemRow): string {
  const s = it.sizes;
  if (!s) return '';
  // Coerce each dimension to a string AT THE BOUNDARY, since the wire type is
  // `number | string | null` (a dimension with no numeric answer arrives as
  // `''` off `value_text` — see the type comment in api/catalog.ts). Comparing
  // a raw `number | string` union against the string literal `''` is what
  // TS2367 was flagging; coercing first makes both sides of the filter the
  // same type instead of casting the comparison away.
  return [s.thicknessMm, s.widthMm, s.lengthMm]
    .map((x) => (x == null ? '' : String(x)))
    .filter((x) => x !== '')
    .join(' × ');
}
function rowMaterial(it: CatalogItemRow): string {
  const s = it.sizes;
  if (!s) return '';
  return [s.material, s.grade].filter(Boolean).join(' ');
}

const MONO_CELL = { fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } as const;

/**
 * A size cell that turns into a number box on click, saves on blur/Enter and
 * backs out on Escape. Same shape as the structure editor's InlineNumber,
 * kept local rather than imported: that one is wired to a wizard's draft
 * state, this one talks to the server per cell.
 *
 * Every event stops at this cell — the row underneath opens the item on click
 * and on Enter, and moves focus on the arrow keys, none of which somebody
 * typing a width meant.
 */
function InlineSizeCell({ value, ariaLabel, onSave }: {
  value: string;
  ariaLabel: string;
  onSave: (raw: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  async function commit() {
    setEditing(false);
    if (draft.trim() === value) return;
    setBusy(true);
    try { await onSave(draft.trim()); } finally { setBusy(false); }
  }

  if (!editing) {
    return (
      <Box
        component="button" type="button" aria-label={ariaLabel} disabled={busy}
        onClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
        onKeyDown={(e) => e.stopPropagation()}
        sx={{
          ...MONO_CELL, width: '100%', height: 26, px: 0.75, textAlign: 'right', lineHeight: 1,
          color: value ? 'var(--c-text)' : 'var(--c-text-3)', background: 'transparent',
          border: '1px solid transparent', borderRadius: 'var(--r-sm)', cursor: 'text',
          opacity: busy ? 0.5 : 1,
          '&:hover': { borderColor: 'var(--c-border)', background: 'var(--c-surface)' },
          '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 1 },
        }}
      >
        {value || '—'}
      </Box>
    );
  }
  return (
    <TextField
      autoFocus size="small" type="number" value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        if (e.key === 'Escape') { e.preventDefault(); setDraft(value); setEditing(false); }
      }}
      sx={{ width: '100%', '& .MuiOutlinedInput-root': { height: 26 } }}
      slotProps={{ htmlInput: { min: 0, step: 'any', 'aria-label': ariaLabel, style: { fontSize: 12.5, textAlign: 'right', padding: '2px 6px', fontFamily: 'var(--font-mono, monospace)' } } }}
    />
  );
}

/** Right-aligned count beside a dropdown option — the taxonomy picker's own style. */
function OptionCount({ n }: { n: number }) {
  return (
    <Typography component="span" sx={{ ml: 'auto', pl: 1.5, fontSize: 11, fontVariantNumeric: 'tabular-nums', color: 'var(--c-text-3)' }}>
      {n}
    </Typography>
  );
}

/** What the duplicate dialog edits — the source row's facts, with a blank code so the generator mints one. */
interface DuplicateDraft {
  name: string; unit: string; description: string; hsnCode: string;
  taxonomy: TaxonomyValue; procurementType: string; materialForm: string;
  material: string; grade: string; thicknessMm: string; widthMm: string; lengthMm: string;
}

type BulkSection = 'taxonomy' | 'steel' | 'procurement';

export interface ItemsTabHandle {
  refresh: () => void;
}

export const ItemsTab = forwardRef<ItemsTabHandle, {
  /** Which list this grid is: the catalog, template parts, or cut plates. */
  kind: ItemKind;
  canManage: boolean;
  categories: FabItemCategory[];
  groups: FabItemGroup[];
  subgroups: FabItemSubgroup[];
  /** Absent = this list has no "add" (cut plates are made by nesting, not typed in). */
  onAdd?: () => void;
  onEdit: (item: CatalogItemRow) => void;
  onDelete: (item: CatalogItemRow) => void;
}>(function ItemsTab({ kind, canManage, categories, groups, subgroups, onAdd, onEdit, onDelete }, ref) {
  const navigate = useNavigate();
  const { company } = useParams<{ company: string }>();
  const { toast } = useToast();

  const columns = useMemo(() => ITEM_COLUMNS.filter((c) => !HIDDEN_COLUMNS[kind].has(c.key as string)), [kind]);
  const shows = useCallback((key: string) => !HIDDEN_COLUMNS[kind].has(key), [kind]);
  // A catalog item's size is typed in; a cut plate's size IS its identity
  // (its code is derived from it), so it is never edited here.
  const sizesEditable = canManage && kind === 'catalog';

  const [rows, setRows] = useState<CatalogItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(200);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  // Debounced separately from `search` (which stays immediate for the input's
  // own value) — fetchPage reads this, not `search`, so typing doesn't fire a
  // request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [procurementType, setProcurementType] = useState('');
  const [materialForm, setMaterialForm] = useState('');
  const [material, setMaterial] = useState('');
  const [grade, setGrade] = useState('');
  const [thicknessMin, setThicknessMin] = useState('');
  const [thicknessMax, setThicknessMax] = useState('');
  // Taxonomy and "Uncategorised" are mutually exclusive server filters (both
  // narrow on `fic.category_id`, so combining them would just return nothing)
  // — picking one clears the other.
  const [taxonomy, setTaxonomy] = useState<TaxonomyValue>({ categoryId: null, groupId: null, subgroupId: null });
  const [uncategorized, setUncategorized] = useState(false);
  // Server-driven sort — needed for a numeric size sort to be correct across
  // pages rather than just within whatever page happened to load.
  const [serverSort, setServerSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  // Counts behind every filter option. Loaded once and again after anything
  // that moves items between buckets (bulk edit, duplicate, the parent's own
  // add/edit/delete via `refresh`) — not per keystroke, since they describe
  // the whole catalog rather than the current result.
  const [facets, setFacets] = useState<CatalogFacets | null>(null);
  const loadFacets = useCallback(() => {
    getCatalogFacets(kind).then(setFacets).catch(() => { /* the dropdowns just show no counts */ });
  }, [kind]);
  useEffect(() => { loadFacets(); }, [loadFacets]);
  /*
   * THIS TAB'S TAXONOMY ONLY. The Catalog and Non-catalog lists each offer the
   * categories, groups and sub-groups that actually hold items of their kind
   * (from this list's own facet counts), not the whole tree — a girder family
   * in the Catalog filter would lead to an empty list.
   */
  const kindTaxonomy = useMemo(() => {
    if (!facets) return { categories, groups, subgroups };
    const has = (o: Record<string, number>, id: number) => (o[String(id)] ?? 0) > 0;
    return {
      categories: categories.filter((c) => has(facets.category, c.id)),
      groups: groups.filter((g) => has(facets.group, g.id)),
      subgroups: subgroups.filter((sg) => has(facets.subgroup, sg.id)),
    };
  }, [facets, categories, groups, subgroups]);
  const taxonomyCounts = useMemo(() => {
    if (!facets) return undefined;
    const toMap = (o: Record<string, number>) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]));
    return { category: toMap(facets.category), group: toMap(facets.group), subgroup: toMap(facets.subgroup) };
  }, [facets]);

  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(COL_WIDTH_STORAGE_KEY);
      if (saved) return { ...DEFAULT_ITEM_COL_WIDTH, ...JSON.parse(saved) };
    } catch { /* ignore malformed storage */ }
    return { ...DEFAULT_ITEM_COL_WIDTH };
  });
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    const r = resizingRef.current;
    if (!r) return;
    const next = Math.max(MIN_COL_WIDTH, r.startWidth + (e.clientX - r.startX));
    setColWidths((w) => ({ ...w, [r.key]: next }));
  }, []);
  const handleResizeEnd = useCallback(() => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
    setColWidths((w) => {
      try { localStorage.setItem(COL_WIDTH_STORAGE_KEY, JSON.stringify(w)); } catch { /* ignore */ }
      return w;
    });
  }, [handleResizeMove]);
  const handleResizeStart = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startWidth: colWidths[key] };
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  }, [colWidths, handleResizeMove, handleResizeEnd]);
  useEffect(() => () => {
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove, handleResizeEnd]);

  // Bumped on every fetch kicked off; a response is applied only if it's
  // still the newest one in flight, so a slow early response (e.g. from
  // before a filter change) can't land after a faster later one.
  const reqRef = useRef(0);

  const fetchPage = useCallback(async () => {
    const myReq = ++reqRef.current;
    setLoading(true); setError('');
    try {
      const query: CatalogItemsQuery = {
        kind,
        q: debouncedSearch || undefined,
        procurementType: procurementType || undefined,
        materialForm: materialForm || undefined,
        material: material || undefined,
        grade: grade || undefined,
        thicknessMin: thicknessMin || undefined,
        thicknessMax: thicknessMax || undefined,
        categoryId: !uncategorized && taxonomy.categoryId != null ? taxonomy.categoryId : undefined,
        groupId: !uncategorized && taxonomy.groupId != null ? taxonomy.groupId : undefined,
        subgroupId: !uncategorized && taxonomy.subgroupId != null ? taxonomy.subgroupId : undefined,
        uncategorized: uncategorized ? 1 : undefined,
        page, pageSize,
        sort: serverSort?.key, dir: serverSort?.dir,
      };
      const res = await listCatalogItems(query);
      if (myReq !== reqRef.current) return; // a newer request has since started — drop this stale response
      setRows(res.rows ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      if (myReq !== reqRef.current) return;
      setError(backendMessage(e, 'Failed to load the catalog'));
    } finally {
      if (myReq === reqRef.current) setLoading(false);
    }
  }, [kind, debouncedSearch, procurementType, materialForm, material, grade, thicknessMin, thicknessMax, taxonomy, uncategorized, page, pageSize, serverSort]);

  // Single effect: a filter change should land back on page 1 — otherwise
  // "page 4 of a now-3-page result" quietly shows nothing and looks like a
  // bug — but must fetch exactly once. Comparing the filter signature against
  // its previous value (not just listing filters as effect deps) lets this
  // tell "a filter changed, still need to reset the page" (skip fetching,
  // let the page-1 update re-trigger this same effect) apart from "a filter
  // changed but page was already 1" / "only the page or sort changed" (fetch
  // directly) — the old two-effect version fired for both on every filter
  // change: once with the stale page, once more after page reset to 1.
  const filterSig = JSON.stringify([debouncedSearch, procurementType, materialForm, material, grade, thicknessMin, thicknessMax, taxonomy, uncategorized]);
  const prevFilterSigRef = useRef(filterSig);
  useEffect(() => {
    const filtersChanged = prevFilterSigRef.current !== filterSig;
    prevFilterSigRef.current = filterSig;
    if (filtersChanged && page !== 1) { setPage(1); return; }
    fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSig, page, pageSize, serverSort]);

  useImperativeHandle(ref, () => ({ refresh: () => { fetchPage(); loadFacets(); } }), [fetchPage, loadFacets]);

  const itemsSized = useMemo(() => rows.map((it) => ({
    ...it, size: rowSize(it), material: rowMaterial(it),
    thicknessMm: dim(it.sizes?.thicknessMm), widthMm: dim(it.sizes?.widthMm), lengthMm: dim(it.sizes?.lengthMm),
  })), [rows]);

  const filtered = useMemo(() => itemsSized.filter((it) => columns.every((col) => {
    const needle = colFilters[col.key as string]?.trim().toLowerCase();
    if (!needle) return true;
    const raw = (it as unknown as Record<string, unknown>)[col.key as string];
    return String(raw ?? '').toLowerCase().includes(needle);
  })), [itemsSized, colFilters, columns]);

  // Size sorts server-side (numeric, correct across pages); every other
  // column still sorts the loaded page locally — the per-column filters are
  // already page-scoped, so a local sort of the same page is consistent with
  // that, not a step backward from it.
  const { sortedRows, sortKey, sortDirection, requestSort } = useSortableData(filtered, 'name');

  function onHeaderSort(key: keyof ItemRow) {
    // Thickness is a real indexed column, so it sorts server-side across pages;
    // width and length live in field values and sort the loaded page locally.
    if (key === 'thicknessMm' || key === 'unitWeightKg') {
      const sortCol = key === 'thicknessMm' ? 'thicknessMm' : 'unitWeightKg';
      setServerSort((s) => (s?.key === sortCol ? { key: sortCol, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: sortCol, dir: 'asc' }));
      return;
    }
    requestSort(key);
  }

  // ── inline size edit (item 10) ──────────────────────────────────────────
  // The response carries what is stored NOW, so the row is patched from it
  // rather than from what was typed — a refused value leaves the old one.
  const saveSize = useCallback(async (id: number, key: SizeKey, raw: string) => {
    try {
      const res = await patchCatalogItemFields(id, { [SIZE_FIELD[key]]: raw === '' ? null : Number(raw) });
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, sizes: res.sizes, thicknessMm: res.sizes.thicknessMm, unitWeightKg: res.unitWeightKg } : r)));
      if (res.rejected.length) toast(res.rejected.map((x) => `${x.fieldKey}: ${x.why}`).join('; '), 'error');
    } catch (e) {
      toast(backendMessage(e, 'Could not save the size'), 'error');
    }
  }, [toast]);

  // ── multi-select + bulk edit (item 11 → item 6) ─────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const allOnPageSelected = sortedRows.length > 0 && sortedRows.every((r) => selected.has(r.id));
  function toggleAll() {
    setSelected(allOnPageSelected ? new Set() : new Set(sortedRows.map((r) => r.id)));
  }
  function toggleOne(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  // One dialog, opened on the section the bar button named — the other two
  // stay hidden so "Set procurement" is one dropdown, not a form.
  const [bulkSection, setBulkSection] = useState<BulkSection | null>(null);
  const [bulkProcurementType, setBulkProcurementType] = useState('');
  const [bulkTaxonomy, setBulkTaxonomy] = useState<TaxonomyValue>({ categoryId: null, groupId: null, subgroupId: null });
  const [bulkMaterial, setBulkMaterial] = useState('');
  const [bulkGrade, setBulkGrade] = useState('');

  async function applyBulkEdit() {
    const ids = [...selected];
    const patch: CatalogBulkPatch = {};
    if (bulkSection === 'procurement' && bulkProcurementType) patch.procurementType = bulkProcurementType;
    if (bulkSection === 'taxonomy' && bulkTaxonomy.categoryId != null) {
      patch.categoryId = bulkTaxonomy.categoryId;
      patch.groupId = bulkTaxonomy.groupId;
      patch.subgroupId = bulkTaxonomy.subgroupId;
    }
    if (bulkSection === 'steel') {
      if (bulkMaterial.trim()) patch.material = bulkMaterial.trim();
      if (bulkGrade.trim()) patch.grade = bulkGrade.trim();
    }
    if (!Object.keys(patch).length) throw new Error('Choose something to apply, or cancel.');
    const res = await bulkUpdateCatalogItems(ids, patch);
    setSelected(new Set());
    setBulkProcurementType(''); setBulkTaxonomy({ categoryId: null, groupId: null, subgroupId: null });
    setBulkMaterial(''); setBulkGrade('');
    await fetchPage();
    loadFacets();
    if (res.rejected?.length) throw new Error(`Applied to ${res.updated}, but ${res.rejected.length} value${res.rejected.length === 1 ? '' : 's'} refused: ${res.rejected[0].why}`);
    toast(`${res.updated} item${res.updated === 1 ? '' : 's'} updated.`);
  }

  // ── where used (item 7) ─────────────────────────────────────────────────
  const [usageAnchor, setUsageAnchor] = useState<{ el: HTMLElement; item: CatalogItemRow } | null>(null);
  const [usage, setUsage] = useState<CatalogItemUsage | null>(null);
  const openWhereUsed = useCallback((el: HTMLElement, item: CatalogItemRow) => {
    setUsage(null);
    setUsageAnchor({ el, item });
    getCatalogItemUsage(item.id).then(setUsage).catch((e) => toast(backendMessage(e, 'Could not load usage'), 'error'));
  }, [toast]);

  // ── duplicate (item 9) ──────────────────────────────────────────────────
  const [dup, setDup] = useState<DuplicateDraft | null>(null);
  const openDuplicate = useCallback((it: CatalogItemRow) => {
    setDup({
      name: it.name, unit: it.unit ?? 'PC', description: it.description ?? '', hsnCode: it.hsnCode ?? '',
      taxonomy: { categoryId: it.categoryId ?? null, groupId: it.groupId ?? null, subgroupId: it.subgroupId ?? null },
      procurementType: it.procurementType ?? 'buy', materialForm: it.materialForm ?? '',
      material: it.sizes?.material ?? '', grade: it.sizes?.grade ?? '',
      thicknessMm: dim(it.sizes?.thicknessMm), widthMm: dim(it.sizes?.widthMm), lengthMm: dim(it.sizes?.lengthMm),
    });
  }, []);
  async function saveDuplicate() {
    if (!dup) return;
    if (!dup.name.trim()) throw new Error('Name is required.');
    if (dup.taxonomy.categoryId == null) throw new Error('Category is required.');
    // Sizes and steel travel as field values — the same keys the create route
    // already writes for the Add dialog; thickness is also handed over as the
    // column so the list can sort on it straight away.
    const fields: Record<string, string | number> = {};
    if (dup.thicknessMm !== '') fields.thickness_mm = Number(dup.thicknessMm);
    if (dup.widthMm !== '') fields.width_mm = Number(dup.widthMm);
    if (dup.lengthMm !== '') fields.length_mm = Number(dup.lengthMm);
    if (dup.material.trim()) fields.material = dup.material.trim();
    if (dup.grade.trim()) fields.grade = dup.grade.trim();
    const res = await createCatalogItem({
      name: dup.name.trim(),
      unit: dup.unit.trim() || 'PC',
      description: dup.description.trim() || null,
      categoryId: dup.taxonomy.categoryId,
      groupId: dup.taxonomy.groupId, subgroupId: dup.taxonomy.subgroupId,
      hsnCode: dup.hsnCode.trim() || null,
      procurementType: dup.procurementType as 'make' | 'buy',
      thicknessMm: dup.thicknessMm !== '' ? Number(dup.thicknessMm) : null,
      materialForm: dup.materialForm || null,
    }, fields);
    setDup(null);
    await fetchPage();
    loadFacets();
    if (res.rejected?.length) toast(`Created ${res.code}, but not saved: ${res.rejected.map((r) => `${r.fieldKey} — ${r.why}`).join('; ')}`, 'error');
    else toast(`Created ${res.code}.`);
  }

  // Open · Duplicate* · Stock† · Where used · Edit* · Remove*
  // (* = manage only; † = not on template parts, which are never stock)
  const hasStock = kind !== 'template';
  const actionCount = (canManage ? 6 : 3) - (hasStock ? 0 : 1);
  const actionsColWidth = actionCount * ACTION_BUTTON_WIDTH + 12;
  const itemsTotalWidth = columns.reduce((sum, col) => sum + colWidths[col.key as string], 0)
    + SELECT_COL_WIDTH + actionsColWidth;

  // Row keyboard nav (item 1: "arrow keys/Enter open a row"): react-window only
  // mounts visible rows, so moving focus past the viewport needs a scroll first
  // — `listRef.scrollToItem` gets the target row mounted, then it's focused via
  // `rowElRef`. The common case (arrowing between two already-visible rows)
  // focuses synchronously — no rAF wait, which matters because rAF is paused
  // outright on a backgrounded/hidden tab and would otherwise silently drop
  // every keypress that scrolled a background tab. Only the "just scrolled a
  // new row into existence" case needs to wait a tick for react-window's own
  // state update to commit the row's DOM node into `rowElRef`. Each row carries
  // `tabIndex={0}` rather than a roving -1/0 pattern — this grid has no
  // separate "container has focus, no row does" state to model, so leaving
  // every mounted row individually tabbable is the simpler correct choice here.
  const listRef = useRef<FixedSizeList>(null);
  const rowElRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const focusRow = useCallback((index: number) => {
    if (index < 0 || index >= sortedRows.length) return;
    const already = rowElRef.current.get(index);
    if (already) { already.focus(); return; }
    listRef.current?.scrollToItem(index, 'smart');
    setTimeout(() => rowElRef.current.get(index)?.focus(), 0);
  }, [sortedRows.length]);

  const renderItemRow = useCallback(({ index, style }: ListChildComponentProps) => {
    const it = sortedRows[index];
    const cellSx = (key: string, extra?: object) => ({
      ...TD, width: colWidths[key], minWidth: colWidths[key], flex: '0 0 auto', boxSizing: 'border-box', px: 2, ...extra,
    });
    const openRow = () => navigate(`/${company}/fab_erp/item-catalog/${it.id}`);
    const action = (title: string, icon: React.ReactNode, onClick: (e: React.MouseEvent<HTMLButtonElement>) => void, color?: 'error') => (
      <Tooltip title={title}>
        <IconButton size="small" color={color} aria-label={`${title}: ${it.name}`} sx={{ width: ACTION_BUTTON_WIDTH, height: ACTION_BUTTON_WIDTH }}
          onClick={(e) => { e.stopPropagation(); onClick(e); }}>
          {icon}
        </IconButton>
      </Tooltip>
    );
    return (
      <Box
        ref={(el: HTMLDivElement | null) => { if (el) rowElRef.current.set(index, el); else rowElRef.current.delete(index); }}
        style={style} tabIndex={0} role="button" aria-label={`Open ${it.name}`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); focusRow(index + 1); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); focusRow(index - 1); }
          else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(); }
        }}
        sx={{
          display: 'flex', alignItems: 'center', cursor: 'pointer', borderBottom: '1px solid var(--c-divider)',
          '&:hover': { bgcolor: 'action.hover' }, '&:focus-visible': { outline: '2px solid var(--c-focus, #1976d2)', outlineOffset: '-2px' },
          // Quick actions surface on hover or when anything in the row has
          // focus (keyboard users reach them with Tab), and stay out of the
          // way otherwise so 200 rows do not read as 1,200 buttons.
          '& .row-actions': { opacity: 0, transition: 'opacity var(--t-fast, 120ms) var(--ease, ease)' },
          '&:hover .row-actions, &:focus-within .row-actions': { opacity: 1 },
        }}
      >
        <Box sx={{ width: SELECT_COL_WIDTH, minWidth: SELECT_COL_WIDTH, flex: '0 0 auto', display: 'flex', justifyContent: 'center' }}>
          <Checkbox size="small" checked={selected.has(it.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleOne(it.id)} />
        </Box>
        <Box onClick={openRow} sx={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <Box sx={cellSx('name', { fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{it.name}</Box>
          <Box sx={cellSx('code')}><Box component="span" sx={{ fontFamily: 'var(--font-mono, monospace)' }}>{it.code}</Box></Box>
          <Box sx={cellSx('unit')}>{displayUom(it.unit) || 'PC'}</Box>
          {SIZE_KEYS.filter(shows).map((k) => (
            <Box key={k} sx={cellSx(k, { ...MONO_CELL, color: 'var(--c-text-2)', textAlign: 'right', px: sizesEditable ? 1 : 2 })}>
              {sizesEditable
                ? <InlineSizeCell value={it[k]} ariaLabel={`${ITEM_COLUMNS.find((c) => c.key === k)?.label ?? k} for ${it.name}`} onSave={(raw) => saveSize(it.id, k, raw)} />
                : (it[k] || '—')}
            </Box>
          ))}
          {shows('procurementType') && <Box sx={cellSx('procurementType')}>{it.procurementType ?? '—'}</Box>}
          {shows('materialForm') && <Box sx={cellSx('materialForm')}>{it.materialForm ?? '—'}</Box>}
          {shows('material') && <Box sx={cellSx('material', { color: 'var(--c-text-2)' })}>{it.material || '—'}</Box>}
          {shows('unitWeightKg') && <Box sx={cellSx('unitWeightKg', { textAlign: 'right' })}>{it.unitWeightKg != null ? Number(it.unitWeightKg).toFixed(2) : '—'}</Box>}
          <Box sx={cellSx('description', { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text-2)' })}>{it.description ?? '—'}</Box>
          <Box sx={cellSx('categoryName')}>{it.categoryName ?? '—'}</Box>
          <Box sx={cellSx('groupName')}>{it.groupName ?? '—'}</Box>
          <Box sx={cellSx('subgroupName')}>{it.subgroupName ?? '—'}</Box>
          {shows('hsnCode') && <Box sx={cellSx('hsnCode')}>{it.hsnCode ?? '—'}</Box>}
        </Box>
        <Box className="row-actions" sx={{ width: actionsColWidth, minWidth: actionsColWidth, flex: '0 0 auto', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', pr: 0.5 }}>
          {action('Open', <OpenInNewIcon fontSize="small" />, openRow)}
          {canManage && action('Duplicate', <ContentCopyIcon fontSize="small" />, () => openDuplicate(it))}
          {hasStock && action('Stock', <Inventory2Icon fontSize="small" />, () => navigate(`/${company}/fab_erp/item-batches?itemId=${it.id}`))}
          {action('Where used', <AccountTreeIcon fontSize="small" />, (e) => openWhereUsed(e.currentTarget, it))}
          {canManage && action('Edit', <EditIcon fontSize="small" />, () => onEdit(it))}
          {canManage && action('Remove', <DeleteIcon fontSize="small" />, () => onDelete(it), 'error')}
        </Box>
      </Box>
    );
  }, [sortedRows, canManage, navigate, company, colWidths, selected, onEdit, onDelete, focusRow, saveSize, openDuplicate, openWhereUsed, actionsColWidth, shows, sizesEditable, hasStock]);

  const bulkTitle = bulkSection === 'taxonomy' ? 'Set group / sub-group' : bulkSection === 'steel' ? 'Set material / grade' : 'Set procurement';

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <TextField
          placeholder="Search name, code, size or grade…" value={search} size="small" sx={{ width: 280 }}
          onChange={(e) => setSearch(e.target.value)}
          helperText="try 25x1500, E350 12mm"
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
            formHelperText: { sx: { mx: 0.5, mt: 0.25, fontSize: 11, color: 'var(--c-text-3)' } },
          }}
        />
        {shows('procurementType') && (
        <Box sx={{ width: 160 }}>
          <Typography variant="caption" color="text.secondary">Procurement</Typography>
          <Select fullWidth size="small" displayEmpty value={procurementType} onChange={(e) => setProcurementType(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {PROCUREMENT_TYPES.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
          </Select>
        </Box>
        )}
        {shows('material') && (<>
        <Box sx={{ width: 150 }}>
          <Typography variant="caption" color="text.secondary">Material</Typography>
          <Select fullWidth size="small" displayEmpty value={material} onChange={(e) => setMaterial(e.target.value)} renderValue={(v) => v || 'All'}>
            <MenuItem value="">All</MenuItem>
            {(facets?.material ?? []).map((f) => <MenuItem key={f.value} value={f.value}>{f.value}<OptionCount n={f.n} /></MenuItem>)}
          </Select>
        </Box>
        <Box sx={{ width: 150 }}>
          <Typography variant="caption" color="text.secondary">Grade</Typography>
          <Select fullWidth size="small" displayEmpty value={grade} onChange={(e) => setGrade(e.target.value)} renderValue={(v) => v || 'All'}>
            <MenuItem value="">All</MenuItem>
            {(facets?.grade ?? []).map((f) => <MenuItem key={f.value} value={f.value}>{f.value}<OptionCount n={f.n} /></MenuItem>)}
          </Select>
        </Box>
        <TextField label="Thickness ≥ (mm)" type="number" value={thicknessMin} size="small" sx={{ width: 130 }} onChange={(e) => setThicknessMin(e.target.value)} />
        <TextField label="Thickness ≤ (mm)" type="number" value={thicknessMax} size="small" sx={{ width: 130 }} onChange={(e) => setThicknessMax(e.target.value)} />
        </>)}
        <Box sx={{ width: 420 }}>
          <TaxonomyPicker
            categories={kindTaxonomy.categories} groups={kindTaxonomy.groups} subgroups={kindTaxonomy.subgroups}
            value={taxonomy} onChange={(next) => { setUncategorized(false); setTaxonomy(next); }}
            disabled={uncategorized} emptyLabel="All" counts={taxonomyCounts}
            labels={{ category: 'Category', group: 'Group', subgroup: 'Sub-group' }}
          />
        </Box>
        <FormControlLabel
          sx={{ ml: 0 }}
          control={(
            <Switch
              size="small" checked={uncategorized}
              onChange={(e) => {
                const on = e.target.checked;
                setUncategorized(on);
                if (on) setTaxonomy({ categoryId: null, groupId: null, subgroupId: null });
              }}
            />
          )}
          label={<Typography variant="caption">Uncategorised</Typography>}
        />
      </Box>

      {/* Material form as chips: the values the catalog actually holds (plate / section / blank…), each with its count. */}
      {shows('materialForm') && !!facets?.materialForm.length && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Material form</Typography>
          <FacetChip label="All" active={materialForm === ''} onClick={() => setMaterialForm('')} />
          {facets.materialForm.map((f) => (
            <FacetChip key={f.value} label={f.value} count={f.n} active={materialForm === f.value}
              onClick={() => setMaterialForm(materialForm === f.value ? '' : f.value)} />
          ))}
        </Box>
      )}

      {/* Bulk bar — only exists while something is ticked. */}
      {selected.size > 0 && (
        <Surface e={1} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', px: 1.5, py: 1, mb: 2, bgcolor: 'var(--c-primary-50)', borderColor: 'var(--c-primary-200)' }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-primary-700)', mr: 1 }}>
            {selected.size} selected
          </Typography>
          {canManage ? (
            <>
              <Button size="small" variant="outlined" onClick={() => setBulkSection('taxonomy')}>Set group / sub-group</Button>
              {kind === 'catalog' && <Button size="small" variant="outlined" onClick={() => setBulkSection('steel')}>Set material / grade</Button>}
              {/* Non-catalog items are always made — the server refuses anything else. */}
              {kind === 'catalog' && <Button size="small" variant="outlined" onClick={() => setBulkSection('procurement')}>Set procurement</Button>}
            </>
          ) : (
            <Typography variant="caption" color="text.secondary">You can tick rows, but editing needs the catalog-manage permission.</Typography>
          )}
          <Box sx={{ flex: 1 }} />
          <Button size="small" onClick={() => setSelected(new Set())}>Clear selection</Button>
        </Surface>
      )}

      {loading && rows.length === 0 ? (
        <ListSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Inventory2Icon />}
          title={search ? 'Nothing matches your search' : EMPTY_TITLE[kind]}
          action={!search && canManage && onAdd ? <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd}>{kind === 'template' ? 'Add first template part' : 'Add first item'}</Button> : undefined}
        />
      ) : (
        <>
          <Surface e={1} sx={{ overflowX: 'auto', p: 0 }}>
            <Box sx={{ width: itemsTotalWidth, minWidth: itemsTotalWidth }}>
              <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--c-divider)', bgcolor: 'var(--c-surface-2)' }}>
                <Box sx={{ width: SELECT_COL_WIDTH, minWidth: SELECT_COL_WIDTH, flex: '0 0 auto', display: 'flex', justifyContent: 'center' }}>
                  <Checkbox size="small" checked={allOnPageSelected} onChange={toggleAll} aria-label="Select all rows on this page" />
                </Box>
                {columns.map((col) => (
                  <Box key={String(col.key)} role="columnheader" sx={{
                    ...col.sx, width: colWidths[col.key as string], minWidth: colWidths[col.key as string],
                    flex: '0 0 auto', boxSizing: 'border-box', display: 'flex', alignItems: 'center', position: 'relative',
                    justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start', px: 2, py: 1,
                  }}>
                    <TableSortLabel
                      active={col.key === 'thicknessMm' ? serverSort?.key === 'thicknessMm' : (col.key === 'unitWeightKg' ? serverSort?.key === 'unitWeightKg' : sortKey === col.key)}
                      direction={col.key === 'thicknessMm' || col.key === 'unitWeightKg' ? (serverSort?.dir ?? 'asc') : sortDirection}
                      onClick={() => onHeaderSort(col.key as keyof ItemRow)}
                    >
                      {col.label}
                    </TableSortLabel>
                    <Box onMouseDown={(e) => handleResizeStart(col.key as string, e)} sx={{ position: 'absolute', right: -3, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 1, '&:hover': { bgcolor: 'primary.main', opacity: 0.5 } }} />
                  </Box>
                ))}
                <Box sx={{ width: actionsColWidth, minWidth: actionsColWidth, flex: '0 0 auto' }} />
              </Box>

              <Box sx={{ display: 'flex', borderBottom: '1px solid var(--c-divider)', bgcolor: 'var(--c-surface-1)', alignItems: 'center' }}>
                <Box sx={{ width: SELECT_COL_WIDTH, minWidth: SELECT_COL_WIDTH, flex: '0 0 auto' }} />
                {columns.map((col) => (
                  <Box key={String(col.key)} sx={{ width: colWidths[col.key as string], minWidth: colWidths[col.key as string], flex: '0 0 auto', boxSizing: 'border-box', px: 1, py: 0.5 }}>
                    <TextField
                      placeholder="Filter…" value={colFilters[col.key as string] ?? ''} size="small" fullWidth variant="standard"
                      onChange={(e) => setColFilters((f) => ({ ...f, [col.key as string]: e.target.value }))}
                      slotProps={{ input: { sx: { fontSize: 12 }, 'aria-label': `Filter ${col.label}` } }}
                    />
                  </Box>
                ))}
                <Box sx={{ width: actionsColWidth, minWidth: actionsColWidth, flex: '0 0 auto' }} />
              </Box>

              {sortedRows.length === 0 ? (
                // The per-column text filters (unlike the toolbar search/dropdowns above)
                // narrow only the already-loaded page, client-side, with no server round
                // trip — so they can zero out `sortedRows` while `rows` (and the header/
                // filter inputs, kept mounted above) stay non-empty. Without this branch
                // the whole grid — filter boxes included — used to disappear into the
                // generic EmptyState, trapping the stray filter with no visible way to
                // clear it (§13-worthy: looked like "Catalog is empty" with data present).
                <Box sx={{ p: 4, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    No rows on this page match the column filters above.
                  </Typography>
                  <Button size="small" onClick={() => setColFilters({})}>Clear column filters</Button>
                </Box>
              ) : (
                <FixedSizeList
                  ref={listRef}
                  height={Math.min(sortedRows.length * ROW_HEIGHT, 640)}
                  width={itemsTotalWidth}
                  itemCount={sortedRows.length}
                  itemSize={ROW_HEIGHT}
                >
                  {renderItemRow}
                </FixedSizeList>
              )}
            </Box>
          </Surface>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              {total === 0 ? '0 items' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
              {loading && <CircularProgress size={11} sx={{ ml: 1, verticalAlign: 'middle' }} />}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Select size="small" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZE_OPTIONS.map((n) => <MenuItem key={n} value={n}>{n} / page</MenuItem>)}
            </Select>
            <IconButton size="small" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeftIcon /></IconButton>
            <Typography variant="caption">Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</Typography>
            <IconButton size="small" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}><ChevronRightIcon /></IconButton>
          </Box>
        </>
      )}

      {/* Where used — the BOMs and orders behind the counts, each a link. */}
      <Popover
        open={!!usageAnchor} anchorEl={usageAnchor?.el ?? null} onClose={() => setUsageAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 1.5, width: 300 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Where used — {usageAnchor?.item.name}
          </Typography>
          {!usage ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={18} /></Box>
          ) : (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                In {usage.bomCount} BOM{usage.bomCount === 1 ? '' : 's'}{usage.bomCount > usage.boms.length ? ` (showing ${usage.boms.length})` : ''}
              </Typography>
              {usage.boms.length === 0 && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 1 }}>Not a part of any BOM.</Typography>}
              {usage.boms.map((b) => (
                <Button key={b.itemId} size="small" fullWidth onClick={() => { setUsageAnchor(null); navigate(`/${company}/fab_erp/item-catalog/${b.itemId}`); }}
                  sx={{ justifyContent: 'flex-start', textTransform: 'none', fontSize: 12.5, px: 1 }}>
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</Box>
                  {b.code && <Box component="span" sx={{ ml: 'auto', pl: 1, fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--c-text-3)' }}>{b.code}</Box>}
                </Button>
              ))}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, mb: 0.5 }}>
                On {usage.orderCount} order{usage.orderCount === 1 ? '' : 's'}{usage.orderCount > usage.orders.length ? ` (showing ${usage.orders.length})` : ''}
              </Typography>
              {usage.orders.length === 0 && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Not on any order.</Typography>}
              {usage.orders.map((o) => (
                <Button key={o.orderId} size="small" fullWidth onClick={() => { setUsageAnchor(null); navigate(`/${company}/fab_erp/orders/${o.orderId}`); }}
                  sx={{ justifyContent: 'flex-start', textTransform: 'none', fontSize: 12.5, px: 1, fontFamily: 'var(--font-mono, monospace)' }}>
                  {o.orderNumber}
                </Button>
              ))}
            </>
          )}
        </Box>
      </Popover>

      <FormDialog
        open={bulkSection != null}
        title={`${bulkTitle} on ${selected.size} item${selected.size === 1 ? '' : 's'}`}
        subtitle="Only what you set here changes — a blank field leaves the items as they are."
        onClose={() => setBulkSection(null)}
        onSubmit={async () => { await applyBulkEdit(); setBulkSection(null); }}
        submitLabel="Apply"
      >
        {bulkSection === 'procurement' && (
          <TextField select label="Procurement type" size="small" fullWidth value={bulkProcurementType} onChange={(e) => setBulkProcurementType(e.target.value)}>
            <MenuItem value="">— leave unchanged —</MenuItem>
            {PROCUREMENT_TYPES.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
          </TextField>
        )}
        {bulkSection === 'taxonomy' && (
          <>
            <Typography variant="caption" color="text.secondary">Category (choosing one also sets Group/Sub-group below)</Typography>
            <TaxonomyPicker
              categories={categories} groups={groups} subgroups={subgroups}
              value={bulkTaxonomy} onChange={setBulkTaxonomy} emptyLabel="— leave unchanged —"
            />
          </>
        )}
        {bulkSection === 'steel' && (
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Autocomplete
              freeSolo fullWidth options={(facets?.material ?? []).map((f) => f.value)}
              value={bulkMaterial} onInputChange={(_, v) => setBulkMaterial(v)}
              renderInput={(params) => <TextField {...params} label="Material" size="small" placeholder="leave unchanged" />}
            />
            <Autocomplete
              freeSolo fullWidth options={(facets?.grade ?? []).map((f) => f.value)}
              value={bulkGrade} onInputChange={(_, v) => setBulkGrade(v)}
              renderInput={(params) => <TextField {...params} label="Grade" size="small" placeholder="leave unchanged" />}
            />
          </Box>
        )}
      </FormDialog>

      <FormDialog
        open={dup != null}
        title="Duplicate item"
        subtitle="Prefilled from the source row — change what differs (usually a size). The code is minted on save."
        onClose={() => setDup(null)}
        onSubmit={saveDuplicate}
        submitLabel="Create"
      >
        {dup && (
          <>
            <TextField label="Name" size="small" fullWidth required value={dup.name} onChange={(e) => setDup({ ...dup, name: e.target.value })} />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label="Unit" size="small" sx={{ width: 120 }} value={dup.unit} onChange={(e) => setDup({ ...dup, unit: e.target.value })} />
              <TextField select label="Procurement" size="small" sx={{ flex: 1 }} value={dup.procurementType} onChange={(e) => setDup({ ...dup, procurementType: e.target.value })}>
                {PROCUREMENT_TYPES.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
              </TextField>
              <TextField label="HSN" size="small" sx={{ width: 120 }} value={dup.hsnCode} onChange={(e) => setDup({ ...dup, hsnCode: e.target.value })} />
            </Box>
            <TaxonomyPicker
              categories={categories} groups={groups} subgroups={subgroups} required
              value={dup.taxonomy} onChange={(taxonomy) => setDup({ ...dup, taxonomy })}
              labels={{ category: 'Category', group: 'Group', subgroup: 'Sub-group' }}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              {SIZE_KEYS.map((k) => (
                <TextField key={k} type="number" size="small" fullWidth
                  label={ITEM_COLUMNS.find((c) => c.key === k)?.label}
                  value={dup[k]} onChange={(e) => setDup({ ...dup, [k]: e.target.value })}
                  slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                />
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Autocomplete
                freeSolo fullWidth options={(facets?.materialForm ?? []).map((f) => f.value)}
                value={dup.materialForm} onInputChange={(_, v) => setDup({ ...dup, materialForm: v })}
                renderInput={(params) => <TextField {...params} label="Material form" size="small" />}
              />
              <Autocomplete
                freeSolo fullWidth options={(facets?.material ?? []).map((f) => f.value)}
                value={dup.material} onInputChange={(_, v) => setDup({ ...dup, material: v })}
                renderInput={(params) => <TextField {...params} label="Material" size="small" />}
              />
              <Autocomplete
                freeSolo fullWidth options={(facets?.grade ?? []).map((f) => f.value)}
                value={dup.grade} onInputChange={(_, v) => setDup({ ...dup, grade: v })}
                renderInput={(params) => <TextField {...params} label="Grade" size="small" />}
              />
            </Box>
            <TextField label="Description" size="small" fullWidth multiline minRows={2} value={dup.description} onChange={(e) => setDup({ ...dup, description: e.target.value })} />
          </>
        )}
      </FormDialog>
    </Box>
  );
});
