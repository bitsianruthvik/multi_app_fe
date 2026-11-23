import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, TextField, Typography } from '@mui/material';
import ShoppingCartCheckoutRounded from '@mui/icons-material/ShoppingCartCheckoutRounded';
import { Link, useParams } from 'react-router-dom';
import SaveRounded from '@mui/icons-material/SaveRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import OutputRounded from '@mui/icons-material/OutputRounded';
import { CfApiError } from '../api/client';
import { getMaterialRequest, giveOutMr, raisePrFromMr, saveMaterialRequest, type MrScreen, type MrScreenLine } from '../api/purchaseRequests';
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
import { BuyingSheetButtons } from '../components/Purchase/BuyingSheetButtons';

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
  // §118 (user 2026-11-23): an MR raised by hand is worked line by line — a quantity a line, then Give out or Raise PR.
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [acting, setActing] = useState<'give' | 'pr' | null>(null);
  const [checks, setChecks] = useState<string[] | null>(null);   // Maintenance's checks the give-out waits on
  const [checked, setChecked] = useState(false);
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
  const pick = !!m.pickMode;
  const picked = m.lines.map((l) => ({ l, q: num(picks[l.id] ?? '') })).filter((x) => Number.isFinite(x.q) && x.q > EPS);
  const giveMax = (l: MrScreenLine) => Math.max(0, (l.toIssue ?? 0) + Math.min(l.left ?? 0, l.inStock));
  const pickProblem = (l: MrScreenLine, kind: 'give' | 'pr') => {
    const q = num(picks[l.id] ?? '');
    if ((picks[l.id] ?? '').trim() === '') return null;
    if (!Number.isFinite(q) || q < 0) return 'A number';
    if (kind === 'give' && q > giveMax(l) + EPS) return `At most ${qtyText(giveMax(l))} can go out now`;
    if (kind === 'pr' && q > (l.left ?? 0) + EPS) return `Only ${qtyText(l.left ?? 0)} left`;
    return null;
  };
  const giveBlocked = !picked.length ? 'Type a quantity on the lines to give out.' : picked.some(({ l }) => pickProblem(l, 'give')) ? 'Some quantities are more than can go out now.' : null;
  const prBlocked = !picked.length ? 'Type a quantity on the lines to buy.' : picked.some(({ l }) => pickProblem(l, 'pr')) ? 'Some quantities are more than is left.' : null;
  const act = async (kind: 'give' | 'pr', conditionsChecked?: number[]) => {
    setActing(kind); setRefusal(null);
    try {
      const lines = picked.map(({ l, q }) => ({ lineId: l.id, quantity: q }));
      if (kind === 'give') {
        const out = await giveOutMr(m.id, { lines, ...(conditionsChecked ? { conditionsChecked } : {}) });
        setChecks(null); setChecked(false);
        if (out.materialRequest) mr.setData(out.materialRequest); else reload();
        toast.success(`${out.movement?.code ?? 'Stock out'} — given out against ${m.code}.`);
      } else {
        const out = await raisePrFromMr(m.id, { lines });
        mr.setData(out);
        toast.success(`${out.raised?.code ?? 'The PR'} raised for Purchase.`);
      }
      setPicks({}); invalidateNavCounts();
    } catch (e) {
      const err = e as CfApiError;
      const waits = [err.message, ...err.problems].filter((p) => /check before giving it out/.test(p));
      if (kind === 'give' && waits.length && !conditionsChecked) { setChecks(waits); setChecked(false); } else setRefusal(err);
    } finally { setActing(null); }
  };
  const fill = (kind: 'give' | 'pr') => setPicks(Object.fromEntries(m.lines.map((l) => {
    const v = kind === 'give' ? giveMax(l) : (l.left ?? 0);
    return [l.id, v > EPS ? String(Number(v.toFixed(3))) : ''];
  })));
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

  const pickColumns: DataColumn<MrScreenLine>[] = [
    {
      key: 'item', header: 'Material', alwaysVisible: true, sortValue: (l) => l.item.code ?? l.item.name,
      render: (l) => (
        <Box sx={{ py: 0.5 }}>
          <Mono><Box component={Link} to={appPath(company, `items/${l.item.id}`)} sx={linkSx}>{l.item.code ?? '—'}</Box></Mono>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'normal' }}>{l.item.name}</Typography>
        </Box>
      ),
    },
    { key: 'required', header: 'Required', numeric: true, alwaysVisible: true, sortValue: (l) => l.required, render: (l) => <span><Mono>{qtyText(l.required)}</Mono> <Mono muted>{l.item.uom}</Mono></span> },
    { key: 'issued', header: 'Given out', numeric: true, alwaysVisible: true, sortValue: (l) => l.issued ?? 0, render: (l) => <span data-testid="mr-issued"><FlashOnChange value={l.issued ?? 0}><Mono muted={!l.issued}>{qtyText(l.issued ?? 0)}</Mono></FlashOnChange></span> },
    { key: 'toIssue', header: 'In store for it', numeric: true, sortValue: (l) => l.toIssue ?? 0, render: (l) => <span title="Earmarked for this request and in the store: received on its POs, or taken before — given out first"><Mono muted={!l.toIssue}>{qtyText(l.toIssue ?? 0)}</Mono></span> },
    { key: 'onPr', header: 'On PRs', numeric: true, alwaysVisible: true, sortValue: (l) => l.onPr ?? 0, render: (l) => <span title={`Received on their POs: ${qtyText(l.received)}`}><Mono muted={!l.onPr}>{qtyText(l.onPr ?? 0)}</Mono></span> },
    { key: 'left', header: 'Left', numeric: true, alwaysVisible: true, sortValue: (l) => l.left ?? 0, render: (l) => <span data-testid="mr-left"><FlashOnChange value={l.left ?? 0}><Mono>{qtyText(l.left ?? 0)}</Mono></FlashOnChange></span> },
    { key: 'stock', header: 'In stock (free)', numeric: true, alwaysVisible: true, sortValue: (l) => l.inStock, render: (l) => <Mono muted={!l.inStock}>{qtyText(l.inStock)}</Mono> },
    ...(editable ? [{
      key: 'qty', header: 'Quantity', alwaysVisible: true,
      render: (l: MrScreenLine) => {
        const bad = pickProblem(l, 'give') && pickProblem(l, 'pr');
        return (
          <TextField size="small" value={picks[l.id] ?? ''} onChange={(e) => setPicks((p) => ({ ...p, [l.id]: e.target.value }))}
            error={!!bad} helperText={bad ?? undefined}
            inputProps={{ inputMode: 'decimal', 'aria-label': `Quantity — ${l.item.code ?? l.item.name}`, 'data-testid': 'mr-pick' }}
            InputProps={{ endAdornment: <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', ml: 0.5 }}>{l.item.uom}</Typography> }}
            sx={{ width: 130 }} />
        );
      },
    }] : []),
  ];

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
          actions={pick ? <>{editable && <>
            <Button variant="contained" startIcon={<OutputRounded />} disabled={!!acting || !!giveBlocked} title={giveBlocked ?? 'Give out these quantities against this request — what is in store for it first, then free stock. One stock-out.'} onClick={() => void act('give')} data-testid="mr-give-out">Give out</Button>
            <Button variant="outlined" startIcon={<ShoppingCartCheckoutRounded />} disabled={!!acting || !!prBlocked} title={prBlocked ?? 'A new purchase request for these quantities, for Purchase.'} onClick={() => void act('pr')} data-testid="mr-raise-pr">Raise PR</Button>
          </>}<FullScreenToggle on={full.on} onToggle={full.toggle} /></> : <>{issuable && (
            <Button variant="outlined" startIcon={<OutputRounded />} disabled={busy || dirty} onClick={() => setIssuing(true)} data-testid="mr-issue-now"
              title={dirty ? 'Save the MR first — then issue what is earmarked.' : 'Issue what is earmarked for this MR and still in the store — one stock issue.'}>
              Issue now
            </Button>
          )}{editable && <Button ref={saveRef} variant="contained" startIcon={<SaveRounded />} disabled={busy || problems.length > 0} onClick={() => void save()} data-testid="mr-save">Save</Button>}{savedTick > 0 && <SuccessCheck key={savedTick} size={20} label="Saved" style={{ alignSelf: 'center' }} />}<BuyingSheetButtons kind="mr" id={m.id} code={m.code} canUpload={takeEditable} disabled={busy || dirty} disabledWhy="Save or undo what you typed first — then upload." onApplied={() => { reload(); invalidateNavCounts(); }} /><FullScreenToggle on={full.on} onToggle={full.toggle} /></>}
          facts={<>
            {m.maintenanceOrder && <Fact label="Maintenance order"><Mono chip><Box component={Link} to={appPath(company, `maintenance-orders/${m.maintenanceOrder.id}`)} sx={linkSx}>{m.maintenanceOrder.label ?? m.maintenanceOrder.code ?? 'Open'}</Box></Mono></Fact>}
            {m.order && <Fact label="Sales order"><Mono chip><Box component={Link} to={appPath(company, `orders/${m.order.id}`)} sx={linkSx}>{m.order.code}</Box></Mono></Fact>}
            {m.line && <Fact label="Line">{m.line.name}</Fact>}
            {m.order?.customer && <Fact label="Customer">{m.order.customer.name}</Fact>}
            {m.manual && m.notes && <Fact label="Note">{m.notes}</Fact>}
            {m.manual && m.raisedBy?.name && <Fact label="Raised by">{m.raisedBy.name}</Fact>}
            {pick ? <Fact label="Purchase requests"><Mono>{m.purchaseRequests?.length ?? 0}</Mono></Fact> : <Fact label="Purchase request">
              {m.purchaseRequest
                ? <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}><Mono chip><Box component={Link} to={appPath(company, `purchase-requests/${m.purchaseRequest.id}`)} sx={linkSx}>{m.purchaseRequest.code}</Box></Mono><PrStatusBadge status={m.purchaseRequest.status} /></Box>
                : <Typography component="span" sx={{ color: 'var(--c-text-3)', fontSize: 13 }}>{customer ? 'None — the customer sends it' : 'Made when you save'}</Typography>}
            </Fact>}
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
      <SectionCard title="Lines" subtitle={pick
        ? 'Type a quantity on the lines, then Give out (what is in store for it first, then free stock) or Raise PR (at most what is left). Do it as often as needed: every stock-out and every PR is listed below.'
        : customer
        ? "Take the customer's own stock that is here; the rest is asked of them. Locked = earmarked for this order — nobody else can use it."
        : 'Take what you can from stock; the rest goes on the purchase request. Locked = earmarked for this order — nobody else can use it.'}>
        {pick && editable && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', px: 2, pb: 1 }}>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Fill the quantities with</Typography>
            <Button size="small" onClick={() => fill('give')} data-testid="mr-fill-give">what can go out now</Button>
            <Button size="small" onClick={() => fill('pr')} data-testid="mr-fill-left">everything left</Button>
            {picked.length > 0 && <Button size="small" color="inherit" onClick={() => setPicks({})}>Clear</Button>}
          </Box>
        )}
        <DataTable rows={m.lines} columns={pick ? pickColumns : columns} getRowId={(l) => l.id} bare storageKey={pick ? 'mr-pick-lines' : 'mr-lines'} exportName={`${m.code}-lines`} />
        {m.issueReason && !m.heldForAcceptance && !forStock && (
          <Typography data-testid="mr-issue-reason" sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 1 }}>{m.issueReason}</Typography>
        )}
      </SectionCard>
      {m.contractor && <Typography data-testid="mr-contractor" sx={{ fontSize: 14 }}>For contractor <b>{m.contractor.name}</b> — what is given against this request goes out to them; a tool is then on Out with until it comes back.</Typography>}
      {(m.giveOuts?.length ?? 0) > 0 && (
        <SectionCard title={`Given out against this request (${m.giveOuts!.filter((g) => !g.undone).length})`} subtitle="Every stock-out Stores made for this request.">
          <Box data-testid="mr-giveouts" sx={{ display: 'grid', gap: 0.75, p: 2, pt: 0 }}>
            {m.giveOuts!.map((g) => (
              <Box key={g.id} sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 13.5, opacity: g.undone ? 0.5 : 1 }}>
                <Mono chip><Box component={Link} to={appPath(company, `movements/${g.id}`)} sx={linkSx}>{g.code}</Box></Mono>
                <span>{g.date}</span>
                <span>{g.lines.map((l) => `${l.quantity} ${l.uom ?? ''} ${l.item}`.replace('  ', ' ')).join(' · ')}</span>
                {g.by && <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>by {g.by}</Typography>}
                {g.undone && <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>undone</Typography>}
              </Box>
            ))}
          </Box>
        </SectionCard>
      )}
      {pick && (
        <SectionCard title={`Purchase requests (${m.purchaseRequests?.length ?? 0})`} subtitle="Every PR raised from this request, newest first.">
          <Box data-testid="mr-prs" sx={{ display: 'grid', gap: 0.75, p: 2, pt: 0 }}>
            {(m.purchaseRequests ?? []).length === 0 && <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-3)' }}>None yet. Type quantities on the lines and press Raise PR.</Typography>}
            {(m.purchaseRequests ?? []).map((p) => (
              <Box key={p.id} sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 13.5 }}>
                <Mono chip><Box component={Link} to={appPath(company, `purchase-requests/${p.id}`)} sx={linkSx}>{p.code}</Box></Mono>
                <PrStatusBadge status={p.status} />
                {p.createdAt && <span>{String(p.createdAt).slice(0, 10)}</span>}
                <span>{p.lines.map((x) => `${qtyText(x.quantity)} ${x.item.uom ?? ''} ${x.item.code ?? x.item.name}${x.poRaised > EPS ? ` (on PO ${qtyText(x.poRaised)})` : ''}`.replace('  ', ' ')).join(' · ')}</span>
              </Box>
            ))}
          </Box>
        </SectionCard>
      )}
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
      <Dialog open={!!checks} onClose={() => setChecks(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Check before giving it out</DialogTitle>
        <DialogContent>
          {(checks ?? []).map((t) => <Typography key={t} sx={{ fontSize: 14, mb: 1 }}>{t}</Typography>)}
          <FormControlLabel control={<Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)} />} label="Checked — Maintenance's conditions are met" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChecks(null)}>Cancel</Button>
          <Button variant="contained" disabled={!checked || !!acting} onClick={() => void act('give', picked.map(({ l }) => Number(l.item.id)))}>Give out</Button>
        </DialogActions>
      </Dialog>
      <IssueNowDialog mr={issuing ? m : null} onClose={() => setIssuing(false)} onDone={afterIssue} />
      <PromisedDateDialog open={asking} proposed={null} submitLabel="Save" onClose={() => setAsking(false)} onConfirm={async (date) => { setAsking(false); await save(date); }} />
    </DetailLayout>
    </FullScreenFrame>
  );
}

