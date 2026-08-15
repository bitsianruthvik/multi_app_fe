/**
 * fieldReadiness.ts — can this order be estimated honestly?
 *
 * The question nobody could ask before. A missing field value does not error:
 * the formula engine defaults unknown symbols to 0 so `IF()` fallbacks can work,
 * so a part with no thickness is not rejected — it is estimated as free to cut,
 * and every date computed from it downstream is fiction.
 *
 * TWO FAILURES THAT LOOK IDENTICAL and must not be shown the same way:
 *
 *   missingValues  a registered field this part's flow needs, with no value
 *                  anywhere down the chain. A DATA problem — fix the part.
 *   unknownFields  a formula names a field that does not exist (or is text, so
 *                  can never resolve). An AUTHORING problem — fix the formula.
 *                  Reported once per operation, because reporting a single typo
 *                  against nine hundred parts buries every real data problem
 *                  underneath it.
 */

import { fabGet } from './client';

export interface FieldReadiness {
  ok: boolean;
  orderId: number;
  itemsChecked: number;
  itemsShort: number;
  missingValues: Array<{
    itemId: number;
    itemName: string | null;
    itemCode: string | null;
    flowId: number;
    missing: string[];
  }>;
  unknownFields: Array<{ operationId: number; operationName: string | null; keys: string[] }>;
  noFormula: Array<{ operationId: number; operationName: string | null }>;
}

export function getFieldReadiness(orderId: number): Promise<FieldReadiness> {
  return fabGet<FieldReadiness>(`orders/${orderId}/field-readiness`);
}

/** The refusal shape `POST /production/raise` returns as a 409. */
export type FieldGap = { message: string; detail: FieldReadiness };

/**
 * Pull a FIELDS_MISSING refusal out of an axios error, or null if it is
 * something else.
 *
 * A 409 here is an ANSWER, not a failure — the order can be raised, it just
 * should not be yet. Callers show the detail and offer to proceed; falling
 * through to a generic error string would discard the only part that makes it
 * actionable.
 */
export function fieldGapOf(err: unknown): FieldGap | null {
  const res = (err as { response?: { status?: number; data?: Record<string, unknown> } })?.response;
  if (res?.status !== 409 || res?.data?.code !== 'FIELDS_MISSING') return null;
  return {
    message: String(res.data.message ?? 'Some parts are missing values their operations need.'),
    detail: (res.data.detail ?? {}) as FieldReadiness,
  };
}
