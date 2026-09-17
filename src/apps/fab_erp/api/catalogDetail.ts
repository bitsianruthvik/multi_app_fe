/**
 * catalogDetail.ts — typed wrappers for `routes/catalogDetail.js` (the item
 * page's where-used / stock / purchases reads, taxonomy counts for the tree)
 * plus the item-code preview the Add item dialog shows.
 *
 * A separate file from `catalog.ts`, which another unit of work owns.
 */

import { fabGet, fabPost } from './client';
import type { CodegenSegment, FabCodegenRule } from '../types';

// ── Where used ────────────────────────────────────────────────────────────────

export interface WhereUsedBomRow {
  bomId: number;
  parentItemId: number;
  parentName: string;
  parentCode: string;
  qtyNum: number | null;
  qtyParam: string | null;
  defaultQty: number | null;
  perInstanceQty: boolean;
}

export interface WhereUsedOrderRow {
  orderId: number;
  orderNumber: string;
  orderType: string;
  status: string;
  customerName: string | null;
  rowCount: number;
  totalQty: number;
}

export interface WhereUsedResponse {
  boms: WhereUsedBomRow[];
  bomTotal: number;
  orders: WhereUsedOrderRow[];
  orderTotal: number;
  cap: number;
}

export const getItemWhereUsed = (id: number) =>
  fabGet<WhereUsedResponse>(`catalog/items/${id}/where-used`);

// ── Stock ─────────────────────────────────────────────────────────────────────

export interface StockPieceRow {
  id: number;
  code: string | null;
  qty: number;
  uom: string | null;
  status: string;
  batchNo: string | null;
  heatNo: string | null;
  serialNo: string | null;
  receivedDate: string | null;
  lengthMm: number | null;
  widthMm: number | null;
  originPieceId: number | null;
  source: string | null;
  plantName: string | null;
  locationName: string | null;
  locationCode: string | null;
  isOffcut: boolean;
}

export interface ItemStockResponse {
  /** Same numbers the Buy step sees (`availabilityService.availabilityFor`): full pieces only, offcuts excluded. */
  onHand: number;
  reserved: number;
  available: number;
  pieces: StockPieceRow[];
  pieceCount: number;
}

export const getItemStock = (id: number) =>
  fabGet<ItemStockResponse>(`catalog/items/${id}/stock`);

// ── Purchases ─────────────────────────────────────────────────────────────────

export interface PurchaseLineRow {
  orderId: number;
  orderNumber: string;
  status: string;
  supplierId: number | null;
  supplierName: string | null;
  lineId: number;
  qty: number;
  qtyReceived: number;
  unit: string | null;
  unitPrice: number | null;
  expectedDate: string | null;
  orderedAt: string;
}

export interface ItemPurchasesResponse {
  lines: PurchaseLineRow[];
  cap: number;
}

export const getItemPurchases = (id: number) =>
  fabGet<ItemPurchasesResponse>(`catalog/items/${id}/purchases`);

// ── Taxonomy counts ───────────────────────────────────────────────────────────

export interface TaxonomyCounts {
  categories: Record<string, number>;
  groups: Record<string, number>;
  subgroups: Record<string, number>;
}

export const getTaxonomyCounts = () => fabGet<TaxonomyCounts>('taxonomy/counts');

// ── Item code preview ─────────────────────────────────────────────────────────

/** The company's item rule (or the built-in default) — fetched once per dialog open. */
export const getItemCodeRule = () =>
  fabGet<FabCodegenRule>('codegen-rules', { entityType: 'item' });

/** A sample code for the chosen taxonomy. Does not consume the sequence. */
export const previewItemCode = (
  segments: CodegenSegment[],
  context: { categoryId: number | null; groupId: number | null; subgroupId: number | null; attributes?: Record<string, unknown> },
) => fabPost<{ code: string }>('codegen/preview', { entityType: 'item', segments, context });
