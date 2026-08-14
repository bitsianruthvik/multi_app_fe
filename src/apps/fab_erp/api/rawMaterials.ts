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
 * Of those, the ones a part of this thickness could actually be made from,
 * split into the groups a picker should show as headed groups rather than as
 * one undifferentiated list.
 *
 *   plates       of exactly that thickness — the actual match
 *   sections     ALWAYS. An angle is one item; a 100x100x10 is not "a 10mm
 *                thing", so it can never be reached by a thickness filter and
 *                omitting it would make it unpickable rather than merely
 *                unmatched.
 *   unclassified plate with NO thickness recorded. Offered only when nothing
 *                matches exactly — see below.
 *
 * WHY `unclassified` IS NOW CONDITIONAL. It used to be returned always, on the
 * reasoning that "not knowing a thickness is not the same as knowing it is
 * wrong". True, but it only justifies offering those items when there is
 * nothing better: with an exact match on the shelf, a plate whose thickness
 * nobody ever filled in is a worse answer, and including it put the same
 * handful of untyped rows into the list of every part at every thickness. Once
 * a catalog has a few of them, every picker in the BOM reads the same and the
 * thickness filter stops meaning anything.
 *
 * They stay reachable: with no exact match this falls back to them exactly as
 * before, and RawMaterialSelect additionally pins whatever a row is ALREADY set
 * to — a filter that excluded the current value would render the field empty
 * while the state underneath still held, and still submitted, the material.
 *
 * A blank or unusable thickness returns everything: with nothing to filter on,
 * offering the lot beats offering none.
 */
export interface MaterialGroups {
  plates: RawMaterial[];
  sections: RawMaterial[];
  unclassified: RawMaterial[];
  /** True when no thickness was given, so nothing was actually filtered. */
  unfiltered: boolean;
}

export function materialGroups(all: RawMaterial[], thick: string | number | null | undefined):MaterialGroups {
  const t = Number(thick);
  const isSection = (m: RawMaterial) => m.materialForm === 'section';
  if (thick === null || thick === undefined || String(thick).trim() === '' || !Number.isFinite(t)) {
    return {
      plates: all.filter((m) => !isSection(m) && m.thicknessMm != null),
      sections: all.filter(isSection),
      unclassified: all.filter((m) => !isSection(m) && m.thicknessMm == null),
      unfiltered: true,
    };
  }
  const plates = all.filter((m) => !isSection(m) && m.thicknessMm != null && Number(m.thicknessMm) === t);
  return {
    plates,
    sections: all.filter(isSection),
    // Only when there is no exact match to offer instead.
    unclassified: plates.length > 0 ? [] : all.filter((m) => !isSection(m) && m.thicknessMm == null),
    unfiltered: false,
  };
}

/** The same rule, flattened — for callers that just want one ordered list. */
export function materialsForThickness(all: RawMaterial[], thick: string | number | null | undefined): RawMaterial[] {
  const g = materialGroups(all, thick);
  return [...g.plates, ...g.unclassified, ...g.sections];
}

/**
 * How a material reads in a dropdown.
 *
 * The NAME is here as well as the code because a code alone is only readable to
 * whoever invented it: "RM-0037" and "RM-0038" are indistinguishable in a list,
 * and picking the wrong one is not a mistake anything downstream can catch.
 * Sections still say so, since it changes what the row means.
 */
export const materialLabel = (m: RawMaterial): string => {
  const name = (m.name ?? '').trim();
  return `${m.code}${name && name !== m.code ? ` — ${name}` : ''}`
    + (m.materialForm === 'section' ? '  (section)' : '');
};

/** Thickness as it reads beside a material, or null when none is recorded. */
export const thicknessLabel = (m: RawMaterial): string | null =>
  (m.thicknessMm == null ? null : `${Number(m.thicknessMm)} mm`);
