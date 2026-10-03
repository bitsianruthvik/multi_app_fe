import { useEffect, useState } from 'react';
import { Box, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { CfApiError } from '../../api/client';
import { getOrderPurchase, requestItems } from '../../api/purchase';
import type { MasterRecord, PurchaseOrder, SalesOrder } from '../../api/types';
import { FormDialog } from '../FormDialog';
import { OrderPicker } from '../ServerPicker';
import { RecordPicker } from '../RecordPicker';
import { requestBody, rowsFromShortfall, type RequestRow } from '../../lib/purchaseFlow';
import { ErrorNotice, Mono } from '../ui';

/**
 * "Request items": a purchase order is raised straight from the sales order. The rows start as what the order is
 * short of; the quantity is editable, a row can go, and any catalog item can be added. With no `order` given
 * (the Purchase board's New request) the sales order is picked first.
 */
export function RequestItemsDialog({ open, order, onClose, onRequested }: {
  open: boolean;
  order: { id: number; code: string } | null;
  onClose: () => void;
  onRequested: (po: PurchaseOrder) => void;
}) {
  const [picked, setPicked] = useState<SalesOrder | null>(null);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState<MasterRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<CfApiError | null>(null);
  const target = order ?? picked;

  useEffect(() => { if (open) { setPicked(null); setRows([]); setNotes(''); setAdding(null); setLoadError(null); } }, [open]);
  useEffect(() => {
    if (!open || !target) { setRows([]); return undefined; }
    let alive = true;
    setLoading(true); setLoadError(null);
    getOrderPurchase(target.id)
      .then((r) => { if (alive) setRows(rowsFromShortfall(r.shortfall)); })
      .catch((e) => { if (alive) setLoadError(e instanceof CfApiError ? e : new CfApiError(0, 'What the order is short of could not be loaded.')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const addItem = (r: MasterRecord | null) => {
    setAdding(null);
    if (!r) return;
    setRows((all) => (all.some((x) => x.itemId === r.id) ? all : [...all, { key: Math.max(0, ...all.map((x) => x.key)) + 1, itemId: r.id, code: r.code, name: r.name, uom: r.item?.uom ?? '', quantity: '' }]));
  };
  const lines = requestBody(rows);
  const save = async () => {
    if (!target) return;
    onRequested(await requestItems(target.id, { lines, ...(notes.trim() ? { notes: notes.trim() } : {}) }));
  };

  return (
    <FormDialog open={open} title="Request items" maxWidth="md" onClose={onClose} onSubmit={save} enterSubmits={false}
      submitLabel="Request" busyLabel="Requesting…" submitDisabled={!target || lines.length === 0}
      subtitle={target ? `Raises a purchase order, bought for ${target.code}. Next you check stock, then ask suppliers for quotes.` : 'Choose the sales order the items are for.'}>
      {!order && <OrderPicker value={picked} onChange={setPicked} label="Sales order" openOnly helperText="The order this is bought for" />}
      <ErrorNotice error={loadError} />
      {target && (
        <Box data-testid="request-rows" sx={{ display: 'grid', gap: 1 }}>
          {loading && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Working out what {target.code} is short of…</Typography>}
          {!loading && rows.length === 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{target.code} is not short of anything. Add the items you want to buy.</Typography>}
          {rows.map((r) => (
            <Box key={r.key} data-testid="request-row" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 140px 36px', gap: 1.5, alignItems: 'center' }}>
              <Box sx={{ minWidth: 0 }}>
                <Mono>{r.code ?? '—'}</Mono>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }} noWrap title={r.name}>{r.name}</Typography>
              </Box>
              <TextField size="small" label={r.uom ? `Quantity (${r.uom})` : 'Quantity'} value={r.quantity} inputProps={{ inputMode: 'decimal', 'aria-label': `Quantity of ${r.code ?? r.name}` }}
                onChange={(e) => setRows((all) => all.map((x) => (x.key === r.key ? { ...x, quantity: e.target.value } : x)))} />
              <Tooltip title="Take this row out">
                <IconButton size="small" aria-label={`Remove ${r.code ?? r.name}`} onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))}><DeleteOutlineRounded fontSize="small" /></IconButton>
              </Tooltip>
            </Box>
          ))}
          <Box data-testid="request-add">
            <RecordPicker kinds={['catalog']} value={adding} onChange={addItem} label="Add item" activeOnly excludeIds={rows.map((r) => r.itemId)} helperText="Any catalog item, even one the order is not short of" />
          </Box>
          <TextField size="small" label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Box>
      )}
    </FormDialog>
  );
}
