import { useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import { cfApi, qs } from '../api/client';
import type { OrderStatus, SalesOrder } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { ORDER_STATUS_LABEL, OPEN_STATUSES, revisionLabel, showRevision } from '../lib/orders';
import { DangerBadge, EmptyState, ErrorNotice, Mono, OrderStatusBadge, OrderTypeChip, PageHeader, RevisionBadge, StatStrip } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { NewOrderDialog } from '../components/NewOrderDialog';
import { useToast } from '../components/toastContext';

const STATUS_CHIPS: { value: string; label: string; test: (o: SalesOrder) => boolean }[] = [
  { value: 'open', label: 'Open', test: (o) => OPEN_STATUSES.includes(o.status) },
  { value: 'overdue', label: 'Past date', test: (o) => o.overdue },
  ...(['inquiry', 'quoted', 'confirmed', 'draft', 'closed', 'lost', 'cancelled'] as OrderStatus[])
    .map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s], test: (o: SalesOrder) => o.status === s })),
  { value: 'all', label: 'All', test: () => true },
];

const matches = (o: SalesOrder, term: string) => !term
  || [o.code, o.title, o.customer?.name, o.customer?.code, o.customerReference].some((v) => v?.toLowerCase().includes(term));

/**
 * The order a status chip judges a row by. An earlier revision is judged as the
 * revision that replaced it, so the two sit together under the same chip. If
 * that one is not in the list, it is judged by the status it had when revised.
 */
function filedAs(o: SalesOrder, current: Map<string, SalesOrder>): SalesOrder {
  if (o.status !== 'revised') return o;
  return current.get(o.code) ?? { ...o, status: o.statusBeforeRevised ?? o.status };
}

const COLUMNS: DataColumn<SalesOrder>[] = [
  {
    key: 'code', header: 'Order', alwaysVisible: true,
    render: (o) => <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}><Mono chip>{o.code}</Mono>{showRevision(o) && <RevisionBadge revision={o.revision} />}</Box>,
    // Revisions share a code, so the revision breaks the tie: rev 2 sits next to rev 1, in order.
    sortValue: (o) => `${o.code} ${String(o.revision).padStart(4, '0')}`,
    exportValue: (o) => (showRevision(o) ? `${o.code} ${revisionLabel(o.revision)}` : o.code),
  },
  {
    key: 'project', header: 'Project', sortValue: (o) => o.title ?? o.customer?.name ?? '',
    render: (o) => (
      <Box sx={{ minWidth: 0, py: 0.5 }}>
        <Box sx={{ fontWeight: 500, whiteSpace: 'normal' }}>{o.title ?? <Box component="span" sx={{ color: 'var(--c-text-3)' }}>Untitled</Box>}</Box>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'normal' }}>{o.customer ? `${o.customer.name}${o.customerReference ? ` · ${o.customerReference}` : ''}` : 'For stock'}</Typography>
      </Box>
    ),
  },
  // Off by default: the Customer / Stock chips filter by it and the project cell
  // already says "For stock". Still one click away in the column menu.
  { key: 'type', header: 'Type', render: (o) => <OrderTypeChip type={o.orderType} />, sortValue: (o) => o.orderType, defaultHidden: true },
  { key: 'lines', header: 'Lines', numeric: true, render: (o) => <Mono>{o.lineCount ?? 0}</Mono>, sortValue: (o) => o.lineCount ?? 0 },
  {
    key: 'committed', header: 'Committed', sortValue: (o) => o.committedDate,
    render: (o) => <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Mono muted={!o.committedDate}>{o.committedDate ?? '—'}</Mono>{o.overdue && <DangerBadge label="Past date" />}</Box>,
  },
  { key: 'received', header: 'Received', render: (o) => <Mono muted>{o.receivedOn ?? '—'}</Mono>, sortValue: (o) => o.receivedOn, defaultHidden: true },
  { key: 'status', header: 'Status', render: (o) => <OrderStatusBadge status={o.status} />, sortValue: (o) => o.status, exportValue: (o) => ORDER_STATUS_LABEL[o.status] },
];

/**
 * Collection / List (§4.2) of sales orders — the projects, from the first
 * inquiry to delivery. Filters live in the URL, so Home's queues land here
 * already filtered; the figures describe the filtered rows, so they always
 * agree with the table beneath them.
 */
export default function Orders() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_orders_manage');
  const [status, setStatus] = useUrlParam('status', 'open');
  const [type, setType] = useUrlParam('type', '');
  // Earlier revisions are kept but hidden by default: the list is of orders, and an order is its latest revision.
  const [revisions, setRevisions] = useUrlParam('revisions', '');
  const withEarlier = revisions === 'all';
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  useNewParam(() => { if (canManage) setCreating(true); });
  const list = useLoad(() => cfApi.get<SalesOrder[]>(`/orders${qs({ limit: 500, revisions: withEarlier ? 'all' : undefined })}`), [withEarlier]);

  const all = useMemo(() => list.data ?? [], [list.data]);
  const term = search.trim().toLowerCase();
  const base = useMemo(() => all.filter((o) => (!type || o.orderType === type) && matches(o, term)), [all, type, term]);
  // Every figure counts an order once, at the revision it is at now.
  const latest = useMemo(() => base.filter((o) => o.status !== 'revised'), [base]);
  const current = useMemo(() => new Map(all.filter((o) => o.status !== 'revised').map((o) => [o.code, o] as const)), [all]);
  const chip = STATUS_CHIPS.find((c) => c.value === status) ?? STATUS_CHIPS[0];
  const rows = useMemo(() => base.filter((o) => chip.test(filedAs(o, current))), [base, chip, current]);
  const open = (o: SalesOrder) => navigate(appPath(company, `orders/${o.id}`));

  const stats = [
    { label: 'Inquiries', value: latest.filter((o) => o.status === 'inquiry').length, hint: 'Being designed', onClick: () => setStatus('inquiry') },
    { label: 'Quoted', value: latest.filter((o) => o.status === 'quoted').length, hint: 'Waiting for the customer', onClick: () => setStatus('quoted') },
    { label: 'Confirmed', value: latest.filter((o) => o.status === 'confirmed').length, tone: 'info' as const, onClick: () => setStatus('confirmed') },
    { label: 'Past committed date', value: latest.filter((o) => o.overdue).length, tone: 'danger' as const, hint: 'Still open', onClick: () => setStatus('overdue') },
  ];
  const filtered = !!term || !!type || status !== 'open';
  const clear = () => { setSearch(''); setType(''); setStatus('open'); };
  // The list asks for the 500 newest and filters in the browser, so beyond that
  // the search quietly stops reaching older orders. Say so rather than lie.
  const capped = all.length >= 500;

  return (
    <Box>
      <PageHeader title="Orders" subtitle="Each sales order is a project, from the first inquiry to delivery. Stock orders make standard products for stock."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>New order</Button>} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search number, title, customer">
        {STATUS_CHIPS.map((c) => <FacetChip key={c.value} label={c.label} active={status === c.value} count={latest.filter(c.test).length} onClick={() => setStatus(c.value)} />)}
        <Box sx={{ width: '1px', height: 20, background: 'var(--c-border)', mx: 0.5 }} aria-hidden />
        <FacetChip label="Customer" active={type === 'customer'} onClick={() => setType(type === 'customer' ? '' : 'customer')} />
        <FacetChip label="Stock" active={type === 'stock'} onClick={() => setType(type === 'stock' ? '' : 'stock')} />
        <Box sx={{ width: '1px', height: 20, background: 'var(--c-border)', mx: 0.5 }} aria-hidden />
        <FacetChip label="Show earlier revisions" active={withEarlier} onClick={() => setRevisions(withEarlier ? '' : 'all')} />
      </FilterBar>
      {capped && (
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1.5 }}>
          The 500 most recent orders are shown, and the search only looks through those.
        </Typography>
      )}
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={rows} columns={COLUMNS} getRowId={(o) => o.id} onRowClick={open} loading={list.loading && !list.data}
        storageKey="orders" exportName="orders" defaultSortKey="code" defaultSortDir="desc"
        empty={<EmptyState icon={<ReceiptLongRounded />} title={filtered ? 'No order matches these filters' : 'No orders yet'}
          hint={filtered ? 'Clear the search or pick another status.' : 'Start with an inquiry — its structure can be designed before anything is confirmed.'}
          action={filtered ? <Button onClick={clear}>Clear filters</Button> : canManage && <Button variant="contained" onClick={() => setCreating(true)}>New order</Button>} />} />
      <NewOrderDialog open={creating} onClose={() => setCreating(false)} onCreated={(o) => {
        invalidateNavCounts();
        toast.success(`${o.code} created as ${o.status === 'draft' ? 'a draft' : 'an inquiry'}.`);
        open(o);
      }} />
    </Box>
  );
}
