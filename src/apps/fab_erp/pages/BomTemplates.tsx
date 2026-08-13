/**
 * BomTemplates.tsx — what each kind of structure is made of, by default.
 *
 * This was a hardcoded array in the frontend bundle: every company got the same
 * seven composite-girder parts, only that one structure type had any at all, and
 * changing them meant a deploy. It is the same shape as a flow rule — "for this
 * kind of line item, do X by default" — and that one was already company-scoped
 * data editable here, so this follows it.
 *
 * THESE ARE A STARTING POINT, NOT A SCHEMA. The wizard copies them in and every
 * one can be edited, removed or added to before a sheet is generated, which is
 * why nothing here is enforced downstream and why an incomplete template is
 * perfectly usable.
 *
 * The `/D` convention is worth knowing before editing: flow rules match on a
 * code suffix, so a part coded `BS/D` is what makes drilling get assigned
 * without a per-item decision. Renaming it to something tidier would quietly
 * route holed stiffeners down the flow that never drills them — so the form
 * says so where it can be seen.
 *
 * All CRUD via the generic query/mutate API on fabErpBomTemplate.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, MenuItem, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';

import { fabQuery, fabMutate } from '../api/client';
import { usePermission } from '@core/hooks/usePermission';
import {
  PageHeader, Surface, Mono, EmptyState, ListSkeleton, useToast, DataTable,
  ConfirmDialog, backendMessage,
} from '../components';
import { LINE_TYPES } from '../types';
import {
  fetchRawMaterials, materialsForThickness as materialsFor, materialLabel, withSelected,
  type RawMaterial as Material,
} from '../api/rawMaterials';

interface BomTemplate {
  id: number;
  lineType: string;
  code: string;
  name?: string | null;
  qty?: number | null;
  thicknessMm?: number | null;
  rmCatalogItemId?: number | null;
  rmCode?: string | null;
  sortOrder?: number | null;
  active: number;
  notes?: string | null;
}


const blank = (lineType: string) => ({
  id: 0, lineType, code: '', name: '', qty: '1', thick: '', rmCatalogItemId: '' as number | '',
  sortOrder: '', active: 1, notes: '',
});

export default function BomTemplates() {
  const canManage = usePermission('fab_erp_flows_manage');
  const { toast } = useToast();
  const [rows, setRows] = useState<BomTemplate[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lineType, setLineType] = useState<string>(LINE_TYPES[0]);
  const [edit, setEdit] = useState<ReturnType<typeof blank> | null>(null);
  const [del, setDel] = useState<BomTemplate | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [t, m] = await Promise.all([
        fabQuery<{ data: BomTemplate[] }>('fabErpBomTemplate', {
          orderBy: [{ field: 'sortOrder', direction: 'asc' }, { field: 'id', direction: 'asc' }],
          pagination: { limit: 500 },
        }).then((r) => r.data ?? []),
        fetchRawMaterials().catch(() => []),
      ]);
      setRows(t); setMaterials(m);
    } catch (e) {
      setError(backendMessage(e, 'Could not load BOM templates.'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(
    () => rows.filter((r) => r.lineType === lineType),
    [rows, lineType],
  );
  /** Structure types with nothing defined — worth surfacing, not hiding. */
  const empties = useMemo(
    () => LINE_TYPES.filter((t) => !rows.some((r) => r.lineType === t)),
    [rows],
  );
  /**
   * A qty that was typed but is not a positive number.
   *
   * This used to be `Number(qty) || 1`, which turned a typed 0 into a silent 1
   * — the form disagreeing with what it had just been told. Saying so and
   * refusing to save is the honest version; blank still means one.
   */
  const qtyBad = !!edit && edit.qty.trim() !== '' && !(Number(edit.qty) > 0);

  async function save() {
    if (!edit || !edit.code.trim()) return;
    const code = edit.code.trim().toUpperCase();

    /**
     * The same code twice in one structure type means the wizard copies that
     * part in twice, on every order, until somebody notices. The seed guards
     * itself with NOT EXISTS but nothing stopped this form from doing it.
     *
     * Checked here rather than as a UNIQUE index because rows are soft-deleted:
     * a unique key would let a removed `TF` block ever adding `TF` back, which
     * trades a duplicate for something worse. `rows` holds only live rows, so
     * this asks the question the constraint could not.
     */
    const clash = rows.find(
      (r) => r.id !== edit.id && r.lineType === edit.lineType && r.code.toUpperCase() === code,
    );
    if (clash) {
      setError(`${edit.lineType} already has a part coded ${code}.`);
      return;
    }

    const payload = {
      line_type: edit.lineType,
      code,
      name: edit.name.trim() || null,
      // Blank means "one of them"; anything actually typed is kept as typed,
      // which is what the disabled Save is there to keep sane.
      qty: edit.qty.trim() === '' ? 1 : Number(edit.qty),
      thickness_mm: edit.thick.trim() ? Number(edit.thick) : null,
      rm_catalog_item_id: edit.rmCatalogItemId === '' ? null : Number(edit.rmCatalogItemId),
      // Counted within the type being SAVED, not the one the toolbar happens to
      // be showing — they differ the moment the dialog's own type is changed.
      sort_order: edit.sortOrder.trim()
        ? Number(edit.sortOrder)
        : rows.filter((r) => r.lineType === edit.lineType).length + 1,
      active: edit.active,
      notes: edit.notes.trim() || null,
    };
    try {
      if (edit.id) await fabMutate('fabErpBomTemplate', 'update', { id: edit.id, ...payload });
      else await fabMutate('fabErpBomTemplate', 'insert', payload);
      setEdit(null); await load();
      toast(edit.id ? 'Part updated' : 'Part added');
    } catch (e) {
      setError(backendMessage(e, 'Could not save that part.'));
    }
  }

  async function remove(row: BomTemplate) {
    try {
      await fabMutate('fabErpBomTemplate', 'delete', { id: row.id });
      setDel(null); await load(); toast('Part removed');
    } catch (e) {
      setError(backendMessage(e, 'Could not remove that part.'));
    }
  }

  return (
    <Box>
      <PageHeader
        title="BOM templates"
        subtitle="What each kind of structure starts as. The wizard fills these in; everything stays editable before a sheet is generated."
        actions={canManage ? (
          <Button variant="contained" size="small" startIcon={<AddIcon />}
            onClick={() => setEdit(blank(lineType))}>
            Add part
          </Button>
        ) : undefined}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Surface e={1} sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField select size="small" label="Structure type" value={lineType} sx={{ minWidth: 220 }}
          onChange={(e) => setLineType(e.target.value)}>
          {LINE_TYPES.map((t) => (
            <MenuItem key={t} value={t}>
              {t}{rows.some((r) => r.lineType === t) ? '' : '  — nothing defined'}
            </MenuItem>
          ))}
        </TextField>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
          A part coded <Mono>BS/D</Mono> is what makes drilling get assigned — flow rules match
          that suffix, so renaming it changes which flow the part gets.
        </Typography>
      </Surface>

      {empties.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Nothing defined yet for <strong>{empties.join(', ')}</strong>. Picking one of those in
          the wizard starts from an empty part list — which works, it just fills nothing in.
        </Alert>
      )}

      {loading ? <ListSkeleton rows={5} /> : shown.length === 0 ? (
        <EmptyState
          icon={<AccountTreeRounded />}
          title={`No parts for ${lineType}`}
          hint="Add the parts this structure is usually made of, and the wizard will start from them."
        />
      ) : (
        <DataTable
          rows={shown}
          getRowId={(r) => r.id}
          storageKey="bom-templates"
          exportName="bom-templates"
          defaultSortKey="sortOrder"
          columns={[
            { key: 'sortOrder', header: '#', width: 60, numeric: true, render: (r) => r.sortOrder ?? '—', sortValue: (r) => r.sortOrder ?? 0 },
            { key: 'code', header: 'Code', width: 120, render: (r) => <Mono chip>{r.code}</Mono>, sortValue: (r) => r.code },
            { key: 'name', header: 'Name', render: (r) => r.name ?? '—', sortValue: (r) => r.name ?? '' },
            { key: 'qty', header: 'Qty', width: 80, numeric: true, render: (r) => r.qty ?? 1, sortValue: (r) => r.qty ?? 1 },
            { key: 'thicknessMm', header: 'Thick', width: 90, numeric: true, render: (r) => (r.thicknessMm != null ? Number(r.thicknessMm) : '—'), sortValue: (r) => r.thicknessMm ?? null },
            { key: 'rmCode', header: 'Raw material', width: 190, render: (r) => (r.rmCode ? <Mono>{r.rmCode}</Mono> : '—'), sortValue: (r) => r.rmCode ?? '' },
            { key: 'active', header: 'Active', width: 80, render: (r) => (r.active ? 'Yes' : 'No'), sortValue: (r) => r.active },
          ]}
          rowActions={canManage ? (r) => (
            <>
              <Tooltip title="Edit">
                <IconButton size="small" aria-label={`Edit ${r.code}`} onClick={() => setEdit({
                  id: r.id, lineType: r.lineType, code: r.code, name: r.name ?? '',
                  qty: String(r.qty ?? 1),
                  thick: r.thicknessMm != null ? String(Number(r.thicknessMm)) : '',
                  rmCatalogItemId: r.rmCatalogItemId ?? '',
                  sortOrder: r.sortOrder != null ? String(r.sortOrder) : '',
                  active: r.active, notes: r.notes ?? '',
                })}>
                  <EditRounded fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Remove">
                <IconButton size="small" color="error" aria-label={`Remove ${r.code}`} onClick={() => setDel(r)}>
                  <DeleteOutlineRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          ) : undefined}
        />
      )}

      <Dialog open={!!edit} onClose={() => setEdit(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>{edit?.id ? 'Edit part' : 'Add part'}</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField select size="small" label="Structure type" value={edit?.lineType ?? ''}
            onChange={(e) => setEdit((v) => (v ? { ...v, lineType: e.target.value } : v))}>
            {LINE_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField size="small" label="Code *" value={edit?.code ?? ''} sx={{ width: 150 }}
              helperText="A /D suffix means drilled"
              slotProps={{ htmlInput: { style: { textTransform: 'uppercase' }, maxLength: 60 } }}
              onChange={(e) => setEdit((v) => (v ? { ...v, code: e.target.value } : v))} />
            <TextField size="small" label="Name" value={edit?.name ?? ''} sx={{ flex: 1 }}
              onChange={(e) => setEdit((v) => (v ? { ...v, name: e.target.value } : v))} />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField size="small" type="number" label="Qty" value={edit?.qty ?? '1'} sx={{ width: 90 }}
              error={qtyBad} helperText={qtyBad ? 'Must be above 0' : ' '}
              onChange={(e) => setEdit((v) => (v ? { ...v, qty: e.target.value } : v))} />
            <TextField size="small" type="number" label="Thick" value={edit?.thick ?? ''} sx={{ width: 100 }}
              onChange={(e) => setEdit((v) => (v ? { ...v, thick: e.target.value, rmCatalogItemId: '' } : v))} />
            <TextField select size="small" label="Raw material" value={edit?.rmCatalogItemId ?? ''} sx={{ flex: 1 }}
              onChange={(e) => setEdit((v) => (v ? { ...v, rmCatalogItemId: e.target.value === '' ? '' : Number(e.target.value) } : v))}>
              <MenuItem value="">— not set —</MenuItem>
              {withSelected(materialsFor(materials, edit?.thick ?? ''), materials,
                (m) => m.id === edit?.rmCatalogItemId).map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {materialLabel(m)}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField size="small" type="number" label="Order" value={edit?.sortOrder ?? ''} sx={{ width: 100 }}
              helperText="Blank goes last"
              onChange={(e) => setEdit((v) => (v ? { ...v, sortOrder: e.target.value } : v))} />
            <FormControlLabel
              control={<Switch checked={!!edit?.active}
                onChange={(e) => setEdit((v) => (v ? { ...v, active: e.target.checked ? 1 : 0 } : v))} />}
              label="Active"
            />
          </Box>
          <TextField size="small" label="Notes" value={edit?.notes ?? ''} multiline minRows={2}
            onChange={(e) => setEdit((v) => (v ? { ...v, notes: e.target.value } : v))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEdit(null)}>Cancel</Button>
          <Button variant="contained" disabled={!edit?.code.trim() || qtyBad} onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!del}
        title="Remove part"
        body={`Remove ${del?.code ?? ''} from the ${del?.lineType ?? ''} template? Orders already built keep their parts — only what the wizard starts from changes.`}
        confirmLabel="Remove"
        onClose={() => setDel(null)}
        onConfirm={() => { if (del) remove(del); }}
      />
    </Box>
  );
}
