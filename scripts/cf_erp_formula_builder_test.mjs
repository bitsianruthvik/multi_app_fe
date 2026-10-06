// Run from multi_app_fe: node scripts/cf_erp_formula_builder_test.mjs
// The operation-time builder: rate × quantity writes the right expression (with mm → m conversion), the LOOKUP helper
// inserts LOOKUP(machine.CHART, item.KEY), templates prefill, the live preview shows minutes from the check, a mm-vs-m
// slip is warned about, saving creates the formula AND assigns it to the rule, and a shared formula asks before it
// changes for every rule. The API is mocked; no network.
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
      export { FormulaEditor } from './src/apps/cf_erp/components/FormulaBuilder/FormulaEditor';
      export { TimeBuilder } from './src/apps/cf_erp/components/FormulaBuilder/TimeBuilder';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/(api\/client|contexts\/AuthContext)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
  } }],
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
  ['POST', /^\/formulas$/, (c) => formula(99, c.body.code, c.body.expression, { name: c.body.name })],
  ['PUT', /^\/formulas\/\d+$/, (c) => formula(Number(c.path.split('/')[2]), 'SHARED_TIME', c.body.expression, { version: 2 })],
];
globalThis.__routes = baseRoutes();
const builder = (props) => React.createElement(m.TimeBuilder, {
  open: true, onClose() {}, operation: ctx.operation, subject: { type: 'classification', id: 3315, label: 'variant SAW' }, which: 'work',
  current: null, formulas: [], canMakeFormula: true, onAssign: () => {}, ...props,
});

// ── pure logic ─────────────────────────────────────────────────────────────
await check('rate × quantity: a length in mm at a rate per metre is divided by 1000', async () => {
  const f = idx.item.get('SAW_WELD_LENGTH');
  assert.equal(m.buildRateExpression({ field: 'SAW_WELD_LENGTH', rate: '1.0', rateUnit: 'm', multiplier: null, constant: '' }, f), 'item.SAW_WELD_LENGTH / 1000 * 1');
  assert.equal(m.buildRateExpression({ field: 'SAW_WELD_LENGTH', rate: '0.002', rateUnit: 'mm', multiplier: null, constant: '' }, f), 'item.SAW_WELD_LENGTH * 0.002');
  assert.equal(m.buildRateExpression({ field: 'SURFACE_AREA', rate: '2.5', rateUnit: 'm2', multiplier: 'PAINT_COATS', constant: '15' }, idx.item.get('SURFACE_AREA')), 'item.SURFACE_AREA * 2.5 * item.PAINT_COATS + 15');
  assert.equal(m.buildRateExpression({ field: 'WEIGHT', rate: '8', rateUnit: 't', multiplier: null, constant: '' }, idx.item.get('WEIGHT')), 'item.WEIGHT / 1000 * 8');
  assert.equal(m.buildRateExpression({ field: 'HOLES', rate: '0.35', rateUnit: 'each', multiplier: null, constant: '' }, idx.item.get('HOLES')), 'item.HOLES * 0.35');
});
await check('a rate formula reads back into its parts (so editing reopens the simple form)', async () => {
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
await check('suggested code from the operation code, never a taken one', async () => {
  assert.equal(m.suggestCode('CG-SAWWELD', 'work', []), 'CG_SAWWELD_TIME');
  assert.equal(m.suggestCode('CG-SAWWELD', 'setup', []), 'CG_SAWWELD_SETUP_TIME');
  assert.equal(m.suggestCode('CG-SAWWELD', 'work', ['CG_SAWWELD_TIME']), 'CG_SAWWELD_TIME_2');
  assert.equal(m.suggestCode('3D cut', 'work', []), 'OP_3D_CUT_TIME');
});

// ── the LOOKUP helper ──────────────────────────────────────────────────────
await check('LOOKUP helper lists the machine charts and inserts LOOKUP(machine.CUT_SPEED, item.THICKNESS)', async () => {
  let value = 'item.CUT_LENGTH / ';
  const Host = () => {
    const [v, setV] = React.useState(value);
    value = v;
    return React.createElement(m.FormulaEditor, { value: v, onChange: setV, idx, itemFields, machineFields });
  };
  await render(React.createElement(Host));
  const ta = q('formula-text');
  ta.setSelectionRange(ta.value.length, ta.value.length);
  await click(q('lookup-button'));
  await settle();
  assert.ok(q('chart-CUT_SPEED'), 'the chart is listed');
  assert.match(q('lookup-helper').textContent, /by Thickness \(mm\)/);
  assert.equal(q('lookup-preview').textContent, 'LOOKUP(machine.CUT_SPEED, item.THICKNESS)', 'the key column is matched to the piece field by name');
  await click(q('lookup-insert'));
  await settle();
  assert.equal(value, 'item.CUT_LENGTH / LOOKUP(machine.CUT_SPEED, item.THICKNESS)');
});
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

// ── the builder ────────────────────────────────────────────────────────────
await check('templates prefill: Length × rate → Rate tab with SAW weld length per metre; Cut → Advanced with LOOKUP', async () => {
  globalThis.__routes = baseRoutes();
  await render(builder({}));
  await settle(50);
  assert.ok(q('time-builder'), 'the builder is open');
  await click(q('template-length'));
  await settle();
  assert.equal(q('rate-expression').textContent, 'item.SAW_WELD_LENGTH / 1000 * 1');
  assert.match(q('rate-conversion').textContent, /SAW weld length is in mm — converted to m \(÷ 1,000\)/);
  await click(q('template-cut'));
  await settle();
  assert.equal(q('formula-text').value, 'item.CUT_LENGTH / LOOKUP(machine.CUT_SPEED, item.THICKNESS) + item.PIERCINGS * machine.PIERCE_TIME');
  await click(q('template-area'));
  await settle();
  assert.equal(q('rate-expression').textContent, 'item.SURFACE_AREA * 2.5 * item.PAINT_COATS');
  await click(q('template-weight'));
  await settle();
  assert.equal(q('formula-text').value, 'item.HBFIT_JOINTS * 25 * item.WEIGHT / 1000');
});
await check('live preview shows the minutes and the formula in words from the check', async () => {
  globalThis.__routes = baseRoutes();
  checkValue = 24;
  calls.length = 0;
  await render(builder({}));
  await settle(50);
  await click(q('template-length'));
  await settle(400);
  const sent = calls.filter((c) => c.path === '/formulas/check').at(-1);
  assert.ok(sent, 'the check was called');
  assert.equal(sent.body.expression, 'item.SAW_WELD_LENGTH / 1000 * 1');
  assert.equal(sent.body.itemId, 501, 'on the first real piece');
  assert.equal(sent.body.machineId, 7, 'on a machine of the rule\'s type');
  assert.equal(q('preview-minutes').textContent, '24 min');
  assert.equal(q('preview-words').textContent, '1 min per m of SAW weld length');
  assert.match(q('preview-panel').textContent, /24,000 from the piece/);
});
await check('unit warning: SAW weld length in mm × a rate, without ÷ 1000', async () => {
  globalThis.__routes = baseRoutes();
  await render(builder({}));
  await settle(50);
  await click(q('tab-advanced'));
  await settle();
  await setValue(q('formula-text'), 'item.SAW_WELD_LENGTH * 1.0');
  await settle(400);
  assert.match(q('unit-warnings').textContent, /SAW weld length is in mm\. If the rate is minutes per metre, divide by 1,000/);
});
await check('save creates the formula with the suggested code and assigns it to the rule in the same action', async () => {
  globalThis.__routes = baseRoutes();
  calls.length = 0;
  const assigned = [];
  let closed = false;
  await render(builder({ onAssign: (a) => { assigned.push(a); }, onClose: () => { closed = true; } }));
  await settle(50);
  await click(q('template-length'));
  await setValue(q('rate-value'), '1.2');
  await setValue(q('rate-setup'), '20');
  await settle(400);
  assert.equal(q('formula-code').value, 'CG_SAWWELD_TIME');
  await click(q('builder-save'));
  await settle(50);
  const post = calls.find((c) => c.method === 'POST' && c.path === '/formulas');
  assert.ok(post, 'the formula was created');
  assert.equal(post.body.code, 'CG_SAWWELD_TIME');
  assert.equal(post.body.expression, 'item.SAW_WELD_LENGTH / 1000 * 1.2');
  assert.equal(assigned.length, 1);
  assert.equal(assigned[0].formulaId, 99);
  assert.equal(assigned[0].setupMinutes, 20, 'the rate form\'s setup goes onto the rule');
  assert.ok(closed);
});
await check('fixed minutes assign without making a formula', async () => {
  globalThis.__routes = baseRoutes();
  calls.length = 0;
  const assigned = [];
  await render(builder({ onAssign: (a) => { assigned.push(a); } }));
  await settle(50);
  await click(q('tab-fixed'));
  await setValue(q('fixed-minutes'), '12');
  await click(q('builder-save'));
  await settle(50);
  assert.deepEqual(assigned, [{ minutes: 12, formulaId: null }]);
  assert.ok(!calls.some((c) => c.path === '/formulas' || /^\/formulas\/\d/.test(c.path)));
});
await check('a formula used by other rules asks: change for all, or a new one for this rule', async () => {
  globalThis.__routes = baseRoutes();
  const shared = formula(42, 'SHARED_TIME', 'item.SAW_WELD_LENGTH / 1000 * 1', { timingRuleCount: 3 });
  const current = { minutes: null, formula: { id: 42, code: 'SHARED_TIME', expression: shared.expression } };
  // default: a new formula for this rule
  calls.length = 0;
  let assigned = [];
  await render(builder({ current, formulas: [shared], onAssign: (a) => { assigned.push(a); } }));
  await settle(50);
  assert.equal(q('rate-expression').textContent, 'item.SAW_WELD_LENGTH / 1000 * 1', 'reopens in the Rate form');
  assert.equal(q('shared-warning'), null, 'no warning while unchanged');
  await setValue(q('rate-value'), '1.5');
  await settle(50);
  assert.match(q('shared-warning').textContent, /SHARED_TIME is used by 3 rules — change it for all, or save a new formula for this rule/);
  await click(q('builder-save'));
  await settle(50);
  assert.ok(calls.some((c) => c.method === 'POST' && c.path === '/formulas'), 'saved as a new formula');
  assert.ok(!calls.some((c) => c.method === 'PUT'), 'the shared one is untouched');
  assert.equal(assigned[0].formulaId, 99);
  // change for all
  calls.length = 0;
  assigned = [];
  await render(builder({ current, formulas: [shared], onAssign: (a) => { assigned.push(a); } }));
  await settle(50);
  await setValue(q('rate-value'), '1.5');
  await settle(50);
  await click(q('share-all').querySelector('input'));
  await settle();
  assert.match(q('builder-save').textContent, /Save v2 and assign/);
  await click(q('builder-save'));
  await settle(50);
  const put = calls.find((c) => c.method === 'PUT' && c.path === '/formulas/42');
  assert.ok(put, 'the shared formula got a new version');
  assert.equal(put.body.expression, 'item.SAW_WELD_LENGTH / 1000 * 1.5');
  assert.equal(assigned[0].formulaId, 42);
});
await check('problems from the check block saving', async () => {
  globalThis.__routes = baseRoutes();
  checkProblems = ['Unknown specification NOPE.'];
  await render(builder({}));
  await settle(50);
  await click(q('tab-advanced'));
  await setValue(q('formula-text'), 'item.NOPE * 2');
  await settle(400);
  assert.match(q('preview-problems').textContent, /Unknown specification NOPE/);
  assert.equal(q('builder-save').disabled, true);
  checkProblems = [];
});

if (root) await React.act(async () => { root.unmount(); });
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 50);
