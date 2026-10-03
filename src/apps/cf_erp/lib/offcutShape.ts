import type { Offcut } from '../api/types';

/**
 * An offcut's outline, drawn from the nest: the closed rings normalised to the
 * bounding box (the plate's coordinates are mm, so the bbox corner is the
 * origin), filled, with the biggest clean rectangle dashed inside it. Rings
 * are one path with even-odd fill, so a hole stays a hole.
 */
export function outlinePath(outline: Offcut['outline'] | null | undefined, bbox: { x: number; y: number } | null | undefined): string {
  const rings = (outline ?? []).filter((r) => Array.isArray(r) && r.length >= 3);
  if (!rings.length) return '';
  const ox = bbox?.x ?? Math.min(...rings.flat().map((p) => p[0]));
  const oy = bbox?.y ?? Math.min(...rings.flat().map((p) => p[1]));
  return rings.map((r) => `${r.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x - ox)} ${round(y - oy)}`).join(' ')} Z`).join(' ');
}
const round = (n: number) => Math.round(n * 100) / 100;

