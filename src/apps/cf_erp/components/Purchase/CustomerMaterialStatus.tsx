import { useEffect, useState } from 'react';
import { Box, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { getCustomerReturns, type CustomerReturns } from '../../api/requisitions';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { qtyText } from '../../lib/inventory';
import { FormDialog } from '../FormDialog';
import { Badge, ErrorNotice, Mono } from '../ui';
import { Stagger } from '../../motion';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/**
 * The customer's material that is not simply earmarked (§68): what is to go BACK to them — more than the order
 * needs, or a substitute the MD did not accept — and the substitutes they sent, with where each stands. Worked out
 * by the server on every read; returning the material (Customer material › Return) takes it off the list.
 * `orderId` = one order (the MR screen); `partyId` = one customer (the Stock screen's customer view); none = every customer.
 */
export function CustomerMaterialStatus({ orderId = null, partyId = null, data: given = null, showEmpty = false }: { orderId?: number | null; partyId?: number | null; data?: CustomerReturns | null; showEmpty?: boolean }) {
  const company = useCompanySlug();
  const load = useLoad(() => (given ? Promise.resolve(given) : getCustomerReturns({ orderId, partyId })), [orderId, partyId, given]);
  const d = load.data;
  const toReturn = d?.toReturn ?? [];
  const subs = d?.substitutes ?? [];
  if (!d && !load.error) return null;
  if (d && !toReturn.length && !subs.length && !showEmpty) return null;
  return (
    <Box data-testid="customer-material-status" sx={{ display: 'grid', gap: 1 }}>
      <ErrorNotice error={load.error} onRetry={load.reload} />
      {toReturn.length > 0 && (
        <Box data-testid="to-return" sx={{ p: 1.25, borderRadius: 'var(--r-sm)', background: 'var(--c-warning-50)', display: 'grid', gap: 0.5 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-warning-800)' }}>To return to the customer</Typography>
          {/* Motion: the first rows rise in, staggered (first 12 only). */}
          <Stagger>{toReturn.map((r) => (
            <Box key={`${r.batch.id}-${r.why}`} data-testid="to-return-row" data-why={r.why} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 13 }}>
              {!orderId && <strong>{r.party.name ?? 'Customer'}</strong>}
              {!orderId && r.order && <Box component={Link} to={appPath(company, `orders/${r.order.id}`)} sx={{ ...linkSx, fontFamily: 'var(--font-mono)' }}>{r.order.code}</Box>}
              <Mono>{r.item.code ?? r.item.name}</Mono>
              <Mono>{qtyText(r.quantity)}{r.item.uom ? ` ${r.item.uom}` : ''}</Mono>
              <Box component={Link} to={appPath(company, `batches/${r.batch.id}`)} sx={{ ...linkSx, fontSize: 12, color: 'var(--c-text-3)' }}>lot {r.batch.code}</Box>
              <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{r.text}</Box>
            </Box>
          ))}</Stagger>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>It is theirs and not earmarked. Send it back from the order's Customer material tab (Return) — it then leaves this list.</Typography>
        </Box>
      )}
      {subs.length > 0 && (
        <Box data-testid="substitutes" sx={{ display: 'grid', gap: 0.5 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Different items the customer sent</Typography>
          <Stagger>{subs.map((s) => (
            <Box key={s.id} data-testid="substitute-row" data-status={s.status} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
              <Badge family={s.status === 'pending' ? 'warning' : s.status === 'approved' ? 'success' : 'danger'} label={s.statusLabel} />
              <Box component="span">{s.text}</Box>
              {s.request && <Box component={Link} to={appPath(company, 'plate-changes')} sx={{ ...linkSx, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.request.code}</Box>}
            </Box>
          ))}</Stagger>
        </Box>
      )}
      {showEmpty && d && !toReturn.length && !subs.length && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Nothing to return to customers.</Typography>}
    </Box>
  );
}

/**
 * Asks the date the customer promised to send the material (§68), before the MR makes their purchase order.
 * Proposed: the line's committed date, else the order's. With none, a date must be given.
 */
export function PromisedDateDialog({ open, proposed, onClose, onConfirm, submitLabel = 'Raise the MR' }: {
  open: boolean; proposed: string | null; onClose: () => void; onConfirm: (date: string) => Promise<void> | void;
  /** The MR screen's save asks it too (§71). */
  submitLabel?: string;
}) {
  const [date, setDate] = useState('');
  useEffect(() => { if (open) setDate(proposed ?? ''); }, [open, proposed]);
  return (
    <FormDialog open={open} title="The customer's promised date" onClose={onClose} onSubmit={async () => { await onConfirm(date); }} submitLabel={submitLabel} maxWidth="xs"
      submitDisabled={!/^\d{4}-\d{2}-\d{2}$/.test(date)}
      subtitle="The customer sends this material. Raising the MR makes a purchase order to them for what is open; production waits for this date.">
      <TextField label="Promised by" type="date" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} required
        inputProps={{ 'data-testid': 'promised-date' }}
        helperText={proposed ? 'Taken from the committed date. Change it if the customer said otherwise.' : 'The line and the order have no committed date — say when the customer will send it.'} />
    </FormDialog>
  );
}
