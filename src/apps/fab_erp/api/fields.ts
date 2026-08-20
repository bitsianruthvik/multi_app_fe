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

import { useEffect, useState } from 'react';
import api, { API_HOST } from '@core/utils/axiosConfig';
import { fabGet, fabQuery, fabMutate } from './client';

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

// ─────────────────────────────────────────────────────────────────────────────
// DEFINITIONS — `fab_fields`, the other half of a field.
//
// A field is TWO rows, and the old catalog UI wrote neither of them. It wrote a
// single `fab_custom_fields` row holding a key and a string, so a "field" had no
// type to validate against, no unit to compare in, and no rung it was allowed to
// be set on. Creating one here writes the DEFINITION through the `fabErpField`
// resource and the VALUE through `POST /fields/values`, which is the only path
// that validates.
//
// Values are read back with `getFieldValues`, which resolves the whole ladder —
// so inheritance is driven by where a VALUE sits, not by the definition's
// taxonomy columns. Those columns only decide which blank fields a screen
// offers; they never gate resolution.
// ─────────────────────────────────────────────────────────────────────────────

/** A `fab_fields` row as the generic query API returns it. */
export interface FieldDefRow {
  id: number;
  fieldKey: string;
  label: string;
  dataType: string;
  dimension: string | null;
  defaultUnit: string | null;
  allowedValues: string[] | string | null;
  appliesAt: string | null;
  formulaUsable: number;
  defaultNum: number | string | null;
  defaultText: string | null;
  isStandard: number;
  categoryId: number | null;
  groupId: number | null;
  subgroupId: number | null;
  sortOrder: number;
  active: number;
}

/**
 * The four choices the catalog screens offer, unchanged from the old editor so
 * nobody has to relearn them.
 *
 * `dropdown` is not a storage type — `fab_fields` has no such data type, and the
 * vocabulary deliberately does not define one ("a picker is any type that has
 * allowed_values set"). It maps to `enum`, which is the branch of `setFields`
 * that checks the typed value against the list and stores the list's canonical
 * spelling rather than what was typed.
 */
export type UiFieldType = 'text' | 'number' | 'date' | 'bool' | 'dropdown';

export const UI_FIELD_TYPES: Array<{ value: UiFieldType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'bool', label: 'Yes / No' },
  { value: 'dropdown', label: 'Dropdown' },
];

export const toDataType = (t: UiFieldType): string => (t === 'dropdown' ? 'enum' : t);

/**
 * What a bool field must be SENT as.
 *
 * `setFields` recognises only `true`, `1` and the string "true" — it does not
 * accept "yes", which the seeded `consumable` values were all written as. So a
 * Yes/No control must emit "true"/"false" and never the word on its label,
 * or the value silently lands as false.
 */
export const BOOL_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

/** Normalise whatever is stored into the two strings a bool control uses. */
export function boolValue(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(v)) return 'true';
  if (['false', '0', 'no', 'n'].includes(v)) return 'false';
  return '';
}

/** Options off a definition, tolerating the JSON column arriving as a string. */
export function parseAllowed(raw: string[] | string | null | undefined): string[] {
  if (raw == null || raw === '') return [];
  let v: unknown = raw;
  if (typeof v === 'string') {
    const s = v.trim();
    try { v = JSON.parse(s); } catch { v = s.includes(',') ? s.split(',') : [s]; }
  }
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

/** The editor type for a stored definition. `enum`, or anything with options, is a dropdown. */
export function uiTypeOf(def: { dataType?: string | null; allowedValues?: string[] | string | null }): UiFieldType {
  if (def.dataType === 'enum' || parseAllowed(def.allowedValues).length) return 'dropdown';
  if (def.dataType === 'number' || def.dataType === 'integer') return 'number';
  if (def.dataType === 'date') return 'date';
  if (def.dataType === 'bool') return 'bool';
  return 'text';
}

/**
 * A formula-safe key from a human label.
 *
 * The key is the identifier a formula writes (`item.yield_strength_mpa`) and the
 * label is what people read, so they cannot be the same string — the old table
 * used the label as the key, which is how `Grp Yield Strength` became a "field"
 * no expression could ever name.
 */
export function slugFieldKey(label: string): string {
  const s = label.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  return s || 'field';
}

/** Type-aware placeholder — a steel grade on a numeric input is just wrong. */
export function valuePlaceholder(type: UiFieldType, unit?: string | null): string {
  switch (type) {
    case 'number': return unit ? `e.g. 350 (${unit})` : 'e.g. 350';
    case 'date': return 'YYYY-MM-DD';
    case 'bool': return 'Yes / No';
    case 'dropdown': return 'Pick an option';
    default: return 'e.g. IS2062 E250';
  }
}

/**
 * Client-side echo of what `setFields` will refuse, so a bad value is caught
 * while the cursor is still in the box.
 *
 * Deliberately an ECHO and not the gate: the server still validates, and its
 * rejections are surfaced verbatim. A check that only lived here would be a
 * check the import path and the API do not have.
 */
export function fieldValueError(type: UiFieldType, raw: string, allowed: string[] = []): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  if (type === 'number') return Number.isFinite(Number(v)) ? null : 'Must be a number';
  if (type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'Must be a date as YYYY-MM-DD';
  if (type === 'bool') return boolValue(v) ? null : 'Must be Yes or No';
  if (type === 'dropdown' && allowed.length) {
    return allowed.some((a) => a.toLowerCase() === v.toLowerCase())
      ? null : `Must be one of: ${allowed.join(', ')}`;
  }
  return null;
}

/** Resolved value + unit, as one string for display. */
export function displayValue(v: ResolvedValue | undefined | null): string {
  if (!v || v.value == null || v.value === '') return '—';
  const base = typeof v.value === 'boolean' ? (v.value ? 'Yes' : 'No') : String(v.value);
  return v.unit ? `${base} ${v.unit}` : base;
}

/** Every active definition for the company. Includes `id`, which /fields/values does not. */
export const listFieldDefs = () =>
  fabQuery<{ data: FieldDefRow[] }>('fabErpField', {
    filters: { active: 1 },
    orderBy: [{ field: 'sortOrder', direction: 'asc' }],
    pagination: { limit: 1000 },
  });

export interface FieldDefInput {
  /** Set when the row is already bound to a definition. */
  fieldId: number | null;
  /** Set when the row is bound to a definition; otherwise derived from the label. */
  fieldKey: string;
  label: string;
  type: UiFieldType;
  /** '' means no unit. */
  unit: string;
  /** Comma-separated options, dropdown only. */
  options: string;
  sortOrder?: number;
}

/** Where a NEW definition is filed, so the right screens offer it. */
export interface FieldDefScope {
  categoryId?: number | null;
  groupId?: number | null;
  subgroupId?: number | null;
}

/**
 * Create the definition if it does not exist, update it if it does, and hand
 * back the `field_key` a value should be written under.
 *
 * A key that is already taken is REUSED rather than duplicated. Two categories
 * both wanting "Material Grade" want the same field — a second definition under
 * a mangled key would give them two columns that never compare equal, which is
 * exactly how this registry grew a free-text `Thickness` beside `thickness_mm`.
 *
 * A standard field is left completely alone. Its key is what feature code is
 * written against, and its type and unit are what those features assume.
 */
export async function ensureFieldDef(
  input: FieldDefInput,
  opts: { existing: FieldDefRow[]; units: FieldVocabulary['units']; scope?: FieldDefScope },
): Promise<string> {
  const key = (input.fieldKey || slugFieldKey(input.label)).trim();
  const found = input.fieldId != null
    ? opts.existing.find((d) => d.id === input.fieldId)
    : opts.existing.find((d) => d.fieldKey === key);

  if (found && Number(found.isStandard) === 1) return found.fieldKey;

  const options = input.options.split(',').map((s) => s.trim()).filter(Boolean);
  const unit = input.type === 'number' ? input.unit.trim() : '';
  const dimension = unit ? (opts.units.find((u) => u.code === unit)?.dimension ?? null) : null;

  const payload: Record<string, unknown> = {
    label: input.label.trim() || key,
    data_type: toDataType(input.type),
    default_unit: unit || null,
    dimension,
    allowed_values: input.type === 'dropdown' && options.length ? JSON.stringify(options) : null,
  };
  if (input.sortOrder != null) payload.sort_order = input.sortOrder;

  if (found) {
    // `formula_usable` is deliberately NOT re-sent on an update. It is a
    // deliberate choice made in the field registry editor, and a catalog save
    // has no opinion about it — overwriting it here would quietly undo that
    // choice every time somebody edited an unrelated category.
    await fabMutate('fabErpField', 'update', { id: found.id, ...payload });
    return found.fieldKey;
  }

  await fabMutate('fabErpField', 'insert', {
    field_key: key,
    ...payload,
    // Text can never reach a formula — the engine coerces with Number(), so it
    // yields NaN and the whole duration silently becomes null.
    formula_usable: input.type === 'number' ? 1 : 0,
    /**
     * The loosest rung, on purpose.
     *
     * `applies_at` names the NARROWEST rung a value may be set on, and it is
     * enforced on write — a field declared `order_item` cannot ever take a
     * value on a stock piece. The catalog editor has no honest way to ask that
     * question about a field somebody is inventing right now, and a write
     * refused for a reason the screen never mentioned is worse than a value
     * recorded one rung lower than ideal. Tighten it on Item fields, where the
     * question is asked properly.
     */
    applies_at: 'stock_piece',
    active: 1,
    category_id: opts.scope?.categoryId ?? null,
    group_id: opts.scope?.groupId ?? null,
    subgroup_id: opts.scope?.subgroupId ?? null,
  });
  return key;
}

/**
 * The vocabulary, fetched once per mount with a usable fallback.
 *
 * The fallback matters for the same reason it does in the field registry editor:
 * an empty unit dropdown because one request failed looks exactly like a system
 * with no units, and the next person "fixes" it by typing them in by hand.
 */
const FALLBACK_VOCABULARY: FieldVocabulary = {
  dataTypes: [],
  units: [
    { code: 'mm', dimension: 'length', baseCode: 'm', factorToBase: '0.001', label: 'Millimetre' },
    { code: 'm', dimension: 'length', baseCode: 'm', factorToBase: '1', label: 'Metre' },
    { code: 'kg', dimension: 'mass', baseCode: 'kg', factorToBase: '1', label: 'Kilogram' },
    { code: 'nos', dimension: 'count', baseCode: 'nos', factorToBase: '1', label: 'Numbers' },
  ],
  unitGroups: [],
  rungs: ['category', 'group', 'subgroup', 'catalog_item', 'order_item', 'stock_piece'],
  levels: [],
  unitsAreConverted: true,
};

export function useFieldVocabulary(): FieldVocabulary {
  const [vocab, setVocab] = useState<FieldVocabulary>(FALLBACK_VOCABULARY);
  useEffect(() => {
    let alive = true;
    getFieldVocabulary()
      .then((v) => { if (alive && v?.units?.length) setVocab(v); })
      .catch(() => { /* keep the fallback */ });
    return () => { alive = false; };
  }, []);
  return vocab;
}

/**
 * Units grouped by dimension for a picker.
 *
 * Derived from the flat `units` list rather than read off `unitGroups`, because
 * the two are the same data and only one of them is guaranteed to survive the
 * fallback above.
 */
export function unitsByDimension(vocab: FieldVocabulary): Array<{ group: string; units: FieldVocabulary['units'] }> {
  const by = new Map<string, FieldVocabulary['units']>();
  for (const u of vocab.units ?? []) {
    if (!by.has(u.dimension)) by.set(u.dimension, []);
    by.get(u.dimension)!.push(u);
  }
  return [...by].map(([group, units]) => ({ group, units }));
}

/**
 * One editable row in a catalog field table: the definition it points at, plus
 * the value at THIS rung. Shared by the taxonomy dialog and the item detail
 * because both edit exactly this — a definition and one value on one node.
 */
export interface FieldRowDraft extends FieldDefInput {
  /** Negative until saved, so React keys stay stable while typing. */
  rowId: number;
  value: string;
  /** Seeded fields: key, type and unit are what feature code assumes. */
  isStandard: boolean;
}

let rowSeq = 0;
export const nextRowId = () => (rowSeq -= 1);

export function blankRow(sortOrder: number): FieldRowDraft {
  return {
    rowId: nextRowId(), fieldId: null, fieldKey: '', label: '',
    type: 'text', unit: '', options: '', value: '', isStandard: false, sortOrder,
  };
}

/** An existing definition plus its value at one rung, as an editable row. */
export function rowFromDef(def: FieldDefRow, value: ResolvedValue | undefined, sortOrder: number): FieldRowDraft {
  const type = uiTypeOf(def);
  return {
    rowId: nextRowId(),
    fieldId: def.id,
    fieldKey: def.fieldKey,
    label: def.label || def.fieldKey,
    type,
    unit: def.defaultUnit ?? '',
    options: parseAllowed(def.allowedValues).join(', '),
    value: value?.value == null ? '' : String(value.value),
    isStandard: Number(def.isStandard) === 1,
    sortOrder,
  };
}

/** True when two rows differ in anything the save would write. */
export const rowsDiffer = (a: FieldRowDraft, b: FieldRowDraft) =>
  a.label !== b.label || a.type !== b.type || a.unit !== b.unit
  || a.options !== b.options || (a.value ?? '') !== (b.value ?? '');

/** "2 of 3 values were refused: …" — never let a rejection look like a save. */
export function rejectionMessage(res: SetFieldsResult): string | null {
  if (!res.rejected?.length) return null;
  return `Not saved: ${res.rejected.map((r) => `${r.fieldKey} — ${r.why}`).join('; ')}`;
}

/**
 * Persist a whole table of field rows against one rung: definitions first, then
 * ONE validated value write.
 *
 * Shared by every catalog screen that edits fields, because the sequence is not
 * obvious and getting it wrong is invisible. In particular:
 *
 *   DEFINITIONS BEFORE VALUES. `setFields` refuses a key it cannot find in the
 *   registry, so a brand-new field whose definition had not landed yet would be
 *   rejected as "no such field" — reading, from the outside, exactly like the
 *   silent drop this replaces.
 *
 *   ONE CALL FOR ALL VALUES. Rejections come back per key, so twenty rows with
 *   one bad value save nineteen and name the twentieth. Writing them one at a
 *   time would make a mid-list failure leave half the table written.
 *
 *   A REMOVED ROW CLEARS ITS VALUE, NOT ITS DEFINITION. The registry is
 *   company-wide: the same field may hold values on other categories and other
 *   items, and deleting the definition would make every one of them stop
 *   resolving. Removing it here means "this level has nothing to say about it".
 */
export async function commitFieldRows(opts: {
  scope: FieldScope;
  scopeId: number;
  rows: FieldRowDraft[];
  /** The rows as loaded, so removals can be detected. */
  baseline: FieldRowDraft[];
  defs: FieldDefRow[];
  units: FieldVocabulary['units'];
  /** Where a NEW definition is filed. */
  defScope?: FieldDefScope;
}): Promise<{ wrote: boolean; rejection: string | null }> {
  const values: Record<string, { value: string | null; unit?: string }> = {};

  for (const b of opts.baseline) {
    if (b.fieldKey && !opts.rows.some((r) => r.rowId === b.rowId)) values[b.fieldKey] = { value: null };
  }

  for (let i = 0; i < opts.rows.length; i++) {
    const row = opts.rows[i];
    if (!row.label.trim() && !row.fieldKey) continue;
    const key = await ensureFieldDef(
      { ...row, sortOrder: i },
      { existing: opts.defs, units: opts.units, scope: opts.defScope },
    );
    values[key] = {
      value: row.value.trim() === '' ? null : row.value.trim(),
      unit: row.unit || undefined,
    };
  }

  if (!Object.keys(values).length) return { wrote: false, rejection: null };
  const res = await setFieldValues(opts.scope, opts.scopeId, values);
  return { wrote: true, rejection: rejectionMessage(res) };
}
