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

import { fabGet, fabPost, fabDel } from './client';
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

export interface CatalogItemsQuery {
  q?: string;
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

export interface CatalogItemUsage { bomCount: number; orderCount: number }

/** How many BOM lines and orders reference this item — shown before a delete. */
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
