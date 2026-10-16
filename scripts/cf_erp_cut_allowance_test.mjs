// Run from multi_app_fe: node scripts/cf_erp_cut_allowance_test.mjs
// Cutting allowance by BOM part name (init.sql §64, 2026-10-16; TM/CF_ERP_NESTING_V2.md "Cutting allowance"):
// the lib (lib/cutAllowance.ts — the arithmetic and words, a mirror of the server's), the customer's section
// (CustomerCutAllowance), the order's panel (OrderCutAllowancePanel: inherits, override, back to the customer's,
// locked lines said), one row's dialog (RowCutAllowanceDialog), and "+15 mm allowance" beside the size in the Cut
// pieces list (BlanksPanel).
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/orders/1', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  try { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true }); } catch { /* skip */ }
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20, toJSON() { return {}; } });

const stub = `export async function apiFetch(url, o = {}) {
  const res = await globalThis.fetch(url, { method: o.method || 'GET', body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await res.text();
  if (!res.ok) throw new Error('API request failed: ' + res.status + ' x - ' + text);
  return JSON.parse(text);
}`;
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; export { React, createRoot }; export { MemoryRouter } from 'react-router-dom';
      export { CustomerCutAllowance, OrderCutAllowancePanel, RowCutAllowanceDialog } from './src/apps/cf_erp/components/CutAllowance';
      export { BlanksPanel } from './src/apps/cf_erp/components/Nesting/BlanksPanel';
      export { extraMm, ruleText, exampleText, readInputs, sourceText, allowanceTitle } from './src/apps/cf_erp/lib/cutAllowance';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stub-api', setup(b) {
    b.onResolve({ filter: /^@core\/api\/client$/ }, () => ({ path: 'apiclient', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: stub, loader: 'js' }));
  } }],
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `cut-allowance-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const M = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter } = M;
const inRouter = (el) => React.createElement(MemoryRouter, { initialEntries: ['/testco/cf_erp/orders/1'] }, el);

let passed = 0, failed = 0;
let root = null;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); try { if (root) await React.act(async () => { root.unmount(); }); } catch { /* gone */ } root = null; document.body.innerHTML = ''; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = (ms = 30) => React.act(async () => { await sleep(ms); });
const waitFor = async (cond, what, ms = 4000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false; try { ok = !!cond(); } catch { /* not yet */ }
    if (ok) return;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await settle(20);
  }
};
const $ = (id) => document.querySelector(`[data-testid=${id}]`);
const $$ = (id) => [...document.querySelectorAll(`[data-testid=${id}]`)];
const text = () => document.body.textContent;
const click = async (el, what) => { assert.ok(el, `no ${what}`); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await settle(); };
const button = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
const typeInto = async (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
  await React.act(async () => { setter.call(el, value); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(0); });
  await settle();
};
const host = () => { const d = document.createElement('div'); document.body.appendChild(d); return d; };
const mountEl = async (el) => { root = createRoot(host()); await React.act(async () => { root.render(inRouter(el)); await sleep(0); }); };
const unmount = async () => { if (root) await React.act(async () => { root.unmount(); }); root = null; document.body.innerHTML = ''; };

/* ---- the server, stubbed -------------------------------------------------------------------- */
const rule = (scope, perEndMm, perMetreMm = 0, id = 1) => ({ id, scope, perEndMm, perMetreMm, words: [perEndMm ? `${perEndMm} mm at each end` : '', perMetreMm ? `${perMetreMm} mm a metre` : ''].filter(Boolean).join(' + ') || 'none' });
const TOP = { id: 22, code: 'TF', name: 'Top flange' };
const WEB = { id: 23, code: 'WP', name: 'Web plate' };
let routes = {};
const calls = [];
globalThis.fetch = async (url, o = {}) => {
  const method = o.method || 'GET';
  const path = String(url).replace(/^\/api\/testco\/cf_erp/, '');
  calls.push({ method, path, body: o.body ? JSON.parse(o.body) : undefined });
  const key = `${method} ${path.split('?')[0]}`;
  const out = routes[key];
  if (out === undefined) return { ok: false, status: 404, text: async () => JSON.stringify({ code: 'NOT_FOUND', message: `no stub for ${key}` }) };
  const v = typeof out === 'function' ? out(o.body ? JSON.parse(o.body) : undefined) : out;
  return { ok: true, status: 200, text: async () => JSON.stringify(v) };
};
const reset = (r) => { routes = r; calls.length = 0; };

/* ---- 1. the lib ----------------------------------------------------------------------------- */
await check('lib: 7.5 mm at each end on 11940 → 11955 (+15 mm); 5 + 1 a metre → +21.9; the words', async () => {
  assert.equal(M.extraMm({ perEndMm: 7.5, perMetreMm: 0 }, 11940), 15);
  assert.equal(M.extraMm({ perEndMm: 5, perMetreMm: 1 }, 11940), 21.9);
  assert.equal(M.exampleText({ perEndMm: 7.5, perMetreMm: 0 }, 11940), '11940 → 11955 mm (+15 mm)');
  assert.equal(M.exampleText({ perEndMm: 0, perMetreMm: 0 }, 11940), '11940 mm, cut as drawn');
  assert.equal(M.ruleText({ perEndMm: 7.5, perMetreMm: 0 }), '7.5 mm at each end');
  assert.equal(M.ruleText({ perEndMm: 5, perMetreMm: 1 }), '5 mm at each end + 1 mm a metre');
  assert.equal(M.ruleText(null), 'none');
  assert.equal(M.sourceText(rule('customer', 7.5)), 'From the customer');
  assert.equal(M.sourceText(rule('row', 0)), 'Set on this row');
});
await check('lib: inputs — empty is 0, never below 0, at most 200 at an end and 20 a metre', async () => {
  assert.deepEqual(M.readInputs('7.5', ''), { rule: { perEndMm: 7.5, perMetreMm: 0 } });
  assert.match(M.readInputs('-1', '').error, /no number below 0/);
  assert.match(M.readInputs('250', '').error, /At most 200/);
  assert.match(M.readInputs('5', '30').error, /At most 20/);
  assert.match(M.readInputs('abc', '').error, /number of mm/);
});
await check('lib: the hover text of a cut piece says drawn → cut, the rule, and that the order weight stays', async () => {
  const t = M.allowanceTitle({ drawnLength: 11940, cutLength: 11955, rule: { scope: 'customer', perEndMm: 7.5, perMetreMm: 0 } });
  assert.equal(t, 'Drawn 11940 mm, cut 11955 mm. Customer default: 7.5 mm at each end. The order weight stays as drawn.');
});

/* ---- 2. the cut pieces list ----------------------------------------------------------------- */
await check('Cut pieces list: "+15 mm allowance" beside the length; nothing beside a piece cut as drawn', async () => {
  const blank = (id, length, allowance) => ({ id, kind: 'plate', code: `CP-${id}`, name: null, size: { thickness: 25, length, width: 500, grade: 'E350' }, allowance, partCount: 1, plate: null, nest: null, plateQuantity: 1, plateQuantityBasis: 'unresolved', note: null });
  reset({
    'GET /order-lines/5/cut-plates': {
      cutPlates: [
        blank(1, 11955, { extraMm: 15, minMm: 15, maxMm: 15, drawnLength: 11940, cutLength: 11955, rule: { scope: 'customer', perEndMm: 7.5, perMetreMm: 0, words: '7.5 mm at each end' }, words: '+15 mm allowance' }),
        blank(2, 400, null),
      ],
      partsWithoutBlank: [], lock: null, values: { missing: 0, items: 0, complete: true }, upToDate: true, lastMadeAt: null, parts: 2,
    },
  });
  await mountEl(React.createElement(M.BlanksPanel, { lineId: 5, canManage: true }));
  await waitFor(() => $$('cut-allowance').length === 1, 'the allowance note');
  const note = $('cut-allowance');
  assert.equal(note.textContent, '+15 mm allowance');
  assert.match(note.getAttribute('title'), /Drawn 11940 mm, cut 11955 mm/);
  assert.match(note.closest('td').textContent, /^11955/);
  await unmount();
});

/* ---- 3. the customer ------------------------------------------------------------------------ */
await check('Customer: the defaults per part name, with a worked example; change one → PUT, and the reply is shown', async () => {
  let current = rule('customer', 7.5, 0, 9);
  const view = () => ({ customer: { id: 4, code: 'NECL', name: 'NECL' }, rules: [{ ...current, definitionId: TOP.id, definition: TOP, example: { drawnLength: 12000, cutLength: 12000 + 2 * current.perEndMm, extraMm: 2 * current.perEndMm, words: `12000 → ${12000 + 2 * current.perEndMm} mm (+${2 * current.perEndMm} mm)` } }], note: '' });
  reset({
    'GET /customers/4/cut-allowances': () => view(),
    [`PUT /customers/4/cut-allowances/${TOP.id}`]: (b) => { current = rule('customer', b.perEndMm, b.perMetreMm, 9); return { ...view(), refreshed: [{ lineId: 5, lineNo: 1, made: true }], frozen: [], message: 'The cut pieces of 1 line were worked out again.' }; },
  });
  await mountEl(React.createElement(M.CustomerCutAllowance, { customerId: 4 }));
  await waitFor(() => $$('customer-allowance-row').length === 1, 'the rule row');
  assert.match($('customer-allowance-row').textContent, /Top flange/);
  assert.match($('customer-allowance-row').textContent, /7\.5 mm at each end/);
  assert.match($('customer-allowance-row').textContent, /12000 → 12015 mm \(\+15 mm\)/);
  await click(document.querySelector('[aria-label="Change the allowance for Top flange"]'), 'change');
  await waitFor(() => $('allowance-per-end'), 'the dialog');
  assert.equal($('allowance-per-end').value, '7.5');
  await typeInto($('allowance-per-end'), '6');
  assert.match($('allowance-example').textContent, /12000 → 12012 mm \(\+12 mm\)/);
  await click(button('Save'), 'save');
  await waitFor(() => calls.some((c) => c.method === 'PUT'), 'the PUT');
  const put = calls.find((c) => c.method === 'PUT');
  assert.deepEqual(put.body, { perEndMm: 6, perMetreMm: 0 });
  await waitFor(() => /6 mm at each end/.test($('customer-allowance-row')?.textContent ?? ''), 'the new rule shown');
  await unmount();
});
await check('Customer: a negative number is refused in words, and Save is off', async () => {
  reset({ 'GET /customers/4/cut-allowances': { customer: { id: 4, code: 'NECL', name: 'NECL' }, rules: [{ ...rule('customer', 7.5), definitionId: TOP.id, definition: TOP, example: null }], note: '' } });
  await mountEl(React.createElement(M.CustomerCutAllowance, { customerId: 4 }));
  await waitFor(() => $$('customer-allowance-row').length === 1, 'the rule row');
  await click(document.querySelector('[aria-label="Change the allowance for Top flange"]'), 'change');
  await typeInto($('allowance-per-end'), '-3');
  assert.match(text(), /only makes a cut piece longer/);
  assert.equal(button('Save').disabled, true);
  await unmount();
});

/* ---- 4. the order --------------------------------------------------------------------------- */
const orderView = (o = {}) => ({
  order: { id: 1, code: 'SO-1', revision: 1, status: 'confirmed', customer: { id: 4, code: 'NECL', name: 'NECL' }, editable: true, reason: null },
  partNames: [
    { definitionId: TOP.id, definition: TOP, rows: 4, lengths: { min: 11940, max: 11940 }, customer: rule('customer', 7.5), order: null, effective: rule('customer', 7.5), example: { drawnLength: 11940, cutLength: 11955, extraMm: 15, words: '11940 → 11955 mm (+15 mm)' }, rowOverrides: 0 },
    { definitionId: WEB.id, definition: WEB, rows: 2, lengths: { min: 11940, max: 11940 }, customer: null, order: null, effective: null, example: { drawnLength: 11940, cutLength: 11940, extraMm: 0, words: '11940 mm, cut as drawn' }, rowOverrides: 0 },
  ],
  rows: [], noPartName: 0,
  lines: [{ lineId: 5, lineNo: 1, frozen: true, reason: 'locked', message: 'Line 1 of SO-1 is frozen — its cut pieces stay as they are. A revision of the order takes the new allowance.' }, { lineId: 6, lineNo: 2, frozen: false, reason: null, message: null }],
  note: '', ...o,
});
await check('Order: each part name in its BOM — inherited from the customer, the worked example; a locked line is said', async () => {
  reset({ 'GET /orders/1/cut-allowances': orderView() });
  await mountEl(React.createElement(M.OrderCutAllowancePanel, { orderId: 1 }));
  await waitFor(() => $$('order-allowance-part').length === 2, 'two part names');
  const [top, web] = $$('order-allowance-part');
  assert.match(top.textContent, /Top flange/);
  assert.match(top.textContent, /4 rows/);
  assert.match(top.textContent, /7\.5 mm at each end · From the customer/);
  assert.match(top.textContent, /11940 → 11955 mm \(\+15 mm\)/);
  assert.match(web.textContent, /Cut as drawn/);
  assert.match($('allowance-frozen').textContent, /Line 1 is frozen: its cut pieces stay as they are\. A change here reaches it through a revision of the order\./);
  assert.match(text(), /order weight stays as drawn/);
  await unmount();
});
await check('Order: override a part name → PUT on the order; "Use the customer\'s" → DELETE', async () => {
  let view = orderView({ lines: [] });
  reset({
    'GET /orders/1/cut-allowances': () => view,
    [`PUT /orders/1/cut-allowances/${TOP.id}`]: (b) => {
      const p = { ...view.partNames[0], order: rule('order', b.perEndMm, b.perMetreMm, 7), effective: rule('order', b.perEndMm, b.perMetreMm, 7), example: { drawnLength: 11940, cutLength: 11961.9, extraMm: 21.9, words: '11940 → 11961.9 mm (+21.9 mm)' } };
      view = { ...view, partNames: [p, view.partNames[1]] };
      return { ...view, refreshed: [], frozen: [], message: null };
    },
    [`DELETE /orders/1/cut-allowances/${TOP.id}`]: () => { view = orderView({ lines: [] }); return { ...view, refreshed: [], frozen: [], message: null }; },
  });
  await mountEl(React.createElement(M.OrderCutAllowancePanel, { orderId: 1 }));
  await waitFor(() => $$('order-allowance-part').length === 2, 'part names');
  await click([...$$('order-allowance-part')[0].querySelectorAll('button')].find((b) => b.textContent === 'Override'), 'override');
  await waitFor(() => $('allowance-per-end'), 'the dialog');
  assert.equal($('allowance-per-end').value, '7.5', 'starts from the customer\'s');
  assert.match(text(), /Customer: 7\.5 mm at each end/);
  await typeInto($('allowance-per-end'), '5');
  await typeInto($('allowance-per-metre'), '1');
  assert.match($('allowance-example').textContent, /11940 → 11961\.9 mm \(\+21\.9 mm\)/);
  await click(button('Save'), 'save');
  await waitFor(() => /Set on this order/.test($$('order-allowance-part')[0]?.textContent ?? ''), 'the override shown');
  assert.deepEqual(calls.find((c) => c.method === 'PUT').body, { perEndMm: 5, perMetreMm: 1 });
  assert.match($$('order-allowance-part')[0].textContent, /Customer: 7\.5 mm at each end/);
  await click([...$$('order-allowance-part')[0].querySelectorAll('button')].find((b) => b.textContent === 'Change'), 'change');
  await waitFor(() => $('allowance-clear'), 'the clear button');
  assert.equal($('allowance-clear').textContent, "Use the customer's");
  await click($('allowance-clear'), 'clear');
  await waitFor(() => calls.some((c) => c.method === 'DELETE'), 'the DELETE');
  await waitFor(() => /From the customer/.test($$('order-allowance-part')[0]?.textContent ?? ''), 'back to the customer\'s');
  await unmount();
});
await check('Order: a revised order says so and offers no button', async () => {
  reset({ 'GET /orders/1/cut-allowances': orderView({ order: { ...orderView().order, status: 'revised', editable: false, reason: 'SO-1 rev 1 was revised — it is kept as it was; change rev 2 instead.' }, lines: [] }) });
  await mountEl(React.createElement(M.OrderCutAllowancePanel, { orderId: 1 }));
  await waitFor(() => $$('order-allowance-part').length === 2, 'part names');
  assert.match(text(), /change rev 2 instead/);
  assert.equal($$('order-allowance-part').some((p) => p.querySelector('button')), false);
  await unmount();
});

/* ---- 5. one row ----------------------------------------------------------------------------- */
await check('Row: the levels above it, what it is now, and its own → PUT on the row; locked line said', async () => {
  let own = null;
  const view = () => ({
    row: { partId: 77, code: null, name: 'Top flange TF1', lineId: 5, lineNo: 1, definition: TOP, drawnLength: 11940 },
    customer: rule('customer', 7.5), order: rule('order', 5, 1), own, effective: own ?? rule('order', 5, 1),
    example: own ? { drawnLength: 11940, cutLength: 11940, extraMm: 0, words: '11940 mm, cut as drawn' } : { drawnLength: 11940, cutLength: 11961.9, extraMm: 21.9, words: '11940 → 11961.9 mm (+21.9 mm)' },
    editable: true, reason: null, lineFrozen: { reason: 'locked', message: 'Line 1 of SO-1 is frozen — its cut pieces stay as they are. A revision of the order takes the new allowance.' }, note: '',
  });
  reset({
    'GET /orders/1/lines/5/rows/77/cut-allowance': () => view(),
    'PUT /orders/1/lines/5/rows/77/cut-allowance': (b) => { own = rule('row', b.perEndMm, b.perMetreMm, 3); return { ...view(), refreshed: [], frozen: [{ lineId: 5, lineNo: 1 }], message: '1 frozen line keeps its cut pieces — a revision of the order takes the new allowance.' }; },
  });
  let closed = 0;
  await mountEl(React.createElement(M.RowCutAllowanceDialog, { open: true, orderId: 1, lineId: 5, rowId: 77, onClose: () => { closed++; } }));
  await waitFor(() => $('allowance-per-end'), 'the dialog');
  assert.match(text(), /Allowance for Top flange TF1/);
  assert.match(text(), /Customer: 7\.5 mm at each end/);
  assert.match(text(), /This order: 5 mm at each end \+ 1 mm a metre/);
  assert.match(text(), /Now: 5 mm at each end \+ 1 mm a metre · Set on this order · 11940 → 11961\.9 mm/);
  assert.match(text(), /Its line is frozen — its cut pieces stay as they are/);
  assert.match($('allowance-example').textContent, /This row: 11940 → 11961\.9 mm/);
  await typeInto($('allowance-per-end'), '0');
  await typeInto($('allowance-per-metre'), '0');
  assert.match($('allowance-example').textContent, /11940 mm, cut as drawn/);
  await click(button('Save'), 'save');
  await waitFor(() => closed === 1, 'closed after save');
  assert.deepEqual(calls.find((c) => c.method === 'PUT').body, { perEndMm: 0, perMetreMm: 0 });
  await unmount();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
