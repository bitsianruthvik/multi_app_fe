import { useMemo, useState } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import { cfApi, CfApiError } from '../api/client';
import type { Flow } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { EmptyState, ErrorNotice, Mono, PageHeader, SectionCard, StatStrip, StatusBadge } from '../components/ui';
import { FlowPicker } from '../components/FlowPicker';
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

type CutPlateFlow = { flow: Pick<Flow, 'id' | 'code' | 'name' | 'status'> | null };

/**
 * The flow a NEW cut plate is made by (init.sql §33). User, 2026-09-30:
 * cutting belongs to the cut plate — it is made by a cutting flow, and a
 * part's own flow no longer cuts. Cut pieces are made automatically, with
 * nobody there to choose a flow, so it is said once here. A cut plate that
 * already has a flow keeps it; one can still be changed on the cut plate itself.
 */
function CutPlateFlowCard({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const saved = useLoad(() => cfApi.get<CutPlateFlow>('/flows/cut-plates'), []);
  const [pick, setPick] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const current = saved.data?.flow?.id ?? null;
  const value = pick === undefined ? current : pick;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await cfApi.put<CutPlateFlow>('/flows/cut-plates', { flowId: value });
      saved.setData(out);
      setPick(undefined);
      toast.success(out.flow ? `New cut plates are made by ${out.flow.code}.` : 'New cut plates get no flow.');
    } catch (e) { setError(e as CfApiError); } finally { setBusy(false); }
  };
  return (
    <SectionCard title="Cut plates" subtitle="Cut plates are made automatically from a line's parts. The flow chosen here is given to every new one — a cut plate that already has a flow keeps it." sx={{ mb: 2 }}>
      <ErrorNotice error={saved.error ?? error} onRetry={saved.error ? saved.reload : undefined} />
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Box sx={{ flex: '1 1 280px', minWidth: 0, maxWidth: 480 }}>
          <FlowPicker value={value} onChange={setPick} label="Cut plates are made by" disabled={!canManage || !saved.data}
            helperText={saved.data?.flow?.status === 'draft' ? 'This flow is still a draft — activate it before a line is released.' : 'Empty: new cut plates get no flow, and release asks for one.'} />
        </Box>
        {canManage && (
          <Button variant="contained" onClick={save} disabled={busy || !saved.data || value === current}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : 'Save'}</Button>
        )}
      </Box>
      {!canManage && <Typography sx={{ mt: 1, fontSize: 13, color: 'var(--c-text-2)' }}>You can see this, but your role cannot change it.</Typography>}
    </SectionCard>
  );
}

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
      <CutPlateFlowCard canManage={canManage} />
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
