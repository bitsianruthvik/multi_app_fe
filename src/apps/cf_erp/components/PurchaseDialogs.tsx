import { useEffect, useMemo, useState } from 'react';
import { Box, Button, IconButton, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { cfApi, qs } from '../api/client';
import type { Batch, MasterRecord, Party, PurchaseLine, PurchaseOrder, Resolution, SalesOrder, StockingArea } from '../api/types';
import { setLineOrders, type HeldReceipt } from '../api/procurement';
import { useLoad } from '../hooks/useLoad';
import { qtyText } from '../lib/inventory';
import type { ItemPrices } from '../api/money';
import { dayText, priceText } from '../lib/money';
import { FormDialog } from './FormDialog';
import { OrderPicker, PartyPicker } from './ServerPicker';
import { RecordPicker } from './RecordPicker';
import { SpecValueInput } from './SpecValueInput';
import { ErrorNotice, Mono } from './ui';

/** A sales order as the pickers hold it, built from the {id, code} a purchase order carries. */
const asOrder = (o: { id: number; code: string } | null | undefined): SalesOrder | null => (o ? ({ id: o.id, code: o.code, title: null, customer: null } as unknown as SalesOrder) : null);

/** Raising one by hand — the buy list raises its own. */
export function NewPurchaseDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (p: PurchaseOrder) => void }) {
  const [code, setCode] = useState('');
  const [supplier, setSupplier] = useState<Party | null>(null);
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [forOrder, setForOrder] = useState<SalesOrder | null>(null);
  useEffect(() => { if (open) { setCode(''); setSupplier(null); setExpectedDate(''); setNotes(''); setForOrder(null); } }, [open]);
  const save = async () => onCreated(await cfApi.post<PurchaseOrder>('/purchase-orders', {
    code: code || null, supplierId: supplier?.id ?? null, expectedDate: expectedDate || null, notes: notes || null, forOrderId: forOrder?.id ?? null,
  }));
  return (
    <FormDialog open={open} title="New purchase order" onClose={onClose} onSubmit={save} submitLabel="Create" maxWidth="sm"
      subtitle="It starts as a draft: add its lines, then send it to the supplier.">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField label="Number" value={code} onChange={(e) => setCode(e.target.value)} helperText="Leave empty for the next number"
          inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
        <PartyPicker role="supplier" value={supplier} onChange={setSupplier} helperText="Can be named later, before it is sent" />
        <TextField label="Expected" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        <OrderPicker openOnly={false} label="For sales order (optional)" value={forOrder} onChange={setForOrder}
          helperText="Material that arrives is held for this order. Each line can still name another." />
        <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Box>
    </FormDialog>
  );
}

/** Changing the sales order a purchase order is bought for — only the default for lines added afterwards. */
export function PurchaseForOrderDialog({ order, onClose, onSaved }: { order: PurchaseOrder | null; onClose: () => void; onSaved: (p: PurchaseOrder) => void }) {
  const [forOrder, setForOrder] = useState<SalesOrder | null>(null);
  useEffect(() => { if (order) setForOrder(asOrder(order.forOrder)); }, [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => { if (order) onSaved(await cfApi.put<PurchaseOrder>(`/purchase-orders/${order.id}`, { forOrderId: forOrder?.id ?? null })); };
  return (
    <FormDialog open={!!order} title="For sales order" onClose={onClose} onSubmit={save} submitLabel="Save" maxWidth="xs"
      subtitle="Only the default for lines added from now on. Lines already on the order keep what they are bought for — change those on the line.">
      <OrderPicker openOnly={false} label="For sales order" value={forOrder} onChange={setForOrder} helperText="Empty = not bought for any order" />
    </FormDialog>
  );
}

/** Naming the supplier and sending it: draft goes to ordered. */
export function SendPurchaseDialog({ order, onClose, onSent }: { order: PurchaseOrder | null; onClose: () => void; onSent: (p: PurchaseOrder) => void }) {
  const [supplier, setSupplier] = useState<Party | null>(null);
  useEffect(() => { if (order) setSupplier(order.supplier ? ({ id: order.supplier.id, code: order.supplier.code ?? '', name: order.supplier.name } as Party) : null); }, [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => { if (order) onSent(await cfApi.post<PurchaseOrder>(`/purchase-orders/${order.id}/order`, { supplierId: supplier?.id ?? null })); };
  return (
    <FormDialog open={!!order} title="Send to the supplier" onClose={onClose} onSubmit={save} submitLabel="Send" maxWidth="xs" submitDisabled={!supplier}
      subtitle={order ? `${order.code} — ${order.lines.length} ${order.lines.length === 1 ? 'line' : 'lines'}. Once sent, deliveries can be booked against it.` : undefined}>
      <PartyPicker role="supplier" value={supplier} onChange={setSupplier} autoFocus helperText="A purchase order addressed to nobody cannot be sent" />
    </FormDialog>
  );
}

/** Adding a line by hand. Asking for an item already on the order adds to its line. */
export function AddPurchaseLineDialog({ orderId, forOrder, onClose, onAdded }: { orderId: number | null; forOrder?: { id: number; code: string } | null; onClose: () => void; onAdded: (p: PurchaseOrder) => void }) {
  const [lineOrder, setLineOrder] = useState<SalesOrder | null>(null);
  const [item, setItem] = useState<MasterRecord | null>(null);
  const [quantity, setQuantity] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [note, setNote] = useState('');
  const [price, setPrice] = useState('');
  useEffect(() => { if (orderId) { setItem(null); setQuantity(''); setExpectedDate(''); setNote(''); setPrice(''); setLineOrder(asOrder(forOrder)); } }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps
  // What we last paid for this item, as a yardstick beside the price.
  const itemId = item?.id ?? null;
  const paid = useLoad(() => (itemId ? cfApi.get<ItemPrices>(`/records/${itemId}/prices`).catch(() => null) : Promise.resolve(null)), [itemId]);
  const last = paid.data?.lastPurchasePrice != null ? paid.data : null;
  const save = async () => {
    if (!orderId) return;
    onAdded(await cfApi.post<PurchaseOrder>(`/purchase-orders/${orderId}/lines`, {
      itemId: item?.id, quantity, expectedDate: expectedDate || null, note: note || null,
      // Always sent: clearing the picker means this line is bought for no order.
      orderId: lineOrder?.id ?? null,
      // Empty = the last price paid, which the backend fills in.
      ...(price.trim() ? { unitPrice: price.trim() } : {}),
    }));
  };
  return (
    <FormDialog open={!!orderId} title="Add a line" onClose={onClose} onSubmit={save} submitLabel="Add" maxWidth="sm" submitDisabled={!item || !quantity}>
      <RecordPicker kinds={['catalog']} value={item} onChange={setItem} label="Item" activeOnly autoFocus helperText="What is being bought" />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField label="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)}
          helperText={item?.item?.uom ? `In ${item.item.uom}` : ' '} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }} />
        <TextField label="Expected" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} InputLabelProps={{ shrink: true }} />
      </Box>
      <TextField label="Price per unit (₹, before tax)" value={price} onChange={(e) => setPrice(e.target.value)} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }}
        helperText={last
          ? <>Empty = the last price paid: {priceText(last.lastPurchasePrice)} ({[last.lastPurchaseSupplier?.name, dayText(last.lastPurchaseDate)].filter(Boolean).join(', ')}).{' '}
            <Box component="a" role="button" tabIndex={0} onClick={() => setPrice(String(last.lastPurchasePrice))} sx={{ cursor: 'pointer', color: 'var(--c-primary-700)' }}>Use it</Box></>
          : item ? 'Never bought before — no last price. Leave empty to price it later.' : ' '} />
      <OrderPicker openOnly={false} label="Bought for sales order (optional)" value={lineOrder} onChange={setLineOrder}
        helperText={forOrder ? `Starts as the order's ${forOrder.code}. Change or clear it for this line.` : 'What arrives is held for this order.'} />
      <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
    </FormDialog>
  );
}

const EPS = 1e-6;

/** Booking a delivery against one line — an ordinary stock receipt underneath. */
export function ReceiveLineDialog({ line, orderCode, onClose, onReceived }: {
  line: PurchaseLine | null; orderCode: string | null; onClose: () => void; onReceived: (p: PurchaseOrder, held: HeldReceipt[]) => void;
}) {
  const areas = useLoad(() => cfApi.get<StockingArea[]>('/stocking-areas'), []);
  const usable = useMemo(() => (areas.data ?? []).filter((a) => a.status === 'active' && a.purpose !== 'quarantine'), [areas.data]);
  const [quantity, setQuantity] = useState('');
  const [areaId, setAreaId] = useState('');
  const [supplierRef, setSupplierRef] = useState('');
  const [reference, setReference] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [batchId, setBatchId] = useState('');
  const [values, setValues] = useState<Record<number, string>>({});
  const byBatch = line?.item.trackedBy === 'batch';
  const itemId = line?.item.id ?? null;
  // A batch-kept item starts a batch here, and its batch values (the heat
  // number) are asked for exactly as the Stock in screen asks for them.
  const template = useLoad(() => (byBatch && itemId ? cfApi.get<Resolution>(`/items/${itemId}/batch-template`) : Promise.resolve(null)), [itemId, byBatch]);
  const batches = useLoad(() => (byBatch && itemId ? cfApi.get<Batch[]>(`/batches${qs({ itemId })}`) : Promise.resolve([] as Batch[])), [itemId, byBatch]);
  const fields = (template.data?.specs ?? []).filter((s) => s.applicable && s.rule.valueRule === 'entered');
  const openBatches = (batches.data ?? []).filter((b) => b.status !== 'rejected');

  // Opening it for a line starts a fresh delivery; the area is only defaulted,
  // so a reload of the areas list never wipes what has been typed.
  useEffect(() => {
    if (!line) return;
    setQuantity(String(line.outstanding)); setSupplierRef(''); setReference('');
    setUnitCost(line.unitPrice == null ? '' : String(line.unitPrice));
    setMode('new'); setBatchId(''); setValues({});
  }, [line?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setAreaId((a) => a || String(usable[0]?.id ?? '')); }, [usable]);

  // What the backend would refuse, said here instead of after a round trip.
  // `missingRequired` is the server's own answer to "what would a blank batch
  // of this item still be missing" — so this never blocks a receipt it would
  // have accepted, and only counts fields there is somewhere to type.
  const qty = Number(quantity);
  const left = line?.outstanding ?? 0;
  const newBatch = byBatch && mode === 'new';
  const stillNeeded = new Set((template.data?.missingRequired ?? []).map((m) => m.code));
  const missing = newBatch ? fields.filter((s) => stillNeeded.has(s.spec.code) && !String(values[s.spec.id] ?? '').trim()) : [];
  const waitingForTemplate = newBatch && template.loading && !template.data;
  const blocked = !line ? 'Nothing to receive.'
    : !quantity.trim() || !Number.isFinite(qty) || qty <= 0 ? 'Type how much arrived.'
      : qty > left + EPS ? `Only ${qtyText(left)} ${line.item.uom} of this line is still outstanding.`
        : !areaId ? 'Say which area it went into.'
          : waitingForTemplate ? 'Checking what this item records per batch…'
            : newBatch && template.error ? 'What this item records per batch could not be loaded — try again.'
              : byBatch && mode === 'existing' && !batchId ? 'Choose the batch it is being added to.'
                : missing.length ? `${missing.map((s) => s.spec.name).join(', ')} ${missing.length === 1 ? 'is' : 'are'} required for a new batch.`
                  : null;

  const save = async () => {
    if (!line) return;
    const batch = mode === 'existing'
      ? undefined
      : { supplierRef: supplierRef || null, values: Object.entries(values).filter(([, v]) => v !== '').map(([id, v]) => ({ specificationId: Number(id), value: v })) };
    const r = await cfApi.post<{ order: PurchaseOrder; held?: HeldReceipt[] }>(`/purchase-lines/${line.id}/receive`, {
      quantity, stockingAreaId: areaId, reference: reference || null,
      // Prefilled from the line's price; typed over if the invoice says otherwise. Empty = the line's price, or not costed.
      ...(unitCost.trim() ? { unitCost: unitCost.trim() } : {}),
      batchId: byBatch && mode === 'existing' ? Number(batchId) : undefined,
      batch: byBatch && mode === 'new' ? batch : undefined,
    });
    onReceived(r.order, r.held ?? []);
  };
  return (
    <FormDialog open={!!line} title="Book a delivery" onClose={onClose} onSubmit={save} submitLabel="Receive" maxWidth="sm" submitDisabled={!!blocked}
      subtitle={line ? <>{orderCode} · {line.item.code && <><Mono>{line.item.code}</Mono> </>}{line.item.name} — {qtyText(left)} {line.item.uom} outstanding of {qtyText(line.quantity)}.</> : undefined}>
      <ErrorNotice error={areas.error} onRetry={areas.reload} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField label="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus error={!!quantity.trim() && (!Number.isFinite(qty) || qty <= 0 || qty > left + EPS)}
          helperText={line ? `${qtyText(left)} ${line.item.uom} still expected` : ' '} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }} />
        <TextField select label="Into" value={areaId} onChange={(e) => setAreaId(e.target.value)}
          helperText={usable.length ? 'Where it was put' : 'No storage area is set up to receive into yet.'}>
          {usable.map((a) => <MenuItem key={a.id} value={String(a.id)}>{a.code} · {a.name}</MenuItem>)}
        </TextField>
        <TextField label="Delivery note" value={reference} onChange={(e) => setReference(e.target.value)} helperText="The supplier document number" />
        <TextField label="Unit cost (₹)" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }}
          helperText={line?.unitPrice != null ? `The line's price is ${priceText(line.unitPrice)}. Change it if the invoice differs.` : 'The line has no price — empty books it as not costed.'} />
      </Box>
      {byBatch && (
        <Box sx={{ pl: 1.5, borderLeft: '2px solid var(--c-primary-200)', display: 'grid', gap: 1.5 }}>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>This item is kept by batch — say which batch arrived.</Typography>
          <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v) => v && setMode(v)} aria-label="Batch">
            <ToggleButton value="new">New batch</ToggleButton>
            <ToggleButton value="existing" disabled={!openBatches.length}>Add to a batch</ToggleButton>
          </ToggleButtonGroup>
          {mode === 'new' && <ErrorNotice error={template.error} onRetry={template.reload} sx={{ mb: 0 }} />}
          {mode === 'existing' ? (
            <TextField select label="Batch" value={batchId} onChange={(e) => setBatchId(e.target.value)} helperText="The batch this delivery joins">
              {openBatches.map((b) => <MenuItem key={b.id} value={String(b.id)}>{b.code}{b.supplierRef ? ` · ${b.supplierRef}` : ''} · {qtyText(b.onHand)} on hand</MenuItem>)}
            </TextField>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
              <TextField label="Supplier lot number" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />
              {waitingForTemplate && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', alignSelf: 'center' }}>Loading what this batch must record…</Typography>}
              {fields.map((s) => (
                <SpecValueInput key={s.spec.id} dataType={s.spec.dataType} unit={s.spec.unit} options={s.options}
                  label={`${s.spec.name}${stillNeeded.has(s.spec.code) ? ' *' : ''}`}
                  value={values[s.spec.id] ?? ''} onChange={(v) => setValues((prev) => ({ ...prev, [s.spec.id]: v }))} />
              ))}
            </Box>
          )}
        </Box>
      )}
      {blocked && line && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{blocked}</Typography>}
    </FormDialog>
  );
}

/** Who a purchase line is bought for: order + quantity rows that replace the line's allocations. */
export function LineOrdersDialog({ line, onClose, onSaved }: { line: PurchaseLine | null; onClose: () => void; onSaved: (p: PurchaseOrder) => void }) {
  type Row = { key: number; order: SalesOrder | null; quantity: string; received: number };
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (line) setRows((line.orders ?? []).map((o, i) => ({ key: i, order: asOrder({ id: o.orderId, code: o.orderCode }), quantity: String(o.quantity), received: o.received })));
  }, [line?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = line?.quantity ?? 0;
  const sum = rows.reduce((t, r) => t + (Number(r.quantity) || 0), 0);
  const ids = rows.map((r) => r.order?.id).filter((x): x is number => x != null);
  const blocked = !line ? 'Nothing to change.'
    : rows.some((r) => !r.order) ? 'Choose the sales order on every row, or remove the row.'
      : new Set(ids).size !== ids.length ? 'An order can appear only once.'
        : rows.some((r) => !(Number(r.quantity) > 0)) ? 'Each row needs a quantity above zero.'
          : rows.some((r) => Number(r.quantity) + EPS < r.received) ? 'A row cannot be less than what has already arrived against it.'
            : sum > total + EPS ? `The rows add up to ${qtyText(sum)} — more than the line's ${qtyText(total)}.`
              : null;
  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const save = async () => {
    if (!line) return;
    onSaved(await setLineOrders(line.id, rows.map((r) => ({ orderId: r.order!.id, quantity: Number(r.quantity) }))));
  };
  const uom = line?.item.uom ?? '';
  return (
    <FormDialog open={!!line} title="Bought for" onClose={onClose} onSubmit={save} submitLabel="Save" maxWidth="sm" submitDisabled={!!blocked}
      subtitle={line ? <>{line.item.code && <><Mono>{line.item.code}</Mono> </>}{line.item.name} — {qtyText(total)} {uom} on the line. What arrives against a row is held for that order.</> : undefined}>
      {rows.map((r) => (
        <Box key={r.key} data-testid="line-order-row" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px auto', gap: 1, alignItems: 'start' }}>
          <OrderPicker openOnly={false} label="Sales order" value={r.order} onChange={(o) => set(r.key, { order: o })} />
          <TextField label={`Quantity (${uom})`} value={r.quantity} onChange={(e) => set(r.key, { quantity: e.target.value })}
            helperText={r.received ? `${qtyText(r.received)} arrived` : ' '} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }} />
          <Box sx={{ display: 'flex', mt: 0.5 }}>
            <Button size="small" onClick={() => set(r.key, { quantity: String(Math.max(0, Math.round((total - (sum - (Number(r.quantity) || 0))) * 1e6) / 1e6)) })}>The rest</Button>
            <IconButton size="small" aria-label="Remove this row" disabled={r.received > 0} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><DeleteOutlineRounded fontSize="small" /></IconButton>
          </Box>
        </Box>
      ))}
      <Box><Button size="small" startIcon={<AddRounded />} onClick={() => setRows((rs) => [...rs, { key: Math.max(-1, ...rs.map((x) => x.key)) + 1, order: null, quantity: '', received: 0 }])}>Add an order</Button></Box>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
        {blocked && rows.length ? blocked : `${qtyText(sum)} of ${qtyText(total)} ${uom} bought for orders; ${qtyText(Math.max(0, total - sum))} for none. A row cannot go below what has arrived against it.`}
      </Typography>
    </FormDialog>
  );
}
