/**
 * productionPlan.ts — the production step's API: buy, cut, make.
 *
 * One read gives the whole step. The steps and their times come from the same
 * server call that builds the tasks, so what the screen shows is what the tasks
 * get.
 */

import { fabGet, fabPost, fabPut } from './client';

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
  required: number;
  /** What the shelf can give this order, its own holding included. */
  inStock: number;
  /** Held off the shelf for this order now. */
  held: number;
  onOrder: number;
  stillNeeded: number;
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
}

export const getProductionPlan = (orderId: number | string) =>
  fabGet<ProductionPlan>(`orders/${orderId}/production-plan`);

/** Minutes per piece; null goes back to the formula. */
export const setStepTime = (orderId: number | string, itemId: number, stepId: number, minutes: number | null) =>
  fabPut(`orders/${orderId}/production-plan/time`, { itemId, stepId, minutes });

export const raiseDraft = (orderId: number | string, purpose: 'cutting' | 'fabrication', force = false) =>
  fabPost<ProductionOrderRef>(`orders/${orderId}/production/draft`, { purpose, force });

export const deployProductionOrder = (moId: number) =>
  fabPost(`production-orders/${moId}/deploy`);

export const requestProcurement = (orderId: number | string, lines: { catalogItemId: number; take: number }[]) =>
  fabPost(`orders/${orderId}/procurement/request`, { lines });

export const sendPurchaseRequest = (poId: number, supplierId: number) =>
  fabPost(`purchase-orders/${poId}/send`, { supplierId });
