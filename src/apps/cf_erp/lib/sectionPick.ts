import type { NearSize, SectionSize, SectionStockRow } from '../api/cutting';

/**
 * The section picker's words and choices when the typed size is not in the catalog (components/SectionPicker.tsx,
 * walkthrough 2026-10-18 step 13). Pure — the server reads the size and ranks the nearest sizes (GET
 * /section-stock/nearest, lib/sectionSize.js); this says them and lays them out.
 */

/** How many bars of one near size are listed (the rest are found by typing that size). */
export const BARS_PER_SIZE = 6;

/** "110 × 110 × 12" — a typed size as it would be named. */
export function sizeLabel(size: SectionSize | null): string {
  if (!size?.dims.length) return '';
  return `${size.profile ? `${size.profile} ` : ''}${size.dims.map((x) => String(x)).join(' × ')}`;
}

/** "100 × 100 × 12 — legs 10 mm smaller · about 10% lighter" — the head of one near size's group. */
export function nearWords(g: Pick<NearSize, 'label' | 'differs' | 'weight' | 'weightPct'>): string {
  const pct = Math.abs(g.weightPct);
  const weight = g.weight === 'same' || pct === 0 ? 'about the same weight' : `about ${pct}% ${g.weight}`;
  return `${g.label} — ${g.differs} · ${weight}`;
}

/** The options of the nearest sizes, in order, each knowing its group; at most BARS_PER_SIZE per size. */
export function nearOptions(nearest: NearSize[]): { row: SectionStockRow; group: string; more: number }[] {
  return nearest.flatMap((g) => g.bars.slice(0, BARS_PER_SIZE).map((row, i) => ({
    row, group: nearWords(g), more: i === Math.min(g.bars.length, BARS_PER_SIZE) - 1 ? Math.max(0, g.bars.length - BARS_PER_SIZE) : 0,
  })));
}

/**
 * The size values a new catalog bar gets when it is made like `like` (a bar of the nearest size): DEPTH and WIDTH are
 * the legs — the longer one where `like` has its longer one —, THICKNESS the thickness. A dim not typed is left as the
 * like bar has it. Keys are spec codes.
 */
export function newSizeValues(size: SectionSize | null, like: Pick<SectionStockRow, 'depth' | 'width' | 'thickness'> | null): Record<string, string> {
  if (!size?.dims.length) return {};
  const d = size.dims;
  const out: Record<string, string> = {};
  if (d.length >= 2) {
    const [long, short] = [d[0], d[1]].sort((a, b) => b - a);
    const depthLonger = (like?.depth ?? 0) >= (like?.width ?? 0);
    out.DEPTH = String(depthLonger ? long : short);
    out.WIDTH = String(depthLonger ? short : long);
  } else {
    out.DEPTH = String(d[0]);
    out.WIDTH = String(d[0]);
  }
  if (d.length >= 3) out.THICKNESS = String(d[2]);
  return out;
}

/** Whether to offer "Add this size to the catalog": a size was read, nothing has it exactly, and there is a bar to copy. */
export const canAddSize = (size: SectionSize | null, exact: unknown[], like: unknown) => !!size && size.dims.length >= 2 && exact.length === 0 && !!like;
