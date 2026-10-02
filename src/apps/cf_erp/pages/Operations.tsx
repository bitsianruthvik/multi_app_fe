import { useMemo, useState } from 'react';
import { Box, Button } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import TimerRounded from '@mui/icons-material/TimerRounded';
import { cfApi } from '../api/client';
import type { Operation } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip, StatusBadge } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { OperationDialog } from '../components/OperationDialog';
import { MachineTypeCell, TimeCell } from '../components/OperationRuleEditor';
import { useOperationRuleEditor } from '../hooks/useOperationRuleEditor';
import { useToast } from '../components/toastContext';
import { timeShort } from '../lib/formulaBuilder';

const hasWork = (o: Operation) => { const w = o.mainRule?.work; return !!(w && (w.minutes != null || w.formula)); };
const CHIPS: { value: string; label: string; test: (o: Operation) => boolean }[] = [
  { value: '', label: 'All', test: () => true },
  { value: 'untimed', label: 'No machine type yet', test: (o) => !o.ruleCount },
  { value: 'notime', label: 'No time yet', test: (o) => !!o.ruleCount && !hasWork(o) },
  { value: 'unused', label: 'In no flow', test: (o) => !o.flowCount },
  { value: 'inactive', label: 'Inactive', test: (o) => o.status === 'inactive' },
];
const matches = (o: Operation, term: string) => !term || [o.code, o.name, o.description, o.mainRule?.subject.name].some((v) => v?.toLowerCase().includes(term));

/**
 * Collection / List (§4.2) of operations — the steps flows are made of. One row per operation: the machine type that
 * does it and its two times, editable right here. An operation with several rules shows its main one and a
 * "+N more rules" link to the page's Advanced section, where the rest are edited.
 */
export default function Operations() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const [filter, setFilter] = useUrlParam('show', '');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const list = useLoad(() => cfApi.get<Operation[]>('/operations'), []);
  const editor = useOperationRuleEditor(() => { list.reload(); invalidateNavCounts(); });
  const { canManage, idx } = editor;
  useNewParam(() => { if (canManage) setCreating(true); });
  const term = search.trim().toLowerCase();
  const base = useMemo(() => (list.data ?? []).filter((o) => matches(o, term)), [list.data, term]);
  const chip = CHIPS.find((c) => c.value === filter) ?? CHIPS[0];
  const rows = useMemo(() => base.filter(chip.test), [base, chip]);
  const stats = [
    { label: 'Operations', value: base.length },
    { label: 'No machine type yet', value: base.filter((o) => !o.ruleCount).length, tone: 'warning' as const, hint: 'No timing rule — nothing can be timed', onClick: () => setFilter('untimed') },
    { label: 'No time yet', value: base.filter((o) => !!o.ruleCount && !hasWork(o)).length, tone: 'warning' as const, hint: 'A machine type but no time per quantity', onClick: () => setFilter('notime') },
    { label: 'In no flow', value: base.filter((o) => !o.flowCount).length, hint: 'Not a step anywhere', onClick: () => setFilter('unused') },
  ];
  const open = (o: Operation) => navigate(appPath(company, `operations/${o.id}`));
  const ref = (o: Operation) => ({ id: o.id, code: o.code, name: o.name });

  const columns: DataColumn<Operation>[] = [
    { key: 'code', header: 'Code', render: (o) => <Mono chip>{o.code}</Mono>, sortValue: (o) => o.code, alwaysVisible: true },
    { key: 'name', header: 'Name', render: (o) => <Box sx={{ fontWeight: 500 }}>{o.name}</Box>, sortValue: (o) => o.name },
    {
      key: 'type', header: 'Machine type', sortValue: (o) => o.mainRule?.subject.name ?? '',
      render: (o) => (
        <Box>
          <MachineTypeCell op={ref(o)} rule={o.mainRule ?? null} canManage={canManage} onPick={(el) => editor.pickType(ref(o), o.mainRule ?? null, el)} />
          {(o.ruleCount ?? 0) > 1 && (
            <Box component={Link} to={`${appPath(company, `operations/${o.id}`)}?advanced=1`} onClick={(e: React.MouseEvent) => e.stopPropagation()} data-testid={`op-more-${o.id}`}
              sx={{ display: 'inline-block', ml: 0.5, px: 0.75, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', fontSize: 11.5, color: 'var(--c-text-2)', textDecoration: 'none', whiteSpace: 'nowrap', '&:hover': { color: 'var(--c-primary-700)', borderColor: 'var(--c-primary-200)' } }}>
              +{(o.ruleCount ?? 0) - 1} more {(o.ruleCount ?? 0) - 1 === 1 ? 'rule' : 'rules'}
            </Box>
          )}
        </Box>
      ),
    },
    {
      key: 'setup', header: 'Setup time', sortValue: (o) => o.mainRule?.setup?.minutes ?? (o.mainRule?.setup?.formula ? Infinity : -1),
      render: (o) => <TimeCell op={ref(o)} rule={o.mainRule ?? null} which="setup" idx={idx} canManage={canManage} onEdit={(el) => editor.editTime(ref(o), o.mainRule ?? null, 'setup', el)} />,
    },
    {
      key: 'work', header: 'Time per quantity', sortValue: (o) => timeShort(o.mainRule?.work, null) ?? '',
      render: (o) => <TimeCell op={ref(o)} rule={o.mainRule ?? null} which="work" idx={idx} canManage={canManage} onEdit={(el) => editor.editTime(ref(o), o.mainRule ?? null, 'work', el)} />,
    },
    { key: 'flows', header: 'Used in flows', numeric: true, render: (o) => <Mono muted={!o.flowCount}>{o.flowCount ?? 0}</Mono>, sortValue: (o) => o.flowCount ?? 0 },
    { key: 'description', header: 'Description', render: (o) => <Box sx={{ color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{o.description ?? '—'}</Box>, sortValue: (o) => o.description, defaultHidden: true },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} />, sortValue: (o) => o.status },
  ];

  return (
    <Box>
      <PageHeader title="Operations" subtitle="The kinds of work — cut, drill, fit up, weld. Each says which machine type does it and how long it takes; flows put them in order."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>New operation</Button>} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search code, name, machine type or description">
        {CHIPS.map((c) => <FacetChip key={c.value || 'all'} label={c.label} active={filter === c.value} count={base.filter(c.test).length} onClick={() => setFilter(c.value)} />)}
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={rows} columns={columns} getRowId={(o) => o.id} onRowClick={open} loading={list.loading && !list.data}
        storageKey="operations" exportName="operations" defaultSortKey="code"
        empty={<EmptyState icon={<TimerRounded />} title={term || filter ? 'No operation matches' : 'No operations yet'}
          hint={term || filter ? 'Clear the search or pick another filter.' : 'Start with the work your shop does: cutting, drilling, welding.'}
          action={!term && !filter && canManage && <Button variant="contained" onClick={() => setCreating(true)}>New operation</Button>} />} />
      <OperationDialog open={creating} existing={null} onClose={() => setCreating(false)}
        onSaved={(o) => { invalidateNavCounts(); toast.success(`${o.code} created.`); open(o); }} />
      {editor.ui}
    </Box>
  );
}
