import { useMemo, useState } from 'react';
import { Box, Button, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { InfoButton } from '@shared/ui';
import { getMdDashboard, type Alert, type MdPlanRow, type MdTodayRow } from '../api/alerts';
import { decideApproval, type Approval } from '../api/approvals';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { ErrorNotice, Mono, PageHeader, SkeletonRows, Surface } from '../components/ui';
import { AlertRow } from '../components/Alerts/AlertRow';
import { PromptDialog } from '../components/PromptDialog';
import { useToast } from '../components/toastContext';

/**
 * THE MD'S DASHBOARD (user, 2026-11-14): "today's activities, planned versus reality, alerts and requests raised …
 * with actions also doable from the same … very succinct and quick to look and work on … by sales order and also by
 * operations". One read (GET /md-dashboard); every number a few characters; every action one click from where it is
 * read: alerts are taken or closed here, requests approved or rejected here.
 */

const num = (n: number) => n.toLocaleString();

function Card({ title, info, right, children }: { title: string; info: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Surface e={1} sx={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 1, borderBottom: '1px solid var(--c-divider)' }}>
        <Typography sx={{ fontWeight: 600, fontSize: 14, flex: '1 1 auto' }}>{title}</Typography>
        {right}
        <InfoButton text={info} />
      </Box>
      <Box sx={{ overflowY: 'auto', maxHeight: 420 }}>{children}</Box>
    </Surface>
  );
}

function Fig({ label, value, tone, to }: { label: string; value: number; tone?: 'danger' | 'warning' | 'info' | 'success'; to?: string }) {
  const company = useCompanySlug();
  const ink = value && tone ? `var(--c-${tone}-700)` : 'var(--c-text)';
  const body = (
    <Box sx={{ px: 1.5, py: 1, minWidth: 0 }}>
      <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>{label}</Typography>
      <Mono sx={{ fontSize: 20, fontWeight: 700, color: ink }}>{num(value)}</Mono>
    </Box>
  );
  return to ? <Box component={Link} to={appPath(company, to)} sx={{ color: 'inherit', textDecoration: 'none', '&:hover': { background: 'var(--c-surface-2)' } }}>{body}</Box> : body;
}

const cell = { px: 1, py: 0.6, fontSize: 12.5, borderBottom: '1px solid var(--c-divider)', whiteSpace: 'nowrap' as const };
const numCell = { ...cell, textAlign: 'right' as const, fontFamily: 'var(--font-mono)' };

function TodayTable({ rows, by }: { rows: MdTodayRow[]; by: string }) {
  if (!rows.length) return <Typography sx={{ p: 1.5, fontSize: 13, color: 'var(--c-text-3)' }}>Nothing planned or worked today.</Typography>;
  return (
    <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>
        {[by === 'order' ? 'Sales order' : 'Operation', 'Planned', 'Started', 'Done', 'Running', 'Behind', 'Not in plan'].map((h, i) => (
          <Box component="th" key={h} sx={{ ...cell, fontSize: 11, color: 'var(--c-text-3)', fontWeight: 500, textAlign: i ? 'right' : 'left' }}>{h}</Box>
        ))}
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <Box component="td" sx={{ ...cell, fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</Box>
            <Box component="td" sx={numCell}>{r.planned || '·'}</Box>
            <Box component="td" sx={numCell}>{r.started || '·'}</Box>
            <Box component="td" sx={{ ...numCell, color: r.done ? 'var(--c-success-700)' : undefined }}>{r.done || '·'}</Box>
            <Box component="td" sx={{ ...numCell, color: r.running ? 'var(--c-info-700)' : undefined }}>{r.running || '·'}</Box>
            <Box component="td" sx={{ ...numCell, color: r.behind ? 'var(--c-danger-700)' : undefined, fontWeight: r.behind ? 700 : 400 }}>{r.behind || '·'}</Box>
            <Box component="td" sx={{ ...numCell, color: r.unplanned ? 'var(--c-warning-700)' : undefined }}>{r.unplanned || '·'}</Box>
          </tr>
        ))}
      </tbody>
    </Box>
  );
}

/** Planned by now vs done, as two bars on one track: the gap is how far behind the plan it is. */
function PlanBar({ r }: { r: MdPlanRow }) {
  const behind = r.duePct - r.donePct;
  return (
    <Tooltip title={`${r.done} of ${r.steps} steps done (${r.donePct}%). By now the plan wanted ${r.due} (${r.duePct}%)${r.overdue ? ` — ${r.overdue} overdue` : ''}.`} arrow disableInteractive>
      <Box sx={{ position: 'relative', height: 10, borderRadius: 5, background: 'var(--c-neutral-200)', overflow: 'hidden' }}>
        <Box sx={{ position: 'absolute', inset: 0, width: `${r.duePct}%`, background: behind > 0.5 ? 'var(--c-danger-200, #fecaca)' : 'var(--c-primary-100)' }} />
        <Box sx={{ position: 'absolute', inset: 0, width: `${r.donePct}%`, background: behind > 0.5 ? 'var(--c-danger-600)' : 'var(--c-success-600)' }} />
      </Box>
    </Tooltip>
  );
}

function PlanList({ rows, by, planned }: { rows: MdPlanRow[]; by: string; planned: boolean }) {
  if (!rows.length) return <Typography sx={{ p: 1.5, fontSize: 13, color: 'var(--c-text-3)' }}>No open released work.</Typography>;
  return (
    <Box>
      {rows.map((r) => (
        <Box key={r.id} sx={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 1.1fr) minmax(120px, 2fr) auto', gap: 1.25, alignItems: 'center', px: 1.5, py: 0.75, borderBottom: '1px solid var(--c-divider)' }}>
          <Box sx={{ minWidth: 0 }}>
            <Mono sx={{ fontWeight: 600, fontSize: 12.5 }}>{r.label}</Mono>
            <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {by === 'order' ? (r.customer ?? '') : (r.code ?? '')}
            </Typography>
          </Box>
          <PlanBar r={r} />
          <Box sx={{ textAlign: 'right', minWidth: 96 }}>
            <Mono sx={{ fontSize: 12.5, fontWeight: 600, color: r.duePct - r.donePct > 0.5 ? 'var(--c-danger-700)' : 'var(--c-text)' }}>
              {r.donePct}%{planned ? <Box component="span" sx={{ color: 'var(--c-text-3)', fontWeight: 400 }}> / {r.duePct}%</Box> : null}
            </Mono>
            {by === 'order' && r.committed && (
              <Typography sx={{ fontSize: 11, color: r.late ? 'var(--c-danger-700)' : 'var(--c-text-3)', whiteSpace: 'nowrap' }}>
                {r.late ? 'late · ' : ''}due {String(r.committed).slice(0, 10)}
              </Typography>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function RequestRow({ r, onDone }: { r: Approval; onDone: (id: number) => void }) {
  const company = useCompanySlug();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const decide = async (d: 'approve' | 'reject', note?: string) => {
    setBusy(true);
    try { await decideApproval(r.id, d, note); invalidateNavCounts(); toast.success(d === 'approve' ? 'Approved.' : 'Rejected.'); onDone(r.id); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const btn = { minWidth: 0, px: 1, py: 0.1, fontSize: 12, lineHeight: 1.6 };
  return (
    <Box data-testid="md-request" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, alignItems: 'center', px: 1.25, py: 0.75, borderBottom: '1px solid var(--c-divider)' }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, lineHeight: 1.35 }}>{r.title}</Typography>
        <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {r.typeLabel}{r.order?.code ? ` · ${r.order.code}` : ''}{r.amount != null ? ` · ₹${Math.round(r.amount).toLocaleString('en-IN')}` : ''}{r.requestedBy?.name ? ` · ${r.requestedBy.name}` : ''}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <Button size="small" variant="contained" disabled={busy} sx={btn} onClick={() => void decide('approve')}>Approve</Button>
        <Button size="small" variant="outlined" color="error" disabled={busy} sx={btn} onClick={() => setRejecting(true)}>Reject</Button>
        <Button size="small" sx={btn} component={Link} to={appPath(company, 'approvals')}>Open</Button>
      </Box>
      <PromptDialog open={rejecting} title="Reject this request?" body={r.title} label="Why" confirmLabel="Reject" danger
        onConfirm={async (note) => { setRejecting(false); await decide('reject', note); }} onClose={() => setRejecting(false)} />
    </Box>
  );
}

export default function MdDashboard() {
  const company = useCompanySlug();
  const [by, setBy] = useUrlParam('by', 'order');
  const view = by === 'operation' ? 'operation' : 'order';
  const [tick, setTick] = useState(0);
  const d = useLoad(() => getMdDashboard(view), [view, tick]);
  const [patched, setPatched] = useState<Map<number, Alert>>(new Map());
  const [decided, setDecided] = useState<Set<number>>(new Set());
  const alerts = useMemo(() => (d.data?.alerts.rows ?? []).map((a) => patched.get(a.id) ?? a).filter((a) => a.status !== 'resolved'), [d.data, patched]);
  const requests = useMemo(() => (d.data?.requests ?? []).filter((r) => !decided.has(r.id)), [d.data, decided]);
  const s = d.data?.summary;
  const planned = !!d.data?.planRunAt;

  return (
    <Box>
      <PageHeader title="MD dashboard" subtitle={planned ? `Against the plan of ${String(d.data?.planRunAt).slice(0, 16).replace('T', ' ')}.` : 'The planner has not been run — progress is shown, nothing is behind a plan yet.'}
        actions={(
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setBy(v)} sx={{ height: 32 }}>
              <ToggleButton value="order" sx={{ textTransform: 'none', fontSize: 12.5, px: 1.25 }}>By sales order</ToggleButton>
              <ToggleButton value="operation" sx={{ textTransform: 'none', fontSize: 12.5, px: 1.25 }}>By operation</ToggleButton>
            </ToggleButtonGroup>
            <Button size="small" onClick={() => { setPatched(new Map()); setDecided(new Set()); setTick((t) => t + 1); }}>Refresh</Button>
          </Box>
        )} />
      <ErrorNotice error={d.error} onRetry={d.reload} />
      {!d.data ? <SkeletonRows rows={8} /> : (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          <Surface e={1} sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', md: 'repeat(8, minmax(0, 1fr))' } }}>
            <Fig label="Planned today" value={s!.planned} />
            <Fig label="Started today" value={s!.started} />
            <Fig label="Done today" value={s!.done} tone="success" />
            <Fig label="Running now" value={s!.running} tone="info" to="tracker?view=steps&status=in_progress&group=machine" />
            <Fig label="Behind today" value={s!.behind} tone="danger" />
            <Fig label="Not in plan" value={s!.unplanned} tone="warning" />
            <Fig label="Alerts" value={alerts.length} tone={s!.danger ? 'danger' : 'warning'} to="alerts?dept=md" />
            <Fig label="Requests" value={requests.length} tone="warning" to="approvals" />
          </Surface>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 1.5 }}>
            <Card title="Today" info="Steps the plan has on today, what was started and finished today, what is running, what is behind (its slot ended and it is not done) and work started today that the plan did not have today.">
              <TodayTable rows={d.data.today} by={view} />
            </Card>
            <Card title="Planned vs reality" info="Each bar: green / red is done, the lighter part behind it is what the plan wanted done by now. Red means behind the plan. The figure is done % / planned-by-now %; orders show their committed date, red when the plan finishes after it."
              right={<Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mr: 0.5 }}>done / planned by now</Typography>}>
              <PlanList rows={d.data.plan} by={view} planned={planned} />
            </Card>
            <Card title="Alerts" info="Delays addressed to the MD: delivery dates moved, procurement late past 3 days, starts and finishes late by more than a day, work started outside the plan. Got it = someone has it; Done = closed."
              right={<Button size="small" component={Link} to={appPath(company, 'alerts?dept=md')} sx={{ fontSize: 12 }}>All</Button>}>
              {alerts.length ? alerts.map((a) => <AlertRow key={a.id} a={a} compact onChanged={(x) => setPatched((p) => new Map(p).set(x.id, x))} />)
                : <Typography sx={{ p: 1.5, fontSize: 13, color: 'var(--c-text-3)' }}>No open alert for the MD.</Typography>}
            </Card>
            <Card title="Requests" info="What waits for your yes: acceptances, purchase orders, rate changes, close-short, machines, the month plan. Approve here; Reject asks why; Open shows it in full.">
              {requests.length ? requests.map((r) => <RequestRow key={r.id} r={r} onDone={(id) => setDecided((x) => new Set(x).add(id))} />)
                : <Typography sx={{ p: 1.5, fontSize: 13, color: 'var(--c-text-3)' }}>Nothing waits for you.</Typography>}
            </Card>
          </Box>
        </Box>
      )}
    </Box>
  );
}
