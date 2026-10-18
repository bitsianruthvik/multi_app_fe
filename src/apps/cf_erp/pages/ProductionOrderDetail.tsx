/**
 * Production › Production order (§76): one production order — its state (Yet to plan → Planned → In production →
 * Dispatch → Closed), what it covers, its actions (Release / Take back / Dispatch) and every piece's steps, from the
 * tracker. The Tracker page scoped to it opens beside. Full screen.
 */
import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import { CfApiError } from '../api/client';
import { dispatchProductionOrder, getProductionOrder, releaseProductionOrders, takeBackProductionOrder } from '../api/productionOrders';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useFullScreen } from '../hooks/useFullScreen';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { PO_STATE, progressText, releaseToast, shortDate, trackerPathOf } from '../lib/productionOrders';
import { Badge, DetailSkeleton, EmptyState, ErrorNotice, Fact, Mono, PageHeader, SectionCard } from '../components/ui';
import { FullScreenFrame, FullScreenToggle } from '../components/FullScreen';
import { useToast } from '../components/toastContext';
import { ContractorWorkCard } from '../components/ContractorWork/ContractorWorkCard';

const STEP_FAMILY: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  done: 'success', in_progress: 'warning', ready: 'info', not_ready: 'neutral', on_hold: 'danger',
};

export default function ProductionOrderDetail() {
  const { id } = useParams();
  const company = useCompanySlug();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const fs = useFullScreen('production-order');
  const load = useLoad(() => getProductionOrder(Number(id)), [id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const po = load.data;
  if (!po) return load.error ? <ErrorNotice error={load.error} onRetry={load.reload} /> : <DetailSkeleton />;
  const s = PO_STATE[po.state];
  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setError(null);
    try { toast.success(await fn()); load.reload(); invalidateNavCounts(); } catch (e) { setError(e instanceof CfApiError ? e : new CfApiError(0, String(e))); } finally { setBusy(false); }
  };
  const canProduce = isPermitted('cf_erp_production_manage');
  return (
    <FullScreenFrame on={fs.on} onExit={() => fs.set(false)}>
      <PageHeader title={<Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}><Mono sx={{ fontWeight: 600 }}>{po.code}</Mono><Badge family={s.family} label={s.label} noIcon /></Box>}
        subtitle={po.label}
        actions={(
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            {canProduce && po.actions.release && <Button variant="contained" startIcon={<RocketLaunchRounded />} disabled={busy} onClick={() => run(async () => { const r = await releaseProductionOrders([po.id]); return releaseToast(r.released, r.fromMr); })}>Release</Button>}
            {canProduce && po.actions.takeBack && <Button color="inherit" startIcon={<UndoRounded />} disabled={busy} onClick={() => run(async () => { await takeBackProductionOrder(po.id); return `${po.code} taken back.`; })}>Take back</Button>}
            {isPermitted('cf_erp_inventory_manage') && po.actions.dispatch && <Button variant="contained" color="success" startIcon={<LocalShippingRounded />} disabled={busy}
              onClick={() => run(async () => { const r = await dispatchProductionOrder(po.id); return r.closed ? `${po.code} dispatched and closed.` : `${po.code}: finished units dispatched.`; })}>Dispatch</Button>}
            {po.state !== 'yet_to_plan' && <Button startIcon={<AccountTreeRounded />} component={Link} to={appPath(company, trackerPathOf(po.id))}>Open in Tracker</Button>}
            <FullScreenToggle on={fs.on} onToggle={fs.toggle} />
          </Box>
        )} />
      <ErrorNotice error={error} />
      <SectionCard title="What it is">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, minmax(0, 1fr))' }, gap: 1.5 }}>
          <Fact label="Sales order"><Box component={Link} to={appPath(company, `orders/${po.order.id}?tab=production`)} sx={{ color: 'inherit' }}><Mono>{po.order.code}</Mono></Box></Fact>
          <Fact label="Made per">{po.level === 'order' ? 'the whole order' : po.level === 'line' ? 'line' : po.level === 'unit' ? `unit ${po.unitNo}` : 'sub-assembly'}</Fact>
          <Fact label="Progress">{progressText(po.progress)}</Fact>
          <Fact label="Released">{po.releasedAt ? `${shortDate(po.releasedAt)}${po.releasedBy ? ` · ${po.releasedBy}` : ''}` : '—'}</Fact>
          <Fact label="Dispatch">{po.dispatch.level === 'same' ? 'as a whole' : `per ${po.dispatch.level}`}{po.units.length ? ` · ${po.units.reduce((t, u) => t + u.shipped, 0)} of ${po.units.reduce((t, u) => t + u.units, 0)} shipped` : ''}</Fact>
        </Box>
      </SectionCard>
      <Box sx={{ mt: 2 }}>
        <SectionCard title="Pieces and steps" subtitle={po.state === 'yet_to_plan' ? 'Release it to put its pieces on the floor.' : `${po.piecesTotal} piece${po.piecesTotal === 1 ? '' : 's'} with steps${po.piecesTotal > po.pieces.length ? ` — the first ${po.pieces.length} shown; the Tracker has them all` : ''}.`}>
          {po.pieces.length === 0 ? <EmptyState title={po.state === 'yet_to_plan' ? 'Not released yet' : 'No steps'} /> : (
            <Box sx={{ display: 'grid', gap: 0.5 }} data-testid="po-pieces">
              {po.pieces.map((p) => (
                <Box key={p.id} sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap', pl: Math.min(p.depth, 6) * 1.5, py: 0.5, borderTop: '1px solid var(--c-divider)' }}>
                  <Mono sx={{ minWidth: 160 }}>{p.code ?? p.label}</Mono>
                  {p.steps.map((st) => (
                    <Box key={st.id} title={st.workOrder ? `With ${st.workOrder.contractorName ?? 'a contractor'} (${st.workOrder.code}) — not done in-house.` : st.blockers.map((b) => b.text).join(' ') || undefined}>
                      <Badge family={st.workOrder ? 'info' : STEP_FAMILY[st.status] ?? 'neutral'} label={`${st.operation.code} ${st.qtyGood}/${st.quantity}${st.workOrder ? ` · with ${st.workOrder.contractorName ?? 'contractor'} (${st.workOrder.code})` : ''}`} noIcon />
                    </Box>
                  ))}
                </Box>
              ))}
            </Box>
          )}
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 1 }}>Hover a step to see what it waits for. Work is recorded on the Floor (machine log) or in the Tracker.</Typography>
        </SectionCard>
      </Box>
      <Box sx={{ mt: 2 }}>
        <ContractorWorkCard productionOrderId={po.id} canGive={canProduce || isPermitted('cf_erp_accounts_manage')} />
      </Box>
    </FullScreenFrame>
  );
}
