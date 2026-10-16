import { api } from './client';

/**
 * Code formats — how employee codes and letter reference numbers are built.
 *
 * The backend mounts the platform's code generator under cf_hrms (the same
 * module cf_erp's "Coding rules" screen talks to), limited to the two things
 * HRMS codes: `hrms_employee` and `hrms_hiring`. The routes and shapes are that
 * module's; nothing here is imported from cf_erp (CF_HRMS_HIRING_SPEC.md §1.3).
 *
 * A code is ISSUED by the server, inside the write that creates the record.
 * No route here hands out a number, and nothing on a screen types one.
 */

/** A value of the record a format can print. The words are the backend's and are shown as written. */
export interface CodegenToken {
  key: string;
  label: string;
  available: boolean;
  note?: string;
  /** How it reads in a sentence: "the department's code". */
  phrase?: string;
  help?: string;
  example?: string;
}
export interface CodegenTokenPattern { pattern: string; label: string; phrase?: string; help?: string; example?: string }
/** Something a format can be limited by: "department is under Production". */
export interface CodegenConditionToken {
  key: string;
  label: string;
  operators: string[];
  valueKind: string;
  values?: string[];
  phrase?: string;
  help?: string;
}

export interface CodegenEntity {
  entityType: string;
  label: string;
  tokens: CodegenToken[];
  tokenPatterns: CodegenTokenPattern[];
  conditionTokens: CodegenConditionToken[];
}

export interface Segment {
  segmentType: 'literal' | 'token' | 'sequence' | 'date';
  literalText?: string | null;
  tokenKey?: string | null;
  format?: string | null;
  transform?: 'none' | 'upper' | 'lower';
  maxLength?: number | null;
  isRequired?: boolean;
}
export interface Condition { tokenKey: string; operator: string; value: string }

export interface CodeScheme {
  id: number;
  code: string;
  name: string;
  entityType: string;
  targetField: 'code' | 'name';
  /** `prefix`: the number starts again whenever the text before it changes. `scheme`: one count for the format. */
  seqScope: 'prefix' | 'scheme';
  priority: number;
  description: string | null;
  status: 'active' | 'inactive';
  conditions: Condition[];
  segments: Segment[];
  counters: { prefix: string; nextValue: number }[];
}

/** What a format writes: everything of a scheme a person decides. */
export interface SchemeInput {
  id?: number;
  code: string;
  name: string;
  entityType: string;
  targetField: 'code';
  seqScope: 'prefix' | 'scheme';
  priority: number;
  /** A PUT replaces the rule whole, so this is sent back as it came or it is wiped. */
  description?: string | null;
  status: 'active' | 'inactive';
  conditions: Condition[];
  segments: Segment[];
}

/** POST /codegen/preview — the shape of a code; it never takes a number. */
export interface Generated {
  schemeId: number | null;
  schemeCode: string | null;
  text: string | null;
  number: number | null;
  missing: string[];
  noRule?: boolean;
  error?: string;
  problems?: string[];
}

export interface RuleVerdict {
  id: number | null;
  code: string;
  name: string;
  priority: number;
  /** The format open in the editor, judged as it will be once saved. */
  draft: boolean;
  conditions: (Condition & { ok: boolean; weight: number })[];
  applies: boolean;
  weight: number | null;
  place: number | null;
  verdict: 'wins' | 'tied' | 'beaten' | 'no' | 'off' | 'unfinished';
  problems?: string[];
}
export interface RuleSelection {
  rules: RuleVerdict[];
  winner: { id: number | null; code: string; draft: boolean } | null;
  decidedBy: 'only' | 'weight' | 'priority' | 'tie' | 'none';
  runnerUp: { id: number | null; code: string; draft: boolean; weight: number; priority: number } | null;
  tied: string[] | null;
}
export interface CodegenPart { state: 'value' | 'blank' | 'empty' | 'missing' | 'unfinished' | 'waiting'; text: string | null }
export interface CodegenValue { state: 'value' | 'blank' | 'missing'; text: string | null }
/** POST /codegen/explain — which format one record gets, and why. */
export interface CodegenExplain {
  selection: RuleSelection;
  parts: CodegenPart[] | null;
  values: Record<string, CodegenValue> | null;
}

/** The two things cf_hrms formats. */
export const EMPLOYEE_CODES = 'hrms_employee';
export const LETTER_REFERENCES = 'hrms_hiring';

export const codegenApi = {
  entities: () => api.get<CodegenEntity[]>('/codegen/entities'),
  schemes: () => api.get<CodeScheme[]>('/codegen/schemes'),
  scheme: (id: number) => api.get<CodeScheme>(`/codegen/schemes/${id}`),
  create: (body: SchemeInput) => api.post<CodeScheme>('/codegen/schemes', body),
  update: (id: number, body: SchemeInput) => api.put<CodeScheme>(`/codegen/schemes/${id}`, body),
  remove: (id: number) => api.del<unknown>(`/codegen/schemes/${id}`),
  /**
   * The shape of the code an unsaved format would make. With `entityId` it is
   * read off that record; without, off an empty draft — values the draft does
   * not have come back in `missing` and the screen shows an example instead.
   */
  preview: (body: { entityType: string; scheme: SchemeInput; entityId?: number }) =>
    api.post<Generated>('/codegen/preview', {
      entityType: body.entityType,
      targetField: 'code',
      scheme: body.scheme,
      ...(body.entityId != null ? { entityId: body.entityId } : { draft: {} }),
    }),
  explain: (body: { entityType: string; scheme: SchemeInput; entityId: number; keys?: string[] }) =>
    api.post<CodegenExplain>('/codegen/explain', { ...body, targetField: 'code' }),
};
