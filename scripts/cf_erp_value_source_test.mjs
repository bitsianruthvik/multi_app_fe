// Run from multi_app_fe: node scripts/cf_erp_value_source_test.mjs
//
// "Values that come from the drawing and from the parts" on the Structure tab's grid (2026-10-12):
// a value a formula gives says where it comes from — worked out, from the drawing — and can be
// typed over; a value typed over a calculated one is marked, its tooltip gives the calculated
// value, and one click goes back to it. Also the words (lib/valueSource) and the new list in
// "Why these values" (lib/valueReasons). DOM-level; it does not replace a look in a browser.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MouseEvent', 'KeyboardEvent', 'Event']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const built = await build({
  alias: { '@shared/ui': resolve('src/shared/ui/SheetGrid.tsx') },
  stdin: {
    contents: `export * from './src/apps/cf_erp/components/Bom/BomGrid'; export * from './src/apps/cf_erp/components/Bom/bomArrangement'; export * from './src/apps/cf_erp/components/Bom/bomModel';
      export * from './src/apps/cf_erp/lib/valueSource'; export * as reasons from './src/apps/cf_erp/lib/valueReasons'; export * as values from './src/apps/cf_erp/components/Values/valuesModel';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `value-source-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };

/* ---------------------------------------------------------------------------
 * The words
 * ------------------------------------------------------------------------ */
await check('worked out: the marker, the label and a tooltip that says it can be typed over', () => {
  const k = m.sourceMark({ from: 'calculated', calculated: null, noCalc: null }, true);
  assert.deepEqual([k.from, k.label, k.title, k.canGoBack], ['calculated', 'worked out', 'Worked out — type over it to set it by hand.', false]);
  assert.equal(m.sourceMark({ from: 'calculated', calculated: null, noCalc: null }, false).title, 'Worked out.');
});
await check('from the drawing says so', () => {
  const k = m.sourceMark({ from: 'drawing', calculated: null, noCalc: null }, true);
  assert.deepEqual([k.label, k.title], ['from the drawing', 'From the drawing — type over it to set it by hand.']);
});
await check('typed by hand: the tooltip gives the calculated value and the way back', () => {
  const k = m.sourceMark({ from: 'typed', calculated: '80.280 m', noCalc: null }, true);
  assert.equal(k.title, 'Typed by hand — the calculated value is 80.280 m. Click to go back.');
  assert.equal(k.canGoBack, true);
  const frozen = m.sourceMark({ from: 'typed', calculated: '80.280 m', noCalc: null }, false);
  assert.equal(frozen.title, 'Typed by hand — the calculated value is 80.280 m.');
  assert.equal(frozen.canGoBack, false);
});
await check('typed where nothing is calculated yet says what the formula waits for', () => {
  assert.equal(m.sourceMark({ from: 'typed', calculated: null, noCalc: 'waiting for Web plate · DRAWN_HOLES' }, true).title,
    'Typed by hand — nothing is calculated here yet (waiting for Web plate · DRAWN_HOLES). Click to take the typed value away.');
});
await check('a value no formula gives has no marker', () => {
  assert.equal(m.sourceMark(null, true), null);
  assert.equal(m.sourceMark({ from: null }, true), null);
});
await check('the same is read off a resolved specification (a record\'s own page)', () => {
  assert.deepEqual(m.sourceOfDerived({ source: 'typed', overridable: true, calculated: { raw: 80.28, display: '80.280 m' } }), { from: 'typed', calculated: '80.280 m', noCalc: null });
  assert.deepEqual(m.sourceOfDerived({ source: 'typed', overridable: true, calculated: null, waiting: ['TF · DRAWN_HOLES'] }), { from: 'typed', calculated: null, noCalc: 'waiting for TF · DRAWN_HOLES' });
  assert.deepEqual(m.sourceOfDerived({ source: 'drawing', overridable: true }), { from: 'drawing', calculated: null, noCalc: null });
  assert.equal(m.sourceOfDerived(undefined), null);
});
await check('a cell takes its column\'s source unless it says its own (the compact values view)', () => {
  const view = { editable: true, optionLists: {} };
  const col = { code: 'WEIGHT', name: 'Weight', dataType: 'number', unit: 'kg', decimals: 3, rule: 'defaulted', required: false, from: 'calculated', editable: true };
  const row = { id: 1, cells: {} };
  assert.equal(m.values.effectiveCell(view, col, row, { defaultDisplay: '10.000 kg' }, true).from, 'calculated');
  const typed = m.values.effectiveCell(view, col, row, { input: '12', from: 'typed', calculated: '10.000 kg' }, true);
  assert.deepEqual([typed.from, typed.calculated, typed.editable], ['typed', '10.000 kg', true]);
  assert.equal(m.values.effectiveCell(view, col, row, { from: null }, true).from, null);
});

/* ---------------------------------------------------------------------------
 * The grid
 * ------------------------------------------------------------------------ */
const node = (id, children = [], more = {}) => ({ id, key: `k${id}`, name: `Row ${id}`, code: null, kind: 'temporary', status: 'draft', depth: 1, quantity: 1, total: 1, lineId: id * 10, lineNo: id * 10, position: 1, role: null, selection: null, resolved: true, flow: null, bom: null, children, ...more });
const tree = node(1, [node(2), node(3), node(4), node(5)], { lineId: null, depth: 0 });
const rows = m.arrangedRows(tree, new Set(['k1', 'k2', 'k3', 'k4', 'k5']), m.NO_PENDING);
// One group: SAW is worked out for most rows (the column says so); row 3 typed over it, row 4's comes from its drawing,
// row 5 typed where nothing is calculated; LEN is an ordinary typed value; FIXED is calculated and cannot be typed over.
const view = {
  editable: true, optionLists: {},
  groups: [{
    columns: [
      { code: 'LEN', name: 'Length', dataType: 'number', rule: 'entered', required: false, editable: true },
      { code: 'SAW', name: 'SAW weld length', dataType: 'number', unit: 'm', rule: 'defaulted', required: true, from: 'calculated', editable: true },
      { code: 'FIXED', name: 'Cut length', dataType: 'number', rule: 'calculated', required: false, from: 'calculated', editable: false, why: 'Worked out by formula X from this item’s other values.' },
    ],
    rows: [
      { id: 1, cells: { LEN: { input: '100' }, SAW: { defaultDisplay: '48.000 m' }, FIXED: { display: '5' } } },
      { id: 2, cells: { LEN: { input: '200' }, SAW: { defaultDisplay: '46.600 m' }, FIXED: { display: '6' } } },
      { id: 3, cells: { LEN: { input: '300' }, SAW: { input: '50', from: 'typed', calculated: '48.000 m' }, FIXED: { display: '7' } } },
      { id: 4, cells: { LEN: { input: '400' }, SAW: { defaultDisplay: '12.190 m', from: 'drawing' }, FIXED: { display: '8' } } },
      { id: 5, cells: { LEN: { input: '500' }, SAW: { input: '9', from: 'typed', noCalc: 'waiting for flanges below this row' }, FIXED: { display: '9' } } },
    ],
  }],
};
let writes = [];
const props = { rows, view, pending: m.NO_PENDING, busy: false, canEdit: () => true, canEditValues: () => true,
  onWrites: (w) => { writes = w; }, onMove: () => {}, dropRefusal: () => null, onToggle: () => {}, trailingCell: () => null, flowCell: () => null, markOf: () => null, placeholderOf: () => null };
const root = createRoot(document.getElementById('app'));
const { MemoryRouter } = await import('react-router-dom');
const render = (p = props) => React.act(() => root.render(React.createElement(MemoryRouter, { initialEntries: ['/acme/cf_erp/orders/1?tab=bom'] }, React.createElement(m.BomGrid, p))));
const cellKey = (r, key) => document.querySelector(`[data-cell^="${r}:"][data-col-key="${key}"]`);
const fire = async (el, type, init = {}) => React.act(() => el.dispatchEvent(type.startsWith('key') ? new KeyboardEvent(type, { bubbles: true, ...init }) : new MouseEvent(type, { bubbles: true, ...init })));
await render();

await check('a worked-out value shows the calculated number, a small marker, and can be typed over', () => {
  const c = cellKey(0, 'SAW');
  assert.match(c.textContent, /48\.000 m/);
  assert.equal(c.getAttribute('data-state'), 'calculated');
  assert.equal(c.getAttribute('aria-readonly'), 'false');
  const mark = c.querySelector('[data-testid="value-source"]');
  assert.equal(mark.getAttribute('data-source'), 'calculated');
  assert.equal(c.getAttribute('title'), 'Worked out — type over it to set it by hand.');
});
await check('a value from the drawing is marked as such', () => {
  const c = cellKey(3, 'SAW');
  assert.equal(c.getAttribute('data-state'), 'drawing');
  assert.equal(c.querySelector('[data-testid="value-source"]').getAttribute('data-source'), 'drawing');
  assert.equal(c.getAttribute('title'), 'From the drawing — type over it to set it by hand.');
  assert.notEqual(c.querySelector('[data-testid="value-source"]').textContent, cellKey(0, 'SAW').querySelector('[data-testid="value-source"]').textContent, 'the two markers look different');
});
await check('a hand-typed override has its own marker, in the stronger weight, with the calculated value in the tooltip', () => {
  const c = cellKey(2, 'SAW');
  assert.match(c.textContent, /50/);
  assert.equal(c.getAttribute('data-state'), 'typed');
  assert.equal(c.getAttribute('data-tone'), 'strong');
  assert.equal(c.getAttribute('title'), 'Typed by hand — the calculated value is 48.000 m. Click to go back.');
  const button = c.querySelector('button[data-testid="value-typed"]');
  assert.ok(button, 'the marker is a button');
  assert.equal(button.getAttribute('title'), 'Typed by hand — the calculated value is 48.000 m. Click to go back.');
  assert.match(button.getAttribute('aria-label'), /^SAW weld length of Row 3: Typed by hand/);
});
await check('one click on it goes back to the calculated value: the cell is emptied, nothing else is written', async () => {
  writes = [];
  await fire(cellKey(2, 'SAW').querySelector('button[data-testid="value-typed"]'), 'click');
  assert.equal(writes.length, 1);
  assert.deepEqual([writes[0].row.node.id, writes[0].code, writes[0].text, writes[0].saved], [3, 'SAW', '', '50']);
  assert.equal(document.querySelectorAll('input').length, 0, 'the click does not open the editor');
});
await check('typed where nothing is calculated: the tooltip says what the formula waits for', () => {
  assert.equal(cellKey(4, 'SAW').getAttribute('title'), 'Typed by hand — nothing is calculated here yet (waiting for flanges below this row). Click to take the typed value away.');
});
await check('a calculated value that cannot be typed over keeps its own reason and is still read-only', () => {
  const c = cellKey(0, 'FIXED');
  assert.equal(c.getAttribute('aria-readonly'), 'true');
  assert.equal(c.getAttribute('title'), 'Worked out by formula X from this item’s other values.');
  assert.ok(c.querySelector('[data-testid="value-source"]'));
  assert.equal(c.querySelector('button'), null);
});
await check('an ordinary typed value has no marker at all', () => {
  assert.equal(cellKey(0, 'LEN').querySelector('[data-mark]'), null);
  assert.equal(cellKey(0, 'LEN').getAttribute('data-state'), null);
});
await check('typing over a worked-out value writes the number as usual', async () => {
  writes = [];
  await fire(cellKey(0, 'SAW'), 'click');
  await fire(cellKey(0, 'SAW'), 'keydown', { key: '5' });
  await fire(document.querySelector('input'), 'keydown', { key: 'Enter' });
  assert.deepEqual([writes[0].row.node.id, writes[0].code, writes[0].text], [1, 'SAW', '5']);
});
await check('a cell being changed says "changed", not where its saved value came from', async () => {
  await render({ ...props, pending: { ...m.NO_PENDING, values: { 3: { SAW: '' }, 1: { SAW: '51' } } } });
  assert.equal(cellKey(2, 'SAW').querySelector('[data-mark]'), null);
  assert.equal(cellKey(2, 'SAW').getAttribute('data-tone'), 'warning');
  assert.match(cellKey(2, 'SAW').textContent, /48\.000 m/, 'going back shows the calculated value at once');
  assert.equal(cellKey(0, 'SAW').getAttribute('data-tone'), 'warning');
  await render();
});
await check('on a line that no longer changes the override is still marked, without the way back', async () => {
  await render({ ...props, view: { ...view, editable: false } });
  const c = cellKey(2, 'SAW');
  assert.equal(c.getAttribute('data-state'), 'typed');
  assert.equal(c.querySelector('button'), null);
  assert.equal(c.querySelector('[data-testid="value-typed"]').getAttribute('title'), 'Typed by hand — the calculated value is 48.000 m.');
  await render();
});
await check('a catalog BOM (resolved specifications) marks its values the same way', async () => {
  const s = (code, more) => ({ spec: { id: 1, code, name: code, dataType: 'number', unit: 'kg', decimals: 3 }, captureAt: 'item', applicable: true, capturable: true,
    rule: { assignmentId: 1, valueRule: 'defaulted', isRequired: false, formula: { id: 1, code: 'F', name: 'F', expression: 'X', version: 1 }, sortOrder: 1 },
    definedAt: { level: 'Variant', subjectType: 'classification', subjectId: 1, code: 'P', name: 'P' }, overrides: [], status: 'set', ...more });
  const records = new Map([[1, { resolution: { mode: 'item', chain: [], specs: [
    s('WEIGHT', { value: { raw: 12, display: '12.000 kg', source: 'entered', from: 'here' }, derived: { source: 'typed', overridable: true, calculated: { raw: 10, display: '10.000 kg' } } }),
  ], missingRequired: [], problems: [], unassignedValues: [] } }]]);
  await render({ ...props, view: null, records, recordIds: [1], rows: rows.slice(0, 1) });
  const c = cellKey(0, 'WEIGHT');
  assert.equal(c.getAttribute('data-state'), 'typed');
  assert.equal(c.getAttribute('title'), 'Typed by hand — the calculated value is 10.000 kg. Click to go back.');
  await render();
});

/* ---------------------------------------------------------------------------
 * "Why these values"
 * ------------------------------------------------------------------------ */
const variant = { level: 'Variant', code: 'GIRDER_SEGMENT', name: 'Girder segment' };
const mig = { id: 2, code: 'MIGWELD', name: 'MIG welding' };
const flow = { id: 5, code: 'GIRDER-SEGMENT', name: 'Girder segment' };
const asked = (code, name, reason, more = {}) => ({ code, name, required: true, valueRule: 'defaulted', ...more, reason });
const data = {
  record: { id: 1, code: null, name: 'Segment', kind: 'temporary' }, flow, frozen: null, notAsked: [],
  values: [
    asked('MIG_WELD_LENGTH', 'MIG weld length', { kind: 'typedOver', value: '79.500 m', calculated: '80.280 m', from: 'calculated', at: variant, readBy: [mig], formula: { code: 'ASSY_MIG_WELD_LENGTH', name: 'MIG' } }),
    asked('HOLES', 'Holes', { kind: 'typedOver', value: '8', calculated: '10', from: 'drawing', at: variant, readBy: [] }),
    asked('STUDS', 'Studs', { kind: 'typedOver', value: '120', calculated: null, from: null, waiting: ['shear studs below this row'], at: variant, readBy: [] }),
    asked('SAW_WELD_LENGTH', 'SAW weld length', { kind: 'derived', how: 'rollup', at: variant, readBy: [mig], overridable: true }),
    asked('HOLE_DIA', 'Hole diameter', { kind: 'derived', how: 'drawing', at: variant, readBy: [], overridable: true }),
    asked('COATS', 'Coats', { kind: 'flow', flow, operations: [mig] }, { valueRule: 'entered' }),
  ],
};
await check('why these values: the typed-over ones are a list of their own, between "set by hand" and "worked out"', () => {
  const groups = m.reasons.reasonGroups(data);
  assert.deepEqual(groups.map((g) => g.key), ['flow', 'typedOver', 'derived']);
  const g = groups.find((x) => x.key === 'typedOver');
  assert.equal(g.title, 'Typed over a calculated value');
  assert.equal(g.rows.length, 3);
  assert.match(g.hint, /Empty the cell on the Structure tab to go back/);
});
await check('…each says what was typed and what the calculated value is', () => {
  const rowsOf = m.reasons.reasonGroups(data).find((x) => x.key === 'typedOver').rows;
  assert.equal(rowsOf[0].text, 'Typed by hand: 79.500 m — the calculated value is 80.280 m — read by MIG welding (MIGWELD)');
  assert.equal(rowsOf[1].text, 'Typed by hand: 8 — the calculated value is 10 (from its drawing)');
  assert.equal(rowsOf[2].text, 'Typed by hand: 120 — nothing is calculated yet (waiting for shear studs below this row)');
});
await check('…a worked-out one says it can be typed over; one from the drawing says so', () => {
  const rowsOf = m.reasons.reasonGroups(data).find((x) => x.key === 'derived').rows;
  assert.equal(rowsOf[0].text, 'Worked out (rolled up from its BOM) — it can be typed over — read by MIG welding (MIGWELD)');
  assert.equal(rowsOf[1].text, 'Worked out (from its drawing) — it can be typed over');
});
await check('…and the summary counts them', () => assert.equal(m.reasons.reasonSummary(data), '6 values asked: 1 from its flow, 3 typed over a calculated value, 2 worked out.'));

await React.act(() => root.render(null));
await React.act(() => root.unmount());
dom.window.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
