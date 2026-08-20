/**
 * OrderParameters.tsx — the values this order's operations actually need.
 *
 * THE STEP THAT DID NOT EXIST. The BOQ sheet asked for Thick / Length / Width on
 * every row, which was wrong in both directions: a plate has no meaningful
 * "height", and an assembly measured by weld length was never asked for one. Now
 * that flows are assigned BEFORE this step, the required set is derived rather
 * than guessed — the union of `item.*` variables across each flow's formulas.
 *
 * It is a GRID, not a form per part. A girder run is hundreds of near-identical
 * rows and the fastest way to fill them in is to see them together, which is why
 * the BOQ was a spreadsheet in the first place.
 *
 * THE GRID IS BUILT ON THE SERVER (2026-08-18). It used to be assembled here
 * from items, field definitions and values, which meant the screen could only
 * show the union of every field ANY flow on the order wanted, against EVERY
 * part — so a plate that is only ever cut had an editable weld-length cell.
 * A cell now exists only where that part's own flow asks for it; everywhere else
 * shows a dash, because "not asked" and "asked but empty" are different states
 * and an empty box cannot tell them apart.
 *
 * ONE ROW PER SIMILARITY GROUP. Where girders or segments are marked as copies
 * of each other, their thirty Top Flanges are one row that writes to all thirty.
 *
 * A blank cell is not zero. The formula engine defaults unknown symbols to 0 so
 * `IF()` fallbacks can work, so a part with no thickness does not error — it is
 * estimated as free to cut. Blank cells are flagged, and the production order
 * refuses to be raised while any remain (see the FIELDS_MISSING gate).
 *
 * ONE KEYSTROKE MUST COST ONE CELL (2026-08-20). The pending edits used to be a
 * single `edits` object in this component's state, so every character typed
 * re-rendered all 28×5 MUI TextFields — measured at ~210 ms per keystroke on a
 * SMALL order, and a realistic 210-part span (1050 cells) is simply unusable.
 * The edits now live in a tiny external store (below) that notifies per cell:
 * a keystroke re-renders exactly one <ParameterCell> and nothing above it, so
 * the cost is O(1) in the size of the grid rather than O(cells). The rows and
 * the unsaved-changes bar subscribe separately, which is why this component
 * itself does not re-render at all while you type. Deliberately NOT a debounce —
 * a debounce hides the lag on a keystroke but leaves the whole-grid re-render in
 * place, and does nothing for the bulk import path that sets every cell at once.
 */

import {
  memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore,
} from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, TextField, Tooltip, Typography,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import api from '@core/utils/axiosConfig';
import {
  getParameterGrid, saveParameters, exportParametersUrl, importParameters,
  type ParameterGrid, type ParameterColumn, type ParameterRow, type ParameterEdit,
} from '../api/parameters';
import { getFieldReadiness, type FieldReadiness } from '../api/fieldReadiness';
import {
  EmptyState, ListSkeleton, useToast, backendMessage, Mono, StickyActionBar,
} from '../components';

type CellKey = string; // `${itemId}:${fieldKey}`
const cellKey = (itemId: number, fieldKey: string): CellKey => `${itemId}:${fieldKey}`;

// ── the pending-edit store ──────────────────────────────────────────────────
/**
 * Deliberately outside React state. A `useState` object here means every cell
 * subscribes to every other cell's keystrokes; a Map plus per-key listeners
 * means a cell only hears about itself. Semantics are otherwise identical to
 * the object it replaces: a key exists from the first keystroke in that cell
 * until save or discard, whatever was typed, so the save payload and the
 * "n cell(s) changed" count are exactly what they were before.
 */
type Listener = () => void;

function createEditStore() {
  const values = new Map<CellKey, string>();
  const cellSubs = new Map<CellKey, Set<Listener>>();
  const countSubs = new Set<Listener>();

  // The dirty count is the one thing outside a cell that moves while editing,
  // and it moved 139 times during a 140-cell bulk set — measured at ~920 ms of
  // the 1.46 s that cost, because the action bar is two MUI Buttons. Coalescing
  // to one notification per microtask makes a bulk set pay for it once. Nothing
  // can be lost by the delay: `entries()` is the save payload and it is written
  // synchronously; only the displayed number lands a microtask later.
  let countQueued = false;
  const notifyCount = () => {
    if (countQueued) return;
    countQueued = true;
    queueMicrotask(() => { countQueued = false; countSubs.forEach((fn) => fn()); });
  };

  return {
    subscribeCell(key: CellKey, fn: Listener) {
      const subs = cellSubs.get(key) ?? new Set<Listener>();
      cellSubs.set(key, subs);
      subs.add(fn);
      return () => {
        subs.delete(fn);
        // `=== subs` so a late unsubscribe from a remounted cell cannot drop
        // the set that replaced it (StrictMode subscribes twice on mount).
        if (subs.size === 0 && cellSubs.get(key) === subs) cellSubs.delete(key);
      };
    },
    /** Stable identity — `useSyncExternalStore` resubscribes if this changes. */
    subscribeCount(fn: Listener) {
      countSubs.add(fn);
      return () => { countSubs.delete(fn); };
    },
    getCell(key: CellKey) { return values.get(key); },
    getCount() { return values.size; },
    /** Insertion-ordered, matching the old `Object.entries(edits)`. */
    entries() { return [...values.entries()]; },
    set(key: CellKey, raw: string) {
      const isNew = !values.has(key);
      values.set(key, raw);
      cellSubs.get(key)?.forEach((fn) => fn());
      // The count only moves the first time a cell is touched, so typing four
      // digits wakes the action bar once rather than four times.
      if (isNew) notifyCount();
    },
    clear() {
      if (values.size === 0) return;
      const touched = [...values.keys()];
      values.clear();
      touched.forEach((k) => cellSubs.get(k)?.forEach((fn) => fn()));
      notifyCount();
    },
  };
}

type EditStore = ReturnType<typeof createEditStore>;

// Hoisted so emotion sees the same object every time rather than a fresh one
// per render — and so a cell flipping between filled and blank swaps a
// reference instead of rebuilding a style object.
const SX_CELL: SxProps<Theme> = {
  width: 96,
  '& input': { fontSize: 13, py: 0.4 },
};
const SX_CELL_MISSING: SxProps<Theme> = {
  width: 96,
  '& input': { fontSize: 13, py: 0.4 },
  '& .MuiInput-root:before': { borderBottomColor: 'var(--c-warning-600)' },
};
const SX_TD_INPUT: SxProps<Theme> = { p: 0.5 };
const SX_TD_DASH: SxProps<Theme> = { p: 1, textAlign: 'center', color: 'var(--c-text-3)' };
const SX_TR: SxProps<Theme> = { borderTop: '1px solid var(--c-divider)' };
const SX_TD_NAME: SxProps<Theme> = { p: 1, position: 'sticky', left: 0, bgcolor: 'var(--c-surface)' };

// ── one cell ────────────────────────────────────────────────────────────────

const ParameterCell = memo(function ParameterCell({ store, ck, base, disabled }: {
  store: EditStore;
  ck: CellKey;
  /** The saved value behind this cell — shown until it is edited. */
  base: string;
  disabled: boolean;
}) {
  const subscribe = useCallback((fn: Listener) => store.subscribeCell(ck, fn), [store, ck]);
  const getSnapshot = useCallback(() => store.getCell(ck), [store, ck]);
  const edited = useSyncExternalStore(subscribe, getSnapshot);

  const v = edited ?? base;
  const missing = v.trim() === '';

  return (
    <TextField
      size="small" variant="standard" type="number"
      value={v}
      disabled={disabled}
      onChange={(e) => store.set(ck, e.target.value)}
      sx={missing ? SX_CELL_MISSING : SX_CELL}
    />
  );
});

// Not asked for by THIS part's flow. A dash, not an empty box: an empty box
// invites a value that no formula will ever read.
const DashCell = memo(function DashCell() {
  return (
    <Box component="td" sx={SX_TD_DASH}>
      <Tooltip title="This part's flow does not use this value">
        <span>—</span>
      </Tooltip>
    </Box>
  );
});

// ── one row ─────────────────────────────────────────────────────────────────

const ParameterGridRow = memo(function ParameterGridRow({ store, row, columns, disabled }: {
  store: EditStore;
  row: ParameterRow;
  columns: ParameterColumn[];
  disabled: boolean;
}) {
  // `required` is a short array but it was scanned once per cell per render;
  // a Set built once per row keeps the row's own render linear in its columns.
  const required = useMemo(() => new Set(row.required), [row.required]);

  return (
    <Box component="tr" sx={SX_TR}>
      <Box component="td" sx={SX_TD_NAME}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 13 }}>{row.name}</Typography>
            <Mono sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>{row.code}</Mono>
          </Box>
          {row.represents > 1 && (
            <Tooltip title={`Writes to all ${row.represents} copies`}>
              <Chip size="small" label={`×${row.represents}`} sx={{ height: 18, fontSize: 10.5 }} />
            </Tooltip>
          )}
        </Box>
      </Box>
      {columns.map((c) => (
        required.has(c.fieldKey) ? (
          <Box component="td" key={c.fieldKey} sx={SX_TD_INPUT}>
            {/* `base` is String()-ed because the server sends numeric fields as
                numbers despite the declared type — normalise once here rather
                than defending inside the cell on every keystroke. */}
            <ParameterCell
              store={store}
              ck={cellKey(row.itemId, c.fieldKey)}
              base={String(row.values[c.fieldKey] ?? '')}
              disabled={disabled}
            />
          </Box>
        ) : (
          <DashCell key={c.fieldKey} />
        )
      ))}
    </Box>
  );
});

// ── the unsaved-changes bar ─────────────────────────────────────────────────
/**
 * Reads the dirty count itself so the count landing does not re-render the
 * grid above it. This is the only thing that reacts to the first keystroke in
 * a cell, and it renders three elements.
 */
function DirtyBar({ store, saving, onDiscard, onSave }: {
  store: EditStore;
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const dirtyCount = useSyncExternalStore(store.subscribeCount, store.getCount);
  if (dirtyCount === 0) return null;
  return (
    <StickyActionBar>
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
        {dirtyCount} cell(s) changed
      </Typography>
      <Box sx={{ flex: 1 }} />
      <Button onClick={onDiscard} disabled={saving}>Discard</Button>
      <Button
        variant="contained" onClick={onSave} disabled={saving}
        startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
      >
        {saving ? 'Saving…' : 'Save values'}
      </Button>
    </StickyActionBar>
  );
}

// ── the step ────────────────────────────────────────────────────────────────

export default function OrderParameters({ orderId, canManage, onStageChanged }: {
  orderId: number;
  canManage: boolean;
  onStageChanged?: () => void;
}) {
  const { toast } = useToast();
  const [grid, setGrid] = useState<ParameterGrid | null>(null);
  const [readiness, setReadiness] = useState<FieldReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  // One store for the life of the component — its identity is a prop of every
  // memoised row, so it must never be rebuilt.
  const [store] = useState(createEditStore);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [g, r] = await Promise.all([
        getParameterGrid(orderId),
        getFieldReadiness(orderId).catch(() => null),
      ]);
      setGrid(g);
      setReadiness(r);
      store.clear();
    } catch (e) {
      setError(backendMessage(e, 'Could not load the order’s parameters.'));
    } finally { setLoading(false); }
  }, [orderId, store]);

  useEffect(() => { void load(); }, [load]);

  const discard = useCallback(() => { store.clear(); }, [store]);

  const save = useCallback(async () => {
    const list: ParameterEdit[] = store.entries().map(([k, v]) => {
      const [idStr, fieldKey] = k.split(':');
      return { itemId: Number(idStr), fieldKey, value: v.trim() === '' ? null : v.trim() };
    });
    if (!list.length) return;
    setSaving(true); setError('');
    try {
      const res = await saveParameters(orderId, list);
      // `written` counts the fan-out, so on a grouped order it is larger than
      // the number of cells touched — which is the point, and worth saying.
      toast(
        res.written > list.length
          ? `${list.length} value(s) → ${res.written} part(s) via similar groups`
          : `${res.written} value(s) saved`,
        'success',
      );
      await load();
      onStageChanged?.();
    } catch (e) {
      setError(backendMessage(e, 'Could not save the parameters.'));
    } finally { setSaving(false); }
  }, [orderId, store, toast, load, onStageChanged]);

  async function download() {
    try {
      const res = await api.get(exportParametersUrl(orderId), { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'parameters.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(backendMessage(e, 'Could not export the parameters.'));
    }
  }

  async function upload(file: File) {
    setImporting(true); setError('');
    try {
      const res = await importParameters(orderId, file);
      toast(`${res.edits} change(s) from ${res.rowsRead} row(s) → ${res.written} part(s)`, 'success');
      if (res.warnings?.length) {
        setError(`${res.warnings.length} row(s) skipped: ${res.warnings.slice(0, 3).map((w) => w.message).join(' ')}`);
      }
      await load();
      onStageChanged?.();
    } catch (e) {
      setError(backendMessage(e, 'Could not import that sheet.'));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (loading) return <ListSkeleton rows={6} />;

  if (!grid || grid.rows.length === 0) {
    return (
      <EmptyState
        title="No parts with a flow yet"
        hint="Assign flows first — they decide which values each part needs. Nothing here is guessed."
      />
    );
  }
  if (grid.columns.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircleRounded />}
        title="Nothing to fill in"
        hint="None of this order's operations read a value off the part, so there is nothing to capture here."
      />
    );
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {(readiness?.unknownFields?.length ?? 0) > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.25 }}>
            Some formulas name fields that do not exist
          </Typography>
          <Typography sx={{ fontSize: 12.5 }}>
            {readiness!.unknownFields.map((u) => `${u.operationName}: ${u.keys.join(', ')}`).join(' · ')}
            {' '}— these cannot be fixed by filling anything in here; the formula needs correcting.
          </Typography>
        </Alert>
      )}

      {/* The spreadsheet path, asked for because "many times it is easier to
          enter that way" — and because the values usually already exist in one. */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1.5, flexWrap: 'wrap' }}>
        <Button size="small" startIcon={<DownloadIcon />} onClick={download}>
          Export to Excel
        </Button>
        <Button
          size="small" startIcon={importing ? <CircularProgress size={13} /> : <UploadFileIcon />}
          disabled={!canManage || importing}
          onClick={() => fileRef.current?.click()}
        >
          {importing ? 'Importing…' : 'Import filled sheet'}
        </Button>
        <input
          ref={fileRef} type="file" hidden accept=".xlsx"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
        />
        {grid.groupedAway > 0 && (
          <Tooltip title="Girders or segments marked as copies of each other. Fill one row and every copy gets it.">
            <Chip
              size="small"
              label={`${grid.groupedAway} row(s) folded into similar groups`}
              sx={{ bgcolor: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}
            />
          </Tooltip>
        )}
      </Box>

      <Box sx={{ overflowX: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)' }}>
        <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <Box component="thead">
            <Box component="tr" sx={{ bgcolor: 'var(--c-surface-2)' }}>
              <Box component="th" sx={{ textAlign: 'left', p: 1, position: 'sticky', left: 0, bgcolor: 'var(--c-surface-2)', minWidth: 260 }}>
                Part
              </Box>
              {grid.columns.map((c) => (
                <Box component="th" key={c.fieldKey} sx={{ textAlign: 'left', p: 1, whiteSpace: 'nowrap' }}>
                  {c.label}{c.unit ? <Typography component="span" sx={{ fontSize: 11, color: 'var(--c-text-3)' }}> ({c.unit})</Typography> : null}
                </Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {grid.rows.map((r) => (
              <ParameterGridRow
                key={r.itemId}
                store={store}
                row={r}
                columns={grid.columns}
                disabled={!canManage}
              />
            ))}
          </Box>
        </Box>
      </Box>

      {canManage && (
        <DirtyBar store={store} saving={saving} onDiscard={discard} onSave={() => void save()} />
      )}
    </Box>
  );
}
