import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Box } from '@mui/material';
import type { ChartScene, Prim } from './orgChartLayout';

/**
 * The chart itself: inline SVG, drawn from the scene's draw list.
 *
 * Inline rather than an `<img>` because every box has to be a real focusable
 * control. DESIGN_SYSTEM.md §6.4 makes a keyboard path mandatory for a canvas
 * screen, and an org chart nobody can tab through is an org chart half the
 * client's office cannot read. Arrow keys walk the tree the way the tree looks:
 * ← → between siblings, ↑ to the manager, ↓ to the first report; Enter opens
 * the card, Space folds the branch.
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
  accessibleName,
  textAlternative,
  onSelect,
  onOpenCard,
  onToggleCollapse,
  onNavigate,
  onZoom,
}: {
  scene: ChartScene;
  zoom: number;
  fontFamily: string;
  selected: number | null;
  accessibleName: string;
  /** Read out in place of the picture; the table view is the full fallback. */
  textAlternative: string;
  onSelect: (id: number) => void;
  onOpenCard: (id: number) => void;
  onToggleCollapse: (id: number) => void;
  onNavigate: (from: number, dir: NavDirection) => number | null;
  /**
   * Ask for a new zoom. The page clamps it (15 %–250 %) and passes the result
   * back as `zoom`; the canvas never assumes its request was granted as asked.
   */
  onZoom?: (zoom: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  /*
   * PINCH TO ZOOM — trackpad and touch.
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

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;              // plain scrolling still scrolls
      e.preventDefault();
      // deltaMode 1 = lines (a mouse wheel in Firefox); normalise to pixels.
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const base = wantedZoom.current ?? zoomRef.current;
      const [sx, sy] = local(e.clientX, e.clientY);
      zoomAt(base * Math.exp(-dy * 0.01), sx, sy);
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
    if (target.closest('[data-orgnode]') || target.closest('[data-orgtoggle]')) return;
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
      }}
    >
      <svg
        role="img"
        aria-label={accessibleName}
        width={Math.round(scene.width * zoom)}
        height={Math.round(scene.height * zoom)}
        viewBox={`0 0 ${scene.width} ${scene.height}`}
        xmlns="http://www.w3.org/2000/svg"
        fontFamily={fontFamily}
        style={{ display: 'block' }}
      >
        <title>{accessibleName}</title>
        <desc>{textAlternative}</desc>
        <rect width={scene.width} height={scene.height} fill={scene.background} />
        <g aria-hidden="true">{scene.header.map((p, i) => renderPrim(p, `h${i}`))}</g>
        <g aria-hidden="true">{scene.edges.map((p, i) => renderPrim(p, `e${i}`))}</g>
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
        <g role="tree" aria-label="Positions">
          {scene.boxes.map((box) => (
            <g key={box.id}>
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
            </g>
          ))}
        </g>
      </svg>
    </Box>
  );
}
