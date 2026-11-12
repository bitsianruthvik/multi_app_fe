import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, MenuItem, Switch, Tab, Tabs, TextField, Typography } from '@mui/material';
import { cfApi, CfApiError } from '../../api/client';
import { getAcceptance, saveAcceptance, type AcceptanceView, type Terms } from '../../api/acceptance';
import { setLineSupply, type MaterialSupply } from '../../api/requisitions';
import type { SalesOrder } from '../../api/types';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { termsBody, termsOf, termInputSx as inputSx } from '../../lib/acceptance';
import { DialogHeader } from '../FormDialog';
import { ErrorNotice, InfoTip, Mono, SkeletonRows } from '../ui';
import { useToast } from '../toastContext';
import { ChargesGrid, MilestonesGrid, StagesGrid } from './TermGrids';

const today = () => new Date().toISOString().slice(0, 10);
const NO_TERMS: Terms = { charges: [], material: null, lumpSums: [], milestones: [], stages: [] };
const hasTerms = (t: Terms | null | undefined) => !!t && (t.charges.length > 0 || !!t.material || t.lumpSums.length > 0 || t.milestones.length > 0 || t.stages.length > 0);

/**
 * CUSTOMER ACCEPTED — the order header's button (user, 2026-11-12: "The customer acceptance shouldn't be part of the flow.
 * Let that be a button on the sales order … In pop-up … segregate the accounting, inventory and just acceptance. They might
 * just accept the order without setting the other details for now. They can set those later.")
 *
 * Three tabs: ACCEPTANCE (when, the customer's PO / reference, a note for the MD — the only part needed), ACCOUNTING
 * (charges, payment milestones and post-production stages — "Fill now" or later), INVENTORY (who supplies the material,
 * saved at once). Saving sends it to the MD (the order_acceptance approval); the MD's yes confirms the order and opens the
 * material request. Everything can be set later in the order's Acceptance & terms tab.
 */
export function CustomerAcceptedDialog({ order, open, onClose, onDone }: { order: SalesOrder; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canSupply = isPermitted('cf_erp_inventory_manage') || isPermitted('cf_erp_orders_manage');
  const [view, setView] = useState<AcceptanceView | null>(null);
  const [loadError, setLoadError] = useState<CfApiError | null>(null);
  const [tab, setTab] = useState(0);
  const [on, setOn] = useState(today());
  const [poRef, setPoRef] = useState('');
  const [note, setNote] = useState('');
  const [fill, setFill] = useState(false);
  const [terms, setTerms] = useState<Terms | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const v = await getAcceptance(order.id);
      setView(v);
      setTerms(termsOf(v));
      // Terms already sent before (a version exists) are kept and shown; a new order starts with accounting left for later.
      setFill(!v.fromTemplates && hasTerms(v.terms));
      setOn(v.accepted?.on ?? today());
      setPoRef(v.accepted?.poRef ?? order.customerReference ?? '');
    } catch (e) { setLoadError(e as CfApiError); }
  };
  useEffect(() => {
    if (!open) return;
    setTab(0); setNote(''); setError(null); setView(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order.id]);

  const up = (patch: Partial<Terms>) => setTerms((t) => (t ? { ...t, ...patch } : t));
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError(e as CfApiError); } finally { setBusy(false); } };
  const supplyOrder = (v: MaterialSupply) => run(async () => { await cfApi.put<SalesOrder>(`/orders/${order.id}/material-supply`, { supply: v }); toast.success('Material supply saved.'); await load(); });
  const supplyLine = (lineId: number, v: string) => run(async () => { await setLineSupply(lineId, v === '' ? null : (v as MaterialSupply)); toast.success('Material supply saved.'); await load(); });
  const submit = () => run(async () => {
    await saveAcceptance(order.id, fill && terms ? termsBody(terms) : NO_TERMS, note.trim() || undefined, { on, poRef: poRef.trim() || null });
    invalidateNavCounts();
    toast.success('Customer acceptance saved — sent to the MD to accept the order.');
    onDone();
    onClose();
  });

  const anyWeBuy = !!view?.order.lines.some((l) => l.supply === 'we_buy');
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="lg" fullWidth data-testid="customer-accepted-dialog">
      <DialogHeader title="Customer accepted" subtitle={`${order.code}${order.customer ? ` · ${order.customer.name}` : ''}`} onClose={onClose} busy={busy} />
      <Box sx={{ px: 3, borderBottom: '1px solid var(--c-divider)' }}>
        <Tabs value={tab} onChange={(_, v: number) => setTab(v)} aria-label="Acceptance parts">
          <Tab label="Acceptance" data-testid="acc-tab-acceptance" />
          <Tab label={<Box component="span" sx={{ display: 'inline-flex', gap: 0.5, alignItems: 'center' }}>Accounting <Typography component="span" sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{fill ? '' : 'later'}</Typography></Box>} data-testid="acc-tab-accounting" />
          <Tab label="Inventory" data-testid="acc-tab-inventory" />
        </Tabs>
      </Box>
      <DialogContent sx={{ minHeight: 320 }}>
        <ErrorNotice error={loadError} onRetry={() => void load()} />
        <ErrorNotice error={error} />
        {!view && !loadError && <SkeletonRows rows={3} height={48} />}
        {view && tab === 0 && (
          <Box sx={{ display: 'grid', gap: 2, maxWidth: 520, pt: 1 }}>
            {view.confirmProblems.length > 0 && <Alert severity="warning" data-testid="acc-confirm-problems">{view.confirmProblems.map((p) => <Box key={p}>{p}</Box>)}</Alert>}
            <TextField type="date" size="small" label="Accepted on" value={on} onChange={(e) => setOn(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ 'data-testid': 'acc-on' }} />
            <TextField size="small" label="Customer PO / reference" value={poRef} onChange={(e) => setPoRef(e.target.value)} inputProps={{ 'data-testid': 'acc-po-ref', maxLength: 100 }} />
            <TextField size="small" label="Note for the MD (optional)" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} inputProps={{ 'data-testid': 'acc-note' }} />
            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', color: 'var(--c-text-2)', fontSize: 13 }}>
              Next: the MD accepts the order
              <InfoTip text="Saving sends this to the MD (their Approvals). When the MD accepts, the order is confirmed and its material request can be created. Accounting and inventory can be filled now or later, in the order's Acceptance & terms tab." />
            </Box>
          </Box>
        )}
        {view && tab === 1 && terms && (
          <Box sx={{ display: 'grid', gap: 2, pt: 1, minWidth: 0 }}>
            <FormControlLabel control={<Switch checked={fill} onChange={(e) => setFill(e.target.checked)} inputProps={{ 'aria-label': 'Fill the accounting now' }} data-testid="acc-fill" />}
              label={<Box component="span" sx={{ display: 'inline-flex', gap: 0.75, alignItems: 'center' }}>Fill the accounting now<InfoTip text="Charges, payment milestones and post-production stages. Leave it off to set them later in Acceptance & terms; the MD then sees 'charges and payment terms to follow'." /></Box>} />
            {fill && (
              <>
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Charges</Typography>
                <ChargesGrid terms={terms} onChange={up} lists={view.lists} editable estimate={view.estimate} showMaterial={anyWeBuy} materialTonnes={view.estimate.ourTonnes} suggested={view.suggestedOperation ?? null} suggestedKeys={view.prefilledCharges ?? []} />
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Payment milestones</Typography>
                <MilestonesGrid terms={terms} onChange={up} lists={view.lists} editable estimate={view.estimate} />
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Post-production stages</Typography>
                <StagesGrid terms={terms} onChange={up} editable />
              </>
            )}
          </Box>
        )}
        {view && tab === 2 && (
          <Box sx={{ display: 'grid', gap: 1.25, pt: 1 }} data-testid="acc-supply">
            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', fontSize: 13, color: 'var(--c-text-2)' }}>
              Who supplies the material — saved as you change it
              <InfoTip text="We buy: the material request goes to Stores and Purchase. Customer supplies: it makes a ₹0 purchase order to the customer, and what arrives is kept as their stock. It can change until a material request is with Purchase." />
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: 13.5, minWidth: 140 }}>The order</Typography>
              <TextField select size="small" value={view.order.materialSupply} disabled={!view.supplyEditable || !canSupply || busy} sx={{ minWidth: 200, ...inputSx }}
                onChange={(e) => void supplyOrder(e.target.value as MaterialSupply)} inputProps={{ 'data-testid': 'acc-order-supply' }}>
                <MenuItem value="we_buy">We buy</MenuItem>
                <MenuItem value="customer">Customer supplies</MenuItem>
              </TextField>
            </Box>
            {view.order.lines.map((l) => (
              <Box key={l.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 13, minWidth: 140 }}>Line {l.lineNo} · {l.name}</Typography>
                <TextField select size="small" value={l.ownSupply ?? ''} disabled={!view.supplyEditable || !canSupply || busy} sx={{ minWidth: 200, ...inputSx }}
                  onChange={(e) => void supplyLine(l.id, e.target.value)} SelectProps={{ displayEmpty: true }}>
                  <MenuItem value="">As the order</MenuItem>
                  <MenuItem value="we_buy">We buy</MenuItem>
                  <MenuItem value="customer">Customer supplies</MenuItem>
                </TextField>
                <Mono muted>{l.weightT == null ? 'no weight yet' : `${l.weightT} t`}</Mono>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy || !view || !on || (view?.confirmProblems.length ?? 0) > 0}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined} data-testid="acc-submit">
          Mark accepted — send to MD
        </Button>
      </DialogActions>
    </Dialog>
  );
}
