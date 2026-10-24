import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Box } from '@mui/material';
import type { ChartScene, Prim } from './orgChartLayout';
import { editKey, type CanvasEdit, type EditTarget } from './OrgChartEdit';

/**
 * The chart itself: inline SVG, drawn from the scene's draw list.
 *
 * Inline rather than an `<img>` because every box has to be a real focusable
 * control. DESIGN_SYSTEM.md §6.4 makes a keyboard path mandatory for a canvas
 * screen, and an org chart nobody can tab through is an org chart half the
 * client's office cannot read. Arrow keys walk the tree the way the tree looks:
 * ← → between siblings, ↑ to the manager, ↓ to the first report; Enter opens
 * the card's role, Space folds the branch.
 *
 * TWO CLICK TARGETS PER CARD (2026-10-10). A card is a ROLE and its rows are
 * POSITIONS: a click anywhere on the card that is not a row opens the role; a
 * click on a row opens that position. The rows are pointer targets only — the
 * keyboard reaches a position through the role view, which lists the card's
 * positions as buttons — so a card stays one tab stop, not one per row.
 *
 * Zoom is applied to the `<svg>` element's width/height only — the viewBox and
 * every coordinate stay put — so zooming never re-renders a thousand nodes.
 */

export type NavDirection = 'up' | 'down' | 'left' | 'right';

function renderPrim(p: Prim, key: string) {
  switch (p.k) {
    case 'rect':
      return (
        <rect
          key={key}
          x={p.x}
          y={p.y}
          width={p.w}
          height={p.h}
          rx={p.r ?? 0}
          fill={p.fill ?? 'none'}
          stroke={p.stroke}
          strokeWidth={p.sw}
          strokeDasharray={p.dash?.join(' ')}
        />
      );
    case 'circle':
      return (
        <circle
          key={key}
          cx={p.cx}
          cy={p.cy}
          r={p.r}
          fill={p.fill ?? 'none'}
          stroke={p.stroke}
          strokeWidth={p.sw}
        />
      );
    case 'path':
      return (
        <path
          key={key}
          d={p.d}
          fill={p.fill ?? 'none'}
          stroke={p.stroke}
          strokeWidth={p.sw}
          strokeDasharray={p.dash?.join(' ')}
        />
      );
    case 'text':
      return (
        <text
          key={key}
          x={p.x}
          y={p.y}
          fontSize={p.size}
          fontWeight={p.weight}
          fontStyle={p.italic ? 'italic' : undefined}
          textAnchor={p.anchor ?? 'start'}
          fill={p.fill}
        >
          {p.text}
        </text>
      );
    default:
      return null;
  }
}

export function OrgChartCanvas({
  scene,
  zoom,
  fontFamily,
  selected,
  selectedRow = null,
  accessibleName,
  textAlternative,
  onSelect,
  onOpenCard,
  onOpenRow,
  onToggleCollapse,
  onToggleDept,
  onNavigate,
  onZoom,
  edit = null,
}: {
  scene: ChartScene;
  zoom: number;
  fontFamily: string;
  selected: number | null;
  /** The position whose view is open in the panel: its row is ringed. */
  selectedRow?: number | null;
  accessibleName: string;
  /** Read out in place of the picture; the table view is the full fallback. */
  textAlternative: string;
  onSelect: (id: number) => void;
  onOpenCard: (id: number) => void;
  /** A click on a position row of a card. */
  onOpenRow?: (cardId: number, positionId: number) => void;
  onToggleCollapse: (id: number) => void;
  /** A click (or Enter / Space) on a department's title opens or closes it (spec §16). */
  onToggleDept?: (id: number) => void;
  onNavigate: (from: number, dir: NavDirection) => number | null;
  /**
   * Ask for a new zoom. The page clamps it (15 %–250 %) and passes the result
   * back as `zoom`; the canvas never assumes its request was granted as asked.
   */
  onZoom?: (zoom: number) => void;
  /**
   * Edit mode (spec §34.5): small + / ⋯ buttons on the unit boxes, the cards
   * and the rows, and a unit box dragged by its title onto another. Null =
   * view mode, drawn exactly as before.
   */
  edit?: CanvasEdit | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomNow = useRef(zoom);
  useEffect(() => { zoomNow.current = zoom; }, [zoom]);

  /*
   * DRAGGING A UNIT BOX (edit mode). Mouse and pen only: a finger pans, and on
   * a touch screen "Move…" in the box's menu does the same thing. The target
   * is found by geometry — the smallest unit box under the pointer, in scene
   * coordinates — because the cards are drawn above the boxes and would hide
   * them from elementFromPoint.
   */
  const [drag, setDrag] = useState<{ from: number; x: number; y: number; over: number | null; reason: string | null } | null>(null);
  const dragRef = useRef<{ from: number; sx: number; sy: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);
  const unitAt = useCallback((clientX: number, clientY: number): number | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const x = (clientX - r.left) / zoomNow.current;
    const y = (clientY - r.top) / zoomNow.current + scene.top;
    let best: { id: number; area: number } | null = null;
    for (const d of scene.depts) {
      if (x < d.x || x > d.x + d.w || y < d.y || y > d.y + d.h) continue;
      const area = d.w * d.h;
      if (!best || area < best.area) best = { id: d.id, area };
    }
    return best?.id ?? null;
  }, [scene]);

  const startDrag = (e: ReactPointerEvent<SVGRectElement>, from: number) => {
    if (!edit?.drag || e.pointerType === 'touch' || e.button !== 0) return;
    e.stopPropagation();
    dragRef.current = { from, sx: e.clientX, sy: e.clientY, moved: false };
    const editDrag = edit.drag;
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', esc);
    };
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.moved && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 6) return;
      d.moved = true;
      // Near an edge of the canvas: scroll it, so a far target can be reached.
      const wrap = wrapRef.current;
      if (wrap) {
        const r = wrap.getBoundingClientRect();
        if (ev.clientX < r.left + 36) wrap.scrollLeft -= 14;
        else if (ev.clientX > r.right - 36) wrap.scrollLeft += 14;
        if (ev.clientY < r.top + 36) wrap.scrollTop -= 14;
        else if (ev.clientY > r.bottom - 36) wrap.scrollTop += 14;
      }
      const over = unitAt(ev.clientX, ev.clientY);
      setDrag({ from: d.from, x: ev.clientX, y: ev.clientY, over, reason: over == null ? null : editDrag.check(d.from, over) });
    };
    const up = (ev: PointerEvent) => {
      stop();
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d?.moved) return;
      // The click that follows the release must not open or close the box.
      swallowClick.current = true;
      window.setTimeout(() => { swallowClick.current = false; }, 0);
      const over = unitAt(ev.clientX, ev.clientY);
      if (over != null && !editDrag.check(d.from, over)) editDrag.onDrop(d.from, over);
    };
    const esc = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      stop();
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', esc);
  };

  /** A small round button drawn in the chart: + to add, ⋯ for a position's actions. */
  const editButton = (target: EditTarget, cx: number, cy: number, r: number, glyph: '+' | '⋯', label: string, cls: string) => {
    if (!edit) return null;
    const key = editKey(target);
    const fire = (el: Element) => edit.onMenu(target, el);
    return (
      <g
        key={`edit-${key}`}
        data-editplus={cls}
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={edit.openKey === key}
        style={{ cursor: 'pointer', outlineOffset: 1 }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          fire(e.currentTarget);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            fire(e.currentTarget);
          }
        }}
      >
        <title>{label}</title>
        {/* A larger invisible target, so a finger finds it. */}
        <circle cx={cx} cy={cy} r={r + 6} fill="transparent" />
        <circle cx={cx} cy={cy} r={r} fill="var(--c-primary-600)" stroke="var(--c-surface)" strokeWidth={1.5} />
        <text
          x={cx}
          y={cy + (glyph === '+' ? r * 0.52 : r * 0.32)}
          textAnchor="middle"
          fontSize={glyph === '+' ? r * 1.55 : r * 1.3}
          fontWeight={700}
          fill="#fff"
        >
          {glyph}
        </text>
      </g>
    );
  };
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  /*
   * PINCH TO ZOOM — trackpad and touch. (And since §14, the plain wheel: see
   * `onWheel` below.)
   *
   * A trackpad pinch reaches the browser as a `wheel` event with `ctrlKey` set
   * (Chrome, Edge, Firefox; Ctrl + mouse wheel arrives the same way), and Safari
   * sends its own `gesturechange` with a `scale`. A touchscreen sends two
   * pointers. All three end in the same place: ask the page for a new zoom, and
   * remember which point of the chart was under the fingers.
   *
   * That anchor is the whole difference between a pinch that feels right and one
   * that is useless. Zoom is applied to the <svg>'s width/height, so growing it
   * pushes everything right and down from the top-left corner — without
   * correcting the scroll, a pinch over the Slitting section ends up somewhere
   * else entirely. So the chart coordinate under the fingers is noted before the
   * zoom changes, and after React has re-rendered at the new zoom, the scroll is
   * set so that same coordinate is back under the same screen point.
   *
   * The correction runs in a layout effect keyed on `zoom`, i.e. on the zoom the
   * page actually granted after clamping — not on the one requested.
   *
   * The listeners are native, not React props: React attaches `wheel` as a
   * passive listener, and a passive listener cannot preventDefault, so the
   * browser would zoom the whole page instead of the chart.
   */
  const zoomRef = useRef(zoom);
  const wantedZoom = useRef<number | null>(null);   // accumulates a fast burst of wheel events
  const anchor = useRef<{ cx: number; cy: number; sx: number; sy: number } | null>(null);
  const onZoomRef = useRef(onZoom);
  useEffect(() => { onZoomRef.current = onZoom; }, [onZoom]);

  useLayoutEffect(() => {
    zoomRef.current = zoom;
    wantedZoom.current = null;
    const wrap = wrapRef.current;
    const a = anchor.current;
    if (!wrap || !a) return;
    wrap.scrollLeft = a.cx * zoom - a.sx;
    wrap.scrollTop = a.cy * zoom - a.sy;
    anchor.current = null;
  }, [zoom]);

  /** Request `next`, keeping the chart point at screen offset (sx, sy) fixed. */
  const zoomAt = useCallback((next: number, sx: number, sy: number) => {
    const wrap = wrapRef.current;
    const ask = onZoomRef.current;
    if (!wrap || !ask) return;
    const z = zoomRef.current;
    anchor.current = { cx: (wrap.scrollLeft + sx) / z, cy: (wrap.scrollTop + sy) / z, sx, sy };
    wantedZoom.current = next;
    ask(next);
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const local = (clientX: number, clientY: number) => {
      const r = wrap.getBoundingClientRect();
      return [clientX - r.left, clientY - r.top] as const;
    };

    /*
     * THE WHEEL ZOOMS (spec §14). Until 2026-10-09 a plain wheel scrolled and
     * only Ctrl + wheel zoomed; the client asked for the wheel alone, and the
     * chart now sits in a fixed panel so there is no page to scroll anyway.
     *
     *   pinch (ctrlKey)            zoom, fast — a pinch sends small deltas
     *   plain wheel, mostly ↕      zoom, gentle — a mouse notch is ~100px
     *   mostly ↔ (trackpad swipe)  pan
     *   Shift + wheel              pan sideways
     *
     * A trackpad two-finger swipe arrives as wheel events too. Sending the
     * sideways ones to pan keeps trackpad users from being left with drag as
     * their only way to move; the vertical ones zoom, as the client asked.
     */
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // deltaMode 1 = lines (a mouse wheel in Firefox); normalise to pixels.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? wrap.clientHeight : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (!e.ctrlKey && (e.shiftKey || Math.abs(dx) > Math.abs(dy))) {
        // Windows turns Shift + wheel into deltaX already; other systems leave
        // it in deltaY. Either way it is a sideways move.
        if (e.shiftKey && !dx) wrap.scrollLeft += dy;
        else {
          wrap.scrollLeft += dx;
          wrap.scrollTop += dy;
        }
        return;
      }
      const base = wantedZoom.current ?? zoomRef.current;
      const [sx, sy] = local(e.clientX, e.clientY);
      // 0.0015/px is ~16% per mouse notch; a pinch keeps its old 1%/px.
      zoomAt(base * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)), sx, sy);
    };

    // Safari's trackpad pinch. `scale` is cumulative from the gesture's start.
    let gestureStart = 1;
    type GestureEvt = Event & { scale: number; clientX: number; clientY: number };
    const onGestureStart = (e: Event) => { e.preventDefault(); gestureStart = zoomRef.current; };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as GestureEvt;
      const [sx, sy] = local(g.clientX, g.clientY);
      zoomAt(gestureStart * g.scale, sx, sy);
    };

    wrap.addEventListener('wheel', onWheel, { passive: false });
    wrap.addEventListener('gesturestart', onGestureStart);
    wrap.addEventListener('gesturechange', onGestureChange);
    return () => {
      wrap.removeEventListener('wheel', onWheel);
      wrap.removeEventListener('gesturestart', onGestureStart);
      wrap.removeEventListener('gesturechange', onGestureChange);
    };
  }, [zoomAt]);

  // Two fingers on a touchscreen. One finger still pans (below).
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const spread = () => {
    const [a, b] = [...touches.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  const selectedBox = selected == null ? null : scene.boxes.find((b) => b.id === selected) ?? null;
  const dragTarget = drag?.over != null ? (scene.depts.find((d) => d.id === drag.over) ?? null) : null;
  const selectedRowHit =
    selectedRow == null
      ? null
      : (scene.boxes.flatMap((b) => b.rows).find((r) => r.positionId === selectedRow) ?? null);

  const focusNode = useCallback((id: number) => {
    const el = document.getElementById(`orgchart-node-${id}`);
    if (el instanceof SVGElement || el instanceof HTMLElement) {
      (el as unknown as HTMLElement).focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, []);

  // Keep the selected box in view when it was chosen from somewhere else — the
  // "start from" list, the search results, a cross-link in the card.
  useEffect(() => {
    if (selected == null) return;
    const el = document.getElementById(`orgchart-node-${selected}`);
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [selected, scene]);

  const onKeyDown = (e: React.KeyboardEvent<SVGGElement>, id: number) => {
    const dirs: Record<string, NavDirection> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };
    if (dirs[e.key]) {
      const next = onNavigate(id, dirs[e.key]);
      if (next != null) {
        e.preventDefault();
        onSelect(next);
        focusNode(next);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      onOpenCard(id);
      return;
    }
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      onToggleCollapse(id);
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    if (!wrap || e.button !== 0) return;
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        // The second finger turns a pan into a pinch. Stop panning, so the two
        // do not fight over the scroll position.
        pan.current = null;
        pinch.current = { dist: spread().dist, zoom: zoomRef.current };
        return;
      }
    }
    if (e.pointerType === 'touch') {
      // With `touch-action: none` the browser no longer scrolls for us, so a
      // finger must pan from ANYWHERE — on a box too, or a chart that is mostly
      // boxes could hardly be moved. No pointer capture here: a touch pointer is
      // already held by the element it went down on, and capturing it to the
      // wrapper would retarget the tap's click away from the box, so a tap
      // would stop opening its card. A tap barely moves, so it still clicks.
      pan.current = { x: e.clientX, y: e.clientY, left: wrap.scrollLeft, top: wrap.scrollTop };
      return;
    }
    const target = e.target as Element;
    if (target.closest('[data-orgnode]') || target.closest('[data-orgtoggle]') || target.closest('[data-orgdept]')) return;
    pan.current = { x: e.clientX, y: e.clientY, left: wrap.scrollLeft, top: wrap.scrollTop };
    wrap.setPointerCapture(e.pointerId);
    // Belt and braces with the `userSelect: none` above: a pointerdown that is
    // starting a pan must not also start a text selection. CSS alone leaves the
    // browser's own drag-select armed in some engines, and the symptom — half
    // the chart highlighted after a pan — looks like a bug in the app.
    e.preventDefault();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.current && touches.current.size === 2 && wrap) {
        const { dist, mx, my } = spread();
        if (pinch.current.dist > 0) {
          const r = wrap.getBoundingClientRect();
          zoomAt(pinch.current.zoom * (dist / pinch.current.dist), mx - r.left, my - r.top);
        }
        return;
      }
    }
    if (!wrap || !pan.current) return;
    wrap.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
    wrap.scrollTop = pan.current.top - (e.clientY - pan.current.y);
  };

  const endPan = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      touches.current.delete(e.pointerId);
      if (touches.current.size < 2) pinch.current = null;
    }
    const wrap = wrapRef.current;
    if (wrap?.hasPointerCapture(e.pointerId)) wrap.releasePointerCapture(e.pointerId);
    pan.current = null;
  };

  return (
    <Box
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      sx={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        background: 'var(--c-surface)',
        borderRadius: 'var(--r-md)',
        border: '1px solid var(--c-border)',
        boxShadow: 'var(--e-1)',
        cursor: 'grab',
        '&:active': { cursor: 'grabbing' },
        // `none`, so a two-finger pinch reaches the handlers above instead of
        // zooming the whole page. One-finger panning is done by the handlers too.
        touchAction: 'none',
        // Dragging to pan must not sweep a selection across every label it
        // crosses. The chart is SVG text, so a drag across it selects half the
        // organisation and leaves it highlighted — which reads as the app
        // having done something, when all that happened was a pan.
        userSelect: 'none',
        WebkitUserSelect: 'none',
        '& text, & tspan': { userSelect: 'none', WebkitUserSelect: 'none' },
        // A position row answers the pointer, so it reads as its own target.
        '& [data-orgrow]': { fill: 'transparent', cursor: 'pointer' },
        '& [data-orgrow]:hover': { fill: 'var(--c-primary-500)', fillOpacity: 0.1 },
        // Edit mode: the buttons are quiet until their box is hovered or focused; always there on touch.
        '& [data-editplus]': { opacity: 0.45, transition: 'opacity 120ms' },
        '& [data-editplus="row"]': { opacity: 0 },
        '& [data-orgdeptbox]:hover [data-editplus], & [data-orgcardwrap]:hover [data-editplus], & [data-orgcardwrap]:focus-within [data-editplus], & [data-editplus]:focus, & [data-editplus][aria-expanded="true"]':
          { opacity: 1 },
        '@media (hover: none)': { '& [data-editplus], & [data-editplus="row"]': { opacity: 1 } },
        '& [data-editdrag]': { cursor: 'grab' },
      }}
    >
      <svg
        ref={svgRef}
        role="img"
        aria-label={accessibleName}
        width={Math.round(scene.width * zoom)}
        // `scene.top` crops the band the title block would have used: on screen
        // the title is a fixed strip above this canvas, not part of the drawing.
        height={Math.round((scene.height - scene.top) * zoom)}
        viewBox={`0 ${scene.top} ${scene.width} ${scene.height - scene.top}`}
        xmlns="http://www.w3.org/2000/svg"
        fontFamily={fontFamily}
        style={{ display: 'block' }}
      >
        <title>{accessibleName}</title>
        <desc>{textAlternative}</desc>
        <rect y={scene.top} width={scene.width} height={scene.height - scene.top} fill={scene.background} />
        <g aria-hidden="true">{scene.header.map((p, i) => renderPrim(p, `h${i}`))}</g>
        <g aria-hidden="true">{scene.under.map((p, i) => renderPrim(p, `u${i}`))}</g>
        {scene.depts.length > 0 && (
          <g role="group" aria-label="Org units">
            {scene.depts.map((d) => (
              <g key={d.id} data-orgdeptbox={d.id}>
                <g aria-hidden="true">{d.prims.map((p, i) => renderPrim(p, `d${d.id}-${i}`))}</g>
                {/* The title band is the control; the rest of the box still pans. */}
                {d.canToggle && onToggleDept && !(edit?.drag && edit.unit(d.id)) && (
                  <rect
                    data-orgdept={d.id}
                    role="button"
                    tabIndex={0}
                    aria-label={d.label}
                    aria-expanded={d.open}
                    x={d.x}
                    y={d.y}
                    width={d.w}
                    height={d.titleH}
                    rx={10}
                    fill="transparent"
                    style={{ cursor: 'pointer', outlineOffset: 1 }}
                    onClick={() => onToggleDept(d.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onToggleDept(d.id);
                      }
                    }}
                  >
                    <title>{d.open ? `Close ${d.label.split(/[.,]/)[0]}` : `Open ${d.label.split(/[.,]/)[0]}`}</title>
                  </rect>
                )}
                {/* Edit mode: the title band is also the handle a unit is dragged by. */}
                {edit?.drag && edit.unit(d.id) && (
                  <rect
                    data-orgdept={d.id}
                    data-editdrag=""
                    role={d.canToggle ? 'button' : undefined}
                    tabIndex={d.canToggle ? 0 : undefined}
                    aria-label={d.canToggle ? d.label : undefined}
                    aria-expanded={d.canToggle ? d.open : undefined}
                    x={d.x}
                    y={d.y}
                    width={d.w}
                    height={d.titleH}
                    rx={10}
                    fill="transparent"
                    style={{ outlineOffset: 1 }}
                    onPointerDown={(e) => startDrag(e, d.id)}
                    onClick={() => {
                      if (swallowClick.current) return;
                      if (d.canToggle) onToggleDept?.(d.id);
                    }}
                    onKeyDown={(e) => {
                      if (d.canToggle && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onToggleDept?.(d.id);
                      }
                    }}
                  >
                    <title>
                      {`${d.canToggle ? (d.open ? 'Close' : 'Open') : ''} ${d.label.split(/[.,]/)[0]}`.trim() +
                        ' — drag onto another org unit to move it'}
                    </title>
                  </rect>
                )}
                {edit?.unit(d.id) &&
                  editButton(
                    { kind: 'unit', deptId: d.id },
                    d.canToggle ? d.x + d.w - 47 : d.x + d.w - 21,
                    d.y + 17,
                    9,
                    '+',
                    `Change ${d.label.split(/[.,]/)[0]}: add an org unit or a role, or move it`,
                    'unit',
                  )}
              </g>
            ))}
          </g>
        )}
        <g aria-hidden="true">{scene.edges.map((p, i) => renderPrim(p, `e${i}`))}</g>
        <g aria-hidden="true">{scene.links.map((p, i) => renderPrim(p, `l${i}`))}</g>
        <g aria-hidden="true">{scene.secondary.map((p, i) => renderPrim(p, `s${i}`))}</g>
        {selectedBox && (
          <rect
            aria-hidden="true"
            x={selectedBox.x - 3}
            y={selectedBox.y - 3}
            width={selectedBox.w + 6}
            height={selectedBox.h + 6}
            rx={11}
            fill="none"
            stroke="var(--c-primary-500)"
            strokeWidth={2.4}
          />
        )}
        {selectedRowHit && (
          <rect
            aria-hidden="true"
            x={selectedRowHit.x - 1.5}
            y={selectedRowHit.y - 1.5}
            width={selectedRowHit.w + 3}
            height={selectedRowHit.h + 3}
            rx={5}
            fill="none"
            stroke="var(--c-primary-500)"
            strokeWidth={1.8}
          />
        )}
        {dragTarget && drag && (
          <rect
            aria-hidden="true"
            x={dragTarget.x - 3}
            y={dragTarget.y - 3}
            width={dragTarget.w + 6}
            height={dragTarget.h + 6}
            rx={12}
            fill={drag.reason ? 'var(--c-danger-600)' : 'var(--c-primary-500)'}
            fillOpacity={0.08}
            stroke={drag.reason ? 'var(--c-danger-600)' : 'var(--c-primary-500)'}
            strokeWidth={2.4}
            strokeDasharray="7 4"
            pointerEvents="none"
          />
        )}
        <g role="tree" aria-label="Roles and their positions">
          {scene.boxes.map((box) => (
            // Outside the label filter: drawn faint, still there and still clickable (spec §15.4).
            <g key={box.id} opacity={box.dimmed ? 0.28 : undefined} data-dimmed={box.dimmed ? '' : undefined} data-orgcardwrap="">
              <g
                id={`orgchart-node-${box.id}`}
                data-orgnode={box.id}
                role="treeitem"
                tabIndex={0}
                aria-label={box.label}
                aria-selected={selected === box.id}
                aria-expanded={
                  box.toggle ? !box.toggle.collapsed : undefined
                }
                style={{ cursor: 'pointer', outlineOffset: 2 }}
                onClick={() => {
                  onSelect(box.id);
                  onOpenCard(box.id);
                }}
                onFocus={() => onSelect(box.id)}
                onKeyDown={(e) => onKeyDown(e, box.id)}
              >
                {box.prims.map((p, i) => renderPrim(p, `${box.id}-${i}`))}
                {onOpenRow &&
                  box.rows.map((r) => (
                    <rect
                      key={`r${r.positionId}`}
                      data-orgrow={r.positionId}
                      x={r.x}
                      y={r.y}
                      width={r.w}
                      height={r.h}
                      rx={4}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(box.id);
                        onOpenRow(box.id, r.positionId);
                      }}
                    >
                      <title>{r.label}</title>
                    </rect>
                  ))}
              </g>
              {box.toggle && (
                <g
                  data-orgtoggle={box.id}
                  role="button"
                  tabIndex={0}
                  aria-label={
                    box.toggle.collapsed
                      ? `Show the ${box.toggle.hidden} positions under ${box.label.split('.')[0]}`
                      : `Hide the team under ${box.label.split('.')[0]}`
                  }
                  style={{ cursor: 'pointer', outlineOffset: 2 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapse(box.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggleCollapse(box.id);
                    }
                  }}
                >
                  {box.toggle.prims.map((p, i) => renderPrim(p, `t${box.id}-${i}`))}
                </g>
              )}
              {edit?.card(box.id) &&
                editButton(
                  { kind: 'card', cardId: box.id },
                  box.x + 3,
                  box.y + 3,
                  8.5,
                  '+',
                  `Add a position to ${box.label.split('.')[0].replace(/^Role /, '')}`,
                  'card',
                )}
              {edit &&
                box.rows.map((r) =>
                  edit.row(r.positionId)
                    ? editButton(
                        { kind: 'row', positionId: r.positionId, cardId: box.id },
                        r.x + r.w - 9,
                        r.y + r.h / 2,
                        7,
                        '⋯',
                        `Change ${r.label.replace(/\s*Open this position\.?$/, '')}`,
                        'row',
                      )
                    : null,
                )}
            </g>
          ))}
        </g>
      </svg>
      {drag && edit?.drag && (
        <Box
          role="status"
          data-dragghost=""
          sx={{
            position: 'fixed',
            left: drag.x + 14,
            top: drag.y + 14,
            zIndex: 1500,
            pointerEvents: 'none',
            maxWidth: 300,
            px: 1.25,
            py: 0.75,
            borderRadius: 'var(--r-sm)',
            fontSize: 12.5,
            lineHeight: 1.4,
            boxShadow: 'var(--e-2)',
            background: 'var(--c-surface)',
            border: `1px solid ${drag.reason ? 'var(--c-danger-600)' : 'var(--c-primary-500)'}`,
            color: drag.reason ? 'var(--c-danger-600)' : 'var(--c-text)',
          }}
        >
          {drag.over == null
            ? `Move ${edit.drag.nameOf(drag.from)} — drop it on another org unit`
            : (drag.reason ?? `Move ${edit.drag.nameOf(drag.from)} under ${edit.drag.nameOf(drag.over)}`)}
        </Box>
      )}
    </Box>
  );
}
