// Run from multi_app_fe: node scripts/cf_erp_list_value_test.mjs
// LIST values (HOLE_SET, 2026-11-01): the pure rules (lib/listValue.ts — the server's lib/listSpec.js mirrored), the rows
// dialog, the value input's list button (record values panel), the order grid's list cell, and the specification form's
// columns editor — in jsdom.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const stubCore = { name: 'stub-core', setup(b) {
  b.onResolve({ filter: /^@core\/(api\/client|contexts\/AuthContext)$/ }, (x) => ({ path: x.path, namespace: 'stub' }));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, (x) => ({ loader: 'js', resolveDir: process.cwd(), contents: x.path.endsWith('client') ? 'export async function apiFetch(path, opts) { return globalThis.__apiFetch(path, opts); }' : 'export const useAuth = () => ({ user: { uiPermissions: ["*"] } });' }));
} };
const bundle = async (name, code) => {
  const out = await build({ stdin: { contents: code, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
    alias: { '@shared/ui': resolve('src/shared/ui/SheetGrid.tsx') }, plugins: [stubCore] });
  const file = resolve(cache, `${name}-${process.pid}.mjs`);
  await writeFile(file, out.outputFiles[0].text);
  try { return await import(pathToFileURL(file)); } finally { await unlink(file); }
};

let passed = 0, failed = 0;
const check = (label, fn) => { try { fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.message}`); } };
const checkAsync = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack ?? e.message}`); } };

const L = await bundle('list-lib', "export * from './src/apps/cf_erp/lib/listValue';");
const HOLE_SET = { columns: [
  { code: 'DIA', name: 'Diameter', kind: 'number', unit: 'mm', required: true },
  { code: 'COUNT', name: 'Holes', kind: 'number', integer: true, required: true },
  { code: 'KIND', name: 'Kind', kind: 'word', options: ['drilled', 'punched', 'countersunk', 'tapped', 'reamed'] },
  { code: 'DEPTH', name: 'Through', kind: 'number', unit: 'mm', blank: "the part's thickness" },
] };
const cols = L.listColumns(HOLE_SET);
const typedRows = [{ DIA: 22, COUNT: 12, KIND: 'drilled' }, { DIA: 26, COUNT: 4, KIND: 'countersunk', DEPTH: 40 }];

// ── 1. the pure rules ────────────────────────────────────────────────────────────────────────────────────────────────
check('the summary is the server\'s: "12 × Ø22 · 4 × Ø26 countersunk (40 deep)"; "none" for an empty list; "N rows" for another list', () => {
  assert.equal(L.listSummary(typedRows, cols), '12 × Ø22 · 4 × Ø26 countersunk (40 deep)');
  assert.equal(L.listSummary(typedRows), '12 × Ø22 · 4 × Ø26 countersunk (40 deep)', 'read from the rows without the columns');
  assert.equal(L.listSummary([], cols), 'none');
  assert.equal(L.listSummary([{ A: 1 }, { A: 2 }]), '2 rows');
  assert.equal(L.listSummary(null), null);
});

check('a list carried as JSON text reads back; anything else is not a list', () => {
  assert.deepEqual(L.parseList(JSON.stringify(typedRows)), typedRows);
  assert.equal(L.parseList(''), null); assert.equal(L.parseList('[object Object],[object Object]'), null); assert.equal(L.parseList('{"x":[1]}'), null);
  assert.deepEqual(L.parseList('[]'), []);
});

check('the form rows check like the server: empty rows dropped, numbers made numbers, an option matched ignoring case, a blank optional cell left out', () => {
  const out = L.fromDraft([{ DIA: '22', COUNT: '12', KIND: 'Drilled', DEPTH: '' }, { DIA: '', COUNT: '', KIND: '', DEPTH: '' }, { DIA: '26', COUNT: '4', KIND: 'countersunk', DEPTH: '40' }], cols);
  assert.deepEqual(out.rows, typedRows);
});

check('the form says what is wrong and where: a needed cell, a whole number, an option, a negative', () => {
  assert.deepEqual(L.fromDraft([{ DIA: '', COUNT: '3', KIND: '', DEPTH: '' }], cols), { problem: 'Row 1: Diameter is needed.', row: 0, code: 'DIA' });
  assert.equal(L.fromDraft([{ DIA: '22', COUNT: '2.5', KIND: '', DEPTH: '' }], cols).problem, 'Row 1: Holes is a whole number.');
  assert.match(L.fromDraft([{ DIA: '22', COUNT: '2', KIND: 'burnt', DEPTH: '' }], cols).problem, /not one of drilled, punched/);
  assert.equal(L.fromDraft([{ DIA: '-1', COUNT: '2', KIND: '', DEPTH: '' }], cols).problem, 'Row 1: Diameter cannot be below 0.');
  assert.deepEqual(L.fromDraft([], cols), { rows: [] }, 'no rows is a value: no holes');
});

check('rows round-trip through the form', () => {
  assert.deepEqual(L.fromDraft(L.toDraft(typedRows, cols), cols).rows, typedRows);
  assert.deepEqual(L.blankRow(cols), { DIA: '', COUNT: '', KIND: '', DEPTH: '' });
});

check('sameList compares rows in order and cells by value', () => {
  assert.equal(L.sameList(typedRows, JSON.parse(JSON.stringify(typedRows))), true);
  assert.equal(L.sameList(typedRows, [...typedRows].reverse()), false);
  assert.equal(L.sameList([{ DIA: 22 }], [{ DIA: 22.0000001 }]), true);
  assert.equal(L.sameList(null, []), false);
});

check('a piece\'s list state: following the drawing, typed over it (with the drawing\'s set), or typed with nothing under it', () => {
  const drawn = [{ DIA: 22, COUNT: 16, KIND: 'drilled' }];
  const follows = L.listState({ value: { raw: drawn, display: '16 × Ø22', source: 'defaulted' }, derived: { source: 'drawing', overridable: true } });
  assert.equal(follows.typed, null); assert.deepEqual(follows.drawing, { rows: drawn, display: '16 × Ø22', from: 'drawing' });
  const over = L.listState({ value: { raw: typedRows, display: 'x', source: 'entered' }, derived: { source: 'typed', calculated: { raw: drawn, display: '16 × Ø22' }, calculatedFrom: 'drawing' } });
  assert.deepEqual(over.typed, typedRows); assert.deepEqual(over.drawing.rows, drawn);
  const alone = L.listState({ value: { raw: typedRows, display: 'x', source: 'entered' } });
  assert.deepEqual(alone.typed, typedRows); assert.equal(alone.drawing, null);
});

check('valueWords never says [object Object]: a list\'s summary, a chart\'s rows, Yes/No', () => {
  assert.equal(L.valueWords(typedRows), '12 × Ø22 · 4 × Ø26 countersunk (40 deep)');
  assert.equal(L.valueWords({ x: [1, 2, 3], v: [1, 2, 3] }), '3 rows');
  assert.equal(L.valueWords(true), 'Yes'); assert.equal(L.valueWords(null), ''); assert.equal(L.valueWords(12.5), '12.5');
});

check('the setup form\'s columns become the server\'s config (codes upper case, options only on words, whole number only on numbers) and are checked', () => {
  const cfg = L.listConfigOf([
    { code: 'dia', name: 'Diameter', kind: 'number', unit: 'mm', required: true, optionsText: 'x' },
    { code: 'COUNT', name: 'Holes', kind: 'number', integer: true, required: true },
    { code: 'KIND', name: 'Kind', kind: 'word', optionsText: 'drilled, punched,, countersunk', integer: true },
    { code: 'DEPTH', name: 'Through', kind: 'number', unit: 'mm', blank: " the part's thickness " },
  ]);
  assert.deepEqual(cfg.columns[1], HOLE_SET.columns[1]);
  assert.deepEqual(cfg.columns[0], { code: 'DIA', name: 'Diameter', kind: 'number', unit: 'mm', required: true });
  assert.deepEqual(cfg.columns[2], { code: 'KIND', name: 'Kind', kind: 'word', options: ['drilled', 'punched', 'countersunk'] });
  assert.deepEqual(cfg.columns[3], { code: 'DEPTH', name: 'Through', kind: 'number', unit: 'mm', blank: "the part's thickness" });
  assert.equal(L.listConfigProblem(cfg), null);
  assert.match(L.listConfigProblem(L.listConfigOf([{ code: 'A' }, { code: 'a' }])), /twice/);
  assert.match(L.listConfigProblem(L.listConfigOf([{ code: '1X' }])), /not a column code/);
  assert.match(L.listConfigProblem({ columns: [] }), /at least one column/);
});

// ── 2. jsdom ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MouseEvent', 'KeyboardEvent', 'Event', 'File', 'FileReader', 'Blob', 'HTMLInputElement', 'SVGElement']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const calls = [];
globalThis.__apiFetch = async (path, opts) => { calls.push({ path, opts }); return globalThis.__reply?.(path, opts) ?? null; };
const C = await bundle('list-dom', `
  export { ListValueDialog } from './src/apps/cf_erp/components/Values/ListValueDialog';
  export { SpecValueInput } from './src/apps/cf_erp/components/SpecValueInput';
  export { SpecDialog } from './src/apps/cf_erp/components/SpecDialog';
`);
const act = (fn) => React.act(fn);
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const root = createRoot(document.getElementById('app'));
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const typeInto = async (el, value) => act(async () => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
const click = (el) => act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
const cell = (row, code) => qa('[data-testid="list-row"]')[row].querySelector(`input[data-col="${code}"]`);

await checkAsync('the rows dialog: one row per entry and a cell per column (the blank hint as placeholder); add a row, fill it, Save hands back the rows', async () => {
  let saved = null;
  await act(() => root.render(React.createElement(C.ListValueDialog, { open: true, onClose: () => {}, title: 'Hole set', columns: cols, typed: typedRows, onSave: (r) => { saved = r; } })));
  await flush();
  assert.equal(qa('[data-testid="list-row"]').length, 2);
  assert.equal(cell(0, 'DIA').value, '22'); assert.equal(cell(1, 'DEPTH').value, '40');
  assert.equal(cell(0, 'DEPTH').getAttribute('placeholder'), "the part's thickness");
  await click(q('[data-testid="list-add-row"]'));
  assert.equal(qa('[data-testid="list-row"]').length, 3);
  await typeInto(cell(2, 'DIA'), '18');
  assert.match(q('[data-testid="list-problem"]').textContent, /Row 3: Holes is needed/);
  assert.ok(q('[data-testid="list-save"]').disabled, 'no save while a row is wrong');
  await typeInto(cell(2, 'COUNT'), '6');
  assert.equal(q('[data-testid="list-problem"]'), null);
  assert.match(q('[data-testid="list-summary"]').textContent, /6 × Ø18/);
  await click(q('[data-testid="list-save"]'));
  assert.deepEqual(saved, [...typedRows, { DIA: 18, COUNT: 6 }]);
  await act(() => root.render(null));
});

await checkAsync('typed over the drawing: the drawing\'s set shows beside it, "Back to the drawing" clears, remove row works', async () => {
  let back = 0, saved = null;
  const drawing = { rows: [{ DIA: 22, COUNT: 16, KIND: 'drilled' }], display: '16 × Ø22', from: 'drawing' };
  await act(() => root.render(React.createElement(C.ListValueDialog, { open: true, onClose: () => {}, title: 'Hole set', columns: cols, typed: typedRows, drawing, onSave: (r) => { saved = r; }, onBack: () => { back++; } })));
  await flush();
  assert.match(q('[data-testid="list-drawing"]').textContent, /The drawing's set:16 × Ø22/);
  assert.ok(q('[data-testid="list-copy-drawing"]'), 'they differ: copy offered');
  await click(q('button[aria-label="Remove row 2"]'));
  assert.equal(qa('[data-testid="list-row"]').length, 1);
  await click(q('[data-testid="list-back"]'));
  assert.equal(back, 1); assert.equal(saved, null);
  await act(() => root.render(null));
});

await checkAsync('following the drawing: the form starts from the drawing\'s set; no "Back to the drawing" (nothing typed)', async () => {
  const drawing = { rows: [{ DIA: 22, COUNT: 16, KIND: 'drilled' }], display: '16 × Ø22', from: 'drawing' };
  await act(() => root.render(React.createElement(C.ListValueDialog, { open: true, onClose: () => {}, title: 'Hole set', columns: cols, typed: null, drawing, onSave: () => {} })));
  await flush();
  assert.equal(cell(0, 'COUNT').value, '16');
  assert.match(q('[data-testid="list-drawing"]').textContent, /the same as below/);
  assert.equal(q('[data-testid="list-back"]'), null);
  await act(() => root.render(null));
});

await checkAsync('the record values input: a list is a button with its summary (or the drawing\'s set, said so) that opens the rows; Save gives the rows as JSON, Back gives ""', async () => {
  let value = JSON.stringify(typedRows); const changes = [];
  const drawing = { rows: [{ DIA: 22, COUNT: 16, KIND: 'drilled' }], display: '16 × Ø22', from: 'drawing' };
  const render = () => act(() => root.render(React.createElement(C.SpecValueInput, { dataType: 'list', tableConfig: HOLE_SET, spec: { id: 1, code: 'HOLE_SET', name: 'Hole set' }, value, listDrawing: drawing, onChange: (v) => { changes.push(v); value = v; } })));
  await render(); await flush();
  assert.equal(q('[data-testid="list-trigger"]').textContent, '12 × Ø22 · 4 × Ø26 countersunk (40 deep)');
  await click(q('[data-testid="list-trigger"]'));
  await typeInto(cell(0, 'COUNT'), '10');
  await click(q('[data-testid="list-save"]'));
  assert.deepEqual(JSON.parse(changes.at(-1)), [{ DIA: 22, COUNT: 10, KIND: 'drilled' }, typedRows[1]]);
  await render(); await flush();
  await click(q('[data-testid="list-trigger"]'));
  await click(q('[data-testid="list-back"]'));
  assert.equal(changes.at(-1), '');
  await render(); await flush();
  assert.equal(q('[data-testid="list-trigger"]').textContent, '16 × Ø22 (from the drawing)');
  await act(() => root.render(null));
});

await checkAsync('Setup › Specifications: a new list spec is made with its columns editor and sends { columns } (no order-level switch)', async () => {
  calls.length = 0;
  globalThis.__reply = (path) => (path.endsWith('/specifications') ? { id: 9, code: 'HOLE_SET', name: 'Hole set', dataType: 'list' } : null);
  await act(() => root.render(React.createElement(C.SpecDialog, { open: true, onClose: () => {}, onSaved: () => {}, existing: null, meta: { dataTypes: ['number', 'list'], measurementTypes: [] }, canManage: true })));
  await flush();
  // Pick "List of rows" in the data type select.
  const typeSelect = qa('[role="combobox"]')[0];
  await act(async () => { typeSelect.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })); });
  await click(qa('[role="option"]').find((o) => o.textContent === 'List of rows'));
  assert.ok(q('[data-testid="list-columns"]'), 'the columns editor');
  assert.equal(document.body.textContent.includes('Can be set for a whole order'), false);
  await typeInto(q('input[aria-label="Column 1 code"]'), 'dia');
  await typeInto(q('input[aria-label="Column 1 name"]'), 'Diameter');
  const inputs = qa('input');
  await typeInto(inputs.find((i) => i.closest('.MuiFormControl-root')?.textContent.startsWith('Code') && !i.getAttribute('aria-label')), 'HOLE_SET');
  await typeInto(inputs.find((i) => i.closest('.MuiFormControl-root')?.querySelector('label')?.textContent.startsWith('Name') && !i.getAttribute('aria-label')), 'Hole set');
  await click(qa('button').find((b) => b.textContent === 'Add a column'));
  await click(qa('button').find((b) => b.textContent === 'Create'));
  assert.equal(calls.length, 0, 'not sent: column 2 has no code');
  assert.match(q('[data-testid="list-columns-problem"]').textContent, /not a column code/);
  await click(q('button[aria-label="Remove column 2"]'));
  await click(qa('button').find((b) => b.textContent === 'Create'));
  await flush();
  const sent = calls.find((c) => c.path.endsWith('/specifications'));
  assert.ok(sent, 'posted');
  const body = typeof sent.opts.body === 'string' ? JSON.parse(sent.opts.body) : sent.opts.body;
  assert.equal(body.dataType, 'list');
  assert.deepEqual(body.tableConfig, { columns: [{ code: 'DIA', name: 'Diameter', kind: 'number' }] });
  assert.equal('orderLevel' in body, false);
  await act(() => root.render(null));
});

await checkAsync('the order grid: a list cell shows its summary and its marker; a click opens its rows (read from the record), Save writes the rows as JSON, Back writes ""', async () => {
  const G = await bundle('list-grid', "export { BomGrid } from './src/apps/cf_erp/components/Bom/BomGrid'; export { NO_PENDING } from './src/apps/cf_erp/components/Bom/bomModel'; export { arrangedRows } from './src/apps/cf_erp/components/Bom/bomArrangement';");
  const { MemoryRouter } = await import('react-router-dom');
  const node = (id, children = [], more = {}) => ({ id, key: `k${id}`, name: `Plate ${id}`, code: null, kind: 'temporary', status: 'draft', depth: 1, quantity: 1, total: 1, lineId: id * 10, lineNo: id * 10, position: 1, role: null, selection: null, resolved: true, flow: null, bom: null, uom: 'nos', children, ...more });
  const tree = node(1, [node(2), node(3)], { lineId: null, depth: 0, name: 'Girder' });
  const rows = G.arrangedRows(tree, new Set(['k1', 'k2', 'k3']), G.NO_PENDING);
  const view = { editable: true, optionLists: {}, groups: [{ columns: [{ code: 'HOLE_SET', name: 'Hole set', dataType: 'list', rule: 'defaulted', editable: true }], rows: [
    { id: 1, cells: {} },
    { id: 2, cells: { HOLE_SET: { defaultDisplay: '16 × Ø22', from: 'drawing' } } },
    { id: 3, cells: { HOLE_SET: { input: JSON.stringify(typedRows), from: 'typed', calculated: '16 × Ø22' } } },
  ] }] };
  let writes = [];
  globalThis.__reply = (path) => (path.endsWith('/records/3/specs') ? { mode: 'item', chain: [], missingRequired: [], unassignedValues: [], specs: [{
    spec: { id: 5, code: 'HOLE_SET', name: 'Hole set', dataType: 'list', unit: null, decimals: null, tableConfig: HOLE_SET }, captureAt: 'item', applicable: true, capturable: true,
    rule: { valueRule: 'defaulted', isRequired: false, formula: null }, value: { raw: typedRows, display: 'x', source: 'entered', from: 'here' },
    derived: { source: 'typed', overridable: true, calculated: { raw: [{ DIA: 22, COUNT: 16, KIND: 'drilled' }], display: '16 × Ø22' }, calculatedFrom: 'drawing' } }] } : null);
  const props = { rows, view, pending: G.NO_PENDING, busy: false, canEdit: () => true, canEditValues: () => true, onWrites: (w) => { writes = w; }, onMove: () => {}, dropRefusal: () => null,
    onToggle: () => {}, trailingCell: () => null, flowCell: () => null, markOf: () => null, placeholderOf: () => null,
    loadSpecs: async (id) => { calls.push({ path: `/records/${id}/specs` }); return globalThis.__reply(`/records/${id}/specs`); } };
  await act(() => root.render(React.createElement(MemoryRouter, null, React.createElement(G.BomGrid, props))));
  await flush();
  const at = (r) => document.querySelector(`[data-cell^="${r}:"][data-col-key="HOLE_SET"]`);
  assert.match(at(1).textContent, /16 × Ø22/, 'following the drawing: its set');
  assert.match(at(2).textContent, /12 × Ø22 · 4 × Ø26 countersunk \(40 deep\)/, 'typed: its own rows, never [object Object]');
  assert.equal(at(2).getAttribute('data-state'), 'typed');
  assert.equal(at(1).getAttribute('data-state'), 'drawing');
  await act(async () => { at(2).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  await flush();
  assert.ok(calls.some((c) => c.path.endsWith('/records/3/specs')), 'the rows are read from the record');
  assert.equal(qa('[data-testid="list-row"]').length, 2);
  assert.match(q('[data-testid="list-drawing"]').textContent, /16 × Ø22/);
  await typeInto(cell(1, 'COUNT'), '8');
  await click(q('[data-testid="list-save"]'));
  assert.equal(writes.length, 1); assert.equal(writes[0].code, 'HOLE_SET'); assert.equal(writes[0].row.node.id, 3);
  assert.deepEqual(JSON.parse(writes[0].text)[1], { DIA: 26, COUNT: 8, KIND: 'countersunk', DEPTH: 40 });
  await act(async () => { at(2).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  await flush();
  await click(q('[data-testid="list-back"]'));
  assert.equal(writes[0].text, '', 'back to the drawing empties the cell');
  await act(() => root.render(null));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 50);
