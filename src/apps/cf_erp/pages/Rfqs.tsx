import { useMemo, useState } from 'react';
import { Box, Button } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import RequestQuoteRounded from '@mui/icons-material/RequestQuoteRounded';
import { listRfqs, type RfqRow } from '../api/procurement';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { dayText } from '../lib/money';
import { RFQ_FILTERS } from '../lib/procurement';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { DataTable, type DataColumn } from '../components/DataTable';
import { RfqStatusBadge } from '../components/ProcurementUi';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/** Every request for quotation: who was asked, which quotes are in, and what was awarded. */
export default function Rfqs() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const [status, setStatus] = useUrlParam('status', 'all');
  const [search, setSearch] = useState('');
  const list = useLoad(() => listRfqs(status), [status]);
  const all = useMemo(() => list.data?.rows ?? [], [list.data]);
  const term = search.trim().toLowerCase();
  const rows = useMemo(() => (term ? all.filter((r) => r.code.toLowerCase().includes(term)) : all), [all, term]);
  const stats = [
    { label: 'RFQs', value: rows.length },
    { label: 'Out for quotes', value: rows.filter((r) => r.status === 'sent').length, tone: 'info' as const, hint: 'Sent, waiting for prices' },
    { label: 'Quotes in', value: rows.filter((r) => r.status === 'closed').length, tone: 'warning' as const, hint: 'Ready to compare and award' },
    { label: 'Awarded', value: rows.filter((r) => r.status === 'awarded').length, tone: 'success' as const, hint: 'Purchase orders made' },
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
      <FilterBar search={search} onSearch={setSearch} placeholder="Search number">
        {RFQ_FILTERS.map((f) => <FacetChip key={f.value} label={f.label} active={status === f.value} onClick={() => setStatus(f.value)} />)}
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={rows} columns={columns} getRowId={(r) => r.id} loading={list.loading && !list.data} storageKey="rfqs" exportName="rfqs"
        onRowClick={(r) => navigate(appPath(company, `rfqs/${r.id}`))}
        empty={<EmptyState icon={<RequestQuoteRounded />} title={term ? 'No RFQ matches' : 'No RFQs here'}
          hint={term ? 'Clear the search.' : 'Approve a purchase request, then choose Make RFQ on it.'}
          action={term ? <Button onClick={() => setSearch('')}>Clear search</Button> : <Button component={Link} to={appPath(company, 'purchase-requests')}>Go to purchase requests</Button>} />} />
    </Box>
  );
}
