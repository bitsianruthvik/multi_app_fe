import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import LayersRounded from '@mui/icons-material/LayersRounded';
import { cfApi, qs } from '../api/client';
import type { Batch } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { BATCH_STATUS_LABEL, qtyText } from '../lib/inventory';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { BatchStatusBadge } from '../components/inventoryUi';

const STATUS_CHIPS = [['', 'All'], ['available', 'Available'], ['on_hold', 'On hold'], ['rejected', 'Rejected']] as const;

const COLUMNS: DataColumn<Batch>[] = [
  { key: 'code', header: 'Batch', render: (b) => <Mono chip>{b.code}</Mono>, sortValue: (b) => b.code, alwaysVisible: true },
  {
    key: 'item', header: 'Item', sortValue: (b) => b.item.code, exportValue: (b) => b.item.code,
    render: (b) => <Box sx={{ py: 0.5 }}><Mono>{b.item.code}</Mono><Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{b.item.name}</Typography></Box>,
  },
  { key: 'received', header: 'Received', render: (b) => <Mono muted>{b.receivedOn ?? '—'}</Mono>, sortValue: (b) => b.receivedOn },
  {
    key: 'supplier', header: 'Supplier', sortValue: (b) => b.supplier?.name, exportValue: (b) => [b.supplier?.name, b.supplierRef].filter(Boolean).join(' · lot '),
    render: (b) => <Box sx={{ py: 0.5 }}>{b.supplier?.name ?? '—'}{b.supplierRef && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>lot {b.supplierRef}</Typography>}</Box>,
  },
  { key: 'onHand', header: 'On hand', numeric: true, sortValue: (b) => b.onHand ?? 0, render: (b) => <>{qtyText(b.onHand)} <Mono muted>{b.item.uom}</Mono></> },
  { key: 'status', header: 'Status', sortValue: (b) => b.status, exportValue: (b) => BATCH_STATUS_LABEL[b.status], render: (b) => <BatchStatusBadge status={b.status} note={b.statusNote} /> },
];

/** Collection / List (§4.2) of batches — one per delivery lot of an item kept by batch. */
export default function Batches() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const [status, setStatus] = useUrlParam('status', '');
  const [scope, setScope] = useUrlParam('scope', 'in_stock');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const inStock = scope === 'in_stock';
  useEffect(() => { const t = window.setTimeout(() => setDebounced(search), 250); return () => window.clearTimeout(t); }, [search]);
  const list = useLoad(() => cfApi.get<Batch[]>(`/batches${qs({ search: debounced, inStock: inStock ? 1 : undefined })}`), [debounced, inStock]);
  const all = useMemo(() => list.data ?? [], [list.data]);
  const rows = useMemo(() => all.filter((b) => !status || b.status === status), [all, status]);
  // Counted over the rows shown, so the figures always agree with the table.
  const stats = [
    { label: 'Batches', value: rows.length, hint: inStock ? 'In stock now' : 'Including batches used up' },
    { label: 'On hold', value: rows.filter((b) => b.status === 'on_hold').length, tone: 'warning' as const, hint: 'Not issued until released', onClick: () => setStatus('on_hold') },
    { label: 'Rejected', value: rows.filter((b) => b.status === 'rejected').length, tone: 'danger' as const, hint: 'Never issued — move or scrap them', onClick: () => setStatus('rejected') },
  ];
  const open = (b: Batch) => navigate(appPath(company, `batches/${b.id}`));

  return (
    <Box>
      <PageHeader title="Batches" subtitle="Each delivery lot of an item kept by batch — a heat of plate — with what it records (heat number), where it is, and whether it may be used." />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search batch, item or supplier lot">
        {STATUS_CHIPS.map(([v, label]) => <FacetChip key={v || 'all'} label={label} active={status === v} count={all.filter((b) => !v || b.status === v).length} onClick={() => setStatus(v)} />)}
        <Box sx={{ width: '1px', height: 20, background: 'var(--c-border)', mx: 0.5 }} aria-hidden />
        <FacetChip label="In stock" active={inStock} onClick={() => setScope('in_stock')} />
        <FacetChip label="Used up too" active={!inStock} onClick={() => setScope('all')} />
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={rows} columns={COLUMNS} getRowId={(b) => b.id} onRowClick={open} loading={list.loading && !list.data}
        storageKey="batches" exportName="batches" defaultSortKey="received" defaultSortDir="desc"
        empty={<EmptyState icon={<LayersRounded />} title={debounced || status ? 'No batch matches' : 'No batches'}
          hint={debounced || status ? 'Clear the search or pick another status.'
            : inStock ? 'None in stock — include used-up batches to see the rest.'
              : 'Batches start when an item kept by batch is received.'}
          action={debounced || status ? <Button onClick={() => { setSearch(''); setStatus(''); }}>Clear filters</Button>
            : inStock ? <Button onClick={() => setScope('all')}>Include used-up batches</Button> : undefined} />} />
    </Box>
  );
}
