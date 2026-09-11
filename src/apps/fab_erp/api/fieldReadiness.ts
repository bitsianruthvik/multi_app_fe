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
 *   unusableFields a formula names a field that IS registered but is not usable
 *                  in formulas — a text field, usually. The FIELD is wrong, not
 *                  the formula, and it is fixed once on Item fields rather than
 *                  in every formula that names it.
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
  /** Registered but not formula-usable — fix the field, not the formula. */
  unusableFields?: Array<{ operationId: number; operationName: string | null; keys: string[] }>;
  noFormula: Array<{ operationId: number; operationName: string | null }>;
}

export function getFieldReadiness(orderId: number): Promise<FieldReadiness> {
  return fabGet<FieldReadiness>(`orders/${orderId}/field-readiness`);
}
