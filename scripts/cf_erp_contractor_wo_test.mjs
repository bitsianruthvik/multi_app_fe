// Run from multi_app_fe: node scripts/cf_erp_contractor_wo_test.mjs
// STEP 6 — CONTRACTOR WORK ORDERS (backend init.sql §85; TM/CF_ERP_ORDER_FLOW_PLAN.md "2026-10-18 — Step 6"), rendered in
// jsdom against mocked routes shaped like the backend's answers (multi_app_be/scripts/cf_kepl/contractor_wo_test.mjs):
//   the selection rules (picks kept through the filter until Clear), the menu (Accounts › Work orders; Production's old
//   Work orders entry retired), "Give work to a contractor" (grid → rates prefilled from the contractor's last work order →
//   preview → raise), the Accounts lanes, one work order and its weekly payment, full screen everywhere.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/contractor-work-orders', pretendToBeVisual: true });
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
      export * from './src/apps/cf_erp/lib/contractorWorkOrders';
      export * as API from './src/apps/cf_erp/api/contractorWorkOrders';
      export { default as Board } from './src/apps/cf_erp/pages/ContractorWorkOrders';
      export { default as Detail } from './src/apps/cf_erp/pages/ContractorWorkOrderDetail';
      export { GiveWorkDialog } from './src/apps/cf_erp/components/ContractorWork/GiveWorkDialog';
      export { SECTIONS } from './src/apps/cf_erp/navMeta';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/api\/client$/ }, () => ({ path: 'api', namespace: 'stub' }));
    b.onResolve({ filter: /^@core\/contexts\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'stub' }));
    b.onLoad({ filter: /^api$/, namespace: 'stub' }, () => ({ contents: apiStub, loader: 'js' }));
    b.onLoad({ filter: /^auth$/, namespace: 'stub' }, () => ({ contents: authStub, loader: 'js' }));
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
const artifact = resolve(cache, `contractor-wo-test-${process.pid}.mjs`);
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
const mount = async (el, url = '/testco/cf_erp/contractor-work-orders', path = '*') => {
  if (root) { await React.act(async () => { root.unmount(); }); root = null; }
  document.querySelectorAll('.MuiDialog-root, .MuiPopover-root, .MuiMenu-root').forEach((n) => n.remove());
  app.replaceChildren();
  const host = document.createElement('div'); app.appendChild(host);
  root = createRoot(host);
  await React.act(async () => {
    root.render(React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(Routes, null, React.createElement(Route, { path, element: el }))));
    await sleep(80);
  });
};
const settle = async (ms = 50) => { await React.act(async () => { await sleep(ms); }); };
const qa = (id, scope = document) => [...scope.querySelectorAll(`[data-testid="${id}"]`)];
const q1 = (id, scope = document) => scope.querySelector(`[data-testid="${id}"]`);
const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const fire = async (el, type, init = {}) => { await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, ...init })); await sleep(20); }); };
const click = (el, init) => fire(el, 'click', init);
const setValue = async (el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await React.act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(10); });
};
const calls = (method, path) => globalThis.__calls.filter((c) => c.method === method && c.path === path);
const lastCall = (method, path) => calls(method, path).at(-1);
const reset = () => { globalThis.__calls = []; globalThis.__routes = {}; globalThis.__user = null; };
const asUser = (perms, id = 7) => { globalThis.__user = { id, uiPermissions: perms }; };
const body = (c) => (typeof c?.body === 'string' ? JSON.parse(c.body) : c?.body);

// ── fixtures, as the backend answers ───────────────────────────────────────────────────────────
const cell = (extra = {}) => ({ workOrder: null, started: false, editable: true, why: null, ...extra });
const GRID = () => ({
  productionOrder: { id: 50, code: 'SO1-P01', label: 'SO1 · Span ×2', state: 'planned', stateLabel: 'Planned', order: { id: 9, code: 'SO1' }, level: 'line' },
  editable: true, why: null,
  operations: [{ id: 1, code: 'CUT', name: 'Cut' }, { id: 2, code: 'WELD', name: 'Weld' }],
  rows: [
    { key: '7:', lineId: 7, lineNo: 1, bomLineId: null, itemId: 100, depth: 0, name: 'Span', code: null, quantity: 2, unitKg: null, tonnes: null, flowName: 'F', cells: { 1: cell(), 2: cell() } },
    { key: '7:11', lineId: 7, lineNo: 1, bomLineId: 11, itemId: 101, depth: 1, name: 'Girder', code: null, quantity: 4, unitKg: 500, tonnes: 2, flowName: 'F', cells: { 1: cell(), 2: cell() } },
    { key: '7:12', lineId: 7, lineNo: 1, bomLineId: 12, itemId: 102, depth: 1, name: 'Plate', code: null, quantity: 8, unitKg: 250, tonnes: 2, flowName: 'F',
      cells: { 1: cell({ workOrder: { id: 3, code: 'WO-000003', contractor: { id: 21, name: 'Cutters' } }, editable: false, why: 'With Cutters (WO-000003).' }), 2: cell() } },
  ],
  contractors: [{ id: 20, code: 'W', name: 'Welders' }, { id: 21, code: 'C', name: 'Cutters' }],
  lastRates: { 20: { 2: 4000 } },
  workOrders: [{ id: 3, code: 'WO-000003', contractor: { id: 21, name: 'Cutters' }, purchaseOrder: { id: 30, code: 'PO-30' }, lane: 'issued', cells: 1 }],
});
const card = (id, lane, extra = {}) => ({
  id, code: `WO-00000${id}`, kind: 'po', status: 'issued', lane, laneLabel: lane, contractor: { id: 20, code: 'W', name: 'Welders' },
  order: { id: 9, code: 'SO1', title: null, status: 'confirmed' }, productionOrder: { id: 50, code: 'SO1-P01', label: 'SO1 · Span ×2' },
  purchaseOrder: { id: 30, code: 'PO-30', stage: 'waiting', stageLabel: 'Waiting for goods' }, sentBack: null,
  tonnes: 4, done: 1.5, pending: 2.5, value: 16000, doneValue: 6000, paid: 6000, owed: 0, pct: 37.5, dueDate: '2026-12-31', startDate: '2026-10-18', lastPaid: null, notes: null, ...extra,
});
const BOARD = () => ({
  today: '2026-10-18', counts: { waitingApproval: 1, owed: 1000, open: 3 },
  lanes: [
    { key: 'waiting_approval', label: 'Waiting approval', value: 2400, owed: 0, cards: [card(2, 'waiting_approval', { sentBack: 'Sent back by Management: Rate too high' })] },
    { key: 'issued', label: 'Issued', value: 0, owed: 0, cards: [] },
    { key: 'in_progress', label: 'In progress', value: 16000, owed: 0, cards: [card(1, 'in_progress')] },
    { key: 'completed', label: 'Completed', value: 3000, owed: 1000, cards: [card(4, 'completed', { owed: 1000 })] },
    { key: 'paid', label: 'Paid in full', value: 0, owed: 0, cards: [] },
  ],
});
const DETAIL = () => ({
  ...card(1, 'in_progress'),
  lines: [{ id: 301, lineNo: 10, operation: { id: 2, code: 'WELD', name: 'Weld' }, tonnes: 4, done: 1.5, closed: 0, pending: 2.5, rate: 4000, value: 16000, doneValue: 6000, paid: 6000 }],
  scope: [{ rowKey: '7:11', lineNo: 1, name: 'Girder', operation: { id: 2, code: 'WELD', name: 'Weld' }, quantity: 4, unitKg: 500, tonnes: 2 }],
  payments: [{ id: 401, date: '2026-10-18', reference: 'NEFT-1', notes: null, tonnes: 1.5, amount: 6000, by: 'Test', at: '2026-10-18', removed: null, lines: [] }],
  actions: { pay: true, closeShort: true, cancel: false, sendAgain: false },
});

// ── 1: pure ─────────────────────────────────────────────────────────────────────────────────────
await check('selection: only free cells, blocks toggle, picks survive the filter, the summary per operation', () => {
  const g = GRID();
  let s = m.toggleCell(new Set(), g.rows[1], 2);
  assert.deepEqual([...s], ['7:11|2']);
  s = m.toggleCell(s, g.rows[2], 1);
  assert.equal(s.size, 1, 'a cell with a contractor is not picked');
  s = m.toggleBlock(s, g.rows, [2]);
  assert.deepEqual([...s].sort(), ['7:11|2', '7:12|2', '7:|2'], 'a column picks every free cell of it');
  s = m.toggleBlock(s, g.rows, [2]);
  assert.equal(s.size, 0, 'again: all picked → dropped');
  s = m.toggleBlock(new Set(['7:11|2']), [g.rows[2]], [1, 2]);
  assert.deepEqual([...s].sort(), ['7:11|2', '7:12|2'], 'a row picks its free cells only');
  assert.deepEqual(m.filterRows(g.rows, 'plate').map((r) => r.key), ['7:12']);
  const sum = m.selectionSummary(g, new Set(['7:11|2', '7:12|2', '7:|2']));
  assert.equal(sum.length, 1); assert.equal(sum[0].tonnes, 4); assert.equal(sum[0].unweighed, 1); assert.equal(sum[0].rows, 3);
  assert.deepEqual(m.prefillRates(g, 20, {}, [1, 2]), { 1: '', 2: '4000' }, 'the contractor\'s last rate');
  assert.deepEqual(m.prefillRates(g, 20, { 2: '4100' }, [2]), { 2: '4100' }, 'what was typed wins');
  assert.equal(m.paymentAmount('1.5', '4000', ''), 6000); assert.equal(m.paymentAmount('1.5', '4000', '5500'), 5500);
  assert.equal(m.tonnesText(2), '2 t'); assert.equal(m.tonnesText(null), '—');
});

await check('the API helpers call the §85 routes', async () => {
  reset();
  for (const k of ['GET /production-orders/50/contractor-grid', 'POST /production-orders/50/contractor-work-orders', 'GET /accounts/work-orders', 'GET /accounts/work-orders/1',
    'POST /accounts/work-orders/1/payments', 'DELETE /accounts/work-order-payments/401', 'POST /accounts/work-orders/1/close-short', 'POST /accounts/work-orders/1/cancel', 'POST /accounts/work-orders/1/send-again']) globalThis.__routes[k] = () => ({});
  await m.API.getContractorGrid(50);
  await m.API.previewWorkOrder(50, { contractorId: 20, cells: [], rates: {} }); assert.equal(body(lastCall('POST', '/production-orders/50/contractor-work-orders')).dryRun, true);
  await m.API.getWorkOrderBoard({ productionOrderId: 50 }); assert.match(lastCall('GET', '/accounts/work-orders').url, /productionOrderId=50/);
  await m.API.recordPayment(1, { lines: [{ poLineId: 301, tonnes: 1 }] }); assert.equal(body(lastCall('POST', '/accounts/work-orders/1/payments')).lines[0].poLineId, 301);
  await m.API.removePayment(401, 'twice'); assert.deepEqual(body(lastCall('DELETE', '/accounts/work-order-payments/401')), { reason: 'twice' });
  await m.API.closeWorkOrderShort(1, 'left'); await m.API.cancelWorkOrder(1, 'x'); await m.API.sendWorkOrderAgain(1);
  assert.equal(calls('POST', '/accounts/work-orders/1/send-again').length, 1);
});

// ── 2: the menu ─────────────────────────────────────────────────────────────────────────────────
await check('the menu: Accounts › Work orders; the old Production › Work orders entry is retired', () => {
  const acc = m.SECTIONS.find((s) => s.key === 'accounts');
  const wo = acc.screens.find((s) => s.key === 'contractor-work-orders');
  assert.ok(wo, 'Accounts has Work orders');
  assert.equal(wo.label, 'Work orders'); assert.equal(wo.path, 'contractor-work-orders'); assert.equal(wo.hasDetail, true);
  const prod = m.SECTIONS.find((s) => s.key === 'production');
  assert.ok(!prod.screens.some((s) => s.key === 'work-orders'), 'Production no longer lists the old work orders');
  const routes = src('routes.tsx');
  assert.match(routes, /contractor-work-orders\/:id/);
  assert.match(routes, /work-orders', element: <Navigate/, 'the old list redirects');
  assert.match(routes, /work-orders\/:id', element: wrap\(<WorkOrderDetail/, 'older work orders stay readable');
});

// ── 3: give work ────────────────────────────────────────────────────────────────────────────────
await check('give work: the grid, picking cells (kept through the filter), the contractor\'s last rate, preview, raise', async () => {
  reset(); asUser(['cf_erp_production_manage', 'cf_erp_production_view']);
  globalThis.__routes['GET /production-orders/50/contractor-grid'] = () => GRID();
  let made = null;
  globalThis.__routes['POST /production-orders/50/contractor-work-orders'] = (b) => {
    const x = typeof b === 'string' ? JSON.parse(b) : b;
    if (x.dryRun) return { dryRun: true, contractor: { id: 20, name: 'Welders' }, lines: [{ operation: { id: 2, code: 'WELD', name: 'Weld' }, rows: x.cells.length, tonnes: 4, rate: x.rates[2] ?? null, amount: x.rates[2] ? 4 * x.rates[2] : null, cellCount: x.cells.length }], tonnes: 4, amount: x.rates[2] ? 4 * x.rates[2] : 0, problems: [] };
    return { ...DETAIL(), id: 9, code: 'WO-000009', lane: 'waiting_approval' };
  };
  await mount(React.createElement(m.GiveWorkDialog, { open: true, productionOrderId: 50, onClose() {}, onMade: (wo) => { made = wo; } }));
  await settle(100);
  assert.equal(qa('give-row').length, 3);
  const taken = qa('give-cell').find((c) => c.dataset.cell === '7:12|1');
  assert.match(text(taken), /Cutters.*WO-000003/, 'a given cell says who has it');
  await click(qa('give-cell').find((c) => c.dataset.cell === '7:11|2'));
  await click(taken);
  assert.equal(taken.dataset.picked, '0', 'a given cell cannot be picked');
  await setValue(q1('give-filter'), 'plate');
  assert.equal(qa('give-row').length, 1);
  await click(qa('give-cell').find((c) => c.dataset.cell === '7:12|2'));
  await setValue(q1('give-filter'), '');
  assert.match(text(q1('give-picked')), /^2 cells picked/, 'the picks stay through the filter');
  assert.equal(q1('give-rate').value, '4000', 'the contractor\'s last rate for Weld is prefilled');
  await settle(400);
  assert.ok(calls('POST', '/production-orders/50/contractor-work-orders').some((c) => body(c).dryRun), 'a live preview');
  assert.match(text(q1('give-total')), /4 t/);
  await click(q1('give-save'));
  await settle(50);
  const sent = body(calls('POST', '/production-orders/50/contractor-work-orders').filter((c) => !body(c).dryRun).at(-1));
  assert.equal(sent.contractorId, 20);
  assert.deepEqual(sent.cells.map((x) => `${x.rowKey}|${x.operationId}`).sort(), ['7:11|2', '7:12|2']);
  assert.deepEqual(sent.rates, { 2: 4000 });
  assert.equal(made?.code, 'WO-000009');
  await click(q1('give-clear'));
  assert.match(text(q1('give-picked')), /^0 cells picked/, 'Clear drops every pick');
});

// ── 4: Accounts ─────────────────────────────────────────────────────────────────────────────────
await check('the Accounts board: five lanes, sent back in red, owed to contractors', async () => {
  reset(); asUser(['cf_erp_accounts_view', 'cf_erp_accounts_manage']);
  globalThis.__routes['GET /accounts/work-orders'] = () => BOARD();
  await mount(React.createElement(m.Board));
  await settle(100);
  assert.deepEqual(qa('wo-lane').map((l) => l.dataset.lane), ['waiting_approval', 'issued', 'in_progress', 'completed', 'paid']);
  assert.equal(qa('wo-card').length, 3);
  assert.match(text(qa('wo-card')[0]), /Rate too high/);
  assert.match(text(q1('wo-summary')), /1 waiting approval.*₹1,000 owed/);
});

await check('one work order: lines, payments, cells; Record payment (P) → tonnes × rate → saved', async () => {
  reset(); asUser(['cf_erp_accounts_view', 'cf_erp_accounts_manage']);
  globalThis.__routes['GET /accounts/work-orders/1'] = () => DETAIL();
  globalThis.__routes['POST /accounts/work-orders/1/payments'] = () => ({ payment: { id: 402, amount: 4000, tonnes: 1 }, workOrder: DETAIL(), closed: false });
  await mount(React.createElement(m.Detail), '/testco/cf_erp/contractor-work-orders/1', '/:company/cf_erp/contractor-work-orders/:id');
  await settle(100);
  assert.match(text(q1('wo-lines')), /Weld.*4 t.*4000/);
  assert.match(text(q1('wo-payments')), /NEFT-1/);
  assert.match(text(q1('wo-scope')), /Girder.*Weld/);
  await React.act(async () => { window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'p', bubbles: true })); await sleep(30); });
  assert.ok(q1('payment-dialog'), 'P opens the payment');
  await setValue(q1('payment-tonnes'), '1');
  assert.match(text(q1('payment-total')), /₹4,000/);
  await setValue(q1('payment-reference'), 'NEFT-2');
  await click(q1('payment-save'));
  await settle(50);
  const b = body(lastCall('POST', '/accounts/work-orders/1/payments'));
  assert.equal(b.reference, 'NEFT-2'); assert.equal(b.lines[0].tonnes, '1'); assert.equal(b.lines[0].rate, '4000');
});

await check('full screen everywhere; the production order offers "Give work to a contractor"', () => {
  assert.match(src('pages/ContractorWorkOrders.tsx'), /useFullScreen\('accounts-work-orders'\)/);
  assert.match(src('pages/ContractorWorkOrderDetail.tsx'), /useFullScreen\('accounts-work-order'\)/);
  assert.match(src('components/ContractorWork/GiveWorkDialog.tsx'), /useFullScreen\('contractor-give-work'\)/);
  assert.match(src('components/ContractorWork/PaymentDialog.tsx'), /useFullScreen\('contractor-payment'\)/);
  assert.match(src('pages/ProductionOrderDetail.tsx'), /<ContractorWorkCard /);
});

if (root) await React.act(async () => { root.unmount(); });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
