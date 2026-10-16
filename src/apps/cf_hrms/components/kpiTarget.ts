/**
 * kpiTarget.ts — a KPI's structured target on the screens (CF_HRMS_HIRING_SPEC.md §24 step 2).
 *
 * THE CLIENT MIRROR of the backend's services/kpiTarget.js: the vocabulary (measured in, which way),
 * the live sentence ("At least 95% — higher is better"), and a reader for free text that gives the
 * same answer the server will. It is a PREVIEW: the server reads the target again when it is saved
 * and its answer (the line's `structured`) is what the screens show afterwards. Keep the two in step:
 * a rule changed there is changed here.
 */

export type Measure = 'PERCENTAGE' | 'NUMBER' | 'CURRENCY' | 'DURATION' | 'WEIGHT' | 'LENGTH' | 'BOOLEAN' | 'DATE';
export type Better = 'HIGHER_BETTER' | 'LOWER_BETTER' | 'EXACT' | 'TARGET_RANGE';

/** A target as the server reads it (a line's `structured`). */
export interface TargetSpec {
  measure: Measure;
  unit: string | null;
  direction: Better | null;
  value?: number;
  min?: number;
  max?: number;
  date?: string;
  /** ▲ ▼ = ↔, "by", ✓ */ mark?: string | null;
  sentence?: string | null;
  text?: string | null;
  short?: string | null;
  /** Which parts the library KPI decided. */ from?: { measure: boolean; direction: boolean };
}

/** What the library KPI says: the rule every role, position and person using it follows. */
export interface TargetRule {
  measure: Measure | null;
  unit: string | null;
  direction: Better | null;
}

export const MEASURES: Measure[] = ['PERCENTAGE', 'NUMBER', 'CURRENCY', 'DURATION', 'WEIGHT', 'LENGTH', 'BOOLEAN', 'DATE'];
export const MEASURE_WORDS: Record<Measure, string> = {
  PERCENTAGE: 'Percentage', NUMBER: 'Number', CURRENCY: 'Rupees', DURATION: 'Time', WEIGHT: 'Weight', LENGTH: 'Length',
  BOOLEAN: 'Done or not', DATE: 'Date / milestone',
};
/** The units a measure is counted in; the first is the default. Number takes a label of its own. */
export const MEASURE_UNITS: Record<Measure, string[]> = {
  PERCENTAGE: ['%'], CURRENCY: ['₹'], DURATION: ['minutes', 'hours', 'days'], WEIGHT: ['kg', 'MT'], LENGTH: ['m'], NUMBER: [], BOOLEAN: [], DATE: [],
};
export const BETTERS: Better[] = ['HIGHER_BETTER', 'LOWER_BETTER', 'EXACT', 'TARGET_RANGE'];
export const BETTER_WORDS: Record<Better, string> = { HIGHER_BETTER: 'Higher is better', LOWER_BETTER: 'Lower is better', EXACT: 'Exactly', TARGET_RANGE: 'Within a range' };
export const BETTER_SHORT: Record<Better, string> = { HIGHER_BETTER: 'Higher', LOWER_BETTER: 'Lower', EXACT: 'Exactly', TARGET_RANGE: 'Within a range' };
export const BETTER_MARK: Record<Better, string> = { HIGHER_BETTER: '▲', LOWER_BETTER: '▼', EXACT: '=', TARGET_RANGE: '↔' };
const NO_DIRECTION = new Set<Measure>(['BOOLEAN', 'DATE']);

export const asMeasure = (v: string | null | undefined): Measure | null => (MEASURES.includes(String(v ?? '').toUpperCase() as Measure) ? (String(v).toUpperCase() as Measure) : null);
export const asBetter = (v: string | null | undefined): Better | null => (BETTERS.includes(String(v ?? '').toUpperCase() as Better) ? (String(v).toUpperCase() as Better) : null);

/** A KPI definition (or a line carrying its definition's fields) -> its rule. TEXT / NEUTRAL = not set. */
export function ruleOf(def: { measurementType?: string | null; unit?: string | null; direction?: string | null } | null | undefined): TargetRule {
  const measure = asMeasure(def?.measurementType);
  return {
    measure,
    unit: measure && NO_DIRECTION.has(measure) ? null : (def?.unit || (measure ? MEASURE_UNITS[measure][0] ?? null : null)),
    direction: measure && NO_DIRECTION.has(measure) ? null : asBetter(def?.direction),
  };
}
/** The KPI says enough to take a number (or a range, a date, "done") rather than words. */
export const ruleIsSet = (r: TargetRule) => Boolean(r.measure && (NO_DIRECTION.has(r.measure) || r.direction));

/** "Percentage", "Time (minutes)", "Number (cylinders)" — what a library row shows. */
export function measureLabel(measurementType?: string | null, unit?: string | null): string | null {
  const m = asMeasure(measurementType);
  if (!m) return null;
  const showUnit = unit && !['PERCENTAGE', 'CURRENCY', 'BOOLEAN', 'DATE'].includes(m);
  return `${MEASURE_WORDS[m]}${showUnit ? ` (${unit})` : ''}`;
}

/* ── amounts ─────────────────────────────────────────────────────────── */
const AMOUNT = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
/** "95%", "30 minutes", "₹12 L", "₹1.5 Cr", "2,400 cylinders" — as the server writes them. */
export function amount(value: number, unit: string | null | undefined): string {
  const u = unit === 'count' ? null : unit ?? null;
  if (u === '₹') {
    const sign = value < 0 ? '-' : '';
    const a = Math.abs(value);
    if (a >= 1e7) return `${sign}₹${AMOUNT.format(a / 1e7)} Cr`;
    if (a >= 1e5) return `${sign}₹${AMOUNT.format(a / 1e5)} L`;
    return `${sign}₹${AMOUNT.format(a)}`;
  }
  const n = AMOUNT.format(value);
  if (!u) return n;
  return u === '%' ? `${n}%` : `${n} ${u}`;
}
const ends = (s: TargetSpec, join: string) => (s.unit === '₹' || s.unit === '%' || !s.unit || s.unit === 'count'
  ? `${amount(s.min ?? 0, s.unit)}${join}${amount(s.max ?? 0, s.unit)}`
  : `${amount(s.min ?? 0, null)}${join}${amount(s.max ?? 0, s.unit)}`);
export const longDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** The live sentence: "At least 95% — higher is better", "Between ₹10 L and ₹12 L — inside the range is met", "Done by 30 Nov 2026". */
export function sentenceOf(s: TargetSpec | null | undefined): string | null {
  if (!s) return null;
  if (s.measure === 'BOOLEAN') return 'Done or not — met when it is done';
  if (s.measure === 'DATE') return s.date ? `Done by ${longDay(s.date)}` : null;
  if (s.direction === 'TARGET_RANGE') return s.min != null && s.max != null ? `Between ${ends(s, ' and ')} — inside the range is met` : null;
  if (s.value == null) return null;
  const a = amount(s.value, s.unit);
  if (s.direction === 'LOWER_BETTER') return `At most ${a} — lower is better`;
  if (s.direction === 'EXACT') return `Exactly ${a} — no more, no less`;
  return `At least ${a} — higher is better`;
}

/* ── reading free text (the server's parser, mirrored) ───────────────── */
const LOWER_PREFIX = /^(?:max(?:imum)?\.?|at most|up ?to|under|below|less than|not more than|no more than|within|<=?|≤)\s*/i;
const HIGHER_PREFIX = /^(?:min(?:imum)?\.?|at least|over|above|more than|not less than|>=?|≥)\s*/i;
const EXACT_PREFIX = /^(?:exactly|=)\s*/i;
const CURRENCY_PREFIX = /^(?:₹|rs\.?|inr)\s*/i;
const NUMBER = /^(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d+))?/;
const MULTIPLIER: [RegExp, number][] = [[/^L$/, 1e5], [/^(?:lakhs?|lacs?)$/i, 1e5], [/^(?:cr\.?|crores?)$/i, 1e7]];
const MULTIPLIER_END = /(?:\bL|\b(?:lakhs?|lacs?|cr\.?|crores?))\s*$/i;
const UNITS: [RegExp, string][] = [
  [/^%$/, '%'],
  [/^(?:working\s+)?minutes?$|^mins?\.?$/i, 'minutes'],
  [/^(?:working\s+)?hours?$|^hrs?\.?$/i, 'hours'],
  [/^(?:working\s+)?days?$/i, 'days'],
  [/^m$|^mtrs?\.?$|^metres?$|^meters?$/i, 'm'],
  [/^mt$|^tonnes?$|^tons?$/i, 'MT'],
  [/^kgs?\.?$/i, 'kg'],
  [/^(?:nos?\.?|numbers?|units?|pcs\.?|pieces?|count)$/i, 'count'],
];
const TIME_UNITS = new Set(['minutes', 'hours', 'days']);
const HIGHER_QUALIFIERS = /^(?:compliance|accuracy|adherence|achievement|attendance|completion|utili[sz]ation|efficiency|on[- ]time|availability|uptime|coverage)$/i;
const LOWER_NAME = /\b(?:wastage|waste|scrap|reject(?:ion|s)?|complaints?|downtime|breakdowns?|delays?|deviation|variance|errors?|defects?|accidents?|incidents?|absent(?:eeism)?|leakage|loss(?:es)?|returns?|escalations?|overdue|pending|backlog|tat|time|turnaround|lead time|cost)\b/i;
const clean = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();

interface Parsed { direction: Better; number: number; unit: string | null; explicit: boolean }
function parseOne(text: string, kpiName = '', definitionDirection: Better | null = null): Parsed | null {
  let s = clean(text);
  if (!s) return null;
  let direction: Better | null = null;
  const lo = LOWER_PREFIX.exec(s);
  if (lo) { direction = 'LOWER_BETTER'; s = s.slice(lo[0].length); } else {
    const hi = HIGHER_PREFIX.exec(s);
    if (hi) { direction = 'HIGHER_BETTER'; s = s.slice(hi[0].length); } else {
      const ex = EXACT_PREFIX.exec(s);
      if (ex) { direction = 'EXACT'; s = s.slice(ex[0].length); }
    }
  }
  const explicitPrefix = direction != null;
  let unit: string | null = null;
  const cur = CURRENCY_PREFIX.exec(s);
  if (cur) { unit = '₹'; s = s.slice(cur[0].length); }
  const n = NUMBER.exec(s);
  if (!n) return null;
  let number = Number(`${n[1].replace(/,/g, '')}${n[2] ? `.${n[2]}` : ''}`);
  if (!Number.isFinite(number)) return null;
  let rest = s.slice(n[0].length).trim();
  let qualifier: string | null = null;
  if (rest.startsWith('%')) { if (unit) return null; unit = '%'; rest = rest.slice(1).trim(); }
  if (rest) {
    let words = rest.split(' ');
    const mult = MULTIPLIER.find(([re]) => re.test(words[0]));
    if (mult && (unit === '₹' || unit === null)) { number *= mult[1]; unit = '₹'; words = words.slice(1); }
    let matched: { unit: string; take: number } | null = null;
    for (const take of [2, 1]) {
      if (unit || words.length < take) continue;
      const cand = words.slice(0, take).join(' ');
      const hit = UNITS.find(([re]) => re.test(cand));
      if (hit) { matched = { unit: hit[1], take }; break; }
    }
    let left = words;
    if (matched) { unit = matched.unit; left = words.slice(matched.take); }
    if (left.length > 1) return null;
    if (left.length === 1) {
      if (unit !== '%' || !HIGHER_QUALIFIERS.test(left[0])) return null;
      qualifier = left[0];
    }
  }
  number = Math.round(number * 10000) / 10000;
  if (!direction) {
    if (qualifier) direction = 'HIGHER_BETTER';
    else if (unit && TIME_UNITS.has(unit)) direction = 'LOWER_BETTER';
    else if (LOWER_NAME.test(kpiName)) direction = 'LOWER_BETTER';
    else if (definitionDirection === 'LOWER_BETTER' || definitionDirection === 'HIGHER_BETTER') direction = definitionDirection;
    else if (number === 0) direction = 'EXACT';
    else direction = 'HIGHER_BETTER';
  }
  return { direction, number, unit, explicit: explicitPrefix || qualifier != null };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_WORD = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_PREFIX = /^(?:(?:to be )?(?:done|completed?|achieved?|closed|delivered|implemented)\s+)?(?:by|before|on or before|on|due(?: by| on)?|deadline:?)\s+/i;
const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const year4 = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
const realDate = (y: number, m: number, d: number) => (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= lastDay(y, m) ? `${y}-${pad(m)}-${pad(d)}` : null);
const monthOf = (w: string) => MONTHS.indexOf(w.slice(0, 3).toLowerCase()) + 1;
function readDate(text: string): string | null {
  let s = clean(text).replace(/[.,]$/, '');
  if (!s) return null;
  const pre = DATE_PREFIX.exec(s);
  if (pre) s = s.slice(pre[0].length);
  s = s.replace(/^(?:the )?end of (?:the month of )?/i, 'end ');
  const end = /^end /i.test(s);
  if (end) s = s.slice(4);
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m && !end) return realDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(s);
  if (m && !end) return realDate(year4(m[3]), Number(m[2]), Number(m[1]));
  m = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_WORD}\\.?\\s*(?:'|’)?\\s*(\\d{2}|\\d{4})$`, 'i').exec(s);
  if (m && !end) return realDate(year4(m[3]), monthOf(m[2]), Number(m[1]));
  m = new RegExp(`^${MONTH_WORD}\\.?\\s*(?:'|’)?\\s*(\\d{2}|\\d{4})$`, 'i').exec(s);
  if (m) { const y = year4(m[2]); const mo = monthOf(m[1]); return realDate(y, mo, lastDay(y, mo)); }
  return null;
}
function readRange(text: string): { min: number; max: number; unit: string | null } | null {
  const m = /^(?:between|from)?\s*(.+?)\s*(?:–|—|-|\bto\b|\band\b)\s*(.+)$/i.exec(clean(text));
  if (!m) return null;
  const a = parseOne(m[1]);
  const b = parseOne(m[2]);
  if (!a || !b || a.explicit || b.explicit) return null;
  let ua = a.unit;
  const ub = b.unit;
  let min = a.number;
  if (ub === '₹' && (ua == null || ua === '₹') && MULTIPLIER_END.test(m[2]) && !MULTIPLIER_END.test(m[1])) {
    min = a.number * (/(?:cr\.?|crores?)\s*$/i.test(m[2]) ? 1e7 : 1e5);
    ua = '₹';
  }
  if (ua && ub && ua !== ub) return null;
  if (!(b.number > min)) return null;
  return { min, max: b.number, unit: ua ?? ub };
}
export const unitMeasure = (u: string | null): Measure | null => {
  if (!u) return null;
  if (u === '%') return 'PERCENTAGE';
  if (u === '₹') return 'CURRENCY';
  if (/^(minutes?|hours?|days?)$/i.test(u)) return 'DURATION';
  if (/^(kg|mt)$/i.test(u)) return 'WEIGHT';
  if (/^m$/i.test(u)) return 'LENGTH';
  return 'NUMBER';
};

/** Free text -> the structure the server would fill, with the KPI's rule in mind; null = it stays words. */
export function readTargetText(text: string, rule: TargetRule, name = ''): TargetSpec | null {
  const s = clean(text);
  if (!s) return null;
  const dm = rule.measure;
  const db = rule.direction;
  const dUnit = dm && rule.unit ? rule.unit : null;
  if (dm === 'BOOLEAN') return { measure: 'BOOLEAN', unit: null, direction: null };
  const date = readDate(s);
  if (date) return dm && dm !== 'DATE' ? null : { measure: 'DATE', unit: null, direction: null, date };
  if (dm === 'DATE') return null;
  const fit = (u: string | null) => {
    const pm = unitMeasure(u);
    if (dm && pm && pm !== dm && !(dm === 'NUMBER' && u === 'count')) return false;
    if (dm && dUnit && u && dm !== 'NUMBER' && u.toLowerCase() !== dUnit.toLowerCase()) return false;
    return true;
  };
  const measureFor = (u: string | null): Measure => dm ?? unitMeasure(u) ?? 'NUMBER';
  const unitFor = (u: string | null) => (dm ? (dUnit ?? u ?? MEASURE_UNITS[dm][0] ?? null) : u);
  const range = readRange(s);
  if (range) {
    if ((db && db !== 'TARGET_RANGE') || !fit(range.unit)) return null;
    return { measure: measureFor(range.unit), unit: unitFor(range.unit), direction: 'TARGET_RANGE', min: range.min, max: range.max };
  }
  let t = s;
  let labelled = false;
  if (dm === 'NUMBER' && dUnit) {
    const re = new RegExp(`\\s*${dUnit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/s$/i, '')}s?$`, 'i');
    if (re.test(t) && t.replace(re, '').trim()) { t = t.replace(re, '').trim(); labelled = true; }
  }
  const p = parseOne(t, name, db);
  if (!p) return null;
  const unit = labelled ? dUnit : p.unit;
  if (!labelled && !fit(unit)) return null;
  if (db === 'TARGET_RANGE') return null;
  if (db && p.explicit && p.direction !== db) return null;
  return { measure: measureFor(unit), unit: unitFor(unit), direction: db ?? p.direction, value: p.number };
}

/* ── the editor's draft ──────────────────────────────────────────────── */

/** What the target input holds while it is typed. */
export interface TargetDraft {
  /** Typed as words (free text) rather than a number. */ words: boolean;
  value: string;
  min: string;
  max: string;
  date: string;
  text: string;
}
export const EMPTY_DRAFT: TargetDraft = { words: false, value: '', min: '', max: '', date: '', text: '' };

const str = (n: number | undefined | null) => (n == null ? '' : String(n));
/** A line's target (its `structured` and its text) -> a draft for the input. */
export function draftOf(line: { structured?: TargetSpec | null; targetText?: string | null } | null | undefined, rule: TargetRule): TargetDraft {
  const s = line?.structured ?? null;
  const text = line?.targetText && !/^(?:tracked, no target set|target not set|range target not set)$/i.test(line.targetText) ? line.targetText : '';
  if (ruleIsSet(rule) && s) {
    if (rule.measure === 'BOOLEAN' && s.measure === 'BOOLEAN') return { ...EMPTY_DRAFT, text };
    if (rule.measure === 'DATE' && s.date) return { ...EMPTY_DRAFT, date: s.date, text };
    if (rule.direction === 'TARGET_RANGE' && s.min != null) return { ...EMPTY_DRAFT, min: str(s.min), max: str(s.max), text };
    if (rule.direction !== 'TARGET_RANGE' && s.value != null) return { ...EMPTY_DRAFT, value: str(s.value), text };
  }
  if (ruleIsSet(rule) && !text) return { ...EMPTY_DRAFT };
  return { ...EMPTY_DRAFT, words: true, text };
}

const num = (s: string) => (s.trim() === '' ? NaN : Number(s.trim().replace(/,/g, '')));

/** The structure a draft says (with the rule), or null — and a problem in words when it cannot be read. */
export function readDraft(d: TargetDraft, rule: TargetRule, name = ''): { spec: TargetSpec | null; problem: string | null; empty: boolean } {
  if (d.words || !ruleIsSet(rule)) {
    const t = clean(d.text);
    if (!t) return { spec: null, problem: null, empty: true };
    return { spec: readTargetText(t, rule, name), problem: null, empty: false };
  }
  const m = rule.measure as Measure;
  if (m === 'BOOLEAN') return { spec: { measure: 'BOOLEAN', unit: null, direction: null }, problem: null, empty: false };
  if (m === 'DATE') {
    if (!d.date) return { spec: null, problem: null, empty: true };
    return /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? { spec: { measure: 'DATE', unit: null, direction: null, date: d.date }, problem: null, empty: false } : { spec: null, problem: 'Give the date it is due.', empty: false };
  }
  if (rule.direction === 'TARGET_RANGE') {
    if (!d.min.trim() && !d.max.trim()) return { spec: null, problem: null, empty: true };
    const lo = num(d.min);
    const hi = num(d.max);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { spec: null, problem: 'Give the lowest and the highest, as numbers.', empty: false };
    if (!(hi > lo)) return { spec: null, problem: 'The highest must be above the lowest.', empty: false };
    return { spec: { measure: m, unit: rule.unit, direction: 'TARGET_RANGE', min: lo, max: hi }, problem: null, empty: false };
  }
  if (!d.value.trim()) return { spec: null, problem: null, empty: true };
  const v = num(d.value);
  if (!Number.isFinite(v)) return { spec: null, problem: 'The target is a number.', empty: false };
  if (m === 'PERCENTAGE' && (v < 0 || v > 1000)) return { spec: null, problem: 'A percentage is between 0 and 1000.', empty: false };
  return { spec: { measure: m, unit: rule.unit, direction: rule.direction, value: v }, problem: null, empty: false };
}

/** What the server is sent: { text } for words; { value } | { min, max } | { date } | { done: true }; null for "no target". */
export type TargetBody = { text: string } | { value: number } | { min: number; max: number } | { date: string } | { done: true };
export function targetBody(d: TargetDraft, rule: TargetRule): TargetBody | null {
  if (d.words || !ruleIsSet(rule)) {
    const t = clean(d.text);
    return t ? { text: t } : null;
  }
  const r = readDraft(d, rule);
  if (!r.spec) return null;
  if (r.spec.measure === 'BOOLEAN') return { done: true };
  if (r.spec.measure === 'DATE') return { date: r.spec.date as string };
  if (r.spec.direction === 'TARGET_RANGE') return { min: r.spec.min as number, max: r.spec.max as number };
  return { value: r.spec.value as number };
}
export const sameDraft = (a: TargetDraft, b: TargetDraft) =>
  a.words === b.words && clean(a.text) === clean(b.text) && a.value.trim() === b.value.trim() && a.min.trim() === b.min.trim() && a.max.trim() === b.max.trim() && a.date === b.date;
