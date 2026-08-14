/**
 * Suppliers.tsx — who we buy from.
 *
 * There was no supplier anywhere in this system until now: material arrived
 * through stock-in with "no purchase order, no supplier, no receipt document".
 * That was fine while receiving was the only thing being recorded. A purchase
 * order has to be addressed to somebody, so this is the smallest list that
 * makes one sendable.
 *
 * Lead time is the field worth filling in. It is the only thing that can answer
 * "will this arrive before we need it", which is the question a required date
 * exists to ask.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, Switch, TextField, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';

import { fabQuery, fabMutate } from '../api/client';
import { usePermission } from '@core/hooks/usePermission';
import {
  PageHeader, Surface, Mono, EmptyState, ListSkeleton, useToast, DataTable,
  ConfirmDialog, backendMessage,
} from '../components';

interface Supplier {
  id: number;
  code: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  paymentTerms?: string | null;
  leadTimeDays?: number | null;
  currency?: string | null;
  active: number;
  notes?: string | null;
}

const blank = () => ({
  id: 0, code: '', name: '', contactName: '', email: '', phone: '',
  paymentTerms: '', leadTime: '', currency: '', active: 1, notes: '',
});

export default function Suppliers() {
  const canManage = usePermission('fab_erp_inventory_manage');
  const { toast } = useToast();
  const [rows, setRows] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<ReturnType<typeof blank> | null>(null);
  const [del, setDel] = useState<Supplier | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fabQuery<{ data: Supplier[] }>('fabErpSupplier', {
        orderBy: [{ field: 'name', direction: 'asc' }],
        pagination: { limit: 500 },
      });
      setRows(r.data ?? []);
    } catch (e) {
      setError(backendMessage(e, 'Could not load suppliers.'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!edit || !edit.name.trim() || !edit.code.trim()) return;
    const code = edit.code.trim().toUpperCase();
    const clash = rows.find((r) => r.id !== edit.id && r.code.toUpperCase() === code);
    if (clash) { setError(`${code} is already used by ${clash.name}.`); return; }

    const payload = {
      code,
      name: edit.name.trim(),
      contact_name: edit.contactName.trim() || null,
      email: edit.email.trim() || null,
      phone: edit.phone.trim() || null,
      payment_terms: edit.paymentTerms.trim() || null,
      lead_time_days: edit.leadTime.trim() ? Number(edit.leadTime) : null,
      currency: edit.currency.trim().toUpperCase() || null,
      active: edit.active,
      notes: edit.notes.trim() || null,
    };
    try {
      if (edit.id) await fabMutate('fabErpSupplier', 'update', { id: edit.id, ...payload });
      else await fabMutate('fabErpSupplier', 'insert', payload);
      setEdit(null); await load();
      toast(edit.id ? 'Supplier updated' : 'Supplier added');
    } catch (e) {
      setError(backendMessage(e, 'Could not save that supplier.'));
    }
  }

  async function remove(row: Supplier) {
    try {
      await fabMutate('fabErpSupplier', 'delete', { id: row.id });
      setDel(null); await load(); toast('Supplier removed');
    } catch (e) {
      setError(backendMessage(e, 'Could not remove that supplier.'));
    }
  }

  const leadBad = !!edit && edit.leadTime.trim() !== '' && !(Number(edit.leadTime) >= 0);

  return (
    <Box>
      <PageHeader
        title="Suppliers"
        subtitle="Who purchase orders are addressed to. Lead time is what tells you whether an order will arrive in time."
        actions={canManage ? (
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setEdit(blank())}>
            Add supplier
          </Button>
        ) : undefined}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? <ListSkeleton rows={5} /> : rows.length === 0 ? (
        <EmptyState
          icon={<LocalShippingRounded />}
          title="No suppliers yet"
          hint="Add the mills and stockists you buy from — a purchase order cannot be raised without one."
        />
      ) : (
        <Surface e={1} sx={{ p: 0 }}>
          <DataTable
            rows={rows}
            getRowId={(r) => r.id}
            storageKey="suppliers"
            exportName="suppliers"
            defaultSortKey="name"
            columns={[
              { key: 'code', header: 'Code', width: 120, render: (r) => <Mono chip>{r.code}</Mono>, sortValue: (r) => r.code },
              { key: 'name', header: 'Name', render: (r) => r.name, sortValue: (r) => r.name },
              { key: 'contactName', header: 'Contact', width: 160, render: (r) => r.contactName ?? '—', sortValue: (r) => r.contactName ?? '' },
              { key: 'email', header: 'Email', width: 200, render: (r) => r.email ?? '—', sortValue: (r) => r.email ?? '' },
              {
                key: 'leadTimeDays', header: 'Lead time', width: 110, numeric: true,
                render: (r) => (r.leadTimeDays != null ? `${r.leadTimeDays} d` : '—'),
                sortValue: (r) => r.leadTimeDays ?? null,
              },
              { key: 'active', header: 'Active', width: 90, render: (r) => (r.active ? 'Yes' : 'No'), sortValue: (r) => r.active },
            ]}
            rowActions={canManage ? (r) => (
              <>
                <Tooltip title="Edit">
                  <IconButton size="small" aria-label={`Edit ${r.name}`} onClick={() => setEdit({
                    id: r.id, code: r.code, name: r.name,
                    contactName: r.contactName ?? '', email: r.email ?? '', phone: r.phone ?? '',
                    paymentTerms: r.paymentTerms ?? '',
                    leadTime: r.leadTimeDays != null ? String(r.leadTimeDays) : '',
                    currency: r.currency ?? '', active: r.active, notes: r.notes ?? '',
                  })}>
                    <EditRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Remove">
                  <IconButton size="small" color="error" aria-label={`Remove ${r.name}`} onClick={() => setDel(r)}>
                    <DeleteOutlineRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            ) : undefined}
          />
        </Surface>
      )}

      <Dialog open={!!edit} onClose={() => setEdit(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>{edit?.id ? 'Edit supplier' : 'Add supplier'}</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField size="small" label="Code *" value={edit?.code ?? ''} sx={{ width: 150 }}
              slotProps={{ htmlInput: { style: { textTransform: 'uppercase' }, maxLength: 60 } }}
              onChange={(e) => setEdit((v) => (v ? { ...v, code: e.target.value } : v))} />
            <TextField size="small" label="Name *" value={edit?.name ?? ''} sx={{ flex: 1 }}
              onChange={(e) => setEdit((v) => (v ? { ...v, name: e.target.value } : v))} />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField size="small" label="Contact" value={edit?.contactName ?? ''} sx={{ flex: 1 }}
              onChange={(e) => setEdit((v) => (v ? { ...v, contactName: e.target.value } : v))} />
            <TextField size="small" label="Phone" value={edit?.phone ?? ''} sx={{ width: 160 }}
              onChange={(e) => setEdit((v) => (v ? { ...v, phone: e.target.value } : v))} />
          </Box>
          <TextField size="small" label="Email" value={edit?.email ?? ''}
            onChange={(e) => setEdit((v) => (v ? { ...v, email: e.target.value } : v))} />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField size="small" type="number" label="Lead time (days)" value={edit?.leadTime ?? ''} sx={{ width: 150 }}
              error={leadBad} helperText={leadBad ? 'Days, not negative' : 'Working days to delivery'}
              onChange={(e) => setEdit((v) => (v ? { ...v, leadTime: e.target.value } : v))} />
            <TextField size="small" label="Currency" value={edit?.currency ?? ''} sx={{ width: 120 }}
              slotProps={{ htmlInput: { style: { textTransform: 'uppercase' }, maxLength: 10 } }}
              onChange={(e) => setEdit((v) => (v ? { ...v, currency: e.target.value } : v))} />
            <TextField size="small" label="Payment terms" value={edit?.paymentTerms ?? ''} sx={{ flex: 1 }}
              onChange={(e) => setEdit((v) => (v ? { ...v, paymentTerms: e.target.value } : v))} />
          </Box>
          <TextField size="small" label="Notes" value={edit?.notes ?? ''} multiline minRows={2}
            onChange={(e) => setEdit((v) => (v ? { ...v, notes: e.target.value } : v))} />
          <FormControlLabel
            control={<Switch checked={!!edit?.active}
              onChange={(e) => setEdit((v) => (v ? { ...v, active: e.target.checked ? 1 : 0 } : v))} />}
            label="Active"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEdit(null)}>Cancel</Button>
          <Button variant="contained" onClick={save}
            disabled={!edit?.name.trim() || !edit?.code.trim() || leadBad}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!del}
        title="Remove supplier"
        body={`Remove ${del?.name ?? ''}? Purchase orders already raised to them keep their record — only new ones are affected.`}
        confirmLabel="Remove"
        onClose={() => setDel(null)}
        onConfirm={() => { if (del) remove(del); }}
      />
    </Box>
  );
}
