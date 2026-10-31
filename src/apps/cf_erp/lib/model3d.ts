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
