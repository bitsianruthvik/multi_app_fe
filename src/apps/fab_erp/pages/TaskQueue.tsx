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
  createFilterOptions,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import HistoryEduRounded from '@mui/icons-material/HistoryEduRounded';

import { useAuth } from '@core/contexts/AuthContext';
import { usePermission } from '@core/hooks/usePermission';
import { isAdminRole } from '@core/utils/roles';

import { fabQuery, fabGet, fabPost, getWaitBreakdown, type WaitBreakdownResponse } from '../api/client';
import { getCcWhatIf, type CcWhatIfResponse } from '../api/cc';
import { useCompanySlug } from '../hooks/useCompanySlug';
import {
  PageHeader, StatusBadge, Surface, useToast, LiveIndicator, useLiveRefresh, useNowTick, Mono, QtyCell,
} from '../components';
import { WaitBreakdownBar, formatWaitMinutes } from '../components/WaitBreakdownBar';
import { LogPastWorkDialog, type LogPastWorkTask } from '../components/LogPastWorkDialog';
import { DetourWarningDialog } from '../components/cc/DetourWarningDialog';

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

// BUG-16: filter the machine picker by typed text across code, name, plant and
// resource type (not just the label), so typing "Cutter-1" narrows the list.
const machineFilter = createFilterOptions<ResourceOption>({
  stringify: (o) => `${o.code ?? ''} ${o.name} ${o.plantName ?? ''} ${o.resourceTypeName ?? ''}`,
});

// FEAT-12: downtime reasons captured when a task is paused (mirror the backend
// delay_reason ENUM).
const PAUSE_REASON_LABELS: Record<string, string> = {
  lack_of_manpower: 'Lack of manpower',
  machine_down: 'Machine down',
  lack_of_consumable: 'Lack of consumable',
  planning_issue: 'Planning issue',
  minor_operational_delay: 'Minor operational delay',
};

type TaskStatus = 'blocked' | 'eligible' | 'in_progress' | 'paused' | 'done' | 'cancelled';

interface QueueTask {
  id: number;
  operationId: number | null;
  operationName: string | null;
  orderId: number;
  orderNumber: string | null;
  itemId: number;
  /** Leaf part name + its ancestors (root first), from queue-summary's recursive walk. */
  itemName: string | null;
  itemPath?: string[];
  /** Piece mark — what's painted on the steel. Leads the row when present. */
  itemMark: string | null;
  itemCode: string | null;
  itemQty: number | string | null;
  itemUnit: string | null;
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
  onPause,
  onComplete,
  onLogPastWork,
}: {
  task: QueueTask;
  busy: boolean;
  canBackfill: boolean;
  onStart: (task: QueueTask) => void;
  onPause: (task: QueueTask) => void;
  onComplete: (task: QueueTask) => void;
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
    <Surface
      e={1}
      sx={{
        overflow: 'hidden',
        transition: 'opacity var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease)',
      }}
    >
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
            {/* Part first, operation second. An operator's first question is
                "what do I pick up?", not "what verb am I doing?" — the queue
                used to answer only the second, because the item was never even
                fetched. The BOM path above it says where the part sits in the
                project, so they can find it on the floor. */}
            {task.itemPath && task.itemPath.length > 0 && (
              <Typography
                sx={{
                  fontSize: 11.5, color: 'var(--c-text-3)', mb: 0.25,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {task.itemPath.join(' › ')}
              </Typography>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {/* The mark leads when it exists: it is the string painted on the
                  steel, so it's what the operator matches against the physical
                  piece. The descriptive name follows for confirmation. */}
              {task.itemMark && (
                <Box
                  component="span"
                  sx={{
                    fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600,
                    color: 'var(--c-primary-900)', background: 'var(--c-primary-50)',
                    border: '1px solid var(--c-primary-200)', borderRadius: 'var(--r-sm)',
                    px: 1, py: 0.25, whiteSpace: 'nowrap',
                  }}
                >
                  {task.itemMark}
                </Box>
              )}
              <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>
                {task.itemName ?? `Item #${task.itemId}`}
              </Typography>
              {task.itemCode && <Mono chip>{task.itemCode}</Mono>}
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
            {/* The operation moves here — still prominent, but it answers the
                second question, not the first. "Item #123" is gone: an internal
                row id told the operator nothing they could act on. */}
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.25 }}>
              <Box component="span" sx={{ fontWeight: 500, color: 'var(--c-text)' }}>
                {task.operationName ?? `Operation #${task.operationId ?? '?'}`}
              </Box>
              {' · '}{task.orderNumber ?? `Order #${task.orderId}`}
              {/* QtyCell, not interpolation: fab_items.qty is DECIMAL(18,4) so
                  the raw value arrives as "2.0000". */}
              {task.itemQty != null && (
                <> · <QtyCell value={task.itemQty} uom={task.itemUnit} /></>
              )}
              {' · '}seq {task.seqNo}
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
          <Button size="small" variant="outlined" disabled={!pauseEnabled || busy} onClick={() => onPause(task)}>
            Pause
          </Button>
          <Button size="small" variant="outlined" color="success" disabled={!stopEnabled || busy} onClick={() => onComplete(task)}>
            Complete
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
  const companySlug = useCompanySlug();
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
  // Lifecycle actions (start/pause/complete) now run through their own dialogs,
  // which track their own `submitting` state — no per-row busy flag needed.

  // EU-13: "Google-Maps detour" pre-flight — GET /cc/whatif is checked before a
  // task's Start flow opens. `checkingTaskId` drives the per-row Start button's
  // loading state while that check is in flight (blocks double-click). If the
  // check reports impacts, `detourTask`/`whatIf` open the blocking warning
  // dialog instead of the normal "Start task" confirm; otherwise (no impacts,
  // or the whatif call itself failed — a CC hiccup must never block real work)
  // the normal confirm dialog opens exactly as before.
  const [checkingTaskId, setCheckingTaskId] = useState<number | null>(null);
  const [detourTask, setDetourTask] = useState<QueueTask | null>(null);
  const [whatIf, setWhatIf] = useState<CcWhatIfResponse | null>(null);

  // FEAT-05: completion dialog (production-output capture) state.
  const [completeTask, setCompleteTask] = useState<QueueTask | null>(null);
  const [producedQty, setProducedQty] = useState('');
  const [scrapQty, setScrapQty] = useState('0');
  const [qcPassed, setQcPassed] = useState(true);

  // FEAT-12: pause dialog (downtime reason) state.
  const [pauseTask, setPauseTask] = useState<QueueTask | null>(null);
  const [pauseReason, setPauseReason] = useState('');

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

  const refetchQueue = useCallback(() => {
    if (resource) fetchQueue(resource.id);
  }, [resource, fetchQueue]);

  // Live mode (§7.2). Only polls once a machine is picked — there's nothing to
  // refresh before that, and the queue is what operators leave on screen all
  // shift, so a stale list is the failure mode that actually costs them.
  const live = useLiveRefresh(refetchQueue, { intervalMs: 30_000, enabled: !!resource });
  const pageNow = useNowTick(15_000);

  // Machine-change fetch goes through the live hook so `lastUpdated` is set
  // immediately; fetching directly left the indicator reading "Live · never"
  // until the first poll landed, which says the opposite of the truth.
  useEffect(() => {
    if (resource) void live.refreshNow();
    else setSummary(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource]);


  const openStartDialog = (task: QueueTask) => {
    setStartTask(task);
  };

  const closeStartDialog = () => {
    setStartTask(null);
  };

  // Shared start logic (the actual POST /tasks/:id/start call) — reused by
  // both the plain "Start task" confirm dialog and the detour dialog's
  // "Start anyway" so the request itself is never duplicated/forked.
  const runStart = useCallback(async (task: QueueTask) => {
    setSubmitting(true);
    try {
      // BUG-09: tell the backend which machine is running this task so it's
      // recorded on the task (capacity truth) and double-booking can be caught.
      await fabPost(`tasks/${task.id}/start`, { resourceId: resource?.id });
      toast('Task started.', 'success');
      refetchQueue();
      return true;
    } catch (e) {
      toast(errMsg(e, 'Failed to start task.'), 'error');
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [resource, refetchQueue, toast]);

  // EU-13: entry point for the row's Start button. Checks the CC detour
  // what-if before deciding which dialog (if any) to open.
  const handleStartClick = useCallback(async (task: QueueTask) => {
    setCheckingTaskId(task.id);
    try {
      const res = await getCcWhatIf(task.id, task.assignedResourceId ?? undefined);
      if (res.impacts.length > 0) {
        setWhatIf(res);
        setDetourTask(task);
      } else {
        openStartDialog(task);
      }
    } catch {
      // A CC hiccup must never block real work — fall through to the normal flow.
      openStartDialog(task);
    } finally {
      setCheckingTaskId(null);
    }
  }, []);

  const closeDetourDialog = () => {
    if (submitting) return;
    setDetourTask(null);
    setWhatIf(null);
  };

  const confirmDetourStart = async () => {
    if (!detourTask) return;
    const ok = await runStart(detourTask);
    if (ok) {
      setDetourTask(null);
      setWhatIf(null);
    }
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
    const ok = await runStart(startTask);
    if (ok) closeStartDialog();
  };

  // FEAT-12: pause opens a dialog to capture a downtime reason (optional).
  const openPauseDialog = (task: QueueTask) => {
    setPauseReason('');
    setPauseTask(task);
  };

  const confirmPause = async () => {
    if (!pauseTask) return;
    setSubmitting(true);
    try {
      await fabPost(`tasks/${pauseTask.id}/pause`, pauseReason ? { reason: pauseReason } : {});
      toast(pauseReason ? `Task paused — ${PAUSE_REASON_LABELS[pauseReason]}.` : 'Task paused.', 'success');
      setPauseTask(null);
      refetchQueue();
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      toast(ax.response?.data?.message ?? ax.message ?? 'Failed to pause task.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // FEAT-05: open the completion dialog, pre-filled to a clean full-yield pass
  // (blank produced → backend uses the item's planned qty; scrap 0; QC pass).
  const openCompleteDialog = (task: QueueTask) => {
    setProducedQty('');
    setScrapQty('0');
    setQcPassed(true);
    setCompleteTask(task);
  };

  const closeCompleteDialog = () => {
    if (submitting) return;
    setCompleteTask(null);
  };

  const producedInvalid = producedQty.trim() !== '' && (!Number.isFinite(Number(producedQty)) || Number(producedQty) < 0);
  const scrapInvalid = scrapQty.trim() !== '' && (!Number.isFinite(Number(scrapQty)) || Number(scrapQty) < 0);

  const confirmComplete = async () => {
    if (!completeTask || producedInvalid || scrapInvalid) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { qcResult: qcPassed ? 'pass' : 'fail' };
      if (producedQty.trim() !== '') payload.producedQty = Number(producedQty);
      if (scrapQty.trim() !== '') payload.scrapQty = Number(scrapQty);
      const res = await fabPost<{ reworkTaskId: number | null; variance?: { varianceHours: number | null; variancePct: number | null } | null }>(`tasks/${completeTask.id}/stop`, payload);
      if (!qcPassed && res?.reworkTaskId) {
        toast(`QC fail recorded — rework task #${res.reworkTaskId} queued.`, 'info');
      } else {
        // FEAT-16: show plan-vs-actual variance in the completion toast when known.
        const v = res?.variance;
        if (v && v.varianceHours != null) {
          const sign = v.varianceHours > 0 ? '+' : '';
          const pct = v.variancePct != null ? ` (${sign}${v.variancePct}%)` : '';
          toast(`Task completed — ${sign}${v.varianceHours}h vs plan${pct}.`, v.varianceHours > 0 ? 'info' : 'success');
        } else {
          toast('Task completed.', 'success');
        }
      }
      setCompleteTask(null);
      refetchQueue();
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      const msg = ax.response?.data?.message ?? ax.message ?? 'Failed to complete task.';
      toast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader
        title="Task Queue"
        subtitle="Per-machine queue of eligible, in-progress, and paused tasks"
        actions={resource ? (
          <>
          {/* Per-task back-entry is the wrong tool for a whole shift — six jobs
              meant six searches and six dialogs, which is why the clipboard
              never got typed up. Point people at the screen built for it. */}
          {canBackfill && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<HistoryEduRounded fontSize="small" />}
              href={`/${companySlug}/fab_erp/shift-log`}
              sx={{ mr: 1 }}
            >
              Write up a shift
            </Button>
          )}
          <LiveIndicator
            paused={live.paused}
            onTogglePause={() => live.setPaused((p) => !p)}
            lastUpdated={live.lastUpdated}
            now={pageNow}
            busy={live.busy || loadingQueue}
            onRefreshNow={refetchQueue}
          />
          </>
        ) : undefined}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Surface e={1} sx={{ p: 2.5, mb: 2.5 }}>
        <Autocomplete<ResourceOption, false, false, false>
          options={resources}
          value={resource}
          loading={loadingResources}
          getOptionLabel={(o) => (o.code ? `${o.code} — ${o.name}` : o.name)}
          filterOptions={machineFilter}
          autoHighlight
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
                busy={checkingTaskId === t.id}
                canBackfill={canBackfill}
                onStart={handleStartClick}
                onPause={openPauseDialog}
                onComplete={openCompleteDialog}
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

      {/* EU-13: detour dialog — blocking warning shown instead of the plain
          "Start task" confirm when the CC what-if reports impacted projects. */}
      <DetourWarningDialog
        open={!!detourTask}
        whatIf={whatIf}
        submitting={submitting}
        onCancel={closeDetourDialog}
        onConfirm={confirmDetourStart}
      />

      {/* FEAT-12: pause dialog — capture an optional downtime reason. */}
      <Dialog open={!!pauseTask} onClose={submitting ? undefined : () => setPauseTask(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Pause task</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 2 }}>
            Why is {pauseTask?.operationName ?? `Operation #${pauseTask?.operationId ?? '?'}`} pausing? (optional — helps wait-time attribution)
          </Typography>
          <TextField
            select fullWidth size="small" label="Downtime reason"
            value={pauseReason} onChange={(e) => setPauseReason(e.target.value)}
          >
            <MenuItem value="">— none —</MenuItem>
            {Object.entries(PAUSE_REASON_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPauseTask(null)} disabled={submitting}>Cancel</Button>
          <Button onClick={confirmPause} variant="contained" disabled={submitting}>
            {submitting ? <CircularProgress size={18} /> : 'Pause'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* FEAT-05: completion dialog — capture produced/scrap/QC. Pre-filled to a
          clean full-yield pass so the common case is a single confirming click. */}
      <Dialog open={!!completeTask} onClose={closeCompleteDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Complete task</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 2 }}>
            {completeTask?.operationName ?? `Operation #${completeTask?.operationId ?? '?'}`} — record production output.
          </Typography>
          <TextField
            label="Good quantity produced"
            type="number"
            fullWidth
            size="small"
            value={producedQty}
            onChange={(e) => setProducedQty(e.target.value)}
            error={producedInvalid}
            helperText={producedInvalid ? 'Must be a number ≥ 0.' : 'Leave blank to use the item’s planned quantity.'}
            inputProps={{ min: 0, step: 'any' }}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Scrap / rejected quantity"
            type="number"
            fullWidth
            size="small"
            value={scrapQty}
            onChange={(e) => setScrapQty(e.target.value)}
            error={scrapInvalid}
            helperText={scrapInvalid ? 'Must be a number ≥ 0.' : ' '}
            inputProps={{ min: 0, step: 'any' }}
            sx={{ mb: 1 }}
          />
          <FormControlLabel
            control={<Switch checked={qcPassed} onChange={(e) => setQcPassed(e.target.checked)} color="success" />}
            label={qcPassed ? 'QC passed' : 'QC failed'}
          />
          {!qcPassed && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              A rework task will be queued for this operation. No finished stock is booked until the rework passes QC.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCompleteDialog} disabled={submitting}>Cancel</Button>
          <Button
            onClick={confirmComplete}
            variant="contained"
            color={qcPassed ? 'success' : 'warning'}
            disabled={submitting || producedInvalid || scrapInvalid}
          >
            {submitting ? <CircularProgress size={18} /> : qcPassed ? 'Complete' : 'Record QC fail'}
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
