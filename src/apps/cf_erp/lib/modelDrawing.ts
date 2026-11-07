/**
 * A LEVEL'S DRAWING, READ STRAIGHT FROM THE MODEL (user, 2026-11-02: "why can't we always infer from the same json? Just
 * pick up that part of the json and show"). No file is fetched or stored: the level's pieces are picked from the one
 * model and projected to elevation, plan and end view. A DXF is written only when someone asks to download it.
 *
 * The answer has the shape the viewer already draws (lib/dxfView.ts DxfView). Layers: OUTLINE (what is seen), HIDDEN
 * (what nearer plates cover; off until asked for), HOLES, DIM (the Measurements switch), TEXT (the Codes switch).
 * Pure: no DOM, no React.
 */
import type { DxfBounds, DxfLayer, DxfText, DxfView } from './dxfView';

type V3 = [number, number, number];
type V2 = [number, number];

export interface ModelPlate { pts: V2[]; holes?: [number, number, number][]; cuts?: V2[][]; t: number; o: V3; u: V3; v: V3; w: V3 }
export interface ModelSection { type: string; h?: number; w?: number; d?: number; t?: number; tw?: number; bTop?: number; tTop?: number; bBot?: number; tBot?: number }
export interface ModelElement {
  id: string; mark: string | null; in?: string[];
  /** which copy of each level in `in` this piece belongs to, in the same order */
  n?: number[];
  label?: string;
  part?: string; o?: V3; u?: V3; v?: V3; w?: V3;
  plate?: ModelPlate;
  box?: { c: V3; size: V3 };
  member?: { a: V3; b: V3; up: V3; section: ModelSection };
  /** a grid of studs kept as a pattern: ni along di, nj along dj from a, each d across and h tall along up */
  studs?: { a: V3; di: V3; ni: number; dj: V3; nj: number; d: number; h: number; up: V3 };
  /** placed by a stated rule, not read from a drawing */
  rule?: boolean;
  /** a bolt of the model's boltSet (drawn as its head and nut; never labelled one by one) */
  bolt?: boolean;
}
/** The model's bolts (drawing_bom src/model2/bolts.mjs): rows [mark, level path, copies, x, y, z (head face), nx, ny, nz, grip, d]. */
export interface ModelBoltSet { schema: string; marks: string[]; levels: string[]; rows: (number | string)[][] }
export interface ModelPart { pts: V2[]; holes?: [number, number, number][]; cuts?: V2[][]; t: number }
export interface ModelFile { schema: string; title?: string; parts?: Record<string, ModelPart>; levels?: Record<string, { name?: string; qty?: number }>; elements: ModelElement[]; boltSet?: ModelBoltSet }

/**
 * The model's bolts as pieces (user, 2026-11-07: "wherever there are holes I don't see any bolts"): each a head and a nut, hexagon-ish
 * cylinders 1.7 d across, on its own line through the plies it clamps; the shank is inside the holes. Level path and copies as the
 * owning plate's, so a bolt lights with its joint. Pure.
 */
export function boltElements(set: ModelBoltSet | undefined): ModelElement[] {
  if (!set?.rows?.length) return [];
  const out: ModelElement[] = [];
  set.rows.forEach((r, i) => {
    const [mi, li, ci, x, y, z, nx, ny, nz, grip, d] = r as unknown as [number, number, string | number, number, number, number, number, number, number, number, number];
    const lv = String(set.levels[li] ?? ''); const inn = lv ? lv.split('<') : [];
    const cp = String(ci ?? '').split(',').filter((s) => s !== '').map(Number);
    const head: V3 = [x, y, z]; const n: V3 = [nx, ny, nz]; const tail = add(head, mul(n, grip));
    const up: V3 = Math.abs(nz) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    const base = { mark: set.marks[mi] ?? 'BOLT', in: inn, n: cp, bolt: true, label: set.marks[mi] };
    out.push({ ...base, id: `bolt${i}h`, member: { a: add(head, mul(n, -0.65 * d)), b: head, up, section: { type: 'pipe', d: 1.7 * d, t: d } } });
    out.push({ ...base, id: `bolt${i}n`, member: { a: tail, b: add(tail, mul(n, 0.8 * d)), up, section: { type: 'pipe', d: 1.7 * d, t: d } } });
  });
  return out;
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

/**
 * A `cf-erp-model3d/2` piece names its part (each part's shape is kept once) and says where it sits; everything that draws
 * a model reads `plate`, so this puts it back. A /1 model comes through as it is. Pure, and it leaves the input alone.
 */
/** The model's bolts are kept for the physics and the bolt count; the screens do not draw them for now (user, 2026-11-07). */
const DRAW_BOLTS = false;

export function expandModel<T extends ModelFile>(model: T): T {
  if (!model.parts) return model;
  const { parts, boltSet, ...rest } = model;
  return {
    ...rest,
    elements: [...model.elements.flatMap((e): ModelElement[] => {
      const p = e.part ? parts[e.part] : null;
      if (p) return [{ ...e, plate: { pts: p.pts, holes: p.holes, cuts: p.cuts, t: p.t, o: e.o!, u: e.u!, v: e.v!, w: e.w! } }];
      if (!e.studs) return [e];
      const g = e.studs; const out: ModelElement[] = []; const head = { ...e }; delete head.studs;
      for (let i = 0; i < g.ni; i++) for (let j = 0; j < g.nj; j++) {
        const a = add(add(g.a, mul(g.di, i)), mul(g.dj, j));
        out.push({ ...head, id: `${e.id}.${i}.${j}`, member: { a, b: add(a, mul(g.up, g.h)), up: [1, 0, 0], section: { type: 'pipe', d: g.d, t: g.d / 2 } } });
      }
      return out;
    }), ...(DRAW_BOLTS ? boltElements(boltSet) : [])],
  } as unknown as T;
}


/** A solid as a flat outline moved along `t`: every plate, and every plate of a member, is one. */
interface Prism { poly: V3[]; t: V3; holes: { c: V3; d: number }[]; cuts: V3[][]; n: V3; key: string }

function rectPrism(c: V3, a: V3, b: V3, t: V3, key: string): Prism {
  const half = mul(t, -0.5); const o = add(c, half);
  return { poly: [add(o, add(mul(a, -0.5), mul(b, -0.5))), add(o, add(mul(a, 0.5), mul(b, -0.5))), add(o, add(mul(a, 0.5), mul(b, 0.5))), add(o, add(mul(a, -0.5), mul(b, 0.5)))], t, holes: [], cuts: [], n: unit(t), key };
}

function prismsOf(e: ModelElement, key: string): Prism[] {
  if (e.plate) {
    const p = e.plate;
    const at = (x: number, y: number): V3 => add(p.o, add(mul(p.u, x), mul(p.v, y)));
    return [{
      poly: p.pts.map(([x, y]) => at(x, y)), t: mul(p.w, p.t), n: p.w, key,
      holes: (p.holes ?? []).map(([x, y, d]) => ({ c: at(x, y), d })),
      cuts: (p.cuts ?? []).map((r) => r.map(([x, y]) => at(x, y))),
    }];
  }
  if (e.box) {
    const [sx, sy, sz] = e.box.size; const c = e.box.c;
    // The thinnest side is its thickness.
    const axes: [V3, number][] = [[[1, 0, 0], sx], [[0, 1, 0], sy], [[0, 0, 1], sz]];
    axes.sort((a, b) => a[1] - b[1]);
    return [rectPrism(c, mul(axes[1][0], axes[1][1]), mul(axes[2][0], axes[2][1]), mul(axes[0][0], axes[0][1]), key)];
  }
  const m = e.member;
  if (!m) return [];
  const axisL = sub(m.b, m.a); const L = Math.hypot(axisL[0], axisL[1], axisL[2]);
  if (L < 1) return [];
  const ax = unit(axisL);
  let up = sub(m.up, mul(ax, dot(m.up, ax)));
  if (Math.hypot(up[0], up[1], up[2]) < 1e-6) up = [ax[2] === 0 ? 0 : 1, 0, ax[2] === 0 ? 1 : 0];
  up = unit(up);
  const side = unit(cross(ax, up)); const mid = mul(add(m.a, m.b), 0.5); const s = m.section;
  const along = mul(ax, L);
  const at = (dy: number, dz: number) => add(mid, add(mul(up, dy), mul(side, dz)));
  const flat = (dy: number, width: number, thick: number, dz = 0) => rectPrism(at(dy, dz), along, mul(side, width), mul(up, thick), key);
  const wall = (dy: number, height: number, thick: number, dz: number) => rectPrism(at(dy, dz), along, mul(up, height), mul(side, thick), key);
  if (s.type === 'pipe') {
    // Round when seen along its axis: a polygon moved along the axis.
    const d = s.d ?? 0; const n = d > 100 ? 24 : 8;
    const poly = Array.from({ length: n }, (_, i): V3 => { const a = (i * 2 * Math.PI) / n; return add(m.a, add(mul(up, (Math.cos(a) * d) / 2), mul(side, (Math.sin(a) * d) / 2))); });
    return [{ poly, t: along, n: ax, holes: [], cuts: [], key }];
  }
  const h = s.h ?? 0; const tT = s.tTop ?? 0; const tB = s.tBot ?? 0; const tw = s.tw ?? 0;
  const out = [flat(h / 2 - tT / 2, s.bTop ?? 0, tT), flat(-h / 2 + tB / 2, s.bBot ?? 0, tB)];
  if (s.type === 'I') out.push(wall((tB - tT) / 2, h - tT - tB, tw, 0));
  else {
    const w = s.w ?? 0;
    const webBot = -h / 2 + ((s.bBot ?? 0) > w ? tB : 0); const webTop = h / 2 - ((s.bTop ?? 0) > w ? tT : 0);
    for (const sg of [-1, 1]) out.push(wall((webTop + webBot) / 2, webTop - webBot, tw, sg * (w / 2 - tw / 2)));
  }
  return out;
}

// ── One view: lines seen, lines covered ───────────────────────────────────────

interface Line { a: V2; b: V2 }
interface Occluder { poly: V2[]; back: number; box: [number, number, number, number] }
interface ViewBasis { name: string; r: V3; s: V3; d: V3 }

const pointIn = (x: number, y: number, poly: V2[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[i]; const [bx, by] = poly[j];
    if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) c = !c;
  }
  return c;
};

/** Where the segment runs inside the polygon, as parts of its length (0…1). */
function insideSpans(a: V2, b: V2, poly: V2[]): [number, number][] {
  const ts = [0, 1];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [px, py] = poly[j]; const [qx, qy] = poly[i];
    const rx = b[0] - a[0]; const ry = b[1] - a[1]; const sx = qx - px; const sy = qy - py;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((px - a[0]) * sy - (py - a[1]) * sx) / den;
    const u = ((px - a[0]) * ry - (py - a[1]) * rx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ts.length; i++) {
    const m = (ts[i] + ts[i + 1]) / 2;
    if (ts[i + 1] - ts[i] > 1e-6 && pointIn(a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m, poly)) out.push([ts[i], ts[i + 1]]);
  }
  return out;
}

const hull = (pts: V2[]): V2[] => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: V2[] = []; for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up: V2[] = []; for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
};

interface Projected { seen: Line[]; hidden: Line[]; holes: { x: number; y: number; d: number }[]; boxes: Map<string, { x: number; y: number; area: number }>; bounds: DxfBounds | null }

/** Holes smaller than this part of the view's width cannot be seen at the size the view opens, and a whole span has tens of thousands. */
const HOLE_MIN_OF_WIDTH = 1 / 500;

function project(prisms: Prism[], b: ViewBasis): Projected {
  const pr = (q: V3): V2 => [dot(q, b.r), dot(q, b.s)];
  const depth = (q: V3) => dot(q, b.d);
  const segs: { a: V2; b: V2; da: number; db: number }[] = [];
  const occ: Occluder[] = [];
  const boxes = new Map<string, { x: number; y: number; area: number }>();
  const circles: { c: V3; d: number; own: Occluder | null }[] = [];
  const edge = (p: V3, q: V3) => {
    const a = pr(p); const c = pr(q);
    if (Math.hypot(a[0] - c[0], a[1] - c[1]) > 0.5) segs.push({ a, b: c, da: depth(p), db: depth(q) });
  };
  const seen = new Set<string>();
  const edgeOnce = (p: V3, q: V3) => {
    const a = pr(p); const c = pr(q); const da = Math.round(depth(p)); const db = Math.round(depth(q));
    const k1 = `${Math.round(a[0])},${Math.round(a[1])},${da};${Math.round(c[0])},${Math.round(c[1])},${db}`;
    const k2 = `${Math.round(c[0])},${Math.round(c[1])},${db};${Math.round(a[0])},${Math.round(a[1])},${da}`;
    if (seen.has(k1) || seen.has(k2)) return;
    seen.add(k1); edge(p, q);
  };
  for (const pm of prisms) {
    const far = pm.poly.map((q) => add(q, pm.t));
    const faceOn = Math.abs(dot(pm.n, b.d)) > 0.15;
    const front = dot(pm.t, b.d) > 0 ? far : pm.poly;
    const back = dot(pm.t, b.d) > 0 ? pm.poly : far;
    const shift = dot(pm.t, b.d) > 0 ? pm.t : ([0, 0, 0] as V3);
    let poly: V2[]; let own: Occluder | null = null;
    if (faceOn) {
      poly = front.map(pr);
      for (let i = 0; i < front.length; i++) edgeOnce(front[i], front[(i + 1) % front.length]);
      for (const c of pm.cuts) { const nc = c.map((q) => add(q, shift)); for (let i = 0; i < nc.length; i++) edgeOnce(nc[i], nc[(i + 1) % nc.length]); }
      if (Math.abs(dot(pm.n, b.d)) < 0.98) {
        for (let i = 0; i < back.length; i++) edgeOnce(back[i], back[(i + 1) % back.length]);
        for (let i = 0; i < back.length; i++) edgeOnce(front[i], back[i]);
      }
      own = { poly, back: Math.min(...front.map(depth)), box: [0, 0, 0, 0] };
      for (const h of pm.holes) circles.push({ c: add(h.c, shift), d: h.d, own });
    } else {
      poly = hull([...front, ...back].map(pr));
      const zs = poly.map(([x, y]) => add(mul(b.r, x), mul(b.s, y)));
      for (let i = 0; i < zs.length; i++) {
        const p = poly[i]; const q = poly[(i + 1) % poly.length];
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.5) {
          // An edge-on plate shown by its outer edges: drawn at its nearest depth, so a plate in front of it still covers it.
          const near = Math.max(...front.map(depth), ...back.map(depth));
          segs.push({ a: p, b: q, da: near, db: near });
        }
      }
      own = { poly, back: Math.min(...front.map(depth), ...back.map(depth)), box: [0, 0, 0, 0] };
    }
    const xs = poly.map((p) => p[0]); const ys = poly.map((p) => p[1]);
    own.box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    occ.push(own);
    const area = (own.box[2] - own.box[0]) * (own.box[3] - own.box[1]);
    const cur = boxes.get(pm.key);
    if (!cur || area > cur.area) boxes.set(pm.key, { x: (own.box[0] + own.box[2]) / 2, y: (own.box[1] + own.box[3]) / 2, area });
  }
  const bounds = occ.length ? {
    minX: Math.min(...occ.map((o) => o.box[0])), minY: Math.min(...occ.map((o) => o.box[1])),
    maxX: Math.max(...occ.map((o) => o.box[2])), maxY: Math.max(...occ.map((o) => o.box[3])),
  } : null;
  // A grid of the plates, so each line is only tried against those near it.
  const res: Projected = { seen: [], hidden: [], holes: [], boxes, bounds };
  if (!bounds) return res;
  const N = 64; const W = bounds.maxX - bounds.minX || 1; const H = bounds.maxY - bounds.minY || 1;
  const cell = (x: number, lim: number, lo: number) => Math.max(0, Math.min(N - 1, Math.floor(((x - lo) / lim) * N)));
  const grid: Occluder[][] = Array.from({ length: N * N }, () => []);
  for (const o of occ) for (let i = cell(o.box[0], W, bounds.minX); i <= cell(o.box[2], W, bounds.minX); i++) for (let j = cell(o.box[1], H, bounds.minY); j <= cell(o.box[3], H, bounds.minY); j++) grid[i * N + j].push(o);
  const EPS = 1;
  for (const s of segs) {
    const i0 = cell(Math.min(s.a[0], s.b[0]), W, bounds.minX); const i1 = cell(Math.max(s.a[0], s.b[0]), W, bounds.minX);
    const j0 = cell(Math.min(s.a[1], s.b[1]), H, bounds.minY); const j1 = cell(Math.max(s.a[1], s.b[1]), H, bounds.minY);
    const tried = new Set<Occluder>();
    const covered: [number, number][] = [];
    const minX = Math.min(s.a[0], s.b[0]); const maxX = Math.max(s.a[0], s.b[0]); const minY = Math.min(s.a[1], s.b[1]); const maxY = Math.max(s.a[1], s.b[1]);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const o of grid[i * N + j]) {
      if (tried.has(o)) continue;
      tried.add(o);
      if (o.box[0] > maxX || o.box[2] < minX || o.box[1] > maxY || o.box[3] < minY) continue;
      if (Math.max(s.da, s.db) >= o.back - EPS) continue;
      covered.push(...insideSpans(s.a, s.b, o.poly));
    }
    const put = (out: Line[], t0: number, t1: number) => {
      if (t1 - t0 < 1e-6) return;
      const p = (t: number): V2 => [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
      out.push({ a: p(t0), b: p(t1) });
    };
    if (!covered.length) { res.seen.push({ a: s.a, b: s.b }); continue; }
    covered.sort((x, y) => x[0] - y[0]);
    let at = 0;
    for (const [c0, c1] of covered) {
      if (c0 > at) put(res.seen, at, c0);
      if (c1 > at) { put(res.hidden, Math.max(at, c0), c1); at = c1; }
    }
    if (at < 1) put(res.seen, at, 1);
  }
  const holeMin = Math.max(W, H) * HOLE_MIN_OF_WIDTH;
  for (const h of circles) {
    if (h.d < holeMin) continue;
    const [x, y] = pr(h.c); const dp = depth(h.c);
    const covered = (() => {
      for (const o of grid[cell(x, W, bounds.minX) * N + cell(y, H, bounds.minY)]) if (o !== h.own && dp < o.back - EPS && pointIn(x, y, o.poly)) return true;
      return false;
    })();
    if (!covered) res.holes.push({ x, y, d: h.d });
  }
  return res;
}

// ── The sheet ─────────────────────────────────────────────────────────────────

const VIEWS: ViewBasis[] = [
  { name: 'ELEVATION', r: [1, 0, 0], s: [0, 0, 1], d: [0, -1, 0] },
  { name: 'PLAN', r: [1, 0, 0], s: [0, 1, 0], d: [0, 0, 1] },
  { name: 'END VIEW', r: [0, 1, 0], s: [0, 0, 1], d: [1, 0, 0] },
];

/** Pieces whose longest side is under this part of the level's size are not drawn at that level. */
const SMALL_OF_SHEET = 1 / 200;

const f1 = (v: number) => String(Math.round(v * 10) / 10);
const n0 = (v: number) => String(Math.round(v));

/** The pieces of a level: its own copy number 0 when there are several copies of it. Pure. */
export function piecesOfLevel(model: ModelFile, mark: string): ModelElement[] {
  const m = mark.toUpperCase();
  const out: ModelElement[] = [];
  for (const e of model.elements) {
    if (e.mark?.toUpperCase() === m && !(e.in ?? []).some((x) => x.toUpperCase() === m)) { if (!out.length || (e.n?.[0] ?? 0) === 0) out.push(e); continue; }
    const i = (e.in ?? []).findIndex((x) => x.toUpperCase() === m);
    if (i < 0) continue;
    if ((e.n?.[i] ?? 0) === 0) out.push(e);
  }
  return out;
}

/** Does the model have this mark as a LEVEL (an assembly it can draw), and not only as a plate? Pure. */
export function modelHasLevel(model: ModelFile, mark: string | null | undefined): boolean {
  if (!mark) return false;
  const m = mark.toUpperCase();
  return model.elements.some((e) => (e.in ?? []).some((x) => x.toUpperCase() === m));
}

/** Does the model have a piece (an element) with this mark — a part or a bought section it can draw alone? Pure. */
export function modelHasPiece(model: ModelFile, mark: string | null | undefined): boolean {
  if (!mark) return false;
  const m = mark.toUpperCase();
  return model.elements.some((e) => e.mark?.toUpperCase() === m);
}

export interface LevelDrawing { view: DxfView; pieces: number; levelName: string }

/**
 * The drawing of ONE piece with this mark, alone (user, 2026-11-07: a bracing angle with no DXF is drawn from the model):
 * its first element, in elevation, plan and end view. null when the model has no piece with that mark. Pure.
 */
export function pieceDrawing(model: ModelFile, mark: string, codes: Record<string, string> = {}): LevelDrawing | null {
  const m = mark.toUpperCase();
  const one = expandModel(model).elements.find((e) => e.mark?.toUpperCase() === m);
  if (!one) return null;
  return levelDrawing({ ...model, elements: [{ ...one, in: [], n: [] }] } as ModelFile, mark, codes);
}

/**
 * The drawing of level `mark`. `codes` (normalised mark → the part's code on this line) labels what the Codes switch shows,
 * otherwise the mark does. null when the model has nothing at that level. Pure.
 */
export function levelDrawing(modelIn: ModelFile, mark: string, codes: Record<string, string> = {}): LevelDrawing | null {
  const model = expandModel(modelIn);
  const m = mark.toUpperCase();
  // A sheet shows a bolt by its hole, as a shop drawing does: the model's bolts are for the 3D view and the physics.
  const pieces = piecesOfLevel(model, m).filter((e) => !e.bolt);
  if (!pieces.length) return null;
  // Each piece is named by what is directly under this level, so a span says "MTA", not its 3,000 plates.
  const nameOf = (e: ModelElement) => {
    const i = (e.in ?? []).findIndex((x) => x.toUpperCase() === m);
    return i > 0 ? e.in![i - 1] : e.mark ?? e.id;
  };
  // A piece far smaller than the sheet (a stud on a whole span) would only blacken it: not drawn at this level, and said so.
  const all = pieces.flatMap((e) => prismsOf(e, nameOf(e)));
  const sizeOf = (p: Prism) => {
    const lo: V3 = [Infinity, Infinity, Infinity]; const hi: V3 = [-Infinity, -Infinity, -Infinity];
    for (const q of p.poly) for (const r of [q, add(q, p.t)]) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], r[i]); hi[i] = Math.max(hi[i], r[i]); }
    return { lo, hi };
  };
  const sized = all.map((p) => ({ p, ...sizeOf(p) }));
  let whole = 0;
  for (let i = 0; i < 3; i++) { let lo = Infinity; let hi = -Infinity; for (const q of sized) { lo = Math.min(lo, q.lo[i]); hi = Math.max(hi, q.hi[i]); } whole = Math.max(whole, hi - lo); }
  const prisms = sized.filter((q) => Math.max(q.hi[0] - q.lo[0], q.hi[1] - q.lo[1], q.hi[2] - q.lo[2]) >= whole * SMALL_OF_SHEET).map((q) => q.p);
  const leftOut = all.length - prisms.length;
  const views = VIEWS.map((b) => ({ b, p: project(prisms, b) }));
  const lay = { OUTLINE: [] as string[], HIDDEN: [] as string[], HOLES: [] as string[], DIM: [] as string[] };
  const counts = { OUTLINE: 0, HIDDEN: 0, HOLES: 0, DIM: 0 };
  const textsDim: DxfText[] = []; const textsCode: DxfText[] = [];
  const bE = views[0].p.bounds!; const bP = views[1].p.bounds!; const bS = views[2].p.bounds!;
  const span = Math.max(bE.maxX - bE.minX, bE.maxY - bE.minY, bP.maxY - bP.minY, bS.maxX - bS.minX, 1);
  const txt0 = Math.max(span / 75, 8);
  const gap = span * 0.16 + txt0 * 3; const txt = txt0;
  // Elevation at the top, the plan under it, the end view to the right of the elevation.
  const place = [
    { dx: -bE.minX, dy: -bE.minY },
    { dx: -bP.minX, dy: -bE.minY - gap - (bP.maxY - bP.minY) - gap * 0.2 - bP.minY + (bE.minY - bE.minY) },
    { dx: -bS.minX + (bE.maxX - bE.minX) + gap, dy: -bS.minY },
  ];
  const dimLine = (x1: number, y1: number, x2: number, y2: number) => {
    lay.DIM.push(`M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}`); counts.DIM += 1;
  };
  const dimText = (x: number, y: number, s: string, rot = 0) => textsDim.push({ x, y, h: txt * 0.8, rot, anchor: 'middle', valign: 'baseline', lines: [s] });
  /** One measured distance under (or left of) a view, with ticks at the ends. */
  const measure = (a: number, b: number, at: number, vertical: boolean) => {
    const tick = txt * 0.35;
    if (vertical) {
      dimLine(at, a, at, b); dimLine(at - tick, a, at + tick, a); dimLine(at - tick, b, at + tick, b);
      dimText(at - txt * 0.3, (a + b) / 2, n0(b - a), 90);
    } else {
      dimLine(a, at, b, at); dimLine(a, at - tick, a, at + tick); dimLine(b, at - tick, b, at + tick);
      dimText((a + b) / 2, at + txt * 0.3, n0(b - a));
    }
  };
  views.forEach(({ b, p }, vi) => {
    if (!p.bounds) return;
    const { dx, dy } = place[vi];
    const xy = (q: V2) => `${f1(q[0] + dx)} ${f1(q[1] + dy)}`;
    for (const l of p.seen) { lay.OUTLINE.push(`M${xy(l.a)}L${xy(l.b)}`); counts.OUTLINE += 1; }
    for (const l of p.hidden) { lay.HIDDEN.push(`M${xy(l.a)}L${xy(l.b)}`); counts.HIDDEN += 1; }
    for (const h of p.holes) {
      const r = h.d / 2; const x = h.x + dx; const y = h.y + dy;
      lay.HOLES.push(`M${f1(x - r)} ${f1(y)}A${f1(r)} ${f1(r)} 0 1 0 ${f1(x + r)} ${f1(y)}A${f1(r)} ${f1(r)} 0 1 0 ${f1(x - r)} ${f1(y)}`); counts.HOLES += 1;
    }
    const minX = p.bounds.minX + dx; const maxX = p.bounds.maxX + dx; const minY = p.bounds.minY + dy; const maxY = p.bounds.maxY + dy;
    measure(minX, maxX, minY - txt * 1.6, false);
    measure(minY, maxY, minX - txt * 1.6, true);
    textsCode.push({ x: minX, y: maxY + txt * 1.0, h: txt, rot: 0, anchor: 'start', valign: 'baseline', lines: [b.name] });
    // Where each piece sits, one label per name; a label that would land on another is left out.
    const placed: [number, number, number, number][] = [];
    const entries = [...p.boxes.entries()].sort((x, y) => y[1].area - x[1].area);
    for (const [name, box] of entries) {
      const label = codes[name.trim().replace(/[\s_-]+/g, '-').toUpperCase()] ?? name;
      const w = label.length * txt * 0.33; const h = txt * 0.66;
      const x = box.x + dx; const y = box.y + dy;
      const r: [number, number, number, number] = [x - w, y - h / 2, x + w, y + h / 2];
      if (placed.some((q) => q[0] < r[2] && q[2] > r[0] && q[1] < r[3] && q[3] > r[1])) continue;
      placed.push(r);
      textsCode.push({ x, y, h, rot: 0, anchor: 'middle', valign: 'middle', lines: [label] });
    }
  });
  const levelName = model.levels?.[m]?.name ?? mark;
  const qty = model.levels?.[m]?.qty ?? 1;
  const minDrawY = place[1].dy + bP.minY;
  textsCode.push({
    x: 0, y: minDrawY - txt * 4.2, h: txt * 1.1, rot: 0, anchor: 'start', valign: 'baseline',
    lines: [`${levelName}${qty > 1 ? `  (one of ${qty})` : ''} — from the model, ${pieces.length} pieces${leftOut ? `; ${leftOut} too small to see at this size are not drawn` : ''}`],
  });
  const layers: DxfLayer[] = [
    { name: 'OUTLINE', role: 'outline', d: lay.OUTLINE.join(''), count: counts.OUTLINE, texts: [] },
    { name: 'HIDDEN', role: 'hidden', d: lay.HIDDEN.join(''), count: counts.HIDDEN, texts: [] },
    { name: 'HOLES', role: 'hole', d: lay.HOLES.join(''), count: counts.HOLES, texts: [] },
    { name: 'DIM', role: 'dim', d: lay.DIM.join(''), count: counts.DIM, texts: textsDim },
    { name: 'TEXT', role: 'text', d: '', count: 0, texts: textsCode },
  ].filter((l) => l.d || l.texts.length) as DxfLayer[];
  // The sheet's size, with room for the measurements and the title.
  const xsAll: number[] = []; const ysAll: number[] = [];
  views.forEach(({ p }, vi) => { if (p.bounds) { xsAll.push(p.bounds.minX + place[vi].dx, p.bounds.maxX + place[vi].dx); ysAll.push(p.bounds.minY + place[vi].dy, p.bounds.maxY + place[vi].dy); } });
  const bounds: DxfBounds = {
    minX: Math.min(...xsAll) - txt * 3, minY: Math.min(minDrawY - txt * 5, ...ysAll) - txt,
    maxX: Math.max(...xsAll) + txt, maxY: Math.max(...ysAll) + txt * 2.5,
  };
  return {
    pieces: pieces.length, levelName,
    view: { layers, bounds, entityCount: layers.reduce((s, l) => s + l.count, 0), unitMm: 1, unitName: 'mm', warnings: [] },
  };
}

/** The view written out as a DXF, only when someone asks to download one. Arcs of the holes become CIRCLEs. Pure. */
export function viewToDxf(view: DxfView): string {
  const out: string[] = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  for (const l of view.layers) {
    for (const part of l.d.split('M').filter(Boolean)) {
      if (part.includes('A')) {
        const nums = part.split(/[ AL]/).filter(Boolean).map(Number);
        const r = nums[2];
        out.push('0', 'CIRCLE', '8', l.name, '10', String(nums[0] + r), '20', String(nums[1]), '30', '0', '40', String(r));
      } else {
        const [a, b] = part.split('L');
        const [x1, y1] = a.split(' '); const [x2, y2] = b.split(' ');
        out.push('0', 'LINE', '8', l.name, '10', x1, '20', y1, '30', '0', '11', x2, '21', y2, '31', '0');
      }
    }
    for (const t of l.texts) {
      const halign = t.anchor === 'middle' ? 1 : t.anchor === 'end' ? 2 : 0;
      out.push('0', 'TEXT', '8', l.name, '10', String(t.x), '20', String(t.y), '30', '0', '40', String(t.h), '1', t.lines.join(' '), '50', String(t.rot), '72', String(halign), '11', String(t.x), '21', String(t.y), '31', '0');
    }
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return `${out.join('\n')}\n`;
}
