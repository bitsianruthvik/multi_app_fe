import { useEffect, useState } from 'react';
import { Box, Checkbox, FormControlLabel, FormGroup, MenuItem, TextField, Typography } from '@mui/material';
import { cfApi } from '../api/client';
import type { Party, PartyRole } from '../api/types';
import { FormDialog } from './FormDialog';

const ROLE_LABEL: Record<PartyRole, string> = { customer: 'Customer', supplier: 'Supplier', subcontractor: 'Subcontractor' };

/**
 * Creates or edits a party. One party can hold several roles — a stockist who
 * sells steel and also buys scrap is one record, not two.
 */
export function PartyDialog({ open, existing, defaultRole = 'customer', onClose, onSaved }: {
  open: boolean;
  existing: Party | null;
  defaultRole?: PartyRole;
  onClose: () => void;
  onSaved: (p: Party) => void;
}) {
  const blank = { code: '', name: '', roles: [defaultRole] as PartyRole[], contactName: '', email: '', phone: '', taxNumber: '', address: '', notes: '', status: 'active' as Party['status'] };
  const [form, setForm] = useState(blank);
  useEffect(() => {
    if (!open) return;
    setForm(existing ? {
      code: existing.code, name: existing.name, roles: existing.roles, contactName: existing.contactName ?? '', email: existing.email ?? '',
      phone: existing.phone ?? '', taxNumber: existing.taxNumber ?? '', address: existing.address ?? '', notes: existing.notes ?? '', status: existing.status,
    } : { ...blank, roles: [defaultRole] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing, defaultRole]);

  const toggleRole = (r: PartyRole) => setForm((f) => ({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] }));
  const save = async () => {
    const saved = existing ? await cfApi.put<Party>(`/parties/${existing.id}`, form) : await cfApi.post<Party>('/parties', form);
    onSaved(saved);
  };

  return (
    <FormDialog open={open} title={existing ? `Edit ${existing.name}` : `New ${ROLE_LABEL[defaultRole].toLowerCase()}`} onClose={onClose} onSubmit={save}
      submitLabel={existing ? 'Save' : 'Create'} busyLabel={existing ? 'Saving…' : 'Creating…'}
      submitDisabled={!form.code.trim() || !form.name.trim() || form.roles.length === 0}
      subtitle={existing ? undefined : 'One record can be a customer, a supplier and a subcontractor at once.'}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: '160px minmax(0, 1fr)' }, gap: 2 }}>
        <TextField label="Code" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} autoFocus={!existing} inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
        <TextField label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Box sx={{ gridColumn: '1 / -1' }}>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Roles</Typography>
          <FormGroup row>
            {(Object.keys(ROLE_LABEL) as PartyRole[]).map((r) => (
              <FormControlLabel key={r} control={<Checkbox size="small" checked={form.roles.includes(r)} onChange={() => toggleRole(r)} />} label={ROLE_LABEL[r]} />
            ))}
          </FormGroup>
          {form.roles.length === 0 && <Typography sx={{ fontSize: 12, color: 'var(--c-danger-700)' }}>Tick at least one role.</Typography>}
        </Box>
        <TextField label="Contact" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
        <TextField label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <TextField label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <TextField label="Tax number" value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} />
        <TextField label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} multiline minRows={2} sx={{ gridColumn: '1 / -1' }} />
        <TextField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} multiline sx={{ gridColumn: '1 / -1' }} />
        {existing && (
          <TextField select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Party['status'] })} helperText="Inactive parties are not offered on new orders">
            <MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem>
          </TextField>
        )}
      </Box>
    </FormDialog>
  );
}
