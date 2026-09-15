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
 */
import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, IconButton, InputAdornment,
  MenuItem, Select, Switch, TableSortLabel, TextField, Tooltip, Typography,
} from '@mui/material';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';
import SearchIcon from '@mui/icons-material/Search';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ListAltIcon from '@mui/icons-material/ListAlt';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import { fabMutate } from '../../api/client';
import { listCatalogItems, type CatalogItemRow, type CatalogItemsQuery } from '../../api/catalog';
import type { FabItemCategory, FabItemGroup, FabItemSubgroup } from '../../types';
import {
  Surface, EmptyState, ListSkeleton, useToast, FormDialog, TaxonomyPicker, backendMessage,
  type SortableColumn, type TaxonomyValue,
} from '../../components';
import { useSortableData } from '../../hooks/useSortableData';
import { displayUom } from '../../constants/uom';
import { PROCUREMENT_TYPES } from './shared';

const TH = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
const TD = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

/** A catalog row with its display-only `size`/`material` strings joined in for the grid. */
type ItemRow = CatalogItemRow & { size: string; material: string };

// Item 6: procurement type, material form, material/grade and thickness join
// Description/HSN as default columns — they are what a fabricator actually
// searches a plate catalog by.
const ITEM_COLUMNS: SortableColumn<ItemRow>[] = [
  { key: 'name',            label: 'Name',            sx: { ...TH, minWidth: 200 } },
  { key: 'code',            label: 'Code',            sx: { ...TH, width: 110 } },
  { key: 'unit',            label: 'Unit',            sx: { ...TH, width: 70 } },
  { key: 'size',            label: 'Size',            sx: { ...TH, width: 150 } },
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

const SIZE_COL_WIDTH = 150;
const DEFAULT_ITEM_COL_WIDTH: Record<string, number> = {
  name: 220, code: 110, unit: 70, size: SIZE_COL_WIDTH, procurementType: 100, materialForm: 110,
  material: 140, unitWeightKg: 100, description: 220, categoryName: 130, groupName: 130,
  subgroupName: 130, hsnCode: 100,
};
const COL_WIDTH_STORAGE_KEY = 'fab_erp_item_catalog_col_widths';
const MIN_COL_WIDTH = 60;
const SELECT_COL_WIDTH = 36;
const BATCHES_COL_WIDTH = 64;
const ACTIONS_COL_WIDTH = 84;
const ROW_HEIGHT = 38;
const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];

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

export interface ItemsTabHandle {
  refresh: () => void;
}

export const ItemsTab = forwardRef<ItemsTabHandle, {
  canManage: boolean;
  categories: FabItemCategory[];
  groups: FabItemGroup[];
  subgroups: FabItemSubgroup[];
  onAdd: () => void;
  onEdit: (item: CatalogItemRow) => void;
  onDelete: (item: CatalogItemRow) => void;
}>(function ItemsTab({ canManage, categories, groups, subgroups, onAdd, onEdit, onDelete }, ref) {
  const navigate = useNavigate();
  const { company } = useParams<{ company: string }>();
  const { toast } = useToast();

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
        q: debouncedSearch || undefined,
        procurementType: procurementType || undefined,
        materialForm: materialForm || undefined,
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
  }, [debouncedSearch, procurementType, materialForm, thicknessMin, thicknessMax, taxonomy, uncategorized, page, pageSize, serverSort]);

  // Single effect: a filter change should land back on page 1 — otherwise
  // "page 4 of a now-3-page result" quietly shows nothing and looks like a
  // bug — but must fetch exactly once. Comparing the filter signature against
  // its previous value (not just listing filters as effect deps) lets this
  // tell "a filter changed, still need to reset the page" (skip fetching,
  // let the page-1 update re-trigger this same effect) apart from "a filter
  // changed but page was already 1" / "only the page or sort changed" (fetch
  // directly) — the old two-effect version fired for both on every filter
  // change: once with the stale page, once more after page reset to 1.
  const filterSig = JSON.stringify([debouncedSearch, procurementType, materialForm, thicknessMin, thicknessMax, taxonomy, uncategorized]);
  const prevFilterSigRef = useRef(filterSig);
  useEffect(() => {
    const filtersChanged = prevFilterSigRef.current !== filterSig;
    prevFilterSigRef.current = filterSig;
    if (filtersChanged && page !== 1) { setPage(1); return; }
    fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSig, page, pageSize, serverSort]);

  useImperativeHandle(ref, () => ({ refresh: fetchPage }), [fetchPage]);

  const itemsSized = useMemo(() => rows.map((it) => ({ ...it, size: rowSize(it), material: rowMaterial(it) })), [rows]);

  const filtered = useMemo(() => itemsSized.filter((it) => ITEM_COLUMNS.every((col) => {
    const needle = colFilters[col.key as string]?.trim().toLowerCase();
    if (!needle) return true;
    const raw = (it as unknown as Record<string, unknown>)[col.key as string];
    return String(raw ?? '').toLowerCase().includes(needle);
  })), [itemsSized, colFilters]);

  // Size sorts server-side (numeric, correct across pages); every other
  // column still sorts the loaded page locally — the per-column filters are
  // already page-scoped, so a local sort of the same page is consistent with
  // that, not a step backward from it.
  const { sortedRows, sortKey, sortDirection, requestSort } = useSortableData(filtered, 'name');

  function onHeaderSort(key: keyof ItemRow) {
    if (key === 'size' || key === 'unitWeightKg') {
      const sortCol = key === 'size' ? 'thicknessMm' : 'unitWeightKg';
      setServerSort((s) => (s?.key === sortCol ? { key: sortCol, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: sortCol, dir: 'asc' }));
      return;
    }
    requestSort(key);
  }

  // ── multi-select + bulk set (item 11) ───────────────────────────────────
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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkProcurementType, setBulkProcurementType] = useState('');
  const [bulkTaxonomy, setBulkTaxonomy] = useState<{ categoryId: number | null; groupId: number | null; subgroupId: number | null }>({ categoryId: null, groupId: null, subgroupId: null });

  async function applyBulkEdit() {
    const ids = [...selected];
    const payload: Record<string, unknown> = {};
    if (bulkProcurementType) payload.procurement_type = bulkProcurementType;
    if (bulkTaxonomy.categoryId != null) {
      payload.category_id = bulkTaxonomy.categoryId;
      payload.group_id = bulkTaxonomy.groupId;
      payload.subgroup_id = bulkTaxonomy.subgroupId;
    }
    if (!Object.keys(payload).length) throw new Error('Choose a procurement type or a category to apply.');
    const results = await Promise.allSettled(ids.map((id) => fabMutate('fabErpItemCatalog', 'update', { id, ...payload })));
    const failed = results.filter((r) => r.status === 'rejected').length;
    setSelected(new Set());
    setBulkProcurementType(''); setBulkTaxonomy({ categoryId: null, groupId: null, subgroupId: null });
    await fetchPage();
    if (failed) throw new Error(`${ids.length - failed} of ${ids.length} updated — ${failed} failed.`);
    toast(`${ids.length} item${ids.length === 1 ? '' : 's'} updated.`);
  }

  const itemsTotalWidth = ITEM_COLUMNS.reduce((sum, col) => sum + colWidths[col.key as string], 0)
    + SELECT_COL_WIDTH + BATCHES_COL_WIDTH + (canManage ? ACTIONS_COL_WIDTH : 0);

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
    return (
      <Box
        ref={(el: HTMLDivElement | null) => { if (el) rowElRef.current.set(index, el); else rowElRef.current.delete(index); }}
        style={style} tabIndex={0} role="button" aria-label={`Open ${it.name}`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); focusRow(index + 1); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); focusRow(index - 1); }
          else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(); }
        }}
        sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', borderBottom: '1px solid var(--c-divider)', '&:hover': { bgcolor: 'action.hover' }, '&:focus-visible': { outline: '2px solid var(--c-focus, #1976d2)', outlineOffset: '-2px' } }}
      >
        <Box sx={{ width: SELECT_COL_WIDTH, minWidth: SELECT_COL_WIDTH, flex: '0 0 auto', display: 'flex', justifyContent: 'center' }}>
          <Checkbox size="small" checked={selected.has(it.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleOne(it.id)} />
        </Box>
        <Box onClick={openRow} sx={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <Box sx={cellSx('name', { fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{it.name}</Box>
          <Box sx={cellSx('code')}><Box component="span" sx={{ fontFamily: 'var(--font-mono, monospace)' }}>{it.code}</Box></Box>
          <Box sx={cellSx('unit')}>{displayUom(it.unit) || 'PC'}</Box>
          <Box sx={cellSx('size', { fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })}>{it.size || '—'}</Box>
          <Box sx={cellSx('procurementType')}>{it.procurementType ?? '—'}</Box>
          <Box sx={cellSx('materialForm')}>{it.materialForm ?? '—'}</Box>
          <Box sx={cellSx('material', { color: 'var(--c-text-2)' })}>{it.material || '—'}</Box>
          <Box sx={cellSx('unitWeightKg', { textAlign: 'right' })}>{it.unitWeightKg != null ? Number(it.unitWeightKg).toFixed(2) : '—'}</Box>
          <Box sx={cellSx('description', { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text-2)' })}>{it.description ?? '—'}</Box>
          <Box sx={cellSx('categoryName')}>{it.categoryName ?? '—'}</Box>
          <Box sx={cellSx('groupName')}>{it.groupName ?? '—'}</Box>
          <Box sx={cellSx('subgroupName')}>{it.subgroupName ?? '—'}</Box>
          <Box sx={cellSx('hsnCode')}>{it.hsnCode ?? '—'}</Box>
        </Box>
        <Box sx={{ width: BATCHES_COL_WIDTH, minWidth: BATCHES_COL_WIDTH, flex: '0 0 auto', display: 'flex', justifyContent: 'center' }}>
          <Tooltip title="View batches">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); navigate(`/${company}/fab_erp/item-batches?itemId=${it.id}`); }}>
              <ListAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        {canManage && (
          <Box sx={{ width: ACTIONS_COL_WIDTH, minWidth: ACTIONS_COL_WIDTH, flex: '0 0 auto', display: 'flex', justifyContent: 'flex-end', px: 1 }}>
            <Tooltip title="Edit"><IconButton size="small" onClick={(e) => { e.stopPropagation(); onEdit(it); }}><EditIcon fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="Remove"><IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); onDelete(it); }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
          </Box>
        )}
      </Box>
    );
  }, [sortedRows, canManage, navigate, company, colWidths, selected, onEdit, onDelete, focusRow]);

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <TextField
          placeholder="Search by name or code…" value={search} size="small" sx={{ width: 260 }}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
        />
        <Box sx={{ width: 160 }}>
          <Typography variant="caption" color="text.secondary">Procurement</Typography>
          <Select fullWidth size="small" displayEmpty value={procurementType} onChange={(e) => setProcurementType(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {PROCUREMENT_TYPES.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
          </Select>
        </Box>
        <TextField label="Material form" value={materialForm} size="small" sx={{ width: 140 }} onChange={(e) => setMaterialForm(e.target.value)} placeholder="plate, section…" />
        <TextField label="Thickness ≥ (mm)" type="number" value={thicknessMin} size="small" sx={{ width: 130 }} onChange={(e) => setThicknessMin(e.target.value)} />
        <TextField label="Thickness ≤ (mm)" type="number" value={thicknessMax} size="small" sx={{ width: 130 }} onChange={(e) => setThicknessMax(e.target.value)} />
        <Box sx={{ width: 420 }}>
          <TaxonomyPicker
            categories={categories} groups={groups} subgroups={subgroups}
            value={taxonomy} onChange={(next) => { setUncategorized(false); setTaxonomy(next); }}
            disabled={uncategorized} emptyLabel="All"
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
        {selected.size > 0 && (
          <Button variant="outlined" onClick={() => setBulkOpen(true)}>Bulk edit ({selected.size})</Button>
        )}
      </Box>

      {loading && rows.length === 0 ? (
        <ListSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Inventory2Icon />}
          title={search ? 'No items match your search' : 'Catalog is empty'}
          action={!search && canManage ? <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd}>Add first item</Button> : undefined}
        />
      ) : (
        <>
          <Surface e={1} sx={{ overflowX: 'auto', p: 0 }}>
            <Box sx={{ width: itemsTotalWidth, minWidth: itemsTotalWidth }}>
              <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--c-divider)', bgcolor: 'var(--c-surface-2)' }}>
                <Box sx={{ width: SELECT_COL_WIDTH, minWidth: SELECT_COL_WIDTH, flex: '0 0 auto', display: 'flex', justifyContent: 'center' }}>
                  <Checkbox size="small" checked={allOnPageSelected} onChange={toggleAll} aria-label="Select all rows on this page" />
                </Box>
                {ITEM_COLUMNS.map((col) => (
                  <Box key={String(col.key)} role="columnheader" sx={{
                    ...col.sx, width: colWidths[col.key as string], minWidth: colWidths[col.key as string],
                    flex: '0 0 auto', boxSizing: 'border-box', display: 'flex', alignItems: 'center', position: 'relative',
                    justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start', px: 2, py: 1,
                  }}>
                    <TableSortLabel
                      active={col.key === 'size' ? serverSort?.key === 'thicknessMm' : (col.key === 'unitWeightKg' ? serverSort?.key === 'unitWeightKg' : sortKey === col.key)}
                      direction={col.key === 'size' || col.key === 'unitWeightKg' ? (serverSort?.dir ?? 'asc') : sortDirection}
                      onClick={() => onHeaderSort(col.key as keyof ItemRow)}
                    >
                      {col.label}
                    </TableSortLabel>
                    <Box onMouseDown={(e) => handleResizeStart(col.key as string, e)} sx={{ position: 'absolute', right: -3, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 1, '&:hover': { bgcolor: 'primary.main', opacity: 0.5 } }} />
                  </Box>
                ))}
                <Box sx={{ ...TH, width: BATCHES_COL_WIDTH, minWidth: BATCHES_COL_WIDTH, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 1, py: 1 }}>Batches</Box>
                {canManage && <Box sx={{ width: ACTIONS_COL_WIDTH, minWidth: ACTIONS_COL_WIDTH, flex: '0 0 auto' }} />}
              </Box>

              <Box sx={{ display: 'flex', borderBottom: '1px solid var(--c-divider)', bgcolor: 'var(--c-surface-1)', alignItems: 'center' }}>
                <Box sx={{ width: SELECT_COL_WIDTH, minWidth: SELECT_COL_WIDTH, flex: '0 0 auto' }} />
                {ITEM_COLUMNS.map((col) => (
                  <Box key={String(col.key)} sx={{ width: colWidths[col.key as string], minWidth: colWidths[col.key as string], flex: '0 0 auto', boxSizing: 'border-box', px: 1, py: 0.5 }}>
                    <TextField
                      placeholder="Filter…" value={colFilters[col.key as string] ?? ''} size="small" fullWidth variant="standard"
                      onChange={(e) => setColFilters((f) => ({ ...f, [col.key as string]: e.target.value }))}
                      slotProps={{ input: { sx: { fontSize: 12 }, 'aria-label': `Filter ${col.label}` } }}
                    />
                  </Box>
                ))}
                <Box sx={{ width: BATCHES_COL_WIDTH, minWidth: BATCHES_COL_WIDTH, flex: '0 0 auto' }} />
                {canManage && <Box sx={{ width: ACTIONS_COL_WIDTH, minWidth: ACTIONS_COL_WIDTH, flex: '0 0 auto' }} />}
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

      <FormDialog
        open={bulkOpen}
        title={`Bulk edit ${selected.size} item${selected.size === 1 ? '' : 's'}`}
        subtitle="Only the fields you set below are changed — leave a field blank to leave it alone."
        onClose={() => setBulkOpen(false)}
        onSubmit={applyBulkEdit}
        submitLabel="Apply"
      >
        <TextField select label="Procurement type" size="small" fullWidth value={bulkProcurementType} onChange={(e) => setBulkProcurementType(e.target.value)}>
          <MenuItem value="">— leave unchanged —</MenuItem>
          {PROCUREMENT_TYPES.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
        </TextField>
        <Typography variant="caption" color="text.secondary">Category (choosing one also sets Group/Sub-group below)</Typography>
        <TaxonomyPicker
          categories={categories} groups={groups} subgroups={subgroups}
          value={bulkTaxonomy} onChange={setBulkTaxonomy} emptyLabel="— leave unchanged —"
        />
      </FormDialog>
    </Box>
  );
});
