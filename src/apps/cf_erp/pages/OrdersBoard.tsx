import { useCallback, useEffect, useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import ViewKanbanRounded from '@mui/icons-material/ViewKanbanRounded';
import { cfApi, CfApiError } from '../api/client';
import { getOrderBoard, type BoardCard, type OrderBoard } from '../api/acceptance';
import { useCompanySlug } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { Badge, DangerBadge, EmptyState, ErrorNotice, ListSkeleton, Mono, PageHeader } from '../components/ui';
import { StageChecklist } from '../components/Acceptance/StageChecklist';
import { OrderValueText } from '../components/OrderValueText';
import { useToast } from '../components/toastContext';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/** One order on the board: what it is, and the facts that put it in its lane. */
function Card({ c, canTick, onChanged }: { c: BoardCard; canTick: boolean; onChanged: () => void }) {
  const company = useCompanySlug();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_orders_manage');
  const [busy, setBusy] = useState(false);
  const close = async () => {
    setBusy(true);
    try { await cfApi.post(`/orders/${c.id}/status`, { status: 'closed' }); toast.success(`${c.code} closed.`); invalidateNavCounts(); onChanged(); }
    catch (e) { toast.error((e as CfApiError).message); } finally { setBusy(false); }
  };
  const a = c.facts.acceptance;
  return (
    <Box data-testid="board-card" data-order={c.id} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface)', p: 1.25, display: 'grid', gap: 0.75, minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
        <Mono chip><Box component={Link} to={appPath(company, `orders/${c.id}`)} sx={linkSx}>{c.code}</Box></Mono>
        {c.overdue && <DangerBadge label="Late" />}
        {c.facts.rateChangePending && <Badge family="warning" noIcon label="Rate change waiting" />}
      </Box>
      <Typography sx={{ fontSize: 13, fontWeight: 500, overflowWrap: 'anywhere' }}>{c.customer ?? '—'}{c.title ? ` · ${c.title}` : ''}</Typography>
      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{c.committedDate ? `Due ${c.committedDate}` : 'No committed date'} · {c.facts.lines} line{c.facts.lines === 1 ? '' : 's'}</Typography>
      {c.value && c.value.amount != null && <Box data-testid="board-value" sx={{ fontSize: 12 }}><OrderValueText value={c.value} compact /></Box>}
      {c.lane === 'inquiry' && a?.status === 'rejected' && <Typography sx={{ fontSize: 12, color: 'var(--c-danger-700)' }}>Sent back{a.note ? `: ${a.note}` : ''}</Typography>}
      {c.lane === 'pending_approval' && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>Acceptance v{a?.version} waits for Management</Typography>}
      {c.lane === 'material' && <Typography sx={{ fontSize: 12, color: c.facts.materialInPlace ? 'var(--c-success-700)' : 'var(--c-text-2)' }}>{c.facts.materialInPlace ? 'All material in place' : c.facts.material}</Typography>}
      {(c.lane === 'in_production' || c.lane === 'dispatched') && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{c.facts.released} released · {c.facts.dispatched}</Typography>}
      {c.lane === 'post_production' && (
        <>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{c.stagesDone} of {c.stages.length} stage{c.stages.length === 1 ? '' : 's'} done</Typography>
          <StageChecklist stages={c.stages} canTick={canTick} compact onChanged={onChanged} />
          {c.facts.payment && <Typography data-testid="board-payment" sx={{ fontSize: 12, color: c.facts.payment.fullyPaid ? 'var(--c-success-700)' : 'var(--c-warning-800)' }}>{c.facts.payment.text}{!c.facts.payment.fullyPaid && c.stagesDone >= c.stages.length ? ' — it closes once fully paid' : ''}</Typography>}
          {c.canClose && canManage && <Button size="small" variant="outlined" disabled={busy} onClick={() => void close()} data-testid="board-close">Close the order</Button>}
        </>
      )}
    </Box>
  );
}

/**
 * SALES › ORDERS BOARD (§73): every customer order in a swim lane — Inquiry / draft → Pending approval → Material →
 * In production → Dispatched → Post-production → Closed. Nothing is dragged: a card moves by itself when a tracked fact
 * changes (the acceptance approved, material locked, a line released, a dispatch). In Post-production the card is the
 * order's own stages as a checklist; the last stage done closes the order — once it is fully paid (§74).
 */
export default function OrdersBoard() {
  const canTick = useIsPermitted()('cf_erp_orders_manage');
  const [search, setSearch] = useUrlParam('search', '');
  const [typed, setTyped] = useState(search);
  const [data, setData] = useState<OrderBoard | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const load = useCallback(() => {
    setError(null);
    getOrderBoard(search || undefined).then(setData).catch((e) => setError(e as CfApiError));
  }, [search]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = window.setTimeout(() => { if (typed !== search) setSearch(typed); }, 300); return () => window.clearTimeout(t); }, [typed, search, setSearch]);
  const empty = data && data.lanes.every((l) => !l.cards.length);
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
      <PageHeader title="Orders board" subtitle="Every customer order, in the lane its facts put it in."
        actions={<TextField size="small" placeholder="Search orders" value={typed} onChange={(e) => setTyped(e.target.value)} inputProps={{ 'aria-label': 'Search orders', 'data-testid': 'board-search' }} />} />
      <ErrorNotice error={error} onRetry={load} />
      {!data && !error && <ListSkeleton rows={4} />}
      {empty && <EmptyState icon={<ViewKanbanRounded />} title="No customer orders to show." />}
      {data && !empty && (
        <Box data-testid="orders-board" sx={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: { xs: '78vw', sm: 'minmax(230px, 1fr)' }, gap: 1.25, overflowX: 'auto', pb: 1, minWidth: 0 }}>
          {data.lanes.map((lane) => (
            <Box key={lane.key} data-testid="board-lane" data-lane={lane.key} sx={{ background: 'var(--c-surface-2)', borderRadius: 'var(--r-md)', p: 1, display: 'grid', alignContent: 'start', gap: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', px: 0.5 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-2)' }}>{lane.label}</Typography>
                <Mono muted>{lane.cards.length}</Mono>
              </Box>
              {lane.cards.map((c) => <Card key={c.id} c={c} canTick={canTick} onChanged={load} />)}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
