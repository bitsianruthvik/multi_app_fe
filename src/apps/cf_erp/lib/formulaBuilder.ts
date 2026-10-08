/**
 * The operation-time builder's pure logic — no React, so the jsdom suite and
 * the screens share it:
 *
 *   tokenize / parse   the backend's grammar (formulaEngine.js), for syntax
 *                      colouring and for reading a formula back "in words"
 *   formulaInWords     "Cut length ÷ cutting speed (by thickness) + piercings × pierce time"
 *   rate × quantity    parseRateExpression, to read "1.2 min per m of weld length"
 *                      back in words (mm → m is ÷ 1000)
 *   unitWarnings       mm-vs-m and similar slips, derived from field units
 *
 * The backend stays the judge (POST /formulas/check); this only helps write
 * and read formulas.
 */

/* ===========================================================================
 * Fields
 * ======================================================================== */

export interface TableAxisLike { label?: string; unit?: string | null; specCode?: string | null }
export interface BuilderField {
  code: string;
  name: string;
  dataType: 'number' | 'table' | string;
  measurementType: string | null;
  unit: string | null;
  description?: string | null;
  tableConfig?: { axes?: TableAxisLike[]; mode?: string } | null;
  /** A real value from a piece / machine, when one has it. */
  example?: number | null;
  exampleFrom?: string | null;
  /** How many sample pieces / machines carry it. */
  count?: number;
}

export type FieldRole = 'item' | 'machine' | 'plain' | 'children';
export interface FieldIndex { item: Map<string, BuilderField>; machine: Map<string, BuilderField>; plain: Map<string, BuilderField> }

export function fieldIndex(itemFields: BuilderField[], machineFields: BuilderField[], plainFields: BuilderField[] = []): FieldIndex {
  const plain = new Map(plainFields.map((f) => [f.code, f]));
  const item = new Map(itemFields.map((f) => [f.code, f]));
  const machine = new Map(machineFields.map((f) => [f.code, f]));
  return { item, machine, plain };
}

/** A field by role, falling back to any list (a spec is a spec wherever it is read). */
export function fieldFor(idx: FieldIndex, role: FieldRole, code: string): BuilderField | null {
  const primary = role === 'machine' ? idx.machine : role === 'item' ? idx.item : idx.plain;
  return primary.get(code) ?? idx.item.get(code) ?? idx.machine.get(code) ?? idx.plain.get(code) ?? null;
}

/** CUT_LENGTH → "cut length" when the specification is not known by name. */
export const humanize = (code: string) => code.toLowerCase().replace(/_+/g, ' ').trim();

/** "mm2" → "mm²". */
export const unitText = (u: string | null | undefined) => (u ? u.replace(/2$/, '²').replace(/3$/, '³') : '');

export function numberText(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const s = abs >= 1000 ? n.toLocaleString('en-IN', { maximumFractionDigits: 1 })
    : abs >= 1 ? String(Number(n.toFixed(3))) : String(Number(n.toPrecision(3)));
  return s;
}

/* ===========================================================================
 * Tokens and the grammar (mirrors formulaEngine.js)
 * ======================================================================== */

export type TokKind = 'num' | 'item' | 'machine' | 'children' | 'name' | 'func' | 'op' | 'paren' | 'comma' | 'space' | 'bad';
export interface Tok { kind: TokKind; text: string; start: number; end: number; code?: string }

export const FUNCTIONS = ['MIN', 'MAX', 'ROUND', 'IF', 'LOOKUP', 'ABS', 'SQRT', 'CEIL', 'FLOOR', 'SUM', 'COUNT', 'AVG'];

/** Every character of the source lands in exactly one token, so the colouring layer lines up with the text. */
export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const ws = /^\s+/.exec(rest);
    if (ws) { out.push({ kind: 'space', text: ws[0], start: i, end: i + ws[0].length }); i += ws[0].length; continue; }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(rest);
    if (num) { out.push({ kind: 'num', text: num[0], start: i, end: i + num[0].length }); i += num[0].length; continue; }
    const name = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(rest);
    if (name) {
      const text = name[0];
      const after = src.slice(i + text.length);
      const cx = /^(item|machine|children)\.([A-Za-z_][A-Za-z0-9_]*)$/i.exec(text);
      let kind: TokKind = 'name';
      let code: string | undefined = text.toUpperCase();
      if (cx) { kind = cx[1].toLowerCase() as TokKind; code = cx[2].toUpperCase(); } else if (/^\s*\(/.test(after)) { kind = 'func'; }
      out.push({ kind, text, start: i, end: i + text.length, code });
      i += text.length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '<>'].includes(two)) { out.push({ kind: 'op', text: two, start: i, end: i + 2 }); i += 2; continue; }
    const ch = src[i];
    if ('()'.includes(ch)) { out.push({ kind: 'paren', text: ch, start: i, end: i + 1 }); i++; continue; }
    if (ch === ',') { out.push({ kind: 'comma', text: ch, start: i, end: i + 1 }); i++; continue; }
    if ('+-*/%^<>='.includes(ch)) { out.push({ kind: 'op', text: ch, start: i, end: i + 1 }); i++; continue; }
    out.push({ kind: 'bad', text: ch, start: i, end: i + 1 });
    i++;
  }
  return out;
}

export type Ast =
  | { type: 'num'; value: number }
  | { type: 'ref'; name: string; role: FieldRole; code: string }
  | { type: 'neg'; arg: Ast }
  | { type: 'bin'; op: string; left: Ast; right: Ast }
  | { type: 'call'; name: string; args: Ast[] };

const COMPARISONS = new Set(['<', '<=', '>', '>=', '=', '==', '!=', '<>']);

function refOf(name: string): Ast {
  const cx = /^(item|machine|children)\.([A-Za-z_][A-Za-z0-9_]*)$/i.exec(name);
  if (cx) return { type: 'ref', name, role: cx[1].toLowerCase() as FieldRole, code: cx[2].toUpperCase() };
  return { type: 'ref', name, role: 'plain', code: name.toUpperCase() };
}

/** Parses or throws an Error with a message; the backend has the final word on names. */
export function parse(src: string): Ast {
  const toks = tokenize(src).filter((t) => t.kind !== 'space');
  const bad = toks.find((t) => t.kind === 'bad');
  if (bad) throw new Error(`Unexpected "${bad.text}"`);
  let k = 0;
  const peek = () => toks[k];
  const isOp = (v: string) => !!peek() && (peek().kind === 'op' || peek().kind === 'paren' || peek().kind === 'comma') && peek().text === v;
  const expect = (v: string) => { if (!isOp(v)) throw new Error(`Expected "${v}"`); k++; };
  function primary(): Ast {
    const t = peek();
    if (!t) throw new Error('The formula ends too early');
    if (t.kind === 'num') { k++; return { type: 'num', value: Number(t.text) }; }
    if (t.kind === 'func' || t.kind === 'name' || t.kind === 'item' || t.kind === 'machine' || t.kind === 'children') {
      k++;
      if (isOp('(')) {
        k++;
        const args: Ast[] = [];
        if (!isOp(')')) { args.push(comparison()); while (isOp(',')) { k++; args.push(comparison()); } }
        expect(')');
        const fname = t.text.toUpperCase();
        if (!FUNCTIONS.includes(fname)) throw new Error(`Unknown function ${t.text}`);
        return { type: 'call', name: fname, args };
      }
      return refOf(t.text);
    }
    if (isOp('(')) { k++; const e = comparison(); expect(')'); return e; }
    throw new Error(`Unexpected "${t.text}"`);
  }
  function power(): Ast { const b = primary(); if (isOp('^')) { k++; return { type: 'bin', op: '^', left: b, right: unary() }; } return b; }
  function unary(): Ast {
    if (isOp('-')) { k++; return { type: 'neg', arg: unary() }; }
    if (isOp('+')) { k++; return unary(); }
    return power();
  }
  function term(): Ast {
    let l = unary();
    while (isOp('*') || isOp('/') || isOp('%')) { const op = toks[k++].text; l = { type: 'bin', op, left: l, right: unary() }; }
    return l;
  }
  function additive(): Ast {
    let l = term();
    while (isOp('+') || isOp('-')) { const op = toks[k++].text; l = { type: 'bin', op, left: l, right: term() }; }
    return l;
  }
  function comparison(): Ast {
    const l = additive();
    if (peek() && peek().kind === 'op' && COMPARISONS.has(peek().text)) { const op = toks[k++].text; return { type: 'bin', op, left: l, right: additive() }; }
    return l;
  }
  if (!toks.length) throw new Error('The formula is empty');
  const ast = comparison();
  if (k < toks.length) throw new Error(`Unexpected "${toks[k].text}"`);
  return ast;
}

export function tryParse(src: string): Ast | null {
  try { return parse(src); } catch { return null; }
}

/** Every item./machine./plain reference (LOOKUP tables included), in order of first use. */
export function refsIn(ast: Ast | null): { role: FieldRole; code: string; table: boolean }[] {
  const out: { role: FieldRole; code: string; table: boolean }[] = [];
  const seen = new Set<string>();
  const visit = (n: Ast, table = false) => {
    if (n.type === 'ref') { const key = `${n.role}.${n.code}`; if (!seen.has(key)) { seen.add(key); out.push({ role: n.role, code: n.code, table }); } return; }
    if (n.type === 'neg') visit(n.arg);
    if (n.type === 'bin') { visit(n.left); visit(n.right); }
    if (n.type === 'call') n.args.forEach((a, i) => visit(a, n.name === 'LOOKUP' && i === 0));
  };
  if (ast) visit(ast);
  return out;
}

/* ===========================================================================
 * In words
 * ======================================================================== */

const PREC: Record<string, number> = { '<': 0, '<=': 0, '>': 0, '>=': 0, '=': 0, '==': 0, '!=': 0, '<>': 0, '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 4 };
const OP_WORD: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷', '%': 'mod', '^': '^', '<': '<', '<=': '≤', '>': '>', '>=': '≥', '=': '=', '==': '=', '!=': '≠', '<>': '≠' };
const precOf = (n: Ast) => (n.type === 'bin' ? PREC[n.op] : n.type === 'neg' ? 3 : 5);

export function nameIn(idx: FieldIndex | null, role: FieldRole, code: string): string {
  const f = idx ? fieldFor(idx, role, code) : null;
  // Lower-case ordinary words mid-sentence, but keep acronyms (SAW, MIG, CNC) as they are.
  return (f?.name ?? humanize(code)).split(' ').map((w) => (/^[A-Z][a-z]/.test(w) || /^[A-Z]$/.test(w) ? w.toLowerCase() : w)).join(' ');
}

function words(n: Ast, idx: FieldIndex | null): string {
  switch (n.type) {
    case 'num': return numberText(n.value);
    case 'ref': return n.role === 'children' ? `each child's ${nameIn(idx, 'plain', n.code)}` : nameIn(idx, n.role, n.code);
    case 'neg': return `−${precOf(n.arg) < 3 ? `(${words(n.arg, idx)})` : words(n.arg, idx)}`;
    case 'bin': {
      const p = PREC[n.op];
      const l = precOf(n.left) < p ? `(${words(n.left, idx)})` : words(n.left, idx);
      const tight = n.op === '-' || n.op === '/' || n.op === '%' || n.op === '^';
      const r = precOf(n.right) < p || (tight && precOf(n.right) === p) ? `(${words(n.right, idx)})` : words(n.right, idx);
      return `${l} ${OP_WORD[n.op] ?? n.op} ${r}`;
    }
    case 'call': {
      const a = n.args.map((x) => words(x, idx));
      switch (n.name) {
        case 'LOOKUP': return `${a[0]} (by ${a.slice(1).join(' and ')})`;
        case 'MIN': return `the smaller of ${a.join(' and ')}`;
        case 'MAX': return `the larger of ${a.join(' and ')}`;
        case 'ROUND': return a[1] ? `${a[0]} rounded to ${a[1]} decimals` : `${a[0]} rounded`;
        case 'CEIL': return `${a[0]} rounded up`;
        case 'FLOOR': return `${a[0]} rounded down`;
        case 'ABS': return `the size of ${a[0]}`;
        case 'SQRT': return `√(${a[0]})`;
        case 'IF': return `if ${a[0]} then ${a[1]}, otherwise ${a[2]}`;
        case 'SUM': return `the sum over the children of ${a[0]}`;
        case 'COUNT': return a[0] ? `the number of children with ${a[0]}` : 'the number of child pieces';
        case 'AVG': return `the average over the children of ${a[0]}`;
        default: return `${n.name}(${a.join(', ')})`;
      }
    }
    default: return '';
  }
}

/** "Cut length ÷ cutting speed (by thickness) + piercings × pierce time", or null when it does not parse. */
export function formulaInWords(expression: string, idx: FieldIndex | null = null): string | null {
  const ast = tryParse(expression);
  if (!ast) return null;
  const s = words(ast, idx);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null;
}

/** A time as a rule hands it over: minutes, or an expression (a number typed as the formula is a fixed time). */
export type TimeLike = { minutes: number | null; expression?: string; formula: { code?: string | null; expression: string } | null };

/** The text a time dialog opens with: the time's expression, else its minutes, else nothing. */
export const timeStartText = (t: TimeLike | null | undefined) =>
  t?.expression ?? t?.formula?.expression ?? (t?.minutes != null ? String(t.minutes) : '');

/** The fixed minutes a time stands for: its minutes, or an expression that is just a number. */
export function fixedMinutes(t: TimeLike | null | undefined): number | null {
  if (!t) return null;
  if (t.minutes != null) return t.minutes;
  const e = t.formula?.expression.trim();
  return e && /^\d+(\.\d+)?$/.test(e) ? Number(e) : null;
}

/** A rule's time, plainly: "12 min per piece", "1 min per run", or the formula in words. */
export function timeInWords(t: TimeLike | null, which: 'setup' | 'work', idx: FieldIndex | null = null): string {
  if (!t) return which === 'setup' ? 'No setup' : 'No time yet';
  const per = which === 'setup' ? 'per run' : 'per piece';
  const fixed = fixedMinutes(t);
  if (fixed != null) return `${numberText(fixed)} min ${per}`;
  if (!t.formula) return '—';
  // A rate formula reads best as a rate: "1.2 min per m of SAW weld length".
  const rate = idx ? parseRateExpression(t.formula.expression, (c) => fieldFor(idx, 'item', c)) : null;
  if (rate) {
    const f = fieldFor(idx as FieldIndex, 'item', rate.field);
    const unit = rateUnitsFor(f).find((u) => u.unit === rate.rateUnit);
    const per = unit && unit.unit !== 'each' ? `${unit.label} of ${nameIn(idx, 'item', rate.field)}` : `min × ${nameIn(idx, 'item', rate.field)}`;
    return `${numberText(Number(rate.rate))} ${per}${rate.multiplier ? ` × ${nameIn(idx, 'item', rate.multiplier)}` : ''}${rate.constant ? ` + ${rate.constant} min` : ''}`;
  }
  return formulaInWords(t.formula.expression, idx) ?? t.formula.expression;
}

/* ===========================================================================
 * Rate × quantity
 * ======================================================================== */

export interface RateUnit { unit: string; label: string; /** field value × factor = quantity in this unit */ factor: number }

const LENGTH_TO_M: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, km: 1000 };
const AREA_TO_M2: Record<string, number> = { mm2: 1e-6, cm2: 1e-4, m2: 1 };
const MASS_TO_KG: Record<string, number> = { g: 0.001, kg: 1, t: 1000 };
const VOLUME_TO_M3: Record<string, number> = { mm3: 1e-9, cm3: 1e-6, m3: 1 };

function familyOf(unit: string | null | undefined): { table: Record<string, number>; units: string[] } | null {
  const u = (unit ?? '').toLowerCase();
  if (u in LENGTH_TO_M) return { table: LENGTH_TO_M, units: ['m', 'mm'] };
  if (u in AREA_TO_M2) return { table: AREA_TO_M2, units: ['m2', 'mm2'] };
  if (u in MASS_TO_KG) return { table: MASS_TO_KG, units: ['t', 'kg'] };
  if (u in VOLUME_TO_M3) return { table: VOLUME_TO_M3, units: ['m3'] };
  return null;
}

/** The rate units that make sense for a field, its own unit's family first (metres for a length in mm). */
export function rateUnitsFor(field: BuilderField | null | undefined): RateUnit[] {
  const fam = familyOf(field?.unit);
  if (!fam || !field?.unit) return [{ unit: 'each', label: field?.unit ? `min per ${unitText(field.unit)}` : 'min each', factor: 1 }];
  const own = field.unit.toLowerCase();
  const list = [...new Set([...fam.units, own])];
  return list.map((u) => ({ unit: u, label: `min per ${unitText(u)}`, factor: fam.table[own] / fam.table[u] }));
}

export interface RateModel {
  field: string;
  rate: string;
  rateUnit: string;
  /** e.g. item.COATS — "Area × rate × coats". */
  multiplier: string | null;
  /** Added once per piece (manual blasting 15 min). */
  constant: string;
}

const fmt = (n: number) => String(Number(n.toPrecision(12)));

const NUM = '(\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)';
const CODE = '([A-Z][A-Z0-9_]*)';
const RATE_RE = new RegExp(`^item\\.${CODE}(?:\\s*([/*])\\s*${NUM})?\\s*\\*\\s*${NUM}(?:\\s*\\*\\s*item\\.${CODE})?(?:\\s*\\+\\s*${NUM})?$`, 'i');

/** Reads a rate × quantity formula back into its parts, so editing reopens the simple form; null for anything else. */
export function parseRateExpression(expression: string, fieldOf: (code: string) => BuilderField | null): RateModel | null {
  const m = RATE_RE.exec(expression.trim());
  if (!m) return null;
  const [, rawField, op, by, rate, mult, constant] = m;
  const field = rawField.toUpperCase();
  const f = fieldOf(field);
  const factor = op ? (op === '/' ? 1 / Number(by) : Number(by)) : 1;
  const unit = rateUnitsFor(f).find((u) => Math.abs(u.factor - factor) < 1e-9 * Math.max(1, factor));
  if (!unit) return null;
  return { field, rate, rateUnit: unit.unit, multiplier: mult ? mult.toUpperCase() : null, constant: constant ?? '' };
}

/* ===========================================================================
 * Unit sanity
 * ======================================================================== */

/** Factors of a product chain: a × b ÷ c → [{n:a}, {n:b}, {n:c, inv}]. */
function factorsOf(n: Ast, inv = false, out: { n: Ast; inv: boolean }[] = []): { n: Ast; inv: boolean }[] {
  if (n.type === 'bin' && (n.op === '*' || n.op === '/')) {
    factorsOf(n.left, inv, out);
    factorsOf(n.right, n.op === '/' ? !inv : inv, out);
    return out;
  }
  out.push({ n, inv });
  return out;
}

const SMALL_UNIT: Record<string, { per: string; by: number }> = { mm: { per: 'metre', by: 1000 }, mm2: { per: 'm²', by: 1000000 }, kg: { per: 'tonne', by: 1000 } };

/**
 * Unit slips the builder can see from field units, in words. Two kinds:
 *  · a length in mm (area in mm², weight in kg) times a plain rate, with no
 *    ÷ 1000 anywhere in that product — the workbook rates are per metre / m² / t
 *  · a length divided by a speed chart or machine speed in another length unit
 *    (CUT_LENGTH in m over CUT_SPEED in mm/min)
 */
export function unitWarnings(expression: string, idx: FieldIndex): string[] {
  const ast = tryParse(expression);
  if (!ast) return [];
  const warnings = new Set<string>();
  const products: Ast[] = [];
  const collect = (n: Ast, inProduct: boolean) => {
    if (n.type === 'bin' && (n.op === '*' || n.op === '/')) { if (!inProduct) products.push(n); collect(n.left, true); collect(n.right, true); return; }
    if (n.type === 'bin') { collect(n.left, false); collect(n.right, false); return; }
    if (n.type === 'neg') { collect(n.arg, false); return; }
    if (n.type === 'call') n.args.forEach((a) => collect(a, false));
  };
  collect(ast, false);
  for (const p of products) {
    const fs = factorsOf(p);
    const refs = fs.filter((f) => f.n.type === 'ref' && f.n.role === 'item' && !f.inv);
    const nums = fs.filter((f) => f.n.type === 'num');
    const scaled = nums.some((f) => (f.inv && (f.n as { value: number }).value >= 100) || (!f.inv && (f.n as { value: number }).value <= 0.01));
    const dividers = fs.filter((f) => f.inv && (f.n.type === 'call' || (f.n.type === 'ref' && f.n.role === 'machine')));
    for (const r of refs) {
      const ref = r.n as Extract<Ast, { type: 'ref' }>;
      const field = fieldFor(idx, 'item', ref.code);
      const unit = (field?.unit ?? '').toLowerCase();
      // Length ÷ speed: compare the length unit with the speed's.
      for (const d of dividers) {
        const speedRef = d.n.type === 'call' && d.n.name === 'LOOKUP' && d.n.args[0]?.type === 'ref' ? d.n.args[0] : d.n.type === 'ref' ? d.n : null;
        if (!speedRef || speedRef.type !== 'ref') continue;
        const speed = fieldFor(idx, speedRef.role, speedRef.code);
        const sm = /^([a-z]+)\s*\/\s*min$/i.exec(speed?.unit ?? '');
        if (sm && unit && unit in LENGTH_TO_M && sm[1].toLowerCase() in LENGTH_TO_M && sm[1].toLowerCase() !== unit) {
          warnings.add(`${field?.name ?? ref.code} is in ${unit} but ${speed?.name ?? speedRef.code} is in ${speed?.unit} — the minutes will be off by ${fmt(Math.max(LENGTH_TO_M[unit] / LENGTH_TO_M[sm[1].toLowerCase()], LENGTH_TO_M[sm[1].toLowerCase()] / LENGTH_TO_M[unit]))}×.`);
        }
      }
      const small = SMALL_UNIT[unit];
      if (small && nums.length && !scaled && !dividers.length) {
        warnings.add(`${field?.name ?? ref.code} is in ${unitText(unit)}. If the rate is minutes per ${small.per}, divide by ${small.by.toLocaleString('en-IN')}: item.${ref.code} / ${small.by} × rate.`);
      }
    }
  }
  return [...warnings];
}

/** Sanity of a result: a minute per piece is normal, a month per piece is a unit slip. */
export function resultWarning(minutes: number | null | undefined): string | null {
  if (minutes == null) return null;
  if (minutes > 30 * 1440) return `${numberText(minutes)} min is more than a month for one piece — check the units.`;
  if (minutes > 0 && minutes < 0.01) return `${numberText(minutes)} min is under a second — check the units.`;
  if (minutes < 0) return 'A negative time — check the signs.';
  return null;
}

/** Insert text at a caret, padding with spaces so tokens never run together. */
export function insertAt(value: string, start: number, end: number, text: string): { value: string; caret: number } {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const padL = before && !/[\s(]$/.test(before) && !/^[),\s]/.test(text) ? ' ' : '';
  const padR = after && !/^[\s),]/.test(after) && !/[(\s]$/.test(text) ? ' ' : '';
  const ins = `${padL}${text}${padR}`;
  return { value: before + ins + after, caret: (before + ins).length - padR.length };
}

/* ===========================================================================
 * LOOKUP helper
 * ======================================================================== */

/** The best piece field for a chart axis: same name ("Thickness" → THICKNESS), else same unit. */
export function guessAxisField(axis: { label?: string; unit?: string | null }, itemFields: BuilderField[]): BuilderField | null {
  const nums = itemFields.filter((f) => f.dataType === 'number');
  const label = (axis.label ?? '').toLowerCase();
  return nums.find((f) => f.name.toLowerCase() === label || f.code.toLowerCase() === label.replace(/\s+/g, '_'))
    ?? nums.find((f) => label && (f.name.toLowerCase().includes(label) || label.includes(f.name.toLowerCase())))
    ?? nums.find((f) => axis.unit && f.unit === axis.unit && (f.count ?? 0) > 0)
    ?? null;
}

/**
 * A time as one short phrase for a list cell: "12 min", "2.8 min per m of weld length",
 * "Cut length ÷ speed + pierces × 0.2". Null when nothing is set (the cell then asks for it).
 * Setup and work read the same here — the column says which it is.
 */
export function timeShort(t: TimeLike | null | undefined, idx: FieldIndex | null = null): string | null {
  if (!t || (t.minutes == null && !t.formula)) return null;
  const fixed = fixedMinutes(t);
  if (fixed != null) return `${numberText(fixed)} min`;
  return timeInWords(t, 'work', idx);
}
