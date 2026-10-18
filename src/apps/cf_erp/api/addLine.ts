import { cfApi, LONG_WRITE_MS } from './client';
import type { SalesOrder } from './types';
import type { OrderSpec, OrderSpecValue } from './orderSpecDefaults';
import type { LineStandardState } from './standards';

/**
 * ADD LINE (three choices) and the New order dialog's order values — init.sql §77, BE routes/addLine.js,
 * services/drawingLineService.js. Contract: TM/CF_ERP_ORDER_FLOW_PLAN.md "2026-10-18 — Add line three choices +
 * New-order defaults".
 */

/** Where a prefilled value came from: the company's last order, or what most templates hold. */
export type DefaultFrom = 'last_order' | 'template';

export interface NewOrderDefaults {
  /** False on a server without init.sql §65. */
  available: boolean;
  /** The specs the Structure step's "Values for the whole order" panel shows (Setup: "Can be set for a whole order"). */
  specs: OrderSpec[];
  values: Record<string, OrderSpecValue & { from: DefaultFrom }>;
  lastOrder: { id: number; code: string } | null;
}

export interface AiFlag { rowId: number | null; mark: string | null; what: string; reasons: string[] }

export interface FromDrawing {
  lineId: number;
  file: string;
  parts: number;
  rows: number;
  files: number;
  flagged: number;
  weightKg: number | null;
  ms: number;
  sentence: string;
  flags: AiFlag[];
  cutPieces: { made: number; reason: string | null; message: string | null };
}

export interface DrawingImport {
  lineId: number;
  import: { file: string; kind: 'dxf' | 'dwg'; parts: number; rows: number; flagged: number; weightKg: number | null; at: string } | null;
  /** Rows whose BOM line still carries "Check (by AI): …". */
  open: { rowId: number; notes: string }[];
}

export interface FromDrawingBody {
  file: { name: string; content: string };
  quantity?: string | number;
  committedDate?: string | null;
  description?: string | null;
  rate?: string;
  rateBasis?: string;
}

export const getNewOrderDefaults = () => cfApi.get<NewOrderDefaults>('/order-defaults/new');

export const addLineFromDrawing = (orderId: number, body: FromDrawingBody) =>
  cfApi.post<SalesOrder & { fromDrawing: FromDrawing | null }>(`/orders/${orderId}/lines/from-drawing`, body, { timeoutMs: LONG_WRITE_MS });

export const getDrawingImport = (lineId: number) => cfApi.get<DrawingImport>(`/order-lines/${lineId}/drawing-import`);

export const clearAiFlags = (lineId: number, rowIds?: number[]) =>
  cfApi.post<DrawingImport & { cleared: number }>(`/order-lines/${lineId}/ai-flags/clear`, rowIds?.length ? { rowIds } : {});

export const saveLineAsStandard = (lineId: number, body: { number: string; name?: string; revision?: string }) =>
  cfApi.post<LineStandardState & { openFlags: number }>(`/order-lines/${lineId}/standard/from-line`, body, { timeoutMs: LONG_WRITE_MS });
