import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, AlertTitle, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, List, ListItemButton,
  ListItemText, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BuildCircleRounded from '@mui/icons-material/BuildCircleRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';

import { fabQuery, fabMutate } from '../api/client';
import type { FilterValue } from '../api/client';
import { Surface, EmptyState, useToast } from '../components';
import { MaterializeOutcome, type MaterializeResponse } from './OrderTaskDag';
import DrawingsPanel from './DrawingsPanel';
import type { OrderReadiness } from '../api/readiness';
import StructureEditor from './StructureEditor';

/**
 * An order line, as the structure editor and the line picker need it.
 *
 * `templateItemId` is what the line was sold AS — the catalog item whose BOM is
 * this structure. It is why the editor no longer opens on a template picker:
 * the line answered that question when it was added.
 */
interface OrderLineRef {
  id: number;
  code?: string | null;
  description?: string | null;
  lineType?: string | null;
  templateItemId?: number | null;
  catalogItemId?: number | null;
}
import { procurementOf } from '../api/procurement';
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
  /** 'make' | 'buy'. Null on rows created before the column existed — read it
   *  through procurementOf(), which treats absent as 'make'. */
  procurementType?: string | null;
}

interface CatalogOption {
  id: number; name: string; code: string; unit: string | null;
  /** Whether the shop buys this or makes it — carried onto the row it creates. */
  procurementType?: string | null;
}
interface FlowOption { id: number; name: string; code?: string; active?: number }
interface ItemsSummary {
  totalWeight: number | null;
  itemCount: number;
  unweighedLeaves: number;
  uncodedItems: number;
  /** Shared `CUSTOMER-SONUMBER` head of every code in this order. */
  codePrefix: string | null;
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
        // Make or buy, decided the same way the server decides it on import:
        // the catalog answers for anything bound to it, and anything else is
        // made here. Set at insert because a row added by hand never passes
        // through an import sweep, and an unclassified row reads as 'make' —
        // which would quietly mislabel a bought-in part as something to build.
        procurement_type: match?.procurementType === 'buy' ? 'buy' : 'make',
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
        procurementType: match?.procurementType === 'buy' ? 'buy' : 'make',
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

function ItemNode({ item, depth, canManage, flows, onDeleted, onItemAdded, onTreeChanged, treeVersion, codePrefix }: {
  item: FabItemRow;
  depth: number;
  canManage: boolean;
  flows: FlowOption[];
  onDeleted: (id: number) => void;
  /** Bubbles a new child up to the root so it can re-offer "build tasks". */
  onItemAdded: () => void;
  /** Editing a weight or qty changes every ancestor's total — tells the root to recompute. */
  onTreeChanged: () => void;
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
  /** Parts this assembly needs but does not contain — see loadChildren. */
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

  const [showDrawings, setShowDrawings] = useState(false);
  // Server-owned figures. Kept in state (not read straight off `item`) so a
  // recompute can refresh them in place without remounting the tree.
  // Also server-owned: issued by itemCodeService, frozen once set, never edited here.
  const [code, setCode] = useState<string | null>(item.code ?? null);

  const atMaxDepth = depth >= MAX_ITEM_TREE_DEPTH;
  // A typed weight on an assembly is legitimate — welds, bolts and paint make it
  // heavier than the sum of its parts — so it wins, but the gap is surfaced
  // rather than hidden, because the same symptom also means "a child is missing".

  async function loadChildren(afterId?: number) {
    setLoadingChildren(afterId ? loadingChildren : true);
    if (afterId) setLoadingMoreChildren(true);
    setChildrenError('');
    try {
      /*
       * STRUCTURE ONLY, NOT MATERIAL.
       *
       * Accepting a nest hangs a row under every part naming the plate it was
       * cut from — `node_kind = 'material'`. Those are links, not structure, and
       * showing them here turned a clean BOM into a tree with a plate dangling
       * off every leaf. The nesting board is where a part meets its plate.
       */
      const filters: Record<string, FilterValue> = {
        parentItemId: item.id,
        'nodeKind.NEQ': 'material',
      };
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
      if (qtyChanged) onTreeChanged();
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


  function handleChildDeleted(id: number) {
    setChildren((prev) => prev.filter((r) => r.id !== id));
    // A deleted branch stops contributing its weight upward.
    onTreeChanged();
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

        {/* Make or buy, on EVERY row.
            An earlier pass drew only 'buy', on the reasoning that a fabrication
            BOM is nearly all made-here and badging all of it is noise. That is
            true of the ink and false of the question: reading no badge cannot
            distinguish "this one is made here" from "this row predates the
            column" or "I am looking at the wrong column", and the whole point
            of the field is that somebody can answer it per row without going
            and asking. 'buy' still carries the colour, so the exceptions stay
            scannable; 'make' recedes into the row without disappearing. */}
        <Tooltip title={
          procurementOf(item) === 'buy'
            ? (item.catalogItemCode
              ? `Bought in — ${item.catalogItemCode} is a 'buy' item in the catalog`
              : 'Bought in — set on this row rather than by its catalog item')
            : (item.catalogItemCode
              ? `Made here — ${item.catalogItemCode} is a 'make' item in the catalog`
              : 'Made here — nothing in the catalog says otherwise')
        }>
          <Box
            component="span"
            sx={{
              flexShrink: 0, fontSize: 10, fontWeight: 600, letterSpacing: '.05em',
              textTransform: 'uppercase', px: 0.75, py: 0.125, borderRadius: 0.75,
              ...(procurementOf(item) === 'buy'
                ? {
                  color: 'var(--c-warn-fg, #8a5a00)',
                  bgcolor: 'var(--c-warn-bg, rgba(255,176,32,.14))',
                  border: '1px solid var(--c-warn-border, rgba(255,176,32,.35))',
                }
                : {
                  color: 'var(--c-text-3)',
                  bgcolor: 'transparent',
                  border: '1px solid var(--c-border)',
                }),
            }}
          >
            {procurementOf(item)}
          </Box>
        </Tooltip>

        {/*,          The weight column has gone with the dimensions that fed it. It could,          only ever read "—" now, and a column of em dashes is not information.,        */}

        {savingRow && <CircularProgress size={12} />}

        <Box className="item-actions" sx={{ display: 'flex', gap: 0.25, flexShrink: 0, opacity: 0, transition: 'opacity 0.1s', ml: 'auto' }}>
          {canManage && !atMaxDepth && (
            <Tooltip title="Add child">
              <IconButton size="small" onClick={() => { if (!expanded) { setExpanded(true); if (!childrenLoaded) loadChildren(); } setAddingChild(true); }} sx={{ p: 0.25 }}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Drawings">
            <IconButton size="small" onClick={() => setShowDrawings((v) => !v)} sx={{ p: 0.25 }}>
              <DescriptionRounded fontSize="small" />
            </IconButton>
          </Tooltip>
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

      {showDrawings && (
        <Box sx={{ ml: `${6 + depth * 24 + 24}px`, mr: 1.5, mb: 1 }}>
          {/* Attached here, read at the machine. A drawing put on the girder is
              inherited by every part beneath it, which is why the general
              arrangement never has to be attached two hundred times. */}
          <DrawingsPanel itemId={item.id} canManage={canManage} dense />
        </Box>
      )}

      {/*,        DIMENSIONS AND WEIGHT ARE NOT ENTERED HERE ANY MORE.,,        Length, width, thickness and weight-each were typed onto the order row.,        They describe a piece of steel, and a BOM row is not a piece of steel —,        it is "six of this design". The size belongs to the blank the row draws,        from, which is a catalog item, and that is also where nesting can filter,        on it and where a weight can be worked out once for everybody.,,        Coming back on the catalog item, not on this row.,      */}

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
              {/*,                THE "NEEDS" BLOCK HAS GONE, with the consolidation that made it,                necessary. Parts were moved out from under their assemblies onto,                the order line, so a diaphragm listed no children and this block,                stood in for them. Parts are children again; when they become,                stock lots they will be an input on the task, not a row here.,              */}

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
                  onTreeChanged={onTreeChanged}
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
                      // row's code — no separate onTreeChanged needed here.
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

  const [lines, setLines] = useState<OrderLineRef[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  /**
   * The line whose structure is being edited.
   *
   * A structure belongs to ONE line — an order with three lines is three
   * structures, and the codes below each are prefixed by its own code. The old
   * dialog carried a line selector inside itself; this asks first, because with
   * a single line there is nothing to ask and the question should not appear.
   */
  const [editorLine, setEditorLine] = useState<OrderLineRef | null>(null);
  const [linePickerOpen, setLinePickerOpen] = useState(false);

  const openStructureEditor = useCallback(() => {
    if (lines.length === 1) { setEditorLine(lines[0]); setEditorOpen(true); return; }
    if (lines.length === 0) { setError('Add an order line first — the structure hangs off one.'); return; }
    setLinePickerOpen(true);
  }, [lines]);
  /** Structure types on this order's lines — shown as a hint in the editor. */

  const [summary, setSummary] = useState<ItemsSummary | null>(null);
  const [procCounts, setProcCounts] = useState<{ make: number; buy: number } | null>(null);
  // Incremented after every recompute or code run; every node watches it and
  // re-reads its server-owned fields, so editing a plate at the bottom updates
  // the girder at the top without remounting the tree.
  const [treeVersion, setTreeVersion] = useState(0);

  // An item tree on its own produces no work: until tasks are materialized the
  // order has no schedule, no critical chain, and is invisible to Dispatch and
  // the Task Queue. That button used to live only on the Task DAG tab, so a
  // planner could import 400 rows here, walk away, and never learn the order
  // was inert. `taskCount === null` means the count could not be read — that is
  // not the same as zero, so it must never trigger the prompt on its own.
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [itemsChanged, setItemsChanged] = useState(false);
  const [ctaDismissed, setCtaDismissed] = useState(false);
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

  const loadSummary = useCallback(async () => {
    try {
      const res = await api.get<ItemsSummary>(`${apiBase()}/weight-summary`);
      setSummary(res.data);
    } catch { /* the strip is informational — never block the tree on it */ }
  }, [apiBase]);

  /**
   * How much of this order is bought in, counted across the WHOLE tree.
   *
   * Counted by the server rather than from the rows on screen: the tree loads
   * children a page at a time and only where somebody has expanded, so
   * anything counted in the browser would be a count of what has been looked
   * at. Two `total`s off the query API cost less than a new endpoint.
   */
  const loadProcurementCounts = useCallback(async () => {
    try {
      const ask = (procurementType: string) => fabQuery<{ total?: number | null }>('fabErpItem', {
        // `total` is opt-in on this API and is a real COUNT over the same
        // secured WHERE — asking without the flag returns no total at all, and
        // reading data.length would report the page size instead.
        fields: ['id'],
        filters: { orderId, procurementType },
        pagination: { limit: 1 },
        includeTotal: true,
      }).then((r) => r.total ?? 0);
      const [make, buy] = await Promise.all([ask('make'), ask('buy')]);
      setProcCounts({ make, buy });
    } catch { /* informational, same as the strip it sits in */ }
  }, [orderId]);

  useEffect(() => { loadSummary(); loadProcurementCounts(); }, [loadSummary, loadProcurementCounts]);

  // The editor needs the lines themselves, not just their distinct types: the
  // chosen line supplies the span code, and its type supplies the default parts.
  useEffect(() => {
    fabQuery<{ data: OrderLineRef[] }>('fabErpOrderLine', {
      filters: { orderId },
      orderBy: [{ field: 'lineNo', direction: 'asc' }],
      pagination: { limit: 200 },
    })
      .then((r) => setLines(r.data ?? []))
      .catch(() => setLines([]));
  }, [orderId]);

  /**
   * A quantity changed, or a row went away. There is no weight to roll up any
   * more — the dimensions it was computed from are not entered here — but the
   * counts above the tree still move, so they are re-read.
   */
  const handleTreeChanged = useCallback(async () => {
    try {
      setTreeVersion((v) => v + 1);
      await Promise.all([loadSummary(), loadProcurementCounts()]);
    } catch { /* leave the last good totals on screen rather than blanking them */ }
  }, [loadSummary, loadProcurementCounts]);


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
    // Re-reads the split too — a removed branch takes its bought-in rows with it.
    handleTreeChanged();
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
   * A row was added.
   *
   * This used to recompute weights AND issue codes for the whole order. Both
   * are gone: there are no dimensions to roll up, and a code minted here would
   * be exactly the positional code the BOM step stopped writing — added one
   * hand-typed row at a time instead of all at once, which is worse, not
   * better. Only the counts above the tree need re-reading.
   */
  async function handleItemAdded() {
    markItemsChanged();
    try {
      setTreeVersion((v) => v + 1);
      await loadSummary(); await loadProcurementCounts();
    } catch { /* the row is saved; the counts catch up on the next action */ }
  }

  // Same endpoint the Task DAG tab's "Materialize tasks" button calls — the
  // point of the prompt is that acting on it must not require finding another tab.
  // buildTasks() REMOVED 2026-08-15. Raising the production order already builds
  // the tree in the same transaction (ensureProductionOrder → materializeOrderTasks),
  // so this created it before the order that owns it existed and before the
  // Parameters step had been done — freezing every estimate against values
  // nobody had entered. The prompt below stays and now points at that step.


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
  const blockersHere = (readiness?.blockers ?? []).filter((b) => b.stage !== 'nesting');

  const showBuildPrompt = canManage
    && topItems.length > 0
    && !ctaDismissed
    && !materializeResult
    && (taskCount === 0 || itemsChanged);

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/*
        WHAT THIS STEP COUNTS, and what it no longer does.

        Total weight used to sit here. It was rolled up from length, width and
        thickness typed onto each row — and those fields have gone, because a
        blank's size belongs to the blank, not to the row that happens to want
        one. Until dimensions come back on the catalog item, a weight here could
        only read "—", and a statistic that never has a value is worse than no
        statistic at all.
      */}
      {summary && summary.itemCount > 0 && (
        <Surface e={1} sx={{ px: 2, py: 1.25, mb: 1.5, display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
          <Box>
            <Typography sx={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>
              Items
            </Typography>
            <Typography sx={{ fontSize: 18, fontFamily: 'monospace', color: 'var(--c-text)' }}>{summary.itemCount}</Typography>
          </Box>
          {/* What this order has to be bought in for, against what it builds.
              The number the purchasing step will act on, so it reads here
              rather than only by scanning several hundred rows for badges. */}
          {procCounts && (procCounts.make > 0 || procCounts.buy > 0) && (
            <Box>
              <Typography sx={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>
                Make / Buy
              </Typography>
              <Tooltip title={`${procCounts.make} made here, ${procCounts.buy} bought in. A row is bought in when the catalog item it is bound to says so; everything else is made here.`}>
                <Typography sx={{ fontSize: 18, fontFamily: 'monospace', color: 'var(--c-text)' }}>
                  {procCounts.make}
                  <Box component="span" sx={{ color: 'var(--c-text-3)', px: 0.5 }}>/</Box>
                  <Box component="span" sx={{ color: procCounts.buy > 0 ? 'var(--c-warn-fg, #8a5a00)' : 'var(--c-text-3)' }}>
                    {procCounts.buy}
                  </Box>
                </Typography>
              </Tooltip>
            </Box>
          )}
        </Surface>
      )}

      {canManage && (
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          <Tooltip title="Open this line's BOM and edit it — change quantities, remove what this job does not have, copy a branch. Nothing is written until you press Create.">
            <Button variant="outlined" size="small" startIcon={<AccountTreeRounded />} onClick={openStructureEditor}>
              Edit structure
            </Button>
          </Tooltip>
          {/*
            THE EXCEL IS GONE FROM THIS STEP, and so is code generation.

            The BOQ sheet's four code columns WERE the structure — span, girder,
            segment, part — with tree position baked into every code. That is the
            model the BOM step stopped using: a row is a design, the quantity
            lives on the row, and codes are issued at production-order time. An
            importer that still writes positional codes and per-piece rows would
            undo all of that on the first upload.

            An Excel route back in wants to speak the new language — blanks,
            lots, quantities — so it is a rewrite, not a button to re-enable.
          */}
        </Box>
      )}


      {/*
        * Which line, when there is more than one. A structure belongs to a line
        * and takes its code, so this cannot be guessed.
        */}
      <Dialog open={linePickerOpen} onClose={() => setLinePickerOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Which line?</DialogTitle>
        <DialogContent>
          <List dense>
            {lines.map((l) => (
              <ListItemButton
                key={l.id}
                onClick={() => { setEditorLine(l); setLinePickerOpen(false); setEditorOpen(true); }}
              >
                <ListItemText
                  primary={l.description || l.code || `Line ${l.id}`}
                  secondary={l.code ? `code ${l.code}` : undefined}
                />
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinePickerOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      <StructureEditor
        open={editorOpen}
        orderId={orderId}
        orderLine={editorLine ? {
          id: editorLine.id,
          code: editorLine.code ?? null,
          // What this line is — so the editor opens on it rather than asking again.
          itemId: editorLine.templateItemId ?? editorLine.catalogItemId ?? null,
        } : null}
        onClose={() => { setEditorOpen(false); setEditorLine(null); }}
        onDone={() => { markItemsChanged(); loadSummary(); loadProcurementCounts(); setTreeVersion((v) => v + 1); loadTop().then(setTopItems).catch(() => {}); }}
      />

      {showBuildPrompt && (
        <Alert
          severity="warning"
          icon={<BuildCircleRounded fontSize="inherit" />}
          sx={{ mb: 1.5 }}
          action={(
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {/* The "Build tasks" button is gone — see buildTasks() above. The
                  prompt itself is still worth having: knowing the tree is not
                  built is useful, and the text now names the step that builds it. */}
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
            Finish <strong>Flows</strong> and <strong>Parameters</strong>, then raise the
            production order on the <strong>Production</strong> tab — that is what builds them,
            and it is also what freezes every estimate, so the values want to be right first.
          </Typography>

          {/* The old copy said items with no flow "are skipped" and left the
              reader to go and count them. These are the actual numbers, from the
              same readiness the strip above renders — and they are a warning,
              not a gate: building tasks for a half-nested order is a legitimate
              thing to do when you want the shop cutting while the rest of the
              BOQ is still being drawn. */}
          {/*
              NESTING BLOCKERS ARE NOT SHOWN HERE. "26 of 26 parts have no raw
              material" is a true sentence about the nesting step, and it was
              being read on the structure step, where raw material is not a
              question that has been asked yet. It still reads on Nesting.
          */}
          {blockersHere.length > 0 && (
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.25, display: 'flex', flexDirection: 'column', gap: 0.4 }}>
              {blockersHere.map((b, i) => (
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
              onTreeChanged={handleTreeChanged}
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
