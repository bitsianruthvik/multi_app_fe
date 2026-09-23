import { useEffect, useState } from 'react';
import { Box, MenuItem, TextField, Typography } from '@mui/material';
import { cfApi } from '../api/client';
import type { Machine, MasterRecord, Tree } from '../api/types';
import { ClassificationPicker } from './ClassificationPicker';
import { RecordPicker } from './RecordPicker';
import { FormDialog } from './FormDialog';

/**
 * Creates or edits a machine. It sits on a machine type — the deepest level of
 * a machine family — which decides what it must carry (its specifications) and
 * which operation rules reach it. The code can be left to the coding rule.
 */
export function MachineDialog({ open, existing, tree, onClose, onSaved }: {
  open: boolean;
  existing: Machine | null;
  tree: Tree | null;
  onClose: () => void;
  onSaved: (m: Machine) => void;
}) {
  const blank = { code: '', name: '', classificationId: null as number | null, serialNumber: '', notes: '', status: 'active' as Machine['status'], catalogItem: null as MasterRecord | null };
  const [form, setForm] = useState(blank);
  useEffect(() => {
    if (!open) return;
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

  const noTypes = tree && !JSON.stringify(tree.roots).includes('"scope":"machine"');
  return (
    <FormDialog open={open} title={existing ? `Edit ${existing.code}` : 'New machine'} onClose={onClose} onSubmit={save}
      submitLabel={existing ? 'Save' : 'Create'} busyLabel={existing ? 'Saving…' : 'Creating…'} submitDisabled={!form.classificationId || !form.name.trim()}>
        {noTypes && (
          <Typography sx={{ fontSize: 13, color: 'var(--c-warning-800)', background: 'var(--c-warning-50)', border: '1px solid var(--c-warning-200)', borderRadius: 'var(--r-sm)', p: 1.25 }}>
            There are no machine types yet. Under Setup › Classification, add a Family with scope Machine (e.g. Machines › Cutting › CNC plasma).
          </Typography>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <Box sx={{ gridColumn: '1 / -1' }}>
            <ClassificationPicker tree={tree} scope="machine" value={form.classificationId} onChange={(id) => setForm({ ...form, classificationId: id })}
              label="Machine type" helperText={existing ? 'A new type brings its own specifications and operation rules' : 'Decides what it must carry and which operations reach it'} />
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
  );
}
