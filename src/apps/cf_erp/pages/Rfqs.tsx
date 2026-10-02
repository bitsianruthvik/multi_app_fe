import { useState } from 'react';
import { Box, Button } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import RequestQuoteRounded from '@mui/icons-material/RequestQuoteRounded';
import type { RfqRow } from '../api/procurement';
import { useCompanySlug } from '../hooks/useLoad';
import { useDebounced, usePagedList } from '../hooks/usePagedList';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { dayText } from '../lib/money';
import { RFQ_FILTERS } from '../lib/procurement';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { DataTable, type DataColumn } from '../components/DataTable';
import { RfqStatusBadge } from '../components/ProcurementUi';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

interface RfqCounts { status: Record<string, number>; open: number; all: number }
/** Columns the server sorts (procurementService RFQ_SORT). */
const SERVER_SORT = ['code', 'status', 'lines', 'suppliers', 'quotes', 'due'];

/** Every request for quotation: who was asked, which quotes are in, and what was awarded. */
export default function Rfqs() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const [status, setStatus] = useUrlParam('status', 'all');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  // Search and the status chip filter on the server, a page at a time; every figure counts all matching RFQs.
  const list = usePagedList<RfqRow, RfqCounts>('/rfqs', { status: status === 'all' ? undefined : status, q: term }, { defaultSort: { key: 'code', dir: 'desc' } });
  const counts = list.counts;
  const chipCount = (v: string) => (!counts ? undefined : v === 'all' ? counts.all : v === 'open' ? counts.open : counts.status[v]);
  const stats = [
    { label: 'RFQs', value: list.total },
    { label: 'Out for quotes', value: counts?.status.sent ?? 0, tone: 'info' as const, hint: 'Sent, waiting for prices' },
    { label: 'Quotes in', value: counts?.status.closed ?? 0, tone: 'warning' as const, hint: 'Ready to compare and award' },
    { label: 'Awarded', value: counts?.status.awarded ?? 0, tone: 'success' as const, hint: 'Purchase orders made' },
  ];
  const columns: DataColumn<RfqRow>[] = [
    { key: 'code', header: 'Number', alwaysVisible: true, sortValue: (r) => r.code, render: (r) => <Mono chip><Box component={Link} to={appPath(company, `rfqs/${r.id}`)} sx={linkSx}>{r.code}</Box></Mono> },
    { key: 'status', header: 'Status', alwaysVisible: true, sortValue: (r) => r.status, render: (r) => <RfqStatusBadge status={r.status} /> },
    { key: 'lines', header: 'Lines', numeric: true, sortValue: (r) => r.lines, render: (r) => <Mono>{r.lines ?? '—'}</Mono> },
    { key: 'suppliers', header: 'Suppliers', numeric: true, sortValue: (r) => r.suppliers, render: (r) => <Mono>{r.suppliers ?? '—'}</Mono> },
    { key: 'quotes', header: 'Quotes in', numeric: true, sortValue: (r) => r.quotes, render: (r) => <Mono muted={!r.quotes}>{r.quotes ?? 0}</Mono> },
    { key: 'due', header: 'Quotes due', sortValue: (r) => r.quotesDue, render: (r) => <Mono muted>{dayText(r.quotesDue) || '—'}</Mono> },
  ];
  return (
    <Box>
      <PageHeader title="RFQs" subtitle="Requests for quotation. Each goes to several suppliers as a document; their prices are typed in, compared line by line, and the winners become draft purchase orders. An RFQ starts from an approved purchase request." />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search number or notes">
        {RFQ_FILTERS.map((f) => <FacetChip key={f.value} label={f.label} active={status === f.value} count={chipCount(f.value)} onClick={() => setStatus(f.value)} />)}
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={list.rows} columns={columns} getRowId={(r) => r.id} loading={!list.loaded} server={{ ...list.server, sortable: SERVER_SORT }} defaultSortKey="code" defaultSortDir="desc" storageKey="rfqs" exportName="rfqs"
        onRowClick={(r) => navigate(appPath(company, `rfqs/${r.id}`))}
        empty={<EmptyState icon={<RequestQuoteRounded />} title={term ? 'No RFQ matches' : 'No RFQs here'}
          hint={term ? 'Clear the search.' : 'Approve a purchase request, then choose Make RFQ on it.'}
          action={term ? <Button onClick={() => setSearch('')}>Clear search</Button> : <Button component={Link} to={appPath(company, 'purchase-requests')}>Go to purchase requests</Button>} />} />
    </Box>
  );
}
