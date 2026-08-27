/**
 * PlanBoard.tsx — the plan at the zoom the planner is thinking at.
 *
 * The Planner grid answers "what is on this machine today". This answers the
 * question that comes before it: is there room, and where. A planner placing a
 * girder is not placing an operation — they are placing fifty of them, and what
 * decides whether the girder fits is the shape of the holes the last one left.
 *
 * So three things are always on screen together:
 *
 *   the machines   one line each, every operation drawn, never rolled up
 *   the units      a handle per girder (or span, or segment, or part) above
 *                  the machines, on the same time axis, in the same colour as
 *                  its blocks — the thing that will be grabbed and moved
 *   the shifts     the substrate. Unmanned time is shaded out, and a lane
 *                  crewed at half its machines is shaded halfway, so "the gap
 *                  is Sunday" and "the gap is a night shift nobody works" do
 *                  not look the same.
 *
 * Three zooms, each calibrated to a different decision:
 *
 *   Month  five Monday-aligned weeks. Which machines are solid and which are
 *          hollow; whether the quarter has room at all.
 *   Week   seven days. Where one unit's gaps are, and whether the next unit
 *          can be pushed into them.
 *   Day    one day, hour by hour. Which shift a bar actually lands on.
 *
 * READ AND SELECT ONLY, for now. Dragging a handle — moving fifty operations at
 * once, stretching them, pushing them left into the gaps — is the next step,
 * and it is deliberately not wired up before the view it acts on is right.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, IconButton, LinearProgress, MenuItem,
  Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
  useTheme,
} from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import TodayRounded from '@mui/icons-material/TodayRounded';
import KeyboardDoubleArrowLeftRounded from '@mui/icons-material/KeyboardDoubleArrowLeftRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';

import { usePermission } from '@core/hooks/usePermission';
import { useAuth } from '@core/contexts/AuthContext';
import { isAdminRole } from '@core/utils/roles';

import {
  getPlanBoard, transformPlanGroup, groupErrorOf,
  BLOCK_STRIDE, BLOCK_START, BLOCK_DUR, BLOCK_ENTRY,
  type BoardResponse, type GroupPlacement, type GroupUnit,
} from '../api/planner';
import {
  PageHeader, Surface, EmptyState, ListSkeleton, Mono, useToast, backendMessage,
} from '../components';
import {
  BoardCanvas, type BoardRow, type BlockHit, type GrabInfo, type PreviewTransform,
} from '../components/planner/BoardCanvas';
import {
  buildGrouping, buildColors, fmtWorkMs, shortenLabel, LEGIBLE_UNIT_LIMIT,
  GROUP_LEVELS, GROUP_LEVEL_LABEL, type GroupLevel, type ColorSet,
} from '../components/planner/boardModel';
import {
  buildScale, buildTicks, todayYMD, addDaysYMD, weekStartYMD, dayStartUtc, zonedYMD,
  fmtLocalTime, MODE_DAYS, type ViewMode,
} from '../components/planner/plannerTime';

const FALLBACK_TZ = 'UTC';
const GUTTER_PX = 208;

/**
 * Row heights per zoom.
 *
 * Not one height scaled by a factor: each zoom is read differently. A month row
 * is SCANNED — thirteen of them have to be comparable at a glance, so it is as
 * short as a density column can be and still show its own height. A day row is
 * READ — a bar carries a label, so it needs the height of a line of text plus
 * its inset.
 */
const ROW_H: Record<ViewMode, { lane: number; rail: number }> = {
  month: { lane: 26, rail: 14 },
  week: { lane: 34, rail: 17 },
  day: { lane: 48, rail: 22 },
};

/**
 * Snap ladder for a drag, coarsest first once the zoom demands it.
 *
 * Chosen by PIXELS, not by zoom name: at five weeks a pixel is three quarters of
 * an hour, so a fifteen-minute snap is finer than the mouse can express and the
 * unit lands somewhere the planner did not aim. The smallest step at least
 * SNAP_MIN_PX wide is the one that makes the gesture honest.
 */
const SNAP_MINUTES = [15, 30, 60, 120, 240, 480, 1440];
const SNAP_MIN_PX = 4;

/**
 * The drawn track, measured during a drag.
 *
 * A drag reads pixels off the DOM rather than trusting the width the canvas
 * last reported: the two disagree for one frame after any resize, and one frame
 * of disagreement is a unit landing an hour from where it was dropped.
 */
/**
 * A fresh id for one gesture.
 *
 * randomUUID needs a secure context, which localhost and production both are,
 * but a preview served over plain http is not — so there is a fallback rather
 * than a drag that throws on mousedown.
 */
function newDragId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
const TRACK_ID = 'plan-board-track';

export default function PlanBoard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const admin = isAdminRole(user?.role);
  const canView = usePermission('fab_erp_planner_view') || admin;
  const canManage = usePermission('fab_erp_planner_manage') || admin;

  const [mode, setMode] = useState<ViewMode>('week');
  const [timeZone, setTimeZone] = useState<string>(FALLBACK_TZ);
  const [fromYMD, setFromYMD] = useState<string>(() => todayYMD(FALLBACK_TZ));
  const [level, setLevel] = useState<GroupLevel>('girder');
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<BlockHit | null>(null);
  const [trackPx, setTrackPx] = useState(900);
  const [onlyBusyLanes, setOnlyBusyLanes] = useState(true);

  const scale = useMemo(() => buildScale(mode, fromYMD, timeZone), [mode, fromYMD, timeZone]);

  // ── load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPlanBoard({
        from: new Date(scale.startMs).toISOString(),
        to: new Date(scale.endMs).toISOString(),
      });
      setBoard(res);
      if (res.timezone && res.timezone !== timeZone) setTimeZone(res.timezone);
    } catch (err) {
      setError(backendMessage(err, 'Could not load the plan board.'));
    } finally {
      setLoading(false);
    }
  }, [scale.startMs, scale.endMs, timeZone]);

  useEffect(() => { if (canView) void load(); }, [canView, load]);

  // The plant's zone arrives with the first response; the window was built in
  // UTC before that. Re-anchoring on today in the real zone once is correct —
  // it is not a loop, because the guard only fires while the zone is still the
  // fallback.
  const zoneSettled = useRef(false);
  useEffect(() => {
    if (!board || zoneSettled.current) return;
    zoneSettled.current = true;
    const today = todayYMD(board.timezone);
    setFromYMD(mode === 'month' ? weekStartYMD(today) : today);
  }, [board, mode]);

  // ── grouping ───────────────────────────────────────────────────────────────
  const grouping = useMemo(
    () => (board ? buildGrouping(board, level) : null),
    [board, level],
  );

  /** Where each BAR starts. A stretch moves bars, so a block has to find its own. */
  const entryStartRel = useMemo(() => {
    const out = new Map<number, number>();
    for (const lane of board?.lanes ?? []) {
      for (let b = 0; b < lane.blockCount; b += 1) {
        const id = lane.blocks[b * BLOCK_STRIDE + BLOCK_ENTRY];
        const at = lane.blocks[b * BLOCK_STRIDE + BLOCK_START];
        const cur = out.get(id);
        if (cur === undefined || at < cur) out.set(id, at);
      }
    }
    return out;
  }, [board]);

  /** The bars each unit is made of — what a group transform is actually applied to. */
  const entryIdsByGroup = useMemo(() => {
    if (!board || !grouping) return [] as number[][];
    const acc: Set<number>[] = grouping.groups.map(() => new Set<number>());
    board.lanes.forEach((lane, li) => {
      const gi = grouping.laneGroupIdx[li];
      if (!gi) return;
      for (let b = 0; b < lane.blockCount; b += 1) {
        const g = gi[b];
        if (g >= 0) acc[g].add(lane.blocks[b * BLOCK_STRIDE + BLOCK_ENTRY]);
      }
    });
    return acc.map((set) => [...set]);
  }, [board, grouping]);

  /**
   * Each group's blocks, merged across every lane and sorted — the rail draws
   * these. Triples: start, duration, and the start of the BAR the block sits in,
   * which is what lets a stretch be previewed without stretching the work.
   */
  const groupBlocks = useMemo(() => {
    if (!board || !grouping) return [] as Float64Array[];
    const acc: number[][] = grouping.groups.map(() => []);
    board.lanes.forEach((lane, li) => {
      const gi = grouping.laneGroupIdx[li];
      if (!gi) return;
      for (let b = 0; b < lane.blockCount; b += 1) {
        const g = gi[b];
        if (g < 0) continue;
        const at = lane.blocks[b * BLOCK_STRIDE + BLOCK_START];
        acc[g].push(
          at,
          lane.blocks[b * BLOCK_STRIDE + BLOCK_DUR],
          entryStartRel.get(lane.blocks[b * BLOCK_STRIDE + BLOCK_ENTRY]) ?? at,
        );
      }
    });
    return acc.map((flat) => {
      const n = flat.length / 3;
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => flat[a * 3] - flat[b * 3]);
      const out = new Float64Array(flat.length);
      order.forEach((src, dst) => {
        out[dst * 3] = flat[src * 3];
        out[dst * 3 + 1] = flat[src * 3 + 1];
        out[dst * 3 + 2] = flat[src * 3 + 2];
      });
      return out;
    });
  }, [board, grouping, entryStartRel]);

  const colors = useMemo<ColorSet[]>(
    () => (grouping ? buildColors(grouping, dark) : []),
    [grouping, dark],
  );

  const selectedIdx = selected != null && grouping ? grouping.byKey.get(selected) ?? null : null;

  // ── lanes drawn ────────────────────────────────────────────────────────────
  const lanes = useMemo(() => {
    if (!board) return [];
    // Every machine, or only the ones with work. A shop has more resource types
    // than any one order touches, and thirty empty lines push the three that
    // matter off the screen.
    //
    // The filter never empties the board, though: a window with nothing in it
    // would otherwise blank the whole view, and a planner looking for room
    // needs to see the empty machines most of all. Filtering to nothing means
    // "there is no work here", which the lanes themselves say better.
    const busy = board.lanes.filter((l) => l.blockCount > 0);
    if (!onlyBusyLanes || busy.length === 0) return board.lanes;
    return busy;
  }, [board, onlyBusyLanes]);

  /** laneIdx here indexes `lanes`; the grouping indexes board.lanes. Bridge them. */
  const laneGrouping = useMemo(() => {
    if (!board || !grouping) return null;
    const map = lanes.map((l) => board.lanes.indexOf(l));
    return {
      ...grouping,
      laneGroupIdx: map.map((bi) => grouping.laneGroupIdx[bi] ?? new Int32Array(0)),
    };
  }, [board, grouping, lanes]);

  const railGroupIdxs = useMemo(() => {
    if (!grouping) return [];
    if (grouping.groups.length <= LEGIBLE_UNIT_LIMIT) return grouping.groups.map((_, i) => i);
    return selectedIdx != null ? [selectedIdx] : [];
  }, [grouping, selectedIdx]);

  const rows = useMemo<BoardRow[]>(() => {
    const h = ROW_H[mode];
    const out: BoardRow[] = railGroupIdxs.map((g) => ({ kind: 'rail' as const, groupIdx: g, h: h.rail }));
    if (out.length > 0) out.push({ kind: 'gap', h: 12 });
    lanes.forEach((_, i) => out.push({ kind: 'lane', laneIdx: i, h: h.lane }));
    return out;
  }, [mode, railGroupIdxs, lanes]);

  const ticks = useMemo(() => buildTicks(scale, trackPx), [scale, trackPx]);
  const windowMs = scale.endMs - scale.startMs;
  const gridRel = useMemo(() => ticks.map((t) => (t.leftPct / 100) * windowMs), [ticks, windowMs]);
  const gridMajor = useMemo(() => ticks.map((t) => t.major), [ticks]);
  const nowRel = useMemo(() => {
    const n = Date.now() - scale.startMs;
    return n >= 0 && n <= windowMs ? n : null;
  }, [scale.startMs, windowMs]);

  // ── dragging ───────────────────────────────────────────────────────────────
  /**
   * A gesture in flight. Held here rather than in the canvas because it outlives
   * the canvas's own events: the pointer leaves the element constantly during a
   * drag, so move and release are listened for on the window.
   */
  const [drag, setDrag] = useState<{
    grab: GrabInfo;
    /** The unit itself — what the server resolves the bars from. */
    unit: GroupUnit;
    /** The bars ON SCREEN. Sent as a cross-check, not as the set to move. */
    entryIds: number[];
    /** How many bars the unit really has; null until a dry run has answered. */
    unitSize: number | null;
    settleSize: number | null;
    /** This gesture's id. See transformPlanGroup's sessionId. */
    sessionId: string;
    /** Bars outside the unit that will follow it; null until the dry run answers. */
    cascadeSize: number | null;
    /** Unrelated bars that will step aside; null until the dry run answers. */
    yieldSize: number | null;
    /**
     * Where the WHOLE unit would land, epoch ms — from the dry run's placements,
     * which cover every bar and not just the drawn ones. Without it the readout
     * would quote the on-screen envelope while eight bars went somewhere else,
     * which is the same half-truth the window scoping fix exists to remove.
     */
    unitSpan: { start: number; end: number } | null;
    deltaMs: number;
    scale: number;
    anchorRel: number;
    refused: string | null;
    /**
     * The mouse is up and the write is in flight.
     *
     * The preview stays on screen until the board has reloaded. Dropping it at
     * mouseup — which is what this did — makes the unit snap back to where it
     * came from and sit there for as long as the write takes, which on a move
     * that cascades into a few hundred bars is twenty seconds of looking like
     * nothing happened. Then it jumps. Every planner who tried it read that as
     * "it will not stay where I put it".
     */
    committing: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  /** The last applied transform, kept so it can be taken back. */
  const [undoable, setUndoable] = useState<
  { entryIds: number[]; previous: GroupPlacement[]; what: string } | null>(null);

  const msPerPx = windowMs / Math.max(1, trackPx);
  const snapMs = useMemo(() => {
    const step = SNAP_MINUTES.find((m) => (m * 60000) / msPerPx >= SNAP_MIN_PX);
    return (step ?? SNAP_MINUTES[SNAP_MINUTES.length - 1]) * 60000;
  }, [msPerPx]);

  const preview = useMemo<PreviewTransform | null>(() => (drag
    ? {
      groupIdx: drag.grab.groupIdx,
      deltaMs: drag.deltaMs,
      scale: drag.scale,
      anchorRel: drag.anchorRel,
      refused: drag.refused != null,
    }
    : null), [drag]);

  /**
   * Ask the server whether the placement in hand is legal, while it is still in
   * hand. Debounced and sequenced: a drag fires this many times a second and
   * answers can arrive out of order, so a stale "no" must not paint a legal
   * placement red.
   */
  const dryRunSeq = useRef(0);
  const dryRunTimer = useRef<number | null>(null);
  const checkDrag = useCallback((d: {
    unit: GroupUnit; entryIds: number[]; deltaMs: number; scale: number; anchorRel: number;
    sessionId: string;
  }) => {
    if (dryRunTimer.current != null) window.clearTimeout(dryRunTimer.current);
    const seq = dryRunSeq.current + 1;
    dryRunSeq.current = seq;
    dryRunTimer.current = window.setTimeout(async () => {
      const body = d.scale === 1
        ? {
          unit: d.unit, entryIds: d.entryIds, op: 'move' as const,
          cascade: true, yieldFree: true, deltaMs: d.deltaMs,
          granularity: mode, sessionId: d.sessionId, dryRun: true,
        }
        : {
          unit: d.unit,
          entryIds: d.entryIds,
          op: 'stretch' as const,
          cascade: true, yieldFree: true,
          anchorMs: scale.startMs + d.anchorRel,
          scale: d.scale,
          granularity: mode,
          sessionId: d.sessionId,
          dryRun: true,
        };
      try {
        const res = await transformPlanGroup(body);
        if (dryRunSeq.current === seq) {
          const times = res.placements.map((pl) => [
            new Date(pl.plannedStart).getTime(),
            new Date(pl.plannedEnd).getTime(),
          ]);
          const span = times.length > 0
            ? { start: Math.min(...times.map((t) => t[0])), end: Math.max(...times.map((t) => t[1])) }
            : null;
          setDrag((cur) => (cur
            ? {
              ...cur,
              refused: null,
              unitSize: res.unitSize ?? cur.unitSize,
              settleSize: res.settledCount ?? cur.settleSize,
              cascadeSize: res.cascadedCount ?? cur.cascadeSize,
              yieldSize: res.yieldedCount ?? cur.yieldSize,
              unitSpan: span,
            }
            : cur));
        }
      } catch (err) {
        if (dryRunSeq.current !== seq) return;
        const refused = groupErrorOf(err);
        setDrag((cur) => (cur
          ? { ...cur, refused: refused?.message ?? backendMessage(err, 'Not possible here.') }
          : cur));
      }
    }, 160);
  }, [scale.startMs, mode]);

  const onGrab = useCallback((grab: GrabInfo) => {
    const ids = entryIdsByGroup[grab.groupIdx] ?? [];
    const group = grouping?.groups[grab.groupIdx];
    if (ids.length === 0 || !group) return;
    setSelected(group.key);
    setDrag({
      grab,
      unit: { level, key: group.key },
      // New for every grab: a gesture is the unit of caching, and reusing an
      // id across two drags would offer the second one the first one's world.
      sessionId: newDragId(),
      unitSize: null,
      settleSize: null,
      cascadeSize: null,
      yieldSize: null,
      unitSpan: null,
      committing: false,
      entryIds: ids,
      deltaMs: 0,
      scale: 1,
      // A stretch holds the end you did NOT grab. That is what "fix the start
      // and stretch" means as a gesture, and it is why there are two edges.
      anchorRel: grab.zone === 'startEdge' ? grab.endRel : grab.startRel,
      refused: null,
    });
  }, [entryIdsByGroup, grouping, level]);

  const commit = useCallback(async (d: {
    unit: GroupUnit; entryIds: number[]; deltaMs: number; scale: number; anchorRel: number;
    sessionId: string;
  }) => {
    if (d.scale === 1 && d.deltaMs === 0) return;
    setBusy(true);
    try {
      // Same granularity the dry run was judged at, or the preview could go
      // green at day zoom and the commit be refused by the tomorrow floor.
      const res = await transformPlanGroup(d.scale === 1
        ? {
          unit: d.unit, entryIds: d.entryIds, op: 'move',
          cascade: true, yieldFree: true, deltaMs: d.deltaMs, granularity: mode,
          sessionId: d.sessionId,
        }
        : {
          unit: d.unit,
          entryIds: d.entryIds,
          op: 'stretch',
          cascade: true, yieldFree: true,
          anchorMs: scale.startMs + d.anchorRel,
          scale: d.scale,
          granularity: mode,
          sessionId: d.sessionId,
        });
      if (res.applied) {
        // Undo restores what the SERVER wrote, so its bar list comes from the
        // server's answer and never from the ids this page happened to send.
        // Those are the bars on screen; the transform covers the whole unit. A
        // restore of ten bars out of eighteen puts half a girder back and is
        // refused by the DAG gate — correctly, and confusingly.
        setUndoable({
          entryIds: res.previous.map((pl) => pl.entryId),
          previous: res.previous,
          what: d.scale === 1 ? 'move' : 'stretch',
        });
        const extra = [
          res.cascadedCount ? `${res.cascadedCount} downstream` : null,
          res.yieldedCount ? `${res.yieldedCount} stepped aside` : null,
          res.settledCount ? `${res.settledCount} waited for a gap` : null,
        ].filter(Boolean).join(', ');
        toast(`${res.movedCount} bars moved${extra ? ` — ${extra}.` : '.'}`, 'success');
      }
      for (const w of res.warnings) toast(w.message, 'info');
      await load();
    } catch (err) {
      const refused = groupErrorOf(err);
      toast(refused?.message ?? backendMessage(err, 'That move was refused.'), 'error');
    } finally {
      // Only now: the board is showing the new positions, so letting go of the
      // preview does not flash the unit back to where it started.
      setDrag(null);
      setBusy(false);
    }
  }, [scale.startMs, toast, load, mode]);

  /**
   * The drag, also in a ref.
   *
   * The window handlers below need to READ the gesture and to cause things —
   * a debounced validation, a write on release. Doing either from inside a
   * setState updater is a bug that only shows up in development, where React
   * deliberately invokes updaters twice to catch exactly this: the release
   * handler posted the move twice, and a ten-hour drag landed twenty hours out.
   * Updaters return state and nothing else; effects live out here.
   */
  const dragRef = useRef<typeof drag>(null);
  useEffect(() => { dragRef.current = drag; }, [drag]);

  // Move and release belong to the window: the pointer leaves the canvas the
  // moment a drag goes anywhere interesting.
  useEffect(() => {
    if (!drag || drag.committing) return undefined;
    const onMove = (e: MouseEvent) => {
      const cur = dragRef.current;
      const el = document.getElementById(TRACK_ID);
      if (!cur || cur.committing || !el) return;
      const rect = el.getBoundingClientRect();
      const atRel = ((e.clientX - rect.left) / Math.max(1, rect.width)) * windowMs;
      const snap = (v: number) => (e.altKey ? v : Math.round(v / snapMs) * snapMs);

      let next = cur;
      if (cur.grab.zone === 'body') {
        const delta = snap(atRel - cur.grab.atRel);
        if (delta === cur.deltaMs) return;
        next = { ...cur, deltaMs: delta, scale: 1 };
      } else {
        const anchor = cur.anchorRel;
        const grabbed = cur.grab.zone === 'endEdge' ? cur.grab.endRel : cur.grab.startRel;
        const reach = grabbed - anchor;
        if (Math.abs(reach) < 1) return;
        // Clamped, not free: a scale of zero collapses a unit onto an instant,
        // and there is no gesture back out of that.
        const raw = (snap(atRel) - anchor) / reach;
        const scaled = Math.min(20, Math.max(0.05, raw));
        if (Math.abs(scaled - cur.scale) < 1e-6) return;
        next = { ...cur, scale: scaled, deltaMs: 0 };
      }
      dragRef.current = next;
      setDrag(next);
      checkDrag(next);
    };
    const onUp = () => {
      const cur = dragRef.current;
      dragRef.current = null;
      if (!cur) { setDrag(null); return; }
      if (cur.scale === 1 && cur.deltaMs === 0) { setDrag(null); return; }
      // Hold the preview; commit() takes it down once the board has caught up.
      setDrag({ ...cur, committing: true });
      void commit(cur);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { dragRef.current = null; setDrag(null); }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [drag, windowMs, snapMs, checkDrag, commit]);

  const pushLeft = useCallback(async () => {
    if (selectedIdx == null || !grouping) return;
    const ids = entryIdsByGroup[selectedIdx] ?? [];
    const group = grouping.groups[selectedIdx];
    if (ids.length === 0 || !group) return;
    setBusy(true);
    try {
      const res = await transformPlanGroup({
        unit: { level, key: group.key }, entryIds: ids, op: 'pushLeft', cascade: true, yieldFree: true,
      });
      if (res.applied) {
        // Same reason as in commit(): the server's list, not the drawn one.
        setUndoable({
          entryIds: res.previous.map((pl) => pl.entryId),
          previous: res.previous,
          what: 'push',
        });
        toast(
          `Pushed left — ${res.movedCount} of ${res.unitSize ?? res.movedCount} bars moved.`,
          'success',
        );
        await load();
      }
      for (const w of res.warnings) toast(w.message, 'info');
    } catch (err) {
      const refused = groupErrorOf(err);
      toast(refused?.message ?? backendMessage(err, 'Could not push that unit.'), 'error');
    } finally {
      setBusy(false);
    }
  }, [selectedIdx, entryIdsByGroup, grouping, level, toast, load]);

  const undo = useCallback(async () => {
    if (!undoable) return;
    setBusy(true);
    try {
      await transformPlanGroup({
        entryIds: undoable.entryIds, op: 'restore', placements: undoable.previous,
      });
      setUndoable(null);
      toast('Put back.', 'success');
      await load();
    } catch (err) {
      const refused = groupErrorOf(err);
      toast(refused?.message ?? backendMessage(err, 'Could not put it back.'), 'error');
    } finally {
      setBusy(false);
    }
  }, [undoable, toast, load]);

  /**
   * What the gesture currently says, in words.
   *
   * A drag without a readout is a guess: at five weeks a pixel is three quarters
   * of an hour, so "about here" is not a plan. The unit's new start and end are
   * the two numbers that will actually be written, so those are the two shown.
   */
  const dragReadout = useMemo(() => {
    if (!drag || !grouping) return null;
    const g = grouping.groups[drag.grab.groupIdx];
    if (!g || g.startRel < 0) return null;
    const shift = (at: number) => (drag.scale === 1
      ? at + drag.deltaMs
      : drag.anchorRel + (at - drag.anchorRel) * drag.scale);
    const startRel = Math.min(shift(g.startRel), shift(g.endRel));
    const endRel = Math.max(shift(g.startRel), shift(g.endRel));
    const abs = (rel: number) => new Date(scale.startMs + rel);
    const from = drag.unitSpan ? new Date(drag.unitSpan.start) : abs(startRel);
    const to = drag.unitSpan ? new Date(drag.unitSpan.end) : abs(endRel);
    const amount = drag.scale === 1
      ? `${drag.deltaMs >= 0 ? '+' : '−'}${fmtWorkMs(Math.abs(drag.deltaMs))}`
      : `×${drag.scale.toFixed(2)}`;
    /**
     * How much of the unit is not on screen.
     *
     * The board draws one window; a girder can have forty-four bars and one of
     * them here. The gesture moves all of them — which is what a planner means
     * by moving a girder — but being told that only after the fact is a nasty
     * surprise, so it is said while the handle is still in hand. The count
     * arrives with the first validity check, a fraction of a second in.
     */
    const offscreen = drag.unitSize != null ? drag.unitSize - drag.entryIds.length : 0;
    return {
      label: drag.grab.zone === 'body' ? `Move ${amount}` : `Stretch ${amount}`,
      when: `${zonedYMD(from, timeZone)} ${fmtLocalTime(from, timeZone)}`
        + ` → ${zonedYMD(to, timeZone)} ${fmtLocalTime(to, timeZone)}`,
      unit: g.shortLabel,
      scope: drag.unitSize == null
        ? null
        : `${drag.unitSize} bar${drag.unitSize === 1 ? '' : 's'}`
          + (offscreen > 0 ? ` · ${offscreen} beyond this window` : '')
          // Said while the handle is still down, because "and 1,240 other bars
          // moved" is not something to find out afterwards.
          + (drag.cascadeSize ? ` · ${drag.cascadeSize} downstream will follow` : '')
          + (drag.yieldSize ? ` · ${drag.yieldSize} will step aside` : '')
          // Said before release, not after: a unit that lands later than it was
          // dropped looks like a bug unless you were told the machine was busy.
          + (drag.settleSize ? ` · ${drag.settleSize} will wait for a gap` : ''),
      refused: drag.refused,
    };
  }, [drag, grouping, scale.startMs, timeZone]);

  /** Machine-minutes booked against machine-minutes crewed, per lane. */
  const laneLoad = useMemo(() => lanes.map((lane) => {
    let planned = 0;
    for (let b = 0; b < lane.blockCount; b += 1) planned += lane.blocks[b * BLOCK_STRIDE + BLOCK_DUR];
    let capacity = 0;
    for (let i = 0; i + 2 < lane.coverage.length; i += 3) {
      capacity += (lane.coverage[i + 1] - lane.coverage[i]) * lane.coverage[i + 2];
    }
    return { planned, capacity: lane.unbounded ? null : capacity };
  }), [lanes]);

  // ── navigation ─────────────────────────────────────────────────────────────
  const step = MODE_DAYS[mode];
  const shift = (n: number) => setFromYMD((f) => {
    const next = addDaysYMD(f, n * step);
    return mode === 'month' ? weekStartYMD(next) : next;
  });
  const goToday = () => {
    const t = todayYMD(timeZone);
    setFromYMD(mode === 'month' ? weekStartYMD(t) : t);
  };
  /**
   * Where a zoom lands.
   *
   * Zooming out is easy — widen around what is on screen. Zooming IN is where
   * the naive answer fails: the window's first day is the first day of five
   * weeks, which is almost never the day being looked at, so "Month → Day"
   * used to land on an empty Monday three weeks before the work. What the
   * planner means by zooming in is "closer to THIS", and this is, in order of
   * how specific the intent is: the unit they selected, today if today is on
   * screen, otherwise the first day that actually has work.
   */
  const zoomAnchorYMD = useCallback((): string => {
    if (selectedIdx != null && grouping) {
      const g = grouping.groups[selectedIdx];
      if (g && g.startRel >= 0) return zonedYMD(new Date(scale.startMs + g.startRel), timeZone);
    }
    const today = todayYMD(timeZone);
    const todayMs = dayStartUtc(today, timeZone).getTime();
    if (todayMs >= scale.startMs && todayMs < scale.endMs) return today;
    let firstWork: number | null = null;
    for (const lane of lanes) {
      if (lane.blockCount === 0) continue;
      const s0 = lane.blocks[BLOCK_START];
      if (firstWork == null || s0 < firstWork) firstWork = s0;
    }
    if (firstWork != null) return zonedYMD(new Date(scale.startMs + firstWork), timeZone);
    return scale.fromYMD;
  }, [selectedIdx, grouping, scale, timeZone, lanes]);

  const changeMode = (m: ViewMode) => {
    const zoomingIn = MODE_DAYS[m] < MODE_DAYS[mode];
    const anchor = zoomingIn ? zoomAnchorYMD() : fromYMD;
    setMode(m);
    setFromYMD(m === 'month' ? weekStartYMD(anchor) : anchor);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { shift(-1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { shift(1); e.preventDefault(); }
      else if (e.key === 'Escape') setSelected(null);
      else if (e.key === '[') changeMode(mode === 'day' ? 'week' : 'month');
      else if (e.key === ']') changeMode(mode === 'month' ? 'week' : 'day');
      else if ((e.key === 'l' || e.key === 'L') && canManage) { void pushLeft(); e.preventDefault(); }
      else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && canManage) {
        void undo();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── hover copy ─────────────────────────────────────────────────────────────
  const itemById = useMemo(
    () => new Map((board?.items ?? []).map((i) => [i.id, i])),
    [board],
  );
  const entryById = useMemo(
    () => new Map((board?.entries ?? []).map((e) => [e.id, e])),
    [board],
  );
  const opNameById = useMemo(
    () => new Map((board?.operations ?? []).map((o) => [o.id, o.name])),
    [board],
  );
  const resNameById = useMemo(
    () => new Map((board?.resources ?? []).map((r) => [r.id, r.name])),
    [board],
  );
  /** The operation, or whatever the bar was called when it has no operation. */
  const entryName = useCallback((entryId: number) => {
    const e = entryById.get(entryId);
    if (!e) return '';
    return (e.operationId != null ? opNameById.get(e.operationId) : null) ?? e.label ?? '';
  }, [entryById, opNameById]);

  /**
   * What a block says when it is wide enough to say anything.
   *
   * The operation, then the piece it is being done to. That order because the
   * lane already answers "on which machine" and the colour already answers
   * "for which girder" — the one thing neither of them says is WHICH operation,
   * and a row of identical-looking bars is exactly where that matters.
   */
  const blockLabel = useCallback((entryId: number, itemId: number) => {
    const it = itemById.get(itemId);
    const op = entryName(entryId);
    const piece = it?.mark || it?.code || it?.name || '';
    if (op && piece) return `${op} · ${shortenLabel(piece, 18)}`;
    return op || piece;
  }, [entryName, itemById]);

  const hoverCard = useMemo(() => {
    if (!hover || !board || !grouping) return null;
    const grp = hover.groupIdx >= 0 ? grouping.groups[hover.groupIdx] : null;
    if (hover.laneIdx < 0) {
      // A rail row: the unit itself, not one of its operations.
      if (!grp) return null;
      return {
        title: grp.label,
        lines: [
          grp.sublabel,
          `${grp.blockCount} operations · ${fmtWorkMs(grp.workMs)} of work`,
          `${fmtLocalTime(new Date(scale.startMs + grp.startRel), timeZone)} → ${fmtLocalTime(new Date(scale.startMs + grp.endRel), timeZone)}`,
          `across ${grp.laneIdxs.length} machine${grp.laneIdxs.length === 1 ? '' : 's'}`,
        ].filter(Boolean) as string[],
        colorIdx: hover.groupIdx,
      };
    }
    const entry = entryById.get(hover.entryId);
    const item = itemById.get(hover.itemId);
    const machine = entry?.resourceId != null ? resNameById.get(entry.resourceId) : null;
    const piece = item ? (item.mark || item.code || item.name || '') : '';
    const s = new Date(scale.startMs + hover.startRel);
    const e = new Date(scale.startMs + hover.startRel + hover.durMs);
    return {
      title: entryName(hover.entryId) || `Task ${hover.taskId}`,
      lines: [
        piece,
        // The specific machine when one is pinned, the lane when it is not:
        // "Press-2" and "Presses" are different promises.
        machine ?? lanes[hover.laneIdx]?.name ?? '',
        `${fmtLocalTime(s, timeZone)} → ${fmtLocalTime(e, timeZone)} · ${fmtWorkMs(hover.durMs)}`,
        // Only when it adds something. Grouping at the level a task already
        // sits on makes this line an echo of the one above it.
        grp && grp.label !== piece ? `in ${GROUP_LEVEL_LABEL[level].toLowerCase()} ${grp.label}` : '',
      ].filter(Boolean) as string[],
      colorIdx: hover.groupIdx,
    };
  }, [hover, board, grouping, entryById, entryName, resNameById, itemById, lanes, scale.startMs, timeZone, level]);

  const totals = useMemo(() => {
    const planned = laneLoad.reduce((n, l) => n + l.planned, 0);
    const capacity = laneLoad.reduce((n, l) => n + (l.capacity ?? 0), 0);
    return { planned, capacity, groups: grouping?.groups.length ?? 0 };
  }, [laneLoad, grouping]);

  if (!canView) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">You do not have permission to view the plan.</Alert>
      </Box>
    );
  }

  const rowTops: number[] = [];
  let acc = 0;
  for (const r of rows) { rowTops.push(acc); acc += r.h; }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <PageHeader
        title="Plan Board"
        subtitle="Every operation on every machine, coloured by the unit it belongs to."
        actions={(
          <Stack direction="row" spacing={1} alignItems="center">
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
            <TextField
              size="small"
              select
              label="Group by"
              value={level}
              onChange={(e) => { setLevel(e.target.value as GroupLevel); setSelected(null); }}
              sx={{ minWidth: 132 }}
            >
              {GROUP_LEVELS.map((l) => (
                <MenuItem key={l} value={l}>{GROUP_LEVEL_LABEL[l]}</MenuItem>
              ))}
            </TextField>
            <Tooltip title="Refresh">
              <span>
                <IconButton size="small" onClick={() => void load()} disabled={loading}>
                  <RefreshRounded fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        )}
      />

      <Surface sx={{ p: 0, overflow: 'hidden' }}>
        {/* ── window controls ─────────────────────────────────────────────── */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap' }}
        >
          <IconButton size="small" onClick={() => shift(-1)}><ChevronLeftRounded fontSize="small" /></IconButton>
          <IconButton size="small" onClick={goToday}><TodayRounded fontSize="small" /></IconButton>
          <IconButton size="small" onClick={() => shift(1)}><ChevronRightRounded fontSize="small" /></IconButton>
          <Typography variant="h6" sx={{ ml: 0.5, minWidth: 210 }}>
            {new Date(scale.startMs).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            {mode !== 'day' && ` → ${new Date(scale.endMs - 1).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Chip
            size="small"
            variant="outlined"
            label={`${totals.groups} ${GROUP_LEVEL_LABEL[level].toLowerCase()}${totals.groups === 1 ? '' : 's'} in view`}
          />
          {grouping?.shaded && (
            <Tooltip title="Too many units for one hue each, so hue is the containing unit and shade separates the units inside it.">
              <Chip size="small" variant="outlined" label="hue = family · shade = unit" />
            </Tooltip>
          )}
          <Chip size="small" variant="outlined" label={`${fmtWorkMs(totals.planned)} booked`} />
          {totals.capacity > 0 && (
            <Chip
              size="small"
              color={totals.planned > totals.capacity ? 'warning' : 'default'}
              variant="outlined"
              label={`${Math.round((totals.planned / totals.capacity) * 100)}% of crewed time`}
            />
          )}
          <Chip
            size="small"
            variant={onlyBusyLanes ? 'filled' : 'outlined'}
            onClick={() => setOnlyBusyLanes((v) => !v)}
            label={onlyBusyLanes ? 'Machines with work' : 'All machines'}
          />
          {canManage && (
            <Tooltip title="Slide this unit as far left as its bars will fit, around everything else (L)">
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<KeyboardDoubleArrowLeftRounded />}
                  disabled={selectedIdx == null || busy}
                  onClick={() => void pushLeft()}
                >
                  Push left
                </Button>
              </span>
            </Tooltip>
          )}
          {canManage && undoable && (
            <Tooltip title="Put that back where it was (Ctrl+Z)">
              <span>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<UndoRounded />}
                  disabled={busy}
                  onClick={() => void undo()}
                >
                  Undo {undoable.what}
                </Button>
              </span>
            </Tooltip>
          )}
          <Mono sx={{ fontSize: 12, color: 'text.secondary' }}>{timeZone}</Mono>
        </Stack>

        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}
        {loading && !board && <Box sx={{ p: 2 }}><ListSkeleton rows={6} /></Box>}
        {(loading || busy) && board && <LinearProgress />}
        {busy && (
          <Alert severity="info" variant="outlined" sx={{ m: 2, mb: 0 }}>
            {drag?.committing && drag.cascadeSize != null
              ? `Moving ${(drag.unitSize ?? 0) + drag.cascadeSize + (drag.yieldSize ?? 0)} bars — `
                + 'the unit, what follows it, and what steps aside. This can take a moment.'
              : 'Writing the plan…'}
          </Alert>
        )}

        {board && !loading && lanes.length === 0 && (
          <EmptyState
            title="No machines set up"
            hint="Add resource types before planning against them."
          />
        )}
        {board && !loading && lanes.length > 0 && totals.planned === 0 && (
          <Alert severity="info" variant="outlined" sx={{ m: 2, mb: 0 }}>
            Nothing is planned in this window. The machines below are drawn empty — that is the room available.
          </Alert>
        )}

        {board && lanes.length > 0 && laneGrouping && (
          <Box sx={{ position: 'relative' }}>
            {/* ── time axis ──────────────────────────────────────────────── */}
            <Box sx={{ display: 'flex', borderBottom: 1, borderColor: 'divider' }}>
              <Box sx={{ width: GUTTER_PX, flexShrink: 0 }} />
              <Box sx={{ position: 'relative', flex: 1, height: 26 }}>
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

            {/* ── gutter + canvas ────────────────────────────────────────── */}
            <Box sx={{ display: 'flex' }}>
              <Box sx={{ width: GUTTER_PX, flexShrink: 0, borderRight: 1, borderColor: 'divider' }}>
                {rows.map((row, i) => {
                  if (row.kind === 'gap') return <Box key={i} sx={{ height: row.h }} />;
                  if (row.kind === 'rail') {
                    const g = laneGrouping.groups[row.groupIdx];
                    const c = colors[row.groupIdx];
                    const isSel = selectedIdx === row.groupIdx;
                    return (
                      <Box
                        key={i}
                        onClick={() => setSelected(isSel ? null : g.key)}
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
                        <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: c.fill, flexShrink: 0 }} />
                        <Tooltip title={g.sublabel ? `${g.label} · ${g.sublabel}` : g.label}>
                          <Typography
                            variant="caption"
                            noWrap
                            sx={{ fontWeight: isSel ? 600 : 400, flex: 1, minWidth: 0 }}
                          >
                            {g.shortLabel}
                          </Typography>
                        </Tooltip>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10 }}>
                          {fmtWorkMs(g.workMs)}
                        </Typography>
                      </Box>
                    );
                  }
                  const lane = lanes[row.laneIdx];
                  const load = laneLoad[row.laneIdx];
                  const pct = load.capacity && load.capacity > 0
                    ? Math.round((load.planned / load.capacity) * 100)
                    : null;
                  return (
                    <Box
                      key={i}
                      sx={{
                        height: row.h,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        px: 1,
                        borderTop: 1,
                        borderColor: 'divider',
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="caption" noWrap sx={{ display: 'block', fontWeight: 500 }}>
                          {lane.name}
                        </Typography>
                        {row.h >= 34 && (
                          <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>
                            {lane.totalUnits} unit{lane.totalUnits === 1 ? '' : 's'}
                            {lane.unbounded ? ' · no calendar' : ''}
                          </Typography>
                        )}
                      </Box>
                      {pct != null && (
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: 10,
                            fontVariantNumeric: 'tabular-nums',
                            color: pct > 100 ? 'warning.main' : 'text.secondary',
                          }}
                        >
                          {pct}%
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Box>

              <Box
                id={TRACK_ID}
                sx={{ flex: 1, minWidth: 0, userSelect: drag ? 'none' : 'auto' }}
              >
                <BoardCanvas
                  lanes={lanes}
                  grouping={laneGrouping}
                  colors={colors}
                  entryStartRel={entryStartRel}
                  preview={preview}
                  onGrab={canManage ? onGrab : undefined}
                  groupBlocks={groupBlocks}
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
                    if (!hit || hit.groupIdx < 0 || !grouping) { setSelected(null); return; }
                    const key = grouping.groups[hit.groupIdx].key;
                    setSelected((cur) => (cur === key ? null : key));
                  }}
                  onWidth={setTrackPx}
                  blockLabel={blockLabel}
                />
              </Box>
            </Box>

            {/* ── hover card ─────────────────────────────────────────────── */}
            {hoverCard && !drag && (
              <Paper
                elevation={6}
                sx={{
                  position: 'absolute',
                  left: Math.min(GUTTER_PX + (hover?.x ?? 0) + 14, GUTTER_PX + trackPx - 250),
                  top: (hover?.y ?? 0) + 34,
                  width: 240,
                  p: 1.25,
                  pointerEvents: 'none',
                  zIndex: 5,
                  borderLeft: 3,
                  borderColor: colors[hoverCard.colorIdx]?.fill ?? 'divider',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{hoverCard.title}</Typography>
                {hoverCard.lines.map((l, i) => (
                  <Typography key={i} variant="caption" sx={{ display: 'block', color: 'text.secondary' }} noWrap>
                    {l}
                  </Typography>
                ))}
              </Paper>
            )}
            {dragReadout && (
              <Paper
                elevation={8}
                sx={{
                  position: 'absolute',
                  left: GUTTER_PX + 12,
                  top: 4,
                  px: 1.5,
                  py: 0.75,
                  zIndex: 6,
                  pointerEvents: 'none',
                  borderLeft: 3,
                  borderColor: dragReadout.refused ? 'error.main' : 'primary.main',
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="baseline">
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {dragReadout.unit} · {dragReadout.label}
                  </Typography>
                  <Mono sx={{ fontSize: 12, color: 'text.secondary' }}>{dragReadout.when}</Mono>
                </Stack>
                {dragReadout.scope && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                    {dragReadout.scope}
                  </Typography>
                )}
                {dragReadout.refused && (
                  <Typography variant="caption" sx={{ color: 'error.main', display: 'block' }}>
                    {dragReadout.refused}
                  </Typography>
                )}
              </Paper>
            )}
          </Box>
        )}
      </Surface>

      {canManage && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Drag a unit&rsquo;s handle to move it, or its ends to stretch it — hold Alt to ignore the
          snap. Once a unit is selected its bars can be dragged in the lanes too. <b>Push left</b> (L)
          slides it as far left as its bars will fit around everything else. Every gesture moves the
          <b> whole</b> unit, including the bars outside this window; what depends on it follows, and
          unrelated work steps aside where the move fills a machine. The counts are shown as you drag.
        </Typography>
      )}

      {grouping && grouping.groups.length > LEGIBLE_UNIT_LIMIT && (
        <Alert severity="info" variant="outlined">
          {grouping.groups.length} {GROUP_LEVEL_LABEL[level].toLowerCase()}s in this window — more than one
          board can give a handle each, or a colour each.
          {grouping.shaded && ' Hue is now the containing unit and shade is the individual one, so a run of one colour is one unit’s work.'}
          {' '}Click a block to pull its handle up, or group one level coarser.
        </Alert>
      )}
    </Box>
  );
}
