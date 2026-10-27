import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { makeInvoice, uninvoicedOrders } from '../api/gst';
import type { CfApiError } from '../api/client';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { dayText } from '../lib/money';
import { ErrorNotice, Mono, SectionCard } from './ui';
import { useToast } from './toastContext';

/**
 * Accounts › Invoices: every order's shipments that have no invoice yet (2026-10-27). Dispatches made by someone
 * without Accounts wait here, so Accounts raises them without needing the sales order open. Hidden when there are none.
 */
export function ShippedNotInvoicedCard() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_accounts_manage');
  const data = useLoad(() => uninvoicedOrders(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const orders = data.data?.rows ?? [];
  if (!data.error && orders.length === 0) return null;
  const make = async (key: string, orderId: number, movementIds?: number[]) => {
    setBusy(key); setError(null);
    try {
      const inv = await makeInvoice(orderId, movementIds);
      toast.success('Invoice draft made.');
      navigate(appPath(company, `invoices/${inv.id}`));
    } catch (e) { setError(e as CfApiError); setBusy(null); }
  };
  return (
    <SectionCard flush title="Shipped, not invoiced" subtitle="Dispatches waiting for their tax invoice." sx={{ mb: 2 }}>
      <ErrorNotice error={data.error ?? error} onRetry={data.error ? data.reload : undefined} sx={{ m: 2 }} />
      <Box data-testid="shipped-not-invoiced">
        {orders.map((o, i) => (
          <Box key={o.orderId} sx={{ px: 2, py: 1.5, borderTop: i ? '1px solid var(--c-divider)' : undefined }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}><Mono>{o.orderCode}</Mono>{o.customer ? ` · ${o.customer}` : ''}</Typography>
              {canManage && o.shipments.length > 1 && <Button size="small" variant="outlined" disabled={busy != null} onClick={() => void make(`o${o.orderId}`, o.orderId)}>Make one invoice for all {o.shipments.length}</Button>}
            </Box>
            {o.shipments.map((w) => (
              <Box key={w.movementId} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5, flexWrap: 'wrap' }}>
                <Mono>{w.movementCode}</Mono>
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: 1, minWidth: 160 }}>line {w.lineNo} · {qtyText(w.quantity)} · <Mono muted>{dayText(w.date)}</Mono></Typography>
                {canManage && <Button size="small" disabled={busy != null} onClick={() => void make(`m${w.movementId}`, o.orderId, [w.movementId])}>Make invoice</Button>}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </SectionCard>
  );
}
