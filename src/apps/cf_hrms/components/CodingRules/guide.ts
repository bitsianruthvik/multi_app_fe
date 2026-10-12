/**
 * The words of the code-format builder. Everything said about a TOKEN or a
 * CONDITION comes from its definition on the backend (phrase, help, example) —
 * nothing here knows what "department.code" means — so a new token brings its
 * own guide. What IS written here is generic: how fixed text, running numbers,
 * dates and number formats read, which are the engine's own and the same for
 * every thing that has a code.
 */
import type { CodegenEntity, Condition, Segment } from '../../api/codegen';

export const OPERATOR_LABEL: Record<string, string> = { eq: 'is', in: 'is one of', under: 'is under' };

export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** An entity's label inside a sentence: "Employees" reads "employees". */
export const entityWords = (entity?: CodegenEntity | null, fallback = 'records') =>
  entity?.label ? entity.label[0].toLowerCase() + entity.label.slice(1) : fallback;

/** Names for the ids a condition can hold, one map per kind of thing. */
export interface NameMaps {
  department: Map<string, string>;
  location: Map<string, string>;
  role: Map<string, string>;
}
export const emptyNames = (): NameMaps => ({ department: new Map(), location: new Map(), role: new Map() });

/** The kinds of condition value that are ids of something the company holds. */
export const LOOKUP_KINDS = ['department', 'location', 'role'] as const;
export type LookupKind = (typeof LOOKUP_KINDS)[number];
export const isLookupKind = (k: string | undefined): k is LookupKind => !!k && (LOOKUP_KINDS as readonly string[]).includes(k);

/** One value the pattern can print, as the list of pieces shows it. */
export interface PaletteEntry {
  key: string;
  title: string;
  phrase: string;
  help: string | null;
  example: string | null;
  note: string | null;
  disabled: boolean;
  search: string;
}

/** Every value the entity can print. */
export function paletteEntries(entity: CodegenEntity | undefined): PaletteEntry[] {
  if (!entity) return [];
  return entity.tokens.map((t) => {
    const phrase = t.phrase ?? t.label;
    return {
      key: t.key,
      title: cap(phrase),
      phrase,
      help: t.help ?? null,
      example: t.example ?? null,
      note: t.note ?? null,
      disabled: !t.available,
      search: `${phrase} ${t.label} ${t.key} ${t.help ?? ''}`.toLowerCase(),
    };
  });
}

/** How a token reads in a sentence: "the department’s code". */
export function tokenPhrase(key: string | null | undefined, entity: CodegenEntity | undefined): string {
  if (!key) return 'a value not chosen yet';
  const t = entity?.tokens.find((x) => x.key === key);
  return t?.phrase ?? t?.label ?? key;
}

// ---- formats, in words ------------------------------------------------------------

/**
 * A number format as the engine applies it: zeros alone round to a whole number
 * and pad to that many digits; 0.00 fixes the decimals. Only numbers change —
 * text prints as it is.
 */
export const NUMBER_FORMATS: { value: string; label: string; words: string | null }[] = [
  { value: '', label: 'As it is', words: null },
  { value: '0', label: 'Whole number — 12.5 prints 13', words: 'as a whole number' },
  { value: '00', label: 'At least 2 digits — 7 prints 07', words: 'at least 2 digits' },
  { value: '000', label: 'At least 3 digits — 7 prints 007', words: 'at least 3 digits' },
  { value: '0000', label: 'At least 4 digits — 7 prints 0007', words: 'at least 4 digits' },
  { value: '0.0', label: '1 decimal — 12 prints 12.0', words: 'with 1 decimal' },
  { value: '0.00', label: '2 decimals — 12.5 prints 12.50', words: 'with 2 decimals' },
  { value: '0.000', label: '3 decimals — 12.5 prints 12.500', words: 'with 3 decimals' },
];

export function numberFormatOption(format: string | null | undefined) {
  const f = format ?? '';
  const known = NUMBER_FORMATS.find((o) => o.value === f);
  if (known) return known;
  const dec = /^0\.(0+)$/.exec(f);
  if (dec) return { value: f, label: `${dec[1].length} decimals`, words: `with ${dec[1].length} decimals` };
  if (/^0+$/.test(f)) return { value: f, label: `At least ${f.length} digits`, words: `at least ${f.length} digits` };
  return { value: f, label: f, words: null };
}

export const LETTERS: Record<string, { label: string; words: string | null }> = {
  none: { label: 'As they are', words: null },
  upper: { label: 'CAPITALS', words: 'in capitals' },
  lower: { label: 'small letters', words: 'in small letters' },
};

/** Running-number digits: 000 pads 7 to 007. */
export const SEQUENCE_DIGITS = ['0', '00', '000', '0000', '00000'];
export const digitsLabel = (format: string | null | undefined) => {
  const n = (format ?? '').length;
  return n <= 1 ? 'As it comes — 7' : `${n} digits — ${'7'.padStart(n, '0')}`;
};

export const SEQ_SCOPE_WORDS = {
  prefix: 'It counts again from 1 whenever the text before it changes — a new department, a new year or a new location each get their own count.',
  scheme: 'One count for the whole rule, whatever comes before it.',
};

/** Date formats: YYYY 2026, YY 26, MM 09, DD 26, joined with - _ / . if you like. */
export const DATE_PRESETS = ['YYMM', 'YYYYMMDD', 'YYMMDD', 'YYYY', 'YY'];

export function dateExample(format: string | null | undefined, now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (format || 'YYYYMMDD').replace(
    /YYYY|YY|MM|DD/g,
    (t) =>
      ({
        YYYY: String(now.getFullYear()),
        YY: String(now.getFullYear()).slice(-2),
        MM: pad(now.getMonth() + 1),
        DD: pad(now.getDate()),
      })[t] ?? t,
  );
}

// ---- the pattern as a sentence ---------------------------------------------------

const quote = (text: string) => (text === ' ' ? 'a space' : `“${text}”`);

/**
 * How one part of a pattern reads. What changes the text shows — digits,
 * decimals, a length limit; letter case stays with the part's own options, as
 * codes are capitals anyway and "in capitals" after every value only hides
 * what matters.
 */
export function partPhrase(s: Segment, entity: CodegenEntity | undefined, seqScope: 'prefix' | 'scheme'): string {
  switch (s.segmentType) {
    case 'literal':
      return s.literalText ? quote(s.literalText) : 'some fixed text (not typed yet)';
    case 'token': {
      const extra = [
        s.format && s.format !== '0' ? numberFormatOption(s.format).words : null,
        s.maxLength ? `cut to ${s.maxLength} characters` : null,
      ].filter(Boolean);
      return `${tokenPhrase(s.tokenKey, entity)}${extra.length ? ` (${extra.join(', ')})` : ''}`;
    }
    case 'sequence': {
      const n = (s.format ?? '').length;
      const digits = n > 1 ? ` of ${n} digits` : '';
      return `a running number${digits}${seqScope === 'scheme' ? ', one count for the whole rule' : ', counted again for each different text before it'}`;
    }
    case 'date':
      return `today’s date as ${s.format || 'YYYYMMDD'}`;
    default:
      return 'an unknown part';
  }
}

/** The whole pattern, read out: "The department’s code, then “-”, then a running number of 4 digits." */
export function patternSentence(segments: Segment[], entity: CodegenEntity | undefined, seqScope: 'prefix' | 'scheme'): string {
  if (!segments.length) return '';
  return `${cap(segments.map((s) => partPhrase(s, entity, seqScope)).join(', then '))}.`;
}

/** The pattern in the short form the list shows: {department.code}-{####}. */
export function patternText(segments: Segment[]) {
  return segments
    .map((s) => {
      if (s.segmentType === 'literal') return s.literalText ?? '';
      if (s.segmentType === 'token') return `{${s.tokenKey ?? 'not chosen'}${s.format ? `:${s.format}` : ''}}`;
      if (s.segmentType === 'sequence') return `{${(s.format || '0').replace(/0/g, '#')}}`;
      return `{${s.format || 'YYYYMMDD'}}`;
    })
    .join('');
}

// ---- conditions, in words ----------------------------------------------------------

/** A condition's value as a person reads it: names for ids, the value itself otherwise. */
export function conditionValue(c: Condition, entity: CodegenEntity | undefined, names: NameMaps) {
  if (!c.value) return 'nothing chosen yet';
  const kind = entity?.conditionTokens.find((t) => t.key === c.tokenKey)?.valueKind;
  if (isLookupKind(kind)) {
    return c.value
      .split(',')
      .map((id) => names[kind].get(id.trim()) ?? id.trim())
      .join(', ');
  }
  return c.operator === 'in' ? c.value.split(',').map((v) => v.trim()).join(', ') : c.value;
}

/** "department is Production" — the condition's own phrase, its operator, its value. */
export function conditionSentence(c: Condition, entity: CodegenEntity | undefined, names: NameMaps) {
  const token = entity?.conditionTokens.find((t) => t.key === c.tokenKey);
  return `${token?.phrase ?? token?.label ?? c.tokenKey} ${OPERATOR_LABEL[c.operator] ?? c.operator} ${conditionValue(c, entity, names)}`;
}
