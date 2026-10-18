import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import RequestQuoteRounded from '@mui/icons-material/RequestQuoteRounded';
import { listPurchaseRequests, type PrRow } from '../api/purchaseRequests';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useDebounced } from '../hooks/usePagedList';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { EmptyState, ErrorNotice, Mono, PageHeader, SkeletonBlock } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { DataTable, type DataColumn } from '../components/DataTable';
import { PrStatusBadge } from '../components/Purchase/purchaseFlowUi';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };
const FILTERS: [string, string][] = [['open', 'Not closed'], ['open_only', 'Open'], ['partly_ordered', 'Partly ordered'], ['ordered', 'Ordered'], ['closed', 'Closed'], ['all', 'All']];

/**
 * Purchase › Purchase requests (§71): one PR per material request, made when the MR is saved. A PR is the RFQ: open it
 * to put vendors in columns, type their quotes and raise purchase orders.
 */
export default function PurchaseRequests() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const [status, setStatus] = useUrlParam('status', 'open');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  const load = useLoad(() => listPurchaseRequests({ status: status === 'open_only' ? 'open' : status === 'open' ? undefined : status, search: term }), [status, term]);
  // 'open' on the server = not closed; the "Open" chip asks for the status open itself.
  const rows = (load.data?.rows ?? []).filter((r) => status !== 'open_only' || r.status === 'open');
  const counts = load.data?.counts;
  const countOf = (k: string) => (!counts ? undefined : k === 'open' ? counts.notClosed : k === 'open_only' ? counts.open : k === 'all' ? counts.all : counts[k as keyof typeof counts]);

  const columns: DataColumn<PrRow>[] = [
    { key: 'code', header: 'PR', alwaysVisible: true, sortValue: (r) => r.code, render: (r) => <Mono chip><Box component={Link} to={appPath(company, `purchase-requests/${r.id}`)} sx={linkSx}>{r.code}</Box></Mono> },
    { key: 'status', header: 'Status', alwaysVisible: true, sortValue: (r) => r.status, render: (r) => <PrStatusBadge status={r.status} /> },
    { key: 'mr', header: 'Material request', sortValue: (r) => r.requisition.code, render: (r) => <Box><Mono>{r.requisition.code}</Mono><Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'normal' }}>{r.order.code} · line {r.line.lineNo}</Typography></Box> },
    { key: 'lines', header: 'Lines to order', numeric: true, sortValue: (r) => r.toOrder, render: (r) => <Mono muted={!r.toOrder}>{r.toOrder} of {r.lines}</Mono> },
    { key: 'vendors', header: 'Vendors', numeric: true, sortValue: (r) => r.vendors, render: (r) => <Mono muted={!r.vendors}>{r.vendors}</Mono> },
    { key: 'pos', header: 'Purchase orders', render: (r) => (r.purchaseOrders.length ? <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>{r.purchaseOrders.map((p) => <Mono key={p.id} chip>{p.code}</Mono>)}</Box> : <Mono muted>—</Mono>) },
  ];

  return (
    <Box>
      <PageHeader title="Purchase requests" subtitle="One purchase request per material request: what is left to buy. Open one to compare vendors' quotes and raise purchase orders." />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search PR, MR, order or customer">
        {FILTERS.map(([k, label]) => <FacetChip key={k} label={label} active={status === k} count={countOf(k)} onClick={() => setStatus(k)} />)}
      </FilterBar>
      <ErrorNotice error={load.error} onRetry={load.reload} />
      {!load.data && !load.error && <SkeletonBlock h={240} r={8} />}
      {load.data && (
        <DataTable rows={rows} columns={columns} getRowId={(r) => r.id} storageKey="purchase-requests" exportName="purchase-requests"
          onRowClick={(r) => navigate(appPath(company, `purchase-requests/${r.id}`))}
          empty={<EmptyState icon={<RequestQuoteRounded />} title={term ? 'No PR matches' : 'No purchase requests here'}
            hint={term ? 'Clear the search.' : 'A PR is made when a material request is saved with something to buy.'} />} />
      )}
    </Box>
  );
}
