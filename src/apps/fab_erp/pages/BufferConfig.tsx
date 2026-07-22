/**
 * BufferConfig.tsx — EU-9: pick a machine, then configure its input and
 * output buffer (stock location, capacity, warn/block thresholds, active).
 *
 * Gated on `fab_erp_buffer_config` (admin bypass on the backend, mirrored
 * here as a page-level gate — precedent: GrnDetail.tsx's `canView` check).
 *
 * Machine picker mirrors TaskQueue.tsx: query `fabErpResource` (table
 * fab_resources) for id/name/code/plantName/resourceTypeName/stockLocationId.
 * Stock locations for the dropdown come from `fabErpStockLocation`.
 *
 * On machine select, GET /buffers/config?resourceId= returns 0-2 rows (one
 * per kind, inactive included). Each kind gets its own draft, seeded from the
 * existing row when present, else defaulted (stockLocationId = the machine's
 * own, capacityUom 'kg', warn/block 80/100, active true) — saving a
 * never-before-configured kind is an insert (POST /buffers/config upserts).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, FormControlLabel, MenuItem,
  Slider, Switch, TextField, Typography,
} from '@mui/material';
import SaveRounded from '@mui/icons-material/SaveRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import WarehouseRounded from '@mui/icons-material/WarehouseRounded';

import { usePermission } from '@core/hooks/usePermission';
import {
  fabQuery, getBufferConfig, saveBufferConfig, deleteBufferConfig,
  type BufferConfigRow, type BufferKind,
} from '../api/client';
import { PageHeader, Surface, EmptyState, useToast } from '../components';

interface QueryResult<T> { data: T[] }

interface ResourceOption {
  id: number;
  name: string;
  code: string | null;
  plantName: string | null;
  resourceTypeName: string | null;
  stockLocationId: number | null;
}

interface StockLocationOption {
  id: number;
  name: string;
  code: string | null;
}

interface Draft {
  id: number | null;
  stockLocationId: number | '';
  capacityValue: string;
  capacityUom: string;
  warnPct: number;
  blockPct: number;
  active: boolean;
}

const CAPACITY_UOMS = ['kg', 'pieces'];

function blankDraft(defaultStockLocationId: number | null): Draft {
  return {
    id: null,
    stockLocationId: defaultStockLocationId ?? '',
    capacityValue: '',
    capacityUom: 'kg',
    warnPct: 80,
    blockPct: 100,
    active: true,
  };
}

function draftFromRow(row: BufferConfigRow): Draft {
  return {
    id: row.id,
    stockLocationId: row.stockLocationId ?? '',
    capacityValue: String(row.capacityValue),
    capacityUom: row.capacityUom,
    warnPct: row.warnPct,
    blockPct: row.blockPct,
    active: row.active,
  };
}

function errMsg(e: unknown, fallback: string): string {
  const ax = e as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.message ?? fallback;
}

/** true when the draft is savable: positive capacity, 0 < warn <= block <= 100. */
function isValid(d: Draft): boolean {
  const cap = Number(d.capacityValue);
  return (
    d.stockLocationId !== '' &&
    Number.isFinite(cap) && cap > 0 &&
    d.warnPct > 0 && d.blockPct <= 100 && d.warnPct <= d.blockPct
  );
}

// ── One kind's editable panel (input or output) ─────────────────────────────

function BufferKindPanel({
  kind, label, draft, stockLocations, saving, onChange, onSave, onDelete,
}: {
  kind: BufferKind;
  label: string;
  draft: Draft;
  stockLocations: StockLocationOption[];
  saving: boolean;
  onChange: (next: Draft) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value });

  return (
    <Surface e={1} sx={{ p: 2.5, flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>{label}</Typography>
        <FormControlLabel
          labelPlacement="start"
          control={<Switch size="small" checked={draft.active} onChange={(e) => set('active', e.target.checked)} />}
          label={<Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Active</Typography>}
          sx={{ ml: 0 }}
        />
      </Box>

      {draft.id == null && (
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
          No {kind} buffer configured yet for this machine — saving creates one.
        </Typography>
      )}

      <TextField
        select
        size="small"
        label="Stock location"
        value={draft.stockLocationId}
        onChange={(e) => set('stockLocationId', e.target.value === '' ? '' : Number(e.target.value))}
      >
        {stockLocations.map((sl) => (
          <MenuItem key={sl.id} value={sl.id}>{sl.code ? `${sl.code} — ${sl.name}` : sl.name}</MenuItem>
        ))}
      </TextField>

      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <TextField
          size="small"
          type="number"
          label="Capacity"
          value={draft.capacityValue}
          onChange={(e) => set('capacityValue', e.target.value)}
          sx={{ flex: 1 }}
          slotProps={{ htmlInput: { min: 0, step: 'any' } }}
        />
        <TextField
          select
          size="small"
          label="Unit"
          value={draft.capacityUom}
          onChange={(e) => set('capacityUom', e.target.value)}
          sx={{ width: 120 }}
        >
          {CAPACITY_UOMS.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
        </TextField>
      </Box>

      <Box>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 0.5 }}>
          Warn at {draft.warnPct}%
        </Typography>
        <Slider
          size="small"
          value={draft.warnPct}
          min={1}
          max={100}
          onChange={(_e, v) => set('warnPct', Array.isArray(v) ? v[0] : v)}
          sx={{ color: 'var(--c-warning-800)' }}
        />
      </Box>

      <Box>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 0.5 }}>
          Block at {draft.blockPct}%
        </Typography>
        <Slider
          size="small"
          value={draft.blockPct}
          min={1}
          max={100}
          onChange={(_e, v) => set('blockPct', Array.isArray(v) ? v[0] : v)}
          sx={{ color: 'var(--c-danger-800)' }}
        />
      </Box>

      {draft.warnPct > draft.blockPct && (
        <Alert severity="error" sx={{ py: 0 }}>Warn % must be ≤ Block %.</Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1, mt: 'auto', pt: 0.5 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveRounded fontSize="small" />}
          disabled={saving || !isValid(draft)}
          onClick={onSave}
        >
          Save
        </Button>
        {draft.id != null && (
          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<DeleteOutlineRounded fontSize="small" />}
            disabled={saving}
            onClick={onDelete}
          >
            Delete
          </Button>
        )}
      </Box>
    </Surface>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BufferConfig() {
  const canManage = usePermission('fab_erp_buffer_config');
  const { toast } = useToast();

  const [machines, setMachines] = useState<ResourceOption[]>([]);
  const [machine, setMachine] = useState<ResourceOption | null>(null);
  const [loadingMachines, setLoadingMachines] = useState(true);

  const [stockLocations, setStockLocations] = useState<StockLocationOption[]>([]);

  const [loadingBuffers, setLoadingBuffers] = useState(false);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<BufferKind, Draft> | null>(null);
  const [savingKind, setSavingKind] = useState<BufferKind | null>(null);

  const fetchMachines = useCallback(async () => {
    setLoadingMachines(true);
    try {
      const res = await fabQuery<QueryResult<ResourceOption>>('fabErpResource', {
        fields: ['id', 'name', 'code', 'plantName', 'resourceTypeName', 'stockLocationId'],
        orderBy: [{ field: 'name', direction: 'asc' }],
        pagination: { limit: 5000 },
      });
      setMachines(res.data ?? []);
    } catch (e) {
      setError(errMsg(e, 'Failed to load machines.'));
    } finally {
      setLoadingMachines(false);
    }
  }, []);

  const fetchStockLocations = useCallback(async () => {
    try {
      const res = await fabQuery<QueryResult<StockLocationOption>>('fabErpStockLocation', {
        fields: ['id', 'name', 'code'],
        orderBy: [{ field: 'name', direction: 'asc' }],
        pagination: { limit: 5000 },
      });
      setStockLocations(res.data ?? []);
    } catch (e) {
      setError(errMsg(e, 'Failed to load stock locations.'));
    }
  }, []);

  useEffect(() => { fetchMachines(); fetchStockLocations(); }, [fetchMachines, fetchStockLocations]);

  const loadBuffers = useCallback(async (m: ResourceOption) => {
    setLoadingBuffers(true);
    setError('');
    try {
      const res = await getBufferConfig(m.id);
      const byKind = new Map(res.buffers.map((b) => [b.kind, b]));
      setDrafts({
        input: byKind.has('input') ? draftFromRow(byKind.get('input')!) : blankDraft(m.stockLocationId),
        output: byKind.has('output') ? draftFromRow(byKind.get('output')!) : blankDraft(m.stockLocationId),
      });
    } catch (e) {
      setError(errMsg(e, 'Failed to load buffer config.'));
      setDrafts(null);
    } finally {
      setLoadingBuffers(false);
    }
  }, []);

  useEffect(() => {
    if (machine) loadBuffers(machine);
    else setDrafts(null);
  }, [machine, loadBuffers]);

  const updateDraft = (kind: BufferKind, next: Draft) => {
    setDrafts((prev) => (prev ? { ...prev, [kind]: next } : prev));
  };

  const save = async (kind: BufferKind) => {
    if (!machine || !drafts) return;
    const draft = drafts[kind];
    setSavingKind(kind);
    try {
      await saveBufferConfig({
        resourceId: machine.id,
        kind,
        stockLocationId: draft.stockLocationId === '' ? undefined : draft.stockLocationId,
        capacityValue: Number(draft.capacityValue),
        capacityUom: draft.capacityUom,
        warnPct: draft.warnPct,
        blockPct: draft.blockPct,
        active: draft.active,
      });
      toast(`${kind === 'input' ? 'Input' : 'Output'} buffer saved.`, 'success');
      await loadBuffers(machine);
    } catch (e) {
      toast(errMsg(e, 'Failed to save buffer config.'), 'error');
    } finally {
      setSavingKind(null);
    }
  };

  const remove = async (kind: BufferKind) => {
    if (!machine || !drafts) return;
    const id = drafts[kind].id;
    if (id == null) return;
    setSavingKind(kind);
    try {
      await deleteBufferConfig(id);
      toast(`${kind === 'input' ? 'Input' : 'Output'} buffer deleted.`, 'success');
      await loadBuffers(machine);
    } catch (e) {
      toast(errMsg(e, 'Failed to delete buffer.'), 'error');
    } finally {
      setSavingKind(null);
    }
  };

  const machineOptions = useMemo(() => machines, [machines]);

  if (!canManage) {
    return <Alert severity="warning" sx={{ maxWidth: 960, mx: 'auto' }}>You don't have permission to view this page.</Alert>;
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader
        title="Buffer Config"
        subtitle="Set each machine's input/output buffer capacity and warn/block thresholds."
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Surface e={1} sx={{ p: 2.5, mb: 2.5 }}>
        <Autocomplete<ResourceOption, false, false, false>
          options={machineOptions}
          value={machine}
          loading={loadingMachines}
          getOptionLabel={(o) => (o.code ? `${o.code} — ${o.name}` : o.name)}
          isOptionEqualToValue={(o, v) => o.id === v.id}
          sx={{ minWidth: 340 }}
          onChange={(_e, newVal) => setMachine(newVal)}
          renderOption={(props, option) => (
            <Box component="li" {...props} key={option.id}>
              <Box>
                <Typography sx={{ fontSize: 14 }}>{option.code ? `${option.code} — ${option.name}` : option.name}</Typography>
                <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                  {[option.plantName, option.resourceTypeName].filter(Boolean).join(' · ') || '—'}
                </Typography>
              </Box>
            </Box>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Machine"
              size="small"
              placeholder="Select a machine…"
              slotProps={{
                input: {
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loadingMachines ? <CircularProgress size={16} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                },
              }}
            />
          )}
        />
      </Surface>

      {!machine && (
        <EmptyState
          icon={<WarehouseRounded />}
          title="No machine selected"
          hint="Pick a machine above to configure its input and output buffers."
        />
      )}

      {machine && loadingBuffers && (
        <Surface e={1} sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress size={24} /></Surface>
      )}

      {machine && !loadingBuffers && drafts && (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <BufferKindPanel
            kind="input"
            label="Input buffer"
            draft={drafts.input}
            stockLocations={stockLocations}
            saving={savingKind === 'input'}
            onChange={(next) => updateDraft('input', next)}
            onSave={() => save('input')}
            onDelete={() => remove('input')}
          />
          <BufferKindPanel
            kind="output"
            label="Output buffer"
            draft={drafts.output}
            stockLocations={stockLocations}
            saving={savingKind === 'output'}
            onChange={(next) => updateDraft('output', next)}
            onSave={() => save('output')}
            onDelete={() => remove('output')}
          />
        </Box>
      )}
    </Box>
  );
}
