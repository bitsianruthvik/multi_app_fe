/**
 * productionPlan.ts — the production step's API: buy, cut, make.
 *
 * One read gives the whole step. The steps and their times come from the same
 * server call that builds the tasks, so what the screen shows is what the tasks
 * get.
 */

import { fabGet, fabPost, fabPut } from './client';
import type { OrderReadiness } from './readiness';

export interface PlanStep {
  stepId: number;
  /** 1, 2, 3 down the row's flow. */
  stepNo: number;
  operationCode: string | null;
  operationName: string | null;
  /** What the formula works out, per piece. */
  formulaMinutes: number | null;
  /** What somebody typed over it, per piece. Null when nobody has. */
  overrideMinutes: number | null;
  /** The time used, per piece — the override if there is one. */
  minutes: number | null;
  /** Once per task, not per piece. */
  setupMinutes: number | null;
  /** setup + minutes × the row's pieces. */
  totalMinutes: number;
  taskId: number | null;
  status: string | null;
  taskCode: string | null;
  /** False while the code is only a preview — it is written on deploy. */
  taskCodeSaved: boolean;
  /**
   * Why `minutes` is null, when it is (EU-8). `null` here with `minutes` also
   * null means the operation has no formula at all — not an error, just
   * unconfigured; a non-null value here is a real problem with the formula
   * itself (a bad parse, an unknown machine/item/op/input symbol, divide by
   * zero) and the task is estimated as taking no time until it is fixed.
   */
  formulaError: { code: string; message?: string; symbol?: string } | null;
  /** Non-fatal: e.g. a `step.*` variable defaulted to 0, or an input/value was unavailable. */
  warnings: { code: string; symbols?: string[] }[];
  /**
   * True when the override on record is only the formula's own number typed
   * back — the server's own tolerance (EU-9), replacing the 0.005-minute
   * compare this screen used to redo itself. A row reading this true has no
   * REAL override even though `overrideMinutes` is non-null.
   */
  overrideIsFormula: boolean;
}

export interface PlanRow {
  id: number;
  parentId: number | null;
  depth: number;
  name: string;
  /** Per parent, as the BOM says. */
  qty: number;
  /** Pieces across the whole order. */
  totalQty: number;
  code: string | null;
  codeSaved: boolean;
  procurement: 'make' | 'buy';
  flowName: string | null;
  steps: PlanStep[];
  totalMinutes: number;
}

export interface ProductionOrderRef {
  id: number;
  orderNumber: string;
  status: string;
  purpose: 'cutting' | null;
  progressPct: number | null;
}

export interface PlanSection {
  productionOrder: ProductionOrderRef | null;
  rows: PlanRow[];
  stepCount: number;
  totalMinutes: number;
  editable: boolean;
}

export interface BuyLine {
  catalogItemId: number;
  code: string | null;
  name: string | null;
  unit: string | null;
  /** `'free_issue'` rows are supplied by the customer — never bought, whatever the shelf holds (EU-14). */
  procurementType: 'make' | 'buy' | 'free_issue';
  required: number;
  /** What the shelf can give this order, its own holding included. Null for a free-issue row. */
  inStock: number | null;
  /** Held off the shelf for this order now. */
  held: number;
  onOrder: number;
  stillNeeded: number;
  /** What this order already holds, else all that is free — the server's own suggestion (EU-9). */
  suggestedTake: number;
}

export interface PurchaseRef {
  id: number;
  orderNumber: string;
  status: string;
  supplierName: string | null;
  lineCount: number;
  qtyOrdered: number;
  qtyReceived: number;
}

/** One step sent, or sendable, to a supplier (EU-14) — the Subcontract section. */
export interface SubcontractStep {
  supplierId: number | null;
  taskId: number | null;
  itemId: number;
  itemCode: string | null;
  itemName: string;
  operationName: string | null;
  qty: number;
  status: string | null;
  sentOutAt: string | null;
  returnedAt: string | null;
  /** Already on a subcontract order — before the task is physically sent out (`sentOutAt`). */
  requested: boolean;
}

export interface SubcontractGroup {
  supplierId: number | null;
  supplierName: string | null;
  steps: SubcontractStep[];
}

export interface SubcontractOrderRef {
  id: number;
  orderNumber: string;
  supplierId: number | null;
  status: string;
}

export interface ProductionPlan {
  orderId: number;
  orderNumber: string;
  buy: {
    lines: BuyLine[];
    unmatched: { name: string | null; linesCount: number; required: number }[];
    purchases: PurchaseRef[];
    suppliers: { id: number; name: string }[];
  };
  cutting: PlanSection;
  fabrication: PlanSection;
  subcontract: {
    groups: SubcontractGroup[];
    orders: SubcontractOrderRef[];
  };
}

export const getProductionPlan = (orderId: number | string) =>
  fabGet<ProductionPlan>(`orders/${orderId}/production-plan`);

/** Minutes per piece; null goes back to the formula. */
export const setStepTime = (orderId: number | string, itemId: number, stepId: number, minutes: number | null) =>
  fabPut<{ readiness?: OrderReadiness }>(`orders/${orderId}/production-plan/time`, { itemId, stepId, minutes });

export const raiseDraft = (orderId: number | string, purpose: 'cutting' | 'fabrication', force = false) =>
  fabPost<ProductionOrderRef & { readiness?: OrderReadiness }>(`orders/${orderId}/production/draft`, { purpose, force });

/**
 * The shape of the 409 `raiseDraft` refuses with when a part is missing a
 * value its own operations need (`routes/procurement.js` FIELDS_MISSING).
 * `force: true` on `raiseDraft` proceeds anyway — the honest escape for a shop
 * that knows its estimate is rough and wants the tasks regardless.
 */
export interface FieldsMissingDetail {
  itemsChecked: number;
  itemsShort: number;
  missingValues: { itemId: number; itemCode: string | null; itemName: string | null; missing: string[] }[];
  unknownFields: { operationName: string; keys: string[] }[];
}

/** `POST /production-orders/:moId/deploy`. `redeploy: true` (EU-12) re-plans a NON-draft MO after a revision, without regressing its status. */
export const deployProductionOrder = (moId: number, opts?: { redeploy?: boolean }) =>
  fabPost<{ readiness?: OrderReadiness }>(`production-orders/${moId}/deploy`, opts?.redeploy ? { redeploy: true } : {});

export const requestProcurement = (orderId: number | string, lines: { catalogItemId: number; take: number }[]) =>
  fabPost<{ readiness?: OrderReadiness }>(`orders/${orderId}/procurement/request`, { lines });

export const sendPurchaseRequest = (poId: number, supplierId: number) =>
  fabPost<{ readiness?: OrderReadiness }>(`purchase-orders/${poId}/send`, { supplierId });

/**
 * `POST /orders/:id/subcontract/request` (EU-14) — send named steps out to a
 * supplier. Raises a NEW `fab_orders` row every call; several subcontract
 * orders against one sales order (one per supplier, or a second batch to the
 * same one) are legitimate, so there is nothing to rewrite in place the way
 * `requestProcurement` rewrites its one open purchase request.
 */
export const requestSubcontract = (orderId: number | string, supplierId: number, taskIds: number[]) =>
  fabPost<{ ok: boolean; order: { id: number; orderNumber: string; supplierId: number; supplierName: string | null; lineCount: number }; readiness: OrderReadiness }>(
    `orders/${orderId}/subcontract/request`, { supplierId, taskIds },
  );
