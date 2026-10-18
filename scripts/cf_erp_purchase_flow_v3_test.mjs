// Run from multi_app_fe: node scripts/cf_erp_purchase_flow_v3_test.mjs
// PURCHASE FLOW v3 (init.sql §71, TM/CF_ERP_BUYING_V2.md "2026-10-18"), rendered in jsdom against mocked routes shaped like
// the backend's answers (multi_app_be/scripts/cf_kepl/purchase_flow_v3_test.mjs, TM/PURCHASE_FLOW_RUN.md):
//   the MR screen (Required / In stock / Take from stock / To buy / Locked; Save; a customer MR asks the promised date),
//   the PR grid (three vendor columns to start, + Vendor, a rate per cell with days / remark, PO raised, Raise PO with the
//   quantity filled in and the expected delivery date), the PO page (Pending MD approval → Approve for the MD only, Close PO
//   with a reason, ordered / received / pending, the PO's expected date and a line's own, the changes recorded),
//   Inventory › Receive against PO, the menu (no boards, Plate changes hidden while the gate is off) and the "by AI" words.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/material-requests/41', pretendToBeVisual: true });
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
      export * from './src/apps/cf_erp/api/purchaseRequests';
      export * from './src/apps/cf_erp/lib/purchaseRequest';
      export { lockedWords } from './src/apps/cf_erp/lib/materialRequest';
      export { default as MaterialRequestDetail } from './src/apps/cf_erp/pages/MaterialRequestDetail';
      export { default as PurchaseRequestDetail } from './src/apps/cf_erp/pages/PurchaseRequestDetail';
      export { default as PurchaseOrderDetail } from './src/apps/cf_erp/pages/PurchaseOrderDetail';
      export { default as ReceiveAgainstPo } from './src/apps/cf_erp/pages/ReceiveAgainstPo';
      export { SECTIONS, PLATE_CHANGE_GATE } from './src/apps/cf_erp/navMeta';`,
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
const artifact = resolve(cache, `purchase-flow-v3-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter, Routes, Route } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { if (process.env.ONLY && !label.includes(process.env.ONLY)) return; try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const src = (p) => readFileSync(resolve('src/apps/cf_erp', p), 'utf8');
const app = document.getElementById('app');
let root = null;
/** Renders a page at its address (its :id read by useParams). */
const page = async (Comp, path, url) => {
  if (root) { await React.act(async () => { root.unmount(); }); root = null; }
  document.querySelectorAll('.MuiDialog-root, .MuiPopover-root, .MuiMenu-root').forEach((n) => n.remove());
  app.replaceChildren();
  const host = document.createElement('div'); app.appendChild(host);
  root = createRoot(host);
  await React.act(async () => {
    root.render(React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(Routes, null, React.createElement(Route, { path, element: React.createElement(Comp) }))));
    await sleep(60);
  });
};
const settle = async (ms = 50) => { await React.act(async () => { await sleep(ms); }); };
const qa = (id, scope = document) => [...scope.querySelectorAll(`[data-testid="${id}"]`)];
const q1 = (id, scope = document) => scope.querySelector(`[data-testid="${id}"]`);
const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const fire = async (el, type) => { await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true })); await sleep(20); }); };
const click = (el) => fire(el, 'click');
const buttonIn = (scope, label) => [...scope.querySelectorAll('button, a')].find((b) => text(b) === label || text(b).startsWith(label));
const setValue = async (el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await React.act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(10); });
};
const blur = async (el) => { await React.act(async () => { el.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true })); await sleep(40); }); };
const calls = (method, path) => globalThis.__calls.filter((c) => c.method === method && c.path === path);
const lastCall = (method, path) => calls(method, path).at(-1);
const reset = () => { globalThis.__calls = []; globalThis.__routes = {}; globalThis.__user = null; };
const asUser = (perms) => { globalThis.__user = { uiPermissions: perms }; };

// ── fixtures, as the backend answers (TM/PURCHASE_FLOW_RUN.md) ─────────────────
const PS = { id: 501, code: 'TPUR-PS', name: 'Plate 14.137 × 3000 × 1500', uom: 'nos', trackedBy: 'quantity' };
const PB = { id: 502, code: 'TPUR-PB', name: 'Plate 14.137 × 3000 × 1500 B', uom: 'nos', trackedBy: 'quantity' };
const mrLine = (id, item, extra) => ({ id, item, required: 4, inStock: 1, takeFromStock: 0, takeChosen: false, heldFromStock: 0, takeMax: 1, toBuy: 4, poRaised: 0, received: 0, onOrder: 0, locked: 0, open: 4, status: 'open', statusLabel: 'Open', sentence: '0 of 4 locked.', purchase: [], ...extra });
const mrScreen = (extra = {}) => ({
  id: 41, code: 'MR-TEST-PUR-NEST-1', supply: 'we_buy', supplyLabel: 'We buy', order: { id: 9001, code: 'TEST-PUR-NEST', status: 'confirmed', customer: { id: 7, name: 'Girder customer' } },
  line: { id: 801, lineNo: 1, name: 'Plate parts', quantity: 1, frozen: true, released: false }, status: 'open', statusLabel: 'Open', stale: false, needKnown: true, needComplete: true,
  canEdit: true, reason: null, purchaseRequest: null, purchaseOrders: [], sentence: 'Take what you can from stock; the rest goes on the purchase request.',
  lines: [mrLine(101, PB, { required: 1, inStock: 0, takeMax: 0, toBuy: 1, open: 1 }), mrLine(102, PS)], ...extra,
});
const vendor = (id, sid, name, quotes = {}, pos = []) => ({ id, position: id, supplier: { id: sid, code: null, name }, quotes, purchaseOrders: pos });
const prLine = (id, mrLineId, item, extra) => ({ id, mrLineId, item, needed: 3, poRaised: 0, received: 0, pending: 0, open: 3, status: 'open', statusLabel: 'To order', ...extra });
const prFixture = (extra = {}) => ({
  id: 61, code: 'PR-000061', status: 'open', statusLabel: 'Open', today: '2026-10-18', requisition: { id: 41, code: 'MR-TEST-PUR-NEST-1' },
  order: { id: 9001, code: 'TEST-PUR-NEST', status: 'confirmed', customer: null }, line: { id: 801, lineNo: 1, name: 'Plate parts' }, canEdit: true, createdAt: '2026-10-18', notes: null,
  lines: [prLine(71, 101, PB, { needed: 1, open: 1 }), prLine(72, 102, PS)],
  vendors: [vendor(81, 31, 'Vendor A', { 71: { rate: 71000, deliveryDays: 10, remark: null }, 72: { rate: 62000, deliveryDays: 7, remark: null } })],
  purchaseOrders: [], counts: { lines: 2, open: 2, vendors: 1 }, ...extra,
});
const poLine = (extra = {}) => ({ id: 3001, lineNo: 1, item: PS, quantity: 3, received: 0, outstanding: 3, pending: 3, closedQty: 0, unitPrice: 62000, amount: 186000, expectedDate: '2026-10-25', effectiveDate: '2026-10-25', dateSource: 'line', note: null, receipts: [],
  orders: [{ id: 1, orderId: 9001, orderCode: 'TEST-PUR-NEST', quantity: 3, received: 0, prLineId: 102, requisition: { id: 41, code: 'MR-TEST-PUR-NEST-1', lineNo: 1 } }], unlinked: 0, ...extra });
const poFixture = (extra = {}) => ({
  id: 2325, code: 'PO-002325', status: 'requested', stage: 'pending_approval', stageLabel: 'Pending Management approval', type: 'material', typeLabel: 'Material', suggested: false,
  approval: { status: 'pending', by: null, at: null }, closed: null, supplier: { id: 31, code: null, name: 'Vendor A' }, suppliedByCustomer: false, expectedDate: '2026-10-25', orderedAt: null, notes: null,
  reverseCharge: false, forOrder: { id: 9001, code: 'TEST-PUR-NEST' }, createdAt: '2026-10-18', dateChanges: [],
  totals: { lines: 1, ordered: 3, received: 0, outstanding: 3, amount: 186000, unpricedLines: 0 }, lines: [poLine()], ...extra,
});

// ── 1: the calls and the sums ────────────────────────────────────────────────────
await check('helpers call the §71 routes with the contract bodies', async () => {
  reset();
  for (const k of ['GET /material-requests', 'GET /material-requests/41', 'PUT /material-requests/41', 'GET /purchase-requests', 'GET /purchase-requests/61', 'POST /purchase-requests/61/vendors',
    'PUT /purchase-request-vendors/81', 'DELETE /purchase-request-vendors/81', 'PUT /purchase-request-vendors/81/quotes', 'GET /purchase-request-vendors/81/pending-pos', 'POST /purchase-request-vendors/81/purchase-orders',
    'POST /purchase-orders/2325/approve', 'POST /purchase-orders/2325/close', 'POST /purchase-orders/2325/order', 'PUT /purchase-orders/2325', 'GET /purchase-orders/pending-lines']) globalThis.__routes[k] = () => ({});
  await m.listMaterialRequests({ orderId: 9001, search: ' x ' }); assert.equal(lastCall('GET', '/material-requests').url, '/api/testco/cf_erp/material-requests?orderId=9001&search=x');
  await m.saveMaterialRequest(41, { lines: [{ lineId: 102, takeFromStock: 1 }] }); assert.deepEqual(lastCall('PUT', '/material-requests/41').body, { lines: [{ lineId: 102, takeFromStock: 1 }] });
  await m.addVendor(61, 31); assert.deepEqual(lastCall('POST', '/purchase-requests/61/vendors').body, { supplierId: 31 });
  await m.setVendor(81, 32); assert.deepEqual(lastCall('PUT', '/purchase-request-vendors/81').body, { supplierId: 32 });
  await m.removeVendor(81); assert.equal(calls('DELETE', '/purchase-request-vendors/81').length, 1);
  await m.setQuotes(81, [{ lineId: 72, rate: 62000, deliveryDays: 7 }]); assert.deepEqual(lastCall('PUT', '/purchase-request-vendors/81/quotes').body, { quotes: [{ lineId: 72, rate: 62000, deliveryDays: 7 }] });
  await m.raisePurchaseOrder(81, { lines: [{ lineId: 72, quantity: 3 }], expectedDate: '2026-10-25' });
  assert.deepEqual(lastCall('POST', '/purchase-request-vendors/81/purchase-orders').body, { lines: [{ lineId: 72, quantity: 3 }], expectedDate: '2026-10-25' });
  await m.approvePurchaseOrder(2325); assert.deepEqual(lastCall('POST', '/purchase-orders/2325/approve').body, {});
  await m.closePurchaseOrder(2325, 'mill short'); assert.deepEqual(lastCall('POST', '/purchase-orders/2325/close').body, { reason: 'mill short' });
  await m.sendForApproval(2325, 31); assert.deepEqual(lastCall('POST', '/purchase-orders/2325/order').body, { supplierId: 31 });
  await m.setPoExpectedDate(2325, '2026-10-27'); assert.deepEqual(lastCall('PUT', '/purchase-orders/2325').body, { expectedDate: '2026-10-27' });
  await m.getPendingLines({ search: 'PO-1' }); assert.equal(lastCall('GET', '/purchase-orders/pending-lines').url, '/api/testco/cf_erp/purchase-orders/pending-lines?search=PO-1');
});
await check('the sums: to buy, the take-from-stock problem, the Raise PO draft, the expected delivery date, locked words', () => {
  assert.equal(m.toBuyOf(4, 1), 3); assert.equal(m.toBuyOf(4, 9), 0); assert.equal(m.toBuyOf(4, NaN), 4);
  const l = { required: 4, takeMax: 1, item: PS };
  assert.equal(m.takeProblem(l, '1'), null); assert.equal(m.takeProblem(l, '2'), 'At most 1 nos now.'); assert.equal(m.takeProblem(l, '5'), 'The line needs 4 nos.'); assert.equal(m.takeProblem(l, '-1'), 'A number, zero or more.');
  const pr = prFixture();
  pr.lines[1].poRaised = 1; pr.lines[1].open = 2;
  assert.deepEqual(m.poDraftOf(pr, pr.vendors[0]).map((d) => [d.line.id, d.quantity, d.max]), [[71, '1', 1], [72, '2', 2]], 'quantity filled in = needed − PO raised');
  assert.equal(m.poQtyProblem('3', 2, 'nos'), 'At most 2 nos.'); assert.equal(m.poQtyProblem('0', 2, 'nos'), null);
  assert.equal(m.quoteWords({ rate: 62000, deliveryDays: 7, remark: null }, 'nos'), '₹62,000/nos · 7 d');
  assert.equal(m.cheapestOf({ vendors: [vendor(1, 1, 'a', { 72: { rate: 9 } }), vendor(2, 2, 'b', { 72: { rate: 7 } })] }, 72), 7);
  assert.equal(m.latestDelivery('2026-10-18', [7, 10, null]), '2026-10-28'); assert.equal(m.latestDelivery('2026-10-18', [null]), null);
  assert.equal(m.PO_STAGE_LABEL.pending_approval, 'Pending Management approval'); assert.equal(m.PO_TYPE_LABEL.contractor, 'Contractor');
});

// ── 2: the MR screen ────────────────────────────────────────────────────────────
await check('MR screen: one table — Required, In stock, Take from stock, To buy, Locked; typing updates To buy; Save sends every line', async () => {
  reset();
  let saved = null;
  globalThis.__routes['GET /material-requests/41'] = () => mrScreen();
  globalThis.__routes['PUT /material-requests/41'] = (b) => { saved = b; return mrScreen({ purchaseRequest: { id: 61, code: 'PR-000061', status: 'open', statusLabel: 'Open' }, lines: [mrScreen().lines[0], mrLine(102, PS, { takeFromStock: 1, heldFromStock: 1, toBuy: 3, locked: 1, inStock: 0 })] }); };
  await page(m.MaterialRequestDetail, '/:company/cf_erp/material-requests/:id', '/testco/cf_erp/material-requests/41');
  const heads = [...document.querySelectorAll('th')].map(text);
  for (const h of ['Required', 'In stock (free)', 'Take from stock', 'To buy', 'Locked for this order']) assert.ok(heads.includes(h), h);
  const takes = qa('mr-take');
  assert.equal(takes.length, 2);
  await setValue(takes[1], '2'); await settle();
  assert.match(text(document.body), /At most 1 nos now\./, 'more than is free is said at once');
  assert.equal(q1('mr-save').disabled, true);
  await setValue(takes[1], '1'); await settle();
  assert.deepEqual(qa('mr-to-buy').map(text), ['1', '3']);
  await click(q1('mr-save')); await settle(80);
  assert.deepEqual(saved, { lines: [{ lineId: 101, takeFromStock: 0 }, { lineId: 102, takeFromStock: 1 }] });
  assert.deepEqual(qa('mr-locked').map((x) => text(x).split(' ')[0]), ['0', '1'], 'Locked follows the answer');
  assert.match(text(document.body), /PR-000061/);
});
await check('a customer-supplied MR: the customer\'s stock, "Ask the customer", and the promised date asked when the server needs it', async () => {
  reset();
  const cust = mrScreen({ supply: 'customer', supplyLabel: 'Customer supplies' });
  const bodies = [];
  globalThis.__routes['GET /material-requests/41'] = () => cust;
  globalThis.__routes['GET /customer-material/returns'] = () => ({ toReturn: [], substitutes: [] });
  globalThis.__routes['PUT /material-requests/41'] = (b) => { bodies.push(b); return b.customerDate ? { ...cust, customerPurchaseOrders: [{ id: 2330, code: 'PO-002330' }] } : { __status: 422, body: { message: 'Give the date…', code: 'CUSTOMER_DATE' } }; };
  await page(m.MaterialRequestDetail, '/:company/cf_erp/material-requests/:id', '/testco/cf_erp/material-requests/41');
  const heads = [...document.querySelectorAll('th')].map(text);
  assert.ok(heads.includes("In the customer's stock") && heads.includes('Ask the customer'), heads.join('|'));
  await click(q1('mr-save')); await settle(80);
  const input = document.querySelector('[data-testid="promised-date"]');
  assert.ok(input, 'the promised-date dialog');
  await setValue(input, '2026-11-20');
  await click(buttonIn(document.querySelector('.MuiDialog-root'), 'Save')); await settle(80);
  assert.equal(bodies.at(-1).customerDate, '2026-11-20');
  assert.equal(q1('mr-refusal'), null);
});
await check('nothing chosen yet: take from stock is PRE-FILLED with the proposal (a suggestion; nothing is sent until Save)', async () => {
  reset();
  globalThis.__routes['GET /material-requests/41'] = () => mrScreen({ lines: [mrLine(101, PB, { required: 1, inStock: 0, takeMax: 0, toBuy: 1, open: 1, proposedTake: 0 }), mrLine(102, PS, { proposedTake: 1 })] });
  await page(m.MaterialRequestDetail, '/:company/cf_erp/material-requests/:id', '/testco/cf_erp/material-requests/41');
  assert.deepEqual(qa('mr-take').map((x) => x.value), ['0', '1']);
  assert.deepEqual(qa('mr-to-buy').map(text), ['1', '3']);
  assert.match(text(document.body), /Suggested — save to earmark/);
  assert.equal(calls('PUT', '/material-requests/41').length, 0, 'nothing is earmarked before Save');
});
await check('full screen: the header button fills the window, Esc or the button brings it back (one reusable piece)', async () => {
  reset();
  try { window.localStorage.clear(); } catch { /* none */ }
  globalThis.__routes['GET /material-requests/41'] = () => mrScreen();
  await page(m.MaterialRequestDetail, '/:company/cf_erp/material-requests/:id', '/testco/cf_erp/material-requests/41');
  assert.equal(q1('full-screen-frame'), null);
  await click(q1('full-screen-toggle')); await settle();
  assert.ok(q1('full-screen-frame'), 'filled the window');
  await React.act(async () => { window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' })); await sleep(20); });
  assert.equal(q1('full-screen-frame'), null, 'Esc exits');
  for (const f of ['pages/MaterialRequestDetail.tsx', 'pages/PurchaseRequestDetail.tsx', 'pages/PurchaseOrderDetail.tsx', 'pages/ReceiveAgainstPo.tsx'])
    assert.match(src(f), /<FullScreenToggle on=\{full\.on\} onToggle=\{full\.toggle\} \/>/, f);
});
await check('without the manage grant the MR is read-only', async () => {
  reset(); asUser(['cf_erp_inventory_view']);
  globalThis.__routes['GET /material-requests/41'] = () => mrScreen();
  await page(m.MaterialRequestDetail, '/:company/cf_erp/material-requests/:id', '/testco/cf_erp/material-requests/41');
  assert.equal(qa('mr-take').length, 0); assert.equal(q1('mr-save'), null);
  assert.match(text(document.body), /Changing it needs the Stores permission/);
});

// ── 3: the PR grid ──────────────────────────────────────────────────────────────
await check('PR grid: rows = lines, a column per vendor; three columns to start (two empty), + Vendor adds one; it scrolls inside its own box', async () => {
  reset();
  globalThis.__routes['GET /purchase-requests/61'] = () => prFixture();
  await page(m.PurchaseRequestDetail, '/:company/cf_erp/purchase-requests/:id', '/testco/cf_erp/purchase-requests/61');
  assert.equal(qa('pr-row').length, 2);
  assert.equal(qa('pr-vendor').length, 1); assert.equal(qa('pr-empty-column').length, 2, 'three columns in all');
  await click(q1('pr-add-vendor')); await settle();
  assert.equal(qa('pr-empty-column').length, 3);
  assert.equal(q1('pr-grid-scroll').style.overflowX || getComputedStyle(q1('pr-grid-scroll')).overflowX, 'auto');
  assert.deepEqual([...document.querySelectorAll('[data-testid="pr-grid"] thead th')].slice(0, 3).map(text), ['Line', 'Needed', 'PO raised']);
  assert.match(text(qa('pr-row')[1]), /3 nos/);
  const cell = qa('pr-cell').find((c) => c.closest('[data-line="72"]'));
  assert.match(text(cell), /\/nos/, 'the unit is shown beside the rate');
});
await check('a rate is saved when its box is left; a blank rate clears the cell', async () => {
  reset();
  globalThis.__routes['GET /purchase-requests/61'] = () => prFixture();
  const sent = [];
  globalThis.__routes['PUT /purchase-request-vendors/81/quotes'] = (b) => { sent.push(b); return prFixture(); };
  await page(m.PurchaseRequestDetail, '/:company/cf_erp/purchase-requests/:id', '/testco/cf_erp/purchase-requests/61');
  const rate = qa('pr-rate').find((r) => r.closest('[data-line="72"]'));
  await setValue(rate, '61000'); await blur(rate);
  assert.deepEqual(sent.at(-1), { quotes: [{ lineId: 72, rate: 61000, deliveryDays: 7, remark: null }] });
  await setValue(rate, ''); await blur(rate);
  assert.deepEqual(sent.at(-1), { quotes: [{ lineId: 72, rate: null }] });
});
await check('Raise PO: that vendor\'s quoted lines, quantity filled in (needed − PO raised), 0 skips, the expected delivery date proposed; it waits for MD approval', async () => {
  reset();
  const pr = prFixture(); pr.lines[1].poRaised = 1; pr.lines[1].open = 2;
  globalThis.__routes['GET /purchase-requests/61'] = () => pr;
  globalThis.__routes['GET /purchase-request-vendors/81/pending-pos'] = () => ({ vendor: { id: 81, supplier: { id: 31, name: 'Vendor A' } }, purchaseOrders: [] });
  let body = null;
  globalThis.__routes['POST /purchase-request-vendors/81/purchase-orders'] = (b) => { body = b; return { purchaseOrder: poFixture(), purchaseRequest: pr }; };
  await page(m.PurchaseRequestDetail, '/:company/cf_erp/purchase-requests/:id', '/testco/cf_erp/purchase-requests/61');
  await click(q1('pr-raise-po')); await settle(80);
  const qty = qa('raise-qty');
  assert.deepEqual(qty.map((x) => x.value), ['1', '2']);
  assert.equal(q1('raise-expected').value, '2026-10-28', 'today + the longest quoted delivery days');
  await setValue(qty[0], '0'); await settle();
  await setValue(qty[1], '3'); await settle();
  assert.match(text(document.querySelector('.MuiDialog-root')), /At most 2 nos\./);
  await setValue(qty[1], '2'); await settle();
  await click(buttonIn(document.querySelector('.MuiDialog-root'), 'Raise PO')); await settle(80);
  assert.deepEqual(body, { lines: [{ lineId: 71, quantity: 0 }, { lineId: 72, quantity: 2 }], addToPoId: null, expectedDate: '2026-10-28' });
  assert.match(src('pages/PurchaseRequestDetail.tsx'), /it waits for Management approval/);
});

// ── 4: the PO ───────────────────────────────────────────────────────────────────
await check('PO pending MD approval: the MD sees Approve (and nothing can be received yet); the buyer does not', async () => {
  reset(); asUser(['cf_erp_inventory_view', 'cf_erp_inventory_manage']);
  globalThis.__routes['GET /purchase-orders/2325'] = () => poFixture();
  await page(m.PurchaseOrderDetail, '/:company/cf_erp/purchase-orders/:id', '/testco/cf_erp/purchase-orders/2325');
  assert.match(text(document.body), /Pending Management approval/); assert.match(text(document.body), /Material/);
  assert.ok(q1('po-pending-approval'));
  assert.equal(q1('po-approve'), null, 'the buyer cannot approve');
  assert.equal(q1('po-receive'), null, 'nothing to receive yet');
  // §73: Management approves with cf_erp_approve_purchase_order (the inbox's tag for a PO).
  reset(); asUser(['cf_erp_inventory_view', 'cf_erp_approve_purchase_order']);
  let approved = false;
  globalThis.__routes['GET /purchase-orders/2325'] = () => poFixture();
  globalThis.__routes['POST /purchase-orders/2325/approve'] = () => { approved = true; return poFixture({ status: 'ordered', stage: 'waiting', stageLabel: 'Waiting for goods', approval: { status: 'approved', by: { id: 1, name: 'MD' }, at: '2026-10-18T10:00:00Z' } }); };
  await page(m.PurchaseOrderDetail, '/:company/cf_erp/purchase-orders/:id', '/testco/cf_erp/purchase-orders/2325');
  await click(q1('po-approve')); await settle(80);
  assert.ok(approved);
  assert.match(text(document.body), /Waiting for goods/); assert.match(text(q1('po-approved')), /Approved by MD on 2026-10-18/);
});
await check('PO waiting for goods: Ordered / Received / Pending per line, Receive goods (Inventory), Close PO asks why; the PO date and a line\'s own, changes listed', async () => {
  reset();
  const waiting = poFixture({ status: 'partially_received', stage: 'part_received', stageLabel: 'Part received', approval: { status: 'approved', by: null, at: null },
    lines: [poLine({ received: 2, outstanding: 1, pending: 1, expectedDate: null, effectiveDate: '2026-10-27', dateSource: 'po', receipts: [{ id: 1, code: 'GRN-1', date: '2026-10-17', quantity: 1 }, { id: 2, code: 'GRN-2', date: '2026-10-17', quantity: 1 }] })],
    expectedDate: '2026-10-27', dateChanges: [{ id: 5, lineId: null, from: '2026-10-25', to: '2026-10-27', by: { id: 1, name: 'Buyer' }, at: '2026-10-18T09:00:00Z' }] });
  let closeBody = null; let dateBody = null;
  globalThis.__routes['GET /purchase-orders/2325'] = () => waiting;
  // §73: closing short is ASKED — the PO stays open until Management approves it.
  globalThis.__routes['POST /purchase-orders/2325/close'] = (b) => { closeBody = b; return { ...waiting, pendingApprovals: [{ id: 9, type: 'po_close_short', typeLabel: 'Close a PO short', requestedBy: { id: 2, name: 'Buyer' }, requestedAt: '2026-10-18T10:00:00Z', note: b.reason }] }; };
  globalThis.__routes['PUT /purchase-orders/2325'] = (b) => { dateBody = b; return { ...waiting, expectedDate: b.expectedDate }; };
  await page(m.PurchaseOrderDetail, '/:company/cf_erp/purchase-orders/:id', '/testco/cf_erp/purchase-orders/2325');
  assert.equal(text(q1('po-line-received')), '2'); assert.equal(text(q1('po-line-pending')), '1');
  assert.ok(q1('po-receive').getAttribute('href').includes('/receive?po=PO-002325'), 'goods come in from Inventory › Receive against PO');
  assert.match(text(q1('po-line-expected')), /the PO's: 2026-10-27/, 'a line with no date of its own takes the PO\'s');
  assert.match(text(q1('po-date-changes')), /The PO: 2026-10-25 → 2026-10-27 · Buyer/);
  const head = q1('po-expected-date');
  await setValue(head, '2026-10-30'); await blur(head);
  assert.deepEqual(dateBody, { expectedDate: '2026-10-30' });
  await click(q1('po-close')); await settle(60);
  const dlg = document.querySelector('[role="dialog"]');
  assert.match(text(dlg), /Management approves it first/); assert.match(text(dlg), /what is still pending is released/);
  await setValue(dlg.querySelector('textarea'), 'mill short'); await click(buttonIn(dlg, 'Ask Management')); await settle(80);
  assert.deepEqual(closeBody, { reason: 'mill short' });
  assert.match(text(q1("po-close-asked")), /Closing short waits for Management/); assert.match(text(q1("po-close-asked")), /asked by Buyer/); assert.match(text(q1("po-close-asked")), /mill short/);
  assert.equal(q1('po-close'), null, 'asked once — no second ask');
  // Approved in the inbox: the PO reads closed short, what was pending released.
  globalThis.__routes['GET /purchase-orders/2325'] = () => poFixture({ status: 'received', stage: 'closed_short', stageLabel: 'Closed short', closed: { at: 'x', by: null, reason: 'mill short' }, lines: [poLine({ received: 2, outstanding: 1, pending: 0, closedQty: 1 })] });
  await page(m.PurchaseOrderDetail, '/:company/cf_erp/purchase-orders/:id', '/testco/cf_erp/purchase-orders/2325');
  assert.match(text(document.body), /Closed short/); assert.match(text(q1('po-line-pending')), /1 released/);
});

// ── 5: Inventory › Receive against PO ───────────────────────────────────────────
await check('Receive against PO lists every pending line and opens the GRN dialog for one', async () => {
  reset();
  globalThis.__routes['GET /purchase-orders/pending-lines'] = () => ({ rows: [{ purchaseOrder: { id: 2325, code: 'PO-002325', status: 'ordered', suppliedByCustomer: false, type: 'material' }, supplier: { id: 31, name: 'Vendor A' },
    line: { id: 3001, lineNo: 1 }, item: PS, ordered: 3, received: 1, pending: 2, expectedDate: '2026-10-25', forOrders: ['TEST-PUR-NEST'] }] });
  globalThis.__routes['GET /purchase-orders/2325'] = () => poFixture({ status: 'ordered', stage: 'waiting' });
  globalThis.__routes['GET /stocking-areas'] = () => [{ id: 3, code: 'ST', name: 'Store', purpose: 'storage', status: 'active' }];
  await page(m.ReceiveAgainstPo, '/:company/cf_erp/receive', '/testco/cf_erp/receive');
  assert.match(text(document.body), /PO-002325.*Vendor A.*TPUR-PS.*3.*1.*2/);
  await click(q1('receive-line')); await settle(120);
  assert.ok(document.querySelector('.MuiDialog-root'), 'the GRN dialog');
});

// ── 6: the menu, removed screens, the gate and the words ──────────────────────────
await check('menu: Purchase requests, Purchase orders (MRs in Stores, §79); Stores › Receive against PO; no boards; Plate changes hidden while the gate is off', () => {
  const purchase = m.SECTIONS.find((s) => s.key === 'purchase').screens.map((s) => s.key);
  // §79: MRs moved to Stores (MR inbox); Purchase sees PRs only.
  assert.deepEqual(purchase, ['purchase-requests', 'purchase-orders', 'suppliers']);
  assert.ok(m.SECTIONS.find((s) => s.key === 'inventory').screens.some((s) => s.key === 'material-requests' && s.label === 'MR inbox'));
  assert.equal(m.PLATE_CHANGE_GATE, false);
  assert.ok(m.SECTIONS.find((s) => s.key === 'inventory').screens.some((s) => s.key === 'receive' && s.label === 'Receive against PO'));
  for (const gone of ['pages/PurchaseBoard.tsx', 'components/Purchase/PurchaseLanes.tsx', 'components/Purchase/RequisitionBoard.tsx', 'components/Purchase/RequisitionDialogs.tsx', 'components/Purchase/RequisitionTable.tsx',
    'components/Purchase/PoStagePanel.tsx', 'components/Purchase/SendRfqDialog.tsx', 'components/RfqComparison.tsx', 'components/QuoteDialog.tsx', 'lib/procurement.ts', 'lib/purchaseFlow.ts', 'lib/rfqFiles.ts', 'api/purchase.ts'])
    assert.ok(!existsSync(resolve('src/apps/cf_erp', gone)), `${gone} is gone`);
  assert.match(src('routes.tsx'), /cf_erp\/purchase', element: <ToMaterialRequests \/>/, 'the old board address lands on the MRs');
});
await check('the nesting words say "by AI" where our algorithm did it', () => {
  const tab = src('components/Nesting/NestCompareTab.tsx');
  assert.match(tab, /The customer's nesting beside AI's/); assert.match(tab, />Run AI again</); assert.doesNotMatch(tab, /Running our nesting|Our nesting/);
  assert.match(src('components/Nesting/NestingPanel.tsx'), /label="Compare with AI"/);
  assert.match(src('components/Nesting/NestDoors.tsx'), /title="Nesting by AI" button="Nest by AI"/);
  assert.match(src('lib/nesting.ts'), /rest: 'Nest the rest by AI'/);
  assert.match(src('components/Nesting/PlateDiagram.tsx'), /label="Added by AI"/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
