import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, ButtonBase, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import BuildRounded from '@mui/icons-material/BuildRounded';
import ReportProblemRounded from '@mui/icons-material/ReportProblemRounded';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import {
  getBoard, listOrders, listPlans, listDowntimes, deletePlan, deleteDowntime, MAINTENANCE,
  type Board, type BoardMachine, type DowntimeRule, type MaintenanceOrder, type Plan,
} from '../api/maintenance';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { useFullScreen } from '../hooks/useFullScreen';
import { appPath } from '../navMeta';
import { DataTable, type DataColumn } from '../components/DataTable';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader, SkeletonRows, StatStrip } from '../components/ui';
import { FullScreenFrame, FullScreenToggle } from '../components/FullScreen';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/toastContext';
import { DowntimeDialog, NewOrderDialog, PlanDialog, RaiseFaultDialog, type MachineOption } from '../components/Maintenance/MaintenanceDialogs';
import { BOARD_STATUS, MO_STATUS, SOURCE_LABEL, boardOrder, durationText, plainKey, whenText } from '../lib/maintenance';

/**
 * MAINTENANCE (init.sql §82; user decisions 2026-10-18): the Machines board, Maintenance orders, Preventive plans and
 * Planned downtime. Each screen: full screen, keyboard (F = raise a fault, N = new, / = search, R = refresh).
 */

/** Keys of a screen; ignored while typing or with a dialog open. */
function useKeys(map: Record<string, () => void>) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!plainKey(e)) return;
      const fn = ref.current[e.key.toLowerCase()] ?? ref.current[e.key];
      if (fn) { e.preventDefault(); fn(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

const KEYS_HINT = (keys: string) => <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{keys}</Typography>;

const machinesOf = (b: Board | null | undefined): MachineOption[] => (b?.machines ?? []).map((m) => ({ id: m.id, code: m.code, name: m.name }));

/* ================================================================================================
 * MACHINES BOARD
 * ============================================================================================== */

function MachineCard({ m, onOpen, onFault, canFault }: { m: BoardMachine; onOpen: (id: number) => void; onFault: (m: BoardMachine) => void; canFault: boolean }) {
  const s = BOARD_STATUS[m.status];
  const line = m.status === 'down' ? `${m.fault?.code} · down ${durationText(m.downMinutes)}`
    : m.status === 'planned' ? `${m.plannedNow?.reason} until ${whenText(m.plannedNow?.end)}`
      : m.status === 'stopped' ? `${m.stopReason} since ${whenText(m.since)}`
        : m.status === 'running' ? `${m.jobsRunning} job${m.jobsRunning === 1 ? '' : 's'} running` : 'No job on it';
  return (
    <Box data-testid="board-card" data-status={m.status} sx={{
      p: 1.5, borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)', background: 'var(--c-surface)', display: 'grid', gap: 0.75,
      borderLeft: `4px solid var(--c-${s.family}-500, var(--c-border))`, minWidth: 0,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Mono>{m.code}</Mono>
        <Typography noWrap sx={{ fontSize: 13.5, flex: 1, minWidth: 0 }}>{m.name}</Typography>
        <Badge family={s.family} label={s.label} noIcon />
      </Box>
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }} noWrap>{line}</Typography>
      {m.nextPlanned && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }} noWrap>Next planned: {whenText(m.nextPlanned.start)} · {durationText(m.nextPlanned.minutes)} · {m.nextPlanned.reason}</Typography>}
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
        {m.openOrders.map((o) => (
          <ButtonBase key={o.id} onClick={() => onOpen(o.id)} sx={{ fontSize: 12, px: 0.75, py: 0.25, borderRadius: 'var(--r-sm)', background: 'var(--c-primary-50)', color: 'var(--c-primary-800)' }}>
            {o.code} · {MO_STATUS[o.status].label}
          </ButtonBase>
        ))}
        <Box sx={{ flex: 1 }} />
        {canFault && m.status !== 'down' && <Button size="small" color="error" onClick={() => onFault(m)} data-testid="card-fault">Raise a fault</Button>}
      </Box>
    </Box>
  );
}

export default function MaintenanceBoard() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const can = useIsPermitted();
  const canFault = can(MAINTENANCE) || can('cf_erp_floor') || can('cf_erp_production_manage');
  const fs = useFullScreen('maintenance-board');
  const board = useLoad(() => getBoard(), []);
  const [filter, setFilter] = useUrlParam('show', 'all');
  const [fault, setFault] = useState<{ machine: MachineOption | null } | null>(null);
  const openMo = (id: number) => navigate(appPath(company, `maintenance-orders/${id}`));
  useKeys({ f: () => canFault && setFault({ machine: null }), r: board.reload });
  const rows = useMemo(() => boardOrder((board.data?.machines ?? []).filter((m) => filter === 'all' || m.status === filter)), [board.data, filter]);
  const c = board.data?.counts;
  const pick = (k: string) => () => setFilter(filter === k ? 'all' : k);
  return (
    <FullScreenFrame on={fs.on} onExit={() => fs.set(false)}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
        <PageHeader title="Machines" subtitle={<>Running, down, and planned downtime today and coming up. {KEYS_HINT('F raise a fault · R refresh')}</>}
          actions={(
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {canFault && <Button variant="contained" color="error" startIcon={<ReportProblemRounded />} onClick={() => setFault({ machine: null })} data-testid="board-fault">Raise a fault</Button>}
              <Tooltip title="Read again (R)"><span><Button size="small" variant="outlined" startIcon={<RefreshRounded />} onClick={board.reload} disabled={board.loading}>Refresh</Button></span></Tooltip>
              <FullScreenToggle on={fs.on} onToggle={fs.toggle} />
            </Box>
          )} />
        <ErrorNotice error={board.error} onRetry={board.reload} />
        {c && (
          <StatStrip stats={[
            { label: 'Down', value: c.down, tone: 'danger', icon: <ReportProblemRounded />, onClick: pick('down'), hint: 'A fault holds them — no capacity in the plan until closed.' },
            { label: 'Planned downtime now', value: c.planned, tone: 'warning', icon: <EventBusyRounded />, onClick: pick('planned') },
            { label: 'Running', value: c.running, tone: 'success', icon: <BuildRounded />, onClick: pick('running') },
            { label: 'Open maintenance orders', value: c.openOrders, tone: 'info', icon: <ScheduleRounded />, onClick: () => navigate(appPath(company, 'maintenance-orders')) },
          ]} />
        )}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField select size="small" label="Show" value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ width: 220 }}>
            <MenuItem value="all">All machines</MenuItem>
            {(['down', 'planned', 'stopped', 'running', 'idle'] as const).map((k) => <MenuItem key={k} value={k}>{BOARD_STATUS[k].label} ({c?.[k] ?? 0})</MenuItem>)}
          </TextField>
        </Box>
        {board.loading && !board.data ? <SkeletonRows rows={6} /> : (
          <Box data-testid="board-grid" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(auto-fill, minmax(300px, 1fr))' }, gap: 1.25 }}>
            {rows.map((m) => <MachineCard key={m.id} m={m} onOpen={openMo} canFault={canFault} onFault={(x) => setFault({ machine: { id: x.id, code: x.code, name: x.name } })} />)}
          </Box>
        )}
        {board.data && rows.length === 0 && <EmptyState icon={<BuildRounded />} title="No machines here." />}
        {board.data && board.data.planned.length > 0 && (
          <Box data-testid="board-planned">
            <Typography sx={{ fontWeight: 600, mb: 1 }}>Planned downtime — now and the next 14 days</Typography>
            <Box sx={{ display: 'grid', gap: 0.5 }}>
              {board.data.planned.slice(0, 40).map((p) => (
                <Box key={`${p.ruleId}-${p.start}`} sx={{ display: 'grid', gridTemplateColumns: '110px 180px 90px minmax(0, 1fr)', gap: 1, fontSize: 13.5, alignItems: 'baseline' }}>
                  <Mono>{p.machineCode}</Mono>
                  <span>{whenText(p.start)}{p.now ? ' (now)' : ''}</span>
                  <span>{durationText(p.minutes)}</span>
                  <Typography noWrap sx={{ fontSize: 13.5 }}>{p.reason}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}
        <RaiseFaultDialog open={!!fault} machine={fault?.machine ?? null} machines={machinesOf(board.data)} reasons={board.data?.reasons ?? null}
          onClose={() => setFault(null)}
          onDone={(r) => { setFault(null); toast.success(r.message); board.reload(); }} />
      </Box>
    </FullScreenFrame>
  );
}

/* ================================================================================================
 * MAINTENANCE ORDERS
 * ============================================================================================== */

export function MaintenanceOrders() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useIsPermitted()(MAINTENANCE);
  const fs = useFullScreen('maintenance-orders');
  const [status, setStatus] = useUrlParam('status', 'active');
  const [search, setSearch] = useUrlParam('search', '');
  const [typed, setTyped] = useState(search);
  const searchRef = useRef<HTMLInputElement>(null);
  const list = useLoad(() => listOrders({ status, search: search || undefined }), [status, search]);
  const board = useLoad(() => (canManage ? getBoard() : Promise.resolve(null)), [canManage]);
  const [creating, setCreating] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => { if (typed !== search) setSearch(typed); }, 300); return () => window.clearTimeout(t); }, [typed, search, setSearch]);
  useKeys({ n: () => canManage && setCreating(true), '/': () => searchRef.current?.focus(), r: list.reload });
  const open = (r: MaintenanceOrder) => navigate(appPath(company, `maintenance-orders/${r.id}`));
  const columns: DataColumn<MaintenanceOrder>[] = [
    { key: 'code', header: 'MO', sortValue: (r) => r.id, exportValue: (r) => r.code, render: (r) => <Mono>{r.code}</Mono>, alwaysVisible: true },
    { key: 'machine', header: 'Machine', sortValue: (r) => r.machine.code, render: (r) => <><Mono>{r.machine.code}</Mono> <Typography component="span" sx={{ fontSize: 13 }}>{r.machine.name}</Typography></> },
    { key: 'title', header: 'Job', sortValue: (r) => r.title, render: (r) => r.title },
    { key: 'source', header: 'From', sortValue: (r) => r.source, render: (r) => SOURCE_LABEL[r.source] },
    { key: 'status', header: 'Status', sortValue: (r) => r.status, exportValue: (r) => r.statusLabel, render: (r) => <Badge family={MO_STATUS[r.status].family} label={r.falseAlarm ? 'False alarm' : MO_STATUS[r.status].label} noIcon /> },
    { key: 'down', header: 'Machine', sortValue: (r) => (r.machineDown ? 0 : 1), render: (r) => (r.machineDown ? <Badge family="danger" label="Down" noIcon /> : '—') },
    { key: 'raised', header: 'Raised', sortValue: (r) => r.raisedAt, render: (r) => whenText(r.raisedAt) },
    { key: 'downtime', header: 'Downtime', numeric: true, sortValue: (r) => r.downtimeMinutes ?? -1, render: (r) => durationText(r.downtimeMinutes) },
    { key: 'mr', header: 'MRs', sortValue: (r) => r.requisitions.length, render: (r) => r.requisitions.map((x) => x.code).join(', ') || '—', defaultHidden: true },
  ];
  return (
    <FullScreenFrame on={fs.on} onExit={() => fs.set(false)}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
        <PageHeader title="Maintenance orders" subtitle={<>Raised by a fault, by a preventive plan, or by maintenance. {KEYS_HINT('N new · / search · R refresh')}</>}
          actions={(
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField select size="small" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ width: 170 }} inputProps={{ 'aria-label': 'Status' }}>
                <MenuItem value="active">Open (not done)</MenuItem>
                <MenuItem value="waiting_parts">Waiting for parts</MenuItem>
                <MenuItem value="done">Done</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
                <MenuItem value="all">All</MenuItem>
              </TextField>
              <TextField size="small" placeholder="Search" value={typed} onChange={(e) => setTyped(e.target.value)} inputRef={searchRef} inputProps={{ 'aria-label': 'Search maintenance orders' }} />
              {canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)} data-testid="mo-new">New</Button>}
              <FullScreenToggle on={fs.on} onToggle={fs.toggle} />
            </Box>
          )} />
        <ErrorNotice error={list.error} onRetry={list.reload} />
        <DataTable rows={list.data?.rows ?? []} columns={columns} getRowId={(r) => r.id} loading={list.loading && !list.data} storageKey="maintenance-orders" exportName="maintenance-orders"
          onRowClick={open} defaultSortKey="code" defaultSortDir="desc"
          empty={<EmptyState icon={<BuildRounded />} title={status === 'active' ? 'No open maintenance orders.' : 'None.'} />} />
        <NewOrderDialog open={creating} machines={machinesOf(board.data)} onClose={() => setCreating(false)}
          onDone={(o) => { setCreating(false); toast.success(`${o.code} raised.`); navigate(appPath(company, `maintenance-orders/${o.id}`)); }} />
      </Box>
    </FullScreenFrame>
  );
}

/* ================================================================================================
 * PREVENTIVE PLANS
 * ============================================================================================== */

export function MaintenancePlans() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useIsPermitted()(MAINTENANCE);
  const fs = useFullScreen('maintenance-plans');
  const list = useLoad(() => listPlans(), []);
  const board = useLoad(() => (canManage ? getBoard() : Promise.resolve(null)), [canManage]);
  const [editing, setEditing] = useState<{ plan: Plan | null } | null>(null);
  const [removing, setRemoving] = useState<Plan | null>(null);
  useKeys({ n: () => canManage && setEditing({ plan: null }), r: list.reload });
  useEffect(() => { if (list.data?.raised) toast.info(`${list.data.raised} preventive order${list.data.raised === 1 ? '' : 's'} raised — the plans are due.`); }, [list.data?.raised, toast]);
  const every = (p: Plan) => [p.everyDays != null ? `${p.everyDays} days` : null, p.everyRunHours != null ? `${p.everyRunHours} run h` : null, p.everyTonnes != null ? `${p.everyTonnes} t` : null].filter(Boolean).join(' / ');
  const since = (p: Plan) => [p.everyDays != null ? `${p.since.days} d` : null, p.everyRunHours != null ? `${p.since.runHours} h` : null, p.everyTonnes != null ? `${p.since.tonnes} t` : null].filter(Boolean).join(' / ');
  const columns: DataColumn<Plan>[] = [
    { key: 'machine', header: 'Machine', sortValue: (r) => r.machine.code, render: (r) => <Mono>{r.machine.code}</Mono>, alwaysVisible: true },
    { key: 'title', header: 'Job', sortValue: (r) => r.title, render: (r) => r.title },
    { key: 'every', header: 'Every', sortValue: (r) => every(r), render: every },
    { key: 'since', header: 'Since last done', sortValue: (r) => since(r), render: since },
    { key: 'progress', header: 'Due', numeric: true, sortValue: (r) => r.progressPct,
      render: (r) => (r.status !== 'active' ? 'Off' : r.due ? <Badge family="danger" label="Due" noIcon /> : `${r.progressPct} %${r.nextDueOn ? ` · ${r.nextDueOn}` : ''}`) },
    { key: 'order', header: 'Open order', sortValue: (r) => r.openOrder?.code ?? '',
      render: (r) => (r.openOrder ? <ButtonBase onClick={(e) => { e.stopPropagation(); navigate(appPath(company, `maintenance-orders/${r.openOrder!.id}`)); }} sx={{ color: 'var(--c-primary-700)', fontSize: 13 }}>{r.openOrder.code}</ButtonBase> : '—') },
  ];
  return (
    <FullScreenFrame on={fs.on} onExit={() => fs.set(false)}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
        <PageHeader title="Preventive plans" subtitle={<>Every N days, run hours or tonnes (hours and tonnes from the machine log). A due plan opens a maintenance order by itself. {KEYS_HINT('N new')}</>}
          actions={(
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setEditing({ plan: null })} data-testid="plan-new">New plan</Button>}
              <FullScreenToggle on={fs.on} onToggle={fs.toggle} />
            </Box>
          )} />
        <ErrorNotice error={list.error} onRetry={list.reload} />
        <DataTable rows={list.data?.rows ?? []} columns={columns} getRowId={(r) => r.id} loading={list.loading && !list.data} storageKey="maintenance-plans" exportName="preventive-plans"
          onRowClick={canManage ? (r) => setEditing({ plan: r }) : undefined}
          rowActions={canManage ? (r) => <Button size="small" color="error" onClick={(e) => { e.stopPropagation(); setRemoving(r); }}>Remove</Button> : undefined}
          empty={<EmptyState icon={<ScheduleRounded />} title="No preventive plans yet." hint="Add one: e.g. lubricate the gantry every 30 days." />} />
        <PlanDialog open={!!editing} plan={editing?.plan ?? null} machines={machinesOf(board.data)} onClose={() => setEditing(null)}
          onDone={(msg) => { setEditing(null); toast.success(msg); list.reload(); }} />
        <ConfirmDialog open={!!removing} title={`Remove ${removing?.title ?? ''}?`} body="No more orders are raised from it. Orders already raised stay." confirmLabel="Remove" danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => { await deletePlan(removing!.id); list.reload(); }} />
      </Box>
    </FullScreenFrame>
  );
}

/* ================================================================================================
 * PLANNED DOWNTIME
 * ============================================================================================== */

export function PlannedDowntime() {
  const toast = useToast();
  const canManage = useIsPermitted()(MAINTENANCE);
  const fs = useFullScreen('planned-downtime');
  const [machine, setMachine] = useUrlParam('machine', '');
  const list = useLoad(() => listDowntimes(machine ? Number(machine) : undefined), [machine]);
  const board = useLoad(() => getBoard(), []);
  const [editing, setEditing] = useState<{ rule: DowntimeRule | null } | null>(null);
  const [removing, setRemoving] = useState<DowntimeRule | null>(null);
  useKeys({ n: () => canManage && setEditing({ rule: null }), r: list.reload });
  const today = list.data?.today ?? board.data?.today ?? new Date().toISOString().slice(0, 10);
  const columns: DataColumn<DowntimeRule>[] = [
    { key: 'machine', header: 'Machine', sortValue: (r) => r.machineCode ?? '', render: (r) => <><Mono>{r.machineCode}</Mono> <Typography component="span" sx={{ fontSize: 13 }}>{r.machineName}</Typography></>, alwaysVisible: true },
    { key: 'when', header: 'When', sortValue: (r) => r.text, render: (r) => r.text },
    { key: 'reason', header: 'Reason', sortValue: (r) => r.reason, render: (r) => r.reason },
    { key: 'range', header: 'From – until', sortValue: (r) => r.startsOn, render: (r) => (r.kind === 'once' ? '—' : `${r.startsOn} – ${r.endsOn ?? 'no end'}`) },
    { key: 'next', header: 'Next', sortValue: (r) => r.next?.[0]?.start ?? '', render: (r) => (r.next?.length ? r.next.map((o) => whenText(o.start)).join(' · ') : 'None coming') },
  ];
  return (
    <FullScreenFrame on={fs.on} onExit={() => fs.set(false)}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
        <PageHeader title="Planned downtime" subtitle={<>Written into each machine's calendar — the plan gives it no work in these hours. {KEYS_HINT('N new')}</>}
          actions={(
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField select size="small" label="Machine" value={machine} onChange={(e) => setMachine(e.target.value)} sx={{ width: 220 }}>
                <MenuItem value="">All machines</MenuItem>
                {machinesOf(board.data).map((m) => <MenuItem key={m.id} value={String(m.id)}>{m.code} · {m.name}</MenuItem>)}
              </TextField>
              {canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setEditing({ rule: null })} data-testid="dt-new">New</Button>}
              <FullScreenToggle on={fs.on} onToggle={fs.toggle} />
            </Box>
          )} />
        <ErrorNotice error={list.error} onRetry={list.reload} />
        <DataTable rows={list.data?.rows ?? []} columns={columns} getRowId={(r) => r.id} loading={list.loading && !list.data} storageKey="planned-downtime" exportName="planned-downtime"
          onRowClick={canManage ? (r) => setEditing({ rule: r }) : undefined}
          rowActions={canManage ? (r) => <Button size="small" color="error" onClick={(e) => { e.stopPropagation(); setRemoving(r); }}>Remove</Button> : undefined}
          empty={<EmptyState icon={<EventBusyRounded />} title="No planned downtime." hint='e.g. "every 1st Sunday, 8 h" for preventive maintenance.' />} />
        <DowntimeDialog open={!!editing} rule={editing?.rule ?? null} today={today} machines={machinesOf(board.data)} machineId={machine ? Number(machine) : null}
          onClose={() => setEditing(null)} onDone={(msg) => { setEditing(null); toast.success(msg); list.reload(); }} />
        <ConfirmDialog open={!!removing} title="Remove this planned downtime?" body="The machine's calendar gets those hours back from today on. The past stays as it was." confirmLabel="Remove" danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => { await deleteDowntime(removing!.id); list.reload(); }} />
      </Box>
    </FullScreenFrame>
  );
}
