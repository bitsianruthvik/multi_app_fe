// Run from multi_app_fe: node scripts/cf_erp_purchase_flow_test.mjs
// The purchase flow (CF_ERP_PURCHASE_FLOW_PLAN): ONE purchase order carried stage by stage under a Purchase tab.
//   - helper paths, methods and bodies (stubbed fetch)
//   - the stage logic: lane of a PO, the strip, holds, recommended choices, awards, split count
//   - the lanes render from a fixture (counts, "not priced", never rupee zero, links)
//   - source checks: the Purchase top tab with Board + Purchase orders, the removed screens and nav entries are gone,
//     the PO page has the stage strip and stage actions, the order panel has Request items
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink, readdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/purchase', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  try { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true }); } catch { /* skip */ }
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = (q) => ({ matches: /min-width/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
globalThis.matchMedia = dom.window.matchMedia;

globalThis.__calls = [];
const stubs = {
  '@core/api/client': 'export async function apiFetch(url, opts = {}) { globalThis.__calls.push({ url, method: opts.method ?? "GET", body: opts.body }); return { ok: true }; }',
  '@core/contexts/AuthContext': 'export const useAuth = () => ({ user: null });',
};
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom';
      export { React, createRoot, MemoryRouter };
      export * from './src/apps/cf_erp/api/purchase';
      export * from './src/apps/cf_erp/lib/purchaseFlow';
      export { PurchaseLanes } from './src/apps/cf_erp/components/Purchase/PurchaseLanes';
      export { PurchaseStageStrip } from './src/apps/cf_erp/components/Purchase/PoStagePanel';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/(api\/client|contexts\/AuthContext)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
  } }],
  alias: { '@shared/ui': resolve('src/shared/ui/SheetGrid.tsx') },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{"VITE_API_HOST":"http://localhost:4000"}' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `purchase-flow-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const src = (p) => readFileSync(resolve('src/apps/cf_erp', p), 'utf8');
const last = () => globalThis.__calls[globalThis.__calls.length - 1];
const app = document.getElementById('app');
const render = async (el) => { app.replaceChildren(); const host = document.createElement('div'); app.appendChild(host); const root = createRoot(host); await React.act(async () => { root.render(React.createElement(MemoryRouter, null, el)); await sleep(0); }); };
const qa = (id) => [...document.querySelectorAll(`[data-testid="${id}"]`)];

// ── helpers: paths, methods, bodies ─────────────────────────────────────────
await check('getPurchaseBoard reads /purchase/board with only the filters that are set', async () => {
  await m.getPurchaseBoard({ orderId: 7, supplierId: null, search: '  steel ' });
  assert.equal(last().url, '/api/testco/cf_erp/purchase/board?orderId=7&search=steel');
  assert.equal(last().method, 'GET');
  await m.getPurchaseBoard();
  assert.equal(last().url, '/api/testco/cf_erp/purchase/board');
});
await check('getOrderPurchase and requestItems use the order routes', async () => {
  await m.getOrderPurchase(9);
  assert.match(last().url, /\/orders\/9\/purchase$/); assert.equal(last().method, 'GET');
  await m.requestItems(9, { lines: [{ itemId: 3, quantity: 12.5 }], notes: 'urgent' });
  assert.match(last().url, /\/orders\/9\/purchase-request$/); assert.equal(last().method, 'POST');
  assert.deepEqual(last().body, { lines: [{ itemId: 3, quantity: 12.5 }], notes: 'urgent' });
});
await check('stock check: GET, then POST { lines: [{ lineId, hold }] }', async () => {
  await m.getStockCheck(4);
  assert.match(last().url, /\/purchase-orders\/4\/stock-check$/); assert.equal(last().method, 'GET');
  await m.applyStockCheck(4, [{ lineId: 41, hold: 2 }, { lineId: 42, hold: 0 }]);
  assert.match(last().url, /\/purchase-orders\/4\/stock-check$/); assert.equal(last().method, 'POST');
  assert.deepEqual(last().body, { lines: [{ lineId: 41, hold: 2 }, { lineId: 42, hold: 0 }] });
});
await check('RFQ, quotes, place and straight-order paths and bodies', async () => {
  await m.sendRfq(4, { supplierIds: [5, 6], quotesDue: '2026-10-20' });
  assert.match(last().url, /\/purchase-orders\/4\/rfq$/); assert.deepEqual(last().body, { supplierIds: [5, 6], quotesDue: '2026-10-20' });
  await m.getPoQuotes(4);
  assert.match(last().url, /\/purchase-orders\/4\/quotes$/); assert.equal(last().method, 'GET');
  await m.recordQuote(4, { supplierId: 5, lines: [{ rfqLineId: 1, unitPrice: 10 }] });
  assert.match(last().url, /\/purchase-orders\/4\/quotes$/); assert.equal(last().method, 'POST'); assert.equal(last().body.supplierId, 5);
  await m.placeOrder(4, [{ rfqLineId: 1, quoteLineId: 11 }]);
  assert.match(last().url, /\/purchase-orders\/4\/place$/); assert.deepEqual(last().body, { awards: [{ rfqLineId: 1, quoteLineId: 11 }] });
  await m.placeWithSupplier(4, 5);
  assert.match(last().url, /\/purchase-orders\/4\/order$/); assert.deepEqual(last().body, { supplierId: 5 });
  await m.setLineExpected(41, '2026-11-01');
  assert.match(last().url, /\/purchase-lines\/41$/); assert.equal(last().method, 'PUT'); assert.deepEqual(last().body, { expectedDate: '2026-11-01' });
});

// ── stage logic ─────────────────────────────────────────────────────────────
await check('a PO is in the lane its status, stock check and quotes say', () => {
  assert.equal(m.poLane('requested', false, 0), 'requested');
  assert.equal(m.poLane('draft', false, 0), 'requested');
  assert.equal(m.poLane('requested', true, 0), 'stock_checked');
  assert.equal(m.poLane('quoting', true, 0), 'rfq_out');
  assert.equal(m.poLane('quoting', true, 2), 'quotes_in');
  assert.equal(m.poLane('ordered', true, 2), 'ordered');
  assert.equal(m.poLane('partially_received', true, 2), 'part_received');
  assert.equal(m.poLane('received', true, 2), 'received');
  assert.equal(m.poLane('cancelled', false, 0), null);
});
await check('the strip has six steps; the current one is marked; part received sits on the last', () => {
  const s = m.stripModel('quotes_in');
  assert.deepEqual(s.map((x) => x.label), ['Requested', 'Stock checked', 'RFQ out', 'Quotes in', 'Ordered', 'Received']);
  assert.deepEqual(s.map((x) => x.state), ['done', 'done', 'done', 'current', 'ahead', 'ahead']);
  const p = m.stripModel('part_received');
  assert.equal(p[4].state, 'done'); assert.equal(p[5].label, 'Part received'); assert.equal(p[5].state, 'current');
  assert.ok(m.stripModel('received').every((x) => x.state === 'done'));
});
const SC = [
  { lineId: 1, item: { id: 1, code: 'PL-10', name: 'Plate', uom: 'kg' }, quantity: 100, freeInStock: 60, proposeHold: 60 },
  { lineId: 2, item: { id: 2, code: 'PL-12', name: 'Plate 12', uom: 'kg' }, quantity: 50, freeInStock: 0, proposeHold: 0 },
  { lineId: 3, item: { id: 3, code: 'AN-1', name: 'Angle', uom: 'nos' }, quantity: 10, freeInStock: 40, proposeHold: 10 },
];
await check('stock check: the system proposes, holds are limited to min(free, line), the body names every line', () => {
  assert.deepEqual(m.proposedHolds(SC), { 1: '60', 2: '', 3: '10' });
  assert.deepEqual(SC.map(m.maxHold), [60, 0, 10]);
  assert.equal(m.holdProblem(SC[0], '60'), null);
  assert.equal(m.holdProblem(SC[0], ''), null);
  assert.match(m.holdProblem(SC[0], '61'), /only 60 is free/);
  assert.match(m.holdProblem(SC[2], '11'), /line is only 10/);
  assert.match(m.holdProblem(SC[0], 'abc'), /not a number/);
  assert.deepEqual(m.holdsBody(SC, { 1: '25', 2: '', 3: '10' }), [{ lineId: 1, hold: 25 }, { lineId: 2, hold: 0 }, { lineId: 3, hold: 10 }]);
});
const item = { id: 1, code: 'PL-10', name: 'Plate', uom: 'kg' };
const cell = (supplierId, extra = {}) => ({ supplierId, quoteLineId: supplierId * 10, unitPrice: 100, amount: 1000, freightShare: 0, landedUnit: 100, gstRate: 18, leadTimeDays: 10, valid: true, cheapest: false, fastest: false, lastPaid: null, ...extra });
const cmp = {
  suppliers: [{ id: 5, name: 'Alpha', total: 1, landedTotal: 1, linesQuoted: 2 }, { id: 6, name: 'Beta', total: 1, landedTotal: 1, linesQuoted: 1 }],
  lines: [
    { rfqLine: { id: 11, lineNo: 1, item, quantity: 10, neededBy: null }, cells: [cell(5), cell(6, { cheapest: true })] },
    { rfqLine: { id: 12, lineNo: 2, item: { ...item, id: 2 }, quantity: 5, neededBy: null }, cells: [cell(5, { cheapest: true }), cell(6, { unitPrice: null, quoteLineId: null })] },
  ],
  recommendation: { perLine: [{ rfqLineId: 11, supplierId: 6 }, { rfqLineId: 12, supplierId: 5 }] },
};
await check('accepting: defaults are the recommendation, awards carry quote lines, lines to different suppliers split the PO', () => {
  const ch = m.recommendedChoices(cmp);
  assert.deepEqual(ch, { 11: 6, 12: 5 });
  assert.deepEqual(m.awardsFromChoices(cmp, ch), [{ rfqLineId: 11, quoteLineId: 60 }, { rfqLineId: 12, quoteLineId: 50 }]);
  assert.equal(m.orderCountFor(cmp, ch), 2);
  assert.equal(m.orderCountFor(cmp, { 11: 5, 12: 5 }), 1);
  // a pick on a cell with no price cannot be awarded: that line is left behind
  const bad = { 11: 5, 12: 6 };
  assert.deepEqual(m.awardsFromChoices(cmp, bad), [{ rfqLineId: 11, quoteLineId: 50 }]);
  assert.equal(m.orderCountFor(cmp, bad), 2);
  assert.deepEqual(m.awardsFromChoices(cmp, {}), []);
});

// ── render: the lanes and the strip ─────────────────────────────────────────
const card = (id, code, over = {}) => ({ id, code, lane: 'requested', status: 'requested', statusLabel: 'Requested', supplier: null, forOrder: { id: 7, code: 'SO-7' }, lines: 3, value: null, nextDue: null, overdue: false, createdAt: '2026-10-01', tags: [], ...over });
const lane = (key, label, cards, value = 0) => ({ key, label, hint: `${label} hint`, count: cards.length, value, cards });
const lanes = [
  lane('requested', 'Requested', [card(1, 'PO-1')]),
  lane('stock_checked', 'Stock checked', []),
  lane('rfq_out', 'RFQ out', [card(2, 'PO-2', { supplier: { id: 5, code: 'S5', name: 'Alpha Steel' }, tags: ['0 of 2 quoted'] })], 0),
  lane('quotes_in', 'Quotes in', []),
  lane('ordered', 'Ordered', [card(3, 'PO-3', { supplier: { id: 6, code: 'S6', name: 'Beta Metals' }, value: 125000, nextDue: '2026-09-30', overdue: true, tags: ['1 line without a date'] })], 125000),
  lane('part_received', 'Part received', []),
  lane('received', 'Received', []),
];
await check('lanes: seven in order, cards with code, supplier or "No supplier yet", order chip, value, overdue, tags', async () => {
  await render(React.createElement(m.PurchaseLanes, { lanes }));
  assert.deepEqual(qa('purchase-lane').map((l) => l.dataset.key), ['requested', 'stock_checked', 'rfq_out', 'quotes_in', 'ordered', 'part_received', 'received']);
  const c1 = qa('purchase-card')[0];
  assert.match(c1.textContent, /PO-1/); assert.match(c1.textContent, /No supplier yet/); assert.match(c1.textContent, /SO-7/); assert.match(c1.textContent, /3 lines/);
  assert.equal(c1.querySelector('a').getAttribute('href'), '/testco/cf_erp/purchase-orders/1');
  const c3 = qa('purchase-card')[2];
  assert.match(c3.textContent, /Beta Metals/); assert.match(c3.textContent, /overdue 2026-09-30/); assert.match(c3.textContent, /1 line without a date/);
});
await check('a value that is null reads "not priced", never zero rupees; an empty lane says Nothing here', async () => {
  await render(React.createElement(m.PurchaseLanes, { lanes }));
  assert.equal(qa('card-value')[0].textContent, 'not priced');
  assert.doesNotMatch(qa('card-value')[0].textContent, /₹\s*0/);
  const lv = qa('lane-value');
  assert.equal(lv[0].textContent, 'not priced'); assert.equal(lv[1].textContent, '—');
  assert.match(lv[4].textContent, /1,25,000|125,000/);
  assert.match(document.querySelector('[data-key="stock_checked"]').textContent, /Nothing here/);
});
await check('the stage strip marks the current step', async () => {
  await render(React.createElement(m.PurchaseStageStrip, { lane: 'rfq_out' }));
  assert.equal(qa('po-stage').length, 6);
  assert.equal(document.querySelector('[data-state="current"]').dataset.stage, 'rfq_out');
  assert.equal(document.querySelector('[aria-current="step"]').textContent.trim(), 'RFQ out');
});

// ── source: the nav, the removed screens, the PO page, the order panel ───────
await check('the Purchase top tab sits right after Sales with Board and Purchase orders; Inventory has no buying screens', () => {
  const n = src('navMeta.ts');
  const keys = [...n.matchAll(/^ {4}key: '([a-z]+)',$/gm)].map((x) => x[1]);
  assert.deepEqual(keys.slice(0, 3), ['sales', 'purchase', 'catalog']); // Home is a one-line section ahead of them
  assert.ok(n.indexOf("key: 'home'") < n.indexOf("key: 'sales'"));
  const purchase = n.slice(n.indexOf("key: 'purchase',"), n.indexOf("key: 'catalog',"));
  assert.match(purchase, /key: 'purchase-board', label: 'Board', path: 'purchase'/);
  assert.match(purchase, /key: 'purchase-orders', label: 'Purchase orders', path: 'purchase-orders', hasDetail: true/);
  assert.match(purchase, /permission: INVENTORY/);
  const inventory = n.slice(n.indexOf("key: 'inventory',"), n.indexOf("key: 'setup',"));
  for (const gone of ["'buying'", "'buy-list'", "'purchase-requests'", "'rfqs'", "'purchase-orders'"]) assert.ok(!inventory.includes(`key: ${gone}`), gone);
  for (const gone of ["path: 'buying'", "path: 'buy-list'", "path: 'purchase-requests'", "path: 'rfqs'"]) assert.ok(!n.includes(gone), gone);
});
await check('routes: the board is wired; the removed pages have no routes', () => {
  const r = src('routes.tsx');
  assert.match(r, /path: '\/:company\/cf_erp\/purchase', element: wrap\(<PurchaseBoard \/>\)/);
  assert.match(r, /cf_erp\/purchase-orders', element: wrap\(<PurchaseOrders \/>\)/);
  assert.match(r, /cf_erp\/purchase-orders\/:id', element: wrap\(<PurchaseOrderDetail \/>\)/);
  for (const gone of ['cf_erp/buying', 'cf_erp/buy-list', 'purchase-requests', 'cf_erp/rfqs', 'BuyList', 'PurchaseRequests', 'RfqDetail']) assert.ok(!r.includes(gone), gone);
});
await check('the removed pages, components and helpers are deleted', () => {
  for (const f of ['pages/Buying.tsx', 'pages/BuyList.tsx', 'pages/PurchaseRequests.tsx', 'pages/PurchaseRequestDetail.tsx', 'pages/Rfqs.tsx', 'pages/RfqDetail.tsx',
    'components/Buying/BuyingBoardView.tsx', 'components/Buying/BuyingStageBar.tsx', 'components/Buying/OrderBuyingPanel.tsx', 'components/RequestParts.tsx', 'components/RfqDialogs.tsx',
    'api/buying.ts', 'lib/buying.ts', 'lib/buyList.ts']) assert.ok(!existsSync(resolve('src/apps/cf_erp', f)), f);
  const p = src('api/procurement.ts');
  for (const gone of ['listRequests', 'raiseFromBuyList', 'listRfqs', 'makeRfq', 'createPos', 'awardLines', 'saveQuote']) assert.ok(!p.includes(gone), gone);
});
// CHANGED for Buying v2: there is no "New request" / Request items dialog any more — buying for an order starts from its requisition (Buy…).
// The Board page offers "Buy for stock" (a PO for no order) and a Requisitions / Purchase orders toggle.
await check('the Board page: lanes from the server, filters in the URL, Buy for stock, no Request items path', () => {
  const s = src('pages/PurchaseBoard.tsx');
  assert.match(s, /getPurchaseBoard\({ orderId, supplierId, search: term }\)/);
  assert.match(s, /useUrlParam\('order'/); assert.match(s, /useUrlParam\('supplier'/); assert.match(s, /useUrlParam\('q'/);
  assert.match(s, /Buy for stock/); assert.doesNotMatch(s, /New request|RequestItemsDialog/); assert.ok(s.includes('<PurchaseLanes lanes={lanes} />'));
  assert.ok(!existsSync(resolve('src/apps/cf_erp', 'components/Purchase/RequestItemsDialog.tsx')));
});
await check('the PO page has the stage strip and one action panel with the stage actions', () => {
  const s = src('pages/PurchaseOrderDetail.tsx'); const p = src('components/Purchase/PoStagePanel.tsx');
  assert.match(s, /<PoStagePanel /); assert.match(s, /const editable = canManage && open/);
  assert.doesNotMatch(s, /BuyingStageBar/);
  assert.match(p, /PurchaseStageStrip/); assert.match(p, /po-stage-strip/);
  for (const words of ['Check stock', 'Hold stock and reduce the PO', 'Skip — nothing in stock', 'Place straight with a supplier', 'Send RFQ', 'Record quotation',
    'Accept and place order', 'Split into', 'Everything came from stock — nothing to buy', 'Timeline and goods receipt', 'Receive']) assert.ok(p.includes(words), words);
  for (const call of ['getStockCheck', 'applyStockCheck', 'getPoQuotes', 'recordQuote', 'placeOrder', 'rfqEmail', 'openRfqPrint', 'RfqComparison', 'QuoteDialog']) assert.ok(p.includes(call), call);
  assert.match(src('components/Purchase/DateCell.tsx'), /setLineExpected/);
});
// CHANGED for Buying v2: the stage no longer has a "Request items" button or the held list — it is the requisition table
// (hold from stock / buy / skip per material); the held stock is a chip on its row. The PO lanes and the old request dialog stay.
await check('the sales order Buying stage is the requisition table, with the order lanes under it', () => {
  const o = src('components/Purchase/OrderPurchasePanel.tsx');
  assert.match(o, /getOrderRequisitions/); assert.match(o, /getOrderPurchase/); assert.ok(o.includes('<PurchaseLanes lanes={lanes.data!.lanes} compact />')); assert.match(o, /RequisitionBlock/);
  assert.ok(src('components/OrderProcess/StageBody.tsx').includes('<OrderPurchasePanel order={order} stage={stage} onChanged={onReloadAll} />'));
});
await check('no "Suggest a purchase order" button is left anywhere in cf_erp', async () => {
  const walk = async (d) => (await Promise.all((await readdir(d)).map(async (n) => {
    const f = resolve(d, n);
    return (await stat(f)).isDirectory() ? walk(f) : /\.(tsx|ts)$/.test(n) ? [f] : [];
  }))).flat();
  for (const f of await walk(resolve('src/apps/cf_erp'))) assert.ok(!/Suggest a purchase order|\/buy-list\/suggest/.test(readFileSync(f, 'utf8')), f);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
