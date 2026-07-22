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
 * EU-9: each card also shows two small buffer gauges (input/output), fed by
 * one GET /buffers/board call for the whole board (not per-card — mirrors the
 * backend's set-based response) and mapped by resourceId. Tapping a gauge
 * (stopPropagation so it doesn't also open the state-change sheet) opens a
 * bottom sheet listing that buffer's open contents — resolved via a small
 * fabErpBuffer lookup then fabErpBufferContent query, both generic-query-API
 * reads — with a per-row "Move" button calling POST /buffers/move.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Drawer, IconButton, TextField, Tooltip, Typography,
} from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import PowerSettingsNewRounded from '@mui/icons-material/PowerSettingsNewRounded';
import ReportProblemRounded from '@mui/icons-material/ReportProblemRounded';
import PlayCircleRounded from '@mui/icons-material/PlayCircleRounded';
import PersonOffRounded from '@mui/icons-material/PersonOffRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';

import { fabGet, fabPost, fabQuery, getBufferBoard, moveBufferContent, type BufferBoardMachine, type BufferKind, type BufferSide, type BufferStatus } from '../api/client';
import { PageHeader, Surface, EmptyState, useToast } from '../components';

// ── Types — mirror GET /machines/board response exactly ────────────────────

type MachineState = 'running' | 'idle' | 'down' | 'off';

interface CurrentTask {
  id: number;
  operationName: string | null;
  itemName: string | null;
  startedAt: string | null;
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

function formatElapsed(startedAt: string | null): string {
  if (!startedAt) return '';
  const startMs = new Date(startedAt).getTime();
  if (isNaN(startMs)) return '';
  const diffMin = Math.max(0, Math.floor((Date.now() - startMs) / 60000));
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
 * Small thin-bar gauge for one buffer side. Renders "—" with no interaction
 * when the machine has no buffer of this kind. Click stops propagation so it
 * doesn't also trigger the card's onClick (which opens the state-change sheet).
 */
function BufferGauge({ kind, side, onClick }: { kind: BufferKind; side: BufferSide | null; onClick: () => void }) {
  const label = kind === 'input' ? 'In' : 'Out';

  if (!side) {
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
      title={`${label} buffer: ${side.load}${side.capacity != null ? ` / ${side.capacity}` : ''} (${side.status}) — tap for contents`}
      arrow
    >
      <Box
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        sx={{ flex: 1, cursor: 'pointer', px: 1, py: 0.6, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)' }}
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

// ── Buffer contents bottom sheet (EU-9) ─────────────────────────────────────

interface BufferContentRow {
  id: number;
  taskId: number | null;
  itemId: number;
  qty: number | null;
  unit: string | null;
  computedWeight: number | null;
  placedAt: string;
}

/**
 * Open contents of one machine's buffer, tapped from a BufferGauge. Resolves
 * the buffer id via a fabErpBuffer lookup (board response doesn't carry it),
 * then queries fabErpBufferContent for open rows, then fabErpItem for names
 * (both plain generic-query-API reads — no custom endpoint needed for either).
 */
function BufferContentsSheet({
  resourceId,
  kind,
  resourceName,
  onClose,
  onMoved,
}: {
  resourceId: number;
  kind: BufferKind;
  resourceName: string | null;
  onClose: () => void;
  onMoved: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bufferId, setBufferId] = useState<number | null>(null);
  const [rows, setRows] = useState<BufferContentRow[]>([]);
  const [itemNames, setItemNames] = useState<Map<number, string>>(new Map());
  const [movingId, setMovingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const bufRes = await fabQuery<{ data: { id: number }[] }>('fabErpBuffer', {
        fields: ['id'],
        filters: { resourceId, kind },
        pagination: { limit: 1 },
      });
      const buf = bufRes.data?.[0];
      if (!buf) {
        setBufferId(null);
        setRows([]);
        return;
      }
      setBufferId(buf.id);

      const contentRes = await fabQuery<{ data: BufferContentRow[] }>('fabErpBufferContent', {
        fields: ['id', 'taskId', 'itemId', 'qty', 'unit', 'computedWeight', 'placedAt'],
        filters: { bufferId: buf.id, movedOutAt: null },
        orderBy: [{ field: 'placedAt', direction: 'asc' }],
        pagination: { limit: 200 },
      });
      const contentRows = contentRes.data ?? [];
      setRows(contentRows);

      const itemIds = [...new Set(contentRows.map((r) => r.itemId))];
      if (itemIds.length > 0) {
        const itemRes = await fabQuery<{ data: { id: number; name: string }[] }>('fabErpItem', {
          fields: ['id', 'name'],
          filters: { id: itemIds },
          pagination: { limit: itemIds.length },
        });
        setItemNames(new Map((itemRes.data ?? []).map((it) => [it.id, it.name])));
      } else {
        setItemNames(new Map());
      }
    } catch (e) {
      setError(errMsg(e, 'Failed to load buffer contents.'));
    } finally {
      setLoading(false);
    }
  }, [resourceId, kind]);

  useEffect(() => { load(); }, [load]);

  const move = useCallback(async (row: BufferContentRow) => {
    setMovingId(row.id);
    try {
      await moveBufferContent({ contentId: row.id });
      toast('Moved to next buffer.', 'success');
      onMoved();
      await load();
    } catch (e) {
      toast(errMsg(e, 'Failed to move content.'), 'error');
    } finally {
      setMovingId(null);
    }
  }, [load, onMoved, toast]);

  return (
    <Box sx={{ p: 2.5, pb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 600, color: 'var(--c-text)' }}>
            {resourceName ?? 'Machine'} — {kind === 'input' ? 'Input' : 'Output'} buffer
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Open contents, oldest first</Typography>
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseRounded fontSize="small" />
        </IconButton>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress size={22} /></Box>
      ) : !bufferId ? (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No {kind} buffer configured for this machine.</Typography>
      ) : rows.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Buffer is empty.</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {rows.map((row) => (
            <Box
              key={row.id}
              sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                px: 1.5, py: 1, background: 'var(--c-surface-2)', borderRadius: 'var(--r-sm)',
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 13.5, color: 'var(--c-text)' }}>
                  {itemNames.get(row.itemId) ?? `Item #${row.itemId}`}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                  {row.qty != null ? `qty ${row.qty}${row.unit ? ` ${row.unit}` : ''}` : ''}
                  {row.computedWeight != null && ` · ${row.computedWeight} kg`}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                startIcon={<ArrowForwardRounded fontSize="small" />}
                disabled={movingId === row.id}
                onClick={() => move(row)}
              >
                {movingId === row.id ? <CircularProgress size={14} /> : 'Move'}
              </Button>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ── Machine card ─────────────────────────────────────────────────────────────

function MachineCard({
  machine,
  bufferEntry,
  onClick,
  onOpenBuffer,
}: {
  machine: MachineBoardItem;
  bufferEntry: BufferBoardMachine | undefined;
  onClick: () => void;
  onOpenBuffer: (kind: BufferKind) => void;
}) {
  return (
    <Surface
      e={1}
      onClick={onClick}
      sx={{
        p: 2, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 1.25,
        transition: 'box-shadow var(--t-fast) var(--ease), transform var(--t-fast) var(--ease)',
        '&:hover': { boxShadow: 'var(--e-2)', transform: 'translateY(-1px)' },
      }}
    >
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

      {(machine.effectiveState === 'down' || machine.effectiveState === 'off') && machine.currentTask && (
        <Alert severity="warning" sx={{ py: 0, fontSize: 11.5 }}>
          Marked {machine.effectiveState} while a task is still assigned — data conflict.
        </Alert>
      )}

      <Box sx={{ minHeight: 40 }}>
        {machine.currentTask ? (
          <>
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text)' }}>
              {machine.currentTask.operationName ?? 'Unnamed operation'}
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
              {machine.currentTask.itemName ?? 'Unknown item'}
              {machine.currentTask.startedAt && ` · ${formatElapsed(machine.currentTask.startedAt)} elapsed`}
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
        <BufferGauge kind="input" side={bufferEntry?.input ?? null} onClick={() => onOpenBuffer('input')} />
        <BufferGauge kind="output" side={bufferEntry?.output ?? null} onClick={() => onOpenBuffer('output')} />
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

  const toggleAbsent = useCallback(async (op: Operator) => {
    setBusy(true);
    try {
      await fabPost(`machines/${machine.id}/operator-absent`, {
        user_id: op.userId,
        clear: op.absentToday,
      });
      toast(`${op.name} marked ${op.absentToday ? 'present' : 'absent'} today.`, 'success');
      onDone();
    } catch (e) {
      toast(errMsg(e, 'Failed to update operator absence.'), 'error');
    } finally {
      setBusy(false);
    }
  }, [machine.id, onDone, toast]);

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

      <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', mb: 1 }}>
        Operators
      </Typography>
      {machine.operators.length === 0 ? (
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>No operators assigned to this machine.</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {machine.operators.map((op) => (
            <Box
              key={op.userId}
              sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                px: 1.5, py: 1, background: 'var(--c-surface-2)', borderRadius: 'var(--r-sm)',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {op.absentToday ? <PersonOffRounded sx={{ fontSize: 18, color: 'var(--c-warning-800)' }} /> : <PersonRounded sx={{ fontSize: 18, color: 'var(--c-text-2)' }} />}
                <Typography sx={{ fontSize: 13.5, color: 'var(--c-text)' }}>
                  {op.name}{op.isPrimary && <Typography component="span" sx={{ fontSize: 11, color: 'var(--c-text-3)' }}> · primary</Typography>}
                </Typography>
              </Box>
              <Button
                size="small"
                disabled={busy}
                onClick={() => toggleAbsent(op)}
                sx={{ fontSize: 12, color: op.absentToday ? 'var(--c-warning-800)' : 'var(--c-text-2)' }}
              >
                {op.absentToday ? 'Mark present' : 'Absent today'}
              </Button>
            </Box>
          ))}
        </Box>
      )}
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
  const [selectedBuffer, setSelectedBuffer] = useState<{ resourceId: number; kind: BufferKind; resourceName: string | null } | null>(null);

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

  useEffect(() => { load(); loadBufferBoard(); }, [load, loadBufferBoard]);

  // Poll every 30s while the tab is visible.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) { load(); loadBufferBoard(); }
    }, 30000);
    return () => clearInterval(id);
  }, [load, loadBufferBoard]);

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
          <Button size="small" startIcon={<RefreshRounded fontSize="small" />} onClick={manualRefresh} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Surface e={1} sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Surface>
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
              onClick={() => setSelectedId(m.id)}
              onOpenBuffer={(kind) => setSelectedBuffer({ resourceId: m.id, kind, resourceName: m.name })}
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

      <Drawer
        anchor="bottom"
        open={selectedBuffer !== null}
        onClose={() => setSelectedBuffer(null)}
        PaperProps={{ sx: { borderTopLeftRadius: 'var(--r-lg)', borderTopRightRadius: 'var(--r-lg)', maxWidth: 560, mx: 'auto', width: '100%' } }}
      >
        {selectedBuffer && (
          <BufferContentsSheet
            resourceId={selectedBuffer.resourceId}
            kind={selectedBuffer.kind}
            resourceName={selectedBuffer.resourceName}
            onClose={() => setSelectedBuffer(null)}
            onMoved={loadBufferBoard}
          />
        )}
      </Drawer>
    </Box>
  );
}
