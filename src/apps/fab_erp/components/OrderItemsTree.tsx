import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, AlertTitle, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Radio, RadioGroup,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BuildCircleRounded from '@mui/icons-material/BuildCircleRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DownloadIcon from '@mui/icons-material/Download';
import AutoFixHighRounded from '@mui/icons-material/AutoFixHighRounded';
import StraightenRounded from '@mui/icons-material/StraightenRounded';
import TagRounded from '@mui/icons-material/TagRounded';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import { fabQuery, fabMutate, fabPost } from '../api/client';
import type { FilterValue } from '../api/client';
import { Surface, EmptyState, useToast, backendMessage } from '../components';
import { MaterializeOutcome, type MaterializeResponse } from './OrderTaskDag';
import type { OrderReadiness } from '../api/readiness';
import BoqWizardDialog, { type WizardLine } from './BoqWizardDialog';
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
  /** Generated identity code — server-issued and frozen, never edited here. */
  code?: string | null;
  unit: string | null;
  qty: number;
  /** Cut dimensions — meaningful on the bottom rows, blank once parts are joined. */
  length?: number | null;
  width?: number | null;
  height?: number | null;
  dimUnit?: string | null;
  /** Weight of ONE, typed by a human. Null when nobody has entered it. */
  unitWeight?: number | null;
  /** Σ(child qty × child effective weight). Server-owned — never written from here. */
  computedUnitWeight?: number | null;
  /** (unitWeight ?? computedUnitWeight) × qty. Server-owned. */
  totalWeight?: number | null;
  weightUnit?: string | null;
  createdAt?: string;
  updatedAt?: string;
  orderNumber?: string;
  catalogItemCode?: string | null;
  catalogItemUnit?: string | null;
}

interface CatalogOption { id: number; name: string; code: string; unit: string | null }
interface FlowOption { id: number; name: string; code?: string; active?: number }
interface ImportItemsResult {
  mode?: 'append' | 'replace';
  itemsCreated: number;
  itemsSkipped: number;
  itemsDeleted?: number;
  /** Span / girder / segment rows created on the way to a part. */
  levelsCreated?: number;
  /** Raw-material links created from the Raw Material column. */
  rmLinks?: number;
  totalWeight?: number | null;
  unweighedLeaves?: number;
  warnings: Array<{ row?: number; message: string }>;
  reportBase64?: string;
  /** Recomputed server-side after the upload — saves the page asking again. */
  readiness?: OrderReadiness | null;
}
interface ItemsSummary {
  totalWeight: number | null;
  itemCount: number;
  unweighedLeaves: number;
  uncodedItems: number;
  /** Shared `CUSTOMER-SONUMBER` head of every code in this order. */
  codePrefix: string | null;
}

/** Trims trailing zeros so 150.000000 reads as 150 and 271.3 stays 271.3. */
function fmtWeight(v: number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return `${Number(n.toFixed(3))}`;
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
    // BUG-08: freeSolo confirm-by-Enter leaves `selected` null even when the
    // typed text names a real catalog item, silently saving it as uncatalogued
    // (catalog_item_id NULL → no inventory/costing/planning link). If the input
    // exactly matches a loaded option's name, bind to it. Genuine free text
    // (e.g. an RM cut with no catalog row) still saves unlinked, as intended.
    const typed = inputValue.trim();
    const match = selected ?? opts.find((o) => o.name.trim().toLowerCase() === typed.toLowerCase()) ?? null;
    const name = (match?.name ?? inputValue).trim();
    if (!name) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      const res = await fabMutate<{ id: number }>('fabErpItem', 'insert', {
        order_id: orderId,
        parent_item_id: parentItemId,
        catalog_item_id: match?.id ?? null,
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
        catalogItemId: match?.id ?? null,
        name,
        unit: unit.trim() || null,
        qty: parseFloat(qty) || 1,
        catalogItemCode: match?.code ?? null,
        catalogItemUnit: match?.unit ?? null,
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

function ItemNode({ item, depth, canManage, flows, onDeleted, onItemAdded, onWeightChanged, treeVersion, codePrefix }: {
  item: FabItemRow;
  depth: number;
  canManage: boolean;
  flows: FlowOption[];
  onDeleted: (id: number) => void;
  /** Bubbles a new child up to the root so it can re-offer "build tasks". */
  onItemAdded: () => void;
  /** Editing a weight or qty changes every ancestor's total — tells the root to recompute. */
  onWeightChanged: () => void;
  /** Bumped after a recompute or code run; nodes re-read themselves and their loaded children. */
  treeVersion: number;
  /** Shared head of every code in this order, stripped from the row display. */
  codePrefix: string | null;
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

  // Dimensions and weight are plain columns on fab_items now. They used to live
  // in fab_custom_fields under level='item', which the Item Catalog also uses
  // with a catalog-item id — two different ID spaces in one key. Reading them
  // from the row removes that collision and the extra round-trip with it.
  const [showDims, setShowDims] = useState(false);
  const [dims, setDims] = useState({
    length:     item.length     != null ? String(item.length)     : '',
    width:      item.width      != null ? String(item.width)      : '',
    height:     item.height     != null ? String(item.height)     : '',
    unitWeight: item.unitWeight != null ? String(item.unitWeight) : '',
  });
  const [savingDims, setSavingDims] = useState(false);
  // Last values known to be persisted, so a blur with nothing changed does not
  // fire a write. Mirrors savedRef's job for the inline row fields.
  const savedDimsRef = useRef<Record<'length' | 'width' | 'height' | 'unitWeight', number | null>>({
    length:     item.length     ?? null,
    width:      item.width      ?? null,
    height:     item.height     ?? null,
    unitWeight: item.unitWeight ?? null,
  });
  // Server-owned figures. Kept in state (not read straight off `item`) so a
  // recompute can refresh them in place without remounting the tree.
  const [computedWeight, setComputedWeight] = useState<number | null>(item.computedUnitWeight ?? null);
  const [totalWeight, setTotalWeight] = useState<number | null>(item.totalWeight ?? null);
  const [enteredWeight, setEnteredWeight] = useState<number | null>(item.unitWeight ?? null);
  // Also server-owned: issued by itemCodeService, frozen once set, never edited here.
  const [code, setCode] = useState<string | null>(item.code ?? null);

  const atMaxDepth = depth >= MAX_ITEM_TREE_DEPTH;
  const weightUnit = item.weightUnit || 'kg';
  const dimUnit = item.dimUnit || 'mm';
  // A typed weight on an assembly is legitimate — welds, bolts and paint make it
  // heavier than the sum of its parts — so it wins, but the gap is surfaced
  // rather than hidden, because the same symptom also means "a child is missing".
  const weightOverridden = enteredWeight != null && computedWeight != null
    && Math.abs(enteredWeight - computedWeight) > 0.001;

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

  /**
   * Re-read this row's server-owned fields (weights, code) after a recompute or
   * code run elsewhere in the tree, and refresh any children already on screen.
   * Without this, editing a plate's weight would leave every assembly above it
   * showing a stale total until the page was reloaded.
   */
  const refreshServerFields = useCallback(async () => {
    try {
      const res = await fabQuery<{ data: FabItemRow[] }>('fabErpItem', {
        filters: { id: item.id },
        pagination: { limit: 1 },
      });
      const row = res.data?.[0];
      if (row) {
        setComputedWeight(row.computedUnitWeight ?? null);
        setTotalWeight(row.totalWeight ?? null);
        setEnteredWeight(row.unitWeight ?? null);
        setCode(row.code ?? null);
      }
    } catch { /* a stale total is not worth an error banner */ }
  }, [item.id]);

  useEffect(() => {
    if (treeVersion === 0) return;
    refreshServerFields();
    if (childrenLoaded) loadChildren();
    // loadChildren is stable enough for this purpose and adding it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeVersion, refreshServerFields]);

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

    const qtyChanged = parsedQty !== savedRef.current.qty;

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
        // Dimensions/weight are deliberately absent — the generic update is a
        // partial SET, so untouched columns stay as they are and saveDims owns
        // them exclusively.
      });
      savedRef.current = { name: nextName, qty: parsedQty, unit: nextUnit };
      // Quantity is a multiplier in every ancestor's roll-up, so changing it
      // moves totals all the way to the top of the order.
      if (qtyChanged) onWeightChanged();
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

  /**
   * One write for the whole dimensions/weight panel. A blank box clears the
   * column rather than storing 0 — "nobody measured this" and "this weighs
   * nothing" are different claims, and only NULL keeps a half-filled tree
   * reporting an honest "unknown" total instead of a confidently wrong one.
   */
  async function saveDims(key: 'length' | 'width' | 'height' | 'unitWeight') {
    const raw = dims[key].trim();
    const parsed = raw === '' ? null : Number(raw);
    if (parsed !== null && !Number.isFinite(parsed)) {
      setRowError(`${key === 'unitWeight' ? 'Weight' : key} must be a number.`);
      return;
    }
    const current = savedDimsRef.current[key];
    if (parsed === null && current === null) return;
    if (parsed !== null && current !== null && Math.abs(parsed - current) < 1e-6) return;

    setSavingDims(true); setRowError('');
    try {
      const column = key === 'unitWeight' ? 'unit_weight' : key;
      await fabMutate('fabErpItem', 'update', { id: item.id, [column]: parsed });
      savedDimsRef.current[key] = parsed;
      if (key === 'unitWeight') {
        setEnteredWeight(parsed);
        onWeightChanged(); // every ancestor's total just moved
      }
    } catch (e) {
      setRowError(errMsg(e, 'Failed to save'));
    } finally {
      setSavingDims(false);
    }
  }

  function handleChildDeleted(id: number) {
    setChildren((prev) => prev.filter((r) => r.id !== id));
    // A deleted branch stops contributing its weight upward.
    onWeightChanged();
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

        {/* The customer + order-number head is identical on every row, so only
            the chain that identifies THIS piece is shown. Full code on hover. */}
        {code && (
          <Tooltip title={`${code} — click to copy`}>
            <Typography
              variant="caption" fontFamily="monospace"
              onClick={() => navigator.clipboard?.writeText(code)}
              sx={{
                flexShrink: 0, maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', cursor: 'copy', color: 'var(--c-text-3)',
              }}
            >
              {codePrefix && code.startsWith(`${codePrefix}-`) ? code.slice(codePrefix.length + 1) : code}
            </Typography>
          </Tooltip>
        )}

        {item.catalogItemCode && (
          <Typography variant="caption" color="text.disabled" fontFamily="monospace" sx={{ flexShrink: 0 }}>
            {item.catalogItemCode}
          </Typography>
        )}

        {/* Weight is the number people scan this tree for, so it reads in the
            row rather than only inside the panel. An em dash means "not known
            yet" — it is never shown as 0. */}
        <Tooltip
          title={totalWeight == null
            ? 'No weight yet — enter it on the rows at the bottom of the tree'
            : enteredWeight != null
              ? `${fmtWeight(enteredWeight)} ${weightUnit} each (typed) x ${qty || 0}`
              : `${fmtWeight(computedWeight)} ${weightUnit} each (added up from parts) x ${qty || 0}`}
        >
          <Typography
            variant="caption"
            fontFamily="monospace"
            sx={{
              flexShrink: 0, minWidth: 74, textAlign: 'right',
              color: totalWeight == null ? 'var(--c-text-3)' : 'var(--c-text-2)',
              fontStyle: enteredWeight == null && totalWeight != null ? 'italic' : 'normal',
            }}
          >
            {totalWeight == null ? '—' : `${fmtWeight(totalWeight)} ${weightUnit}`}
          </Typography>
        </Tooltip>

        {weightOverridden && (
          <Tooltip title={`Typed ${fmtWeight(enteredWeight)} ${weightUnit}, parts add up to ${fmtWeight(computedWeight)} ${weightUnit}. The typed figure is used.`}>
            <Typography variant="caption" sx={{ flexShrink: 0, color: 'var(--c-warning-700, #9a6700)', fontWeight: 600 }}>!</Typography>
          </Tooltip>
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
            <Tooltip title="Dimensions and weight">
              <IconButton size="small" onClick={() => setShowDims((s) => !s)} sx={{ p: 0.25 }}>
                <StraightenRounded fontSize="small" />
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

      {showDims && (
        <Box sx={{ ml: `${6 + depth * 24 + 24}px`, mr: 1.5, mb: 1 }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            {(['length', 'width', 'height'] as const).map((k) => (
              <TextField
                key={k}
                label={`${k[0].toUpperCase()}${k.slice(1)} (${dimUnit})`}
                type="number" size="small" variant="standard" sx={{ width: 104 }}
                value={dims[k]}
                disabled={!canManage || savingDims}
                onChange={(e) => setDims((d) => ({ ...d, [k]: e.target.value }))}
                onBlur={() => saveDims(k)}
              />
            ))}
            <TextField
              label={`Weight each (${weightUnit})`}
              type="number" size="small" variant="standard" sx={{ width: 128 }}
              value={dims.unitWeight}
              disabled={!canManage || savingDims}
              onChange={(e) => setDims((d) => ({ ...d, unitWeight: e.target.value }))}
              onBlur={() => saveDims('unitWeight')}
              placeholder={computedWeight != null ? fmtWeight(computedWeight) ?? '' : ''}
            />
            {savingDims && <CircularProgress size={12} />}
          </Box>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'var(--c-text-3)' }}>
            {computedWeight != null
              ? weightOverridden
                ? `Parts add up to ${fmtWeight(computedWeight)} ${weightUnit} — your typed figure is used instead.`
                : `Added up from the parts below. Type a figure only if you know the real weight.`
              : 'Fill in dimensions and weight on the rows at the bottom of the tree — everything above adds up on its own.'}
          </Typography>
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
                  onItemAdded={onItemAdded}
                  onWeightChanged={onWeightChanged}
                  treeVersion={treeVersion}
                  codePrefix={codePrefix}
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
                    onCreated={(row) => {
                      setChildren((prev) => [...prev, row]);
                      setAddingChild(false);
                      // onItemAdded re-rolls the weights and issues the new
                      // row's code — no separate onWeightChanged needed here.
                      onItemAdded();
                    }}
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
  /** The order's stage readiness — supplies the Build tasks warning its counts. */
  readiness?: OrderReadiness | null;
  /**
   * Tell the order page a stage moved, so the strip above follows along.
   * Pass the readiness an endpoint already returned to save a round-trip.
   */
  onStageChanged?: (next?: OrderReadiness | null) => void;
}

export default function OrderItemsTree({ orderId, canManage, readiness, onStageChanged }: OrderItemsTreeProps) {
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
  // Replace wipes the order's tree, so it is a deliberate choice made before the
  // file picker opens rather than a switch sitting next to a one-click Import.
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  /** Structure types on this order's lines — shown as a hint in the wizard. */
  const [lines, setLines] = useState<WizardLine[]>([]);

  const [summary, setSummary] = useState<ItemsSummary | null>(null);
  // Incremented after every recompute or code run; every node watches it and
  // re-reads its server-owned fields, so editing a plate at the bottom updates
  // the girder at the top without remounting the tree.
  const [treeVersion, setTreeVersion] = useState(0);
  const [coding, setCoding] = useState(false);

  // An item tree on its own produces no work: until tasks are materialized the
  // order has no schedule, no critical chain, and is invisible to Dispatch and
  // the Task Queue. That button used to live only on the Task DAG tab, so a
  // planner could import 400 rows here, walk away, and never learn the order
  // was inert. `taskCount === null` means the count could not be read — that is
  // not the same as zero, so it must never trigger the prompt on its own.
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [itemsChanged, setItemsChanged] = useState(false);
  const [ctaDismissed, setCtaDismissed] = useState(false);
  const [materializing, setMaterializing] = useState(false);
  const [materializeResult, setMaterializeResult] = useState<MaterializeResponse | null>(null);

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
      // Cheap "are there tasks yet?" probe — a true COUNT over the same secured
      // WHERE, never rows.length, and one row fetched only because the query API
      // always returns a page. Failure resolves to null (unknown), not 0, so a
      // hiccup here can never invent a "no tasks" warning.
      fabQuery<{ total?: number | null }>('fabErpProjectTask', {
        fields: ['id'],
        filters: { orderId },
        pagination: { limit: 1 },
        includeTotal: true,
      }).then((r) => r.total ?? null).catch(() => null),
    ]).then(([rows, flowRows, tasks]) => {
      if (cancelled) return;
      setTopItems(rows);
      setHasMore(rows.length === TOP_LEVEL_PAGE_SIZE);
      setFlows(flowRows);
      setTaskCount(tasks);
    }).catch((e) => { if (!cancelled) setError(errMsg(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadTop, orderId]);

  const apiBase = useCallback(
    () => `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp/orders/${orderId}/items`,
    [orderId],
  );
  /** The BOQ sheet lives on its own routes — one sheet, four level columns. */
  const boqBase = useCallback(
    () => `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp/orders/${orderId}/boq`,
    [orderId],
  );

  const loadSummary = useCallback(async () => {
    try {
      const res = await api.get<ItemsSummary>(`${apiBase()}/weight-summary`);
      setSummary(res.data);
    } catch { /* the strip is informational — never block the tree on it */ }
  }, [apiBase]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  // The wizard needs the lines themselves, not just their distinct types: the
  // chosen line supplies the span code, and its type supplies the default parts.
  useEffect(() => {
    fabQuery<{ data: WizardLine[] }>('fabErpOrderLine', {
      filters: { orderId },
      orderBy: [{ field: 'lineNo', direction: 'asc' }],
      pagination: { limit: 200 },
    })
      .then((r) => setLines(r.data ?? []))
      .catch(() => setLines([]));
  }, [orderId]);

  /**
   * A weight or quantity changed somewhere in the tree. Roll-up is a whole-order
   * calculation — a plate at the bottom moves every assembly above it — so the
   * server recomputes the order and every mounted node re-reads itself.
   */
  const handleWeightChanged = useCallback(async () => {
    try {
      await api.post(`${apiBase()}/recompute-weights`, {});
      setTreeVersion((v) => v + 1);
      await loadSummary();
    } catch { /* leave the last good totals on screen rather than blanking them */ }
  }, [apiBase, loadSummary]);

  /**
   * Issue codes for rows that do not have one. Never touches an existing code —
   * by the time one exists it is on a drawing, so it has to stay put even if the
   * item is later renamed or moved.
   */
  async function generateCodes() {
    setCoding(true); setError('');
    try {
      const res = await api.post<{ coded: number; alreadyCoded: number; skipped: number }>(
        `${apiBase()}/generate-codes`, {},
      );
      setTreeVersion((v) => v + 1);
      await loadSummary();
      toast(res.data.coded > 0
        ? `${res.data.coded} code(s) issued${res.data.alreadyCoded ? ` — ${res.data.alreadyCoded} already had one` : ''}.`
        : 'Every item already has a code.',
      res.data.coded > 0 ? 'success' : 'info');
    } catch (e) {
      setError(backendMessage(e, 'Failed to generate codes.'));
    } finally {
      setCoding(false);
    }
  }

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
    handleWeightChanged();
  }

  // New rows always arrive with flow_id NULL and no tasks behind them, so any
  // add re-opens the prompt — including one the user dismissed earlier, and
  // including an order that already had tasks (the new rows still have none).
  // The previous run's outcome is cleared because it no longer describes the tree.
  function markItemsChanged(next?: OrderReadiness | null) {
    setItemsChanged(true);
    setCtaDismissed(false);
    setMaterializeResult(null);
    // Every tree change can move a stage — a new part is a part with no
    // material and no flow, and the strip has to say so immediately. Endpoints
    // that already computed readiness hand it over rather than making the page
    // ask for it again.
    onStageChanged?.(next);
  }

  /**
   * A row was added. Both derived things — the roll-up and the new row's code —
   * are whole-order calculations, so they run together and every mounted node
   * re-reads itself afterwards. Code generation only ever fills blanks, so
   * calling it on each add cannot disturb rows that already have one.
   */
  async function handleItemAdded() {
    markItemsChanged();
    try {
      await api.post(`${apiBase()}/recompute-weights`, {});
      await api.post(`${apiBase()}/generate-codes`, {});
      setTreeVersion((v) => v + 1);
      await loadSummary();
    } catch { /* the row is saved; derived values catch up on the next action */ }
  }

  // Same endpoint the Task DAG tab's "Materialize tasks" button calls — the
  // point of the prompt is that acting on it must not require finding another tab.
  async function buildTasks() {
    setMaterializing(true); setError('');
    try {
      const res = await fabPost<MaterializeResponse>('tasks/materialize', { orderId });
      setMaterializeResult(res);
      setItemsChanged(false);
      setTaskCount(res.tasksInserted);
      onStageChanged?.();
      toast(
        res.itemsSkipped > 0
          ? `${res.tasksInserted} task(s) built — ${res.itemsSkipped} item(s) skipped, see the notice above.`
          : `${res.tasksInserted} task(s) built from ${res.itemsProcessed} item(s).`,
        res.itemsSkipped > 0 ? 'info' : 'success',
      );
    } catch (e) {
      setError(backendMessage(e, 'Failed to build tasks for this order.'));
    } finally {
      setMaterializing(false);
    }
  }

  async function downloadItemsTemplate() {
    setExporting(true);
    try {
      const res = await api.get(`${boqBase()}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Order_BOQ.xlsx'; a.click();
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
      const form = new FormData();
      form.append('excel_file', file);
      form.append('mode', importMode);
      const res = await api.post<ImportItemsResult>(
        `${boqBase()}/import`, form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setImportResult(res.data);
      // Re-fetch top-level items — an import can add new top-level branches
      // alongside whatever was already there, and a replace clears the lot.
      const rows = await loadTop();
      setTopItems(rows);
      setHasMore(rows.length === TOP_LEVEL_PAGE_SIZE);
      // A replace that removed rows and created none still moved the stages, so
      // the strip is told either way — markItemsChanged already does it, and
      // this covers the branch where it does not run.
      if (res.data.itemsCreated > 0) markItemsChanged(res.data.readiness);
      else onStageChanged?.(res.data.readiness);
      // The importer already rolled up weights and issued codes inside its
      // transaction, so this only needs to re-read them — not re-run them.
      setTreeVersion((v) => v + 1);
      await loadSummary();
      toast(`${res.data.itemsCreated} item(s) imported`);
    } catch (e) {
      setImportErr(errMsg(e, 'Import failed'));
    } finally {
      setImporting(false);
      setImportMode('append'); // never let a replace carry over to the next upload
    }
  }

  if (loading) {
    return (
      <Surface e={1} sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Surface>
    );
  }

  // Only prompt when there is genuinely something to build: rows exist, and
  // either the order has no tasks at all or rows were added since the last run.
  // An order whose tasks are already current shows nothing.
  const showBuildPrompt = canManage
    && topItems.length > 0
    && !ctaDismissed
    && !materializeResult
    && (taskCount === 0 || itemsChanged);

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Tonnage is what a fabricator quotes, invoices and plans lifts around,
          so the order's total sits above the tree rather than being something
          you assemble by expanding branches. */}
      {summary && summary.itemCount > 0 && (
        <Surface e={1} sx={{ px: 2, py: 1.25, mb: 1.5, display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
          <Box>
            <Typography sx={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>
              Total weight
            </Typography>
            <Typography sx={{ fontSize: 18, fontFamily: 'monospace', color: 'var(--c-text)' }}>
              {summary.totalWeight == null ? '—' : `${fmtWeight(summary.totalWeight)} kg`}
            </Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>
              Items
            </Typography>
            <Typography sx={{ fontSize: 18, fontFamily: 'monospace', color: 'var(--c-text)' }}>{summary.itemCount}</Typography>
          </Box>
          {summary.codePrefix && (
            <Box>
              <Typography sx={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>
                Code prefix
              </Typography>
              <Tooltip title="Every item code on this order starts with this. The tree shows only what comes after it.">
                <Typography sx={{ fontSize: 14, fontFamily: 'monospace', color: 'var(--c-text-2)' }}>
                  {summary.codePrefix}-…
                </Typography>
              </Tooltip>
            </Box>
          )}
          {summary.unweighedLeaves > 0 && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', maxWidth: 420 }}>
              {summary.unweighedLeaves} bottom-level item(s) have no weight, so this total is incomplete.
              Open the ruler icon on those rows to fill it in.
            </Typography>
          )}
        </Surface>
      )}

      {canManage && (
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          <Button
            variant="outlined" size="small"
            startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon />}
            onClick={downloadItemsTemplate} disabled={exporting}
          >
            {topItems.length > 0 ? 'Export BOQ' : 'Download BOQ template'}
          </Button>
          <Tooltip title="Lay out span / girders / segments and the parts in each, and download a sheet to fill in. Nothing is saved until you upload it.">
            <Button variant="outlined" size="small" startIcon={<AutoFixHighRounded />} onClick={() => setWizardOpen(true)}>
              Structure wizard
            </Button>
          </Tooltip>
          <Button
            variant="outlined" size="small"
            startIcon={importing ? <CircularProgress size={14} color="inherit" /> : <UploadFileIcon />}
            onClick={() => { setImportMode('append'); setModeDialogOpen(true); }} disabled={importing}
          >
            Import from Excel
          </Button>
          {(summary?.uncodedItems ?? 0) > 0 && (
            <Tooltip title="Issues a code for each item that does not have one. Existing codes are never changed.">
              <Button
                variant="outlined" size="small"
                startIcon={coding ? <CircularProgress size={14} color="inherit" /> : <TagRounded />}
                onClick={generateCodes} disabled={coding}
              >
                Generate codes ({summary?.uncodedItems})
              </Button>
            </Tooltip>
          )}
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

      <Dialog open={modeDialogOpen} onClose={() => setModeDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Import items from Excel</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 2 }}>
            One <strong>BOQ</strong> sheet. The <strong>Span / Girder / Segment / Part</strong> columns
            hold codes and those codes <em>are</em> the structure — repeat the span and girder down the
            rows and the levels are built for you. Weight is not in the sheet: fill in Thick, Length,
            Width and the Raw Material, and it is worked out the way your BOQ works it out.
          </Typography>
          <RadioGroup value={importMode} onChange={(e) => setImportMode(e.target.value as 'append' | 'replace')}>
            <FormControlLabel
              value="append" control={<Radio size="small" />}
              label={(
                <Box sx={{ py: 0.5 }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>Add to what is already here</Typography>
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                    New rows join the existing tree. Parents may name items already on the order.
                  </Typography>
                </Box>
              )}
            />
            <FormControlLabel
              value="replace" control={<Radio size="small" />}
              label={(
                <Box sx={{ py: 0.5 }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>Replace the whole tree</Typography>
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                    Clears this order&rsquo;s {summary?.itemCount ?? 0} item(s) first. Refused if any task on
                    the order has already been started or finished.
                  </Typography>
                </Box>
              )}
            />
          </RadioGroup>
          {importMode === 'replace' && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              Tasks built from the current items are removed too. You will need to build tasks again after
              the import.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModeDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color={importMode === 'replace' ? 'warning' : 'primary'}
            onClick={() => { setModeDialogOpen(false); importFileRef.current?.click(); }}
          >
            Choose file…
          </Button>
        </DialogActions>
      </Dialog>

      <BoqWizardDialog
        open={wizardOpen}
        orderId={orderId}
        lines={lines}
        onClose={() => setWizardOpen(false)}
        onImported={() => { markItemsChanged(); loadSummary(); setTreeVersion((v) => v + 1); loadTop().then(setTopItems).catch(() => {}); }}
      />

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
          {importResult.mode === 'replace' && (importResult.itemsDeleted ?? 0) > 0
            ? `Replaced the tree: ${importResult.itemsDeleted} item(s) removed, ` : ''}
          {importResult.itemsCreated} row(s) created
          {(importResult.levelsCreated ?? 0) > 0 ? `, ${importResult.levelsCreated} level(s) built` : ''}
          {(importResult.rmLinks ?? 0) > 0 ? `, ${importResult.rmLinks} material link(s)` : ''}
          {importResult.itemsSkipped > 0 ? `, ${importResult.itemsSkipped} skipped` : ''}.
          {importResult.totalWeight != null ? ` Total weight ${fmtWeight(importResult.totalWeight)} kg.` : ''}
          {importResult.warnings.map((w) => ` ${w.message}`).join('')}
          {importResult.itemsSkipped > 0 ? ' Download the report for the reason on each skipped row.' : ''}
        </Alert>
      )}

      {showBuildPrompt && (
        <Alert
          severity="warning"
          icon={<BuildCircleRounded fontSize="inherit" />}
          sx={{ mb: 1.5 }}
          action={(
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Button
                size="small"
                variant="contained"
                disabled={materializing}
                onClick={buildTasks}
                startIcon={materializing
                  ? <CircularProgress size={12} color="inherit" />
                  : <BuildCircleRounded fontSize="small" />}
              >
                Build tasks
              </Button>
              <Tooltip title="Dismiss">
                <IconButton size="small" aria-label="Dismiss" onClick={() => setCtaDismissed(true)}>
                  <CloseRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        >
          <AlertTitle sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)' }}>
            {taskCount === 0 ? 'No tasks have been built for this order' : 'Items added — their tasks are not built yet'}
          </AlertTitle>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
            An item tree produces no work on its own. Until tasks are built, this order has no
            schedule, no critical chain, and never reaches Dispatch or the Task Queue.
          </Typography>

          {/* The old copy said items with no flow "are skipped" and left the
              reader to go and count them. These are the actual numbers, from the
              same readiness the strip above renders — and they are a warning,
              not a gate: building tasks for a half-nested order is a legitimate
              thing to do when you want the shop cutting while the rest of the
              BOQ is still being drawn. */}
          {(readiness?.blockers.length ?? 0) > 0 && (
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.25, display: 'flex', flexDirection: 'column', gap: 0.4 }}>
              {readiness!.blockers.map((b, i) => (
                <Typography key={i} component="li" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                  {b.message}
                </Typography>
              ))}
            </Box>
          )}
        </Alert>
      )}

      {materializeResult && (
        <MaterializeOutcome result={materializeResult} onClose={() => setMaterializeResult(null)} />
      )}

      {canManage && (
        <Box sx={{ mb: 2 }}>
          {addingRoot ? (
            <AddItemRow
              orderId={orderId}
              parentItemId={null}
              onCreated={(row) => {
                setTopItems((prev) => [...prev, row]);
                setAddingRoot(false);
                handleItemAdded();
                toast('Item added');
              }}
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
              onItemAdded={handleItemAdded}
              onWeightChanged={handleWeightChanged}
              treeVersion={treeVersion}
              codePrefix={summary?.codePrefix ?? null}
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
