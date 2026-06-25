import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Paper, Snackbar, Tooltip, Typography,
} from '@mui/material';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import LockIcon             from '@mui/icons-material/Lock';
import LockOpenIcon         from '@mui/icons-material/LockOpen';
import WarningAmberIcon     from '@mui/icons-material/WarningAmber';

import { fabGet, fabPost, fabPut } from '../api/client';
import { usePermission }           from '@core/hooks/usePermission';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ScheduleEntry {
  id: number;
  orderId: number; orderNumber: string; orderQty: number;
  itemName: string; itemCode: string;
  stepId: number; opName: string; seqNo: number;
  resourceId: number; resourceName: string; resourceCode: string; resourceTypeName: string;
  startDatetime: string; endDatetime: string; durationHrs: number;
  actualStart: string | null; actualEnd: string | null;
  status: string; locked: number; isLate: number;
}

interface SchedulerRun {
  id: number; triggeredBy: string; startedAt: string; finishedAt: string | null;
  status: string; ordersScheduled: number; entriesCreated: number; lateOrders: number;
  errorMessage: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isoToLocal(s: string | null | undefined) {
  if (!s) return new Date(NaN);
  // MySQL returns datetimes without timezone — treat as local time, not UTC
  return new Date(s.includes('T') ? s : s.replace(' ', 'T'));
}

function fmtDateTime(s: string | null | undefined) {
  if (!s) return '—';
  const d = isoToLocal(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtDur(hrs: number) {
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function statusColor(s: string): 'default' | 'warning' | 'success' | 'info' | 'error' {
  switch (s) {
    case 'planned':     return 'info';
    case 'released':    return 'warning';
    case 'in_progress': return 'warning';
    case 'done':        return 'success';
    case 'cancelled':   return 'error';
    default:            return 'default';
  }
}

// ── Gantt chart ───────────────────────────────────────────────────────────────
const GANTT_COLORS = [
  '#1976d2','#388e3c','#f57c00','#7b1fa2',
  '#c62828','#00838f','#558b2f','#4527a0',
];

function GanttChart({ entries }: { entries: ScheduleEntry[] }) {
  if (entries.length === 0) return null;

  // Group by resource
  const resourceMap = new Map<number, { name: string; code: string; entries: ScheduleEntry[] }>();
  for (const e of entries) {
    if (!resourceMap.has(e.resourceId)) {
      resourceMap.set(e.resourceId, { name: e.resourceName, code: e.resourceCode, entries: [] });
    }
    resourceMap.get(e.resourceId)!.entries.push(e);
  }

  // Date range
  const allStarts = entries.map(e => isoToLocal(e.startDatetime).getTime());
  const allEnds   = entries.map(e => isoToLocal(e.endDatetime).getTime());
  const minMs = Math.min(...allStarts);
  const maxMs = Math.max(...allEnds);
  const totalMs = maxMs - minMs || 1;

  // Day columns
  const days: Date[] = [];
  const cursor = new Date(minMs);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= maxMs) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  // Order colour index
  const orderColorMap = new Map<number, string>();
  let ci = 0;
  for (const e of entries) {
    if (!orderColorMap.has(e.orderId)) {
      orderColorMap.set(e.orderId, GANTT_COLORS[ci++ % GANTT_COLORS.length]);
    }
  }

  const ROW_H   = 48;
  const LABEL_W = 160;
  const DAY_W   = 120;
  const totalW  = LABEL_W + days.length * DAY_W;

  return (
    <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Box sx={{ minWidth: totalW, fontFamily: 'monospace', fontSize: '0.72rem' }}>
        {/* Header row */}
        <Box sx={{ display: 'flex', borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
          <Box sx={{ width: LABEL_W, flexShrink: 0, px: 1, py: 0.5, fontWeight: 700 }}>Resource</Box>
          {days.map((d, i) => (
            <Box key={i} sx={{ width: DAY_W, flexShrink: 0, px: 0.5, py: 0.5, borderLeft: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
              {d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}
            </Box>
          ))}
        </Box>

        {/* Resource rows */}
        {[...resourceMap.entries()].map(([resId, res]) => (
          <Box key={resId} sx={{ display: 'flex', borderBottom: '1px solid', borderColor: 'divider', height: ROW_H, position: 'relative', alignItems: 'center' }}>
            {/* Label */}
            <Box sx={{ width: LABEL_W, flexShrink: 0, px: 1, py: 0.5, zIndex: 1, bgcolor: 'background.paper' }}>
              <Typography variant="caption" fontWeight={700} noWrap>{res.name}</Typography>
              <Typography variant="caption" color="text.secondary" display="block">{res.code}</Typography>
            </Box>

            {/* Day grid lines */}
            {days.map((_, i) => (
              <Box key={i} sx={{
                position: 'absolute', left: LABEL_W + i * DAY_W, width: DAY_W, height: '100%',
                borderLeft: '1px solid', borderColor: 'divider',
                bgcolor: i % 2 === 0 ? 'transparent' : 'action.hover',
              }} />
            ))}

            {/* Operation bars */}
            {res.entries.map((e) => {
              const start = isoToLocal(e.startDatetime).getTime();
              const end   = isoToLocal(e.endDatetime).getTime();

              // Position within the full range
              const leftFrac  = (start - minMs) / totalMs;
              const widthFrac = (end - start) / totalMs;
              const leftPx    = LABEL_W + leftFrac * (days.length * DAY_W);
              const widthPx   = Math.max(widthFrac * (days.length * DAY_W), 4);

              const color = orderColorMap.get(e.orderId) ?? '#1976d2';
              const isLate = e.isLate === 1;

              return (
                <Tooltip key={e.id} title={
                  <Box>
                    <Typography variant="caption" fontWeight={700}>{e.orderNumber} — {e.opName}</Typography><br />
                    <Typography variant="caption">{e.itemName}</Typography><br />
                    <Typography variant="caption">
                      {fmtDateTime(e.startDatetime)} → {fmtDateTime(e.endDatetime)} ({fmtDur(e.durationHrs)})
                    </Typography>
                    {isLate && <><br /><Typography variant="caption" color="warning.light">⚠ Late order</Typography></>}
                    {e.locked === 1 && <><br /><Typography variant="caption">🔒 Locked</Typography></>}
                  </Box>
                } arrow>
                  <Box sx={{
                    position: 'absolute',
                    left: leftPx, width: widthPx, height: 30, top: '50%', transform: 'translateY(-50%)',
                    bgcolor: color, borderRadius: 0.5, opacity: 0.88,
                    border: isLate ? '2px solid #f57c00' : 'none',
                    display: 'flex', alignItems: 'center', px: 0.5,
                    overflow: 'hidden', cursor: 'default',
                    '&:hover': { opacity: 1, zIndex: 10 },
                  }}>
                    <Typography variant="caption" noWrap sx={{ color: '#fff', fontWeight: 600, fontSize: '0.65rem' }}>
                      {e.opName}
                    </Typography>
                    {e.locked === 1 && <LockIcon sx={{ fontSize: 10, color: '#fff', ml: 0.25 }} />}
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ── Run history table ─────────────────────────────────────────────────────────
function RunHistory({ runs }: { runs: SchedulerRun[] }) {
  if (runs.length === 0) return <Typography variant="body2" color="text.secondary">No scheduler runs yet.</Typography>;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {runs.slice(0, 5).map((r) => (
        <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 0.75,
          bgcolor: 'action.hover', borderRadius: 1, flexWrap: 'wrap' }}>
          <Chip label={r.status} size="small" color={r.status === 'success' ? 'success' : r.status === 'error' ? 'error' : 'warning'} />
          <Typography variant="caption">#{r.id}</Typography>
          <Typography variant="caption" color="text.secondary">
            {new Date(r.startedAt).toLocaleString('en-IN', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
          </Typography>
          <Typography variant="caption">Trigger: <strong>{r.triggeredBy}</strong></Typography>
          <Typography variant="caption">Orders: <strong>{r.ordersScheduled}</strong></Typography>
          <Typography variant="caption">Entries: <strong>{r.entriesCreated}</strong></Typography>
          {r.lateOrders > 0 && (
            <Chip icon={<WarningAmberIcon />} label={`${r.lateOrders} late`} size="small" color="warning" />
          )}
          {r.errorMessage && <Typography variant="caption" color="error">{r.errorMessage}</Typography>}
        </Box>
      ))}
    </Box>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SchedulerPage() {
  const canManage = usePermission('fab_erp_scheduler_manage');

  const [entries,  setEntries]  = useState<ScheduleEntry[]>([]);
  const [runs,     setRuns]     = useState<SchedulerRun[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [running,  setRunning]  = useState(false);
  const [error,    setError]    = useState('');
  const [toast,    setToast]    = useState('');
  const [lateOnly, setLateOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [entriesRes, runsRes] = await Promise.all([
        fabGet<ScheduleEntry[]>('scheduler/entries'),
        fabGet<SchedulerRun[]>('scheduler/runs'),
      ]);
      setEntries(entriesRes ?? []);
      setRuns(runsRes ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRunScheduler() {
    setRunning(true); setError('');
    try {
      const res = await fabPost<{ ordersScheduled: number; entriesCreated: number; lateOrders: number }>(
        'scheduler/run', {},
      );
      setToast(`Done — ${res.ordersScheduled} orders scheduled, ${res.lateOrders} late`);
      load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? msg);
    } finally {
      setRunning(false);
    }
  }

  async function toggleLock(e: ScheduleEntry) {
    try {
      await fabPut(`scheduler/entries/${e.id}/lock`, { locked: e.locked !== 1 });
      setEntries(prev => prev.map(x => x.id === e.id ? { ...x, locked: e.locked === 1 ? 0 : 1 } : x));
    } catch {
      setToast('Failed to update lock');
    }
  }

  const displayEntries = lateOnly ? entries.filter(e => e.isLate === 1) : entries;
  const lateCount = entries.filter(e => e.isLate === 1).length;

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Scheduler</Typography>
          <Typography variant="body2" color="text.secondary">
            Finite capacity schedule — operations assigned to machines by time slot
          </Typography>
        </Box>
        {canManage && (
          <Button
            variant="contained"
            startIcon={running ? <CircularProgress size={16} color="inherit" /> : <PlayArrowRoundedIcon />}
            onClick={handleRunScheduler}
            disabled={running}
          >
            {running ? 'Scheduling…' : 'Run Scheduler'}
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Late orders banner */}
      {lateCount > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}
          action={
            <Button size="small" color="inherit" onClick={() => setLateOnly(v => !v)}>
              {lateOnly ? 'Show All' : 'Show Late Only'}
            </Button>
          }>
          {lateCount} order{lateCount > 1 ? 's' : ''} cannot meet their required dates.
          Scheduler placed them as early as possible.
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : entries.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
          <PlayArrowRoundedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary" gutterBottom>
            No schedule entries yet.
          </Typography>
          {canManage && (
            <Typography variant="body2" color="text.secondary">
              Firm some planned orders first, then click "Run Scheduler".
            </Typography>
          )}
        </Paper>
      ) : (
        <>
          {/* Gantt */}
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            Gantt — {displayEntries.length} operation{displayEntries.length !== 1 ? 's' : ''} across{' '}
            {new Set(displayEntries.map(e => e.resourceId)).size} resource{new Set(displayEntries.map(e => e.resourceId)).size !== 1 ? 's' : ''}
          </Typography>
          <GanttChart entries={displayEntries} />

          {/* Operation list */}
          <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 3, mb: 1 }}>Operation List</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {displayEntries.map((e) => (
              <Paper key={e.id} variant="outlined" sx={{ px: 2, py: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', bgcolor: 'action.selected', px: 0.75, py: 0.25, borderRadius: 0.5 }}>
                    {e.orderNumber}
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
                    Op {e.seqNo}: {e.opName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{e.itemName}</Typography>
                  <Chip label={e.resourceName} size="small" variant="outlined" />
                  <Chip label={e.status} size="small" color={statusColor(e.status)} />
                  {e.isLate === 1 && <Chip icon={<WarningAmberIcon />} label="Late" size="small" color="warning" />}
                  {canManage && (
                    <Tooltip title={e.locked === 1 ? 'Unlock — allow rescheduling' : 'Lock — pin this slot'}>
                      <Box component="span" onClick={() => toggleLock(e)} sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        {e.locked === 1
                          ? <LockIcon fontSize="small" color="primary" />
                          : <LockOpenIcon fontSize="small" color="disabled" />}
                      </Box>
                    </Tooltip>
                  )}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block' }}>
                  {fmtDateTime(e.startDatetime)} → {fmtDateTime(e.endDatetime)} &nbsp;·&nbsp; {fmtDur(e.durationHrs)}
                  {e.actualStart && ` &nbsp;·&nbsp; Actual: ${fmtDateTime(e.actualStart)}`}
                </Typography>
              </Paper>
            ))}
          </Box>
        </>
      )}

      {/* Run history */}
      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Recent Runs</Typography>
        <RunHistory runs={runs} />
      </Box>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast('')} message={toast} />
    </Box>
  );
}
