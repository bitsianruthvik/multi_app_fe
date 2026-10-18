/**
 * Production › Production orders (§76): every production order, grouped by sales order — its code, what it makes
 * ("SO260014 · Span 2 of 3"), its state (Yet to plan → Planned → In production → Dispatch → Closed) and how far it is.
 * Chips filter by state; a row opens the production order; "Release all" releases every one still Yet to plan on the
 * page. Lines released before production orders are listed at the foot (read-only, they open in the Tracker).
 */
import { useEffect, useState } from 'react';
import { Box, Button, Collapse, IconButton, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded';
import { CfApiError } from '../api/client';
import { listProductionOrders, releaseProductionOrders, type PoFilter, type ProductionOrdersPage } from '../api/productionOrders';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useDebounced } from '../hooks/usePagedList';
import { useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { CompletionBar } from '../components/Tracker/TreeParts';
import { useToast } from '../components/toastContext';
import {
  PO_FILTERS, PO_ORDERS_PER_PAGE, PO_STATE, loadCollapsed, productionOrderPath, progressText, releasableIds, releaseToast, saveCollapsed, shortDate,
} from '../lib/productionOrders';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };
const COLS = { xs: '1fr auto', md: '130px minmax(200px, 2fr) 120px 150px 100px' };

export default function ProductionOrders() {
  const toast = useToast();
  const canProduce = useIsPermitted()('cf_erp_production_manage');
  const [state, setState] = useUrlParam('state', 'open');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  const [page, setPage] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => loadCollapsed());
  const [error, setError] = useState<CfApiError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPage(0); }, [state, term]);
  const data = useLoad(() => listProductionOrders({ state: state as PoFilter, search: term, limit: PO_ORDERS_PER_PAGE, offset: page * PO_ORDERS_PER_PAGE }), [state, term, page]);
  const d: ProductionOrdersPage | null = data.data;
  const toggle = (id: number) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); saveCollapsed(n); return n; });
  const toRelease = releasableIds((d?.rows ?? []).flatMap((g) => g.productionOrders));
  const releaseAll = async () => {
    setBusy(true); setError(null);
    try { const r = await releaseProductionOrders(toRelease); toast.success(releaseToast(r.released, r.fromMr)); invalidateNavCounts(); data.reload(); }
    catch (e) { setError(e instanceof CfApiError ? e : new CfApiError(0, String(e))); } finally { setBusy(false); }
  };

  return (
    <Box>
      <PageHeader title="Production orders" subtitle="Made from each sales order's execution plan. Click one to see its pieces and steps."
        actions={canProduce && toRelease.length > 0 && (
          <Button variant="contained" startIcon={<RocketLaunchRounded />} disabled={busy} onClick={releaseAll} data-testid="po-page-release-all">Release all yet to plan ({toRelease.length})</Button>
        )} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search order, production order or customer">
        {PO_FILTERS.map((f) => <FacetChip key={f.key} label={f.label} active={state === f.key} count={d?.counts[f.key]} onClick={() => setState(f.key)} />)}
      </FilterBar>
      <ErrorNotice error={error ?? data.error} onRetry={error ? undefined : data.reload} />
      {!d ? (!data.error && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Reading…</Typography>)
        : d.rows.length === 0 ? (
          <EmptyState icon={<PrecisionManufacturingRounded />} title={term || state !== 'all' ? 'No production order matches' : 'No production orders yet'}
            hint={term || state !== 'all' ? 'Clear a filter or the search.' : 'A sales order\'s Production step creates them from its execution plan.'} />
        ) : (
          <Box data-testid="po-list" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {d.rows.map((g) => <OrderBlock key={g.order.id} g={g} open={!collapsed.has(g.order.id)} onToggle={() => toggle(g.order.id)} />)}
            {(page > 0 || d.hasMore) && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Orders {d.offset + 1}–{d.offset + d.rows.length} of {d.total}</Typography>
                <Button size="small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button size="small" disabled={!d.hasMore} onClick={() => setPage((p) => p + 1)} data-testid="po-next">Next</Button>
              </Box>
            )}
          </Box>
        )}
      {d && d.legacy.length > 0 && <Legacy rows={d.legacy} />}
    </Box>
  );
}

function OrderBlock({ g, open, onToggle }: { g: ProductionOrdersPage['rows'][number]; open: boolean; onToggle: () => void }) {
  const company = useCompanySlug();
  const navigate = useNavigate();
  return (
    <Box data-testid="po-order" data-order={g.order.code} sx={{ border: '1px solid var(--c-divider)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
      <Box role="button" tabIndex={0} aria-expanded={open} onClick={onToggle} data-testid="po-order-head"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', px: 1.5, py: 1, background: 'var(--c-surface-2)', cursor: 'pointer' }}>
        <IconButton size="small" aria-label={open ? 'Fold' : 'Open'} sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--t-fast) var(--ease)' }}><ExpandMoreRounded fontSize="small" /></IconButton>
        <Mono sx={{ fontWeight: 600 }}>
          <Box component={Link} to={appPath(company, `orders/${g.order.id}?tab=production`)} sx={linkSx} onClick={(e: React.MouseEvent) => e.stopPropagation()}>{g.order.code}</Box>
        </Mono>
        <Typography noWrap sx={{ fontSize: 13, color: 'var(--c-text-2)', minWidth: 0, flex: '1 1 160px' }}>{[g.order.customer?.name, g.order.title].filter(Boolean).join(' · ') || '—'}</Typography>
        <Typography data-testid="po-order-totals" sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
          {g.productionOrders.length} production order{g.productionOrders.length === 1 ? '' : 's'}
        </Typography>
      </Box>
      <Collapse in={open} unmountOnExit>
        {g.productionOrders.map((po) => {
          const s = PO_STATE[po.state];
          const go = () => navigate(appPath(company, productionOrderPath(po.id)));
          return (
            <Box key={po.id} data-testid="po-line" data-state={po.state} role="link" tabIndex={0} onClick={go}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }}
              sx={{ display: 'grid', gridTemplateColumns: COLS, gap: 1, alignItems: 'center', px: 1.5, py: 0.75, borderTop: '1px solid var(--c-divider)', fontSize: 13, cursor: 'pointer', '&:hover': { background: 'var(--c-surface-2)' } }}>
              <Mono>{po.code}</Mono>
              <Box sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', gridColumn: { xs: '1 / -1', md: 'auto' }, order: { xs: 2, md: 0 } }} title={po.label}>{po.label}</Box>
              <Box><Badge family={s.family} label={s.label} noIcon /></Box>
              <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 1, alignItems: 'center' }}><CompletionBar value={po.progress.pct / 100} width={60} title={progressText(po.progress)} /></Box>
              <Box sx={{ display: { xs: 'none', md: 'block' }, color: 'var(--c-text-3)', fontSize: 12 }}>{po.releasedAt ? `released ${shortDate(po.releasedAt)}` : ''}</Box>
            </Box>
          );
        })}
      </Collapse>
    </Box>
  );
}

function Legacy({ rows }: { rows: ProductionOrdersPage['legacy'] }) {
  const company = useCompanySlug();
  return (
    <Box sx={{ mt: 2.5 }} data-testid="po-legacy">
      <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.75 }}>Released before production orders</Typography>
      {rows.map((r) => (
        <Box key={r.releaseId} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', fontSize: 13, py: 0.5, borderTop: '1px solid var(--c-divider)' }}>
          <Mono>{r.order.code}</Mono><span>Line {r.line.lineNo}</span>
          <Box sx={{ color: 'var(--c-text-2)', flex: 1, minWidth: 0 }}>{r.itemName}</Box>
          <span>{r.done} of {r.steps} steps</span>
          <Box component={Link} to={appPath(company, `tracker?order=l${r.line.id}`)} sx={{ color: 'var(--c-primary-700)' }}>Tracker</Box>
        </Box>
      ))}
    </Box>
  );
}
