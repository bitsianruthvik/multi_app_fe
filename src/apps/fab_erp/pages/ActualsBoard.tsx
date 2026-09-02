/**
 * ActualsBoard.tsx — what the shop actually did.
 *
 * The Plan Board asks "is there room, and where". This asks the question that
 * only gets asked afterwards: what did we finish this month, what is still
 * moving right now, and at what altitude do I want to be told — an operation, a
 * part, a girder, a span, a line, the whole order.
 *
 * TWO MODES, ONE WINDOW
 * ---------------------
 *   Rolled up   One bar per unit, against the plant rather than any machine,
 *               packed into as many parallel lanes as the work genuinely
 *               needed. The lane count IS the peak concurrency — nothing else
 *               on screen can disagree with it, because it is the layout.
 *
 *   Machines    Every operation at machine granularity, the machine lanes
 *               nested under collapsible unit headers. A machine that touched
 *               three girders appears under all three, showing only that
 *               girder's work in each.
 *
 * READ-ONLY, DELIBERATELY. There is no drag, no grip, no gesture: the board has
 * no `onGrab`, so the canvas draws no handles and offers none. What happened
 * happened, and a screen that let you nudge it would be a different and much
 * worse idea than the planner.
 *
 * TWO CLOCKS, AND THEY ARE NOT THE SAME
 * -------------------------------------
 * "Completed this month" is a static window query. "In progress right now" is a
 * live set with no end timestamp, drawn to the moment the server answered. The
 * second is polled and carries the LiveIndicator; on a past month there is no
 * live edge at all and the indicator is hidden rather than lying about being up
 * to date.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, MenuItem, Paper, Stack, Switch, FormControlLabel, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography, IconButton, useTheme,
} from '@mui/material';
import { Link as RouterLink, useParams } from 'react-router-dom';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import TodayRounded from '@mui/icons-material/TodayRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';

import { usePermission } from '@core/hooks/usePermission';
import { useAuth } from '@core/contexts/AuthContext';
import { isAdminRole } from '@core/utils/roles';

import {
  getActualsBoard, ACTUALS_LEVELS, ACTUALS_LEVEL_LABEL,
  GHOST_STRIDE,
  type ActualsBoardResponse, type ActualsLevel, type ActualsMode, type ActualsLane,
} from '../api/actuals';
import {
  PageHeader, Surface, EmptyState, ListSkeleton, StatStrip, LiveIndicator, type Stat,
} from '../components';
import { useLiveRefresh, useNowTick } from '../hooks/useLiveRefresh';
import { BoardCanvas, type BoardRow, type BlockHit } from '../components/planner/BoardCanvas';
import {
  buildColors, fmtWorkMs, LEGIBLE_UNIT_LIMIT, type ColorSet,
} from '../components/planner/boardModel';
import {
  ACTUALS_STATUS_STYLE, STATUS_LEGEND, buildActualsGrouping, buildGroupBlocks,
  buildSpines, nestByHierarchy,
} from '../components/actuals/actualsModel';
import { SCurve } from '../components/actuals/SCurve';
import {
  buildScale, buildTicks, todayYMD, addDaysYMD, monthStartYMD, daysInMonth,
  addMonthsYMD, type ViewMode,
} from '../components/planner/plannerTime';

const GUTTER_PX = 190;

/**
 * The Plan Board's stretch preview needs a bar's own start to scale offsets
 * against. Nothing here stretches, so the map is empty and permanently so — held
 * at module scope because a fresh Map every render would re-run the canvas's
 * draw effect on every mouse move.
 */
const EMPTY_ENTRY_STARTS = new Map<number, number>();

/**
 * Row heights, per zoom, matching the Plan Board's reasoning: a month row is
 * SCANNED and a day row is READ. `header` is the collapsible unit header in
 * machine mode — taller than a rail because when it is collapsed it is also the
 * density strip standing in for everything underneath it.
 */
const ROW_H: Record<ViewMode, { lane: number; rail: number; header: number }> = {
  month: { lane: 24, rail: 16, header: 26 },
  week: { lane: 32, rail: 20, header: 30 },
  day: { lane: 46, rail: 24, header: 34 },
};

type Measure = 'hours' | 'tonnes' | 'count';

export default function ActualsBoard() {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const { user } = useAuth();
  const { company: companySlug } = useParams<{ company: string }>();
  const canView = usePermission('fab_erp_actuals_view') || isAdminRole(user?.role);

  const [board, setBoard] = useState<ActualsBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<ViewMode>('month');
  const [boardMode, setBoardMode] = useState<ActualsMode>('unit');
  const [level, setLevel] = useState<ActualsLevel>('girder');
  const [measure, setMeasure] = useState<Measure>('hours');
  const [nest, setNest] = useState(true);
  const [onlyBusy, setOnlyBusy] = useState(true);
  /**
   * Compare against the plan. Off by default, and both halves of that are
   * deliberate: it costs three more reads, and the board's ordinary job is to
   * say what happened, not to argue with what was intended.
   */
  const [withPlan, setWithPlan] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<BlockHit | null>(null);
  const [trackPx, setTrackPx] = useState(0);
  /**
   * When the data on screen was fetched.
   *
   * Tracked here as well as in `useLiveRefresh` because the hook only knows
   * about the polls IT ran — the first load is not one of those, so the age
   * indicator read "never" over data that was seconds old, which is exactly the
   * kind of thing that makes a staleness indicator worth ignoring.
   */
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  const timeZone = board?.timezone ?? 'UTC';
  const [anchorYMD, setAnchorYMD] = useState<string>(() => monthStartYMD(todayYMD('UTC')));

  /**
   * The window.
   *
   * Month mode is a CALENDAR month, unlike the Plan Board's 35 days snapped to
   * Monday. The planner is scanned by week, so a fixed rhythm matters more than
   * the calendar; a report is asked for "August", and a figure covering 3 Aug to
   * 6 Sep is not August's. Week and day come along unchanged.
   */
  const scale = useMemo(() => {
    if (mode === 'month') {
      const start = monthStartYMD(anchorYMD);
      return buildScale('month', start, timeZone, daysInMonth(start));
    }
    return buildScale(mode, anchorYMD, timeZone);
  }, [mode, anchorYMD, timeZone]);

  const windowMs = scale.endMs - scale.startMs;

  const load = useCallback(async () => {
    if (!canView) return;
    setError(null);
    try {
      const res = await getActualsBoard({
        from: new Date(scale.startMs).toISOString(),
        to: new Date(scale.endMs).toISOString(),
        mode: boardMode,
        withPlan,
        level,
      });
      setBoard(res);
      setLoadedAt(Date.now());
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to load the actuals board.');
    } finally {
      setLoading(false);
    }
  }, [canView, scale.startMs, scale.endMs, boardMode, level, withPlan]);

  useEffect(() => { setLoading(true); void load(); }, [load]);

  /**
   * Poll only when the window actually contains now.
   *
   * Re-fetching a closed month every thirty seconds asks the database to prove
   * that the past has not changed. It has not.
   */
  const nowInWindow = Date.now() >= scale.startMs && Date.now() <= scale.endMs;
  const live = useLiveRefresh(load, { enabled: nowInWindow });
  const nowTick = useNowTick();

  // ── grouping and colour ────────────────────────────────────────────────────
  const baseGrouping = useMemo(
    () => (board ? buildActualsGrouping(board, level) : null),
    [board, level],
  );

  /**
   * Which lanes are drawn, and under what.
   *
   * Three shapes come out of here and only one reaches the canvas:
   *   rolled up          the packing lanes as the server built them
   *   machines, nested   one row per (unit × machine), from nestByHierarchy
   *   machines, flat     the server's machine lanes, hued by unit
   */
  const view = useMemo(() => {
    if (!board || !baseGrouping) return null;
    if (boardMode === 'machine' && nest) {
      const nested = nestByHierarchy(board, baseGrouping);
      return {
        lanes: nested.lanes,
        grouping: nested.grouping,
        blockStatus: nested.blockStatus,
        meta: nested.meta,
        laneIdxsByGroup: nested.laneIdxsByGroup,
        nested: true as const,
      };
    }
    const busy = board.lanes.filter((l) => l.blockCount > 0);
    const lanes = (!onlyBusy || busy.length === 0) ? board.lanes : busy;
    const map = lanes.map((l) => board.lanes.indexOf(l));
    return {
      lanes,
      grouping: {
        ...baseGrouping,
        laneGroupIdx: map.map((bi) => baseGrouping.laneGroupIdx[bi] ?? new Int32Array(0)),
      },
      blockStatus: lanes.map((l) => l.blockStatus),
      meta: null,
      laneIdxsByGroup: null,
      nested: false as const,
    };
  }, [board, baseGrouping, boardMode, nest, onlyBusy]);

  const colors = useMemo<ColorSet[]>(
    () => (view ? buildColors(view.grouping, dark) : []),
    [view, dark],
  );

  const groupBlocks = useMemo(
    () => (view ? buildGroupBlocks(view.lanes as ActualsLane[], view.grouping) : []),
    [view],
  );

  const spines = useMemo(
    () => (board && view && boardMode === 'unit' ? buildSpines(board, view.grouping) : undefined),
    [board, view, boardMode],
  );

  /**
   * Ghosts keyed by task id.
   *
   * Only ever drawn in MACHINE mode. A rolled-up block is a run — several tasks
   * merged into one stretch — so it has no single task whose plan it could be
   * compared against, and outlining it against one member's plan would be a
   * confident-looking lie. The curve is where rolled-up mode answers "against
   * the plan", and it answers it for the whole window at once.
   */
  const ghosts = useMemo(() => {
    if (!board?.plan || boardMode !== 'machine') return undefined;
    const g = board.plan.ghosts;
    const m = new Map<number, [number, number]>();
    for (let i = 0; i + 2 < g.length; i += GHOST_STRIDE) m.set(g[i], [g[i + 1], g[i + 2]]);
    return m;
  }, [board, boardMode]);

  const selectedIdx = selected && view ? view.grouping.byKey.get(selected) ?? null : null;

  // ── rows ───────────────────────────────────────────────────────────────────
  const rows = useMemo<BoardRow[]>(() => {
    if (!view) return [];
    const h = ROW_H[mode];
    const out: BoardRow[] = [];

    if (view.nested && view.laneIdxsByGroup) {
      view.grouping.groups.forEach((g, gi) => {
        const mine = view.laneIdxsByGroup![gi];
        if (!mine || mine.length === 0) return;
        const isCollapsed = collapsed.has(g.key);
        // A collapsed header IS the density strip for everything beneath it —
        // the canvas already draws a group's blocks inside its rail row, so
        // collapsing costs a taller row and no new drawing code.
        out.push({ kind: 'rail', groupIdx: gi, h: isCollapsed ? h.header + 6 : h.header });
        if (!isCollapsed) for (const li of mine) out.push({ kind: 'lane', laneIdx: li, h: h.lane });
        out.push({ kind: 'gap', h: 6 });
      });
      return out;
    }

    // Flat: unit handles on top (while they are still legible), lanes below.
    const railIdxs = view.grouping.groups.length <= LEGIBLE_UNIT_LIMIT
      ? view.grouping.groups.map((_, i) => i)
      : (selectedIdx != null ? [selectedIdx] : []);
    for (const g of railIdxs) out.push({ kind: 'rail', groupIdx: g, h: h.rail });
    if (out.length > 0) out.push({ kind: 'gap', h: 10 });
    view.lanes.forEach((_, i) => out.push({ kind: 'lane', laneIdx: i, h: h.lane }));
    return out;
  }, [view, mode, collapsed, selectedIdx]);

  const ticks = useMemo(() => buildTicks(scale, trackPx), [scale, trackPx]);
  const gridRel = useMemo(() => ticks.map((t) => (t.leftPct / 100) * windowMs), [ticks, windowMs]);
  const gridMajor = useMemo(() => ticks.map((t) => t.major), [ticks]);
  const nowRel = useMemo(() => {
    const n = nowTick - scale.startMs;
    return n >= 0 && n <= windowMs ? n : null;
  }, [nowTick, scale.startMs, windowMs]);

  // ── labels ─────────────────────────────────────────────────────────────────
  const opNameById = useMemo(
    () => new Map((board?.operations ?? []).map((o) => [o.id, o.name ?? ''])),
    [board],
  );
  const itemById = useMemo(
    () => new Map((board?.items ?? []).map((i) => [i.id, i])),
    [board],
  );

  const blockLabel = useCallback((_entryId: number, itemId: number, laneIdx: number, blockIdx: number) => {
    if (!view) return '';
    const lane = view.lanes[laneIdx] as ActualsLane | undefined;
    const op = lane?.blockOp?.[blockIdx];
    const opName = op ? opNameById.get(op) : null;
    const it = itemById.get(itemId);
    const itName = it?.mark || it?.code || it?.name || '';
    return opName ? (itName ? `${opName} · ${itName}` : opName) : itName;
  }, [view, opNameById, itemById]);

  /**
   * Server-side LABOUR and OPERATION COUNT per unit — neither of which is what
   * the drawn blocks add up to in rolled-up mode.
   */
  const unitLabourMs = useMemo(
    () => new Map((board?.units ?? []).map((u) => [u.key, u.workMs])),
    [board],
  );
  const unitTaskCount = useMemo(
    () => new Map((board?.units ?? []).map((u) => [u.key, u.taskCount])),
    [board],
  );

  /**
   * The number beside a unit, in whichever currency is selected.
   *
   * HOURS COME FROM THE SERVER'S PER-UNIT LABOUR, not from summing the blocks on
   * screen. In rolled-up mode a block is a RUN — concurrent tasks on ten
   * machines are merged into one stretch — so adding the drawn blocks gives
   * OCCUPANCY, not work. Measured on the prod fixture: one girder drew 188h 45m
   * of runs over 321h 30m of labour, and the header (labour) and the gutter
   * (occupancy) sat on the same screen disagreeing by 40% with nothing to say
   * why. Machine mode happens to agree because there a block is a task, which is
   * exactly what made this easy to miss locally.
   */
  const unitFigure = useCallback((key: string, workMs: number, blocks: number) => {
    if (measure === 'hours') return fmtWorkMs(unitLabourMs.get(key) ?? workMs);
    // Same trap as the hours: a rolled-up block is a run, so counting blocks
    // counts stretches of activity rather than operations.
    if (measure === 'count') return `${unitTaskCount.get(key) ?? blocks}`;
    const t = board?.unitTonnes?.[key];
    return t == null ? '—' : `${t.toFixed(t >= 10 ? 0 : 1)} t`;
  }, [measure, board, unitLabourMs, unitTaskCount]);

  // ── stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo<Stat[]>(() => {
    const s = board?.stats;
    if (!s) return [];
    const out: Stat[] = [
      { label: 'Hours worked', value: Math.round(s.hours), display: `${Math.round(s.hours)} h` },
      {
        label: 'Tonnes progressed',
        value: Math.round(s.tonnes ?? 0),
        display: s.tonnes == null ? '—' : `${s.tonnes.toFixed(s.tonnes >= 10 ? 0 : 1)} t`,
      },
      { label: 'Operations completed', value: s.tasksCompleted, tone: 'success' },
    ];
    if (boardMode === 'unit') {
      out.push({
        label: 'Peak parallel',
        value: s.peakParallel,
        display: `${s.peakParallel} at once`,
        tone: 'info',
      });
    } else {
      out.push({ label: 'Machines active', value: s.machinesActive, tone: 'info' });
    }
    if (level !== 'operation' && !s.degraded) {
      out.push({
        label: `${ACTUALS_LEVEL_LABEL[level]}s completed`,
        value: s.unitsCompleted,
        display: `${s.unitsCompleted} of ${s.unitsCompleted + s.unitsOpen}`,
        tone: 'success',
      });
    }
    if (s.reworkHours > 0) {
      out.push({
        label: 'Rework hours',
        value: Math.round(s.reworkHours),
        display: `${Math.round(s.reworkHours)} h`,
        tone: 'warning',
      });
    }
    return out;
  }, [board, boardMode, level]);

  // ── window controls ────────────────────────────────────────────────────────
  const step = useCallback((dir: -1 | 1) => {
    setAnchorYMD((cur) => {
      if (mode === 'month') return addMonthsYMD(cur, dir);
      return addDaysYMD(cur, dir * (mode === 'week' ? 7 : 1));
    });
  }, [mode]);

  const goToday = useCallback(() => {
    const t = todayYMD(timeZone);
    setAnchorYMD(mode === 'month' ? monthStartYMD(t) : t);
  }, [mode, timeZone]);

  /**
   * Changing zoom keeps the reader roughly where they were.
   *
   * Zooming from a month into a week must not land three weeks before the work:
   * anchor on today when today is inside the window, otherwise on the window's
   * own start.
   */
  const changeMode = useCallback((m: ViewMode) => {
    const t = todayYMD(timeZone);
    const inWindow = t >= scale.days[0] && t <= scale.days[scale.days.length - 1];
    setAnchorYMD(m === 'month'
      ? monthStartYMD(inWindow ? t : scale.days[0])
      : (inWindow ? t : scale.days[0]));
    setMode(m);
  }, [scale, timeZone]);

  const windowLabel = useMemo(() => {
    const d = new Date(`${scale.days[0]}T12:00:00Z`);
    if (mode === 'month') return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const end = new Date(`${scale.days[scale.days.length - 1]}T12:00:00Z`);
    if (mode === 'day') return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  }, [scale, mode]);

  const allCollapsed = !!view?.nested
    && view.grouping.groups.length > 0
    && view.grouping.groups.every((g) => collapsed.has(g.key));

  const toggleAll = useCallback(() => {
    if (!view) return;
    setCollapsed(allCollapsed ? new Set() : new Set(view.grouping.groups.map((g) => g.key)));
  }, [view, allCollapsed]);

  // ── hover card ─────────────────────────────────────────────────────────────
  const hoverCard = useMemo(() => {
    if (!hover || !view || !board) return null;
    if (hover.groupIdx < 0) return null;
    const g = view.grouping.groups[hover.groupIdx];
    if (!g) return null;
    if (hover.laneIdx < 0) {
      return {
        title: g.label,
        lines: [g.sublabel, `${fmtWorkMs(g.workMs)} · ${g.blockCount} block${g.blockCount === 1 ? '' : 's'}`],
      };
    }
    const lane = view.lanes[hover.laneIdx] as ActualsLane;
    const st = lane.blockStatus?.[hover.blockIdx] ?? 2;
    const op = lane.blockOp?.[hover.blockIdx];
    const legend = STATUS_LEGEND.find((s) => s.code === st);
    const it = itemById.get(hover.itemId);
    return {
      title: (op ? opNameById.get(op) : null) || g.label,
      lines: [
        it ? (it.mark || it.code || it.name || '') : g.label,
        boardMode === 'unit'
          ? `${lane.name} · ${fmtWorkMs(hover.durMs)}`
          : `${lane.name} · ${fmtWorkMs(hover.durMs)}`,
        legend ? legend.label : '',
      ].filter(Boolean),
    };
  }, [hover, view, board, itemById, opNameById, boardMode]);

  if (!canView) {
    return (
      <Box sx={{ p: 3 }}>
        <EmptyState title="No access" hint="You do not have permission to view the Actuals Board." />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title="Actuals"
        subtitle="What the shop actually did — completed and in progress, at any level."
        actions={nowInWindow ? (
          <LiveIndicator
            paused={live.paused}
            onTogglePause={() => live.setPaused(!live.paused)}
            lastUpdated={live.lastUpdated ?? loadedAt}
            now={nowTick}
            busy={live.busy}
            onRefreshNow={() => void live.refreshNow()}
          />
        ) : null}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {board?.stats.degraded && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This window touches more items than the roll-up will load, so tonnage and the
          unit counters are omitted. Narrow the window or filter to one order to get them back.
        </Alert>
      )}

      {board && <StatStrip stats={stats} />}

      {/* ── controls ──────────────────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <IconButton size="small" onClick={() => step(-1)} aria-label="Previous"><ChevronLeftRounded /></IconButton>
            <Typography variant="subtitle2" sx={{ minWidth: 160, textAlign: 'center' }}>
              {windowLabel}
            </Typography>
            <IconButton size="small" onClick={() => step(1)} aria-label="Next"><ChevronRightRounded /></IconButton>
            <Tooltip title="Jump to now">
              <IconButton size="small" onClick={goToday}><TodayRounded /></IconButton>
            </Tooltip>
          </Stack>

          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_, v) => v && changeMode(v as ViewMode)}
          >
            <ToggleButton value="month">Month</ToggleButton>
            <ToggleButton value="week">Week</ToggleButton>
            <ToggleButton value="day">Day</ToggleButton>
          </ToggleButtonGroup>

          <ToggleButtonGroup
            size="small"
            exclusive
            value={boardMode}
            onChange={(_, v) => v && setBoardMode(v as ActualsMode)}
          >
            <Tooltip title="One bar per unit, against the plant — parallel lanes are units running at the same time">
              <ToggleButton value="unit">Rolled up</ToggleButton>
            </Tooltip>
            <Tooltip title="Every operation, on the machine that ran it">
              <ToggleButton value="machine">Machines</ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>

          <TextField
            select
            size="small"
            label="Level"
            value={level}
            onChange={(e) => setLevel(e.target.value as ActualsLevel)}
            sx={{ minWidth: 140 }}
          >
            {ACTUALS_LEVELS.map((l) => (
              <MenuItem key={l} value={l}>{ACTUALS_LEVEL_LABEL[l]}</MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label="Measure"
            value={measure}
            onChange={(e) => setMeasure(e.target.value as Measure)}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="hours">Hours</MenuItem>
            <MenuItem value="tonnes">Tonnes</MenuItem>
            <MenuItem value="count">Operations</MenuItem>
          </TextField>

          <Tooltip title="Draw where the plan said this work would be, and chart progress against it">
            <FormControlLabel
              control={<Switch size="small" checked={withPlan} onChange={(e) => setWithPlan(e.target.checked)} />}
              label={<Typography variant="body2">Compare with plan</Typography>}
            />
          </Tooltip>

          {/* The month as a document, for the client. Carries the window and the
              level, so the report is of what is on screen rather than of some
              default the reader has to re-choose. */}
          <Tooltip title="A printable progress report for this month">
            <Button
              size="small"
              startIcon={<DescriptionRounded />}
              component={RouterLink}
              to={`/${companySlug}/fab_erp/actuals/report?month=${scale.days[0].slice(0, 7)}&level=${level}`}
            >
              Report
            </Button>
          </Tooltip>

          {boardMode === 'machine' && (
            <>
              <FormControlLabel
                control={<Switch size="small" checked={nest} onChange={(e) => setNest(e.target.checked)} />}
                label={<Typography variant="body2">Group by hierarchy</Typography>}
              />
              {nest ? (
                <Tooltip title={allCollapsed ? 'Expand all' : 'Collapse all'}>
                  <IconButton size="small" onClick={toggleAll}>
                    {allCollapsed ? <UnfoldMoreRounded /> : <UnfoldLessRounded />}
                  </IconButton>
                </Tooltip>
              ) : (
                <FormControlLabel
                  control={<Switch size="small" checked={onlyBusy} onChange={(e) => setOnlyBusy(e.target.checked)} />}
                  label={<Typography variant="body2">Only machines that ran</Typography>}
                />
              )}
            </>
          )}
        </Stack>

        {/* The legend. Hue says whose work; fill says what state it is in. */}
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Fill:</Typography>
          {STATUS_LEGEND.map((s) => (
            <Stack key={s.code} direction="row" spacing={0.75} alignItems="center">
              {/* Each swatch is drawn the way the canvas draws it, not merely
                  in a different colour — the whole point of the scheme is that
                  status is a treatment, so a legend of coloured squares would
                  teach the wrong thing. */}
              <Box
                sx={{
                  width: 18,
                  height: 11,
                  borderRadius: '2px',
                  border: s.style === 'outlined' ? '1px solid' : 'none',
                  borderColor: 'text.secondary',
                  bgcolor: s.style === 'outlined' ? 'transparent' : 'text.secondary',
                  opacity: s.style === 'hatched' ? 0.45 : 1,
                  ...(s.style === 'ruled' ? { borderBottom: '3px solid', borderBottomColor: 'error.main' } : {}),
                  ...(s.style === 'live' ? { borderRight: '3px solid', borderRightColor: 'info.main' } : {}),
                }}
              />
              <Typography variant="caption">{s.label}</Typography>
            </Stack>
          ))}
          <Box sx={{ flex: 1 }} />
          {!!board?.stats.ungroupedHours && (
            <Typography variant="caption" sx={{ color: 'warning.main' }}>
              {board.stats.ungroupedHours} h has no {ACTUALS_LEVEL_LABEL[level].toLowerCase()} above it — drawn grey
            </Typography>
          )}
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Colour = {ACTUALS_LEVEL_LABEL[level].toLowerCase()}
            {view?.grouping.shaded ? ' family, shaded per unit' : ''}
          </Typography>
        </Stack>
      </Paper>

      {/* ── the S-curve ───────────────────────────────────────────────────── */}
      {withPlan && board?.plan && (
        <Surface sx={{ p: 1.5, mb: 2 }}>
          <SCurve
            curve={board.plan.curve}
            nowYMD={nowInWindow ? todayYMD(timeZone) : null}
          />
        </Surface>
      )}

      {/* ── the board ─────────────────────────────────────────────────────── */}
      <Surface sx={{ p: 0, overflow: 'hidden' }}>
        {loading && !board && <Box sx={{ p: 2 }}><ListSkeleton rows={6} /></Box>}

        {board && view && view.lanes.length === 0 && (
          <Box sx={{ p: 4 }}>
            <EmptyState
              title="Nothing ran in this window"
              hint="No operation was started, worked on or finished between these dates."
            />
          </Box>
        )}

        {board && view && view.lanes.length > 0 && (
          <>
            {/* time axis */}
            <Box sx={{ display: 'flex', borderBottom: 1, borderColor: 'divider' }}>
              <Box sx={{ width: GUTTER_PX, flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0, position: 'relative', height: 26 }}>
                {ticks.map((t, i) => (t.label ? (
                  <Typography
                    key={i}
                    variant="caption"
                    sx={{
                      position: 'absolute',
                      left: `${t.leftPct}%`,
                      top: 5,
                      pl: 0.5,
                      color: 'text.secondary',
                      fontWeight: t.major ? 600 : 400,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.label}
                  </Typography>
                ) : null))}
              </Box>
            </Box>

            <Box sx={{ display: 'flex' }}>
              {/* gutter */}
              <Box sx={{ width: GUTTER_PX, flexShrink: 0, borderRight: 1, borderColor: 'divider' }}>
                {rows.map((row, i) => {
                  if (row.kind === 'gap') return <Box key={i} sx={{ height: row.h }} />;

                  if (row.kind === 'rail') {
                    const g = view.grouping.groups[row.groupIdx];
                    const c = colors[row.groupIdx];
                    const isSel = selectedIdx === row.groupIdx;
                    const isCollapsed = collapsed.has(g.key);
                    return (
                      <Box
                        key={i}
                        onClick={() => {
                          if (view.nested) {
                            setCollapsed((cur) => {
                              const next = new Set(cur);
                              if (next.has(g.key)) next.delete(g.key); else next.add(g.key);
                              return next;
                            });
                          } else {
                            setSelected(isSel ? null : g.key);
                          }
                        }}
                        sx={{
                          height: row.h,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.75,
                          px: 1,
                          cursor: 'pointer',
                          bgcolor: isSel ? 'action.selected' : 'transparent',
                          '&:hover': { bgcolor: 'action.hover' },
                        }}
                      >
                        {view.nested && (
                          <Box sx={{ fontSize: 10, color: 'text.secondary', width: 10 }}>
                            {isCollapsed ? '▸' : '▾'}
                          </Box>
                        )}
                        <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: c?.fill, flexShrink: 0 }} />
                        <Tooltip title={g.sublabel ? `${g.label} · ${g.sublabel}` : g.label}>
                          <Typography variant="caption" noWrap sx={{ fontWeight: 600, flex: 1, minWidth: 0 }}>
                            {g.shortLabel}
                          </Typography>
                        </Tooltip>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                          {unitFigure(g.key, g.workMs, g.blockCount)}
                        </Typography>
                      </Box>
                    );
                  }

                  const lane = view.lanes[row.laneIdx] as ActualsLane;
                  const meta = view.meta?.[row.laneIdx] ?? null;
                  return (
                    <Box
                      key={i}
                      sx={{
                        height: row.h,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        px: 1,
                        pl: view.nested ? 3 : 1,
                        borderTop: 1,
                        borderColor: 'divider',
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="caption" noWrap sx={{ display: 'block', fontWeight: 500 }}>
                          {lane.name}
                        </Typography>
                        {row.h >= 32 && (
                          <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>
                            {lane.kind === 'pack'
                              ? `${lane.unitCount} ${ACTUALS_LEVEL_LABEL[level].toLowerCase()}${lane.unitCount === 1 ? '' : 's'}`
                              : lane.typeName}
                          </Typography>
                        )}
                      </Box>
                      {/* A packing lane's number is how many UNITS share it —
                          a block count there would be counting runs, which is
                          an artefact of the join threshold and means nothing to
                          a reader. A machine lane's number is its hours. */}
                      <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                        {lane.kind === 'pack'
                          ? `×${lane.unitCount}`
                          : (meta ? fmtWorkMs(meta.workMs) : `${lane.blockCount}`)}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>

              {/* canvas */}
              <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
                <BoardCanvas
                  lanes={view.lanes}
                  grouping={view.grouping}
                  colors={colors}
                  groupBlocks={groupBlocks}
                  entryStartRel={EMPTY_ENTRY_STARTS}
                  preview={null}
                  rows={rows}
                  windowMs={windowMs}
                  nowRel={nowRel}
                  gridRel={gridRel}
                  gridMajor={gridMajor}
                  selectedGroup={selectedIdx}
                  hoverGroup={hover?.groupIdx ?? null}
                  dark={dark}
                  onHover={setHover}
                  onPick={(hit) => {
                    if (!hit || hit.groupIdx < 0 || !view) { setSelected(null); return; }
                    const key = view.grouping.groups[hit.groupIdx].key;
                    setSelected((cur) => (cur === key ? null : key));
                  }}
                  onWidth={setTrackPx}
                  blockLabel={blockLabel}
                  blockStatus={view.blockStatus}
                  statusStyle={ACTUALS_STATUS_STYLE}
                  spines={spines}
                  ghosts={ghosts}
                />

                {hoverCard && hover && (
                  <Paper
                    elevation={6}
                    sx={{
                      position: 'absolute',
                      left: Math.max(4, Math.min(hover.x + 12, (trackPx || 600) - 240)),
                      top: Math.max(4, hover.y - 8),
                      px: 1.25,
                      py: 0.75,
                      maxWidth: 230,
                      pointerEvents: 'none',
                      zIndex: 5,
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                      {hoverCard.title}
                    </Typography>
                    {hoverCard.lines.map((l, i) => (
                      <Typography key={i} variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                        {l}
                      </Typography>
                    ))}
                  </Paper>
                )}
              </Box>
            </Box>
          </>
        )}
      </Surface>

      {boardMode === 'unit' && board && board.laneCount > 0 && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} alignItems="center">
          <Chip
            size="small"
            label={`${board.laneCount} lane${board.laneCount === 1 ? '' : 's'}`}
            color="info"
            variant="outlined"
          />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Lanes are not machines. A unit gets a new lane only when one was already busy,
            so the row count is the most {ACTUALS_LEVEL_LABEL[level].toLowerCase()}s the shop had open at once.
          </Typography>
        </Stack>
      )}
    </Box>
  );
}
