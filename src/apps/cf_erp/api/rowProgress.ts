import { cfApi } from './client';

/**
 * Where every row of an order line is in its flow, per unit (GET /orders/:orderId/lines/:lineId/row-progress,
 * services/rowProgressService.js) — what the 3D progress view colours by.
 */
export type RowUnitState = 'not_released' | 'waiting' | 'working' | 'done' | 'joined';
export interface RowUnit {
  state: RowUnitState;
  /** the earliest operation not done across the row's pieces in this unit */
  op: { code: string; name: string } | null;
  /** a step of that operation is being worked right now */
  inProgress: boolean;
  /** 2026-11-14: the operation being worked on the row right now (glows), and else the last one done (painted). */
  now?: { code: string; name: string } | null;
  last?: { code: string; name: string } | null;
  pieces: number;
  done: number;
  /** the row's cut pieces and how many are cut (null = it has none) */
  cut: { done: number; total: number } | null;
  /** false when a production order was asked for and it does not hold this unit's pieces of the row */
  inOrder: boolean;
}
export interface RowProgressRow { rowId: number; parentRowId: number | null; mark: string | null; markNorm: string | null; depth: number; level: string; name: string; units: RowUnit[] }
export interface RowProgress {
  lineId: number; orderId: number; orderCode: string; quantity: number; released: boolean; productionOrderId?: number | null;
  operations: { code: string; name: string; seq: number }[];
  rows: RowProgressRow[];
}

export const getRowProgress = (orderId: number, lineId: number, productionOrderId?: number | null) =>
  cfApi.get<RowProgress>(`/orders/${orderId}/lines/${lineId}/row-progress${productionOrderId ? `?productionOrderId=${productionOrderId}` : ''}`);

export const getProductionOrderLines = (id: number) =>
  cfApi.get<{ id: number; code: string; orderId: number; lineIds: number[] }>(`/production-orders/${id}/lines`);
