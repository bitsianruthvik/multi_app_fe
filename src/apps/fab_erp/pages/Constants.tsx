import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, IconButton, TextField, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import CalculateRounded from '@mui/icons-material/CalculateRounded';

import { fabQuery, fabMutate } from '../api/client';
import type { FabConstant } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import {
  PageHeader, Mono, EmptyState, useToast, DataTable, FormDialog, ConfirmDialog,
  FilterBar, NumberCell, backendMessage, type DataColumn,
} from '../components';

/**
 * Formula constants — reference list (DESIGN_SYSTEM.md §4.2).
 * Migrated to the shared primitives (elevation plan Phase 2); see ItemMetrics.tsx
 * for the same pattern.
 */

interface Draft { constKey: string; constValue: number | ''; label: string }
const BLANK = (): Draft => ({ constKey: '', constValue: '', label: '' });

function ConstantDialog({ open, initial, onClose, onSaved }: {
  open: boolean; initial: FabConstant | null; onClose: () => void; onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(BLANK());
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    setDraft(initial
      ? { constKey: initial.constKey, constValue: initial.constValue, label: initial.label ?? '' }
      : BLANK());
  }, [open, initial]);

  const set = (k: keyof Draft, v: string | number | '') => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    const payload = {
      const_key: draft.constKey.trim(),
      const_value: draft.constValue === '' ? 0 : Number(draft.constValue),
      label: draft.label.trim() || null,
    };
    if (isNew) await fabMutate('fabErpConstant', 'insert', payload);
    else await fabMutate('fabErpConstant', 'update', { id: initial!.id, ...payload });
    onSaved();
  };

  return (
    <FormDialog
      open={open}
      title={isNew ? 'New constant' : `Edit ${initial?.constKey}`}
      onClose={onClose}
      onSubmit={save}
      submitDisabled={!draft.constKey.trim() || draft.constValue === ''}
    >
      <TextField label="Constant key" value={draft.constKey} onChange={(e) => set('constKey', e.target.value)} size="small" fullWidth required helperText="Snake-case identifier, e.g. steel_density_kg_m3" />
      <TextField label="Value" type="number" value={draft.constValue} onChange={(e) => set('constValue', e.target.value === '' ? '' : e.target.value)} size="small" fullWidth required slotProps={{ input: { inputProps: { step: 'any' } } }} helperText="Numeric value used in formula calculations" />
      <TextField label="Label" value={draft.label} onChange={(e) => set('label', e.target.value)} size="small" fullWidth helperText="Optional human-readable description" />
    </FormDialog>
  );
}

export default function Constants() {
  const canManage = usePermission('fab_erp_items_meta_manage');
  const { toast } = useToast();

  const [rows, setRows] = useState<FabConstant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editDialog, setEditDialog] = useState<{ open: boolean; item: FabConstant | null }>({ open: false, item: null });
  const [delItem, setDelItem] = useState<FabConstant | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fabQuery<{ data: FabConstant[] }>('fabErpConstant', {
        orderBy: [{ field: 'constKey', direction: 'asc' }], pagination: { limit: 500 },
      });
      setRows(res.data ?? []);
    } catch (e) {
      setError(backendMessage(e, 'Failed to load constants'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.constKey.toLowerCase().includes(q) || (r.label ?? '').toLowerCase().includes(q));
  }, [rows, search]);

  const columns: DataColumn<FabConstant>[] = [
    { key: 'constKey', header: 'Constant key', render: (r) => <Mono>{r.constKey}</Mono>, sortValue: (r) => r.constKey },
    { key: 'constValue', header: 'Value', numeric: true, render: (r) => <NumberCell value={r.constValue} />, sortValue: (r) => r.constValue },
    { key: 'label', header: 'Label', render: (r) => r.label ?? '—', sortValue: (r) => r.label ?? '' },
  ];

  const newBtn = canManage ? (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditDialog({ open: true, item: null })}>
      Add constant
    </Button>
  ) : null;

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader
        title="Constants"
        subtitle="Named numeric constants used in formula calculations — densities, conversion factors, rates."
        actions={newBtn}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <FilterBar search={search} onSearch={setSearch} placeholder="Search key or label…" />

      {!loading && filtered.length === 0 ? (
        <EmptyState
          icon={<CalculateRounded />}
          title={search ? 'No constants match your search' : 'No constants defined'}
          hint={search
            ? 'Try a different search.'
            : canManage
              ? 'Add a constant so formulas can reference it by name.'
              : 'Ask an administrator to define one.'}
          action={search ? undefined : newBtn ?? undefined}
        />
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          getRowId={(r) => r.id}
          loading={loading}
          storageKey="constants"
          exportName="constants"
          defaultSortKey="constKey"
          rowActions={canManage ? (row) => (
            <>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => setEditDialog({ open: true, item: row })} aria-label={`Edit ${row.constKey}`}>
                  <EditRounded fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="small" color="error" onClick={() => setDelItem(row)} aria-label={`Delete ${row.constKey}`}>
                  <DeleteOutlineRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          ) : undefined}
        />
      )}

      <ConstantDialog
        open={editDialog.open}
        initial={editDialog.item}
        onClose={() => setEditDialog({ open: false, item: null })}
        onSaved={() => { setEditDialog({ open: false, item: null }); toast('Constant saved'); fetchRows(); }}
      />
      <ConfirmDialog
        open={!!delItem}
        title="Delete constant"
        entityName={delItem?.constKey}
        body="Formulas referencing this constant will stop resolving. This cannot be undone."
        onClose={() => setDelItem(null)}
        onConfirm={async () => {
          await fabMutate('fabErpConstant', 'delete', { id: delItem!.id });
          setDelItem(null);
          toast('Constant deleted');
          fetchRows();
        }}
      />
    </Box>
  );
}
