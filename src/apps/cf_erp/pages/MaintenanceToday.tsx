import { useEffect, useMemo, useState } from 'react';
import { Box, Button, ButtonBase, MenuItem, Tab, Tabs, TextField, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import BuildRounded from '@mui/icons-material/BuildRounded';
import ReportProblemRounded from '@mui/icons-material/ReportProblemRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import PersonOffRounded from '@mui/icons-material/PersonOffRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import {
  assignOrder, getBoard, getMachineHealth, getMaintenanceToday, getToolRules, reviewWear, setNoPlan, setToolRule, MAINTENANCE,
  type HealthRow, type MaintenanceOrder, type NoPlanMachine, type ToolRule, type WearRow,
} from '../api/maintenance';
import { listAlerts, ackAlert, SEV_INK, type Alert } from '../api/alerts';
import { CfApiError } from '../api/client';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { rupeeText } from '../lib/money';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader, SectionCard, SkeletonRows, StatStrip } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FormDialog } from '../components/FormDialog';
import { PromptDialog } from '../components/PromptDialog';
import { useToast } from '../components/toastContext';
import { PlanDialog } from '../components/Maintenance/MaintenanceDialogs';
import { MO_STATUS, durationText, whenText } from '../lib/maintenance';

/**
 * MAINTENANCE TODAY (init.sql §114; user 2026-11-20: "consolidate as much as you can"). One page to work from:
 *   To clear        alerts, the open tickets (breakdowns, preventive jobs, set-ups of new machines) with owner and target,
 *                   machines with no cycle, spares the store is short of, worn-out and lost tools to read.
 *   Machine health  a row a machine: breakdowns, hours down, repair time, cost, preventive jobs on time.
 *   Tool rules      a tool's life and what Stores checks before giving it out.
 * Nothing is kept here: it reads the tickets, the alerts, the preventive plans and the store's stock.
 */
const KIND: Record<string, string> = { fault: 'Breakdown', preventive: 'Preventive', manual: 'Job', setup: 'Set-up' };
const linkSx = { color: 'var(--c-primary-700)', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } };
const rowSx = { display: 'grid', gap: 1, alignItems: 'center', py: 1, borderTop: '1px solid var(--c-border)', minWidth: 0 };

function dueText(t: MaintenanceOrder) {
  if (!t.dueAt) return '—';
  if (t.late) return `Late by ${durationText(t.lateMinutes)}`;
  return `${durationText(t.minutesLeft)} left`;
}

/** Owner and due time of one ticket. */
function AssignDialog({ ticket, people, onClose, onDone }: { ticket: MaintenanceOrder | null; people: { id: number; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [owner, setOwner] = useState<number | ''>('');
  const [due, setDue] = useState('');
  useEffect(() => { if (ticket) { setOwner(ticket.owner?.id ?? ''); setDue(ticket.dueAt ? ticket.dueAt.slice(0, 16).replace(' ', 'T') : ''); } }, [ticket]);
  return (
    <FormDialog open={!!ticket} title={ticket ? `${ticket.code} · owner and due time` : ''} subtitle={ticket ? `${ticket.machine.code} · ${ticket.title}` : undefined} onClose={onClose}
      onSubmit={async () => { await assignOrder(ticket!.id, { ownerUserId: owner === '' ? null : owner, ...(due ? { dueAt: due.replace('T', ' ') } : {}) }); onDone(); }}>
      <TextField select label="Owner" value={owner} onChange={(e) => setOwner(e.target.value === '' ? '' : Number(e.target.value))} inputProps={{ 'data-testid': 'assign-owner' }}>
        <MenuItem value="">Nobody yet</MenuItem>
        {people.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
      </TextField>
      <TextField label="Due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} InputLabelProps={{ shrink: true }} helperText="Set from the target hours of its kind (Setup › Settings). Move it only when you know better." />
    </FormDialog>
  );
}

function ToClear({ canManage }: { canManage: boolean }) {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const today = useLoad(() => getMaintenanceToday(), []);
  const alerts = useLoad(() => listAlerts({ department: 'maintenance' }), []);
  const board = useLoad(() => (canManage ? getBoard() : Promise.resolve(null)), [canManage]);
  const [show, setShow] = useUrlParam('show', 'all');
  const [assigning, setAssigning] = useState<MaintenanceOrder | null>(null);
  const [planFor, setPlanFor] = useState<NoPlanMachine | null>(null);
  const [noneFor, setNoneFor] = useState<NoPlanMachine | null>(null);
  const [reading, setReading] = useState<WearRow | null>(null);
  const d = today.data;
  const reload = () => { today.reload(); alerts.reload(); };
  const tickets = useMemo(() => (d?.tickets ?? []).filter((t) => show === 'all' || (show === 'late' && t.late) || (show === 'down' && t.machineDown)
    || (show === 'parts' && t.status === 'waiting_parts') || (show === 'noowner' && !t.owner) || (show === 'setup' && t.source === 'setup')), [d, show]);
  const pick = (k: string) => () => setShow(show === k ? 'all' : k);
  const ack = async (a: Alert) => { try { await ackAlert(a.id); alerts.reload(); } catch (e) { toast.error((e as CfApiError).message); } };
  if (today.error) return <ErrorNotice error={today.error} onRetry={today.reload} />;
  if (!d) return <SkeletonRows rows={8} />;
  const c = d.counts;
  const open = (alerts.data?.alerts ?? []).filter((a) => a.status !== 'resolved');
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
      <StatStrip stats={[
        { label: 'Open tickets', value: c.open, tone: 'info', icon: <BuildRounded />, onClick: pick('all') },
        { label: 'Past target', value: c.late, tone: 'danger', icon: <ScheduleRounded />, onClick: pick('late'), hint: 'Open longer than the target hours of their kind.' },
        { label: 'Machines down', value: c.down, tone: 'danger', icon: <ReportProblemRounded />, onClick: pick('down') },
        { label: 'Waiting for parts', value: c.waitingParts, tone: 'warning', icon: <Inventory2Rounded />, onClick: pick('parts') },
        { label: 'No owner', value: c.noOwner, tone: 'warning', icon: <PersonOffRounded />, onClick: pick('noowner') },
      ]} />

      {open.length > 0 && (
        <SectionCard title={`Alerts (${open.length})`}>
          <Box sx={{ px: 2, pb: 1 }} data-testid="mt-alerts">
            {open.slice(0, 12).map((a) => (
              <Box key={a.id} sx={{ ...rowSx, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) auto' }, borderLeft: `3px solid ${SEV_INK[a.severity]}`, pl: 1.25 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{a.title}</Typography>
                  {a.detail && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{a.detail}</Typography>}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {a.link && a.link !== 'maintenance-today' && <Button size="small" onClick={() => navigate(appPath(company, a.link!))}>Open</Button>}
                  {a.status === 'open' ? <Button size="small" onClick={() => void ack(a)}>Seen</Button> : <Badge family="neutral" label="Seen" noIcon />}
                </Box>
              </Box>
            ))}
          </Box>
        </SectionCard>
      )}

      <SectionCard title={`Tickets (${tickets.length}${show === 'all' ? '' : ` of ${c.open}`})`}
        subtitle={`Target: breakdown ${d.targets.fault} h · preventive ${d.targets.preventive} h · set-up ${d.targets.setup} h · other ${d.targets.manual} h`}
        actions={<Box sx={{ display: 'flex', gap: 1 }}>
          <TextField select size="small" value={show} onChange={(e) => setShow(e.target.value)} sx={{ width: 190 }} inputProps={{ 'aria-label': 'Show tickets' }}>
            <MenuItem value="all">All open</MenuItem>
            <MenuItem value="late">Past target ({c.late})</MenuItem>
            <MenuItem value="down">Machine down ({c.down})</MenuItem>
            <MenuItem value="parts">Waiting for parts ({c.waitingParts})</MenuItem>
            <MenuItem value="noowner">No owner ({c.noOwner})</MenuItem>
            <MenuItem value="setup">Set-ups of new machines ({c.setups})</MenuItem>
          </TextField>
          <Button size="small" onClick={() => navigate(appPath(company, 'maintenance-orders'))}>All orders</Button>
        </Box>}>
        <Box sx={{ px: 2, pb: 1 }} data-testid="mt-tickets">
          {tickets.length === 0 && <EmptyState icon={<BuildRounded />} title={show === 'all' ? 'No open tickets.' : 'None.'} />}
          {tickets.map((t) => (
            <Box key={t.id} data-testid="mt-ticket" sx={{ ...rowSx, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '110px minmax(0, 1.6fr) 110px minmax(0, 1fr) 150px auto' } }}>
              <ButtonBase onClick={() => navigate(appPath(company, `maintenance-orders/${t.id}`))} sx={{ justifyContent: 'flex-start', color: 'var(--c-primary-700)' }}><Mono>{t.code}</Mono></ButtonBase>
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 14 }}><Mono>{t.machine.code}</Mono> {t.title}</Typography>
                <Typography noWrap sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{KIND[t.source]} · raised {whenText(t.raisedAt)}{t.machineDown ? ` · machine down ${durationText(t.downtimeMinutes)}` : ''}</Typography>
              </Box>
              <Box><Badge family={MO_STATUS[t.status].family} label={MO_STATUS[t.status].label} noIcon /></Box>
              <Typography noWrap sx={{ fontSize: 13.5, color: t.owner ? 'inherit' : 'var(--c-warning-700, var(--c-text-2))' }}>{t.owner?.name ?? 'No owner'}</Typography>
              <Box>{t.late ? <Badge family="danger" label={dueText(t)} noIcon /> : <Typography sx={{ fontSize: 13.5 }}>{dueText(t)}</Typography>}</Box>
              {canManage ? <Button size="small" onClick={() => setAssigning(t)} data-testid="mt-assign">{t.owner ? 'Change' : 'Give to'}</Button> : <span />}
            </Box>
          ))}
        </Box>
      </SectionCard>

      <SectionCard title={`Machines with no maintenance cycle (${d.noPlan.length})`} subtitle="Every machine has a cycle, or a reason for having none.">
        <Box sx={{ px: 2, pb: 1 }} data-testid="mt-noplan">
          {d.noPlan.length === 0 && <Typography sx={{ py: 1.5, fontSize: 13.5, color: 'var(--c-text-2)' }}>Every live machine is covered.</Typography>}
          {d.noPlan.map((m) => (
            <Box key={m.id} sx={{ ...rowSx, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) auto' } }}>
              <Typography noWrap sx={{ fontSize: 14 }}><Mono>{m.code}</Mono> {m.name}{m.owner ? <span style={{ color: 'var(--c-text-2)' }}> · {m.owner}</span> : null}</Typography>
              {canManage && <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" variant="outlined" onClick={() => setPlanFor(m)} data-testid="mt-set-cycle">Set a cycle</Button>
                <Button size="small" onClick={() => setNoneFor(m)}>Needs none</Button>
              </Box>}
            </Box>
          ))}
        </Box>
      </SectionCard>

      <SectionCard title={`Machine spares the store is short of (${d.spares.length})`} subtitle="From the spares list of each machine, against the store's stock and the item's minimum.">
        <Box sx={{ px: 2, pb: 1 }} data-testid="mt-spares">
          {d.spares.length === 0 && <Typography sx={{ py: 1.5, fontSize: 13.5, color: 'var(--c-text-2)' }}>Nothing short. A machine's spares are listed on its page (Machine register).</Typography>}
          {d.spares.map((s) => (
            <Box key={s.item.id} sx={{ ...rowSx, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1.4fr) 170px minmax(0, 1fr)' } }}>
              <Typography noWrap sx={{ fontSize: 14 }}>{s.item.name}</Typography>
              <Box>{s.stock <= 0 ? <Badge family="danger" label="None in the store" noIcon /> : <Typography sx={{ fontSize: 13.5 }}>{s.stock} {s.item.uom} · minimum {s.min}</Typography>}
                {s.noMinimum && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>No minimum set</Typography>}</Box>
              <Typography noWrap sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>For {s.machines}</Typography>
            </Box>
          ))}
        </Box>
      </SectionCard>

      <SectionCard title={`Tools worn out or lost — to read (${d.wear.length})`} subtitle="Recorded by Stores on Out with. Read each: fair wear, wrong use, or a bad batch.">
        <Box sx={{ px: 2, pb: 1 }} data-testid="mt-wear">
          {d.wear.length === 0 && <Typography sx={{ py: 1.5, fontSize: 13.5, color: 'var(--c-text-2)' }}>Nothing to read.</Typography>}
          {d.wear.map((w) => (
            <Box key={w.id} sx={{ ...rowSx, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.4fr) minmax(0, 1fr) 190px auto' } }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 14 }}>{w.quantity} {w.item.uom} · {w.item.name}</Typography>
                <Typography noWrap sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{w.kind === 'lost' ? 'Lost' : 'Worn out'} {String(w.at).slice(0, 10)}{w.note ? ` · Stores: ${w.note}` : ''}</Typography>
              </Box>
              <Typography noWrap sx={{ fontSize: 13.5 }}>{w.wasWith ?? '—'}{w.machine ? ` · ${w.machine}` : ''}{w.order ? ` · ${w.order}` : ''}</Typography>
              <Box>{w.early ? <Badge family="danger" label={`${w.daysUsed} of ${w.lifeDays} days — early`} noIcon />
                : <Typography sx={{ fontSize: 13.5 }}>{w.daysUsed} days{w.lifeDays ? ` of ${w.lifeDays}` : ' · no life set'}</Typography>}</Box>
              {canManage ? <Button size="small" onClick={() => setReading(w)} data-testid="mt-wear-read">Mark read</Button> : <span />}
            </Box>
          ))}
        </Box>
      </SectionCard>

      <AssignDialog ticket={assigning} people={d.people} onClose={() => setAssigning(null)} onDone={() => { setAssigning(null); toast.success('Saved.'); reload(); }} />
      <PlanDialog open={!!planFor} plan={null} presetMachineId={planFor?.id ?? null}
        machines={board.data?.machines.map((m) => ({ id: m.id, code: m.code, name: m.name })) ?? (planFor ? [{ id: planFor.id, code: planFor.code, name: planFor.name }] : [])}
        onClose={() => setPlanFor(null)} onDone={(msg) => { setPlanFor(null); toast.success(msg); reload(); }} />
      <PromptDialog open={!!noneFor} title={`${noneFor?.code ?? ''} needs no maintenance cycle?`} body="It leaves this list. The reason is kept on the machine and shown under Machine health." label="Why does it need none?"
        confirmLabel="Needs none" onClose={() => setNoneFor(null)}
        onConfirm={async (note) => { await setNoPlan(noneFor!.id, note); setNoneFor(null); reload(); }} />
      <PromptDialog open={!!reading} title={`${reading?.item.name ?? ''}: what did you find?`} body={reading ? `${reading.kind === 'lost' ? 'Lost' : 'Worn out'} after ${reading.daysUsed} days${reading.wasWith ? `, was with ${reading.wasWith}` : ''}.` : undefined}
        label="Fair wear, wrong use, a bad batch…" confirmLabel="Mark read" onClose={() => setReading(null)}
        onConfirm={async (note) => { await reviewWear(reading!.id, note); setReading(null); reload(); }} />
    </Box>
  );
}

function Health() {
  const company = useCompanySlug();
  const h = useLoad(() => getMachineHealth(), []);
  const cycle = (r: HealthRow) => (r.cycle === 'set' ? (r.preventiveDue ? <Badge family="warning" label={`${r.preventiveDue} due`} noIcon /> : <Badge family="success" label="Set" noIcon />)
    : r.cycle === 'none_needed' ? <span title={r.noPlanReason ?? ''}>Needs none</span> : <Badge family="danger" label="No cycle" noIcon />);
  const columns: DataColumn<HealthRow>[] = [
    { key: 'machine', header: 'Machine', sortValue: (r) => r.code, exportValue: (r) => `${r.code} ${r.name}`, alwaysVisible: true,
      render: (r) => <Box component={Link} to={appPath(company, `machines/${r.id}`)} sx={linkSx}><Mono>{r.code}</Mono> <Typography component="span" sx={{ fontSize: 13 }}>{r.name}</Typography></Box> },
    { key: 'faults', header: 'Breakdowns', numeric: true, sortValue: (r) => r.faults, render: (r) => r.faults || '—' },
    { key: 'down', header: 'Hours down', numeric: true, sortValue: (r) => r.downHours, render: (r) => r.downHours || '—' },
    { key: 'repair', header: 'Avg repair (h)', numeric: true, sortValue: (r) => r.repairHours ?? -1, render: (r) => r.repairHours ?? '—' },
    { key: 'between', header: 'Days between breakdowns', numeric: true, sortValue: (r) => r.daysBetweenFaults ?? 99999, render: (r) => r.daysBetweenFaults ?? '—' },
    { key: 'cost', header: 'Cost', numeric: true, sortValue: (r) => r.cost, render: (r) => (r.cost ? rupeeText(r.cost, 0) : '—') },
    { key: 'pm', header: 'Preventive on time', numeric: true, sortValue: (r) => r.preventiveOnTimePct ?? -1, render: (r) => (r.preventiveDone ? `${r.preventiveOnTimePct}% of ${r.preventiveDone}` : '—') },
    { key: 'cycle', header: 'Cycle', sortValue: (r) => r.cycle, exportValue: (r) => r.cycle, render: cycle },
    { key: 'open', header: 'Open tickets', numeric: true, sortValue: (r) => r.openTickets, render: (r) => r.openTickets || '—' },
    { key: 'owner', header: 'Owner', sortValue: (r) => r.owner ?? '', render: (r) => r.owner ?? '—', defaultHidden: true },
  ];
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}>
      <ErrorNotice error={h.error} onRetry={h.reload} />
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>The last {h.data?.days ?? 90} days, worst first. The period is a company setting.</Typography>
      <DataTable rows={h.data?.rows ?? []} columns={columns} getRowId={(r) => r.id} loading={h.loading && !h.data} storageKey="maintenance-health" exportName="machine-health"
        defaultSortKey="faults" defaultSortDir="desc" empty={<EmptyState icon={<BuildRounded />} title="No live machines." />} />
    </Box>
  );
}

function ToolRules({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [typed, setTyped] = useState('');
  useEffect(() => { const t = window.setTimeout(() => setSearch(typed), 300); return () => window.clearTimeout(t); }, [typed]);
  const list = useLoad(() => getToolRules({ search: search || undefined }), [search]);
  const [editing, setEditing] = useState<ToolRule | null>(null);
  const [life, setLife] = useState('');
  const [cond, setCond] = useState('');
  useEffect(() => { if (editing) { setLife(editing.lifeDays != null ? String(editing.lifeDays) : ''); setCond(editing.issueConditions ?? ''); } }, [editing]);
  const columns: DataColumn<ToolRule>[] = [
    { key: 'name', header: 'Tool', sortValue: (r) => r.name, render: (r) => r.name, alwaysVisible: true },
    { key: 'life', header: 'Should last (days)', numeric: true, sortValue: (r) => r.lifeDays ?? -1, render: (r) => r.lifeDays ?? '—' },
    { key: 'worn', header: 'Worn out, last year', numeric: true, sortValue: (r) => r.wornLastYear, render: (r) => (r.wornLastYear ? `${r.wornLastYear} · after ${r.wornAfterDays ?? '?'} days` : '—') },
    { key: 'cond', header: 'Stores checks before giving it out', sortValue: (r) => r.issueConditions ?? '', render: (r) => r.issueConditions ?? '—' },
  ];
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5, minWidth: 0 }}>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField size="small" placeholder="Search tools" value={typed} onChange={(e) => setTyped(e.target.value)} inputProps={{ 'aria-label': 'Search tools' }} />
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>The things Stores gives out and expects back. A tool worn out well before its life is put on To clear.</Typography>
      </Box>
      <DataTable rows={list.data?.rows ?? []} columns={columns} getRowId={(r) => r.id} loading={list.loading && !list.data} storageKey="maintenance-tool-rules" exportName="tool-rules"
        onRowClick={canManage ? (r) => setEditing(r) : undefined} empty={<EmptyState icon={<BuildRounded />} title="No returnable tools." hint="Stores marks an item as one that comes back." />} />
      <FormDialog open={!!editing} title={editing?.name ?? ''} onClose={() => setEditing(null)}
        onSubmit={async () => { await setToolRule(editing!.id, { lifeDays: life.trim() === '' ? null : Number(life), issueConditions: cond.trim() || null }); setEditing(null); toast.success('Saved.'); list.reload(); }}>
        <TextField label="Should last (days in use)" value={life} onChange={(e) => setLife(e.target.value)} inputProps={{ inputMode: 'numeric', 'data-testid': 'rule-life' }}
          helperText={editing?.wornAfterDays != null ? `Worn out after ${editing.wornAfterDays} days on average in the last year.` : 'Leave empty when it has no set life.'} />
        <TextField label="Stores checks before giving it out" value={cond} onChange={(e) => setCond(e.target.value)} multiline minRows={3} inputProps={{ 'data-testid': 'rule-conditions' }}
          helperText="Shown to the storekeeper on Give out, who ticks it. e.g. What size is being drilled? Bit matches the job? Guard fitted?" />
      </FormDialog>
    </Box>
  );
}

export default function MaintenanceToday() {
  const canManage = useIsPermitted()(MAINTENANCE);
  const [tab, setTab] = useUrlParam('tab', 'clear');
  const [tick, setTick] = useState(0);
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
      <PageHeader title="Maintenance today" subtitle="Tickets with their owner and target, what is waiting to be cleared, machine health, and the rules for tools."
        actions={<Button size="small" variant="outlined" startIcon={<RefreshRounded />} onClick={() => setTick((n) => n + 1)}>Refresh</Button>} />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile aria-label="Maintenance today">
        <Tab value="clear" label="To clear" />
        <Tab value="health" label="Machine health" />
        <Tab value="rules" label="Tool rules" />
      </Tabs>
      {tab === 'clear' && <ToClear key={tick} canManage={canManage} />}
      {tab === 'health' && <Health key={tick} />}
      {tab === 'rules' && <ToolRules key={tick} canManage={canManage} />}
    </Box>
  );
}
