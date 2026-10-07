// Run from multi_app_fe: node scripts/cf_erp_cut_from_ui_test.mjs
// CF_ERP "Cut from" (CF_ERP_CUT_FROM_PLAN.md §11.4): Setup › Cutting loads and saves; a record's Details has Cut from and
// a Section picker that saves cutStockId; the structure grid shows a section part's picker; the Cut pieces list shows both
// kinds; the Nesting stage's Sections part draws bars and runs propose / accept / take back / sheet preview-then-save;
// Offcuts shows kind and length; the Freeze list renders the new check keys. The API is mocked; no network.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/cutting', pretendToBeVisual: true });
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

const calls = [];
globalThis.__api = async (url, opts = {}) => {
  const path = url.replace(/^\/api\/[^/]+\/cf_erp/, '');
  const call = { method: opts.method ?? 'GET', path, body: typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body };
  calls.push(call);
  const handler = globalThis.__routes.find(([mt, re]) => mt === call.method && re.test(path));
  if (!handler) throw new Error(`API request failed: 404 Not Found - {"message":"no mock for ${call.method} ${path}"}`);
  return handler[2](call);
};
const stubs = {
  '@core/api/client': 'export async function apiFetch(url, opts) { return globalThis.__api(url, opts); }',
  '@core/contexts/AuthContext': 'export const useAuth = () => ({ user: null });',
  // The shared kit's barrel pulls the whole app shell; the cf_erp screens under test use only the grid and the storage helpers.
  '@shared/ui': `export * from ${JSON.stringify(resolve('src/shared/ui/SheetGrid.tsx').split('\\').join('/'))}; export * from ${JSON.stringify(resolve('src/shared/ui/storage.ts').split('\\').join('/'))};`,
};
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter, Routes, Route } from 'react-router-dom';
      export { React, createRoot, MemoryRouter, Routes, Route };
      export { default as Cutting } from './src/apps/cf_erp/pages/Cutting';
      export { default as RecordDetail } from './src/apps/cf_erp/pages/RecordDetail';
      export { default as Offcuts } from './src/apps/cf_erp/pages/Offcuts';
      export { NestingPanel } from './src/apps/cf_erp/components/Nesting/NestingPanel';
      export { SectionNestingPanel } from './src/apps/cf_erp/components/Nesting/SectionNestingPanel';
      export { BlanksPanel } from './src/apps/cf_erp/components/Nesting/BlanksPanel';
      export { LockPanel } from './src/apps/cf_erp/components/Lock/LockPanel';
      export { SectionCell } from './src/apps/cf_erp/components/SectionPicker';
      export { ToastContext } from './src/apps/cf_erp/components/toastContext';
      export { sectionSizeText, cutFromWords } from './src/apps/cf_erp/api/cutting';
      export { normaliseSectionView } from './src/apps/cf_erp/api/sectionNesting';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^(@core\/(api\/client|contexts\/AuthContext)|@shared\/ui)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js', resolveDir: process.cwd() }));
  } }],
  loader: { '.css': 'empty' },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `cut-from-ui-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter, Routes, Route } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async (ms = 30) => React.act(async () => { await sleep(ms); });
const click = async (el) => { assert.ok(el, 'nothing to click'); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); };
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const setValue = async (input, value) => {
  await React.act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await sleep(0);
  });
};
const text = () => document.body.textContent;

let root;
const mount = async (path, routePath, element, toasts = []) => {
  if (root) await React.act(async () => { root.unmount(); });
  document.getElementById('app').innerHTML = '';
  root = createRoot(document.getElementById('app'));
  await React.act(async () => {
    root.render(React.createElement(m.ToastContext.Provider, { value: { success: (t) => toasts.push(t), error: (t) => toasts.push(`ERR ${t}`), info: () => {} } },
      React.createElement(MemoryRouter, { initialEntries: [path] },
        React.createElement(Routes, null, React.createElement(Route, { path: routePath, element })))));
    await sleep(40);
  });
  await settle(60);
};
const after = (since, method, re) => calls.slice(since).filter((c) => c.method === method && re.test(c.path));

// ── fixtures ────────────────────────────────────────────────────────────────
const node = (id, name, path) => ({ id, code: name.toUpperCase().replace(/\W+/g, '_'), name, path });
const places = {
  plate: { blanksNode: node(11, 'Cut plates', 'Steel › Cut plates'), offcutNode: node(12, 'Offcuts', 'Steel › Offcuts'), stockNodes: [node(13, 'Plates', 'Steel › Plates')] },
  section: { blanksNode: null, offcutNode: null, stockNodes: [node(21, 'Angles', 'Steel › Angles'), node(22, 'Beams', 'Steel › Beams')] },
  sectionSettings: { sawKerfMm: 3, endTrimMm: 10, minOffcutMm: 500 },
  problems: ['Section: cut pieces have no place to be filed. Choose one.'],
  flows: { plate: { id: 31, code: 'CUT-PLATE', name: 'Plate cutting', status: 'active' }, section: null },
};
const flowList = [{ id: 31, code: 'CUT-PLATE', name: 'Plate cutting', status: 'active' }, { id: 32, code: 'CUT-SECTION', name: 'Section sawing', status: 'active' }, { id: 33, code: 'CUT-PLATE2', name: 'Plate burning', status: 'active' }];
const tnode = (id, name, depth, children = []) => ({ id, parentId: null, depth, level: ['Family', 'Subfamily', 'Variant'][depth] ?? 'Variant', scope: 'item', code: name.toUpperCase().replace(/\W+/g, '_'), name, description: null, sortOrder: 0, status: 'active', itemCount: 0, definitionCount: 0, ruleCount: 0, machineCount: 0, children, subtree: { items: 0, definitions: 0, machines: 0 } });
const tree = { screen: 'items', all: true, hiddenCount: 0, levels: ['Family', 'Subfamily', 'Variant'], leafDepth: 2,
  roots: [tnode(1, 'Steel', 0, [tnode(11, 'Cut plates', 1), tnode(12, 'Offcuts', 1), tnode(13, 'Plates', 1), tnode(21, 'Angles', 1), tnode(22, 'Beams', 1), tnode(23, 'Cut sections', 1)])] };

const angle = { id: 9, code: 'ISA-75x75x8-6000', name: 'ISA 75 x 75 x 8 x 6000 E350 BO', thickness: 8, width: 75, depth: 75, lengthMm: 6000, sectionArea: 1140, grade: 'E350', nodeName: 'Angles' };
const angle2 = { ...angle, id: 10, code: 'ISA-75x75x8-12000', name: 'ISA 75 x 75 x 8 x 12000 E350 BO', lengthMm: 12000 };
const definition = {
  id: 7, recordKind: 'definition', kind: 'template', code: 'BRC', name: 'Bracing', shortName: 'BRC', description: null, classificationId: 3, status: 'active', revision: 'A',
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z', item: null, definition: { definitionType: 'template', selectionMode: null, candidateClassificationId: null },
  classificationPath: [], counts: { temporaryItems: 0, allowedItems: 0, criteria: 0 }, frozen: null,
  cutFrom: { value: 'SECTION', source: 'classification', from: 'Profile part' },
  cutStock: { own: null, effective: null, from: null },
};
const item = {
  ...definition, id: 8, recordKind: 'item', kind: 'temporary', code: null, name: 'Bracing 1',
  item: { itemType: 'temporary', trackedBy: 'quantity', uom: 'nos', sourcing: 'make', sourceDefinitionId: 7, ownerOrderLineId: null },
  definition: null, sourceDefinition: { id: 7, code: 'BRC', name: 'Bracing', status: 'active' },
  cutFrom: { value: 'SECTION', source: 'definition', from: 'Bracing' },
  cutStock: { own: null, effective: { id: 9, code: angle.code, name: angle.name, steel: { thickness: 8, width: 75, depth: 75, lengthMm: 6000, sectionArea: 1140, grade: 'E350' } }, from: 'definition' },
};

// ── 1. Setup › Cutting ──────────────────────────────────────────────────────
globalThis.__routes = [
  ['GET', /^\/cut-places$/, () => places],
  ['GET', /^\/classification\?screen=items&all=1$/, () => tree],
  ['GET', /^\/flows$/, () => flowList],
  ['PUT', /^\/flows\/cut-plates$/, ({ body }) => ({ flow: flowList.find((f) => f.id === body.flowId) ?? null })],
  ['PUT', /^\/cut-places$/, ({ body }) => ({ ...places, sectionSettings: { ...places.sectionSettings, ...body.sectionSettings }, problems: [], flows: { plate: places.flows.plate, section: flowList.find((f) => f.id === body.sectionFlowId) ?? null } })],
];
await mount('/testco/cf_erp/cutting', '/:company/cf_erp/cutting', React.createElement(m.Cutting));
await check('Setup › Cutting shows the places, the settings and the problems in words', () => {
  assert.match(text(), /Section: cut pieces have no place to be filed/);
  assert.equal(document.querySelector('[data-testid="plate-blanks"]').value, 'Steel › Cut plates');
  assert.equal(document.querySelector('[data-testid="saw-kerf"]').value, '3');
  assert.equal(document.querySelector('[data-testid="min-offcut"]').value, '500');
  assert.match(text(), /Steel › Angles/);
});
await check('Setup › Cutting saves places and settings with one PUT', async () => {
  const since = calls.length;
  await setValue(document.querySelector('[data-testid="saw-kerf"]'), '4');
  // choose the section blanks place
  const input = document.querySelector('[data-testid="section-blanks"]');
  await React.act(async () => { input.focus(); input.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })); await sleep(0); });
  await React.act(async () => { input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await sleep(10); });
  const opt = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent === 'Steel › Cut sections');
  assert.ok(opt, 'the tree is offered by path');
  await click(opt);
  assert.match(text(), /Cut sections have no flow — release will refuse them until one is chosen\./);
  assert.equal(document.querySelector('[data-testid="plate-flow"] input').value, 'CUT-PLATE · Plate cutting');
  const pick = async (box, code) => {
    const inp = document.querySelector(`[data-testid="${box}"] input`);
    await React.act(async () => { inp.focus(); inp.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })); await sleep(0); });
    await React.act(async () => { inp.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await sleep(10); });
    await click([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.includes(code)));
  };
  await pick('section-flow', 'CUT-SECTION');
  await pick('plate-flow', 'CUT-PLATE2');
  assert.ok(!document.querySelector('[data-testid="section-no-flow"]'), 'the amber line goes once a flow is chosen');
  await click(button('Save cutting setup'));
  await settle(50);
  const put = after(since, 'PUT', /^\/cut-places$/)[0];
  assert.ok(put, 'saved');
  assert.equal(put.body.section.blanksNodeId, 23);
  assert.deepEqual(put.body.section.stockNodeIds, [21, 22]);
  assert.equal(put.body.plate.blanksNodeId, 11);
  assert.equal(put.body.sectionSettings.sawKerfMm, 4);
  assert.equal(put.body.sectionSettings.minOffcutMm, 500);
  assert.equal(put.body.sectionFlowId, 32);
  assert.ok(!('plateFlowId' in put.body));
  assert.deepEqual(after(since, 'PUT', /^\/flows\/cut-plates$/)[0]?.body, { flowId: 33 });
  assert.ok(!document.querySelector('[data-testid="cut-problems"]'), 'the problems clear once the server says so');
});

// ── 2. Details: Cut from + Section ──────────────────────────────────────────
let currentItem = item;
globalThis.__routes = [
  ['GET', /^\/records\/8$/, () => currentItem],
  ['GET', /^\/records\/8\/specs/, () => ({ specs: [], mode: 'item' })],
  ['GET', /^\/rules/, () => []],
  ['GET', /^\/classification\?screen=items$/, () => tree],
  ['GET', /^\/section-stock/, ({ path }) => (/search=12000/.test(path) ? [angle2] : [angle, angle2])],
  ['PUT', /^\/records\/8$/, ({ body }) => { currentItem = { ...currentItem, updatedAt: '2026-10-03T00:00:00Z', cutStock: { own: { id: body.cutStockId, code: 'x', name: 'x' }, effective: { id: body.cutStockId, code: 'x', name: 'x', steel: null }, from: 'own' } }; return currentItem; }],
];
const toasts2 = [];
await mount('/testco/cf_erp/items/8?tab=details', '/:company/cf_erp/items/:id', React.createElement(m.RecordDetail, { recordKind: 'item' }), toasts2);
await check('Details says where the inherited Cut from comes from and shows the definition\'s section with its steel', () => {
  assert.match(text(), /Follows: Section \(cut to length\) — from Bracing/);
  assert.match(text(), /From its definition/);
  const steel = document.querySelector('[data-testid="section-steel"]');
  assert.ok(steel, 'steel line');
  assert.match(steel.textContent, /75 × 75 × 8 · 6,000 mm · E350/);
  assert.match(steel.textContent, /area 1140 mm²/);
  assert.equal(document.querySelector('[data-testid="section-picker"]').value, `${angle.code} · ${angle.name}`);
});
await check('Choosing another section saves cutStockId only (Cut from stays inherited)', async () => {
  const since = calls.length;
  const input = document.querySelector('[data-testid="section-picker"]');
  await React.act(async () => { input.focus(); input.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })); await sleep(0); });
  await setValue(input, '12000');
  await settle(350);
  assert.ok(after(since, 'GET', /^\/section-stock\?search=12000/).length >= 1, 'the search is sent');
  const opt = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.includes('12000'));
  assert.ok(opt, 'the searched section is offered');
  await click(opt);
  assert.match(document.querySelector('[data-testid="section-steel"]').textContent, /75 × 75 × 8 · 12,000 mm · E350/);
  await click(button('Save details'));
  await settle(50);
  const put = after(since, 'PUT', /^\/records\/8$/)[0];
  assert.ok(put, 'saved');
  assert.equal(put.body.cutStockId, 10);
  assert.ok(!('cutFrom' in put.body), 'an unchanged Cut from is not sent');
});

// ── 3. The structure grid's section cell ────────────────────────────────────
await check('A section part\'s grid cell names the section and saves cutStockId on its item', async () => {
  const saved = [];
  await mount('/testco/cf_erp/items/8', '/:company/cf_erp/items/:id', React.createElement(m.SectionCell, {
    value: { id: 9, code: 'ISA-75', name: 'ISA 75' }, editable: true, onPick: async (row) => { saved.push(row?.id ?? null); },
  }));
  const cell = document.querySelector('[data-testid="section-cell"]');
  assert.match(cell.textContent, /Section: ISA-75/);
  await click(cell);
  await settle(350);
  const opt = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.includes('12000'));
  assert.ok(opt);
  await click(opt);
  await settle(30);
  assert.deepEqual(saved, [10]);
  await mount('/testco/cf_erp/items/8', '/:company/cf_erp/items/:id', React.createElement(m.SectionCell, { value: null, editable: false, onPick: async () => {} }));
  assert.match(document.querySelector('[data-testid="section-cell"]').textContent, /No section/);
});

// ── 4. Cut pieces: both kinds ───────────────────────────────────────────────
globalThis.__routes = [
  ['GET', /^\/order-lines\/5\/cut-plates$/, () => ({
    parts: 3, values: { missing: 0, items: 0, complete: true }, upToDate: true,
    cutPlates: [
      { id: 1, kind: 'plate', code: 'CP-001', name: null, size: { thickness: 12, length: 500, width: 300, grade: 'E350' }, partCount: 2, plate: { id: 1, code: null, name: null, isSelection: true }, plateQuantity: 0.25, plateQuantityBasis: 'area', note: null },
      { id: 2, kind: 'section', code: 'CS-001', name: null, section: { id: 9, code: 'ISA-75x75x8', name: 'ISA 75' }, lengthMm: 2400, size: { thickness: 8, length: 2400, width: 75, grade: 'E350' }, partCount: 4, plate: null, plateQuantity: 1.6, plateQuantityBasis: 'estimate', note: null },
    ],
  })],
];
await mount('/testco/cf_erp/orders/1', '/:company/cf_erp/orders/:id', React.createElement(m.BlanksPanel, { lineId: 5, canManage: true, embedded: true }));
await check('The cut pieces list shows plate blanks and section blanks, each in its own table', () => {
  assert.match(text(), /Cut from plates/);
  assert.match(text(), /Cut from sections/);
  const sec = document.querySelector('[data-testid="section-blanks"]');
  assert.match(sec.textContent, /CS-001/);
  assert.match(sec.textContent, /ISA-75x75x8/);
  assert.match(sec.textContent, /2400/);
  assert.match(text(), /CP-001/);
  assert.match(text(), /Bar quantities are an estimate/);
});

// ── 5. Section nesting ──────────────────────────────────────────────────────
const bar = (n, over = {}) => ({ lotId: n, lotNo: `B-00${n}`, source: 'catalog', itemId: 9, itemCode: 'ISA-75x75x8-6000', offcutId: null, lengthMm: 6000,
  cuts: [{ cutPieceId: 2, code: 'CS-001', xMm: 10, lengthMm: 2400 }, { cutPieceId: 2, code: 'CS-001', xMm: 2413, lengthMm: 2400 }], wasteMm: 1177, keptOffcutMm: 1177, ...over });
const profile = (plan) => ({ key: 'ISA75x75x8|E350', label: 'ISA 75 x 75 x 8', grade: 'E350',
  pieces: [{ cutPieceId: 2, code: 'CS-001', lengthMm: 2400, quantity: 4, parts: ['Bracing 1'] }],
  stockLengths: [{ itemId: 9, code: 'ISA-75x75x8-6000', lengthMm: 6000 }, { itemId: 10, code: 'ISA-75x75x8-12000', lengthMm: 12000 }],
  offcuts: [], plan });
const planned = { bars: [bar(1), bar(2, { source: 'offcut', offcutId: 4, itemId: null, itemCode: null, lengthMm: 3000, cuts: [{ cutPieceId: 2, code: 'CS-001', xMm: 10, lengthMm: 2400 }], wasteMm: 590, keptOffcutMm: 0 })],
  barsBought: 1, barsFromOffcuts: 1, totalLengthMm: 9000, wasteMm: 1767, wastePct: 19.6, keptOffcuts: 1 };
const sectionView = (over = {}) => ({ line: { id: 5, lineNo: 1, orderCode: 'SO-1' }, settings: { sawKerfMm: 3, endTrimMm: 10, minOffcutMm: 500 }, accepted: false, acceptedAt: null, problems: [], profiles: [profile(null)], ...over });
let accepted = false;
globalThis.__routes = [
  ['GET', /^\/orders\/1\/lines\/5\/section-nesting$/, () => sectionView(accepted ? { accepted: true, acceptedAt: '2026-10-08T10:00:00Z', profiles: [profile(planned)] } : {})],
  ['POST', /^\/orders\/1\/lines\/5\/section-nesting\/plan$/, () => sectionView({ profiles: [profile(planned)] })],
  ['POST', /^\/orders\/1\/lines\/5\/section-nesting\/accept$/, () => { accepted = true; return { ok: true }; }],
  ['DELETE', /^\/orders\/1\/lines\/5\/section-nesting$/, () => { accepted = false; return { ok: true }; }],
  ['POST', /^\/orders\/1\/lines\/5\/section-nesting\/sheet$/, ({ body }) => (body.dryRun
    ? { applied: false, canSave: true, needsForce: true, problems: [], bars: [bar(1)], coverage: [{ code: 'CS-001', needed: 4, placed: 3 }] }
    : { applied: true, canSave: true, needsForce: true, problems: [], bars: [bar(1)], coverage: [] })],
];
const toasts5 = [];
await mount('/testco/cf_erp/orders/1', '/:company/cf_erp/orders/:id', React.createElement(m.SectionNestingPanel, { orderId: 1, lineId: 5, canManage: true }), toasts5);
await check('Sections shows the profile, its pieces needed and the settings; nothing is laid out before Propose', () => {
  assert.match(text(), /ISA 75 x 75 x 8/);
  assert.match(text(), /4 pieces needed in 1 length/);
  assert.match(text(), /saw cut 3 mm/);
  assert.match(text(), /No bars are laid out/);
  assert.equal(document.querySelectorAll('[data-testid="section-bar"]').length, 0);
  assert.ok(button('Accept').disabled, 'accept waits for a proposal');
});
await check('Propose draws the bars with cut segments, the kept offcut and the totals', async () => {
  const since = calls.length;
  await click(button('Propose'));
  await settle(50);
  assert.equal(after(since, 'POST', /\/section-nesting\/plan$/).length, 1);
  assert.equal(document.querySelectorAll('[data-testid="section-bar"]').length, 2);
  assert.equal(document.querySelectorAll('[data-testid="section-cut"]').length, 3);
  assert.equal(document.querySelectorAll('[data-testid="section-kept"]').length, 1);
  const totals = document.querySelector('[data-testid="section-totals"]').textContent;
  assert.match(totals, /1 bar to buy/);
  assert.match(totals, /1 from offcuts/);
  assert.match(totals, /waste 19\.6%/);
  assert.match(document.querySelector('[data-testid="section-bar"]').getAttribute('aria-label'), /CS-001 2,400/);
  assert.match(text(), /offcut 1,177 mm kept/);
  assert.match(text(), /A proposal — not saved/);
});
await check('Accept asks first, then posts; Take back asks first, then deletes', async () => {
  let since = calls.length;
  await click(button('Accept'));
  await settle();
  assert.match(text(), /Accept the section nesting\?/);
  assert.equal(after(since, 'POST', /\/accept$/).length, 0, 'nothing is written before the confirm');
  await click([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === 'Accept'));
  await settle(60);
  assert.equal(after(since, 'POST', /\/accept$/).length, 1);
  assert.match(text(), /Accepted/);
  since = calls.length;
  await click(button('Take back'));
  await settle();
  assert.match(text(), /Take the section nesting back\?/);
  await click([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === 'Take back'));
  await settle(60);
  assert.equal(after(since, 'DELETE', /\/section-nesting$/).length, 1);
});
await check('Uploading a sheet previews with dryRun, shows the coverage, then saves with dryRun false and force', async () => {
  const since = calls.length;
  const input = document.querySelector('[data-testid="section-sheet-input"]');
  const file = new dom.window.File([new Uint8Array([80, 75, 3, 4])], 'bars.xlsx');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await React.act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await sleep(60); });
  await settle(60);
  const pre = after(since, 'POST', /\/sheet$/);
  assert.equal(pre.length, 1);
  assert.equal(pre[0].body.dryRun, true);
  assert.equal(pre[0].body.filename, 'bars.xlsx');
  assert.ok(pre[0].body.file, 'the file is sent as base64');
  assert.match(text(), /Check the bar sheet/);
  assert.match(text(), /1 short/);
  assert.match(text(), /CS-001/);
  await click(button('Save anyway'));
  await settle(60);
  const posts = after(since, 'POST', /\/sheet$/);
  assert.equal(posts.length, 2);
  assert.equal(posts[1].body.dryRun, false);
  assert.equal(posts[1].body.force, true);
  assert.ok(toasts5.some((t) => /Sheet saved/.test(t)), toasts5.join(' | '));
});
await check('A line without section parts says so in one line and has no actions', async () => {
  globalThis.__routes = [['GET', /section-nesting$/, () => sectionView({ profiles: [] })]];
  await mount('/testco/cf_erp/orders/1', '/:company/cf_erp/orders/:id', React.createElement(m.SectionNestingPanel, { orderId: 1, lineId: 5, canManage: true }));
  assert.match(document.querySelector('[data-testid="no-section-parts"]').textContent, /no parts cut from sections/);
  assert.ok(!button('Propose') && !button('Upload sheet'));
});
await check('The Sections part stays out of the way when the backend has no such route (and the plate part still renders)', async () => {
  globalThis.__routes = [['GET', /\/nesting$/, () => ({ line: { id: 5, lineNo: 1, orderId: 1, orderCode: 'SO-1', quantity: 1, orderStatus: 'confirmed', plateChoice: 'standard' }, saved: false, basis: 'nothing saved yet', groups: [], manual: [], sizeAdvice: [], problems: [], totals: { plates: 0, pieces: 0, weightKg: 0, wastePct: null, groups: 0, unplaced: 0 } })]];
  await mount('/testco/cf_erp/orders/1', '/:company/cf_erp/orders/:id', React.createElement(m.NestingPanel, { orderId: 1, lineId: 5, canManage: true }));
  assert.ok(!document.querySelector('[data-testid="no-section-parts"]'));
  assert.ok(!text().includes('Sections'), 'no Sections card');
});

// ── 6. Offcuts ──────────────────────────────────────────────────────────────
const offcut = (id, over) => ({ id, offcutNo: `OC-${id}`, status: 'available', thickness: 8, grade: 'E350', material: null, areaMm2: 1e5, weightKg: 12, value: 900, rect: null, bbox: null, outline: [],
  origin: { orderId: 1, orderCode: 'SO-1', lineNo: 1, lotNo: 'B-001', plate: { id: 9, code: 'ISA-75' } }, batch: null, item: null, createdAt: '2026-10-08T00:00:00Z', ...over });
globalThis.__routes = [['GET', /^\/offcuts/, () => ({ rows: [offcut(1, { kind: 'bar', lengthMm: 1177 }), offcut(2, { kind: 'plate', rect: { length: 400, width: 300 }, bbox: { x: 0, y: 0, length: 400, width: 300 }, outline: [[[0, 0], [400, 0], [400, 300], [0, 300]]] })], total: 2, counts: { status: { available: 2 } } })]];
const sinceOff = calls.length;
await mount('/testco/cf_erp/offcuts', '/:company/cf_erp/offcuts', React.createElement(m.Offcuts));
await check('Offcuts shows kind and a bar\'s length, and has a kind filter', async () => {
  assert.match(text(), /Bar/);
  assert.match(text(), /1177 long/);
  assert.match(text(), /400 × 300/);
  assert.ok(document.querySelector('[data-testid="offcut-bar"]'), 'a bar is drawn as a bar');
  await click([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Bars'));
  await settle(400);
  assert.ok(calls.slice(sinceOff).some((c) => c.path.startsWith('/offcuts') && /[?&]kind=bar/.test(c.path)), 'the kind filter reaches the server');
});

// ── 7. Freeze checks ────────────────────────────────────────────────────────
const chk = (key, title, over = {}) => ({ key, ok: true, applies: true, title, detail: `${title} detail`, problems: [], ...over });
const lockView = {
  line: { id: 5, lineNo: 1, lineType: 'standard', orderId: 1, orderCode: 'SO-1', orderStatus: 'confirmed', quantity: 1, item: { id: 1, code: 'X', name: 'Girder' } },
  released: null, locked: null, position: null, canLock: false, summary: { nodes: 3, pieces: 3, groups: 1 }, nodes: [], groups: [],
  checks: [
    chk('line', 'A line built from a template'),
    chk('cut_method', 'Every part says how it is cut', { ok: false, detail: '2 parts have no Cut from.', problems: ['Bracing 1 has no Cut from.', 'Bracing 2 has no Cut from.'], stageKey: 'structure', todo: 'Set Cut from on the definition.' }),
    chk('section_parts', 'Every section part has its section', { ok: false, problems: ['Bracing 3: no section chosen.'], stageKey: 'structure' }),
    chk('cut_places', 'The places for cut pieces are set', { ok: false, problems: ['Section: no place for cut pieces.'] }),
    chk('no_cut_pieces', 'Some part makes a cut piece', { ok: false, warning: true, detail: 'No part on this line makes a cut piece.' }),
  ],
};
globalThis.__routes = [['GET', /^\/order-lines\/5\/lock/, () => lockView], ['GET', /^\/orders\/1$/, () => ({})]];
await mount('/testco/cf_erp/orders/1', '/:company/cf_erp/orders/:id', React.createElement(m.LockPanel, { lineId: 5, lineNo: 1, canManage: true, stages: [], onGoStage: () => {}, onChanged: () => {} }));
await check('The Freeze list renders the new check keys and keeps a warning out of "in the way"', () => {
  assert.match(text(), /Every part says how it is cut/);
  assert.match(text(), /Bracing 1 has no Cut from\./);
  assert.match(text(), /Bracing 3: no section chosen\./);
  assert.match(text(), /Section: no place for cut pieces\./);
  assert.match(text(), /Heads up/);
  assert.match(text(), /3 things are in the way/);
});

if (root) await React.act(async () => { root.unmount(); });
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 50);
