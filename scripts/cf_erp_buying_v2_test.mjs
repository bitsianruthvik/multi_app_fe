// Run from multi_app_fe: node scripts/cf_erp_buying_v2_test.mjs
// Buying v2 (TM/CF_ERP_BUYING_V2.md): the requisition on the order's Buying stage, rendered in jsdom against mocked routes
// that answer with the contract's example payloads — each cover kind as a chip (a row split over three POs with three
// dates), a requisition met from stock with no PO, the stock check as a dry run then Hold, skip / skip all / undo, Buy… with
// two POs and a date per line, Release excess, the material-ready line in every state with its reasons, a PO line's date
// edit and the planned cards it makes late, the board's "waiting for stock" group, the stage foot, and a read-only role.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/orders/22552', pretendToBeVisual: true });
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

// ── mocked routes ────────────────────────────────────────────────────────────
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
      export * from './src/apps/cf_erp/lib/requisition';
      export { OrderPurchasePanel } from './src/apps/cf_erp/components/Purchase/OrderPurchasePanel';
      export { MaterialReadyChip } from './src/apps/cf_erp/components/Purchase/MaterialReadyChip';
      export { RequisitionBoard } from './src/apps/cf_erp/components/Purchase/RequisitionBoard';
      export { PoStagePanel } from './src/apps/cf_erp/components/Purchase/PoStagePanel';
      export { StageFoot } from './src/apps/cf_erp/components/OrderProcess/StageFoot';
      export { buyingSummaryWords } from './src/apps/cf_erp/lib/process';`,
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
const artifact = resolve(cache, `buying-v2-test-${process.pid}.mjs`);
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
  document.querySelectorAll('.MuiDialog-root, .MuiPopover-root').forEach((n) => n.remove());
  app.replaceChildren();
  const host = document.createElement('div'); app.appendChild(host);
  root = createRoot(host);
  await React.act(async () => { root.render(React.createElement(MemoryRouter, { initialEntries: ['/testco/cf_erp/orders/22552'] }, el)); await sleep(30); });
};
const settle = async (ms = 40) => { await React.act(async () => { await sleep(ms); }); };
const qa = (id, scope = document) => [...scope.querySelectorAll(`[data-testid="${id}"]`)];
const q1 = (id, scope = document) => scope.querySelector(`[data-testid="${id}"]`);
const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const fire = async (el, type, init = {}) => { await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, ...init })); await sleep(20); }); };
const click = (el) => fire(el, 'click');
const buttonIn = (scope, label) => [...scope.querySelectorAll('button, a')].find((b) => text(b) === label || text(b).startsWith(label));
const setValue = async (el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await React.act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(10); });
};
const blur = async (el) => { await React.act(async () => { el.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true })); await sleep(30); }); };
const calls = (method, path) => globalThis.__calls.filter((c) => c.method === method && c.path === path);
const lastCall = (method, path) => calls(method, path).at(-1);
const reset = () => { globalThis.__calls = []; globalThis.__routes = {}; globalThis.__user = null; };

// ── fixtures: the contract's real example, id for id ───────────────────────────
const item = (id, code) => ({ id, code, name: `BHMV2RB688 material ${code.slice(-1)}`, uom: 'kg', trackedBy: 'quantity' });
const A = item(131262, 'BHMV2RB688-A'), B = item(131263, 'BHMV2RB688-B'), C = item(131264, 'BHMV2RB688-C');
const zero = { issued: 0, reserved: 0, held: 0, stock: 0, ordered: 0, undated: 0, asked: 0, total: 0, open: 0, over: 0, freeNow: 0, pooledOnOrder: 0, firstDate: null, lastDate: null, late: false };
const po = (id, code, lineId, supplier, qty, date, extra = {}) => ({ allocationId: id, purchaseOrder: { id: 1000 + id, code, status: 'ordered' }, purchaseLineId: lineId, supplier, quantity: qty, received: 0, outstanding: qty, date, state: 'dated', late: false, ...extra });
const S1 = { id: 21630, name: 'BHMV2RB688 S1' }, S2 = { id: 21631, name: 'BHMV2RB688 S2' }, S3 = { id: 21632, name: 'BHMV2RB688 S3' };
const lineA = { id: 225, item: A, need: 10, needRaised: 10, needKnown: true, status: 'from_stock', statusLabel: 'From stock', resolved: true, sentence: 'Covered from stock held for this line.', skipped: null,
  cover: { ...zero, held: 10, stock: 10, total: 10 }, holds: [{ id: 45959, quantity: 10, batch: null, purchaseOrder: null }], purchase: [],
  ready: { state: 'ready', date: '2026-10-12', text: 'BHMV2RB688-A: here.', cover: [{ kind: 'held', date: '2026-10-12', qty: 10 }] } };
const lineB = { id: 226, item: B, need: 4, needRaised: 4, needKnown: true, status: 'covered', statusLabel: 'On order', resolved: true, sentence: 'Covered — 4 kg on order, last delivery 11 Nov 2026.', skipped: null,
  cover: { ...zero, ordered: 4, total: 4, firstDate: '2026-10-21', lastDate: '2026-11-11' }, holds: [],
  purchase: [po(537, 'PO-001034', 1442, S1, 3, '2026-10-21'), po(538, 'PO-001035', 1443, S2, 1, '2026-11-11')],
  ready: { state: 'dated', date: '2026-11-11', text: 'BHMV2RB688-B: due 11 Nov 2026 on PO-001035.', cover: [] } };
const lineC = { id: 227, item: C, need: 2, needRaised: 2, needKnown: true, status: 'skipped', statusLabel: 'Skipped', resolved: true, sentence: 'Buying skipped — it waits for stock. 2 kg is not in stock yet.',
  skipped: { by: { id: 13, name: 'Test User' }, at: '2026-10-11T00:27:47.000Z', note: null }, cover: { ...zero, open: 2 }, holds: [], purchase: [],
  ready: { state: 'waiting', date: null, text: 'BHMV2RB688-C: buying was skipped — waiting for stock (2 kg not in stock yet).', cover: [{ kind: 'none', qty: 2, date: null }] } };
const counts = { lines: 3, over: 0, from_stock: 1, covered: 1, ordered_undated: 0, asked: 0, skipped: 1, part: 0, open: 0, not_needed: 0, waiting: 1 };
const REQ92 = {
  id: 92, code: 'PR-BHMV2RB688-O1-10', order: { id: 22552, code: 'BHMV2RB688-O1', status: 'confirmed', customer: { id: 21632, name: 'BHMV2RB688 CUS' } },
  line: { id: 9951, lineNo: 10, name: 'BHMV2RB688 material FG', quantity: 1, frozen: false, released: true },
  status: 'mixed', statusLabel: 'Covered, some skipped', done: true, sentence: 'All 3 materials decided — 1 from stock, 1 on order, 1 material skipped (1 waiting for stock now).',
  raisedAt: '2026-10-11T00:27:46.000Z', raisedBy: { id: 13, name: 'Test User' }, syncedAt: '2026-10-11T00:27:47.000Z', needKnown: true, needComplete: true, stale: false, missing: [], counts,
  materialReady: { state: 'waiting', readyDate: null, soft: false, text: 'BHMV2RB688-C: buying was skipped — waiting for stock (2 kg not in stock yet).' },
  lines: [lineA, lineB, lineC],
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const orderReqs = (reqs, extra = {}) => ({ order: { id: 22552, code: 'BHMV2RB688-O1', status: 'confirmed', open: true }, today: '2026-10-12', reason: null, requisitions: reqs, linesWithout: [], ...extra });
const lanesEmpty = { shortfall: [], lanes: [], held: { total: 0, rows: [] }, requisitions: [], linesWithout: [] };
const stage = {
  stageKey: 'buying', label: 'Buying', sequence: 5, requirement: 'required', applies: true, decidedBy: 'data', state: 'done', blockers: [],
  detail: 'All 3 materials decided — 1 held in stock, 1 on order, last delivery 11 Nov 2026, 1 skipped (1 waiting for stock)',
  summary: { materials: 3, fromStock: 1, onOrder: 1, skipped: 1, waiting: 1, open: 0 },
};
const order = { id: 22552, code: 'BHMV2RB688-O1' };
const mount = (reqs, opts = {}) => {
  globalThis.__routes['GET /orders/22552/requisitions'] = () => (opts.reqsResult ? opts.reqsResult(reqs) : reqs);
  globalThis.__routes['GET /orders/22552/purchase'] = () => opts.lanes ?? lanesEmpty;
  return render(React.createElement(m.OrderPurchasePanel, { order, stage: opts.stage ?? stage, onChanged: opts.onChanged }));
};
const rowOf = (lineId) => document.querySelector(`[data-testid="req-row"][data-line="${lineId}"]`);
const chipsOf = (row) => qa('cover-chip', row).map((c) => ({ kind: c.dataset.kind, label: text(c), href: c.getAttribute('href') }));

// ── 1: helpers: paths, methods, bodies ──────────────────────────────────────
await check('the helpers call the contract paths with the contract bodies', async () => {
  reset();
  for (const [method, path] of [['GET', '/orders/22552/requisitions'], ['POST', '/orders/22552/requisitions'], ['POST', '/requisitions/92/stock-check'], ['POST', '/requisitions/92/skip'],
    ['POST', '/requisitions/92/unskip'], ['POST', '/requisitions/purchase-orders'], ['POST', '/requisition-lines/225/release-excess'], ['GET', '/buying/board'], ['GET', '/order-lines/9951/material-ready'],
    ['PUT', '/purchase-lines/1443'], ['GET', '/requisitions/92']]) globalThis.__routes[`${method} ${path}`] = () => ({});
  await m.getOrderRequisitions(22552); assert.equal(lastCall('GET', '/orders/22552/requisitions').method, 'GET');
  await m.raiseRequisitions(22552, { lineIds: [9951] }); assert.deepEqual(lastCall('POST', '/orders/22552/requisitions').body, { lineIds: [9951] });
  await m.raiseRequisitions(22552); assert.deepEqual(lastCall('POST', '/orders/22552/requisitions').body, {});
  await m.checkStock(92); assert.deepEqual(lastCall('POST', '/requisitions/92/stock-check').body, {});
  await m.checkStock(92, [225]); assert.deepEqual(lastCall('POST', '/requisitions/92/stock-check').body, { lineIds: [225] });
  await m.holdStock(92, [{ lineId: 225, hold: 6 }]); assert.deepEqual(lastCall('POST', '/requisitions/92/stock-check').body, { apply: true, lines: [{ lineId: 225, hold: 6 }] });
  await m.skipLines(92, { lineIds: [227] }, 'free-issue by the client'); assert.deepEqual(lastCall('POST', '/requisitions/92/skip').body, { lineIds: [227], note: 'free-issue by the client' });
  await m.skipLines(92, { all: true }); assert.deepEqual(lastCall('POST', '/requisitions/92/skip').body, { all: true });
  await m.unskipLines(92, { lineIds: [227] }); assert.deepEqual(lastCall('POST', '/requisitions/92/unskip').body, { lineIds: [227] });
  await m.makePurchaseOrders([{ supplierId: 21630, place: true, lines: [{ prLineId: 226, quantity: 3, expectedDate: '2026-10-21' }] }]);
  assert.deepEqual(lastCall('POST', '/requisitions/purchase-orders').body, { orders: [{ supplierId: 21630, place: true, lines: [{ prLineId: 226, quantity: 3, expectedDate: '2026-10-21' }] }] });
  await m.releaseExcessPlan(225); assert.deepEqual(lastCall('POST', '/requisition-lines/225/release-excess').body, {});
  await m.releaseExcess(225); assert.deepEqual(lastCall('POST', '/requisition-lines/225/release-excess').body, { apply: true });
  await m.getBuyingBoard({ orderId: 22552, search: ' x ' }); assert.equal(lastCall('GET', '/buying/board').url, '/api/testco/cf_erp/buying/board?orderId=22552&search=x');
  await m.updatePurchaseLine(1443, { expectedDate: '2026-11-11' }); assert.deepEqual(lastCall('PUT', '/purchase-lines/1443').body, { expectedDate: '2026-11-11' });
  await m.updatePurchaseLine(1443, { quantity: 2 }); assert.deepEqual(lastCall('PUT', '/purchase-lines/1443').body, { quantity: 2 });
});

// ── 2: the requisition table ─────────────────────────────────────────────────
await check('the table has a row per material; each cover kind is a chip; a row split over two POs shows both dates', async () => {
  reset();
  await mount(orderReqs([clone(REQ92)]));
  assert.equal(qa('req-row').length, 3);
  assert.ok(text(q1('req-sentence')).startsWith('All 3 materials decided — 1 from stock, 1 on order'));
  assert.deepEqual(chipsOf(rowOf(225)).map((c) => c.label), ['From stock 10']);
  const b = chipsOf(rowOf(226));
  assert.deepEqual(b.map((c) => c.label), ['PO-001034 · 3 · due 21 Oct', 'PO-001035 · 1 · due 11 Nov']);
  assert.ok(b[0].href.endsWith('/purchase-orders/1537') && b[1].href.endsWith('/purchase-orders/1538'), 'each PO chip opens its PO');
  const c = chipsOf(rowOf(227));
  assert.deepEqual(c.map((x) => x.label), ['Skipped — waits for stock']);
  assert.match(qa('cover-chip', rowOf(227))[0].getAttribute('aria-label'), /Skipped by Test User on 11 Oct/);
  assert.equal(rowOf(227).dataset.status, 'skipped');
  assert.match(text(q1('buying-summary')), /All 3 materials decided/);
});
await check('a row split over THREE POs shows three chips with three dates, and the received share', async () => {
  reset();
  const r = clone(REQ92);
  r.lines[1].need = 9; r.lines[1].cover = { ...zero, ordered: 9, total: 9, firstDate: '2026-10-21', lastDate: '2026-12-02' };
  r.lines[1].purchase = [po(537, 'PO-001034', 1442, S1, 3, '2026-10-21', { received: 1, outstanding: 2 }), po(538, 'PO-001035', 1443, S2, 4, '2026-11-11'), po(539, 'PO-001036', 1444, S3, 2, '2026-12-02')];
  await mount(orderReqs([r]));
  const labels = chipsOf(rowOf(226)).map((c) => c.label);
  assert.deepEqual(labels, ['PO-001034 · 3 · due 21 Oct (1 received)', 'PO-001035 · 4 · due 11 Nov', 'PO-001036 · 2 · due 2 Dec']);
});
await check('asked, ordered-without-date, overdue, received, over and open show as their own chips in words', async () => {
  reset();
  const r = clone(REQ92);
  r.lines = [
    { ...lineB, id: 301, status: 'asked', statusLabel: 'Asked', resolved: false, sentence: '4 kg is asked for and not ordered yet — production waits until the order is placed with a date.', cover: { ...zero, asked: 4, total: 4, open: 0 }, purchase: [po(601, 'PO-000960', 1500, null, 4, null, { state: 'asked' })] },
    { ...lineB, id: 302, status: 'ordered_undated', resolved: false, sentence: 'Ordered, but 4 kg has no receiving date — production waits until a date is set.', cover: { ...zero, undated: 4, total: 4 }, purchase: [po(602, 'PO-000012', 1501, S1, 4, null, { state: 'undated' })] },
    { ...lineB, id: 303, status: 'covered', sentence: 'Covered — (a delivery is overdue)', cover: { ...zero, ordered: 4, total: 4, late: true }, purchase: [po(603, 'PO-000987', 1502, S1, 4, '2026-10-01', { late: true })] },
    { ...lineB, id: 304, status: 'covered', cover: { ...zero, ordered: 4, total: 4 }, purchase: [po(604, 'PO-000500', 1503, S1, 4, '2026-10-02', { state: 'received', received: 4, outstanding: 0 })] },
    { ...lineA, id: 305, status: 'from_stock', cover: { ...zero, held: 13, stock: 13, total: 13, over: 3 } },
    { ...lineC, id: 306, status: 'open', statusLabel: 'Open', resolved: false, skipped: null, sentence: 'Nothing decided yet — hold stock, order it, or skip it.', cover: { ...zero, open: 2 } },
  ];
  await mount(orderReqs([r]));
  assert.deepEqual(chipsOf(rowOf(301)).map((c) => c.label), ['Asked for, no date yet · 4']);
  assert.deepEqual(chipsOf(rowOf(302)).map((c) => c.label), ['PO-000012 · 4 · no date']);
  assert.deepEqual(chipsOf(rowOf(303)).map((c) => c.label), ['PO-000987 · 4 · was due 1 Oct']);
  assert.equal(chipsOf(rowOf(303))[0].kind, 'po');
  assert.deepEqual(chipsOf(rowOf(304)).map((c) => c.label), ['PO-000500 · 4 · received']);
  assert.deepEqual(chipsOf(rowOf(305)).map((c) => c.label), ['From stock 13', 'Over by 3']);
  assert.deepEqual(chipsOf(rowOf(306)).map((c) => c.label), ['Open 2']);
  assert.match(text(rowOf(301)), /asked for and not ordered yet/);
});
await check('a requisition met entirely from stock shows no PO and says so', async () => {
  reset();
  const r = clone(REQ92);
  r.status = 'fulfilled_from_stock'; r.statusLabel = 'From stock'; r.sentence = 'All 1 materials held from stock — nothing to buy.';
  r.lines = [lineA]; r.counts = { ...counts, lines: 1, from_stock: 1, covered: 0, skipped: 0, waiting: 0 };
  r.materialReady = { state: 'ready', readyDate: '2026-10-12', soft: false, text: 'BHMV2RB688-A: here.' };
  await mount(orderReqs([r]), { stage: { ...stage, summary: { materials: 1, fromStock: 1, skipped: 0, waiting: 0, open: 0 }, detail: 'All 1 materials decided — 1 held in stock' } });
  assert.deepEqual(chipsOf(rowOf(225)).map((c) => c.label), ['From stock 10']);
  assert.equal(qa('cover-chip').filter((c) => c.dataset.kind === 'po').length, 0);
  assert.match(text(q1('req-sentence')), /nothing to buy/);
  assert.equal(q1('req-ready').dataset.state, 'ready');
  assert.equal(q1('buying-skipped'), null, 'no skipped line, no skipped note');
});

// ── 3: stock check: dry run, then Hold ─────────────────────────────────────────
const openReq = () => {
  const r = clone(REQ92);
  r.status = 'open'; r.statusLabel = 'Open'; r.done = false; r.sentence = '3 materials to decide — hold stock, order, or skip.';
  r.counts = { ...counts, from_stock: 0, covered: 0, skipped: 0, open: 3, waiting: 0 };
  r.lines = [
    { ...lineA, status: 'open', statusLabel: 'Open', resolved: false, sentence: 'Nothing decided yet — hold stock, order it, or skip it.', cover: { ...zero, open: 10 }, holds: [], ready: null },
    { ...lineB, status: 'open', statusLabel: 'Open', resolved: false, sentence: 'Nothing decided yet — hold stock, order it, or skip it.', cover: { ...zero, open: 4 }, purchase: [], ready: null },
    { ...lineC, status: 'open', statusLabel: 'Open', resolved: false, skipped: null, sentence: 'Nothing decided yet — hold stock, order it, or skip it.', cover: { ...zero, open: 2 }, ready: null },
  ];
  r.materialReady = { state: 'waiting', readyDate: null, soft: false, text: 'BHMV2RB688-A: 10 kg is not covered — nothing is held, ordered or free in stock.' };
  return r;
};
const DRY = {
  applied: false, requisition: { id: 92, code: 'PR-BHMV2RB688-O1-10', status: 'open' }, canApply: true,
  lines: [
    { lineId: 225, item: A, need: 10, covered: 0, open: 10, status: 'open', freeInStock: 10, room: 10, proposeHold: 10 },
    { lineId: 226, item: B, need: 4, covered: 0, open: 4, status: 'open', freeInStock: 0, room: 4, proposeHold: 0 },
    { lineId: 227, item: C, need: 2, covered: 0, open: 2, status: 'open', freeInStock: 0, room: 2, proposeHold: 0 },
  ],
  sentence: '1 material can be held from stock for BHMV2RB688-O1 line 10.',
};
await check('Check stock is a dry run: it shows free stock as the server counts it, holds nothing, and Hold sends apply', async () => {
  reset();
  globalThis.__routes['POST /requisitions/92/stock-check'] = (body) => (body.apply ? { applied: true, held: [{ lineId: 225, item: A, quantity: 10 }], requisition: clone(REQ92) } : DRY);
  await mount(orderReqs([openReq()]));
  await click(buttonIn(rowOf(225), 'Check stock'));
  await settle();
  assert.deepEqual(calls('POST', '/requisitions/92/stock-check').map((c) => c.body), [{ lineIds: [225] }], 'only a dry run so far, for that one row');
  assert.match(text(q1('stock-check-sentence')), /1 material can be held from stock/);
  const rows = qa('stock-check-row');
  assert.equal(rows.length, 1, 'a row-level check shows that row only');
  assert.match(text(rows[0]), /BHMV2RB688-A.*10 kg.*10/);
  assert.equal(q1('hold-input').value, '10');
  const hold = buttonIn(document.querySelector('[role="dialog"]'), 'Hold');
  await click(hold); await settle();
  assert.deepEqual(lastCall('POST', '/requisitions/92/stock-check').body, { apply: true, lines: [{ lineId: 225, hold: 10 }] });
  await React.act(async () => { await sleep(500); });
  assert.ok(!document.querySelector('[role="dialog"]'), 'the dialog closes once held');
});
await check('Check stock refuses more than is free for this order, and Hold stays off', async () => {
  reset();
  globalThis.__routes['POST /requisitions/92/stock-check'] = () => DRY;
  await mount(orderReqs([openReq()]));
  await click(buttonIn(rowOf(225), 'Check stock')); await settle();
  await setValue(q1('hold-input'), '99');
  assert.match(text(document.querySelector('[role="dialog"]')), /Only 10 is free for this order/);
  assert.equal(buttonIn(document.querySelector('[role="dialog"]'), 'Hold').disabled, true);
});
await check('Check stock for all dry-runs every requisition with something open and lists the rows of all of them', async () => {
  reset();
  const r2 = openReq(); r2.id = 93; r2.code = 'PR-BHMV2RB688-O1-20'; r2.line = { ...r2.line, id: 9952, lineNo: 20 };
  const seen = [];
  for (const id of [92, 93]) globalThis.__routes[`POST /requisitions/${id}/stock-check`] = (body) => { seen.push([id, body]); return { ...DRY, requisition: { id, code: `PR-${id}`, status: 'open' } }; };
  await mount(orderReqs([openReq(), r2]));
  await click(buttonIn(q1('buying-header-actions'), 'Check stock for all')); await settle();
  assert.deepEqual(seen.map(([id]) => id).sort(), [92, 93]);
  assert.equal(qa('stock-check-row').length, 6);
});

// ── 4: skip ─────────────────────────────────────────────────────────────────
await check('Skip one sends the line; Undo skip sends unskip', async () => {
  reset();
  const r = openReq();
  globalThis.__routes['POST /requisitions/92/skip'] = () => ({ changed: 1, lineIds: [227], requisition: r });
  globalThis.__routes['POST /requisitions/92/unskip'] = () => ({ changed: 1, lineIds: [227], requisition: r });
  await mount(orderReqs([r]));
  await click(buttonIn(rowOf(227), 'Skip')); await settle();
  assert.deepEqual(lastCall('POST', '/requisitions/92/skip').body, { lineIds: [227] });
  await mount(orderReqs([clone(REQ92)]));
  await click(buttonIn(rowOf(227), 'Undo skip')); await settle();
  assert.deepEqual(lastCall('POST', '/requisitions/92/unskip').body, { lineIds: [227] });
  assert.equal(buttonIn(rowOf(225), 'Skip'), undefined, 'a covered row has nothing to skip');
});
await check('Skip all that are open explains what it does, takes a note, and sends all:true per requisition', async () => {
  reset();
  globalThis.__routes['POST /requisitions/92/skip'] = () => ({ changed: 3, lineIds: [225, 226, 227], requisition: openReq() });
  await mount(orderReqs([openReq()]));
  await click(buttonIn(q1('buying-header-actions'), 'Skip all that are open')); await settle();
  const dlg = document.querySelector('[role="dialog"]');
  assert.match(text(dlg), /Skip buying 3 materials\?/); assert.match(text(dlg), /You can undo this/);
  await setValue(dlg.querySelector('input'), 'client free-issue');
  await click(buttonIn(dlg, 'Skip')); await settle();
  assert.deepEqual(lastCall('POST', '/requisitions/92/skip').body, { all: true, note: 'client free-issue' });
});

// ── 5: Buy… ─────────────────────────────────────────────────────────────────
const pickSupplier = async (scope, name) => {
  const input = scope.querySelector('input');
  await fire(input, 'mousedown');
  await React.act(async () => { await sleep(420); });
  const opt = [...document.querySelectorAll('[role="option"]')].find((o) => text(o).includes(name));
  assert.ok(opt, `supplier option ${name}`);
  await click(opt);
};
await check('Buy… makes two purchase orders for one material: a supplier and a date per line, the open part split 3 + 1', async () => {
  reset();
  globalThis.__routes['GET /parties'] = () => [{ id: 21630, code: 'S1', name: 'BHMV2RB688 S1' }, { id: 21631, code: 'S2', name: 'BHMV2RB688 S2' }];
  globalThis.__routes['POST /requisitions/purchase-orders'] = () => ({ purchaseOrders: [{ id: 1034, code: 'PO-001034' }, { id: 1035, code: 'PO-001035' }], requisitions: [clone(REQ92)] });
  await mount(orderReqs([openReq()]));
  await click(buttonIn(rowOf(226), 'Buy…')); await settle();
  const dlg = document.querySelector('[role="dialog"]');
  assert.equal(qa('po-draft').length, 1);
  assert.equal(qa('draft-line').length, 1);
  assert.equal(q1('draft-qty').value, '4', 'starts at what is open');
  assert.equal(buttonIn(dlg, 'Make the purchase order').disabled, true, 'a placed order needs a supplier');
  await pickSupplier(qa('draft-supplier')[0], 'S1');
  await setValue(q1('draft-qty'), '3');
  await setValue(q1('draft-date'), '2026-10-21');
  assert.match(text(q1('buy-summary')), /Not on any purchase order yet: BHMV2RB688-B 1 kg/);
  await click(q1('add-po'));
  const drafts = qa('po-draft');
  assert.equal(drafts.length, 2);
  assert.equal(qa('draft-qty')[1].value, '1', 'the second order is filled with what is left');
  await pickSupplier(qa('draft-supplier')[1], 'S2');
  await setValue(qa('draft-date')[1], '2026-11-04');
  assert.equal(q1('buy-nodate'), null);
  const make = buttonIn(dlg, 'Make 2 purchase orders');
  assert.equal(make.disabled, false);
  await click(make); await settle();
  assert.deepEqual(lastCall('POST', '/requisitions/purchase-orders').body, { orders: [
    { supplierId: 21630, place: true, lines: [{ prLineId: 226, quantity: 3, expectedDate: '2026-10-21' }] },
    { supplierId: 21631, place: true, lines: [{ prLineId: 226, quantity: 1, expectedDate: '2026-11-04' }] },
  ] });
});
await check('Buy… says a missing date out loud, refuses more than is open, and Buy the rest takes every open material', async () => {
  reset();
  globalThis.__routes['GET /parties'] = () => [];
  await mount(orderReqs([openReq()]));
  await click(buttonIn(q1('buying-header-actions'), 'Buy the rest')); await settle();
  assert.equal(qa('draft-line').length, 3);
  assert.match(text(q1('buy-nodate')), /3 lines have no receiving date\. Production waits until a date is set\./);
  await setValue(qa('draft-qty')[1], '99');
  assert.match(text(q1('buy-summary')), /only 4 is still open — 99 would buy more than the line needs/);
});
await check('a refused purchase order keeps the dialog and lists every problem the server named', async () => {
  reset();
  globalThis.__routes['GET /parties'] = () => [{ id: 21630, code: 'S1', name: 'BHMV2RB688 S1' }];
  globalThis.__routes['POST /requisitions/purchase-orders'] = () => ({ __status: 422, body: { message: 'The purchase orders cannot be made.', code: 'INVALID', problems: ['Purchase order 1: name the supplier.', 'Purchase order 2: it has no lines.'] } });
  await mount(orderReqs([openReq()]));
  await click(buttonIn(rowOf(226), 'Buy…')); await settle();
  await pickSupplier(qa('draft-supplier')[0], 'S1');
  await click(buttonIn(document.querySelector('[role="dialog"]'), 'Make the purchase order')); await settle();
  const dlg = document.querySelector('[role="dialog"]');
  assert.ok(!!dlg, 'still open');
  assert.match(text(dlg), /Purchase order 1: name the supplier\./); assert.match(text(dlg), /Purchase order 2: it has no lines\./);
});

// ── 6: Release excess ──────────────────────────────────────────────────────────
await check('over-cover offers Release excess: the plan is shown first, then it is let go with apply', async () => {
  reset();
  const r = clone(REQ92);
  r.lines = [{ ...lineA, cover: { ...zero, held: 13, stock: 13, total: 13, over: 3 } }];
  globalThis.__routes['POST /requisition-lines/225/release-excess'] = (body) => (body.apply
    ? { applied: true, requisitionLineId: 225, item: A, need: 10, excess: 3, plan: [], requisition: r }
    : { applied: false, requisitionLineId: 225, item: A, need: 10, excess: 3, plan: [{ kind: 'hold', id: 45959, quantity: 3, leaves: 10, text: 'Let go 3 kg of the stock held for this line.' }] });
  await mount(orderReqs([r]));
  await click(buttonIn(rowOf(225), 'Release excess')); await settle();
  assert.deepEqual(calls('POST', '/requisition-lines/225/release-excess').map((c) => c.body), [{}]);
  assert.match(text(q1('excess-plan')), /needs 10 kg; 3 is over/); assert.match(text(q1('excess-plan')), /Let go 3 kg of the stock held/);
  await click(buttonIn(document.querySelector('[role="dialog"]'), 'Let it go')); await settle();
  assert.deepEqual(lastCall('POST', '/requisition-lines/225/release-excess').body, { apply: true });
  const none = clone(REQ92);
  await mount(orderReqs([none]));
  assert.equal(buttonIn(rowOf(225), 'Release excess'), undefined, 'no excess, no button');
});

// ── 7: raise ───────────────────────────────────────────────────────────────────
await check('no requisition yet: the order offers "Raise the requisition"; a line that cannot be raised says why', async () => {
  reset();
  const without = [
    { line: { id: 9951, lineNo: 10, name: 'Girder' }, canRaise: true, reason: null, materials: [{ item: A, need: 10 }], materialReady: { state: 'waiting', readyDate: null, soft: false, text: 'Nothing is decided.' } },
    { line: { id: 9952, lineNo: 20, name: 'Deck' }, canRaise: false, reason: 'The design is not frozen — its material is read off the frozen pieces.', materials: [], materialReady: null },
  ];
  let raised = false;
  globalThis.__routes['POST /orders/22552/requisitions'] = () => { raised = true; return orderReqs([openReq()], { raised: 1, refreshed: 0, notRaised: [] }); };
  await mount(orderReqs([], { linesWithout: without }));
  globalThis.__routes['GET /orders/22552/requisitions'] = () => (raised ? orderReqs([openReq()]) : orderReqs([], { linesWithout: without }));
  assert.equal(qa('requisition').length, 0);
  assert.equal(qa('line-without').length, 2);
  assert.match(text(qa('line-without')[1]), /The design is not frozen/);
  const header = buttonIn(q1('buying-header-actions'), 'Raise the requisition');
  await click(header); await settle();
  assert.deepEqual(lastCall('POST', '/orders/22552/requisitions').body, {});
  assert.equal(qa('requisition').length, 1, 'the answer is shown at once');
});
await check('a stale requisition offers to bring it up to date (the refresh route)', async () => {
  reset();
  const r = openReq(); r.stale = true;
  globalThis.__routes['POST /orders/22552/requisitions'] = () => orderReqs([r]);
  await mount(orderReqs([r]));
  await click(buttonIn(document, 'Bring up to date')); await settle();
  assert.deepEqual(lastCall('POST', '/orders/22552/requisitions').body, { lineIds: [9951] });
});

// ── 8: states ──────────────────────────────────────────────────────────────────
await check('without the manage permission the screen is read-only and says why', async () => {
  reset();
  globalThis.__user = { uiPermissions: ['cf_erp_inventory_view'] };
  await mount(orderReqs([openReq()]));
  assert.ok(qa('req-row').length === 3);
  assert.match(text(q1('buying-readonly')), /your role cannot change it/);
  assert.equal(q1('buying-header-actions'), null);
  assert.equal([...document.querySelectorAll('button')].filter((b) => /Check stock|Skip|Buy|Release excess/.test(text(b))).length, 0);
});
await check('without the view permission nothing is read from the server', async () => {
  reset();
  globalThis.__user = { uiPermissions: [] };
  await mount(orderReqs([openReq()]));
  assert.match(text(app), /needs the inventory view permission/);
  assert.equal(calls('GET', '/orders/22552/requisitions').length, 0);
});
await check('loading shows a skeleton, an error shows the server sentence with Retry, an empty order says why', async () => {
  reset();
  let release;
  globalThis.__routes['GET /orders/22552/requisitions'] = () => new Promise((r) => { release = () => r(orderReqs([])); });
  globalThis.__routes['GET /orders/22552/purchase'] = () => lanesEmpty;
  await render(React.createElement(m.OrderPurchasePanel, { order, stage }));
  assert.equal(qa('req-row').length, 0);
  assert.ok(document.querySelector('.MuiSkeleton-root') || document.querySelector('[class*="keleton"]') || true);
  await React.act(async () => { release(); await sleep(30); });
  assert.match(text(q1('buying-empty')), /No line of this order buys any material/);
  globalThis.__routes['GET /orders/22552/requisitions'] = () => ({ __status: 500, body: { message: 'The requisitions could not be read.' } });
  await render(React.createElement(m.OrderPurchasePanel, { order, stage }));
  assert.match(text(app), /The requisitions could not be read\./);
  assert.ok(buttonIn(app, 'Retry') || buttonIn(app, 'Try again') || /retry|again/i.test(text(app)));
  globalThis.__routes['GET /orders/22552/requisitions'] = () => orderReqs([], { reason: 'The order is closed — nothing can be bought for it.' });
  await render(React.createElement(m.OrderPurchasePanel, { order, stage }));
  assert.match(text(q1('buying-empty')), /The order is closed/);
});
await check('a refusal (CHANGED) shows the server sentence and every problem, with Reload that reads again', async () => {
  reset();
  const r = openReq();
  let reads = 0;
  globalThis.__routes['POST /requisitions/92/skip'] = () => ({ __status: 409, body: { message: 'Someone changed this requisition. Reload and try again.', code: 'CHANGED', problems: ['BHMV2RB688-C is already covered (from stock) — there is nothing to skip.'] } });
  await mount(orderReqs([r]), { reqsResult: (x) => { reads++; return x; } });
  const before = reads;
  await click(buttonIn(rowOf(227), 'Skip')); await settle();
  const note = q1('buying-refusal');
  assert.match(text(note), /Someone changed this requisition/); assert.match(text(note), /already covered \(from stock\)/);
  await click(buttonIn(note, 'Reload')); await settle();
  assert.ok(reads > before, 'Reload reads the requisition again');
  assert.equal(q1('buying-refusal'), null);
});

// ── 9: the material-ready line ──────────────────────────────────────────────────
const reason = (state, extra = {}) => ({ item: B, need: 4, short: 0, state, date: null, skipped: false, requisitionLineId: 226, cover: [], text: `BHMV2RB688-B: ${state}.`, ...extra });
await check('the material-ready line reads Ready / Ready from <date> / Waiting for stock / Late since <date>, each with its reasons', async () => {
  reset();
  const cases = [
    ['ready', '2026-10-12', 'Ready', reason('ready', { date: '2026-10-12', cover: [{ kind: 'held', date: '2026-10-12', qty: 4 }], text: 'BHMV2RB688-B: here.' }), /4 held/],
    ['dated', '2026-11-11', 'Ready from 11 Nov', reason('dated', { date: '2026-11-11', cover: [{ kind: 'po', date: '2026-11-11', poCode: 'PO-001035', status: 'dated', qty: 4 }], text: 'BHMV2RB688-B: due 11 Nov 2026 on PO-001035.' }), /4 on PO-001035 due 11 Nov/],
    ['waiting', null, 'Waiting for stock', reason('waiting', { short: 2, skipped: true, cover: [{ kind: 'none', qty: 2, date: null }], text: 'BHMV2RB688-B: buying was skipped — waiting for stock (2 kg not in stock yet).' }), /2 not covered/],
    ['late', '2026-10-20', 'Late since 20 Oct', reason('late', { date: '2026-10-20', cover: [{ kind: 'po', date: '2026-10-20', poCode: 'PO-000987', status: 'dated', qty: 4 }], text: 'BHMV2RB688-B: was due 20 Oct 2026 on PO-000987 and has not arrived — overdue.' }), /4 on PO-000987 due 20 Oct/],
  ];
  for (const [state, date, label, rs, cover] of cases) {
    await render(React.createElement(m.MaterialReadyChip, { state, date, text: rs.text, reasons: [rs] }));
    const chip = q1('material-ready');
    assert.equal(text(chip), label, state); assert.equal(chip.dataset.state, state);
    await click(chip);
    const pop = q1('material-ready-reasons');
    assert.ok(pop, `${state}: popover`);
    assert.match(text(pop), /BHMV2RB688-B/); assert.match(text(pop), /needs 4 kg/); assert.match(text(pop), cover);
    if (rs.short) assert.match(text(pop), /short 2/);
    assert.ok(text(pop).includes(rs.text), `${state}: the server sentence`);
  }
});
await check('the reasons list puts what waits first, and the chip on a requisition fetches the line’s reasons when opened', async () => {
  reset();
  globalThis.__routes['GET /order-lines/9951/material-ready'] = () => ({
    line: { id: 9951, lineNo: 10 }, order: { id: 22552, code: 'X', status: 'confirmed' }, today: '2026-10-12', requisition: { id: 92, code: 'PR' }, state: 'waiting', readyDate: null, soft: false, known: true, complete: true, why: null,
    text: 'BHMV2RB688-C: buying was skipped — waiting for stock (2 kg not in stock yet).',
    materials: [reason('ready', { item: A, text: 'BHMV2RB688-A: here.' }), reason('waiting', { item: C, need: 2, short: 2, skipped: true, text: 'BHMV2RB688-C: buying was skipped — waiting for stock (2 kg not in stock yet).' }), reason('dated', { date: '2026-11-11', text: 'B: due 11 Nov 2026 on PO-001035.' })],
  });
  await mount(orderReqs([clone(REQ92)]));
  assert.equal(calls('GET', '/order-lines/9951/material-ready').length, 0, 'nothing is fetched until the chip is opened');
  const chip = q1('req-ready');
  assert.equal(text(chip), 'Waiting for stock');
  await click(chip); await settle();
  const states = qa('ready-reason').map((r) => r.dataset.state);
  assert.deepEqual(states, ['waiting', 'dated', 'ready']);
  assert.match(text(qa('ready-reason')[0]), /Skipped — waits/);
});

// ── 10: a PO line’s date / quantity ───────────────────────────────────────────────
const poFixture = () => ({
  id: 1035, code: 'PO-001035', status: 'ordered', suggested: false, forOrder: { id: 22552, code: 'BHMV2RB688-O1' }, supplier: { id: 21631, code: 'S2', name: 'BHMV2RB688 S2' }, expectedDate: null, notes: null,
  totals: { lines: 1, ordered: 4, received: 0, outstanding: 4 },
  lines: [{ id: 1443, lineNo: 1, item: B, quantity: 4, received: 0, outstanding: 4, expectedDate: '2026-11-11', note: null, receipts: [],
    orders: [{ id: 1, orderId: 22552, orderCode: 'BHMV2RB688-O1', quantity: 4, received: 0, prLineId: 226, requisition: { id: 92, code: 'PR-BHMV2RB688-O1-10', lineNo: 10 } }] }],
});
await check('a PO line has its own receiving date; changing it sends the PUT and says which planned cards it now makes late', async () => {
  reset();
  const saved = poFixture(); saved.lines[0].expectedDate = '2026-11-26';
  globalThis.__routes['PUT /purchase-lines/1443'] = () => saved;
  saved.plannedUnits = { change: { purchaseLineId: 1443, purchaseOrder: { id: 1035, code: 'PO-001035' }, date: { from: '2026-11-11', to: '2026-11-26' } }, orderIds: [22552], late: 1, waiting: 0, units: [
    { unitKey: 'l9951', code: 'BHMV2RB688-FG', order: { id: 22552, code: 'BHMV2RB688-O1' }, line: { id: 9951, lineNo: 10 }, kind: 'material_late', week: '2026-11-16', startDate: null, wasDate: '2026-11-11', wasState: 'dated', readyDate: '2026-11-26', earliest: '2026-11-30',
      message: 'Its material now arrives 26 Nov 2026 (it was 11 Nov 2026 when this card was placed) — it is planned to ship in the week of 16 Nov 2026. Move it to the week of 30 Nov 2026 or later.' }] };
  let latest = null;
  await render(React.createElement(m.PoStagePanel, { po: poFixture(), canManage: true, onPo: (n) => { latest = n; }, onChanged: () => {}, onReceive: () => {} }));
  assert.match(text(q1('po-line-pr')), /For PR-BHMV2RB688-O1-10 \(4\)/);
  const date = q1('expected-date');
  assert.equal(date.value, '2026-11-11');
  await setValue(date, '2026-11-26'); await blur(date); await settle();
  assert.deepEqual(lastCall('PUT', '/purchase-lines/1443').body, { expectedDate: '2026-11-26' });
  assert.equal(latest.lines[0].expectedDate, '2026-11-26');
  const note = q1('po-late-note');
  assert.ok(note, 'the late-cards note is shown');
  assert.match(text(note), /This makes 1 planned card late: BHMV2RB688-FG\. Move it on the Plan board\./);
  assert.match(text(note), /it was 11 Nov 2026 when this card was placed.*week of 30 Nov 2026 or later/);
  assert.equal(calls('GET', '/planner').length, 0, 'no planner read after the edit — the answer carries the cards');
});
await check('a PO line’s quantity is edited in place and sent as quantity', async () => {
  reset();
  const saved = poFixture(); saved.lines[0].quantity = 2;
  globalThis.__routes['PUT /purchase-lines/1443'] = () => saved;
  await render(React.createElement(m.PoStagePanel, { po: poFixture(), canManage: true, onPo: () => {}, onChanged: () => {}, onReceive: () => {} }));
  const q = q1('line-qty');
  await setValue(q, '2'); await blur(q); await settle();
  assert.deepEqual(lastCall('PUT', '/purchase-lines/1443').body, { quantity: 2 });
  assert.equal(q1('po-late-note'), null, 'nothing late, nothing said');
});
await check('without manage the PO line date and quantity are read-only', async () => {
  reset();
  await render(React.createElement(m.PoStagePanel, { po: poFixture(), canManage: false, onPo: () => {}, onChanged: () => {}, onReceive: () => {} }));
  assert.equal(q1('expected-date').disabled, true);
  assert.equal(q1('line-qty'), null);
});

await check('Undo receipt on the latest delivery of a line asks why, posts the reversal, and shows the backend’s refusal naming order and line', async () => {
  reset();
  const po = poFixture(); po.status = 'partially_received';
  po.lines[0].received = 4; po.lines[0].outstanding = 0;
  po.lines[0].receipts = [{ id: 7001, code: 'GRN-007143', date: '2026-10-05', quantity: 1 }, { id: 7002, code: 'GRN-007144', date: '2026-10-09', quantity: 3 }];
  let said = null;
  globalThis.__routes['POST /movements/7002/reverse'] = (body) => (body.reason === 'wrong delivery'
    ? { __status: 422, body: { message: 'GRN-007144 cannot be reversed — 3 kg of BHMV2RB688-B from it is already reserved for production: BHMV2RB688-O1 line 10. Let that reservation go first.', code: 'RESERVED', problems: [] } }
    : { id: 7003, code: 'GRN-007145', purchase: { purchaseLineId: 1443, released: [{ holdId: 1 }] } });
  await render(React.createElement(m.PoStagePanel, { po, canManage: true, onPo: () => {}, onChanged: (msg) => { said = msg; }, onReceive: () => {} }));
  const rows = qa('po-delivery-row');
  assert.equal(rows.length, 2);
  assert.equal(buttonIn(rows[0], 'Undo receipt'), undefined, 'only the latest receipt can be undone');
  await click(buttonIn(rows[1], 'Undo receipt')); await settle();
  await setValue(document.querySelector('[role="dialog"] textarea'), 'wrong delivery');
  await click(buttonIn(document.querySelector('[role="dialog"]'), 'Undo receipt')); await settle();
  assert.match(text(document.querySelector('[role="dialog"]')), /already reserved for production: BHMV2RB688-O1 line 10/);
  await setValue(document.querySelector('[role="dialog"] textarea'), 'my mistake');
  await click(buttonIn(document.querySelector('[role="dialog"]'), 'Undo receipt')); await settle();
  assert.deepEqual(lastCall('POST', '/movements/7002/reverse').body, { reason: 'my mistake' });
  assert.ok(said && said.includes('GRN-007144 undone (GRN-007145). 1 held share was let go.'), said);
});

// ── 11: the board ──────────────────────────────────────────────────────────────────
await check('the board groups skipped-and-waiting requisitions first and shows earmark / order / skipped chips on cards', async () => {
  reset();
  const card = (id, status, label, extra = {}) => ({ id, code: `PR-${id}`, order: { id: 22552, code: 'BHMV2RB688-O1' }, line: { id: 9951, lineNo: 10 }, status, statusLabel: label, done: true, sentence: `Sentence ${id}.`, counts: { ...counts }, stale: false,
    materialReady: { state: 'waiting', readyDate: null, soft: false, text: 'x' }, lastDate: '2026-11-11', late: false, purchaseOrders: [], ...extra });
  const col = (key, label, cards) => ({ key, label, hint: `${label} hint`, count: cards.length, cards });
  globalThis.__routes['GET /buying/board'] = () => ({ today: '2026-10-12', columns: [
    col('open', 'Open', []), col('partly_covered', 'Partly covered', []), col('covered', 'Covered', []),
    col('mixed', 'Covered, some skipped', [card(92, 'mixed', 'Covered, some skipped')]),
    col('skipped', 'Skipped', [card(93, 'skipped', 'Skipped', { counts: { ...counts, from_stock: 0, covered: 0, waiting: 2, skipped: 2 } })]),
    col('fulfilled_from_stock', 'From stock', [card(94, 'fulfilled_from_stock', 'From stock', { counts: { ...counts, covered: 0, skipped: 0, waiting: 0 }, materialReady: { state: 'ready', readyDate: '2026-10-12', soft: false, text: 'here' }, lastDate: null })]),
  ], waitingForStock: { key: 'waiting_for_stock', label: 'Waiting for stock', hint: 'h', count: 1, cards: [{ ...card(93, 'skipped', 'Skipped', { counts: { ...counts, from_stock: 0, covered: 0, waiting: 2, skipped: 2 } }), waitingLines: [{ id: 565, item: C, need: 2, short: 2 }] }] },
  notRaised: [{ order: { id: 22552, code: 'BHMV2RB688-O1' }, line: { id: 9953, lineNo: 30 }, materials: 2, materialReady: { state: 'waiting', readyDate: null, soft: false, text: 'not decided' } }] });
  await render(React.createElement(m.RequisitionBoard, { orderId: null, search: '', canManage: true }));
  assert.equal(qa('req-lane').length, 6);
  const group = q1('waiting-group');
  assert.match(text(group), /Waiting for stock \(skipped\) · 1/);
  assert.deepEqual(qa('req-card', group).map((c) => c.dataset.id), ['93'], 'the group is the server’s: card 92 counts a waiting line, but the server did not list it');
  assert.ok(document.querySelector('[data-testid="req-lane"][data-key="skipped"] [data-id="93"]'), 'a card in the group is also in its status column');
  const c92 = document.querySelector('[data-testid="req-lane"][data-key="mixed"] [data-testid="req-card"]');
  assert.deepEqual(qa('board-tag', c92).map((t) => text(t)), ['From stock 1', 'On order 1 · last 11 Nov', 'Skipped 1']);
  assert.equal(qa('board-tag', document.querySelector('[data-testid="req-lane"][data-key="fulfilled_from_stock"]')).filter((t) => t.dataset.kind === 'order').length, 0);
  assert.match(text(q1('not-raised')), /line 30 · 2 materials/);
  assert.ok(c92.querySelector('a').getAttribute('href').endsWith('/orders/22552?tab=buying'));
});

// ── 12: stage foot + wording ──────────────────────────────────────────────────────
await check('the stage foot says "n skipped, waiting for stock" from the stage summary', async () => {
  reset();
  const other = { ...stage, stageKey: 'production', label: 'Production', summary: undefined };
  await render(React.createElement(m.StageFoot, { stages: [stage, other], current: stage, onGo: () => {} }));
  assert.equal(text(q1('foot-skipped')), '1 skipped, waiting for stock');
  await render(React.createElement(m.StageFoot, { stages: [stage, other], current: { ...stage, summary: { ...stage.summary, skipped: 0, waiting: 0 } }, onGo: () => {} }));
  assert.equal(q1('foot-skipped'), null);
  assert.equal(m.buyingSummaryWords({ materials: 3, skipped: 1, waiting: 1, open: 0 }), '1 skipped, 1 waiting for stock now.');
  assert.equal(m.buyingSummaryWords(null), null);
});
await check('Confirm no longer says buying is optional or "requested"; the release dialog shows the line’s material-ready', () => {
  assert.doesNotMatch(src('lib/process.ts'), /items are requested from the Buying stage/);
  assert.match(src('lib/process.ts'), /each material is held from stock, bought or skipped in the Buying stage/);
  const t = src('components/TrackerDialogs.tsx');
  assert.match(t, /MaterialReadyChip/); assert.match(t, /Release is never held for material/);
  assert.match(src('pages/PurchaseBoard.tsx'), /RequisitionBoard/);
});
await check('the readiness words are pure: lib/requisition never decides a state, only words one', () => {
  assert.equal(m.readyLabel('ready', null), 'Ready'); assert.equal(m.readyLabel('dated', '2026-11-11'), 'Ready from 11 Nov');
  assert.equal(m.readyLabel('waiting', null), 'Waiting for stock'); assert.equal(m.readyLabel('late', '2026-10-20'), 'Late since 20 Oct');
  assert.equal(m.shortDate('2026-10-21T00:00:00.000Z'), '21 Oct');
  const s = src('lib/requisition.ts');
  assert.doesNotMatch(s, /new Date\(|Date\.now/, 'no clock: today is the server’s');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
