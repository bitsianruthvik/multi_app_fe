import { useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import { cfApi, qs } from '../api/client';
import type { PurchaseOrder, PurchaseOrderRow } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { PURCHASE_FILTERS } from '../lib/purchase';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader, StatStrip } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { DataTable, type DataColumn } from '../components/DataTable';
import { PurchaseStatusBadge } from '../components/purchaseUi';
import { NewPurchaseDialog } from '../components/PurchaseDialogs';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/** Every purchase order: what was asked for, from whom, and what has arrived. */
export default function PurchaseOrders() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const [status, setStatus] = useUrlParam('status', 'open');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  useNewParam(() => { if (canManage) setCreating(true); });
  const list = useLoad(() => cfApi.get<PurchaseOrderRow[]>(`/purchase-orders${qs({ status })}`), [status]);
  const all = useMemo(() => list.data ?? [], [list.data]);
  const term = search.trim().toLowerCase();
  const rows = useMemo(() => (term
    ? all.filter((p) => [p.code, p.supplier?.name, p.supplier?.code].some((t) => t && String(t).toLowerCase().includes(term)))
    : all), [all, term]);

  // Every figure describes the orders in the table below, so the two agree.
  const outstanding = rows.reduce((t, p) => t + p.totals.outstanding, 0);
  const stats = [
    { label: 'Orders', value: rows.length },
    { label: 'Draft', value: rows.filter((p) => p.status === 'draft').length, tone: 'warning' as const, hint: 'Not sent to a supplier yet' },
    { label: 'Awaiting delivery', value: rows.filter((p) => p.status === 'ordered' || p.status === 'partially_received').length, tone: 'info' as const, hint: 'Sent, still waiting on the supplier' },
    { label: 'Outstanding', value: outstanding, display: qtyText(outstanding), hint: 'Quantity ordered and not yet received' },
  ];

  const columns: DataColumn<PurchaseOrderRow>[] = [
    {
      key: 'code', header: 'Number', alwaysVisible: true, sortValue: (p) => p.code,
      render: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.5 }}>
          <Mono chip><Box component={Link} to={appPath(company, `purchase-orders/${p.id}`)} sx={linkSx}>{p.code}</Box></Mono>
          {p.suggested && <Badge family="info" label="Suggested" noIcon title="Raised by the buy list — rewritten each time it runs" />}
        </Box>
      ),
    },
    { key: 'status', header: 'Status', alwaysVisible: true, sortValue: (p) => p.status, render: (p) => <PurchaseStatusBadge status={p.status} /> },
    {
      key: 'supplier', header: 'Supplier', sortValue: (p) => p.supplier?.name ?? '',
      render: (p) => (p.supplier ? <>{p.supplier.name}</> : <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Nobody yet</Typography>),
    },
    { key: 'lines', header: 'Lines', numeric: true, defaultHidden: true, sortValue: (p) => p.totals.lines, render: (p) => <Mono muted>{p.totals.lines}</Mono> },
    { key: 'ordered', header: 'Ordered', numeric: true, sortValue: (p) => p.totals.ordered, render: (p) => <Mono>{qtyText(p.totals.ordered)}</Mono> },
    { key: 'received', header: 'Received', numeric: true, sortValue: (p) => p.totals.received, render: (p) => <Mono muted={!p.totals.received}>{qtyText(p.totals.received)}</Mono> },
    { key: 'outstanding', header: 'Outstanding', numeric: true, sortValue: (p) => p.totals.outstanding, render: (p) => <Mono muted={!p.totals.outstanding}>{qtyText(p.totals.outstanding)}</Mono> },
    { key: 'expected', header: 'Expected', defaultHidden: true, sortValue: (p) => p.expectedDate, render: (p) => <Mono muted>{p.expectedDate ?? '—'}</Mono> },
  ];

  return (
    <Box>
      <PageHeader title="Purchase orders" subtitle="What was asked for, from whom, and what has arrived. A delivery is booked against its line, which posts an ordinary stock receipt."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>New purchase order</Button>} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search number or supplier">
        {PURCHASE_FILTERS.map((f) => <FacetChip key={f.value} label={f.label} active={status === f.value} onClick={() => setStatus(f.value)} />)}
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={rows} columns={columns} getRowId={(p) => p.id} loading={list.loading && !list.data} storageKey="purchase-orders" exportName="purchase-orders"
        onRowClick={(p) => navigate(appPath(company, `purchase-orders/${p.id}`))}
        empty={<EmptyState icon={<LocalShippingRounded />}
          title={term ? 'No order matches' : status === 'open' ? 'Nothing on order' : 'No purchase orders here'}
          hint={term ? 'Clear the search, or look under All.'
            : status === 'open' ? 'The buy list suggests one from what the released jobs are short of, or raise one by hand.'
              : 'Nothing has this status. Look under All.'}
          action={term ? <Button onClick={() => setSearch('')}>Clear search</Button>
            : status !== 'all' ? <Button onClick={() => setStatus('all')}>Show all orders</Button>
              : canManage ? <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>New purchase order</Button> : undefined} />} />
      <NewPurchaseDialog open={creating} onClose={() => setCreating(false)}
        onCreated={(p: PurchaseOrder) => { setCreating(false); invalidateNavCounts(); navigate(appPath(company, `purchase-orders/${p.id}`)); }} />
    </Box>
  );
}
