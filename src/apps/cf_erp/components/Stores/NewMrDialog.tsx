import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, IconButton, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { CfApiError } from '../../api/client';
import type { MrFor } from '../../api/purchaseRequests';
import type { MasterRecord, SalesOrder } from '../../api/types';
import { createRequisition } from '../../api/stores';
import { NEW_MR_FOR, newMrBody, newMrProblems, withSpareRow, type DraftRow } from '../../lib/stores';
import { RecordPicker } from '../RecordPicker';
import { OrderPicker } from '../ServerPicker';
import { DialogHeader } from '../FormDialog';
import { ErrorNotice } from '../ui';

/**
 * STORES › NEW MR (§79, user 2026-10-18): an MR with no order line — for stock, general (overhead, or charged to a sales
 * order named here) or a sales order. Full screen, keyboard first: pick an item, Tab to its quantity, Enter jumps to the
 * next row's picker; Ctrl+Enter raises it. The MR lands in Stores' inbox, where stock is taken and the rest goes on its PR.
 */
export function NewMrDialog({ open, onClose, onRaised, defaultFor = 'general' }: {
  open: boolean;
  onClose: () => void;
  onRaised: (mr: { id: number; code: string }) => void;
  defaultFor?: MrFor;
}) {
  const [forType, setForType] = useState<MrFor>(defaultFor);
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<DraftRow[]>([{ item: null, qty: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForType(defaultFor); setOrder(null); setNote(''); setRows([{ item: null, qty: '' }]); setError(null); setTried(false); setBusy(false);
  }, [open, defaultFor]);
  const problems = useMemo(() => newMrProblems(forType, order?.id ?? null, rows), [forType, order, rows]);
  const setRow = (k: number, patch: Partial<DraftRow>) => setRows((rs) => withSpareRow(rs.map((r, i) => (i === k ? { ...r, ...patch } : r))));
  const focusPicker = (k: number) => window.setTimeout(() => document.querySelector<HTMLInputElement>(`[data-testid="newmr-item-${k}"] input`)?.focus(), 30);

  const submit = async () => {
    setTried(true);
    if (problems.length || busy) return;
    setBusy(true); setError(null);
    try {
      const made = await createRequisition(newMrBody(forType, order?.id ?? null, note, rows));
      onRaised(made);
      onClose();
    } catch (e) { setError(e instanceof CfApiError ? e : new CfApiError(0, e instanceof Error ? e.message : String(e))); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullScreen
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit(); } }}>
      <DialogHeader title="New material request" subtitle="An MR for stock, general use or a sales order. Stores take what is in stock; the rest goes on its purchase request." onClose={onClose} busy={busy} />
      <DialogContent>
        <Box sx={{ maxWidth: 960, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <ErrorNotice error={error} />
          <Box>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mb: 0.75 }}>For — the cost follows it</Typography>
            <ToggleButtonGroup size="small" exclusive value={forType} onChange={(_, v) => { if (v) setForType(v); }} aria-label="For">
              {NEW_MR_FOR.map((f) => <ToggleButton key={f.value} value={f.value} data-testid={`newmr-for-${f.value}`}>{f.label}</ToggleButton>)}
            </ToggleButtonGroup>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.75 }}>{NEW_MR_FOR.find((f) => f.value === forType)?.hint}</Typography>
          </Box>
          {forType !== 'stock' && (
            <OrderPicker value={order} onChange={setOrder} label={forType === 'sales_order' ? 'Sales order' : 'Sales order (optional — its cost goes to that order)'} sx={{ maxWidth: 520 }} />
          )}
          <Box data-testid="newmr-rows" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {rows.map((r, k) => (
              <Box key={k} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 110px 40px', sm: 'minmax(0, 1fr) 160px 40px' }, gap: 1, alignItems: 'center' }}>
                <Box data-testid={`newmr-item-${k}`}>
                  <RecordPicker kinds={['catalog']} activeOnly value={(r.item as unknown as MasterRecord) ?? null} label={`Item ${k + 1}`} autoFocus={k === 0 && open}
                    excludeIds={rows.filter((x, i) => i !== k && x.item).map((x) => x.item!.id)}
                    onChange={(m) => { setRow(k, { item: m ? { id: m.id, code: m.code, name: m.name, uom: m.item?.uom ?? null } : null }); if (m) window.setTimeout(() => document.querySelector<HTMLInputElement>(`[data-testid="newmr-qty-${k}"]`)?.focus(), 30); }} />
                </Box>
                <TextField size="small" label="Quantity" value={r.qty} onChange={(e) => setRow(k, { qty: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); focusPicker(k + 1); } }}
                  inputProps={{ inputMode: 'decimal', 'data-testid': `newmr-qty-${k}` }}
                  InputProps={{ endAdornment: <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', ml: 0.5 }}>{r.item?.uom ?? ''}</Typography> }} />
                <Tooltip title="Remove the row">
                  <span><IconButton size="small" aria-label="Remove the row" disabled={rows.length === 1} onClick={() => setRows((rs) => withSpareRow(rs.filter((_, i) => i !== k)))}><DeleteOutlineRounded fontSize="small" /></IconButton></span>
                </Tooltip>
              </Box>
            ))}
          </Box>
          <TextField size="small" label="Note (what it is for)" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={1} inputProps={{ maxLength: 500 }} />
          {tried && problems.length > 0 && (
            <Alert severity="warning" data-testid="newmr-problems">{problems.map((p) => <Box key={p}>{p}</Box>)}</Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mr: 'auto', pl: 2 }}>Enter: next row · Ctrl+Enter: raise</Typography>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy} data-testid="newmr-raise"
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>Raise MR</Button>
      </DialogActions>
    </Dialog>
  );
}
