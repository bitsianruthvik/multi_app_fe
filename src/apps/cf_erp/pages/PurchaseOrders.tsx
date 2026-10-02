import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import type { PurchaseOrder, PurchaseOrderRow } from '../api/types';
import { useCompanySlug } from '../hooks/useLoad';
import { useDebounced, usePagedList } from '../hooks/usePagedList';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { PURCHASE_FILTERS } from '../lib/purchase';
import { rupeeText } from '../lib/money';
import { Money } from '../components/Money';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader, StatStrip } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { DataTable, type DataColumn } from '../components/DataTable';
import { PurchaseStatusBadge } from '../components/purchaseUi';
import { NewPurchaseDialog } from '../components/PurchaseDialogs';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

interface PoCounts { status: Record<string, number>; open: number; all: number; sum: { amount: number; outstanding: number; unpriced: number } }
/** Columns the server sorts (purchaseService PO_SORT). */
const SERVER_SORT = ['code', 'status', 'supplier', 'expected', 'lines', 'ordered', 'received', 'outstanding', 'amount'];

/** Every purchase order: what was asked for, from whom, and what has arrived. */
export default function PurchaseOrders() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const [status, setStatus] = useUrlParam('status', 'open');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  useNewParam(() => { if (canManage) setCreating(true); });
  const term = useDebounced(search.trim());
  // Search and the status chip filter on the server, a page at a time; every figure counts all matching orders.
  const list = usePagedList<PurchaseOrderRow, PoCounts>('/purchase-orders', { status, search: term }, { defaultSort: { key: 'code', dir: 'desc' } });
  const counts = list.counts;
  const unpriced = counts?.sum.unpriced ?? 0;
  const amount = counts?.sum.amount ?? 0;
  const outstanding = counts?.sum.outstanding ?? 0;
  const chipCount = (v: string) => (!counts ? undefined : v === 'open' ? counts.open : v === 'all' ? counts.all : counts.status[v]);
  const stats = [
    { label: 'Orders', value: list.total },
    { label: 'Draft', value: counts?.status.draft ?? 0, tone: 'warning' as const, hint: 'Not sent to a supplier yet' },
    { label: 'Awaiting delivery', value: (counts?.status.ordered ?? 0) + (counts?.status.partially_received ?? 0), tone: 'info' as const, hint: 'Sent, still waiting on the supplier' },
    { label: 'Order value', value: amount, display: amount === 0 && unpriced > 0 ? 'not priced' : rupeeText(amount), hint: unpriced ? `${unpriced} line${unpriced === 1 ? ' has' : 's have'} no price and ${unpriced === 1 ? 'is' : 'are'} left out` : 'Before tax' },
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
    {
      key: 'amount', header: 'Amount', numeric: true, sortValue: (p) => p.totals.amount, exportValue: (p) => p.totals.amount ?? '',
      render: (p) => (p.totals.lines > 0 && p.totals.unpricedLines === p.totals.lines ? <Money value={null} missing="no prices" /> : <><Money value={p.totals.amount} />{(p.totals.unpricedLines ?? 0) > 0 && <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 11.5 }}> + {p.totals.unpricedLines} unpriced</Box>}</>),
    },
    { key: 'expected', header: 'Expected', defaultHidden: true, sortValue: (p) => p.expectedDate, render: (p) => <Mono muted>{p.expectedDate ?? '—'}</Mono> },
  ];

  return (
    <Box>
      <PageHeader title="Purchase orders" subtitle="What was asked for, from whom, and what has arrived. A delivery is booked against its line, which posts an ordinary stock receipt."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>New purchase order</Button>} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search number or supplier">
        {PURCHASE_FILTERS.map((f) => <FacetChip key={f.value} label={f.label} active={status === f.value} count={chipCount(f.value)} onClick={() => setStatus(f.value)} />)}
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={list.rows} columns={columns} getRowId={(p) => p.id} loading={!list.loaded} server={{ ...list.server, sortable: SERVER_SORT }} defaultSortKey="code" defaultSortDir="desc" storageKey="purchase-orders" exportName="purchase-orders"
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
