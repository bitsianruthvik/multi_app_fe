import { useEffect, useState } from 'react';
import { Box, MenuItem, TextField } from '@mui/material';
import { cfApi } from '../api/client';
import type { Operation } from '../api/types';
import { FormDialog } from './FormDialog';

/** Creates or edits an operation — one kind of work (cut, drill, weld). Which machines do it, and how fast, is set on its page. */
export function OperationDialog({ open, existing, onClose, onSaved }: {
  open: boolean;
  existing: Operation | null;
  onClose: () => void;
  onSaved: (o: Operation) => void;
}) {
  const blank = { code: '', name: '', description: '', status: 'active' as Operation['status'] };
  const [form, setForm] = useState(blank);
  useEffect(() => {
    if (!open) return;
    setForm(existing ? { code: existing.code, name: existing.name, description: existing.description ?? '', status: existing.status } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing]);
  const save = async () => {
    const body = { ...form, description: form.description || null };
    const saved = existing ? await cfApi.put<Operation>(`/operations/${existing.id}`, body) : await cfApi.post<Operation>('/operations', body);
    onSaved(saved);
  };
  return (
    <FormDialog open={open} title={existing ? `Edit ${existing.code}` : 'New operation'} onClose={onClose} onSubmit={save}
      submitLabel={existing ? 'Save' : 'Create'} busyLabel={existing ? 'Saving…' : 'Creating…'}
      subtitle={existing ? undefined : 'Which machines do it, and how fast, is set on its page.'}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: '160px minmax(0, 1fr)' }, gap: 2 }}>
        <TextField label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} autoFocus={!existing}
          inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} helperText="e.g. CUT, WELD" />
        <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} multiline sx={{ gridColumn: '1 / -1' }} />
        {existing && (
          <TextField select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Operation['status'] })}
            helperText="Inactive operations cannot be added to flows" sx={{ gridColumn: '1 / -1' }}>
            <MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem>
          </TextField>
        )}
      </Box>
    </FormDialog>
  );
}
