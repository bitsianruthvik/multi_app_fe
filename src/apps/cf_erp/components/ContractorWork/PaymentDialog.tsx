import { useEffect, useState, type KeyboardEvent } from 'react';
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { CfApiError } from '../../api/client';
import { recordPayment, type PaymentResult, type WoDetail } from '../../api/contractorWorkOrders';
import { useFullScreen } from '../../hooks/useFullScreen';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { rupeeText } from '../../lib/money';
import { paymentAmount, todayText, tonnesText } from '../../lib/contractorWorkOrders';
import { DialogCloseButton } from '../FormDialog';
import { FullScreenToggle } from '../FullScreen';
import { ErrorNotice, Mono } from '../ui';

type Row = { tonnes: string; rate: string; amount: string };

/**
 * A WEEK'S PAYMENT to the contractor (Step 6): per operation the tonnes done this week (prefilled with nothing), the rate
 * per tonne (prefilled from the PO) and the amount (tonnes × rate unless typed — a deduction, an advance, the balance).
 * Tonnes done move the contractor PO like a GRN; all done closes it. Enter moves on, Ctrl+Enter records.
 */
export function PaymentDialog({ open, wo, onClose, onSaved }: { open: boolean; wo: WoDetail | null; onClose: () => void; onSaved: (r: PaymentResult) => void }) {
  const fs = useFullScreen('contractor-payment');
  const [rows, setRows] = useState<Record<number, Row>>({});
  const [date, setDate] = useState(todayText());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<CfApiError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !wo) return;
    setRows(Object.fromEntries(wo.lines.map((l) => [l.id, { tonnes: '', rate: l.rate == null ? '' : String(l.rate), amount: wo.lane === 'completed' ? String(Math.max(0, l.doneValue - l.paid)) : '' }])));
    setDate(todayText()); setReference(''); setNotes(''); setError(null);
  }, [open, wo]);
  const complete = wo?.lane === 'completed';
  const total = Math.round(Object.values(rows).reduce((t, r) => t + paymentAmount(r.tonnes, r.rate, r.amount), 0) * 100) / 100;
  const blocked = !wo ? 'Loading…' : total <= 0 && !Object.values(rows).some((r) => Number(r.tonnes) > 0) ? 'Enter the tonnes done or an amount.' : null;
  const save = async () => {
    if (!wo || blocked || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await recordPayment(wo.id, {
        paymentDate: date, reference: reference || null, notes: notes || null,
        lines: wo.lines.map((l) => ({ poLineId: l.id, tonnes: rows[l.id]?.tonnes || null, rate: rows[l.id]?.rate || null, amount: rows[l.id]?.amount || null })),
      });
      invalidateNavCounts();
      onSaved(r);
    } catch (e) { setError(e as CfApiError); } finally { setBusy(false); }
  };
  const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void save(); return; }
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
      e.preventDefault();
      const all = [...document.querySelectorAll<HTMLInputElement>('[data-testid="payment-dialog"] input:not([disabled])')];
      const i = all.indexOf(e.target as HTMLInputElement);
      all[i + 1]?.focus();
    }
  };
  const set = (id: number, k: keyof Row, v: string) => setRows((r) => ({ ...r, [id]: { ...r[id], [k]: v.replace(/[^0-9.]/g, '') } }));
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="md" fullWidth fullScreen={fs.on} data-testid="payment-dialog" onKeyDown={onKey}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          Record a payment{wo ? ` — ${wo.code} · ${wo.contractor.name}` : ''}
          <Box sx={{ fontSize: 13, fontWeight: 400, color: 'var(--c-text-2)', mt: 0.5 }}>
            {complete ? 'All the work is done — record what is still owed.' : 'This week: the tonnes done per operation. The amount is tonnes × rate unless you type it.'}
          </Box>
        </Box>
        <FullScreenToggle on={fs.on} onToggle={fs.toggle} />
        <DialogCloseButton onClose={onClose} disabled={busy} />
      </DialogTitle>
      <DialogContent>
        <ErrorNotice error={error} />
        {wo && (
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, '& td, & th': { py: 0.75, px: 0.75, borderBottom: '1px solid var(--c-divider)', textAlign: 'left' } }}>
            <thead><tr><th>Operation</th><th>Left</th><th>Tonnes done</th><th>₹ / t</th><th>Amount (₹)</th></tr></thead>
            <tbody>
              {wo.lines.map((l, i) => {
                const r = rows[l.id] ?? { tonnes: '', rate: '', amount: '' };
                return (
                  <tr key={l.id} data-testid="payment-line">
                    <td>{l.operation.name}<Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{tonnesText(l.done)} of {tonnesText(l.tonnes)} done · {rupeeText(l.paid)} paid</Typography></td>
                    <td><Mono>{tonnesText(l.pending)}</Mono></td>
                    <td><TextField size="small" value={r.tonnes} disabled={complete} autoFocus={i === 0 && !complete} onChange={(e) => set(l.id, 'tonnes', e.target.value)}
                      inputProps={{ inputMode: 'decimal', 'data-testid': 'payment-tonnes', style: { fontFamily: 'var(--font-mono)', width: 90 } }} /></td>
                    <td><TextField size="small" value={r.rate} onChange={(e) => set(l.id, 'rate', e.target.value)} inputProps={{ inputMode: 'decimal', 'data-testid': 'payment-rate', style: { fontFamily: 'var(--font-mono)', width: 90 } }} /></td>
                    <td><TextField size="small" value={r.amount} placeholder={String(paymentAmount(r.tonnes, r.rate, ''))} onChange={(e) => set(l.id, 'amount', e.target.value)}
                      inputProps={{ inputMode: 'decimal', 'data-testid': 'payment-amount', style: { fontFamily: 'var(--font-mono)', width: 110 } }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </Box>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 2 }}>
          <TextField type="date" label="Paid on" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ max: todayText(), 'data-testid': 'payment-date' }} />
          <TextField label="Reference (UTR, cheque no.)" value={reference} onChange={(e) => setReference(e.target.value)} inputProps={{ 'data-testid': 'payment-reference' }} />
          <TextField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} sx={{ gridColumn: '1 / -1' }} />
        </Box>
        <Typography sx={{ mt: 1.5, fontSize: 14 }} data-testid="payment-total">Total <Mono>{rupeeText(total, 2)}</Mono></Typography>
      </DialogContent>
      <DialogActions>
        {blocked && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mr: 'auto', pl: 1 }}>{blocked}</Typography>}
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void save()} disabled={busy || !!blocked} data-testid="payment-save"
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : 'Record payment (Ctrl+Enter)'}</Button>
      </DialogActions>
    </Dialog>
  );
}
