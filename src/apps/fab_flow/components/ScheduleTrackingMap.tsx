import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Tooltip, IconButton, CircularProgress, Alert,
} from '@mui/material';
import ZoomInIcon    from '@mui/icons-material/ZoomIn';
import ZoomOutIcon   from '@mui/icons-material/ZoomOut';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import api, { API_HOST } from '@core/utils/axiosConfig';
import ProgressPopover, { type TaskProgressEntry } from './ProgressPopover';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkArea {
  id: number; code: string; name: string; maxParallelJobs: number;
}

interface ScheduleTask {
  id: number; nodePrefix: string; nodeId: number | null; nodeDisplay: string;
  processStepId: number; stepName: string; processType: string;
  workAreaId: number | null; workAreaCode: string; workAreaName: string;
  startDate: string; endDate: string; scheduledHours: number;
  isCritical: boolean; isUnassigned: boolean;
}

interface ScheduleData {
  startDate: string; endDate: string; workAreas: WorkArea[]; tasks: ScheduleTask[];
}

// ── Layout constants ──────────────────────────────────────────────────────────

const LEFT_W    = 200;
const HEADER_H  = 52;
const WA_HDR_H  = 30;
const LANE_H    = 72;
const BAR_PAD   = 6;
const MIN_BAR_H = 12;
const MIN_DAY_PX = 2;
const MAX_DAY_PX = 120;
const RENDER_BUFFER = 300; // px beyond viewport edges to still render

// ── Color palette ─────────────────────────────────────────────────────────────

const PALETTE = [
  '#1565c0','#2e7d32','#e65100','#6a1b9a','#b71c1c',
  '#006064','#33691e','#bf360c','#4a148c','#880e4f',
  '#0277bd','#558b2f','#f57f17','#4527a0','#00695c',
];
const _prefixIdx = new Map<string, number>();
function getNodeColor(prefix: string): string {
  if (!_prefixIdx.has(prefix)) _prefixIdx.set(prefix, _prefixIdx.size);
  return PALETTE[_prefixIdx.get(prefix)! % PALETTE.length];
}

// ── Date helpers ──────────────────────────────────────────────────────────────

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

// ── Lane assignment ───────────────────────────────────────────────────────────

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

// Union-Find overlap grouping — tasks within the same lane that share date ranges
// are stacked proportionally rather than drawn on top of each other.
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

function calcBarH(hours: number): number {
  const inner = LANE_H - BAR_PAD * 2;
  return Math.max(MIN_BAR_H, Math.min(inner, Math.round((Math.min(hours, 8) / 8) * inner)));
}

// ── Task bar ──────────────────────────────────────────────────────────────────

function TaskBar({
  task, x, w, y, h, completionPct, onProgressClick,
}: {
  task: ScheduleTask; x: number; w: number; y: number; h: number;
  completionPct?: number;
  onProgressClick: (el: HTMLElement, t: ScheduleTask) => void;
}) {
  const color     = task.isCritical ? '#c62828' : getNodeColor(task.nodePrefix);
  const showLabel = w >= 30 && h >= MIN_BAR_H;
  const showSub   = w >= 60 && h >= 24;

  return (
    <Box
      data-task-bar="1"
      onClick={(e) => { e.stopPropagation(); onProgressClick(e.currentTarget, task); }}
      sx={{
        position: 'absolute',
        left: x, top: y, width: w, height: h,
        bgcolor: color, borderRadius: '5px',
        cursor: 'pointer', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: h < 22 ? 'center' : 'flex-start',
        pt: h >= 22 ? '3px' : 0,
        pl: '5px', pr: '3px',
        boxShadow: task.isCritical
          ? '0 0 0 2px rgba(198,40,40,0.35), 0 1px 4px rgba(0,0,0,0.2)'
          : '0 1px 3px rgba(0,0,0,0.18)',
        transition: 'filter 0.1s',
        '&:hover': { filter: 'brightness(1.15)', zIndex: 20 },
        zIndex: 2,
      }}
    >
      {showLabel && (
        <Typography sx={{
          color: 'white', fontSize: 10, fontWeight: 700, lineHeight: 1.3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%',
        }}>
          {task.nodeDisplay}
        </Typography>
      )}
      {showSub && (
        <Typography sx={{
          color: 'rgba(255,255,255,0.88)', fontSize: 9, lineHeight: 1.2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%',
        }}>
          {task.stepName}
        </Typography>
      )}
      {completionPct != null && completionPct > 0 && (
        <Box sx={{
          position: 'absolute', bottom: 0, left: 0, height: 4,
          width: `${Math.min(completionPct, 100)}%`,
          bgcolor: 'rgba(255,255,255,0.45)',
          borderRadius: '0 0 0 5px',
          pointerEvents: 'none',
        }} />
      )}
    </Box>
  );
}

// ── Row layout type ───────────────────────────────────────────────────────────

interface RowEntry {
  wa: WorkArea;
  lanes: ScheduleTask[][];
  top: number;
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { planId: string; company: string; }

export default function ScheduleTrackingMap({ planId, company }: Props) {
  const [scheduleData,       setScheduleData]       = useState<ScheduleData | null>(null);
  const [progressAllByTask,  setProgressAllByTask]  = useState<Map<string, TaskProgressEntry[]>>(new Map());
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [progressAnchor, setProgressAnchor] = useState<{ el: HTMLElement; task: ScheduleTask } | null>(null);

  // pixels per day — the zoom unit; changing this scales only the canvas content
  const [dayPx, setDayPx] = useState(14);

  // viewport scroll position (for lazy render)
  const [viewLeft,   setViewLeft]   = useState(0);
  const [viewWidth,  setViewWidth]  = useState(800);
  const [viewTop,    setViewTop]    = useState(0);
  const [viewHeight, setViewHeight] = useState(600);

  const mainScrollRef   = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const leftScrollRef   = useRef<HTMLDivElement>(null);
  const outerRef        = useRef<HTMLDivElement>(null);

  const isDragging    = useRef(false);
  const lastDragPos   = useRef({ x: 0, y: 0 });
  const hasAutoFit    = useRef(false);

  // ── Data fetch ────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [schedRes, progRes] = await Promise.all([
        api.get(`${API_HOST}/api/${company}/fab_flow/plans/${planId}/schedule`),
        api.get(`${API_HOST}/api/${company}/fab_flow/plans/${planId}/progress`),
      ]);

      const sd: ScheduleData = schedRes.data?.data ?? schedRes.data;
      hasAutoFit.current = false;
      setScheduleData(sd ?? null);

      const rawEntries = progRes.data?.data ?? [];
      const byTask = new Map<string, TaskProgressEntry[]>();
      for (const r of rawEntries) {
        const key = `${r.process_step_id}:${r.node_id ?? 'null'}`;
        if (!byTask.has(key)) byTask.set(key, []);
        byTask.get(key)!.push({
          processStepId:     r.process_step_id,
          nodeId:            r.node_id,
          logDate:           r.log_date,
          completionPct:     r.completion_pct,
          workStart:         r.work_start,
          workEnd:           r.work_end,
          delayReasonCodes:  r.delay_reason_codes,
          notes:             r.notes,
        });
      }
      setProgressAllByTask(byTask);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [planId, company]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Schedule span ─────────────────────────────────────────────────────────

  const { schedStart, schedEnd, totalDays } = useMemo(() => {
    if (!scheduleData) return { schedStart: '', schedEnd: '', totalDays: 0 };
    return {
      schedStart: scheduleData.startDate,
      schedEnd:   scheduleData.endDate,
      totalDays:  diffDays(scheduleData.startDate, scheduleData.endDate) + 1,
    };
  }, [scheduleData]);

  const totalWidth = totalDays * dayPx;

  // ── Row layout: work areas + lanes ────────────────────────────────────────

  const { rowLayout, totalHeight } = useMemo((): { rowLayout: RowEntry[]; totalHeight: number } => {
    if (!scheduleData) return { rowLayout: [], totalHeight: 0 };
    let top = 0;
    const layout: RowEntry[] = [];

    for (const wa of scheduleData.workAreas) {
      const waTasks = scheduleData.tasks.filter(t => !t.isUnassigned && t.workAreaId === wa.id);
      const lanes   = assignLanes(waTasks, wa.maxParallelJobs);
      if (lanes.length === 0) continue;
      layout.push({ wa, lanes, top });
      top += WA_HDR_H + lanes.length * LANE_H;
    }

    const unassigned = scheduleData.tasks.filter(t => t.isUnassigned || !t.workAreaId);
    if (unassigned.length > 0) {
      const ua = { id: -1, code: 'UA', name: 'Unassigned', maxParallelJobs: Infinity } as WorkArea;
      const lanes = assignLanes(unassigned);
      layout.push({ wa: ua, lanes, top });
      top += WA_HDR_H + lanes.length * LANE_H;
    }

    return { rowLayout: layout, totalHeight: top };
  }, [scheduleData]);

  // ── Task positions (x, y, w, h) ───────────────────────────────────────────
  // Recomputed when dayPx changes so bar widths and x-positions stay in sync.

  const taskPositions = useMemo(() => {
    const pos = new Map<number, { x: number; y: number; w: number; h: number }>();
    if (!schedStart) return pos;

    const tLeft  = (t: ScheduleTask) => Math.max(0, diffDays(schedStart, t.startDate)) * dayPx;
    const tWidth = (t: ScheduleTask) => Math.max(dayPx - 2, (diffDays(t.startDate, t.endDate) + 1) * dayPx - 2);

    for (const { lanes, top } of rowLayout) {
      let laneTop = top + WA_HDR_H;
      for (const lane of lanes) {
        for (const group of groupByOverlap(lane)) {
          if (group.length === 1) {
            // Non-overlapping task: centre vertically in the lane
            const task = group[0];
            const bh = calcBarH(task.scheduledHours);
            const by = laneTop + Math.round((LANE_H - bh) / 2);
            pos.set(task.id, { x: tLeft(task), y: by, w: tWidth(task), h: bh });
          } else {
            // Overlapping tasks forced into the same lane: stack top-to-bottom
            // proportional to scheduled hours so they share the lane height without overlap.
            const sorted   = [...group].sort((a, b) => a.startDate.localeCompare(b.startDate));
            const totalHrs = sorted.reduce((s, t) => s + t.scheduledHours, 0);
            const inner    = LANE_H - BAR_PAD * 2;
            let yOff = laneTop + BAR_PAD;
            for (const task of sorted) {
              const bh = Math.max(MIN_BAR_H, Math.round((task.scheduledHours / Math.max(totalHrs, 8)) * inner));
              if (yOff + bh > laneTop + LANE_H) break; // guard against overflow
              pos.set(task.id, { x: tLeft(task), y: yOff, w: tWidth(task), h: bh });
              yOff += bh + 2;
            }
          }
        }
        laneTop += LANE_H;
      }
    }
    return pos;
  }, [rowLayout, schedStart, dayPx]);

  // ── Connection arrows: same-node sequential steps ─────────────────────────

  const connections = useMemo(() => {
    if (!scheduleData) return [] as Array<{
      x1: number; y1: number; x2: number; y2: number; isCritical: boolean;
    }>;

    // Group tasks by node identity
    const groups = new Map<string, ScheduleTask[]>();
    for (const t of scheduleData.tasks) {
      const key = t.nodeId !== null ? `n:${t.nodeId}` : `p:${t.nodePrefix}:${t.nodeDisplay}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    const conns: Array<{ x1: number; y1: number; x2: number; y2: number; isCritical: boolean }> = [];

    for (const tasks of groups.values()) {
      if (tasks.length < 2) continue;
      // Sort by start date to get the sequential order
      const sorted = [...tasks].sort((a, b) => a.startDate.localeCompare(b.startDate));

      for (let i = 0; i < sorted.length - 1; i++) {
        const from = sorted[i];
        const to   = sorted[i + 1];
        const fp   = taskPositions.get(from.id);
        const tp   = taskPositions.get(to.id);
        if (!fp || !tp) continue;

        conns.push({
          x1: fp.x + fp.w,
          y1: fp.y + fp.h / 2,
          x2: tp.x,
          y2: tp.y + tp.h / 2,
          isCritical: from.isCritical && to.isCritical,
        });
      }
    }
    return conns;
  }, [scheduleData, taskPositions]);

  // ── Date header labels ────────────────────────────────────────────────────

  const headerLabels = useMemo(() => {
    if (!schedStart || !totalDays) return [] as { day: number; label: string }[];
    const labels: { day: number; label: string }[] = [];

    if (dayPx < 6) {
      let prevM = -1;
      for (let d = 0; d < totalDays; d++) {
        const dt = addDays(parseDate(schedStart), d);
        if (dt.getMonth() !== prevM) {
          labels.push({ day: d, label: dt.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) });
          prevM = dt.getMonth();
        }
      }
    } else if (dayPx < 18) {
      for (let d = 0; d < totalDays; d += 7)
        labels.push({ day: d, label: fmtDate(localDateStr(addDays(parseDate(schedStart), d))) });
    } else {
      for (let d = 0; d < totalDays; d++) {
        const dt = addDays(parseDate(schedStart), d);
        labels.push({
          day: d,
          label: (dt.getDate() === 1 || d === 0)
            ? dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
            : String(dt.getDate()),
        });
      }
    }
    return labels;
  }, [schedStart, totalDays, dayPx]);

  // ── Column band shading ───────────────────────────────────────────────────

  const bandItems = useMemo(() => {
    if (!schedStart || !totalDays) return [] as { day: number; width: number }[];
    const items: { day: number; width: number }[] = [];
    if (dayPx < 6) {
      let bs = 0, prevM = addDays(parseDate(schedStart), 0).getMonth();
      for (let d = 1; d <= totalDays; d++) {
        const m = d < totalDays ? addDays(parseDate(schedStart), d).getMonth() : -1;
        if (m !== prevM) { items.push({ day: bs, width: d - bs }); bs = d; prevM = m; }
      }
    } else {
      for (let d = 0; d < totalDays; d += 7)
        items.push({ day: d, width: Math.min(7, totalDays - d) });
    }
    return items;
  }, [dayPx, totalDays, schedStart]);

  const weekendDays = useMemo(() => {
    if (!schedStart || dayPx < 10) return [] as number[];
    const wk: number[] = [];
    for (let d = 0; d < totalDays; d++) {
      const dt = addDays(parseDate(schedStart), d);
      if (dt.getDay() === 0 || dt.getDay() === 6) wk.push(d);
    }
    return wk;
  }, [schedStart, totalDays, dayPx]);

  const todayOff = useMemo(() => {
    if (!schedStart) return -1;
    const t = localDateStr(new Date());
    return schedStart <= t && t <= schedEnd ? diffDays(schedStart, t) : -1;
  }, [schedStart, schedEnd]);

  // ── Latest progress pct per task key ─────────────────────────────────────

  const latestPctByTask = useMemo(() => {
    const m = new Map<string, number>();
    for (const [k, entries] of progressAllByTask) {
      const latest = entries.reduce((b, e) => e.logDate > b.logDate ? e : b);
      m.set(k, latest.completionPct);
    }
    return m;
  }, [progressAllByTask]);

  // ── Lazy render: visible task IDs ─────────────────────────────────────────

  const visibleTaskIds = useMemo(() => {
    const lb = viewLeft - RENDER_BUFFER;
    const rb = viewLeft + viewWidth + RENDER_BUFFER;
    const tb = viewTop - RENDER_BUFFER;
    const bb = viewTop + viewHeight + RENDER_BUFFER;
    const ids = new Set<number>();
    for (const [id, pos] of taskPositions) {
      if (pos.x + pos.w >= lb && pos.x <= rb && pos.y + pos.h >= tb && pos.y <= bb)
        ids.add(id);
    }
    return ids;
  }, [taskPositions, viewLeft, viewWidth, viewTop, viewHeight]);

  // Visible connections (at least one endpoint in extended viewport)
  const visibleConnections = useMemo(() => {
    const lb = viewLeft - RENDER_BUFFER;
    const rb = viewLeft + viewWidth + RENDER_BUFFER;
    return connections.filter(c => c.x1 <= rb && c.x2 >= lb);
  }, [connections, viewLeft, viewWidth]);

  // ── Scroll sync ───────────────────────────────────────────────────────────

  const handleScroll = useCallback(() => {
    const main = mainScrollRef.current;
    if (!main) return;
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = main.scrollLeft;
    if (leftScrollRef.current)   leftScrollRef.current.scrollTop   = main.scrollTop;
    setViewLeft(main.scrollLeft);
    setViewTop(main.scrollTop);
  }, []);

  // ── Container resize ──────────────────────────────────────────────────────

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setViewWidth(r.width - LEFT_W);
      setViewHeight(r.height - HEADER_H);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Auto-fit dayPx to show full schedule on first load ───────────────────

  useEffect(() => {
    if (!hasAutoFit.current && totalDays > 0 && viewWidth > 100) {
      hasAutoFit.current = true;
      setDayPx(Math.max(MIN_DAY_PX, Math.min(MAX_DAY_PX, Math.floor(viewWidth / totalDays))));
    }
  }, [totalDays, viewWidth]);

  // ── Ctrl+Scroll to zoom towards cursor ───────────────────────────────────

  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // always intercept — zooms chart, not the page

      const rect           = el.getBoundingClientRect();
      const mouseXInCanvas = e.clientX - rect.left + el.scrollLeft;
      const factor         = e.deltaY < 0 ? 1.15 : 1 / 1.15;

      setDayPx(prev => {
        const newDayPx    = Math.max(MIN_DAY_PX, Math.min(MAX_DAY_PX, prev * factor));
        const dayAtCursor = mouseXInCanvas / prev;
        const newScrollL  = dayAtCursor * newDayPx - (e.clientX - rect.left);
        requestAnimationFrame(() => {
          if (mainScrollRef.current) mainScrollRef.current.scrollLeft = Math.max(0, newScrollL);
        });
        return newDayPx;
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [loading]); // re-runs after loading→false so the canvas element is mounted in the DOM

  // ── Drag-to-pan ───────────────────────────────────────────────────────────

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-task-bar]')) return;
    isDragging.current   = true;
    lastDragPos.current  = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }
  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isDragging.current || !mainScrollRef.current) return;
    const dx = e.clientX - lastDragPos.current.x;
    const dy = e.clientY - lastDragPos.current.y;
    lastDragPos.current = { x: e.clientX, y: e.clientY };
    mainScrollRef.current.scrollLeft -= dx;
    mainScrollRef.current.scrollTop  -= dy;
  }
  function handleMouseUp() { isDragging.current = false; }

  // ── Loading / error / empty ───────────────────────────────────────────────

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 195px)' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
  if (!scheduleData || scheduleData.tasks.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 195px)', gap: 2 }}>
        <Typography variant="h6" color="text.secondary">No schedule yet</Typography>
        <Typography variant="body2" color="text.secondary">Build a schedule first to see the tracking view.</Typography>
      </Box>
    );
  }

  // ── Build left-axis label rows ────────────────────────────────────────────

  const leftRows: React.ReactNode[] = [];
  for (const { wa, lanes } of rowLayout) {
    const isUA = wa.id === -1;
    leftRows.push(
      <Box key={`wa-hdr-${wa.id}`} sx={{
        height: WA_HDR_H, px: 1.5, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 0.5,
        bgcolor: isUA ? 'warning.50' : 'grey.100',
        borderBottom: '1px solid', borderColor: 'divider',
      }}>
        <Typography variant="body2" fontWeight={700} noWrap sx={{ flexGrow: 1 }} title={wa.name}>
          {wa.name}
        </Typography>
        {wa.id !== -1 && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, flexShrink: 0 }}>
            {lanes.length}/{wa.maxParallelJobs}
          </Typography>
        )}
      </Box>,
    );
    lanes.forEach((_, li) => {
      leftRows.push(
        <Box key={`lane-lbl-${wa.id}-${li}`} sx={{
          height: LANE_H, px: 2, flexShrink: 0,
          display: 'flex', alignItems: 'center',
          bgcolor: li % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)',
          borderBottom: '1px solid', borderColor: 'divider',
        }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
            Lane {li + 1}
          </Typography>
        </Box>,
      );
    });
  }

  // ── Build canvas background rows ──────────────────────────────────────────

  const bgRows: React.ReactNode[] = [];
  for (const { wa, lanes, top } of rowLayout) {
    const isUA = wa.id === -1;
    bgRows.push(
      <Box key={`wa-bg-${wa.id}`} sx={{
        position: 'absolute', left: 0, top, width: '100%', height: WA_HDR_H,
        bgcolor: isUA ? 'warning.50' : 'grey.100',
        borderBottom: '1px solid', borderColor: 'divider',
      }} />,
    );
    let laneTop = top + WA_HDR_H;
    lanes.forEach((_, li) => {
      bgRows.push(
        <Box key={`lane-bg-${wa.id}-${li}`} sx={{
          position: 'absolute', left: 0, top: laneTop, width: '100%', height: LANE_H,
          bgcolor: li % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)',
          borderBottom: '1px solid', borderColor: 'divider',
        }} />,
      );
      laneTop += LANE_H;
    });
  }

  // ── Visible task bars ─────────────────────────────────────────────────────

  const allTasks = rowLayout.flatMap(({ lanes }) => lanes.flat());
  const taskBars = allTasks
    .filter(t => visibleTaskIds.has(t.id))
    .map(t => {
      const pos  = taskPositions.get(t.id);
      if (!pos) return null;
      const tKey = `${t.processStepId}:${t.nodeId ?? 'null'}`;
      return (
        <TaskBar
          key={`tb-${t.id}`}
          task={t}
          x={pos.x} w={pos.w} y={pos.y} h={pos.h}
          completionPct={latestPctByTask.get(tKey)}
          onProgressClick={(el, task) => setProgressAnchor({ el, task })}
        />
      );
    });

  const canvasW = Math.max(totalWidth, 400);
  const canvasH = Math.max(totalHeight, 200);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box
      ref={outerRef}
      sx={{ position: 'relative', height: 'calc(100vh - 195px)', overflow: 'hidden', bgcolor: 'background.default' }}
    >

      {/* ── Corner cell ── */}
      <Box sx={{
        position: 'absolute', top: 0, left: 0,
        width: LEFT_W, height: HEADER_H, zIndex: 12,
        bgcolor: 'background.paper',
        borderRight: '1px solid', borderBottom: '2px solid', borderColor: 'divider',
        display: 'flex', alignItems: 'flex-end', px: 1.5, pb: 1,
      }}>
        <Typography variant="caption" fontWeight={700} color="text.secondary"
          sx={{ letterSpacing: '0.05em', fontSize: 10 }}>
          WORK AREA / LANE
        </Typography>
      </Box>

      {/* ── Date header (fixed top, scrolls X with canvas) ── */}
      <Box
        ref={headerScrollRef}
        sx={{
          position: 'absolute', top: 0, left: LEFT_W, right: 0, height: HEADER_H,
          overflowX: 'hidden', overflowY: 'hidden', zIndex: 10,
          bgcolor: 'background.paper',
          borderBottom: '2px solid', borderColor: 'primary.main',
        }}
      >
        <Box sx={{ width: canvasW, height: HEADER_H, position: 'relative' }}>
          {headerLabels.map(({ day, label }, idx) => {
            const nextDay   = idx < headerLabels.length - 1 ? headerLabels[idx + 1].day : totalDays;
            const cellWidth = (nextDay - day) * dayPx;
            return (
              <Box key={day} sx={{
                position: 'absolute', left: day * dayPx, top: 0,
                width: cellWidth, height: '100%',
                borderLeft: '1px solid', borderColor: 'divider',
                px: 0.75, display: 'flex', alignItems: 'center', overflow: 'hidden',
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

      {/* ── Left axis labels (fixed left, scrolls Y with canvas) ── */}
      <Box
        ref={leftScrollRef}
        sx={{
          position: 'absolute', top: HEADER_H, left: 0,
          width: LEFT_W, bottom: 0,
          overflowX: 'hidden', overflowY: 'hidden', zIndex: 10,
          bgcolor: 'background.paper',
          borderRight: '1px solid', borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {leftRows}
        </Box>
      </Box>

      {/* ── Main scroll canvas ── */}
      <Box
        ref={mainScrollRef}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        sx={{
          position: 'absolute', top: HEADER_H, left: LEFT_W, right: 0, bottom: 0,
          overflow: 'auto',
          cursor: 'grab',
          '&:active': { cursor: 'grabbing' },
          userSelect: 'none',
        }}
      >
        <Box sx={{ width: canvasW, height: canvasH, position: 'relative' }}>

          {/* Alternating column bands */}
          {bandItems.map(({ day, width }, i) => (
            <Box key={day} sx={{
              position: 'absolute', left: day * dayPx, top: 0,
              width: width * dayPx, bottom: 0,
              bgcolor: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.013)',
              pointerEvents: 'none',
            }} />
          ))}

          {/* Weekend shading */}
          {weekendDays.map(d => (
            <Box key={`we-${d}`} sx={{
              position: 'absolute', left: d * dayPx, top: 0,
              width: dayPx, bottom: 0,
              bgcolor: 'rgba(0,0,0,0.04)', pointerEvents: 'none',
            }} />
          ))}

          {/* Row backgrounds */}
          {bgRows}

          {/* Today indicator */}
          {todayOff >= 0 && (
            <Box sx={{
              position: 'absolute', left: todayOff * dayPx, top: 0, bottom: 0,
              width: 2, bgcolor: 'error.main', opacity: 0.7, zIndex: 5, pointerEvents: 'none',
            }} />
          )}

          {/* Connection arrows SVG — sits above backgrounds, below task bars */}
          <svg
            style={{
              position: 'absolute', top: 0, left: 0,
              width: canvasW, height: canvasH,
              pointerEvents: 'none', zIndex: 3, overflow: 'visible',
            }}
          >
            <defs>
              <marker id="arr-crit" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 Z" fill="#c62828" />
              </marker>
              <marker id="arr-norm" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 Z" fill="#94a3b8" />
              </marker>
            </defs>
            {visibleConnections.map(({ x1, y1, x2, y2, isCritical }, i) => {
              // Bezier control point: midpoint between the two endpoints
              const mx = (x1 + x2) / 2;
              return (
                <path
                  key={i}
                  d={`M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`}
                  fill="none"
                  stroke={isCritical ? '#c62828' : '#94a3b8'}
                  strokeWidth={isCritical ? 2 : 1.5}
                  strokeDasharray={isCritical ? undefined : '5 3'}
                  markerEnd={`url(#arr-${isCritical ? 'crit' : 'norm'})`}
                  opacity={isCritical ? 0.85 : 0.55}
                />
              );
            })}
          </svg>

          {/* Task bars (lazy — only visible) */}
          {taskBars}

        </Box>
      </Box>

      {/* ── Zoom controls ── */}
      <Box sx={{
        position: 'absolute', top: HEADER_H + 12, right: 12, zIndex: 12,
        display: 'flex', flexDirection: 'column', gap: 0.5,
        bgcolor: 'background.paper', borderRadius: 1.5,
        border: '1px solid', borderColor: 'divider', boxShadow: 1, p: 0.5,
      }}>
        <Tooltip title="Zoom in  (Ctrl + scroll)">
          <IconButton size="small" onClick={() => setDayPx(p => Math.min(MAX_DAY_PX, p * 1.25))}>
            <ZoomInIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Zoom out  (Ctrl + scroll)">
          <IconButton size="small" onClick={() => setDayPx(p => Math.max(MIN_DAY_PX, p / 1.25))}>
            <ZoomOutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Fit full schedule">
          <IconButton size="small" onClick={() => {
            if (totalDays > 0 && viewWidth > 100)
              setDayPx(Math.max(MIN_DAY_PX, Math.min(MAX_DAY_PX, Math.floor(viewWidth / totalDays))));
          }}>
            <FitScreenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Typography sx={{ fontSize: '0.58rem', textAlign: 'center', color: 'text.secondary', pb: 0.25 }}>
          {Math.round(dayPx * 10) / 10} px/d
        </Typography>
      </Box>

      {/* ── Hint bar ── */}
      <Box sx={{
        position: 'absolute', bottom: 12, left: LEFT_W + 12, zIndex: 12,
        bgcolor: 'background.paper', borderRadius: 1.5, px: 1.5, py: 0.5,
        border: '1px solid', borderColor: 'divider', boxShadow: 1,
      }}>
        <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>
          Drag to pan · Scroll to zoom · Click bar to log progress · ── dashed = normal · ─── solid = critical path
        </Typography>
      </Box>

      {/* ── Progress popover ── */}
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
        company={company}
        onClose={() => setProgressAnchor(null)}
        onSaved={() => { fetchAll(); setProgressAnchor(null); }}
      />
    </Box>
  );
}
