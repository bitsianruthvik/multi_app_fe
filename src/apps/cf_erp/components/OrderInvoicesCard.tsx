import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { makeInvoice, orderInvoices } from '../api/gst';
import type { CfApiError } from '../api/client';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { dayText } from '../lib/money';
import { ErrorNotice, Mono, SectionCard } from './ui';
import { InvoicesTable } from './InvoicesTable';
import { useToast } from './toastContext';

/**
 * A quiet card on the order's Details: the invoices made for its dispatches,
 * and any shipment that has none yet, with a button to make one.
 */
export function OrderInvoicesCard({ orderId }: { orderId: number }) {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_orders_manage');
  const data = useLoad(() => orderInvoices(orderId), [orderId]);
  const [busy, setBusy] = useState<number | 'all' | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const rows = data.data?.rows ?? [];
  const waiting = data.data?.uninvoiced ?? [];
  if (!data.error && data.data && rows.length === 0 && waiting.length === 0) return null;
  const make = async (key: number | 'all', movementIds?: number[]) => {
    setBusy(key); setError(null);
    try {
      const inv = await makeInvoice(orderId, movementIds);
      toast.success('Invoice draft made.');
      navigate(appPath(company, `invoices/${inv.id}`));
    } catch (e) { setError(e as CfApiError); setBusy(null); }
  };
  return (
    <SectionCard flush title="Invoices" subtitle="One tax invoice for each dispatch.">
      <ErrorNotice error={data.error ?? error} onRetry={data.error ? data.reload : undefined} sx={{ m: 2 }} />
      {waiting.length > 0 && (
        <Box data-testid="uninvoiced" sx={{ px: 2, py: 1.5, borderBottom: rows.length ? '1px solid var(--c-divider)' : undefined }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Shipped, not invoiced</Typography>
            {canManage && waiting.length > 1 && <Button size="small" variant="outlined" disabled={busy != null} onClick={() => void make('all')}>Make one invoice for all {waiting.length}</Button>}
          </Box>
          {waiting.map((w) => (
            <Box key={w.movementId} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5, flexWrap: 'wrap' }}>
              <Mono>{w.movementCode}</Mono>
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: 1, minWidth: 160 }}>line {w.lineNo} · {qtyText(w.quantity)} · <Mono muted>{dayText(w.date)}</Mono></Typography>
              {canManage && <Button size="small" disabled={busy != null} onClick={() => void make(w.movementId, [w.movementId])}>Make invoice</Button>}
            </Box>
          ))}
        </Box>
      )}
      {rows.length > 0 && (
        <InvoicesTable bare hideOrder storageKey="order-invoices" rows={rows} onOpen={(i) => navigate(appPath(company, `invoices/${i.id}`))} empty={null} />
      )}
    </SectionCard>
  );
}
