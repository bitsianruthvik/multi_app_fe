import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, IconButton, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { CfApiError } from '../../api/client';
import type { MrFor } from '../../api/purchaseRequests';
import type { MasterRecord, SalesOrder } from '../../api/types';
import { createRequisition, raiseStoresPr } from '../../api/stores';
import { listOrders as listMaintenanceOrders, type MaintenanceOrder } from '../../api/maintenance';
import { NEW_MR_FOR, NEW_PR_FOR, newMrBody, newMrProblems, newPrBody, withSpareRow, type DraftRow } from '../../lib/stores';
import { RecordPicker } from '../RecordPicker';
import { OrderPicker, ServerPicker } from '../ServerPicker';
import { DialogHeader } from '../FormDialog';
import { ErrorNotice, Mono } from '../ui';

/**
 * Stores › NEW MR (§79, user 2026-10-18) and NEW PR (user 2026-10-27). Full screen, keyboard first: pick an item, Tab to
 * its quantity, Enter jumps to the next row's picker; Ctrl+Enter raises it.
 *   kind 'mr'  a MATERIAL REQUEST — a request TO STORES (a department, maintenance, sales): for stock, general (overhead,
 *              or charged to a sales order named here) or a sales order. It lands in Stores' MR inbox, where stock is
 *              taken and the rest goes on its PR.
 *   kind 'pr'  Stores' OWN purchase — straight to a PURCHASE REQUEST for Purchase (nothing taken from stock): For Stock or
 *              General, General optionally charged to a sales order or a maintenance order. onRaised gets the PR.
 */
export function NewMrDialog({ open, onClose, onRaised, defaultFor = 'general', kind = 'mr', canPickMaintenance = false }: {
  open: boolean;
  onClose: () => void;
  /** kind 'mr': the MR; kind 'pr': the PR made (the MR under it is internal). */
  onRaised: (made: { id: number; code: string }) => void;
  defaultFor?: MrFor;
  kind?: 'mr' | 'pr';
  /** kind 'pr': may the user search maintenance orders (maintenance or production view) to charge one. */
  canPickMaintenance?: boolean;
}) {
  const pr = kind === 'pr';
  const t = pr ? 'newpr' : 'newmr';
  const choices = pr ? NEW_PR_FOR : NEW_MR_FOR;
  const startFor: MrFor = pr && defaultFor !== 'stock' ? 'general' : defaultFor;
  const [forType, setForType] = useState<MrFor>(startFor);
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [maint, setMaint] = useState<MaintenanceOrder | null>(null);
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<DraftRow[]>([{ item: null, qty: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForType(startFor); setOrder(null); setMaint(null); setNote(''); setRows([{ item: null, qty: '' }]); setError(null); setTried(false); setBusy(false);
  }, [open, startFor]);
  const problems = useMemo(() => newMrProblems(forType, forType === 'stock' ? null : order?.id ?? null, rows), [forType, order, rows]);
  const setRow = (k: number, patch: Partial<DraftRow>) => setRows((rs) => withSpareRow(rs.map((r, i) => (i === k ? { ...r, ...patch } : r))));
  const focusPicker = (k: number) => window.setTimeout(() => document.querySelector<HTMLInputElement>(`[data-testid="${t}-item-${k}"] input`)?.focus(), 30);

  const submit = async () => {
    setTried(true);
    if (problems.length || busy) return;
    setBusy(true); setError(null);
    try {
      if (pr) {
        const out = await raiseStoresPr(newPrBody(forType === 'stock' ? 'stock' : 'general', order?.id ?? null, maint?.id ?? null, note, rows));
        onRaised(out.purchaseRequest ?? out.requisition);
      } else {
        onRaised(await createRequisition(newMrBody(forType, order?.id ?? null, note, rows)));
      }
      onClose();
    } catch (e) { setError(e instanceof CfApiError ? e : new CfApiError(0, e instanceof Error ? e.message : String(e))); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullScreen
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit(); } }}>
      <DialogHeader title={pr ? 'New purchase request' : 'New material request'}
        subtitle={pr
          ? "Stores' own purchase: it goes straight to Purchase as a purchase request. Nothing is taken from stock."
          : 'A request to Stores — for stock, general use or a sales order. Stores take what is in stock; the rest goes on its purchase request.'}
        onClose={onClose} busy={busy} />
      <DialogContent>
        <Box sx={{ maxWidth: 960, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <ErrorNotice error={error} />
          <Box>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mb: 0.75 }}>For — the cost follows it</Typography>
            <ToggleButtonGroup size="small" exclusive value={forType} onChange={(_, v) => { if (v) setForType(v); }} aria-label="For">
              {choices.map((f) => <ToggleButton key={f.value} value={f.value} data-testid={`${t}-for-${f.value}`}>{f.label}</ToggleButton>)}
            </ToggleButtonGroup>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.75 }}>{choices.find((f) => f.value === forType)?.hint}</Typography>
          </Box>
          {forType !== 'stock' && (
            <OrderPicker value={order} onChange={setOrder} label={forType === 'sales_order' ? 'Sales order' : 'Sales order (optional — its cost goes to that order)'} sx={{ maxWidth: 520 }} />
          )}
          {pr && forType === 'general' && canPickMaintenance && (
            <Box data-testid="newpr-maintenance" sx={{ maxWidth: 520 }}>
              <ServerPicker<MaintenanceOrder> value={maint} onChange={setMaint} noun="maintenance order"
                label="Maintenance order (optional — its cost goes to that order)"
                search={(term) => listMaintenanceOrders({ search: term || undefined }).then((r) => r.rows)}
                getId={(o) => o.id} getLabel={(o) => `${o.code} · ${o.machine.code} · ${o.title}`}
                renderOption={(o) => (
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', minWidth: 0 }}>
                    <Mono sx={{ minWidth: 110 }}>{o.code}</Mono>
                    <Typography sx={{ fontSize: 14 }} noWrap>{o.machine.code} · {o.title}</Typography>
                  </Box>
                )} />
            </Box>
          )}
          <Box data-testid={`${t}-rows`} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {rows.map((r, k) => (
              <Box key={k} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 110px 40px', sm: 'minmax(0, 1fr) 160px 40px' }, gap: 1, alignItems: 'center' }}>
                <Box data-testid={`${t}-item-${k}`}>
                  <RecordPicker kinds={['catalog']} activeOnly value={(r.item as unknown as MasterRecord) ?? null} label={`Item ${k + 1}`} autoFocus={k === 0 && open}
                    excludeIds={rows.filter((x, i) => i !== k && x.item).map((x) => x.item!.id)}
                    onChange={(m) => { setRow(k, { item: m ? { id: m.id, code: m.code, name: m.name, uom: m.item?.uom ?? null } : null }); if (m) window.setTimeout(() => document.querySelector<HTMLInputElement>(`[data-testid="${t}-qty-${k}"]`)?.focus(), 30); }} />
                </Box>
                <TextField size="small" label="Quantity" value={r.qty} onChange={(e) => setRow(k, { qty: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); focusPicker(k + 1); } }}
                  inputProps={{ inputMode: 'decimal', 'data-testid': `${t}-qty-${k}` }}
                  InputProps={{ endAdornment: <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', ml: 0.5 }}>{r.item?.uom ?? ''}</Typography> }} />
                <Tooltip title="Remove the row">
                  <span><IconButton size="small" aria-label="Remove the row" disabled={rows.length === 1} onClick={() => setRows((rs) => withSpareRow(rs.filter((_, i) => i !== k)))}><DeleteOutlineRounded fontSize="small" /></IconButton></span>
                </Tooltip>
              </Box>
            ))}
          </Box>
          <TextField size="small" label="Note (what it is for)" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={1} inputProps={{ maxLength: 500 }} />
          {tried && problems.length > 0 && (
            <Alert severity="warning" data-testid={`${t}-problems`}>{problems.map((p) => <Box key={p}>{p}</Box>)}</Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mr: 'auto', pl: 2 }}>Enter: next row · Ctrl+Enter: raise</Typography>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy} data-testid={`${t}-raise`}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{pr ? 'Raise PR' : 'Raise MR'}</Button>
      </DialogActions>
    </Dialog>
  );
}
