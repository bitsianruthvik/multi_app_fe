/**
 * catalog.ts — typed wrappers for EU-15's catalog routes (`routes/catalog.js`).
 *
 * `listCatalogItems` replaces the `fabQuery('fabErpItemCatalog', { limit: 20000 })`
 * the Items tab used to run on every load, plus its per-item `/catalog/sizes`
 * follow-up call: the server now joins size and derived weight into each row.
 * `createCatalogItem` replaces the two-step "generate a code, then insert" the
 * Add Item dialog used to do — the server mints the code and writes the item's
 * custom fields in the SAME transaction, so a mid-sequence failure can no
 * longer burn a code sequence on an item that never saved.
 */

import { fabGet, fabPost, fabPatch, fabDel } from './client';
import type { FabItemCatalog } from '../types';

/** One row of `GET /catalog/items` — every `fabErpItemCatalog` column plus joined taxonomy names, sizes and weight. */
export interface CatalogItemRow extends FabItemCatalog {
  categoryCode: string | null;
  thicknessMm?: number | string | null;
  materialForm?: string | null;
  densityKgM3?: number | string | null;
  sectionAreaMm2?: number | string | null;
  sizes: {
    // `catalogPickerService.catalogSizes` reads these off `fab_field_values`
    // and only casts to Number() when the field carries `value_num` — a
    // dimension saved with no numeric answer falls back to `value_text`
    // (typically `''`), so the wire shape is honestly `number | string | null`,
    // not just `number | null`.
    thicknessMm: number | string | null;
    widthMm: number | string | null;
    lengthMm: number | string | null;
    material: string | null;
    grade: string | null;
  };
  unitWeightKg: number | null;
}

/**
 * Which list the Item Catalog page is showing. `catalog` = things you buy,
 * receive and stock; `template` = template parts (sized on an order);
 * `cutplate` = per-order cut plates. Omitted = everything (the pickers).
 */
export type ItemKind = 'catalog' | 'template' | 'cutplate';

/** True for a template part or cut plate — never bought, received or stocked by hand. */
export const isNonCatalog = (it: { isCataloged?: number | null }) => Number(it.isCataloged ?? 1) === 0;

export interface CatalogItemsQuery {
  kind?: ItemKind;
  /**
   * Size-aware on the server (`catalogItemsService.parseCatalogSearch`):
   * "25x1500" / "25 x 1500 x 9000" are thickness(+width(+length)), "12mm" is
   * a thickness, "E350" / "E250BO" is a grade, and whatever is left matches
   * name/code. Every caller gets the grammar for free.
   */
  q?: string;
  /** Exact match on the item's `material` / `grade` field value — pick from `getCatalogFacets`. */
  material?: string;
  grade?: string;
  page?: number;
  pageSize?: number;
  procurementType?: string;
  materialForm?: string;
  thicknessMin?: number | string;
  thicknessMax?: number | string;
  /** REPAIR-B: ANDed with everything else — a caller may combine e.g. `categoryId` + `q`. */
  categoryId?: number;
  groupId?: number;
  subgroupId?: number;
  /** `1` filters to `category_id IS NULL` — its own filter, not `categoryId=0`, since 0 is never a valid id. */
  uncategorized?: 1;
  /** One of `routes/catalog.js`'s `SORT_COLUMNS` keys: name | code | unit | procurementType | materialForm | categoryName | groupName | createdAt | size | thicknessMm. */
  sort?: string;
  dir?: 'asc' | 'desc';
}

export interface CatalogItemsResponse {
  rows: CatalogItemRow[];
  total: number;
  page: number;
  pageSize: number;
}

export const listCatalogItems = (query: CatalogItemsQuery = {}) =>
  fabGet<CatalogItemsResponse>('catalog/items', query as unknown as Record<string, unknown>);

/** One filter option and how many live items sit under it. */
export interface FacetCount { value: string; n: number }

/**
 * Counts over the WHOLE live catalog (not the current result) — what the
 * filter dropdowns print beside each option. Taxonomy facets are keyed by id.
 */
export interface CatalogFacets {
  category: Record<string, number>;
  group: Record<string, number>;
  subgroup: Record<string, number>;
  materialForm: FacetCount[];
  material: FacetCount[];
  grade: FacetCount[];
}

/** Counted within one list (tab) when `kind` is given, so a chip never promises rows the tab cannot show. */
export const getCatalogFacets = (kind?: ItemKind) =>
  fabGet<CatalogFacets>('catalog/items/facets', kind ? { kind } : undefined);

/**
 * One patch over many items. Only the keys present are applied: taxonomy and
 * procurement update columns, material/grade write field values. The server
 * validates the sub-group → group → category chain.
 */
export interface CatalogBulkPatch {
  categoryId?: number | null;
  groupId?: number | null;
  subgroupId?: number | null;
  procurementType?: string;
  material?: string | null;
  grade?: string | null;
}

export interface CatalogBulkResult {
  ok: boolean;
  updated: number;
  rejected: Array<{ scopeId: number; fieldKey: string; why: string }>;
}

export const bulkUpdateCatalogItems = (ids: number[], patch: CatalogBulkPatch) =>
  fabPost<CatalogBulkResult>('catalog/items/bulk', { ids, patch });

/** Inline size edit from the grid — `null` clears a dimension. */
export interface CatalogSizePatch {
  thickness_mm?: number | null;
  width_mm?: number | null;
  length_mm?: number | null;
}

export interface CatalogSizePatchResult {
  ok: boolean;
  /** What is stored NOW (a rejected value leaves the old one in place). */
  sizes: CatalogItemRow['sizes'];
  unitWeightKg: number | null;
  rejected: Array<{ fieldKey: string; why: string }>;
}

export const patchCatalogItemFields = (id: number, patch: CatalogSizePatch) =>
  fabPatch<CatalogSizePatchResult>(`catalog/items/${id}/fields`, patch as unknown as Record<string, unknown>);

export interface NewCatalogItem {
  name: string;
  /** Blank generates one from the category — see `codegenService.generateCode`. */
  code?: string | null;
  /** The segment an order row of this item carries (TF); blank = initials of the name. */
  shortCode?: string | null;
  unit?: string | null;
  description?: string | null;
  categoryId: number;
  groupId?: number | null;
  subgroupId?: number | null;
  hsnCode?: string | null;
  procurementType?: 'make' | 'buy';
  mrpPolicy?: 'manual' | 'reorder_point' | 'lot_for_lot';
  leadTimeDays?: number | null;
  thicknessMm?: number | string | null;
  materialForm?: string | null;
}

export interface CreateCatalogItemResult {
  ok: boolean;
  id: number;
  /** The code actually used — typed or server-generated. Never re-fetch or re-derive it; use this. */
  code: string;
  /** Custom-field values the write refused, same shape as `SetFieldsResult.rejected`. */
  rejected: Array<{ fieldKey: string; why: string }>;
}

/**
 * One transaction: insert the item, write its custom fields, and recompute its
 * derived weight if it states a size — all or nothing. `fields` values follow
 * `setFieldValues`'s shape (a bare value, or `{ value, unit }`).
 */
export const createCatalogItem = (
  item: NewCatalogItem,
  fields?: Record<string, string | number | { value: string | number | null; unit?: string }>,
) => fabPost<CreateCatalogItemResult>('catalog/items', { item, fields: fields ?? {} });

export interface CatalogItemUsage {
  bomCount: number;
  orderCount: number;
  /** Up to 10 of each, by name — enough for a where-used popover; the counts say if there are more. */
  boms: Array<{ itemId: number; name: string; code: string | null }>;
  orders: Array<{ orderId: number; orderNumber: string }>;
}

/** How many BOM lines and orders reference this item (and which) — shown before a delete and in where-used. */
export const getCatalogItemUsage = (id: number) =>
  fabGet<CatalogItemUsage>(`catalog/items/${id}/usage`);

export interface SellableItem {
  id: number; name: string; code: string | null; unit: string | null;
  /** `catalogPickerService.sellableItems`'s taxonomy join — a picker needs at least one of these to tell apart five items all named "Span". */
  categoryName: string | null; groupName: string | null; subgroupName: string | null;
}

/** What an order LINE may sell — Fabricated-category items only. */
export const getSellableItems = (q?: string) =>
  fabGet<{ items: SellableItem[] }>('catalog/sellable-items', q ? { q } : {}).then((r) => r.items ?? []);

export type TaxonomyLevel = 'category' | 'group' | 'subgroup';

export interface DeleteTaxonomyResult {
  ok: true;
  id: number;
  level: TaxonomyLevel;
  cascaded: { groups: number; subgroups: number };
}

/**
 * DELETE /taxonomy/:level/:id — ONE authority for the cascade, replacing the
 * client-driven "delete every subgroup, then every group, then the category"
 * loop. Refuses (axios throws, `response.status === 409`,
 * `response.data === { code: 'TAXONOMY_IN_USE', count }`) if any catalog item
 * still references this node or a descendant.
 */
export const deleteTaxonomy = (level: TaxonomyLevel, id: number) =>
  fabDel<DeleteTaxonomyResult>(`taxonomy/${level}/${id}`);

export interface OrderLineRow {
  id: number;
  lineNo: number;
  code: string | null;
  description: string | null;
  qty: number | string;
  unitPrice: number | string | null;
  catalogItemId: number | null;
  templateItemId: number | null;
  lineType: string | null;
  /** The released template revision this line was BUILT from; null = not built yet, or built before revisions. */
  templateRevision?: number | null;
  /** 1 once the line's structure has been built. */
  built?: number | boolean;
  /** The template's newest released revision — "Rev 3 · latest is Rev 5". */
  latestRevision?: number | null;
  /** The catalog item the line sells — its code and where it sits in the taxonomy (the server sends both). */
  catalogItem: {
    id: number; name: string; code: string | null;
    categoryName?: string | null; groupName?: string | null; subgroupName?: string | null;
  } | null;
  builtCount: number;
  /** The line's top structure row's code (SPAN1) — written at deploy, previewed before. */
  rootCode?: string | null;
  /** The last span of the line (SPAN5 on a qty-5 line); null when the line is one. */
  rootCodeLast?: string | null;
  material: string | null;
  grade: string | null;
  thicknessMm: number | null;
}

/** GET /orders/:id/lines — a line's row, built-count and spec, batched for every line. */
export const getOrderLines = (orderId: number) =>
  fabGet<{ rows: OrderLineRow[] }>(`orders/${orderId}/lines`).then((r) => r.rows ?? []);

/** The same read, with the order prefix every row code starts with (hidden on screen). */
export const getOrderLinesWithPrefix = (orderId: number) =>
  fabGet<{ rows: OrderLineRow[]; codePrefix?: string | null }>(`orders/${orderId}/lines`)
    .then((r) => ({ rows: r.rows ?? [], codePrefix: r.codePrefix ?? null }));

/** One row the import will not insert cleanly — dry-run's real output, and also carried on a live run. */
export interface ImportProblem { row: number; code: string; reason: string }

export interface ImportDryRunResult {
  problems: ImportProblem[];
  wouldInsert: number;
  wouldUpdate: number;
  wouldSkip: number;
}

export interface ImportItemsResult {
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
  categoriesCreated: number;
  groupsCreated: number;
  subgroupsCreated: number;
  warnings: { row: number; message: string }[];
  problems: ImportProblem[];
  reportBase64?: string;
}
