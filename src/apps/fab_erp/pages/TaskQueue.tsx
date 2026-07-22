/**
 * TaskQueue.tsx — EU-10: per-machine task queue screen.
 *
 * Machine picker note: per user decision the operator MUST pick one specific
 * machine first — there is no resource-type aggregate view. The picker
 * queries `fabErpResource` (resourceDef.json alias `fr`, table
 * `fab_resources`), which exposes `id` / `name` / `code` / `plantName` /
 * `resourceTypeName` fields (all camelCase, as required for generic query
 * API filters/fields on fab_erp reads).
 *
 * Once a machine is selected, the queue is loaded via the custom route
 * GET /tasks/queue-summary?resourceId=<id> (NOT the generic query API),
 * called the same way ProjectDag.tsx calls GET /tasks/graph — via fabGet.
 * Response shape verified by reading multi_app_be/apps/fab_erp/routes/tasks.js
 * directly: { ok, counts: {eligible,in_progress,paused}, tasks: [{id,
 * operationId, operationName, orderId, orderNumber, itemId, seqNo, status,
 * depsClearedAt, waitWorkingMinutes, blockedByOtherTasksMinutes,
 * idleWaitMinutes, delayReason, computedHours, assignedResourceId, queuedAt,
 * startedAt, pausedAt, completedAt, createdAt, updatedAt}] }.
 *
 * Lifecycle actions (also verified against routes/tasks.js):
 *   POST /tasks/:id/start  no reason required (EU-2/EU-3) — legal from eligible|paused
 *   POST /tasks/:id/pause  no body                — legal from in_progress
 *   POST /tasks/:id/stop   no body                — legal from in_progress
 * All three are called via fabPost, and the queue-summary is refetched after
 * any of them succeeds so the card list reflects the new state (a task that
 * moves to 'done' via stop simply disappears, since queue-summary only
 * returns eligible/in_progress/paused rows).
 *
 * EU-5: each row can be expanded to lazy-fetch GET /tasks/:id/wait-breakdown
 * (only on first expand, then cached) and render it via <WaitBreakdownBar>.
 *
 * EU-11: each row also gets a "Log past work" (eligible/paused) or "Adjust
 * times" (done) button opening <LogPastWorkDialog>, which backfills the
 * task's start/pause/complete times via POST /tasks/:id/events/backfill
 * (EU-10). Gated on the fab_erp_time_backfill permission tag, mirroring
 * Operations.tsx's canManage pattern (usePermission called once at page
 * level, never inside the row map) — admins bypass the tag on the backend,
 * so the frontend check ORs in isAdminRole(user.role) too, otherwise an
 * admin without the explicit tag would see no button for an action they're
 * actually allowed to perform. NOTE: queue-summary's SQL only ever returns
 * status IN ('eligible','in_progress','paused') (see routes/tasks.js), so
 * "done" tasks never actually reach TaskRow today — the done-status branch
 * below is dead code under the current backend but kept for forward
 * compatibility (harmless, and cheap to keep in sync if a later ticket
 * starts including recently-completed tasks in this response).
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';

import { useAuth } from '@core/contexts/AuthContext';
import { usePermission } from '@core/hooks/usePermission';
import { isAdminRole } from '@core/utils/roles';

import { fabQuery, fabGet, fabPost, getWaitBreakdown, type WaitBreakdownResponse } from '../api/client';
import { PageHeader, StatusBadge, Surface, useToast } from '../components';
import { WaitBreakdownBar, formatWaitMinutes } from '../components/WaitBreakdownBar';
import { LogPastWorkDialog, type LogPastWorkTask } from '../components/LogPastWorkDialog';

interface QueryResult<T> { data: T[]; total?: number }

interface ResourceRow {
  id: number;
  name: string;
  code: string | null;
  plantName: string | null;
  resourceTypeName: string | null;
}

interface ResourceOption {
  id: number;
  name: string;
  code: string | null;
  plantName: string | null;
  resourceTypeName: string | null;
}

type TaskStatus = 'blocked' | 'eligible' | 'in_progress' | 'paused' | 'done' | 'cancelled';

interface QueueTask {
  id: number;
  operationId: number | null;
  operationName: string | null;
  orderId: number;
  orderNumber: string | null;
  itemId: number;
  seqNo: number;
  status: TaskStatus;
  depsClearedAt: string | null;
  waitWorkingMinutes: number | null;
  blockedByOtherTasksMinutes: number | null;
  idleWaitMinutes: number | null;
  delayReason: string | null;
  computedHours: number | null;
  assignedResourceId: number | null;
  queuedAt: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface QueueSummaryResponse {
  ok: boolean;
  counts: { eligible: number; in_progress: number; paused: number };
  tasks: QueueTask[];
}

function formatWaitDuration(minutes: number | null): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return 'waiting —';
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `waiting ${h}h ${m}m (working hours)`;
}

function errMsg(e: unknown, fallback: string): string {
  const ax = e as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.message ?? fallback;
}

/**
 * EU-15 "running Nx typical" nudge. Source of "typical" is the task's own
 * computedHours field, already present on the queue-summary payload (see
 * routes/tasks.js `t.computed_hours AS computedHours`) — no extra fetch
 * needed. computedHours is the learned p80 duration (hours) when EU-15's
 * materialization wiring found a usable stat for the task's operation/
 * resource-type, else the formula-derived estimate, so this nudge is
 * meaningful either way. Returns null unless the task is in_progress, has a
 * positive computedHours, and has actually run past it.
 */
function computeRunningRatio(task: QueueTask, now: number): number | null {
  if (task.status !== 'in_progress' || !task.startedAt) return null;
  const hours = task.computedHours;
  if (hours === null || hours === undefined || !(hours > 0)) return null;
  const elapsedHours = (now - new Date(task.startedAt).getTime()) / 3_600_000;
  if (elapsedHours <= hours) return null;
  return elapsedHours / hours;
}

/** Narrow a QueueTask down to what LogPastWorkDialog needs. */
function taskToLogPastWorkTask(task: QueueTask): LogPastWorkTask {
  return {
    id: task.id,
    operationName: task.operationName,
    operationId: task.operationId,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
  };
}

/**
 * One task card. Wait-breakdown is fetched lazily on first expand and then
 * cached locally (mirrors OrderRow's lazy-graph-fetch pattern in TaskEngine.tsx)
 * so switching machines doesn't fire a wait-breakdown call per row up front.
 */
function TaskRow({
  task,
  busy,
  canBackfill,
  onStart,
  onAction,
  onLogPastWork,
}: {
  task: QueueTask;
  busy: boolean;
  canBackfill: boolean;
  onStart: (task: QueueTask) => void;
  onAction: (task: QueueTask, action: 'pause' | 'stop') => void;
  onLogPastWork: (task: QueueTask, mode: 'log' | 'adjust') => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [breakdown, setBreakdown] = useState<WaitBreakdownResponse | null>(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [breakdownErr, setBreakdownErr] = useState('');

  // Ticks once a minute so the "running Nx typical" nudge below stays live
  // without needing a queue-summary refetch; only runs while in_progress.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (task.status !== 'in_progress') return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [task.status]);
  const runningRatio = computeRunningRatio(task, now);

  const fetchBreakdown = useCallback(async () => {
    setLoadingBreakdown(true);
    setBreakdownErr('');
    try {
      const res = await getWaitBreakdown(task.id);
      setBreakdown(res);
    } catch (e) {
      setBreakdownErr(errMsg(e, 'Failed to load wait breakdown.'));
    } finally {
      setLoadingBreakdown(false);
    }
  }, [task.id]);

  useEffect(() => {
    if (expanded && !breakdown && !loadingBreakdown) fetchBreakdown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const startEnabled = task.status === 'eligible' || task.status === 'paused';
  const pauseEnabled = task.status === 'in_progress';
  const stopEnabled = task.status === 'in_progress';
  // 'done' never actually reaches this row today (see header comment) — kept for forward compatibility.
  const logPastWorkEnabled = task.status === 'eligible' || task.status === 'paused';
  const adjustTimesEnabled = task.status === 'done';

  return (
    <Surface e={1} sx={{ overflow: 'hidden' }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box
          onClick={() => setExpanded((v) => !v)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v); }
          }}
          sx={{ flex: 1, minWidth: 240, display: 'flex', gap: 1, cursor: 'pointer' }}
        >
          {expanded ? <ExpandMoreRounded sx={{ color: 'var(--c-text-3)', mt: 0.25 }} /> : <ChevronRightRounded sx={{ color: 'var(--c-text-3)', mt: 0.25 }} />}
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>
                {task.operationName ?? `Operation #${task.operationId ?? '?'}`}
              </Typography>
              <StatusBadge status={task.status} />
              {runningRatio !== null && (
                <Box
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--c-warning-50)',
                    color: 'var(--c-warning-800)',
                    borderRadius: 'var(--r-sm)',
                    padding: '3px 9px',
                    fontSize: 12,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <WarningAmberRounded sx={{ fontSize: 14 }} aria-hidden />
                  running {runningRatio.toFixed(1)}× typical
                </Box>
              )}
            </Box>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.25 }}>
              {(task.orderNumber ?? `Order #${task.orderId}`)} · Item #{task.itemId} · seq {task.seqNo}
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.25 }}>
              {formatWaitDuration(task.waitWorkingMinutes)}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" variant="outlined" disabled={!startEnabled || busy} onClick={() => onStart(task)}>
            Start
          </Button>
          <Button size="small" variant="outlined" disabled={!pauseEnabled || busy} onClick={() => onAction(task, 'pause')}>
            Pause
          </Button>
          <Button size="small" variant="outlined" color="error" disabled={!stopEnabled || busy} onClick={() => onAction(task, 'stop')}>
            Stop
          </Button>
          {canBackfill && logPastWorkEnabled && (
            <Button size="small" variant="text" disabled={busy} onClick={() => onLogPastWork(task, 'log')}>
              Log past work
            </Button>
          )}
          {canBackfill && adjustTimesEnabled && (
            <Button size="small" variant="text" disabled={busy} onClick={() => onLogPastWork(task, 'adjust')}>
              Adjust times
            </Button>
          )}
        </Box>
      </Box>

      {expanded && (
        <Box sx={{ px: 2, pb: 2, pt: 0.5, borderTop: '1px solid var(--c-divider)' }}>
          {loadingBreakdown ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={18} /></Box>
          ) : breakdownErr ? (
            <Typography sx={{ fontSize: 12, color: 'var(--c-danger-600)', mt: 1.5 }}>{breakdownErr}</Typography>
          ) : breakdown ? (
            <Box sx={{ mt: 1.5 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: 'var(--c-text-2)', mb: 0.75 }}>
                Waited {formatWaitMinutes(breakdown.totalWaitMinutes)}
              </Typography>
              <WaitBreakdownBar totals={breakdown.totals} showLegend />
            </Box>
          ) : null}
        </Box>
      )}
    </Surface>
  );
}

export default function TaskQueue() {
  useParams<{ company: string }>();
  const { toast } = useToast();
  const { user } = useAuth();
  // Admins bypass the tag on the backend (see routes/tasks.js), so OR it in here too —
  // otherwise an admin without the explicit grant would never see the button.
  // (usePermission must be called unconditionally — react-hooks/rules-of-hooks —
  // so it's combined with isAdminRole after, not short-circuited inside the ||.)
  const hasBackfillTag = usePermission('fab_erp_time_backfill');
  const canBackfill = isAdminRole(user?.role) || hasBackfillTag;

  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [resource, setResource] = useState<ResourceOption | null>(null);
  const [loadingResources, setLoadingResources] = useState(true);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<QueueSummaryResponse | null>(null);

  const [startTask, setStartTask] = useState<QueueTask | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actioningId, setActioningId] = useState<number | null>(null);

  const [logPastWorkTask, setLogPastWorkTask] = useState<QueueTask | null>(null);
  const [logPastWorkMode, setLogPastWorkMode] = useState<'log' | 'adjust'>('log');

  const fetchResources = useCallback(async () => {
    setLoadingResources(true);
    try {
      const res = await fabQuery<QueryResult<ResourceRow>>('fabErpResource', {
        fields: ['id', 'name', 'code', 'plantName', 'resourceTypeName'],
        orderBy: [{ field: 'name', direction: 'asc' }],
        pagination: { limit: 5000 },
      });
      const list = (res.data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        plantName: r.plantName,
        resourceTypeName: r.resourceTypeName,
      }));
      setResources(list);
    } catch (e) {
      setError((e as Error).message || 'Failed to load machines.');
    } finally {
      setLoadingResources(false);
    }
  }, []);

  useEffect(() => { fetchResources(); }, [fetchResources]);

  const fetchQueue = useCallback(async (resourceId: number) => {
    setLoadingQueue(true);
    setError('');
    try {
      const res = await fabGet<QueueSummaryResponse>('tasks/queue-summary', { resourceId });
      setSummary(res);
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      const msg = ax.response?.data?.message ?? ax.message ?? 'Failed to load task queue.';
      setError(msg);
      toast(msg, 'error');
      setSummary(null);
    } finally {
      setLoadingQueue(false);
    }
  }, [toast]);

  useEffect(() => {
    if (resource) fetchQueue(resource.id);
    else setSummary(null);
  }, [resource, fetchQueue]);

  const refetchQueue = useCallback(() => {
    if (resource) fetchQueue(resource.id);
  }, [resource, fetchQueue]);

  const openStartDialog = (task: QueueTask) => {
    setStartTask(task);
  };

  const closeStartDialog = () => {
    setStartTask(null);
  };

  const openLogPastWork = (task: QueueTask, mode: 'log' | 'adjust') => {
    setLogPastWorkMode(mode);
    setLogPastWorkTask(task);
  };

  const closeLogPastWork = () => {
    setLogPastWorkTask(null);
  };

  const confirmStart = async () => {
    if (!startTask) return;
    setSubmitting(true);
    try {
      await fabPost(`tasks/${startTask.id}/start`, {});
      toast('Task started.', 'success');
      closeStartDialog();
      refetchQueue();
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      const msg = ax.response?.data?.message ?? ax.message ?? 'Failed to start task.';
      toast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async (task: QueueTask, action: 'pause' | 'stop') => {
    setActioningId(task.id);
    try {
      await fabPost(`tasks/${task.id}/${action}`, {});
      toast(action === 'pause' ? 'Task paused.' : 'Task stopped.', 'success');
      refetchQueue();
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      const msg = ax.response?.data?.message ?? ax.message ?? `Failed to ${action} task.`;
      toast(msg, 'error');
    } finally {
      setActioningId(null);
    }
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader title="Task Queue" subtitle="Per-machine queue of eligible, in-progress, and paused tasks" />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Surface e={1} sx={{ p: 2.5, mb: 2.5 }}>
        <Autocomplete<ResourceOption, false, false, false>
          options={resources}
          value={resource}
          loading={loadingResources}
          getOptionLabel={(o) => (o.code ? `${o.code} — ${o.name}` : o.name)}
          isOptionEqualToValue={(o, v) => o.id === v.id}
          sx={{ minWidth: 340 }}
          onChange={(_e, newVal) => setResource(newVal)}
          renderOption={(props, option) => (
            <Box component="li" {...props} key={option.id}>
              <Box>
                <Typography sx={{ fontSize: 14 }}>{option.code ? `${option.code} — ${option.name}` : option.name}</Typography>
                <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                  {[option.plantName, option.resourceTypeName].filter(Boolean).join(' · ') || '—'}
                </Typography>
              </Box>
            </Box>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Machine"
              size="small"
              placeholder="Select a machine…"
              slotProps={{
                input: {
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loadingResources ? <CircularProgress size={16} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                },
              }}
            />
          )}
        />
      </Surface>

      {!resource && (
        <Surface e={1} sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{ color: 'var(--c-text-3)' }}>Select a machine to view its task queue.</Typography>
        </Surface>
      )}

      {resource && loadingQueue && (
        <Surface e={1} sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={24} />
        </Surface>
      )}

      {resource && !loadingQueue && summary && summary.tasks.length === 0 && (
        <Surface e={1} sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{ color: 'var(--c-text-3)' }}>
            No eligible, in-progress, or paused tasks for this machine.
          </Typography>
        </Surface>
      )}

      {resource && !loadingQueue && summary && summary.tasks.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {summary.tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              busy={actioningId === t.id}
              canBackfill={canBackfill}
              onStart={openStartDialog}
              onAction={runAction}
              onLogPastWork={openLogPastWork}
            />
          ))}
        </Box>
      )}

      <Dialog open={!!startTask} onClose={submitting ? undefined : closeStartDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Start task</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            Start {startTask?.operationName ?? `Operation #${startTask?.operationId ?? '?'}`} now?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeStartDialog} disabled={submitting}>Cancel</Button>
          <Button onClick={confirmStart} variant="contained" disabled={submitting}>
            {submitting ? <CircularProgress size={18} /> : 'Start'}
          </Button>
        </DialogActions>
      </Dialog>

      <LogPastWorkDialog
        open={!!logPastWorkTask}
        task={logPastWorkTask ? taskToLogPastWorkTask(logPastWorkTask) : null}
        mode={logPastWorkMode}
        onClose={closeLogPastWork}
        onSaved={refetchQueue}
      />
    </Box>
  );
}
