/**
 * MachineBoard.tsx — EU-4 (Shop-Floor Time Intelligence): live machine state
 * board. One card per fab_resources row, showing effective state (running /
 * idle / down / off), the current in_progress task (if any), and assigned
 * operators. Clicking a card opens a bottom sheet with the state-change
 * actions (Mark Down / Back Up / Mark Off) and per-operator absence toggles.
 *
 * Polls GET /machines/board every 30s while the tab is visible. Read from
 * multi_app_be/apps/fab_erp/routes/machineState.js — see that file for the
 * exact response contract.
 *
 * EU-9: each card also shows two small read-only buffer gauges (input/output),
 * fed by one GET /buffers/board call for the whole board. Load is derived from
 * the WIP pieces standing at the machine's stock area; a gauge reads — when
 * the buffer has no capacity configured, which is not the same as empty.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Drawer, IconButton, TextField, Tooltip, Typography,
} from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import PowerSettingsNewRounded from '@mui/icons-material/PowerSettingsNewRounded';
import ReportProblemRounded from '@mui/icons-material/ReportProblemRounded';
import PlayCircleRounded from '@mui/icons-material/PlayCircleRounded';
import PersonOffRounded from '@mui/icons-material/PersonOffRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import HistoryEduRounded from '@mui/icons-material/HistoryEduRounded';

import { fabGet, fabPost, getBufferBoard, type BufferBoardMachine, type BufferKind, type BufferSide, type BufferStatus } from '../api/client';
import { useCompanySlug } from '../hooks/useCompanySlug';
import { PageHeader, Surface, EmptyState, useToast, CardGridSkeleton, LiveIndicator, useLiveRefresh, useNowTick, CrewPanel } from '../components';

// ── Types — mirror GET /machines/board response exactly ────────────────────

type MachineState = 'running' | 'idle' | 'down' | 'off';

interface CurrentTask {
  id: number;
  operationName: string | null;
  itemName: string | null;
  /** Piece mark — what's painted on the steel (Issue 2). */
  itemMark: string | null;
  startedAt: string | null;
  /**
   * How many tasks are in progress on this machine. Since batching was removed
   * (2026-08-05) there is no legitimate way for this to exceed 1 — anything
   * higher is a double-booking.
   */
  taskCount: number;
}

interface Operator {
  userId: number;
  name: string;
  isPrimary: boolean;
  absentToday: boolean;
}

interface MachineBoardItem {
  id: number;
  name: string;
  code: string;
  plantId: number | null;
  resourceTypeId: number | null;
  effectiveState: MachineState;
  explicitState: MachineState;
  reasonCode: string | null;
  stateSince: string | null;
  currentTask: CurrentTask | null;
  operators: Operator[];
}

interface BoardResponse {
  ok: boolean;
  machines: MachineBoardItem[];
}

interface DowntimeReason {
  code: string;
  label: string;
}

interface ReasonsResponse {
  ok: boolean;
  reasons: DowntimeReason[];
}

function errMsg(e: unknown, fallback: string): string {
  const ax = e as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.message ?? fallback;
}

const STATE_STYLE: Record<MachineState, { bg: string; fg: string; label: string }> = {
  running: { bg: 'var(--c-success-50)', fg: 'var(--c-success-800)', label: 'Running' },
  idle: { bg: 'var(--c-neutral-50)', fg: 'var(--c-neutral-800)', label: 'Idle' },
  down: { bg: 'var(--c-danger-50)', fg: 'var(--c-danger-800)', label: 'Down' },
  off: { bg: 'var(--c-neutral-800)', fg: '#FFFFFF', label: 'Off' },
};

function StateChip({ state }: { state: MachineState }) {
  const s = STATE_STYLE[state];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex', alignItems: 'center', background: s.bg, color: s.fg,
        borderRadius: 'var(--r-sm)', padding: '3px 10px', fontSize: 12, fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </Box>
  );
}

/**
 * Elapsed run time. Takes `now` from the page's shared tick rather than
 * calling Date.now() itself: computed once at render, the value froze until the
 * next fetch, so a card could claim "12m elapsed" half an hour later. A frozen
 * timer on a shop-floor board is worse than none, because it still looks live.
 */
function formatElapsed(startedAt: string | null, now: number): string {
  if (!startedAt) return '';
  const startMs = new Date(startedAt).getTime();
  if (isNaN(startMs)) return '';
  const diffMin = Math.max(0, Math.floor((now - startMs) / 60000));
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Buffer gauges (EU-9) ─────────────────────────────────────────────────────

const BUFFER_STATUS_FILL: Record<BufferStatus, string> = {
  ok: 'var(--c-primary-400)',
  warn: 'var(--c-warning-800)',
  block: 'var(--c-danger-800)',
};

/**
 * Small thin-bar gauge for one buffer side. Renders "—" when the machine has no
 * buffer of this kind, and now also when the buffer exists but has no capacity
 * set: an unmeasured buffer is not an empty one, and drawing it at 0% made a
 * machine nobody had configured look like it had room.
 *
 * Read-only since 2026-08-05. It used to open a sheet listing the buffer's
 * contents with a per-row Move; contents come from the WIP pieces at the
 * machine's stock area now, and those move when the next operation starts.
 */
function BufferGauge({ kind, side }: { kind: BufferKind; side: BufferSide | null }) {
  const label = kind === 'input' ? 'In' : 'Out';

  if (!side || side.pct == null) {
    return (
      <Box sx={{ flex: 1, px: 1, py: 0.6, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)', opacity: 0.7 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-3)' }}>{label}</Typography>
          <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>—</Typography>
        </Box>
      </Box>
    );
  }

  const fill = BUFFER_STATUS_FILL[side.status];
  const pct = Math.max(0, Math.min(100, side.pct));

  return (
    <Tooltip
      title={`${label} buffer: ${side.load}${side.capacity != null ? ` / ${side.capacity}` : ''} (${side.status})`}
      arrow
    >
      <Box
        sx={{ flex: 1, px: 1, py: 0.6, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)' }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-2)' }}>{label}</Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-2)' }}>{Math.round(side.pct)}%</Typography>
        </Box>
        <Box sx={{ mt: 0.4, height: 4, borderRadius: 2, background: 'var(--c-border)', overflow: 'hidden' }}>
          <Box sx={{ width: `${pct}%`, height: '100%', background: fill }} />
        </Box>
      </Box>
    </Tooltip>
  );
}

/*
 * BufferContentsSheet listed a buffer's open fab_buffer_contents rows with a
 * per-row Move button. Both are gone: what a machine holds is now derived from
 * the WIP pieces standing at its stock area, and those move when the next
 * operation starts. The gauges still show how full a machine is; the pieces
 * themselves are listed on the Stock screen, which reads the same rows.
 */

// ── Machine card ─────────────────────────────────────────────────────────────

function MachineCard({
  machine,
  bufferEntry,
  now,
  onClick,
}: {
  machine: MachineBoardItem;
  bufferEntry: BufferBoardMachine | undefined;
  /** Shared tick, so every card's elapsed timer advances in lockstep. */
  now: number;
  onClick: () => void;
}) {
  const task = machine.currentTask;
  // More than one task in progress on a single machine is a double-booking.
  // This used to exempt tasks sharing a batch; batching is gone, so any count
  // above one is a conflict again.
  const doubleBooked = !!task && task.taskCount > 1;

  return (
    <Surface
      e={1}
      onClick={onClick}
      sx={{
        cursor: 'pointer', display: 'flex', overflow: 'hidden',
        transition: 'box-shadow var(--t-fast) var(--ease), transform var(--t-fast) var(--ease)',
        '&:hover': { boxShadow: 'var(--e-2)', transform: 'translateY(-1px)' },
      }}
    >
      {/* State rail. The board is a wall display as much as a screen: from six
          feet away nobody reads a chip, they read colour. A 4px bar down the
          edge of every card turns the grid into something you can scan for
          "what's down" without reading a word. The chip stays — colour alone is
          never the only carrier (DESIGN_SYSTEM.md §6). */}
      <Box
        sx={{
          width: 4, flexShrink: 0, alignSelf: 'stretch',
          background: `var(--c-state-${machine.effectiveState})`,
        }}
      />

      <Box sx={{ p: 2, pl: 1.75, display: 'flex', flexDirection: 'column', gap: 1.25, flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1.3 }}>
              {machine.name}
            </Typography>
            <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--c-text-3)' }}>
              {machine.code}
            </Typography>
          </Box>
          <StateChip state={machine.effectiveState} />
        </Box>

        {(machine.effectiveState === 'down' || machine.effectiveState === 'off') && task && (
          <Alert severity="warning" sx={{ py: 0, fontSize: 11.5 }}>
            Marked {machine.effectiveState} while a task is still assigned — data conflict.
          </Alert>
        )}
        {doubleBooked && (
          <Alert severity="warning" sx={{ py: 0, fontSize: 11.5 }}>
            {task.taskCount} tasks in progress on this machine — double-booked.
          </Alert>
        )}

        <Box sx={{ minHeight: 40 }}>
          {task ? (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text)' }}>
                  {task.operationName ?? 'Unnamed operation'}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                {/* The mark is what's painted on the part, so it leads. */}
                {[task.itemMark, task.itemName ?? 'Unknown item'].filter(Boolean).join(' · ')}
                {task.startedAt && ` · ${formatElapsed(task.startedAt, now)} elapsed`}
              </Typography>
            </>
          ) : (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>No task in progress</Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {machine.operators.length === 0 ? (
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>No operators assigned</Typography>
          ) : (
            machine.operators.map((op) => (
              <Chip
                key={op.userId}
                size="small"
                icon={op.absentToday ? <PersonOffRounded sx={{ fontSize: 14 }} /> : <PersonRounded sx={{ fontSize: 14 }} />}
                label={op.name}
                sx={{
                  fontSize: 11.5, height: 22,
                  background: op.absentToday ? 'var(--c-warning-50)' : 'var(--c-surface-2)',
                  color: op.absentToday ? 'var(--c-warning-800)' : 'var(--c-text-2)',
                }}
              />
            ))
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5 }}>
          <BufferGauge kind="input" side={bufferEntry?.input ?? null} />
          <BufferGauge kind="output" side={bufferEntry?.output ?? null} />
        </Box>
      </Box>
    </Surface>
  );
}

// ── Bottom sheet — state-change + operator-absence actions ─────────────────

function ActionSheet({
  machine,
  onClose,
  onDone,
}: {
  machine: MachineBoardItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const companySlug = useCompanySlug();
  const [busy, setBusy] = useState(false);
  const [markDownOpen, setMarkDownOpen] = useState(false);
  const [reasons, setReasons] = useState<DowntimeReason[]>([]);
  const [reasonCode, setReasonCode] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    fabGet<ReasonsResponse>('machines/downtime-reasons')
      .then((res) => { if (!cancelled) setReasons(res.reasons ?? []); })
      .catch(() => { /* reason list is a nice-to-have; leave empty on failure */ });
    return () => { cancelled = true; };
  }, []);

  const postState = useCallback(async (state: 'down' | 'off' | 'idle', extra?: { reason_code?: string; note?: string }) => {
    setBusy(true);
    try {
      await fabPost(`machines/${machine.id}/state`, { state, ...extra });
      toast(`${machine.name} marked ${state === 'idle' ? 'back up' : state}.`, 'success');
      onDone();
    } catch (e) {
      toast(errMsg(e, 'Failed to update machine state.'), 'error');
    } finally {
      setBusy(false);
    }
  }, [machine.id, machine.name, onDone, toast]);

  return (
    <Box sx={{ p: 2.5, pb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 600, color: 'var(--c-text)' }}>{machine.name}</Typography>
          <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--c-text-3)' }}>{machine.code}</Typography>
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseRounded fontSize="small" />
        </IconButton>
      </Box>

      {/* Everything below this point happens NOW — the state posted here is
          stamped at the current instant. Yesterday's breakdown, and the operator
          who wasn't in on Tuesday, belong in the shift log, which is the only
          screen that takes a date. */}
      <Button
        fullWidth
        variant="text"
        size="small"
        startIcon={<HistoryEduRounded fontSize="small" />}
        href={`/${companySlug}/fab_erp/shift-log`}
        sx={{ mb: 1.5, justifyContent: 'flex-start' }}
      >
        Log past downtime or absence →
      </Button>

      {/* Crew, editable here rather than on a settings screen — this is where
          someone actually notices that the roster is wrong. */}
      <Box sx={{ mb: 2, p: 1.5, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)' }}>
        <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1 }}>
          On this machine
        </Typography>
        <CrewPanel resourceId={machine.id} resourceName={machine.name} onChanged={onDone} />
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: markDownOpen ? 1.5 : 2.5 }}>
        <Button
          fullWidth
          variant={machine.explicitState === 'down' ? 'contained' : 'outlined'}
          color="error"
          startIcon={<ReportProblemRounded />}
          disabled={busy}
          onClick={() => setMarkDownOpen((v) => !v)}
          sx={{ py: 1.25 }}
        >
          Mark Down
        </Button>
        <Button
          fullWidth
          variant="outlined"
          color="success"
          startIcon={<PlayCircleRounded />}
          disabled={busy}
          onClick={() => postState('idle')}
          sx={{ py: 1.25 }}
        >
          Back Up
        </Button>
        <Button
          fullWidth
          variant={machine.explicitState === 'off' ? 'contained' : 'outlined'}
          color="inherit"
          startIcon={<PowerSettingsNewRounded />}
          disabled={busy}
          onClick={() => postState('off')}
          sx={{ py: 1.25 }}
        >
          Mark Off
        </Button>
      </Box>

      {markDownOpen && (
        <Surface e={0} sx={{ p: 1.5, mb: 2.5, background: 'var(--c-surface-2)' }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', mb: 1 }}>Reason (optional)</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.25 }}>
            {reasons.map((r) => (
              <Chip
                key={r.code}
                label={r.label}
                size="small"
                onClick={() => setReasonCode(r.code)}
                sx={{
                  fontSize: 12,
                  background: reasonCode === r.code ? 'var(--c-primary-100)' : 'var(--c-surface)',
                  color: reasonCode === r.code ? 'var(--c-primary-700)' : 'var(--c-text-2)',
                  border: `1px solid ${reasonCode === r.code ? 'var(--c-primary-200)' : 'var(--c-border)'}`,
                }}
              />
            ))}
          </Box>
          <TextField
            size="small"
            fullWidth
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            sx={{ mb: 1.25, background: 'var(--c-surface)' }}
          />
          <Button
            fullWidth
            variant="contained"
            color="error"
            disabled={busy}
            onClick={() => postState('down', { reason_code: reasonCode || undefined, note: note || undefined })}
          >
            Confirm Down
          </Button>
        </Surface>
      )}

      {/* The old per-operator "Absent today" list lived here. It wrote to
          fab_resource_operators.absent_on — a DATE, so it could only ever say
          "off for the whole day" — and nothing reads that table any more. The
          crew panel above replaces it and can express "left at 4" as well as
          "off today", because absence is now an interval. */}
    </Box>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MachineBoard() {
  const { toast } = useToast();
  const [machines, setMachines] = useState<MachineBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // EU-9: buffer board fetched once for the whole page (set-based, mirrors the
  // backend), then mapped by resourceId for O(1) lookup per card.
  const [bufferBoard, setBufferBoard] = useState<BufferBoardMachine[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fabGet<BoardResponse>('machines/board');
      setMachines(res.machines ?? []);
      setError('');
    } catch (e) {
      const msg = errMsg(e, 'Failed to load machine board.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBufferBoard = useCallback(async () => {
    try {
      const res = await getBufferBoard();
      setBufferBoard(res.machines ?? []);
    } catch {
      // buffer gauges are a nice-to-have overlay — leave them blank on failure
      // rather than blocking the (already-loaded) machine-state board.
    }
  }, []);

  const manualRefresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([load(), loadBufferBoard()]);
  }, [load, loadBufferBoard]);

  // Auto-refresh (§7.2). Replaces a hand-rolled setInterval that polled a
  // hidden tab all night, never showed the data's age, and couldn't be paused
  // — a board whose staleness is invisible reads as current when it isn't.
  const refreshBoth = useCallback(async () => {
    await Promise.all([load(), loadBufferBoard()]);
  }, [load, loadBufferBoard]);

  const live = useLiveRefresh(refreshBoth, { intervalMs: 30_000 });
  const now = useNowTick(15_000);

  // One-shot initial fetch, routed through the live hook so `lastUpdated` is
  // set from the very first paint. Without it the indicator reads
  // "Live · never" until the first 30s poll lands — the opposite of the truth.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void live.refreshNow(); }, []);

  const selectedMachine = machines.find((m) => m.id === selectedId) ?? null;
  const bufferByResource = useMemo(() => new Map(bufferBoard.map((b) => [b.resourceId, b])), [bufferBoard]);

  const handleActionDone = useCallback(async () => {
    try {
      const res = await fabGet<BoardResponse>('machines/board');
      setMachines(res.machines ?? []);
    } catch (e) {
      toast(errMsg(e, 'Failed to refresh machine board.'), 'error');
    }
  }, [toast]);

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      <PageHeader
        title="Machine Board"
        subtitle="Live state of every machine on the shop floor — tap a card to log a state change or mark an operator absent."
        actions={
          <LiveIndicator
            paused={live.paused}
            onTogglePause={() => live.setPaused((p) => !p)}
            lastUpdated={live.lastUpdated}
            now={now}
            busy={live.busy || loading}
            onRefreshNow={manualRefresh}
          />
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <CardGridSkeleton count={6} />
      ) : machines.length === 0 ? (
        <EmptyState title="No machines configured" hint="Machines appear here once resources are added under Resource Catalog." />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 1.5,
          }}
        >
          {machines.map((m) => (
            <MachineCard
              key={m.id}
              machine={m}
              bufferEntry={bufferByResource.get(m.id)}
              now={now}
              onClick={() => setSelectedId(m.id)}
            />
          ))}
        </Box>
      )}

      <Drawer
        anchor="bottom"
        open={selectedMachine !== null}
        onClose={() => setSelectedId(null)}
        PaperProps={{ sx: { borderTopLeftRadius: 'var(--r-lg)', borderTopRightRadius: 'var(--r-lg)', maxWidth: 560, mx: 'auto', width: '100%' } }}
      >
        {selectedMachine && (
          <ActionSheet
            machine={selectedMachine}
            onClose={() => setSelectedId(null)}
            onDone={handleActionDone}
          />
        )}
      </Drawer>

    </Box>
  );
}
