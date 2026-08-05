/**
 * Dispatch.tsx — production planning: what each machine works on next.
 *
 * Two panels, and the distinction between them is the whole point of the
 * screen. The top one is GET /dispatch/preview — a fresh ranking, recomputed on
 * every load, writing nothing. The bottom one is GET /dispatch/latest — the run
 * a planner actually confirmed, read back with its frozen scores. They diverge
 * the moment work starts or an order moves, and a planner who cannot see both
 * has no way to tell "the plan changed" from "the plan was never agreed".
 *
 * Running a dispatch is therefore explicit and confirmed. POST /dispatch/confirm
 * recomputes server-side rather than trusting the list on screen, so the dialog
 * says so, and the toast reports what was actually stored rather than what was
 * previewed.
 *
 * Permissions mirror routes/dispatch.js: reading needs fab_erp_taskqueue_view
 * (the route gate), confirming needs fab_erp_projects_manage. Admins bypass both
 * on the backend, so isAdminRole is OR'd in here the same way TaskQueue.tsx does
 * it — otherwise an admin without the explicit grant sees no button for an
 * action they are allowed to perform.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
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
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';

import { useAuth } from '@core/contexts/AuthContext';
import { usePermission } from '@core/hooks/usePermission';
import { isAdminRole } from '@core/utils/roles';

import {
  getDispatchPreview,
  getDispatchLatest,
  confirmDispatchRun,
  type DispatchMachine,
  type DispatchPreviewResponse,
  type DispatchLatestResponse,
  type DispatchRunMachine,
  type DispatchTask,
  type DispatchRunTask,
} from '../api/client';
import {
  PageHeader, Surface, SectionCard, EmptyState, ListSkeleton, Mono, DateCell,
  useToast, backendMessage,
} from '../components';

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 25;

/** One order that would appear on the run, as shown in the confirmation. */
interface OrderOnRun {
  orderId: number;
  orderNumber: string | null;
  requiredDate: string | null;
  taskCount: number;
}

/**
 * Whole days between today and a required date, or null when there is no date.
 * Both sides are floored to midnight local — a due date is a day, not an
 * instant, and comparing the raw timestamps makes "due today" read as overdue.
 */
function daysUntil(requiredDate: string | null): number | null {
  if (!requiredDate) return null;
  const due = new Date(requiredDate);
  if (Number.isNaN(due.getTime())) return null;
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((dueDay - today) / 86_400_000);
}

/** "8 days late" / "due today" / "in 12 days", with the tone that goes with it. */
function DueLabel({ requiredDate }: { requiredDate: string | null }) {
  const days = daysUntil(requiredDate);
  if (days === null) {
    return <Box component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>no required date</Box>;
  }
  const text = days < 0 ? `${Math.abs(days)} days late` : days === 0 ? 'due today' : `in ${days} days`;
  const color = days < 0 ? 'var(--c-danger-600)' : days <= 3 ? 'var(--c-warning-600)' : 'var(--c-text-3)';
  return <Box component="span" sx={{ fontSize: 12, color, fontWeight: days <= 3 ? 600 : 400 }}>{text}</Box>;
}

function RankBadge({ rank, frozen = false }: { rank: number; frozen?: boolean }) {
  return (
    <Box
      sx={{
        flexShrink: 0,
        width: 24,
        height: 24,
        borderRadius: 'var(--r-sm)',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'var(--font-mono)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 12,
        fontWeight: 600,
        background: frozen ? 'var(--c-surface-3)' : 'var(--c-primary-50)',
        color: frozen ? 'var(--c-text-2)' : 'var(--c-primary-700)',
        border: frozen ? '1px solid var(--c-border)' : 'none',
      }}
    >
      {rank}
    </Box>
  );
}

/** Shared row chrome — the two panels differ in data, not in layout. */
function DispatchRow({
  rank,
  frozen,
  headline,
  meta,
  reason,
}: {
  rank: number;
  frozen?: boolean;
  headline: string;
  meta: ReactNode;
  reason: string | null;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1.5,
        px: 2,
        py: 1.25,
        alignItems: 'flex-start',
        borderTop: '1px solid var(--c-divider)',
        '&:first-of-type': { borderTop: 'none' },
      }}
    >
      <RankBadge rank={rank} frozen={frozen} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>
          {headline}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.25 }}>
          {meta}
        </Box>
        {/* The backend composes this string ("priority #1 · 42.1 days spare ·
            critical chain") precisely so the ranking can defend itself. Show it
            verbatim — re-deriving it here would let the two drift. */}
        {reason && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.4 }}>{reason}</Typography>
        )}
      </Box>
    </Box>
  );
}

function PreviewMachineCard({ machine }: { machine: DispatchMachine }) {
  return (
    <Surface e={1} sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25,
          borderBottom: '1px solid var(--c-divider)', background: 'var(--c-surface-2)',
        }}
      >
        <PrecisionManufacturingRounded sx={{ fontSize: 17, color: 'var(--c-text-3)' }} aria-hidden />
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', flex: 1, minWidth: 0 }}>
          {machine.resourceName ?? `Machine #${machine.resourceId}`}
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
          {machine.tasks.length} {machine.tasks.length === 1 ? 'task' : 'tasks'}
        </Typography>
      </Box>
      {machine.tasks.map((t: DispatchTask) => (
        <DispatchRow
          key={t.id}
          rank={t.rank}
          headline={t.itemName ?? `Item on task #${t.id}`}
          reason={t.reason}
          meta={
            <>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                {t.operationName ?? 'Operation —'}
              </Typography>
              <Mono chip>{t.orderNumber ?? `Order #${t.orderId ?? '?'}`}</Mono>
              {t.seqNo != null && (
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>seq {t.seqNo}</Typography>
              )}
              {/* The delivery date is the reason this task is ranked where it
                  is, so it belongs on the row rather than one click away. */}
              {t.requiredDate && <DateCell value={t.requiredDate} />}
              <DueLabel requiredDate={t.requiredDate} />
            </>
          }
        />
      ))}
    </Surface>
  );
}

function RunMachineCard({ machine }: { machine: DispatchRunMachine }) {
  return (
    <Surface e={0} sx={{ overflow: 'hidden', background: 'var(--c-surface-2)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, borderBottom: '1px solid var(--c-divider)' }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', flex: 1, minWidth: 0 }}>
          {machine.resourceName ?? `Machine #${machine.resourceId}`}
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
          {machine.tasks.length} {machine.tasks.length === 1 ? 'task' : 'tasks'}
        </Typography>
      </Box>
      {machine.tasks.map((t: DispatchRunTask) => (
        <DispatchRow
          key={t.taskId}
          rank={t.rank}
          frozen
          headline={t.operationName ?? `Task #${t.taskId}`}
          reason={t.reason}
          meta={
            <>
              <Mono chip>{t.orderNumber ?? `Order #${t.orderId ?? '?'}`}</Mono>
              {t.seqNo != null && (
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>seq {t.seqNo}</Typography>
              )}
            </>
          }
        />
      ))}
    </Surface>
  );
}

/**
 * The gate on POST /dispatch/confirm. Deliberately not a bare confirm: the
 * planner is agreeing to a specific list against specific delivery dates, and
 * "are you sure?" gives them nothing to check that against.
 */
function ConfirmRunDialog({
  open,
  machineCount,
  taskCount,
  orders,
  limitPerMachine,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  machineCount: number;
  taskCount: number;
  orders: OrderOnRun[];
  limitPerMachine: number;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Run dispatch</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
          This records a confirmed dispatch run: up to {limitPerMachine} tasks per machine become the
          agreed order of work. Nothing is started and no task is reassigned — the run is the
          instruction, not the execution.
        </Typography>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 1 }}>
          The server recomputes the ranking as it saves, so the stored run can differ slightly from
          the preview if work has moved in the meantime. What was actually saved is reported back.
        </Typography>

        <Box sx={{ display: 'flex', gap: 3, mt: 2, mb: 2 }}>
          <Box>
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>Machines</Typography>
            <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: 'var(--c-text)' }}>
              {machineCount}
            </Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>Tasks</Typography>
            <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: 'var(--c-text)' }}>
              {taskCount}
            </Typography>
          </Box>
        </Box>

        <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.75 }}>
          Projects on this run
        </Typography>
        {orders.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>
            No orders — there is nothing to record.
          </Typography>
        ) : (
          <Surface e={0} sx={{ background: 'var(--c-surface-2)', overflow: 'hidden' }}>
            {orders.map((o) => (
              <Box
                key={o.orderId}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1,
                  borderTop: '1px solid var(--c-divider)', '&:first-of-type': { borderTop: 'none' },
                }}
              >
                <Mono sx={{ fontSize: 12.5, color: 'var(--c-text)', flex: 1, minWidth: 0 }}>
                  {o.orderNumber ?? `Order #${o.orderId}`}
                </Mono>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                  {o.taskCount} {o.taskCount === 1 ? 'task' : 'tasks'}
                </Typography>
                <DateCell value={o.requiredDate} />
                <Box sx={{ minWidth: 92, textAlign: 'right' }}>
                  <DueLabel requiredDate={o.requiredDate} />
                </Box>
              </Box>
            ))}
          </Surface>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          disabled={busy || taskCount === 0}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <PlayArrowRounded fontSize="small" />}
        >
          {busy ? 'Recording…' : 'Confirm and record run'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Dispatch() {
  const { toast } = useToast();
  const { user } = useAuth();
  // Admins bypass MANAGE_TAG on the backend, so OR it in — usePermission has to
  // be called unconditionally (rules-of-hooks), hence the two-step.
  const hasManageTag = usePermission('fab_erp_projects_manage');
  const canRun = isAdminRole(user?.role) || hasManageTag;

  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [preview, setPreview] = useState<DispatchPreviewResponse | null>(null);
  const [latest, setLatest] = useState<DispatchLatestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showIdle, setShowIdle] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  /**
   * One loader for both panels. The preview failing must not cost the user the
   * last confirmed run (or vice versa) — that record is the more valuable of
   * the two when something is wrong, so the two results are settled
   * independently and each failure is reported on its own.
   */
  const load = useCallback(async (limitPerMachine: number) => {
    setLoading(true);
    setError('');
    const [previewRes, latestRes] = await Promise.allSettled([
      getDispatchPreview(limitPerMachine),
      getDispatchLatest(),
    ]);

    const problems: string[] = [];
    if (previewRes.status === 'fulfilled') setPreview(previewRes.value);
    else problems.push(backendMessage(previewRes.reason, 'Failed to compute the dispatch preview.'));

    if (latestRes.status === 'fulfilled') setLatest(latestRes.value);
    else problems.push(backendMessage(latestRes.reason, 'Failed to load the last confirmed run.'));

    if (problems.length) setError(problems.join(' '));
    setLoading(false);
  }, []);

  // Debounced so dragging the number field's spinner doesn't fire a recompute
  // per keystroke — the preview is a non-trivial query per machine.
  useEffect(() => {
    const id = setTimeout(() => { void load(limit); }, 300);
    return () => clearTimeout(id);
  }, [limit, load]);

  const machinesWithWork = useMemo(
    () => (preview?.machines ?? []).filter((m) => m.tasks.length > 0),
    [preview],
  );
  const idleMachines = useMemo(
    () => (preview?.machines ?? []).filter((m) => m.tasks.length === 0),
    [preview],
  );
  const previewTaskCount = useMemo(
    () => machinesWithWork.reduce((n, m) => n + m.tasks.length, 0),
    [machinesWithWork],
  );

  /**
   * Distinct orders on the preview, soonest required date first (undated last).
   * This is what the confirmation shows: the planner is agreeing to a set of
   * delivery commitments, and the order numbers alone do not say that.
   */
  const ordersOnRun = useMemo<OrderOnRun[]>(() => {
    const byOrder = new Map<number, OrderOnRun>();
    for (const machine of machinesWithWork) {
      for (const task of machine.tasks) {
        if (task.orderId == null) continue;
        const existing = byOrder.get(task.orderId);
        if (existing) existing.taskCount += 1;
        else byOrder.set(task.orderId, {
          orderId: task.orderId,
          orderNumber: task.orderNumber,
          requiredDate: task.requiredDate,
          taskCount: 1,
        });
      }
    }
    return [...byOrder.values()].sort((a, b) => {
      if (!a.requiredDate) return b.requiredDate ? 1 : 0;
      if (!b.requiredDate) return -1;
      return a.requiredDate.localeCompare(b.requiredDate);
    });
  }, [machinesWithWork]);

  const skipped = preview?.skipped;
  const skippedTotal = (skipped?.blocked ?? 0) + (skipped?.claimed ?? 0);

  const handleConfirm = useCallback(async () => {
    setConfirmBusy(true);
    setConfirmError('');
    try {
      const res = await confirmDispatchRun(limit);
      toast(`Dispatch run #${res.runId} recorded — ${res.taskCount} tasks.`, 'success');
      setConfirmOpen(false);
      await load(limit);
    } catch (e) {
      // Stay open with the numbers still on screen: the planner needs to see
      // what they were agreeing to when deciding whether to retry.
      setConfirmError(backendMessage(e, 'Failed to record the dispatch run.'));
    } finally {
      setConfirmBusy(false);
    }
  }, [limit, load, toast]);

  const run = latest?.run ?? null;
  const confirmedByLabel = run?.confirmedBy == null
    ? 'unknown'
    : run.confirmedBy === user?.id ? 'you' : `user #${run.confirmedBy}`;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <PageHeader
        title="Dispatch"
        subtitle="What each machine should pick up next, ranked by how much trouble its order is in."
        actions={
          <>
            <Button
              size="small"
              startIcon={<RefreshRounded fontSize="small" />}
              onClick={() => void load(limit)}
              disabled={loading}
            >
              Refresh
            </Button>
            {canRun && (
              <Button
                size="small"
                variant="contained"
                startIcon={<PlayArrowRounded fontSize="small" />}
                onClick={() => { setConfirmError(''); setConfirmOpen(true); }}
                disabled={loading || previewTaskCount === 0}
              >
                Run dispatch
              </Button>
            )}
          </>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Surface e={1} sx={{ p: 2, mb: 2.5, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          label="Tasks per machine"
          type="number"
          size="small"
          value={limit}
          onChange={(e) => {
            const n = Number(e.target.value);
            // Clamped here as well as on the backend so the field can never
            // display a number the preview did not actually use.
            if (!Number.isFinite(n)) return;
            setLimit(Math.min(MAX_LIMIT, Math.max(1, Math.floor(n))));
          }}
          inputProps={{ min: 1, max: MAX_LIMIT, step: 1 }}
          sx={{ width: 170 }}
          helperText={`1–${MAX_LIMIT}`}
        />
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: 1, minWidth: 220 }}>
          {loading
            ? 'Computing…'
            : `${previewTaskCount} ${previewTaskCount === 1 ? 'task' : 'tasks'} ranked across ${machinesWithWork.length} ${machinesWithWork.length === 1 ? 'machine' : 'machines'}.`}
        </Typography>
      </Surface>

      {skippedTotal > 0 && (
        <Alert severity="info" sx={{ mb: 2.5 }}>
          {skipped?.blocked ?? 0} {(skipped?.blocked ?? 0) === 1 ? 'task was' : 'tasks were'} left
          out because the machine&rsquo;s output buffer is full, and {skipped?.claimed ?? 0}{' '}
          {(skipped?.claimed ?? 0) === 1 ? 'was' : 'were'} already claimed by another machine of the
          same type.
        </Alert>
      )}

      <SectionCard
        title="Recommended now"
        subtitle="Computed fresh on every load. Nothing here is recorded until you run dispatch."
        flush
      >
        <Box sx={{ p: 2 }}>
          {loading ? (
            <ListSkeleton rows={4} />
          ) : machinesWithWork.length === 0 ? (
            <EmptyState
              icon={<PrecisionManufacturingRounded />}
              title="No machine has eligible work"
              hint="Tasks appear here once their predecessors are done and their materials are in place. Check the task queue for what is still blocked."
            />
          ) : (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 1.5 }}>
                {machinesWithWork.map((m) => <PreviewMachineCard key={m.resourceId} machine={m} />)}
              </Box>

              {/* Eleven empty cards say nothing eleven times. One line says it once. */}
              {idleMachines.length > 0 && (
                <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
                    {idleMachines.length} {idleMachines.length === 1 ? 'machine has' : 'machines have'} no
                    eligible work.
                  </Typography>
                  <Button size="small" variant="text" onClick={() => setShowIdle((v) => !v)}>
                    {showIdle ? 'Hide' : 'Which?'}
                  </Button>
                  {showIdle && (
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', width: '100%' }}>
                      {idleMachines.map((m) => m.resourceName ?? `Machine #${m.resourceId}`).join(' · ')}
                    </Typography>
                  )}
                </Box>
              )}
            </>
          )}
        </Box>
      </SectionCard>

      <Box sx={{ mt: 2.5 }}>
        <SectionCard
          title="Last confirmed run"
          subtitle={
            run
              ? <>Confirmed <DateCell value={run.confirmedAt} withTime /> by {confirmedByLabel} · {run.taskCount} tasks · {run.machineCount} machines</>
              : 'Nothing has been confirmed yet.'
          }
          flush
        >
          <Box sx={{ p: 2 }}>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1.5 }}>
              This is what was agreed, stored exactly as it was ranked at the time. The panel above is
              what the system recommends right now — the two drift apart as work is completed and
              orders move, and that gap is the thing worth looking at.
            </Typography>

            {loading ? (
              <ListSkeleton rows={2} />
            ) : !run ? (
              <EmptyState
                title="No dispatch has been confirmed"
                hint={canRun
                  ? 'Run dispatch above to record the first one.'
                  : 'A planner with the projects-manage permission records these.'}
              />
            ) : latest && latest.machines.length === 0 ? (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>
                This run recorded no per-machine tasks.
              </Typography>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 1.5 }}>
                {(latest?.machines ?? []).map((m) => <RunMachineCard key={m.resourceId} machine={m} />)}
              </Box>
            )}
          </Box>
        </SectionCard>
      </Box>

      <ConfirmRunDialog
        open={confirmOpen}
        machineCount={machinesWithWork.length}
        taskCount={previewTaskCount}
        orders={ordersOnRun}
        limitPerMachine={limit}
        busy={confirmBusy}
        error={confirmError}
        onCancel={() => { if (!confirmBusy) setConfirmOpen(false); }}
        onConfirm={handleConfirm}
      />
    </Box>
  );
}
