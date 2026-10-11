/**
 * DXF TEXT -> SVG path data, for the drawing viewer. Pure: no DOM, no React, no dependency.
 *
 * It draws EVERYTHING the file draws (the shape reader on the server, services/partGeometry.js, keeps only the
 * outline and holes). Entities: LINE, LWPOLYLINE and POLYLINE (bulges are arcs), ARC, CIRCLE, ELLIPSE, SPLINE
 * (flattened), SOLID/TRACE (outline), INSERT and DIMENSION (blocks exploded with their transforms, arrays included),
 * TEXT and MTEXT (as text items). Not drawn, and said so in `warnings`: HATCH, POINT, 3DFACE, IMAGE and the like.
 *
 * The output is ONE path string per layer, in the file's own units with y running UP (DXF); the viewer flips y once,
 * on a group. Arcs stay arcs (SVG `A`) while the transform is a similarity (rotation, uniform scale, mirror) and
 * are flattened to short lines otherwise. Binary DXF is refused with a message.
 */

export interface DxfBounds { minX: number; minY: number; maxX: number; maxY: number }

/** What a layer is for, from its name: the drawing's strong line, a drilled hole, an inner cut-out, text, or anything else. */
export type LayerRole = 'outline' | 'hole' | 'cutout' | 'dim' | 'centre' | 'hidden' | 'text' | 'other';

export interface DxfText {
  x: number; y: number;
  /** text height in drawing units */
  h: number;
  /** degrees, counter-clockwise */
  rot: number;
  anchor: 'start' | 'middle' | 'end';
  /** where the anchor sits on the first line: the baseline, the middle, or the top */
  valign: 'baseline' | 'middle' | 'top';
  lines: string[];
}

export interface DxfLayer {
  name: string;
  role: LayerRole;
  /** one SVG path (M/L/A/Z), y up; '' when the layer only has text */
  d: string;
  /** primitives drawn on it (lines, arcs, circles, polylines, splines — a block's contents count each time it is placed) */
  count: number;
  texts: DxfText[];
}

export interface DxfView {
  layers: DxfLayer[];
  bounds: DxfBounds | null;
  /** primitives drawn in all */
  entityCount: number;
  /** millimetres per drawing unit, from $INSUNITS (none or unknown = 1) */
  unitMm: number;
  /** the file's unit in words ("mm", "inch", …), or null when it does not say */
  unitName: string | null;
  warnings: string[];
}

// ── parsing the pairs ────────────────────────────────────────────────────────────────────────────────────────────────

interface Pairs { codes: number[]; vals: string[] }
interface Ent { type: string; layer: string; a: number; b: number; verts?: Ent[] }

function pairsOf(text: string): Pairs {
  const lines = text.split('\n');
  const codes: number[] = [];
  const vals: string[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = parseInt(lines[i], 10);
    if (Number.isNaN(c)) {
      // A stray blank line shifts the pairing; resynchronise on the next line that is a group code.
      i -= 1;
      continue;
    }
    codes.push(c);
    vals.push(lines[i + 1].replace(/\r$/, '').trim());
  }
  return { codes, vals };
}

const UNITS: Record<number, [string, number]> = {
  1: ['inch', 25.4], 2: ['foot', 304.8], 4: ['mm', 1], 5: ['cm', 10], 6: ['m', 1000], 10: ['yard', 914.4],
};

const SKIPPED_NOTE: Record<string, string> = {
  HATCH: 'hatch fills', POINT: 'points', IMAGE: 'images', '3DFACE': '3D faces', LEADER: 'leaders', MLEADER: 'leaders', VIEWPORT: 'viewports',
  ATTDEF: 'attribute definitions', MLINE: 'multilines', RAY: 'rays', XLINE: 'construction lines', REGION: 'regions', '3DSOLID': '3D solids', BODY: '3D bodies',
  OLE2FRAME: 'embedded objects', WIPEOUT: 'wipeouts', TOLERANCE: 'tolerances', SHAPE: 'shapes', MESH: 'meshes', SURFACE: 'surfaces', UNDERLAY: 'underlays',
};

// ── transforms: [a, b, c, d, e, f]  x' = a x + c y + e,  y' = b x + d y + f ─────────────────────────────────────────────

type M = readonly [number, number, number, number, number, number];
const ID: M = [1, 0, 0, 1, 0, 0];
const mul = (p: M, q: M): M => [
  p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5],
];
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const det = (m: M) => m[0] * m[3] - m[1] * m[2];
const translate = (x: number, y: number): M => [1, 0, 0, 1, x, y];
const FLIP_X: M = [-1, 0, 0, 1, 0, 0];
/** rotation + uniform scale (+ a mirror): arcs map onto arcs */
function similarity(m: M): { k: number; mirror: boolean } | null {
  const k = Math.sqrt(Math.abs(det(m)));
  if (!(k > 0)) return null;
  const eps = 1e-7 * k;
  if (Math.abs(m[0] - m[3]) < eps && Math.abs(m[1] + m[2]) < eps) return { k, mirror: false };
  if (Math.abs(m[0] + m[3]) < eps && Math.abs(m[1] - m[2]) < eps) return { k, mirror: true };
  return null;
}
const rotScale = (deg: number, sx: number, sy: number): M => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c * sx, s * sx, -s * sy, c * sy, 0, 0];
};

const num = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

// ── the reader ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Names that say what a layer holds. First match wins: holes, then cut-outs, then the outline. */
export function layerRole(name: string): LayerRole {
  const n = name.toUpperCase();
  if (/(^|[^A-Z])(DIM|DIMS|DIMENSIONS?)([^A-Z]|$)/.test(n)) return 'dim';
  if (/(CENT(RE|ER)|AXIS|AXES)/.test(n)) return 'centre';
  if (/(HIDDEN|HID|DASH(ED)?)/.test(n)) return 'hidden';
  if (/(^|[^A-Z])(HOLES?|DRILL(S|ING)?|BORES?)([^A-Z]|$)/.test(n)) return 'hole';
  if (/(CUT[ _-]?OUTS?|INNER|INTERIOR|SLOTS?|OPENINGS?|NOTCH)/.test(n)) return 'cutout';
  if (/(OUT(ER)?[ _-]?LINE|CONTOUR|PROFILE|BOUNDARY|EXTERIOR|^CUT$|CUT[ _-]?LINE|(^|[^A-Z])CUT([^A-Z]|$)|PERIMETER|SHAPE)/.test(n)) return 'outline';
  return 'other';
}

export const MAX_PRIMITIVES = 1_500_000;
const MAX_TEXTS = 5000;
const MAX_DEPTH = 8;

export class DxfError extends Error {}

export function parseDxf(text: string): DxfView {
  if (/^AutoCAD Binary DXF/.test(text)) throw new DxfError('This is a binary DXF. Save it as an ASCII DXF to see it here.');
  const p = pairsOf(text);
  if (!p.codes.length) throw new DxfError('This file is empty or is not a DXF.');
  const { codes, vals } = p;

  // Sections.
  const sections = new Map<string, [number, number]>();
  for (let i = 0; i + 1 < codes.length; i++) {
    if (codes[i] === 0 && vals[i] === 'SECTION' && codes[i + 1] === 2) {
      let j = i + 2;
      while (j < codes.length && !(codes[j] === 0 && vals[j] === 'ENDSEC')) j++;
      sections.set(vals[i + 1], [i + 2, j]);
      i = j;
    }
  }
  const ents = sections.get('ENTITIES');
  if (!ents) throw new DxfError('There is no ENTITIES section — this does not look like a drawing DXF.');

  let unitMm = 1;
  let unitName: string | null = null;
  const header = sections.get('HEADER');
  if (header) {
    for (let i = header[0]; i < header[1]; i++) {
      if (codes[i] === 9 && vals[i] === '$INSUNITS' && codes[i + 1] === 70) {
        const u = UNITS[parseInt(vals[i + 1], 10)];
        if (u) { unitName = u[0]; unitMm = u[1]; }
      }
    }
  }

  const readEntities = (from: number, to: number): Ent[] => {
    const out: Ent[] = [];
    let i = from;
    let last: Ent | null = null;
    while (i < to) {
      if (codes[i] !== 0) { i++; continue; }
      const type = vals[i];
      let j = i + 1;
      while (j < to && codes[j] !== 0) j++;
      const e: Ent = { type, layer: '0', a: i + 1, b: j };
      for (let k = i + 1; k < j; k++) if (codes[k] === 8) { e.layer = vals[k]; break; }
      if (type === 'VERTEX' && last?.type === 'POLYLINE') (last.verts ??= []).push(e);
      else if (type === 'SEQEND' || type === 'ATTRIB') { /* belongs to the previous INSERT or POLYLINE */ }
      else { out.push(e); last = e; }
      i = j;
    }
    return out;
  };

  // Blocks.
  interface Block { base: [number, number]; ents: Ent[] }
  const blocks = new Map<string, Block>();
  const bs = sections.get('BLOCKS');
  if (bs) {
    let i = bs[0];
    while (i < bs[1]) {
      if (codes[i] === 0 && vals[i] === 'BLOCK') {
        let name = '', bx = 0, by = 0;
        let j = i + 1;
        while (j < bs[1] && codes[j] !== 0) { if (codes[j] === 2) name = vals[j]; else if (codes[j] === 10) bx = parseFloat(vals[j]) || 0; else if (codes[j] === 20) by = parseFloat(vals[j]) || 0; j++; }
        let k = j;
        while (k < bs[1] && !(codes[k] === 0 && vals[k] === 'ENDBLK')) k++;
        blocks.set(name, { base: [bx, by], ents: readEntities(j, k) });
        i = k + 1;
      } else i++;
    }
  }

  // Accessors over the flat pairs.
  const f = (e: Ent, code: number, def = 0): number => {
    for (let k = e.a; k < e.b; k++) if (codes[k] === code) { const v = parseFloat(vals[k]); return Number.isFinite(v) ? v : def; }
    return def;
  };
  const s = (e: Ent, code: number, def = ''): string => {
    for (let k = e.a; k < e.b; k++) if (codes[k] === code) return vals[k];
    return def;
  };
  const has = (e: Ent, code: number): boolean => { for (let k = e.a; k < e.b; k++) if (codes[k] === code) return true; return false; };
  const all = (e: Ent, code: number): number[] => {
    const out: number[] = [];
    for (let k = e.a; k < e.b; k++) if (codes[k] === code) { const v = parseFloat(vals[k]); if (Number.isFinite(v)) out.push(v); }
    return out;
  };
  /** (0,0,-1) extrusion mirrors x */
  const ocs = (e: Ent): M => (f(e, 230, 1) < 0 ? FLIP_X : ID);

  // Output.
  interface Acc { name: string; role: LayerRole; d: string[]; count: number; texts: DxfText[] }
  const layers = new Map<string, Acc>();
  const layerOf = (name: string): Acc => {
    let a = layers.get(name);
    if (!a) { a = { name, role: layerRole(name), d: [], count: 0, texts: [] }; layers.set(name, a); }
    return a;
  };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const bound = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  };
  let primitives = 0;
  let capped = false;
  let textDropped = 0;
  const skipped = new Map<string, number>();
  const unknown = new Map<string, number>();

  const take = (acc: Acc): boolean => {
    if (primitives >= MAX_PRIMITIVES) { capped = true; return false; }
    primitives++; acc.count++;
    return true;
  };

  /** A polyline through points, appended as one subpath. */
  const polyPts = (acc: Acc, pts: [number, number][], closed: boolean) => {
    if (pts.length < 2) return;
    const parts: string[] = [`M${num(pts[0][0])} ${num(pts[0][1])}`];
    bound(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) { parts.push(`L${num(pts[i][0])} ${num(pts[i][1])}`); bound(pts[i][0], pts[i][1]); }
    if (closed) parts.push('Z');
    acc.d.push(parts.join(''));
  };

  /** Points along an arc about (cx, cy), source space, a0 -> a0 + sweep (radians, signed). */
  const arcPts = (cx: number, cy: number, r: number, a0: number, sweep: number, steps: number): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i <= steps; i++) { const a = a0 + (sweep * i) / steps; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return out;
  };
  const stepsFor = (sweep: number) => Math.max(8, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * 96));

  /** An arc segment, continuing the current subpath at the (already transformed) start; appends the `A` command. */
  const arcTo = (m: M, cx: number, cy: number, r: number, a0: number, sweep: number, parts: string[]) => {
    const sim = similarity(m);
    const full = Math.abs(sweep) >= 2 * Math.PI - 1e-9;
    if (!sim) {
      for (const [x, y] of arcPts(cx, cy, r, a0, sweep, stepsFor(sweep)).slice(1)) { const [tx, ty] = apply(m, x, y); parts.push(`L${num(tx)} ${num(ty)}`); bound(tx, ty); }
      return;
    }
    const flag = (sw: number) => (((sw > 0) !== sim.mirror) ? 1 : 0);
    const rr = r * sim.k;
    const seg = (b0: number, sw: number) => {
      const a1 = b0 + sw;
      const [x1, y1] = apply(m, cx + r * Math.cos(a1), cy + r * Math.sin(a1));
      parts.push(`A${num(rr)} ${num(rr)} 0 ${Math.abs(sw) > Math.PI + 1e-9 ? 1 : 0} ${flag(sw)} ${num(x1)} ${num(y1)}`);
    };
    if (full) { seg(a0, sweep / 2); seg(a0 + sweep / 2, sweep / 2); } else seg(a0, sweep);
    // bounds: sample the arc (cardinal points of a circle land on samples because 16 divides 360)
    for (const [x, y] of arcPts(cx, cy, r, a0, sweep, 16)) { const [tx, ty] = apply(m, x, y); bound(tx, ty); }
  };

  /** A bulged segment p0 -> p1 in source space (bulge = tan(sweep / 4), positive = counter-clockwise). */
  const bulgeTo = (m: M, p0: [number, number], p1: [number, number], bulge: number, parts: string[]) => {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    const chord = Math.hypot(dx, dy);
    if (!(chord > 0) || Math.abs(bulge) < 1e-9) { const [x, y] = apply(m, p1[0], p1[1]); parts.push(`L${num(x)} ${num(y)}`); bound(x, y); return; }
    const sweep = 4 * Math.atan(bulge);
    const r = chord / (2 * Math.sin(Math.abs(sweep) / 2));
    // centre: from the chord midpoint, perpendicular, at distance r cos(sweep/2); to the left of the chord for a CCW bulge
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    const off = r * Math.cos(sweep / 2);
    const nx = -dy / chord, ny = dx / chord;
    const sgn = bulge > 0 ? 1 : -1;
    const cx = mx + nx * off * sgn, cy = my + ny * off * sgn;
    const a0 = Math.atan2(p0[1] - cy, p0[0] - cx);
    arcTo(m, cx, cy, r, a0, sweep, parts);
  };

  interface Vtx { x: number; y: number; bulge: number }
  const polyline = (acc: Acc, m: M, vs: Vtx[], closed: boolean) => {
    if (vs.length < 2 || !take(acc)) return;
    const [x0, y0] = apply(m, vs[0].x, vs[0].y);
    const parts: string[] = [`M${num(x0)} ${num(y0)}`];
    bound(x0, y0);
    const n = closed ? vs.length : vs.length - 1;
    for (let i = 0; i < n; i++) bulgeTo(m, [vs[i].x, vs[i].y], [vs[(i + 1) % vs.length].x, vs[(i + 1) % vs.length].y], vs[i].bulge, parts);
    if (closed) parts.push('Z');
    acc.d.push(parts.join(''));
  };

  const spline = (acc: Acc, m: M, e: Ent) => {
    const degree = Math.max(1, Math.round(f(e, 71, 3)));
    const knots = all(e, 40);
    const weights = all(e, 41);
    const cps: [number, number][] = [];
    const xs = all(e, 10), ys = all(e, 20);
    for (let i = 0; i < Math.min(xs.length, ys.length); i++) cps.push([xs[i], ys[i]]);
    const fx = all(e, 11), fy = all(e, 21);
    const fits: [number, number][] = [];
    for (let i = 0; i < Math.min(fx.length, fy.length); i++) fits.push([fx[i], fy[i]]);
    let pts: [number, number][] = [];
    const n = cps.length;
    if (n >= degree + 1 && knots.length === n + degree + 1) {
      const t0 = knots[degree], t1 = knots[n];
      const samples = Math.min(800, Math.max(24, n * 12));
      const N = new Array<number>(degree + 1);
      const left = new Array<number>(degree + 1), right = new Array<number>(degree + 1);
      for (let si = 0; si <= samples; si++) {
        const t = si === samples ? t1 : t0 + ((t1 - t0) * si) / samples;
        // knot span
        let span = degree;
        while (span < n - 1 && t >= knots[span + 1]) span++;
        // Cox-de Boor basis (Piegl & Tiller A2.2)
        N[0] = 1;
        for (let j = 1; j <= degree; j++) {
          left[j] = t - knots[span + 1 - j]; right[j] = knots[span + j] - t;
          let saved = 0;
          for (let r = 0; r < j; r++) {
            const den = right[r + 1] + left[j - r];
            const temp = den === 0 ? 0 : N[r] / den;
            N[r] = saved + right[r + 1] * temp;
            saved = left[j - r] * temp;
          }
          N[j] = saved;
        }
        let x = 0, y = 0, w = 0;
        for (let j = 0; j <= degree; j++) {
          const idx = span - degree + j;
          const wt = weights.length === n ? weights[idx] : 1;
          x += N[j] * wt * cps[idx][0]; y += N[j] * wt * cps[idx][1]; w += N[j] * wt;
        }
        if (w) pts.push([x / w, y / w]);
      }
    }
    if (pts.length < 2) pts = fits.length >= 2 ? fits : cps;
    if (pts.length < 2 || !take(acc)) return;
    polyPts(acc, pts.map(([x, y]) => apply(m, x, y)), (f(e, 70) & 1) === 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6);
  };

  const ellipse = (acc: Acc, m: M, e: Ent) => {
    const cx = f(e, 10), cy = f(e, 20), mx = f(e, 11), my = f(e, 21), ratio = f(e, 40, 1);
    const t0 = f(e, 41, 0);
    let t1 = f(e, 42, 2 * Math.PI);
    if (t1 <= t0) t1 += 2 * Math.PI;
    const sweep = t1 - t0;
    const steps = stepsFor(sweep);
    const pts: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const t = t0 + (sweep * i) / steps;
      const ex = mx * Math.cos(t) - my * ratio * Math.sin(t), ey = my * Math.cos(t) + mx * ratio * Math.sin(t);
      pts.push(apply(m, cx + ex, cy + ey));
    }
    if (!take(acc)) return;
    polyPts(acc, pts, Math.abs(sweep - 2 * Math.PI) < 1e-9);
  };

  const cleanMtext = (raw: string): string[] => {
    const t = raw
      .replace(/\\P/gi, '\n').replace(/\\~/g, ' ')
      .replace(/\\[ACcFfHhQqTtWw][^;]*;/g, '')
      .replace(/\\[LlOoKk]/g, '')
      .replace(/\\\\/g, '\\').replace(/\\([{}])/g, '$1')
      .replace(/[{}]/g, '');
    return cleanCodes(t).split('\n');
  };
  const cleanCodes = (t: string) => t.replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[uUoO]/g, '').replace(/%%(\d{3})/g, (_, n) => String.fromCharCode(parseInt(n, 10)));

  const textItem = (acc: Acc, m: M, e: Ent) => {
    const mtext = e.type === 'MTEXT';
    let raw = s(e, 1);
    if (mtext) { for (let k = e.a; k < e.b; k++) if (codes[k] === 3) raw = vals[k] + raw; }
    if (!raw.trim()) return;
    const h0 = f(e, 40, 0) || 1;
    let x: number, y: number, rot: number;
    let anchor: DxfText['anchor'] = 'start', valign: DxfText['valign'] = 'baseline';
    const o = mul(m, ocs(e));
    if (mtext) {
      [x, y] = apply(o, f(e, 10), f(e, 20));
      rot = has(e, 11) ? (Math.atan2(f(e, 21), f(e, 11)) * 180) / Math.PI : f(e, 50);
      const at = f(e, 71, 1);
      anchor = at % 3 === 1 ? 'start' : at % 3 === 2 ? 'middle' : 'end';
      valign = at <= 3 ? 'top' : at <= 6 ? 'middle' : 'baseline';
    } else {
      const h72 = f(e, 72), h73 = f(e, 73);
      const aligned = (h72 !== 0 || h73 !== 0) && has(e, 11);
      [x, y] = apply(o, aligned ? f(e, 11) : f(e, 10), aligned ? f(e, 21) : f(e, 20));
      rot = f(e, 50);
      anchor = h72 === 1 || h72 === 4 ? 'middle' : h72 === 2 ? 'end' : 'start';
      valign = h73 === 3 ? 'top' : h73 === 2 ? 'middle' : 'baseline';
    }
    const k = Math.sqrt(Math.abs(det(m))) || 1;
    const turn = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
    if (acc.texts.length >= MAX_TEXTS) { textDropped++; return; }
    acc.texts.push({ x, y, h: h0 * k, rot: rot + turn, anchor, valign, lines: mtext ? cleanMtext(raw) : [cleanCodes(raw)] });
    bound(x, y);
  };

  const walk = (list: Ent[], m: M, inherit: string | null, depth: number) => {
    for (const e of list) {
      if (capped) return;
      const layerName = e.layer === '0' && inherit != null ? inherit : e.layer;
      switch (e.type) {
        case 'LINE': {
          const acc = layerOf(layerName);
          if (!take(acc)) break;
          const [x0, y0] = apply(m, f(e, 10), f(e, 20)), [x1, y1] = apply(m, f(e, 11), f(e, 21));
          acc.d.push(`M${num(x0)} ${num(y0)}L${num(x1)} ${num(y1)}`);
          bound(x0, y0); bound(x1, y1);
          break;
        }
        case 'LWPOLYLINE': {
          const vs: Vtx[] = [];
          for (let k = e.a; k < e.b; k++) {
            if (codes[k] === 10) vs.push({ x: parseFloat(vals[k]) || 0, y: 0, bulge: 0 });
            else if (codes[k] === 20 && vs.length) vs[vs.length - 1].y = parseFloat(vals[k]) || 0;
            else if (codes[k] === 42 && vs.length) vs[vs.length - 1].bulge = parseFloat(vals[k]) || 0;
          }
          polyline(layerOf(layerName), mul(m, ocs(e)), vs, (f(e, 70) & 1) === 1);
          break;
        }
        case 'POLYLINE': {
          if ((f(e, 70) & 64) !== 0) { skipped.set('3D meshes', (skipped.get('3D meshes') ?? 0) + 1); break; }
          const vs: Vtx[] = [];
          for (const v of e.verts ?? []) if ((f(v, 70) & 16) === 0) vs.push({ x: f(v, 10), y: f(v, 20), bulge: f(v, 42) });
          polyline(layerOf(layerName), mul(m, ocs(e)), vs, (f(e, 70) & 1) === 1);
          break;
        }
        case 'ARC': {
          const acc = layerOf(layerName);
          if (!take(acc)) break;
          const cx = f(e, 10), cy = f(e, 20), r = f(e, 40);
          const a0 = (f(e, 50) * Math.PI) / 180;
          let sweep = ((f(e, 51) - f(e, 50)) * Math.PI) / 180;
          sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          if (sweep === 0) sweep = 2 * Math.PI;
          const o = mul(m, ocs(e));
          const [x0, y0] = apply(o, cx + r * Math.cos(a0), cy + r * Math.sin(a0));
          const parts = [`M${num(x0)} ${num(y0)}`];
          bound(x0, y0);
          arcTo(o, cx, cy, r, a0, sweep, parts);
          acc.d.push(parts.join(''));
          break;
        }
        case 'CIRCLE': {
          const acc = layerOf(layerName);
          if (!take(acc)) break;
          const cx = f(e, 10), cy = f(e, 20), r = f(e, 40);
          const o = mul(m, ocs(e));
          const [x0, y0] = apply(o, cx + r, cy);
          const parts = [`M${num(x0)} ${num(y0)}`];
          bound(x0, y0);
          arcTo(o, cx, cy, r, 0, 2 * Math.PI, parts);
          parts.push('Z');
          acc.d.push(parts.join(''));
          break;
        }
        case 'ELLIPSE': ellipse(layerOf(layerName), mul(m, ocs(e)), e); break;
        case 'SPLINE': spline(layerOf(layerName), m, e); break;
        case 'SOLID': case 'TRACE': {
          const acc = layerOf(layerName);
          if (!take(acc)) break;
          const q = [0, 1, 3, 2].map((i) => apply(m, f(e, 10 + i), f(e, 20 + i)));
          polyPts(acc, q.filter((pt, i) => i === 0 || pt[0] !== q[i - 1][0] || pt[1] !== q[i - 1][1]), true);
          break;
        }
        case 'TEXT': case 'MTEXT': textItem(layerOf(layerName), m, e); break;
        case 'DIMENSION': {
          const b = blocks.get(s(e, 2));
          if (b && depth < MAX_DEPTH) walk(b.ents, m, layerName, depth + 1);
          break;
        }
        case 'INSERT': {
          const b = blocks.get(s(e, 2));
          if (!b) { unknown.set(s(e, 2), 1); break; }
          if (depth >= MAX_DEPTH) break;
          const sx = f(e, 41, 1) || 1, sy = f(e, 42, 1) || 1;
          const rot = f(e, 50);
          const cols = Math.max(1, Math.round(f(e, 70, 1))), rows = Math.max(1, Math.round(f(e, 71, 1)));
          const dc = f(e, 44), dr = f(e, 45);
          const o = mul(m, ocs(e));
          const into = mul(rotScale(rot, sx, sy), translate(-b.base[0], -b.base[1]));
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const at = mul(translate(f(e, 10) + c * dc, f(e, 20) + r * dr), into);
              walk(b.ents, mul(o, at), layerName, depth + 1);
              if (capped) return;
            }
          }
          break;
        }
        default:
          skipped.set(SKIPPED_NOTE[e.type] ?? e.type.toLowerCase(), (skipped.get(SKIPPED_NOTE[e.type] ?? e.type.toLowerCase()) ?? 0) + 1);
      }
    }
  };

  walk(readEntities(ents[0], ents[1]), ID, null, 0);

  const warnings: string[] = [];
  if (capped) warnings.push(`Only the first ${MAX_PRIMITIVES.toLocaleString('en-US')} lines and curves are drawn.`);
  if (textDropped) warnings.push(`${textDropped} text items beyond the first ${MAX_TEXTS.toLocaleString('en-US')} are not shown.`);
  if (skipped.size) warnings.push(`Not drawn: ${[...skipped.entries()].map(([k, n]) => `${n} ${k}`).join(', ')}.`);
  if (unknown.size) warnings.push(`Blocks missing from the file: ${[...unknown.keys()].join(', ')}.`);

  let list = [...layers.values()];
  // A file whose layers say nothing (everything on "0", or on names that mean nothing here) is drawn strong, not muted.
  const SHAPE_ROLES = new Set<LayerRole>(['outline', 'hole', 'cutout']);
  if (!list.some((l) => SHAPE_ROLES.has(l.role) && l.d.length)) for (const l of list) if (l.d.length && (l.role === 'other')) l.role = 'outline';
  for (const l of list) if (!l.d.length && l.texts.length) l.role = 'text';
  list = list.filter((l) => l.d.length || l.texts.length);
  list.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));

  return {
    layers: list.map((l) => ({ name: l.name, role: l.role, d: l.d.join(''), count: l.count, texts: l.texts })),
    bounds: Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null,
    entityCount: primitives,
    unitMm, unitName, warnings,
  };
}
