import { cfApi, LONG_WRITE_MS } from './client';
import type { DataType } from './types';

/**
 * ORDER and LINE values for specifications (init.sql §65, 2026-10-16; services/orderDefaultService.js).
 * A specification flagged "Can be set for a whole order" in Setup may carry a value on the order and on
 * each line. Every row of the order with that specification takes it unless the row has its own entry:
 * row entry > line value > order value > the specification's own rule. A locked line keeps what it
 * locked with. The Values screen marks a cell that takes it ("from order" / "from line") and a row
 * entry that stands over it.
 */

export interface OrderSpec {
  id: number;
  code: string;
  name: string;
  dataType: DataType;
  unit: string | null;
  decimals: number | null;
  options?: { id: number; value: string; label: string | null }[];
}

/** A value as a field edits it (`input`: an option's id, a number, 'true' / 'false', a date) and in words. */
export interface OrderSpecValue { input: string; display: string }

/** How the rows of one line take one value. */
export interface OrderSpecUsage {
  /** Rows that have the specification and could take the value. */
  rows: number;
  /** Rows that take it now. */
  follow: number;
  /** Rows with their own entry (an override). */
  own: number;
  /** Rows whose option list does not allow the value — they keep their own rule. */
  notAllowed: number;
  /** Rows with nothing at all. */
  empty: number;
}

export interface OrderSpecLine {
  id: number;
  lineNo: number;
  lineType: 'standard' | 'custom';
  description: string | null;
  frozen: 'locked' | 'released' | null;
  message: string | null;
  values: Record<string, OrderSpecValue>;
  /** null for a line without rows of its own (a catalog line), or on a read without usage. */
  usage: Record<string, OrderSpecUsage> | null;
}

export interface OrderSpecDefaults {
  order: { id: number; code: string; revision: number; status: string; label: string };
  editable: boolean;
  lock: string | null;
  /** False on a server without init.sql §65 — nothing to show. */
  available: boolean;
  specs: OrderSpec[];
  /** The whole order's values, by spec code. */
  values: Record<string, OrderSpecValue>;
  lines: OrderSpecLine[];
}

export interface OrderSpecWriteResult {
  applied: boolean;
  dryRun: boolean;
  summary: {
    sentence: string;
    changed: number;
    level?: 'order' | 'line';
    lines: { lineId: number; lineNo: number; values?: number; records?: number; skipped?: 'locked' | 'released' }[];
  };
  changes: { specCode: string; change: 'set' | 'changed' | 'cleared' }[];
  view: OrderSpecDefaults;
}

export const getOrderSpecDefaults = (orderId: number) => cfApi.get<OrderSpecDefaults>(`/orders/${orderId}/spec-defaults`);

/** lineId null = the whole order; a value of null takes it away. */
export const setOrderSpecDefaults = (orderId: number, lineId: number | null, writes: { specCode: string; value: string | number | boolean | null }[]) =>
  cfApi.put<OrderSpecWriteResult>(`/orders/${orderId}/spec-defaults`, { lineId, writes }, { timeoutMs: LONG_WRITE_MS });
