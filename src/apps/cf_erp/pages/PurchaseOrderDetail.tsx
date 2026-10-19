import { useState } from 'react';
import { Alert, Box, Button, FormControlLabel, IconButton, Switch, Tooltip, Typography } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import PeopleRounded from '@mui/icons-material/PeopleRounded';
import VerifiedRounded from '@mui/icons-material/VerifiedRounded';
import MoveToInboxRounded from '@mui/icons-material/MoveToInboxRounded';
import DoNotDisturbOnRounded from '@mui/icons-material/DoNotDisturbOnRounded';
import SendRounded from '@mui/icons-material/SendRounded';
import { cfApi } from '../api/client';
import type { PurchaseLine, PurchaseOrder } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { rupeeText } from '../lib/money';
import { gstRateText, NO_GST_RATE } from '../lib/gst';
import { Money } from '../components/Money';
import { PriceCell, LastPaidHint } from '../components/PurchaseMoney';
import { Badge, DetailSkeleton, EmptyState, ErrorNotice, Fact, Mono, SectionCard } from '../components/ui';
import { CrossLink, DetailHeader, DetailLayout } from '../components/DetailLayout';
import { DataTable, type DataColumn } from '../components/DataTable';
import { AddPurchaseLineDialog, LineOrdersDialog, PurchaseForOrderDialog } from '../components/PurchaseDialogs';
import { PromptDialog } from '../components/PromptDialog';
import { PoStageBadge, PoTypeChip } from '../components/Purchase/purchaseFlowUi';
import { approvePurchaseOrder, closePurchaseOrder, rejectPurchaseOrder, sendForApproval } from '../api/purchaseRequests';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';
import { FullScreenFrame, FullScreenToggle } from '../components/FullScreen';
import { useFullScreen } from '../hooks/useFullScreen';
import { CancelPoDialog } from '../components/Purchase/CancelPoDialog';
import { PlannedUnitsNote } from '../components/Purchase/PlannedUnitsNote';
import { DateCell } from '../components/Purchase/DateCell';
import type { PlannedUnits } from '../api/requisitions';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/**
 * One purchase order (§71): its stage — pending Management approval → waiting for goods → part received → closed (by itself, or
 * closed short with a reason) — and per line what was ordered, received and is still pending. Management approves it
 * (§73: here or in Management › Approvals — cf_erp_approve_purchase_order, a contractor's PO cf_erp_approve_contractor_po;
 * not the person who raised it); closing short is ASKED here and approved there. Goods: Stores › Receive against PO.
 * WHO (2026-10-19, the same tags as routes/purchase.js): Purchase (cf_erp_purchase) edits the PO, sends it for approval,
 * asks to close it short and cancels it; Stores (inventory manage) receives the goods — and, on the customer's own ₹0 PO
 * (which Stores' MR raised), may also move its dates, ask to close it and cancel it.
 */
export default function PurchaseOrderDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const company = useCompanySlug();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canBuy = isPermitted('cf_erp_purchase');
  const isStores = isPermitted('cf_erp_inventory_manage') || isPermitted('cf_erp_stores');
  const canReceive = isPermitted('cf_erp_inventory_manage');
  const po = useLoad(() => cfApi.get<PurchaseOrder>(`/purchase-orders/${id}`), [id]);
  const full = useFullScreen('po');
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forOrdering, setForOrdering] = useState(false);
  const [linking, setLinking] = useState<PurchaseLine | null>(null);
  const [removing, setRemoving] = useState<PurchaseLine | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelPlanned, setCancelPlanned] = useState<PlannedUnits | null>(null);
  // The planned cards a moved expected date made late (the PUT answers with them).
  const [late, setLate] = useState<PlannedUnits | null>(null);
  const p = po.data;
  useDetailTitle(p?.code ?? null);
  if (po.error) return <ErrorNotice error={po.error} onRetry={po.reload} />;
  if (!p) return <DetailSkeleton />;
  // Dates, close short and cancel: Purchase — or Stores on the customer's own PO. Lines, prices, sending: Purchase only.
  const canManage = canBuy || (!!p.suppliedByCustomer && isStores);

  const done = (next: PurchaseOrder, message: string) => { po.setData(next); invalidateNavCounts(); toast.success(message); };
  const open = p.status === 'draft' || p.status === 'requested' || p.status === 'quoting' || p.status === 'ordered' || p.status === 'partially_received';
  const stage = p.stage ?? 'requested';
  // §73: approving is Management's, by the PO's kind; what waits for them about this PO is said here.
  const canApprove = isPermitted(p.type === 'contractor' ? 'cf_erp_approve_contractor_po' : 'cf_erp_approve_purchase_order');
  const closeAsked = (p.pendingApprovals ?? []).find((a) => a.type === 'po_close_short') ?? null;
  const asked = (p.pendingApprovals ?? []).find((a) => a.type === 'purchase_order' || a.type === 'contractor_po') ?? null;
  const waitingSince = asked ? ` since ${new Date(asked.requestedAt).toLocaleDateString('en-IN')}${asked.requestedBy?.name ? ` (asked by ${asked.requestedBy.name})` : ''}` : '';
  // Lines and prices change only before Management approves it (or on an older PO not sent yet).
  const editable = canBuy && (stage === 'requested' || stage === 'pending_approval');
  const act = async (fn: () => Promise<PurchaseOrder>, message: string) => {
    setBusy(true);
    try { done(await fn(), message); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const setReverse = async (on: boolean) => { try { done(await cfApi.put<PurchaseOrder>(`/purchase-orders/${p.id}`, { reverseCharge: on }), on ? 'Reverse charge on.' : 'Reverse charge off.'); } catch (e) { toast.error((e as Error).message); } };

  const columns: DataColumn<PurchaseLine>[] = [
    { key: 'no', header: '#', alwaysVisible: true, render: (l) => <Mono muted>{l.lineNo}</Mono> },
    {
      key: 'item', header: 'Item', alwaysVisible: true, sortValue: (l) => l.item.code ?? l.item.name,
      render: (l) => (
        <Box sx={{ py: 0.5 }}>
          <Mono><Box component={Link} to={appPath(company, `items/${l.item.id}`)} sx={linkSx}>{l.item.code ?? '—'}</Box></Mono>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{l.item.name}</Typography>
        </Box>
      ),
    },
    { key: 'quantity', header: 'Ordered', numeric: true, alwaysVisible: true, sortValue: (l) => l.quantity, render: (l) => <>{qtyText(l.quantity)} <Mono muted>{l.item.uom}</Mono></> },
    { key: 'received', header: 'Received', numeric: true, alwaysVisible: true, sortValue: (l) => l.received, render: (l) => <span data-testid="po-line-received"><Mono muted={!l.received}>{qtyText(l.received)}</Mono></span> },
    {
      key: 'pending', header: 'Pending', numeric: true, alwaysVisible: true, sortValue: (l) => l.pending ?? l.outstanding,
      render: (l) => {
        const pend = l.pending ?? l.outstanding;
        return (
          <Box data-testid="po-line-pending" sx={{ textAlign: 'right' }}>
            {pend > 0 ? <Mono>{qtyText(pend)}</Mono> : <Mono muted>—</Mono>}
            {(l.closedQty ?? 0) > 0 && <Box sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{qtyText(l.closedQty ?? 0)} released</Box>}
          </Box>
        );
      },
    },
    {
      key: 'price', header: 'Price (₹)', numeric: true, alwaysVisible: true, sortValue: (l) => l.unitPrice, exportValue: (l) => l.unitPrice ?? '',
      render: (l) => (editable
        ? <PriceCell line={l} onSave={async (price) => { done(await cfApi.put<PurchaseOrder>(`/purchase-lines/${l.id}`, { unitPrice: price }), 'Price saved.'); }} />
        : <Box sx={{ textAlign: 'right' }}><Money value={l.unitPrice} digits={2} missing="no price" /><Box><LastPaidHint lastPaid={l.lastPaid} current={l.unitPrice} /></Box></Box>),
    },
    { key: 'amount', header: 'Amount', numeric: true, alwaysVisible: true, sortValue: (l) => l.amount, exportValue: (l) => l.amount ?? '', render: (l) => <Money value={l.amount} digits={2} missing="no price" /> },
    {
      key: 'gst', header: 'GST', numeric: true, sortValue: (l) => l.taxTotal, exportValue: (l) => l.taxTotal ?? '',
      render: (l) => (l.amount == null ? <Mono muted>—</Mono>
        : l.gstRate == null || l.taxTotal == null ? <Box component="span" data-testid="po-line-gst" sx={{ color: 'var(--c-text-3)', fontSize: 12 }}>{NO_GST_RATE}</Box>
          : <Box data-testid="po-line-gst" sx={{ textAlign: 'right' }}><Mono>{rupeeText(l.taxTotal, 2)}</Mono><Box sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{gstRateText(l.gstRate)}{l.gross != null ? ` · ${rupeeText(l.gross, 2)} with GST` : ''}</Box></Box>),
    },
    {
      key: 'for', header: 'For', alwaysVisible: true, exportValue: (l) => (l.orders ?? []).map((o) => o.orderCode).join(' '),
      render: (l) => (
        <Box data-testid="po-line-for" sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
          {(l.orders ?? []).map((o) => (
            <Box key={o.id} title={`${o.orderCode}: ${qtyText(o.quantity)} ${l.item.uom} bought for it, ${qtyText(o.received)} arrived`}>
              <Mono chip><Box component={Link} to={appPath(company, `orders/${o.orderId}`)} sx={linkSx}>{o.orderCode}</Box> · {qtyText(o.quantity)} {l.item.uom}</Mono>
            </Box>
          ))}
          {(l.unlinked ?? 0) > 0 && <Typography component="span" sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>unlinked {qtyText(l.unlinked)}</Typography>}
          {editable && (
            <Tooltip title="Change which sales orders this line is bought for">
              <IconButton size="small" aria-label={`Bought for — ${l.item.code ?? l.item.name}`} onClick={() => setLinking(l)}><EditRounded sx={{ fontSize: 16 }} /></IconButton>
            </Tooltip>
          )}
        </Box>
      ),
    },
    {
      key: 'expected', header: 'Expected', sortValue: (l) => l.expectedDate,
      render: (l) => (
        <Box data-testid="po-line-expected">
          {canManage && ['pending_approval', 'requested', 'waiting', 'part_received'].includes(stage) && (l.pending ?? l.outstanding) > 0
            ? <DateCell value={l.expectedDate} label={`Expected date for ${l.item.code ?? l.item.name}`} lineId={l.id} missing={!l.expectedDate && !p.expectedDate}
              onSaved={(next) => { setLate(next.plannedUnits ?? null); done(next, 'Expected date saved.'); }} />
            : <Mono muted>{l.expectedDate ? String(l.expectedDate).slice(0, 10) : '—'}</Mono>}
          {!l.expectedDate && l.effectiveDate && <Box sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>the PO's: {l.effectiveDate}</Box>}
        </Box>
      ),
    },
    {
      key: 'receipts', header: 'Deliveries', exportValue: (l) => l.receipts.map((r) => r.code).join(' '),
      render: (l) => (l.receipts.length
        ? <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {l.receipts.map((r) => (
            <Box key={r.id} title={`${qtyText(r.quantity)} on ${r.date}`}>
              <Mono chip><Box component={Link} to={appPath(company, `movements/${r.id}`)} sx={linkSx}>{r.code}</Box></Mono>
            </Box>
          ))}
        </Box>
        : <Mono muted>—</Mono>),
    },
  ];
  if (editable) {
    columns.push({
      key: 'actions', header: '', alwaysVisible: true,
      render: (l) => (
        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
          {!l.received && (
            <Tooltip title="Remove the line">
              <IconButton size="small" aria-label={`Remove ${l.item.code ?? l.item.name}`} onClick={() => setRemoving(l)}><DeleteOutlineRounded fontSize="small" /></IconButton>
            </Tooltip>
          )}
        </Box>
      ),
    });
  }

  const crossLinks = (
    <>
      {p.supplier && <CrossLink icon={<PeopleRounded />} label={p.supplier.name} to={appPath(company, 'customers?role=supplier')} />}
    </>
  );

  return (
    <FullScreenFrame on={full.on} onExit={() => full.set(false)}>
    <DetailLayout
      crossLinks={p.supplier ? crossLinks : undefined}
      header={
        <DetailHeader
          code={p.code}
          title={p.supplier?.name ?? 'No supplier yet'}
          badges={<><PoStageBadge stage={p.stage} label={p.stageLabel} /><PoTypeChip type={p.type} />{p.suppliedByCustomer && <Badge family="info" label="Customer supplies" title="The customer's own material, asked of the customer (₹0). What arrives is their stock, earmarked to the material request." />}</>}
          actions={<>
            {canApprove && stage === 'pending_approval' && <Button variant="contained" startIcon={<VerifiedRounded />} disabled={busy} data-testid="po-approve" onClick={() => void act(() => approvePurchaseOrder(p.id), `${p.code} approved — waiting for goods.`)}>Approve</Button>}
            {canApprove && stage === 'pending_approval' && <Button color="error" disabled={busy} data-testid="po-reject" onClick={() => setRejecting(true)}>Send back</Button>}
            {canBuy && stage === 'requested' && p.status !== 'cancelled' && <Button variant="contained" startIcon={<SendRounded />} disabled={busy || !p.supplier || !p.lines.length} data-testid="po-send" onClick={() => void act(() => sendForApproval(p.id), `${p.code} sent for approval.`)}>Send for approval</Button>}
            {canReceive && (stage === 'waiting' || stage === 'part_received') && <Button variant="contained" startIcon={<MoveToInboxRounded />} component={Link} to={`${appPath(company, 'receive')}?po=${encodeURIComponent(p.code)}`} data-testid="po-receive">Receive goods</Button>}
            {canManage && (stage === 'waiting' || stage === 'part_received') && !closeAsked && <Button startIcon={<DoNotDisturbOnRounded />} onClick={() => setClosing(true)} data-testid="po-close">Close PO short</Button>}
            {editable && <Button startIcon={<AddRounded />} onClick={() => setAdding(true)}>Add a line</Button>}
            {canManage && open && !p.totals.received && <Button color="error" startIcon={<BlockRounded />} onClick={() => setCancelling(true)}>Cancel</Button>}
            <FullScreenToggle on={full.on} onToggle={full.toggle} />
          </>}
          facts={<>
            <Fact label="Supplier">{p.supplier ? p.supplier.name : <Typography component="span" sx={{ color: 'var(--c-text-3)' }}>Chosen when the order is placed</Typography>}</Fact>
            <Fact label="For sales order">
              {p.forOrder ? <Mono chip><Box component={Link} to={appPath(company, `orders/${p.forOrder.id}`)} sx={linkSx}>{p.forOrder.code}</Box></Mono> : <Typography component="span" sx={{ color: 'var(--c-text-3)' }}>None</Typography>}
              {editable && <Tooltip title="Change the order this is bought for (the default for new lines)"><IconButton size="small" aria-label="Change the sales order" onClick={() => setForOrdering(true)}><EditRounded sx={{ fontSize: 16 }} /></IconButton></Tooltip>}
            </Fact>
            <Fact label="Lines"><Mono>{p.totals.lines}</Mono></Fact>
            <Fact label="Ordered"><Mono>{qtyText(p.totals.ordered)}</Mono></Fact>
            <Fact label="Received"><Mono>{qtyText(p.totals.received)}</Mono></Fact>
            <Fact label="Outstanding"><Mono>{qtyText(p.totals.outstanding)}</Mono></Fact>
            <Fact label="Amount">{p.totals.lines > 0 && p.totals.unpricedLines === p.totals.lines ? <Money value={null} missing="no prices yet" /> : <><Mono>{rupeeText(p.totals.amount ?? 0, 2)}</Mono>{(p.totals.unpricedLines ?? 0) > 0 && <Mono muted> + {p.totals.unpricedLines} unpriced</Mono>}</>}</Fact>
            {p.totals.tax != null && (
              <Fact label={p.reverseCharge ? 'GST (we pay)' : 'GST (input credit)'}>
                <span data-testid="po-gst"><Mono>{rupeeText(p.totals.tax, 2)}</Mono></span>
                {/* 2026-10-18: "GST ₹0" read as a fact when the items simply had no rate — say it, and where to set it. */}
                {(p.totals.noGstLines ?? 0) > 0 && (
                  <Typography data-testid="po-gst-gap" sx={{ fontSize: 11.5, color: 'var(--c-warning-800)' }}>
                    + {p.totals.noGstLines} line{p.totals.noGstLines === 1 ? '' : 's'} with no GST rate — <Box component={Link} to={appPath(company, 'company-tax#families')} sx={{ color: 'inherit' }}>set HSN / GST by family</Box>
                  </Typography>
                )}
                {p.reverseCharge && <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>reverse charge — not in the supplier's total</Typography>}
              </Fact>
            )}
            {p.totals.gross != null && <Fact label={p.reverseCharge ? 'Supplier total' : 'Total incl. GST'}><Mono>{rupeeText(p.totals.gross, 2)}</Mono></Fact>}
            <Fact label="Expected delivery">
              {canManage && ['pending_approval', 'requested', 'waiting', 'part_received'].includes(stage)
                ? <DateCell value={p.expectedDate} label="Expected delivery date of the PO" poId={p.id} testId="po-expected-date" missing={!p.expectedDate} onSaved={(next) => done(next, 'Expected delivery date saved.')} />
                : <Mono muted>{p.expectedDate ?? '—'}</Mono>}
            </Fact>
          </>}
        />
      }
    >
      {!canManage && open && (
        <Typography data-testid="po-readonly" sx={{ fontSize: 13, color: 'var(--c-text-3)', mb: 1.5 }}>
          You can see this PO. Changing it, sending it for approval, closing it short and cancelling it need the Purchase permission{p.suppliedByCustomer ? " (or, on the customer's own PO, the Stores permission)" : ''}.
        </Typography>
      )}
      {canManage && !canBuy && open && (
        <Typography data-testid="po-stores-only" sx={{ fontSize: 13, color: 'var(--c-text-3)', mb: 1.5 }}>
          The customer's own PO: Stores may move its dates, close it short and cancel it. Its lines and prices need the Purchase permission.
        </Typography>
      )}
      {p.status === 'cancelled' && <PlannedUnitsNote planned={cancelPlanned} />}
      {p.status !== 'cancelled' && <PlannedUnitsNote planned={late} />}
      {stage === 'pending_approval' && (
        <Alert severity="warning" data-testid="po-pending-approval" sx={{ mb: 1.5 }}>
          Waiting for approval in Management{waitingSince}. Nothing can be received until it is approved.{!canApprove ? ' Approving needs the purchase order approval permission.' : ''}
        </Alert>
      )}
      {stage === 'requested' && p.status !== 'cancelled' && (
        <Alert severity="info" sx={{ mb: 1.5 }}>Not placed yet. Name the vendor and send it for approval.</Alert>
      )}
      {closeAsked && (
        <Alert severity="warning" data-testid="po-close-asked" sx={{ mb: 1.5 }}>Closing short waits for Management{closeAsked.requestedBy?.name ? ` (asked by ${closeAsked.requestedBy.name})` : ''}: {closeAsked.note}. Until it is approved the PO stays open.</Alert>
      )}
      {p.approval?.status === 'approved' && (
        <Typography data-testid="po-approved" sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1 }}>Approved by {p.approval.by?.name ?? 'Management'}{p.approval.at ? ` on ${String(p.approval.at).slice(0, 10)}` : ''}.</Typography>
      )}
      {p.closed && (
        <Alert severity="info" data-testid="po-closed-short" sx={{ mb: 1.5 }}>Closed short{p.closed.by?.name ? ` by ${p.closed.by.name}` : ''}: {p.closed.reason}. What was pending is released; the purchase request can order it again.</Alert>
      )}
      {(editable || p.reverseCharge) && (
        <Box sx={{ mb: 1.5 }}>
          <FormControlLabel control={<Switch size="small" checked={!!p.reverseCharge} disabled={!editable} onChange={(e) => void setReverse(e.target.checked)} inputProps={{ 'aria-label': 'Reverse charge' }} />}
            label={<Typography sx={{ fontSize: 13 }}>Reverse charge — we pay the GST, not the supplier</Typography>} />
        </Box>
      )}
      <SectionCard title="Lines" subtitle="Ordered, received and still pending, line by line. Goods are received from Stores › Receive against PO; each receipt is a GRN.">
        <DataTable rows={p.lines} columns={columns} getRowId={(l) => l.id} bare storageKey="purchase-lines" exportName={`${p.code}-lines`}
          empty={<EmptyState icon={<AddRounded />} title="No lines yet" hint="Add what is being bought, then send it for approval."
            action={editable ? <Button variant="contained" startIcon={<AddRounded />} onClick={() => setAdding(true)}>Add a line</Button> : undefined} />} />
      </SectionCard>
      {(p.dateChanges?.length ?? 0) > 0 && (
        <SectionCard title="Expected date changes" subtitle="Who moved the expected delivery date, and when. A GRN keeps its own actual receipt date.">
          <Box data-testid="po-date-changes" sx={{ display: 'grid', gap: 0.5 }}>
            {p.dateChanges!.map((d) => (
              <Typography key={d.id} sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>
                <Mono>{String(d.at).slice(0, 16).replace('T', ' ')}</Mono>{' · '}
                {d.lineId == null ? 'The PO' : (p.lines.find((l) => l.id === d.lineId)?.item.code ?? 'A line')}: {d.from ?? 'no date'} → {d.to ?? (d.lineId == null ? 'no date' : "the PO's date")}
                {d.by?.name ? ` · ${d.by.name}` : ''}
              </Typography>
            ))}
          </Box>
        </SectionCard>
      )}
      {p.notes && <SectionCard title="Notes"><Typography sx={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{p.notes}</Typography></SectionCard>}
      <AddPurchaseLineDialog orderId={adding ? p.id : null} forOrder={p.forOrder} onClose={() => setAdding(false)} onAdded={(n) => { setAdding(false); done(n, 'Line added.'); }} />
      <PurchaseForOrderDialog order={forOrdering ? p : null} onClose={() => setForOrdering(false)} onSaved={(n) => { setForOrdering(false); done(n, n.forOrder ? `Bought for ${n.forOrder.code}.` : 'No longer bought for an order.'); }} />
      <LineOrdersDialog line={linking} onClose={() => setLinking(null)} onSaved={(n) => { setLinking(null); done(n, 'Saved who the line is bought for.'); }} />
      <PromptDialog open={closing} title={`Close ${p.code} short?`} label="Why" confirmLabel="Ask Management"
        body="Management approves it first. Then what is still pending is released: the purchase request's PO raised goes down by it, so a new PO can be raised for it. What arrived stays locked for its order."
        onClose={() => setClosing(false)}
        onConfirm={async (reason) => { done(await closePurchaseOrder(p.id, reason), `Asked Management to close ${p.code} short.`); }} />
      <PromptDialog open={rejecting} title={`Send ${p.code} back?`} label="Why — the buyer reads it" confirmLabel="Send back"
        body="It is not placed. The buyer can change it and send it for approval again."
        onClose={() => setRejecting(false)}
        onConfirm={async (note) => { done(await rejectPurchaseOrder(p.id, note), `${p.code} sent back.`); }} />
      <ConfirmDialog open={!!removing} danger confirmLabel="Remove" title="Remove this line?"
        entityName={removing ? `${removing.item.code ?? removing.item.name} — ${qtyText(removing.quantity)} ${removing.item.uom}` : ''}
        body="Nothing has been received against it, so it can go. It is not ordered from the supplier any more."
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          done(await cfApi.del<PurchaseOrder>(`/purchase-lines/${removing.id}`), `${removing.item.code ?? removing.item.name} removed.`);
          setRemoving(null);
        }} />
      <CancelPoDialog po={p} open={cancelling} onClose={() => setCancelling(false)}
        onCancelled={(next, planned) => { setCancelPlanned(planned); done(next, `${p.code} cancelled.`); }} />
    </DetailLayout>
    </FullScreenFrame>
  );
}
