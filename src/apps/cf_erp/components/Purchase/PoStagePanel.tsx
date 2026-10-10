import { useEffect, useState, type ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import RadioButtonCheckedRounded from '@mui/icons-material/RadioButtonCheckedRounded';
import RadioButtonUncheckedRounded from '@mui/icons-material/RadioButtonUncheckedRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import { CfApiError, cfApi } from '../../api/client';
import { PromptDialog } from '../PromptDialog';
import UndoRounded from '@mui/icons-material/UndoRounded';
import { rfqEmail, type QuoteInput, type RfqSupplier } from '../../api/procurement';
import { applyStockCheck, getPoQuotes, getStockCheck, placeOrder, recordQuote, type StockCheck } from '../../api/purchase';
import type { PurchaseLine, PurchaseOrder } from '../../api/types';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { qtyText } from '../../lib/inventory';
import { Badge, ErrorNotice, Mono, SectionCard, SkeletonBlock } from '../ui';
import { poLane, stripModel, awardsFromChoices, holdProblem, holdsBody, orderCountFor, proposedHolds, recommendedChoices, maxHold, type StripState } from '../../lib/purchaseFlow';
import { SUPPLIER_STATUS_FAMILY, SUPPLIER_STATUS_LABEL, mailtoHref, type Choices } from '../../lib/procurement';
import { openRfqPrint } from '../../lib/rfqFiles';
import { RfqComparison } from '../RfqComparison';
import { QuoteDialog } from '../QuoteDialog';
import { SendPurchaseDialog } from '../PurchaseDialogs';
import { useToast } from '../toastContext';
import { SendRfqDialog } from './SendRfqDialog';
import { DateCell, QtyCell } from './DateCell';
import { plannedUnitsSentence, type PlannedUnits } from '../../api/requisitions';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

const MARK: Record<StripState, ReactNode> = {
  done: <CheckCircleRounded sx={{ fontSize: 16, color: 'var(--c-success-600)' }} />,
  current: <RadioButtonCheckedRounded sx={{ fontSize: 16, color: 'var(--c-primary-600)' }} />,
  ahead: <RadioButtonUncheckedRounded sx={{ fontSize: 16, color: 'var(--c-text-3)' }} />,
};

/** Requested › Stock checked › RFQ out › Quotes in › Ordered › Received — where this purchase order stands. */
export function PurchaseStageStrip({ lane }: { lane: ReturnType<typeof poLane> }) {
  const steps = stripModel(lane);
  return (
    <Box data-testid="po-stage-strip" role="list" aria-label="Purchase stages" sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexWrap: 'wrap', mb: 1.5 }}>
      {steps.map((s, i) => (
        <Box key={s.key} role="listitem" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
          <Box data-testid="po-stage" data-stage={s.key} data-state={s.state} aria-current={s.state === 'current' ? 'step' : undefined}
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.5, borderRadius: 'var(--r-md)', fontSize: 13.5, fontWeight: s.state === 'current' ? 600 : 500,
              color: s.state === 'current' ? 'var(--c-primary-700)' : s.state === 'done' ? 'var(--c-text)' : 'var(--c-text-3)',
              background: s.state === 'current' ? 'var(--c-primary-50)' : 'transparent',
              border: `1px solid ${s.state === 'current' ? 'var(--c-primary-200)' : 'transparent'}`,
            }}>
            {MARK[s.state]}{s.label}
          </Box>
          {i < steps.length - 1 && <ChevronRightRounded sx={{ fontSize: 18, color: 'var(--c-text-3)' }} />}
        </Box>
      ))}
    </Box>
  );
}

const tableSx = { width: '100%', borderCollapse: 'collapse', fontSize: 13, '& td, & th': { py: 0.75, px: 0.75, borderBottom: '1px solid var(--c-divider)', textAlign: 'left', verticalAlign: 'middle' }, '& th': { color: 'var(--c-text-3)', fontWeight: 500 } } as const;

/** Stage 1: what is free in stock for these lines; the person confirms what to hold. */
function StockCheckTable({ check, typed, onTyped }: { check: StockCheck; typed: Record<number, string>; onTyped: (t: Record<number, string>) => void }) {
  return (
    <Box component="table" data-testid="stock-check" sx={tableSx}>
      <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>On PO</th><th style={{ textAlign: 'right' }}>Free in stock</th><th style={{ width: 150 }}>Hold</th></tr></thead>
      <tbody>
        {check.lines.map((l) => {
          const problem = holdProblem(l, typed[l.lineId] ?? '');
          return (
            <tr key={l.lineId} data-testid="stock-check-row">
              <td><Mono>{l.item.code ?? '—'}</Mono><Box sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{l.item.name}</Box></td>
              <td style={{ textAlign: 'right' }}><Mono>{qtyText(l.quantity)}</Mono> <Mono muted>{l.item.uom}</Mono></td>
              <td style={{ textAlign: 'right' }}><Mono muted={l.freeInStock <= 0}>{qtyText(l.freeInStock)}</Mono></td>
              <td>
                <Box component="input" value={typed[l.lineId] ?? ''} disabled={!check.canHold || maxHold(l) <= 0} inputMode="decimal"
                  aria-label={`Hold for ${l.item.code ?? l.item.name}`} aria-invalid={!!problem} title={problem ?? `Up to ${qtyText(maxHold(l))}`}
                  onChange={(e) => onTyped({ ...typed, [l.lineId]: e.target.value })}
                  sx={{ width: 110, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, p: 0.5, borderRadius: 'var(--r-sm)', border: `1px solid ${problem ? 'var(--c-danger-500)' : 'var(--c-border)'}`, background: 'var(--c-surface)', color: 'var(--c-text)' }} />
                {problem && <Box sx={{ fontSize: 11.5, color: 'var(--c-danger-700)' }}>{problem}</Box>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Box>
  );
}

/**
 * The purchase order's ONE action panel: whatever the current stage asks for.
 *   Requested     — check stock, hold it for the sales order, cut the PO; or place straight with a supplier
 *   Stock checked — send the RFQ to suppliers
 *   RFQ out / Quotes in — record each supplier's quotation, compare per line, accept and place the order
 *   Ordered / Part received — one expected date per line (timeline), and the goods receipt per line
 */
export function PoStagePanel({ po, canManage, onPo, onChanged, onReceive }: {
  po: PurchaseOrder;
  canManage: boolean;
  /** The PO as it now stands, with the words to say. */
  onPo: (next: PurchaseOrder, message: string) => void;
  /** Something changed that the PO read does not carry (RFQ sent): read it again. */
  onChanged: (message: string) => void;
  onReceive: (line: PurchaseLine) => void;
}) {
  const company = useCompanySlug();
  const toast = useToast();
  const requested = po.status === 'requested' || po.status === 'draft';
  const quoting = po.status === 'quoting';
  const sc = useLoad(() => (requested ? getStockCheck(po.id) : Promise.resolve(null)), [po.id, po.status]);
  const pq = useLoad(() => (quoting ? getPoQuotes(po.id) : Promise.resolve(null)), [po.id, po.status]);
  const [showCheck, setShowCheck] = useState(false);
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [sendingRfq, setSendingRfq] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [quoteFor, setQuoteFor] = useState<RfqSupplier | null>(null);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [split, setSplit] = useState<PurchaseOrder[] | null>(null);
  const [late, setLate] = useState<PlannedUnits | null>(null);
  const [undoing, setUndoing] = useState<{ id: number; code: string; item: string } | null>(null);

  const stockChecked = requested && !!sc.data?.purchaseOrder.stockCheckedAt;
  const rfq = pq.data?.rfq ?? null;
  const comparison = pq.data?.comparison ?? null;
  const quotes = rfq ? rfq.suppliers.filter((s) => s.quote).length : 0;
  const lane = poLane(po.status, stockChecked, quotes);

  useEffect(() => { if (showCheck && sc.data) setTyped(proposedHolds(sc.data.lines)); }, [showCheck, sc.data]);

  const fail = (e: unknown) => toast.error(e instanceof CfApiError ? (e.problems[0] ?? e.message) : (e as Error).message);

  const applyHolds = async (zero: boolean) => {
    if (!sc.data) return;
    setBusy(true);
    try {
      const r = await applyStockCheck(po.id, zero ? sc.data.lines.map((l) => ({ lineId: l.lineId, hold: 0 })) : holdsBody(sc.data.lines, typed));
      const next = r.purchaseOrder;
      const held = r.held.length;
      setShowCheck(false);
      sc.reload();
      onPo(next, next.status === 'cancelled' ? 'Everything came from stock — nothing to buy.' : held ? `Stock held for the order and taken off ${next.code}.` : 'Stock checked — nothing held.');
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const effective: Choices = choices ?? (comparison ? recommendedChoices(comparison) : {});
  const awards = comparison ? awardsFromChoices(comparison, effective) : [];
  const orders = comparison ? orderCountFor(comparison, effective) : 0;
  const place = async () => {
    setBusy(true);
    try {
      const r = await placeOrder(po.id, awards);
      const mine = r.purchaseOrders.find((p) => p.id === po.id) ?? r.purchaseOrders[0];
      if (r.purchaseOrders.length > 1) setSplit(r.purchaseOrders);
      setPlacing(false);
      onPo(mine, r.purchaseOrders.length > 1 ? `Order placed and split into ${r.purchaseOrders.length} purchase orders.` : `${mine.code} placed with ${mine.supplier?.name ?? 'the supplier'}.`);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const saveQuote = async (body: QuoteInput) => {
    const r = await recordQuote(po.id, body);
    pq.setData(r); setChoices(null);
    toast.success('Quotation recorded.');
  };
  const email = async (s: RfqSupplier) => {
    if (!rfq) return;
    try { const m = await rfqEmail(rfq.id, s.supplier.id); window.location.href = mailtoHref(m.to, m.subject, m.body); } catch (e) { fail(e); }
  };
  const print = async (s: RfqSupplier) => { if (!rfq) return; try { await openRfqPrint(rfq.id, s.supplier.id); } catch (e) { fail(e); } };

  /** A date or quantity changed: say it, then say which planned cards it now holds up (the server flags them on the plan). */
  const lineSaved = (n: PurchaseOrder & { plannedUnits?: PlannedUnits | null }, message: string) => {
    setLate(n.plannedUnits && n.plannedUnits.units.length ? n.plannedUnits : null);
    onPo(n, message);
  };
  const lineCount = po.lines.length;
  const open = po.status === 'ordered' || po.status === 'partially_received';
  const undated = po.lines.filter((l) => !l.expectedDate && l.outstanding > 0).length;

  return (
    <Box data-testid="po-stage-panel" data-lane={lane ?? 'none'}>
      <PurchaseStageStrip lane={lane} />
      {split && split.length > 1 && (
        <Box data-testid="po-split" sx={{ mb: 1.5, p: 1.25, borderRadius: 'var(--r-md)', background: 'var(--c-info-50)', border: '1px solid var(--c-info-200, var(--c-border))', fontSize: 13.5 }}>
          Split into {split.length} purchase orders: {split.map((p, i) => (
            <span key={p.id}>{i > 0 ? ', ' : ''}<Box component={Link} to={appPath(company, `purchase-orders/${p.id}`)} sx={{ ...linkSx, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{p.code}</Box>{p.supplier ? ` (${p.supplier.name})` : ' (not placed — no quotation accepted)'}</span>
          ))}.
        </Box>
      )}

      {requested && !stockChecked && (
        <SectionCard title="Check stock" subtitle="See what is already in stock for these lines, hold it for the sales order and take it off the purchase order.">
          <ErrorNotice error={sc.error} onRetry={sc.reload} />
          {!showCheck && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              {canManage && <Button variant="contained" startIcon={<Inventory2Rounded />} disabled={!lineCount || sc.loading && !sc.data} onClick={() => { sc.reload(); setShowCheck(true); }}>Check stock</Button>}
              {canManage && <Button variant="outlined" onClick={() => setPlacing(true)} disabled={!lineCount}>Place straight with a supplier</Button>}
              {!lineCount && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Add a line first.</Typography>}
            </Box>
          )}
          {showCheck && !sc.data && <SkeletonBlock h={120} r={8} />}
          {showCheck && sc.data && (
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              {!sc.data.canHold && <Typography sx={{ fontSize: 13, color: 'var(--c-warning-800)' }}>This purchase order is not bought for one sales order, so stock cannot be held for it.</Typography>}
              <StockCheckTable check={sc.data} typed={typed} onTyped={setTyped} />
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button variant="contained" disabled={busy || !canManage || sc.data.lines.some((l) => holdProblem(l, typed[l.lineId] ?? ''))} onClick={() => void applyHolds(false)}>Hold stock and reduce the PO</Button>
                <Button variant="outlined" disabled={busy || !canManage} onClick={() => void applyHolds(true)}>Skip — nothing in stock</Button>
                <Button color="inherit" disabled={busy} onClick={() => setShowCheck(false)}>Back</Button>
              </Box>
            </Box>
          )}
        </SectionCard>
      )}

      {po.status === 'quoting' && !rfq && !pq.loading && !pq.error && (
        <SectionCard title="Send the RFQ"><Typography sx={{ fontSize: 13.5 }}>This purchase order is waiting for quotations, but no RFQ was found under it.</Typography></SectionCard>
      )}

      {stockChecked && (
        <SectionCard title="Send the RFQ" subtitle="Stock is checked. Ask suppliers to quote the lines that are left.">
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {canManage && <Button variant="contained" onClick={() => setSendingRfq(true)} disabled={!lineCount}>Send RFQ</Button>}
            {canManage && <Button variant="outlined" onClick={() => setPlacing(true)} disabled={!lineCount}>Place straight with a supplier</Button>}
          </Box>
        </SectionCard>
      )}

      {quoting && (
        <SectionCard title={quotes > 0 ? 'Quotes in' : 'RFQ out'}
          subtitle={quotes > 0 ? 'Record each supplier\'s quotation, pick the winner per line, then accept and place the order.' : 'Waiting for quotations. Print or email the RFQ, and record each answer when it arrives.'}
          actions={canManage && rfq ? <Button size="small" onClick={() => setSendingRfq(true)}>Ask more suppliers</Button> : undefined}>
          <ErrorNotice error={pq.error} onRetry={pq.reload} />
          {pq.loading && !pq.data && <SkeletonBlock h={120} r={8} />}
          {rfq && (
            <Box sx={{ display: 'grid', gap: 2 }}>
              <Box component="table" data-testid="rfq-suppliers" sx={tableSx}>
                <thead><tr><th>Supplier</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rfq.suppliers.map((s) => (
                    <tr key={s.id} data-testid="rfq-supplier">
                      <td>{s.supplier.name}{s.supplier.email && <Box sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{s.supplier.email}</Box>}</td>
                      <td><Badge family={SUPPLIER_STATUS_FAMILY[s.status]} label={SUPPLIER_STATUS_LABEL[s.status]} /></td>
                      <td>
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {canManage && <Button size="small" variant={s.quote ? 'outlined' : 'contained'} onClick={() => setQuoteFor(s)}>{s.quote ? 'Edit quotation' : 'Record quotation'}</Button>}
                          <Button size="small" onClick={() => void print(s)}>Print</Button>
                          <Button size="small" onClick={() => void email(s)}>Email</Button>
                        </Box>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Box>
              {comparison && quotes > 0 && (
                <>
                  <RfqComparison comparison={comparison} choices={effective} editable={canManage} busy={busy}
                    onChoose={(lineId, sid) => setChoices({ ...effective, [lineId]: sid })}
                    onCheapest={() => setChoices(recommendedChoices(comparison))} cheapestLabel="Use the recommendation" />
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                    {canManage && <Button variant="contained" disabled={busy || awards.length === 0} onClick={() => void place()}>Accept and place order</Button>}
                    <Typography data-testid="place-summary" sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                      {awards.length === 0 ? 'Pick a supplier for at least one line.'
                        : orders > 1 ? `Placing splits this into ${orders} purchase orders — one per supplier${awards.length < comparison.lines.length ? ', plus one for the lines nobody won' : ''}.`
                          : `Places ${awards.length} ${awards.length === 1 ? 'line' : 'lines'} with one supplier.`}
                    </Typography>
                  </Box>
                </>
              )}
            </Box>
          )}
        </SectionCard>
      )}

      {open && (
        <SectionCard title={po.status === 'partially_received' ? 'Timeline and goods receipt — part received' : 'Timeline and goods receipt'}
          subtitle="One receiving date per line, until it arrives. Production waits for these dates. Book the delivery against the line as it comes in.">
          {undated > 0 && (
            <Typography data-testid="po-undated" sx={{ fontSize: 13, color: 'var(--c-warning-800)', mb: 1 }}>
              {undated} {undated === 1 ? 'line has' : 'lines have'} no expected date yet.
            </Typography>
          )}
          {late && (
            <Box data-testid="po-late-note" role="status" sx={{ mb: 1, color: 'var(--c-warning-800)', fontSize: 13 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{plannedUnitsSentence(late)}</Typography>
              {late.units.map((u) => <Box key={u.unitKey} data-testid="po-late-unit" sx={{ fontSize: 12.5 }}>{u.code}: {u.message}</Box>)}
            </Box>
          )}
          <Box component="table" data-testid="po-timeline" sx={tableSx}>
            <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Ordered</th><th style={{ textAlign: 'right' }}>Received</th><th>Receiving date</th><th /></tr></thead>
            <tbody>
              {po.lines.map((l) => {
                const missing = !l.expectedDate && l.outstanding > 0;
                return (
                  <tr key={l.id} data-testid="po-timeline-row" data-missing={missing ? 'true' : 'false'} style={missing ? { background: 'var(--c-warning-50)' } : undefined}>
                    <td><Mono>{l.item.code ?? '—'}</Mono><Box sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{l.item.name}</Box>
                      {(l.orders ?? []).some((o) => o.requisition) && <Box data-testid="po-line-pr" sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>For {(l.orders ?? []).filter((o) => o.requisition).map((o) => `${o.requisition!.code} (${qtyText(o.quantity)})`).join(', ')}</Box>}</td>
                    <td style={{ textAlign: 'right' }}>{canManage && l.outstanding > 0
                      ? <QtyCell value={l.quantity} label={`Ordered quantity of ${l.item.code ?? l.item.name}`} lineId={l.id} onSaved={(n) => lineSaved(n, 'Quantity saved.')} />
                      : <Mono>{qtyText(l.quantity)}</Mono>} <Mono muted>{l.item.uom}</Mono></td>
                    <td style={{ textAlign: 'right' }}><Mono muted={!l.received}>{qtyText(l.received)}</Mono></td>
                    <td>
                      {l.outstanding > 0
                        ? <DateCell value={l.expectedDate} label={`Expected date for ${l.item.code ?? l.item.name}`} disabled={!canManage} missing={missing} lineId={l.id}
                          onSaved={(n) => lineSaved(n, 'Receiving date saved.')} />
                        : <Mono muted>{l.expectedDate ?? '—'}</Mono>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {canManage && l.outstanding > 0 && <Button size="small" variant="outlined" startIcon={<Inventory2Rounded />} onClick={() => onReceive(l)}>Receive</Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Box>
        </SectionCard>
      )}

      {po.lines.some((l) => l.receipts.length > 0) && (
        <SectionCard title="Deliveries booked" subtitle="A wrong delivery can be undone while its stock has not been used. Stock already reserved or issued must be let go first.">
          <Box component="table" data-testid="po-deliveries" sx={tableSx}>
            <thead><tr><th>Item</th><th>Delivery</th><th style={{ textAlign: 'right' }}>Quantity</th><th>Date</th><th /></tr></thead>
            <tbody>
              {po.lines.flatMap((l) => {
                const latest = Math.max(...l.receipts.map((r) => r.id));
                return l.receipts.map((r) => (
                  <tr key={r.id} data-testid="po-delivery-row">
                    <td><Mono>{l.item.code ?? l.item.name}</Mono></td>
                    <td><Box component={Link} to={appPath(company, `movements/${r.id}`)} sx={{ ...linkSx, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.code}</Box></td>
                    <td style={{ textAlign: 'right' }}><Mono>{qtyText(r.quantity)}</Mono> <Mono muted>{l.item.uom}</Mono></td>
                    <td><Mono muted>{r.date}</Mono></td>
                    <td style={{ textAlign: 'right' }}>{canManage && r.id === latest && (
                      <Button size="small" startIcon={<UndoRounded />} onClick={() => setUndoing({ id: r.id, code: r.code, item: l.item.code ?? l.item.name })}>Undo receipt</Button>)}</td>
                  </tr>
                ));
              })}
            </tbody>
          </Box>
        </SectionCard>
      )}
      <PromptDialog open={!!undoing} title={`Undo ${undoing?.code ?? 'the receipt'}?`} label="Why" confirmLabel="Undo receipt" danger
        body={`Takes ${undoing?.item ?? 'the goods'} back out of stock and puts the quantity back on the purchase order. Refused if the stock has already been reserved for production or issued.`}
        onClose={() => setUndoing(null)}
        onConfirm={async (reason) => {
          if (!undoing) return;
          const r = await cfApi.post<{ code: string; purchase?: { released?: unknown[] } }>(`/movements/${undoing.id}/reverse`, { reason });
          const n = r.purchase?.released?.length ?? 0;
          onChanged(`${undoing.code} undone (${r.code}).${n ? ` ${n} held ${n === 1 ? 'share was' : 'shares were'} let go.` : ''}`);
        }} />
      {rfq && (
        <QuoteDialog rfq={rfq} entry={quoteFor} onClose={() => setQuoteFor(null)} onSave={saveQuote} />
      )}
      <SendRfqDialog open={sendingRfq} po={{ id: po.id, code: po.code, lines: lineCount }} taken={rfq ? rfq.suppliers.map((s) => s.supplier.id) : []} onClose={() => setSendingRfq(false)}
        onSent={(r) => { pq.setData(r); onChanged(rfq ? 'More suppliers asked.' : `RFQ sent for ${po.code}.`); }} />
      <SendPurchaseDialog order={placing ? po : null} onClose={() => setPlacing(false)} onSent={(n) => { setPlacing(false); onPo(n, `${n.code} placed with ${n.supplier?.name ?? 'the supplier'}.`); }} />
    </Box>
  );
}
