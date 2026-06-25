import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Chip, CircularProgress, Alert,
  Paper, Stack, Tooltip, IconButton, Card, CardContent,
  Drawer, LinearProgress, Divider, List, ListItemButton, ListItemText,
} from '@mui/material';
import PlayArrowIcon          from '@mui/icons-material/PlayArrow';
import WarningAmberIcon       from '@mui/icons-material/WarningAmber';
import CalendarTodayIcon      from '@mui/icons-material/CalendarToday';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import ChevronLeftIcon        from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon       from '@mui/icons-material/ChevronRight';
import HistoryIcon            from '@mui/icons-material/History';
import CloseIcon              from '@mui/icons-material/Close';
import CheckCircleIcon        from '@mui/icons-material/CheckCircle';
import api, { API_HOST } from '@core/utils/axiosConfig';
import ProgressPopover, { type TaskProgressEntry } from '../components/ProgressPopover';

// ── Types ────────────────────────────────────────────────────────────────────

interface WorkArea {
  id: number;
  code: string;
  name: string;
  maxParallelJobs: number;
}

interface ScheduleTask {
  id: number;
  nodePrefix: string;
  nodeId: number | null;
  nodeDisplay: string;
  processStepId: number;
  stepName: string;
  processType: string;
  workAreaId: number | null;
  workAreaCode: string;
  workAreaName: string;
  startDate: string;
  endDate: string;
  scheduledHours: number;
  isCritical: boolean;
  isUnassigned: boolean;
}

interface ScheduleData {
  startDate: string;
  endDate: string;
  workAreas: WorkArea[];
  tasks: ScheduleTask[];
}

interface VersionSummary {
  id: number;
  version_no: number;
  triggered_by: 'manual' | 'replan' | 'cron';
  task_count: number;
  created_at: string;
}

// ── View mode ─────────────────────────────────────────────────────────────────

type ViewMode = 'day' | 'week' | 'month';

// ── Color palette ────────────────────────────────────────────────────────────

const PALETTE = [
  '#1565c0','#2e7d32','#e65100','#6a1b9a','#b71c1c',
  '#006064','#33691e','#bf360c','#4a148c','#880e4f',
  '#0277bd','#558b2f','#f57f17','#4527a0','#00695c',
];
const prefixColorIndex = new Map<string, number>();
function getNodeColor(prefix: string): string {
  if (!prefixColorIndex.has(prefix)) prefixColorIndex.set(prefix, prefixColorIndex.size);
  return PALETTE[prefixColorIndex.get(prefix)! % PALETTE.length];
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function parseDate(s: string) { return new Date(s + 'T00:00:00'); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function diffDays(a: string, b: string) {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}
function fmtDate(s: string) {
  return parseDate(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getViewRange(mode: ViewMode, date: Date): { start: Date; end: Date } {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  if (mode === 'day') return { start: d, end: d };
  if (mode === 'week') {
    const day = d.getDay();
    const start = new Date(d); start.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    const end   = new Date(start); end.setDate(start.getDate() + 6);
    return { start, end };
  }
  return {
    start: new Date(d.getFullYear(), d.getMonth(), 1),
    end:   new Date(d.getFullYear(), d.getMonth() + 1, 0),
  };
}

function getViewLabel(mode: ViewMode, start: Date, end: Date): string {
  if (mode === 'day')   return start.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (mode === 'month') return start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const sameMonth = start.getMonth() === end.getMonth();
  const s = start.toLocaleDateString('en-GB', { day: 'numeric', month: sameMonth ? undefined : 'short' });
  const e = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${s}–${e}`;
}

function navigateDate(current: Date, mode: ViewMode, dir: -1 | 1): Date {
  if (mode === 'day')  return addDays(current, dir);
  if (mode === 'week') return addDays(current, 7 * dir);
  const d = new Date(current); d.setMonth(d.getMonth() + dir); return d;
}

// ── Lane assignment ───────────────────────────────────────────────────────────

// Within a single lane, tasks that share overlapping date ranges (e.g. forced placement
// when maxParallelJobs is exceeded) must not overlap visually, but must also NOT create
// extra visual rows beyond the lane itself (that would suggest more capacity than exists).
// Solution: group tasks by connected overlap, then stack the group proportionally inside
// the existing LANE_H. Non-overlapping tasks stay full-height and centred as normal.
function groupByOverlap(tasks: ScheduleTask[]): ScheduleTask[][] {
  if (tasks.length === 0) return [];
  const n = tasks.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  };
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (tasks[i].startDate <= tasks[j].endDate && tasks[j].startDate <= tasks[i].endDate)
        parent[find(i)] = find(j);
  const map = new Map<number, ScheduleTask[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!map.has(root)) map.set(root, []);
    map.get(root)!.push(tasks[i]);
  }
  return [...map.values()];
}

function assignLanes(tasks: ScheduleTask[], maxLanes = Infinity): ScheduleTask[][] {
  const sorted = [...tasks].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const lanes: ScheduleTask[][] = [];
  for (const t of sorted) {
    let placed = false;
    for (const lane of lanes) {
      if (lane[lane.length - 1].endDate < t.startDate) { lane.push(t); placed = true; break; }
    }
    if (!placed) {
      if (lanes.length < maxLanes) {
        lanes.push([t]);
      } else {
        let best = lanes[0];
        for (const lane of lanes)
          if (lane[lane.length - 1].endDate <= best[best.length - 1].endDate) best = lane;
        best.push(t);
      }
    }
  }
  return lanes;
}

// ── Gantt layout constants ────────────────────────────────────────────────────

const LEFT_W    = 228;
const HEADER_H  = 52;
const WA_HDR_H  = 34;
const LANE_H    = 80;
const BAR_PAD   = 6;
const MIN_BAR_H = 10;

function calcBarH(hours: number): number {
  const inner = LANE_H - BAR_PAD * 2;
  return Math.max(MIN_BAR_H, Math.min(inner, Math.round((Math.min(hours, 8) / 8) * inner)));
}

// ── Legend strip ──────────────────────────────────────────────────────────────

function LegendStrip({ tasks }: { tasks: ScheduleTask[] }) {
  const entries = useMemo(() => {
    tasks.forEach(t => getNodeColor(t.nodePrefix));
    const seen = new Set<string>();
    return tasks
      .filter(t => !t.isCritical && !t.isUnassigned)
      .reduce<{ prefix: string; display: string; color: string }[]>((acc, t) => {
        if (!seen.has(t.nodePrefix)) {
          seen.add(t.nodePrefix);
          acc.push({ prefix: t.nodePrefix, display: t.nodeDisplay, color: getNodeColor(t.nodePrefix) });
        }
        return acc;
      }, []);
  }, [tasks]);

  const hasCritical   = tasks.some(t => t.isCritical);
  const hasUnassigned = tasks.some(t => t.isUnassigned);

  return (
    <Box sx={{
      px: 2, py: 0.75, borderBottom: 1, borderColor: 'divider',
      display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center',
      bgcolor: 'grey.50', flexShrink: 0, minHeight: 36,
    }}>
      <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ mr: 0.5 }}>Legend</Typography>
      {entries.map(e => (
        <Box key={e.prefix} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: e.color }} />
          <Typography variant="caption" sx={{ fontSize: 11 }}>{e.display}</Typography>
        </Box>
      ))}
      {hasCritical && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: '#c62828',
            boxShadow: '0 0 0 1.5px rgba(198,40,40,0.4)' }} />
          <Typography variant="caption" sx={{ fontSize: 11, color: 'error.dark', fontWeight: 600 }}>Critical Path</Typography>
        </Box>
      )}
      {hasUnassigned && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: 'warning.main' }} />
          <Typography variant="caption" sx={{ fontSize: 11, color: 'warning.dark' }}>Unassigned</Typography>
        </Box>
      )}
    </Box>
  );
}

// ── Task bar ──────────────────────────────────────────────────────────────────

function TaskBar({
  task, x, w, top, height, dayPx, onTip, onProgressClick,
  completionPct, delayDays, historyMode,
}: {
  task: ScheduleTask; x: number; w: number; top: number; height: number; dayPx: number;
  completionPct?: number;   // 0-100, current progress
  delayDays?: number | null; // history mode: actual close vs planned end
  historyMode?: boolean;
  onTip: (v: { task: ScheduleTask; x: number; y: number } | null) => void;
  onProgressClick: (el: HTMLElement, t: ScheduleTask) => void;
}) {
  const isDone  = completionPct != null && completionPct >= 100;
  const color   = isDone && historyMode
    ? '#9e9e9e'
    : task.isCritical ? '#c62828' : getNodeColor(task.nodePrefix);
  const showLabel  = dayPx > 4 && w >= 26 && height >= MIN_BAR_H;
  const showSub    = w >= 56  && height >= 22;
  const showDetail = w >= 100 && height >= 34;
  const showDelay  = historyMode && delayDays != null && w >= 60 && height >= MIN_BAR_H;

  return (
    <Box
      onMouseEnter={(e) => onTip({ task, x: e.clientX, y: e.clientY })}
      onMouseLeave={() => onTip(null)}
      onClick={(e) => !historyMode && onProgressClick(e.currentTarget, task)}
      sx={{
        position: 'absolute',
        left: x, top, width: w, height,
        bgcolor: color, borderRadius: '5px',
        cursor: historyMode ? 'default' : 'pointer', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        justifyContent: height < 22 ? 'center' : 'flex-start',
        pt: height >= 22 ? '3px' : 0,
        pl: '5px', pr: '3px',
        opacity: isDone && historyMode ? 0.7 : 1,
        boxShadow: task.isCritical && !historyMode
          ? '0 0 0 2px rgba(198,40,40,0.4), 0 1px 4px rgba(0,0,0,0.2)'
          : '0 1px 3px rgba(0,0,0,0.18)',
        transition: 'filter 0.1s, box-shadow 0.1s',
        '&:hover': historyMode ? {} : {
          filter: 'brightness(1.15)', zIndex: 20,
          boxShadow: '0 3px 10px rgba(0,0,0,0.25)',
        },
      }}
    >
      {showLabel && (
        <Typography sx={{ color: 'white', fontSize: 10, fontWeight: 700, lineHeight: 1.3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
          {task.nodeDisplay}
        </Typography>
      )}
      {showSub && (
        <Typography sx={{ color: 'rgba(255,255,255,0.88)', fontSize: 9, lineHeight: 1.2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
          {task.stepName}
        </Typography>
      )}
      {showDetail && !showDelay && (
        <Typography sx={{ color: 'rgba(255,255,255,0.72)', fontSize: 9, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
          {task.scheduledHours.toFixed(1)} h · {task.processType}
        </Typography>
      )}
      {showDelay && (
        <Typography sx={{ color: 'rgba(255,255,255,0.9)', fontSize: 9, fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
          {delayDays === 0 ? 'On time' : delayDays! > 0 ? `${delayDays}d late` : `${Math.abs(delayDays!)}d early`}
        </Typography>
      )}
      {/* Progress strip at the bottom */}
      {!historyMode && completionPct != null && completionPct > 0 && (
        <Box sx={{
          position: 'absolute', bottom: 0, left: 0, height: 5,
          width: `${completionPct}%`,
          bgcolor: 'rgba(255,255,255,0.45)',
          borderRadius: '0 0 0 5px',
          pointerEvents: 'none',
        }} />
      )}
    </Box>
  );
}

// ── Day detail view ───────────────────────────────────────────────────────────

function DayDetailView({
  data, dateStr, progressByTask, onProgressClick,
}: {
  data: ScheduleData;
  dateStr: string;
  progressByTask: Map<string, TaskProgressEntry[]>;
  onProgressClick: (el: HTMLElement, t: ScheduleTask) => void;
}) {
  const dayTasks = useMemo(
    () => data.tasks.filter(t => t.startDate <= dateStr && t.endDate >= dateStr),
    [data.tasks, dateStr],
  );

  const grouped = useMemo(() => {
    // Drive sections from the authoritative workAreas list (same source the Gantt uses),
    // then do a direct workAreaId === wa.id comparison instead of string Map keys.
    const sections: { key: string; label: string; isUnassigned: boolean; tasks: ScheduleTask[] }[] = [];

    for (const wa of data.workAreas) {
      const waTasks = dayTasks.filter(t => !t.isUnassigned && t.workAreaId === wa.id);
      if (waTasks.length > 0) {
        sections.push({ key: String(wa.id), label: wa.name, isUnassigned: false, tasks: waTasks });
      }
    }

    // Any tasks that fell through (truly unassigned or unknown work area)
    const unassigned = dayTasks.filter(t => t.isUnassigned || !t.workAreaId);
    if (unassigned.length > 0) {
      sections.push({ key: '__unassigned__', label: 'Unassigned', isUnassigned: true, tasks: unassigned });
    }

    return sections;
  }, [data.workAreas, dayTasks]);

  if (dayTasks.length === 0) {
    return (
      <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary" variant="body1">No tasks scheduled for this day.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3 }}>
      <Stack spacing={3}>
        {grouped.map(({ key, label, isUnassigned, tasks }) => (
          <Box key={key}>
            <Typography
              variant="subtitle1" fontWeight={700}
              color={isUnassigned ? 'warning.dark' : 'text.primary'}
              sx={{ mb: 1.5, pb: 0.5, borderBottom: 1, borderColor: isUnassigned ? 'warning.main' : 'divider' }}
            >
              {label}
            </Typography>
            <Stack spacing={1.5}>
              {tasks.map(t => {
                const tKey    = `${t.processStepId}:${t.nodeId ?? 'null'}`;
                const entries = progressByTask.get(tKey) ?? [];
                const latest  = entries.length > 0
                  ? entries.reduce((b, e) => e.logDate > b.logDate ? e : b)
                  : null;
                const pct = latest?.completionPct ?? 0;
                return (
                  <Card
                    key={t.id}
                    variant="outlined"
                    onClick={(e) => onProgressClick(e.currentTarget, t)}
                    sx={{
                      cursor: 'pointer',
                      borderLeft: '4px solid',
                      borderLeftColor: t.isCritical ? 'error.main' : getNodeColor(t.nodePrefix),
                      transition: 'box-shadow 0.15s',
                      '&:hover': { boxShadow: 3, bgcolor: 'action.hover' },
                    }}
                  >
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 0 } }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                        <Box sx={{
                          width: 10, height: 10, borderRadius: '2px', flexShrink: 0,
                          bgcolor: t.isCritical ? 'error.main' : getNodeColor(t.nodePrefix),
                        }} />
                        <Typography variant="body1" fontWeight={700}>{t.nodeDisplay}</Typography>
                        {t.isCritical && <Chip size="small" color="error" label="Critical Path" />}
                        {pct >= 100 && <CheckCircleIcon color="success" sx={{ fontSize: 16 }} />}
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                        {t.stepName}
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 1.5 }}>
                        <Box>
                          <Typography variant="caption" color="text.secondary" display="block">Process Type</Typography>
                          <Typography variant="body2" fontWeight={500}>{t.processType}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary" display="block">Scheduled Hours</Typography>
                          <Typography variant="body2" fontWeight={500}>{t.scheduledHours.toFixed(1)} h</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary" display="block">Task Range</Typography>
                          <Typography variant="body2" fontWeight={500}>{fmtDate(t.startDate)} → {fmtDate(t.endDate)}</Typography>
                        </Box>
                      </Box>
                      <Box sx={{ pb: 1.5 }}>
                        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                          <Typography variant="caption" color="text.secondary">Progress</Typography>
                          <Typography variant="caption" fontWeight={600}
                            color={pct >= 100 ? 'success.main' : 'text.primary'}>
                            {pct.toFixed(0)} %
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate" value={Math.min(pct, 100)}
                          color={pct >= 100 ? 'success' : 'primary'}
                          sx={{ height: 6, borderRadius: 3 }}
                        />
                      </Box>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PlanSchedule({ rootHeight = '100vh' }: { rootHeight?: string }) {
  const { company, planId } = useParams<{ company: string; planId: string }>();
  const navigate            = useNavigate();

  const [data,    setData]    = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [viewDate, setViewDate] = useState(() => new Date());

  const [tip,             setTip]             = useState<{ task: ScheduleTask; x: number; y: number } | null>(null);
  const [progressAnchor,  setProgressAnchor]  = useState<{ el: HTMLElement; task: ScheduleTask } | null>(null);

  // Task progress
  const [progressAllByTask, setProgressAllByTask] = useState<Map<string, TaskProgressEntry[]>>(new Map());
  const fetchProgress = useCallback(async () => {
    try {
      const res = await api.get(`${API_HOST}/api/${company}/fab_flow/plans/${planId}/progress`);
      const entries: TaskProgressEntry[] = (res.data.data ?? []).map((r: Record<string, unknown>) => ({
        id:                r.id,
        processStepId:     r.process_step_id,
        nodeId:            r.node_id ?? null,
        logDate:           r.log_date,
        completionPct:     r.completion_pct,
        workStart:         r.work_start ?? null,
        workEnd:           r.work_end   ?? null,
        delayReasonCodes:  r.delay_reason_codes ?? null,
        notes:             r.notes ?? null,
      }));
      const map = new Map<string, TaskProgressEntry[]>();
      for (const e of entries) {
        const k = `${e.processStepId}:${e.nodeId ?? 'null'}`;
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(e);
      }
      setProgressAllByTask(map);
    } catch { /* ignore */ }
  }, [company, planId]);

  // Derived maps from progress
  const latestPctByTask = useMemo(() => {
    const m = new Map<string, number>();
    for (const [k, entries] of progressAllByTask) {
      const latest = entries.reduce((b, e) => e.logDate > b.logDate ? e : b);
      m.set(k, latest.completionPct);
    }
    return m;
  }, [progressAllByTask]);

  const closeDateByTask = useMemo(() => {
    const m = new Map<string, string>();
    for (const [k, entries] of progressAllByTask) {
      const closed = entries.find(e => e.completionPct >= 100);
      if (closed) m.set(k, closed.logDate);
    }
    return m;
  }, [progressAllByTask]);

  // Version history
  const [versions,        setVersions]        = useState<VersionSummary[]>([]);
  const [versionsOpen,    setVersionsOpen]     = useState(false);
  const [viewingVersion,  setViewingVersion]   = useState<{ id: number; versionNo: number; createdAt: string; data: ScheduleData } | null>(null);

  const fetchVersions = useCallback(async () => {
    try {
      const res = await api.get(`${API_HOST}/api/${company}/fab_flow/plans/${planId}/schedule/versions`);
      setVersions(res.data.data ?? []);
    } catch { /* ignore */ }
  }, [company, planId]);

  const loadVersion = async (v: VersionSummary) => {
    try {
      const res = await api.get(`${API_HOST}/api/${company}/fab_flow/plans/${planId}/schedule/versions/${v.id}`);
      setViewingVersion({ id: v.id, versionNo: v.version_no, createdAt: v.created_at, data: res.data.data.schedule });
      setVersionsOpen(false);
    } catch { /* ignore */ }
  };

  // Measure chart container width to auto-size dayPx.
  // Use a callback ref so the observer attaches after data loads and the element mounts.
  const [containerW, setContainerW] = useState(0);
  const [chartEl, setChartEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!chartEl) return;
    setContainerW(chartEl.getBoundingClientRect().width);
    const ro = new ResizeObserver(entries => setContainerW(entries[0].contentRect.width));
    ro.observe(chartEl);
    return () => ro.disconnect();
  }, [chartEl]);

  const { start: viewStart, end: viewEnd } = useMemo(
    () => getViewRange(viewMode, viewDate),
    [viewMode, viewDate],
  );
  const viewStartStr  = localDateStr(viewStart);
  const viewEndStr    = localDateStr(viewEnd);
  const totalViewDays = diffDays(viewStartStr, viewEndStr) + 1;

  const dayPx = useMemo(() => {
    if (!containerW) return 14;
    return Math.max(1, (containerW - LEFT_W) / totalViewDays);
  }, [containerW, totalViewDays]);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`${API_HOST}/api/${company}/fab_flow/plans/${planId}/schedule`);
      setData(res.data.data ?? null);
    } catch (e) {
      const err = e as { response?: { status?: number }; message?: string };
      if (err.response?.status === 404) setData(null);
      else setError(err.message ?? 'Unknown error');
    } finally { setLoading(false); }
  }, [company, planId]);

  useEffect(() => { fetchSchedule(); fetchProgress(); fetchVersions(); }, [fetchSchedule, fetchProgress, fetchVersions]);

  const runSchedule = async () => {
    setRunning(true); setError(null);
    try {
      await api.post(`${API_HOST}/api/${company}/fab_flow/plans/${planId}/schedule`);
      await fetchSchedule();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err.response?.data?.error ?? err.message ?? 'Unknown error');
    } finally { setRunning(false); }
  };

  const replanFromToday = async () => {
    if (!window.confirm(
      'Re-plan from today using current progress?\n\n'
      + '· Completed tasks stay as-is\n'
      + '· In-progress tasks keep their start, end recomputed\n'
      + '· Not-yet-started tasks rescheduled from today',
    )) return;
    setRunning(true); setError(null);
    try {
      await api.post(
        `${API_HOST}/api/${company}/fab_flow/plans/${planId}/schedule/replan`,
        { fromDate: localDateStr(new Date()) },
      );
      await fetchSchedule();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err.response?.data?.error ?? err.message ?? 'Unknown error');
    } finally { setRunning(false); }
  };

  const nav = (dir: -1 | 1) => setViewDate(prev => navigateDate(prev, viewMode, dir));

  return (
    <Box sx={{ height: rootHeight, display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>

      {/* ── Toolbar ── */}
      <Paper elevation={0} sx={{
        px: 3, py: 1.5, borderBottom: 1, borderColor: 'divider',
        display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <CalendarTodayIcon color="primary" />
        <Typography variant="h6" fontWeight={700}>Schedule</Typography>
        <Box sx={{ flexGrow: 1 }} />

        {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}

        {data && !loading && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="small" label={`${data.tasks.length} tasks`} color="primary" variant="outlined" />
            {data.tasks.some(t => t.isUnassigned) && (
              <Chip size="small" color="warning" icon={<WarningAmberIcon />}
                label={`${data.tasks.filter(t => t.isUnassigned).length} unassigned`} />
            )}
          </Stack>
        )}

        {/* ── View mode buttons ── */}
        <Stack direction="row" spacing={0.5}>
          {(['day', 'week', 'month'] as ViewMode[]).map(m => (
            <Button
              key={m}
              size="small"
              variant={viewMode === m ? 'contained' : 'outlined'}
              sx={{ minWidth: 52, px: 1, fontSize: 12, textTransform: 'capitalize' }}
              onClick={() => setViewMode(m)}
            >
              {m}
            </Button>
          ))}
        </Stack>

        {/* ── Date navigation ── */}
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Tooltip title="Previous">
            <IconButton size="small" onClick={() => nav(-1)}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Typography variant="body2" fontWeight={500} sx={{ minWidth: 200, textAlign: 'center' }}>
            {getViewLabel(viewMode, viewStart, viewEnd)}
          </Typography>
          <Tooltip title="Next">
            <IconButton size="small" onClick={() => nav(1)}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            size="small" variant="outlined"
            sx={{ minWidth: 0, px: 1.5, fontSize: 11 }}
            onClick={() => setViewDate(new Date())}
          >
            Today
          </Button>
        </Stack>

        <Button size="small" startIcon={<AssignmentTurnedInIcon />}
          onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/progress`)}>
          Daily Progress
        </Button>
        {data && (
          <Button size="small" variant="outlined"
            onClick={replanFromToday} disabled={running || loading}>
            Re-plan from Today
          </Button>
        )}
        {versions.length > 0 && (
          <Chip
            size="small"
            label={viewingVersion ? `v${viewingVersion.versionNo}` : `v${versions[0].version_no}`}
            color={viewingVersion ? 'warning' : 'default'}
            variant="outlined"
            sx={{ fontWeight: 700 }}
          />
        )}
        <Tooltip title="Version history">
          <IconButton size="small" onClick={() => { fetchVersions(); setVersionsOpen(true); }}>
            <HistoryIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Button
          variant="contained" size="small"
          startIcon={running ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
          onClick={runSchedule} disabled={running || loading}
        >
          {data ? 'Re-run' : 'Generate'}
        </Button>
      </Paper>

      {/* History mode banner */}
      {viewingVersion && (
        <Alert
          severity="info"
          sx={{ borderRadius: 0, flexShrink: 0 }}
          action={
            <Button size="small" color="inherit" onClick={() => setViewingVersion(null)}>
              Back to live
            </Button>
          }
        >
          Viewing v{viewingVersion.versionNo} · {new Date(viewingVersion.createdAt).toLocaleString('en-GB')}
        </Alert>
      )}

      {/* ── Body ── */}
      {loading ? (
        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : !data ? (
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <Typography color="text.secondary">No schedule generated yet.</Typography>
          <Button variant="contained" onClick={runSchedule} disabled={running} startIcon={<PlayArrowIcon />}>
            Generate Schedule
          </Button>
        </Box>
      ) : viewMode === 'day' ? (
        <DayDetailView
          data={viewingVersion?.data ?? data}
          dateStr={viewStartStr}
          progressByTask={progressAllByTask}
          onProgressClick={(el, t) => setProgressAnchor({ el, task: t })}
        />
      ) : (
        <Box ref={setChartEl} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <LegendStrip tasks={(viewingVersion?.data ?? data).tasks} />
          <GanttChart
            data={viewingVersion?.data ?? data}
            viewStartStr={viewStartStr}
            viewEndStr={viewEndStr}
            dayPx={dayPx}
            onTip={setTip}
            onProgressClick={(el, t) => setProgressAnchor({ el, task: t })}
            latestPctByTask={latestPctByTask}
            closeDateByTask={closeDateByTask}
            historyMode={viewingVersion !== null}
          />
        </Box>
      )}

      {/* Progress popover */}
      <ProgressPopover
        anchorEl={progressAnchor?.el ?? null}
        task={progressAnchor ? {
          processStepId:  progressAnchor.task.processStepId,
          nodeId:         progressAnchor.task.nodeId,
          nodeDisplay:    progressAnchor.task.nodeDisplay,
          stepName:       progressAnchor.task.stepName,
          workAreaName:   progressAnchor.task.workAreaName,
          startDate:      progressAnchor.task.startDate,
          endDate:        progressAnchor.task.endDate,
          scheduledHours: progressAnchor.task.scheduledHours,
        } : null}
        allEntries={progressAnchor
          ? (progressAllByTask.get(`${progressAnchor.task.processStepId}:${progressAnchor.task.nodeId ?? 'null'}`) ?? [])
          : []}
        planId={Number(planId)}
        company={company!}
        onClose={() => setProgressAnchor(null)}
        onSaved={() => fetchProgress()}
      />

      {/* Version history drawer */}
      <Drawer
        anchor="right"
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        PaperProps={{ sx: { width: 300, display: 'flex', flexDirection: 'column' } }}
      >
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <Typography variant="h6" fontWeight={700}>Version History</Typography>
          <IconButton size="small" onClick={() => setVersionsOpen(false)}><CloseIcon /></IconButton>
        </Box>
        <Divider />
        <List dense sx={{ flexGrow: 1, overflow: 'auto' }}>
          {versions.map(v => (
            <ListItemButton
              key={v.id}
              selected={viewingVersion?.id === v.id}
              onClick={() => loadVersion(v)}
            >
              <ListItemText
                primary={`v${v.version_no} — ${v.triggered_by}`}
                secondary={new Date(v.created_at).toLocaleString('en-GB')}
              />
            </ListItemButton>
          ))}
          {versions.length === 0 && (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">No saved versions yet.</Typography>
            </Box>
          )}
        </List>
      </Drawer>

      {/* ── Hover tooltip ── */}
      {tip && (
        <Paper elevation={8} sx={{
          position: 'fixed', left: tip.x + 14, top: tip.y - 10,
          p: 1.5, zIndex: 9999, maxWidth: 300, pointerEvents: 'none',
          borderRadius: 2,
          borderLeft: '4px solid',
          borderLeftColor: tip.task.isCritical ? 'error.main' : getNodeColor(tip.task.nodePrefix),
          border: '1px solid', borderColor: 'divider',
        }}>
          <Typography variant="body2" fontWeight={700} noWrap sx={{ mb: 0.25 }}>
            {tip.task.nodeDisplay}
          </Typography>
          <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 0.25 }}>
            {tip.task.stepName}
          </Typography>
          <Typography variant="caption" display="block" sx={{ mb: 0.25 }}>
            {fmtDate(tip.task.startDate)} → {fmtDate(tip.task.endDate)}
          </Typography>
          <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 0.25 }}>
            {tip.task.scheduledHours.toFixed(1)} h · {tip.task.processType}
          </Typography>
          {tip.task.workAreaName && (
            <Typography variant="caption" display="block" color="text.secondary">
              {tip.task.workAreaName}
            </Typography>
          )}
          {tip.task.isCritical && (
            <Chip size="small" color="error" label="Critical Path" sx={{ mt: 0.5 }} />
          )}
        </Paper>
      )}
    </Box>
  );
}

// ── Gantt Chart ───────────────────────────────────────────────────────────────
//
// Freeze-pane layout — left labels column + scrollable canvas.
// dayPx is computed by the parent so the view period fills the viewport width.

function GanttChart({
  data, viewStartStr, viewEndStr, dayPx, onTip, onProgressClick,
  latestPctByTask, closeDateByTask, historyMode,
}: {
  data: ScheduleData;
  viewStartStr: string;
  viewEndStr: string;
  dayPx: number;
  onTip: (v: { task: ScheduleTask; x: number; y: number } | null) => void;
  onProgressClick: (el: HTMLElement, t: ScheduleTask) => void;
  latestPctByTask: Map<string, number>;
  closeDateByTask: Map<string, string>;
  historyMode?: boolean;
}) {
  const { workAreas } = data;

  const visibleTasks = useMemo(
    () => data.tasks.filter(t => t.startDate <= viewEndStr && t.endDate >= viewStartStr),
    [data.tasks, viewStartStr, viewEndStr],
  );

  const totalDays  = diffDays(viewStartStr, viewEndStr) + 1;
  const totalWidth = totalDays * dayPx;

  const mainScrollRef   = useRef<HTMLDivElement>(null);
  const leftScrollRef   = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const main = mainScrollRef.current;
    if (!main) return;
    if (leftScrollRef.current)   leftScrollRef.current.scrollTop   = main.scrollTop;
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = main.scrollLeft;
  }, []);

  // Task position helpers — relative to viewStartStr, clipped to view bounds
  const taskLeft = (t: ScheduleTask) => Math.max(0, diffDays(viewStartStr, t.startDate)) * dayPx;
  const taskWidth = (t: ScheduleTask) => {
    const visStart = t.startDate < viewStartStr ? viewStartStr : t.startDate;
    const visEnd   = t.endDate   > viewEndStr   ? viewEndStr   : t.endDate;
    return Math.max(dayPx - 1, (diffDays(visStart, visEnd) + 1) * dayPx - 2);
  };

  const tasksByWA = useMemo(() => {
    const m = new Map<number, ScheduleTask[]>();
    for (const t of visibleTasks) {
      if (t.workAreaId && !t.isUnassigned) {
        if (!m.has(t.workAreaId)) m.set(t.workAreaId, []);
        m.get(t.workAreaId)!.push(t);
      }
    }
    return m;
  }, [visibleTasks]);
  const unassigned = useMemo(() => visibleTasks.filter(t => !t.workAreaId || t.isUnassigned), [visibleTasks]);

  const rows = workAreas
    .map(wa => ({ wa, lanes: assignLanes(tasksByWA.get(wa.id) ?? [], wa.maxParallelJobs) }))
    .filter(r => r.lanes.length > 0);
  const unassignedLanes = assignLanes(unassigned);

  // Header labels
  const headerLabels = useMemo(() => {
    const labels: { day: number; label: string }[] = [];
    if (dayPx < 6) {
      let prevM = -1;
      for (let d = 0; d < totalDays; d++) {
        const dt = addDays(parseDate(viewStartStr), d);
        if (dt.getMonth() !== prevM) {
          labels.push({ day: d, label: dt.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) });
          prevM = dt.getMonth();
        }
      }
    } else if (dayPx < 18) {
      for (let d = 0; d < totalDays; d += 7)
        labels.push({ day: d, label: fmtDate(localDateStr(addDays(parseDate(viewStartStr), d))) });
    } else {
      for (let d = 0; d < totalDays; d++) {
        const dt = addDays(parseDate(viewStartStr), d);
        labels.push({
          day: d,
          label: (dt.getDate() === 1 || d === 0)
            ? dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
            : String(dt.getDate()),
        });
      }
    }
    return labels;
  }, [dayPx, totalDays, viewStartStr]);

  // Alternating column bands
  const bandItems = useMemo(() => {
    const items: { day: number; width: number }[] = [];
    if (dayPx < 6) {
      let bs = 0, prevM = addDays(parseDate(viewStartStr), 0).getMonth();
      for (let d = 1; d <= totalDays; d++) {
        const m = d < totalDays ? addDays(parseDate(viewStartStr), d).getMonth() : -1;
        if (m !== prevM) { items.push({ day: bs, width: d - bs }); bs = d; prevM = m; }
      }
    } else {
      for (let d = 0; d < totalDays; d += 7)
        items.push({ day: d, width: Math.min(7, totalDays - d) });
    }
    return items;
  }, [dayPx, totalDays, viewStartStr]);

  // Weekend shading
  const weekendDays = useMemo(() => {
    if (dayPx < 10) return [];
    const wk: number[] = [];
    for (let d = 0; d < totalDays; d++) {
      const dt = addDays(parseDate(viewStartStr), d);
      if (dt.getDay() === 0 || dt.getDay() === 6) wk.push(d);
    }
    return wk;
  }, [dayPx, totalDays, viewStartStr]);

  const today    = localDateStr(new Date());
  const todayOff = viewStartStr <= today && today <= viewEndStr ? diffDays(viewStartStr, today) : -1;

  const bodyCanvasHeight =
    rows.reduce((s, r) => s + WA_HDR_H + r.lanes.length * LANE_H, 0)
    + (unassigned.length > 0 ? WA_HDR_H + unassignedLanes.length * LANE_H : 0);

  const leftLabelRows: React.ReactNode[] = [];
  const bodyElements: React.ReactNode[]  = [];
  let top = 0;

  for (const { wa, lanes } of rows) {
    leftLabelRows.push(
      <Box key={`wa-lbl-${wa.id}`} sx={{
        height: WA_HDR_H, px: 1.5, display: 'flex', alignItems: 'center',
        bgcolor: 'grey.100', borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0,
      }}>
        <Typography variant="body2" fontWeight={700} noWrap sx={{ flexGrow: 1 }} title={wa.name}>
          {wa.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, flexShrink: 0, ml: 0.5 }}>
          {lanes.length}/{wa.maxParallelJobs}
        </Typography>
      </Box>,
    );
    bodyElements.push(
      <Box key={`wah-${wa.id}`} sx={{
        position: 'absolute', left: 0, top, width: '100%', height: WA_HDR_H,
        bgcolor: 'grey.100', borderBottom: '1px solid', borderColor: 'divider',
      }} />,
    );
    top += WA_HDR_H;

    for (let li = 0; li < lanes.length; li++) {
      const laneTop = top;
      leftLabelRows.push(
        <Box key={`lane-lbl-${wa.id}-${li}`} sx={{
          height: LANE_H, px: 2, display: 'flex', alignItems: 'center',
          bgcolor: li % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)',
          borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0,
        }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>Lane {li + 1}</Typography>
        </Box>,
      );
      bodyElements.push(
        <Box key={`lane-bg-${wa.id}-${li}`} sx={{
          position: 'absolute', left: 0, top: laneTop, width: '100%', height: LANE_H,
          bgcolor: li % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)',
          borderBottom: '1px solid', borderColor: 'divider',
        }} />,
      );

      for (const group of groupByOverlap(lanes[li])) {
        if (group.length === 1) {
          const task = group[0];
          const bh   = calcBarH(task.scheduledHours);
          const bt   = laneTop + Math.round((LANE_H - bh) / 2);
          const tKey = `${task.processStepId}:${task.nodeId ?? 'null'}`;
          bodyElements.push(
            <TaskBar key={`tb-${task.id}`}
              task={task} x={taskLeft(task)} w={taskWidth(task)} top={bt} height={bh}
              dayPx={dayPx} onTip={onTip} onProgressClick={onProgressClick}
              completionPct={latestPctByTask.get(tKey)}
              delayDays={historyMode && closeDateByTask.has(tKey)
                ? diffDays(task.endDate, closeDateByTask.get(tKey)!)
                : undefined}
              historyMode={historyMode} />,
          );
        } else {
          // Overlapping tasks share the lane height — stack proportional to scheduledHours.
          const sorted   = [...group].sort((a, b) => a.startDate.localeCompare(b.startDate));
          const totalHrs = sorted.reduce((s, t) => s + t.scheduledHours, 0);
          const inner    = LANE_H - BAR_PAD * 2;
          let yOff = laneTop + BAR_PAD;
          for (const task of sorted) {
            const bh = Math.max(MIN_BAR_H, Math.round((task.scheduledHours / Math.max(totalHrs, 8)) * inner));
            if (yOff + bh > laneTop + LANE_H) break;
            const oKey = `${task.processStepId}:${task.nodeId ?? 'null'}`;
            bodyElements.push(
              <TaskBar key={`tb-${task.id}`}
                task={task} x={taskLeft(task)} w={taskWidth(task)} top={yOff} height={bh}
                dayPx={dayPx} onTip={onTip} onProgressClick={onProgressClick}
                completionPct={latestPctByTask.get(oKey)}
                delayDays={historyMode && closeDateByTask.has(oKey)
                  ? diffDays(task.endDate, closeDateByTask.get(oKey)!)
                  : undefined}
                historyMode={historyMode} />,
            );
            yOff += bh + 2;
          }
        }
      }
      top += LANE_H;
    }
  }

  if (unassigned.length > 0) {
    leftLabelRows.push(
      <Box key="ua-lbl-hdr" sx={{
        height: WA_HDR_H, px: 1.5, display: 'flex', alignItems: 'center',
        bgcolor: 'warning.50', borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0,
      }}>
        <Typography variant="body2" fontWeight={700} color="warning.dark">Unassigned</Typography>
      </Box>,
    );
    bodyElements.push(
      <Box key="ua-hdr" sx={{
        position: 'absolute', left: 0, top, width: '100%', height: WA_HDR_H,
        bgcolor: 'warning.50', borderBottom: '1px solid', borderColor: 'divider',
      }} />,
    );
    top += WA_HDR_H;

    for (let li = 0; li < unassignedLanes.length; li++) {
      const laneTop = top;
      leftLabelRows.push(
        <Box key={`ua-lane-lbl-${li}`} sx={{
          height: LANE_H, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0,
        }} />,
      );
      bodyElements.push(
        <Box key={`ua-lane-bg-${li}`} sx={{
          position: 'absolute', left: 0, top: laneTop, width: '100%', height: LANE_H,
          borderBottom: '1px solid', borderColor: 'divider',
        }} />,
      );
      for (const task of unassignedLanes[li]) {
        const bh = 20;
        const bt = laneTop + Math.round((LANE_H - bh) / 2);
        const uKey = `${task.processStepId}:${task.nodeId ?? 'null'}`;
        bodyElements.push(
          <TaskBar key={`tb-${task.id}`}
            task={task}
            x={taskLeft(task)} w={Math.max(dayPx * 2, 14)}
            top={bt} height={bh}
            dayPx={dayPx} onTip={onTip} onProgressClick={onProgressClick}
            completionPct={latestPctByTask.get(uKey)}
            historyMode={historyMode} />,
        );
      }
      top += LANE_H;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>

      {/* ── LEFT FREEZE COLUMN ── */}
      <Box sx={{
        width: LEFT_W, minWidth: LEFT_W, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: 1, borderColor: 'divider',
        bgcolor: 'background.paper', zIndex: 5,
      }}>
        <Box sx={{
          height: HEADER_H, flexShrink: 0,
          borderBottom: '2px solid', borderColor: 'primary.main',
          display: 'flex', alignItems: 'flex-end', px: 1.5, pb: 1,
        }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary"
            sx={{ letterSpacing: '0.05em' }}>
            WORK AREA / LANE
          </Typography>
        </Box>
        <Box ref={leftScrollRef} sx={{ flexGrow: 1, overflowY: 'hidden', overflowX: 'hidden' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>{leftLabelRows}</Box>
        </Box>
      </Box>

      {/* ── RIGHT SIDE (header + canvas) ── */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Date header */}
        <Box
          ref={headerScrollRef}
          sx={{
            height: HEADER_H, flexShrink: 0,
            overflowX: 'hidden', overflowY: 'hidden',
            borderBottom: '2px solid', borderColor: 'primary.main',
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ width: Math.max(totalWidth, 400), height: HEADER_H, position: 'relative' }}>
            {headerLabels.map(({ day, label }, idx) => {
              const nextDay   = idx < headerLabels.length - 1 ? headerLabels[idx + 1].day : totalDays;
              const cellWidth = (nextDay - day) * dayPx;
              return (
                <Box key={day} sx={{
                  position: 'absolute', left: day * dayPx, top: 0,
                  width: cellWidth, height: '100%',
                  borderLeft: '1px solid', borderColor: 'divider',
                  px: 0.75, display: 'flex', alignItems: 'center',
                  overflow: 'hidden',
                }}>
                  <Typography variant="caption" noWrap color="text.secondary"
                    sx={{ fontSize: 11, fontWeight: 500 }}>
                    {label}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Main scroll area */}
        <Box ref={mainScrollRef} onScroll={handleScroll} sx={{ flexGrow: 1, overflow: 'auto' }}>
          {visibleTasks.length === 0 ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
              <Typography color="text.secondary">No tasks in this period.</Typography>
            </Box>
          ) : (
            <Box sx={{ width: Math.max(totalWidth, 400), height: bodyCanvasHeight, position: 'relative' }}>

              {bandItems.map(({ day, width }, i) => (
                <Box key={day} sx={{
                  position: 'absolute', left: day * dayPx, top: 0,
                  width: width * dayPx, bottom: 0,
                  bgcolor: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.013)',
                  pointerEvents: 'none',
                }} />
              ))}

              {weekendDays.map(d => (
                <Box key={`we-${d}`} sx={{
                  position: 'absolute', left: d * dayPx, top: 0,
                  width: dayPx, bottom: 0,
                  bgcolor: 'rgba(0,0,0,0.04)', pointerEvents: 'none',
                }} />
              ))}

              {todayOff >= 0 && (
                <Box sx={{
                  position: 'absolute', left: todayOff * dayPx, top: 0, bottom: 0,
                  width: 2, bgcolor: 'error.main', opacity: 0.7, zIndex: 5, pointerEvents: 'none',
                }} />
              )}

              {bodyElements}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
