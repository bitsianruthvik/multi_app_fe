// Run from multi_app_fe: node scripts/cf_erp_production_orders_test.mjs
// STEP 4 (§76): the sales order's Production step (components/ProductionOrders/ProductionStep — times with the
// Operation time | Setup time toggle, "Override all times to N s", Create / Release all / Release / Dispatch), the
// Production orders page (pages/ProductionOrders — states, release all, older releases), the production order page
// and the pure words (lib/productionOrders) — against a pretend API. DOM-level; it does not replace a look in a browser.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/orders/5', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  try { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true }); } catch { /* skip */ }
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = (q) => ({ matches: /min-width/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
globalThis.matchMedia = dom.window.matchMedia;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const calls = [];
let routes = {};
globalThis.fetch = async (url, o = {}) => {
  calls.push({ url: String(url), method: o.method || 'GET', body: o.body ?? null });
  const key = `${o.method || 'GET'} `;
  const hit = Object.keys(routes).filter((k) => (k.startsWith(key) ? String(url).includes(k.slice(key.length)) : false)).sort((a, b) => b.length - a.length)[0];
  if (!hit) return { ok: false, status: 404, text: async () => 'no route' };
  const body = typeof routes[hit] === 'function' ? routes[hit](String(url), o.body) : routes[hit];
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
};
const stubs = {
  '@core/api/client': `export async function apiFetch(url, o = {}) {
    const res = await globalThis.fetch(url, { method: o.method || 'GET', body: o.body });
    const text = await res.text();
    if (!res.ok) throw new Error('API request failed: ' + res.status + ' x - ' + text);
    return JSON.parse(text);
  }`,
  '@core/contexts/AuthContext': `export const useAuth = () => ({ user: { id: 7, uiPermissions: ['cf_erp_production_view', 'cf_erp_production_manage', 'cf_erp_inventory_manage'] } });`,
};
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter, Routes, Route } from 'react-router-dom';
      export { React, createRoot, MemoryRouter, Routes, Route };
      export * from './src/apps/cf_erp/lib/productionOrders';
      export { ProductionStep } from './src/apps/cf_erp/components/ProductionOrders/ProductionStep';
      export { default as ProductionOrders } from './src/apps/cf_erp/pages/ProductionOrders';
      export { default as ProductionOrderDetail } from './src/apps/cf_erp/pages/ProductionOrderDetail';
      export { pieceLine } from './src/apps/cf_erp/components/Floor/floorModel';
      export { toStep } from './src/apps/cf_erp/api/floor';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/(api\/client|contexts\/AuthContext)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
  } }],
  alias: { '@shared/ui': resolve('src/shared/ui/SheetGrid.tsx') },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `production-orders-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter, Routes, Route } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = (ms = 30) => React.act(async () => { await sleep(ms); });
const waitFor = async (cond, what, ms = 3000) => {
  const end = Date.now() + ms;
  for (;;) { let ok = false; try { ok = !!cond(); } catch { /* */ } if (ok) return; if (Date.now() > end) throw new Error(`timed out waiting for ${what}`); await settle(20); }
};
const app = document.getElementById('app');
const render = async (el, path = '/testco/cf_erp/orders/5', pattern = '/:company/cf_erp/*') => {
  app.replaceChildren(); const host = document.createElement('div'); app.appendChild(host); const root = createRoot(host);
  await React.act(async () => { root.render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Routes, null, React.createElement(Route, { path: pattern, element: el })))); await sleep(0); });
  await settle(); return root;
};
const click = async (el, what) => { assert.ok(el, `no ${what} to click`); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await settle(); };
const $ = (sel) => app.querySelector(sel);
const $$ = (sel) => [...app.querySelectorAll(sel)];
const setInput = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await React.act(async () => { setter.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(0); });
};
const bodyOf = (c) => (c.body == null ? null : typeof c.body === 'string' ? JSON.parse(c.body) : c.body);

// ── fixtures ────────────────────────────────────────────────────────────────
const po = (id, seq, state, extra = {}) => ({
  id, code: `SO260014-P0${seq}`, label: `SO260014 · Span ${seq} of 3`, seq, order: { id: 5, code: 'SO260014', status: 'confirmed', type: 'customer', title: 'Bridge', customer: { id: 4, name: 'Rail Co' } },
  level: 'unit', levelId: null, line: { id: 7, lineNo: 1 }, lineIds: [7], unitNo: seq, scopeKey: `L7U${seq}`, dispatch: { level: 'same', levelId: null },
  status: state === 'yet_to_plan' ? 'yet_to_plan' : state === 'closed' ? 'closed' : 'planned', state, stateLabel: state,
  progress: { pct: state === 'dispatch' ? 100 : 25, basis: 'minutes', steps: 4, done: state === 'dispatch' ? 4 : 1, onHold: 0, started: 1, minutes: 10, minutesDone: 2.5 },
  units: [{ lineId: 7, units: 1, finished: state === 'dispatch' ? 1 : 0, shipped: 0 }], releasedAt: state === 'yet_to_plan' ? null : '2026-10-18', releasedBy: 'Test', dispatchedAt: null,
  actions: { release: state === 'yet_to_plan', takeBack: state === 'planned', dispatch: state === 'dispatch' }, ...extra,
});
const ORDER = { id: 5, code: 'SO260014', status: 'confirmed', lines: [{ id: 7, lineNo: 1, lineType: 'custom', quantity: 3, item: { id: 70, code: null, name: 'Span' } }] };
const TIMES = {
  line: { id: 7, lineNo: 1, released: false, editable: true }, orderOverrideSeconds: null,
  operations: [{ id: 31, code: 'CUT', name: 'Cutting' }],
  rows: [{ key: 'r', bomLineId: null, itemId: 70, parentKey: null, depth: 0, name: 'Span', code: null, qtyPerParent: 3, totalQty: 3, flowName: 'F',
    cells: { 31: { work: 2, setup: 1, formulaWork: 2, formulaSetup: 1, overridden: false, setupOverridden: false, machine: 'Plasma', missing: null, passes: 1 } } }],
  totals: { byOperation: { 31: 9 }, all: 9 },
};

await check('words: states, progress, actions, the override field', async () => {
  assert.equal(m.PO_STATE.yet_to_plan.label, 'Yet to plan');
  assert.deepEqual(Object.values(m.PO_STATE).map((s) => s.label), ['Yet to plan', 'Planned', 'In production', 'Dispatch', 'Closed']);
  assert.equal(m.progressText({ steps: 8, done: 3, pct: 37.5 }), '3 of 8 steps · 38 %');
  assert.equal(m.progressText({ steps: 0, done: 0, pct: 0 }), 'no steps');
  assert.equal(m.nextAction({ actions: { release: true, takeBack: false, dispatch: false }, state: 'yet_to_plan' }), 'release');
  assert.equal(m.nextAction({ actions: { release: false, takeBack: false, dispatch: true }, state: 'dispatch' }), 'dispatch');
  assert.deepEqual(m.releasableIds([po(1, 1, 'yet_to_plan'), po(2, 2, 'planned'), po(3, 3, 'yet_to_plan')]), [1, 3]);
  assert.equal(m.readOverride(''), null, 'blank = off');
  assert.equal(m.readOverride(' 0,1 '), 0.1, 'a comma is a decimal point');
  assert.equal(m.readOverride('-2'), undefined);
  assert.equal(m.readOverride('abc'), undefined);
  assert.equal(m.createLabel(1), 'Create the production order');
  assert.equal(m.createLabel(3), 'Create 3 production orders');
  assert.equal(m.trackerPathOf(9), 'tracker?order=w9');
  assert.equal(m.releaseToast(['SO260014-P01'], []), 'SO260014-P01 released — it is on the floor.');
  assert.equal(m.releaseToast(['A', 'B'], [{ lineId: 7, requisition: { id: 1, code: 'MR-1' }, reserved: [{ item: { id: 1, code: 'MA', name: 'MA', uom: 'kg' }, quantity: 4 }], left: [] }]),
    'Released 2 production orders — they are on the floor. Material from MR-1: MA 4 kg reserved for production.', 'the MR\'s words stay');
});

await check('floor: a job names its production order', async () => {
  const s = m.toStep({ id: 1, pieceName: 'Web plate', pieceCode: 'SPAN-01-W1', operation: 'Cut', productionOrder: { id: 3, code: 'SO260014-P02' } });
  assert.equal(s.productionOrderCode, 'SO260014-P02');
  assert.equal(m.pieceLine(s), 'Web plate · SPAN-01-W1 · SO260014-P02');
  assert.equal(m.pieceLine(m.toStep({ id: 1, pieceName: 'Web plate', pieceCode: 'W1' })), 'Web plate · W1', 'an older release: no production order');
});

await check('Production step: times (setup per piece, toggle), create, release all, release one, dispatch, override', async () => {
  let list = [];
  let toCreate = { count: 3, labels: ['SO260014 · Span 1 of 3', 'SO260014 · Span 2 of 3', 'SO260014 · Span 3 of 3'], why: null };
  let override = null;
  routes = {
    'GET /orders/5/production-orders': () => ({ order: { id: 5, code: 'SO260014', status: 'confirmed', type: 'customer', timeOverrideSeconds: override }, productionOrders: list,
      counts: {}, toCreate, legacy: [{ releaseId: 40, lineId: 8, lineNo: 2, releasedAt: '2026-10-01' }] }),
    'GET /orders/5/lines/7/times': () => ({ ...TIMES, orderOverrideSeconds: override }),
    'POST /orders/5/production-orders': () => { list = [po(1, 1, 'yet_to_plan'), po(2, 2, 'yet_to_plan'), po(3, 3, 'dispatch')]; toCreate = { count: 0, labels: [], why: null }; return { created: 3 }; },
    'POST /production-orders/release': (u, b) => { const ids = (typeof b === 'string' ? JSON.parse(b) : b).ids; list = list.map((p) => (ids.includes(p.id) ? po(p.id, p.seq, 'planned') : p)); return { released: ids.map(String), productionOrders: [] }; },
    'POST /production-orders/3/dispatch': () => { list = list.map((p) => (p.id === 3 ? po(3, 3, 'closed') : p)); return { closed: true, shipments: [] }; },
    'PUT /orders/5/time-override': (u, b) => { override = (typeof b === 'string' ? JSON.parse(b) : b).seconds; return { timeOverrideSeconds: override, retimed: 12 }; },
  };
  calls.length = 0;
  window.localStorage.removeItem('cf_erp.fullScreen.production-step');
  const root = await render(React.createElement(m.ProductionStep, { order: ORDER }));
  await waitFor(() => $('[data-testid="po-create"]'), 'the Create button');
  assert.match($('[data-testid="po-create"]').textContent, /Create 3 production orders/);
  assert.match(app.textContent, /Operation minutes per piece/, 'times start on operation time');
  assert.match(app.textContent, /Split by AI/, 'what our algorithm did says "by AI"');
  assert.match($('[data-testid="po-legacy"]').textContent, /line 2/, 'older releases are named, read-only');
  await click($('[data-testid="times-setup"]'), 'Setup time');
  await waitFor(() => /Setup minutes per piece/.test(app.textContent), 'the setup view');
  assert.ok($('[data-testid="full-screen-toggle"]'), 'full screen is offered');
  await click($('[data-testid="full-screen-toggle"]'), 'full screen');
  assert.ok(document.querySelector('[data-testid="full-screen-frame"]'), 'the step fills the window');
  await click(document.querySelector('[data-testid="full-screen-toggle"]'), 'exit full screen');

  await click($('[data-testid="po-create"]'), 'Create');
  await waitFor(() => $$('[data-testid="po-row"]').length === 3, 'three production orders');
  assert.ok(calls.some((c) => c.method === 'POST' && c.url.endsWith('/orders/5/production-orders')));
  assert.deepEqual($$('[data-testid="po-row"]').map((r) => r.getAttribute('data-state')), ['yet_to_plan', 'yet_to_plan', 'dispatch']);
  assert.match($$('[data-testid="po-row"]')[1].textContent, /SO260014 · Span 2 of 3/);
  assert.match($('[data-testid="po-release-all"]').textContent, /Release all \(2\)/);
  await click($('[data-testid="po-release-all"]'), 'Release all');
  await waitFor(() => $$('[data-testid="po-row"]')[0].getAttribute('data-state') === 'planned', 'released');
  const rel = calls.filter((c) => c.url.endsWith('/production-orders/release')).at(-1);
  assert.deepEqual(bodyOf(rel).ids, [1, 2], 'one call releases both');
  assert.equal($('[data-testid="po-release-all"]'), null, 'nothing left to release');
  await click($('[data-testid="po-dispatch"]'), 'Dispatch');
  await waitFor(() => $$('[data-testid="po-row"]')[2].getAttribute('data-state') === 'closed', 'dispatched');

  const field = $('[data-testid="time-override"]');
  await setInput(field, '0.1');
  await React.act(async () => { field.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(0); });
  await waitFor(() => calls.some((c) => c.method === 'PUT' && c.url.endsWith('/orders/5/time-override')), 'the override saved');
  assert.equal(bodyOf(calls.find((c) => c.method === 'PUT')).seconds, 0.1);
  await waitFor(() => /overridden to 0.1 s a piece/.test(app.textContent), 'the times say the override is in force');
  await React.act(async () => root.unmount());
});

await check('Production step: Create is held back with the reason', async () => {
  routes = {
    'GET /orders/5/production-orders': () => ({ order: { id: 5, code: 'SO260014', status: 'quoted', type: 'customer', timeOverrideSeconds: null }, productionOrders: [], counts: {},
      toCreate: { count: 1, labels: ['SO260014 · Span ×3'], why: "Production orders are made once the customer's acceptance is approved (the order is confirmed)." }, legacy: [] }),
    'GET /orders/5/lines/7/times': TIMES,
  };
  const root = await render(React.createElement(m.ProductionStep, { order: ORDER }));
  await waitFor(() => $('[data-testid="po-create"]'), 'the Create button');
  assert.equal($('[data-testid="po-create"]').disabled, true);
  assert.match(app.textContent, /acceptance is approved/);
  await React.act(async () => root.unmount());
});

await check('Production orders page: states, release all on the page, older releases at the foot', async () => {
  let rows = [po(1, 1, 'yet_to_plan'), po(2, 2, 'in_production')];
  routes = {
    'GET /production-orders': () => ({ rows: [{ order: rows[0].order, productionOrders: rows }], total: 1, limit: 20, offset: 0, hasMore: false,
      counts: { open: 2, all: 2, yet_to_plan: 1, planned: 0, in_production: 1, dispatch: 0, closed: 0 }, state: 'open', states: [],
      legacy: [{ releaseId: 40, order: { id: 6, code: 'SO-OLD' }, line: { id: 9, lineNo: 1 }, itemName: 'Girder', releasedAt: '2026-10-01', steps: 10, done: 4 }] }),
    'POST /production-orders/release': () => { rows = rows.map((p) => (p.id === 1 ? po(1, 1, 'planned') : p)); return { released: ['SO260014-P01'], productionOrders: [] }; },
  };
  calls.length = 0;
  const root = await render(React.createElement(m.ProductionOrders), '/testco/cf_erp/production-orders');
  await waitFor(() => $$('[data-testid="po-line"]').length === 2, 'two rows');
  assert.match(calls[0].url, /state=open/, 'opens on the open ones');
  assert.deepEqual($$('[data-testid="po-line"]').map((r) => r.getAttribute('data-state')), ['yet_to_plan', 'in_production']);
  assert.match($$('[data-testid="po-line"]')[1].textContent, /In production/);
  assert.match($('[data-testid="po-legacy"]').textContent, /SO-OLD.*4 of 10 steps/);
  await click($('[data-testid="po-page-release-all"]'), 'Release all yet to plan');
  await waitFor(() => $$('[data-testid="po-line"]')[0].getAttribute('data-state') === 'planned', 'released');
  await React.act(async () => root.unmount());
});

await check('Production order page: head, actions, pieces with their steps', async () => {
  routes = {
    'GET /production-orders/2': () => ({ ...po(2, 2, 'planned'), releases: [{ id: 40, lineId: 7 }], piecesTotal: 1,
      pieces: [{ id: 501, label: 'SPAN-02', code: 'SPAN-02', depth: 0, status: 'ready', steps: [{ id: 9, label: 'x', operation: { id: 31, code: 'CUT', name: 'Cutting' }, state: 'pending', status: 'ready', quantity: 1, qtyGood: 0, effMinutes: 1, machine: null, blockers: [] }] }] }),
  };
  const root = await render(React.createElement(m.ProductionOrderDetail), '/testco/cf_erp/production-orders/2', '/:company/cf_erp/production-orders/:id');
  await waitFor(() => $('[data-testid="po-pieces"]'), 'the pieces');
  assert.match(app.textContent, /SO260014-P02/);
  assert.match(app.textContent, /SO260014 · Span 2 of 3/);
  assert.match(app.textContent, /Take back/, 'planned and not started: it can be taken back');
  assert.match(app.textContent, /Open in Tracker/);
  assert.match($('[data-testid="po-pieces"]').textContent, /CUT 0\/1/);
  await React.act(async () => root.unmount());
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
