import type { Model3D, Model3DElement } from '../api/drawings';

/** The first of `marks` (deepest level first) that the model has — the level the 3D view lights up. Pure. */
export function litMark(model: Model3D, marks: (string | null | undefined)[]): string | null {
  const known = new Set<string>();
  for (const e of model.elements) { if (e.mark) known.add(e.mark.toUpperCase()); for (const x of e.in ?? []) known.add(x.toUpperCase()); }
  for (const m of marks) if (m && known.has(m.toUpperCase())) return m.toUpperCase();
  return null;
}

/** An element belongs to the lit level: its own mark, or a level above it. */
export const isLit = (e: Model3DElement, lit: string | null): boolean => !!lit && (e.mark?.toUpperCase() === lit || (e.in ?? []).some((x) => x.toUpperCase() === lit));

/** A plate part shown on its own in 3D: its DXF outline and holes (mm; ring 0 the outline) and its thickness. */
export interface Part3D { label: string; rings: number[][][]; thicknessMm: number; lengthMm: number; widthMm: number }

const n0 = (v: number) => Math.round(v).toLocaleString('en-IN');

/** A piece's size in words, for the 3D view's click note: a member's length and section, a plate's L × W × T. Pure. */
export function sizeWords(x: Model3DElement | Part3D): string {
  if ('rings' in x) return `${n0(x.lengthMm)} × ${n0(x.widthMm)} × ${n0(x.thicknessMm)} mm`;
  if (x.plate) {
    const xs = x.plate.pts.map((p) => p[0]); const ys = x.plate.pts.map((p) => p[1]);
    return `${n0(Math.max(...xs) - Math.min(...xs))} × ${n0(Math.max(...ys) - Math.min(...ys))} × ${n0(x.plate.t)} mm (shaped)`;
  }
  if (x.box) return `${x.box.size.map(n0).join(' × ')} mm`;
  if (!x.member) return '';
  const [a, b] = [x.member.a, x.member.b];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const s = x.member.section;
  const sec = s.type === 'pipe' ? `pipe Ø${n0(s.d)} × ${n0(s.t)}`
    : s.type === 'I' ? `I ${n0(s.h)} deep · flanges ${n0(s.bTop)}×${n0(s.tTop)}${s.bBot !== s.bTop || s.tBot !== s.tTop ? ` / ${n0(s.bBot)}×${n0(s.tBot)}` : ''} · web ${n0(s.tw)}`
      : `box ${n0(s.w)} × ${n0(s.h)} · plates ${n0(s.bTop)}×${n0(s.tTop)} / ${n0(s.bBot)}×${n0(s.tBot)} · webs ${n0(s.tw)}`;
  return `length ${n0(L)} mm · ${sec}`;
}

/** The thickness a part's file name carries ("TP_16mm_E350.dxf" → 16), else null. Pure. */
export const thicknessFromName = (name: string | null | undefined): number | null => {
  const m = /(?:^|[_\s-])(\d+(?:\.\d+)?)\s*mm(?![a-z])/i.exec(String(name ?? ''));
  return m ? Number(m[1]) : null;
};

/** A mark as the line's codes are keyed ("v13 tf" → "V13-TF"). Pure. */
export const normMark = (s: string) => s.trim().replace(/[\s_-]+/g, '-').toUpperCase();

/**
 * The element under a picked vertex: `owner[i]` is element i's run of vertices in the merged pick mesh (in element
 * order, empty runs allowed). Binary search; -1 when the vertex is in no run. Pure.
 */
export function ownerAt(owner: { start: number; count: number }[], v: number): number {
  let lo = 0, hi = owner.length - 1, best = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (owner[mid].start <= v) { best = mid; lo = mid + 1; } else hi = mid - 1; }
  return best >= 0 && v < owner[best].start + owner[best].count ? best : -1;
}

/** The pieces a pick selects: the one clicked, or every piece with its mark ("all of this mark"). Pure. */
export function selectionOf(model: Model3D, index: number, allOfMark: boolean): number[] {
  const e = model.elements[index];
  if (!e) return [];
  if (!allOfMark || !e.mark) return [index];
  const m = e.mark.toUpperCase();
  const out: number[] = [];
  model.elements.forEach((x, i) => { if (x.mark?.toUpperCase() === m) out.push(i); });
  return out;
}

/** What a piece is, in words: a member's section kind, a shaped plate, a plate. Pure. */
export function kindWords(e: Model3DElement): string {
  if (e.plate) return 'Shaped plate';
  if (e.box) return 'Plate';
  const t = e.member?.section.type;
  return t === 'pipe' ? 'Member (pipe)' : t === 'I' ? 'Member (I section)' : t === 'box' ? 'Member (box section)' : 'Piece';
}

export interface Selection3D {
  /** the clicked piece */
  index: number;
  /** every piece selected (the clicked one, or all of its mark) */
  indices: number[];
  label: string;
  mark: string | null;
  /** the part's code on this line, without the order (from the model endpoint's `codes`) */
  code: string | null;
  kind: string;
  size: string;
  /** the levels it is in (its `in`) */
  levels: string[];
  /** a shaped plate's bolt holes, by diameter */
  holes: { d: number; n: number }[];
  holeCount: number;
  /** how many pieces in the model carry this mark */
  sameMark: number;
  /** its position is by a stated rule, not read from a drawing */
  byRule: boolean;
}

/** The side panel's facts for a selection. Pure. */
export function selectionFacts(model: Model3D, index: number, allOfMark: boolean, codes: Record<string, string> = {}): Selection3D | null {
  const e = model.elements[index];
  if (!e) return null;
  const indices = selectionOf(model, index, allOfMark);
  const mark = e.mark ?? null;
  const sameMark = mark ? model.elements.filter((x) => x.mark?.toUpperCase() === mark.toUpperCase()).length : 1;
  const byD = new Map<number, number>();
  for (const [, , d] of e.plate?.holes ?? []) byD.set(d, (byD.get(d) ?? 0) + 1);
  const holes = [...byD.entries()].map(([d, n]) => ({ d, n })).sort((a, b) => b.n - a.n || b.d - a.d);
  return {
    index, indices, label: e.label ?? mark ?? e.id, mark, code: mark ? codes[normMark(mark)] ?? null : null,
    kind: kindWords(e), size: sizeWords(e), levels: [...(e.in ?? [])], holes, holeCount: e.plate?.holes?.length ?? 0, sameMark, byRule: !!e.rule,
  };
}

/**
 * What the 3D view shows — ONE toggle group (user, 2026-11-01: "toggle between just this part and this part in the
 * entire view"):
 *   part      a plate part's own DXF, extruded (no piece selected)
 *   selection just the selected piece(s)
 *   level     just the open level
 *   whole     everything; the selection (else the open level) highlighted, the rest faint
 */
export type Scope3D = 'part' | 'selection' | 'level' | 'whole';

/** The toggle's buttons for what there is to show. "Just this part" is the selection when there is one, else the part's DXF. Pure. */
export function scopeChoices(o: { hasModel: boolean; hasPart: boolean; lit: string | null; selected: boolean }): { value: Scope3D; label: string }[] {
  const out: { value: Scope3D; label: string }[] = [];
  if (o.hasModel && o.selected) out.push({ value: 'selection', label: 'Just this part' });
  else if (o.hasPart) out.push({ value: 'part', label: 'Just this part' });
  if (o.hasModel && o.lit) out.push({ value: 'level', label: 'Just this level' });
  if (o.hasModel) out.push({ value: 'whole', label: 'Whole structure' });
  return out;
}

/** The scope to show when what can be shown changes: keep the current one if it is still offered. Pure. */
export function settleScope(cur: Scope3D, o: Parameters<typeof scopeChoices>[0]): Scope3D {
  const vals = scopeChoices(o).map((c) => c.value);
  if (vals.includes(cur)) return cur;
  if (cur === 'part' && vals.includes('selection')) return 'selection';
  if (cur === 'selection' && vals.includes('part') && !o.hasModel) return 'part';
  return vals.includes('whole') ? 'whole' : vals[0] ?? 'whole';
}

/** Is element `i` shown in this scope? (`selected` = the selected indices.) Pure. */
export function shownIn(scope: Scope3D, e: Model3DElement, i: number, lit: string | null, selected: ReadonlySet<number>): boolean {
  if (scope === 'whole') return true;
  if (scope === 'selection') return selected.has(i);
  if (scope === 'level') return isLit(e, lit) || selected.has(i);
  return false;
}

/** The 3D views' mouse gestures, for their hint line. */
export const GESTURES_3D = 'Drag to turn · Ctrl / Shift + drag, middle or right drag to pan · scroll to zoom at the cursor · double-click a piece to turn about it, empty space to fit';
