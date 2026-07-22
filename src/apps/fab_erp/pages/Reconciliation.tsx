/**
 * Reconciliation.tsx — EU-13: Reconciliation feed + unexplained-idle prompt.
 *
 * One list of "things a supervisor should look at" — computed live on every
 * load from GET /reconciliation/feed (no nightly job; see the backend route
 * for exactly which anomalies are implemented vs. stubbed/skipped). Each card
 * gets a one-tap resolution appropriate to its type:
 *   - unexplainedIdle: 4 reason buttons → POST /reconciliation/resolve
 *     (writes a state_note annotation; does NOT reclassify the wait segment
 *     — see the backend route's comment for why).
 *   - longRunning: "Adjust times" reopens the existing LogPastWorkDialog
 *     (EU-11) against this task, so a stuck-looking task can be corrected
 *     without leaving the page.
 *   - stuckBuffer: "Move" calls POST /buffers/move directly (EU-7's
 *     one-tap-move endpoint) with just the contentId, letting the backend
 *     auto-resolve the destination buffer — there is no standalone Buffer
 *     Board frontend page yet to link out to, so this in-place action is
 *     more useful than a dead link (see the ticket report for this
 *     deviation).
 *
 * NAV BADGE: GET /reconciliation/count is exposed via api/client.ts, but the
 * shared Sidebar has no dynamic-badge mechanism to plug it into without
 * touching Sidebar.tsx (out of scope / do-not-touch for this ticket), so the
 * count is instead shown as a header stat on this page itself.
 */

import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Alert, Typography } from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import HourglassEmptyRounded from '@mui/icons-material/HourglassEmptyRounded';
import TimerRounded from '@mui/icons-material/TimerRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';

import {
  fabPost,
  getReconciliationFeed,
  resolveAnomaly,
  type ReconciliationAnomaly,
} from '../api/client';
import { PageHeader, Surface, EmptyState, useToast } from '../components';
import { LogPastWorkDialog, type LogPastWorkTask } from '../components/LogPastWorkDialog';

function errMsg(e: unknown, fallback: string): string {
  const ax = e as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.message ?? fallback;
}

const IDLE_REASONS = ['Waiting on instructions', 'Break/shift change', 'Material issue', 'Other'];

const TYPE_STYLE: Record<ReconciliationAnomaly['type'], { icon: React.ReactNode; bg: string; fg: string; label: string }> = {
  unexplainedIdle: { icon: <HourglassEmptyRounded sx={{ fontSize: 20 }} />, bg: 'var(--c-warning-50)', fg: 'var(--c-warning-800)', label: 'Unexplained idle' },
  longRunning: { icon: <TimerRounded sx={{ fontSize: 20 }} />, bg: 'var(--c-danger-50)', fg: 'var(--c-danger-800)', label: 'Long running' },
  stuckBuffer: { icon: <Inventory2Rounded sx={{ fontSize: 20 }} />, bg: 'var(--c-neutral-50)', fg: 'var(--c-neutral-800)', label: 'Stuck buffer' },
};

function AnomalyCard({
  anomaly,
  busy,
  onResolveIdle,
  onAdjustTimes,
  onMoveBuffer,
}: {
  anomaly: ReconciliationAnomaly;
  busy: boolean;
  onResolveIdle: (a: ReconciliationAnomaly, reason: string) => void;
  onAdjustTimes: (a: ReconciliationAnomaly) => void;
  onMoveBuffer: (a: ReconciliationAnomaly) => void;
}) {
  const style = TYPE_STYLE[anomaly.type];

  return (
    <Surface e={1} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
        <Box
          sx={{
            width: 36, height: 36, borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center',
            background: style.bg, color: style.fg, flexShrink: 0,
          }}
        >
          {style.icon}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              label={style.label}
              sx={{ fontSize: 11, height: 20, background: style.bg, color: style.fg, fontWeight: 600 }}
            />
          </Box>
          <Typography sx={{ fontSize: 14, fontWeight: 500, color: 'var(--c-text)', mt: 0.5 }}>
            {anomaly.label}
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.25 }}>
            {anomaly.detail}
          </Typography>
        </Box>
      </Box>

      {anomaly.type === 'unexplainedIdle' && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
          {IDLE_REASONS.map((reason) => (
            <Button
              key={reason}
              size="small"
              variant="outlined"
              disabled={busy}
              onClick={() => onResolveIdle(anomaly, reason)}
              sx={{ fontSize: 12.5, py: 0.75, px: 1.5 }}
            >
              {reason}
            </Button>
          ))}
        </Box>
      )}

      {anomaly.type === 'longRunning' && (
        <Box sx={{ mt: 0.5 }}>
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<TimerRounded fontSize="small" />}
            disabled={busy}
            onClick={() => onAdjustTimes(anomaly)}
          >
            Adjust times
          </Button>
        </Box>
      )}

      {anomaly.type === 'stuckBuffer' && (
        <Box sx={{ mt: 0.5 }}>
          <Button
            size="small"
            variant="outlined"
            disabled={busy}
            onClick={() => onMoveBuffer(anomaly)}
          >
            Move
          </Button>
        </Box>
      )}
    </Surface>
  );
}

export default function Reconciliation() {
  const { toast } = useToast();
  const [anomalies, setAnomalies] = useState<ReconciliationAnomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [adjustTask, setAdjustTask] = useState<LogPastWorkTask | null>(null);

  const keyOf = (a: ReconciliationAnomaly) =>
    `${a.type}:${a.taskId ?? ''}:${a.segmentId ?? ''}:${a.contentId ?? ''}`;

  const load = useCallback(async () => {
    try {
      const res = await getReconciliationFeed();
      setAnomalies(res.anomalies ?? []);
      setError('');
    } catch (e) {
      setError(errMsg(e, 'Failed to load the reconciliation feed.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const manualRefresh = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  const handleResolveIdle = useCallback(async (a: ReconciliationAnomaly, reason: string) => {
    if (a.taskId == null) return;
    const key = keyOf(a);
    setBusyKey(key);
    try {
      await resolveAnomaly({ type: 'unexplainedIdle', taskId: a.taskId, segmentId: a.segmentId, reason });
      toast('Idle time annotated.', 'success');
      await load();
    } catch (e) {
      toast(errMsg(e, 'Failed to resolve anomaly.'), 'error');
    } finally {
      setBusyKey(null);
    }
  }, [load, toast]);

  const handleAdjustTimes = useCallback((a: ReconciliationAnomaly) => {
    if (a.taskId == null) return;
    setAdjustTask({
      id: a.taskId,
      operationName: a.operationName ?? null,
      operationId: null,
      startedAt: a.startedAt ?? null,
      completedAt: null,
    });
  }, []);

  const handleMoveBuffer = useCallback(async (a: ReconciliationAnomaly) => {
    if (a.contentId == null) return;
    const key = keyOf(a);
    setBusyKey(key);
    try {
      await fabPost('buffers/move', { contentId: a.contentId });
      toast('Buffer content moved.', 'success');
      await load();
    } catch (e) {
      toast(errMsg(e, 'Failed to move buffer content.'), 'error');
    } finally {
      setBusyKey(null);
    }
  }, [load, toast]);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <PageHeader
        title="Reconciliation"
        subtitle="Anomalies flagged from live shop-floor data — resolve them here or jump to the right screen."
        actions={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Chip
              size="small"
              icon={<FactCheckRounded sx={{ fontSize: 15 }} />}
              label={`${anomalies.length} ${anomalies.length === 1 ? 'anomaly' : 'anomalies'}`}
              sx={{ fontSize: 12.5, fontWeight: 600 }}
            />
            <Button size="small" startIcon={<RefreshRounded fontSize="small" />} onClick={manualRefresh} disabled={loading}>
              Refresh
            </Button>
          </Box>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Surface e={1} sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Surface>
      ) : anomalies.length === 0 ? (
        <EmptyState
          icon={<FactCheckRounded />}
          title="Nothing to reconcile"
          hint="No long-running tasks, stuck buffers, or unexplained idle time right now."
        />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {anomalies.map((a) => (
            <AnomalyCard
              key={keyOf(a)}
              anomaly={a}
              busy={busyKey === keyOf(a)}
              onResolveIdle={handleResolveIdle}
              onAdjustTimes={handleAdjustTimes}
              onMoveBuffer={handleMoveBuffer}
            />
          ))}
        </Box>
      )}

      <LogPastWorkDialog
        open={adjustTask !== null}
        task={adjustTask}
        mode="adjust"
        onClose={() => setAdjustTask(null)}
        onSaved={load}
      />
    </Box>
  );
}
