/**
 * PICKING IN THE 2D DRAWING VIEWER (user, 2026-11-01: "select any part in it and get the details in the right panel").
 * Pure: no DOM, no React.
 *
 * The viewer draws one SVG path per layer (lib/dxfView.ts). Here those paths are read back into SHAPES — each subpath
 * as points (arcs flattened), loose lines on a layer chained end to end into closed outlines where they meet — so a
 * click can find the shape under the cursor and say what it is: its layer, overall size, area, the holes and cut-outs
 * inside it and the text label that sits in it. All in the file's units (y up); `unitMm` turns them into mm.
 */
import type { DxfLayer, DxfView, LayerRole } from './dxfView';

export type Pt = [number, number];
export interface Shape {
  layer: string;
  role: LayerRole;
  pts: Pt[];
  closed: boolean;
  /** a full circle: its centre and radius (file units) */
  circle: { cx: number; cy: number; r: number } | null;
  minX: number; minY: number; maxX: number; maxY: number;
  /** enclosed area (file units²), 0 when open */
  area: number;
}

/** Layers whose lines are not parts of the drawing's pieces (dimensions, centre lines, hidden lines, text). */
const NOT_PICKED = new Set<LayerRole>(['dim', 'centre', 'hidden', 'text']);

const TOKEN = /[MLAZ]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

/** The points of one SVG arc command from p0 (rx = ry, no rotation — what lib/dxfView writes), y up, sweep 1 = counter-clockwise. */
export function arcPoints(p0: Pt, r: number, large: number, sweep: number, p1: Pt): { pts: Pt[]; cx: number; cy: number } {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const d = Math.hypot(dx, dy);
  if (!(d > 0) || !(r > 0)) return { pts: [p1], cx: p1[0], cy: p1[1] };
  const h = Math.sqrt(Math.max(r * r - (d / 2) * (d / 2), 0));
  const left = (sweep === 1) === (large === 0);
  const sgn = left ? 1 : -1;
  const cx = (p0[0] + p1[0]) / 2 + (-dy / d) * h * sgn, cy = (p0[1] + p1[1]) / 2 + (dx / d) * h * sgn;
  const a0 = Math.atan2(p0[1] - cy, p0[0] - cx);
  let a1 = Math.atan2(p1[1] - cy, p1[0] - cx);
  if (sweep === 1) { while (a1 <= a0 + 1e-12) a1 += 2 * Math.PI; } else { while (a1 >= a0 - 1e-12) a1 -= 2 * Math.PI; }
  const sw = a1 - a0;
  const rr = Math.hypot(p0[0] - cx, p0[1] - cy);
  const steps = Math.max(4, Math.ceil((Math.abs(sw) / (2 * Math.PI)) * 48));
  const pts: Pt[] = [];
  for (let i = 1; i < steps; i++) { const a = a0 + (sw * i) / steps; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
  pts.push(p1);
  return { pts, cx, cy };
}

interface Sub { pts: Pt[]; closed: boolean; arcs: { r: number; cx: number; cy: number }[]; lines: number }

/** A layer's path data → its subpaths as points. */
export function pathSubpaths(d: string): Sub[] {
  const t = d.match(TOKEN) ?? [];
  const out: Sub[] = [];
  let cur: Sub | null = null;
  let i = 0;
  const n = () => parseFloat(t[i++]);
  while (i < t.length) {
    const c = t[i++].toUpperCase();
    if (c === 'M') { cur = { pts: [[n(), n()]], closed: false, arcs: [], lines: 0 }; out.push(cur); }
    else if (c === 'L' && cur) { cur.pts.push([n(), n()]); cur.lines++; }
    else if (c === 'A' && cur) {
      const r = n(); n(); n(); const large = n(); const sweep = n(); const p1: Pt = [n(), n()];
      const a = arcPoints(cur.pts[cur.pts.length - 1], r, large, sweep, p1);
      cur.pts.push(...a.pts); cur.arcs.push({ r, cx: a.cx, cy: a.cy });
    } else if (c === 'Z' && cur) cur.closed = true;
  }
  return out;
}

const signedArea = (pts: Pt[]) => { let s = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j][0] * pts[i][1]) - (pts[i][0] * pts[j][1]); return s / 2; };

function shapeOf(layer: DxfLayer, pts: Pt[], closed: boolean, circle: Shape['circle']): Shape {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return { layer: layer.name, role: layer.role, pts, closed, circle, minX, minY, maxX, maxY, area: closed ? Math.abs(signedArea(pts)) : 0 };
}

/** Open pieces joined end to end (either way round); a chain that comes back to its start is a closed outline. */
export function chainLoops(subs: Pt[][], tol: number): { loops: Pt[][]; rest: Pt[][] } {
  const key = (p: Pt) => `${Math.round(p[0] / tol)},${Math.round(p[1] / tol)}`;
  const at = new Map<string, number[]>();
  subs.forEach((s, k) => { for (const p of [s[0], s[s.length - 1]]) { const kk = key(p); const l = at.get(kk); if (l) l.push(k); else at.set(kk, [k]); } });
  const used = new Uint8Array(subs.length);
  const near = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) <= tol * 1.5 && Math.abs(a[1] - b[1]) <= tol * 1.5;
  const next = (p: Pt): number => {
    const [gx, gy] = key(p).split(',').map(Number);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      for (const k of at.get(`${gx + ox},${gy + oy}`) ?? []) if (!used[k] && (near(subs[k][0], p) || near(subs[k][subs[k].length - 1], p))) return k;
    }
    return -1;
  };
  const loops: Pt[][] = []; const rest: Pt[][] = [];
  for (let k = 0; k < subs.length; k++) {
    if (used[k]) continue;
    used[k] = 1;
    const chain: Pt[] = [...subs[k]]; const members = [k];
    for (let guard = 0; guard < subs.length; guard++) {
      if (chain.length > 2 && near(chain[0], chain[chain.length - 1])) break;
      const j = next(chain[chain.length - 1]);
      if (j < 0) break;
      used[j] = 1; members.push(j);
      const s = subs[j];
      const fwd = near(s[0], chain[chain.length - 1]);
      chain.push(...(fwd ? s.slice(1) : [...s].reverse().slice(1)));
    }
    if (chain.length > 3 && near(chain[0], chain[chain.length - 1])) loops.push(chain.slice(0, -1));
    else { for (const m of members) rest.push(subs[m]); }
  }
  return { loops, rest };
}

/** Every pickable shape of a drawing. Layers that only annotate (dimensions, centre and hidden lines) are left out. */
export function shapesOf(view: DxfView): Shape[] {
  const b = view.bounds;
  const diag = b ? Math.hypot(b.maxX - b.minX, b.maxY - b.minY) : 1;
  const tol = Math.max(diag * 1e-5, 1e-4);
  const out: Shape[] = [];
  for (const layer of view.layers) {
    if (!layer.d || NOT_PICKED.has(layer.role)) continue;
    const open: Pt[][] = [];
    for (const s of pathSubpaths(layer.d)) {
      if (s.pts.length < 2) continue;
      const first = s.pts[0], last = s.pts[s.pts.length - 1];
      const shut = s.closed || (s.pts.length > 3 && Math.hypot(first[0] - last[0], first[1] - last[1]) <= tol);
      if (!shut) { open.push(s.pts); continue; }
      const pts = Math.hypot(first[0] - last[0], first[1] - last[1]) <= tol ? s.pts.slice(0, -1) : s.pts;
      const a0 = s.arcs[0];
      const circle = s.lines === 0 && a0 && s.arcs.every((a) => Math.abs(a.r - a0.r) <= tol && Math.abs(a.cx - a0.cx) <= tol * 10 && Math.abs(a.cy - a0.cy) <= tol * 10)
        ? { cx: a0.cx, cy: a0.cy, r: a0.r } : null;
      out.push(shapeOf(layer, pts, true, circle));
    }
    if (open.length && open.length <= 60000) {
      const { loops, rest } = chainLoops(open, tol);
      for (const l of loops) out.push(shapeOf(layer, l, true, null));
      for (const r of rest) out.push(shapeOf(layer, r, false, null));
    } else for (const r of open) out.push(shapeOf(layer, r, false, null));
  }
  return out;
}

export function pointInPolygon(x: number, y: number, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The distance from (x, y) to the shape's line. */
export function distanceTo(x: number, y: number, s: Shape): number {
  let best = Infinity;
  const n = s.pts.length; const segs = s.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const [ax, ay] = s.pts[i], [bx, by] = s.pts[(i + 1) % n];
    const vx = bx - ax, vy = by - ay; const L = vx * vx + vy * vy;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L)) : 0;
    const d = Math.hypot(x - (ax + t * vx), y - (ay + t * vy));
    if (d < best) best = d;
  }
  return best;
}

/**
 * The shape under (x, y): a line within `tol` of the point (the nearest), else the smallest closed outline around it
 * (a hole before the plate it is in). -1 when there is none. `skip` leaves shapes out (a hidden layer's).
 */
export function pickShape(shapes: Shape[], x: number, y: number, tol: number, skip?: (s: Shape) => boolean): number {
  let edge = -1; let edgeD = tol;
  let inside = -1; let insideA = Infinity;
  shapes.forEach((s, i) => {
    if (x < s.minX - tol || x > s.maxX + tol || y < s.minY - tol || y > s.maxY + tol || skip?.(s)) return;
    const d = distanceTo(x, y, s);
    if (d <= edgeD && (edge < 0 || d < edgeD || s.area < shapes[edge].area)) { edge = i; edgeD = d; }
    if (s.closed && s.area < insideA && pointInPolygon(x, y, s.pts)) { inside = i; insideA = s.area; }
  });
  return edge >= 0 ? edge : inside;
}

export interface ShapeFacts {
  layer: string;
  kind: 'circle' | 'outline' | 'line';
  /** overall size in mm: along x, along y */
  lengthMm: number; widthMm: number;
  /** a circle's diameter in mm */
  diameterMm: number | null;
  /** closed: the area inside (mm²) */
  areaMm2: number | null;
  /** an open line: its length; a closed one: its perimeter (mm) */
  pathMm: number;
  /** circles inside it, by diameter (mm, largest count first) */
  holes: { d: number; n: number }[];
  holeCount: number;
  /** other closed shapes inside it */
  cutouts: number;
  /** the text that sits inside it (the largest), if any */
  text: string | null;
}

/** What a picked shape is, for the side panel. Pure. */
export function shapeFacts(view: DxfView, shapes: Shape[], index: number): ShapeFacts {
  const s = shapes[index]; const k = view.unitMm || 1;
  let path = 0; const n = s.pts.length;
  for (let i = 0; i < (s.closed ? n : n - 1); i++) path += Math.hypot(s.pts[(i + 1) % n][0] - s.pts[i][0], s.pts[(i + 1) % n][1] - s.pts[i][1]);
  const byD = new Map<number, number>(); let cutouts = 0;
  if (s.closed && !s.circle) {
    shapes.forEach((t, j) => {
      if (j === index || !t.closed || t.area >= s.area) return;
      if (t.minX < s.minX || t.maxX > s.maxX || t.minY < s.minY || t.maxY > s.maxY) return;
      const probe: Pt = t.circle ? [t.circle.cx, t.circle.cy] : t.pts[0];
      if (!pointInPolygon(probe[0], probe[1], s.pts)) return;
      if (t.circle) { const d = Math.round(t.circle.r * 2 * k * 10) / 10; byD.set(d, (byD.get(d) ?? 0) + 1); } else cutouts++;
    });
  }
  let text: string | null = null; let textH = 0;
  if (s.closed) {
    for (const l of view.layers) for (const t of l.texts) {
      if (t.h <= textH || t.x < s.minX || t.x > s.maxX || t.y < s.minY || t.y > s.maxY || !pointInPolygon(t.x, t.y, s.pts)) continue;
      const words = t.lines.join(' ').trim();
      if (words) { text = words; textH = t.h; }
    }
  }
  const holes = [...byD.entries()].map(([d, c]) => ({ d, n: c })).sort((a, b) => b.n - a.n || b.d - a.d);
  return {
    layer: s.layer,
    kind: s.circle ? 'circle' : s.closed ? 'outline' : 'line',
    lengthMm: (s.maxX - s.minX) * k, widthMm: (s.maxY - s.minY) * k,
    diameterMm: s.circle ? s.circle.r * 2 * k : null,
    areaMm2: s.closed ? s.area * k * k : null,
    pathMm: path * k,
    holes, holeCount: holes.reduce((a, h) => a + h.n, 0), cutouts, text,
  };
}

/** SVG path data for a shape (for its highlight). */
export const shapePath = (s: Shape) => `M${s.pts.map(([x, y]) => `${x} ${y}`).join('L')}${s.closed ? 'Z' : ''}`;
