import { useEffect, useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { addAddress, checkGstin, getStates, listAddresses, removeAddress, saveAddress, type PartyAddress, type StateRow } from '../api/gst';
import { useLoad } from '../hooks/useLoad';
import { Badge, ErrorNotice, Mono } from './ui';
import { GstinField } from './GstUi';
import { FormDialog } from './FormDialog';
import { ConfirmDialog } from './ConfirmDialog';

/** One place the customer takes delivery: its own state decides CGST + SGST or IGST on the invoice. */
function AddressDialog({ partyId, existing, open, states, onClose, onSaved }: {
  partyId: number; existing: PartyAddress | null; open: boolean; states: StateRow[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ label: '', address: '', city: '', pincode: '', stateCode: '', gstin: '', isDefaultShip: false });
  useEffect(() => {
    if (!open) return;
    setForm(existing
      ? { label: existing.label ?? '', address: existing.address ?? '', city: existing.city ?? '', pincode: existing.pincode ?? '', stateCode: existing.stateCode ?? '', gstin: existing.gstin ?? '', isDefaultShip: existing.isDefaultShip }
      : { label: '', address: '', city: '', pincode: '', stateCode: '', gstin: '', isDefaultShip: false });
  }, [open, existing]);
  const save = async () => {
    const body = { label: form.label || null, address: form.address || null, city: form.city || null, pincode: form.pincode || null, stateCode: form.stateCode || null, gstin: form.gstin || null, isDefaultShip: form.isDefaultShip };
    if (existing) await saveAddress(partyId, existing.id, body); else await addAddress(partyId, body);
    onSaved();
  };
  return (
    <FormDialog open={open} title={existing ? 'Edit ship-to address' : 'New ship-to address'} onClose={onClose} onSubmit={save} submitLabel={existing ? 'Save' : 'Add'}
      submitDisabled={!form.address.trim() || !form.stateCode}
      subtitle="Where a dispatch is delivered, if not to the customer's own address.">
      <TextField label="Name of the place" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} autoFocus placeholder="Site office, Nagpur yard…" />
      <TextField label="Address" required multiline minRows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <TextField label="Pincode" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} inputProps={{ inputMode: 'numeric', maxLength: 6, style: { fontFamily: 'var(--font-mono)' } }} />
        <TextField select label="State" required value={form.stateCode} onChange={(e) => setForm({ ...form, stateCode: e.target.value })} helperText="Decides CGST + SGST or IGST">
          {states.map((s) => <MenuItem key={s.code} value={s.code}>{s.code} · {s.name}</MenuItem>)}
        </TextField>
        <GstinField label="GSTIN here (optional)" value={form.gstin} check={checkGstin} helperText="Only if this place is registered separately."
          onChange={(v) => setForm({ ...form, gstin: v })} onResult={(r) => setForm((f) => (f.stateCode ? f : { ...f, stateCode: r.stateCode ?? '' }))} />
      </Box>
      <FormControlLabel control={<Checkbox size="small" checked={form.isDefaultShip} onChange={(e) => setForm({ ...form, isDefaultShip: e.target.checked })} />}
        label="Ship here by default" />
    </FormDialog>
  );
}

/** The party's ship-to list inside its edit dialog: add, change, remove, and tick the default. */
export function PartyAddresses({ partyId, canEdit = true }: { partyId: number; canEdit?: boolean }) {
  const list = useLoad(() => listAddresses(partyId), [partyId]);
  const states = useLoad(() => getStates(), []);
  const [editing, setEditing] = useState<{ open: boolean; row: PartyAddress | null }>({ open: false, row: null });
  const [removing, setRemoving] = useState<PartyAddress | null>(null);
  const rows = list.data ?? [];
  const stateName = (code: string | null) => (code ? `${states.data?.find((s) => s.code === code)?.name ?? ''} (${code})`.trim() : 'no state');
  return (
    <Box data-testid="party-addresses">
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Ship-to addresses</Typography>
        {canEdit && <Button size="small" startIcon={<AddRounded />} onClick={() => setEditing({ open: true, row: null })}>Add address</Button>}
      </Box>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      {rows.length === 0 && !list.loading && (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>None yet — invoices go to the customer's own address.</Typography>
      )}
      {rows.map((a) => (
        <Box key={a.id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 1, borderTop: '1px solid var(--c-divider)' }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{a.label || 'Address'}</Typography>
              {a.isDefaultShip && <Badge family="info" noIcon label="Default" />}
              {a.gstin && <Mono chip>{a.gstin}</Mono>}
            </Box>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {[a.address, [a.city, a.pincode].filter(Boolean).join(' '), stateName(a.stateCode)].filter(Boolean).join(', ')}
            </Typography>
          </Box>
          {canEdit && (
            <>
              <Tooltip title="Edit"><IconButton size="small" aria-label={`Edit ${a.label || 'address'}`} onClick={() => setEditing({ open: true, row: a })}><EditRounded fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Remove"><IconButton size="small" aria-label={`Remove ${a.label || 'address'}`} onClick={() => setRemoving(a)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
            </>
          )}
        </Box>
      ))}
      {/* These dialogs sit inside the party dialog in React terms, so Enter here must not submit the party. */}
      <Box onKeyDown={(e) => e.stopPropagation()}>
      <AddressDialog partyId={partyId} existing={editing.row} open={editing.open} states={states.data ?? []} onClose={() => setEditing({ open: false, row: null })} onSaved={list.reload} />
      <ConfirmDialog open={!!removing} danger confirmLabel="Remove" title="Remove this address?" entityName={removing?.label ?? removing?.address ?? undefined}
        body="Invoices already made keep the address they were made with."
        onClose={() => setRemoving(null)} onConfirm={async () => { if (removing) { await removeAddress(partyId, removing.id); list.reload(); } }} />
      </Box>
    </Box>
  );
}
