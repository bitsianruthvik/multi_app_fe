import { useMemo, useState } from 'react';
import { Box, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import { cfApi } from '../api/client';
import type { Flow } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip, StatusBadge } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { FlowDialog } from '../components/FlowDialogs';
import { useToast } from '../components/toastContext';

const STATUS_CHIPS = [['', 'All'], ['active', 'Active'], ['draft', 'Drafts'], ['obsolete', 'Obsolete']] as const;
const matches = (f: Flow, term: string) => !term || [f.code, f.name, f.description].some((v) => v?.toLowerCase().includes(term));

const COLUMNS: DataColumn<Flow>[] = [
  { key: 'code', header: 'Code', render: (f) => <Mono chip>{f.code}</Mono>, sortValue: (f) => f.code, alwaysVisible: true },
  { key: 'name', header: 'Name', render: (f) => <Box sx={{ fontWeight: 500 }}>{f.name}</Box>, sortValue: (f) => f.name },
  { key: 'revision', header: 'Revision', render: (f) => <Mono muted>{f.revision ?? '—'}</Mono>, sortValue: (f) => f.revision },
  { key: 'steps', header: 'Steps', numeric: true, render: (f) => <Mono>{f.stepCount ?? 0}</Mono>, sortValue: (f) => f.stepCount ?? 0 },
  { key: 'used', header: 'Used by', numeric: true, render: (f) => <Mono muted={!f.usedBy}>{f.usedBy ?? 0}</Mono>, sortValue: (f) => f.usedBy ?? 0 },
  { key: 'description', header: 'Description', render: (f) => <Box sx={{ color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{f.description ?? '—'}</Box>, sortValue: (f) => f.description, defaultHidden: true },
  { key: 'status', header: 'Status', render: (f) => <StatusBadge status={f.status} />, sortValue: (f) => f.status },
];

/** Collection / List (§4.2) of operation flows — the usual ways things are made. */
export default function Flows() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_production_manage');
  const [status, setStatus] = useUrlParam('status', '');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  useNewParam(() => { if (canManage) setCreating(true); });
  const list = useLoad(() => cfApi.get<Flow[]>('/flows'), []);
  const term = search.trim().toLowerCase();
  const base = useMemo(() => (list.data ?? []).filter((f) => matches(f, term)), [list.data, term]);
  const rows = useMemo(() => base.filter((f) => !status || f.status === status), [base, status]);
  const stats = [
    { label: 'Flows', value: base.length },
    { label: 'Active', value: base.filter((f) => f.status === 'active').length, tone: 'success' as const, onClick: () => setStatus('active') },
    { label: 'Drafts', value: base.filter((f) => f.status === 'draft').length, tone: 'warning' as const, hint: 'Nothing can be made by a draft flow', onClick: () => setStatus('draft') },
    { label: 'Unused', value: base.filter((f) => !f.usedBy).length, hint: 'No item, template or BOM line names it' },
  ];
  const open = (f: Flow) => navigate(appPath(company, `flows/${f.id}`));
  const filtered = !!term || !!status;

  return (
    <Box>
      <PageHeader title="Flows" subtitle="The usual way to make something: operations in order, with what each step waits for. Items and templates name their flow; a BOM line can name another for one parent."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>New flow</Button>} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search code, name or description">
        {STATUS_CHIPS.map(([v, label]) => <FacetChip key={v || 'all'} label={label} active={status === v} count={base.filter((f) => !v || f.status === v).length} onClick={() => setStatus(v)} />)}
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={rows} columns={COLUMNS} getRowId={(f) => f.id} onRowClick={open} loading={list.loading && !list.data}
        storageKey="flows" exportName="flows" defaultSortKey="code"
        empty={<EmptyState icon={<RouteRounded />} title={filtered ? 'No flow matches' : 'No flows yet'}
          hint={filtered ? 'Clear the search or pick another status.' : 'Make operations first, then a flow that puts them in order — e.g. a plate part: cut, then drill.'}
          action={!filtered && canManage && <Button variant="contained" onClick={() => setCreating(true)}>New flow</Button>} />} />
      <FlowDialog open={creating} existing={null} onClose={() => setCreating(false)}
        onSaved={(f) => { invalidateNavCounts(); toast.success(`${f.code} created as a draft.`); open(f); }} />
    </Box>
  );
}
