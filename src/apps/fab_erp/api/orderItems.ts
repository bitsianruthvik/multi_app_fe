/**
 * orderItems.ts — reading an order's item tree beyond what the generic query
 * API can express.
 *
 * The tree itself is read through `fabQuery` on `fabErpItem`, which is enough
 * while every relationship is a parent pointer. Consolidation put one of them
 * somewhere the generic API cannot reach, so that one gets a route.
 */

import { fabGet } from './client';


/**
 * A part an assembly needs but no longer contains.
 *
 * Identical parts are consolidated onto the order line — twelve stiffeners under
 * ED1 and twelve under ED2 are one row of twenty-four — so an assembly has no
 * children and a tree that lists them shows an empty diaphragm. That reads as
 * nothing wrong, which is worse than an error.
 */
export interface DemandPart {
  partId: number;
  code: string | null;
  name: string;
  /** How many THIS assembly needs. */
  qty: number;
  /** How many the whole order needs — the part is shared with other assemblies. */
  totalQty: number | null;
  length: number | null;
  width: number | null;
  thickness: number | null;
  /** How many plates it is cut from. More than one is normal now. */
  plateCount: number;
}

/** GET the parts one assembly needs. */
export const getItemDemand = (orderId: number, itemId: number) =>
  fabGet<{ itemId: number; parts: DemandPart[] }>(`orders/${orderId}/items/${itemId}/demand`);
