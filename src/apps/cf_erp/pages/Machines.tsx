import { useEffect, useMemo, useState } from 'react';
import { Box, Button } from '@mui/material';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import ShoppingCartRounded from '@mui/icons-material/ShoppingCartRounded';
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
import { RequestMachineDialog } from '../components/RequestMachineDialog';
import { StageBadge } from '../components/MachineLife';
import { ClassificationManager } from '../components/ClassificationManager';
import { screenTreePath } from '../lib/classificationScreens';
import { useToast } from '../components/toastContext';
import { FlashOnChange } from '../motion';

/**
 * Collection / List (§4.2) of machines. Machines are their own master (decided
 * 2026-09-22): each sits on a machine type in the shared tree, carries
 * specifications like an item does, and gets its operation times from rules.
 */
export default function Machines() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const permitted = useIsPermitted();
  const canManage = permitted('cf_erp_production_manage|cf_erp_maintenance');
  // §103 (2026-11-12): New machine (one you have) is Maintenance's; buying one is requested — planning or Maintenance.
  const canRegister = permitted('cf_erp_maintenance');
  const canRequest = canManage;
  const [requesting, setRequesting] = useState(false);
  const [params, setParams] = useSearchParams();
  // §104: the lifecycle stage — In use (all but condemned) by default — replaces the old active / inactive chips.
  const [stage, setStage] = useUrlParam('stage', 'current');
  // Default: the machines that do production work. The asset register (vehicles, panels, tools) is one click away.
  const [scope, setScope] = useUrlParam('show', 'production');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [creating, setCreating] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const typeId = Number(params.get('classificationId')) || null;
  useNewParam((v) => { if (v === 'request') { if (canRequest) setRequesting(true); } else if (canRegister) setCreating(true); });
  useEffect(() => { const t = window.setTimeout(() => setDebounced(search), 250); return () => window.clearTimeout(t); }, [search]);
  // The Machines screen's part of the tree: the machine families (readable with the production grant).
  const tree = useLoad(() => cfApi.get<Tree>(screenTreePath('machines')), []);
  // Load every page: the full asset register can exceed the API's 500-row page.
  // DataTable handles display paging, sorting and exports over this collection.
  const list = useLoad(async () => {
    const machines: Machine[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await cfApi.get<Machine[]>(`/machines${qs({ search: debounced, classificationId: typeId, offset })}`);
      machines.push(...page);
      if (page.length < 500) return machines;
    }
  }, [debounced, typeId]);
  const all = useMemo(() => list.data ?? [], [list.data]);
  // show: production (machines some operation runs on) | all (every machine) | tools (durable tools on the register).
  const inScope = useMemo(() => (scope === 'tools' ? all.filter((m) => m.kind === 'tool') : scope === 'all' ? all.filter((m) => m.kind !== 'tool') : all.filter((m) => m.kind !== 'tool' && m.isProduction !== false)), [all, scope]);
  const productionCount = useMemo(() => all.filter((m) => m.kind !== 'tool' && m.isProduction !== false).length, [all]);
  const toolCount = useMemo(() => all.filter((m) => m.kind === 'tool').length, [all]);
  const stageOk = (m: Machine, s: string) => (s === 'current' ? m.stage !== 'condemned' : !s || m.stage === s);
  const rows = useMemo(() => inScope.filter((m) => stageOk(m, stage)), [inScope, stage]);
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
    { key: 'type', header: 'Machine type', render: (m) => (
      <Box component={Link} to={appPath(company, `machine-types/${m.classificationId}`)} onClick={(e: React.MouseEvent) => e.stopPropagation()} title="Open this machine type — its specifications and charts"
        sx={{ color: 'var(--c-text-2)', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } }}>{pathOf.get(m.classificationId) ?? m.classificationName}</Box>
    ), sortValue: (m) => pathOf.get(m.classificationId) ?? m.classificationName },
    { key: 'serial', header: 'Serial', render: (m) => <Mono muted>{m.serialNumber ?? '—'}</Mono>, sortValue: (m) => m.serialNumber },
    { key: 'bought', header: 'Bought as', render: (m) => <Mono muted>{m.catalogItem?.code ?? '—'}</Mono>, sortValue: (m) => m.catalogItem?.code, defaultHidden: true },
    { key: 'production', header: 'Production', render: (m) => (m.isProduction === false ? <Box sx={{ color: 'var(--c-text-3)' }}>Asset</Box> : <Box>Yes</Box>), sortValue: (m) => (m.isProduction === false ? 0 : 1), exportValue: (m) => (m.isProduction === false ? 'No' : 'Yes'), defaultHidden: scope !== 'all' },
    { key: 'place', header: 'Place', render: (m) => <Mono muted={!m.area}>{m.area?.code ?? '—'}</Mono>, sortValue: (m) => m.area?.code },
    { key: 'with', header: 'With', render: (m) => (m.withWhom ? <Box sx={{ fontSize: 13 }}>{m.withWhom.name ?? m.withWhom.code}{m.withWhom.dueOn ? <Box component="span" sx={{ color: 'var(--c-text-3)' }}> · due {m.withWhom.dueOn}</Box> : null}</Box> : <Box sx={{ color: 'var(--c-text-3)' }}>—</Box>), sortValue: (m) => m.withWhom?.name ?? '', exportValue: (m) => m.withWhom?.name ?? '' },
    { key: 'stage', header: 'Stage', render: (m) => (m.stage ? <FlashOnChange value={m.stage}><StageBadge stage={m.stage} label={m.stageLabel ?? m.stage} /></FlashOnChange> : <StatusBadge status={m.status} />), sortValue: (m) => m.stage ?? m.status, exportValue: (m) => m.stageLabel ?? m.status },
  ];
  // Counted before the status chip, like the chips themselves and like
  // Operations and Flows — so the figures hold still as you toggle Active.
  const stats = [
    { label: scope === 'all' ? 'All machines' : 'Production machines', value: inScope.length, hint: scope === 'all' ? 'Every machine in the register' : `${all.length} in the register, ${all.length - productionCount} with no operation to run` },
    { label: 'Live', value: inScope.filter((m) => m.stage === 'live').length, tone: 'success' as const, onClick: () => setStage('live') },
    { label: 'In setup', value: inScope.filter((m) => m.stage === 'setup').length, hint: 'Received, being set up by Maintenance', onClick: () => setStage('setup') },
    { label: 'Checked out', value: inScope.filter((m) => !!m.withWhom).length, hint: 'With a person, a contractor, an order or an area' },
    { label: 'Machine types', value: types.length, hint: 'The deepest level of a machine family — open to add, rename or retire one', onClick: () => setTypesOpen(true) },
  ];
  const open = (m: Machine) => navigate(appPath(company, `machines/${m.id}`));
  const filtered = !!debounced || !!typeId || (stage !== 'current' && !!stage) || (scope !== 'all' && all.length > 0);

  return (
    <Box>
      <PageHeader title="Machines" subtitle="What does the work. A machine’s type decides what it must carry — a plasma cutter its cutting speed — and operation rules turn those values into times."
        actions={(
          <>
            <Button variant="outlined" startIcon={<AccountTreeRounded />} onClick={() => setManaging(true)}>Classification</Button>
            {canManage && <Button variant="outlined" onClick={() => setTypesOpen(true)}>Machine types</Button>}
            {canRequest && <Button variant={canRegister ? 'outlined' : 'contained'} startIcon={<ShoppingCartRounded />} onClick={() => setRequesting(true)} data-testid="request-machine-open">Request a new machine</Button>}
            {canRegister && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>New machine</Button>}
          </>
        )} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search code, name or serial">
        <FacetChip label="Production machines" active={scope === 'production'} count={productionCount} onClick={() => setScope('production')} />
        <FacetChip label="All machines" active={scope === 'all'} count={all.length - toolCount} onClick={() => setScope('all')} />
        <FacetChip label="Tools" active={scope === 'tools'} count={toolCount} onClick={() => setScope('tools')} />
        <Box sx={{ width: 8 }} />
        {[['current', 'In use'], ['setup', 'Setup'], ['live', 'Live'], ['condemn_requested', 'Condemn asked'], ['condemned', 'Condemned']].map(([v, label]) => (
          <FacetChip key={v} label={label} active={stage === v} count={inScope.filter((m) => stageOk(m, v)).length} onClick={() => setStage(v)} />
        ))}
        <Box sx={{ flex: '1 1 260px', maxWidth: 380, minWidth: 0 }}>
          <ClassificationPicker tree={tree.data} scope="machine" leafOnly={false} value={typeId} onChange={setType} label="Machine type or group" />
        </Box>
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={rows} columns={columns} getRowId={(m) => m.id} onRowClick={open} loading={list.loading && !list.data}
        storageKey="machines" exportName="machines" defaultSortKey="code"
        empty={<EmptyState icon={<PrecisionManufacturingRounded />} title={filtered ? 'No machine matches' : 'No machines yet'}
          hint={filtered ? (scope !== 'all' && all.length > 0 && !debounced && !typeId && stage === 'current' ? 'No machine can run an operation yet — set one up on an operation’s machine rules, or show All machines.' : 'Try another search, type or stage. The asset register is under All machines.')
            : types.length === 0 ? 'A machine sits on a machine type — what kind of machine it is. Add the first type, then the machines themselves.'
            : 'Add the machines you have, each on one of your machine types.'}
          action={!filtered && canManage && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button variant={types.length === 0 ? 'contained' : 'outlined'} startIcon={<AccountTreeRounded />} onClick={() => setTypesOpen(true)}>Machine types</Button>
              {canRegister && <Button variant={types.length === 0 ? 'outlined' : 'contained'} onClick={() => setCreating(true)}>New machine</Button>}
            </Box>
          )} />} />
      <MachineDialog open={creating} existing={null} tree={tree.data} onClose={() => setCreating(false)} onTypesChanged={tree.reload}
        onSaved={(m) => { invalidateNavCounts(); toast.success(`${m.code} created.`); open(m); }} />
      <RequestMachineDialog open={requesting} tree={tree.data} onClose={() => setRequesting(false)}
        onSent={(r) => { setRequesting(false); invalidateNavCounts(); toast.success(`${r.requisition.code} sent to Stores${r.createdModel ? ' — the model is in the catalog as a draft' : ''}.`); }} />
      <MachineTypeDialog open={typesOpen} canManage={canManage} onClose={closeTypes} />
      <ClassificationManager open={managing} screen="machines" onClose={() => { setManaging(false); list.reload(); }} onChanged={tree.reload} />
    </Box>
  );
}
