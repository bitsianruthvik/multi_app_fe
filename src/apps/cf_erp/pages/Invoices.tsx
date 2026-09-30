import { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import { useNavigate } from 'react-router-dom';
import { listInvoices, type InvoiceSummary } from '../api/gst';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { EmptyState, ErrorNotice, PageHeader, StatStrip } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { InvoicesTable } from '../components/InvoicesTable';

const CHIPS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'draft', label: 'Drafts' }, { value: 'issued', label: 'Issued' }, { value: 'cancelled', label: 'Cancelled' },
];
const matches = (i: InvoiceSummary, term: string) => !term || [i.invoiceNo, i.order.code, i.customer.name].some((v) => v?.toLowerCase().includes(term));

/**
 * Sales › Invoices: the tax invoices, one per dispatch. A draft is made when a
 * line ships; it is reviewed and issued here, then taken to the portals.
 */
export default function Invoices() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const [status, setStatus] = useUrlParam('status', 'all');
  const [search, setSearch] = useState('');
  const list = useLoad(() => listInvoices({}), []);
  const term = search.trim().toLowerCase();
  const base = useMemo(() => (list.data?.rows ?? []).filter((i) => matches(i, term)), [list.data, term]);
  const rows = useMemo(() => base.filter((i) => status === 'all' || i.status === status), [base, status]);
  const stats = [
    { label: 'Drafts to issue', value: base.filter((i) => i.status === 'draft').length, tone: 'warning' as const, hint: 'Shipped, not yet numbered', onClick: () => setStatus('draft') },
    { label: 'Issued, no IRN', value: base.filter((i) => i.status === 'issued' && !i.irn).length, tone: 'info' as const, hint: 'Waiting for the e-invoice portal', onClick: () => setStatus('issued') },
    { label: 'Issued', value: base.filter((i) => i.status === 'issued').length, tone: 'success' as const },
  ];
  const filtered = !!term || status !== 'all';
  return (
    <Box>
      <PageHeader title="Invoices" subtitle="A tax invoice goes with each dispatch. Review the draft, issue it, then take its files to the government portals." />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search number, order or customer">
        {CHIPS.map((c) => <FacetChip key={c.value} label={c.label} active={status === c.value} count={base.filter((i) => c.value === 'all' || i.status === c.value).length} onClick={() => setStatus(c.value)} />)}
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <InvoicesTable rows={rows} loading={list.loading && !list.data} onOpen={(i) => navigate(appPath(company, `invoices/${i.id}`))}
        empty={<EmptyState icon={<ReceiptLongRounded />} title={filtered ? 'No invoice matches' : 'No invoices yet'}
          hint={filtered ? 'Clear the search or pick another status.' : 'Ship a line from the tracker with "Make the tax invoice" ticked, and its draft appears here.'} />} />
    </Box>
  );
}
