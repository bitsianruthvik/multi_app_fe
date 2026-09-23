import { useMemo, useState } from 'react';
import { Box, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import WarehouseRounded from '@mui/icons-material/WarehouseRounded';
import { cfApi } from '../api/client';
import type { AreaPurpose, StockingArea } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { PURPOSE_LABEL } from '../lib/inventory';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip, StatusBadge } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { PurposeChip } from '../components/inventoryUi';
import { AreaDialog } from '../components/AreaDialog';
import { useToast } from '../components/toastContext';

const PURPOSES: (AreaPurpose | '')[] = ['', 'storage', 'wip', 'quarantine', 'dispatch'];
const matches = (a: StockingArea, term: string) => !term || [a.code, a.name, a.machine?.code, a.machine?.name].some((v) => v?.toLowerCase().includes(term));

const COLUMNS: DataColumn<StockingArea>[] = [
  { key: 'code', header: 'Code', render: (a) => <Mono chip>{a.code}</Mono>, sortValue: (a) => a.code, alwaysVisible: true },
  { key: 'name', header: 'Name', render: (a) => <Box sx={{ fontWeight: 500 }}>{a.name}</Box>, sortValue: (a) => a.name },
  { key: 'purpose', header: 'Counts as', render: (a) => <PurposeChip purpose={a.purpose} />, sortValue: (a) => a.purpose, exportValue: (a) => PURPOSE_LABEL[a.purpose] },
  { key: 'machine', header: 'Machine', render: (a) => (a.machine ? <Mono>{a.machine.code}</Mono> : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>—</Box>), sortValue: (a) => a.machine?.code },
  { key: 'items', header: 'Items', numeric: true, render: (a) => <Mono muted={!a.itemCount}>{a.itemCount ?? 0}</Mono>, sortValue: (a) => a.itemCount ?? 0 },
  { key: 'lines', header: 'Stock lines', numeric: true, render: (a) => <Mono muted={!a.lineCount}>{a.lineCount ?? 0}</Mono>, sortValue: (a) => a.lineCount ?? 0, defaultHidden: true },
  { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} />, sortValue: (a) => a.status },
];

/** Collection / List (§4.2) of stocking areas — each holds an inventory (decided 2026-09-22). */
export default function StockingAreas() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const [purpose, setPurpose] = useUrlParam('purpose', '');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  useNewParam(() => { if (canManage) setCreating(true); });
  const list = useLoad(() => cfApi.get<StockingArea[]>('/stocking-areas'), []);
  const term = search.trim().toLowerCase();
  const base = useMemo(() => (list.data ?? []).filter((a) => matches(a, term)), [list.data, term]);
  const rows = useMemo(() => base.filter((a) => !purpose || a.purpose === purpose), [base, purpose]);
  const stats = [
    { label: 'Areas', value: base.length },
    { label: 'Holding stock', value: base.filter((a) => a.lineCount).length, tone: 'info' as const },
    { label: 'Quarantine', value: base.filter((a) => a.purpose === 'quarantine').length, hint: 'Stock there is held', onClick: () => setPurpose('quarantine') },
  ];
  const open = (a: StockingArea) => navigate(appPath(company, `stocking-areas/${a.id}`));

  return (
    <Box>
      <PageHeader title="Stocking areas" subtitle="Every place that holds stock — a yard, a store, the WIP beside a machine, an inspection hold. Each one has its own inventory."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>New area</Button>} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search code, name or machine">
        {PURPOSES.map((p) => <FacetChip key={p || 'all'} label={p ? PURPOSE_LABEL[p] : 'All'} active={purpose === p} count={base.filter((a) => !p || a.purpose === p).length} onClick={() => setPurpose(p)} />)}
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={rows} columns={COLUMNS} getRowId={(a) => a.id} onRowClick={open} loading={list.loading && !list.data}
        storageKey="stocking-areas" exportName="stocking-areas" defaultSortKey="code"
        empty={<EmptyState icon={<WarehouseRounded />} title={term || purpose ? 'No area matches' : 'No stocking areas yet'}
          hint={term || purpose ? 'Clear the search or pick another purpose.' : 'Start with where material arrives — a raw material yard or a store.'}
          action={!term && !purpose && canManage && <Button variant="contained" onClick={() => setCreating(true)}>New area</Button>} />} />
      <AreaDialog open={creating} existing={null} onClose={() => setCreating(false)}
        onSaved={(a) => { invalidateNavCounts(); toast.success(`${a.code} created.`); open(a); }} />
    </Box>
  );
}
