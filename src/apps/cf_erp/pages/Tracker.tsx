import { useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import { cfApi } from '../api/client';
import type { ProductionStep, TrackerMaterialRow, TrackerStepRow } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { STEP_FILTERS, STEP_STATUS_LABEL, progressText } from '../lib/tracker';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip, Surface } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { DetailTabs } from '../components/DetailLayout';
import { StepStatusBadge } from '../components/trackerUi';
import { RequirementsTable, StepActions } from '../components/ReleaseView';
import { ProgressDialog, StartStepDialog } from '../components/TrackerDialogs';
import { PromptDialog } from '../components/PromptDialog';
import { useToast } from '../components/toastContext';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };
const matches = (s: TrackerStepRow, term: string) => !term || [s.piece.label, s.order.code, s.operation.code, s.operation.name, s.machine?.code].some((v) => v?.toLowerCase().includes(term));
const statusTest = (value: string) => (s: TrackerStepRow) => (value === 'all' ? true : value === 'open' ? s.status !== 'done' : s.status === value);
/** What can be worked on comes first: running, then ready, then held, then waiting, then done. */
const PRIORITY: Record<string, number> = { in_progress: 0, ready: 1, on_hold: 2, not_ready: 3, done: 4 };

/**
 * The production tracker (Phase 5): every step of every released line, what
 * it waits for, and the material it needs. Ready means everything it waits
 * for is done and its material is reserved — the shop floor's work queue.
 */
export default function Tracker() {
  const company = useCompanySlug();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canProduce = isPermitted('cf_erp_production_manage');
  const canStock = isPermitted('cf_erp_inventory_manage');
  const [view, setView] = useUrlParam('view', 'steps');
  const [status, setStatus] = useUrlParam('status', 'open');
  const [showAll, setShowAll] = useUrlParam('show', 'short');
  const [search, setSearch] = useState('');
  const [starting, setStarting] = useState<ProductionStep | null>(null);
  const [recording, setRecording] = useState<ProductionStep | null>(null);
  const [holding, setHolding] = useState<ProductionStep | null>(null);
  const steps = useLoad(() => cfApi.get<TrackerStepRow[]>('/tracker/steps?status=all'), []);
  const mats = useLoad(() => cfApi.get<TrackerMaterialRow[]>('/tracker/materials?show=all'), []);
  const term = search.trim().toLowerCase();
  const base = useMemo(() => (steps.data ?? []).filter((s) => matches(s, term)).map((s, i) => ({ s, i }))
    .sort((a, b) => PRIORITY[a.s.status] - PRIORITY[b.s.status] || a.i - b.i).map(({ s }) => s), [steps.data, term]);
  const rows = useMemo(() => base.filter(statusTest(status)), [base, status]);
  const matRows = useMemo(() => (mats.data ?? []).filter((m) => (showAll === 'all' || !m.covered) && (!term || [m.item.code, m.item.name, m.order.code, m.step?.label].some((v) => v?.toLowerCase().includes(term)))), [mats.data, showAll, term]);
  const reload = () => { steps.reload(); mats.reload(); invalidateNavCounts(); };
  const done = (msg: string) => () => { toast.success(msg); reload(); };
  const count = (st: string) => base.filter(statusTest(st)).length;

  const columns: DataColumn<TrackerStepRow>[] = [
    {
      key: 'step', header: 'Step', alwaysVisible: true, sortValue: (s) => s.label,
      render: (s) => (
        <Box sx={{ py: 0.5, minWidth: 180 }}>
          <Box sx={{ fontWeight: 500, whiteSpace: 'normal' }}>{s.operation.name} <Mono muted>{s.operation.code}</Mono></Box>
          <Mono muted sx={{ whiteSpace: 'normal' }}>{s.piece.label}</Mono>
        </Box>
      ),
    },
    { key: 'order', header: 'Order', sortValue: (s) => s.order.code, render: (s) => <Mono><Box component={Link} to={appPath(company, `orders/${s.order.id}?tab=production`)} sx={linkSx}>{s.order.code}</Box></Mono> },
    { key: 'status', header: 'Status', sortValue: (s) => s.status, exportValue: (s) => STEP_STATUS_LABEL[s.status], render: (s) => <StepStatusBadge status={s.status} /> },
    { key: 'progress', header: 'Done', numeric: true, sortValue: (s) => s.qtyGood / (s.quantity || 1), render: (s) => <Mono muted>{progressText(s.qtyGood, s.quantity) || '—'}</Mono> },
    {
      key: 'why', header: 'Waiting for / on', exportValue: (s) => s.blockers.map((b) => b.text).join(' '),
      render: (s) => (
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal', minWidth: 200 }}>
          {s.status === 'not_ready' ? s.blockers.map((b) => b.text).join(' ') : s.machine ? `On ${s.machine.code}` : '—'}
        </Typography>
      ),
    },
    { key: 'line', header: 'Line', defaultHidden: true, render: (s) => <Mono muted>{s.line.lineNo}</Mono>, sortValue: (s) => s.line.lineNo },
  ];

  const shortCount = (mats.data ?? []).filter((m) => !m.covered).length;
  const stats = [
    { label: 'Ready', value: count('ready'), tone: 'success' as const, hint: 'Everything they wait for is done and their material is reserved', onClick: () => { setView('steps'); setStatus('ready'); } },
    { label: 'In progress', value: count('in_progress'), tone: 'info' as const, onClick: () => { setView('steps'); setStatus('in_progress'); } },
    { label: 'Waiting', value: count('not_ready'), hint: 'For earlier steps, other pieces or material', onClick: () => { setView('steps'); setStatus('not_ready'); } },
    { label: 'Material short', value: shortCount, tone: 'warning' as const, onClick: () => { setView('material'); setShowAll('short'); } },
  ];

  return (
    <Box>
      <PageHeader title="Tracker" subtitle="Every released step, what it waits for, and the material it needs. Ready means everything it waits for is done and its material is reserved." />
      <StatStrip stats={stats} />
      <DetailTabs active={view} onTab={setView}
        tabs={[{ value: 'steps', label: 'Steps', count: count('open') }, { value: 'material', label: 'Material', count: shortCount }]} />
      {view === 'steps' ? (
        <>
          <FilterBar search={search} onSearch={setSearch} placeholder="Search piece, order, operation or machine">
            {STEP_FILTERS.map((f) => <FacetChip key={f.value} label={f.label} active={status === f.value} count={count(f.value)} onClick={() => setStatus(f.value)} />)}
          </FilterBar>
          <ErrorNotice error={steps.error} onRetry={steps.reload} />
          <DataTable rows={rows} columns={columns} getRowId={(s) => s.id} loading={steps.loading && !steps.data} storageKey="tracker-steps" exportName="tracker-steps"
            rowActions={canProduce ? (s) => (
              <StepActions step={s} onStart={() => setStarting(s)} onRecord={() => setRecording(s)} onHold={() => setHolding(s)}
                onResume={async () => { try { await cfApi.post(`/production-steps/${s.id}/resume`, {}); done('Resumed.')(); } catch (e) { toast.error((e as Error).message); } }} />
            ) : undefined}
            empty={<EmptyState icon={<PrecisionManufacturingRounded />} title={(steps.data ?? []).length ? 'No step matches' : 'Nothing released yet'}
              hint={(steps.data ?? []).length ? 'Pick another status or clear the search.' : 'Release a line of a confirmed order — its steps appear here.'} />} />
        </>
      ) : (
        <>
          <FilterBar search={search} onSearch={setSearch} placeholder="Search material, order or step">
            <FacetChip label="Still to reserve" active={showAll !== 'all'} count={shortCount} onClick={() => setShowAll('short')} />
            <FacetChip label="All" active={showAll === 'all'} count={(mats.data ?? []).length} onClick={() => setShowAll('all')} />
          </FilterBar>
          <ErrorNotice error={mats.error} onRetry={mats.reload} />
          {matRows.length === 0 && !mats.loading ? (
            <EmptyState icon={<LockRounded />} title={showAll === 'all' ? 'No material on released work' : 'Nothing left to reserve'}
              hint={showAll === 'all' ? 'Released lines that consume bought items list them here.' : 'Every step that needs material has it reserved or issued.'} />
          ) : (
            <Surface e={1} sx={{ overflow: 'hidden' }}>
              <RequirementsTable rows={matRows} canStock={canStock} showOrder onChange={reload} />
            </Surface>
          )}
        </>
      )}
      <StartStepDialog step={starting} onClose={() => setStarting(null)} onDone={done('Started.')} />
      <ProgressDialog step={recording} onClose={() => setRecording(null)} onDone={done('Recorded.')} />
      <PromptDialog open={!!holding} title="Put this step on hold?" label="Why" confirmLabel="Hold" body={holding?.label}
        onClose={() => setHolding(null)}
        onConfirm={async (note) => { await cfApi.post(`/production-steps/${holding?.id}/hold`, { note }); done('On hold.')(); }} />
    </Box>
  );
}
