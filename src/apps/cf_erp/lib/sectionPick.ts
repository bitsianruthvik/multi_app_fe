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
export function newSizeValues(size: SectionSize | null, like: Pick<SectionStockRow, 'depth' | 'width' | 'thickness'> & Partial<Pick<SectionStockRow, 'sectionArea'>> | null): Record<string, string> {
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
  // SECTION_AREA (the weight comes from it) is the NEW size's, never the like bar's: worked out by the formula the like
  // bar's own area follows (an angle t(a + b − t), a flat w·t), else left blank for the person to type (a channel, a
  // beam: their tables are not a formula). 2026-10-19 — the copied area made a new size weigh as the old one.
  if (like?.sectionArea != null) {
    out.SECTION_AREA = out.THICKNESS
      ? newSectionArea(like, Number(out.DEPTH), Number(out.WIDTH), Number(out.THICKNESS))
      : flatArea(like, Number(out.DEPTH), Number(out.WIDTH));
  }
  return out;
}

/** The like bar's size as these helpers read it (sectionArea may be missing). */
type LikeSize = { depth: number | null; width: number | null; thickness?: number | null; sectionArea?: number | null };

/** A two-number size (a flat "100 x 10"): depth × width when the like bar's area is its own depth × width, else ''. */
function flatArea(like: LikeSize, a: number, b: number): string {
  const [la, lb, area] = [like.depth, like.width, like.sectionArea].map(Number);
  if (![la, lb, area, a, b].every((x) => Number.isFinite(x) && x > 0)) return '';
  return Math.abs(la * lb - area) <= area * 0.02 ? String(Math.round(a * b * 100) / 100) : '';
}

/** The new size's section area by the like bar's formula (within 2 %), rounded to 0.01 mm²; '' when none fits. */
export function newSectionArea(like: LikeSize, a: number, b: number, t: number): string {
  const [la, lb, lt, area] = [like.depth, like.width, like.thickness, like.sectionArea].map(Number);
  if (![la, lb, lt, area, a, b, t].every((x) => Number.isFinite(x) && x > 0)) return '';
  const near = (x: number) => Math.abs(x - area) <= area * 0.02;
  const round = (x: number) => String(Math.round(x * 100) / 100);
  if (near(lt * (la + lb - lt))) return round(t * (a + b - t));          // angle
  if (near(la * lt) || near(lb * lt)) return round((near(la * lt) ? a : b) * t);   // flat
  return '';
}

/** Whether to offer "Add this size to the catalog": a size was read, nothing has it exactly, and there is a bar to copy. */
export const canAddSize = (size: SectionSize | null, exact: unknown[], like: unknown) => !!size && size.dims.length >= 2 && exact.length === 0 && !!like;
