/**
 * fields.ts — field values, read and written through the one path that validates.
 *
 * NOT the generic `fabMutate('fabErpCustomField', ...)` route this replaces.
 * That path validated nothing, which is how the old value table accumulated
 * values its own vocabulary would reject. These endpoints go through
 * `setFields` on the server: an unknown key, a value at a rung the field may
 * not be set on, a non-number in a number field and an out-of-list enum are all
 * refused, and refused INDIVIDUALLY — one bad key in twenty does not discard
 * the other nineteen.
 */

import api, { API_HOST } from '@core/utils/axiosConfig';
import { fabGet } from './client';

const base = () => `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp`;

/** The rungs a value can hang off, broadest first. */
export type FieldScope =
  | 'category' | 'group' | 'subgroup' | 'catalog_item' | 'order_item' | 'stock_piece';

export interface FieldDef {
  fieldKey: string;
  label: string;
  dataType: 'number' | 'text' | 'date' | 'bool' | 'enum';
  unit: string | null;
  dimension: string | null;
  /** The NARROWEST rung this may be set on; broader is always allowed. */
  appliesAt: FieldScope;
  allowedValues: string[] | null;
  isStandard: boolean;
  formulaUsable: boolean;
  sortOrder: number;
  categoryId: number | null;
  groupId: number | null;
  subgroupId: number | null;
}

export interface ResolvedValue {
  value: number | string | boolean | null;
  unit: string | null;
  /**
   * Which rung it came from. `order_item` on an order item means it was typed
   * there; anything broader means it is inherited — which is the question
   * "why is this 40?" finally having an answer.
   */
  from: { scope: FieldScope | 'default'; scopeId: number | null };
  fieldId: number;
}

export interface FieldValuesResponse {
  scope: FieldScope;
  scopeId: number;
  fields: FieldDef[];
  values: Record<string, ResolvedValue>;
}

export const getFieldValues = (scope: FieldScope, scopeId: number) =>
  fabGet<FieldValuesResponse>('fields/values', { scope, scopeId });

export interface SetFieldsResult {
  ok: boolean;
  written: number;
  cleared: number;
  projected: number;
  /** Refused keys, with the reason. Show these — a dropped value looks like a save. */
  rejected: Array<{ fieldKey: string; why: string }>;
}

/**
 * Write values at one scope. A bare value takes the field's declared unit;
 * pass `{ value, unit }` to state a different one and let the server convert.
 */
export async function setFieldValues(
  scope: FieldScope,
  scopeId: number,
  values: Record<string, number | string | null | { value: number | string | null; unit?: string }>,
): Promise<SetFieldsResult> {
  const res = await api.post(`${base()}/fields/values`, { scope, scopeId, values });
  return res.data as SetFieldsResult;
}

export interface FieldVocabulary {
  dataTypes: Array<{ value: string; label: string }>;
  units: Array<{ code: string; dimension: string; baseCode: string; factorToBase: string; label: string }>;
  unitGroups: Array<{ group: string; values: FieldVocabulary['units'] }>;
  rungs: FieldScope[];
  levels: Array<{ value: FieldScope; label: string; hint: string }>;
  unitsAreConverted: boolean;
}

export const getFieldVocabulary = () => fabGet<FieldVocabulary>('fields/vocabulary');
