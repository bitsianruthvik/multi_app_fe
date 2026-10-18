import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Checkbox, TextField, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import { CfApiError } from '../api/client';
import { getBillingBoard, ACCOUNTS_MANAGE, type BillingBoard, type BillingCard, type RaisedInvoice, type ReceiptResult } from '../api/accounts';
import { useCompanySlug } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { useFullScreen } from '../hooks/useFullScreen';
import { appPath } from '../navMeta';
import { rupeeText } from '../lib/money';
import { canInvoiceTogether, cardWhen, LANE_HELP, sumAmounts, toggleCard } from '../lib/accounts';
import { Badge, DangerBadge, EmptyState, ErrorNotice, ListSkeleton, Mono, PageHeader } from '../components/ui';
import { FullScreenFrame, FullScreenToggle } from '../components/FullScreen';
import { RaiseInvoiceDialog, ReceiptDialog } from '../components/Accounts/AccountsDialogs';
import { openInvoicePdf } from '../lib/invoiceFiles';
import { useToast } from '../components/toastContext';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

function Card({ c, ticked, canManage, onTick, onPay }: { c: BillingCard; ticked: boolean; canManage: boolean; onTick: () => void; onPay: () => void }) {
  const company = useCompanySlug();
  const toast = useToast();
  const red = c.overdue;
  return (
    <Box data-testid="bill-card" data-card={c.id} data-status={c.status} data-overdue={red ? '1' : '0'}
      sx={{ border: `1px solid ${red ? 'var(--c-danger-500, #d32f2f)' : ticked ? 'var(--c-primary-500)' : 'var(--c-border)'}`, borderRadius: 'var(--r-md)', background: red ? 'var(--c-danger-50, #fdecea)' : 'var(--c-surface)', p: 1.25, display: 'grid', gap: 0.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
        {c.status === 'due' && canManage && (
          <Checkbox size="small" checked={ticked} onChange={onTick} sx={{ p: 0.25 }} inputProps={{ 'aria-label': `Tick ${c.milestone.label} of ${c.orderCode}`, ...({ 'data-testid': 'bill-tick' } as object) }} />
        )}
        <Mono chip><Box component={Link} to={appPath(company, `orders/${c.orderId}`)} sx={linkSx}>{c.orderCode}</Box></Mono>
        {red && <DangerBadge label="Overdue" />}
      </Box>
      <Typography sx={{ fontSize: 13.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{c.milestone.label}</Typography>
      <Typography sx={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-mono)' }} data-testid="bill-amount">{rupeeText(c.amount, 2)}</Typography>
      {c.note && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{c.note}</Typography>}
      <Typography sx={{ fontSize: 12, color: red ? 'var(--c-danger-700)' : 'var(--c-text-3)' }} data-testid="bill-when">{cardWhen(c)}</Typography>
      <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{c.customer ?? ''}</Typography>
      {c.invoice && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button size="small" onClick={() => void openInvoicePdf(c.invoice!.id).catch((e) => toast.error((e as CfApiError).message))} data-testid="bill-pdf">PDF</Button>
          <Button size="small" component={Link} to={appPath(company, `invoices/${c.invoice.id}`)}>Open</Button>
          {c.status === 'billed' && canManage && <Button size="small" variant="outlined" onClick={onPay} data-testid="bill-pay">Record payment</Button>}
        </Box>
      )}
    </Box>
  );
}

/**
 * ACCOUNTS › BILLING (§74): every payment milestone of every accepted order as a card, in swim lanes
 * Upcoming → Due to bill → Billed → Paid. Nothing is dragged: a card becomes due when its milestone happens (the
 * acceptance approved, material locked, a week of fabrication, a dispatch, a stage ticked, a date). Tick due cards of
 * one order and raise one GST invoice; record payments on billed cards.
 */
export default function Billing() {
  const toast = useToast();
  const canManage = useIsPermitted()(ACCOUNTS_MANAGE);
  const fs = useFullScreen('accounts-billing');
  const [search, setSearch] = useUrlParam('search', '');
  const [typed, setTyped] = useState(search);
  const [data, setData] = useState<BillingBoard | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [ticked, setTicked] = useState<BillingCard[]>([]);
  const [raising, setRaising] = useState(false);
  const [paying, setPaying] = useState<BillingCard | null>(null);
  const load = useCallback(() => {
    setError(null);
    getBillingBoard(search || undefined).then((b) => { setData(b); setTicked((t) => t.filter((x) => b.lanes.some((l) => l.cards.some((c) => c.id === x.id && c.status === 'due')))); })
      .catch((e) => setError(e as CfApiError));
  }, [search]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = window.setTimeout(() => { if (typed !== search) setSearch(typed); }, 300); return () => window.clearTimeout(t); }, [typed, search, setSearch]);
  const together = canInvoiceTogether(ticked);
  const empty = data && data.lanes.every((l) => !l.cards.length);
  const onRaised = (inv: RaisedInvoice) => {
    setRaising(false); setTicked([]);
    toast.success(`Invoice ${inv.invoiceNo} raised.`);
    void openInvoicePdf(inv.id).catch(() => undefined);
    load();
  };
  const onPaid = (r: ReceiptResult) => { setPaying(null); toast.success(r.closed ? `${r.message} ${r.order.order.code} is closed.` : r.message); load(); };
  return (
    <FullScreenFrame on={fs.on} onExit={() => fs.set(false)}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
        <PageHeader title="Billing" subtitle="Each payment milestone of an accepted order. Cards move by themselves when things happen."
          actions={(
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField size="small" placeholder="Search orders" value={typed} onChange={(e) => setTyped(e.target.value)} inputProps={{ 'aria-label': 'Search orders', 'data-testid': 'billing-search' }} />
              <FullScreenToggle on={fs.on} onToggle={fs.toggle} />
            </Box>
          )} />
        <ErrorNotice error={error} onRetry={load} />
        {data && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }} data-testid="billing-summary">
            <Badge family={data.counts.due ? 'warning' : 'neutral'} noIcon label={`${data.counts.due} due to bill · ${rupeeText(data.counts.dueAmount)}`} />
            {data.counts.overdue > 0 && <Badge family="danger" noIcon label={`${data.counts.overdue} overdue`} />}
          </Box>
        )}
        {canManage && ticked.length > 0 && (
          <Box data-testid="billing-selection" sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', p: 1.25, border: '1px solid var(--c-primary-300)', borderRadius: 'var(--r-md)', background: 'var(--c-primary-50)' }}>
            <Typography sx={{ fontSize: 13.5 }}>{ticked.length} card{ticked.length === 1 ? '' : 's'} of {ticked[0].orderCode} · <Mono>{rupeeText(sumAmounts(ticked), 2)}</Mono> before tax</Typography>
            <Tooltip title={together.reason ?? ''}>
              <span><Button variant="contained" size="small" startIcon={<ReceiptLongRounded />} disabled={!together.ok} onClick={() => setRaising(true)} data-testid="billing-raise">Raise invoice</Button></span>
            </Tooltip>
            <Button size="small" onClick={() => setTicked([])}>Clear</Button>
          </Box>
        )}
        {!data && !error && <ListSkeleton rows={4} />}
        {empty && <EmptyState icon={<ReceiptLongRounded />} title="Nothing to bill yet." body="Cards appear when a customer's acceptance is approved." />}
        {data && !empty && (
          <Box data-testid="billing-board" sx={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: { xs: '80vw', sm: 'minmax(250px, 1fr)' }, gap: 1.25, overflowX: 'auto', pb: 1, minWidth: 0 }}>
            {data.lanes.map((lane) => (
              <Box key={lane.key} data-testid="billing-lane" data-lane={lane.key} sx={{ background: 'var(--c-surface-2)', borderRadius: 'var(--r-md)', p: 1, display: 'grid', alignContent: 'start', gap: 1, minWidth: 0 }}>
                <Box sx={{ px: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-2)' }}>{lane.label}</Typography>
                    <Mono muted>{lane.cards.length} · {rupeeText(lane.total)}</Mono>
                  </Box>
                  <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{LANE_HELP[lane.key]}</Typography>
                </Box>
                {lane.cards.map((c) => (
                  <Card key={c.id} c={c} canManage={canManage} ticked={ticked.some((t) => t.id === c.id)} onTick={() => setTicked((t) => toggleCard(t, c))} onPay={() => setPaying(c)} />
                ))}
              </Box>
            ))}
          </Box>
        )}
        <RaiseInvoiceDialog open={raising} cards={ticked} onClose={() => setRaising(false)} onRaised={onRaised} />
        <ReceiptDialog open={!!paying} orderId={paying?.orderId ?? null} invoiceId={paying?.invoice?.id ?? null} onClose={() => setPaying(null)} onSaved={onPaid} />
      </Box>
    </FullScreenFrame>
  );
}
