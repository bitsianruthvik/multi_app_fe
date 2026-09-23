import { useMemo, useState } from 'react';
import { Box, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import TimerRounded from '@mui/icons-material/TimerRounded';
import { cfApi } from '../api/client';
import type { Operation } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip, StatusBadge, WarnBadge } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { OperationDialog } from '../components/OperationDialog';
import { useToast } from '../components/toastContext';

const CHIPS: { value: string; label: string; test: (o: Operation) => boolean }[] = [
  { value: '', label: 'All', test: () => true },
  { value: 'untimed', label: 'No machine yet', test: (o) => !o.ruleCount },
  { value: 'unused', label: 'In no flow', test: (o) => !o.flowCount },
  { value: 'inactive', label: 'Inactive', test: (o) => o.status === 'inactive' },
];
const matches = (o: Operation, term: string) => !term || [o.code, o.name, o.description].some((v) => v?.toLowerCase().includes(term));

const COLUMNS: DataColumn<Operation>[] = [
  { key: 'code', header: 'Code', render: (o) => <Mono chip>{o.code}</Mono>, sortValue: (o) => o.code, alwaysVisible: true },
  { key: 'name', header: 'Name', render: (o) => <Box sx={{ fontWeight: 500 }}>{o.name}</Box>, sortValue: (o) => o.name },
  { key: 'rules', header: 'Timing rules', numeric: true, sortValue: (o) => o.ruleCount ?? 0, render: (o) => (o.ruleCount ? <Mono>{o.ruleCount}</Mono> : <WarnBadge label="None" title="No machine does it yet" />) },
  { key: 'flows', header: 'In flows', numeric: true, render: (o) => <Mono muted={!o.flowCount}>{o.flowCount ?? 0}</Mono>, sortValue: (o) => o.flowCount ?? 0 },
  { key: 'description', header: 'Description', render: (o) => <Box sx={{ color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{o.description ?? '—'}</Box>, sortValue: (o) => o.description, defaultHidden: true },
  { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} />, sortValue: (o) => o.status },
];

/** Collection / List (§4.2) of operations — the steps flows are made of. */
export default function Operations() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_production_manage');
  const [filter, setFilter] = useUrlParam('show', '');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  useNewParam(() => { if (canManage) setCreating(true); });
  const list = useLoad(() => cfApi.get<Operation[]>('/operations'), []);
  const term = search.trim().toLowerCase();
  const base = useMemo(() => (list.data ?? []).filter((o) => matches(o, term)), [list.data, term]);
  const chip = CHIPS.find((c) => c.value === filter) ?? CHIPS[0];
  const rows = useMemo(() => base.filter(chip.test), [base, chip]);
  const stats = [
    { label: 'Operations', value: base.length },
    { label: 'No machine yet', value: base.filter((o) => !o.ruleCount).length, tone: 'warning' as const, hint: 'No timing rule — nothing can be timed', onClick: () => setFilter('untimed') },
    { label: 'In no flow', value: base.filter((o) => !o.flowCount).length, hint: 'Not a step anywhere', onClick: () => setFilter('unused') },
  ];
  const open = (o: Operation) => navigate(appPath(company, `operations/${o.id}`));

  return (
    <Box>
      <PageHeader title="Operations" subtitle="The kinds of work — cut, drill, fit up, weld. Each says which machines can do it and how long it takes; flows put them in order."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>New operation</Button>} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search code or name">
        {CHIPS.map((c) => <FacetChip key={c.value || 'all'} label={c.label} active={filter === c.value} count={base.filter(c.test).length} onClick={() => setFilter(c.value)} />)}
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={rows} columns={COLUMNS} getRowId={(o) => o.id} onRowClick={open} loading={list.loading && !list.data}
        storageKey="operations" exportName="operations" defaultSortKey="code"
        empty={<EmptyState icon={<TimerRounded />} title={term || filter ? 'No operation matches' : 'No operations yet'}
          hint={term || filter ? 'Clear the search or pick another filter.' : 'Start with the work your shop does: cutting, drilling, welding.'}
          action={!term && !filter && canManage && <Button variant="contained" onClick={() => setCreating(true)}>New operation</Button>} />} />
      <OperationDialog open={creating} existing={null} onClose={() => setCreating(false)}
        onSaved={(o) => { invalidateNavCounts(); toast.success(`${o.code} created.`); open(o); }} />
    </Box>
  );
}
