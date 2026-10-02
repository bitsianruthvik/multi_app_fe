import type { NestOffcut, NestPiece, NestRules } from '../api/types';

/**
 * The geometry and the words behind the plate diagram (components/Nesting/
 * PlateDiagram.tsx). Pure, so the jsdom test can hold it to its numbers.
 *
 * WHAT THE COLOURS SAY (the user, 2026-10-02: "highlight kerfing and other
 * things with different colours so we know if it is optimal and if it is
 * following the rules"):
 *   parts          coloured by SEQUENCE — the cut order is the point of a plan
 *                  (Plate > Sequence > Row > Part) — with a boundary drawn
 *                  round each sequence's group;
 *   kerf           its own band: the one-kerf halo round every part, the rim
 *                  included (kerf is charged at the rim);
 *   shared cut     a common boundary cut once — the only real gain — in a
 *                  colour of its own, so a good plate visibly has many;
 *   rim            the kerf-wide band at the plate edge, with the usable edge
 *                  dashed;
 *   offcut         kept plate, claimable later (green hatch);
 *   scrap          everything else (red tint).
 *
 * Coordinates are the packer's: mm, x along the plate length, y along its
 * width, origin at the bottom-left corner (as the DXF).
 */

/** Sequence colours: the chart tokens minus magenta (shared cuts) and amber (kerf). */
const SEQ_TOKENS = [1, 2, 6, 5, 7, 8];
export const seqColour = (seqNo: number) => `var(--c-chart-${SEQ_TOKENS[(Math.max(1, seqNo) - 1) % SEQ_TOKENS.length]})`;

/** The non-sequence colours, named once so the legend and the drawing agree. */
export const DIAGRAM_COLOURS = {
  kerf: 'var(--c-warning-200)',
  kerfEdge: 'var(--c-warning-600)',
  shared: 'var(--c-chart-3)',
  rim: 'var(--c-neutral-200)',
  rimEdge: 'var(--c-text-3)',
  offcut: 'var(--c-success-600)',
  offcutFill: 'var(--c-success-50)',
  scrap: 'var(--c-danger-50)',
  scrapLine: 'var(--c-danger-200)',
} as const;

/** At or above this zoom the diagram draws dimensions on itself. */
export const DIM_ZOOM = 2;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 40;
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export type Laid = NestPiece & { x: number; y: number };
export const laidOut = (pieces: NestPiece[]): Laid[] => pieces.filter((p): p is Laid => p.x != null && p.y != null);

export interface SeqBox { seqNo: number; x0: number; y0: number; x1: number; y1: number; pieces: number }

/** Each sequence's bounding box, in cut order. */
export function seqBoxes(pieces: Laid[]): SeqBox[] {
  const by = new Map<number, SeqBox>();
  for (const p of pieces) {
    const b = by.get(p.seqNo);
    if (!b) by.set(p.seqNo, { seqNo: p.seqNo, x0: p.x, y0: p.y, x1: p.x + p.length, y1: p.y + p.width, pieces: 1 });
    else {
      b.x0 = Math.min(b.x0, p.x); b.y0 = Math.min(b.y0, p.y);
      b.x1 = Math.max(b.x1, p.x + p.length); b.y1 = Math.max(b.y1, p.y + p.width);
      b.pieces += 1;
    }
  }
  return [...by.values()].sort((a, b) => a.seqNo - b.seqNo);
}

export interface SharedCut { x1: number; y1: number; x2: number; y2: number; length: number; vertical: boolean }

/**
 * Common boundaries: two parts whose facing edges are exactly one kerf apart
 * and overlap — one cut serves both. The same rule nestGeometry charges cut
 * length by. Each is drawn as a line down the middle of the shared kerf.
 */
export function sharedCuts(pieces: Laid[], kerf: number): SharedCut[] {
  const q = (v: number) => Math.round(v * 1000);
  const byLeft = new Map<number, Laid[]>();
  const byBottom = new Map<number, Laid[]>();
  for (const p of pieces) {
    const l = q(p.x); const b = q(p.y);
    if (!byLeft.has(l)) byLeft.set(l, []);
    byLeft.get(l)!.push(p);
    if (!byBottom.has(b)) byBottom.set(b, []);
    byBottom.get(b)!.push(p);
  }
  const out: SharedCut[] = [];
  for (const p of pieces) {
    for (const o of byLeft.get(q(p.x + p.length + kerf)) ?? []) {
      const y0 = Math.max(p.y, o.y); const y1 = Math.min(p.y + p.width, o.y + o.width);
      if (o !== p && y1 - y0 > 1e-6) {
        const x = p.x + p.length + kerf / 2;
        out.push({ x1: x, y1: y0, x2: x, y2: y1, length: y1 - y0, vertical: true });
      }
    }
    for (const o of byBottom.get(q(p.y + p.width + kerf)) ?? []) {
      const x0 = Math.max(p.x, o.x); const x1 = Math.min(p.x + p.length, o.x + o.length);
      if (o !== p && x1 - x0 > 1e-6) {
        const y = p.y + p.width + kerf / 2;
        out.push({ x1: x0, y1: y, x2: x1, y2: y, length: x1 - x0, vertical: false });
      }
    }
  }
  return out;
}

/** The gap between consecutive sequences, where they face each other. */
export interface SeqGap { from: number; to: number; gap: number; x: number; y: number; vertical: boolean }

export function seqGaps(boxes: SeqBox[]): SeqGap[] {
  const out: SeqGap[] = [];
  for (let i = 1; i < boxes.length; i++) {
    const a = boxes[i - 1]; const b = boxes[i];
    const dy = Math.max(b.y0 - a.y1, a.y0 - b.y1);
    const dx = Math.max(b.x0 - a.x1, a.x0 - b.x1);
    if (dy >= dx && dy > 0) {
      const lo = Math.max(a.x0, b.x0); const hi = Math.min(a.x1, b.x1);
      out.push({ from: a.seqNo, to: b.seqNo, gap: dy, x: hi > lo ? (lo + hi) / 2 : (a.x0 + a.x1) / 2, y: b.y0 > a.y1 ? (a.y1 + b.y0) / 2 : (b.y1 + a.y0) / 2, vertical: false });
    } else if (dx > 0) {
      const lo = Math.max(a.y0, b.y0); const hi = Math.min(a.y1, b.y1);
      out.push({ from: a.seqNo, to: b.seqNo, gap: dx, x: b.x0 > a.x1 ? (a.x1 + b.x0) / 2 : (b.x1 + a.x0) / 2, y: hi > lo ? (lo + hi) / 2 : (a.y0 + a.y1) / 2, vertical: true });
    }
  }
  return out;
}

/** A number of mm, short: 1200, 2.5. */
export const dim = (n: number) => `${Math.round(n * 10) / 10}`;

/** Roughly how wide a label is, in px, at a font size in px. Digits and × are ~0.6em. */
export const textPx = (text: string, fontPx: number) => text.length * fontPx * 0.6;

/**
 * A dimension label in DRAWING space (mm, y down) with the screen box it takes
 * (px), so labels that would collide can be dropped. `kind` is what it
 * measures; `priority` decides who stays when two collide (lower first).
 */
export interface DimLabel {
  key: string;
  kind: 'part' | 'kerf' | 'gap' | 'offcut' | 'plate';
  text: string;
  x: number;
  y: number;
  /** Rotate 90° (a vertical dimension). */
  vertical?: boolean;
  priority: number;
  fill: string;
}

/**
 * The dimension labels that FIT at this scale (px per mm) inside the visible
 * window, decluttered: a part's L × W only when it fits inside the part, a
 * kerf or gap width only where its line is long enough on screen to carry it,
 * an offcut's usable size only inside the offcut, and nothing over anything
 * already placed. Below DIM_ZOOM nothing is returned.
 *
 *   view   the visible window in drawing space { x, y, w, h } (y down)
 *   flipY  plate y -> drawing y
 */
export function dimensionLabels({
  zoom, scale, fontPx, pieces, kerf, cuts, gaps, offcuts, view, flipY,
}: {
  zoom: number; scale: number; fontPx: number; pieces: Laid[]; kerf: number;
  cuts: SharedCut[]; gaps: SeqGap[]; offcuts: NestOffcut[];
  view: { x: number; y: number; w: number; h: number };
  flipY: (y: number) => number;
}): DimLabel[] {
  if (zoom < DIM_ZOOM) return [];
  const inView = (x: number, y: number) => x >= view.x && x <= view.x + view.w && y >= view.y && y <= view.y + view.h;
  const cand: (DimLabel & { wPx: number; hPx: number })[] = [];
  const hPx = fontPx * 1.25;
  // A big part zoomed into fills the window and its centre is off screen, so a
  // label goes at the middle of the part's VISIBLE piece, and must fit there.
  const visible = (x0: number, y0: number, x1: number, y1: number) => {
    const a = Math.max(x0, view.x); const b = Math.min(x1, view.x + view.w);
    const c = Math.max(y0, view.y); const d = Math.min(y1, view.y + view.h);
    return b > a && d > c ? { x: (a + b) / 2, y: (c + d) / 2, w: b - a, h: d - c } : null;
  };
  for (const p of pieces) {
    const text = `${dim(p.length)} × ${dim(p.width)}`;
    const wPx = textPx(text, fontPx);
    const v = visible(p.x, flipY(p.y + p.width), p.x + p.length, flipY(p.y));
    if (!v || v.w * scale < wPx + 6 || v.h * scale < hPx + 2) continue;
    cand.push({ key: `p${p.seqNo}-${p.rowNo}-${p.posNo}-${p.x}-${p.y}`, kind: 'part', text, x: v.x, y: v.y, priority: 1, fill: '#fff', wPx, hPx });
  }
  for (const [i, o] of offcuts.entries()) {
    if (!o.rect || o.rect.x == null || o.rect.y == null) continue;
    const text = `${o.offcutNo} ${dim(o.rect.length)} × ${dim(o.rect.width)}`;
    const wPx = textPx(text, fontPx);
    const v = visible(o.rect.x, flipY(o.rect.y + o.rect.width), o.rect.x + o.rect.length, flipY(o.rect.y));
    if (!v || v.w * scale < wPx + 6 || v.h * scale < hPx * 2) continue;
    cand.push({ key: `o${i}`, kind: 'offcut', text, x: v.x, y: v.y + (hPx / scale), priority: 2, fill: 'var(--c-success-800)', wPx, hPx });
  }
  for (const [i, c] of cuts.entries()) {
    const text = `${dim(kerf)}`;
    const wPx = textPx(text, fontPx);
    // The visible stretch of the cut (a line: one side has no width).
    const ya = flipY(Math.max(c.y1, c.y2)); const yb = flipY(Math.min(c.y1, c.y2));
    const v = visible(Math.min(c.x1, c.x2) - 1e-6, ya - 1e-6, Math.max(c.x1, c.x2) + 1e-6, yb + 1e-6);
    if (!v || Math.max(v.w, v.h) * scale < Math.max(wPx, hPx) * 2.5) continue;
    cand.push({ key: `k${i}`, kind: 'kerf', text, x: v.x, y: v.y, vertical: c.vertical, priority: 3, fill: DIAGRAM_COLOURS.shared, wPx, hPx });
  }
  for (const [i, g] of gaps.entries()) {
    const text = `gap ${dim(g.gap)}`;
    const wPx = textPx(text, fontPx);
    const x = g.x; const y = flipY(g.y);
    if (inView(x, y)) cand.push({ key: `g${i}`, kind: 'gap', text, x, y, vertical: g.vertical, priority: 2, fill: 'var(--c-text-2)', wPx, hPx });
  }
  // Declutter: greedy by priority, drop anything that overlaps a kept label.
  cand.sort((a, b) => a.priority - b.priority);
  const kept: (DimLabel & { wPx: number; hPx: number })[] = [];
  const boxOf = (l: DimLabel & { wPx: number; hPx: number }) => {
    const w = (l.vertical ? l.hPx : l.wPx) / scale; const h = (l.vertical ? l.wPx : l.hPx) / scale;
    return { x0: l.x - w / 2, x1: l.x + w / 2, y0: l.y - h / 2, y1: l.y + h / 2 };
  };
  for (const l of cand) {
    const b = boxOf(l);
    if (kept.some((k) => { const o = boxOf(k); return b.x0 < o.x1 && o.x0 < b.x1 && b.y0 < o.y1 && o.y0 < b.y1; })) continue;
    kept.push(l);
    if (kept.length >= 400) break;          // a screenful is plenty
  }
  return kept.map((l) => ({ key: l.key, kind: l.kind, text: l.text, x: l.x, y: l.y, vertical: l.vertical, priority: l.priority, fill: l.fill }));
}

/** The rule badge, in words: "Follows the rules" / "2 rules broken" / "No layout". */
export function ruleBadge(rules: NestRules | null | undefined): { tone: 'success' | 'warning' | 'neutral'; mark: string; label: string } {
  if (!rules) return { tone: 'neutral', mark: '–', label: 'Not checked' };
  if (rules.status === 'none') return { tone: 'neutral', mark: '–', label: 'No layout to check' };
  const broken = rules.checks.filter((c) => c.ok === false).length;
  return broken
    ? { tone: 'warning', mark: '⚠', label: `${broken} ${broken === 1 ? 'rule' : 'rules'} broken` }
    : { tone: 'success', mark: '✓', label: 'Follows the rules' };
}

/** The legend entries that are not sequences, in drawing order. */
export const LEGEND = [
  { key: 'kerf', label: 'Kerf', help: 'The one-kerf band round every part, charged at the rim too.' },
  { key: 'shared', label: 'Shared cut', help: 'A common boundary: two parts one kerf apart, cut once — the real saving.' },
  { key: 'rim', label: 'Rim / edge margin', help: 'The kerf-wide band at the plate edge; the dashed line is the usable edge.' },
  { key: 'offcut', label: 'Offcut (kept)', help: 'Plate kept for later — claimable by another job.' },
  { key: 'scrap', label: 'Scrap', help: 'What is left: wasted.' },
] as const;
