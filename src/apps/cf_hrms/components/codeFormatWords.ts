/**
 * The words of the Code formats screen.
 *
 * Everything said about a VALUE or a CONDITION comes from its definition on the
 * backend (`phrase`, `help`, `example` on each token of `/codegen/entities`), so
 * a new token brings its own words. What is written here is the engine's own
 * and the same for every company: how fixed text, a running number and a date
 * read, and how an example of the finished code is put together.
 *
 * The example is a SHAPE, never a promise: the running number is shown as 1,
 * because the next real number belongs to whoever is saved next.
 */
import type { CodegenEntity, Condition, Segment } from '../api/codegen';
import { EMPLOYEE_CODES, LETTER_REFERENCES } from '../api/codegen';

export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export const OPERATOR_LABEL: Record<string, string> = { eq: 'is', in: 'is one of', under: 'is under' };

/** The thing one code belongs to, in a sentence. */
export const oneOf = (entityType: string) =>
  entityType === EMPLOYEE_CODES ? 'employee' : entityType === LETTER_REFERENCES ? 'letter' : 'record';
export const manyOf = (entityType: string) => `${oneOf(entityType)}s`;
/** What the code is called. */
export const codeWord = (entityType: string) => (entityType === LETTER_REFERENCES ? 'reference number' : 'code');

/** When the code is issued, which is also the date a date part prints. */
export const issuedWhen = (entityType: string) =>
  entityType === EMPLOYEE_CODES
    ? 'when the employee is created'
    : entityType === LETTER_REFERENCES
      ? 'when the first offer letter is generated'
      : 'when the record is saved';

/** What a company with no format of its own gets — the server creates the same on first use (spec §1.4). */
export function defaultSegments(entityType: string): Segment[] {
  if (entityType === LETTER_REFERENCES) {
    return [
      { segmentType: 'literal', literalText: 'HR/' },
      { segmentType: 'token', tokenKey: 'fy' },
      { segmentType: 'literal', literalText: '/' },
      { segmentType: 'sequence', format: '000' },
    ];
  }
  return [
    { segmentType: 'literal', literalText: 'EMP' },
    { segmentType: 'sequence', format: '0000' },
  ];
}

export const DATE_FORMATS = ['YYYY', 'YY', 'YYMM', 'YYYYMM', 'MM', 'YYYYMMDD'];

export function dateExample(format: string | null | undefined, now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (format || 'YYYYMMDD').replace(/YYYY|YY|MM|DD/g, (t) => ({
    YYYY: String(now.getFullYear()), YY: String(now.getFullYear()).slice(-2), MM: pad(now.getMonth() + 1), DD: pad(now.getDate()),
  }[t] ?? t));
}

export const SEQUENCE_DIGITS = ['0', '00', '000', '0000', '00000', '000000'];
export const digitsLabel = (format: string | null | undefined) => {
  const n = (format ?? '').length;
  return n <= 1 ? 'As it comes — 7' : `${n} digits — ${'7'.padStart(n, '0')}`;
};

const tokenOf = (key: string | null | undefined, entity: CodegenEntity | undefined) =>
  entity?.tokens.find((t) => t.key === key);

/** How a value reads in a sentence: "the department's code". */
export function tokenPhrase(key: string | null | undefined, entity: CodegenEntity | undefined): string {
  if (!key) return 'a value not chosen yet';
  const t = tokenOf(key, entity);
  return t?.phrase ?? t?.label ?? key;
}

/** What one part prints in the example. */
export function partExample(s: Segment, entity: CodegenEntity | undefined): string {
  switch (s.segmentType) {
    case 'literal':
      return s.literalText ?? '';
    case 'date':
      return dateExample(s.format);
    case 'sequence':
      return '1'.padStart(Math.max((s.format ?? '').length, 1), '0');
    case 'token': {
      const t = tokenOf(s.tokenKey, entity);
      let v = t?.example ?? (t ? `‹${t.label}›` : '‹value›');
      if (s.transform === 'upper') v = v.toUpperCase();
      if (s.transform === 'lower') v = v.toLowerCase();
      if (s.maxLength) v = v.slice(0, s.maxLength);
      return v;
    }
    default:
      return '';
  }
}

/** The whole code as it would look, running number shown as 1. */
export const shapeOf = (segments: Segment[], entity: CodegenEntity | undefined) =>
  segments.map((s) => partExample(s, entity)).join('');

const quote = (text: string) => (text === ' ' ? 'a space' : `“${text}”`);

export function partPhrase(s: Segment, entity: CodegenEntity | undefined, seqScope: 'prefix' | 'scheme'): string {
  switch (s.segmentType) {
    case 'literal':
      return s.literalText ? quote(s.literalText) : 'some fixed text (not typed yet)';
    case 'token':
      return `${tokenPhrase(s.tokenKey, entity)}${s.maxLength ? ` (cut to ${s.maxLength} characters)` : ''}`;
    case 'sequence': {
      const n = (s.format ?? '').length;
      return `a running number${n > 1 ? ` of ${n} digits` : ''}${seqScope === 'prefix' ? '' : ', one count for everything'}`;
    }
    case 'date':
      return `the date as ${s.format || 'YYYYMMDD'}`;
    default:
      return 'an unknown part';
  }
}

/** The whole format read out: "“KP”, then a running number of 4 digits." */
export function patternSentence(segments: Segment[], entity: CodegenEntity | undefined, seqScope: 'prefix' | 'scheme'): string {
  if (!segments.length) return '';
  return `${cap(segments.map((s) => partPhrase(s, entity, seqScope)).join(', then '))}.`;
}

/** A condition's value as a person reads it. `names` maps ids to names where the value is a record. */
export function conditionValue(c: Condition, names?: Map<string, string>): string {
  if (!c.value) return 'nothing chosen yet';
  const one = (v: string) => names?.get(v.trim()) ?? v.trim();
  return c.operator === 'in' ? c.value.split(',').map(one).join(', ') : one(c.value);
}

export function conditionSentence(c: Condition, entity: CodegenEntity | undefined, names?: Map<string, string>): string {
  const token = entity?.conditionTokens.find((t) => t.key === c.tokenKey);
  return `${token?.phrase ?? token?.label ?? c.tokenKey} ${OPERATOR_LABEL[c.operator] ?? c.operator} ${conditionValue(c, names)}`;
}

/** Does the text before the running number change from record to record? Only then does "start again" mean anything. */
export function numberCanRestart(segments: Segment[]): boolean {
  const at = segments.findIndex((s) => s.segmentType === 'sequence');
  if (at < 0) return false;
  return segments.slice(0, at).some((s) => s.segmentType === 'token' || s.segmentType === 'date');
}
