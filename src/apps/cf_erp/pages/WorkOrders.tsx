import { useState } from 'react';
import { Box, Button, LinearProgress, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import HandymanRounded from '@mui/icons-material/HandymanRounded';
import { listWorkOrdersByOrder, toWorkOrderRow } from '../api/production';
import type { WorkOrderRow } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useDebounced, usePagedList } from '../hooks/usePagedList';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { EmptyState, ErrorNotice, Mono, PageHeader } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { DataTable, type DataColumn } from '../components/DataTable';
import { WorkOrderStatusBadge } from '../components/Production/workOrderUi';
import { WORK_ORDER_FILTERS } from '../components/Production/workOrderModel';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

interface WoCounts { status: Record<string, number>; open: number; all: number }
/** Columns the server sorts (workOrderService WO_SORT). */
const SERVER_SORT = ['code', 'contractor', 'order', 'status', 'cells', 'progress'];

/**
 * Work orders: the operations handed to contractors, one work order per
 * contractor per order line. The production order stays the in-house work; a
 * work order is kept apart from it. They are made from the order's
 * Production › Contractors tab, so this list only follows them up.
 *
 * Group by (2026-10-17): Contractor (the list, as before) or Sales order — one block per sales
 * order with its work orders and totals, paged by order (GET /work-orders/by-order).
 */
export default function WorkOrders() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const [status, setStatus] = useUrlParam('status', 'open');
  const [search, setSearch] = useState('');
  const [group, setGroup] = useUrlParam('group', 'contractor');
  const term = useDebounced(search.trim());
  // Search and the status chip filter on the server, a page at a time; chip figures count every work order.
  const list = usePagedList<unknown, WoCounts>('/work-orders', { status: status === 'all' ? undefined : status, search: term }, { defaultSort: { key: 'code', dir: 'desc' } });
  const counts = list.counts;
  const chipCount = (v: string) => (!counts ? undefined : v === 'all' ? counts.all : v === 'open' ? counts.open : counts.status[v]);
  // The server answers with raw rows; the page reads them as work-order rows.
  const rows = list.rows.map(toWorkOrderRow);

  const columns: DataColumn<WorkOrderRow>[] = [
    { key: 'code', header: 'Number', alwaysVisible: true, sortValue: (w) => w.code, render: (w) => <Mono chip><Box component={Link} to={appPath(company, `work-orders/${w.id}`)} sx={linkSx}>{w.code}</Box></Mono> },
    { key: 'contractor', header: 'Contractor', alwaysVisible: true, sortValue: (w) => w.contractorName ?? '', render: (w) => <>{w.contractorName ?? '—'}</> },
    {
      key: 'order', header: 'Order', sortValue: (w) => w.orderCode ?? '', exportValue: (w) => `${w.orderCode ?? ''} ${w.lineNo ?? ''}`.trim(),
      render: (w) => (w.orderId
        ? <Mono><Box component={Link} to={appPath(company, `orders/${w.orderId}?tab=production${w.lineId ? `&line=${w.lineId}` : ''}`)} sx={linkSx}>{w.orderCode}{w.lineNo != null ? ` · line ${w.lineNo}` : ''}</Box></Mono>
        : <Mono muted>—</Mono>),
    },
    { key: 'status', header: 'Status', alwaysVisible: true, sortValue: (w) => w.status, render: (w) => <WorkOrderStatusBadge status={w.status} /> },
    { key: 'cells', header: 'Operations', numeric: true, sortValue: (w) => w.cellCount, render: (w) => <Mono>{w.cellCount}</Mono> },
    {
      key: 'progress', header: 'Progress', sortValue: (w) => (w.progress?.total ? w.progress.done / w.progress.total : -1),
      exportValue: (w) => (w.progress ? `${w.progress.done}/${w.progress.total}` : ''),
      render: (w) => (w.progress && w.progress.total > 0
        ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 120 }}>
          <LinearProgress variant="determinate" value={Math.round((w.progress.done / w.progress.total) * 100)} aria-label="Steps done"
            sx={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--c-surface-2)', '& .MuiLinearProgress-bar': { background: 'var(--c-primary-500)' } }} />
          <Mono muted>{w.progress.done}/{w.progress.total}</Mono>
        </Box>
        : <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Not released</Typography>),
    },
  ];

  return (
    <Box>
      <PageHeader title="Work orders" subtitle="Work handed to contractors. Make one from an order's Production › Contractors tab." />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search number, contractor or order">
        {WORK_ORDER_FILTERS.map((f) => <FacetChip key={f.value} label={f.label} active={status === f.value} count={chipCount(f.value)} onClick={() => setStatus(f.value)} />)}
      </FilterBar>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Group by</Typography>
        <ToggleButtonGroup size="small" exclusive value={group} onChange={(_, v: string | null) => { if (v) setGroup(v); }} aria-label="Group by" data-testid="wo-page-group"
          sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.25, textTransform: 'none', fontSize: 12.5 } }}>
          <ToggleButton value="contractor">Contractor</ToggleButton>
          <ToggleButton value="order">Sales order</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {group === 'order' ? <ByOrder status={status} term={term} /> : (<>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={rows} columns={columns} getRowId={(w) => w.id} loading={!list.loaded} server={{ ...list.server, exportAll: async () => (await list.exportAll()).map(toWorkOrderRow), sortable: SERVER_SORT }} defaultSortKey="code" defaultSortDir="desc" storageKey="work-orders" exportName="work-orders"
        onRowClick={(w) => navigate(appPath(company, `work-orders/${w.id}`))}
        empty={<EmptyState icon={<HandymanRounded />} title={term ? 'No work order matches' : 'No work orders here'}
          hint={term ? 'Clear the search, or look under All.' : 'Assign operations to a contractor on an order’s Production › Contractors tab and they appear here.'} />} />
      </>)}
    </Box>
  );
}

const ORDERS_PER_PAGE = 20;

/** Work orders by sales order: the order, its totals, then its work orders. Paged by order. */
function ByOrder({ status, term }: { status: string; term: string }) {
  const company = useCompanySlug();
  const [page, setPage] = useState(0);
  const data = useLoad(() => listWorkOrdersByOrder({ status: status === 'all' ? undefined : status, search: term, limit: ORDERS_PER_PAGE, offset: page * ORDERS_PER_PAGE }), [status, term, page]);
  const d = data.data;
  if (data.error) return <ErrorNotice error={data.error} onRetry={data.reload} />;
  if (!d) return <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Reading…</Typography>;
  if (!d.rows.length) {
    return <EmptyState icon={<HandymanRounded />} title={term ? 'No work order matches' : 'No work orders here'} hint={term ? 'Clear the search, or look under All.' : 'Assign operations to a contractor on an order’s Production › Contractors tab and they appear here.'} />;
  }
  return (
    <Box data-testid="wo-by-order" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {d.rows.map((g) => (
        <Box key={g.order.id} data-testid="wo-order-block" data-order={g.order.code} sx={{ border: '1px solid var(--c-divider)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', px: 1.5, py: 1, background: 'var(--c-surface-2)' }}>
            <Mono sx={{ fontWeight: 600 }}><Box component={Link} to={appPath(company, `orders/${g.order.id}`)} sx={linkSx}>{g.order.code}</Box></Mono>
            <Typography noWrap sx={{ fontSize: 13, color: 'var(--c-text-2)', minWidth: 0 }}>{[g.order.customer?.name, g.order.title].filter(Boolean).join(' · ')}</Typography>
            <Box sx={{ flex: 1 }} />
            <Typography data-testid="wo-order-block-totals" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
              {g.totals.workOrders} work order{g.totals.workOrders === 1 ? '' : 's'} · {g.totals.open} open · {g.totals.operations} operations
              {' · '}{g.totals.pct == null ? 'not released' : `${Math.round(g.totals.pct)}% done (${g.totals.stepsDone} of ${g.totals.steps})`}
            </Typography>
          </Box>
          {g.workOrders.map((w) => (
            <Box key={w.id} data-testid="wo-order-row" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr auto', md: 'minmax(120px, 1fr) minmax(140px, 1.4fr) 90px 110px minmax(120px, 1fr)' }, gap: 1, alignItems: 'center', px: 1.5, py: 0.75, borderTop: '1px solid var(--c-divider)', fontSize: 13 }}>
              <Mono chip><Box component={Link} to={appPath(company, `work-orders/${w.id}`)} sx={linkSx}>{w.code}</Box></Mono>
              <Box sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.contractorName ?? '—'}</Box>
              <Mono muted>{w.lineNo != null ? `line ${w.lineNo}` : ''}</Mono>
              <WorkOrderStatusBadge status={w.status} />
              {w.progress && w.progress.total > 0
                ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <LinearProgress variant="determinate" value={Math.round((w.progress.done / w.progress.total) * 100)} aria-label="Steps done"
                    sx={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--c-surface-2)', '& .MuiLinearProgress-bar': { background: 'var(--c-primary-500)' } }} />
                  <Mono muted>{w.progress.done}/{w.progress.total}</Mono>
                </Box>
                : <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Not released</Typography>}
            </Box>
          ))}
        </Box>
      ))}
      {(page > 0 || d.hasMore) && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Orders {d.offset + 1}–{d.offset + d.rows.length} of {d.total}</Typography>
          <Button size="small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <Button size="small" disabled={!d.hasMore} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </Box>
      )}
    </Box>
  );
}
