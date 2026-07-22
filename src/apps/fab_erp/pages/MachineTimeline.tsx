/**
 * MachineTimeline.tsx — EU-12 (Shop-Floor Time Intelligence): a per-machine,
 * per-day 24h editor. Pick a machine + day; the strip shows one bar per task's
 * started→completed span (colored by status), a thin machine-state lane below
 * (running / idle / down / off from fab_resource_events), and shift bands
 * shaded behind everything.
 *
 * Editing:
 *  - Drag a task bar's LEFT / RIGHT edge → on drop, POST the corrected
 *    timestamp to the corresponding `started` / `completed` event via
 *    correctTaskEvent(eventId, {at}). Event ids are resolved up front by
 *    fetching each task's non-superseded events and mapping event_type→id.
 *  - The right rail lists eligible/paused tasks with NO logged time; drag one
 *    onto the strip (or click it) to open a backfill confirm seeded with the
 *    dropped start time + a default duration, then POST tasks/:id/backfill.
 *  - Task bars that overlap in time render with a rose conflict outline.
 *
 * Shift bands are real (derived from the machine's shift-calendar shifts) but
 * do NOT apply per-day working-day exceptions (fab_calendar_days) — noted in
 * the header. All timestamps are stored UTC; the strip is a local-day view.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, TextField, Typography,
} from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';

import {
  fabQuery, correctTaskEvent, backfillTaskWork, type FilterValue,
} from '../api/client';
import { PageHeader, Surface, EmptyState, useToast } from '../components';

// ── Types ──────────────────────────────────────────────────────────────────

interface QueryResult<T> { data: T[]; total?: number }

interface MachineRow {
  id: number;
  name: string;
  code: string | null;
  shiftCalendarId: number | null;
}

type TaskStatus =
  | 'blocked' | 'eligible' | 'in_progress' | 'paused' | 'done' | 'cancelled';

interface TaskRow {
  id: number;
  status: TaskStatus;
  startedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  itemName: string | null;
  operationName: string | null;
  orderNumber: string | null;
  seqNo: number | null;
}

interface TaskEventRow {
  id: number;
  taskId: number;
  eventType: string; // started | resumed | paused | completed | queued | deps_cleared
  at: string;
}

interface ResourceEventRow {
  id: number;
  state: MachineState;
  at: string;
}

type MachineState = 'running' | 'idle' | 'down' | 'off';

interface ShiftRow {
  id: number;
  name: string | null;
  startTime: string | null; // 'HH:MM:SS'
  endTime: string | null;
}

/** A resolved task segment ready to render + edit. */
interface Segment {
  taskId: number;
  label: string;
  sub: string;
  status: TaskStatus;
  startMs: number;
  endMs: number;            // completed, or now/day-end for still-running
  isOpenEnded: boolean;     // no completed event → right edge not editable
  startedEventId: number | null;
  completedEventId: number | null;
  lane: number;
  conflict: boolean;
}

// ── Constants / helpers ──────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const BAR_H = 30;
const BAR_GAP = 4;

const STATE_STYLE: Record<MachineState, { fill: string; label: string }> = {
  running: { fill: 'var(--c-success-600)', label: 'Running' },
  idle:    { fill: 'var(--c-neutral-600)', label: 'Idle' },
  down:    { fill: 'var(--c-danger-600)',  label: 'Down' },
  off:     { fill: 'var(--c-neutral-800)', label: 'Off' },
};

type Family = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** Timeline-bar color family for a task status (local to this screen). */
function taskFamily(status: TaskStatus): Family {
  switch (status) {
    case 'done':        return 'success';
    case 'in_progress': return 'info';
    case 'paused':      return 'warning';
    case 'cancelled':   return 'danger';
    default:            return 'neutral'; // blocked / eligible
  }
}

function errMsg(e: unknown, fallback: string): string {
  const ax = e as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.message ?? fallback;
}

/** Local-day start (00:00) for a 'YYYY-MM-DD' string. */
function dayStartMsOf(dayStr: string): number {
  const [y, m, d] = dayStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/** Format a JS Date as a UTC SQL datetime 'YYYY-MM-DD HH:MM:SS' for range filters. */
function toSqlUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/** Today's local date as 'YYYY-MM-DD'. */
function todayStr(): string {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

/** JS Date → 'YYYY-MM-DDTHH:MM' for a datetime-local input (local tz). */
function toLocalInput(ms: number): string {
  const n = new Date(ms);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}T${p(n.getHours())}:${p(n.getMinutes())}`;
}

function pct(ms: number, dayStart: number): number {
  return Math.min(100, Math.max(0, ((ms - dayStart) / DAY_MS) * 100));
}

function clockLabel(ms: number): string {
  const n = new Date(ms);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(n.getHours())}:${p(n.getMinutes())}`;
}

/** 'HH:MM:SS' → fraction of day [0,1], or null if unparseable. */
function timeFrac(hms: string | null): number | null {
  if (!hms) return null;
  const [h, m] = hms.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return (h * 60 + m) / (24 * 60);
}

// ── Backfill confirm dialog ──────────────────────────────────────────────────

function BackfillDialog({
  task, startMs, onClose, onDone,
}: {
  task: TaskRow;
  startMs: number;
  onClose: () => void;
  onDone: (warnings: string[]) => void;
}) {
  const { toast } = useToast();
  const [start, setStart] = useState(toLocalInput(startMs));
  const [durationMin, setDurationMin] = useState(60);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    const startDate = new Date(start);
    if (Number.isNaN(startDate.getTime())) { toast('Enter a valid start time.', 'error'); return; }
    if (durationMin <= 0) { toast('Duration must be greater than zero.', 'error'); return; }
    const completed = new Date(startDate.getTime() + durationMin * 60000);
    setBusy(true);
    try {
      const res = await backfillTaskWork(task.id, {
        started_at: startDate.toISOString(),
        completed_at: completed.toISOString(),
        note: note || undefined,
      });
      onDone(res.warnings ?? []);
    } catch (e) {
      toast(errMsg(e, 'Failed to backfill task.'), 'error');
    } finally {
      setBusy(false);
    }
  }, [start, durationMin, note, task.id, toast, onDone]);

  const taskLabel = task.operationName ?? `Task #${task.id}`;

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth
      PaperProps={{ sx: { borderRadius: 'var(--r-lg)' } }}>
      <DialogTitle sx={{ fontSize: 16, fontWeight: 600, color: 'var(--c-text)' }}>
        Log time for {taskLabel}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
          {task.itemName ?? 'Unknown item'}{task.orderNumber ? ` · ${task.orderNumber}` : ''}
        </Typography>
        <TextField
          label="Started at" type="datetime-local" size="small"
          value={start} onChange={(e) => setStart(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="Duration (minutes)" type="number" size="small"
          value={durationMin}
          onChange={(e) => setDurationMin(Number(e.target.value))}
          inputProps={{ min: 1 }}
        />
        <TextField
          label="Note (optional)" size="small" value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy} color="inherit">Cancel</Button>
        <Button onClick={submit} disabled={busy} variant="contained">
          {busy ? <CircularProgress size={18} /> : 'Log time'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

interface DragState {
  taskId: number;
  edge: 'start' | 'end';
  eventId: number;
  rect: DOMRect;
  previewMs: number;
}

interface RailDragState {
  task: TaskRow;
  clientX: number;
  clientY: number;
}

export default function MachineTimeline() {
  const { toast } = useToast();

  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [machineId, setMachineId] = useState<number | null>(null);
  const [day, setDay] = useState<string>(todayStr());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); // a correct/backfill call is in flight

  const [segments, setSegments] = useState<Segment[]>([]);
  const [railTasks, setRailTasks] = useState<TaskRow[]>([]);
  const [stateSegs, setStateSegs] = useState<{ state: MachineState; startMs: number; endMs: number }[]>([]);
  const [shiftBands, setShiftBands] = useState<{ leftPct: number; widthPct: number; label: string }[]>([]);

  const [drag, setDrag] = useState<DragState | null>(null);
  const [railDrag, setRailDrag] = useState<RailDragState | null>(null);
  const [backfill, setBackfill] = useState<{ task: TaskRow; startMs: number } | null>(null);

  const stripRef = useRef<HTMLDivElement | null>(null);

  const dayStart = useMemo(() => dayStartMsOf(day), [day]);

  // ── Load machine list once ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fabQuery<QueryResult<MachineRow>>('fabErpResource', {
      fields: ['id', 'name', 'code', 'shiftCalendarId'],
      orderBy: [{ field: 'name', direction: 'asc' }],
      pagination: { limit: 5000 },
    })
      .then((res) => {
        if (cancelled) return;
        const list = res.data ?? [];
        setMachines(list);
        if (list.length && machineId === null) setMachineId(list[0].id);
      })
      .catch((e) => { if (!cancelled) setError(errMsg(e, 'Failed to load machines.')); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedMachine = machines.find((m) => m.id === machineId) ?? null;

  // ── Load the day's data for the selected machine ──────────────────────────
  const load = useCallback(async () => {
    if (machineId === null) return;
    setLoading(true);
    setError('');
    const dStart = dayStartMsOf(day);
    const dEnd = dStart + DAY_MS;
    const now = Date.now();
    try {
      // 1) All tasks assigned to this machine.
      const taskRes = await fabQuery<QueryResult<TaskRow>>('fabErpProjectTask', {
        fields: ['id', 'status', 'startedAt', 'pausedAt', 'completedAt',
          'itemName', 'operationName', 'orderNumber', 'seqNo'],
        filters: { assignedResourceId: machineId },
        pagination: { limit: 5000 },
      });
      const tasks = taskRes.data ?? [];

      // Tasks with a started span overlapping the selected day → strip segments.
      const spanTasks = tasks.filter((t) => {
        if (!t.startedAt) return false;
        const s = new Date(t.startedAt).getTime();
        const e = t.completedAt ? new Date(t.completedAt).getTime() : now;
        return s < dEnd && e >= dStart;
      });

      // Eligible / paused tasks with no started event → backfill rail.
      const rail = tasks.filter(
        (t) => (t.status === 'eligible' || t.status === 'paused') && !t.startedAt,
      );
      setRailTasks(rail);

      // 2) Non-superseded events for the spanning tasks → resolve event ids.
      const eventByTask = new Map<number, { started: number | null; completed: number | null }>();
      if (spanTasks.length) {
        const evRes = await fabQuery<QueryResult<TaskEventRow>>('fabErpTaskEvent', {
          fields: ['id', 'taskId', 'eventType', 'at'],
          filters: { taskId: spanTasks.map((t) => t.id), supersededByEventId: null },
          orderBy: [{ field: 'at', direction: 'asc' }],
          pagination: { limit: 5000 },
        });
        for (const ev of evRes.data ?? []) {
          const cur = eventByTask.get(ev.taskId) ?? { started: null, completed: null };
          if (ev.eventType === 'started') cur.started = ev.id;
          else if (ev.eventType === 'completed') cur.completed = ev.id;
          eventByTask.set(ev.taskId, cur);
        }
      }

      // 3) Build + lane-pack + conflict-flag segments.
      const built: Segment[] = spanTasks
        .map((t) => {
          const startMs = new Date(t.startedAt!).getTime();
          const isOpenEnded = !t.completedAt;
          const endMs = t.completedAt ? new Date(t.completedAt).getTime() : Math.min(now, dEnd);
          const ids = eventByTask.get(t.id) ?? { started: null, completed: null };
          return {
            taskId: t.id,
            label: t.operationName ?? `Task #${t.id}`,
            sub: [t.itemName, t.orderNumber].filter(Boolean).join(' · ') || '—',
            status: t.status,
            startMs,
            endMs: Math.max(endMs, startMs + 60000),
            isOpenEnded,
            startedEventId: ids.started,
            completedEventId: ids.completed,
            lane: 0,
            conflict: false,
          } as Segment;
        })
        .sort((a, b) => a.startMs - b.startMs);

      // Greedy lane packing so overlaps stack rather than cover each other.
      const laneEnds: number[] = [];
      for (const seg of built) {
        let lane = laneEnds.findIndex((end) => end <= seg.startMs);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(seg.endMs); }
        else laneEnds[lane] = seg.endMs;
        seg.lane = lane;
      }
      // Conflict flag: any pairwise time overlap.
      for (let i = 0; i < built.length; i++) {
        for (let j = i + 1; j < built.length; j++) {
          if (built[i].startMs < built[j].endMs && built[j].startMs < built[i].endMs) {
            built[i].conflict = true; built[j].conflict = true;
          }
        }
      }
      setSegments(built);

      // 4) Machine-state lane: initial state (last event before the day) + in-day events.
      const [initRes, dayRes] = await Promise.all([
        fabQuery<QueryResult<ResourceEventRow>>('fabErpResourceEvent', {
          fields: ['id', 'state', 'at'],
          filters: { resourceId: machineId, supersededByEventId: null, 'at.LT': toSqlUtc(dStart) } as Record<string, FilterValue>,
          orderBy: [{ field: 'at', direction: 'desc' }],
          pagination: { limit: 1 },
        }),
        fabQuery<QueryResult<ResourceEventRow>>('fabErpResourceEvent', {
          fields: ['id', 'state', 'at'],
          filters: { resourceId: machineId, supersededByEventId: null, 'at.GTE': toSqlUtc(dStart), 'at.LTE': toSqlUtc(dEnd) } as Record<string, FilterValue>,
          orderBy: [{ field: 'at', direction: 'asc' }],
          pagination: { limit: 5000 },
        }),
      ]);
      const initState = initRes.data?.[0]?.state ?? null;
      const evs = dayRes.data ?? [];
      const sSegs: { state: MachineState; startMs: number; endMs: number }[] = [];
      let cursor = dStart;
      let curState: MachineState | null = initState;
      for (const ev of evs) {
        const at = Math.max(dStart, new Date(ev.at).getTime());
        if (curState && at > cursor) sSegs.push({ state: curState, startMs: cursor, endMs: at });
        curState = ev.state;
        cursor = at;
      }
      if (curState && cursor < dEnd) sSegs.push({ state: curState, startMs: cursor, endMs: dEnd });
      setStateSegs(sSegs);

      // 5) Shift bands (best-effort; per-day working exceptions not applied).
      if (selectedMachine?.shiftCalendarId) {
        const shiftRes = await fabQuery<QueryResult<ShiftRow>>('fabErpShift', {
          fields: ['id', 'name', 'startTime', 'endTime'],
          filters: { calendarId: selectedMachine.shiftCalendarId },
          pagination: { limit: 100 },
        });
        const bands = (shiftRes.data ?? []).flatMap((sh) => {
          const sf = timeFrac(sh.startTime);
          const ef = timeFrac(sh.endTime);
          if (sf === null || ef === null) return [];
          // Overnight shift wraps midnight → clamp to end-of-day (best-effort).
          const end = ef <= sf ? 1 : ef;
          return [{ leftPct: sf * 100, widthPct: (end - sf) * 100, label: sh.name ?? 'Shift' }];
        });
        setShiftBands(bands);
      } else {
        setShiftBands([]);
      }
    } catch (e) {
      setError(errMsg(e, 'Failed to load timeline.'));
      setSegments([]); setStateSegs([]); setRailTasks([]); setShiftBands([]);
    } finally {
      setLoading(false);
    }
  }, [machineId, day, selectedMachine]);

  useEffect(() => { load(); }, [load]);

  // ── Edge-drag: pointer handling ───────────────────────────────────────────
  const beginEdgeDrag = useCallback((seg: Segment, edge: 'start' | 'end', e: React.PointerEvent) => {
    if (busy) return;
    const eventId = edge === 'start' ? seg.startedEventId : seg.completedEventId;
    if (!eventId) { toast(`No ${edge === 'start' ? 'start' : 'completed'} event to correct.`, 'error'); return; }
    const rect = stripRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    setDrag({ taskId: seg.taskId, edge, eventId, rect, previewMs: edge === 'start' ? seg.startMs : seg.endMs });
  }, [busy, toast]);

  useEffect(() => {
    if (!drag) return;
    const clampMs = (clientX: number) => {
      const frac = (clientX - drag.rect.left) / drag.rect.width;
      const ms = dayStart + Math.min(1, Math.max(0, frac)) * DAY_MS;
      return Math.round(ms / 60000) * 60000; // snap to minute
    };
    const onMove = (ev: PointerEvent) => {
      setDrag((d) => (d ? { ...d, previewMs: clampMs(ev.clientX) } : d));
    };
    const onUp = async (ev: PointerEvent) => {
      const newMs = clampMs(ev.clientX);
      const active = drag;
      setDrag(null);
      setBusy(true);
      try {
        const res = await correctTaskEvent(active.eventId, { at: new Date(newMs).toISOString() });
        toast(`${active.edge === 'start' ? 'Start' : 'End'} time updated to ${clockLabel(newMs)}.`, 'success');
        (res.warnings ?? []).forEach((w) => toast(w, 'info'));
        await load();
      } catch (e) {
        toast(errMsg(e, 'Failed to correct event.'), 'error');
      } finally {
        setBusy(false);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, dayStart, load, toast]);

  // ── Rail-drag: drop a no-time task onto the strip to backfill ─────────────
  const beginRailDrag = useCallback((task: TaskRow, e: React.PointerEvent) => {
    e.preventDefault();
    setRailDrag({ task, clientX: e.clientX, clientY: e.clientY });
  }, []);

  useEffect(() => {
    if (!railDrag) return;
    const onMove = (ev: PointerEvent) => {
      setRailDrag((d) => (d ? { ...d, clientX: ev.clientX, clientY: ev.clientY } : d));
    };
    const onUp = (ev: PointerEvent) => {
      const task = railDrag.task;
      setRailDrag(null);
      const rect = stripRef.current?.getBoundingClientRect();
      if (rect && ev.clientX >= rect.left && ev.clientX <= rect.right
        && ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
        const frac = (ev.clientX - rect.left) / rect.width;
        const ms = Math.round((dayStart + frac * DAY_MS) / 60000) * 60000;
        setBackfill({ task, startMs: ms });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [railDrag, dayStart]);

  const laneCount = Math.max(1, ...segments.map((s) => s.lane + 1));
  const tasksLaneH = laneCount * (BAR_H + BAR_GAP);

  // Hour tick marks (every 3h).
  const ticks = Array.from({ length: 9 }, (_, i) => i * 3);

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      <PageHeader
        title="Machine Timeline"
        subtitle="Review and correct a machine's logged time for one day. Drag a task bar's edge to fix its start/end, or drop a no-time task onto the strip to log it. Shift bands are advisory (per-day exceptions not applied)."
        actions={
          <Button size="small" startIcon={<RefreshRounded fontSize="small" />} onClick={load} disabled={loading || busy}>
            Refresh
          </Button>
        }
      />

      {/* Controls */}
      <Surface e={1} sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Autocomplete
          size="small"
          sx={{ minWidth: 280 }}
          options={machines}
          value={selectedMachine}
          onChange={(_, v) => setMachineId(v?.id ?? null)}
          getOptionLabel={(m) => (m.code ? `${m.name} (${m.code})` : m.name)}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => <TextField {...params} label="Machine" />}
        />
        <TextField
          size="small" label="Day" type="date" value={day}
          onChange={(e) => setDay(e.target.value || todayStr())}
          InputLabelProps={{ shrink: true }}
        />
        {busy && <CircularProgress size={20} />}
      </Surface>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {machineId === null ? (
        <EmptyState title="No machine selected" hint="Pick a machine to view its day timeline." />
      ) : (
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Strip */}
          <Surface e={1} sx={{ p: 2, flex: 1, minWidth: 320, position: 'relative' }}>
            {loading ? (
              <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
            ) : (
              <>
                {/* Hour axis */}
                <Box sx={{ position: 'relative', height: 16, mb: 0.5 }}>
                  {ticks.map((h) => (
                    <Typography key={h} sx={{
                      position: 'absolute', left: `${(h / 24) * 100}%`, transform: 'translateX(-50%)',
                      fontSize: 10.5, color: 'var(--c-text-3)', fontFamily: 'var(--font-mono)',
                    }}>{String(h).padStart(2, '0')}:00</Typography>
                  ))}
                </Box>

                {/* Task lane (with shift bands + grid behind) */}
                <Box
                  ref={stripRef}
                  sx={{
                    position: 'relative', height: tasksLaneH, minHeight: BAR_H + BAR_GAP,
                    background: 'var(--c-surface-2)', borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--c-border)', overflow: 'hidden',
                  }}
                >
                  {/* Shift bands */}
                  {shiftBands.map((b, i) => (
                    <Box key={`sb-${i}`} sx={{
                      position: 'absolute', top: 0, bottom: 0, left: `${b.leftPct}%`, width: `${b.widthPct}%`,
                      background: 'var(--c-primary-50)', opacity: 0.7,
                    }} aria-hidden />
                  ))}
                  {/* Hour gridlines */}
                  {ticks.map((h) => (
                    <Box key={`gl-${h}`} sx={{
                      position: 'absolute', top: 0, bottom: 0, left: `${(h / 24) * 100}%`,
                      borderLeft: '1px dashed var(--c-divider)',
                    }} aria-hidden />
                  ))}
                  {/* Drag preview line */}
                  {drag && (
                    <Box sx={{
                      position: 'absolute', top: 0, bottom: 0, left: `${pct(drag.previewMs, dayStart)}%`,
                      borderLeft: '2px solid var(--c-primary-500)', zIndex: 5,
                    }}>
                      <Box sx={{
                        position: 'absolute', top: 2, left: 4, fontSize: 10.5, fontFamily: 'var(--font-mono)',
                        color: 'var(--c-primary-700)', background: 'var(--c-surface)', px: 0.5, borderRadius: 'var(--r-sm)',
                        whiteSpace: 'nowrap',
                      }}>{clockLabel(drag.previewMs)}</Box>
                    </Box>
                  )}

                  {segments.length === 0 && (
                    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>No logged task time on this day.</Typography>
                    </Box>
                  )}

                  {segments.map((seg) => {
                    const fam = taskFamily(seg.status);
                    const left = pct(seg.startMs, dayStart);
                    const width = Math.max(0.6, pct(seg.endMs, dayStart) - left);
                    return (
                      <Box
                        key={seg.taskId}
                        title={`${seg.label} — ${clockLabel(seg.startMs)}→${seg.isOpenEnded ? 'now' : clockLabel(seg.endMs)}`}
                        sx={{
                          position: 'absolute', left: `${left}%`, width: `${width}%`,
                          top: seg.lane * (BAR_H + BAR_GAP) + 2, height: BAR_H,
                          background: `var(--c-${fam}-50)`,
                          border: seg.conflict ? '1.5px solid var(--c-danger-600)' : `1.5px solid var(--c-${fam}-600)`,
                          borderRadius: 'var(--r-sm)',
                          display: 'flex', alignItems: 'center', px: 1,
                          boxShadow: seg.conflict ? '0 0 0 1px var(--c-danger-600) inset' : 'none',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Left edge handle */}
                        <Box
                          onPointerDown={(e) => beginEdgeDrag(seg, 'start', e)}
                          sx={{
                            position: 'absolute', left: 0, top: 0, bottom: 0, width: 8,
                            cursor: 'ew-resize', background: `var(--c-${fam}-600)`, opacity: 0.55,
                            '&:hover': { opacity: 1 },
                          }}
                          aria-label={`Drag ${seg.label} start`}
                        />
                        <Typography sx={{
                          fontSize: 11.5, fontWeight: 500, color: `var(--c-${fam}-800)`,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', px: 0.5,
                        }}>{seg.label}</Typography>
                        {/* Right edge handle (only when a completed event exists) */}
                        {!seg.isOpenEnded && (
                          <Box
                            onPointerDown={(e) => beginEdgeDrag(seg, 'end', e)}
                            sx={{
                              position: 'absolute', right: 0, top: 0, bottom: 0, width: 8,
                              cursor: 'ew-resize', background: `var(--c-${fam}-600)`, opacity: 0.55,
                              '&:hover': { opacity: 1 },
                            }}
                            aria-label={`Drag ${seg.label} end`}
                          />
                        )}
                      </Box>
                    );
                  })}
                </Box>

                {/* Machine-state lane */}
                <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mt: 1.5, mb: 0.5 }}>
                  Machine state
                </Typography>
                <Box sx={{
                  position: 'relative', height: 18, background: 'var(--c-surface-2)',
                  borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', overflow: 'hidden',
                }}>
                  {stateSegs.length === 0 && (
                    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', pl: 1 }}>
                      <Typography sx={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>No state data</Typography>
                    </Box>
                  )}
                  {stateSegs.map((s, i) => {
                    const left = pct(s.startMs, dayStart);
                    const width = Math.max(0.3, pct(s.endMs, dayStart) - left);
                    return (
                      <Box key={i} title={`${STATE_STYLE[s.state].label} ${clockLabel(s.startMs)}→${clockLabel(s.endMs)}`}
                        sx={{ position: 'absolute', top: 0, bottom: 0, left: `${left}%`, width: `${width}%`, background: STATE_STYLE[s.state].fill, opacity: 0.85 }} />
                    );
                  })}
                </Box>
                {/* State legend */}
                <Box sx={{ display: 'flex', gap: 1.5, mt: 1, flexWrap: 'wrap' }}>
                  {(Object.keys(STATE_STYLE) as MachineState[]).map((st) => (
                    <Box key={st} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: 2, background: STATE_STYLE[st].fill }} />
                      <Typography sx={{ fontSize: 11, color: 'var(--c-text-2)' }}>{STATE_STYLE[st].label}</Typography>
                    </Box>
                  ))}
                </Box>
              </>
            )}
          </Surface>

          {/* Rail — tasks with no logged time */}
          <Surface e={1} sx={{ p: 2, width: 260, flexShrink: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', mb: 0.5 }}>
              No logged time
            </Typography>
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mb: 1.5 }}>
              Drag onto the strip (or click) to log time for an assigned task.
            </Typography>
            {railTasks.length === 0 ? (
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Nothing waiting.</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {railTasks.map((t) => (
                  <Box
                    key={t.id}
                    onPointerDown={(e) => beginRailDrag(t, e)}
                    onClick={() => setBackfill({ task: t, startMs: dayStart + 9 * 60 * 60 * 1000 })}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBackfill({ task: t, startMs: dayStart + 9 * 60 * 60 * 1000 }); } }}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.75,
                      background: 'var(--c-surface-2)', borderRadius: 'var(--r-sm)',
                      border: '1px solid var(--c-border)', cursor: 'grab', userSelect: 'none',
                      '&:hover': { borderColor: 'var(--c-primary-200)' },
                    }}
                  >
                    <DragIndicatorRounded sx={{ fontSize: 16, color: 'var(--c-text-3)' }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: 'var(--c-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.operationName ?? `Task #${t.id}`}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {[t.itemName, t.orderNumber].filter(Boolean).join(' · ') || '—'}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Surface>
        </Box>
      )}

      {/* Rail-drag floating ghost */}
      {railDrag && (
        <Box sx={{
          position: 'fixed', left: railDrag.clientX + 12, top: railDrag.clientY + 12, zIndex: 1500,
          pointerEvents: 'none', px: 1, py: 0.5, background: 'var(--c-surface)', boxShadow: 'var(--e-3)',
          border: '1px solid var(--c-primary-200)', borderRadius: 'var(--r-sm)', fontSize: 12,
          color: 'var(--c-text)',
        }}>
          {railDrag.task.operationName ?? `Task #${railDrag.task.id}`}
        </Box>
      )}

      {backfill && (
        <BackfillDialog
          task={backfill.task}
          startMs={backfill.startMs}
          onClose={() => setBackfill(null)}
          onDone={(warnings) => {
            setBackfill(null);
            toast('Task time logged.', 'success');
            warnings.forEach((w) => toast(w, 'info'));
            load();
          }}
        />
      )}
    </Box>
  );
}
