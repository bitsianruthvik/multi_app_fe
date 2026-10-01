import { useEffect, useState, type RefObject } from 'react';

/**
 * The plan's columns: the tree (sticky), "Not planned" (sticky), one column per week, a total.
 * Weeks share whatever width is left, never narrower than MIN_COL (then the plan scrolls sideways).
 */
export interface Geometry {
  treeW: number;
  backW: number;
  colW: number;
  totalW: number;
  P: number;
  /** full content width */
  width: number;
  /** left edge of week i in content coordinates */
  colX: (i: number) => number;
}

export const ROW_H = 34;
export const HEAD_H = 46;
export const MIN_COL = 48;

export function geometryFor(containerWidth: number, P: number): Geometry {
  const narrow = containerWidth > 0 && containerWidth < 900;
  const tiny = containerWidth > 0 && containerWidth < 520;
  const treeW = tiny ? 160 : narrow ? 190 : containerWidth < 1400 ? 250 : 300;
  const backW = tiny ? 64 : narrow ? 76 : 92;
  const totalW = narrow ? 60 : 72;
  const free = containerWidth - treeW - backW - totalW - 2;
  const colW = Math.max(MIN_COL, P > 0 && free > 0 ? Math.floor(free / P) : MIN_COL);
  const width = treeW + backW + colW * P + totalW;
  return { treeW, backW, colW, totalW, P, width, colX: (i) => treeW + backW + i * colW };
}

/** Re-measure when the container resizes. */
export function useGeometry(ref: RefObject<HTMLElement | null>, P: number): Geometry {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setW(el.clientWidth);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return geometryFor(w, P);
}
