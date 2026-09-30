import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import KeyboardReturnRounded from '@mui/icons-material/KeyboardReturnRounded';
import { cfApi, qs } from '../api/client';
import type { MaterialReconciliation, ReconItem } from '../api/money';
import type { MasterRecord, Resolution, SalesOrder, StockRow, StockingArea } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { qtyText } from '../lib/inventory';
import { kgText, qtyKgText } from '../lib/money';
import { DataTable, type DataColumn } from './DataTable';
import { FormDialog } from './FormDialog';
import { RecordPicker } from './RecordPicker';
import { SpecValueInput } from './SpecValueInput';
import { useToast } from './toastContext';
import { EmptyState, ErrorNotice, Mono, SectionCard, SkeletonRows, StatStrip } from './ui';

const EPS = 1e-6;

/** Booking in material the customer sent for this order. It becomes a lot that is theirs; it costs us nothing. */
function ReceiveMaterialDialog({ order, open, onClose, onDone }: { order: SalesOrder; open: boolean; onClose: () => void; onDone: () => void }) {
  const areas = useLoad(() => cfApi.get<StockingArea[]>('/stocking-areas'), []);
  const usable = useMemo(() => (areas.data ?? []).filter((a) => a.status === 'active' && a.purpose !== 'quarantine'), [areas.data]);
  const [item, setItem] = useState<MasterRecord | null>(null);
  const [quantity, setQuantity] = useState('');
  const [plateNo, setPlateNo] = useState('');
  const [areaId, setAreaId] = useState('');
  const [value, setValue] = useState('');
  const [reference, setReference] = useState('');
  const [values, setValues] = useState<Record<number, string>>({});
  useEffect(() => { if (open) { setItem(null); setQuantity(''); setPlateNo(''); setValue(''); setReference(''); setValues({}); } }, [open]);
  useEffect(() => { setAreaId((a) => a || String(usable[0]?.id ?? '')); }, [usable]);
  const itemId = item?.id ?? null;
  const template = useLoad(() => (itemId ? cfApi.get<Resolution>(`/items/${itemId}/batch-template`).catch(() => null) : Promise.resolve(null)), [itemId]);
  const fields = (template.data?.specs ?? []).filter((s) => s.applicable && s.rule.valueRule === 'entered');
  const needed = new Set((template.data?.missingRequired ?? []).map((m) => m.code));
  const missing = fields.filter((s) => needed.has(s.spec.code) && !String(values[s.spec.id] ?? '').trim());
  const qty = Number(quantity);
  const blocked = !item ? 'Choose the item.'
    : !quantity.trim() || !Number.isFinite(qty) || qty <= 0 ? 'Type how much arrived.'
      : !areaId ? 'Say which area it went into.'
        : missing.length ? `${missing.map((s) => s.spec.name).join(', ')} ${missing.length === 1 ? 'is' : 'are'} required.` : null;
  const save = async () => {
    await cfApi.post('/customer-material/receive', {
      orderId: order.id, toAreaId: Number(areaId), reference: reference || null,
      lines: [{
        itemId: item?.id, quantity,
        batch: { supplierRef: plateNo || null, values: Object.entries(values).filter(([, v]) => v !== '').map(([id, v]) => ({ specificationId: Number(id), value: v })) },
        ...(value.trim() ? { unitCost: value.trim() } : {}),
      }],
    });
    onDone();
  };
  return (
    <FormDialog open={open} title="Receive customer material" onClose={onClose} onSubmit={save} submitLabel="Receive" maxWidth="sm" submitDisabled={!!blocked}
      subtitle={`Material ${order.customer?.name ?? 'the customer'} sent for ${order.code}. It is theirs: it stays apart from our stock and costs us nothing.`}>
      <RecordPicker kinds={['catalog']} value={item} onChange={setItem} label="Item" activeOnly autoFocus helperText="What arrived — for example the plate" />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField label="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }}
          helperText={item?.item?.uom ? `In ${item.item.uom}` : ' '} />
        <TextField label="Batch / plate number" value={plateNo} onChange={(e) => setPlateNo(e.target.value)} helperText="As the customer marked it" />
        <TextField select label="Into" value={areaId} onChange={(e) => setAreaId(e.target.value)} helperText={usable.length ? 'Where it was put' : 'No storage area is set up yet.'}>
          {usable.map((a) => <MenuItem key={a.id} value={String(a.id)}>{a.code} · {a.name}</MenuItem>)}
        </TextField>
        <TextField label="Reference value per unit (₹, optional)" value={value} onChange={(e) => setValue(e.target.value)} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }}
          helperText="For the record only — never counted as our stock value" />
      </Box>
      {fields.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
          {fields.map((s) => (
            <SpecValueInput key={s.spec.id} dataType={s.spec.dataType} unit={s.spec.unit} options={s.options} label={`${s.spec.name}${needed.has(s.spec.code) ? ' *' : ''}`}
              value={values[s.spec.id] ?? ''} onChange={(v) => setValues((prev) => ({ ...prev, [s.spec.id]: v }))} />
          ))}
        </Box>
      )}
      <TextField label="Their delivery note (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
      {blocked && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{blocked}</Typography>}
    </FormDialog>
  );
}

/** Giving material back: offcut pieces, scrap by weight, and whole lots of theirs. */
function ReturnDialog({ order, recon, open, onClose, onDone }: { order: SalesOrder; recon: MaterialReconciliation; open: boolean; onClose: () => void; onDone: () => void }) {
  const customerId = recon.customer.id;
  const lots = useLoad(() => (open ? cfApi.get<StockRow[]>(`/stock${qs({ owner: customerId })}`) : Promise.resolve([] as StockRow[])), [open, customerId]);
  const mine = useMemo(() => (lots.data ?? []).filter((r) => r.batch && (!r.owner?.order || r.owner.order.code === order.code)), [lots.data, order.code]);
  const [offcuts, setOffcuts] = useState<Set<number>>(new Set());
  const [scrap, setScrap] = useState('');
  const [picked, setPicked] = useState<Record<string, string>>({});   // "area-item-batch" -> quantity typed
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) { setOffcuts(new Set()); setScrap(''); setPicked({}); setReason(''); } }, [open]);
  const key = (r: StockRow) => `${r.area.id}-${r.item.id}-${r.batch!.id}`;
  const scrapKg = Number(scrap);
  const lines = mine.filter((r) => picked[key(r)] !== undefined).map((r) => ({ r, q: Number(picked[key(r)]) }));
  const badLine = lines.find(({ r, q }) => !Number.isFinite(q) || q <= 0 || q > r.quantity + EPS);
  const anything = offcuts.size > 0 || (scrap.trim() !== '' && scrapKg > 0) || lines.length > 0;
  const blocked = !anything ? 'Choose what goes back.'
    : scrap.trim() !== '' && !(scrapKg > 0) ? 'The scrap weight is kilograms above zero.'
      : badLine ? `Check the quantity of ${badLine.r.item.code ?? badLine.r.item.name} — it is more than is here, or not a number.` : null;
  const save = async () => {
    await cfApi.post('/customer-material/return', {
      orderId: order.id,
      ...(offcuts.size ? { offcutIds: [...offcuts] } : {}),
      ...(scrap.trim() ? { scrapKg: scrapKg } : {}),
      ...(lines.length ? { lines: lines.map(({ r, q }) => ({ itemId: r.item.id, batchId: r.batch!.id, quantity: q, fromAreaId: r.area.id })) } : {}),
      reason: reason || undefined,
    });
    onDone();
  };
  const list = recon.offcuts.list;
  return (
    <FormDialog open={open} title="Return to customer" onClose={onClose} onSubmit={save} submitLabel="Return" maxWidth="md" submitDisabled={!!blocked}
      subtitle={`Give ${recon.customer.name ?? 'the customer'} their material back. Offcuts go back as the actual pieces, scrap by weight.`}>
      <ErrorNotice error={lots.error} onRetry={lots.reload} />
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>Offcut pieces</Typography>
        {list.length === 0 ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No offcuts of theirs are waiting here.</Typography> : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, columnGap: 2 }}>
            {list.map((o) => (
              <FormControlLabel key={o.id} sx={{ m: 0 }} control={<Checkbox size="small" checked={offcuts.has(o.id)}
                onChange={(_, on) => setOffcuts((prev) => { const n = new Set(prev); if (on) n.add(o.id); else n.delete(o.id); return n; })} />}
              label={<Box component="span" sx={{ fontSize: 13 }}><Mono>{o.offcutNo}</Mono> <Mono muted>line {o.lineNo}{o.thicknessMm != null ? ` · ${o.thicknessMm} mm` : ''}{o.weightKg != null ? ` · ${kgText(o.weightKg)}` : ''}</Mono></Box>} />
            ))}
            <Box sx={{ gridColumn: '1 / -1' }}>
              <Button size="small" onClick={() => setOffcuts(offcuts.size === list.length ? new Set() : new Set(list.map((o) => o.id)))}>{offcuts.size === list.length ? 'Clear' : 'Select all'}</Button>
            </Box>
          </Box>
        )}
      </Box>
      <TextField label="Scrap handed back (kg)" value={scrap} onChange={(e) => setScrap(e.target.value)} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }}
        helperText={`Scrap with us now: ${kgText(Math.max(0, recon.scrap.withUsKg))}`} sx={{ maxWidth: 280 }} />
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>Their lots on our shelves</Typography>
        {mine.length === 0 ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>{lots.loading ? 'Loading…' : 'None of their lots are on our shelves.'}</Typography> : (
          <Box sx={{ display: 'grid', gap: 0.5 }}>
            {mine.map((r) => {
              const k = key(r);
              const on = picked[k] !== undefined;
              return (
                <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <FormControlLabel sx={{ m: 0, flex: '1 1 280px' }} control={<Checkbox size="small" checked={on}
                    onChange={(_, yes) => setPicked((prev) => { const n = { ...prev }; if (yes) n[k] = String(r.quantity); else delete n[k]; return n; })} />}
                  label={<Box component="span" sx={{ fontSize: 13 }}><Mono>{r.item.code ?? r.item.name}</Mono> <Mono muted>{r.batch!.code} · {r.area.code} · {qtyText(r.quantity)} {r.item.uom} here</Mono></Box>} />
                  {on && <TextField size="small" label="Quantity" value={picked[k]} onChange={(e) => setPicked((prev) => ({ ...prev, [k]: e.target.value }))}
                    inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)', width: 80 } }} />}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
      <TextField label="Note (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      {blocked && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{blocked}</Typography>}
    </FormDialog>
  );
}

/**
 * The customer's material on this order: what they gave us, what went into the
 * job, and what goes back. Plain columns — received, used, scrapped, returned,
 * with us — each a quantity and, where the item has a weight, kilograms.
 * Offcuts and scrap are order-level and sit beneath.
 */
export function CustomerMaterialPanel({ order }: { order: SalesOrder }) {
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const recon = useLoad(() => cfApi.get<MaterialReconciliation>(`/orders/${order.id}/material-reconciliation`), [order.id]);
  const [receiving, setReceiving] = useState(false);
  const [returning, setReturning] = useState(false);
  const r = recon.data;
  const name = order.customer?.name ?? 'the customer';

  const columns: DataColumn<ReconItem>[] = [
    { key: 'item', header: 'Item', alwaysVisible: true, sortValue: (i) => i.item.code ?? i.item.name, render: (i) => <Box sx={{ py: 0.5 }}><Mono>{i.item.code ?? '—'}</Mono><Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{i.item.name}</Typography></Box> },
    ...([['received', 'Received'], ['issued', 'Used'], ['scrapped', 'Scrapped'], ['returned', 'Returned'], ['withUs', 'With us']] as const).map(([k, header]) => ({
      key: k, header, numeric: true, alwaysVisible: true, sortValue: (i: ReconItem) => i[k].qty,
      render: (i: ReconItem) => (i[k].qty === 0 ? <Mono muted>—</Mono> : <Mono>{qtyKgText(i[k], i.uom)}</Mono>),
    })),
  ];

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      <SectionCard title="Customer material" subtitle={`What ${name} sent for this order. It is theirs — it is not in our stock value and costs us nothing.`}
        actions={canManage && (
          <>
            <Button variant="contained" startIcon={<AddRounded />} onClick={() => setReceiving(true)}>Receive material</Button>
            <Button variant="outlined" startIcon={<KeyboardReturnRounded />} onClick={() => setReturning(true)} disabled={!r}>Return to customer</Button>
          </>
        )}>
        <ErrorNotice error={recon.error} onRetry={recon.reload} />
        {!r && !recon.error && <SkeletonRows rows={3} />}
        {r && (
          <>
            <StatStrip stats={[
              { label: 'Received', value: r.totals.receivedKg, display: kgText(r.totals.receivedKg) },
              { label: 'Used', value: r.totals.issuedKg, display: kgText(r.totals.issuedKg) },
              { label: 'With us', value: r.totals.withUsKg, display: kgText(r.totals.withUsKg), hint: 'Their stock still on our shelves' },
              { label: 'Owed back', value: r.totals.owedBackKg, display: kgText(r.totals.owedBackKg), tone: r.totals.owedBackKg > 0 ? 'warning' : undefined, hint: 'Offcuts and scrap still with us' },
            ]} />
            {r.totals.unweighedItems > 0 && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: -1.5, mb: 1.5 }}>{r.totals.unweighedItems} item{r.totals.unweighedItems === 1 ? ' has' : 's have'} no weight, so kilograms cover the rest.</Typography>}
          </>
        )}
      </SectionCard>
      {r && (
        <>
          <SectionCard flush title="By item" subtitle="Received less used, scrapped and returned is what is still with us.">
            <DataTable bare rows={r.items} columns={columns} getRowId={(i) => i.item.id}
              empty={<EmptyState title="Nothing received yet" hint={canManage ? 'Use Receive material when their steel arrives.' : 'No customer material has been booked in for this order.'} />} />
          </SectionCard>
          <SectionCard title="Offcuts and scrap" subtitle="Offcuts from their plates go back as the pieces; scrap goes back by weight.">
            <Box data-testid="offcuts-scrap" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 3, fontSize: 13.5 }}>
              <Box>
                <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--c-text-3)', mb: 0.5 }}>Offcuts</Typography>
                <Box>Cut from their plates: <Mono>{r.offcuts.total.count}</Mono> <Mono muted>({kgText(r.offcuts.total.kg)})</Mono></Box>
                <Box>With us: <Mono>{r.offcuts.withUs.count}</Mono> <Mono muted>({kgText(r.offcuts.withUs.kg)})</Mono></Box>
                <Box>Used again: <Mono>{r.offcuts.used.count}</Mono> · Returned: <Mono>{r.offcuts.returned.count}</Mono> <Mono muted>({kgText(r.offcuts.returned.kg)})</Mono></Box>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--c-text-3)', mb: 0.5 }}>Scrap</Typography>
                <Box>From their plates&rsquo; nests: <Mono>{kgText(r.scrap.fromNestsKg)}</Mono></Box>
                <Box>Scrapped from stock: <Mono>{kgText(r.scrap.scrappedStockKg)}</Mono></Box>
                <Box>Returned: <Mono>{kgText(r.scrap.returnedKg)}</Mono> · With us: <Mono>{kgText(Math.max(0, r.scrap.withUsKg))}</Mono></Box>
              </Box>
            </Box>
          </SectionCard>
          <ReturnDialog order={order} recon={r} open={returning} onClose={() => setReturning(false)}
            onDone={() => { toast.success('Returned to the customer.'); recon.reload(); }} />
        </>
      )}
      <ReceiveMaterialDialog order={order} open={receiving} onClose={() => setReceiving(false)} onDone={() => { toast.success('Customer material received.'); recon.reload(); }} />
    </Box>
  );
}
