import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, IconButton, MenuItem, TextField, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import AutoGraphRounded from '@mui/icons-material/AutoGraphRounded';

import { fabQuery, fabMutate } from '../api/client';
import type { FabItemMetricDef } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import {
  PageHeader, Mono, EmptyState, useToast, DataTable, FormDialog, ConfirmDialog,
  FilterBar, backendMessage, type DataColumn,
} from '../components';

/**
 * Item metric definitions — reference list (DESIGN_SYSTEM.md §4.2).
 *
 * Migrated to the shared primitives (elevation plan Phase 2): the hand-rolled
 * MUI table became a `DataTable` (sort, column control, density, CSV export,
 * pagination) and both dialogs became `FormDialog`/`ConfirmDialog`, which
 * surface the backend's message instead of the raw axios string.
 */

const DATA_TYPES = ['number', 'string', 'boolean'] as const;
type DataType = (typeof DATA_TYPES)[number];

interface Draft { metricKey: string; metricLabel: string; dataType: DataType; unit: string }
const BLANK = (): Draft => ({ metricKey: '', metricLabel: '', dataType: 'number', unit: '' });

function ItemMetricDialog({ open, initial, onClose, onSaved }: {
  open: boolean; initial: FabItemMetricDef | null; onClose: () => void; onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(BLANK());
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    setDraft(initial
      ? {
          metricKey: initial.metricKey,
          metricLabel: initial.metricLabel,
          dataType: (initial.dataType as DataType) ?? 'number',
          unit: initial.unit ?? '',
        }
      : BLANK());
  }, [open, initial]);

  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  // Throwing keeps the dialog open with the user's input and shows the real
  // backend message — FormDialog handles both.
  const save = async () => {
    const payload = {
      metric_key: draft.metricKey.trim(),
      metric_label: draft.metricLabel.trim(),
      data_type: draft.dataType,
      unit: draft.unit.trim() || null,
    };
    if (isNew) await fabMutate('fabErpItemMetricDef', 'insert', payload);
    else await fabMutate('fabErpItemMetricDef', 'update', { id: initial!.id, ...payload });
    onSaved();
  };

  return (
    <FormDialog
      open={open}
      title={isNew ? 'New item metric' : `Edit ${initial?.metricKey}`}
      onClose={onClose}
      onSubmit={save}
      submitDisabled={!draft.metricKey.trim() || !draft.metricLabel.trim()}
    >
      <TextField label="Metric key" value={draft.metricKey} onChange={(e) => set('metricKey', e.target.value)} size="small" fullWidth required helperText="Snake-case identifier, e.g. weld_length_mm" />
      <TextField label="Metric label" value={draft.metricLabel} onChange={(e) => set('metricLabel', e.target.value)} size="small" fullWidth required helperText="Human-readable name shown in the UI" />
      <TextField select label="Data type" value={draft.dataType} onChange={(e) => set('dataType', e.target.value)} size="small" fullWidth>
        {DATA_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
      </TextField>
      <TextField label="Unit" value={draft.unit} onChange={(e) => set('unit', e.target.value)} size="small" fullWidth helperText="Optional — e.g. mm, kg, m²" />
    </FormDialog>
  );
}

export default function ItemMetrics() {
  const canManage = usePermission('fab_erp_items_meta_manage');
  const { toast } = useToast();

  const [rows, setRows] = useState<FabItemMetricDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editDialog, setEditDialog] = useState<{ open: boolean; item: FabItemMetricDef | null }>({ open: false, item: null });
  const [delItem, setDelItem] = useState<FabItemMetricDef | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fabQuery<{ data: FabItemMetricDef[] }>('fabErpItemMetricDef', {
        orderBy: [{ field: 'metricKey', direction: 'asc' }], pagination: { limit: 500 },
      });
      setRows(res.data ?? []);
    } catch (e) {
      setError(backendMessage(e, 'Failed to load metric definitions'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.metricKey.toLowerCase().includes(q) || r.metricLabel.toLowerCase().includes(q));
  }, [rows, search]);

  const columns: DataColumn<FabItemMetricDef>[] = [
    { key: 'metricKey', header: 'Metric key', render: (r) => <Mono>{r.metricKey}</Mono>, sortValue: (r) => r.metricKey },
    { key: 'metricLabel', header: 'Label', render: (r) => r.metricLabel, sortValue: (r) => r.metricLabel },
    { key: 'dataType', header: 'Data type', render: (r) => r.dataType, sortValue: (r) => r.dataType },
    { key: 'unit', header: 'Unit', render: (r) => r.unit ?? '—', sortValue: (r) => r.unit ?? '' },
  ];

  const newBtn = canManage ? (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditDialog({ open: true, item: null })}>
      Add metric
    </Button>
  ) : null;

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader
        title="Item metrics"
        subtitle="Measurable metrics that can be captured on fabrication items, and read by formulas."
        actions={newBtn}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <FilterBar search={search} onSearch={setSearch} placeholder="Search key or label…" />

      {!loading && filtered.length === 0 ? (
        <EmptyState
          icon={<AutoGraphRounded />}
          title={search ? 'No metrics match your search' : 'No metric definitions yet'}
          hint={search
            ? 'Try a different search.'
            : canManage
              ? 'Define a metric so items can carry measurable values.'
              : 'Ask an administrator to define one.'}
          action={search ? undefined : newBtn ?? undefined}
        />
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          getRowId={(r) => r.id}
          loading={loading}
          storageKey="item-metrics"
          exportName="item-metrics"
          defaultSortKey="metricKey"
          rowActions={canManage ? (row) => (
            <>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => setEditDialog({ open: true, item: row })} aria-label={`Edit ${row.metricKey}`}>
                  <EditRounded fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="small" color="error" onClick={() => setDelItem(row)} aria-label={`Delete ${row.metricKey}`}>
                  <DeleteOutlineRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          ) : undefined}
        />
      )}

      <ItemMetricDialog
        open={editDialog.open}
        initial={editDialog.item}
        onClose={() => setEditDialog({ open: false, item: null })}
        onSaved={() => { setEditDialog({ open: false, item: null }); toast('Metric saved'); fetchRows(); }}
      />
      <ConfirmDialog
        open={!!delItem}
        title="Delete metric definition"
        entityName={delItem?.metricKey}
        onClose={() => setDelItem(null)}
        onConfirm={async () => {
          await fabMutate('fabErpItemMetricDef', 'delete', { id: delItem!.id });
          setDelItem(null);
          toast('Metric deleted');
          fetchRows();
        }}
      />
    </Box>
  );
}
