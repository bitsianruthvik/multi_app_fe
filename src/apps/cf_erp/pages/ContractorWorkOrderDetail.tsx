import { useEffect, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import { CfApiError } from '../api/client';
import { ACCOUNTS_MANAGE } from '../api/accounts';
import {
  cancelWorkOrder, closeWorkOrderShort, getContractorWorkOrder, removePayment, sendWorkOrderAgain,
} from '../api/contractorWorkOrders';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useFullScreen } from '../hooks/useFullScreen';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { rupeeText } from '../lib/money';
import { LANE_FAMILY, tonnesText } from '../lib/contractorWorkOrders';
import { Badge, DetailSkeleton, ErrorNotice, Fact, Mono, PageHeader, SectionCard } from '../components/ui';
import { FlashOnChange, SuccessCheck } from '../motion';
import { useSavedCheck } from '../hooks/useSavedCheck';
import { FullScreenFrame, FullScreenToggle } from '../components/FullScreen';
import { PromptDialog } from '../components/PromptDialog';
import { PaymentDialog } from '../components/ContractorWork/PaymentDialog';
import { useToast } from '../components/toastContext';

const tableSx = { width: '100%', borderCollapse: 'collapse', fontSize: 13, '& td, & th': { py: 0.6, px: 0.75, borderBottom: '1px solid var(--c-divider)', textAlign: 'left' }, '& th': { color: 'var(--c-text-2)', fontWeight: 600 } };

/**
 * ACCOUNTS › WORK ORDER (Step 6): one contractor work order — its PO lines (operation, tonnes, rate, done, paid), the
 * cells it covers, the weekly payments, and Record payment (P) / Close short / Cancel / Send again.
 */
export default function ContractorWorkOrderDetail() {
  const { id } = useParams();
  const company = useCompanySlug();
  const toast = useToast();
  const can = useIsPermitted();
  const fs = useFullScreen('accounts-work-order');
  const load = useLoad(() => getContractorWorkOrder(Number(id)), [id]);
  const [paying, setPaying] = useState(false);
  const [ask, setAsk] = useState<null | 'close' | 'cancel' | { removeId: number }>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  // Motion: a tick by the lane once a payment pays it in full; the lane badge and "Paid" flash when they change.
  const [paidTick, markPaid] = useSavedCheck();
  const wo = load.data;
  const manage = can(ACCOUNTS_MANAGE);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'p' || e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).tagName === 'INPUT' || document.querySelector('.MuiDialog-root')) return;
      if (manage && wo?.actions.pay) { e.preventDefault(); setPaying(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [manage, wo]);
  if (!wo) return load.error ? <ErrorNotice error={load.error} onRetry={load.reload} /> : <DetailSkeleton />;
  const done = (text: string) => { toast.success(text); load.reload(); invalidateNavCounts(); };
  const run = async (fn: () => Promise<unknown>, text: string) => {
    setError(null);
    try { await fn(); done(text); } catch (e) { setError(e as CfApiError); }
  };
  return (
    <FullScreenFrame on={fs.on} onExit={() => fs.set(false)}>
      <PageHeader title={<Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}><Mono sx={{ fontWeight: 600 }}>{wo.code}</Mono><FlashOnChange value={wo.lane}><Badge family={LANE_FAMILY[wo.lane]} label={wo.laneLabel} noIcon /></FlashOnChange>{paidTick > 0 && <SuccessCheck key={paidTick} size={20} label="Paid in full" />}</Box>}
        subtitle={`${wo.contractor.name} · ${wo.order.code}${wo.productionOrder ? ` · ${wo.productionOrder.label}` : ''}`}
        actions={(
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            {manage && wo.actions.pay && <Button variant="contained" startIcon={<PaymentsRounded />} onClick={() => setPaying(true)} data-testid="wo-pay">Record payment (P)</Button>}
            {wo.actions.sendAgain && <Button variant="outlined" onClick={() => void run(() => sendWorkOrderAgain(wo.id), `${wo.code} sent to Management again.`)} data-testid="wo-send-again">Send again</Button>}
            {manage && wo.actions.closeShort && <Button color="inherit" onClick={() => setAsk('close')} data-testid="wo-close-short">Close short</Button>}
            {manage && wo.actions.cancel && <Button color="error" onClick={() => setAsk('cancel')} data-testid="wo-cancel">Cancel</Button>}
            <FullScreenToggle on={fs.on} onToggle={fs.toggle} />
          </Box>
        )} />
      <ErrorNotice error={error} />
      {wo.kind !== 'po' && (
        <Typography sx={{ mb: 2, fontSize: 13.5 }} data-testid="wo-older">
          An older work order (cells on locked pieces). It is read on <Box component={Link} to={appPath(company, `work-orders/${wo.id}`)}>its own page</Box>.
        </Typography>
      )}
      {wo.sentBack && <Typography sx={{ mb: 2, fontSize: 13.5, color: 'var(--c-danger-700)' }}>{wo.sentBack} Change it on the PO or send it again.</Typography>}
      {(wo.pendingApprovals ?? []).length > 0 && (
        <Typography sx={{ mb: 2, fontSize: 13.5 }} data-testid="wo-pending">With Management: {(wo.pendingApprovals ?? []).map((a) => a.typeLabel).join(', ')}.</Typography>
      )}
      <SectionCard title="What it is">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(6, minmax(0, 1fr))' }, gap: 1.5 }}>
          <Fact label="Sales order"><Box component={Link} to={appPath(company, `orders/${wo.order.id}`)} sx={{ color: 'inherit' }}><Mono>{wo.order.code}</Mono></Box></Fact>
          <Fact label="Production order">{wo.productionOrder ? <Box component={Link} to={appPath(company, `production-orders/${wo.productionOrder.id}`)} sx={{ color: 'inherit' }}><Mono>{wo.productionOrder.code}</Mono></Box> : '—'}</Fact>
          <Fact label="Contractor PO">{wo.purchaseOrder ? <Box component={Link} to={appPath(company, `purchase-orders/${wo.purchaseOrder.id}`)} sx={{ color: 'inherit' }}><Mono>{wo.purchaseOrder.code}</Mono> · {wo.purchaseOrder.stageLabel}</Box> : '—'}</Fact>
          <Fact label="Work">{tonnesText(wo.done)} of {tonnesText(wo.tonnes)} ({wo.pct} %)</Fact>
          <Fact label="Value">{rupeeText(wo.value, 2)}</Fact>
          <Fact label="Paid"><FlashOnChange value={wo.paid}>{rupeeText(wo.paid, 2)}{wo.owed > 0 ? ` · ${rupeeText(wo.owed, 2)} owed` : ''}</FlashOnChange></Fact>
        </Box>
      </SectionCard>
      <Box sx={{ mt: 2 }}>
        <SectionCard title="Operations" subtitle="One contractor PO line each, paid by the tonne.">
          <Box component="table" sx={tableSx} data-testid="wo-lines">
            <thead><tr><th>Operation</th><th>Tonnes</th><th>Rate (₹/t)</th><th>Value</th><th>Done</th><th>Left</th><th>Paid</th></tr></thead>
            <tbody>
              {wo.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.operation.name}</td><td><Mono>{tonnesText(l.tonnes)}</Mono></td><td><Mono>{l.rate ?? '—'}</Mono></td><td><Mono>{rupeeText(l.value, 2)}</Mono></td>
                  <td><Mono>{tonnesText(l.done)}</Mono></td><td><Mono>{tonnesText(l.pending)}</Mono>{l.closed > 0 ? ` (${tonnesText(l.closed)} closed short)` : ''}</td><td><Mono>{rupeeText(l.paid, 2)}</Mono></td>
                </tr>
              ))}
            </tbody>
          </Box>
        </SectionCard>
      </Box>
      <Box sx={{ mt: 2 }}>
        <SectionCard title="Payments" subtitle={wo.payments.length ? 'Week by week. A payment entered by mistake can be removed (its tonnes go back).' : 'No payment yet.'}>
          {wo.payments.length > 0 && (
            <Box component="table" sx={tableSx} data-testid="wo-payments">
              <thead><tr><th>Date</th><th>Reference</th><th>Tonnes</th><th>Amount</th><th>By</th><th /></tr></thead>
              <tbody>
                {wo.payments.map((p) => (
                  <Box component="tr" key={p.id} sx={{ opacity: p.removed ? 0.5 : 1 }}>
                    <td>{p.date}</td><td>{p.reference ?? '—'}</td><td><Mono>{tonnesText(p.tonnes)}</Mono></td><td><Mono>{rupeeText(p.amount, 2)}</Mono></td><td>{p.by ?? ''}</td>
                    <td>{p.removed ? `Removed: ${p.removed.reason ?? ''}` : manage ? <Button size="small" color="inherit" onClick={() => setAsk({ removeId: p.id })}>Remove</Button> : null}</td>
                  </Box>
                ))}
              </tbody>
            </Box>
          )}
        </SectionCard>
      </Box>
      <Box sx={{ mt: 2 }}>
        <SectionCard title="What it covers" subtitle={`${wo.scope.length} cell${wo.scope.length === 1 ? '' : 's'} — BOM row × operation of the production order. Their steps show "with ${wo.contractor.name} (${wo.code})".`}>
          <Box component="table" sx={tableSx} data-testid="wo-scope">
            <thead><tr><th>Row</th><th>Operation</th><th>Qty</th><th>Tonnes</th></tr></thead>
            <tbody>
              {wo.scope.map((s) => (
                <tr key={`${s.rowKey}|${s.operation.id}`}><td>{s.name}</td><td>{s.operation.name}</td><td><Mono>{s.quantity}</Mono></td><td><Mono>{tonnesText(s.tonnes)}</Mono></td></tr>
              ))}
            </tbody>
          </Box>
        </SectionCard>
      </Box>
      <PaymentDialog open={paying} wo={wo} onClose={() => setPaying(false)}
        onSaved={(r) => { setPaying(false); if (r.closed) markPaid(); done(r.closed ? `Payment recorded — ${wo.code} is ${r.workOrder.laneLabel.toLowerCase()}.` : `Payment of ${rupeeText(r.payment.amount, 2)} recorded.`); }} />
      <PromptDialog open={ask === 'close'} title={`Close ${wo.code} short`} label="Why (Management reads it)" confirmLabel="Ask Management"
        body="The contractor will not do the rest. Management approves the close; what was done stays paid for."
        onConfirm={async (reason) => { await closeWorkOrderShort(wo.id, reason); done('Close short sent to Management.'); }} onClose={() => setAsk(null)} />
      <PromptDialog open={ask === 'cancel'} title={`Cancel ${wo.code}`} label="Why" confirmLabel="Cancel the work order" danger
        body="Its contractor PO is cancelled and the cells go back in-house."
        onConfirm={async (reason) => { await cancelWorkOrder(wo.id, reason); done(`${wo.code} cancelled.`); }} onClose={() => setAsk(null)} />
      <PromptDialog open={typeof ask === 'object' && ask !== null} title="Remove this payment" label="Why (it was entered by mistake…)" confirmLabel="Remove" danger
        body="Its tonnes go back off the contractor PO."
        onConfirm={async (reason) => { if (typeof ask === 'object' && ask) { await removePayment(ask.removeId, reason); done('Payment removed.'); } }} onClose={() => setAsk(null)} />
    </FullScreenFrame>
  );
}
