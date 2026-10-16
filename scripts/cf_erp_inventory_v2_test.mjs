// Run from multi_app_fe: node scripts/cf_erp_inventory_v2_test.mjs
// CF_ERP Inventory v2 (GET /stock/view): the Stock screen sends every filter to the server, shows a heading per tracking
// mode, opens a lot row to its lots and a piece row to its pieces, opens a piece's history; totals by owner (ours value
// and kg, the no-scrap-rate sentence, a card per customer that filters to them); Check ledger says which part disagrees;
// Setup › Cutting saves the scrap rate. The API is mocked; no network.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/acme/cf_erp/stock', pretendToBeVisual: true });
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

// ── fixtures ────────────────────────────────────────────────────────────────
const area = (id, code, purpose = 'storage') => ({ id, code, name: `${code} area`, purpose });
const AREAS = [{ ...area(1, 'MAIN'), machine: null, status: 'active', notes: null, createdAt: '', updatedAt: '' }, { ...area(2, 'SCRAP', 'scrap'), machine: null, status: 'active', notes: null, createdAt: '', updatedAt: '' }];
const it = (id, code, trackedBy, kind = 'standard', uom = 'nos') => ({ id, code, name: `${code} name`, uom, trackedBy, kind, classificationId: 13 });
const row = (o) => ({ lines: 1, lots: 0, open: null, unitCost: null, value: null, uncostedQty: 0, referenceValue: null, scrap: null, kg: null, updatedAt: '2026-10-16T10:00:00Z', owner: null, category: 'available', ...o });
const ACME = { id: 50, code: 'C-ACME', name: 'Acme Infra' };
const ROWS = [
  row({ key: 'q1', item: it(1, 'BOLT-M20', 'quantity'), area: area(1, 'MAIN'), quantity: 500, value: 25000, unitCost: 50 }),
  row({ key: 'q2', item: it(2, 'SCRAP-MS', 'quantity', 'standard', 'kg'), area: area(2, 'SCRAP', 'scrap'), category: 'scrap', quantity: 340, kg: 340, value: 0, scrap: { ratePerKg: null, note: 'No scrap rate set — scrap is valued at 0.' } }),
  row({ key: 'b1', item: it(3, 'PL-10-E350', 'batch', 'standard', 'kg'), area: area(1, 'MAIN'), quantity: 4200, kg: 4200, lots: 2, lines: 2, open: 'lots', value: 252000 }),
  row({ key: 'b2', item: it(3, 'PL-10-E350', 'batch', 'standard', 'kg'), area: area(1, 'MAIN'), owner: ACME, quantity: 1500, kg: 1500, lots: 1, open: 'lots', referenceValue: 90000 }),
  row({ key: 'i1', item: it(4, 'GDR-01', 'individual', 'custom'), area: area(1, 'MAIN'), category: 'in_process', quantity: 2, kg: 1800, open: 'pieces', value: 150000 }),
];
const COUNTS = {
  categories: { available: 3, in_process: 1, finished: 0, held: 0, rejected: 0, dispatch: 0, scrap: 1, offcut: 0, all: 5 },
  owners: { ours: 4, parties: [{ ...ACME, n: 1 }] },
  kinds: { standard: 4, custom: 1, all: 5 },
  tracking: { quantity: 2, batch: 2, individual: 1, all: 5 },
};
const TOTALS = {
  currency: 'INR',
  ours: { value: 427000, uncostedQty: 3, kg: 6340, unweighedItems: 1, lines: 5, scrapKg: 340 },
  customers: [{ party: ACME, kg: 1500, unweighedItems: 0, lines: 1, quantities: [{ uom: 'kg', quantity: 1500 }, { uom: 'nos', quantity: 4 }], referenceValue: 90000, uncostedQty: 0 }],
};
const SCRAP_RATE = { ratePerKg: null, currency: 'INR', note: 'No scrap rate set — scrap is valued at 0.' };
const LOTS = [
  { batch: { id: 71, code: 'B-PL-1', status: 'available' }, quantity: 2200, kg: 2200, unitCost: 60, value: 132000, referenceValue: null, owner: null, ownerOrder: null, piece: null, offcut: null, receivedOn: '2026-10-01', updatedAt: '' },
  { batch: { id: 72, code: 'B-PL-2', status: 'on_hold' }, quantity: 2000, kg: 2000, unitCost: 60, value: 120000, referenceValue: null, owner: null, ownerOrder: null, piece: null, offcut: { id: 9, offcutNo: 'OFC-10-0009' }, receivedOn: '2026-10-02', updatedAt: '' },
];
const unit = (id, code, o = {}) => ({ id, code, pieceCode: code, serial: 1, status: 'in_process', item: { id: 4, code: 'GDR-01', name: 'Girder 1' }, batch: { id: 81, code: 'WIP-81' }, area: area(1, 'MAIN'), owner: null, parent: null, replaces: null, order: { id: 100, code: 'SO-1', lineNo: 2 }, productionItemId: 5, updatedAt: '', ...o });
const UNITS = [unit(201, 'GDR-01-A'), unit(202, 'GDR-01-B')];
const UNIT_DETAIL = {
  unit: unit(201, 'GDR-01-A', { parent: { id: 300, code: 'ASM-1' }, replaces: { id: 199, code: 'GDR-01-OLD' } }),
  history: [
    { id: 2, event: 'moved', words: 'Moved', at: '2026-10-05T10:00:00Z', movement: { id: 900, code: 'MV-900', type: 'transfer', date: '2026-10-05', reference: null }, from: { id: 1, code: 'MAIN' }, to: { id: 3, code: 'WIP' }, parent: null, note: null },
    { id: 1, event: 'made', words: 'Made', at: '2026-10-01T10:00:00Z', movement: null, from: null, to: { id: 1, code: 'MAIN' }, parent: null, note: null },
  ],
  inside: [unit(205, 'STIF-1', { item: { id: 6, code: 'STF', name: 'Stiffener' } })],
  madeAgainAs: [],
};
const STIF_DETAIL = { unit: unit(205, 'STIF-1', { item: { id: 6, code: 'STF', name: 'Stiffener' } }), history: [], inside: [], madeAgainAs: [] };
const tnode = (id, name, depth, children = []) => ({ id, parentId: null, depth, level: ['Family', 'Subfamily', 'Variant'][depth], scope: 'item', code: name.toUpperCase(), name, description: null, sortOrder: 0, status: 'active', itemCount: 0, definitionCount: 0, ruleCount: 0, machineCount: 0, children, subtree: { items: 0, definitions: 0, machines: 0 } });
const TREE = { screen: 'items', all: true, hiddenCount: 0, levels: ['Family', 'Subfamily', 'Variant'], leafDepth: 2, roots: [tnode(1, 'Steel', 0, [tnode(12, 'Plates', 1, [tnode(13, 'E350', 2)])])] };
let ledger = { ok: true, checked: 12, differences: [], units: { ok: true, liveUnits: 7, differences: [] } };

const calls = [];
globalThis.__routes = [
  ['GET', /^\/stock\/view\/lots\?/, () => LOTS],
  ['GET', /^\/stock\/view(\?|$)/, () => ({ rows: ROWS, total: 5, limit: 100, offset: 0, hasMore: false, counts: COUNTS, totals: TOTALS, scrapRate: SCRAP_RATE })],
  ['GET', /^\/stock\/units\/201$/, () => UNIT_DETAIL],
  ['GET', /^\/stock\/units\/205$/, () => STIF_DETAIL],
  ['GET', /^\/stock\/units\?/, () => ({ rows: UNITS, total: 2, limit: 50, offset: 0, hasMore: false, counts: { status: { in_process: 2 } } })],
  ['GET', /^\/stock\/scrap-rate$/, () => SCRAP_RATE],
  ['PUT', /^\/stock\/scrap-rate$/, ({ body }) => ({ ratePerKg: body.ratePerKg, currency: 'INR', note: null })],
  ['GET', /^\/stock\/check$/, () => ledger],
  ['GET', /^\/stocking-areas$/, () => AREAS],
  ['GET', /^\/classification\?screen=items&all=1$/, () => TREE],
  ['GET', /^\/cut-places$/, () => ({ plate: { blanksNode: null, offcutNode: null, stockNodes: [] }, section: { blanksNode: null, offcutNode: null, stockNodes: [] }, sectionSettings: { sawKerfMm: null, endTrimMm: null, minOffcutMm: null }, problems: [], flows: { plate: null, section: null } })],
  ['GET', /^\/flows/, () => []],
];
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
  '@shared/ui': `export * from ${JSON.stringify(resolve('src/shared/ui/SheetGrid.tsx').split('\\').join('/'))}; export * from ${JSON.stringify(resolve('src/shared/ui/storage.ts').split('\\').join('/'))};`,
};
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter, Routes, Route } from 'react-router-dom';
      export { React, createRoot, MemoryRouter, Routes, Route };
      export { default as Stock } from './src/apps/cf_erp/pages/Stock';
      export { default as Cutting } from './src/apps/cf_erp/pages/Cutting';
      export { ToastContext } from './src/apps/cf_erp/components/toastContext';
      export { ledgerCheckMessage, quantitiesText } from './src/apps/cf_erp/lib/stockView';`,
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
const artifact = resolve(cache, `inventory-v2-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter, Routes, Route } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async (ms = 40) => React.act(async () => { await sleep(ms); });
const click = async (el) => { assert.ok(el, 'nothing to click'); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await settle(); };
const button = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
const chip = (label) => [...document.querySelectorAll('button')].find((b) => b.firstChild?.textContent === label || b.textContent.replace(/\d+$/, '').trim() === label);
const setValue = async (input, value) => {
  await React.act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await sleep(0);
  });
};
const text = () => document.body.textContent;
const viewCalls = (since = 0) => calls.slice(since).filter((c) => c.method === 'GET' && /^\/stock\/view(\?|$)/.test(c.path));
const lastView = () => new URLSearchParams(viewCalls().at(-1).path.split('?')[1] ?? '');

let root;
const toasts = [];
const mount = async (path, routePath, element) => {
  if (root) await React.act(async () => { root.unmount(); });
  document.getElementById('app').innerHTML = '';
  root = createRoot(document.getElementById('app'));
  await React.act(async () => {
    root.render(React.createElement(m.ToastContext.Provider, { value: { success: (t) => toasts.push(t), error: (t) => toasts.push(`ERR ${t}`), info: () => {} } },
      React.createElement(MemoryRouter, { initialEntries: [path] },
        React.createElement(Routes, null, React.createElement(Route, { path: routePath, element })))));
    await sleep(40);
  });
  await settle(80);
};
const mountStock = (qs = '') => mount(`/acme/cf_erp/stock${qs}`, '/:company/cf_erp/stock', React.createElement(m.Stock));

// ── 1. filters go to the server ────────────────────────────────────────────
await check('the URL filters reach GET /stock/view (category, owner, kind, tracking, classification, area), paged', async () => {
  calls.length = 0;
  await mountStock('?counts=available&owner=ours&kind=custom&tracking=batch&classificationId=12&areaId=1');
  const q = lastView();
  assert.equal(q.get('category'), 'available'); assert.equal(q.get('owner'), 'ours'); assert.equal(q.get('kind'), 'custom');
  assert.equal(q.get('tracking'), 'batch'); assert.equal(q.get('classificationId'), '12'); assert.equal(q.get('areaId'), '1');
  assert.equal(q.get('limit'), '100'); assert.equal(q.get('offset'), '0');
  assert.equal(document.querySelector('[data-testid="classification-filter"]').value, 'Steel › Plates', 'the picker shows the branch path');
  assert.equal(document.querySelector('[data-testid="area-filter"]').value, 'MAIN · MAIN area');
});

await check('chips and the search box send their filter', async () => {
  await mountStock();
  let since = calls.length;
  await click(chip('Scrap'));
  assert.equal(lastView().get('category'), 'scrap');
  await click(chip('Ours'));
  assert.equal(lastView().get('owner'), 'ours');
  await click(chip("All customers'"));
  assert.equal(lastView().get('owner'), 'customer');
  await click(chip("Acme Infra's"));
  assert.equal(lastView().get('owner'), '50');
  await click(chip('Standard (catalog)'));
  assert.equal(lastView().get('kind'), 'standard');
  await click(chip('Piece by piece'));
  assert.equal(lastView().get('tracking'), 'individual');
  since = calls.length;
  await setValue(document.querySelector('input[aria-label="Search item or lot"]'), 'GDR');
  await settle(350);
  assert.ok(viewCalls(since).length >= 1, 'the search asks again');
  assert.equal(lastView().get('search'), 'GDR');
});

await check('a column header sorts on the server', async () => {
  await mountStock();
  await click(document.querySelector('[data-sort="qty"]'));
  assert.equal(lastView().get('sort'), 'qty'); assert.equal(lastView().get('dir'), 'asc');
  await click(document.querySelector('[data-sort="qty"]'));
  assert.equal(lastView().get('dir'), 'desc');
});

// ── 2. the table ───────────────────────────────────────────────────────────
await check('a heading per tracking mode, in order', async () => {
  await mountStock();
  const h = [...document.querySelectorAll('[data-testid="tracking-heading"]')].map((e) => e.textContent);
  assert.deepEqual(h, ['Counted by quantity — one total per item and area', 'Kept in lots', 'Tracked piece by piece']);
  assert.equal(document.querySelectorAll('[data-testid="stock-row"]').length, 5);
  const t = text();
  assert.match(t, /Raw \/ available/); assert.match(t, /In process \(WIP\)/); assert.match(t, /custom/);
  assert.match(t, /theirs/); assert.match(t, /ref\. ₹90,000/);
  assert.ok(document.querySelector('[data-testid="scrap-note"]'), 'the scrap row says it has no rate');
});

const rowEl = (key) => document.querySelector(`[data-testid="stock-row"][data-key="${key}"]`);
await check('a quantity row has no expander; a lot row opens to its lots, lazily', async () => {
  await mountStock();
  assert.equal(rowEl('q1').querySelector('[data-testid="row-expand"]'), null);
  assert.equal(rowEl('q2').querySelector('[data-testid="row-expand"]'), null);
  const before = calls.filter((c) => /\/stock\/view\/lots/.test(c.path)).length;
  assert.equal(before, 0, 'nothing asked before it opens');
  await click(rowEl('b1').querySelector('[data-testid="row-expand"]'));
  const lotCalls = calls.filter((c) => /\/stock\/view\/lots/.test(c.path));
  assert.equal(lotCalls.length, 1);
  const q = new URLSearchParams(lotCalls[0].path.split('?')[1]);
  assert.equal(q.get('itemId'), '3'); assert.equal(q.get('areaId'), '1'); assert.equal(q.get('owner'), 'ours'); assert.equal(q.get('category'), 'available');
  const lots = [...document.querySelectorAll('[data-testid="lot-row"]')].map((e) => e.textContent);
  assert.equal(lots.length, 2); assert.match(lots[0], /B-PL-1/); assert.match(lots[1], /OFC-10-0009/);
  await click(rowEl('b1').querySelector('[data-testid="row-expand"]'));
  await click(rowEl('b1').querySelector('[data-testid="row-expand"]'));
  assert.equal(calls.filter((c) => /\/stock\/view\/lots/.test(c.path)).length, 1, 'opened again without asking again');
  await click(rowEl('b2').querySelector('[data-testid="row-expand"]'));
  const q2 = new URLSearchParams(calls.filter((c) => /\/stock\/view\/lots/.test(c.path)).at(-1).path.split('?')[1]);
  assert.equal(q2.get('owner'), '50', "a customer's row asks for their lots");
});

await check('a piece row opens to its pieces, and a piece opens its history (oldest first, inside, made again)', async () => {
  await mountStock();
  await click(rowEl('i1').querySelector('[data-testid="row-expand"]'));
  const u = calls.filter((c) => /^\/stock\/units\?/.test(c.path)).at(-1);
  const q = new URLSearchParams(u.path.split('?')[1]);
  assert.equal(q.get('paged'), '1'); assert.equal(q.get('itemId'), '4'); assert.equal(q.get('areaId'), '1'); assert.equal(q.get('owner'), 'ours'); assert.equal(q.get('status'), 'live');
  const pieces = document.querySelectorAll('[data-testid="piece-row"]');
  assert.equal(pieces.length, 2);
  assert.match(document.querySelector('[data-testid="pieces-panel"]').textContent, /WIP-81.*SO-1 · line 2/);
  await click(pieces[0]);
  await settle(60);
  const dlg = document.querySelector('[data-testid="piece-dialog"]');
  assert.ok(dlg, 'the dialog opens');
  const ev = [...dlg.querySelectorAll('[data-testid="piece-event"]')].map((e) => e.textContent);
  assert.equal(ev.length, 2); assert.match(ev[0], /Made/); assert.match(ev[1], /Moved · MV-900 · MAIN → WIP/);
  assert.ok([...dlg.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/acme/cf_erp/movements/900'));
  assert.match(dlg.querySelector('[data-testid="piece-replaces"]').textContent, /Made again in place of GDR-01-OLD/);
  assert.match(dlg.textContent, /ASM-1/);
  const inside = dlg.querySelectorAll('[data-testid="piece-inside"]');
  assert.equal(inside.length, 1);
  await click(inside[0].querySelector('[data-testid="piece-link"]'));
  await settle(60);
  assert.ok(calls.some((c) => c.path === '/stock/units/205'), 'the inside piece opens its own history');
  assert.match(document.querySelector('[data-testid="piece-dialog"]').textContent, /Stiffener/);
  await click(button('Close'));
});

// ── 3. totals by owner ─────────────────────────────────────────────────────
await check('ours: value, kg, the no-cost hint, scrap kg and the no-scrap-rate sentence', async () => {
  await mountStock();
  const ours = document.querySelector('[data-testid="totals-ours"]').textContent;
  assert.match(ours, /₹4,27,000/); assert.match(ours, /6,340 kg/); assert.match(ours, /Some has no cost/);
  assert.match(document.querySelector('[data-testid="ours-scrap"]').textContent, /Scrap 340 kg.*No scrap rate set — scrap is valued at 0\./);
});

await check("a customer card shows kg, quantities per unit and a reference value; clicking it filters to them", async () => {
  await mountStock();
  const card = document.querySelector('[data-testid="totals-customer"]');
  const t = card.textContent;
  assert.match(t, /Acme Infra/); assert.match(t, /1,500 kg/); assert.match(t, /4 nos/); assert.match(t, /₹90,000 reference value — not ours/);
  await click(card);
  assert.equal(lastView().get('owner'), '50');
  await click(document.querySelector('[data-testid="held-by-customer"] button'));
  assert.equal(lastView().get('owner'), null, 'the held line toggles it off again');
  await click(document.querySelector('[data-testid="held-by-customer"] button'));
  assert.equal(lastView().get('owner'), '50');
});

await check('quantitiesText never sums across units (tonnes read as kg)', () => {
  assert.equal(m.quantitiesText({ quantities: [{ uom: 't', quantity: 1.5 }, { uom: 'kg', quantity: 500 }, { uom: 'nos', quantity: 3 }] }), '2,000 kg, 3 nos');
});

// ── 4. check ledger ───────────────────────────────────────────────────────
await check('Check ledger says which part disagrees', async () => {
  await mountStock();
  toasts.length = 0;
  await click(button('Check ledger')); await settle(40);
  assert.match(toasts.at(-1), /^Ledger checked: all 12 balances agree with their movements\. All 7 pieces agree with their lots\./);
  ledger = { ok: false, checked: 12, differences: [], units: { ok: false, liveUnits: 7, differences: [{ batchId: 1, areaId: 1, balance: 3, units: 2 }] } };
  await click(button('Check ledger')); await settle(40);
  assert.match(toasts.at(-1), /^ERR 1 lot does not match its pieces\./);
  ledger = { ok: false, checked: 12, differences: [{ areaId: 1, itemId: 1, batchId: null, ledger: 2, balance: 3 }, { areaId: 1, itemId: 2, batchId: null, ledger: 2, balance: 3 }], units: { ok: true, liveUnits: 7, differences: [] } };
  await click(button('Check ledger')); await settle(40);
  assert.match(toasts.at(-1), /^ERR 2 balances disagree with the ledger\. Tell/);
  assert.doesNotMatch(toasts.at(-1), /pieces/);
});

// ── 5. source checks ───────────────────────────────────────────────────────
await check('Stock.tsx keeps the MR strings (Ours, All customers\', held-by-customer)', async () => {
  const s = await readFile('src/apps/cf_erp/pages/Stock.tsx', 'utf8');
  assert.match(s, /label="Ours"/); assert.match(s, /label="All customers'"/); assert.match(s, /data-testid="held-by-customer"/);
  assert.match(s, /MovementButtons/); assert.match(s, /useUrlParam\('areaId'/);
});

// ── 6. Setup › Cutting: scrap rate ────────────────────────────────────────
await check('Setup › Cutting shows the scrap rate card and saves it with PUT', async () => {
  await mount('/acme/cf_erp/cutting', '/:company/cf_erp/cutting', React.createElement(m.Cutting));
  const card = document.querySelector('[data-testid="scrap-rate-card"]');
  assert.ok(card);
  assert.match(card.textContent, /Scrap rate \(₹\/kg\)/);
  assert.match(card.textContent, /Our scrap is valued at this rate\. Leave it empty if it is not decided — scrap is then valued at 0\./);
  assert.match(document.querySelector('[data-testid="scrap-rate-note"]').textContent, /No scrap rate set/);
  await setValue(document.querySelector('[data-testid="scrap-rate-input"]'), '28.5');
  const since = calls.length;
  await click(button('Save scrap rate')); await settle(40);
  const put = calls.slice(since).find((c) => c.method === 'PUT' && c.path === '/stock/scrap-rate');
  assert.ok(put, 'PUT sent'); assert.deepEqual(put.body, { ratePerKg: 28.5 });
  assert.equal(document.querySelector('[data-testid="scrap-rate-note"]'), null, 'the note goes once a rate is set');
  await setValue(document.querySelector('[data-testid="scrap-rate-input"]'), '');
  await click(button('Save scrap rate')); await settle(40);
  assert.deepEqual(calls.filter((c) => c.method === 'PUT').at(-1).body, { ratePerKg: null }, 'empty = not set');
});

if (root) await React.act(async () => { root.unmount(); });
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 50);
