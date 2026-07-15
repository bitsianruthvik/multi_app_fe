import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, IconButton, MenuItem,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import { fabQuery, fabMutate } from '../api/client';
import type { FilterValue } from '../api/client';
import { Surface, EmptyState, useToast } from '../components';
import api, { API_HOST } from '@core/utils/axiosConfig';

// Tree can be 1000+ rows across hundreds of top-level branches — everything
// here is lazy: top-level items load one page at a time, and a node's
// children are only fetched the first time it's expanded (then cached in
// that node's own local state so collapse/re-expand doesn't re-fetch).
const MAX_ITEM_TREE_DEPTH = 12;
const TOP_LEVEL_PAGE_SIZE = 200;
const CHILD_PAGE_SIZE = 200;

// ─── Types ──────────────────────────────────────────────────────────────────

interface FabItemRow {
  id: number;
  companyId?: number;
  orderId: number;
  flowId: number | null;
  parentItemId: number | null;
  catalogItemId: number | null;
  name: string;
  unit: string | null;
  qty: number;
  createdAt?: string;
  updatedAt?: string;
  orderNumber?: string;
  catalogItemCode?: string | null;
  catalogItemUnit?: string | null;
}

interface CatalogOption { id: number; name: string; code: string; unit: string | null }
interface FlowOption { id: number; name: string; code?: string; active?: number }
interface CustomFieldRow {
  id: number; level: string; levelId: number; fieldKey: string; fieldType: string; fieldValue: string | null;
}
interface ImportItemsResult {
  itemsCreated: number;
  itemsSkipped: number;
  warnings: Array<{ row?: number; message: string }>;
  reportBase64?: string;
}

function downloadBase64Xlsx(base64: string, filename: string) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function errMsg(e: unknown, fallback = 'Something went wrong'): string {
  const ax = e as { response?: { status?: number; data?: { message?: string; error?: string } }; message?: string };
  if (ax.response?.status === 404) return 'Not found — row may have been deleted by someone else.';
  return ax.response?.data?.message ?? ax.response?.data?.error ?? ax.message ?? fallback;
}

// ─── Inline "add item" row — used for both top-level items and children ────

function AddItemRow({ orderId, parentItemId, onCreated, onCancel }: {
  orderId: number;
  parentItemId: number | null;
  onCreated: (row: FabItemRow) => void;
  onCancel: () => void;
}) {
  const [inputValue, setInputValue] = useState('');
  const [selected, setSelected] = useState<CatalogOption | null>(null);
  const [opts, setOpts] = useState<CatalogOption[]>([]);
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      try {
        // Genuine substring search needs the dotted-operator form with
        // wildcards supplied by us — a plain { name: q } filter is silently
        // exact-match in this codebase's query builder.
        const res = await fabQuery<{ data: CatalogOption[] }>('fabErpItemCatalog', {
          filters: q ? { 'name.LIKE': `%${q}%` } : undefined,
          orderBy: [{ field: 'name', direction: 'asc' }],
          pagination: { limit: 50 },
        });
        setOpts(res.data ?? []);
      } catch { /* ignore */ }
    }, 200);
  }, []);

  async function create() {
    const name = (selected?.name ?? inputValue).trim();
    if (!name) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      const res = await fabMutate<{ id: number }>('fabErpItem', 'insert', {
        order_id: orderId,
        parent_item_id: parentItemId,
        catalog_item_id: selected?.id ?? null,
        name,
        unit: unit.trim() || null,
        qty: parseFloat(qty) || 1,
        // Every new item starts with no flow assignment, independent of its
        // parent — flow_id is never inherited/pre-filled from the parent.
        flow_id: null,
      });
      onCreated({
        id: res.id,
        orderId,
        flowId: null,
        parentItemId,
        catalogItemId: selected?.id ?? null,
        name,
        unit: unit.trim() || null,
        qty: parseFloat(qty) || 1,
        catalogItemCode: selected?.code ?? null,
        catalogItemUnit: selected?.unit ?? null,
      });
    } catch (e) {
      setError(errMsg(e, 'Create failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{
      display: 'flex', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap',
      py: 1, px: 1.5, bgcolor: 'var(--c-surface-2)', borderRadius: 1,
    }}>
      <Autocomplete
        freeSolo
        size="small"
        sx={{ flex: '2 1 220px' }}
        options={opts}
        getOptionLabel={(o) => (typeof o === 'string' ? o : `${o.name}${o.code ? ` (${o.code})` : ''}`)}
        filterOptions={(x) => x}
        inputValue={inputValue}
        onOpen={() => search(inputValue)}
        onInputChange={(_, v, reason) => {
          if (reason === 'reset') return;
          setInputValue(v);
          if (selected) setSelected(null);
          search(v);
        }}
        onChange={(_, v) => {
          if (v && typeof v !== 'string') {
            setSelected(v);
            setInputValue(v.name);
            if (v.unit) setUnit(v.unit);
          } else {
            setSelected(null);
          }
        }}
        renderOption={(props, o) => (
          <li {...props} key={o.id}>
            <Box>
              <Typography variant="body2">{o.name}</Typography>
              {o.code && <Typography variant="caption" color="text.disabled">{o.code}</Typography>}
            </Box>
          </li>
        )}
        renderInput={(params) => (
          <TextField {...params} label="Item name (pick catalog item, or type free text for an RM cut)" size="small" autoFocus />
        )}
      />
      <TextField label="Qty" type="number" size="small" sx={{ flex: '0 1 80px' }} value={qty} onChange={(e) => setQty(e.target.value)} />
      <TextField label="Unit" size="small" sx={{ flex: '0 1 80px' }} value={unit} onChange={(e) => setUnit(e.target.value)} />
      <Button size="small" variant="contained" disabled={saving} onClick={create}
        startIcon={saving ? <CircularProgress size={12} color="inherit" /> : <AddIcon fontSize="small" />}>
        Add
      </Button>
      <Button size="small" onClick={onCancel} disabled={saving}>Cancel</Button>
      {error && <Alert severity="error" sx={{ width: '100%' }}>{error}</Alert>}
    </Box>
  );
}

// ─── One tree node (recursive) ─────────────────────────────────────────────

function ItemNode({ item, depth, canManage, flows, onDeleted }: {
  item: FabItemRow;
  depth: number;
  canManage: boolean;
  flows: FlowOption[];
  onDeleted: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [childrenLoaded, setChildrenLoaded] = useState(false);
  const [children, setChildren] = useState<FabItemRow[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [loadingMoreChildren, setLoadingMoreChildren] = useState(false);
  const [hasMoreChildren, setHasMoreChildren] = useState(false);
  const [childrenError, setChildrenError] = useState('');
  const [addingChild, setAddingChild] = useState(false);

  const [name, setName] = useState(item.name ?? '');
  const [qty, setQty] = useState(String(item.qty ?? ''));
  const [unit, setUnit] = useState(item.unit ?? '');
  const [flowId, setFlowId] = useState<number | ''>(item.flowId ?? '');
  const savedRef = useRef({ name: item.name ?? '', qty: item.qty, unit: item.unit ?? '' });

  const [rowError, setRowError] = useState('');
  const [savingRow, setSavingRow] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [customFieldsLoaded, setCustomFieldsLoaded] = useState(false);
  const [showCustomFields, setShowCustomFields] = useState(false);
  const [lengthField, setLengthField] = useState<{ id: number | null; value: string }>({ id: null, value: '' });
  const [widthField, setWidthField] = useState<{ id: number | null; value: string }>({ id: null, value: '' });
  const [savingCustom, setSavingCustom] = useState(false);

  const atMaxDepth = depth >= MAX_ITEM_TREE_DEPTH;

  async function loadChildren(afterId?: number) {
    setLoadingChildren(afterId ? loadingChildren : true);
    if (afterId) setLoadingMoreChildren(true);
    setChildrenError('');
    try {
      const filters: Record<string, FilterValue> = { parentItemId: item.id };
      if (afterId) filters['id.GT'] = afterId;
      const res = await fabQuery<{ data: FabItemRow[] }>('fabErpItem', {
        filters,
        orderBy: [{ field: 'id', direction: 'asc' }],
        pagination: { limit: CHILD_PAGE_SIZE },
      });
      const rows = res.data ?? [];
      setChildren((prev) => (afterId ? [...prev, ...rows] : rows));
      setHasMoreChildren(rows.length === CHILD_PAGE_SIZE);
      setChildrenLoaded(true);
    } catch (e) {
      setChildrenError(errMsg(e, 'Failed to load children'));
    } finally {
      setLoadingChildren(false);
      setLoadingMoreChildren(false);
    }
  }

  async function loadCustomFields() {
    try {
      const res = await fabQuery<{ data: CustomFieldRow[] }>('fabErpCustomField', {
        filters: { level: 'item', levelId: item.id },
        pagination: { limit: 20 },
      });
      const rows = res.data ?? [];
      const len = rows.find((r) => r.fieldKey === 'length');
      const wid = rows.find((r) => r.fieldKey === 'width');
      setLengthField({ id: len?.id ?? null, value: len?.fieldValue ?? '' });
      setWidthField({ id: wid?.id ?? null, value: wid?.fieldValue ?? '' });
      setCustomFieldsLoaded(true);
    } catch {
      // non-fatal — length/width are optional
    }
  }

  function toggleExpand() {
    if (atMaxDepth) return;
    const next = !expanded;
    setExpanded(next);
    if (next && !childrenLoaded) loadChildren();
  }

  async function saveRow(patch: Partial<{ name: string; qty: string; unit: string; flowId: number | '' }>) {
    const nextName = patch.name ?? name;
    const nextQty = patch.qty ?? qty;
    const nextUnit = patch.unit ?? unit;
    const nextFlowId = patch.flowId !== undefined ? patch.flowId : flowId;

    const parsedQty = parseFloat(nextQty) || 0;
    const unchanged = nextName === savedRef.current.name
      && parsedQty === savedRef.current.qty
      && (nextUnit || '') === (savedRef.current.unit || '')
      && patch.flowId === undefined;
    if (unchanged) return;

    setSavingRow(true); setRowError('');
    try {
      await fabMutate('fabErpItem', 'update', {
        id: item.id,
        order_id: item.orderId,
        parent_item_id: item.parentItemId,
        catalog_item_id: item.catalogItemId,
        name: nextName,
        unit: nextUnit.trim() || null,
        qty: parsedQty,
        flow_id: nextFlowId === '' ? null : nextFlowId,
      });
      savedRef.current = { name: nextName, qty: parsedQty, unit: nextUnit };
    } catch (e) {
      setRowError(errMsg(e, 'Save failed'));
    } finally {
      setSavingRow(false);
    }
  }

  async function handleFlowChange(newFlowId: number | '') {
    const prev = flowId;
    setFlowId(newFlowId);
    await saveRow({ flowId: newFlowId });
    if (rowError) setFlowId(prev);
  }

  async function handleDelete() {
    setDeleting(true); setRowError('');
    try {
      await fabMutate('fabErpItem', 'delete', { id: item.id });
      onDeleted(item.id);
    } catch (e) {
      setRowError(errMsg(e, 'Delete failed'));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function saveCustomField(key: 'length' | 'width') {
    const field = key === 'length' ? lengthField : widthField;
    const setField = key === 'length' ? setLengthField : setWidthField;
    const trimmed = field.value.trim();
    setSavingCustom(true);
    try {
      if (!trimmed) {
        if (field.id) {
          await fabMutate('fabErpCustomField', 'delete', { id: field.id });
          setField({ id: null, value: '' });
        }
      } else if (field.id) {
        await fabMutate('fabErpCustomField', 'update', {
          id: field.id, level: 'item', level_id: item.id, field_key: key, field_type: 'number', field_value: trimmed, sort_order: 0,
        });
      } else {
        const res = await fabMutate<{ id: number }>('fabErpCustomField', 'insert', {
          level: 'item', level_id: item.id, field_key: key, field_type: 'number', field_value: trimmed, sort_order: 0,
        });
        setField({ id: res.id, value: trimmed });
      }
    } catch (e) {
      setRowError(errMsg(e, 'Failed to save dimension'));
    } finally {
      setSavingCustom(false);
    }
  }

  function handleChildDeleted(id: number) {
    setChildren((prev) => prev.filter((r) => r.id !== id));
  }

  const th = { fontSize: 13, color: 'var(--c-text)' } as const;

  return (
    <Box sx={{ borderBottom: '0.5px solid var(--c-divider)', '&:last-child': { borderBottom: 'none' } }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        pl: `${6 + depth * 24}px`, pr: 1.5, py: 0.75,
        '&:hover': { bgcolor: 'var(--c-surface-2)' },
        '&:hover .item-actions': { opacity: 1 },
      }}
      >
        <IconButton size="small" onClick={toggleExpand} disabled={atMaxDepth} sx={{ p: 0.25 }}>
          <ChevronRightIcon sx={{
            fontSize: 16,
            color: atMaxDepth ? 'transparent' : 'text.secondary',
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s',
          }} />
        </IconButton>

        <TextField
          variant="standard"
          size="small"
          value={name}
          disabled={!canManage || savingRow}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => saveRow({ name })}
          sx={{ flex: '2 1 200px', ...th }}
          placeholder="Item name"
        />

        <TextField
          variant="standard"
          size="small"
          type="number"
          value={qty}
          disabled={!canManage || savingRow}
          onChange={(e) => setQty(e.target.value)}
          onBlur={() => saveRow({ qty })}
          sx={{ flex: '0 1 70px', ...th }}
          slotProps={{ input: { style: { textAlign: 'right' } } }}
        />

        <TextField
          variant="standard"
          size="small"
          value={unit}
          disabled={!canManage || savingRow}
          onChange={(e) => setUnit(e.target.value)}
          onBlur={() => saveRow({ unit })}
          sx={{ flex: '0 1 60px', ...th }}
          placeholder="unit"
        />

        <TextField
          select
          variant="standard"
          size="small"
          label="Flow"
          value={flowId}
          disabled={!canManage}
          onChange={(e) => handleFlowChange(e.target.value === '' ? '' : Number(e.target.value))}
          sx={{ flex: '0 1 140px' }}
        >
          <MenuItem value="">None</MenuItem>
          {flows.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
        </TextField>

        {item.catalogItemCode && (
          <Typography variant="caption" color="text.disabled" fontFamily="monospace" sx={{ flexShrink: 0 }}>
            {item.catalogItemCode}
          </Typography>
        )}

        {savingRow && <CircularProgress size={12} />}

        <Box className="item-actions" sx={{ display: 'flex', gap: 0.25, flexShrink: 0, opacity: 0, transition: 'opacity 0.1s', ml: 'auto' }}>
          {canManage && !atMaxDepth && (
            <Tooltip title="Add child">
              <IconButton size="small" onClick={() => { if (!expanded) { setExpanded(true); if (!childrenLoaded) loadChildren(); } setAddingChild(true); }} sx={{ p: 0.25 }}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {canManage && (
            <Tooltip title="Dimensions (length / width)">
              <IconButton size="small" onClick={() => { setShowCustomFields((s) => !s); if (!customFieldsLoaded) loadCustomFields(); }} sx={{ p: 0.25 }}>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>L×W</Typography>
              </IconButton>
            </Tooltip>
          )}
          {canManage && (
            <Tooltip title="Remove">
              <IconButton size="small" color="error" onClick={() => setConfirmDelete(true)} sx={{ p: 0.25 }} disabled={deleting}>
                <DeleteOutlineRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {rowError && (
        <Alert severity="error" sx={{ mx: `${6 + depth * 24}px`, mb: 0.5 }} onClose={() => setRowError('')}>
          {rowError}
        </Alert>
      )}

      {confirmDelete && (
        <Box sx={{ ml: `${6 + depth * 24}px`, mr: 1.5, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" color="error">
            Delete "{name}"{children.length ? ' — this does not cascade-delete its children automatically.' : '?'}
          </Typography>
          <Button size="small" color="error" variant="contained" onClick={handleDelete} disabled={deleting}>
            {deleting ? <CircularProgress size={12} color="inherit" /> : 'Confirm'}
          </Button>
          <Button size="small" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</Button>
        </Box>
      )}

      {showCustomFields && (
        <Box sx={{ ml: `${6 + depth * 24 + 24}px`, mr: 1.5, mb: 1, display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <TextField
            label="Length" type="number" size="small" variant="standard" sx={{ width: 90 }}
            value={lengthField.value}
            disabled={!canManage || savingCustom}
            onChange={(e) => setLengthField((f) => ({ ...f, value: e.target.value }))}
            onBlur={() => saveCustomField('length')}
          />
          <TextField
            label="Width" type="number" size="small" variant="standard" sx={{ width: 90 }}
            value={widthField.value}
            disabled={!canManage || savingCustom}
            onChange={(e) => setWidthField((f) => ({ ...f, value: e.target.value }))}
            onBlur={() => saveCustomField('width')}
          />
          {savingCustom && <CircularProgress size={12} />}
        </Box>
      )}

      {atMaxDepth && expanded === false && depth === MAX_ITEM_TREE_DEPTH && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', ml: `${6 + depth * 24 + 24}px`, mb: 1 }}>
          Max tree depth reached — further nesting is hidden.
        </Typography>
      )}

      {expanded && (
        <Box sx={{ ml: `${6 + depth * 24 + 12}px`, borderLeft: '2px solid var(--c-divider)' }}>
          {loadingChildren ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 2, py: 1 }}>
              <CircularProgress size={14} />
              <Typography variant="caption" color="text.disabled">Loading children…</Typography>
            </Box>
          ) : childrenError ? (
            <Alert severity="error" sx={{ mx: 2, my: 1 }}>{childrenError}</Alert>
          ) : (
            <>
              {children.length === 0 && !addingChild && (
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', pl: 3, py: 1 }}>
                  No children
                </Typography>
              )}
              {children.map((child) => (
                <ItemNode
                  key={child.id}
                  item={child}
                  depth={depth + 1}
                  canManage={canManage}
                  flows={flows}
                  onDeleted={handleChildDeleted}
                />
              ))}
              {hasMoreChildren && (
                <Box sx={{ pl: 3, py: 0.5 }}>
                  <Button size="small" onClick={() => loadChildren(children[children.length - 1]?.id)} disabled={loadingMoreChildren}>
                    {loadingMoreChildren ? <CircularProgress size={12} /> : 'Load more'}
                  </Button>
                </Box>
              )}
              {addingChild && (
                <Box sx={{ pl: 1.5, pr: 1, py: 0.5 }}>
                  <AddItemRow
                    orderId={item.orderId}
                    parentItemId={item.id}
                    onCreated={(row) => { setChildren((prev) => [...prev, row]); setAddingChild(false); }}
                    onCancel={() => setAddingChild(false)}
                  />
                </Box>
              )}
            </>
          )}
        </Box>
      )}
    </Box>
  );
}

// ─── Root component ─────────────────────────────────────────────────────────

export interface OrderItemsTreeProps {
  orderId: number;
  canManage: boolean;
}

export default function OrderItemsTree({ orderId, canManage }: OrderItemsTreeProps) {
  const { toast } = useToast();
  const [topItems, setTopItems] = useState<FabItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [flows, setFlows] = useState<FlowOption[]>([]);
  const [addingRoot, setAddingRoot] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState('');
  const [importResult, setImportResult] = useState<ImportItemsResult | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Lazy: only top-level items (parentItemId === null) are fetched here —
  // never the whole order's item list. Filter keys are camelCase for reads
  // (orderId / parentItemId), matching fabErpItem's exposed field names —
  // a snake_case key here would silently return unfiltered rows.
  const loadTop = useCallback(async (afterId?: number) => {
    const filters: Record<string, FilterValue> = { orderId, parentItemId: null };
    if (afterId) filters['id.GT'] = afterId;
    const res = await fabQuery<{ data: FabItemRow[] }>('fabErpItem', {
      filters,
      orderBy: [{ field: 'id', direction: 'asc' }],
      pagination: { limit: TOP_LEVEL_PAGE_SIZE },
    });
    return res.data ?? [];
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    Promise.all([
      loadTop(),
      fabQuery<{ data: FlowOption[] }>('fabErpOperationFlow', {
        filters: { active: 1 },
        orderBy: [{ field: 'name', direction: 'asc' }],
        pagination: { limit: 200 },
      }).then((r) => r.data ?? []).catch(() => []),
    ]).then(([rows, flowRows]) => {
      if (cancelled) return;
      setTopItems(rows);
      setHasMore(rows.length === TOP_LEVEL_PAGE_SIZE);
      setFlows(flowRows);
    }).catch((e) => { if (!cancelled) setError(errMsg(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadTop]);

  async function loadMore() {
    if (topItems.length === 0) return;
    setLoadingMore(true);
    try {
      const lastId = topItems[topItems.length - 1].id;
      const rows = await loadTop(lastId);
      setTopItems((prev) => [...prev, ...rows]);
      setHasMore(rows.length === TOP_LEVEL_PAGE_SIZE);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoadingMore(false);
    }
  }

  function handleDeleted(id: number) {
    setTopItems((prev) => prev.filter((r) => r.id !== id));
    toast('Item removed');
  }

  async function downloadItemsTemplate() {
    setExporting(true);
    try {
      const companySlug = localStorage.getItem('companySlug');
      const res = await api.get(
        `${API_HOST}/api/${companySlug}/fab_erp/orders/${orderId}/items/export-template`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Order_Items_Import_Template.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errMsg(e, 'Failed to download template'));
    } finally {
      setExporting(false);
    }
  }

  async function handleImportItemsFile(file: File) {
    setImporting(true); setImportErr(''); setImportResult(null);
    try {
      const companySlug = localStorage.getItem('companySlug');
      const form = new FormData();
      form.append('excel_file', file);
      const res = await api.post<ImportItemsResult>(
        `${API_HOST}/api/${companySlug}/fab_erp/orders/${orderId}/items/import`, form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setImportResult(res.data);
      // Re-fetch top-level items — an import can add new top-level branches
      // (e.g. G11, G12) alongside whatever was already there.
      const rows = await loadTop();
      setTopItems(rows);
      setHasMore(rows.length === TOP_LEVEL_PAGE_SIZE);
      toast(`${res.data.itemsCreated} item(s) imported`);
    } catch (e) {
      setImportErr(errMsg(e, 'Import failed'));
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return (
      <Surface e={1} sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Surface>
    );
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {canManage && (
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
          <Button
            variant="outlined" size="small"
            startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon />}
            onClick={downloadItemsTemplate} disabled={exporting}
          >
            Export template
          </Button>
          <Button
            variant="outlined" size="small"
            startIcon={importing ? <CircularProgress size={14} color="inherit" /> : <UploadFileIcon />}
            onClick={() => importFileRef.current?.click()} disabled={importing}
          >
            Import from Excel
          </Button>
          <input
            ref={importFileRef}
            type="file"
            accept=".xlsx"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportItemsFile(file);
              e.target.value = '';
            }}
          />
        </Box>
      )}

      {importErr && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setImportErr('')}>{importErr}</Alert>}

      {importResult && (
        <Alert
          severity={importResult.itemsSkipped > 0 ? 'warning' : 'success'}
          sx={{ mb: 1.5 }}
          onClose={() => setImportResult(null)}
          action={importResult.reportBase64 ? (
            <Button
              size="small"
              onClick={() => downloadBase64Xlsx(importResult.reportBase64!, 'Order_Items_Import_Report.xlsx')}
            >
              Download report
            </Button>
          ) : undefined}
        >
          {importResult.itemsCreated} item(s) created
          {importResult.itemsSkipped > 0 ? `, ${importResult.itemsSkipped} skipped` : ''}.
          {importResult.warnings.length > 0 ? ` ${importResult.warnings.length} warning(s) — see report.` : ''}
        </Alert>
      )}

      {canManage && (
        <Box sx={{ mb: 2 }}>
          {addingRoot ? (
            <AddItemRow
              orderId={orderId}
              parentItemId={null}
              onCreated={(row) => { setTopItems((prev) => [...prev, row]); setAddingRoot(false); toast('Item added'); }}
              onCancel={() => setAddingRoot(false)}
            />
          ) : (
            <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => setAddingRoot(true)}>
              Add top-level item
            </Button>
          )}
        </Box>
      )}

      {topItems.length === 0 ? (
        <EmptyState icon={<AddIcon />} title="No items yet" hint="Add a top-level item to start building this order's item tree." />
      ) : (
        <Surface e={1} sx={{ overflow: 'hidden' }}>
          {topItems.map((row) => (
            <ItemNode
              key={row.id}
              item={row}
              depth={0}
              canManage={canManage}
              flows={flows}
              onDeleted={handleDeleted}
            />
          ))}
        </Surface>
      )}

      {hasMore && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1.5 }}>
          <Button size="small" onClick={loadMore} disabled={loadingMore}
            startIcon={loadingMore ? <CircularProgress size={12} /> : undefined}>
            Load more top-level items
          </Button>
        </Box>
      )}
    </Box>
  );
}
