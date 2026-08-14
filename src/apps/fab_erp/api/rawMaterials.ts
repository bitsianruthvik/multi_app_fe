import { fabQuery } from './client';

/**
 * One definition of "what a part can be cut from", for the screens.
 *
 * The rule is `procurementType = 'buy'` — things the shop BUYS rather than
 * makes — MINUS consumables and fasteners.
 *
 * It is deliberately not an item group, and the "Raw Materials" category is
 * still not an inclusion test: that category is a filing decision, and a part
 * is never cut from a finished good whatever anybody filed it under. The two
 * exclusions are different in kind — they are seeded system categories whose
 * contents (flux, primer, gas, bolts) are never cut into anything.
 *
 * This mirrors rawMaterialService.js on the backend. The two cannot share code
 * — separate repos — so they are kept deliberately identical, and the rule is
 * stated once on each side rather than five times across both.
 */

const NOT_CUT_FROM = ['cons', 'fast'];

export interface RawMaterial {
  id: number;
  code: string;
  name: string;
  unit?: string | null;
  thicknessMm?: number | null;
  materialForm?: string | null;
  /** System category code — read only to exclude consumables and fasteners. */
  categoryCode?: string | null;
}

/**
 * Every raw material this company can cut from.
 *
 * The cap is deliberately well above any real stock list — a fabricator runs
 * tens of plate and section grades, not thousands. It was 500, which is close
 * enough to a plausible catalog to be worth moving: the query returns no total,
 * so hitting the cap would silently drop materials from every picker on the
 * screen with nothing to show that it had happened.
 */
const MAX_MATERIALS = 2000;

export async function fetchRawMaterials(): Promise<RawMaterial[]> {
  const res = await fabQuery<{ data: RawMaterial[] }>('fabErpItemCatalog', {
    filters: { procurementType: 'buy' },
    orderBy: [{ field: 'code', direction: 'asc' }],
    pagination: { limit: MAX_MATERIALS },
  });
  /**
   * Bought, and not a consumable or a fastener.
   *
   * `procurement_type = 'buy'` is right for "did we buy this" and wrong on its
   * own for "what is this part cut from": a real catalog also holds welding
   * flux, zinc primer, CO2 cylinders and M24 bolts. Production had 48 bought
   * items of which 14 were those, so every material picker offered paint
   * alongside plate. Mirrors NOT_CUT_FROM in rawMaterialService.js.
   *
   * Filtered here rather than in the query because the exclusion is a NOT IN
   * over a joined column, which this query builder has no operator for.
   */
  return (res.data ?? []).filter((m) => !NOT_CUT_FROM.includes(m.categoryCode ?? ''));
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

/**
 * The filtered list, guaranteed to still contain whatever is already selected.
 *
 * A picker filtered by thickness can exclude the material a row is ALREADY set
 * to — a 20mm plate on a row whose thickness later reads 12, say. The value
 * then matches no option, so MUI renders the field empty while the state
 * underneath still holds the material and still submits it. The field says
 * "not set" and means "20mm plate", which is the worst of both.
 *
 * Keeping the selection pinned to the front is the honest answer: it shows what
 * the row is actually set to, and lets it be changed.
 */
export function withSelected(
  list: RawMaterial[], all: RawMaterial[], isSelected: (m: RawMaterial) => boolean,
): RawMaterial[] {
  const sel = all.find(isSelected);
  return sel && !list.some((m) => m.id === sel.id) ? [sel, ...list] : list;
}

/** How a material reads in a dropdown — sections say so, since it matters. */
export const materialLabel = (m: RawMaterial): string =>
  `${m.code}${m.materialForm === 'section' ? '  (section)' : ''}`;
