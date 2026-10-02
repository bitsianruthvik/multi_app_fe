import { useState } from 'react';
import { Box } from '@mui/material';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import { useNavigate } from 'react-router-dom';
import type { InvoiceSummary } from '../api/gst';
import { useCompanySlug } from '../hooks/useLoad';
import { useDebounced, usePagedList } from '../hooks/usePagedList';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { EmptyState, ErrorNotice, PageHeader, StatStrip } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { InvoicesTable } from '../components/InvoicesTable';

const CHIPS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'draft', label: 'Drafts' }, { value: 'issued', label: 'Issued' }, { value: 'cancelled', label: 'Cancelled' },
];
interface InvoiceCounts { status: Record<string, number>; all: number; issuedNoIrn: number }
/** Columns the server sorts (invoiceService INVOICE_SORT); the money columns are worked out per row, so they sort what is loaded. */
const SERVER_SORT = ['no', 'date', 'customer', 'order', 'status', 'irn', 'eway'];

/**
 * Sales › Invoices: the tax invoices, one per dispatch. A draft is made when a
 * line ships; it is reviewed and issued here, then taken to the portals.
 */
export default function Invoices() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const [status, setStatus] = useUrlParam('status', 'all');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  // Search and the status chip filter on the server, a page at a time; every figure counts all invoices.
  const list = usePagedList<InvoiceSummary, InvoiceCounts>('/invoices', { status: status === 'all' ? undefined : status, q: term }, { defaultSort: { key: 'date', dir: 'desc' } });
  const counts = list.counts;
  const stats = [
    { label: 'Drafts to issue', value: counts?.status.draft ?? 0, tone: 'warning' as const, hint: 'Shipped, not yet numbered', onClick: () => setStatus('draft') },
    { label: 'Issued, no IRN', value: counts?.issuedNoIrn ?? 0, tone: 'info' as const, hint: 'Waiting for the e-invoice portal', onClick: () => setStatus('issued') },
    { label: 'Issued', value: counts?.status.issued ?? 0, tone: 'success' as const },
  ];
  const filtered = !!term || status !== 'all';
  return (
    <Box>
      <PageHeader title="Invoices" subtitle="A tax invoice goes with each dispatch. Review the draft, issue it, then take its files to the government portals." />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search number, order or customer">
        {CHIPS.map((c) => <FacetChip key={c.value} label={c.label} active={status === c.value} count={c.value === 'all' ? counts?.all : counts?.status[c.value]} onClick={() => setStatus(c.value)} />)}
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <InvoicesTable rows={list.rows} loading={!list.loaded} server={{ ...list.server, sortable: SERVER_SORT }} onOpen={(i) => navigate(appPath(company, `invoices/${i.id}`))}
        empty={<EmptyState icon={<ReceiptLongRounded />} title={filtered ? 'No invoice matches' : 'No invoices yet'}
          hint={filtered ? 'Clear the search or pick another status.' : 'Ship a line from the tracker with "Make the tax invoice" ticked, and its draft appears here.'} />} />
    </Box>
  );
}
