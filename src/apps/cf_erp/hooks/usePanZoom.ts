import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Pan and zoom for the drawing viewer — the SAME behaviour as the HRMS org chart (cf_hrms/components/OrgChartCanvas.tsx
 * and pages/OrgChart.tsx, read-only references; nothing is imported from them), re-done for a drawing in world
 * coordinates (y up) instead of a scrolled <svg>:
 *
 *   wheel (plain, mostly vertical)  zoom about the cursor, gentle: exp(-dy * 0.0015)   (~16% a mouse notch)
 *   pinch on a trackpad / Ctrl+wheel zoom about the cursor, fast: exp(-dy * 0.01)
 *   Shift+wheel, or a mostly sideways swipe   pan
 *   drag (mouse)                     pan, from anywhere; cursor grab / grabbing; no inertia
 *   one finger                       pans; two fingers pinch about their midpoint
 *   Safari gesturechange             zoom about the cursor
 *   buttons                          zoom x1.2 / ÷1.2, Fit, and 100% (true size)
 *   limits                           the org chart clamps to 15%–250% of natural size; here 25% of the fit view up to
 *                                    the larger of 100 x the fit view and 60 px per unit (a hole can be read)
 *
 * The listeners are native, not React props: React's wheel is passive and cannot preventDefault, so the page would
 * zoom instead of the drawing. The view lives in a ref and goes straight onto the <g> as a matrix, so a pan or a
 * wheel burst re-renders nothing in React (a drawing can be 20,000 entities); only the percent label is state, and it
 * is throttled to one frame.
 *
 * HEAVY DRAWINGS (`quickWhileMoving`): the browser re-rasterises every path on every frame of a pan, and anti-aliasing is
 * most of that cost (measured, 20,000 entities in software-rendered Chrome: 165 ms a frame, 32 ms with
 * `shape-rendering: optimizeSpeed`). While the view moves such a drawing is drawn without anti-aliasing, and one frame
 * after it stops it is drawn properly again.
 */

export interface View { s: number; tx: number; ty: number }
export interface Box { minX: number; minY: number; maxX: number; maxY: number }

/** Where each drawing was left this session (key -> view), so stepping to another level and back keeps the zoom. */
const remembered = new Map<string, View>();
export const forgetViews = () => remembered.clear();

export const ZOOM_STEP = 1.2;
export const WHEEL_ZOOM = 0.0015;
export const PINCH_ZOOM = 0.01;
const PAD = 28;               // the org chart's fit margin
const KEY_PAN = 60;
const FALLBACK = { w: 800, h: 600 };

/** Screen position of a world point: x' = s x + tx, y' = -s y + ty (DXF y runs up). */
export const matrixOf = (v: View) => `matrix(${v.s} 0 0 ${-v.s} ${v.tx} ${v.ty})`;

/** The view that shows the whole box inside a w x h viewport with a margin, centred. */
export function fitView(box: Box, w: number, h: number, pad = PAD): View {
  const bw = Math.max(box.maxX - box.minX, 1e-6), bh = Math.max(box.maxY - box.minY, 1e-6);
  const s = Math.max(1e-9, Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh));
  return { s, tx: (w - s * bw) / 2 - s * box.minX, ty: (h - s * bh) / 2 + s * box.maxY };
}

/** The view that fills the viewport's WIDTH with the box and starts at its top edge (a 24 m girder, read along its length). */
export function fitWidthView(box: Box, w: number, h: number, pad = PAD): View {
  const bw = Math.max(box.maxX - box.minX, 1e-6);
  const s = Math.max(1e-9, (w - 2 * pad) / bw);
  const bh = box.maxY - box.minY;
  // Taller than wide in the window: start at the top edge; otherwise centre it vertically as Fit does.
  const top = s * bh > h - 2 * pad ? pad : (h - s * bh) / 2;
  return { s, tx: pad - s * box.minX, ty: top + s * box.maxY };
}

/** Scale to `next` keeping the world point under screen (sx, sy) where it is. */
export function zoomAbout(v: View, next: number, sx: number, sy: number): View {
  const k = next / v.s;
  return { s: next, tx: sx - (sx - v.tx) * k, ty: sy - (sy - v.ty) * k };
}

/** What a wheel event does, by the org chart's rules. */
export function wheelAction(e: { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; shiftKey: boolean }, viewportH: number):
  { kind: 'pan'; dx: number; dy: number } | { kind: 'zoom'; factor: number } {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewportH : 1;
  const dx = e.deltaX * unit, dy = e.deltaY * unit;
  if (!e.ctrlKey && (e.shiftKey || Math.abs(dx) > Math.abs(dy))) {
    // Windows turns Shift + wheel into deltaX already; other systems leave it in deltaY.
    if (e.shiftKey && !dx) return { kind: 'pan', dx: dy, dy: 0 };
    return { kind: 'pan', dx, dy };
  }
  return { kind: 'zoom', factor: Math.exp(-dy * (e.ctrlKey ? PINCH_ZOOM : WHEEL_ZOOM)) };
}

export function usePanZoom({ bounds, actualScale, resetKey, quickWhileMoving = false, memoryKey }: {
  bounds: Box | null;
  /** pixels per world unit at true size (96 dpi) */
  actualScale: number;
  /** a new value means a new drawing: fit again */
  resetKey?: unknown;
  /** draw without anti-aliasing while the view is moving (a drawing with thousands of entities) */
  quickWhileMoving?: boolean;
  /** the drawing's identity: its view is remembered under it for the session */
  memoryKey?: string | null;
}) {
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const view = useRef<View>({ s: 1, tx: 0, ty: 0 });
  const fitted = useRef(true);           // true until the person pans or zooms: a resize then refits
  const limits = useRef({ min: 1e-9, max: 1e9 });
  const [scale, setScale] = useState(1);
  const frame = useRef(0);
  const boundsRef = useRef(bounds);
  const quick = useRef(quickWhileMoving);
  const settle = useRef(0);
  const key = useRef<string | null>(memoryKey ?? null);
  useEffect(() => { boundsRef.current = bounds; quick.current = quickWhileMoving; key.current = memoryKey ?? null; }, [bounds, quickWhileMoving, memoryKey]);

  const size = useCallback(() => {
    const el = viewport;
    return { w: el?.clientWidth || FALLBACK.w, h: el?.clientHeight || FALLBACK.h };
  }, [viewport]);

  const paint = useCallback(() => {
    const g = gRef.current;
    if (g) {
      g.setAttribute('transform', matrixOf(view.current));
      g.setAttribute('data-scale', String(view.current.s));
      if (key.current && !fitted.current) remembered.set(key.current, { ...view.current });
      const svg = g.ownerSVGElement;
      if (svg && quick.current) {
        svg.setAttribute('shape-rendering', 'optimizeSpeed');
        clearTimeout(settle.current);
        settle.current = window.setTimeout(() => svg.removeAttribute('shape-rendering'), 140);
      }
    }
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => { frame.current = 0; setScale(view.current.s); });
    }
  }, []);

  /** Set the view, clamped to the zoom limits; `sx, sy` is the screen point to keep still (the viewport centre by default). */
  const commit = useCallback((next: View) => {
    const { min, max } = limits.current;
    view.current = next.s < min || next.s > max ? zoomAbout(next, Math.min(max, Math.max(min, next.s)), size().w / 2, size().h / 2) : next;
    paint();
  }, [paint, size]);

  const fit = useCallback(() => {
    const b = boundsRef.current;
    if (!b) return;
    const { w, h } = size();
    const v = fitView(b, w, h);
    limits.current = { min: v.s * 0.25, max: Math.max(v.s * 100, 60) };
    fitted.current = true;
    view.current = v;
    paint();
  }, [paint, size]);

  const fitWidth = useCallback(() => {
    const b = boundsRef.current;
    if (!b) return;
    const { w, h } = size();
    fitted.current = false;
    commit(fitWidthView(b, w, h));
  }, [commit, size]);

  /** Opening a drawing: back where it was left this session, else fitted. */
  const open = useCallback(() => {
    fit();
    const was = key.current ? remembered.get(key.current) : undefined;
    if (was) { fitted.current = false; view.current = was; paint(); }
  }, [fit, paint]);

  const zoomBy = useCallback((factor: number, at?: [number, number]) => {
    const { w, h } = size();
    fitted.current = false;
    const [sx, sy] = at ?? [w / 2, h / 2];
    const next = Math.min(limits.current.max, Math.max(limits.current.min, view.current.s * factor));
    commit(zoomAbout(view.current, next, sx, sy));
  }, [commit, size]);

  const actual = useCallback(() => {
    const { w, h } = size();
    fitted.current = false;
    const next = Math.min(limits.current.max, Math.max(limits.current.min, actualScale));
    commit(zoomAbout(view.current, next, w / 2, h / 2));
  }, [actualScale, commit, size]);

  const panBy = useCallback((dx: number, dy: number) => {
    fitted.current = false;
    commit({ ...view.current, tx: view.current.tx + dx, ty: view.current.ty + dy });
  }, [commit]);

  // The <g> arrives (or is replaced): put the current view on it.
  const contentRef = useCallback((el: SVGGElement | null) => { gRef.current = el; if (el) paint(); }, [paint]);

  // Fit when a drawing (or its bounds) arrives, and again when the viewport is resized while still on the fitted view.
  useEffect(() => { if (viewport && bounds) open(); }, [viewport, bounds, resetKey, open]);
  useEffect(() => {
    if (!viewport || typeof ResizeObserver === 'undefined') return;
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) { first = false; return; }
      if (fitted.current) fit();
    });
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [viewport, fit]);
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); clearTimeout(settle.current); }, []);

  // Wheel, trackpad pinch and Safari gestures.
  useEffect(() => {
    const el = viewport;
    if (!el) return;
    const local = (cx: number, cy: number) => { const r = el.getBoundingClientRect(); return [cx - r.left, cy - r.top] as const; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const a = wheelAction(e, el.clientHeight || FALLBACK.h);
      if (a.kind === 'pan') { panBy(-a.dx, -a.dy); return; }
      const [sx, sy] = local(e.clientX, e.clientY);
      zoomBy(a.factor, [sx, sy]);
    };
    let start = 1;
    type Gesture = Event & { scale: number; clientX: number; clientY: number };
    const onGestureStart = (e: Event) => { e.preventDefault(); start = view.current.s; };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Gesture;
      const [sx, sy] = local(g.clientX, g.clientY);
      zoomBy((start * g.scale) / view.current.s, [sx, sy]);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart);
    el.addEventListener('gesturechange', onGestureChange);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
    };
  }, [viewport, panBy, zoomBy]);

  // Pointers: a mouse drag pans; one finger pans; two fingers pinch.
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; s: number } | null>(null);
  const spread = () => {
    const [a, b] = [...touches.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) { pan.current = null; pinch.current = { dist: spread().dist, s: view.current.s }; return; }
      pan.current = { x: e.clientX, y: e.clientY, tx: view.current.tx, ty: view.current.ty };
      return;
    }
    pan.current = { x: e.clientX, y: e.clientY, tx: view.current.tx, ty: view.current.ty };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    // A pointerdown that starts a pan must not also start a text selection.
    e.preventDefault();
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.current && touches.current.size === 2) {
        const { dist, mx, my } = spread();
        if (pinch.current.dist > 0) {
          const r = e.currentTarget.getBoundingClientRect();
          zoomBy((pinch.current.s * (dist / pinch.current.dist)) / view.current.s, [mx - r.left, my - r.top]);
        }
        return;
      }
    }
    const p = pan.current;
    if (!p) return;
    fitted.current = false;
    commit({ ...view.current, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) });
  };
  const endPan = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch') {
      touches.current.delete(e.pointerId);
      if (touches.current.size < 2) pinch.current = null;
    }
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    pan.current = null;
  };

  // Keyboard path (DESIGN_SYSTEM §6.4): arrows pan, + / - zoom, 0 fits, 1 is true size.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const step = e.shiftKey ? KEY_PAN * 4 : KEY_PAN;
    switch (e.key) {
      case 'ArrowLeft': panBy(step, 0); break;
      case 'ArrowRight': panBy(-step, 0); break;
      case 'ArrowUp': panBy(0, step); break;
      case 'ArrowDown': panBy(0, -step); break;
      case '+': case '=': zoomBy(ZOOM_STEP); break;
      case '-': case '_': zoomBy(1 / ZOOM_STEP); break;
      case '0': fit(); break;
      case '1': actual(); break;
      default: return;
    }
    e.preventDefault();
  };

  return {
    viewportRef: setViewport,
    contentRef,
    scale,
    /** zoom as a percentage of true size (96 dpi) */
    percent: actualScale > 0 ? Math.round((scale / actualScale) * 100) : 100,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
    fit, fitWidth, actual, panBy,
    bind: { onPointerDown, onPointerMove, onPointerUp: endPan, onPointerCancel: endPan, onKeyDown },
  };
}
