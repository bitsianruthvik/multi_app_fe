import { useEffect, useMemo, useState } from 'react';
import { Box, Button } from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import { cfApi, qs } from '../api/client';
import type { Machine, Tree } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { flattenTree } from '../lib/tree';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip, StatusBadge } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { ClassificationPicker } from '../components/ClassificationPicker';
import { MachineDialog } from '../components/MachineDialog';
import { MachineTypeDialog } from '../components/MachineTypeDialog';
import { useToast } from '../components/toastContext';

/**
 * Collection / List (§4.2) of machines. Machines are their own master (decided
 * 2026-09-22): each sits on a machine type in the shared tree, carries
 * specifications like an item does, and gets its operation times from rules.
 */
export default function Machines() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_production_manage');
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useUrlParam('status', '');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [creating, setCreating] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const typeId = Number(params.get('classificationId')) || null;
  useNewParam(() => { if (canManage) setCreating(true); });
  useEffect(() => { const t = window.setTimeout(() => setDebounced(search), 250); return () => window.clearTimeout(t); }, [search]);
  const tree = useLoad(() => cfApi.get<Tree>('/classification'), []);
  const list = useLoad(() => cfApi.get<Machine[]>(`/machines${qs({ search: debounced, classificationId: typeId })}`), [debounced, typeId]);
  const all = useMemo(() => list.data ?? [], [list.data]);
  const rows = useMemo(() => all.filter((m) => !status || m.status === status), [all, status]);
  const types = useMemo(() => flattenTree(tree.data).filter((n) => n.scope === 'machine' && n.isLeaf), [tree.data]);
  const pathOf = useMemo(() => new Map(flattenTree(tree.data).map((n) => [n.id, n.path])), [tree.data]);
  const setType = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('classificationId', String(id)); else next.delete('classificationId');
    setParams(next, { replace: true });
  };
  // A type can be deleted from the dialog below. A filter still pointing at it
  // shows an empty list and no reason why, so it lets go of the type instead.
  useEffect(() => {
    if (!typeId || !tree.data) return;
    if (!flattenTree(tree.data).some((n) => n.id === typeId)) setType(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree.data, typeId]);
  // Whatever happened in there — a type added, renamed, retired or deleted —
  // the tree behind the filter and the list's type column are both stale.
  const closeTypes = () => { setTypesOpen(false); tree.reload(); list.reload(); };

  const columns: DataColumn<Machine>[] = [
    { key: 'code', header: 'Code', render: (m) => <Mono chip>{m.code}</Mono>, sortValue: (m) => m.code, alwaysVisible: true },
    { key: 'name', header: 'Name', render: (m) => <Box sx={{ fontWeight: 500 }}>{m.name}</Box>, sortValue: (m) => m.name },
    { key: 'type', header: 'Machine type', render: (m) => <Box sx={{ color: 'var(--c-text-2)' }}>{pathOf.get(m.classificationId) ?? m.classificationName}</Box>, sortValue: (m) => pathOf.get(m.classificationId) ?? m.classificationName },
    { key: 'serial', header: 'Serial', render: (m) => <Mono muted>{m.serialNumber ?? '—'}</Mono>, sortValue: (m) => m.serialNumber },
    { key: 'bought', header: 'Bought as', render: (m) => <Mono muted>{m.catalogItem?.code ?? '—'}</Mono>, sortValue: (m) => m.catalogItem?.code, defaultHidden: true },
    { key: 'status', header: 'Status', render: (m) => <StatusBadge status={m.status} />, sortValue: (m) => m.status },
  ];
  // Counted before the status chip, like the chips themselves and like
  // Operations and Flows — so the figures hold still as you toggle Active.
  const stats = [
    { label: 'Machines', value: all.length },
    { label: 'Active', value: all.filter((m) => m.status === 'active').length, tone: 'success' as const, onClick: () => setStatus('active') },
    { label: 'Machine types', value: types.length, hint: 'The deepest level of a machine family — open to add, rename or retire one', onClick: () => setTypesOpen(true) },
  ];
  const open = (m: Machine) => navigate(appPath(company, `machines/${m.id}`));
  const filtered = !!debounced || !!typeId || !!status;

  return (
    <Box>
      <PageHeader title="Machines" subtitle="What does the work. A machine’s type decides what it must carry — a plasma cutter its cutting speed — and operation rules turn those values into times."
        actions={canManage && (
          <>
            <Button variant="outlined" startIcon={<AccountTreeRounded />} onClick={() => setTypesOpen(true)}>Machine types</Button>
            <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>New machine</Button>
          </>
        )} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search code, name or serial">
        {[['', 'All'], ['active', 'Active'], ['inactive', 'Inactive']].map(([v, label]) => (
          <FacetChip key={v || 'all'} label={label} active={status === v} count={all.filter((m) => !v || m.status === v).length} onClick={() => setStatus(v)} />
        ))}
        <Box sx={{ flex: '1 1 260px', maxWidth: 380, minWidth: 0 }}>
          <ClassificationPicker tree={tree.data} scope="machine" leafOnly={false} value={typeId} onChange={setType} label="Machine type or group" />
        </Box>
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={rows} columns={columns} getRowId={(m) => m.id} onRowClick={open} loading={list.loading && !list.data}
        storageKey="machines" exportName="machines" defaultSortKey="code"
        empty={<EmptyState icon={<PrecisionManufacturingRounded />} title={filtered ? 'No machine matches' : 'No machines yet'}
          hint={filtered ? 'Try another search, type or status.'
            : types.length === 0 ? 'A machine sits on a machine type — what kind of machine it is. Add the first type, then the machines themselves.'
            : 'Add the machines you have, each on one of your machine types.'}
          action={!filtered && canManage && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button variant={types.length === 0 ? 'contained' : 'outlined'} startIcon={<AccountTreeRounded />} onClick={() => setTypesOpen(true)}>Machine types</Button>
              <Button variant={types.length === 0 ? 'outlined' : 'contained'} onClick={() => setCreating(true)}>New machine</Button>
            </Box>
          )} />} />
      <MachineDialog open={creating} existing={null} tree={tree.data} onClose={() => setCreating(false)} onTypesChanged={tree.reload}
        onSaved={(m) => { invalidateNavCounts(); toast.success(`${m.code} created.`); open(m); }} />
      <MachineTypeDialog open={typesOpen} canManage={canManage} onClose={closeTypes} />
    </Box>
  );
}
