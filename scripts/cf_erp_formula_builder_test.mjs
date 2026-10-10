// Run from multi_app_fe: node scripts/cf_erp_formula_builder_test.mjs
// The operation-time dialog (2026-10-08): ONE formula editor — no tabs, no templates, no rate form, no formula code/name — with
// the operator and function buttons, the field picker and the type-ahead kept; LOOKUP guides the user with a hint bar under the
// editor (what it does, the machine's charts as chips, the piece field guessed for the key) instead of a popover; the same dialog
// serves setup ("Setup, per run") and work ("Work, per piece"); saving hands the TEXT to the caller (the rule keeps it: PUT
// /operation-rules/:id { workExpression | setupExpression }) and never creates a shared formula. The API is mocked; no network.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/operations/1', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  try { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true }); } catch { /* skip */ }
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = (q) => ({ matches: /min-width/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
globalThis.matchMedia = dom.window.matchMedia;
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
globalThis.ResizeObserver = dom.window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

// Every request lands here: { method, path, body } → response.
const calls = [];
globalThis.__api = async (url, opts = {}) => {
  const path = url.replace(/^\/api\/[^/]+\/cf_erp/, '');
  const call = { method: opts.method ?? 'GET', path, body: opts.body };
  calls.push(call);
  const handler = globalThis.__routes.find(([m, re]) => m === call.method && re.test(path));
  if (!handler) throw new Error(`API request failed: 404 Not Found - {"message":"no mock for ${call.method} ${path}"}`);
  return handler[2](call);
};
const stubs = {
  '@core/api/client': 'export async function apiFetch(url, opts) { return globalThis.__api(url, opts); }',
  '@core/contexts/AuthContext': 'export const useAuth = () => ({ user: null });',
};
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom';
      export { React, createRoot, MemoryRouter };
      export * from './src/apps/cf_erp/lib/formulaBuilder';
      export { suggestAt } from './src/apps/cf_erp/lib/formulaSuggest';
      export { lookupAt, chartCodeOf } from './src/apps/cf_erp/lib/lookupHint';
      export { TimingRuleDialog } from './src/apps/cf_erp/components/TimingRuleDialog';
      export { FormulaEditor } from './src/apps/cf_erp/components/FormulaBuilder/FormulaEditor';
      export { TimeBuilder } from './src/apps/cf_erp/components/FormulaBuilder/TimeBuilder';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/(api\/client|contexts\/AuthContext)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
  } }],
  alias: { '@shared/ui': resolve('src/shared/ui/storage.ts') },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `formula-builder-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const app = document.getElementById('app');
let root = null;
const render = async (el) => {
  if (root) await React.act(async () => { root.unmount(); });
  document.body.querySelectorAll('.MuiPopover-root, .MuiDrawer-root, .MuiModal-root').forEach((n) => n.remove());
  app.replaceChildren(); const host = document.createElement('div'); app.appendChild(host); root = createRoot(host);
  await React.act(async () => { root.render(React.createElement(MemoryRouter, null, el)); await sleep(0); });
  await React.act(async () => { await sleep(30); });
};
const settle = async (ms = 30) => React.act(async () => { await sleep(ms); });
const click = async (el) => { assert.ok(el, 'nothing to click'); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); };
const q = (id) => document.querySelector(`[data-testid="${id}"]`);
const setValue = async (el, value) => {
  assert.ok(el, 'no input');
  const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await sleep(0);
  });
};

// ── fixture ────────────────────────────────────────────────────────────────
const F = (code, name, unit, measurementType, extra = {}) => ({ code, name, dataType: 'number', measurementType, unit, example: null, count: 0, ...extra });
const itemFields = [
  F('SAW_WELD_LENGTH', 'SAW weld length', 'mm', 'LENGTH', { example: 24000, count: 3 }),
  F('THICKNESS', 'Thickness', 'mm', 'LENGTH', { example: 12, count: 3 }),
  F('CUT_LENGTH', 'Cut length', 'mm', 'LENGTH', { example: 2400, count: 3 }),
  F('PIERCINGS', 'Piercings', null, 'COUNT', { example: 4, count: 3 }),
  F('HOLES', 'Holes', null, 'COUNT'),
  F('SURFACE_AREA', 'Surface area', 'm2', 'AREA'),
  F('PAINT_COATS', 'Paint coats', null, 'COUNT'),
  F('WEIGHT', 'Weight', 'kg', 'MASS', { example: 1300, count: 3 }),
  F('HBFIT_JOINTS', 'H-beam fit joints', null, 'COUNT'),
];
const machineFields = [
  { code: 'CUT_SPEED', name: 'Cutting speed', dataType: 'table', measurementType: null, unit: 'mm/min', tableConfig: { mode: 'step_up', axes: [{ label: 'Thickness', unit: 'mm' }] }, count: 1 },
  F('PIERCE_TIME', 'Pierce time', 'min', null, { example: 0.2, count: 1 }),
];
const ctx = {
  operation: { id: 1, code: 'CG-SAWWELD', name: 'SAW welding' },
  machines: [{ id: 7, code: 'SAW-01', name: 'SAW Machine #1', typeName: 'SAW', values: {} }],
  machineFields, itemFields,
  samplePieces: [{ id: 501, code: 'SPAN1-G1-1', name: 'Girder segment', kind: 'temporary', orderCode: 'SO-1', lineNo: 1, fromOperation: true, values: { SAW_WELD_LENGTH: 24000 } }],
};
const idx = m.fieldIndex(itemFields, machineFields);
const formula = (id, code, expression, extra = {}) => ({ id, code, name: code, expression, version: 1, description: null, status: 'active', kind: 'timing', ruleCount: 0, timingRuleCount: 0, ...extra });
let checkValue = 24;
let checkProblems = [];
const baseRoutes = () => [
  ['GET', /^\/operations\/1\/formula-builder/, () => ctx],
  ['POST', /^\/formulas\/check$/, (c) => ({ ok: !checkProblems.length, problems: checkProblems, references: [], itemRefs: [], machineRefs: [], kind: 'timing', result: checkProblems.length ? null : { value: checkValue }, inputs: [{ ref: 'item.SAW_WELD_LENGTH', value: 24000, from: 'piece' }], _expr: c.body.expression })],
  ['GET', /^\/machines/, () => []],
];
globalThis.__routes = baseRoutes();
const builder = (props) => React.createElement(m.TimeBuilder, {
  open: true, onClose() {}, operation: ctx.operation, subject: { type: 'classification', id: 3315, label: 'variant SAW' }, which: 'work',
  current: null, onSave: () => {}, ...props,
});
const noChartFields = machineFields.filter((f) => f.dataType !== 'table');
const caretTo = async (ta, pos) => { ta.setSelectionRange(pos, pos); await React.act(async () => { ta.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await settle(); };
/** A controlled editor whose text the test can read back. */
const mountEditor = async (start, fields = machineFields) => {
  const box = { value: start };
  const Host = () => { const [v, setV] = React.useState(start); box.value = v; return React.createElement(m.FormulaEditor, { value: v, onChange: setV, idx, itemFields, machineFields: fields }); };
  await render(React.createElement(Host));
  return box;
};

// ── pure logic ─────────────────────────────────────────────────────────────
await check('a rate-shaped formula still reads back into its parts (for "min per m of weld length" in words)', async () => {
  const of = (c) => m.fieldFor(idx, 'item', c);
  assert.deepEqual(m.parseRateExpression('item.SAW_WELD_LENGTH / 1000 * 1', of), { field: 'SAW_WELD_LENGTH', rate: '1', rateUnit: 'm', multiplier: null, constant: '' });
  assert.deepEqual(m.parseRateExpression('item.SURFACE_AREA * 2.5 * item.PAINT_COATS + 15', of), { field: 'SURFACE_AREA', rate: '2.5', rateUnit: 'm2', multiplier: 'PAINT_COATS', constant: '15' });
  assert.equal(m.parseRateExpression('item.CUT_LENGTH / LOOKUP(machine.CUT_SPEED, item.THICKNESS)', of), null);
});
await check('in words: the workbook cutting formula', async () => {
  const words = m.formulaInWords('item.CUT_LENGTH / LOOKUP(machine.CUT_SPEED, item.THICKNESS) + item.PIERCINGS * machine.PIERCE_TIME', idx);
  assert.equal(words, 'Cut length ÷ cutting speed (by thickness) + piercings × pierce time');
  assert.equal(m.timeInWords({ minutes: 12, formula: null }, 'work'), '12 min per piece');
  assert.equal(m.timeInWords({ minutes: null, formula: { code: 'X', expression: 'item.SAW_WELD_LENGTH / 1000 * 1.2' } }, 'work', idx), '1.2 min per m of SAW weld length');
  assert.equal(m.timeInWords({ minutes: null, formula: { code: 'X', expression: 'item.HOLES * 0.35' } }, 'work', idx), '0.35 min × holes');
  assert.equal(m.formulaInWords('MAX(item.HOLES * 0.35, 5)', idx), 'The larger of holes × 0.35 and 5');
});
await check('unit sanity: mm × a plain rate warns; ÷ 1000 or a speed chart does not', async () => {
  assert.equal(m.unitWarnings('item.SAW_WELD_LENGTH * 1.0', idx).length, 1);
  assert.match(m.unitWarnings('item.SAW_WELD_LENGTH * 1.0', idx)[0], /in mm.*divide by 1,000/);
  assert.equal(m.unitWarnings('item.SAW_WELD_LENGTH / 1000 * 1.0', idx).length, 0);
  assert.equal(m.unitWarnings('item.CUT_LENGTH / LOOKUP(machine.CUT_SPEED, item.THICKNESS)', idx).length, 0);
  const metres = m.fieldIndex([F('CUT_LENGTH', 'Cut length', 'm', 'LENGTH'), F('THICKNESS', 'Thickness', 'mm', 'LENGTH')], machineFields);
  assert.match(m.unitWarnings('item.CUT_LENGTH / LOOKUP(machine.CUT_SPEED, item.THICKNESS)', metres)[0], /in m but Cutting speed is in mm\/min/);
  assert.equal(m.unitWarnings('item.WEIGHT / 334644.13 * 6.5 * 1440', idx).length, 0);
});
// ── buttons and type-ahead ─────────────────────────────────────────────────
await check('operator and function buttons insert at the caret; text stays editable with colouring', async () => {
  let value = 'item.HOLES';
  const Host = () => { const [v, setV] = React.useState(value); value = v; return React.createElement(m.FormulaEditor, { value: v, onChange: setV, idx, itemFields, machineFields }); };
  await render(React.createElement(Host));
  const ta = q('formula-text');
  ta.setSelectionRange(10, 10);
  await click([...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Times'));
  await settle();
  assert.equal(value, 'item.HOLES *');
  await setValue(q('formula-text'), 'item.HOLES * 0.35');
  assert.equal(value, 'item.HOLES * 0.35');
  const kinds = [...document.querySelectorAll('[data-tok]')].map((s) => s.dataset.tok).filter((k) => k !== 'space');
  assert.deepEqual(kinds, ['item', 'op', 'num']);
  q('formula-text').setSelectionRange(0, 17);
  await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'MAX'));
  await settle();
  assert.equal(value, 'MAX(item.HOLES * 0.35, )', 'MAX wraps the selection');
});

// ── type-ahead ─────────────────────────────────────────────────────────────
await check('suggestAt: narrows with each character, by code or name, per namespace', () => {
  const ctx = { fields: { item: itemFields, machine: machineFields }, functions: [{ name: 'MIN', args: 2, hint: '' }, { name: 'MAX', args: 2, hint: '' }] };
  const at = (t) => m.suggestAt(t, t.length, ctx);
  assert.deepEqual(at('item.th').items.map((x) => x.insert), ['item.THICKNESS'], 'two letters match starts only, not the middle of LENGTH');
  assert.deepEqual(at('item.ngt').items.map((x) => x.insert), ['item.SAW_WELD_LENGTH', 'item.CUT_LENGTH'], 'three letters match inside too');
  assert.equal(at('item.').items.length, 8, 'item. alone lists the piece fields (8 at most)');
  assert.ok(at('item.').items.every((x) => x.insert.startsWith('item.')));
  assert.deepEqual(at('item.skew'), null, 'nothing matches → no list');
  assert.deepEqual(at('item.cut').items.map((x) => x.insert)[0], 'item.CUT_LENGTH');
  assert.deepEqual(at('2 * leng').items.map((x) => x.insert).slice(0, 2), ['item.SAW_WELD_LENGTH', 'item.CUT_LENGTH'], 'a word of the name matches');
  const m1 = at('m');
  assert.deepEqual(m1.items.slice(0, 3).map((x) => x.insert), ['MIN(, )', 'MAX(, )', 'machine.'], 'functions and namespaces first');
  assert.equal(m1.items[0].caretBack, 3, 'the caret lands inside MIN(');
  assert.equal(at('2.5'), null, 'a number is not a name');
  assert.equal(at('item.THICKNESS'), null, 'exactly what is typed → nothing to offer');
  const mid = m.suggestAt('item.thx + 1', 7, ctx);
  assert.deepEqual([mid.from, mid.to], [0, 8], 'the whole word is replaced, not just up to the caret');
});
await check('typing in the editor shows the list under the caret; Enter inserts the exact code', async () => {
  let value = '';
  const Host = () => { const [v, setV] = React.useState(value); value = v; return React.createElement(m.FormulaEditor, { value: v, onChange: setV, idx, itemFields, machineFields }); };
  await render(React.createElement(Host));
  const ta = q('formula-text');
  await React.act(async () => { ta.focus(); await sleep(0); });
  await setValue(ta, 'item.thi');
  await settle();
  assert.ok(q('formula-suggest'), 'the list opens');
  assert.match(q('formula-suggest').textContent, /Thickness/);
  await setValue(ta, 'item.thic');
  await settle();
  assert.equal(q('formula-suggest').querySelectorAll('[role=option]').length, 1, 'it narrows');
  await React.act(async () => { ta.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(0); });
  await settle();
  assert.equal(value, 'item.THICKNESS');
  assert.equal(q('formula-suggest'), null, 'the list closes once the word is complete');
  await setValue(ta, 'item.THICKNESS * ma');
  await settle();
  await React.act(async () => { ta.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(0); });
  await settle();
  assert.equal(q('formula-suggest'), null, 'Esc closes it');
});

// ── where the caret is in a LOOKUP call (pure) ─────────────────────────────
await check('lookupAt: finds the LOOKUP call the caret is in, the argument, and the range to replace', () => {
  const L = (t, c = t.length) => m.lookupAt(t, c);
  assert.equal(L('item.CUT_LENGTH / '), null, 'no LOOKUP anywhere');
  assert.equal(L('MAX(item.A, '), null, 'a comma in another function is not a LOOKUP argument');
  const typed = L('item.CUT_LENGTH / LOOKUP');
  assert.deepEqual([typed.start, typed.end, typed.open, typed.arg], [18, 24, null, 0], 'just the word typed');
  assert.equal(L('item.CUT_LENGTH / LOOKUPS'), null, 'a longer word is not LOOKUP');
  assert.equal(L('item.LOOKUP'), null, 'nor is a field called that');
  const first = L('item.CUT_LENGTH / LOOKUP(');
  assert.deepEqual([first.start, first.open, first.arg, first.close, first.end], [18, 24, 0, null, 25], 'open, not closed: ends where the text ends');
  const second = L('LOOKUP(machine.CUT_SPEED, ');
  assert.equal(second.arg, 1);
  assert.deepEqual(second.args.map((a) => a.text), ['machine.CUT_SPEED', '']);
  const done = 'item.CUT_LENGTH / LOOKUP(machine.CUT_SPEED, item.THICKNESS)';
  const inside = L(done, done.length - 1);
  assert.deepEqual([inside.start, inside.close, inside.end, inside.arg], [18, done.length - 1, done.length, 1]);
  assert.deepEqual(inside.args.map((a) => a.text), ['machine.CUT_SPEED', 'item.THICKNESS']);
  assert.equal(L(done, done.length), null, 'after the closing bracket the caret is outside');
  assert.equal(L(done, 10), null, 'before the call too');
  assert.equal(L(done, 25).arg, 0, 'in the chart argument');
  const nested = L('LOOKUP(machine.T, MAX(item.A, ');
  assert.deepEqual([nested.arg, nested.direct], [1, false], 'inside a nested bracket: still the second argument, but not directly');
  assert.equal(L('lookup(machine.T, item.A, ').arg, 2, 'any case; a second key');
  assert.equal(m.chartCodeOf('machine.CUT_SPEED'), 'CUT_SPEED');
  assert.equal(m.chartCodeOf(' item.THICKNESS '), null);
});
await check('suggestAt inside LOOKUP: the first argument offers the charts only, the second the piece fields with the guessed key first', () => {
  const nums = (fs) => fs.filter((f) => f.dataType === 'number');
  const chart = machineFields.find((f) => f.dataType === 'table');
  const base = { fields: { item: nums(itemFields), machine: nums(machineFields) }, functions: [{ name: 'MIN', args: 2, hint: '' }] };
  const arg0 = { ...base, lookup: { arg: 0, charts: [chart], keyFirst: null } };
  assert.deepEqual(m.suggestAt('LOOKUP(cu', 9, arg0).items.map((x) => x.insert), ['machine.CUT_SPEED'], 'by name, and not CUT_LENGTH or MIN');
  assert.deepEqual(m.suggestAt('LOOKUP(machine.', 15, arg0).items.map((x) => x.insert), ['machine.CUT_SPEED'], 'machine. lists the charts, not PIERCE_TIME');
  assert.equal(m.suggestAt('LOOKUP(item.', 12, arg0), null, 'a piece field is not a chart');
  const arg1 = { ...base, lookup: { arg: 1, charts: [chart], keyFirst: 'THICKNESS' } };
  const keys = m.suggestAt('LOOKUP(machine.CUT_SPEED, item.', 31, arg1).items;
  assert.equal(keys[0].insert, 'item.THICKNESS', 'the guessed key leads');
  assert.ok(keys.every((x) => x.insert.startsWith('item.')), 'piece fields only');
  assert.equal(m.suggestAt('LOOKUP(machine.CUT_SPEED, mach', 29, arg1), null, 'no machine fields in the key');
  assert.deepEqual(m.suggestAt('LOOKUP(machine.CUT_SPEED, thic', 30, arg1).items.map((x) => x.insert), ['item.THICKNESS']);
});

// ── LOOKUP guides the user ─────────────────────────────────────────────────
const EXPLAIN = "LOOKUP(chart, value) — reads a rate from a machine's chart. chart: one of the machine's charts below; value: the piece's value to look it up by.";
await check('the LOOKUP button just inserts LOOKUP() at the caret — no popover — and the hint bar appears with the charts as chips', async () => {
  const box = await mountEditor('item.CUT_LENGTH / ');
  const ta = q('formula-text');
  ta.setSelectionRange(ta.value.length, ta.value.length);
  assert.equal(q('lookup-hint'), null, 'no hint away from LOOKUP');
  await click(q('lookup-button'));
  await settle();
  assert.equal(box.value, 'item.CUT_LENGTH / LOOKUP()');
  assert.ok(!document.querySelector('[data-testid="lookup-helper"], .MuiPopover-root'), 'no popover');
  assert.ok(q('lookup-hint'), 'the hint is shown');
  assert.equal(q('lookup-explain').textContent.replace(/\s+/g, ' ').trim(), EXPLAIN);
  const chip = q('chart-CUT_SPEED');
  assert.ok(chip, 'the machine chart is a chip');
  const t = chip.textContent;
  assert.ok(/Cutting speed/.test(t) && /mm\/min/.test(t) && /machine\.CUT_SPEED/.test(t) && /by Thickness \(mm\)/.test(t), t);
  assert.equal(q('chart-PIERCE_TIME'), null, 'a plain number is not a chart');
  assert.equal(q('lookup-guess'), null, 'nothing guessed until a chart is chosen');
});
await check('clicking a chart writes LOOKUP(machine.CHART, item.KEY) - the key guessed from the key column - and leaves the key selected', async () => {
  const box = await mountEditor('item.CUT_LENGTH / ');
  const ta = q('formula-text');
  ta.setSelectionRange(ta.value.length, ta.value.length);
  await click(q('lookup-button'));
  await settle();
  await click(q('chart-CUT_SPEED'));
  await settle(60);
  assert.equal(box.value, 'item.CUT_LENGTH / LOOKUP(machine.CUT_SPEED, item.THICKNESS)');
  assert.equal(ta.value.slice(ta.selectionStart, ta.selectionEnd), 'item.THICKNESS', 'the key is selected, so typing replaces it');
  const guess = q('lookup-guess').textContent.replace(/\s+/g, ' ');
  assert.match(guess, /Cutting speed is read by Thickness \(mm\): guessed the piece's Thickness \(item\.THICKNESS\)/);
  assert.equal(q('chart-CUT_SPEED').getAttribute('aria-selected'), 'true', 'the chosen chart is marked');
  // Changing the key shows which field is used now, and what would have been guessed.
  const at = box.value.indexOf('item.THICKNESS');
  await setValue(ta, box.value.replace('item.THICKNESS', 'item.CUT_LENGTH'));
  await caretTo(ta, at + 3);
  assert.match(q('lookup-guess').textContent, /item\.CUT_LENGTH.*we would have guessed.*item\.THICKNESS/);
});
await check('typing LOOKUP (no bracket yet) shows the hint too, and a chart completes it', async () => {
  const box = await mountEditor('');
  await setValue(q('formula-text'), 'LOOKUP');
  await settle();
  assert.ok(q('lookup-hint'), 'the hint shows after the word');
  await click(q('chart-CUT_SPEED'));
  await settle(60);
  assert.equal(box.value, 'LOOKUP(machine.CUT_SPEED, item.THICKNESS)');
});
await check('picking another chart inside an existing call rewrites that call only', async () => {
  const two = [...machineFields, { code: 'WELD_SPEED', name: 'Welding speed', dataType: 'table', measurementType: null, unit: 'mm/min', tableConfig: { mode: 'step_up', axes: [{ label: 'Thickness', unit: 'mm' }] }, count: 1 }];
  const box = await mountEditor('1 + LOOKUP(machine.CUT_SPEED, item.HOLES) * 2', two);
  const ta = q('formula-text');
  await caretTo(ta, box.value.indexOf('HOLES'));
  assert.ok(q('chart-WELD_SPEED'), 'both charts are listed');
  await click(q('chart-WELD_SPEED'));
  await settle(60);
  assert.equal(box.value, '1 + LOOKUP(machine.WELD_SPEED, item.THICKNESS) * 2', 'the text around the call is kept');
});
await check('the hint goes away when the caret leaves the call', async () => {
  const box = await mountEditor('item.CUT_LENGTH / LOOKUP(machine.CUT_SPEED, item.THICKNESS)');
  const ta = q('formula-text');
  await caretTo(ta, box.value.length);
  assert.equal(q('lookup-hint'), null, 'caret after the closing bracket');
  await caretTo(ta, 5);
  assert.equal(q('lookup-hint'), null, 'caret before the call');
  await caretTo(ta, box.value.length - 3);
  assert.ok(q('lookup-hint'), 'caret inside the call');
});
await check('a machine with no charts: the hint says so in one line', async () => {
  await mountEditor('LOOKUP(', noChartFields);
  const ta = q('formula-text');
  await caretTo(ta, 7);
  assert.equal(q('lookup-nocharts').textContent, 'This machine type has no charts yet — add a table specification such as CUT_SPEED by thickness to it.');
  assert.equal(document.querySelectorAll('[data-testid^="chart-"]').length, 0, 'no chips');
});
await check('type-ahead inside LOOKUP: first argument offers the charts, second the piece fields with the guessed one first', async () => {
  const box = await mountEditor('');
  const ta = q('formula-text');
  await React.act(async () => { ta.focus(); await sleep(0); });
  await setValue(ta, 'LOOKUP(cu');
  await settle();
  const opts = [...q('formula-suggest').querySelectorAll('[role=option]')].map((o) => o.textContent);
  assert.equal(opts.length, 1, opts.join(' | '));
  assert.match(opts[0], /Cutting speed.*machine\.CUT_SPEED/);
  await React.act(async () => { ta.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(0); });
  await settle();
  assert.equal(box.value, 'LOOKUP(machine.CUT_SPEED');
  await setValue(ta, 'LOOKUP(machine.CUT_SPEED, item.');
  await settle();
  const keys = [...q('formula-suggest').querySelectorAll('[role=option]')];
  assert.ok(keys.length > 1 && keys.every((o) => /item\./.test(o.textContent) && !/machine\./.test(o.textContent)), 'piece fields only');
  assert.match(keys[0].textContent, /Thickness/, 'the guessed key is first');
});

// ── the dialog: one editor ─────────────────────────────────────────────────
await check('Work, per piece: one formula editor - no tabs, no templates, no rate form, no existing-formula picker, no formula code or name', async () => {
  globalThis.__routes = baseRoutes();
  await render(builder({}));
  await settle(50);
  assert.ok(q('time-builder'), 'the dialog is open');
  assert.equal(q('time-builder-title').textContent, 'Work, per piece');
  assert.equal(document.querySelectorAll('[role=tab], [role=tablist]').length, 0, 'no tabs');
  for (const gone of ['tab-fixed', 'tab-rate', 'tab-advanced', 'template-length', 'template-cut', 'rate-expression', 'fixed-minutes', 'existing-formula', 'formula-code', 'formula-name', 'shared-warning']) assert.equal(q(gone), null, `${gone} is gone`);
  const body = q('time-builder').textContent;
  for (const gone of ['Start from a shape', 'Start from an existing formula', 'Rate × quantity', 'Fixed minutes', 'Create formula and assign', 'Formula code', 'Formula name']) assert.ok(!body.includes(gone), `"${gone}" is gone`);
  assert.ok(q('formula-text'), 'the formula editor');
  assert.ok(q('field-picker'), '"Insert a field" is kept');
  const labels = [...q('time-builder').querySelectorAll('button')].flatMap((b) => [b.getAttribute('aria-label'), b.textContent.trim()]);
  for (const kept of ['Plus', 'Minus', 'Times', 'Divided by', 'Open bracket', 'Close bracket', 'MIN', 'MAX', 'ROUND', 'IF', 'LOOKUP', 'Save']) assert.ok(labels.includes(kept), `${kept} is there`);
  assert.equal(q('builder-save').textContent, 'Save');
});
await check('Setup, per run: the same dialog under the other title', async () => {
  globalThis.__routes = baseRoutes();
  await render(builder({ which: 'setup' }));
  await settle(50);
  assert.equal(q('time-builder-title').textContent, 'Setup, per run');
  assert.ok(q('formula-text') && q('field-picker') && q('lookup-button'), 'the same editor');
  assert.equal(document.querySelectorAll('[role=tab]').length, 0);
});
await check('the dialog opens with what the rule holds: its expression, or its minutes', async () => {
  globalThis.__routes = baseRoutes();
  const expr = 'item.SAW_WELD_LENGTH / 1000 * 1';
  await render(builder({ current: { minutes: null, expression: expr, formula: { id: null, code: null, expression: expr } } }));
  await settle(50);
  assert.equal(q('formula-text').value, expr);
  await render(builder({ current: { minutes: 12, expression: '12', formula: null } }));
  await settle(50);
  assert.equal(q('formula-text').value, '12');
  await render(builder({ current: { minutes: 7.5, formula: null } }));
  await settle(50);
  assert.equal(q('formula-text').value, '7.5', 'minutes from an older reply still show');
  await render(builder({ current: null }));
  await settle(50);
  assert.equal(q('formula-text').value, '');
});
await check('LOOKUP inside the dialog: button, chart chip, key guessed - the whole path', async () => {
  globalThis.__routes = baseRoutes();
  await render(builder({}));
  await settle(50);
  await click(q('lookup-button'));
  await settle();
  assert.ok(q('lookup-hint'));
  await click(q('chart-CUT_SPEED'));
  await settle(60);
  assert.equal(q('formula-text').value, 'LOOKUP(machine.CUT_SPEED, item.THICKNESS)');
});
await check('live preview shows the minutes and the formula in words from the check, on the typed text', async () => {
  globalThis.__routes = baseRoutes();
  checkValue = 24;
  calls.length = 0;
  await render(builder({}));
  await settle(50);
  await setValue(q('formula-text'), 'item.SAW_WELD_LENGTH / 1000 * 1');
  await settle(400);
  const sent = calls.filter((c) => c.path === '/formulas/check').at(-1);
  assert.ok(sent, 'the check was called');
  assert.equal(sent.body.expression, 'item.SAW_WELD_LENGTH / 1000 * 1');
  assert.equal(sent.body.itemId, 501, 'on the first real piece');
  assert.equal(sent.body.machineId, 7, "on a machine of the rule's type");
  assert.equal(q('preview-minutes').textContent, '24 min');
  assert.equal(q('preview-words').textContent, '1 min per m of SAW weld length');
  assert.match(q('preview-panel').textContent, /24,000 from the piece/);
});
await check('a plain number is a fixed time: checked like any formula, read as minutes', async () => {
  globalThis.__routes = baseRoutes();
  checkValue = 12;
  calls.length = 0;
  await render(builder({}));
  await settle(50);
  await setValue(q('formula-text'), '12');
  await settle(400);
  assert.equal(calls.filter((c) => c.path === '/formulas/check').at(-1).body.expression, '12');
  assert.equal(q('preview-minutes').textContent, '12 min');
  assert.equal(q('preview-words').textContent, '12 min per piece');
});
await check('unit warning: SAW weld length in mm x a rate, without / 1000', async () => {
  globalThis.__routes = baseRoutes();
  await render(builder({}));
  await settle(50);
  await setValue(q('formula-text'), 'item.SAW_WELD_LENGTH * 1.0');
  await settle(400);
  assert.match(q('unit-warnings').textContent, /SAW weld length is in mm\. If the rate is minutes per metre, divide by 1,000/);
});
await check('Save hands the typed text to the caller and closes - it never creates or changes a shared formula', async () => {
  globalThis.__routes = baseRoutes();
  calls.length = 0;
  const saved = [];
  let closed = false;
  await render(builder({ onSave: (t) => { saved.push(t); }, onClose: () => { closed = true; } }));
  await settle(50);
  await setValue(q('formula-text'), '  item.SAW_WELD_LENGTH / 1000 * 1.2  ');
  await settle(400);
  await click(q('builder-save'));
  await settle(50);
  assert.deepEqual(saved, ['item.SAW_WELD_LENGTH / 1000 * 1.2'], 'trimmed text');
  assert.ok(closed);
  assert.ok(!calls.some((c) => c.path.startsWith('/formulas') && c.path !== '/formulas/check'), `no formula written: ${JSON.stringify(calls.map((c) => `${c.method} ${c.path}`))}`);
});
await check('a number saves as a number; empty text saves as empty (the rule clears the time)', async () => {
  globalThis.__routes = baseRoutes();
  const saved = [];
  await render(builder({ onSave: (t) => { saved.push(t); } }));
  await settle(50);
  await setValue(q('formula-text'), '12');
  await settle(400);
  await click(q('builder-save'));
  await settle(50);
  await render(builder({ current: { minutes: 12, expression: '12', formula: null }, onSave: (t) => { saved.push(t); } }));
  await settle(50);
  await setValue(q('formula-text'), '');
  await settle(50);
  assert.equal(q('builder-save').disabled, false, 'clearing is allowed');
  await click(q('builder-save'));
  await settle(50);
  assert.deepEqual(saved, ['12', '']);
});
await check('a save that fails shows why and keeps the dialog open', async () => {
  globalThis.__routes = baseRoutes();
  let closed = false;
  await render(builder({ onSave: () => { throw new Error('boom'); }, onClose: () => { closed = true; } }));
  await settle(50);
  await setValue(q('formula-text'), '12');
  await settle(400);
  await click(q('builder-save'));
  await settle(50);
  assert.ok(!closed, 'still open');
  assert.ok(document.querySelector('[role=alert]'), 'an error is shown');
});
await check('problems from the check block saving', async () => {
  globalThis.__routes = baseRoutes();
  checkProblems = ['Unknown specification NOPE.'];
  await render(builder({}));
  await settle(50);
  await setValue(q('formula-text'), 'item.NOPE * 2');
  await settle(400);
  assert.match(q('preview-problems').textContent, /Unknown specification NOPE/);
  assert.equal(q('builder-save').disabled, true);
  checkProblems = [];
});

// ── the rule dialog: setup opens the same dialog ───────────────────────────
await check('Edit rule: Setup and Work each open the same time dialog; the rule is saved with setupExpression / workExpression, no formula ids', async () => {
  globalThis.__routes = [...baseRoutes(), ['PUT', /^\/operation-rules\/31$/, () => ({ id: 31 })]];
  calls.length = 0;
  const own = 'item.SAW_WELD_LENGTH / 1000 * 0.5';
  const rule = { id: 31, operationId: 1, subject: { type: 'classification', id: 3315, code: 'SAW', name: 'SAW', level: 'Subfamily' }, eligible: true,
    setup: { minutes: 5, expression: '5', formula: null }, work: { minutes: null, expression: own, formula: { id: null, code: null, expression: own } },
    effectiveFrom: null, effectiveTo: null, notes: null };
  let saved = 0;
  await render(React.createElement(m.TimingRuleDialog, { open: true, operationId: 1, operation: ctx.operation, existing: rule, tree: null, onClose() {}, onSaved: () => { saved++; } }));
  await settle(60);
  assert.match(q('time-Setup, per run').textContent, /5 min/, "the rule's setup shows");
  assert.match(q('time-Work, per piece').textContent, /item\.SAW_WELD_LENGTH \/ 1000 \* 0\.5/);
  assert.equal(document.querySelectorAll('.MuiToggleButton-root[value=formula], .MuiToggleButton-root[value=minutes]').length, 0, 'no Minutes / Formula toggle any more');
  // Setup -> the same dialog, titled Setup, per run, opened with 5
  await click(q('build-Setup, per run'));
  await settle(60);
  assert.equal(q('time-builder-title').textContent, 'Setup, per run');
  assert.equal(q('formula-text').value, '5');
  await setValue(q('formula-text'), '6');
  await settle(400);
  await click(q('builder-save'));
  await settle(60);
  assert.match(q('time-Setup, per run').textContent, /6 min/, 'the rule form shows the new setup');
  // Work -> Work, per piece
  await click(q('build-Work, per piece'));
  await settle(60);
  assert.equal(q('time-builder-title').textContent, 'Work, per piece');
  assert.equal(q('formula-text').value, own);
  await click([...q('time-builder').querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel'));
  await settle(60);
  // Save the rule
  calls.length = 0;
  await click([...document.querySelectorAll('button')].find((b) => /Save rule/.test(b.textContent)));
  await settle(60);
  const put = calls.find((c) => c.method === 'PUT');
  assert.ok(put && put.path === '/operation-rules/31', JSON.stringify(calls));
  assert.equal(put.body.setupExpression, '6');
  assert.equal(put.body.workExpression, own);
  for (const k of Object.keys(put.body)) assert.ok(!/Minutes|FormulaId/.test(k), `old field ${k} is not sent`);
  assert.equal(saved, 2, 'once when the setup time was saved (it is saved at once), once on Save rule');
});
await check('Add rule (new): the time dialog fills the rule form (the rule is created on Add rule with the same expression fields)', async () => {
  globalThis.__routes = [...baseRoutes(), ['POST', /^\/operations\/1\/rules$/, () => ({ id: 99 })]];
  calls.length = 0;
  await render(React.createElement(m.TimingRuleDialog, { open: true, operationId: 1, operation: ctx.operation, existing: null, tree: null, onClose() {}, onSaved() {} }));
  await settle(60);
  assert.match(q('time-Setup, per run').textContent, /Not set/);
  await click(q('build-Work, per piece'));
  await settle(60);
  assert.equal(q('time-builder-title').textContent, 'Work, per piece');
  await setValue(q('formula-text'), '2.5');
  await settle(400);
  await click(q('builder-save'));
  await settle(60);
  assert.match(q('time-Work, per piece').textContent, /2\.5 min/);
});


if (root) await React.act(async () => { root.unmount(); });
console.log(`
${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 50);
