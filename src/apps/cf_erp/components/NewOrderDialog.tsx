import { useEffect, useState } from 'react';
import { Autocomplete, Box, Button, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { cfApi, qs } from '../api/client';
import type { OrderType, Party, SalesOrder } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { FormDialog } from './FormDialog';
import { PartyDialog } from './PartyDialog';

/**
 * A new order: a customer order starts as an inquiry, a stock order as a
 * draft. Its number comes from the coding rule for sales orders (or is typed)
 * and never changes — the codes of everything made for it are built from it.
 */
export function NewOrderDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (o: SalesOrder) => void }) {
  const [orderType, setOrderType] = useState<OrderType>('customer');
  const [customer, setCustomer] = useState<Party | null>(null);
  const [form, setForm] = useState({ title: '', customerReference: '', committedDate: '', code: '' });
  const [creatingParty, setCreatingParty] = useState(false);
  const customers = useLoad(() => (open ? cfApi.get<Party[]>(`/parties${qs({ role: 'customer', status: 'active' })}`) : Promise.resolve([] as Party[])), [open]);
  useEffect(() => { if (open) { setOrderType('customer'); setCustomer(null); setForm({ title: '', customerReference: '', committedDate: '', code: '' }); } }, [open]);

  const save = async () => {
    const o = await cfApi.post<SalesOrder>('/orders', {
      orderType, customerId: orderType === 'customer' ? customer?.id ?? null : null,
      title: form.title || null, customerReference: form.customerReference || null, committedDate: form.committedDate || null, code: form.code || null,
    });
    onCreated(o);
  };

  return (
    <>
      <FormDialog open={open} title="New order" onClose={onClose} onSubmit={save} submitLabel="Create order" busyLabel="Creating…"
        submitDisabled={orderType === 'customer' && !customer}
        subtitle={orderType === 'customer' ? 'Starts as an inquiry. The order is the project: design its structure now, quote, then confirm.' : 'Standard products made for stock — catalog items only, no customer.'}>
        <ToggleButtonGroup exclusive size="small" value={orderType} onChange={(_, v) => v && setOrderType(v)} aria-label="Order type">
          <ToggleButton value="customer">Customer order</ToggleButton>
          <ToggleButton value="stock">Stock order</ToggleButton>
        </ToggleButtonGroup>
        {orderType === 'customer' && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Autocomplete sx={{ flex: '1 1 240px' }} options={customers.data ?? []} value={customer} onChange={(_, v) => setCustomer(v)}
              getOptionLabel={(p) => `${p.code} · ${p.name}`} isOptionEqualToValue={(a, b) => a.id === b.id} loading={customers.loading}
              renderInput={(p) => <TextField {...p} label="Customer" required autoFocus />} />
            <Button onClick={() => setCreatingParty(true)} sx={{ mt: 0.25, whiteSpace: 'nowrap' }}>New customer</Button>
          </Box>
        )}
        <TextField label={orderType === 'customer' ? 'Project title' : 'Title'} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder={orderType === 'customer' ? 'ROB at km 60' : 'Bolt stock top-up'} autoFocus={orderType === 'stock'} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          {orderType === 'customer' && <TextField label="Customer's reference" value={form.customerReference} onChange={(e) => setForm({ ...form, customerReference: e.target.value })} />}
          <TextField label="Committed date" type="date" value={form.committedDate} onChange={(e) => setForm({ ...form, committedDate: e.target.value })} InputLabelProps={{ shrink: true }} helperText="Needed before confirming" />
        </Box>
        <TextField label="Order number (optional)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
          helperText="Left empty, it takes the next number from the coding rule. It can still be changed until the first line."
          inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
      </FormDialog>
      <PartyDialog open={creatingParty} existing={null} onClose={() => setCreatingParty(false)} onSaved={(p) => { customers.reload(); setCustomer(p); }} />
    </>
  );
}
