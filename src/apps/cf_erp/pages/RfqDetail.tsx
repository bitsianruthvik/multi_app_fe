import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import PrintRounded from '@mui/icons-material/PrintRounded';
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded';
import { awardLines, cancelRfq, closeRfq, createPos, declineRfqSupplier, getComparison, getRfq, markRfqSent, removeRfqSupplier, rfqEmail, type Comparison, type CreatedPos, type RfqDetail as Rfq, type RfqSupplier } from '../api/procurement';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { dayText } from '../lib/money';
import { awardBody, cheapestChoices, currentChoices, mailtoHref, sameChoices, type Choices } from '../lib/procurement';
import { openRfqPrint } from '../lib/rfqFiles';
import { DetailSkeleton, ErrorNotice, Fact, Mono, SectionCard } from '../components/ui';
import { DetailHeader, DetailLayout } from '../components/DetailLayout';
import { RfqStatusBadge, SupplierStatusBadge } from '../components/ProcurementUi';
import { RfqComparison } from '../components/RfqComparison';
import { QuoteDialog } from '../components/QuoteDialog';
import { AddSupplierDialog } from '../components/RfqDialogs';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';
import { BuyingStageBar } from '../components/Buying/BuyingStageBar';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/** One RFQ: the lines, who was asked, each supplier's quote, and the comparison that ends in purchase orders. */
export default function RfqDetail() {
  const id = Number(useParams().id);
  const company = useCompanySlug();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const [tab, setTab] = useUrlParam('tab', 'rfq');
  const load = useLoad(() => getRfq(id), [id]);
  const cmp = useLoad(() => getComparison(id), [id]);
  const rfq = load.data;
  useDetailTitle(rfq?.code ?? null);
  const [adding, setAdding] = useState(false);
  const [quoting, setQuoting] = useState<RfqSupplier | null>(null);
  const [declining, setDeclining] = useState<RfqSupplier | null>(null);
  const [removing, setRemoving] = useState<RfqSupplier | null>(null);
  const [ending, setEnding] = useState<'close' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<Choices>({});
  const [made, setMade] = useState<CreatedPos | null>(null);
  const comparison: Comparison | null = cmp.data;
  const saved = useMemo(() => (comparison ? currentChoices(comparison) : {}), [comparison]);
  useEffect(() => { setChoices(saved); }, [saved]);

  if (load.error) return <ErrorNotice error={load.error} onRetry={load.reload} />;
  if (!rfq) return <DetailSkeleton />;

  const set = (next: Rfq, message?: string) => { load.setData(next); cmp.reload(); if (message) toast.success(message); };
  const fail = (e: unknown) => toast.error((e as Error).message);
  const closed = rfq.status === 'cancelled' || rfq.status === 'awarded';
  const can = rfq.allowed ?? {};
  const canQuote = canManage && (can.enterQuote ?? can.quote ?? !closed);
  const canSupplier = canManage && (can.addSupplier ?? (rfq.status === 'draft' || rfq.status === 'sent'));
  const dirty = !!comparison && !sameChoices(choices, saved);
  const hasAwards = Object.values(saved).some((v) => v != null);
  const expiredQuote = (s: RfqSupplier) => !!rfq.quotes?.find((x) => x.id === s.quote?.id)?.expired;
  const canAwardNow = canManage && (can.award ?? !closed);
  const canPos = canManage && (can.createPos ?? (hasAwards && !closed)) && hasAwards;
  const linkedPos = made?.purchaseOrders ?? rfq.purchaseOrders ?? [];

  const saveAwards = async (next: Choices) => {
    if (!comparison) return;
    setBusy(true);
    try { set(await awardLines(rfq.id, awardBody(comparison, next)), 'Awards saved.'); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const print = async (s: RfqSupplier) => { try { await openRfqPrint(rfq.id, s.supplier.id); } catch (e) { fail(e); } };
  const email = async (s: RfqSupplier) => {
    try {
      const m = await rfqEmail(rfq.id, s.supplier.id);
      window.location.href = mailtoHref(m.to, m.subject, m.body);
      if (!m.to) toast.info(`${s.supplier.name} has no email on file — fill in the address yourself.`);
    } catch (e) { fail(e); }
  };
  const markSent = async (s: RfqSupplier) => { try { set(await markRfqSent(rfq.id, s.supplier.id), `Marked sent to ${s.supplier.name}.`); } catch (e) { fail(e); } };
  const makePos = async () => {
    setBusy(true);
    try {
      const r = await createPos(rfq.id);
      setMade(r); if (r.rfq) load.setData(r.rfq); else load.reload();
      cmp.reload();
      toast.success(`${r.purchaseOrders.length} draft purchase ${r.purchaseOrders.length === 1 ? 'order' : 'orders'} made.`);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const supplierCard = (s: RfqSupplier) => (
    <Box key={s.id} data-testid={`rfq-supplier-${s.supplier.id}`} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', py: 1.25, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
      <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
        <Box sx={{ fontWeight: 500 }}>{s.supplier.name}</Box>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{s.contactEmail ?? s.supplier.email ?? 'no email on file'}{s.sentAt ? ` · sent ${dayText(s.sentAt)}` : ''}</Typography>
      </Box>
      <SupplierStatusBadge status={s.status} />
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {expiredQuote(s) && <Box component="span" sx={{ alignSelf: 'center', fontSize: 12, color: 'var(--c-warning-800)' }}>quote expired</Box>}
        <Button size="small" startIcon={<PrintRounded />} onClick={() => void print(s)}>Print RFQ</Button>
        <Button size="small" startIcon={<MailOutlineRounded />} onClick={() => void email(s)}>Email</Button>
        {canSupplier && s.status === 'invited' && <Button size="small" onClick={() => void markSent(s)}>Mark sent</Button>}
        {canQuote && s.status !== 'declined' && <Button size="small" variant={s.quote ? 'outlined' : 'contained'} onClick={() => setQuoting(s)}>{s.quote ? 'Edit quote' : 'Enter quote'}</Button>}
        {canQuote && s.status !== 'declined' && !s.quote && <Button size="small" color="warning" onClick={() => setDeclining(s)}>Declined</Button>}
        {canSupplier && s.status === 'invited' && !s.quote && <Button size="small" color="error" onClick={() => setRemoving(s)}>Remove</Button>}
      </Box>
    </Box>
  );

  const rfqTab = (
    <>
      <SectionCard title="Suppliers" subtitle="Print the RFQ or email it from your own mail, mark it sent, then type in the quote when it comes back."
        actions={canSupplier && <Button startIcon={<AddRounded />} onClick={() => setAdding(true)}>Add a supplier</Button>}>
        {rfq.suppliers.length ? rfq.suppliers.map(supplierCard) : <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>No supplier has been asked yet. Add the suppliers who should quote.</Typography>}
      </SectionCard>
      <SectionCard title="Lines" subtitle="What is being asked for">
        <Box sx={{ display: 'grid', gap: 0.75 }}>
          {rfq.lines.map((l) => (
            <Box key={l.id} sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', fontSize: 13.5 }}>
              <Mono muted>{l.lineNo}</Mono>
              <Mono><Box component={Link} to={appPath(company, `items/${l.item.id}`)} sx={linkSx}>{l.item.code ?? '—'}</Box></Mono>
              <span>{l.item.name}</span>
              <Box sx={{ ml: 'auto' }}>{qtyText(l.quantity)} <Mono muted>{l.item.uom}</Mono>{l.neededBy ? <Mono muted> · by {dayText(l.neededBy)}</Mono> : null}</Box>
            </Box>
          ))}
        </Box>
      </SectionCard>
      {rfq.terms && <SectionCard title="Terms"><Typography sx={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{rfq.terms}</Typography></SectionCard>}
    </>
  );

  const compareTab = (
    <>
      <ErrorNotice error={cmp.error} onRetry={cmp.reload} />
      {comparison && <RfqComparison comparison={comparison} choices={choices} editable={canAwardNow} busy={busy} dirty={dirty}
        onChoose={(lineId, sid) => setChoices((c) => ({ ...c, [lineId]: sid }))}
        onCheapest={() => { const next = cheapestChoices(comparison); setChoices(next); void saveAwards(next); }}
        onSave={() => void saveAwards(choices)} />}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mt: 2 }}>
        {canPos && <Button variant="contained" onClick={() => void makePos()} disabled={busy || dirty}>Create purchase orders</Button>}
        {canPos && dirty && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Save the awards first.</Typography>}
        {linkedPos.length > 0 && (
          <Box data-testid="rfq-pos" sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Draft purchase orders:</Typography>
            {linkedPos.map((p) => <Mono key={p.id} chip><Box component={Link} to={appPath(company, `purchase-orders/${p.id}`)} sx={linkSx}>{p.code}{p.supplier ? ` · ${p.supplier.name}` : ''}</Box></Mono>)}
          </Box>
        )}
      </Box>
    </>
  );

  return (
    <DetailLayout beforeTabs={<BuyingStageBar type="rfq" id={rfq.id} version={`${rfq.status}:${rfq.quotes?.length ?? 0}:${rfq.lines.map((l) => l.awardedQuoteLineId ?? '').join()}:${rfq.purchaseOrders?.length ?? 0}`} />} active={tab} onTab={setTab} tabs={[{ value: 'rfq', label: 'RFQ' }, { value: 'compare', label: 'Compare and award', count: rfq.suppliers.filter((s) => s.quote).length }]}
      header={
        <DetailHeader code={rfq.code} title="Request for quotation" badges={<RfqStatusBadge status={rfq.status} />}
          actions={canManage && <>
            {(can.close ?? !closed) && rfq.status !== 'closed' && <Button onClick={() => setEnding('close')}>Close quoting</Button>}
            {(can.cancel ?? !closed) && <Button color="error" onClick={() => setEnding('cancel')}>Cancel RFQ</Button>}
          </>}
          facts={<>
            <Fact label="Lines"><Mono>{rfq.lines.length}</Mono></Fact>
            <Fact label="Suppliers"><Mono>{rfq.suppliers.length}</Mono></Fact>
            <Fact label="Quotes in"><Mono>{rfq.suppliers.filter((s) => s.quote).length}</Mono></Fact>
            <Fact label="Quotes due"><Mono muted>{dayText(rfq.quotesDue) || '—'}</Mono></Fact>
          </>} />
      }>
      {tab === 'compare' ? compareTab : rfqTab}
      {quoting && <QuoteDialog rfq={rfq} entry={quoting} onClose={() => setQuoting(null)} onSaved={(n) => { setQuoting(null); set(n, 'Quote saved.'); }} />}
      <AddSupplierDialog open={adding} rfqId={rfq.id} taken={rfq.suppliers.map((s) => s.supplier.id)} onClose={() => setAdding(false)} onAdded={(n) => { setAdding(false); set(n, 'Supplier added.'); }} />
      <ConfirmDialog open={!!declining} confirmLabel="Mark declined" title="This supplier is not quoting?" entityName={declining?.supplier.name}
        body="They are left out of the comparison. You can still enter a quote later." onClose={() => setDeclining(null)}
        onConfirm={async () => { if (declining) set(await declineRfqSupplier(rfq.id, declining.supplier.id), `${declining.supplier.name} marked as declined.`); }} />
      <ConfirmDialog open={!!ending} danger={ending === 'cancel'} confirmLabel={ending === 'cancel' ? 'Cancel the RFQ' : 'Close quoting'} title={ending === 'cancel' ? `Cancel ${rfq.code}?` : `Close quoting on ${rfq.code}?`} entityName={rfq.code}
        body={ending === 'cancel' ? 'Lines not yet ordered go back to the purchase request, ready for a new RFQ.' : 'No more quotes are expected. Lines not yet ordered go back to the purchase request.'}
        onClose={() => setEnding(null)}
        onConfirm={async () => { set(ending === 'cancel' ? await cancelRfq(rfq.id) : await closeRfq(rfq.id), ending === 'cancel' ? `${rfq.code} cancelled.` : `${rfq.code} closed.`); }} />
      <ConfirmDialog open={!!removing} danger confirmLabel="Remove" title="Take this supplier off the RFQ?" entityName={removing?.supplier.name}
        body="They have not quoted, so nothing is lost." onClose={() => setRemoving(null)}
        onConfirm={async () => { if (removing) set(await removeRfqSupplier(rfq.id, removing.supplier.id), 'Supplier removed.'); }} />
    </DetailLayout>
  );
}
