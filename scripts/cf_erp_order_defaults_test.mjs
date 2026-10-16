// Run from multi_app_fe: node scripts/cf_erp_order_defaults_test.mjs
//
// ORDER and LINE values (init.sql §65, 2026-10-16). User: "The various coats, MS BO or BR, all of these are
// also set at an order or a line level typically and can be overridden in the values screen if required."
// The words and checks (lib/orderSpecDefaults, lib/valueSource.orderMark), the compact Values cell carrying
// inherit / override (valuesModel.effectiveCell), the Values grid's quiet "from order" marker and the way back
// from a row override (BomGrid), and the Order values panel (OrderSpecValuesPanel) against a stubbed API.
// DOM-level; it does not replace a look in a browser.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div><div id="panel"></div></body></html>', { url: 'http://localhost/acme/cf_erp/orders/1', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MouseEvent', 'KeyboardEvent', 'Event', 'FocusEvent', 'InputEvent']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');

// The panel's API module is replaced by a stub the test drives (no server).
const stub = `
  export const calls = [];
  export let view = null;
  export const setView = (v) => { view = v; };
  export const getOrderSpecDefaults = async () => view;
  export const setOrderSpecDefaults = async (orderId, lineId, writes) => {
    calls.push({ orderId, lineId, writes });
    return { applied: true, dryRun: false, summary: { sentence: '1 value of the whole order saved.', changed: 1, lines: [] }, changes: [], view };
  };`;
const built = await build({
  alias: { '@shared/ui': resolve('src/shared/ui/SheetGrid.tsx') },
  plugins: [{
    name: 'stub-order-spec-api',
    setup(b) {
      b.onResolve({ filter: /api\/orderSpecDefaults$/ }, () => ({ path: 'stub', namespace: 'stub' }));
      // The platform's fetch: never reached here (the panel's API is the stub above).
      b.onResolve({ filter: /^@core\/api\/client$/ }, () => ({ path: 'core', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
        contents: a.path === 'core' ? "export const apiFetch = async () => { throw new Error('no server in this test'); };" : stub, loader: 'js',
      }));
    },
  }],
  stdin: {
    contents: `export * from './src/apps/cf_erp/components/Bom/BomGrid'; export * from './src/apps/cf_erp/components/Bom/bomArrangement'; export * from './src/apps/cf_erp/components/Bom/bomModel';
      export * from './src/apps/cf_erp/lib/valueSource'; export * as od from './src/apps/cf_erp/lib/orderSpecDefaults'; export * as values from './src/apps/cf_erp/components/Values/valuesModel';
      export { OrderSpecValuesPanel } from './src/apps/cf_erp/components/OrderSpecValuesPanel'; export * as api from './src/apps/cf_erp/api/orderSpecDefaults';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `order-defaults-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };

/* ---------------------------------------------------------------------------
 * The words and checks
 * ------------------------------------------------------------------------ */
const GRADE = { id: 1, code: 'GRADE', name: 'Grade', dataType: 'option', unit: null, decimals: null, options: [{ id: 11, value: 'E250', label: null }, { id: 12, value: 'E350', label: null }] };
const COATS = { id: 2, code: 'PAINT_COATS', name: 'Paint coats', dataType: 'number', unit: null, decimals: 0 };
await check('a line shows its own value, else the order\'s, else nothing', () => {
  const order = { GRADE: { input: '12', display: 'E350' } };
  assert.deepEqual(m.od.lineShows({ values: { GRADE: { input: '11', display: 'E250' } } }, order, 'GRADE'), { value: { input: '11', display: 'E250' }, from: 'line' });
  assert.deepEqual(m.od.lineShows({ values: {} }, order, 'GRADE'), { value: { input: '12', display: 'E350' }, from: 'order' });
  assert.deepEqual(m.od.lineShows({ values: {} }, {}, 'GRADE'), { value: null, from: null });
});
await check('how a line\'s rows take a value, in words', () => {
  assert.equal(m.od.usageText({ rows: 306, follow: 300, own: 6, notAllowed: 0, empty: 0 }), '306 rows · 300 take it · 6 have their own');
  assert.equal(m.od.usageText({ rows: 1, follow: 0, own: 1, notAllowed: 0, empty: 0 }), '1 row · 1 has its own');
  assert.equal(m.od.usageText({ rows: 4, follow: 1, own: 0, notAllowed: 2, empty: 1 }), '4 rows · 1 takes it · 2 not allowed · 1 empty');
  assert.equal(m.od.usageText({ rows: 0, follow: 0, own: 0, notAllowed: 0, empty: 0 }), null);
  assert.equal(m.od.usageText(null), null);
});
await check('a typed value is checked before it is sent', () => {
  assert.deepEqual(m.od.readSpecInput(COATS, ' 2 '), { value: 2 });
  assert.deepEqual(m.od.readSpecInput(COATS, '2,5'), { value: 2.5 });
  assert.deepEqual(m.od.readSpecInput(COATS, 'two'), { error: 'Paint coats needs a number.' });
  assert.deepEqual(m.od.readSpecInput(COATS, ''), { value: null }, 'empty takes it away');
  assert.deepEqual(m.od.readSpecInput(GRADE, '12'), { value: 12 });
  assert.deepEqual(m.od.readSpecInput(GRADE, 'e250'), { value: 11 }, 'an option by its value, ignoring case');
  assert.deepEqual(m.od.readSpecInput(GRADE, 'E450'), { error: '"E450" is not an option of Grade.' });
  assert.deepEqual(m.od.readSpecInput({ dataType: 'boolean', name: 'Holed' }, 'yes'), { value: true });
});
await check('the locked-lines sentence', () => {
  assert.equal(m.od.lockedNote([{ lineNo: 10, frozen: 'locked' }, { lineNo: 20, frozen: null }]), 'Line 10 is locked — it keeps the values it locked with. A change here reaches it only through a revision of the order.');
  assert.equal(m.od.lockedNote([{ lineNo: 20, frozen: null }]), null);
});
await check('the markers: from the order / line, and a row value over it', () => {
  const o = m.orderMark({ inherit: 'order', override: null, orderDisplay: null, display: 'E350' }, true);
  assert.deepEqual([o.from, o.glyph, o.label, o.title, o.canGoBack], ['order', 'O', 'from the order', 'From the order — E350. Type a value to set this row on its own.', false]);
  assert.equal(m.orderMark({ inherit: 'line', override: null, orderDisplay: null, display: '2' }, false).title, 'From the line — 2.');
  const r = m.orderMark({ inherit: null, override: 'order', orderDisplay: 'E350', display: null }, true);
  assert.deepEqual([r.from, r.canGoBack, r.title], ['row', true, 'Set on this row — the order’s value is E350. Click to use the order’s value.']);
  assert.equal(m.orderMark({ inherit: null, override: 'line', orderDisplay: 'E250', display: null }, false).canGoBack, false);
  assert.equal(m.orderMark({ inherit: null, override: null, orderDisplay: null, display: null }, true), null);
});
await check('the compact cell carries inherit / override through effectiveCell', () => {
  const view = { editable: true, optionLists: {} };
  const col = { code: 'GRADE', name: 'Grade', dataType: 'option', unit: null, decimals: null, rule: 'entered', required: true, editable: true };
  const row = { id: 1, cells: {} };
  const a = m.values.effectiveCell(view, col, row, { defaultDisplay: 'E350', inherit: 'order' }, true);
  assert.deepEqual([a.inherit, a.override, a.defaultDisplay, a.input], ['order', null, 'E350', '']);
  const b = m.values.effectiveCell(view, col, row, { input: '11', override: 'line', orderDisplay: 'E350' }, true);
  assert.deepEqual([b.inherit, b.override, b.orderDisplay], [null, 'line', 'E350']);
  assert.equal(m.values.stillMissing(a, ''), false, 'an inherited value counts as filled, even when the cell is emptied');
});

/* ---------------------------------------------------------------------------
 * The Values grid
 * ------------------------------------------------------------------------ */
const node = (id, children = [], more = {}) => ({ id, key: `k${id}`, name: `Row ${id}`, code: null, kind: 'temporary', status: 'draft', depth: 1, quantity: 1, total: 1, lineId: id * 10, lineNo: id * 10, position: 1, role: null, selection: null, resolved: true, flow: null, bom: null, children, ...more });
const tree = node(1, [node(2), node(3)], { lineId: null, depth: 0 });
const rows = m.arrangedRows(tree, new Set(['k1', 'k2', 'k3']), m.NO_PENDING);
const view = {
  editable: true, optionLists: { o1: [{ id: 11, value: 'E250' }, { id: 12, value: 'E350' }] },
  groups: [{
    columns: [
      { code: 'GRADE', name: 'Grade', dataType: 'option', rule: 'entered', required: true, options: 'o1', editable: true },
      { code: 'COATS', name: 'Paint coats', dataType: 'number', rule: 'entered', required: false, editable: true },
    ],
    rows: [
      { id: 1, cells: { GRADE: { defaultDisplay: 'E350', inherit: 'order' }, COATS: { defaultDisplay: '2', inherit: 'line' } } },
      { id: 2, cells: { GRADE: { input: '11', override: 'order', orderDisplay: 'E350' }, COATS: { input: '3' } } },
      { id: 3, cells: { GRADE: { input: '12' }, COATS: {} } },
    ],
  }],
};
let writes = [];
const props = { rows, view, pending: m.NO_PENDING, busy: false, canEdit: () => true, canEditValues: () => true,
  onWrites: (w) => { writes = w; }, onMove: () => {}, dropRefusal: () => null, onToggle: () => {}, trailingCell: () => null, flowCell: () => null, markOf: () => null, placeholderOf: () => null };
const root = createRoot(document.getElementById('app'));
const { MemoryRouter } = await import('react-router-dom');
const render = (p = props) => React.act(() => root.render(React.createElement(MemoryRouter, { initialEntries: ['/acme/cf_erp/orders/1?tab=values'] }, React.createElement(m.BomGrid, p))));
const cellKey = (r, key) => document.querySelector(`[data-cell^="${r}:"][data-col-key="${key}"]`);
const fire = async (el, type, init = {}) => React.act(() => el.dispatchEvent(type.startsWith('key') ? new KeyboardEvent(type, { bubbles: true, ...init }) : new MouseEvent(type, { bubbles: true, ...init })));
await render();

await check('a cell from the order shows the order\'s value with a quiet "O" marker, and can be typed over', () => {
  const c = cellKey(0, 'GRADE');
  assert.match(c.textContent, /E350/);
  assert.equal(c.getAttribute('data-state'), 'order');
  assert.equal(c.getAttribute('aria-readonly'), 'false');
  const mark = c.querySelector('[data-testid="value-from-order"]');
  assert.ok(mark, 'the marker is there');
  assert.equal(mark.textContent, 'O');
  assert.equal(mark.tagName, 'SPAN', 'a quiet mark, not a button');
  assert.equal(c.getAttribute('title'), 'From the order — E350. Type a value to set this row on its own.');
});
await check('a cell from the line says "L"', () => {
  const c = cellKey(0, 'COATS');
  assert.equal(c.querySelector('[data-testid="value-from-order"]').textContent, 'L');
  assert.equal(c.getAttribute('data-state'), 'line');
});
await check('a row value over the order\'s is marked, with the order\'s value in the tooltip', () => {
  const c = cellKey(1, 'GRADE');
  assert.match(c.textContent, /E250/);
  assert.equal(c.getAttribute('data-state'), 'row');
  const button = c.querySelector('button[data-testid="value-row-override"]');
  assert.ok(button, 'the marker is a button');
  assert.equal(button.getAttribute('title'), 'Set on this row — the order’s value is E350. Click to use the order’s value.');
});
await check('"use the order\'s value": one click empties the row\'s own value, nothing else is written', async () => {
  writes = [];
  await fire(cellKey(1, 'GRADE').querySelector('button[data-testid="value-row-override"]'), 'click');
  assert.equal(writes.length, 1);
  assert.deepEqual([writes[0].row.node.id, writes[0].code, writes[0].text, writes[0].saved], [2, 'GRADE', '', '11']);
});
await check('a plain typed value, with no order value, has no marker', () => {
  assert.equal(cellKey(2, 'GRADE').querySelector('[data-mark]'), null);
  assert.equal(cellKey(1, 'COATS').querySelector('[data-mark]'), null);
});
await check('on a line that no longer changes, the override is marked without the way back', async () => {
  await render({ ...props, view: { ...view, editable: false } });
  assert.equal(cellKey(1, 'GRADE').querySelector('button'), null);
  assert.equal(cellKey(1, 'GRADE').querySelector('[data-source="row"]').getAttribute('title'), 'Set on this row — the order’s value is E350.');
  await render();
});

/* ---------------------------------------------------------------------------
 * The Order values panel
 * ------------------------------------------------------------------------ */
m.api.setView({
  order: { id: 7, code: 'SO-1', revision: 2, status: 'inquiry', label: 'SO-1 rev 2' }, editable: true, lock: null, available: true,
  specs: [GRADE, COATS],
  values: { GRADE: { input: '12', display: 'E350' } },
  lines: [
    { id: 70, lineNo: 10, lineType: 'custom', description: null, frozen: null, message: null, values: { PAINT_COATS: { input: '2', display: '2' } },
      usage: { GRADE: { rows: 306, follow: 300, own: 6, notAllowed: 0, empty: 0 }, PAINT_COATS: { rows: 12, follow: 12, own: 0, notAllowed: 0, empty: 0 } } },
    { id: 71, lineNo: 20, lineType: 'custom', description: null, frozen: 'locked', message: 'Line 20 of SO-1 rev 2 is locked.', values: {}, usage: null },
  ],
});
const panelRoot = createRoot(document.getElementById('panel'));
await React.act(async () => { panelRoot.render(React.createElement(m.OrderSpecValuesPanel, { orderId: 7, canEdit: true })); });
await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const panel = () => document.querySelector('[data-testid="order-spec-values"]');
await check('one block per flagged specification', () => {
  assert.deepEqual([...panel().querySelectorAll('[data-testid="order-spec-row"]')].map((r) => r.getAttribute('data-code')), ['GRADE', 'PAINT_COATS']);
});
await check('the whole order\'s value, and each line\'s row counts', () => {
  assert.match(panel().textContent, /Whole order/);
  assert.match(panel().textContent, /306 rows · 300 take it · 6 have their own/);
  assert.match(panel().textContent, /12 rows · 12 take it/);
});
await check('a line without its own value says it is as the order', () => {
  const grade = panel().querySelector('[data-code="GRADE"]');
  assert.match(grade.textContent, /As the order \(E350\)/);
});
await check('a locked line is said once, and its fields are shut', () => {
  assert.match(document.querySelector('[data-testid="order-values-locked"]').textContent, /Line 20 is locked — it keeps the values it locked with/);
  assert.equal(document.querySelector('[data-testid="line-value-20-PAINT_COATS"]').disabled, true);
  assert.equal(document.querySelector('[data-testid="line-value-10-PAINT_COATS"]').disabled, false);
});
await check('a number typed for a line is saved on Enter, for that line', async () => {
  const input = document.querySelector('[data-testid="line-value-10-PAINT_COATS"]');
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await React.act(async () => { setter.call(input, '3'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  await React.act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
  assert.deepEqual(m.api.calls.at(-1), { orderId: 7, lineId: 70, writes: [{ specCode: 'PAINT_COATS', value: 3 }] });
});
await check('a mistake is said before anything is sent', async () => {
  const before = m.api.calls.length;
  const input = document.querySelector('[data-testid="order-value-PAINT_COATS"]');
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await React.act(async () => { setter.call(input, 'two'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  await React.act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
  assert.equal(m.api.calls.length, before);
  assert.match(panel().textContent, /Paint coats needs a number\./);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
