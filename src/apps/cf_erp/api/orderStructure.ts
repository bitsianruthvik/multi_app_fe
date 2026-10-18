import { cfApi } from './client';
import type { SalesOrder } from './types';

/**
 * The whole order's structure, as the one Structure & values step works it (backend routes/orders.js, 2026-10-18).
 *
 *   PUT /orders/:id/line-order  { lineIds } — the lines in a new order. The order's line numbers are handed out again
 *                               in the new order; a frozen or released line keeps its own (refused, the line named).
 */
export const reorderLines = (orderId: number, lineIds: number[]) => cfApi.put<SalesOrder>(`/orders/${orderId}/line-order`, { lineIds });

/** The ids with the line at `index` moved one place up (-1) or down (+1); the same list when it cannot move. */
export function movedLine(ids: number[], index: number, dir: -1 | 1): number[] {
  const to = index + dir;
  if (index < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
