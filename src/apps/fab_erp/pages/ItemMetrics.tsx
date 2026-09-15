import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, FormControlLabel, IconButton, ListSubheader, MenuItem,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import AutoGraphRounded from '@mui/icons-material/AutoGraphRounded';

import { fabQuery, fabMutate } from '../api/client';
import type { FabFieldDef } from '../types';
import { unitsByDimension, useFieldVocabulary } from '../api/fields';
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
 * ONE FLAG EARNS ITS PLACE
 *
 *   formula usable   a TEXT field can never be. The engine coerces with
 *                    Number(), so text yields NaN, the try/catch returns null,
 *                    and the task plans as a zero-length bar with no error.
 *
 * This page authors `fab_fields`, the table `/formula/variables` reads. It
 * briefly wrote the retired `fab_field_defs` instead, which meant a field saved
 * here never appeared in autocomplete and linted as unknown — the one failure
 * mode a registry cannot have.
 */

/**
 * The row this page authors — `fab_fields` via the `fabErpField` resource.
 * `FabFieldDef` (types.ts) now describes this exact shape — it used to
 * describe the retired `fab_field_defs` table, which is why this file used
 * to keep its own copy rather than trust the shared one.
 */

/**
 * Data types and "where is this set?" both come from `GET /fields/vocabulary`
 * now (`useFieldVocabulary`, api/fields.ts) instead of being hardcoded here —
 * that endpoint serves `dataTypes` and `levels` for exactly this table today,
 * not the item|piece|both trio of the retired one this file's old comment
 * warned about. `enum` is filtered out of `dataTypes`: it isn't a type this
 * screen offers directly — "Allowed values" below turns any type into a
 * picker, so a separate "enum" choice would be a second, redundant way to
 * say the same thing.
 */
const FALLBACK_DATA_TYPES = ['number', 'integer', 'text', 'date', 'bool'];

/** `vocab.levels`, with the same two rungs as a fallback if the fetch hasn't landed yet. */
function levelsOf(vocab: ReturnType<typeof useFieldVocabulary>) {
  return vocab.levels.length ? vocab.levels : [
    { value: 'order_item' as const, label: 'Same for every piece', hint: 'Thickness, grade, model' },
    { value: 'stock_piece' as const, label: 'Differs per piece', hint: 'Length, heat number, serial' },
  ];
}

interface Draft {
  fieldKey: string; label: string; dataType: string; defaultUnit: string;
  formulaUsable: boolean; defaultNum: string;
  appliesAt: string; allowedValues: string;
}
const BLANK = (): Draft => ({
  fieldKey: '', label: '', dataType: 'number', defaultUnit: '',
  formulaUsable: true, defaultNum: '',
  appliesAt: 'order_item', allowedValues: '',
});

function FieldDialog({ open, initial, onClose, onSaved }: {
  open: boolean; initial: FabFieldDef | null; onClose: () => void; onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(BLANK());
  const isNew = !initial;
  const vocab = useFieldVocabulary();
  const unitGroups = useMemo(() => unitsByDimension(vocab), [vocab]);
  const dataTypes = useMemo(
    () => (vocab.dataTypes.length ? vocab.dataTypes.filter((t) => t.value !== 'enum') : FALLBACK_DATA_TYPES.map((v) => ({ value: v, label: v }))),
    [vocab],
  );
  const levels = levelsOf(vocab);

  useEffect(() => {
    if (!open) return;
    setDraft(initial
      ? {
          fieldKey: initial.fieldKey,
          label: initial.label,
          dataType: initial.dataType ?? 'number',
          defaultUnit: initial.defaultUnit ?? '',
          formulaUsable: Number(initial.formulaUsable) === 1,
          // Anything broader than order_item (a seeded catalog_item field, say)
          // shows as the item option: both mean "a piece may not disagree", and
          // offering a third choice here would let an edit widen it by accident.
          appliesAt: initial.appliesAt === 'stock_piece' ? 'stock_piece' : 'order_item',
          allowedValues: Array.isArray(initial.allowedValues)
            ? initial.allowedValues.join(', ')
            : (initial.allowedValues ?? ''),
          defaultNum: initial.defaultNum != null ? String(initial.defaultNum) : '',
        }
      : BLANK());
  }, [open, initial]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const isText = draft.dataType === 'text';
  // Features are written against the key of a standard field, so renaming one
  // breaks them silently — the value simply stops resolving. Everything else
  // about the field stays editable.
  const keyLocked = Number(initial?.isStandard) === 1;

  // Throwing keeps the dialog open with the user's input and shows the real
  // backend message — FormDialog handles both.
  const save = async () => {
    const payload = {
      field_key: draft.fieldKey.trim(),
      label: draft.label.trim(),
      data_type: draft.dataType,
      default_unit: draft.defaultUnit.trim() || null,
      // Enforced here as well as explained: a text field reaching a formula
      // nulls the whole duration silently.
      formula_usable: isText ? 0 : (draft.formulaUsable ? 1 : 0),
      applies_at: draft.appliesAt,
      allowed_values: draft.allowedValues.trim()
        ? JSON.stringify(draft.allowedValues.split(',').map((s) => s.trim()).filter(Boolean))
        : null,
      default_num: draft.defaultNum !== '' && !isText ? Number(draft.defaultNum) : null,
    };
    // A standard field's key is what features reference, so an update must not
    // carry the (read-only) input back as a change.
    if (keyLocked) delete (payload as Partial<typeof payload>).field_key;
    if (isNew) await fabMutate('fabErpField', 'insert', payload);
    else await fabMutate('fabErpField', 'update', { id: initial!.id, ...payload });
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
        slotProps={{ input: { readOnly: keyLocked } }}
        helperText={keyLocked
          ? 'Standard field — features are written against this key, so it can’t be renamed. Label, unit and scoping are still yours.'
          : (draft.fieldKey.trim() && !isText
            ? `Used in formulas as item.${draft.fieldKey.trim()}`
            : 'Snake-case identifier, e.g. weld_length_m')}
      />
      <TextField label="Label" value={draft.label} onChange={(e) => set('label', e.target.value)} size="small" fullWidth required helperText="Human-readable name shown in the UI" />
      <Box sx={{ display: 'flex', gap: 2 }}>
        <TextField select label="Data type" value={draft.dataType} onChange={(e) => set('dataType', e.target.value)} size="small" sx={{ flex: 1 }}>
          {dataTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
        </TextField>
        {/* A picked unit, not typed. Two people typing "m2" and "m²" produce
            two units for one thing, which is how this registry already grew a
            free-text `Thickness (mm)` beside the numeric `thickness_mm`. */}
        <TextField
          select label="Unit" value={unitGroups.flatMap((g) => g.units).some((u) => u.code === draft.defaultUnit) ? draft.defaultUnit : ''}
          onChange={(e) => set('defaultUnit', e.target.value)}
          size="small" sx={{ flex: 1 }} disabled={isText}
          helperText={vocab.unitsAreConverted ? 'A value stated in a different unit is converted on save.' : 'Declared, not converted.'}
        >
          <MenuItem value="">— none —</MenuItem>
          {unitGroups.flatMap((g) => [
            <ListSubheader key={`h-${g.group}`} sx={{ fontSize: 11, lineHeight: '26px' }}>{g.group}</ListSubheader>,
            ...g.units.map((u) => <MenuItem key={u.code} value={u.code}>{u.code}</MenuItem>),
          ])}
        </TextField>
      </Box>

      {/* Asked as a property of the VALUE rather than of the storage: people
          know whether two pieces of the same part can differ, and nobody knows
          which rung of the resolver ladder that implies. */}
      <TextField
        select label="Where is this set?" value={draft.appliesAt} size="small" fullWidth
        onChange={(e) => set('appliesAt', e.target.value)}
        helperText={levels.find((l) => l.value === draft.appliesAt)?.hint ?? ' '}
      >
        {levels.map((l) => <MenuItem key={l.value} value={l.value}>{l.label}</MenuItem>)}
      </TextField>

      {/* Allowed values turn any type into a picker. Deliberately not a
          separate "picker" data type: that would permit a picker with no
          options, and make a numeric picker (6 / 8 / 10 mm) unexpressible. */}
      <TextField
        label="Allowed values" value={draft.allowedValues} size="small" fullWidth
        onChange={(e) => set('allowedValues', e.target.value)}
        placeholder="expense, capitalise"
        helperText="Comma-separated. Leave blank for free entry; fill it in and this becomes a dropdown that rejects anything else."
      />
      <TextField
        label="Default value" type="number" value={draft.defaultNum} disabled={isText}
        onChange={(e) => set('defaultNum', e.target.value)} size="small" fullWidth
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
        {vocab.unitsAreConverted ? (
          <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 1 }}>
            Units convert automatically now — a value entered in metres against a field
            declared in millimetres is stored as 1000× correctly, not taken literally.
          </Typography>
        ) : (
          <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 1 }}>
            A unit is documentation — nothing converts between them. Define a length in metres
            against a formula written for millimetres and the answer is plausible and wrong by 1000×.
          </Typography>
        )}
      </Box>
    </FormDialog>
  );
}

export default function ItemFields() {
  const canManage = usePermission('fab_erp_items_meta_manage');
  const { toast } = useToast();
  const vocab = useFieldVocabulary();
  const levels = useMemo(() => levelsOf(vocab), [vocab]);

  const [rows, setRows] = useState<FabFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editDialog, setEditDialog] = useState<{ open: boolean; item: FabFieldDef | null }>({ open: false, item: null });
  const [delItem, setDelItem] = useState<FabFieldDef | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fabQuery<{ data: FabFieldDef[] }>('fabErpField', {
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
    {
      key: 'fieldKey', header: 'Field key', sortValue: (r) => r.fieldKey,
      render: (r) => (Number(r.isStandard) === 1
        ? (
          <Tooltip title="Standard field — features reference this key, so it can’t be renamed or deleted">
            <Box component="span"><Mono>{r.fieldKey}</Mono></Box>
          </Tooltip>
        )
        : <Mono>{r.fieldKey}</Mono>),
    },
    { key: 'label', header: 'Label', render: (r) => r.label, sortValue: (r) => r.label },
    { key: 'dataType', header: 'Type', width: 90, render: (r) => r.dataType, sortValue: (r) => r.dataType },
    { key: 'defaultUnit', header: 'Unit', width: 80, render: (r) => r.defaultUnit ?? '—', sortValue: (r) => r.defaultUnit ?? '' },
    {
      key: 'formulaUsable', header: 'In formulas', width: 150,
      render: (r) => (Number(r.formulaUsable) === 1
        ? <Mono>item.{r.fieldKey}</Mono>
        : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>—</Box>),
      sortValue: (r) => Number(r.formulaUsable),
    },
    {
      key: 'appliesAt', header: 'Set on', width: 170,
      // The human phrasing, not the stored rung: this column exists to be
      // scanned, and "order_item" reads as a table name rather than an answer.
      render: (r) => (levels.find((l) => l.value === r.appliesAt)?.label ?? levels[0].label),
      sortValue: (r) => String(r.appliesAt ?? ''),
    },
    {
      key: 'allowedValues', header: 'Values', width: 130,
      render: (r) => {
        const v = Array.isArray(r.allowedValues)
          ? r.allowedValues
          : (typeof r.allowedValues === 'string' && r.allowedValues.trim()
            ? JSON.parse(r.allowedValues) as string[] : null);
        return v?.length ? `${v.length} allowed` : '—';
      },
      sortValue: (r) => (r.allowedValues ? 1 : 0),
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
              {/* Shown but disabled rather than hidden: a missing button reads
                  as a permission problem, and the reason is the useful part. */}
              <Tooltip title={Number(row.isStandard) === 1
                ? 'Standard field — features are written against this key'
                : 'Delete'}>
                <Box component="span">
                  <IconButton
                    size="small" color="error" disabled={Number(row.isStandard) === 1}
                    onClick={() => setDelItem(row)} aria-label={`Delete ${row.fieldKey}`}
                  >
                    <DeleteOutlineRounded fontSize="small" />
                  </IconButton>
                </Box>
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
          await fabMutate('fabErpField', 'delete', { id: delItem!.id });
          setDelItem(null);
          toast('Field deleted');
          fetchRows();
        }}
      />
    </Box>
  );
}
