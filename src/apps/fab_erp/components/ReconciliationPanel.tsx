/**
 * ReconciliationPanel — the anomaly feed, shown inside Machine Timeline.
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
 *   - stuckBuffer: informational since 2026-08-05. Moving a piece IS starting
 *     its next operation, so there is no separate gesture to offer; the card
 *     names where the metal is and the queue is where it gets moved.
 *     (was: "Move" calling POST /buffers/move — EU-7's
 *     one-tap-move endpoint) with just the contentId, letting the backend
 *     auto-resolve the destination buffer — there is no standalone Buffer
 *     Board frontend page yet to link out to, so this in-place action is
 *     more useful than a dead link (see the ticket report for this
 *     deviation).
 *
 * Was its own screen until 2026-08-05. It is not a separate job from reading a
 * machine's day -- "what happened" and "what looks wrong" belong on one screen,
 * and the plan's shorthand for this fold ("Reconcile is only find the gaps")
 * undersold it: each anomaly type carries its own resolution, so a filter on the
 * timeline would have dropped the actions entirely.
 *
 * NAV BADGE: GET /reconciliation/count is exposed via api/client.ts, but the
 * shared Sidebar has no dynamic-badge mechanism to plug it into without
 * touching Sidebar.tsx (out of scope / do-not-touch for this ticket), so the
 * count is instead shown as a header stat on this page itself.
 */

import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Chip, Alert, Dialog, DialogContent, DialogTitle, DialogActions, Typography } from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import HourglassEmptyRounded from '@mui/icons-material/HourglassEmptyRounded';
import TimerRounded from '@mui/icons-material/TimerRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';

import {
  getReconciliationFeed,
  type ReconciliationAnomaly,
} from '../api/client';
import { Surface, EmptyState, ListSkeleton } from '../components';
import { GapTable } from './GapTable';
import { LogPastWorkDialog, type LogPastWorkTask } from '../components/LogPastWorkDialog';

function errMsg(e: unknown, fallback: string): string {
  const ax = e as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.message ?? fallback;
}


const TYPE_STYLE: Record<ReconciliationAnomaly['type'], { icon: React.ReactNode; bg: string; fg: string; label: string }> = {
  unexplainedIdle: { icon: <HourglassEmptyRounded sx={{ fontSize: 20 }} />, bg: 'var(--c-warning-50)', fg: 'var(--c-warning-800)', label: 'Unexplained idle' },
  longRunning: { icon: <TimerRounded sx={{ fontSize: 20 }} />, bg: 'var(--c-danger-50)', fg: 'var(--c-danger-800)', label: 'Long running' },
  stuckBuffer: { icon: <Inventory2Rounded sx={{ fontSize: 20 }} />, bg: 'var(--c-neutral-50)', fg: 'var(--c-neutral-800)', label: 'Stuck buffer' },
};

function AnomalyCard({
  anomaly,
  onAccountForDay,
  onAdjustTimes,
}: {
  anomaly: ReconciliationAnomaly;
  onAccountForDay: (a: ReconciliationAnomaly) => void;
  onAdjustTimes: (a: ReconciliationAnomaly) => void;
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

      {/*
        This used to be four reason buttons that wrote a `state_note` and left
        the segment reading `unexplained_idle` forever — the same stall could be
        explained every day and the number never moved. A form that visibly
        changes nothing stops being filled in honestly, and these streams are
        shared, so that belief spreads into the production timing everything
        else is estimated from.

        It now opens the gap table for that machine's day, which writes a real
        event and genuinely removes the segment.
      */}
      {anomaly.type === 'unexplainedIdle' && anomaly.resourceId && (
        <Box sx={{ mt: 0.5 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<HourglassEmptyRounded sx={{ fontSize: 16 }} />}
            onClick={() => onAccountForDay(anomaly)}
            sx={{ fontSize: 12.5, py: 0.75, px: 1.5 }}
          >
            Account for this time
          </Button>
        </Box>
      )}

      {anomaly.type === 'longRunning' && (
        <Box sx={{ mt: 0.5 }}>
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<TimerRounded fontSize="small" />}
            onClick={() => onAdjustTimes(anomaly)}
          >
            Adjust times
          </Button>
        </Box>
      )}

    </Surface>
  );
}

export default function ReconciliationPanel() {
  const [anomalies, setAnomalies] = useState<ReconciliationAnomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adjustTask, setAdjustTask] = useState<LogPastWorkTask | null>(null);
  const [accountFor, setAccountFor] = useState<{ resourceId: number; date: string } | null>(null);

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

  // Opens the gap table on the machine-day this idle belongs to. The old
  // handler wrote a state_note and left the segment unchanged; explaining a
  // stall has to actually remove it or the exercise is theatre.
  const handleAccountForDay = useCallback((a: ReconciliationAnomaly) => {
    if (!a.resourceId || !a.segStart) return;
    // The segment's own start decides the sheet, so the user lands on the day
    // the idle is on rather than today.
    setAccountFor({ resourceId: a.resourceId, date: String(a.segStart).slice(0, 10) });
  }, []);

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


  return (
    <Surface e={1} sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>Needs attention</Typography>
        {
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
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <ListSkeleton rows={5} />
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
              onAccountForDay={handleAccountForDay}
              onAdjustTimes={handleAdjustTimes}
            />
          ))}
        </Box>
      )}

      <Dialog open={!!accountFor} onClose={() => { setAccountFor(null); void load(); }} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pb: 0.5 }}>Account for the day</DialogTitle>
        <DialogContent>
          {accountFor && (
            <GapTable resourceId={accountFor.resourceId} date={accountFor.date} onChanged={load} />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button size="small" onClick={() => { setAccountFor(null); void load(); }}>Done</Button>
        </DialogActions>
      </Dialog>

      <LogPastWorkDialog
        open={adjustTask !== null}
        task={adjustTask}
        mode="adjust"
        onClose={() => setAdjustTask(null)}
        onSaved={load}
      />
    </Surface>
  );
}
