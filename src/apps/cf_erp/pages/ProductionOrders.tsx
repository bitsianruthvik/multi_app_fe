/**
 * Production › Production orders (2026-10-17). Every released line (a release = a production
 * order), grouped by sales order: order code, line, item, when it was released, the planned ship
 * week, how far it is (weighed by planned minutes, as the dashboard), a forecast, its status and
 * what is blocked. Each sales order folds open and shut and carries its totals. A line opens its
 * tracker (the order's Production step on that line). Paged by sales order.
 */
import { useEffect, useState } from 'react';
import { Box, Button, Collapse, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import { listProductionOrders, type ProductionOrderFilter, type ProductionOrderGroup, type ProductionOrderLine } from '../api/productionOrders';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useDebounced } from '../hooks/usePagedList';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { CompletionBar } from '../components/Tracker/TreeParts';
import {
  PO_FILTERS, PO_ORDERS_PER_PAGE, PO_STATUS, blockedText, lineTrackerPath, loadCollapsed, orderStatusText, saveCollapsed, shipWeekText, shortDate,
} from '../lib/productionOrders';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };
const LINE_COLS = { xs: '1fr auto', md: '64px minmax(160px, 2fr) 84px 120px minmax(120px, 1.2fr) 96px 110px minmax(90px, 1fr)' };

export default function ProductionOrders() {
  const [status, setStatus] = useUrlParam('status', 'open');
  const [customer, setCustomer] = useUrlParam('customer', '');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  const [page, setPage] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => loadCollapsed());
  useEffect(() => { setPage(0); }, [status, customer, term]);
  const data = useLoad(() => listProductionOrders({
    status: status as ProductionOrderFilter, customerId: customer ? Number(customer) : null, search: term, limit: PO_ORDERS_PER_PAGE, offset: page * PO_ORDERS_PER_PAGE,
  }), [status, customer, term, page]);
  const d = data.data;
  const toggle = (id: number) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); saveCollapsed(n); return n; });
  const year = d?.today.slice(0, 4);

  return (
    <Box>
      <PageHeader title="Production orders" subtitle="Every released line, by sales order. Click a line to open its tracker." />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search order, customer or item">
        {PO_FILTERS.map((f) => <FacetChip key={f.key} label={f.label} active={status === f.key} count={d?.counts[f.key]} onClick={() => setStatus(f.key)} />)}
        <TextField select size="small" value={customer} onChange={(e) => setCustomer(e.target.value)} sx={{ minWidth: 170 }} inputProps={{ 'aria-label': 'Customer', 'data-testid': 'po-customer' }}
          SelectProps={{ displayEmpty: true }}>
          <MenuItem value="">All customers</MenuItem>
          {(d?.customers ?? []).map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
        </TextField>
      </FilterBar>
      <ErrorNotice error={data.error} onRetry={data.reload} />
      {!d ? (!data.error && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Reading…</Typography>)
        : d.rows.length === 0 ? (
          <EmptyState icon={<PrecisionManufacturingRounded />} title={term || customer || status !== 'all' ? 'No production order matches' : 'Nothing released yet'}
            hint={term || customer || status !== 'all' ? 'Clear a filter or the search.' : 'A line shows here once it is released to production.'} />
        ) : (
          <Box data-testid="po-list" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {d.rows.map((g) => <OrderBlock key={g.order.id} g={g} open={!collapsed.has(g.order.id)} onToggle={() => toggle(g.order.id)} year={year} />)}
            {(page > 0 || d.hasMore) && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Orders {d.offset + 1}–{d.offset + d.rows.length} of {d.total}</Typography>
                <Button size="small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button size="small" disabled={!d.hasMore} onClick={() => setPage((p) => p + 1)} data-testid="po-next">Next</Button>
              </Box>
            )}
          </Box>
        )}
    </Box>
  );
}

function OrderBlock({ g, open, onToggle, year }: { g: ProductionOrderGroup; open: boolean; onToggle: () => void; year?: string }) {
  const company = useCompanySlug();
  const t = g.totals;
  return (
    <Box data-testid="po-order" data-order={g.order.code} sx={{ border: '1px solid var(--c-divider)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
      <Box role="button" tabIndex={0} aria-expanded={open} onClick={onToggle} data-testid="po-order-head"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', px: 1.5, py: 1, background: 'var(--c-surface-2)', cursor: 'pointer' }}>
        <IconButton size="small" aria-label={open ? 'Fold' : 'Open'} sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--t-fast) var(--ease)' }}><ExpandMoreRounded fontSize="small" /></IconButton>
        <Mono sx={{ fontWeight: 600 }}>
          <Box component={Link} to={appPath(company, `orders/${g.order.id}`)} sx={linkSx} onClick={(e: React.MouseEvent) => e.stopPropagation()}>{g.order.code}</Box>
        </Mono>
        <Typography noWrap sx={{ fontSize: 13, color: 'var(--c-text-2)', minWidth: 0, flex: '1 1 160px' }}>{[g.order.customer?.name, g.order.title].filter(Boolean).join(' · ') || '—'}</Typography>
        <CompletionBar value={t.progressPct / 100} width={90} title={t.basis === 'work' ? 'Weighed by planned minutes.' : 'Weighed by steps counted.'} />
        <Typography data-testid="po-order-totals" sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
          {orderStatusText(t)} · ships {shipWeekText(t.lastShipWeek, year)}{t.forecast ? ` · forecast ${shortDate(t.forecast, year)}` : ''}
          {t.blocked ? <Box component="span" sx={{ color: 'var(--c-danger-800)' }}> · {t.blocked} blocked</Box> : null}
        </Typography>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: LINE_COLS, gap: 1, px: 1.5, py: 0.5, fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--c-text-3)', borderTop: '1px solid var(--c-divider)' }}>
          <span>Line</span><span>Item</span><span>Released</span><span>Ship week</span><span>Progress</span><span>Forecast</span><span>Status</span><span>Blocked</span>
        </Box>
        {g.lines.map((l) => <LineRow key={l.releaseId} l={l} year={year} />)}
      </Collapse>
    </Box>
  );
}

function LineRow({ l, year }: { l: ProductionOrderLine; year?: string }) {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const s = PO_STATUS[l.status];
  const blocked = blockedText(l.blocked);
  const go = () => navigate(appPath(company, lineTrackerPath(l)));
  return (
    <Box data-testid="po-line" data-line={l.line.id} data-status={l.status} role="link" tabIndex={0} onClick={go}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }}
      sx={{ display: 'grid', gridTemplateColumns: LINE_COLS, gap: 1, alignItems: 'center', px: 1.5, py: 0.75, borderTop: '1px solid var(--c-divider)', fontSize: 13, cursor: 'pointer', '&:hover': { background: 'var(--c-surface-2)' } }}>
      <Mono>Line {l.line.lineNo}</Mono>
      <Box sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', gridColumn: { xs: '1 / -1', md: 'auto' }, order: { xs: 2, md: 0 } }} title={l.item.name ?? ''}>
        {l.item.code ? <Mono muted>{l.item.code}</Mono> : null} {l.item.name}{l.quantity !== 1 ? ` ×${l.quantity}` : ''}
      </Box>
      <Box sx={{ display: { xs: 'none', md: 'block' }, color: 'var(--c-text-2)' }}>{shortDate(l.releasedAt, year)}</Box>
      <Box sx={{ display: { xs: 'none', md: 'block' }, color: l.plan ? 'inherit' : 'var(--c-text-3)' }}>{shipWeekText(l.plan?.shipWeek, year)}</Box>
      <Box sx={{ display: { xs: 'none', md: 'block' } }}><CompletionBar value={l.progress.pct / 100} width={70} title={`${l.progress.stepsDone} of ${l.progress.steps} steps done${l.progress.basis === 'work' ? ', weighed by planned minutes' : ''}.`} /></Box>
      <Box sx={{ display: { xs: 'none', md: 'block' }, color: 'var(--c-text-2)' }}>
        {l.forecast.date ? <Tooltip title="An estimate: the later of the last 14 days' pace and the plan."><span>{shortDate(l.forecast.date, year)}</span></Tooltip> : '—'}
      </Box>
      <Box sx={{ justifySelf: { xs: 'end', md: 'start' } }}><Badge family={s.family} label={s.label} noIcon /></Box>
      <Box sx={{ display: { xs: 'none', md: 'block' }, fontSize: 12, color: blocked ? 'var(--c-danger-800)' : 'var(--c-text-3)', minWidth: 0 }}>{blocked ?? 'nothing'}</Box>
    </Box>
  );
}
