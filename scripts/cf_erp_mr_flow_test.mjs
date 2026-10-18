// Run from multi_app_fe: node scripts/cf_erp_mr_flow_test.mjs
// MATERIAL REQUEST (MR) and CUSTOMER-SUPPLIED material (init.sql §66, TM/CF_ERP_BUYING_V2.md "2026-10-16"), rendered in jsdom
// against mocked routes shaped like the backend's answers (multi_app_be/scripts/cf_kepl/mr_flow_test.mjs, TM/MR_FLOW_RUN.md).
// §71 (2026-10-18): the sales order's stage only RAISES the MR and shows its status; the MR table, taking from stock and
// buying are in Purchase (cf_erp_purchase_flow_v3_test.mjs). What follows is the old list, kept where it still holds:
// the stage is called Material request; the MR table shows need / earmarked / on PO / received / open; "Raise the material
// request" earmarks (earmark: true) and says what was earmarked and which PO went to the customer; a customer-supplied MR has
// no Buy / Skip and asks the customer for what is open; a line without an MR says who supplies it and can change it; the
// order form asks "We buy / Customer supplies"; the release dialog says "Material from MR-…" and the toast what was reserved;
// a PO to the customer is marked; the Stock screen filters by owner (ours, all customers, one customer).
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/orders/30001', pretendToBeVisual: true });
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
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom';
      export { React, createRoot, MemoryRouter };
      export * from './src/apps/cf_erp/api/requisitions';
      export * from './src/apps/cf_erp/lib/materialRequest';
      export { OrderPurchasePanel } from './src/apps/cf_erp/components/Purchase/OrderPurchasePanel';
      export { MaterialSupplyField } from './src/apps/cf_erp/components/Purchase/MaterialSupplyField';
      export { ReleaseDialog } from './src/apps/cf_erp/components/TrackerDialogs';
      export { ReceiveLineDialog } from './src/apps/cf_erp/components/PurchaseDialogs';
      export { CustomerMaterialStatus, PromisedDateDialog } from './src/apps/cf_erp/components/Purchase/CustomerMaterialStatus';
      export { plateSize } from './src/apps/cf_erp/lib/plateChange';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/api\/client$/ }, () => ({ path: 'api', namespace: 'stub' }));
    b.onResolve({ filter: /^@core\/contexts\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'stub' }));
    b.onLoad({ filter: /^api$/, namespace: 'stub' }, () => ({ contents: apiStub, loader: 'js' }));
    b.onLoad({ filter: /^auth$/, namespace: 'stub' }, () => ({ contents: authStub, loader: 'js' }));
  } }],
  alias: { '@shared/ui': resolve('src/shared/ui/SheetGrid.tsx') },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error', loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{"VITE_API_HOST":"http://localhost:4000"}' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `mr-flow-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { if (process.env.ONLY && !label.includes(process.env.ONLY)) return; try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const src = (p) => readFileSync(resolve('src/apps/cf_erp', p), 'utf8');
const app = document.getElementById('app');
let root = null;
const render = async (el) => {
  if (root) { await React.act(async () => { root.unmount(); }); root = null; }
  document.querySelectorAll('.MuiDialog-root, .MuiPopover-root, .MuiMenu-root').forEach((n) => n.remove());
  app.replaceChildren();
  const host = document.createElement('div'); app.appendChild(host);
  root = createRoot(host);
  await React.act(async () => { root.render(React.createElement(MemoryRouter, { initialEntries: ['/testco/cf_erp/orders/30001'] }, el)); await sleep(40); });
};
const settle = async (ms = 50) => { await React.act(async () => { await sleep(ms); }); };
const qa = (id, scope = document) => [...scope.querySelectorAll(`[data-testid="${id}"]`)];
const q1 = (id, scope = document) => scope.querySelector(`[data-testid="${id}"]`);
const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const fire = async (el, type, init = {}) => { await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, ...init })); await sleep(20); }); };
const click = (el) => fire(el, 'click');
const buttonIn = (scope, label) => [...scope.querySelectorAll('button, a')].find((b) => text(b) === label || text(b).startsWith(label));
const calls = (method, path) => globalThis.__calls.filter((c) => c.method === method && c.path === path);
const lastCall = (method, path) => calls(method, path).at(-1);
const setValue = async (el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await React.act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(10); });
};
const reset = () => { globalThis.__calls = []; globalThis.__routes = {}; globalThis.__user = null; };

// ── fixtures, shaped as the backend answers (TM/MR_FLOW_RUN.md) ─────────────────
const item = (id, code) => ({ id, code, name: `girder material ${code}`, uom: 'kg', trackedBy: 'quantity' });
const A = item(9001, 'MA'), B = item(9002, 'MB'), C = item(9003, 'MC');
const zero = { issued: 0, reserved: 0, held: 0, stock: 0, ordered: 0, undated: 0, asked: 0, total: 0, open: 0, over: 0, freeNow: 0, pooledOnOrder: 0, firstDate: null, lastDate: null, late: false, earmarked: 0, onPo: 0, received: 0 };
const share = (id, code, qty, received, extra = {}) => ({ allocationId: id, purchaseOrder: { id: 1800 + id, code, status: 'ordered' }, purchaseLineId: 500 + id, supplier: { id: 77, name: 'Supplier one' }, quantity: qty, received, outstanding: qty - received, date: '2026-10-26', state: 'dated', late: false, ...extra });
const line = (id, it, need, cover, extra = {}) => ({ id, item: it, need, needRaised: need, needKnown: true, status: 'covered', statusLabel: 'On order', resolved: true, sentence: 's', skipped: null, cover: { ...zero, ...cover }, holds: [], purchase: [], ready: null, ...extra });
// MR 2 of the we-buy order after the partial GRN: A earmarked 1 + 3 on PO; B 2 earmarked (received) + 4 on POs.
const weBuy = () => ({
  id: 41, code: 'MR-TEST-MR-1-WEBUY-2', supply: 'we_buy', supplyLabel: 'We buy',
  order: { id: 30001, code: 'TEST-MR-1-WEBUY', status: 'confirmed' }, line: { id: 801, lineNo: 2, name: 'Girder', quantity: 1, frozen: true, released: false },
  status: 'covered', statusLabel: 'Covered', done: true, sentence: 'All 3 materials covered.', raisedAt: '2026-10-16', raisedBy: null, syncedAt: null,
  needKnown: true, needComplete: true, stale: false, missing: [], counts: {}, materialReady: null,
  lines: [
    line(101, A, 4, { held: 1, stock: 1, earmarked: 1, ordered: 3, onPo: 3, total: 4 }, { purchase: [share(1, 'PO-001880', 3, 0)] }),
    line(102, B, 6, { held: 2, stock: 2, earmarked: 2, ordered: 4, onPo: 4, received: 2, total: 6 }, { purchase: [share(2, 'PO-001880', 4, 2), share(3, 'PO-001882', 2, 0)] }),
    line(103, C, 5, { held: 5, stock: 5, earmarked: 5, total: 5 }, { status: 'from_stock', statusLabel: 'From stock' }),
  ],
});
// The customer-supplied MR after its PO was cancelled: B and C open again.
const custOpen = () => ({
  ...weBuy(), id: 42, code: 'MR-TEST-MR-1-CUST-1', supply: 'customer', supplyLabel: 'Customer supplies', status: 'partly_covered', statusLabel: 'Partly covered', done: false,
  order: { id: 30001, code: 'TEST-MR-1-CUST', status: 'confirmed' }, line: { id: 802, lineNo: 1, name: 'Girder', quantity: 1, frozen: true, released: false },
  lines: [
    line(201, A, 4, { held: 2, stock: 2, earmarked: 2, open: 2, total: 2 }, { status: 'part', statusLabel: 'Partly covered', resolved: false }),
    line(202, B, 6, { open: 6 }, { status: 'open', statusLabel: 'Open', resolved: false }),
  ],
});
const orderReqs = (reqs, extra = {}) => ({ order: { id: 30001, code: 'TEST-MR-1', status: 'confirmed', open: true, materialSupply: 'we_buy', materialSupplyLabel: 'We buy' }, today: '2026-10-16', reason: null, requisitions: reqs, linesWithout: [], ...extra });
const stage = { stageKey: 'buying', label: 'Material request', sequence: 5, requirement: 'required', applies: true, decidedBy: 'data', state: 'partial', blockers: [], detail: '1 material to decide', summary: null };
const order = { id: 30001, code: 'TEST-MR-1', materialSupply: 'we_buy' };
const mount = (reqs, opts = {}) => {
  globalThis.__routes['GET /orders/30001/requisitions'] = () => reqs;
  globalThis.__routes['GET /material-requests'] = () => ({ rows: [] });
  globalThis.__routes['GET /customer-material/returns'] = () => opts.returns ?? { toReturn: [], substitutes: [] };
  return render(React.createElement(m.OrderPurchasePanel, { order: opts.order ?? order, stage, onChanged: () => {} }));
};

// ── 1: the calls and the words ────────────────────────────────────────────────
await check('helpers: raise sends what it is given (no earmark since §71); the line supply is a PUT with { supply } (null = as the order)', async () => {
  reset();
  globalThis.__routes['POST /orders/30001/requisitions'] = () => ({});
  globalThis.__routes['PUT /order-lines/802/material-supply'] = () => ({});
  await m.raiseRequisitions(30001, {});
  assert.deepEqual(lastCall('POST', '/orders/30001/requisitions').body, {});
  await m.setLineSupply(802, 'customer');
  assert.deepEqual(lastCall('PUT', '/order-lines/802/material-supply').body, { supply: 'customer' });
  await m.setLineSupply(802, null);
  assert.deepEqual(lastCall('PUT', '/order-lines/802/material-supply').body, { supply: null });
});
await check('words: supply labels, the MR figures, raised and released messages', () => {
  assert.equal(m.supplyLabel('customer'), 'Customer supplies'); assert.equal(m.supplyLabel(undefined), 'We buy');
  assert.deepEqual(m.mrFigures(weBuy().lines[1]), { need: 6, earmarked: 2, onPo: 4, received: 2, open: 0 });
  // An older answer with no MR figures falls back to the cover and the shares.
  const old = weBuy().lines[1]; delete old.cover.earmarked; delete old.cover.onPo; delete old.cover.received;
  assert.deepEqual(m.mrFigures(old), { need: 6, earmarked: 2, onPo: 4, received: 2, open: 0 });
  const raised = m.raisedMessage({ ...orderReqs([]), raised: 1, earmarked: [{ requisition: { id: 1, code: 'MR-X-1' }, lineId: 1, item: A, quantity: 2, owner: 'customer' }],
    customerPurchaseOrders: [{ id: 9, code: 'PO-001883', supplier: { id: 5, code: null, name: 'Customer X' } }] });
  assert.equal(raised, "MR raised. Earmarked: MA 2 (the customer's). PO-001883 made to Customer X for what they send.");
  assert.equal(m.releasedMessage(1, { fromMr: { requisition: { id: 1, code: 'MR-X-1' }, reserved: [{ item: A, quantity: 4 }, { item: B, quantity: 6 }], left: [] } }),
    'Line 1 released to production. Material from MR-X-1: MA 4 kg, MB 6 kg reserved for production.');
  assert.equal(m.releasedMessage(2, null), 'Line 2 released to production.');
  assert.equal(m.lockedWords(weBuy()), '1 of 3 locked');
});

// ── 2: the MR table ───────────────────────────────────────────────────────────
await check('the stage is "Material request": a read-only row per MR with its status and what is locked, linking into Purchase', async () => {
  reset();
  await mount(orderReqs([weBuy()]));
  assert.match(text(document.body), /Material request/);
  assert.match(text(q1('order-supply')), /^Material: We buy — raising the MR sends it to Stores/);
  const row = q1('mr-status-row');
  assert.match(text(row), /MR-TEST-MR-1-WEBUY-2.*Line 2.*Covered.*1 of 3 locked/);
  assert.ok(row.querySelector('a').getAttribute('href').endsWith('/material-requests/41'));
  assert.equal(q1('req-table'), null, 'the MR table is in Purchase now');
  assert.equal([...document.querySelectorAll('button')].filter((b) => /Check stock|Skip|Buy|Release excess/.test(text(b))).length, 0);
});
await check('a customer-supplied MR: badge on its row, nothing to buy or skip on the sales order', async () => {
  reset();
  await mount(orderReqs([custOpen()], { order: { ...orderReqs([]).order, materialSupply: 'customer' } }), { order: { ...order, materialSupply: 'customer' } });
  assert.match(text(q1('mr-status-row')), /Customer supplies/);
  assert.match(text(q1('order-supply')), /the customer sends it/);
  assert.equal([...document.querySelectorAll('button')].filter((b) => /Buy|Skip|Ask the customer/.test(text(b))).length, 0);
});
await check('raising a customer line proposes its committed date; an undated customer PO asks for the date on the MR', async () => {
  reset();
  let posted = null;
  const without = [{ line: { id: 804, lineNo: 4, name: 'Girder' }, supply: 'customer', ownSupply: null, customerDateDefault: '2026-12-01', canRaise: true, reason: null, materials: [{ item: A, need: 4 }], materialReady: null }];
  globalThis.__routes['POST /orders/30001/requisitions'] = (body) => { posted = body; return orderReqs([custOpen()], { raised: 1 }); };
  await mount(orderReqs([], { linesWithout: without }));
  await click(q1('raise-mr')); await settle();
  assert.equal(document.querySelector('[data-testid="promised-date"]').value, '2026-12-01', 'the committed date is proposed');
  await click(buttonIn(document.querySelector('.MuiDialog-root'), 'Raise the MR')); await settle(80);
  assert.deepEqual(posted, { customerDate: '2026-12-01' });
  // (§71: an older customer PO with no date is dated on its PO page — the expected date of its lines.)
  assert.match(src('pages/PurchaseOrderDetail.tsx'), /<DateCell /);
});
await check('the MR (Purchase) shows what is to go back to the customer and the different items they sent', async () => {
  reset();
  const returns = {
    toReturn: [
      { party: { id: 5, name: 'Customer X' }, order: { id: 30001, code: 'TEST-MR-1-SUB' }, item: { id: 9001, code: 'MA', name: 'A', uom: 'kg' }, batch: { id: 70, code: 'L-70', status: 'available' }, quantity: 2, why: 'extra', text: 'More than TEST-MR-1-SUB needs — not earmarked.' },
      { party: { id: 5, name: 'Customer X' }, order: { id: 30001, code: 'TEST-MR-1-SUB' }, item: { id: 9010, code: 'B12', name: 'B 12', uom: 'kg' }, batch: { id: 71, code: 'L-71', status: 'on_hold' }, quantity: 6, why: 'substitute_rejected', text: 'Not accepted in place of MB (PC-000102).' },
    ],
    substitutes: [
      { id: 1, status: 'pending', statusLabel: 'Waiting for the MD — on hold', order: { id: 30001, code: 'TEST-MR-1-SUB' }, line: { id: 802, lineNo: 1 }, purchaseOrder: { id: 1884, code: 'PO-001884' }, ordered: { id: 9003, code: 'MC', name: 'C' }, received: { id: 9011, code: 'C12', name: 'C 12' }, quantity: 5, batch: { id: 72, code: 'L-72' }, reason: 'customer sent 12 mm', request: { id: 101, code: 'PC-000101', status: 'pending' }, text: '5 × C12 in place of MC on PO-001884 — held until the MD approves PC-000101.' },
    ],
  };
  globalThis.__routes['GET /customer-material/returns'] = () => returns;
  await render(React.createElement(m.CustomerMaterialStatus, { orderId: 30001 }));
  await settle(60);
  assert.match(src('pages/MaterialRequestDetail.tsx'), /customer && m\.order && <CustomerMaterialStatus orderId=\{m\.order\.id\} \/>/);
  const rows = qa('to-return-row');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.dataset.why), ['extra', 'substitute_rejected']);
  assert.match(text(q1('to-return')), /To return to the customer.*MA.*2 kg.*More than/);
  assert.match(text(q1('substitute-row')), /Waiting for the MD — on hold.*held until the MD approves PC-000101/);
  assert.equal(lastCall('GET', '/customer-material/returns').url, '/api/testco/cf_erp/customer-material/returns?orderId=30001');
});
await check("receiving on a customer's PO: more than asked is allowed, and a different item needs what came and why", async () => {
  reset();
  globalThis.__routes['GET /stocking-areas'] = () => [{ id: 3, code: 'ST', name: 'Store', purpose: 'storage', status: 'active' }];
  const poLine = { id: 600, lineNo: 1, item: { id: 9003, code: 'MC', name: 'C', uom: 'kg', trackedBy: 'quantity' }, quantity: 5, received: 0, outstanding: 5, unitPrice: 0, orders: [] };
  let body = null;
  globalThis.__routes['POST /purchase-lines/600/receive'] = (b) => { body = b; return { order: { id: 1884 }, held: [], substitute: { message: 'held until the MD approves PC-000101.' } }; };
  let got = null;
  await render(React.createElement(m.ReceiveLineDialog, { line: poLine, orderCode: 'PO-001884', customer: true, onClose: () => {}, onReceived: (p, h, x) => { got = x; } }));
  await settle(60);
  assert.match(text(q1('receive-customer')), /more comes than asked, the extra stays theirs/);
  const qty = [...document.querySelectorAll('input')].find((i) => i.value === '5');
  await setValue(qty, '7'); await settle();
  assert.equal(buttonIn(document, 'Receive')?.disabled, false, 'a customer may send more than asked');
  await click(document.querySelector('input[aria-label="The customer sent a different item"]')); await settle();
  assert.match(text(q1('receive-substitute-note')), /goes to the MD as a plate change.*on hold/);
  assert.equal(buttonIn(document, 'Receive')?.disabled, true, 'what came and why are needed');
  assert.match(src('components/PurchaseDialogs.tsx'), /substituteItemId: subItem.id, substituteReason: subReason.trim()/);
  void body; void got;
});
await check('a plate size with no thickness is said plainly (substitute items may have none)', () => {
  assert.equal(m.plateSize({ thickness: null, length: null, width: null }), 'size not known');
  assert.equal(m.plateSize({ thickness: 12, length: null, width: null }), '12 mm');
  assert.equal(m.plateSize({ thickness: 12, length: 3000, width: 1500 }), '12 mm × 3,000 × 1,500');
  assert.match(src('navMeta.ts'), /key: 'customer-returns', label: 'To return to customers'/);
  assert.match(src('components/Nesting/PlateChange.tsx'), /impact.nesting?.text/);
});

// ── 3: who supplies a line without an MR ──────────────────────────────────────
await check('a line without an MR says who supplies it and changes it with one PUT', async () => {
  reset();
  const without = [{ line: { id: 803, lineNo: 3, name: 'Deck' }, supply: 'we_buy', supplyLabel: 'We buy', ownSupply: null, canRaise: true, reason: null, materials: [{ item: A, need: 4 }], materialReady: null }];
  globalThis.__routes['PUT /order-lines/803/material-supply'] = () => ({ lineId: 803, lineNo: 3, materialSupply: 'customer', supply: 'customer' });
  await mount(orderReqs([], { linesWithout: without }));
  const sel = q1('line-supply');
  assert.match(text(sel), /As the order \(We buy\)/);
  await fire(sel, 'mousedown', { button: 0 }); await settle();
  const opt = [...document.querySelectorAll('li[role="option"]')].find((li) => text(li) === 'Customer supplies');
  assert.ok(opt, 'the menu offers Customer supplies');
  await click(opt); await settle();
  assert.deepEqual(lastCall('PUT', '/order-lines/803/material-supply').body, { supply: 'customer' });
  assert.ok(buttonIn(q1('line-without'), 'Raise MR'));
});
await check('"Raise MR" sends the order to Purchase and the answer is shown at once', async () => {
  reset();
  let raised = false;
  const without = [{ line: { id: 801, lineNo: 2, name: 'Girder' }, supply: 'we_buy', ownSupply: null, canRaise: true, reason: null, materials: [{ item: A, need: 4 }], materialReady: null }];
  globalThis.__routes['POST /orders/30001/requisitions'] = () => { raised = true; return orderReqs([weBuy()], { raised: 1, earmarked: [] }); };
  await mount(orderReqs([], { linesWithout: without }));
  globalThis.__routes['GET /orders/30001/requisitions'] = () => (raised ? orderReqs([weBuy()]) : orderReqs([], { linesWithout: without }));
  await click(q1('raise-mr')); await settle();
  assert.deepEqual(lastCall('POST', '/orders/30001/requisitions').body, {});
  assert.equal(qa('mr-status-row').length, 1);
  assert.match(text(q1('mr-status-row')), /MR-TEST-MR-1-WEBUY-2/);
});

// ── 4: the order form asks who supplies the material ───────────────────────────
await check('the material supply field: We buy / Customer supplies, with what each means', async () => {
  reset();
  const seen = [];
  await render(React.createElement(m.MaterialSupplyField, { value: 'we_buy', onChange: (v) => seen.push(v) }));
  assert.match(text(q1('material-supply')), /We buy.*Customer supplies.*Earmarked from our stock/);
  await click(buttonIn(q1('material-supply'), 'Customer supplies'));
  assert.deepEqual(seen, ['customer']);
  await render(React.createElement(m.MaterialSupplyField, { value: 'customer', onChange: () => {} }));
  assert.match(text(q1('material-supply')), /purchase order to them \(₹0\).*their stock/);
  assert.match(src('components/NewOrderDialog.tsx'), /materialSupply: supply/, 'the new order sends it');
  assert.match(src('pages/OrderDetail.tsx'), /body\.materialSupply = supply/, 'Details sends it when changed');
});

// ── 5: release takes the MR's earmarks ──────────────────────────────────────────
await check('the release dialog says "Material from MR-…" with what is earmarked; the toast names what was reserved', async () => {
  reset();
  const check0 = {
    line: { id: 801, lineNo: 2, orderId: 30001, orderCode: 'TEST-MR-1-WEBUY', quantity: 1 }, ok: true, problems: [],
    summary: { pieces: 3, groups: 1, steps: 3, waits: 0, requirements: 3 }, materials: [], finishedArea: { id: 7, code: 'DSP', name: 'Dispatch', purpose: 'dispatch' },
    areas: [{ id: 7, code: 'DSP', name: 'Dispatch', purpose: 'dispatch' }], needsFinishedArea: true,
    materialReady: { line: { id: 801, lineNo: 2 }, order: { id: 30001, code: 'TEST-MR-1-WEBUY', status: 'confirmed' }, today: '2026-10-16', requisition: { id: 41, code: 'MR-TEST-MR-1-WEBUY-2' },
      state: 'ready', readyDate: '2026-10-16', soft: false, known: true, complete: true, why: null, text: 'Its material is here.',
      materials: [
        { item: A, need: 4, short: 0, state: 'ready', date: '2026-10-16', skipped: false, requisitionLineId: 101, cover: [{ kind: 'held', date: '2026-10-16', qty: 4 }], text: 'MA: here.' },
        { item: B, need: 6, short: 0, state: 'ready', date: '2026-10-16', skipped: false, requisitionLineId: 102, cover: [{ kind: 'held', date: '2026-10-16', qty: 6 }], text: 'MB: here.' },
      ] },
  };
  globalThis.__routes['GET /order-lines/801/release-check'] = () => check0;
  const fromMr = { requisition: { id: 41, code: 'MR-TEST-MR-1-WEBUY-2' }, reserved: [{ item: A, quantity: 4 }, { item: B, quantity: 6 }], left: [] };
  globalThis.__routes['POST /order-lines/801/release'] = () => ({ id: 99, summary: true, fromMr });
  let got = null;
  await render(React.createElement(m.ReleaseDialog, { line: { id: 801, lineNo: 2, label: 'GR ×1' }, onClose: () => {}, onReleased: (r) => { got = r; } }));
  await settle(80);
  const box = q1('release-from-mr');
  assert.ok(box, 'the dialog shows where the material comes from');
  assert.match(text(box), /Material from MR-TEST-MR-1-WEBUY-2/);
  assert.match(text(box), /MA 4 kg, MB 6 kg/);
  await click(buttonIn(document, 'Release')); await settle(80);
  assert.ok(got, 'released');
  assert.equal(m.releasedMessage(2, got), 'Line 2 released to production. Material from MR-TEST-MR-1-WEBUY-2: MA 4 kg, MB 6 kg reserved for production.');
  // §76: a release goes by production order; its toast keeps releasedMessage's MR words (lib/productionOrders.releaseToast).
  assert.match(src('lib/productionOrders.ts'), /releasedMessage\(undefined, \{ fromMr: f \}/);
  assert.match(src('components/ProductionOrders/ProductionStep.tsx'), /releaseToast\(r\.released, r\.fromMr\)/);
});

// ── 6: the rest of the wording, the customer's PO, inventory by owner ─────────────
await check('wording: Purchase › Material requests, the cancel dialog; a PO to the customer is marked; Stock by owner', () => {
  assert.match(src('navMeta.ts'), /key: 'material-requests', label: 'MR inbox'/);
  assert.match(src('components/Purchase/CancelPoDialog.tsx'), /back to Open on \$\{prs\.join\(', '\)\} at once/);
  assert.match(src('pages/PurchaseOrderDetail.tsx'), /p\.suppliedByCustomer && <Badge family="info" label="Customer supplies"/);
  const stock = src('pages/Stock.tsx');
  assert.match(stock, /label="Ours"/);
  assert.ok(stock.includes('data-testid="stock-customer-status"') && stock.includes("<CustomerMaterialStatus partyId={owner === 'customer' ? null : Number(owner)} />"), 'the customer view shows what is to go back');
  assert.match(stock, /label="All customers'"/); assert.match(stock, /data-testid="held-by-customer"/);
  assert.doesNotMatch(src('components/Purchase/OrderPurchasePanel.tsx'), /title="Buying"/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
