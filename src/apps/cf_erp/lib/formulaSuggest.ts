import { isWord, type BuilderField, type FieldRole } from './formulaBuilder';
import { withUnit } from './charts';

/**
 * Type-ahead for the formula editor: what to offer for the word the caret is
 * in, narrowing with every character. Pure — the editor draws the list.
 *
 * A word is a run of letters, digits, `_` and `.` ending at the caret (a number
 * is not a word). `item.` / `machine.` / `children.` narrow to that namespace;
 * anything else is matched against functions, the namespaces themselves, and
 * every field by CODE or by NAME ("thick" finds item.THICKNESS). Picking one
 * writes the exact code, so case slips (item.skew) are fixed too.
 */
export type SuggestKind = 'field' | 'function' | 'namespace';

export interface Suggestion {
  kind: SuggestKind;
  /** What replaces the word. */
  insert: string;
  /** Where the caret lands, counted back from the end of `insert` (inside a function's brackets). */
  caretBack: number;
  label: string;
  detail: string;
  field?: BuilderField;
  role?: FieldRole;
}

export interface SuggestContext {
  /** Number fields per namespace the formula may read. */
  fields: Partial<Record<FieldRole, BuilderField[]>>;
  functions: { name: string; args: number; hint: string }[];
  /**
   * The caret is directly inside LOOKUP( … ): argument 0 offers only the machine's charts,
   * later arguments only the piece's number fields, `keyFirst` (the guessed key) leading.
   */
  /** Charts every column of which names a piece's value: written by their bare name (GAS_CUT_SPEED). */
  shortCharts?: BuilderField[];
  lookup?: { arg: number; charts: BuilderField[]; keyFirst?: string | null } | null;
}

export interface SuggestResult {
  /** The word being replaced: [from, to) in the text. */
  from: number;
  to: number;
  items: Suggestion[];
}

const NAMESPACE_WORDS: Record<Exclude<FieldRole, 'plain'>, string> = {
  item: 'This piece',
  machine: 'The machine',
  children: 'BOM children — inside SUM / COUNT / AVG',
};
const MAX_ITEMS = 8;

/**
 * How well `q` matches: 0 = code starts with it, 1 = a word of the name starts with it, 2 = code contains it,
 * 3 = name contains it; −1 = no match. Matches in the middle need 3 letters — "th" inside LENGTH is noise.
 */
function score(q: string, code: string, name: string): number {
  const c = code.toLowerCase(), n = name.toLowerCase();
  if (c.startsWith(q)) return 0;
  if (n.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 1;
  if (q.length < 3) return -1;
  if (c.includes(q)) return 2;
  if (n.includes(q)) return 3;
  return -1;
}

/** A chart, offered as the machine's: machine.DRILL_TIME — "chart · s, by Thickness (mm), Grade, Family". */
function chartItem(f: BuilderField): Suggestion {
  const by = (f.tableConfig?.axes ?? []).map((a) => withUnit(a.label ?? 'Key', a.unit)).join(', ');
  return { kind: 'field', insert: `machine.${f.code}`, caretBack: 0, label: f.name, detail: `machine.${f.code} · chart · ${f.unit ? `${f.unit}, ` : ''}by ${by}`, field: f, role: 'machine' };
}

const refOf = (role: FieldRole, code: string) => (role === 'plain' ? code : `${role}.${code}`);
/** What a field suggestion says it is. */
const detailOf = (role: FieldRole, f: BuilderField) => (f.hint ? `${refOf(role, f.code)} · ${f.hint}` : isWord(f) ? `${refOf(role, f.code)} · word` : refOf(role, f.code));

export function suggestAt(text: string, caret: number, ctx: SuggestContext): SuggestResult | null {
  const before = text.slice(0, caret);
  const m = /[A-Za-z_][A-Za-z0-9_.]*$/.exec(before);
  if (!m) return null;
  // Part of a number (2.5e…) or straight after a digit: not a name.
  if (m.index > 0 && /[0-9.]/.test(before[m.index - 1])) return null;
  // The word runs on past the caret: replace all of it.
  const after = /^[A-Za-z0-9_]*/.exec(text.slice(caret))?.[0] ?? '';
  const word = m[0];
  const from = m.index, to = caret + after.length;

  const scored: { s: number; order: number; item: Suggestion }[] = [];
  const add = (s: number, item: Suggestion) => { if (s >= 0) scored.push({ s, order: scored.length, item }); };
  const fieldItem = (role: FieldRole, f: BuilderField): Suggestion => ({
    kind: 'field', insert: refOf(role, f.code), caretBack: 0, label: f.name, detail: detailOf(role, f), field: f, role,
  });

  const dot = word.indexOf('.');
  if (ctx.lookup) {
    const { arg, charts, keyFirst } = ctx.lookup;
    const role: FieldRole = arg === 0 ? 'machine' : 'item';
    const list = arg === 0 ? charts : (ctx.fields.item ?? []);
    let rest = word.toLowerCase();
    if (dot >= 0) {
      if (word.slice(0, dot).toLowerCase() !== role) return null;
      rest = word.slice(dot + 1).toLowerCase();
    }
    for (const f of list) add(rest ? score(rest, f.code, f.name) : 0, fieldItem(role, f));
    if (keyFirst && arg > 0) {
      const at = scored.findIndex((x) => x.item.field?.code === keyFirst);
      if (at >= 0) scored[at].s = -0.5;
    }
  } else if (dot >= 0) {
    const ns = word.slice(0, dot).toLowerCase() as FieldRole;
    const rest = word.slice(dot + 1).toLowerCase();
    const list = ns !== 'plain' ? (ctx.fields[ns] ?? (ns === 'machine' && ctx.shortCharts?.length ? [] : undefined)) : undefined;
    if (!list) return null;
    for (const f of list) add(rest ? score(rest, f.code, f.name) : 0, fieldItem(ns, f));
    // machine. lists the machine's charts too, beside its numbers.
    if (ns === 'machine') for (const f of ctx.shortCharts ?? []) add(rest ? score(rest, f.code, f.name) : 0, chartItem(f));
  } else {
    const q = word.toLowerCase();
    for (const fn of ctx.functions) {
      if (fn.name.toLowerCase().startsWith(q)) add(0, { kind: 'function', insert: `${fn.name}(${', '.repeat(Math.max(0, fn.args - 1))})`, caretBack: Math.max(0, fn.args - 1) * 2 + 1, label: fn.name, detail: fn.hint });
    }
    for (const [ns, words] of Object.entries(NAMESPACE_WORDS) as [Exclude<FieldRole, 'plain'>, string][]) {
      if (ctx.fields[ns]?.length && ns.startsWith(q)) add(0, { kind: 'namespace', insert: `${ns}.`, caretBack: 0, label: `${ns}.`, detail: words });
    }
    for (const role of ['item', 'machine', 'plain', 'children'] as FieldRole[]) {
      for (const f of ctx.fields[role] ?? []) add(score(q, f.code, f.name), fieldItem(role, f));
    }
    for (const f of ctx.shortCharts ?? []) add(score(q, f.code, f.name), chartItem(f));
  }
  const items = scored.sort((a, b) => a.s - b.s || a.order - b.order).slice(0, MAX_ITEMS).map((x) => x.item);
  // Nothing to add when the only offer is exactly what is typed.
  if (!items.length || (items.length === 1 && items[0].insert === word + after)) return null;
  return { from, to, items };
}
