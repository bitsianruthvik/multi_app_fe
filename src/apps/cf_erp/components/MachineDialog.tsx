import { useEffect, useMemo, useState } from 'react';
import { Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import { cfApi } from '../api/client';
import type { Machine, MasterRecord, Tree } from '../api/types';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { flattenTree } from '../lib/tree';
import { ClassificationPicker } from './ClassificationPicker';
import { RecordPicker } from './RecordPicker';
import { FormDialog } from './FormDialog';
import { MachineTypeDialog } from './MachineTypeDialog';

/**
 * Creates or edits a machine. It sits on a machine type — the deepest level of
 * a machine family — which decides what it must carry (its specifications) and
 * which operation rules reach it. The code can be left to the coding rule.
 *
 * A missing machine type used to be a dead end here: the form said "go to
 * Setup › Classification", which is another screen behind another permission,
 * and getting there meant losing everything typed. It now opens the machine
 * type dialog over this one, and selects whatever comes back.
 */
export function MachineDialog({ open, existing, tree, onClose, onSaved, onTypesChanged }: {
  open: boolean;
  existing: Machine | null;
  tree: Tree | null;
  onClose: () => void;
  onSaved: (m: Machine) => void;
  /** Let the screen behind refresh its own copy of the tree after a type changed. */
  onTypesChanged?: () => void;
}) {
  const blank = { code: '', name: '', classificationId: null as number | null, serialNumber: '', notes: '', status: 'active' as Machine['status'], catalogItem: null as MasterRecord | null };
  const [form, setForm] = useState(blank);
  // The machines screen's own permission — the one that gates New machine.
  const canManageTypes = useIsPermitted()('cf_erp_production_manage');
  const [typesOpen, setTypesOpen] = useState(false);
  // A type made from inside this form has to reach the picker without the
  // screen behind us re-rendering, so the form keeps its own fresher tree.
  const [freshTree, setFreshTree] = useState<Tree | null>(null);
  const activeTree = freshTree ?? tree;
  useEffect(() => {
    if (!open) return;
    setFreshTree(null);
    setTypesOpen(false);
    setForm(existing ? {
      code: existing.code, name: existing.name, classificationId: existing.classificationId, serialNumber: existing.serialNumber ?? '',
      notes: existing.notes ?? '', status: existing.status,
      catalogItem: existing.catalogItem ? ({ id: existing.catalogItem.id, code: existing.catalogItem.code, name: existing.catalogItem.name ?? '' } as MasterRecord) : null,
    } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing]);

  const save = async () => {
    const body = {
      name: form.name, classificationId: form.classificationId, serialNumber: form.serialNumber || null, notes: form.notes || null,
      catalogItemId: form.catalogItem?.id ?? null,
      ...(existing ? { code: form.code, status: form.status } : { code: form.code || null }),
    };
    const saved = existing ? await cfApi.put<Machine>(`/machines/${existing.id}`, body) : await cfApi.post<Machine>('/machines', body);
    onSaved(saved);
  };

  const refreshTree = async () => {
    try { setFreshTree(await cfApi.get<Tree>('/classification')); } catch { /* the picker keeps the tree it already has */ }
  };
  // The picker reads the tree, so the new node has to be in it before the form
  // points at it — otherwise the field reads empty for a beat.
  const adoptType = async (id: number) => { await refreshTree(); setForm((f) => ({ ...f, classificationId: id })); };

  // Exactly what the picker offers: active machine types, the leaves of a machine family.
  const types = useMemo(() => flattenTree(activeTree).filter((n) => n.scope === 'machine' && n.isLeaf && n.status === 'active'), [activeTree]);
  const noTypes = !!activeTree && types.length === 0;

  return (
    <>
      <FormDialog open={open} title={existing ? `Edit ${existing.code}` : 'New machine'} onClose={onClose} onSubmit={save}
        submitLabel={existing ? 'Save' : 'Create'} busyLabel={existing ? 'Saving…' : 'Creating…'} submitDisabled={!form.classificationId || !form.name.trim()}>
          {noTypes && (
            <Box sx={{ fontSize: 13, color: 'var(--c-warning-800)', background: 'var(--c-warning-50)', border: '1px solid var(--c-warning-200)', borderRadius: 'var(--r-sm)', p: 1.25 }}>
              <Typography sx={{ fontSize: 13, color: 'inherit' }}>
                There are no machine types yet, and a machine has to sit on one — e.g. Machines › Cutting › CNC plasma.
              </Typography>
              {canManageTypes ? (
                <Button size="small" variant="contained" startIcon={<AddRounded />} sx={{ mt: 1.25 }} onClick={() => setTypesOpen(true)}>
                  Add a machine type
                </Button>
              ) : (
                <Typography sx={{ fontSize: 13, color: 'inherit', mt: 0.5 }}>
                  Ask someone who can manage production to add one, or add a Family with scope Machine under Setup › Classification.
                </Typography>
              )}
            </Box>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            <Box sx={{ gridColumn: '1 / -1' }}>
              <ClassificationPicker tree={activeTree} scope="machine" value={form.classificationId} onChange={(id) => setForm({ ...form, classificationId: id })}
                label="Machine type" helperText={existing ? 'A new type brings its own specifications and operation rules' : 'Decides what it must carry and which operations reach it'} />
              {canManageTypes && !noTypes && (
                <Button size="small" startIcon={<AddRounded />} onClick={() => setTypesOpen(true)} sx={{ mt: 0.25, ml: -0.5 }}>
                  Type not listed? Add or manage machine types
                </Button>
              )}
            </Box>
            <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus={!existing} />
            <TextField label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} inputProps={{ style: { fontFamily: 'var(--font-mono)' } }}
              helperText={existing ? 'Letters, digits and - _ . /' : 'Leave empty to number it by the coding rule'} />
            <TextField label="Serial number" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
            {existing ? (
              <TextField select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Machine['status'] })} helperText="Inactive machines are left out of timing">
                <MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem>
              </TextField>
            ) : <Box />}
            <Box sx={{ gridColumn: '1 / -1' }}>
              <RecordPicker kinds={['catalog']} value={form.catalogItem} onChange={(r) => setForm({ ...form, catalogItem: r })} label="Bought as (optional)"
                helperText="The catalog item it was purchased as, if it is one" />
            </Box>
            <TextField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} multiline sx={{ gridColumn: '1 / -1' }} />
          </Box>
      </FormDialog>

      {/* Deliberately a sibling of the form, not one of its children: a portal
          still bubbles its events up the React tree, and FormDialog's
          Enter-submits rule would save a half-filled machine while someone is
          typing a type's name. The form itself stays mounted and untouched. */}
      <MachineTypeDialog open={typesOpen} canManage={canManageTypes} closeOnCreate onClose={() => setTypesOpen(false)}
        onCreated={(made) => { void adoptType(made.id); }}
        onChanged={() => { void refreshTree(); onTypesChanged?.(); }} />
    </>
  );
}
