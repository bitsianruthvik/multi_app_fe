import { useState } from 'react';
import { Box, LinearProgress, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import HandymanRounded from '@mui/icons-material/HandymanRounded';
import { toWorkOrderRow } from '../api/production';
import type { WorkOrderRow } from '../api/types';
import { useCompanySlug } from '../hooks/useLoad';
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
 */
export default function WorkOrders() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const [status, setStatus] = useUrlParam('status', 'open');
  const [search, setSearch] = useState('');
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
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={rows} columns={columns} getRowId={(w) => w.id} loading={!list.loaded} server={{ ...list.server, exportAll: async () => (await list.exportAll()).map(toWorkOrderRow), sortable: SERVER_SORT }} defaultSortKey="code" defaultSortDir="desc" storageKey="work-orders" exportName="work-orders"
        onRowClick={(w) => navigate(appPath(company, `work-orders/${w.id}`))}
        empty={<EmptyState icon={<HandymanRounded />} title={term ? 'No work order matches' : 'No work orders here'}
          hint={term ? 'Clear the search, or look under All.' : 'Assign operations to a contractor on an order’s Production › Contractors tab and they appear here.'} />} />
    </Box>
  );
}
