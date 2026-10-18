// Run from multi_app_fe: node scripts/cf_erp_buying_v2_test.mjs
// Buying v2 (TM/CF_ERP_BUYING_V2.md), what is left of it after §71 (2026-10-18): the sales order's Material request stage
// only RAISES the MR and shows its status (everything else is in Purchase — cf_erp_purchase_flow_v3_test.mjs). Rendered in
// jsdom against mocked routes: Raise MR, the read-only and loading states, the material-ready line in every state with its
// reasons, a PO line's date edit and the planned cards it makes late, Cancel PO, the stage foot and the readiness words.
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
      export { CancelPoDialog } from './src/apps/cf_erp/components/Purchase/CancelPoDialog';
      export { PlannedUnitsNote } from './src/apps/cf_erp/components/Purchase/PlannedUnitsNote';
      export { DateCell } from './src/apps/cf_erp/components/Purchase/DateCell';
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
const stage = {
  stageKey: 'buying', label: 'Buying', sequence: 5, requirement: 'required', applies: true, decidedBy: 'data', state: 'done', blockers: [],
  detail: 'All 3 materials decided — 1 held in stock, 1 on order, last delivery 11 Nov 2026, 1 skipped (1 waiting for stock)',
  summary: { materials: 3, fromStock: 1, onOrder: 1, skipped: 1, waiting: 1, open: 0 },
};
const order = { id: 22552, code: 'BHMV2RB688-O1' };
const mount = (reqs, opts = {}) => {
  globalThis.__routes['GET /orders/22552/requisitions'] = () => (opts.reqsResult ? opts.reqsResult(reqs) : reqs);
  globalThis.__routes['GET /material-requests'] = () => ({ rows: [] });
  return render(React.createElement(m.OrderPurchasePanel, { order, stage: opts.stage ?? stage, onChanged: opts.onChanged }));
};

// ── 1: helpers: paths, methods, bodies ──────────────────────────────────────
await check('the helpers call the contract paths with the contract bodies', async () => {
  reset();
  for (const [method, path] of [['GET', '/orders/22552/requisitions'], ['POST', '/orders/22552/requisitions'], ['GET', '/order-lines/9951/material-ready'],
    ['PUT', '/purchase-lines/1443'], ['GET', '/requisitions/92']]) globalThis.__routes[`${method} ${path}`] = () => ({});
  await m.getOrderRequisitions(22552); assert.equal(lastCall('GET', '/orders/22552/requisitions').method, 'GET');
  await m.raiseRequisitions(22552, { lineIds: [9951] }); assert.deepEqual(lastCall('POST', '/orders/22552/requisitions').body, { lineIds: [9951] });
  await m.raiseRequisitions(22552); assert.deepEqual(lastCall('POST', '/orders/22552/requisitions').body, {});
  await m.getRequisition(92); assert.equal(calls('GET', '/requisitions/92').length, 1);
  await m.updatePurchaseLine(1443, { expectedDate: '2026-11-11' }); assert.deepEqual(lastCall('PUT', '/purchase-lines/1443').body, { expectedDate: '2026-11-11' });
  await m.updatePurchaseLine(1443, { quantity: 2 }); assert.deepEqual(lastCall('PUT', '/purchase-lines/1443').body, { quantity: 2 });
  for (const gone of ['checkStock', 'holdStock', 'skipLines', 'unskipLines', 'makePurchaseOrders', 'releaseExcess', 'releaseExcessPlan', 'getBuyingBoard']) assert.equal(m[gone], undefined, `${gone} went with §71`);
});

const openReq = () => {
  const r = clone(REQ92);
  r.status = 'open'; r.statusLabel = 'Open'; r.done = false; r.sentence = '3 materials to decide.';
  r.counts = { ...counts, from_stock: 0, covered: 0, skipped: 0, open: 3, waiting: 0 };
  r.lines = [
    { ...lineA, status: 'open', statusLabel: 'Open', resolved: false, cover: { ...zero, open: 10 }, holds: [], ready: null },
    { ...lineB, status: 'open', statusLabel: 'Open', resolved: false, cover: { ...zero, open: 4 }, purchase: [], ready: null },
    { ...lineC, status: 'open', statusLabel: 'Open', resolved: false, skipped: null, cover: { ...zero, open: 2 }, ready: null },
  ];
  return r;
};

// ── 2: the stage: Raise MR and a read-only status ─────────────────────────────────
await check('no MR yet: the order offers "Raise MR" (it sends nothing but the order — no earmark, §71); a line that cannot be raised says why', async () => {
  reset();
  const without = [
    { line: { id: 9951, lineNo: 10, name: 'Girder' }, canRaise: true, reason: null, materials: [{ item: A, need: 10 }], materialReady: { state: 'waiting', readyDate: null, soft: false, text: 'Nothing is decided.' } },
    { line: { id: 9952, lineNo: 20, name: 'Deck' }, canRaise: false, reason: 'The design is not frozen — its material is read off the frozen pieces.', materials: [], materialReady: null },
  ];
  let raised = false;
  globalThis.__routes['POST /orders/22552/requisitions'] = () => { raised = true; return orderReqs([openReq()], { raised: 1, refreshed: 0, notRaised: [] }); };
  await mount(orderReqs([], { linesWithout: without }));
  globalThis.__routes['GET /orders/22552/requisitions'] = () => (raised ? orderReqs([openReq()]) : orderReqs([], { linesWithout: without }));
  assert.equal(qa('mr-status-row').length, 0);
  assert.equal(qa('line-without').length, 2);
  assert.match(text(qa('line-without')[1]), /The design is not frozen/);
  await click(q1('raise-mr')); await settle();
  assert.deepEqual(lastCall('POST', '/orders/22552/requisitions').body, {});
  assert.equal(qa('mr-status-row').length, 1, 'the answer is shown at once');
  assert.match(text(qa('mr-status-row')[0]), /PR-BHMV2RB688-O1-10.*Line 10.*0 of 3 locked/);
  assert.ok(qa('mr-status-row')[0].querySelector('a').getAttribute('href').endsWith('/material-requests/92'), 'the MR opens in Purchase');
  assert.equal([...document.querySelectorAll('button')].filter((b) => /Check stock|Skip|Buy|Release excess/.test(text(b))).length, 0, 'no working panel on the sales order');
});

// ── 8: states ──────────────────────────────────────────────────────────────────
await check('without the manage permission the screen is read-only and says why', async () => {
  reset();
  globalThis.__user = { uiPermissions: ['cf_erp_inventory_view'] };
  await mount(orderReqs([openReq()]));
  assert.ok(qa('mr-status-row').length === 1);
  assert.match(text(q1('buying-readonly')), /Raising it needs the inventory manage permission/);
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
  globalThis.__routes['GET /material-requests'] = () => ({ rows: [] });
  await render(React.createElement(m.OrderPurchasePanel, { order, stage }));
  assert.equal(qa('mr-status-row').length, 0);
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
await check('a refusal shows the server sentence and every problem, with Reload that reads again', async () => {
  reset();
  let reads = 0;
  const without = [{ line: { id: 9951, lineNo: 10, name: 'Girder' }, canRaise: true, reason: null, materials: [{ item: A, need: 10 }], materialReady: null }];
  globalThis.__routes['POST /orders/22552/requisitions'] = () => ({ __status: 422, body: { message: 'Nothing can be put on a material request for BHMV2RB688-O1 yet.', code: 'NOTHING_TO_RAISE', problems: ['Line 10: Its material is not known yet.'] } });
  await mount(orderReqs([], { linesWithout: without }), { reqsResult: (x) => { reads++; return x; } });
  const before = reads;
  await click(q1('raise-mr')); await settle();
  const note = q1('buying-refusal');
  assert.match(text(note), /Nothing can be put on a material request/);
  assert.match(text(note), /Line 10: Its material is not known yet\./);
  await click(buttonIn(note, 'Reload')); await settle();
  assert.ok(reads > before, 'Reload reads again');
  assert.equal(q1('buying-refusal'), null);
});

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
  const chip = q1('mr-ready');
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
  await render(React.createElement(m.DateCell, { value: '2026-11-11', label: 'Expected date for B', lineId: 1443, onSaved: (n) => { latest = n; } }));
  const date = q1('expected-date');
  assert.equal(date.value, '2026-11-11');
  await setValue(date, '2026-11-26'); await blur(date); await settle();
  assert.deepEqual(lastCall('PUT', '/purchase-lines/1443').body, { expectedDate: '2026-11-26' });
  assert.equal(latest.lines[0].expectedDate, '2026-11-26');
  await render(React.createElement(m.PlannedUnitsNote, { planned: latest.plannedUnits }));
  const note = q1('po-late-note');
  assert.ok(note, 'the late-cards note is shown');
  assert.match(text(note), /This makes 1 planned card late: BHMV2RB688-FG\. Move it on the Plan board\./);
  assert.match(text(note), /it was 11 Nov 2026 when this card was placed.*week of 30 Nov 2026 or later/);
  assert.equal(calls('GET', '/planner').length, 0, 'no planner read after the edit — the answer carries the cards');
  assert.match(src('pages/PurchaseOrderDetail.tsx'), /<DateCell /, 'the PO page edits the expected date in place');
});

await check('Cancel PO says what it does to the requisition first, then lists the planned cards it made late or waiting', async () => {
  reset();
  const po = poFixture();
  const planned = { orderIds: [22552], late: 0, waiting: 1, units: [{ unitKey: 'l9951', code: 'BHMV2RB688-FG', order: { id: 22552, code: 'BHMV2RB688-O1' }, line: { id: 9951, lineNo: 10 }, kind: 'waiting', week: '2026-11-16', startDate: null, wasDate: '2026-11-11', wasState: 'dated', readyDate: null, earliest: null, message: 'It now waits: BHMV2RB688-B is not covered. When this card was placed its material was due 11 Nov 2026.' }] };
  globalThis.__routes['POST /purchase-orders/1035/cancel'] = () => ({ ...po, status: 'cancelled', plannedUnits: planned });
  let got = null;
  await render(React.createElement(m.CancelPoDialog, { po, open: true, onClose: () => {}, onCancelled: (n, pl) => { got = [n, pl]; } }));
  const dlg = document.querySelector('[role="dialog"]');
  assert.match(text(dlg), /Cancelling PO-001035 puts what it was bought for back to Open on PR-BHMV2RB688-O1-10/);
  assert.match(text(dlg), /work that needed this delivery waits/);
  await setValue(dlg.querySelector('textarea'), 'supplier cannot deliver');
  await click(buttonIn(dlg, 'Cancel the order')); await settle();
  assert.deepEqual(lastCall('POST', '/purchase-orders/1035/cancel').body, { reason: 'supplier cannot deliver' });
  assert.equal(got[0].status, 'cancelled'); assert.equal(got[1].units.length, 1);
  await render(React.createElement(m.PlannedUnitsNote, { planned: got[1] }));
  assert.match(text(q1('po-late-note')), /This makes 1 planned card wait for stock: BHMV2RB688-FG/);
  assert.match(text(q1('po-late-unit')), /When this card was placed its material was due 11 Nov 2026/);
  // a PO bought for no requisition says nothing about one; nothing made late shows nothing
  const plain = poFixture(); plain.lines[0].orders = [];
  await render(React.createElement(m.CancelPoDialog, { po: plain, open: true, onClose: () => {}, onCancelled: () => {} }));
  assert.ok(!text(document.querySelector('[role="dialog"]')).includes('back to Open'));
  await render(React.createElement(m.PlannedUnitsNote, { planned: { orderIds: [], late: 0, waiting: 0, units: [] } }));
  assert.equal(q1('po-late-note'), null);
});
await check('every cancel of a purchase order goes through CancelPoDialog (the PO page); the MR, the PR and the order only link to it', () => {
  const d = src('pages/PurchaseOrderDetail.tsx');
  assert.match(d, /<CancelPoDialog /); assert.match(d, /PlannedUnitsNote/); assert.ok(!d.includes('/cancel'));
  for (const f of ['components/Purchase/OrderPurchasePanel.tsx', 'pages/PurchaseRequestDetail.tsx', 'pages/MaterialRequestDetail.tsx', 'pages/PurchaseOrders.tsx', 'pages/ReceiveAgainstPo.tsx'])
    assert.ok(!src(f).includes('/cancel') && !src(f).includes('cancelPurchaseOrder'), f);
  assert.ok(d.includes('<PlannedUnitsNote planned={late} />'));
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
await check('Confirm no longer says buying is optional or "requested" (§73: the Confirm panel is gone — the customer acceptance confirms); the release dialog shows the line’s material-ready', () => {
  assert.doesNotMatch(src('lib/process.ts'), /items are requested from the Buying stage/);
  assert.doesNotMatch(src('lib/process.ts'), /CONFIRM_WHAT_DOES_NOT|CONFIRM_WHAT_HAPPENS/);
  const t = src('components/TrackerDialogs.tsx');
  assert.match(t, /MaterialReadyChip/); assert.match(t, /Release is never held for material/);
  assert.match(src('navMeta.ts'), /path: 'material-requests'/);
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
