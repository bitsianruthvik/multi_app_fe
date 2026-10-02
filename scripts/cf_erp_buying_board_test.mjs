// Run from multi_app_fe: node scripts/cf_erp_buying_board_test.mjs
// The Buying board (Inventory › Buying): columns render from a fixture with counts and values ("not priced", never ₹0),
// "N more" links to the list; the page's filters go to the SERVER as query params (supplier, order, closed from the URL,
// search debounced); the stage bar on a document highlights its stage and links the documents before and after it; the
// order's Buying stage lists what is still to raise and raises a purchase request from exactly those rows.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/buying', pretendToBeVisual: true });
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

// Every API call is recorded; the answer comes from globalThis.__respond(url, opts).
globalThis.__calls = [];
const stubs = {
  '@core/api/client': 'export async function apiFetch(url, opts = {}) { globalThis.__calls.push({ url, method: opts.method ?? "GET", body: opts.body }); return globalThis.__respond(url, opts); }',
  '@core/contexts/AuthContext': 'export const useAuth = () => ({ user: null });',
};
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter, Routes, Route } from 'react-router-dom';
      export { React, createRoot, MemoryRouter, Routes, Route };
      export * from './src/apps/cf_erp/lib/buying';
      export { BuyingBoardView } from './src/apps/cf_erp/components/Buying/BuyingBoardView';
      export { BuyingStageBarView } from './src/apps/cf_erp/components/Buying/BuyingStageBar';
      export { OrderBuyingPanel } from './src/apps/cf_erp/components/Buying/OrderBuyingPanel';
      export { default as BuyingPage } from './src/apps/cf_erp/pages/Buying';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/(api\/client|contexts\/AuthContext)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
  } }],
  alias: { '@shared/ui': resolve('src/shared/ui/SheetGrid.tsx') },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error',
  loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{"VITE_API_HOST":"http://localhost:4000"}' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `buying-board-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter, Routes, Route } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const app = document.getElementById('app');
const render = async (el, entry = '/testco/cf_erp/buying') => {
  app.replaceChildren(); const host = document.createElement('div'); app.appendChild(host); const root = createRoot(host);
  await React.act(async () => {
    root.render(React.createElement(MemoryRouter, { initialEntries: [entry] },
      React.createElement(Routes, null,
        React.createElement(Route, { path: '/:company/cf_erp/*', element: el }))));
    await sleep(0);
  });
  await React.act(async () => { await sleep(40); });
  return root;
};
const click = async (el) => { assert.ok(el, 'nothing to click'); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await React.act(async () => { await sleep(30); }); };
const all = (sel) => [...document.querySelectorAll(sel)];
const q = (sel) => document.querySelector(sel);
const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

// ── fixtures ─────────────────────────────────────────────────────────────
const STAGES = [
  ['to_buy', 'To buy'], ['requested', 'Requested'], ['approved', 'Approved'], ['rfq_out', 'RFQ out'], ['quotes_in', 'Quotes in'],
  ['awarded', 'Awarded'], ['ordered', 'Ordered'], ['part_received', 'Part received'], ['received', 'Received'],
].map(([key, label]) => ({ key, label, hint: `${label} hint` }));
const card = (over) => ({
  type: 'po', id: 1, code: 'PO-000001', status: 'ordered', statusLabel: 'Ordered', column: 'ordered', stage: 'ordered', ended: null,
  party: { role: 'Supplier', id: 9, name: 'Steel Co' }, items: 2, value: 550, valueState: 'full', valueBasis: 'ordered', unpricedLines: 0,
  currency: 'INR', since: '2026-09-28T00:00:00Z', ageDays: 4, due: { date: '2026-09-30', overdue: true }, tags: [], link: 'purchase-orders/1', ...over,
});
const column = (key, cards, over = {}) => ({
  key, label: STAGES.find((s) => s.key === key)?.label ?? 'Closed / cancelled', hint: 'h', count: cards.length, currency: 'INR',
  value: cards.some((c) => c.value != null) ? cards.reduce((t, c) => t + (c.value ?? 0), 0) : null,
  unpriced: cards.filter((c) => c.valueState !== 'full').length, cards, more: 0, moreLink: { path: 'purchase-orders', query: { status: key } }, ...over,
});
const boardFixture = (over = {}) => ({
  stages: STAGES,
  columns: [
    column('to_buy', [card({ type: 'to_buy', id: 0, code: '3 items short', column: 'to_buy', stage: 'to_buy', party: null, items: 3, value: 380, valueState: 'part', unpricedLines: 1, ageDays: null, due: null, link: 'buy-list' })], { count: 3, moreLink: { path: 'buy-list', query: {} } }),
    column('requested', [card({ type: 'request', id: 11, code: 'PR-000011', status: 'submitted', statusLabel: 'Waiting for approval', column: 'requested', stage: 'requested', party: { role: 'Asked by', id: 1, name: 'Asha' }, value: null, valueState: 'none', unpricedLines: 2, link: 'purchase-requests/11', tags: ['Waiting for approval'] })]),
    column('approved', []),
    column('rfq_out', [card({ type: 'rfq', id: 21, code: 'RFQ-000021', status: 'sent', column: 'rfq_out', stage: 'rfq_out', link: 'rfqs/21', value: 900, valueBasis: 'estimate' })]),
    column('quotes_in', []),
    column('awarded', []),
    column('ordered', [card({}), card({ id: 2, code: 'PO-000002', value: 100 })], { count: 7, more: 5, value: 2000 }),
    column('part_received', []),
    column('received', []),
  ],
  filters: { supplier: null, order: null, search: null, includeClosed: false },
  toBuy: { items: 3, value: 380, unpricedItems: 1, currency: 'INR' },
  generatedAt: '2026-10-02T00:00:00Z',
  ...over,
});

// ── the board view ───────────────────────────────────────────────────────
await check('board: nine columns in stage order, counts and values from the server', async () => {
  await render(React.createElement(m.BuyingBoardView, { columns: boardFixture().columns }));
  const cols = all('[data-testid="board-column"]');
  assert.deepEqual(cols.map((c) => c.dataset.key), STAGES.map((s) => s.key));
  const ordered = cols.find((c) => c.dataset.key === 'ordered');
  assert.equal(text(ordered.querySelector('[data-testid="column-count"]')), '7', 'the count covers cards beyond the cap');
  assert.match(text(ordered.querySelector('[data-testid="column-value"]')), /2,000/);
  assert.equal(ordered.querySelectorAll('[data-testid="board-card"]').length, 2);
});
await check('board: a card shows code link, party, items, value, age and an overdue date', async () => {
  const c = q('[data-testid="board-card"][data-type="po"][data-id="1"]');
  assert.ok(c);
  assert.equal(c.querySelector('a').getAttribute('href'), '/testco/cf_erp/purchase-orders/1');
  assert.match(text(c), /Steel Co/);
  assert.match(text(c), /2 items/);
  assert.match(text(c.querySelector('[data-testid="card-value"]')), /550/);
  assert.match(text(c), /4 days/);
  assert.match(text(c), /overdue 2026-09-30/);
});
await check('board: an unpriced card and column read "not priced", never ₹0', async () => {
  const pr = q('[data-testid="board-card"][data-type="request"]');
  assert.equal(text(pr.querySelector('[data-testid="card-value"]')), 'not priced');
  assert.equal(text(q('[data-testid="board-column"][data-key="requested"] [data-testid="column-value"]')), 'not priced');
  assert.ok(!/₹\s?0\b/.test(text(app)), 'no ₹0 anywhere');
  const tb = q('[data-testid="board-card"][data-type="to_buy"]');
  assert.match(text(tb.querySelector('[data-testid="card-value"]')), /380 \+ 1 unpriced/);
});
await check('board: "N more" links to the list with its status chip', async () => {
  const more = q('[data-testid="board-column"][data-key="ordered"] [data-testid="column-more"]');
  assert.equal(text(more), '5 more');
  assert.equal(more.getAttribute('href'), '/testco/cf_erp/purchase-orders?status=ordered');
  assert.equal(q('[data-testid="board-column"][data-key="approved"] [data-testid="column-more"]'), null);
});

// ── the page: filters go to the server ───────────────────────────────────
const boardCalls = () => globalThis.__calls.filter((c) => c.url.includes('/buying/board'));
const params = (c) => Object.fromEntries(new URL(`http://x${c.url}`).searchParams);
await check('page: supplier, order and closed come from the URL and are sent as server params', async () => {
  globalThis.__calls = [];
  globalThis.__respond = (url) => {
    if (url.includes('/buying/board')) return boardFixture({ filters: { supplier: { id: 5, code: 'S5', name: 'Steel Co' }, order: { id: 7, code: 'SO-7', status: 'confirmed' }, search: null, includeClosed: true } });
    return [];
  };
  await render(React.createElement(m.BuyingPage), '/testco/cf_erp/buying?supplier=5&order=7&closed=1');
  const c = boardCalls().at(-1);
  assert.ok(c, 'the board was read');
  assert.ok(c.url.startsWith('/api/testco/cf_erp/buying/board?'), c.url);
  assert.deepEqual(params(c), { supplierId: '5', orderId: '7', includeClosed: '1' });
  assert.match(text(q('[data-testid="board-summary"]')), /linked to SO-7/);
  assert.match(text(q('[data-testid="board-summary"]')), /naming Steel Co/);
});
await check('page: typing a search sends search= (debounced); the closed chip toggles includeClosed', async () => {
  const input = q('input[aria-label="Search number, supplier or item"]');
  assert.ok(input, 'search box');
  await React.act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'PL20');
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await sleep(0);
  });
  await React.act(async () => { await sleep(400); });
  assert.equal(params(boardCalls().at(-1)).search, 'PL20');
  const chip = all('button').find((b) => /Show closed/.test(b.textContent));
  await click(chip);
  await React.act(async () => { await sleep(30); });
  const last = params(boardCalls().at(-1));
  assert.equal(last.includeClosed, undefined, JSON.stringify(last));
  assert.equal(last.search, 'PL20');
  assert.equal(last.supplierId, '5');
});

// ── the stage bar ────────────────────────────────────────────────────────
const doc = (type, id, code, stage, over = {}) => ({ type, id, code, status: 's', statusLabel: 'S', stage, ended: null, party: null, items: 1, value: 1, valueState: 'full', link: `${type === 'po' ? 'purchase-orders' : type === 'rfq' ? 'rfqs' : 'purchase-requests'}/${id}`, ...over });
const traceFixture = {
  type: 'rfq', id: 21, stages: STAGES, stage: 'quotes_in', ended: null,
  document: doc('rfq', 21, 'RFQ-000021', 'quotes_in'),
  requests: [doc('request', 11, 'PR-000011', 'approved', { ended: 'passed' })],
  rfqs: [],
  purchaseOrders: [doc('po', 1, 'PO-000001', 'part_received')],
  receipts: [{ id: 501, code: 'GRN-000501', date: '2026-10-01', quantity: 4, purchaseOrder: { id: 1, code: 'PO-000001' }, link: 'movements/501' }],
  reached: 'part_received',
};
await check('stage bar: the document\'s stage is current, earlier done, reached-by-PO ahead, the rest to do', async () => {
  await render(React.createElement(m.BuyingStageBarView, { trace: traceFixture }));
  const state = Object.fromEntries(all('[data-stage]').map((s) => [s.dataset.stage, s.dataset.state]));
  assert.deepEqual(state, {
    to_buy: 'done', requested: 'done', approved: 'done', rfq_out: 'done', quotes_in: 'current',
    awarded: 'ahead', ordered: 'ahead', part_received: 'ahead', received: 'todo',
  });
  assert.equal(q('[data-stage="quotes_in"]').getAttribute('aria-current'), 'step');
});
await check('stage bar: links back to the request and forward to the PO and its receipt; itself not a link', async () => {
  const link = (k) => q(`[data-link="${k}"]`);
  assert.equal(link('request:11').getAttribute('href'), '/testco/cf_erp/purchase-requests/11');
  assert.ok(link('request:11').closest('[data-stage="approved"]'));
  assert.equal(link('po:1').getAttribute('href'), '/testco/cf_erp/purchase-orders/1');
  assert.ok(link('po:1').closest('[data-stage="part_received"]'));
  assert.equal(link('grn:501').getAttribute('href'), '/testco/cf_erp/movements/501');
  assert.equal(link('rfq:21').tagName, 'SPAN', 'the document itself is highlighted, not linked');
  assert.match(text(q('[data-testid="buying-stage-summary"]')), /Quotes in/);
});
await check('stage bar model: a cancelled document highlights nothing; a passed request names what carries it on', async () => {
  const cancelled = m.stageBarModel({ ...traceFixture, ended: 'cancelled' });
  assert.ok(!cancelled.some((s) => s.state === 'current'));
  const pr = { ...traceFixture, type: 'request', id: 11, stage: 'approved', ended: 'passed', document: doc('request', 11, 'PR-000011', 'approved', { ended: 'passed' }), requests: [], rfqs: [doc('rfq', 21, 'RFQ-000021', 'quotes_in')] };
  assert.equal(m.stageBarSummary(pr), 'Approved — carried on by RFQ-000021, PO-000001.');
});

// ── the order's Buying stage ─────────────────────────────────────────────
await check('order body: reads the board for the order with its rows; lists what is still to raise; raises from exactly those rows', async () => {
  globalThis.__calls = [];
  const rows = [
    { item: { id: 101, code: 'PL20', name: 'Plate 20', uom: 'kg' }, planned: true, toBuy: 500, toRequest: 300, inRequest: 200, inRfq: 0, onOrder: 0, estUnitPrice: 60, estCost: 18000, purchaseRequests: [{ id: 11, code: 'PR-000011' }], rfqs: [], purchaseOrders: [], sharedWith: [] },
    { item: { id: 102, code: 'BOLT', name: 'Bolt', uom: 'nos' }, planned: false, toBuy: 40, toRequest: 40, inRequest: 0, inRfq: 0, onOrder: 0, estUnitPrice: null, estCost: null, purchaseRequests: [], rfqs: [], purchaseOrders: [], sharedWith: [{ id: 8, code: 'SO-8' }] },
    { item: { id: 103, code: 'ANG', name: 'Angle', uom: 'kg' }, planned: true, toBuy: 10, toRequest: 0, inRequest: 0, inRfq: 10, onOrder: 0, estUnitPrice: 50, estCost: 0, purchaseRequests: [], rfqs: [{ id: 21, code: 'RFQ-000021' }], purchaseOrders: [], sharedWith: [] },
  ];
  globalThis.__respond = (url, opts) => {
    if (url.includes('/buying/board')) return boardFixture({ toBuy: { items: 2, value: 18000, unpricedItems: 1, currency: 'INR', rows }, receipts: [{ id: 501, code: 'GRN-000501', date: '2026-10-01', quantity: 4, purchaseOrder: { id: 1, code: 'PO-000001' }, link: 'movements/501' }] });
    if (url.includes('/buy-list/request') && opts.method === 'POST') return { id: 77, code: 'PR-000077', status: 'draft', lines: [] };
    return {};
  };
  const order = { id: 7, code: 'SO-7', status: 'confirmed', lines: [] };
  const stage = { stageKey: 'buying', label: 'Buying', state: 'todo', detail: '2 materials to buy', blockers: [], applies: true, decidedBy: 'process', waitingOn: null };
  await render(React.createElement(m.OrderBuyingPanel, { order, stage }), '/testco/cf_erp/orders/7');
  const c = boardCalls().at(-1);
  assert.deepEqual(params(c), { orderId: '7', limit: '30', withRows: '1' });
  assert.match(text(q('[data-testid="order-buying-raise"]')), /2 items still to request/);
  assert.equal(all('[data-testid="order-buy-row"]').length, 3);
  assert.match(text(app), /shared with SO-8/);
  assert.equal(all('[data-testid="board-column"]').length, 9, 'the order\'s documents by the same stages');
  assert.match(text(q('[data-testid="order-receipts"]')), /GRN-000501/);
  const raise = all('button').find((b) => /Raise purchase request/.test(b.textContent));
  assert.ok(raise && !raise.disabled);
  await click(raise);
  const post = globalThis.__calls.find((x) => x.url.endsWith('/buy-list/request'));
  assert.ok(post, 'posted');
  assert.deepEqual(post.body, { rows: [{ itemId: 101, quantity: 300 }, { itemId: 102, quantity: 40 }] });
});
await check('order body: waiting on an earlier stage → the raise button is disabled', async () => {
  globalThis.__respond = (url) => (url.includes('/buying/board') ? boardFixture({ toBuy: { items: 1, value: null, unpricedItems: 1, currency: 'INR', rows: [{ item: { id: 102, code: 'BOLT', name: 'Bolt', uom: 'nos' }, planned: false, toBuy: 40, toRequest: 40, inRequest: 0, inRfq: 0, onOrder: 0, estUnitPrice: null, estCost: null, purchaseRequests: [], rfqs: [], purchaseOrders: [], sharedWith: [] }] } }) : {});
  const stage = { stageKey: 'buying', label: 'Buying', state: 'todo', detail: 'Waiting', blockers: [], applies: true, decidedBy: 'process', waitingOn: { stageKey: 'lock', message: 'Freeze the design first.' } };
  await render(React.createElement(m.OrderBuyingPanel, { order: { id: 7, code: 'SO-7', status: 'confirmed', lines: [] }, stage }), '/testco/cf_erp/orders/7');
  const raise = all('button').find((b) => /Raise purchase request/.test(b.textContent));
  assert.ok(raise?.disabled, 'disabled while waiting');
  assert.match(text(q('[data-testid="order-buying-raise"]')), /not priced/);
});
await check('lib: stillToRequest adds rows of one item and skips what is already handled', async () => {
  const out = m.stillToRequest([
    { item: { id: 1 }, toRequest: 2.5 }, { item: { id: 1 }, toRequest: 0.5 }, { item: { id: 2 }, toRequest: 0 },
  ]);
  assert.deepEqual(out, [{ itemId: 1, quantity: 3 }]);
  assert.equal(m.cardValueText({ value: null, valueState: 'none', unpricedLines: 2 }), 'not priced');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
