// Run from multi_app_fe: node scripts/cf_erp_standard_drawings_test.mjs
// STANDARD DRAWINGS (init.sql §69, backend routes/standards.js): the words (lineStandardSentence, standardLabel), then
// the real screens in jsdom against mocked routes shaped as the backend answers — the list (number, internal badge,
// version, parts, source link), the detail (the BOM tree with its values and notes, the drawings, "Used on", a part's
// DXF opened in the drawing viewer from the standard's own file route), Add line › From a standard drawing (what it
// sends), Add line with its drawing marked "This is a standard drawing" (the line, then the standard tied to it), the
// line's "From standard …" text, and the banner over a line's structure: Update the standard too / Keep it as it is.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/standard-drawings', pretendToBeVisual: true });
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
dom.window.URL.createObjectURL = () => 'blob:x';
dom.window.URL.revokeObjectURL = () => {};

globalThis.__calls = [];
globalThis.__routes = {};
globalThis.__user = null;
const apiStub = `export async function apiFetch(url, o = {}) {
  const method = o.method || 'GET';
  const path = url.replace(/^\\/api\\/[^/]+\\/cf_erp/, '').split('?')[0];
  globalThis.__calls.push({ method, path, url, body: o.body });
  const h = globalThis.__routes[method + ' ' + path];
  if (!h) throw new Error('API request failed: 404 x - ' + JSON.stringify({ message: 'No mock for ' + method + ' ' + path }));
  const r = await h(o.body, url);
  if (r && r.__status) throw new Error('API request failed: ' + r.__status + ' x - ' + JSON.stringify(r.body));
  return r;
}`;
const authStub = 'export const useAuth = () => ({ user: globalThis.__user });';
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter, Routes, Route } from 'react-router-dom';
      export { React, createRoot, MemoryRouter, Routes, Route };
      export * from './src/apps/cf_erp/api/standards';
      export { default as StandardDrawings, StandardDrawingDetail } from './src/apps/cf_erp/pages/StandardDrawings';
      export { OrderLinesPanel } from './src/apps/cf_erp/components/OrderLinesPanel';
      export { StandardLineBanner } from './src/apps/cf_erp/components/StandardLineBanner';
      export { SECTIONS } from './src/apps/cf_erp/navMeta';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/api\/client$/ }, () => ({ path: 'api', namespace: 'stub' }));
    b.onResolve({ filter: /^@core\/contexts\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'stub' }));
    b.onLoad({ filter: /^api$/, namespace: 'stub' }, () => ({ contents: apiStub, loader: 'js' }));
    b.onLoad({ filter: /^auth$/, namespace: 'stub' }, () => ({ contents: authStub, loader: 'js' }));
    // The two parts of @shared/ui these screens use (its index also pulls in the platform shell).
    b.onResolve({ filter: /^@shared\/ui$/ }, () => ({ path: 'sharedui', namespace: 'stub' }));
    b.onLoad({ filter: /^sharedui$/, namespace: 'stub' }, () => ({
      contents: `export * from ${JSON.stringify(resolve('src/shared/ui/SheetGrid.tsx'))}; export * from ${JSON.stringify(resolve('src/shared/ui/storage.ts'))};`,
      loader: 'ts', resolveDir: process.cwd(),
    }));
  } }],
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error', loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{"VITE_API_HOST":"http://localhost:4000"}' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `standard-drawings-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter, Routes, Route } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { if (process.env.ONLY && !label.includes(process.env.ONLY)) return; try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const app = document.getElementById('app');
let root = null;
const render = async (el, at = '/testco/cf_erp/standard-drawings') => {
  if (root) { await React.act(async () => { root.unmount(); }); root = null; }
  document.querySelectorAll('.MuiDialog-root, .MuiPopover-root, .MuiAutocomplete-popper, .MuiPopper-root').forEach((n) => n.remove());
  app.replaceChildren();
  const host = document.createElement('div'); app.appendChild(host);
  root = createRoot(host);
  await React.act(async () => { root.render(React.createElement(MemoryRouter, { initialEntries: [at] }, el)); await sleep(40); });
};
const settle = async (ms = 50) => { await React.act(async () => { await sleep(ms); }); };
const qa = (id, scope = document) => [...scope.querySelectorAll(`[data-testid="${id}"]`)];
const q1 = (id, scope = document) => scope.querySelector(`[data-testid="${id}"]`);
const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const fire = async (el, type, init = {}) => { await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, ...init })); await sleep(20); }); };
const click = (el) => fire(el, 'click');
const buttonIn = (scope, label) => [...scope.querySelectorAll('button, a, [role="button"]')].find((b) => text(b) === label || text(b).startsWith(label));
const setValue = async (el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await React.act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(10); });
};
const inputLabelled = (scope, label) => {
  const lab = [...scope.querySelectorAll('label')].find((l) => text(l).replace(/\s*\*$/, '') === label);
  return lab ? scope.ownerDocument.getElementById(lab.htmlFor) : null;
};
const setFile = async (input, name, body) => {
  const file = new dom.window.File([body], name, { type: name.endsWith('.pdf') ? 'application/pdf' : 'application/dxf' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await React.act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await sleep(20); });
};
const calls = (method, path) => globalThis.__calls.filter((c) => c.method === method && c.path === path);
const lastCall = (method, path) => calls(method, path).at(-1);
const reset = () => { globalThis.__calls = []; globalThis.__routes = {}; globalThis.__user = null; };

// ── fixtures, shaped as the backend answers ───────────────────────────────────
const V1 = { id: 11, versionNo: 1, rows: 56, parts: 47, weightKg: 54769.566, madeFrom: 'import', fromLineId: null, note: null, createdAt: '2026-10-17T06:00:00Z' };
const RDSO = {
  id: 7, number: 'RDSO/B-11751R3', name: 'RDSO/B-11751R3 — 24.4 m span, 25t loading 2008', description: '24.4 m clear span, composite welded girder', revision: 'R3',
  sourceUrl: 'https://rdso.indianrailways.gov.in/uploads/files1/11751R3%20SERIES.pdf', internal: true, notes: 'RDSO property - internal use only\nBought out, not in the BOM: 2292 × HSFG BOLT',
  drawingId: 900, currentVersionId: 11, createdAt: '2026-10-17T06:00:00Z',
  version: { versionNo: 1, rows: 56, parts: 47, weightKg: 54769.566, madeFrom: 'import', createdAt: '2026-10-17T06:00:00Z' }, versions: 1, files: 36, lines: 2,
};
const EMPTY = { ...RDSO, id: 8, number: 'STD-NEW', name: 'Not filled yet', internal: false, sourceUrl: null, currentVersionId: null, version: null, versions: 0, files: 0, lines: 0 };
const tree = [
  { key: 'r1', rowId: 1, parentKey: null, depth: 0, lineNo: null, role: null, name: 'Bridge span', kind: 'row', definition: { id: 6095, code: 'SPAN', name: 'Bridge span' }, quantity: 1, total: 1, mark: null, notes: null, sizeText: null, grade: null, weightKg: 54769.566, values: [], fileId: null },
  { key: 'l2', rowId: 2, parentKey: 'r1', depth: 1, lineNo: 10, role: 'Main girder', name: 'Girder line', kind: 'row', definition: null, quantity: 2, total: 2, mark: null, notes: null, sizeText: null, grade: null, weightKg: 22777.8, values: [], fileId: null },
  { key: 'l3', rowId: 3, parentKey: 'l2', depth: 2, lineNo: 10, role: 'Bottom flange', name: 'Bottom flange', kind: 'row', definition: null, quantity: 1, total: 2, mark: 'BF1', notes: 'check one set against the angle before drilling all', sizeText: '36 × 750 × 7925', grade: 'E250', weightKg: 1679.704, values: [{ code: 'THICKNESS', name: 'Thickness', text: '36 mm', source: 'entered' }], fileId: 501 },
  { key: 'l4', rowId: null, parentKey: 'l2', depth: 2, lineNo: 110, role: 'Shear stud', name: 'Shear stud', kind: 'choose', definition: null, quantity: 296, total: 592, mark: null, notes: 'Choose the stud: stud 25 dia x 200 — no catalog stud of this size yet.', sizeText: null, grade: null, weightKg: null, values: [], fileId: null },
];
const DETAIL = {
  ...RDSO, drawing: { id: 900, code: 'DRW-1', number: 'RDSO/B-11751', revision: 'R3', title: 't', url: RDSO.sourceUrl, status: 'issued' },
  versions: [V1], version: V1, report: null, tree,
  files: [{ id: 501, kind: 'part', mark: 'BF1', fileName: 'BF1_36mm_E250.dxf', fileKind: 'dxf', lengthMm: 7925, widthMm: 750, areaMm2: 1, holes: 106, drawingId: 901 }],
  lines: [{ id: 41, lineNo: 1, orderId: 3, orderCode: 'SO-1', orderStatus: 'inquiry', versionNo: 1 }],
};
const DXF = '0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\nOUTLINE\n90\n4\n70\n1\n10\n0\n20\n0\n10\n100\n20\n0\n10\n100\n20\n50\n10\n0\n20\n50\n0\nENDSEC\n0\nEOF\n';
const line = (id, lineNo, more = {}) => ({
  id, lineNo, lineType: 'custom', position: lineNo, quantity: 1, committedDate: null, description: null, notes: null, rate: null, rateBasis: 'tonne',
  item: { id: 1000 + id, code: null, name: 'Bridge span', status: 'draft', kind: 'temporary', uom: 'nos', revision: null },
  design: { id: 6095, code: 'SPAN', name: 'Bridge span' }, bomRevision: null, bom: null, structure: { temporaryItems: 56, unresolvedSelections: 4 },
  release: null, revisesLineId: null, standard: null, ...more,
});
const order = (lines) => ({
  id: 3, code: 'SO-1', orderType: 'customer', title: 't', customer: { id: 1, code: 'C', name: 'Cust' }, customerReference: null, status: 'inquiry',
  receivedOn: null, committedDate: null, confirmedAt: null, deliveryAddress: null, notes: null, overdue: false, allowedTransitions: [], createdAt: '', updatedAt: '',
  lines, revision: 1, total: null,
});

// ── 1. the words ─────────────────────────────────────────────────────────────
await check('standardLabel and the line sentence for each state', () => {
  assert.equal(m.standardLabel({ number: 'RDSO/B-11751R3', versionNo: 2 }), 'RDSO/B-11751R3 · v2');
  assert.equal(m.standardLabel({ number: 'X' }), 'X');
  const base = { line: { id: 1, lineNo: 1, orderId: 3, orderCode: 'SO-1', hasBom: true, locked: false }, standard: RDSO, version: V1, latest: V1, edited: false, kept: false, offer: null, canCreate: false };
  assert.equal(m.lineStandardSentence({ ...base, offer: 'save', version: null }), 'Tied to RDSO/B-11751R3. Its BOM is not on the standard yet.');
  assert.equal(m.lineStandardSentence({ ...base, offer: 'update', edited: true }), 'Made from RDSO/B-11751R3 version 1. Its BOM has changed since.');
  assert.equal(m.lineStandardSentence({ ...base, edited: true, kept: true }), 'Made from RDSO/B-11751R3 version 1. Its BOM differs; the standard was kept as it is.');
  assert.match(m.lineStandardSentence({ ...base, newer: true, latest: { ...V1, versionNo: 2 } }), /A newer version 2 exists; this line keeps its own copy\./);
  assert.equal(m.lineStandardSentence(base), "Made from RDSO/B-11751R3 version 1. Its BOM is the standard's.");
  assert.equal(m.lineStandardSentence({ ...base, standard: null, canCreate: true }), 'This line is not tied to a standard drawing.');
});
await check('Standard drawings sits in the Catalog menu, for the orders or the catalog view grant', () => {
  const cat = m.SECTIONS.find((s) => s.key === 'catalog');
  const sc = cat.screens.find((s) => s.key === 'standard-drawings');
  assert.ok(sc, 'the screen is in Catalog');
  assert.equal(sc.path, 'standard-drawings');
  assert.equal(sc.hasDetail, true);
  assert.equal(sc.permission, 'cf_erp_orders_view|cf_erp_catalog_view');
});

// ── 2. the list ──────────────────────────────────────────────────────────────
await check('the list: number, revision, internal badge, version, parts, weight, source link; an empty one says "No BOM yet"', async () => {
  reset();
  globalThis.__routes['GET /standard-drawings'] = () => ({ rows: [RDSO, EMPTY] });
  await render(React.createElement(m.StandardDrawings));
  const t = text(app);
  assert.match(t, /RDSO\/B-11751R3/); assert.match(t, /rev R3/); assert.match(t, /Internal only/);
  assert.match(t, /v1/); assert.match(t, /47/); assert.match(t, /No BOM yet/);
  const src = [...app.querySelectorAll('a')].find((a) => a.getAttribute('href') === RDSO.sourceUrl);
  assert.ok(src, 'the source opens the RDSO link');
  assert.equal(src.getAttribute('target'), '_blank');
});
await check('the search goes to the server', async () => {
  reset();
  globalThis.__routes['GET /standard-drawings'] = () => ({ rows: [RDSO] });
  await render(React.createElement(m.StandardDrawings));
  await setValue(inputLabelled(app, 'Find by number or name'), '11751');
  await settle();
  assert.match(lastCall('GET', '/standard-drawings').url, /search=11751/);
});
await check('New standard sends number, name, revision, link and who may see it', async () => {
  reset();
  globalThis.__routes['GET /standard-drawings'] = () => ({ rows: [] });
  globalThis.__routes['POST /standard-drawings'] = () => ({ ...DETAIL, id: 9 });
  await render(React.createElement(m.StandardDrawings));
  await click(buttonIn(app, 'New standard'));
  const dlg = document.querySelector('[role="dialog"]');
  await setValue(inputLabelled(dlg, 'Drawing number'), 'RDSO/B-99999');
  await setValue(inputLabelled(dlg, 'Revision'), 'R1');
  await setValue(inputLabelled(dlg, 'Name'), 'Test span');
  await setValue(inputLabelled(dlg, 'Link to the sheet (optional)'), 'https://example.com/a.pdf');
  await click(buttonIn(dlg, 'Add standard')); await settle();
  const body = lastCall('POST', '/standard-drawings').body;
  assert.deepEqual({ ...body, file: body.file ?? null }, { number: 'RDSO/B-99999', name: 'Test span', revision: 'R1', sourceUrl: 'https://example.com/a.pdf', description: undefined, internal: false, file: null });
});

// ── 3. the detail ────────────────────────────────────────────────────────────
const detailAt = async () => {
  await render(React.createElement(Routes, null, React.createElement(Route, { path: '/:company/cf_erp/standard-drawings/:id', element: React.createElement(m.StandardDrawingDetail) })),
    '/testco/cf_erp/standard-drawings/7');
  await settle();
};
await check('the detail: header facts, the BOM tree with size, grade, weight and the notes a person must see', async () => {
  reset();
  globalThis.__routes['GET /standard-drawings/7'] = () => DETAIL;
  await detailAt();
  const t = text(app);
  assert.match(t, /RDSO\/B-11751R3/); assert.match(t, /Internal only/); assert.match(t, /Version 1/);
  assert.match(t, /Rows ?56/); assert.match(t, /Parts ?47/); assert.match(t, /RDSO\/B-11751 rev R3/);
  assert.match(t, /36 × 750 × 7925/); assert.match(t, /E250/); assert.match(t, /Bottom flange/);
  const notes = qa('row-note').map(text);
  assert.ok(notes.some((n) => /before drilling/.test(n)), 'the drilling note shows on the BF1 row');
  assert.ok(notes.some((n) => /Choose the stud/.test(n)), 'the stud still to choose says so');
  assert.match(t, /To choose/);
});
await check('a part\'s DXF opens in the drawing viewer, fetched from the standard\'s own file route', async () => {
  reset();
  globalThis.__routes['GET /standard-drawings/7'] = () => DETAIL;
  globalThis.__routes['GET /standard-drawings/files/501'] = () => new dom.window.Blob([DXF], { type: 'application/dxf' });
  await detailAt();
  await click(buttonIn(app, 'View')); await settle(120);
  assert.ok(q1('drawing-viewer'), 'the viewer is open');
  assert.equal(calls('GET', '/standard-drawings/files/501').length, 1);
  assert.equal(calls('GET', '/order-lines/0/design-uses').length, 0, 'no line is asked about a standard\'s file');
});
await check('the Drawings and Used on tabs', async () => {
  reset();
  globalThis.__routes['GET /standard-drawings/7'] = () => DETAIL;
  await detailAt();
  await click([...app.querySelectorAll('[role="tab"], button')].find((b) => text(b).startsWith('Drawings'))); await settle();
  assert.match(text(app), /BF1_36mm_E250\.dxf/); assert.match(text(app), /7925 × 750/); assert.match(text(app), /Bought out/);
  await click([...app.querySelectorAll('[role="tab"], button')].find((b) => text(b).startsWith('Used on'))); await settle();
  assert.match(text(app), /SO-1/); assert.match(text(app), /line 1/); assert.match(text(app), /version 1/);
});

// ── 4. on the order ──────────────────────────────────────────────────────────
await check('a line made from a standard says so under what it sells', async () => {
  reset();
  await render(React.createElement(m.OrderLinesPanel, { order: order([line(41, 1, { standard: { id: 7, number: 'RDSO/B-11751R3', name: 'n', versionId: 11, versionNo: 1 } }), line(42, 2)]), onSaved: () => {}, onOpenStructure: () => {} }), '/testco/cf_erp/orders/3');
  const marks = qa('line-standard').map(text);
  assert.deepEqual(marks, ['From standard RDSO/B-11751R3 · v1']);
});
await check('Add line › From a standard drawing: pick by number, and what it sends', async () => {
  reset();
  globalThis.__routes['GET /standard-drawings'] = () => ({ rows: [RDSO, EMPTY] });
  globalThis.__routes['POST /orders/3/lines/from-standard'] = () => ({ ...order([line(41, 1)]), fromStandard: { lineId: 41, standardId: 7, number: RDSO.number, versionNo: 1, rows: 56, cutPieces: { made: false, reason: null, message: null } } });
  let saved = null;
  await render(React.createElement(m.OrderLinesPanel, { order: order([]), onSaved: (o) => { saved = o; }, onOpenStructure: () => {} }), '/testco/cf_erp/orders/3');
  await click(buttonIn(app, 'Add line'));
  const dlg = document.querySelector('[role="dialog"]');
  await click(buttonIn(dlg, 'From a standard drawing'));
  const input = inputLabelled(dlg, 'Drawing number');
  assert.ok(input, 'the drawing number picker is there');
  await setValue(input, '11751');
  await fire(input, 'mousedown');
  await settle(420);
  const opt = [...document.querySelectorAll('[role="option"]')].find((o) => text(o).includes('RDSO/B-11751R3'));
  assert.ok(opt, 'the standard is offered by its number');
  assert.match(text(opt), /v1 · 47 parts/);
  await click(opt); await settle();
  assert.match(text(dlg), /Copies version 1: 56 rows/);
  await setValue(inputLabelled(dlg, 'Quantity'), '2');
  await click(buttonIn(dlg, 'Add line')); await settle(80);
  assert.deepEqual(lastCall('POST', '/orders/3/lines/from-standard').body, { standardId: 7, quantity: '2', committedDate: null, description: null });
  assert.ok(saved, 'the order that came back is shown');
});
await check('a standard with no BOM yet cannot make a line: the button waits and the reason is said', async () => {
  reset();
  globalThis.__routes['GET /standard-drawings'] = () => ({ rows: [EMPTY] });
  await render(React.createElement(m.OrderLinesPanel, { order: order([]), onSaved: () => {}, onOpenStructure: () => {} }), '/testco/cf_erp/orders/3');
  await click(buttonIn(app, 'Add line'));
  const dlg = document.querySelector('[role="dialog"]');
  await click(buttonIn(dlg, 'From a standard drawing'));
  const input = inputLabelled(dlg, 'Drawing number');
  await fire(input, 'mousedown'); await settle(420);
  await click([...document.querySelectorAll('[role="option"]')].find((o) => text(o).includes('STD-NEW'))); await settle();
  assert.match(text(dlg), /has no BOM yet\. Make the line from a template, then save its BOM to the standard\./);
  assert.equal(buttonIn(dlg, 'Add line').disabled, true);
});
await check('Add line with its drawing, "This is a standard drawing": the line, then the standard tied to it with the file', async () => {
  reset();
  const tpl = { id: 6095, code: 'SPAN', name: 'Bridge span', kind: 'template', status: 'active', recordKind: 'definition' };
  globalThis.__routes['GET /records'] = () => ({ rows: [tpl], total: 1 });
  globalThis.__routes['GET /pickers/records'] = () => ({ rows: [tpl], total: 1 });
  globalThis.__routes['POST /orders/3/lines'] = () => order([line(45, 1)]);
  globalThis.__routes['POST /order-lines/45/standard'] = () => ({ ...DETAIL, id: 12, number: 'GA-100' });
  globalThis.__routes['GET /orders/3'] = () => order([line(45, 1, { standard: { id: 12, number: 'GA-100', name: 'n', versionId: null, versionNo: null } })]);
  let saved = null;
  await render(React.createElement(m.OrderLinesPanel, { order: order([]), onSaved: (o) => { saved = o; }, onOpenStructure: () => {} }), '/testco/cf_erp/orders/3');
  await click(buttonIn(app, 'Add line'));
  const dlg = document.querySelector('[role="dialog"]');
  const what = inputLabelled(dlg, 'What it sells');
  await setValue(what, 'span'); await fire(what, 'mousedown'); await settle(450);
  const opt = [...document.querySelectorAll('[role="option"]')].find((o) => text(o).includes('Bridge span'));
  if (!opt) throw new Error(`the template picker offered nothing — calls: ${globalThis.__calls.map((c) => c.method + ' ' + c.path).join(', ')}`);
  await click(opt); await settle();
  assert.ok(q1('line-drawing', dlg), 'a template line offers its drawing upload');
  await setFile(dlg.querySelector('input[type="file"][aria-label="Line drawing"]'), 'GA-100.pdf', '%PDF-1.4 test');
  const tick = [...dlg.querySelectorAll('label')].find((l) => text(l) === 'This is a standard drawing');
  assert.ok(tick, 'the "This is a standard drawing" box shows once a file is chosen');
  await click(tick.querySelector('input'));
  assert.equal(inputLabelled(dlg, 'Standard drawing number').value, 'GA-100', 'the number starts as the file name');
  await setValue(inputLabelled(dlg, 'Standard name'), 'GA girder');
  await click(buttonIn(dlg, 'Add line')); await settle(120);
  assert.equal(calls('POST', '/orders/3/lines').length, 1);
  const body = lastCall('POST', '/order-lines/45/standard').body;
  assert.equal(body.number, 'GA-100'); assert.equal(body.name, 'GA girder'); assert.equal(body.file.name, 'GA-100.pdf'); assert.ok(body.file.content.length > 0);
  assert.equal(calls('POST', '/orders/3/lines/45/drawings').length, 0, 'the standard route puts the file on the line itself');
  assert.equal(saved?.lines?.[0]?.standard?.number, 'GA-100', 'the order is read again, with the line tied');
});

// ── 5. the banner over a line's structure ───────────────────────────────────
const state = (offer, more = {}) => ({ line: { id: 41, lineNo: 1, orderId: 3, orderCode: 'SO-1', hasBom: true, locked: false }, standard: RDSO, version: V1, latest: V1, edited: offer === 'update', kept: false, offer, canCreate: false, ...more });
await check('an edited line made from a standard: "Update the standard too" or "Keep the standard as it is"', async () => {
  reset();
  globalThis.__routes['GET /order-lines/41/standard'] = () => state('update');
  globalThis.__routes['POST /order-lines/41/standard/keep'] = () => state(null, { edited: true, kept: true });
  let changed = 0;
  await render(React.createElement(m.StandardLineBanner, { lineId: 41, hasStandard: true, onChanged: () => { changed++; } }), '/testco/cf_erp/orders/3');
  await settle();
  const b = q1('standard-banner');
  assert.match(text(b), /Its BOM has changed since\./);
  assert.ok(buttonIn(b, 'Update the standard too (new version)'));
  await click(buttonIn(b, 'Keep the standard as it is')); await settle();
  assert.equal(calls('POST', '/order-lines/41/standard/keep').length, 1);
  assert.equal(q1('standard-banner'), null, 'nothing left to decide');
  assert.equal(changed, 1);
});
await check('"Update the standard too" saves the next version', async () => {
  reset();
  globalThis.__routes['GET /order-lines/41/standard'] = () => state('update');
  globalThis.__routes['POST /order-lines/41/standard/save'] = () => state(null, { version: { ...V1, id: 12, versionNo: 2 }, saved: { versionId: 12, versionNo: 2, rows: 56, parts: 47, weightKg: 1 } });
  await render(React.createElement(m.StandardLineBanner, { lineId: 41, hasStandard: true }), '/testco/cf_erp/orders/3');
  await settle();
  await click(buttonIn(q1('standard-banner'), 'Update the standard too (new version)')); await settle();
  assert.equal(calls('POST', '/order-lines/41/standard/save').length, 1);
  assert.equal(q1('standard-banner'), null);
});
await check('a line tied to a standard with no BOM yet: "Save this BOM to the standard"; none for a plain line or a read-only person', async () => {
  reset();
  globalThis.__routes['GET /order-lines/41/standard'] = () => state('save', { version: null });
  await render(React.createElement(m.StandardLineBanner, { lineId: 41, hasStandard: true }), '/testco/cf_erp/orders/3');
  await settle();
  assert.ok(buttonIn(q1('standard-banner'), 'Save this BOM to the standard'));
  reset();
  await render(React.createElement(m.StandardLineBanner, { lineId: 41, hasStandard: false }), '/testco/cf_erp/orders/3');
  await settle();
  assert.equal(q1('standard-banner'), null);
  assert.equal(calls('GET', '/order-lines/41/standard').length, 0, 'a plain line asks nothing');
  reset();
  globalThis.__user = { uiPermissions: ['cf_erp_orders_view'] };
  globalThis.__routes['GET /order-lines/41/standard'] = () => state('update');
  await render(React.createElement(m.StandardLineBanner, { lineId: 41, hasStandard: true }), '/testco/cf_erp/orders/3');
  await settle();
  assert.equal(q1('standard-banner'), null, 'only someone who may change orders is asked');
});

if (root) await React.act(async () => { root.unmount(); });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
