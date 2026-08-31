/**
 * BoardCanvas.tsx — the plan, drawn. And, since 2026-08-31, the actuals too.
 *
 * TWO BOARDS, ONE RENDERER
 * ------------------------
 * The Actuals Board asks the same question backwards — not "where is the room
 * next month" but "what did the shop do last month" — and everything hard here
 * is the same either way: the density switch, the hit-test bisection, the DPR
 * handling, the two ways of measuring width. So it draws through this component
 * rather than through a copy of it, and the differences arrive as OPTIONAL props
 * (`blockStatus`, `statusStyle`, `spines`) that default to exactly the previous
 * behaviour. Nothing about the Plan Board changes because the second board
 * exists.
 *
 * The alternative — a second canvas — was rejected on this codebase's own
 * evidence: three places once reconstructed a bundle's member times and a bug
 * lived in the gap between them. Two renderers would be that shape again.
 *
 * WHY A CANVAS
 * ------------
 * The Planner grid puts one absolutely-positioned element on screen per BAR
 * over one to seven days, which is the right tool for that job. This view asks
 * a different question — where are the gaps, across five weeks, for every
 * machine at once — and a real bridge order is several thousand operations.
 * At that count the DOM is not slow, it is unusable: layout alone takes longer
 * than the frame, and the browser is doing text and event plumbing for shapes
 * two pixels wide that will never be clicked individually.
 *
 * WHAT IS DRAWN, AND WHY IT STAYS DRAWN AT EVERY ZOOM
 * --------------------------------------------------
 * Every operation is a block at every zoom. Nothing is rolled up into a
 * summary bar, because the summary is exactly what hides the answer: two
 * girders that each "occupy" the same fortnight may interleave perfectly or
 * collide completely, and only the individual blocks say which. What changes
 * with zoom is HOW a block is drawn:
 *
 *   ≤ ~20 min per pixel   rectangles, each block its own shape, edges where
 *                         they fit and labels where they fit.
 *   > ~20 min per pixel   density columns. Each pixel column accumulates the
 *                         work that falls inside it and is drawn at a HEIGHT
 *                         proportional to how full it is, in the colour of
 *                         whichever unit owns most of it. A half-used hour
 *                         becomes a half-height column, which is the thing the
 *                         planner is actually looking for: not "is there work
 *                         here" but "how much room is left here".
 *
 * The switch is on measured pixels, not on the zoom's name, so a wide monitor
 * gets rectangles for longer than a laptop does and neither has to be told.
 *
 * COLOUR IS THE GROUPING
 * ----------------------
 * Every unit at the chosen level of the BOM ladder gets its own hue. That is
 * what makes a five-week row legible: girder 1's blocks are one colour, girder
 * 2's another, and the white between them is the room to push into.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';

import {
  BLOCK_STRIDE, BLOCK_START, BLOCK_DUR, BLOCK_ITEM, BLOCK_TASK, BLOCK_ENTRY,
  type BoardLane,
} from '../../api/planner';
import type { BoardGrouping, ColorSet } from './boardModel';

/** A row of the board. Rail rows are group handles; lane rows are machines. */
export type BoardRow =
  | { kind: 'rail'; groupIdx: number; h: number }
  | { kind: 'lane'; laneIdx: number; h: number }
  | { kind: 'gap'; h: number };

export interface BlockHit {
  laneIdx: number;
  blockIdx: number;
  itemId: number;
  taskId: number;
  entryId: number;
  groupIdx: number;
  startRel: number;
  durMs: number;
  /** Pixel centre of the block, for anchoring a tooltip. */
  x: number;
  y: number;
}

/**
 * Where on a handle the pointer went down, and therefore what the drag means.
 *
 * The edges are what make "fix the start and stretch" a gesture rather than a
 * dialogue box — you grab the end that should move and the other one stays.
 */
export type GrabZone = 'body' | 'startEdge' | 'endEdge';

export interface GrabInfo {
  groupIdx: number;
  zone: GrabZone;
  /** Where in the window the pointer went down, in ms from the window start. */
  atRel: number;
  /** The group's envelope at the moment of the grab. */
  startRel: number;
  endRel: number;
}

/**
 * A move or stretch being dragged right now, applied at draw time only.
 *
 * Previewed on the client rather than round-tripped: a drag is sixty frames a
 * second and the answer to "where would this land" is arithmetic. Whether the
 * landing is LEGAL is a different question, and that one does go to the server
 * — debounced, while the drag is still in the air.
 */
export interface PreviewTransform {
  groupIdx: number;
  /** move: shift every bar by this. */
  deltaMs: number;
  /** stretch: scale offsets from anchorRel; durations are untouched. */
  scale: number;
  anchorRel: number;
  /** The server has refused this placement — draw it as refused. */
  refused: boolean;
}

export interface BoardCanvasProps {
  lanes: BoardLane[];
  grouping: BoardGrouping;
  /** One entry per group, same indexing as grouping.groups. */
  colors: ColorSet[];
  /**
   * Per group, its blocks merged across lanes, sorted:
   * [startRel, durMs, entryStartRel] × n.
   *
   * The third number is what makes a stretch previewable. A stretch scales the
   * offsets of BARS and leaves each bar's own length alone — so a block has to
   * know which bar it belongs to, or previewing the gesture would stretch the
   * work itself, which is the one thing stretching must never do.
   */
  groupBlocks: Float64Array[];
  /** Bar id → the bar's start, relative ms. Same reason as above. */
  entryStartRel: Map<number, number>;
  preview: PreviewTransform | null;
  /** True once a group is selected: its bars become draggable in the lanes too. */
  onGrab?: (grab: GrabInfo) => void;
  /**
   * What the server says this drag does to everything ELSE, entryId → its own
   * shift and why it moved.
   *
   * The counts were already on screen; where the work went was not. This is the
   * same answer the dry run has always returned and the board has always thrown
   * away.
   */
  ripple?: Map<number, { deltaMs: number; why: string }> | null;
  rows: BoardRow[];
  windowMs: number;
  /** Milliseconds from the window start to now; null if now is outside it. */
  nowRel: number | null;
  /** Relative ms of each gridline. */
  gridRel: number[];
  /** Which of those gridlines are major (week starts, or 6-hourly). */
  gridMajor: boolean[];
  selectedGroup: number | null;
  hoverGroup: number | null;
  dark: boolean;
  onHover: (hit: BlockHit | null) => void;
  onPick: (hit: BlockHit | null) => void;
  onWidth?: (px: number) => void;
  /**
   * What to write inside a block wide enough to hold writing. Called only at
   * the zoom where that is true, so it can be as expensive as a map lookup.
   */
  blockLabel?: (entryId: number, itemId: number, laneIdx: number, blockIdx: number) => string;
  /**
   * What each block IS, one small code per block, indexed like `lanes`.
   *
   * Only the Actuals Board supplies this; on the plan every bar is an intention
   * and there is nothing to distinguish. When it is absent every block draws
   * solid, exactly as before, so this feature existing costs the Plan Board
   * nothing.
   *
   * COLOUR IS ALREADY SPOKEN FOR. A unit's hue comes off a golden-angle wheel,
   * so at any moment one unit is about to be red — the same reason a refused
   * drag is ghosted rather than recoloured. Status therefore changes the FILL
   * TREATMENT and never the hue: solid, hatched, outlined, or ruled.
   */
  blockStatus?: (ArrayLike<number> | undefined)[];
  /**
   * How each status code is drawn. Absent codes draw solid.
   *
   * Passed in rather than hard-coded so the canvas keeps knowing about geometry
   * and nothing about what a shop calls a paused task.
   */
  statusStyle?: Record<number, BlockStyle>;
  /**
   * The reach of a unit, drawn faintly behind its blocks.
   *
   * What makes "one bar per girder" survive being split into the stretches it
   * was actually worked in: the spine says where the unit began and ended, the
   * blocks on top say when anybody touched it, and the space between the two is
   * the idle — which is the thing this board exists to show.
   */
  spines?: BoardSpine[];
}

/** How a block with a given status code is painted. */
export type BlockStyle = 'solid' | 'hatched' | 'outlined' | 'live' | 'ruled';

export interface BoardSpine {
  laneIdx: number;
  startRel: number;
  endRel: number;
  groupIdx: number;
}

/** Trim to fit, with an ellipsis, using the context's current font. */
function ellipsise(ctx: CanvasRenderingContext2D, text: string, maxPx: number): string {
  if (maxPx <= 0) return '';
  if (ctx.measureText(text).width <= maxPx) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxPx) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${text.slice(0, lo)}…` : '';
}

/** How close to a capsule's end counts as grabbing that end rather than the bar. */
const EDGE_PX = 7;

/**
 * The width of a capsule's end grip.
 *
 * Used by BOTH the drawing and the hit test, deliberately. When the grab zone
 * was an invisible region near the end, the gesture was unguessable: a planner
 * pressing anywhere on the capsule got a move, pressing seven pixels further
 * left got a stretch, and nothing on screen said which was which or that the
 * second existed at all. Drawing the same number that decides the hit makes the
 * affordance honest — the grip you can see is exactly the grip you can grab.
 *
 * Clamped to a third of the capsule so a short unit is still mostly body: a
 * two-hour girder at month zoom must not be nothing but handles.
 */
function gripWidth(x0: number, x1: number): number {
  return Math.min(EDGE_PX, Math.max(2, (x1 - x0) / 3));
}

/** Below this width, a label is an ellipsis and nothing else. */
const LABEL_MIN_PX = 52;
/** Below this row height, a label crowds the block out of its own row. */
const LABEL_MIN_ROW = 30;

/** Above this, blocks are too narrow to be shapes and become density columns. */
const DENSITY_THRESHOLD_MS_PER_PX = 20 * 60 * 1000;

interface Palette {
  laneBase: string;
  unmanned: string;
  mannedTop: string;
  grid: string;
  gridMajor: string;
  now: string;
  railTrack: string;
  ungrouped: string;
  separator: string;
  /** A placement the server has already said no to, while it is still in hand. */
  refused: string;
  /** Work that had to follow the unit, because it depends on it. */
  rippleCascade: string;
  /** Work that stepped aside, because the unit filled its machine. */
  rippleYield: string;
  /** Text drawn ON a block — the block's fill is the ground, not the page. */
  onBlock: string;
  text: string;
  /** A finish that came after the plan said it would. */
  late: string;
  /** The reach of a unit, behind its work. */
  spine: string;
}

function palette(dark: boolean): Palette {
  return dark
    ? {
      laneBase: '#0E1019',
      unmanned: '#080A10',
      mannedTop: '#1B1E2E',
      grid: 'rgba(255,255,255,.05)',
      gridMajor: 'rgba(255,255,255,.14)',
      now: '#22D3EE',
      railTrack: 'rgba(255,255,255,.06)',
      ungrouped: '#3A3F55',
      separator: 'rgba(8,10,16,.55)',
      refused: '#B4344F',
      rippleCascade: '#38BDF8',
      rippleYield: '#F59E0B',
      onBlock: 'rgba(10,12,20,.88)',
      text: 'rgba(255,255,255,.86)',
      late: '#F43F5E',
      spine: 'rgba(255,255,255,.13)',
    }
    : {
      laneBase: '#FFFFFF',
      unmanned: '#EDEEF5',
      mannedTop: '#FFFFFF',
      grid: 'rgba(26,28,46,.06)',
      gridMajor: 'rgba(26,28,46,.16)',
      now: '#0891B2',
      railTrack: 'rgba(26,28,46,.05)',
      ungrouped: '#C3C7D6',
      separator: 'rgba(255,255,255,.7)',
      refused: '#E11D48',
      rippleCascade: '#0284C7',
      rippleYield: '#B45309',
      onBlock: 'rgba(255,255,255,.96)',
      text: 'rgba(26,28,46,.9)',
      late: '#BE123C',
      spine: 'rgba(26,28,46,.12)',
    };
}

export function BoardCanvas(props: BoardCanvasProps) {
  const {
    lanes, grouping, colors, groupBlocks, entryStartRel, rows, windowMs, nowRel,
    gridRel, gridMajor, selectedGroup, hoverGroup, dark, onHover, onPick, onWidth,
    blockLabel, preview, onGrab, ripple, blockStatus, statusStyle, spines,
  } = props;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hoverZone, setHoverZone] = useState<GrabZone | null>(null);
  const [dragZone, setDragZone] = useState<GrabZone | null>(null);
  const dragging = preview != null;
  /** Whether this board may be edited at all — the grips only exist if it can. */
  const canGrab = !!onGrab;

  const totalH = rows.reduce((n, r) => n + r.h, 0);

  /**
   * Measured two ways, and both are needed.
   *
   * The ResizeObserver catches the container changing under a canvas that has
   * no reason to re-render — a window drag, a panel opening. But it delivers on
   * the rendering lifecycle, so a tab that is not compositing never hears from
   * it, and a canvas whose only size source is the observer stays 300×150 for
   * ever. The layout-effect measure runs on every render regardless, which
   * makes the first paint independent of when the observer wakes up.
   */
  const measure = useCallback((w: number) => {
    setWidth((cur) => (cur === w ? cur : w));
    onWidth?.(w);
  }, [onWidth]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (el) measure(Math.max(0, Math.round(el.getBoundingClientRect().width)));
  });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((es) => {
      measure(Math.max(0, Math.round(es[0].contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // ── draw ───────────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || totalH <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(totalH * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${totalH}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, totalH);

    const pal = palette(dark);
    const pxPerMs = width / Math.max(1, windowMs);
    const msPerPx = Math.max(1, windowMs) / Math.max(1, width);
    const dense = msPerPx > DENSITY_THRESHOLD_MS_PER_PX;
    const anySelection = selectedGroup != null;

    const colorOf = (g: number) => colors[g];

    /**
     * Where a block lands under the drag in flight.
     *
     * A move shifts the block. A stretch moves the block's BAR and carries the
     * block along at its own offset inside it — the bar spreads, the work does
     * not get slower. Blocks outside the dragged group are untouched.
     */
    const shiftOf = (g: number, entryStart: number, entryId?: number) => {
      if (preview && g === preview.groupIdx) {
        // The dragged unit follows the MOUSE, not the server.
        //
        // Deliberately ahead of the ripple: the validity check answers a beat
        // after the hand stops, and letting its answer win here would freeze the
        // unit at the last checked position while the cursor kept going. What
        // the unit will really do when it cannot land on the drop is said in
        // words instead — see the drag caption's "will wait for a gap".
        if (preview.scale === 1) return preview.deltaMs;
        const moved = preview.anchorRel + (entryStart - preview.anchorRel) * preview.scale;
        return moved - entryStart;
      }
      // Everything else moves by exactly what the server worked out for it.
      const r = entryId == null ? undefined : ripple?.get(entryId);
      return r ? r.deltaMs : 0;
    };

    // 1. Row substrate: what is manned, and what is not.
    let y = 0;
    for (const row of rows) {
      if (row.kind === 'lane') {
        const lane = lanes[row.laneIdx];
        if (lane.unbounded) {
          // No shift calendar. The engine plans this machine 24/7, so shading
          // it unmanned would have the board and the engine asserting opposite
          // things about the same lane.
          ctx.fillStyle = pal.laneBase;
          ctx.fillRect(0, y, width, row.h);
        } else {
          ctx.fillStyle = pal.unmanned;
          ctx.fillRect(0, y, width, row.h);
          const total = Math.max(1, lane.totalUnits);
          for (let i = 0; i + 2 < lane.coverage.length; i += 3) {
            const x0 = lane.coverage[i] * pxPerMs;
            const x1 = lane.coverage[i + 1] * pxPerMs;
            if (x1 <= 0 || x0 >= width) continue;
            // Alpha is the fraction of the lane's machines actually crewed —
            // a half-manned stretch reads as half-open, which is what it is.
            ctx.globalAlpha = Math.min(1, Math.max(0.28, lane.coverage[i + 2] / total));
            ctx.fillStyle = pal.mannedTop;
            ctx.fillRect(Math.max(0, x0), y, Math.min(width, x1) - Math.max(0, x0), row.h);
            ctx.globalAlpha = 1;
          }
        }
      } else if (row.kind === 'rail') {
        ctx.fillStyle = pal.railTrack;
        ctx.fillRect(0, y + row.h - 2, width, 1);
      }
      y += row.h;
    }

    // 2. Gridlines, over the substrate and under the work.
    for (let i = 0; i < gridRel.length; i += 1) {
      const x = Math.round(gridRel[i] * pxPerMs) + 0.5;
      if (x < 0 || x > width) continue;
      ctx.strokeStyle = gridMajor[i] ? pal.gridMajor : pal.grid;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, totalH);
      ctx.stroke();
    }

    // 3. Spines: the reach of a unit, under its work.
    if (spines && spines.length > 0) {
      const topOf = new Map<number, { y: number; h: number }>();
      let sy = 0;
      for (const row of rows) {
        if (row.kind === 'lane') topOf.set(row.laneIdx, { y: sy, h: row.h });
        sy += row.h;
      }
      /**
       * A thin CONNECTOR in the unit's own hue, not a full-height grey fill.
       *
       * The grey version was the first attempt and it lost: a lane is already
       * banded light and dark by the shift coverage underneath, so a faint
       * full-height rectangle on top of that is indistinguishable from the
       * calendar. Colour and thinness both do work here — the hue says WHOSE
       * reach this is, and a line between the blocks reads as "the same girder,
       * still open" rather than as more shading.
       */
      for (const sp of spines) {
        const at = topOf.get(sp.laneIdx);
        if (!at) continue;
        const x0 = sp.startRel * pxPerMs;
        const w = Math.max(1, sp.endRel * pxPerMs - x0);
        if (x0 + w <= 0 || x0 >= width) continue;
        const c = sp.groupIdx >= 0 ? colorOf(sp.groupIdx) : null;
        const dim = anySelection && sp.groupIdx !== selectedGroup;
        const th = Math.max(2, Math.min(4, at.h / 8));
        ctx.fillStyle = c ? (dim ? c.dim : c.rail) : pal.spine;
        ctx.globalAlpha = dim ? 0.3 : 0.55;
        ctx.fillRect(x0, at.y + (at.h - th) / 2, w, th);
        // End caps, so the reach has two ends rather than fading out.
        ctx.globalAlpha = dim ? 0.4 : 0.8;
        const capH = Math.max(4, at.h * 0.4);
        for (const cx of [x0, x0 + w - 1.5]) {
          ctx.fillRect(cx, at.y + (at.h - capH) / 2, 1.5, capH);
        }
        ctx.globalAlpha = 1;
      }
    }

    // 4. The work.
    const cols = dense ? new Float32Array(width) : null;
    const domG = dense ? new Int32Array(width) : null;
    const domW = dense ? new Float32Array(width) : null;
    /**
     * Density columns carry work that is still MOVING separately.
     *
     * At month zoom a block is thinner than a pixel and a fill treatment is
     * invisible, so status has to change the column's shape instead: the done
     * portion is drawn from the baseline and whatever is still running is
     * stacked on top of it, lighter. Without this the live edge — the only part
     * of a retrospective that is not history — disappears at exactly the zoom
     * where somebody is looking for it.
     */
    const live = dense ? new Float32Array(width) : null;

    const drawSpans = (
      read: (i: number) => { s: number; d: number; g: number; st?: number },
      count: number,
      top: number,
      h: number,
      inset: number,
      labelAt?: (i: number) => string,
    ) => {
      if (count === 0) return;
      if (dense && cols && domG && domW && live) {
        cols.fill(0);
        domG.fill(-1);
        domW.fill(0);
        live.fill(0);
        for (let i = 0; i < count; i += 1) {
          const { s, d, g, st } = read(i);
          const x0 = s * pxPerMs;
          const x1 = (s + d) * pxPerMs;
          if (x1 <= 0 || x0 >= width) continue;
          const moving = st != null && statusStyle?.[st] === 'live';
          const c0 = Math.max(0, Math.floor(x0));
          const c1 = Math.min(width - 1, Math.floor(x1));
          for (let c = c0; c <= c1; c += 1) {
            // How much of this one-pixel column the block actually fills. A
            // block narrower than a pixel contributes a fraction, which is why
            // a column of short operations is shorter than a column of a long
            // one — the height IS the load.
            const covered = Math.min(c + 1, x1) - Math.max(c, x0);
            if (covered <= 0) continue;
            cols[c] += covered;
            if (moving) live[c] += covered;
            if (covered > domW[c]) { domW[c] = covered; domG[c] = g; }
          }
        }
        for (let c = 0; c < width; c += 1) {
          const fill = cols[c];
          if (fill <= 0) continue;
          const g = domG[c];
          const grp = g >= 0 ? colorOf(g) : null;
          const dim = anySelection && g !== selectedGroup;
          const bad = preview?.refused && g === preview.groupIdx;
          ctx.globalAlpha = bad ? 0.34 : 1;
          ctx.fillStyle = grp ? (dim ? grp.dim : grp.fill) : pal.ungrouped;
          const room = h - inset * 2;
          const bh = Math.max(2, Math.min(1, fill) * room);
          ctx.fillRect(c, top + inset + (room - bh), 1, bh);
          // The running share, stacked on top in the unit's own lighter edge
          // colour. Same hue — this is a state, not a different girder.
          const lh = Math.min(bh, Math.min(1, live[c]) * room);
          if (lh > 0 && grp) {
            ctx.fillStyle = dim ? grp.dim : grp.edge;
            ctx.fillRect(c, top + inset + (room - bh), 1, Math.max(1, lh));
          }
          ctx.globalAlpha = 1;
        }
        return;
      }
      for (let i = 0; i < count; i += 1) {
        const { s, d, g, st } = read(i);
        const x0 = s * pxPerMs;
        const w = Math.max(1.25, d * pxPerMs);
        if (x0 + w <= 0 || x0 >= width) continue;
        const grp = g >= 0 ? colorOf(g) : null;
        const dim = anySelection && g !== selectedGroup;
        // A refused placement is GHOSTED, not recoloured — see the note above
        // drawRefusedMark. It keeps its own hue and loses its solidity.
        const bad = preview?.refused && g === preview.groupIdx;
        ctx.globalAlpha = bad ? 0.34 : 1;
        const ink = grp ? (dim ? grp.dim : grp.fill) : pal.ungrouped;
        const bh = h - inset * 2;
        const style: BlockStyle = (st != null && statusStyle?.[st]) || 'solid';

        if (style === 'outlined') {
          // Rework: the hue says whose, the hollowness says "this is here
          // because something failed". Filling it would let a month of repairs
          // read as a month of production.
          ctx.strokeStyle = grp ? (dim ? grp.dim : grp.edge) : pal.ungrouped;
          ctx.lineWidth = 1;
          ctx.strokeRect(x0 + 0.5, top + inset + 0.5, Math.max(1, w - 1), Math.max(1, bh - 1));
        } else {
          ctx.fillStyle = ink;
          // Hatched work is drawn faint and then scored, so a paused bar reads
          // as interrupted rather than as a different unit.
          ctx.globalAlpha = (bad ? 0.34 : 1) * (style === 'hatched' ? 0.5 : 1);
          ctx.fillRect(x0, top + inset, w, bh);
          ctx.globalAlpha = bad ? 0.34 : 1;
          if (style === 'hatched' && w >= 4) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x0, top + inset, w, bh);
            ctx.clip();
            ctx.strokeStyle = grp ? (dim ? grp.dim : grp.edge) : pal.ungrouped;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let hx = x0 - bh; hx < x0 + w; hx += 4) {
              ctx.moveTo(hx, top + inset + bh);
              ctx.lineTo(hx + bh, top + inset);
            }
            ctx.stroke();
            ctx.restore();
          }
          if (style === 'live') {
            /**
             * The leading edge of work that has not stopped, in the SAME ink as
             * the now line.
             *
             * On the right, because that is where it is still growing. And in
             * `pal.now` rather than in the unit's own edge colour, which was the
             * first attempt and was invisible: a 2px darker shade of the fill
             * made a running operation look exactly like a finished one, which
             * is the single worst thing this board could get wrong.
             *
             * Borrowing the now line's cyan is safe by construction — `hueFor`
             * steps OVER 188°–212° precisely so no unit is ever that colour, so
             * this cap can never be mistaken for somebody's girder.
             */
            const cap = Math.min(3, w);
            ctx.fillStyle = pal.now;
            ctx.globalAlpha = (bad ? 0.34 : 1) * (dim ? 0.4 : 1);
            ctx.fillRect(x0 + w - cap, top + inset, cap, bh);
            ctx.globalAlpha = bad ? 0.34 : 1;
          }
          if (style === 'ruled') {
            // Finished, but after the plan said it would be. A rule along the
            // bottom rather than a colour: the unit's hue is already meaning
            // something else.
            ctx.fillStyle = pal.late;
            ctx.fillRect(x0, top + inset + bh - 2, w, 2);
          }
        }
        ctx.globalAlpha = 1;
        // A separator only where there is room for one, and drawn in the
        // GROUND rather than in a darker version of the block. A dark edge on
        // every block turns a row of forty operations into a barcode, which
        // reads as texture instead of as forty things.
        // …but never over a status mark that lives on the same edge: the
        // separator is painted in the GROUND colour, so drawn last it would rub
        // out the right-hand third of the live cap it was meant to sit beside.
        if (w >= 5 && style !== 'outlined' && style !== 'live') {
          ctx.fillStyle = pal.separator;
          ctx.fillRect(x0 + w - 1, top + inset, 1, h - inset * 2);
        }
        // The name, where the block is big enough to be read rather than
        // counted. Clipped to its own block: a label that spills onto the next
        // one is worse than no label, because it looks like it belongs there.
        if (labelAt && !dim && w >= LABEL_MIN_PX && h >= LABEL_MIN_ROW) {
          const text = labelAt(i);
          if (text) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x0 + 4, top + inset, w - 8, h - inset * 2);
            ctx.clip();
            ctx.fillStyle = pal.onBlock;
            ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
            ctx.textBaseline = 'middle';
            // Ellipsised rather than clipped. A clip cuts mid-glyph and reads
            // as a rendering fault; an ellipsis reads as "there is more".
            ctx.fillText(ellipsise(ctx, text, w - 12), x0 + 6, top + h / 2);
            ctx.restore();
          }
        }
      }
    };

    y = 0;
    for (const row of rows) {
      if (row.kind === 'lane') {
        const lane = lanes[row.laneIdx];
        const gi = grouping.laneGroupIdx[row.laneIdx];
        const blocks = lane.blocks;
        const sts = blockStatus?.[row.laneIdx];
        drawSpans(
          (i) => {
            const g = gi ? gi[i] : -1;
            const entryStart = entryStartRel.get(blocks[i * BLOCK_STRIDE + BLOCK_ENTRY])
              ?? blocks[i * BLOCK_STRIDE + BLOCK_START];
            return {
              s: blocks[i * BLOCK_STRIDE + BLOCK_START]
                + shiftOf(g, entryStart, blocks[i * BLOCK_STRIDE + BLOCK_ENTRY]),
              d: blocks[i * BLOCK_STRIDE + BLOCK_DUR],
              g,
              st: sts ? sts[i] : undefined,
            };
          },
          lane.blockCount,
          y,
          row.h,
          row.h >= 40 ? 5 : 3,
          blockLabel
            ? (i) => blockLabel(
              blocks[i * BLOCK_STRIDE + BLOCK_ENTRY],
              blocks[i * BLOCK_STRIDE + BLOCK_ITEM],
              row.laneIdx,
              i,
            )
            : undefined,
        );

        /**
         * Where the disturbed work used to be.
         *
         * A hollow outline at the old position of every bar this move pushes,
         * in the colour of WHY it moved — blue for work that had to follow the
         * unit, amber for work that merely stood where the unit landed. Seeing
         * the gap it left is what makes the ripple legible; the counts alone
         * never were.
         *
         * Drawn after the blocks so an outline is never buried under one, and
         * skipped at density zoom where a one-pixel outline would be noise.
         */
        if (ripple && ripple.size > 0 && !dense) {
          ctx.save();
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 2]);
          for (let i = 0; i < lane.blockCount; i += 1) {
            const o = i * BLOCK_STRIDE;
            const r = ripple.get(blocks[o + BLOCK_ENTRY]);
            if (!r || r.deltaMs === 0) continue;
            const x0 = blocks[o + BLOCK_START] * pxPerMs;
            const w = Math.max(1.5, blocks[o + BLOCK_DUR] * pxPerMs);
            if (x0 + w <= 0 || x0 >= width) continue;
            ctx.strokeStyle = r.why === 'yield' ? pal.rippleYield : pal.rippleCascade;
            ctx.globalAlpha = 0.85;
            const inset = row.h >= 40 ? 5 : 3;
            ctx.strokeRect(x0, y + inset, w, row.h - inset * 2);
          }
          ctx.restore();
        }
      } else if (row.kind === 'rail') {
        const g = row.groupIdx;
        const grp = grouping.groups[g];
        const spans = groupBlocks[g];
        const c = colorOf(g);
        const dim = anySelection && g !== selectedGroup;
        // The envelope first — start to end INCLUDING the holes, so the handle
        // shows the reach of the unit and the blocks inside it show the holes.
        // Under a drag the envelope is derived from the moved bars, not from the
        // stored one — a stretch changes where the unit ends, and a handle that
        // does not follow the gesture is a handle nobody trusts.
        let envStart = grp?.startRel ?? -1;
        let envEnd = grp?.endRel ?? -1;
        if (spans && preview && g === preview.groupIdx && spans.length >= 3) {
          envStart = Infinity;
          envEnd = -Infinity;
          for (let i = 0; i < spans.length; i += 3) {
            const sh = shiftOf(g, spans[i + 2]);
            envStart = Math.min(envStart, spans[i] + sh);
            envEnd = Math.max(envEnd, spans[i] + spans[i + 1] + sh);
          }
        }
        if (grp && envStart >= 0 && envEnd > envStart) {
          const x0 = envStart * pxPerMs;
          const w = Math.max(3, envEnd * pxPerMs - x0);
          const active = g === selectedGroup || g === hoverGroup;
          // Filled AND outlined, always. A translucent fill on its own reads as
          // a highlight painted on the background; the outline is what makes it
          // an object with two ends — which is what will be grabbed.
          const r = Math.min(4, (row.h - 4) / 2);
          ctx.beginPath();
          ctx.roundRect(x0, y + 1, w, row.h - 4, r);
          ctx.globalAlpha = dim ? 0.14 : 0.26;
          ctx.fillStyle = c.rail;
          ctx.fill();
          /**
           * The handle's outline carries the verdict.
           *
           * Dashed and in the refusal colour when the server has said no — a
           * dash reads as "not real yet" at any size and survives being the
           * same hue as the unit, which recolouring the blocks does not.
           */
          const refusedHere = !!preview?.refused && g === preview.groupIdx;
          ctx.globalAlpha = dim ? 0.35 : (active ? 1 : 0.7);
          ctx.strokeStyle = refusedHere ? pal.refused : c.edge;
          ctx.lineWidth = refusedHere ? 2 : (active ? 1.5 : 1);
          if (refusedHere) ctx.setLineDash([4, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          ctx.lineWidth = 1;

          /**
           * The two stretch grips.
           *
           * Only on the unit under the cursor or the selected one. Every unit
           * wearing handles at once turns the rail into a row of brackets and
           * makes the one you are actually pointing at harder to find, not
           * easier — the affordance has to appear where the hand already is.
           *
           * Solid, in the unit's own edge colour, so they read as part of the
           * capsule rather than decoration on top of it, with a notch down the
           * middle: two ends and something to pull is the whole vocabulary of
           * "this can be made longer".
           */
          if (canGrab && active && !dim) {
            const gw = gripWidth(x0, x0 + w);
            const gy = y + 1;
            const gh = row.h - 4;
            ctx.fillStyle = c.edge;
            ctx.globalAlpha = 0.95;
            for (const gx of [x0, x0 + w - gw]) {
              ctx.beginPath();
              ctx.roundRect(gx, gy, gw, gh, r);
              ctx.fill();
            }
            // The notch. Skipped on a capsule too narrow to show one, where it
            // would just thicken the grip into a smudge.
            if (gw >= 5) {
              ctx.strokeStyle = pal.railTrack;
              ctx.globalAlpha = 0.9;
              ctx.lineWidth = 1;
              for (const gx of [x0, x0 + w - gw]) {
                const mx = Math.round(gx + gw / 2) + 0.5;
                ctx.beginPath();
                ctx.moveTo(mx, gy + gh * 0.28);
                ctx.lineTo(mx, gy + gh * 0.72);
                ctx.stroke();
              }
            }
            ctx.globalAlpha = 1;
          }
        }
        if (spans) {
          drawSpans(
            (i) => ({
              s: spans[i * 3] + shiftOf(g, spans[i * 3 + 2]),
              d: spans[i * 3 + 1],
              g,
            }),
            spans.length / 3,
            y,
            row.h,
            3,
          );
        }
      }
      y += row.h;
    }

    // 5. Now.
    if (nowRel != null) {
      const x = Math.round(nowRel * pxPerMs) + 0.5;
      if (x >= 0 && x <= width) {
        ctx.strokeStyle = pal.now;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, totalH);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
  }, [
    lanes, grouping, groupBlocks, rows, windowMs, nowRel, gridRel, gridMajor,
    selectedGroup, hoverGroup, dark, width, totalH, blockLabel, colors,
    entryStartRel, preview, canGrab, ripple, blockStatus, statusStyle, spines,
  ]);

  // ── hit testing ────────────────────────────────────────────────────────────
  const hitAt = useCallback((clientX: number, clientY: number): BlockHit | null => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let top = 0;
    let target: BoardRow | null = null;
    for (const row of rows) {
      if (y >= top && y < top + row.h) { target = row; break; }
      top += row.h;
    }
    if (!target || target.kind !== 'lane') return null;

    const lane = lanes[target.laneIdx];
    const gi = grouping.laneGroupIdx[target.laneIdx];
    const pxPerMs = width / Math.max(1, windowMs);
    const at = (x / width) * windowMs;

    // Blocks arrive sorted by start, so find the neighbourhood by bisection and
    // then take the nearest within a few pixels — at five weeks a block is
    // often thinner than the cursor, and demanding a containment test would
    // make most of the board unclickable.
    let lo = 0;
    let hi = lane.blockCount - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lane.blocks[mid * BLOCK_STRIDE + BLOCK_START] <= at) lo = mid;
      else hi = mid - 1;
    }
    let best: number | null = null;
    let bestDist = Infinity;
    for (let i = Math.max(0, lo - 24); i < Math.min(lane.blockCount, lo + 24); i += 1) {
      const s = lane.blocks[i * BLOCK_STRIDE + BLOCK_START];
      const d = lane.blocks[i * BLOCK_STRIDE + BLOCK_DUR];
      const x0 = s * pxPerMs;
      const x1 = (s + d) * pxPerMs;
      const dist = x < x0 ? x0 - x : (x > x1 ? x - x1 : 0);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    if (best == null || bestDist > 4) return null;
    const o = best * BLOCK_STRIDE;
    return {
      laneIdx: target.laneIdx,
      blockIdx: best,
      itemId: lane.blocks[o + BLOCK_ITEM],
      taskId: lane.blocks[o + BLOCK_TASK],
      entryId: lane.blocks[o + BLOCK_ENTRY],
      groupIdx: gi ? gi[best] : -1,
      startRel: lane.blocks[o + BLOCK_START],
      durMs: lane.blocks[o + BLOCK_DUR],
      x: (lane.blocks[o + BLOCK_START] + lane.blocks[o + BLOCK_DUR] / 2) * pxPerMs,
      y: top + target.h / 2,
    };
  }, [lanes, grouping, rows, width, windowMs]);

  /** Rail rows answer to the group they represent, not to any one block. */
  const railGroupAt = useCallback((clientY: number): number | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const y = clientY - canvas.getBoundingClientRect().top;
    let top = 0;
    for (const row of rows) {
      if (y >= top && y < top + row.h) return row.kind === 'rail' ? row.groupIdx : null;
      top += row.h;
    }
    return null;
  }, [rows]);

  /**
   * What a press here would grab, if anything.
   *
   * A rail capsule is always grabbable — that is what it is for. A bar in a lane
   * is grabbable only once its unit is SELECTED, so that exploring the board by
   * clicking around cannot move fifty operations by accident. Selecting is one
   * click; the second gesture is the one that commits.
   */
  const zoneAt = useCallback((clientX: number, clientY: number): GrabInfo | null => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const pxPerMs = width / Math.max(1, windowMs);
    const atRel = (x / width) * windowMs;

    let top = 0;
    let target: BoardRow | null = null;
    for (const row of rows) {
      if (y >= top && y < top + row.h) { target = row; break; }
      top += row.h;
    }
    if (!target) return null;

    if (target.kind === 'rail') {
      const g = grouping.groups[target.groupIdx];
      if (!g || g.startRel < 0) return null;
      const x0 = g.startRel * pxPerMs;
      const x1 = g.endRel * pxPerMs;
      if (x < x0 - EDGE_PX || x > x1 + EDGE_PX) return null;
      // The same width that was drawn — see gripWidth.
      const edge = gripWidth(x0, x1);
      let zone: GrabZone = 'body';
      if (x <= x0 + edge) zone = 'startEdge';
      else if (x >= x1 - edge) zone = 'endEdge';
      return { groupIdx: target.groupIdx, zone, atRel, startRel: g.startRel, endRel: g.endRel };
    }

    if (selectedGroup == null) return null;
    const hit = hitAt(clientX, clientY);
    if (!hit || hit.groupIdx !== selectedGroup) return null;
    const g = grouping.groups[selectedGroup];
    if (!g || g.startRel < 0) return null;
    return { groupIdx: selectedGroup, zone: 'body', atRel, startRel: g.startRel, endRel: g.endRel };
  }, [rows, grouping, width, windowMs, selectedGroup, hitAt]);

  const cursor = dragging
    ? (dragZone === 'body' ? 'grabbing' : 'col-resize')
    : (hoverZone === 'body' ? 'grab' : (hoverZone ? 'col-resize' : 'crosshair'));

  return (
    <Box ref={wrapRef} sx={{ position: 'relative', width: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor }}
        onMouseDown={(e) => {
          if (e.button !== 0 || !onGrab) return;
          const grab = zoneAt(e.clientX, e.clientY);
          if (!grab) return;
          e.preventDefault();
          setDragZone(grab.zone);
          onGrab(grab);
        }}
        onMouseMove={(e) => {
          setHoverZone(dragging ? dragZone : (onGrab ? zoneAt(e.clientX, e.clientY)?.zone ?? null : null));
          const rail = railGroupAt(e.clientY);
          if (rail != null) {
            onHover({
              laneIdx: -1, blockIdx: -1, itemId: 0, taskId: 0, entryId: 0,
              groupIdx: rail, startRel: 0, durMs: 0,
              x: e.clientX - (canvasRef.current?.getBoundingClientRect().left ?? 0),
              y: e.clientY - (canvasRef.current?.getBoundingClientRect().top ?? 0),
            });
            return;
          }
          onHover(hitAt(e.clientX, e.clientY));
        }}
        onMouseLeave={() => { onHover(null); setHoverZone(null); }}
        onClick={(e) => {
          const rail = railGroupAt(e.clientY);
          if (rail != null) {
            onPick({
              laneIdx: -1, blockIdx: -1, itemId: 0, taskId: 0, entryId: 0,
              groupIdx: rail, startRel: 0, durMs: 0, x: 0, y: 0,
            });
            return;
          }
          onPick(hitAt(e.clientX, e.clientY));
        }}
      />
    </Box>
  );
}
