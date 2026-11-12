import { useEffect, useState } from 'react';
import { Box, MenuItem, TextField, Typography } from '@mui/material';
import type { Tree } from '../api/types';
import { listMachineModels, requestMachine, type MachineModel, type MachineRequestResult } from '../api/purchaseRequests';
import { FormDialog } from './FormDialog';
import { ServerPicker } from './ServerPicker';
import { ClassificationPicker } from './ClassificationPicker';
import { InfoTip, Mono } from './ui';

/**
 * REQUEST A NEW MACHINE (§103, user 2026-11-12): production (planning) or Maintenance asks for a machine to be bought.
 * It becomes an MR "For: New machine" to Stores; its PR waits for Maintenance (with a comment), then the MD, before
 * Purchase quotes it. The model comes from the catalog, or a new one is named (a draft catalog item).
 */
export function RequestMachineDialog({ open, tree, onClose, onSent }: {
  open: boolean; tree: Tree | null | undefined; onClose: () => void; onSent: (r: MachineRequestResult) => void;
}) {
  const [mode, setMode] = useState<'pick' | 'new'>('pick');
  const [model, setModel] = useState<MachineModel | null>(null);
  const [newName, setNewName] = useState('');
  const [typeId, setTypeId] = useState<number | null>(null);
  const [qty, setQty] = useState('1');
  const [needBy, setNeedBy] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (!open) return;
    setMode('pick'); setModel(null); setNewName(''); setTypeId(null); setQty('1'); setNeedBy(''); setPurpose(''); setNotes('');
  }, [open]);
  const hasModel = mode === 'pick' ? !!model : !!newName.trim();
  const qtyOk = /^\d+$/.test(qty.trim()) && Number(qty) >= 1;

  const send = async () => {
    const r = await requestMachine({
      ...(mode === 'pick' && model ? { itemId: model.id } : { newModel: { name: newName.trim() } }),
      machineTypeId: typeId, quantity: Number(qty), needBy: needBy || null, purpose: purpose.trim(), notes: notes.trim() || null,
    });
    onSent(r);
  };

  return (
    <FormDialog open={open} onClose={onClose} onSubmit={send} submitLabel="Send to Stores" busyLabel="Sending…"
      submitDisabled={!hasModel || !qtyOk || !purpose.trim()}
      title={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Request a new machine
        <InfoTip text="It goes to Stores as a material request (For: New machine). Stores raises its purchase request, Maintenance approves it with a comment, then the MD. Only then does Purchase take quotes and raise the PO — which the MD approves as every PO." /></Box>}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }} data-testid="request-machine">
        <TextField select label="Model" value={mode} onChange={(e) => setMode(e.target.value as 'pick' | 'new')} sx={{ gridColumn: '1 / -1' }}>
          <MenuItem value="pick">A model in the catalog</MenuItem>
          <MenuItem value="new">A new model</MenuItem>
        </TextField>
        {mode === 'pick' ? (
          <Box sx={{ gridColumn: '1 / -1' }}>
            <ServerPicker<MachineModel> label="Machine model" noun="machine model" value={model} onChange={setModel} search={(t) => listMachineModels(t)}
              getId={(m) => m.id} getLabel={(m) => `${m.code ?? ''} · ${m.name}`}
              renderOption={(m) => <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', minWidth: 0 }}><Mono sx={{ minWidth: 90 }}>{m.code}</Mono><Typography sx={{ fontSize: 14 }} noWrap>{m.name}</Typography>{m.status === 'draft' && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>draft</Typography>}</Box>}
              helperText="Capital equipment › Machinery › Machines. Not there? Choose A new model." />
          </Box>
        ) : (
          <TextField sx={{ gridColumn: '1 / -1' }} label="New model" placeholder="Plasma cutter — Hypertherm XPR300" value={newName} onChange={(e) => setNewName(e.target.value)}
            helperText="Added to the catalog as a draft" inputProps={{ 'data-testid': 'request-machine-new-model' }} />
        )}
        <Box sx={{ gridColumn: '1 / -1' }}>
          <ClassificationPicker tree={tree ?? null} scope="machine" screen="machines" value={typeId} onChange={setTypeId} label="Machine type (optional)" />
        </Box>
        <TextField label="How many" value={qty} onChange={(e) => setQty(e.target.value)} error={!!qty && !qtyOk} inputProps={{ inputMode: 'numeric' }} />
        <TextField label="Needed by" type="date" value={needBy} onChange={(e) => setNeedBy(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField sx={{ gridColumn: '1 / -1' }} label="What is it for?" value={purpose} onChange={(e) => setPurpose(e.target.value)} required
          inputProps={{ 'data-testid': 'request-machine-purpose' }} />
        <TextField sx={{ gridColumn: '1 / -1' }} label="Notes" multiline minRows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Box>
    </FormDialog>
  );
}
