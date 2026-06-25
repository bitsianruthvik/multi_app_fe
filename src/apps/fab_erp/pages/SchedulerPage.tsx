import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Tooltip, Typography } from '@mui/material';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import LockOpenRounded from '@mui/icons-material/LockOpenRounded';

import { fabGet, fabPost, fabPut } from '../api/client';
import { usePermission } from '@core/hooks/usePermission';
import { Surface, PageHeader, StatusBadge, Mono, EmptyState, useToast } from '../components';

interface ScheduleEntry {
  id: number; orderId: number; orderNumber: string; orderQty: number;
  itemName: string; itemCode: string; stepId: number; opName: string; seqNo: number;
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

function isoToLocal(s: string | null | undefined) {
  if (!s) return new Date(NaN);
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

const GANTT_COLORS = ['#7C3AED', '#0E9F6E', '#D97706', '#0284C7', '#E11D48', '#0D9488', '#5B21B6', '#DB5A2C'];

function GanttChart({ entries }: { entries: ScheduleEntry[] }) {
  if (entries.length === 0) return null;

  const resourceMap = new Map<number, { name: string; code: string; entries: ScheduleEntry[] }>();
  for (const e of entries) {
    if (!resourceMap.has(e.resourceId)) resourceMap.set(e.resourceId, { name: e.resourceName, code: e.resourceCode, entries: [] });
    resourceMap.get(e.resourceId)!.entries.push(e);
  }

  const allStarts = entries.map((e) => isoToLocal(e.startDatetime).getTime());
  const allEnds = entries.map((e) => isoToLocal(e.endDatetime).getTime());
  const minMs = Math.min(...allStarts);
  const maxMs = Math.max(...allEnds);
  const totalMs = maxMs - minMs || 1;

  const days: Date[] = [];
  const cursor = new Date(minMs);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= maxMs) { days.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); }

  const orderColorMap = new Map<number, string>();
  let ci = 0;
  for (const e of entries) if (!orderColorMap.has(e.orderId)) orderColorMap.set(e.orderId, GANTT_COLORS[ci++ % GANTT_COLORS.length]);

  const ROW_H = 48, LABEL_W = 160, DAY_W = 120;
  const totalW = LABEL_W + days.length * DAY_W;

  return (
    <Surface e={1} sx={{ overflowX: 'auto', p: 0 }}>
      <Box sx={{ minWidth: totalW, fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
        <Box sx={{ display: 'flex', borderBottom: '1px solid var(--c-divider)', background: 'var(--c-surface-2)' }}>
          <Box sx={{ width: LABEL_W, flexShrink: 0, px: 1, py: 0.5, fontWeight: 700, color: 'var(--c-text-2)' }}>Resource</Box>
          {days.map((d, i) => (
            <Box key={i} sx={{ width: DAY_W, flexShrink: 0, px: 0.5, py: 0.5, borderLeft: '1px solid var(--c-divider)', textAlign: 'center', color: 'var(--c-text-2)' }}>
              {d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}
            </Box>
          ))}
        </Box>

        {[...resourceMap.entries()].map(([resId, res]) => (
          <Box key={resId} sx={{ display: 'flex', borderBottom: '1px solid var(--c-divider)', height: ROW_H, position: 'relative', alignItems: 'center' }}>
            <Box sx={{ width: LABEL_W, flexShrink: 0, px: 1, py: 0.5, zIndex: 1, background: 'var(--c-surface)' }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.name}</Typography>
              <Typography sx={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>{res.code}</Typography>
            </Box>

            {days.map((_, i) => (
              <Box key={i} sx={{ position: 'absolute', left: LABEL_W + i * DAY_W, width: DAY_W, height: '100%', borderLeft: '1px solid var(--c-divider)', background: i % 2 === 0 ? 'transparent' : 'var(--c-surface-2)' }} />
            ))}

            {res.entries.map((e) => {
              const start = isoToLocal(e.startDatetime).getTime();
              const end = isoToLocal(e.endDatetime).getTime();
              const leftFrac = (start - minMs) / totalMs;
              const widthFrac = (end - start) / totalMs;
              const leftPx = LABEL_W + leftFrac * (days.length * DAY_W);
              const widthPx = Math.max(widthFrac * (days.length * DAY_W), 4);
              const color = orderColorMap.get(e.orderId) ?? '#7C3AED';
              const isLate = e.isLate === 1;

              return (
                <Tooltip key={e.id} title={
                  <Box>
                    <Typography variant="caption" fontWeight={700}>{e.orderNumber} — {e.opName}</Typography><br />
                    <Typography variant="caption">{e.itemName}</Typography><br />
                    <Typography variant="caption">{fmtDateTime(e.startDatetime)} → {fmtDateTime(e.endDatetime)} ({fmtDur(e.durationHrs)})</Typography>
                    {isLate && <><br /><Typography variant="caption" color="warning.light">⚠ Late order</Typography></>}
                    {e.locked === 1 && <><br /><Typography variant="caption">🔒 Locked</Typography></>}
                  </Box>
                } arrow>
                  <Box sx={{
                    position: 'absolute', left: leftPx, width: widthPx, height: 30, top: '50%', transform: 'translateY(-50%)',
                    background: color, borderRadius: 'var(--r-sm)', opacity: 0.9,
                    border: isLate ? '2px solid var(--c-warning-600)' : 'none',
                    display: 'flex', alignItems: 'center', px: 0.5, overflow: 'hidden', cursor: 'default',
                    transition: 'opacity var(--t-fast) var(--ease)',
                    '&:hover': { opacity: 1, zIndex: 10 },
                  }}>
                    <Typography noWrap sx={{ color: '#fff', fontWeight: 600, fontSize: '0.65rem' }}>{e.opName}</Typography>
                    {e.locked === 1 && <LockRounded sx={{ fontSize: 10, color: '#fff', ml: 0.25 }} />}
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
        ))}
      </Box>
    </Surface>
  );
}

function RunHistory({ runs }: { runs: SchedulerRun[] }) {
  if (runs.length === 0) return <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No scheduler runs yet.</Typography>;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {runs.slice(0, 5).map((r) => (
        <Surface key={r.id} e={1} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1, flexWrap: 'wrap' }}>
          <StatusBadge status={r.status} family={r.status === 'success' ? 'success' : r.status === 'error' ? 'danger' : 'warning'} />
          <Mono>#{r.id}</Mono>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{new Date(r.startedAt).toLocaleString('en-IN', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text)' }}>Trigger: <strong>{r.triggeredBy}</strong></Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text)' }}>Orders: <strong>{r.ordersScheduled}</strong></Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text)' }}>Entries: <strong>{r.entriesCreated}</strong></Typography>
          {r.lateOrders > 0 && <StatusBadge status={`${r.lateOrders} late`} family="warning" />}
          {r.errorMessage && <Typography sx={{ fontSize: 12, color: 'var(--c-danger-600)' }}>{r.errorMessage}</Typography>}
        </Surface>
      ))}
    </Box>
  );
}

export default function SchedulerPage() {
  const canManage = usePermission('fab_erp_scheduler_manage');
  const { toast } = useToast();

  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [runs, setRuns] = useState<SchedulerRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
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
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message ?? (err as Error).message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRunScheduler() {
    setRunning(true); setError('');
    try {
      const res = await fabPost<{ ordersScheduled: number; entriesCreated: number; lateOrders: number }>('scheduler/run', {});
      toast(`Done — ${res.ordersScheduled} orders scheduled, ${res.lateOrders} late`);
      load();
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message ?? (err as Error).message);
    } finally { setRunning(false); }
  }

  async function toggleLock(e: ScheduleEntry) {
    try {
      await fabPut(`scheduler/entries/${e.id}/lock`, { locked: e.locked !== 1 });
      setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, locked: e.locked === 1 ? 0 : 1 } : x)));
    } catch { toast('Failed to update lock', 'error'); }
  }

  const displayEntries = lateOnly ? entries.filter((e) => e.isLate === 1) : entries;
  const lateCount = entries.filter((e) => e.isLate === 1).length;

  return (
    <Box>
      <PageHeader
        title="Scheduler"
        subtitle="Finite capacity schedule — operations assigned to machines by time slot"
        actions={canManage && (
          <Button variant="contained" startIcon={running ? <CircularProgress size={16} color="inherit" /> : <PlayArrowRoundedIcon />} onClick={handleRunScheduler} disabled={running}>
            {running ? 'Scheduling…' : 'Run scheduler'}
          </Button>
        )}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {lateCount > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} action={
          <Button size="small" color="inherit" onClick={() => setLateOnly((v) => !v)}>{lateOnly ? 'Show all' : 'Show late only'}</Button>
        }>
          {lateCount} order{lateCount > 1 ? 's' : ''} cannot meet their required dates. Scheduler placed them as early as possible.
        </Alert>
      )}

      {loading ? (
        <Surface e={1} sx={{ p: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Surface>
      ) : entries.length === 0 ? (
        <EmptyState icon={<PlayArrowRoundedIcon />} title="No schedule entries yet" hint={canManage ? 'Firm some planned orders first, then click "Run scheduler".' : undefined} />
      ) : (
        <>
          <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1.5 }}>
            Gantt — {displayEntries.length} operation{displayEntries.length !== 1 ? 's' : ''} across {new Set(displayEntries.map((e) => e.resourceId)).size} resource{new Set(displayEntries.map((e) => e.resourceId)).size !== 1 ? 's' : ''}
          </Typography>
          <GanttChart entries={displayEntries} />

          <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mt: 3, mb: 1.5 }}>Operation list</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {displayEntries.map((e) => (
              <Surface key={e.id} e={1} sx={{ px: 2, py: 1.25 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <Mono chip>{e.orderNumber}</Mono>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: 'var(--c-text)', flex: 1 }}>Op {e.seqNo}: {e.opName}</Typography>
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{e.itemName}</Typography>
                  <Mono chip>{e.resourceName}</Mono>
                  <StatusBadge status={e.status} />
                  {e.isLate === 1 && <StatusBadge status="Late" family="warning" />}
                  {canManage && (
                    <Tooltip title={e.locked === 1 ? 'Unlock — allow rescheduling' : 'Lock — pin this slot'}>
                      <Box component="span" onClick={() => toggleLock(e)} sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: e.locked === 1 ? 'var(--c-primary-600)' : 'var(--c-text-3)' }}>
                        {e.locked === 1 ? <LockRounded fontSize="small" /> : <LockOpenRounded fontSize="small" />}
                      </Box>
                    </Tooltip>
                  )}
                </Box>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.5 }}>
                  <Mono>{fmtDateTime(e.startDatetime)}</Mono> → <Mono>{fmtDateTime(e.endDatetime)}</Mono> · {fmtDur(e.durationHrs)}
                  {e.actualStart && <> · Actual: <Mono>{fmtDateTime(e.actualStart)}</Mono></>}
                </Typography>
              </Surface>
            ))}
          </Box>
        </>
      )}

      <Box sx={{ mt: 3 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1.5 }}>Recent runs</Typography>
        <RunHistory runs={runs} />
      </Box>
    </Box>
  );
}
