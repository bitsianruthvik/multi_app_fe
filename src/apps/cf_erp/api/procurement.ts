import { cfApi } from './client';
import type { PurchaseOrder } from './types';

/**
 * Purchase lines bought FOR a sales order (§43). PURCHASE FLOW v3 (§71): the RFQ, quote and comparison calls went with
 * the §39 / §46 screens — the purchase request's vendor columns (api/purchaseRequests.ts) replace them.
 */

export interface ItemRef { id: number; code: string | null; name: string; uom: string }
export interface DocRef { id: number; code: string }

// ---- Purchase orders bought FOR a sales order ------------------------------------

export interface LineOrderInput { orderId: number; quantity: number }

/** What a receipt held for the orders it was bought for. */
export interface HeldReceipt { orderId: number; orderCode: string; quantity: number }

/** Replaces the line's allocations; answers with the whole purchase order. */
export const setLineOrders = (lineId: number, orders: LineOrderInput[]) => cfApi.put<PurchaseOrder>(`/purchase-lines/${lineId}/orders`, { orders });

/** Lets go of held stock: it becomes free for any job. */
export const releaseHold = (id: number) => cfApi.post<{ ok: true }>(`/stock/holds/${id}/release`);
