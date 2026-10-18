import { useEffect, useRef, useState } from 'react';
import { Box, Button, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { cfApi } from '../api/client';
import type { OrderType, Party, SalesOrder } from '../api/types';
import { getNewOrderDefaults, type NewOrderDefaults } from '../api/addLine';
import { defaultsToSend, prefillWord } from '../lib/addLine';
import { FormDialog } from './FormDialog';
import { PartyDialog } from './PartyDialog';
import { PartyPicker } from './ServerPicker';
import { MaterialSupplyField } from './Purchase/MaterialSupplyField';
import { SpecField } from './OrderSpecValuesPanel';
import type { MaterialSupply } from '../api/requisitions';

/**
 * A new order: a customer order starts as an inquiry, a stock order as a
 * draft. Its number comes from the coding rule for sales orders (or is typed)
 * and never changes — the codes of everything made for it are built from it.
 *
 * A customer order also takes its ORDER VALUES here (user, 2026-10-18): the same specifications as the Structure
 * step's "Values for the whole order" panel (Setup: "Can be set for a whole order"), prefilled from the company's
 * last order (else what the templates use), saved with the order in the same request.
 */
export function NewOrderDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (o: SalesOrder) => void }) {
  const [orderType, setOrderType] = useState<OrderType>('customer');
  const [customer, setCustomer] = useState<Party | null>(null);
  const [form, setForm] = useState({ title: '', customerReference: '', committedDate: '', code: '' });
  const [creatingParty, setCreatingParty] = useState(false);
  // Who supplies the material is asked at the start (§66): "We buy" unless the customer sends it.
  const [supply, setSupply] = useState<MaterialSupply>('we_buy');
  const [defaults, setDefaults] = useState<NewOrderDefaults | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  // Also kept here at once: Enter in a number field commits it AND submits in the same key press.
  const valuesNow = useRef<Record<string, string>>({});
  const putValues = (next: Record<string, string>) => { valuesNow.current = next; setValues(next); };
  useEffect(() => {
    if (!open) return undefined;
    setOrderType('customer'); setCustomer(null); setSupply('we_buy'); setForm({ title: '', customerReference: '', committedDate: '', code: '' });
    setDefaults(null); putValues({});
    let live = true;
    getNewOrderDefaults().then((d) => {
      if (!live) return;
      setDefaults(d);
      putValues(Object.fromEntries(Object.entries(d.values).map(([k, v]) => [k, v.input])));
    }).catch(() => { /* the order can still be made; its values are set on the Structure step */ });
    return () => { live = false; };
  }, [open]);

  const save = async () => {
    const specDefaults = orderType === 'customer' ? defaultsToSend(valuesNow.current) : [];
    const o = await cfApi.post<SalesOrder>('/orders', {
      orderType, customerId: orderType === 'customer' ? customer?.id ?? null : null,
      title: form.title || null, customerReference: form.customerReference || null, committedDate: form.committedDate || null, code: form.code || null,
      ...(orderType === 'customer' ? { materialSupply: supply } : {}),
      ...(specDefaults.length ? { specDefaults } : {}),
    });
    onCreated(o);
  };
  const specs = defaults?.available ? defaults.specs : [];

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
            <PartyPicker role="customer" sx={{ flex: '1 1 240px' }} value={customer} onChange={setCustomer} autoFocus />
            <Button onClick={() => setCreatingParty(true)} sx={{ mt: 0.25, whiteSpace: 'nowrap' }}>New customer</Button>
          </Box>
        )}
        <TextField label={orderType === 'customer' ? 'Project title' : 'Title'} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder={orderType === 'customer' ? 'ROB at km 60' : 'Bolt stock top-up'} autoFocus={orderType === 'stock'} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          {orderType === 'customer' && <TextField label="Customer's reference" value={form.customerReference} onChange={(e) => setForm({ ...form, customerReference: e.target.value })} />}
          <TextField label="Committed date" type="date" value={form.committedDate} onChange={(e) => setForm({ ...form, committedDate: e.target.value })} InputLabelProps={{ shrink: true }} helperText="Needed before confirming" />
        </Box>
        {orderType === 'customer' && <MaterialSupplyField value={supply} onChange={setSupply} />}
        {orderType === 'customer' && specs.length > 0 && (
          <Box data-testid="new-order-values" sx={{ display: 'grid', gap: 1, borderTop: '1px solid var(--c-border)', pt: 1.5 }}>
            <Box>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Values for the whole order</Typography>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                {defaults?.lastOrder ? `Filled in as on ${defaults.lastOrder.code} — change what differs.` : 'Every line takes them; a row can still have its own.'}
              </Typography>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 180px), 1fr))', gap: 1.25 }}>
              {specs.map((spec) => {
                const pre = defaults?.values[spec.code];
                return (
                  <Box key={spec.code} sx={{ minWidth: 0 }}>
                    <SpecField spec={spec} label={spec.name} input={values[spec.code] ?? ''} placeholder="Not set" disabled={false}
                      testId={`new-order-value-${spec.code}`} onCommit={(t) => putValues({ ...valuesNow.current, [spec.code]: t })} />
                    {pre && values[spec.code] === pre.input && (
                      <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 0.25 }}>{prefillWord(pre.from, defaults?.lastOrder?.code ?? null)}</Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}
        <TextField label="Order number (optional)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
          helperText="Left empty, it takes the next number from the coding rule. It can still be changed until the first line."
          inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
      </FormDialog>
      <PartyDialog open={creatingParty} existing={null} onClose={() => setCreatingParty(false)} onSaved={(p) => { setCustomer(p); }} />
    </>
  );
}
