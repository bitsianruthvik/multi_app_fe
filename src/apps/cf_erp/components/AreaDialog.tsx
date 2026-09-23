import { useEffect, useState } from 'react';
import { Autocomplete, Box, MenuItem, TextField } from '@mui/material';
import { cfApi } from '../api/client';
import type { AreaPurpose, Machine, StockingArea } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { PURPOSE_HELP, PURPOSE_LABEL } from '../lib/inventory';
import { FormDialog } from './FormDialog';

const PURPOSES: AreaPurpose[] = ['storage', 'wip', 'quarantine', 'dispatch'];

/** Creates or edits a stocking area — a place that holds an inventory. */
export function AreaDialog({ open, existing, onClose, onSaved }: { open: boolean; existing: StockingArea | null; onClose: () => void; onSaved: (a: StockingArea) => void }) {
  const machines = useLoad(() => cfApi.get<Machine[]>('/machines'), []);
  const blank = { code: '', name: '', purpose: 'storage' as AreaPurpose, machineId: null as number | null, status: 'active' as StockingArea['status'], notes: '' };
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (!open) return;
    setF(existing ? { code: existing.code, name: existing.name, purpose: existing.purpose, machineId: existing.machine?.id ?? null, status: existing.status, notes: existing.notes ?? '' } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing]);
  const save = async () => {
    const { status, ...rest } = f;
    const body = { ...rest, notes: f.notes || null, ...(existing ? { status } : {}) };
    const saved = existing ? await cfApi.put<StockingArea>(`/stocking-areas/${existing.id}`, body) : await cfApi.post<StockingArea>('/stocking-areas', body);
    onSaved(saved);
  };
  const options = machines.data ?? [];
  return (
    <FormDialog open={open} title={existing ? `Edit ${existing.code}` : 'New stocking area'} onClose={onClose} onSubmit={save}
      submitLabel={existing ? 'Save' : 'Create'} busyLabel={existing ? 'Saving…' : 'Creating…'}
      subtitle={existing ? undefined : 'A place that holds stock. Each area keeps its own inventory.'}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: '180px minmax(0, 1fr)' }, gap: 2 }}>
          <TextField label="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} autoFocus={!existing} inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} helperText="e.g. RM-YARD" />
          <TextField label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <TextField select label="Its stock counts as" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value as AreaPurpose })} helperText={PURPOSE_HELP[f.purpose]} sx={{ gridColumn: '1 / -1' }}>
            {PURPOSES.map((p) => <MenuItem key={p} value={p}>{PURPOSE_LABEL[p]}</MenuItem>)}
          </TextField>
          <Box sx={{ gridColumn: '1 / -1' }}>
            <Autocomplete size="small" options={options} value={options.find((m) => m.id === f.machineId) ?? null} getOptionLabel={(m) => `${m.code} · ${m.name}`}
              isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, m) => setF({ ...f, machineId: m?.id ?? null })}
              renderInput={(p) => <TextField {...p} label="Beside machine (optional)"
                helperText={machines.error
                  ? 'The machine list could not be loaded — you may not have permission to see machines.'
                  : 'A WIP area usually belongs to the machine that works its stock'} />} />
          </Box>
          {existing && (
            <TextField select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as StockingArea['status'] })} helperText="Nothing goes into an inactive area; stock can still leave it">
              <MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem>
            </TextField>
          )}
          <TextField label="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} multiline sx={{ gridColumn: '1 / -1' }} />
        </Box>
    </FormDialog>
  );
}
