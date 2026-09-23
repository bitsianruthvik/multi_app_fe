import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, IconButton, MenuItem, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { cfApi, CfApiError, qs } from '../api/client';
import type { Batch, MasterRecord, MovementDetail, MovementType, Party, Resolution, SalesOrder, StockRow, StockingArea } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { qtyText } from '../lib/inventory';
import { RecordPicker } from './RecordPicker';
import { SpecValueInput } from './SpecValueInput';
import { ErrorNotice, Mono } from './ui';
import { DialogHeader } from './FormDialog';

interface LineState {
  key: number;
  item: MasterRecord | null;
  batchMode: 'new' | 'existing';
  batchCode: string;
  supplierRef: string;
  values: Record<number, string>;
  batchId: number | null;
  stockKey: string;
  other: boolean;
  quantity: string;
}
let nextKey = 1;
const blankLine = (): LineState => ({ key: nextKey++, item: null, batchMode: 'new', batchCode: '', supplierRef: '', values: {}, batchId: null, stockKey: '', other: false, quantity: '' });

const TITLE: Record<MovementType, string> = { receipt: 'Receive stock', issue: 'Issue stock', transfer: 'Transfer stock', scrap: 'Scrap stock', adjustment: 'Count stock' };
const HELP: Record<MovementType, string> = {
  receipt: 'Stock arriving from a supplier. A batch-kept item starts a new batch here, with its batch values (like the heat number).',
  issue: 'Stock leaving for use — against a sales order when it is for one.',
  transfer: 'Stock moving between two areas; nothing is used up.',
  scrap: 'Stock written off — say why.',
  adjustment: 'Type what is really there; the difference is posted. Say why.',
};

/** One receipt line: the item, how many, and — for an item kept by batch — a new batch (with its values) or an existing one. */
function ReceiptLine({ line, onChange }: { line: LineState; onChange: (l: LineState) => void }) {
  const byBatch = line.item?.item?.trackedBy === 'batch';
  const itemId = line.item?.id ?? null;
  const template = useLoad(() => (byBatch && itemId ? cfApi.get<Resolution>(`/items/${itemId}/batch-template`) : Promise.resolve(null)), [itemId, byBatch]);
  const batches = useLoad(() => (byBatch && itemId ? cfApi.get<Batch[]>(`/batches${qs({ itemId })}`) : Promise.resolve([] as Batch[])), [itemId, byBatch]);
  const fields = (template.data?.specs ?? []).filter((s) => s.applicable && s.rule.valueRule === 'entered');
  const usable = (batches.data ?? []).filter((b) => b.status !== 'rejected');
  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) 140px' }, gap: 1.5 }}>
        <RecordPicker kinds={['catalog']} activeOnly value={line.item} onChange={(r) => onChange({ ...line, item: r, values: {}, batchId: null, batchMode: 'new' })} label="Item" />
        <TextField label={`Quantity${line.item?.item?.uom ? ` (${line.item.item.uom})` : ''}`} value={line.quantity} onChange={(e) => onChange({ ...line, quantity: e.target.value })}
          inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }} />
      </Box>
      {line.item?.item?.trackedBy === 'individual' && <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>This item is tracked unit by unit — its stock arrives with production, not here.</Typography>}
      {byBatch && (
        <Box sx={{ pl: 1.5, borderLeft: '2px solid var(--c-primary-200)', display: 'grid', gap: 1.5 }}>
          <ToggleButtonGroup exclusive size="small" value={line.batchMode} onChange={(_, v) => v && onChange({ ...line, batchMode: v })} aria-label="Batch">
            <ToggleButton value="new">New batch</ToggleButton>
            <ToggleButton value="existing" disabled={!usable.length}>Add to a batch</ToggleButton>
          </ToggleButtonGroup>
          {line.batchMode === 'existing' ? (
            <TextField select label="Batch" value={line.batchId ?? ''} onChange={(e) => onChange({ ...line, batchId: Number(e.target.value) || null })}>
              {usable.map((b) => <MenuItem key={b.id} value={b.id}>{b.code}{b.supplierRef ? ` · ${b.supplierRef}` : ''} · {qtyText(b.onHand)} on hand</MenuItem>)}
            </TextField>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField label="Batch code (optional)" value={line.batchCode} onChange={(e) => onChange({ ...line, batchCode: e.target.value })} helperText="Empty: numbered by the coding rule" inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
              <TextField label="Supplier’s lot number" value={line.supplierRef} onChange={(e) => onChange({ ...line, supplierRef: e.target.value })} />
              {fields.map((s) => (
                <SpecValueInput key={s.spec.id} dataType={s.spec.dataType} unit={s.spec.unit} options={s.options} label={`${s.spec.name}${s.rule.isRequired ? ' *' : ''}`}
                  value={line.values[s.spec.id] ?? ''} onChange={(v) => onChange({ ...line, values: { ...line.values, [s.spec.id]: v } })} />
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

const keyOf = (r: StockRow) => `${r.item.id}:${r.batch?.id ?? 0}`;

/**
 * One line that takes from an area: pick what is there (item and batch) and how
 * many. A count can also name something not recorded in the area at all.
 */
function OutLine({ line, type, stock, onChange }: { line: LineState; type: MovementType; stock: StockRow[]; onChange: (l: LineState) => void }) {
  const counting = type === 'adjustment';
  const row = stock.find((r) => keyOf(r) === line.stockKey) ?? null;
  const itemId = line.other ? line.item?.id ?? null : null;
  const byBatch = line.other && line.item?.item?.trackedBy === 'batch';
  const batches = useLoad(() => (byBatch && itemId ? cfApi.get<Batch[]>(`/batches${qs({ itemId })}`) : Promise.resolve([] as Batch[])), [itemId, byBatch]);
  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      {!line.other ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) 150px' }, gap: 1.5 }}>
          <Autocomplete size="small" options={stock} value={row} getOptionLabel={(r) => `${r.item.code ?? r.item.name}${r.batch ? ` · batch ${r.batch.code}` : ''} — ${qtyText(r.quantity)} ${r.item.uom}`}
            isOptionEqualToValue={(a, b) => keyOf(a) === keyOf(b)} onChange={(_, r) => onChange({ ...line, stockKey: r ? keyOf(r) : '' })}
            noOptionsText="Nothing recorded in this area" renderInput={(p) => <TextField {...p} label="What" />} />
          <TextField label={counting ? 'Counted' : 'Quantity'} value={line.quantity} onChange={(e) => onChange({ ...line, quantity: e.target.value })}
            helperText={row ? `${qtyText(row.quantity)} recorded` : ' '} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }} />
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) 150px' }, gap: 1.5 }}>
          <RecordPicker kinds={['catalog']} value={line.item} onChange={(r) => onChange({ ...line, item: r, batchId: null })} label="Item not recorded here" />
          <TextField label="Counted" value={line.quantity} onChange={(e) => onChange({ ...line, quantity: e.target.value })} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }} />
          {byBatch && (
            <TextField select label="Batch" value={line.batchId ?? ''} onChange={(e) => onChange({ ...line, batchId: Number(e.target.value) || null })} sx={{ gridColumn: '1 / -1' }}
              helperText={(batches.data ?? []).length ? ' ' : 'It has no batches yet — receive it first'}>
              {(batches.data ?? []).map((b) => <MenuItem key={b.id} value={b.id}>{b.code}{b.supplierRef ? ` · ${b.supplierRef}` : ''}</MenuItem>)}
            </TextField>
          )}
        </Box>
      )}
      {counting && (
        <Button size="small" sx={{ justifySelf: 'start' }} onClick={() => onChange({ ...line, other: !line.other, stockKey: '', item: null, batchId: null })}>
          {line.other ? 'Pick from what is recorded' : 'Count something not recorded here'}
        </Button>
      )}
    </Box>
  );
}

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * Posts one movement. Everything is checked by the server first and nothing is
 * written if any line is wrong — the problems come back line by line.
 */
export function MovementDialog({ open, type, preset = {}, onClose, onPosted }: {
  open: boolean;
  type: MovementType;
  preset?: { areaId?: number | null; item?: MasterRecord | null; orderId?: number | null };
  onClose: () => void;
  onPosted: (m: MovementDetail) => void;
}) {
  const areas = useLoad(() => cfApi.get<StockingArea[]>('/stocking-areas'), []);
  const suppliers = useLoad(() => cfApi.get<Party[]>(`/parties${qs({ role: 'supplier', status: 'active' })}`), []);
  const orders = useLoad(() => cfApi.get<SalesOrder[]>(`/orders${qs({ open: 1 })}`), []);
  const [h, setH] = useState({ partyId: null as number | null, areaId: null as number | null, toAreaId: null as number | null, orderId: null as number | null, date: today(), reference: '', reason: '', notes: '' });
  const [lines, setLines] = useState<LineState[]>([blankLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setH({ partyId: null, areaId: preset.areaId ?? null, toAreaId: null, orderId: preset.orderId ?? null, date: today(), reference: '', reason: '', notes: '' });
    setLines([{ ...blankLine(), item: preset.item ?? null }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type]);
  const out = type !== 'receipt';
  const stock = useLoad(() => (out && h.areaId ? cfApi.get<StockRow[]>(`/stock${qs({ areaId: h.areaId })}`) : Promise.resolve([] as StockRow[])), [out, h.areaId, open]);
  const active = (areas.data ?? []).filter((a) => a.status === 'active');
  const fromAreas = type === 'issue' ? (areas.data ?? []).filter((a) => a.purpose !== 'quarantine') : areas.data ?? [];
  const areaById = useMemo(() => new Map((areas.data ?? []).map((a) => [a.id, a])), [areas.data]);
  const setLine = (i: number, l: LineState) => setLines((ls) => ls.map((x, j) => (j === i ? l : x)));

  const body = () => {
    const header: Record<string, unknown> = { movementType: type, movementDate: h.date, reference: h.reference || null, notes: h.notes || null, reason: h.reason || null };
    if (type === 'receipt') Object.assign(header, { partyId: h.partyId, toAreaId: h.areaId });
    else if (type === 'transfer') Object.assign(header, { fromAreaId: h.areaId, toAreaId: h.toAreaId });
    else if (type === 'adjustment') Object.assign(header, { areaId: h.areaId });
    else Object.assign(header, { fromAreaId: h.areaId, orderId: type === 'issue' ? h.orderId : null });
    header.lines = lines.map((l) => {
      if (type === 'receipt') {
        const base: Record<string, unknown> = { itemId: l.item?.id ?? null, quantity: l.quantity };
        if (l.item?.item?.trackedBy === 'batch') {
          if (l.batchMode === 'existing') base.batchId = l.batchId;
          else base.batch = { code: l.batchCode || null, supplierRef: l.supplierRef || null, values: Object.entries(l.values).filter(([, v]) => v !== '').map(([id, v]) => ({ specificationId: Number(id), value: v })) };
        }
        return base;
      }
      const [itemId, batchId] = l.other ? [l.item?.id ?? null, l.batchId] : l.stockKey.split(':').map(Number);
      const q = type === 'adjustment' ? { countedQuantity: l.quantity } : { quantity: l.quantity };
      return { itemId: itemId || null, batchId: batchId || null, ...q };
    });
    return header;
  };
  const post = async () => {
    setBusy(true); setError(null);
    try { const m = await cfApi.post<MovementDetail>('/movements', body()); setBusy(false); onPosted(m); onClose(); } catch (e) { setBusy(false); setError(e as CfApiError); }
  };

  const areaPicker = (label: string, value: number | null, onChange: (id: number | null) => void, options: StockingArea[]) => (
    <Autocomplete size="small" options={options} value={options.find((a) => a.id === value) ?? null} getOptionLabel={(a) => `${a.code} · ${a.name}`}
      isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, a) => onChange(a?.id ?? null)} renderInput={(p) => <TextField {...p} label={label} />} />
  );
  const needsReason = type === 'scrap' || type === 'adjustment';
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="md" fullWidth>
      <DialogHeader title={TITLE[type]} subtitle={HELP[type]} onClose={onClose} busy={busy} />
      <DialogContent>
        <ErrorNotice error={error} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2, pt: 0.5 }}>
          {type === 'receipt' && (
            <Autocomplete size="small" options={suppliers.data ?? []} value={(suppliers.data ?? []).find((p) => p.id === h.partyId) ?? null} getOptionLabel={(p) => `${p.code} · ${p.name}`}
              isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, p) => setH({ ...h, partyId: p?.id ?? null })} renderInput={(p) => <TextField {...p} label="Supplier" />} />
          )}
          {type === 'receipt' && areaPicker('Into', h.areaId, (id) => setH({ ...h, areaId: id }), active)}
          {out && areaPicker(type === 'adjustment' ? 'Area counted' : 'From', h.areaId, (id) => { setH({ ...h, areaId: id }); setLines([blankLine()]); }, type === 'adjustment' ? areas.data ?? [] : fromAreas)}
          {type === 'transfer' && areaPicker('To', h.toAreaId, (id) => setH({ ...h, toAreaId: id }), active.filter((a) => a.id !== h.areaId))}
          {type === 'issue' && (
            <Autocomplete size="small" options={orders.data ?? []} value={(orders.data ?? []).find((o) => o.id === h.orderId) ?? null}
              getOptionLabel={(o) => `${o.code}${o.title ? ` · ${o.title}` : ''}`} isOptionEqualToValue={(a, b) => a.id === b.id}
              onChange={(_, o) => setH({ ...h, orderId: o?.id ?? null })} renderInput={(p) => <TextField {...p} label="For sales order (optional)" />} />
          )}
          <TextField type="date" label="Date" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} InputLabelProps={{ shrink: true }} inputProps={{ max: today() }} />
          {(type === 'receipt' || type === 'issue' || type === 'transfer') && (
            <TextField label={type === 'receipt' ? 'Delivery note / invoice' : 'Reference'} value={h.reference} onChange={(e) => setH({ ...h, reference: e.target.value })} />
          )}
          {needsReason && <TextField label="Reason *" value={h.reason} onChange={(e) => setH({ ...h, reason: e.target.value })} placeholder={type === 'scrap' ? 'Damaged in handling' : 'Monthly count'} />}
        </Box>
        {out && h.areaId && areaById.get(h.areaId)?.purpose === 'quarantine' && type !== 'issue' && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)', mt: 1 }}>This area holds stock in quarantine.</Typography>
        )}
        <Box sx={{ mt: 2.5, display: 'grid', gap: 2 }}>
          {lines.map((l, i) => (
            <Box key={l.key} sx={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) 32px', gap: 1, alignItems: 'start' }}>
              <Mono muted sx={{ pt: 1 }}>{i + 1}</Mono>
              {type === 'receipt' ? <ReceiptLine line={l} onChange={(x) => setLine(i, x)} /> : (
                h.areaId ? <OutLine line={l} type={type} stock={stock.data ?? []} onChange={(x) => setLine(i, x)} />
                  : <Typography sx={{ color: 'var(--c-text-3)', pt: 1 }}>Choose the area first.</Typography>
              )}
              <IconButton size="small" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><CloseRounded fontSize="small" /></IconButton>
            </Box>
          ))}
          <Button startIcon={<AddRounded />} sx={{ justifySelf: 'start' }} onClick={() => setLines((ls) => [...ls, blankLine()])}>Add a line</Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={post} disabled={busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Posting…' : 'Post'}</Button>
      </DialogActions>
    </Dialog>
  );
}
