import { cfApi } from './client';
import type { SalesOrder } from './types';

/**
 * THE EXECUTION PLAN of a sales order (backend executionPlanService.js, init.sql §72): how the order is MADE (its
 * production orders) and how it is SHIPPED (its dispatch units), captured before the design is frozen.
 *
 *   GET /orders/:id/execution-plan
 *   PUT /orders/:id/execution-plan  { production?, dispatch?, lines?: [{ lineId, own }], dryRun? }
 *
 * A dry run is the screen's live preview: nothing is written, and problems come back in the answer.
 */
export type ProductionLevel = 'order' | 'line' | 'unit' | 'assembly';
export type DispatchLevel = 'same' | 'line' | 'unit' | 'assembly';

export interface PlanChoice<L extends string = string> { level: L; levelId: number | null }
export interface ExecutionPlan { production: PlanChoice<ProductionLevel>; dispatch: PlanChoice<DispatchLevel> }

/** A BOM level of a line: the definition its rows were made from, e.g. "Girder line" — 4 in one span. */
export interface PlanLevel { id: number; name: string; depth: number; perUnit: number }

export interface ExecutionPlanLine {
  lineId: number;
  lineNo: number;
  lineType: 'standard' | 'custom';
  quantity: number;
  item: { id: number; code: string | null; name: string | null } | null;
  /** Its design is frozen (or it is released): its plan is fixed. */
  frozen: boolean;
  released: boolean;
  /** False for a line taken from stock as it is — it has no production order. */
  made: boolean;
  /** The line's own plan; null = it follows the order's. */
  own: ExecutionPlan | null;
  /** What counts for it: its own, else the order's, else the default. */
  plan: ExecutionPlan;
  source: 'line' | 'order' | 'default';
  words: string;
  levels: PlanLevel[];
  rows: number;
  productionCount: number;
  dispatchCount: number | null;
  problems: string[];
}

export interface PlanPreviewPart { count: number; items: string[]; more: number; sentence: string }

export interface ExecutionPlanView {
  order: { id: number; code: string; status: SalesOrder['status'] };
  dryRun: boolean;
  editable: boolean;
  readOnlyReason: string | null;
  saved: { at: string | null; by: { id: number; name: string | null } | null } | null;
  /** The order's own choice (the default for every line). */
  plan: ExecutionPlan;
  planWords: string;
  defaults: ExecutionPlan;
  lines: ExecutionPlanLine[];
  /** The BOM levels found on the lines that make something, with the lines that have each. */
  levels: { id: number; name: string; depth: number; lineNos: number[]; onEveryLine: boolean }[];
  templates: { key: string; label: string; plan: ExecutionPlan }[];
  preview: { production: PlanPreviewPart; dispatch: PlanPreviewPart; limit: number };
  problems: string[];
  note: string;
}

export interface ExecutionPlanInput {
  production?: PlanChoice<ProductionLevel>;
  dispatch?: PlanChoice<DispatchLevel>;
  lines?: { lineId: number; own: ExecutionPlan | null }[];
  dryRun?: boolean;
}

export const getExecutionPlan = (orderId: number) => cfApi.get<ExecutionPlanView>(`/orders/${orderId}/execution-plan`);
export const saveExecutionPlan = (orderId: number, body: ExecutionPlanInput) => cfApi.put<ExecutionPlanView>(`/orders/${orderId}/execution-plan`, body);

