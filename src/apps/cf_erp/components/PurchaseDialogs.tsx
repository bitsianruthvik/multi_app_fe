import { useEffect, useMemo, useState } from 'react';
import { Box, MenuItem, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { cfApi, qs } from '../api/client';
import type { Batch, MasterRecord, Party, PurchaseLine, PurchaseOrder, Resolution, StockingArea } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { qtyText } from '../lib/inventory';
import { FormDialog } from './FormDialog';
import { RecordPicker } from './RecordPicker';
import { SpecValueInput } from './SpecValueInput';
import { Mono } from './ui';

const useSuppliers = () => useLoad(() => cfApi.get<Party[]>(`/parties${qs({ role: 'supplier', status: 'active' })}`), []);

/** Raising one by hand — the buy list raises its own. */
export function NewPurchaseDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (p: PurchaseOrder) => void }) {
  const suppliers = useSuppliers();
  const [code, setCode] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  useEffect(() => { if (open) { setCode(''); setSupplierId(''); setExpectedDate(''); setNotes(''); } }, [open]);
  const save = async () => onCreated(await cfApi.post<PurchaseOrder>('/purchase-orders', {
    code: code || null, supplierId: supplierId || null, expectedDate: expectedDate || null, notes: notes || null,
  }));
  return (
    <FormDialog open={open} title="New purchase order" onClose={onClose} onSubmit={save} submitLabel="Create" maxWidth="sm"
      subtitle="It starts as a draft: add its lines, then send it to the supplier.">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField label="Number" value={code} onChange={(e) => setCode(e.target.value)} helperText="Leave empty for the next number"
          inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
        <TextField select label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} helperText="Can be named later, before it is sent">
          <MenuItem value="">Nobody yet</MenuItem>
          {(suppliers.data ?? []).map((s) => <MenuItem key={s.id} value={String(s.id)}>{s.name}</MenuItem>)}
        </TextField>
        <TextField label="Expected" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Box>
    </FormDialog>
  );
}

/** Naming the supplier and sending it: draft goes to ordered. */
export function SendPurchaseDialog({ order, onClose, onSent }: { order: PurchaseOrder | null; onClose: () => void; onSent: (p: PurchaseOrder) => void }) {
  const suppliers = useSuppliers();
  const [supplierId, setSupplierId] = useState('');
  useEffect(() => { if (order) setSupplierId(order.supplier ? String(order.supplier.id) : ''); }, [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => { if (order) onSent(await cfApi.post<PurchaseOrder>(`/purchase-orders/${order.id}/order`, { supplierId: supplierId || null })); };
  return (
    <FormDialog open={!!order} title="Send to the supplier" onClose={onClose} onSubmit={save} submitLabel="Send" maxWidth="xs"
      subtitle={order ? `${order.code} — ${order.lines.length} ${order.lines.length === 1 ? 'line' : 'lines'}. Once sent, deliveries can be booked against it.` : undefined}>
      <TextField select label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} autoFocus
        helperText="A purchase order addressed to nobody cannot be sent">
        <MenuItem value="">Nobody yet</MenuItem>
        {(suppliers.data ?? []).map((s) => <MenuItem key={s.id} value={String(s.id)}>{s.name}</MenuItem>)}
      </TextField>
    </FormDialog>
  );
}

/** Adding a line by hand. Asking for an item already on the order adds to its line. */
export function AddPurchaseLineDialog({ orderId, onClose, onAdded }: { orderId: number | null; onClose: () => void; onAdded: (p: PurchaseOrder) => void }) {
  const [item, setItem] = useState<MasterRecord | null>(null);
  const [quantity, setQuantity] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { if (orderId) { setItem(null); setQuantity(''); setExpectedDate(''); setNote(''); } }, [orderId]);
  const save = async () => {
    if (!orderId) return;
    onAdded(await cfApi.post<PurchaseOrder>(`/purchase-orders/${orderId}/lines`, {
      itemId: item?.id, quantity, expectedDate: expectedDate || null, note: note || null,
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
      <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
    </FormDialog>
  );
}

/** Booking a delivery against one line — an ordinary stock receipt underneath. */
export function ReceiveLineDialog({ line, orderCode, onClose, onReceived }: {
  line: PurchaseLine | null; orderCode: string | null; onClose: () => void; onReceived: (p: PurchaseOrder) => void;
}) {
  const areas = useLoad(() => cfApi.get<StockingArea[]>('/stocking-areas'), []);
  const usable = useMemo(() => (areas.data ?? []).filter((a) => a.status === 'active' && a.purpose !== 'quarantine'), [areas.data]);
  const [quantity, setQuantity] = useState('');
  const [areaId, setAreaId] = useState('');
  const [supplierRef, setSupplierRef] = useState('');
  const [reference, setReference] = useState('');
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
  useEffect(() => {
    if (line) {
      setQuantity(String(line.outstanding)); setSupplierRef(''); setReference('');
      setMode('new'); setBatchId(''); setValues({});
      setAreaId((a) => a || String(usable[0]?.id ?? ''));
    }
  }, [line?.id, usable.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    if (!line) return;
    const batch = mode === 'existing'
      ? undefined
      : { supplierRef: supplierRef || null, values: Object.entries(values).filter(([, v]) => v !== '').map(([id, v]) => ({ specificationId: Number(id), value: v })) };
    const r = await cfApi.post<{ order: PurchaseOrder }>(`/purchase-lines/${line.id}/receive`, {
      quantity, stockingAreaId: areaId, reference: reference || null,
      batchId: byBatch && mode === 'existing' ? Number(batchId) : undefined,
      batch: byBatch && mode === 'new' ? batch : undefined,
    });
    onReceived(r.order);
  };
  return (
    <FormDialog open={!!line} title="Book a delivery" onClose={onClose} onSubmit={save} submitLabel="Receive" maxWidth="sm" submitDisabled={!areaId || !quantity}
      subtitle={line ? <>{orderCode} · <Mono>{line.item.code ?? line.item.name}</Mono> — {qtyText(line.outstanding)} {line.item.uom} outstanding of {qtyText(line.quantity)}.</> : undefined}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField label="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus
          helperText={line ? `${qtyText(line.outstanding)} still expected` : ' '} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }} />
        <TextField select label="Into" value={areaId} onChange={(e) => setAreaId(e.target.value)} helperText="Where it was put">
          {usable.map((a) => <MenuItem key={a.id} value={String(a.id)}>{a.code} · {a.name}</MenuItem>)}
        </TextField>
        <TextField label="Delivery note" value={reference} onChange={(e) => setReference(e.target.value)} helperText="The supplier document number" />
      </Box>
      {byBatch && (
        <Box sx={{ pl: 1.5, borderLeft: '2px solid var(--c-primary-200)', display: 'grid', gap: 1.5 }}>
          <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v) => v && setMode(v)} aria-label="Batch">
            <ToggleButton value="new">New batch</ToggleButton>
            <ToggleButton value="existing" disabled={!openBatches.length}>Add to a batch</ToggleButton>
          </ToggleButtonGroup>
          {mode === 'existing' ? (
            <TextField select label="Batch" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              {openBatches.map((b) => <MenuItem key={b.id} value={String(b.id)}>{b.code}{b.supplierRef ? ` · ${b.supplierRef}` : ''} · {qtyText(b.onHand)} on hand</MenuItem>)}
            </TextField>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
              <TextField label="Supplier lot number" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />
              {fields.map((s) => (
                <SpecValueInput key={s.spec.id} dataType={s.spec.dataType} unit={s.spec.unit} options={s.options} label={`${s.spec.name}${s.rule.isRequired ? ' *' : ''}`}
                  value={values[s.spec.id] ?? ''} onChange={(v) => setValues((prev) => ({ ...prev, [s.spec.id]: v }))} />
              ))}
            </Box>
          )}
        </Box>
      )}
    </FormDialog>
  );
}
