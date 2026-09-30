import { useEffect, useState } from 'react';
import { Box, TextField } from '@mui/material';
import { cfApi, CfApiError } from '../../api/client';
import type { SalesOrder } from '../../api/types';
import { CONFIRM_MOVE } from '../../lib/orders';
import { ConfirmDialog } from '../ConfirmDialog';

/** A customer order is confirmed with a date somewhere: on the order, or on every line. */
const orderNeedsDate = (o: SalesOrder) =>
  o.orderType === 'customer' && !o.committedDate && (o.lines ?? []).some((l) => !l.committedDate);

/**
 * The Confirm question. When the order has no committed date it asks for one
 * right here — a date field, then one press saves it and confirms — instead of
 * sending the person off to the header to find out.
 */
export function ConfirmOrderDialog({ open, order, onClose, onConfirmed }: {
  open: boolean;
  order: SalesOrder;
  onClose: () => void;
  onConfirmed: (saved: SalesOrder) => void;
}) {
  const needsDate = orderNeedsDate(order);
  const [date, setDate] = useState('');
  useEffect(() => { if (open) setDate(''); }, [open]);
  const missing = needsDate && !date;
  return (
    <ConfirmDialog open={open} title="Confirm order?" confirmLabel={missing ? 'Choose a date first' : 'Confirm'}
      entityName={`${order.code}${order.title ? ` · ${order.title}` : ''}`}
      body={(
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          <Box>{CONFIRM_MOVE.confirmed}</Box>
          {needsDate && (
            <TextField label="Committed date" type="date" size="small" value={date} autoFocus required
              onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }}
              helperText="This order has no committed date yet. Say when it is promised." />
          )}
        </Box>
      )}
      onClose={onClose}
      onConfirm={async () => {
        if (missing) throw new CfApiError(0, 'Choose the committed date first.');
        if (needsDate) await cfApi.put<SalesOrder>(`/orders/${order.id}`, { committedDate: date });
        onConfirmed(await cfApi.post<SalesOrder>(`/orders/${order.id}/status`, { status: 'confirmed' }));
      }} />
  );
}
