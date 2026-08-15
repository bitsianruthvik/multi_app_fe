import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, FormControlLabel, IconButton, MenuItem, TextField, Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import AutoGraphRounded from '@mui/icons-material/AutoGraphRounded';

import { fabQuery, fabMutate } from '../api/client';
import type { FabFieldDef } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import {
  PageHeader, Mono, EmptyState, useToast, DataTable, FormDialog, ConfirmDialog,
  FilterBar, backendMessage, type DataColumn,
} from '../components';

/**
 * Item fields — the ONE registry.
 *
 * This page was "Item metrics", which was the confusing layer: that table was
 * already the only thing in the system carrying BOTH a data type and a unit —
 * it was the field registry all along — but it sat beside `fab_custom_fields`
 * and the hardcoded `fab_items.length/width/height` columns, and formulas read
 * only its values. So the dimensions people actually typed never reached a
 * formula, and every `item.*` silently resolved to 0: "Cut Plate" fell from
 * 38.8 minutes to its constant 10 on every part regardless of size.
 *
 * One registry now. A field defined here IS a formula variable the moment it is
 * saved — `/formula/variables` reads this table, so the editor autocompletes and
 * lints against it, and `itemFieldService` resolves its value down the chain
 * (piece → order item → catalog item → sub-group → group → category → default).
 *
 * TWO FLAGS EARN THEIR PLACE
 *
 *   formula usable   a TEXT field can never be. The engine coerces with
 *                    Number(), so text yields NaN, the try/catch returns null,
 *                    and the task plans as a zero-length bar with no error.
 *   varies by piece  opt-in, off by default. A blanket piece-level override
 *                    would change a task's estimate the moment stock was
 *                    issued — right for "this coil came in at 6000 not 12000",
 *                    alarming for anything else.
 */

const DATA_TYPES = ['number', 'integer', 'text'] as const;
type DataType = (typeof DATA_TYPES)[number];

interface Draft {
  fieldKey: string; label: string; dataType: DataType; unit: string;
  formulaUsable: boolean; pieceVarying: boolean; defaultValue: string;
}
const BLANK = (): Draft => ({
  fieldKey: '', label: '', dataType: 'number', unit: '',
  formulaUsable: true, pieceVarying: false, defaultValue: '',
});

function FieldDialog({ open, initial, onClose, onSaved }: {
  open: boolean; initial: FabFieldDef | null; onClose: () => void; onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(BLANK());
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    setDraft(initial
      ? {
          fieldKey: initial.fieldKey,
          label: initial.label,
          dataType: (initial.dataType as DataType) ?? 'number',
          unit: initial.unit ?? '',
          formulaUsable: Number(initial.formulaUsable) === 1,
          pieceVarying: Number(initial.pieceVarying) === 1,
          defaultValue: initial.defaultValue != null ? String(initial.defaultValue) : '',
        }
      : BLANK());
  }, [open, initial]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const isText = draft.dataType === 'text';

  // Throwing keeps the dialog open with the user's input and shows the real
  // backend message — FormDialog handles both.
  const save = async () => {
    const payload = {
      field_key: draft.fieldKey.trim(),
      label: draft.label.trim(),
      data_type: draft.dataType,
      unit: draft.unit.trim() || null,
      // Enforced here as well as explained: a text field reaching a formula
      // nulls the whole duration silently.
      formula_usable: isText ? 0 : (draft.formulaUsable ? 1 : 0),
      piece_varying: draft.pieceVarying ? 1 : 0,
      default_value: draft.defaultValue !== '' && !isText ? Number(draft.defaultValue) : null,
    };
    if (isNew) await fabMutate('fabErpFieldDef', 'insert', payload);
    else await fabMutate('fabErpFieldDef', 'update', { id: initial!.id, ...payload });
    onSaved();
  };

  return (
    <FormDialog
      open={open}
      title={isNew ? 'New field' : `Edit ${initial?.fieldKey}`}
      onClose={onClose}
      onSubmit={save}
      submitDisabled={!draft.fieldKey.trim() || !draft.label.trim()}
    >
      <TextField
        label="Field key" value={draft.fieldKey} onChange={(e) => set('fieldKey', e.target.value)}
        size="small" fullWidth required
        helperText={draft.fieldKey.trim() && !isText
          ? `Used in formulas as item.${draft.fieldKey.trim()}`
          : 'Snake-case identifier, e.g. weld_length_m'}
      />
      <TextField label="Label" value={draft.label} onChange={(e) => set('label', e.target.value)} size="small" fullWidth required helperText="Human-readable name shown in the UI" />
      <Box sx={{ display: 'flex', gap: 2 }}>
        <TextField select label="Data type" value={draft.dataType} onChange={(e) => set('dataType', e.target.value as DataType)} size="small" sx={{ flex: 1 }}>
          {DATA_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
        </TextField>
        <TextField label="Unit" value={draft.unit} onChange={(e) => set('unit', e.target.value)} size="small" sx={{ flex: 1 }} disabled={isText} helperText="e.g. mm, kg, m²" />
      </Box>
      <TextField
        label="Default value" type="number" value={draft.defaultValue} disabled={isText}
        onChange={(e) => set('defaultValue', e.target.value)} size="small" fullWidth
        helperText="Used when nothing further down the chain has a value"
      />
      <Box>
        <FormControlLabel
          control={<Checkbox size="small" checked={!isText && draft.formulaUsable} disabled={isText} onChange={(e) => set('formulaUsable', e.target.checked)} />}
          label={<Typography sx={{ fontSize: 13 }}>Can be used in formulas</Typography>}
        />
        {isText && (
          <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', ml: 3.5, mt: -0.5 }}>
            A text field can’t be — it would evaluate to nothing and plan the task as instant.
          </Typography>
        )}
        <FormControlLabel
          sx={{ display: 'block' }}
          control={<Checkbox size="small" checked={draft.pieceVarying} onChange={(e) => set('pieceVarying', e.target.checked)} />}
          label={<Typography sx={{ fontSize: 13 }}>Varies by piece / batch</Typography>}
        />
        <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', ml: 3.5, mt: -0.5 }}>
          Only then does the issued piece’s own value override the item’s — so a task’s
          estimate can change when stock is issued.
        </Typography>
      </Box>
    </FormDialog>
  );
}

export default function ItemFields() {
  const canManage = usePermission('fab_erp_items_meta_manage');
  const { toast } = useToast();

  const [rows, setRows] = useState<FabFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editDialog, setEditDialog] = useState<{ open: boolean; item: FabFieldDef | null }>({ open: false, item: null });
  const [delItem, setDelItem] = useState<FabFieldDef | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fabQuery<{ data: FabFieldDef[] }>('fabErpFieldDef', {
        orderBy: [{ field: 'sortOrder', direction: 'asc' }, { field: 'fieldKey', direction: 'asc' }],
        pagination: { limit: 500 },
      });
      setRows(res.data ?? []);
    } catch (e) {
      setError(backendMessage(e, 'Failed to load field definitions'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.fieldKey.toLowerCase().includes(q) || (r.label ?? '').toLowerCase().includes(q));
  }, [rows, search]);

  const columns: DataColumn<FabFieldDef>[] = [
    { key: 'fieldKey', header: 'Field key', render: (r) => <Mono>{r.fieldKey}</Mono>, sortValue: (r) => r.fieldKey },
    { key: 'label', header: 'Label', render: (r) => r.label, sortValue: (r) => r.label },
    { key: 'dataType', header: 'Type', width: 90, render: (r) => r.dataType, sortValue: (r) => r.dataType },
    { key: 'unit', header: 'Unit', width: 80, render: (r) => r.unit ?? '—', sortValue: (r) => r.unit ?? '' },
    {
      key: 'formulaUsable', header: 'In formulas', width: 150,
      render: (r) => (Number(r.formulaUsable) === 1
        ? <Mono>item.{r.fieldKey}</Mono>
        : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>—</Box>),
      sortValue: (r) => Number(r.formulaUsable),
    },
    {
      key: 'pieceVarying', header: 'Per piece', width: 90,
      render: (r) => (Number(r.pieceVarying) === 1 ? 'yes' : '—'),
      sortValue: (r) => Number(r.pieceVarying),
    },
  ];

  const newBtn = canManage ? (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditDialog({ open: true, item: null })}>
      Add field
    </Button>
  ) : null;

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader
        title="Item fields"
        subtitle="Every value an item can carry, with its unit and type. A field marked for formulas becomes item.<key> immediately."
        actions={newBtn}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <FilterBar search={search} onSearch={setSearch} placeholder="Search key or label…" />

      {!loading && filtered.length === 0 ? (
        <EmptyState
          icon={<AutoGraphRounded />}
          title={search ? 'No fields match your search' : 'No fields defined yet'}
          hint={search
            ? 'Try a different search.'
            : canManage
              ? 'Define a field so items can carry it and formulas can read it.'
              : 'Ask an administrator to define one.'}
          action={search ? undefined : newBtn ?? undefined}
        />
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          getRowId={(r) => r.id}
          loading={loading}
          storageKey="item-fields"
          exportName="item-fields"
          defaultSortKey="fieldKey"
          rowActions={canManage ? (row) => (
            <>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => setEditDialog({ open: true, item: row })} aria-label={`Edit ${row.fieldKey}`}>
                  <EditRounded fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="small" color="error" onClick={() => setDelItem(row)} aria-label={`Delete ${row.fieldKey}`}>
                  <DeleteOutlineRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          ) : undefined}
        />
      )}

      <FieldDialog
        open={editDialog.open}
        initial={editDialog.item}
        onClose={() => setEditDialog({ open: false, item: null })}
        onSaved={() => { setEditDialog({ open: false, item: null }); toast('Field saved'); fetchRows(); }}
      />
      <ConfirmDialog
        open={!!delItem}
        title="Delete field"
        entityName={delItem?.fieldKey}
        body="Any formula referencing this field will stop resolving it and estimate from zero."
        onClose={() => setDelItem(null)}
        onConfirm={async () => {
          await fabMutate('fabErpFieldDef', 'delete', { id: delItem!.id });
          setDelItem(null);
          toast('Field deleted');
          fetchRows();
        }}
      />
    </Box>
  );
}
