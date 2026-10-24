import { useEffect, useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import { CfApiError } from '../api/client';
import type { SalesOrder } from '../api/types';
import { listReceipts, removeReceipt, ACCOUNTS_MANAGE, type Receipt, type ReceiptResult } from '../api/accounts';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { useFullScreen } from '../hooks/useFullScreen';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { rupeeText } from '../lib/money';
import { DataTable, type DataColumn } from '../components/DataTable';
import { EmptyState, ErrorNotice, Mono, PageHeader } from '../components/ui';
import { FullScreenFrame, FullScreenToggle } from '../components/FullScreen';
import { OrderPicker } from '../components/ServerPicker';
import { PromptDialog } from '../components/PromptDialog';
import { ReceiptDialog } from '../components/Accounts/AccountsDialogs';
import { useToast } from '../components/toastContext';
import { SuccessCheck, celebrate } from '../motion';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/**
 * ACCOUNTS › RECEIPTS (§74): money received from customers — against an invoice or an order, part payments included.
 * "Record a payment": choose the order, the dialog lists what it owes, prefilled.
 */
export default function Receipts() {
  const company = useCompanySlug();
  const toast = useToast();
  const canManage = useIsPermitted()(ACCOUNTS_MANAGE);
  const fs = useFullScreen('accounts-receipts');
  const [search, setSearch] = useUrlParam('search', '');
  const [typed, setTyped] = useState(search);
  const list = useLoad(() => listReceipts({ search: search || undefined }), [search]);
  const [pick, setPick] = useState<SalesOrder | null>(null);
  const [recording, setRecording] = useState(false);
  const [removing, setRemoving] = useState<Receipt | null>(null);
  useEffect(() => { const t = window.setTimeout(() => { if (typed !== search) setSearch(typed); }, 300); return () => window.clearTimeout(t); }, [typed, search, setSearch]);
  // Motion: a recorded payment draws a check beside the button; the payment that makes the order fully paid celebrates once.
  const [recorded, setRecorded] = useState(0);
  const onSaved = (r: ReceiptResult) => {
    setRecording(false); toast.success(r.closed ? `${r.message} ${r.order.order.code} is closed.` : r.message); list.reload();
    setRecorded((n) => n + 1);
    if (r.order.fullyPaid && r.allocated > 0) celebrate(document.querySelector('[data-testid="receipt-new"]'));
  };
  const columns: DataColumn<Receipt>[] = [
    { key: 'date', header: 'Date', sortValue: (r) => r.date, render: (r) => <Mono>{r.date}</Mono>, alwaysVisible: true },
    { key: 'code', header: 'Receipt', sortValue: (r) => r.code, render: (r) => <Mono muted>{r.code}</Mono> },
    { key: 'order', header: 'Order', sortValue: (r) => r.order.code, render: (r) => <Mono><Box component={Link} to={appPath(company, `orders/${r.order.id}`)} sx={linkSx}>{r.order.code}</Box></Mono> },
    { key: 'customer', header: 'Customer', sortValue: (r) => r.customer ?? '', render: (r) => r.customer ?? '—' },
    { key: 'invoice', header: 'Against', sortValue: (r) => r.invoice?.invoiceNo ?? '', render: (r) => (r.invoice ? <Box component={Link} to={appPath(company, `invoices/${r.invoice.id}`)} sx={linkSx}>{r.invoice.invoiceNo}</Box> : 'The order') },
    { key: 'amount', header: 'Amount', numeric: true, sortValue: (r) => r.amount, render: (r) => <Mono>{rupeeText(r.amount, 2)}</Mono>, alwaysVisible: true },
    { key: 'onAccount', header: 'On account', numeric: true, sortValue: (r) => r.onAccount, render: (r) => (r.onAccount > 0.004 ? <Mono>{rupeeText(r.onAccount, 2)}</Mono> : <Mono muted>—</Mono>) },
    { key: 'mode', header: 'How', sortValue: (r) => r.modeLabel, render: (r) => r.modeLabel },
    { key: 'reference', header: 'Reference', sortValue: (r) => r.reference ?? '', render: (r) => r.reference ?? '—' },
  ];
  return (
    <FullScreenFrame on={fs.on} onExit={() => fs.set(false)}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
        <PageHeader title="Receipts" subtitle="Payments received from customers."
          actions={(
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField size="small" placeholder="Search" value={typed} onChange={(e) => setTyped(e.target.value)} inputProps={{ 'aria-label': 'Search receipts' }} />
              <FullScreenToggle on={fs.on} onToggle={fs.toggle} />
            </Box>
          )} />
        {canManage && (
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }} data-testid="receipt-start">
            <OrderPicker openOnly={false} value={pick} onChange={setPick} label="Order the payment is for" size="small" sx={{ minWidth: 320 }} />
            <Button variant="contained" startIcon={<PaymentsRounded />} disabled={!pick} onClick={() => setRecording(true)} data-testid="receipt-new">Record a payment</Button>
            {recorded > 0 && <SuccessCheck key={recorded} size={20} label="Payment recorded" />}
          </Box>
        )}
        <ErrorNotice error={list.error} onRetry={list.reload} />
        <DataTable rows={list.data?.rows ?? []} columns={columns} getRowId={(r) => r.id} loading={list.loading && !list.data} storageKey="accounts-receipts" exportName="receipts"
          defaultSortKey="date" defaultSortDir="desc"
          rowActions={canManage ? (r) => <Button size="small" color="error" onClick={() => setRemoving(r)}>Remove</Button> : undefined}
          empty={<EmptyState icon={<PaymentsRounded />} title="No payments recorded yet." />} />
        {list.data && list.data.rows.length > 0 && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
            {list.data.rows.length} payment{list.data.rows.length === 1 ? '' : 's'} · {rupeeText(list.data.rows.reduce((t, r) => t + r.amount, 0))} received
          </Typography>
        )}
        <ReceiptDialog open={recording} orderId={pick?.id ?? null} onClose={() => setRecording(false)} onSaved={onSaved} />
        <PromptDialog open={!!removing} title={`Remove ${removing?.code ?? ''}?`} body="Use this for a payment entered by mistake. It is kept, with your reason." label="Why is it removed?" confirmLabel="Remove" danger
          onClose={() => setRemoving(null)}
          onConfirm={async (reason) => {
            try { await removeReceipt(removing!.id, reason); invalidateNavCounts(); toast.success(`${removing!.code} removed.`); setRemoving(null); list.reload(); } catch (e) { toast.error((e as CfApiError).message); throw e; }
          }} />
      </Box>
    </FullScreenFrame>
  );
}
