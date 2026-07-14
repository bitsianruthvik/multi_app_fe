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
 * operationId, operationName, projectId, projectName, itemId, seqNo, status,
 * depsClearedAt, waitWorkingMinutes, blockedByOtherTasksMinutes,
 * idleWaitMinutes, delayReason, computedHours, assignedResourceId, queuedAt,
 * startedAt, pausedAt, completedAt, createdAt, updatedAt}] }.
 *
 * Lifecycle actions (also verified against routes/tasks.js):
 *   POST /tasks/:id/start  body { delay_reason }  — legal from eligible|paused
 *   POST /tasks/:id/pause  no body                — legal from in_progress
 *   POST /tasks/:id/stop   no body                — legal from in_progress
 * All three are called via fabPost, and the queue-summary is refetched after
 * any of them succeeds so the card list reflects the new state (a task that
 * moves to 'done' via stop simply disappears, since queue-summary only
 * returns eligible/in_progress/paused rows).
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
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material';

import { fabQuery, fabGet, fabPost } from '../api/client';
import { PageHeader, StatusBadge, Surface, useToast } from '../components';

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
  projectId: number;
  projectName: string | null;
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

const DELAY_REASONS: { value: string; label: string }[] = [
  { value: 'lack_of_manpower', label: 'Lack of manpower' },
  { value: 'machine_down', label: 'Machine down' },
  { value: 'lack_of_consumable', label: 'Lack of consumable' },
  { value: 'planning_issue', label: 'Planning issue' },
  { value: 'minor_operational_delay', label: 'Minor operational delay' },
];

function formatWaitDuration(minutes: number | null): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return 'waiting —';
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `waiting ${h}h ${m}m (working hours)`;
}

export default function TaskQueue() {
  useParams<{ company: string }>();
  const { toast } = useToast();

  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [resource, setResource] = useState<ResourceOption | null>(null);
  const [loadingResources, setLoadingResources] = useState(true);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<QueueSummaryResponse | null>(null);

  const [startTask, setStartTask] = useState<QueueTask | null>(null);
  const [delayReason, setDelayReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actioningId, setActioningId] = useState<number | null>(null);

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
    setDelayReason('');
  };

  const closeStartDialog = () => {
    setStartTask(null);
    setDelayReason('');
  };

  const confirmStart = async () => {
    if (!startTask || !delayReason) return;
    setSubmitting(true);
    try {
      await fabPost(`tasks/${startTask.id}/start`, { delay_reason: delayReason });
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
          {summary.tasks.map((t) => {
            const startEnabled = t.status === 'eligible' || t.status === 'paused';
            const pauseEnabled = t.status === 'in_progress';
            const stopEnabled = t.status === 'in_progress';
            const busy = actioningId === t.id;

            return (
              <Surface key={t.id} e={1} sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ flex: 1, minWidth: 240 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>
                      {t.operationName ?? `Operation #${t.operationId ?? '?'}`}
                    </Typography>
                    <StatusBadge status={t.status} />
                  </Box>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.25 }}>
                    {(t.projectName ?? `Project #${t.projectId}`)} · Item #{t.itemId} · seq {t.seqNo}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.25 }}>
                    {formatWaitDuration(t.waitWorkingMinutes)}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!startEnabled || busy}
                    onClick={() => openStartDialog(t)}
                  >
                    Start
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!pauseEnabled || busy}
                    onClick={() => runAction(t, 'pause')}
                  >
                    Pause
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    disabled={!stopEnabled || busy}
                    onClick={() => runAction(t, 'stop')}
                  >
                    Stop
                  </Button>
                </Box>
              </Surface>
            );
          })}
        </Box>
      )}

      <Dialog open={!!startTask} onClose={submitting ? undefined : closeStartDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Start task</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 2 }}>
            {startTask?.operationName ?? `Operation #${startTask?.operationId ?? '?'}`} — select a delay reason before starting.
          </Typography>
          <FormControl>
            <RadioGroup value={delayReason} onChange={(e) => setDelayReason(e.target.value)}>
              {DELAY_REASONS.map((r) => (
                <FormControlLabel key={r.value} value={r.value} control={<Radio size="small" />} label={r.label} />
              ))}
            </RadioGroup>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeStartDialog} disabled={submitting}>Cancel</Button>
          <Button onClick={confirmStart} variant="contained" disabled={!delayReason || submitting}>
            {submitting ? <CircularProgress size={18} /> : 'Start'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
