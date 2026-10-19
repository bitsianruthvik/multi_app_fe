import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { CfApiError } from '../../api/client';
import {
  orderPayments, previewInvoice, raiseInvoice, recordReceipt, RECEIPT_MODES,
  type BillingCard, type InvoicePlan, type OrderPayments, type RaisedInvoice, type ReceiptMode, type ReceiptResult,
} from '../../api/accounts';
import { useCompanySlug } from '../../hooks/useLoad';
import { useFullScreen } from '../../hooks/useFullScreen';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { appPath } from '../../navMeta';
import { rupeeText } from '../../lib/money';
import { todayIso } from '../../lib/accounts';
import { DialogCloseButton } from '../FormDialog';
import { FullScreenToggle } from '../FullScreen';
import { ErrorNotice, Mono } from '../ui';
import { FlashOnChange } from '../../motion';

function Header({ title, subtitle, fs, onClose, busy }: { title: string; subtitle: string; fs: ReturnType<typeof useFullScreen>; onClose: () => void; busy: boolean }) {
  return (
    <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        {title}
        <Box sx={{ fontSize: 13, fontWeight: 400, color: 'var(--c-text-2)', mt: 0.5 }}>{subtitle}</Box>
      </Box>
      <FullScreenToggle on={fs.on} onToggle={fs.toggle} />
      <DialogCloseButton onClose={onClose} disabled={busy} />
    </DialogTitle>
  );
}

/**
 * RAISE INVOICE from due cards of one order: prefilled (today, the credit days of the milestones), the GST worked out
 * live (CGST + SGST inside the state, IGST across), every reason it cannot be raised yet with where to fix it.
 * Raising numbers and issues it at once; the PDF opens from the result.
 */
export function RaiseInvoiceDialog({ open, cards, onClose, onRaised }: { open: boolean; cards: BillingCard[]; onClose: () => void; onRaised: (inv: RaisedInvoice) => void }) {
  const fs = useFullScreen('accounts-raise-invoice');
  const company = useCompanySlug();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayIso());
  const [credit, setCredit] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [plan, setPlan] = useState<InvoicePlan | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const orderId = cards[0]?.orderId;
  const ids = cards.map((c) => c.id).join(',');
  useEffect(() => {
    if (!open) return;
    setDate(todayIso()); setCredit(''); setNotes(''); setPlan(null); setError(null);
  }, [open, ids]);
  useEffect(() => {
    if (!open || !orderId) return undefined;
    let alive = true;
    const t = window.setTimeout(() => {
      previewInvoice({ orderId, cards: ids.split(','), invoiceDate: date, creditDays: credit === '' ? null : Number(credit) })
        .then((p) => { if (!alive) return; setPlan(p); setError(null); if (credit === '') setCredit(String(p.creditDays)); })
        .catch((e) => { if (alive) setError(e as CfApiError); });
    }, 250);
    return () => { alive = false; window.clearTimeout(t); };
  }, [open, orderId, ids, date, credit]);
  const raise = async () => {
    if (!orderId) return;
    setBusy(true); setError(null);
    try {
      const inv = await raiseInvoice({ orderId, cards: ids.split(','), invoiceDate: date, creditDays: credit === '' ? null : Number(credit), notes: notes || null });
      invalidateNavCounts();
      onRaised(inv);
    } catch (e) { setError(e as CfApiError); } finally { setBusy(false); }
  };
  const blocked = !plan ? 'Working it out…' : plan.problems.length ? 'Fix the points above first.' : null;
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="md" fullWidth fullScreen={fs.on} data-testid="raise-invoice-dialog">
      <Header title={`Raise invoice — ${cards[0]?.orderCode ?? ''}`} subtitle="A GST tax invoice of the ticked cards. It is numbered and issued when you raise it." fs={fs} onClose={onClose} busy={busy} />
      <DialogContent>
        <ErrorNotice error={error} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2, pt: 0.5 }}>
          <TextField type="date" label="Invoice date" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ max: todayIso(), 'data-testid': 'raise-date' }} />
          <TextField label="Credit days" value={credit} onChange={(e) => setCredit(e.target.value.replace(/[^0-9]/g, ''))} inputProps={{ inputMode: 'numeric', 'data-testid': 'raise-credit' }}
            helperText={plan?.dueDate ? `Pay by ${plan.dueDate}` : ' '} />
          <TextField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Box>
        {plan && (
          <Box sx={{ mt: 2, display: 'grid', gap: 1.5 }}>
            {plan.problems.length > 0 && (
              <Alert severity="warning" data-testid="raise-problems">
                <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.5 }}>Fill these in first</Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {plan.problems.map((p) => (
                    <li key={p.text}>{p.text}{p.fix && <Button size="small" onClick={() => navigate(appPath(company, p.fix!.to))} sx={{ ml: 1, py: 0, minWidth: 0 }}>{p.fix.label}</Button>}</li>
                  ))}
                </Box>
              </Alert>
            )}
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }} data-testid="raise-tax-words">
              {plan.buyer ? `To ${plan.buyer.name}${plan.buyer.gstin ? ` (GSTIN ${plan.buyer.gstin})` : ''}. ` : ''}
              {plan.isIgst == null ? '' : plan.isIgst ? `Inter-state (${plan.placeOfSupply?.name ?? ''}): IGST.` : `Within the state (${plan.placeOfSupply?.name ?? ''}): CGST + SGST.`}
            </Typography>
            <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, '& td, & th': { borderBottom: '1px solid var(--c-divider)', p: 0.75, textAlign: 'left' }, '& .n': { textAlign: 'right', fontFamily: 'var(--font-mono)' } }}>
              <thead><tr><th>What</th><th>HSN</th><th className="n">Taxable</th><th className="n">GST</th><th className="n">Tax</th><th className="n">Total</th></tr></thead>
              <tbody>
                {plan.lines.map((l) => (
                  <tr key={`${l.card}-${l.slNo}`} data-testid="raise-line">
                    <td>{l.description}</td><td>{l.hsnCode ?? '—'}</td><td className="n">{rupeeText(l.taxable, 2)}</td><td className="n">{l.gstRate == null ? '—' : `${l.gstRate} %`}</td>
                    <td className="n">{rupeeText((l.cgst ?? 0) + (l.sgst ?? 0) + (l.igst ?? 0), 2)}</td><td className="n">{rupeeText(l.total, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </Box>
            <Box sx={{ display: 'grid', justifyItems: 'end', gap: 0.25 }} data-testid="raise-totals">
              <Typography sx={{ fontSize: 13 }}>Taxable <Mono>{rupeeText(plan.totals.taxable, 2)}</Mono></Typography>
              {plan.isIgst ? <Typography sx={{ fontSize: 13 }}>IGST <Mono>{rupeeText(plan.totals.igst, 2)}</Mono></Typography>
                : <Typography sx={{ fontSize: 13 }}>CGST <Mono>{rupeeText(plan.totals.cgst, 2)}</Mono> · SGST <Mono>{rupeeText(plan.totals.sgst, 2)}</Mono></Typography>}
              <Typography sx={{ fontSize: 15, fontWeight: 600 }}>Invoice total <FlashOnChange value={plan.totals.grandTotal}><Mono>{rupeeText(plan.totals.grandTotal, 2)}</Mono></FlashOnChange></Typography>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{plan.totals.inWords}</Typography>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {blocked && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mr: 'auto', pl: 1 }}>{blocked}</Typography>}
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void raise()} disabled={busy || !!blocked} data-testid="raise-confirm"
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Raising…' : 'Raise invoice'}</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * RECORD A PAYMENT against an invoice (prefilled with what it still owes) or an order (its open invoices listed).
 * Part payments are normal; what is more than owed is kept on account for the order.
 */
export function ReceiptDialog({ open, orderId, invoiceId = null, onClose, onSaved }: {
  open: boolean; orderId: number | null; invoiceId?: number | null; onClose: () => void; onSaved: (r: ReceiptResult) => void;
}) {
  const fs = useFullScreen('accounts-receipt');
  const [pay, setPay] = useState<OrderPayments | null>(null);
  const [f, setF] = useState({ invoiceId: '' as string, date: todayIso(), amount: '', mode: 'bank' as ReceiptMode, reference: '', notes: '' });
  const [error, setError] = useState<CfApiError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !orderId) return;
    setError(null); setPay(null);
    orderPayments(orderId).then((p) => {
      setPay(p);
      const inv = p.invoices.find((i) => i.id === invoiceId) ?? p.invoices.find((i) => i.outstanding > 0) ?? null;
      setF({ invoiceId: inv ? String(inv.id) : '', date: todayIso(), amount: inv ? String(inv.outstanding) : '', mode: 'bank', reference: '', notes: '' });
    }).catch((e) => setError(e as CfApiError));
  }, [open, orderId, invoiceId]);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const r = await recordReceipt({ orderId, invoiceId: f.invoiceId ? Number(f.invoiceId) : null, receiptDate: f.date, amount: f.amount, mode: f.mode, reference: f.reference || null, notes: f.notes || null });
      invalidateNavCounts();
      onSaved(r);
    } catch (e) { setError(e as CfApiError); } finally { setBusy(false); }
  };
  const inv = pay?.invoices.find((i) => String(i.id) === f.invoiceId) ?? null;
  const amt = Number(f.amount);
  const blocked = !f.amount || !(amt > 0) ? 'Type the amount received.' : null;
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth fullScreen={fs.on} data-testid="receipt-dialog">
      <Header title={`Record a payment${pay ? ` — ${pay.order.code}` : ''}`} subtitle="Money received from the customer. A part payment is fine." fs={fs} onClose={onClose} busy={busy} />
      <DialogContent>
        <ErrorNotice error={error} />
        {pay && (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5 }} data-testid="receipt-owed">
            {pay.order.customer ?? ''} owes {rupeeText(pay.outstanding)} on {pay.invoices.filter((i) => i.outstanding > 0).length} invoice{pay.invoices.filter((i) => i.outstanding > 0).length === 1 ? '' : 's'}{pay.onAccount > 0 ? `; ${rupeeText(pay.onAccount)} is on account` : ''}.
          </Typography>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <TextField select label="Against" value={f.invoiceId} onChange={(e) => { const i = pay?.invoices.find((x) => String(x.id) === e.target.value); setF({ ...f, invoiceId: e.target.value, amount: i ? String(i.outstanding) : f.amount }); }}
            sx={{ gridColumn: '1 / -1' }} inputProps={{ 'data-testid': 'receipt-invoice' }} helperText={inv ? `Owes ${rupeeText(inv.outstanding, 2)} of ${rupeeText(inv.grandTotal, 2)}` : 'The order: its oldest open invoices first'}>
            <MenuItem value="">The order (oldest invoice first)</MenuItem>
            {(pay?.invoices ?? []).map((i) => <MenuItem key={i.id} value={String(i.id)}>{i.invoiceNo} · {rupeeText(i.outstanding)} owed{i.dueDate ? ` · pay by ${i.dueDate}` : ''}</MenuItem>)}
          </TextField>
          <TextField label="Amount received (₹)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} inputProps={{ inputMode: 'decimal', 'data-testid': 'receipt-amount', style: { fontFamily: 'var(--font-mono)' } }} />
          <TextField type="date" label="Received on" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} InputLabelProps={{ shrink: true }} inputProps={{ max: todayIso() }} />
          <TextField select label="How" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as ReceiptMode })}>
            {Object.entries(RECEIPT_MODES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </TextField>
          <TextField label="Reference (UTR, cheque no.)" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} inputProps={{ 'data-testid': 'receipt-reference' }} />
          <TextField label="Notes (optional)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} sx={{ gridColumn: '1 / -1' }} />
        </Box>
        {inv && amt > inv.outstanding + 0.004 && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 1 }}>More than this invoice owes: the rest goes to the order&rsquo;s other invoices, then on account.</Typography>
        )}
      </DialogContent>
      <DialogActions>
        {blocked && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mr: 'auto', pl: 1 }}>{blocked}</Typography>}
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void save()} disabled={busy || !!blocked || !orderId} data-testid="receipt-save"
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : 'Record payment'}</Button>
      </DialogActions>
    </Dialog>
  );
}
