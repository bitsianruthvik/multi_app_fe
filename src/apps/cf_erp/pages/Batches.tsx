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
import { ownerLabel, rupeeText } from '../lib/money';
import { Money, OwnerTag } from '../components/Money';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { BatchStatusBadge } from '../components/inventoryUi';

const STATUS_CHIPS = [['', 'All'], ['available', 'Available'], ['on_hold', 'On hold'], ['rejected', 'Rejected']] as const;

/** What a lot on hand is worth at its own cost; null = not costed. A customer's lot is never valued as ours. */
const batchValue = (b: Batch) => (b.owner || b.unitCost == null || b.onHand == null ? null : Math.round(b.onHand * b.unitCost * 100) / 100);

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
  {
    key: 'owner', header: 'Owner', sortValue: (b) => ownerLabel(b.owner), exportValue: (b) => ownerLabel(b.owner),
    render: (b) => <OwnerTag name={b.owner ? ownerLabel(b.owner) : null} />,
  },
  { key: 'onHand', header: 'On hand', numeric: true, sortValue: (b) => b.onHand ?? 0, render: (b) => <>{qtyText(b.onHand)} <Mono muted>{b.item.uom}</Mono></> },
  {
    key: 'unitCost', header: 'Unit cost', numeric: true, defaultHidden: true, sortValue: (b) => (b.owner ? null : b.unitCost), exportValue: (b) => (b.owner ? '' : b.unitCost ?? ''),
    render: (b) => (b.owner ? <Mono muted>—</Mono> : <Money value={b.unitCost} digits={2} />),
  },
  {
    key: 'value', header: 'Value', numeric: true, sortValue: (b) => batchValue(b), exportValue: (b) => batchValue(b) ?? '',
    render: (b) => (b.owner ? <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 12.5 }} title="A customer's material costs us nothing">theirs</Box> : <Money value={batchValue(b)} />),
  },
  { key: 'status', header: 'Status', sortValue: (b) => b.status, exportValue: (b) => BATCH_STATUS_LABEL[b.status], render: (b) => <BatchStatusBadge status={b.status} note={b.statusNote} /> },
];

/** Collection / List (§4.2) of batches — one per delivery lot of an item kept by batch. */
export default function Batches() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const [status, setStatus] = useUrlParam('status', '');
  const [scope, setScope] = useUrlParam('scope', 'in_stock');
  const [owner, setOwner] = useUrlParam('owner', '');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const inStock = scope === 'in_stock';
  useEffect(() => { const t = window.setTimeout(() => setDebounced(search), 250); return () => window.clearTimeout(t); }, [search]);
  const list = useLoad(() => cfApi.get<Batch[]>(`/batches${qs({ search: debounced, inStock: inStock ? 1 : undefined })}`), [debounced, inStock]);
  const all = useMemo(() => list.data ?? [], [list.data]);
  const owners = useMemo(() => {
    const m = new Map<number, string>();
    for (const b of all) if (b.owner) m.set(b.owner.party.id, ownerLabel(b.owner));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);
  const ownedBy = (b: Batch, o: string) => (o === '' ? true : o === 'ours' ? !b.owner : String(b.owner?.party.id) === o);
  const rows = useMemo(() => all.filter((b) => (!status || b.status === status) && ownedBy(b, owner)), [all, status, owner]);
  const ourRows = rows.filter((b) => !b.owner);
  const ourValue = ourRows.reduce((t, b) => t + (batchValue(b) ?? 0), 0);
  const notCosted = ourRows.filter((b) => batchValue(b) == null).length;
  // Counted over the rows shown, so the figures always agree with the table.
  const stats = [
    { label: 'Batches', value: rows.length, hint: inStock ? 'In stock now' : 'Including batches used up' },
    ...(ourRows.length ? [{ label: 'Value (ours)', value: ourValue, display: ourValue === 0 && notCosted ? 'not costed' : rupeeText(ourValue), hint: notCosted ? `${notCosted} batch${notCosted === 1 ? '' : 'es'} with no cost are left out` : "On hand at each batch's own cost" }] : []),
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
        {owners.length > 0 && (
          <>
            <Box sx={{ width: '1px', height: 20, background: 'var(--c-border)', mx: 0.5 }} aria-hidden />
            <FacetChip label="Any owner" active={owner === ''} onClick={() => setOwner('')} />
            <FacetChip label="Ours" active={owner === 'ours'} count={all.filter((b) => !b.owner).length} onClick={() => setOwner('ours')} />
            {owners.map(([id, name]) => <FacetChip key={id} label={`${name}'s`} active={owner === String(id)} count={all.filter((b) => b.owner?.party.id === id).length} onClick={() => setOwner(String(id))} />)}
          </>
        )}
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
