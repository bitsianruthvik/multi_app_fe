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
