import { fabQuery } from './client';

/**
 * One definition of "what a part can be cut from", for the screens.
 *
 * The rule is `procurementType = 'buy'` — things the shop BUYS rather than
 * makes. It is deliberately NOT an item group or category, which is worth
 * saying because "Raw Materials" is also the name of a category and the two are
 * unrelated: a part is never cut from a finished good, whatever anybody filed
 * it under.
 *
 * This mirrors rawMaterialService.js on the backend. The two cannot share code
 * — separate repos — so they are kept deliberately identical, and the rule is
 * stated once on each side rather than five times across both.
 */

export interface RawMaterial {
  id: number;
  code: string;
  name: string;
  unit?: string | null;
  thicknessMm?: number | null;
  materialForm?: string | null;
}

/** Every raw material this company can cut from. */
export async function fetchRawMaterials(): Promise<RawMaterial[]> {
  const res = await fabQuery<{ data: RawMaterial[] }>('fabErpItemCatalog', {
    filters: { procurementType: 'buy' },
    orderBy: [{ field: 'code', direction: 'asc' }],
    pagination: { limit: 500 },
  });
  return res.data ?? [];
}

/**
 * Of those, the ones a part of this thickness could actually be made from.
 *
 * Three groups, each for its own reason:
 *
 *   plates of that thickness — the actual match
 *   sections                 — ALWAYS. An angle is one item; a 100x100x10 is
 *                              not "a 10mm thing", so it can never be reached
 *                              by a thickness filter and omitting it would make
 *                              it unpickable rather than merely unmatched.
 *   no thickness recorded    — ALSO always. The filter exists to exclude what we
 *                              KNOW is the wrong thickness, and not knowing is
 *                              not the same as knowing it is wrong. Excluding
 *                              these made stocked items silently unpickable
 *                              while the sheet's reference tab still listed them.
 *
 * A blank or unusable thickness returns everything: with nothing to filter on,
 * offering the lot beats offering none.
 */
export function materialsForThickness(all: RawMaterial[], thick: string | number | null): RawMaterial[] {
  const t = Number(thick);
  if (thick === null || thick === undefined || String(thick).trim() === '' || !Number.isFinite(t)) {
    return all;
  }
  const sections = all.filter((m) => m.materialForm === 'section');
  const plates = all.filter(
    (m) => m.materialForm !== 'section' && m.thicknessMm != null && Number(m.thicknessMm) === t,
  );
  const unclassified = all.filter((m) => m.materialForm !== 'section' && m.thicknessMm == null);
  return [...plates, ...unclassified, ...sections];
}

/** How a material reads in a dropdown — sections say so, since it matters. */
export const materialLabel = (m: RawMaterial): string =>
  `${m.code}${m.materialForm === 'section' ? '  (section)' : ''}`;
