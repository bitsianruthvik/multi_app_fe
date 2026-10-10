import { useState } from 'react';
import { Alert, Box, Button, Divider, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import LaunchRounded from '@mui/icons-material/LaunchRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import PlaylistAddCheckRounded from '@mui/icons-material/PlaylistAddCheckRounded';
import ShoppingCartRounded from '@mui/icons-material/ShoppingCartRounded';
import SkipNextRounded from '@mui/icons-material/SkipNextRounded';
import { CfApiError } from '../../api/client';
import { getOrderPurchase } from '../../api/purchase';
import {
  getOrderRequisitions, raiseRequisitions, skipLines, unskipLines,
  type LineWithout, type ReqLine, type Requisition,
} from '../../api/requisitions';
import type { OrderStage, SalesOrder } from '../../api/types';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { appPath } from '../../navMeta';
import { lineCanBuy, lineIsOpen } from '../../lib/requisition';
import { buyingSummaryWords } from '../../lib/process';
import { ErrorNotice, Mono, SectionCard, SkeletonBlock } from '../ui';
import { useToast } from '../toastContext';
import { StageStateBadge } from '../OrderProcess/stageUi';
import { MaterialReadyChip } from './MaterialReadyChip';
import { PurchaseLanes } from './PurchaseLanes';
import { BuyDialog, ExcessDialog, SkipDialog, StockCheckDialog } from './RequisitionDialogs';
import { RequisitionBlock } from './RequisitionTable';

const NO_MANAGE_BUYING = 'You can see the requisition, but your role cannot change it. Holding stock, skipping and buying need the inventory manage permission.';

type Refusal = { message: string; problems: string[] };
const refusalOf = (e: unknown): Refusal => (e instanceof CfApiError ? { message: e.message, problems: e.problems } : { message: (e as Error).message, problems: [] });

/**
 * The order's Buying stage (Buying v2, CF_ERP_BUYING_V2.md). Each sales-order line has a REQUISITION: one row per
 * material, and for each one of three decisions — hold it from stock, buy it (one or several purchase orders, each
 * with its own receiving date), or skip it (the work that needs it waits for stock). Production is held by what
 * is decided here; the server says when each unit is ready. RFQs, quotes and placing live on the purchase order.
 */
export function OrderPurchasePanel({ order, stage, onChanged }: { order: SalesOrder; stage: OrderStage; onChanged?: () => void }) {
  const company = useCompanySlug();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canView = isPermitted('cf_erp_inventory_view');
  const canManage = isPermitted('cf_erp_inventory_manage');
  const reqs = useLoad(() => (canView ? getOrderRequisitions(order.id) : Promise.resolve(null)), [order.id, canView]);
  const lanes = useLoad(() => (canView ? getOrderPurchase(order.id) : Promise.resolve(null)), [order.id, canView]);
  const data = reqs.data;
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [checking, setChecking] = useState<{ requisitions: { id: number; code: string }[]; only?: number[] } | null>(null);
  const [skipping, setSkipping] = useState<{ reqId: number; lineIds?: number[]; count: number }[] | null>(null);
  const [buying, setBuying] = useState<{ req: Requisition; line: ReqLine }[] | null>(null);
  const [excess, setExcess] = useState<ReqLine | null>(null);

  const requisitions = data?.requisitions ?? [];
  const without = data?.linesWithout ?? [];
  const reload = () => { reqs.reload(); lanes.reload(); invalidateNavCounts(); onChanged?.(); };
  /** Run one write: on a refusal the server's sentence (and every problem) stays on the page, with Reload. */
  const act = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true); setRefusal(null);
    try { await fn(); toast.success(success); reload(); } catch (e) { setRefusal(refusalOf(e)); } finally { setBusy(false); }
  };

  const allLines = requisitions.flatMap((r) => r.lines.map((l) => ({ req: r, line: l })));
  const openLines = allLines.filter((x) => x.line.cover.open > 0 && x.line.status !== 'not_needed');
  const skippable = allLines.filter((x) => lineIsOpen(x.line));
  const buyable = allLines.filter((x) => lineCanBuy(x.line) && !x.line.skipped);
  const raisable = without.filter((w) => w.canRaise);
  const summary = buyingSummaryWords(stage.summary);

  const raise = (lineIds?: number[]) => act(async () => {
    const r = await raiseRequisitions(order.id, lineIds ? { lineIds } : {});
    reqs.setData(r);
  }, lineIds ? 'Requisition raised.' : 'Requisition raised for the order.');

  return (
    <SectionCard title="Buying" subtitle={`${order.code}'s material: for each one, hold it from stock, buy it, or skip it. Production waits for what is not decided.`}
      actions={canView ? <Button size="small" endIcon={<LaunchRounded />} component={Link} to={`${appPath(company, 'purchase')}?order=${order.id}`}>Open on the Purchase board</Button> : undefined}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <StageStateBadge stage={stage} />
          <Typography data-testid="buying-summary" sx={{ fontSize: 13.5, color: 'var(--c-text-2)', flex: '1 1 240px', minWidth: 0 }}>{stage.detail}</Typography>
        </Box>
        {summary && <Typography data-testid="buying-skipped" sx={{ fontSize: 13, color: 'var(--c-warning-800)' }}>{summary}</Typography>}
        {!canView && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Seeing the requisition needs the inventory view permission.</Typography>}
        {canView && !canManage && <Typography data-testid="buying-readonly" sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>{NO_MANAGE_BUYING}</Typography>}
        {refusal && (
          <Alert severity="warning" data-testid="buying-refusal" action={<Button color="inherit" size="small" onClick={() => { setRefusal(null); reload(); }}>Reload</Button>}>
            <Box>{refusal.message}</Box>
            {refusal.problems.filter((p) => p !== refusal.message).map((p) => <Box key={p} sx={{ fontSize: 12.5 }}>{p}</Box>)}
          </Alert>
        )}
        <ErrorNotice error={reqs.error} onRetry={reqs.reload} />
        {canView && !data && !reqs.error && <SkeletonBlock h={180} r={8} />}
        {data && (
          <>
            {canManage && (requisitions.length > 0 || raisable.length > 0) && (
              <Box data-testid="buying-header-actions" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                {raisable.length > 0 && (
                  <Button variant="contained" startIcon={<PlaylistAddCheckRounded />} disabled={busy} onClick={() => void raise()}>
                    {requisitions.length ? 'Raise for the other lines' : 'Raise the requisition'}
                  </Button>
                )}
                {openLines.length > 0 && (
                  <Button variant="outlined" startIcon={<Inventory2Rounded />} disabled={busy}
                    onClick={() => setChecking({ requisitions: [...new Map(openLines.map((x) => [x.req.id, { id: x.req.id, code: x.req.code }])).values()] })}>Check stock for all</Button>
                )}
                {skippable.length > 0 && (
                  <Button variant="outlined" startIcon={<SkipNextRounded />} disabled={busy}
                    onClick={() => setSkipping(requisitions.map((r) => ({ reqId: r.id, count: r.lines.filter(lineIsOpen).length })).filter((s) => s.count > 0))}>Skip all that are open</Button>
                )}
                {buyable.length > 0 && <Button variant="outlined" startIcon={<ShoppingCartRounded />} disabled={busy} onClick={() => setBuying(buyable)}>Buy the rest</Button>}
              </Box>
            )}
            {!data.requisitions.length && !without.length && (
              <Typography data-testid="buying-empty" sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>{data.reason ?? 'No line of this order buys any material.'}</Typography>
            )}
            {requisitions.map((r, i) => (
              <Box key={r.id}>
                {i > 0 && <Divider sx={{ mb: 2 }} />}
                <RequisitionBlock req={r} canManage={canManage} busy={busy}
                  onRefresh={() => void raise([r.line.id])}
                  actions={{
                    onCheck: (l) => setChecking({ requisitions: [{ id: r.id, code: r.code }], only: [l.id] }),
                    onSkip: (l) => void act(() => skipLines(r.id, { lineIds: [l.id] }), `${l.item.code ?? l.item.name} is skipped — it waits for stock.`),
                    onUnskip: (l) => void act(() => unskipLines(r.id, { lineIds: [l.id] }), `${l.item.code ?? l.item.name}: skip undone.`),
                    onBuy: (l) => setBuying([{ req: r, line: l }]),
                    onExcess: (l) => setExcess(l),
                  }} />
              </Box>
            ))}
            {without.length > 0 && (
              <Box data-testid="lines-without" sx={{ display: 'grid', gap: 1 }}>
                {requisitions.length > 0 && <Divider />}
                {without.map((w) => <LineWithoutRow key={w.line.id} w={w} canManage={canManage} busy={busy} onRaise={() => void raise([w.line.id])} />)}
              </Box>
            )}
            {(lanes.data?.lanes.reduce((t, l) => t + l.count, 0) ?? 0) > 0 && (
              <Box sx={{ display: 'grid', gap: 0.5 }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Purchase orders for this order</Typography>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Open one to ask suppliers for quotes, place the order, set receiving dates and book the goods in.</Typography>
                <PurchaseLanes lanes={lanes.data!.lanes} compact />
              </Box>
            )}
          </>
        )}
      </Box>

      <StockCheckDialog open={!!checking} requisitions={checking?.requisitions ?? []} onlyLineIds={checking?.only} onClose={() => setChecking(null)}
        onHeld={(done, held) => { toast.success(held ? `Stock held for ${order.code}.` : 'Nothing was held.'); reload(); void done; }} />
      <SkipDialog open={!!skipping} count={skipping?.reduce((t, s) => t + s.count, 0) ?? 0} onClose={() => setSkipping(null)}
        onSkip={async (note) => {
          for (const s of skipping ?? []) await skipLines(s.reqId, { all: true }, note || null);
          toast.success('Skipped — those materials wait for stock.'); reload();
        }} />
      <BuyDialog open={!!buying} lines={buying ?? []} onClose={() => setBuying(null)}
        onDone={(r) => { toast.success(r.purchaseOrders.length === 1 ? `${r.purchaseOrders[0].code} made.` : `${r.purchaseOrders.length} purchase orders made.`); reload(); }} />
      <ExcessDialog open={!!excess} line={excess} onClose={() => setExcess(null)} onDone={() => { toast.success('The excess is let go.'); reload(); }} />
    </SectionCard>
  );
}

/** A line of the order with no requisition yet: what it would need, and a button to raise it — or why it cannot. */
function LineWithoutRow({ w, canManage, busy, onRaise }: { w: LineWithout; canManage: boolean; busy: boolean; onRaise: () => void }) {
  const mr = w.materialReady;
  return (
    <Box data-testid="line-without" data-line={w.line.id} sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
      <Typography sx={{ fontSize: 13.5 }}><strong>Line {w.line.lineNo}</strong>{w.line.name ? ` · ${w.line.name}` : ''} has no requisition yet.</Typography>
      {w.materials.length > 0 && <Mono muted>{w.materials.length} {w.materials.length === 1 ? 'material' : 'materials'}</Mono>}
      {mr && <MaterialReadyChip state={mr.state} date={mr.readyDate} text={mr.text} testId="line-without-ready" />}
      {w.canRaise
        ? canManage && <Button size="small" variant="outlined" startIcon={<PlaylistAddCheckRounded />} disabled={busy} onClick={onRaise}>Raise the requisition</Button>
        : <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{w.reason}</Typography>}
    </Box>
  );
}
