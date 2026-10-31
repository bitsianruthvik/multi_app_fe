import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, TextField, Typography } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import SaveRounded from '@mui/icons-material/SaveRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import OutputRounded from '@mui/icons-material/OutputRounded';
import { CfApiError } from '../api/client';
import { getMaterialRequest, saveMaterialRequest, type MrScreen, type MrScreenLine } from '../api/purchaseRequests';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { takeProblem, toBuyOf } from '../lib/purchaseRequest';
import { mrForWords } from '../lib/stores';
import { Badge, DetailSkeleton, ErrorNotice, Fact, Mono, SectionCard } from '../components/ui';
import { DetailHeader, DetailLayout } from '../components/DetailLayout';
import { DataTable, type DataColumn } from '../components/DataTable';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';
import { FullScreenFrame, FullScreenToggle } from '../components/FullScreen';
import { useFullScreen } from '../hooks/useFullScreen';
import { PrStatusBadge } from '../components/Purchase/purchaseFlowUi';
import { CustomerMaterialStatus, PromisedDateDialog } from '../components/Purchase/CustomerMaterialStatus';
import { FlashOnChange, SuccessCheck, nudge } from '../motion';
import { useSavedCheck } from '../hooks/useSavedCheck';
import { IssueNowDialog } from '../components/Purchase/IssueNowDialog';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };
const EPS = 1e-6;
const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
/** What the box starts with: the saved take, or (nothing chosen yet) the proposal. */
const startTake = (l: MrScreenLine) => String(!l.takeChosen && l.proposedTake != null ? l.proposedTake : l.takeFromStock);

/**
 * Stores › Material request (§71; §79 — every MR goes to STORES, Purchase sees PRs only). One table: every line with Required, In stock (free — ours, or for a
 * customer-supplied MR the customer's own lots), Take from stock (typed), To buy and Locked for this order. Saving
 * earmarks what is taken for this order and makes / updates ONE purchase request for the rest; a customer-supplied MR
 * asks the customer for the rest on their ₹0 purchase order instead. "Locked" moves as goods arrive (read again every
 * 30 s while the page is open).
 */
export default function MaterialRequestDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const company = useCompanySlug();
  const toast = useToast();
  const permitted = useIsPermitted();
  // §79: MRs are Stores' — the Stores tag or the older inventory manage tag saves one.
  const canManage = permitted('cf_erp_inventory_manage') || permitted('cf_erp_stores');
  const mr = useLoad(() => getMaterialRequest(id), [id]);
  const full = useFullScreen('mr-screen');
  const m = mr.data;
  const { reload } = mr;
  useDetailTitle(m?.code ?? null);
  const [takes, setTakes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<CfApiError | null>(null);
  const [asking, setAsking] = useState(false);
  // §95: the "Issue now" dialog.
  const [issuing, setIssuing] = useState(false);
  // Motion: a tick beside Save once it saved; a nudge on Save when the server refuses (the reason shows above the lines).
  const [savedTick, markSaved] = useSavedCheck();
  const saveRef = useRef<HTMLButtonElement>(null);
  // The typed values follow the server whenever it answers afresh.
  useEffect(() => {
    if (!m) return;
    // Nothing chosen yet: the proposal is filled in (min(required, free stock)) — a suggestion, earmarked only on Save.
    setTakes(Object.fromEntries(m.lines.map((l) => [l.id, startTake(l)])));
  }, [m]);
  // "Locked for this order" moves as GRNs arrive: read again while the page is open (not while typing).
  const dirty = !!m && m.lines.some((l) => startTake(l) !== (takes[l.id] ?? ''));
  useEffect(() => {
    if (dirty) return undefined;
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') reload(); }, 30000);
    return () => window.clearInterval(t);
  }, [dirty, reload]);

  const problems = useMemo(() => (m ? m.lines.map((l) => takeProblem(l, takes[l.id] ?? '')).filter(Boolean) : []), [m, takes]);
  if (mr.error) return <ErrorNotice error={mr.error} onRetry={mr.reload} />;
  if (!m) return <DetailSkeleton />;
  const customer = m.supply === 'customer';
  const editable = canManage && m.canEdit;
  // §79: an MR for stock refills stock — nothing is taken from it; saving puts it all on the PR.
  const forStock = m.manual && m.forType === 'stock';
  const takeEditable = editable && !forStock;
  const lockedHeader = m.line ? 'Locked for this order' : 'Locked for this MR';
  // §95: Issue now — what is earmarked and still in the store leaves it as one issue. Save first if a take is being typed.
  const issuable = canManage && !!m.canIssue;
  const showIssued = !m.issueReason || m.lines.some((l) => (l.issued ?? 0) > EPS);
  const afterIssue = (next: MrScreen, message: string) => {
    mr.setData(next);
    invalidateNavCounts();
    toast.success(message);
  };

  const save = async (customerDate?: string) => {
    setBusy(true); setRefusal(null);
    try {
      const next = await saveMaterialRequest(m.id, { lines: m.lines.map((l) => ({ lineId: l.id, takeFromStock: num(takes[l.id] ?? '0') })), ...(customerDate ? { customerDate } : {}) });
      mr.setData(next);
      invalidateNavCounts();
      markSaved();
      const asked = next.customerPurchaseOrders ?? [];
      toast.success(customer
        ? (asked.length ? `Saved. ${asked.map((p) => p.code).join(', ')} asks the customer for the rest.` : 'Saved.')
        : next.purchaseRequest ? `Saved. The rest is on ${next.purchaseRequest.code}.` : 'Saved. Nothing to buy.');
    } catch (e) {
      const err = e as CfApiError;
      if (err.code === 'CUSTOMER_DATE') setAsking(true); else { setRefusal(err); nudge(saveRef.current); }
    } finally { setBusy(false); }
  };

  const columns: DataColumn<MrScreenLine>[] = [
    {
      key: 'item', header: 'Material', alwaysVisible: true, sortValue: (l) => l.item.code ?? l.item.name,
      render: (l) => (
        <Box sx={{ py: 0.5 }}>
          <Mono><Box component={Link} to={appPath(company, `items/${l.item.id}`)} sx={linkSx}>{l.item.code ?? '—'}</Box></Mono>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'normal' }}>{l.item.name}</Typography>
        </Box>
      ),
    },
    { key: 'required', header: 'Required', numeric: true, alwaysVisible: true, sortValue: (l) => l.required, render: (l) => <span data-testid="mr-required"><Mono>{qtyText(l.required)}</Mono> <Mono muted>{l.item.uom}</Mono></span> },
    { key: 'stock', header: customer ? "In the customer's stock" : 'In stock (free)', numeric: true, alwaysVisible: true, sortValue: (l) => l.inStock, render: (l) => <span data-testid="mr-in-stock"><Mono muted={!l.inStock}>{qtyText(l.inStock)}</Mono></span> },
    {
      key: 'take', header: 'Take from stock', alwaysVisible: true, sortValue: (l) => l.takeFromStock,
      render: (l) => (takeEditable
        ? (
          <TextField size="small" value={takes[l.id] ?? ''} onChange={(e) => setTakes((t) => ({ ...t, [l.id]: e.target.value }))}
            error={!!takeProblem(l, takes[l.id] ?? '')} helperText={takeProblem(l, takes[l.id] ?? '') ?? (!l.takeChosen && l.proposedTake != null && String(l.proposedTake) === (takes[l.id] ?? '') ? 'Suggested — save to earmark' : undefined)}
            inputProps={{ inputMode: 'decimal', 'aria-label': `Take from stock — ${l.item.code ?? l.item.name}`, 'data-testid': 'mr-take' }}
            InputProps={{ endAdornment: <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', ml: 0.5 }}>{l.item.uom}</Typography> }}
            sx={{ width: 130 }} />
        )
        : <Mono>{qtyText(l.takeFromStock)}</Mono>),
    },
    { key: 'buy', header: customer ? 'Ask the customer' : 'To buy', numeric: true, alwaysVisible: true, sortValue: (l) => l.toBuy, render: (l) => <span data-testid="mr-to-buy"><Mono>{qtyText(toBuyOf(l.required, num(takes[l.id] ?? '')))}</Mono></span> },
    { key: 'raised', header: 'PO raised', numeric: true, sortValue: (l) => l.poRaised, render: (l) => <Mono muted={!l.poRaised}>{qtyText(l.poRaised)}</Mono> },
    { key: 'received', header: 'Received', numeric: true, defaultHidden: true, sortValue: (l) => l.received, render: (l) => <Mono muted={!l.received}>{qtyText(l.received)}</Mono> },
    {
      key: 'locked', header: lockedHeader, numeric: true, alwaysVisible: true, sortValue: (l) => l.locked,
      render: (l) => (
        <Box data-testid="mr-locked" title={l.sentence} sx={{ textAlign: 'right' }}>
          <FlashOnChange value={l.locked}><Mono>{qtyText(l.locked)}</Mono></FlashOnChange>
          {l.locked + EPS >= l.required && l.required > 0 && <Box sx={{ fontSize: 11.5, color: 'var(--c-success-700)' }}>all locked</Box>}
        </Box>
      ),
    },
    // §95: what has left the store for this MR, and what is earmarked and still there (what Issue now takes).
    ...(showIssued ? [
      {
        key: 'issued', header: 'Issued', numeric: true, alwaysVisible: true, sortValue: (l: MrScreenLine) => l.issued ?? 0,
        render: (l: MrScreenLine) => <span data-testid="mr-issued"><FlashOnChange value={l.issued ?? 0}><Mono muted={!l.issued}>{qtyText(l.issued ?? 0)}</Mono></FlashOnChange></span>,
      },
      ...(!m.issueReason ? [{
        key: 'toIssue', header: 'In store, to issue', numeric: true, sortValue: (l: MrScreenLine) => l.toIssue ?? 0,
        render: (l: MrScreenLine) => <span data-testid="mr-to-issue"><Mono muted={!l.toIssue}>{qtyText(l.toIssue ?? 0)}</Mono></span>,
      }] : []),
    ] : []),
  ];

  return (
    <FullScreenFrame on={full.on} onExit={() => full.set(false)}>
    <DetailLayout
      header={
        <DetailHeader
          code={m.code}
          title={mrForWords(m)}
          badges={<><Badge family={m.forType === 'sales_order' ? 'info' : m.forType === 'stock' ? 'success' : 'neutral'} noIcon label={`For: ${m.forLabel}`} />{customer ? <Badge family="info" label="Customer supplies" title="The customer sends this material. What they have not sent yet is asked of them on a purchase order (₹0)." /> : <Badge family="neutral" noIcon label="We buy" />}{m.heldForAcceptance && <Badge family="warning" noIcon label="Waits for the customer's acceptance" />}{m.internal && <Badge family="neutral" noIcon label="Stores' own purchase" title="Raised by Stores straight to a purchase request (To reorder › Raise PR or New PR). Not a request to Stores — it is not in the MR inbox." />}</>}
          actions={<>{issuable && (
            <Button variant="outlined" startIcon={<OutputRounded />} disabled={busy || dirty} onClick={() => setIssuing(true)} data-testid="mr-issue-now"
              title={dirty ? 'Save the MR first — then issue what is earmarked.' : 'Issue what is earmarked for this MR and still in the store — one stock issue.'}>
              Issue now
            </Button>
          )}{editable && <Button ref={saveRef} variant="contained" startIcon={<SaveRounded />} disabled={busy || problems.length > 0} onClick={() => void save()} data-testid="mr-save">Save</Button>}{savedTick > 0 && <SuccessCheck key={savedTick} size={20} label="Saved" style={{ alignSelf: 'center' }} />}<FullScreenToggle on={full.on} onToggle={full.toggle} /></>}
          facts={<>
            {m.order && <Fact label="Sales order"><Mono chip><Box component={Link} to={appPath(company, `orders/${m.order.id}`)} sx={linkSx}>{m.order.code}</Box></Mono></Fact>}
            {m.line && <Fact label="Line">{m.line.name}</Fact>}
            {m.order?.customer && <Fact label="Customer">{m.order.customer.name}</Fact>}
            {m.manual && m.notes && <Fact label="Note">{m.notes}</Fact>}
            {m.manual && m.raisedBy?.name && <Fact label="Raised by">{m.raisedBy.name}</Fact>}
            <Fact label="Purchase request">
              {m.purchaseRequest
                ? <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}><Mono chip><Box component={Link} to={appPath(company, `purchase-requests/${m.purchaseRequest.id}`)} sx={linkSx}>{m.purchaseRequest.code}</Box></Mono><PrStatusBadge status={m.purchaseRequest.status} /></Box>
                : <Typography component="span" sx={{ color: 'var(--c-text-3)', fontSize: 13 }}>{customer ? 'None — the customer sends it' : 'Made when you save'}</Typography>}
            </Fact>
          </>}
        />
      }
    >
      <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)', mb: 1.5 }}>{m.sentence}</Typography>
      {!m.canEdit && m.reason && <Alert severity="info" sx={{ mb: 1.5 }}>{m.reason}</Alert>}
      {!canManage && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)', mb: 1.5 }}>You can see this MR. Changing it needs the Stores permission.</Typography>}
      {m.stale && <Alert severity="warning" sx={{ mb: 1.5 }}>The line's need changed since the MR was raised. Save to bring the purchase request up to date.</Alert>}
      {refusal && (
        <Alert severity="warning" data-testid="mr-refusal" sx={{ mb: 1.5 }} onClose={() => setRefusal(null)}>
          <Box>{refusal.message}</Box>
          {refusal.problems.filter((p) => p !== refusal.message).map((p) => <Box key={p} sx={{ fontSize: 12.5 }}>{p}</Box>)}
        </Alert>
      )}
      <SectionCard title="Lines" subtitle={customer
        ? "Take the customer's own stock that is here; the rest is asked of them. Locked = earmarked for this order — nobody else can use it."
        : 'Take what you can from stock; the rest goes on the purchase request. Locked = earmarked for this order — nobody else can use it.'}>
        <DataTable rows={m.lines} columns={columns} getRowId={(l) => l.id} bare storageKey="mr-lines" exportName={`${m.code}-lines`} />
        {m.issueReason && !m.heldForAcceptance && !forStock && (
          <Typography data-testid="mr-issue-reason" sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 1 }}>{m.issueReason}</Typography>
        )}
      </SectionCard>
      {m.purchaseOrders.length > 0 && (
        <SectionCard title="Purchase orders" subtitle="The purchase orders that serve this MR.">
          <Box data-testid="mr-pos" sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {m.purchaseOrders.map((p) => (
              <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ReceiptLongRounded sx={{ fontSize: 16, color: 'var(--c-text-3)' }} />
                <Mono chip><Box component={Link} to={appPath(company, `purchase-orders/${p.id}`)} sx={linkSx}>{p.code}</Box></Mono>
                {p.supplier && <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{p.supplier.name}</Typography>}
              </Box>
            ))}
          </Box>
        </SectionCard>
      )}
      {customer && m.order && <CustomerMaterialStatus orderId={m.order.id} />}
      <IssueNowDialog mr={issuing ? m : null} onClose={() => setIssuing(false)} onDone={afterIssue} />
      <PromisedDateDialog open={asking} proposed={null} submitLabel="Save" onClose={() => setAsking(false)} onConfirm={async (date) => { setAsking(false); await save(date); }} />
    </DetailLayout>
    </FullScreenFrame>
  );
}

