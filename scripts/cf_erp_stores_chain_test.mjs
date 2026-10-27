// Run from multi_app_fe: node scripts/cf_erp_stores_chain_test.mjs
// THE STORES CHAIN (init.sql §79, TM/CF_ERP_ORDER_FLOW_PLAN.md "2026-10-18 — Stores chain"), rendered in jsdom against mocked
// routes shaped like the backend's answers (multi_app_be/scripts/cf_kepl/stores_chain_test.mjs):
//   the menu (Stores replaces Inventory: MR inbox, To reorder, GRN; Purchase sees PRs only), the MR inbox (For chips, New MR),
//   the New MR dialog (full screen, For, items, quantities, Ctrl+Enter), To reorder (by AI: rows ticked, suggestion prefilled,
//   ONE MR for stock), the Procurement card (method, min / max, inherited from the definition, clear), the pure helpers.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/material-requests', pretendToBeVisual: true });
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
      export * from './src/apps/cf_erp/lib/stores';
      export { MR_FOR_LABEL } from './src/apps/cf_erp/api/purchaseRequests';
      export { default as MaterialRequests } from './src/apps/cf_erp/pages/MaterialRequests';
      export { default as MaterialRequestDetail } from './src/apps/cf_erp/pages/MaterialRequestDetail';
      export { default as ToReorder } from './src/apps/cf_erp/pages/ToReorder';
      export { ProcurementCard } from './src/apps/cf_erp/components/Stores/ProcurementCard';
      export { SECTIONS } from './src/apps/cf_erp/navMeta';`,
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
const artifact = resolve(cache, `stores-chain-test-${process.pid}.mjs`);
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

const ITEM_D = { id: 601, code: 'TSTO-D', name: 'Welding wire 1.2 mm', uom: 'kg', trackedBy: 'quantity' };
const ITEM_E = { id: 602, code: 'TSTO-E', name: 'Cutting nozzle', uom: 'nos', trackedBy: 'quantity' };
const reorderRow = (item, extra) => ({ item, method: 'buy_min_max', methodLabel: 'Buy to min / max', free: 3, coming: 0, min: 10, max: 50, periodDays: null, periodFrom: null, dueOn: null, used: null,
  suggest: 50, why: '3 kg free is below the minimum 10 — up to the maximum 50.', leadTimeDays: 4, minOrderQty: 20, orderMultiple: 5, preferredVendors: [{ id: 31, name: 'Vendor A' }], ...extra });
const mrRow = (extra) => ({ id: 2082, code: 'MR-002082', supply: 'we_buy', supplyLabel: 'We buy', forType: 'general', forLabel: 'General', manual: true, maintenanceOrderId: null, notes: 'Workshop consumables',
  order: null, line: null, status: 'open', statusLabel: 'Open', materials: 2, lockedLines: 0, lockedWords: '0 of 2 locked', heldForAcceptance: false, purchaseRequest: null, raisedAt: '2026-10-18', ...extra });

// ── 1: pure helpers ─────────────────────────────────────────────────────────────
await check('helpers: New MR problems / body (blank rows dropped, a stock MR names no order), a spare row, reorder body, procurement form', () => {
  const rows = [{ item: { id: 1, code: 'A', name: 'A' }, qty: '3' }, { item: null, qty: '' }];
  assert.deepEqual(m.newMrProblems('general', null, rows), []);
  assert.deepEqual(m.newMrProblems('sales_order', null, rows), ['Pick the sales order.']);
  assert.ok(m.newMrProblems('general', null, [{ item: null, qty: '' }]).includes('Add at least one item.'));
  assert.ok(m.newMrProblems('general', null, [{ item: { id: 1, code: 'A', name: 'A' }, qty: '0' }]).some((p) => /above zero/.test(p)));
  assert.deepEqual(m.newMrBody('stock', 9, ' ', rows), { forType: 'stock', lines: [{ itemId: 1, qty: 3 }] });
  assert.deepEqual(m.newMrBody('general', 9, 'for SO', rows), { forType: 'general', orderId: 9, note: 'for SO', lines: [{ itemId: 1, qty: 3 }] });
  assert.equal(m.withSpareRow([{ item: { id: 1 }, qty: '1' }]).length, 2);
  assert.equal(m.withSpareRow(rows).length, 2);
  const rr = [reorderRow(ITEM_D), reorderRow(ITEM_E, { method: 'buy_periodic', suggest: 6 })];
  assert.deepEqual(m.reorderBody(rr, new Set([601]), { 601: '45' }), [{ itemId: 601, qty: 45 }]);
  assert.deepEqual(m.reorderProblems(rr, new Set(), {}), ['Tick at least one row.']);
  assert.deepEqual(m.procurementFields('buy_min_max'), { minMax: true, period: false, buying: true });
  assert.deepEqual(m.procurementFields('make'), { minMax: false, period: false, buying: false });
  assert.ok(m.procurementProblems({ ...m.procurementForm(null), method: 'buy_min_max', minQty: '10', maxQty: '5' }).includes('The maximum is above the minimum.'));
  assert.deepEqual(m.procurementBody({ ...m.procurementForm(null), method: '' }), { method: null });
  assert.equal(m.mrForWords({ forType: 'stock', order: null, line: null }), 'For stock');
  assert.equal(m.mrForWords({ forType: 'maintenance_order', forLabel: 'Maintenance order', order: { code: 'SO260014' }, line: null, maintenanceOrderId: 7 }), 'Maintenance order #7 · SO260014');
  assert.equal(m.mrForWords({ forType: 'sales_order', order: { code: 'SO1' }, line: { lineNo: 2 } }), 'SO1 · line 2');
});

// ── 2: the menu ─────────────────────────────────────────────────────────────────
await check('menu: Stores replaces Inventory — MR inbox, To reorder, GRN (Receive against PO), stock …; Purchase has PRs and POs only', () => {
  const stores = m.SECTIONS.find((s) => s.key === 'inventory');
  assert.equal(stores.label, 'Stores');
  const keys = stores.screens.map((s) => s.key);
  assert.deepEqual(keys.slice(0, 3), ['material-requests', 'to-reorder', 'stock']);
  for (const k of ['receive', 'wip', 'offcuts', 'customer-returns', 'movements']) assert.ok(keys.includes(k), k);
  assert.equal(stores.screens[0].label, 'MR inbox');
  assert.match(stores.screens[0].permission, /cf_erp_stores/);
  const purchase = m.SECTIONS.find((s) => s.key === 'purchase').screens;
  assert.ok(!purchase.some((s) => s.key === 'material-requests'));
  assert.match(purchase.find((s) => s.key === 'purchase-requests').permission, /cf_erp_purchase/);
  assert.match(src('routes.tsx'), /cf_erp\/to-reorder', element: wrap\(<ToReorder \/>\)/);
});

// ── 3: the MR inbox and New MR ──────────────────────────────────────────────────
await check('MR inbox: For chips filter on the server; a general MR shows "General" with no order; New MR is a full-screen dialog', async () => {
  reset(); asUser(['cf_erp_stores', 'cf_erp_inventory_view']);
  globalThis.__routes['GET /material-requests'] = () => ({ rows: [mrRow(), mrRow({ id: 41, code: 'MR-SO1-1', forType: 'sales_order', forLabel: 'Sales order', manual: false, order: { id: 9, code: 'SO1', status: 'confirmed', customer: null }, line: { id: 8, lineNo: 1, name: 'Girder' } })] });
  await page(m.MaterialRequests, '/:company/cf_erp/material-requests', '/testco/cf_erp/material-requests');
  await settle(120);
  const body = text(document.body);
  assert.match(body, /MR inbox/); assert.match(body, /MR-002082/); assert.match(body, /General/); assert.match(body, /SO1 · line 1/);
  await click(buttonIn(document, 'Stock')); await settle(80);
  assert.match(lastCall('GET', '/material-requests').url, /for=stock/);
  await click(q1('new-mr')); await settle(80);
  const dlg = document.querySelector('.MuiDialog-root');
  assert.ok(dlg && dlg.querySelector('.MuiDialog-paperFullScreen'), 'full screen');
  assert.match(text(dlg), /New material request/);
  for (const f of ['stock', 'general', 'sales_order']) assert.ok(q1(`newmr-for-${f}`, dlg), f);
  assert.ok(!q1('newmr-for-maintenance_order', dlg), 'a maintenance order raises its own MR');
  await click(q1('newmr-raise', dlg)); await settle(60);
  assert.match(text(q1('newmr-problems', dlg)), /Add at least one item/);
  assert.equal(calls('POST', '/requisitions').length, 0, 'nothing is sent while there are problems');
  assert.match(text(dlg), /Ctrl\+Enter/);
});
await check('a stock MR screen: For badge, no order facts, its note, "Locked for this MR"; no take box; Save sends take 0', async () => {
  reset(); asUser(['cf_erp_stores']);
  const line = { id: 101, item: ITEM_D, required: 50, inStock: 3, takeFromStock: 0, takeChosen: false, proposedTake: null, heldFromStock: 0, takeMax: 0, toBuy: 50, poRaised: 0, received: 0, onOrder: 0, locked: 0, open: 50, status: 'open', statusLabel: 'Open', sentence: '', purchase: [] };
  const screen = () => ({ id: 2083, code: 'MR-002083', supply: 'we_buy', supplyLabel: 'We buy', forType: 'stock', forLabel: 'Stock', manual: true, maintenanceOrderId: null, notes: 'Reorder (by AI)',
    order: null, line: null, status: 'open', statusLabel: 'Open', stale: false, needKnown: false, needComplete: false, canEdit: true, reason: null, lines: [line], purchaseRequest: null, purchaseOrders: [],
    sentence: 'An MR for stock: everything on it is bought — save to put it on the purchase request.', raisedBy: { id: 1, name: 'Test' } });
  globalThis.__routes['GET /material-requests/2083'] = screen;
  await page(m.MaterialRequestDetail, '/:company/cf_erp/material-requests/:id', '/testco/cf_erp/material-requests/2083');
  await settle(120);
  const body = text(document.body);
  assert.match(body, /For: Stock/); assert.match(body, /For stock/); assert.match(body, /Reorder \(by AI\)/); assert.match(body, /Locked for this MR/);
  assert.doesNotMatch(body, /Sales order/);
  assert.equal(qa('mr-take').length, 0, 'no take-from-stock box on a stock MR');
  globalThis.__routes['PUT /material-requests/2083'] = (b) => { globalThis.__saved = typeof b === 'string' ? JSON.parse(b) : b; return { ...screen(), purchaseRequest: { id: 70, code: 'PR-000070', status: 'open', statusLabel: 'Open' } }; };
  await click(q1('mr-save')); await settle(80);
  assert.deepEqual(globalThis.__saved.lines, [{ lineId: 101, takeFromStock: 0 }]);
});

// ── 4: To reorder ──────────────────────────────────────────────────────────────
await check('To reorder (by AI): every row ticked, the suggestion prefilled; untick one, change a quantity → "Raise PR": ONE PR for stock, opened', async () => {
  reset(); asUser(['cf_erp_stores']);
  globalThis.__routes['GET /stores/reorder'] = () => ({ today: '2026-10-18', rows: [reorderRow(ITEM_D), reorderRow(ITEM_E, { method: 'buy_periodic', methodLabel: 'Buy periodically', suggest: 6, why: 'Every 7 days: 6 nos used since 2026-10-08.' })], counts: { all: 2, buy_min_max: 1, buy_periodic: 1 } });
  globalThis.__routes['POST /stores/reorder/raise'] = (b) => { globalThis.__raised = typeof b === 'string' ? JSON.parse(b) : b; return { requisition: { id: 2084, code: 'MR-002084' }, materialRequest: {}, purchaseRequest: { id: 71, code: 'PR-000071', status: 'open', statusLabel: 'Open' } }; };
  await page(m.ToReorder, '/:company/cf_erp/to-reorder', '/testco/cf_erp/to-reorder');
  await settle(150);
  const body = text(document.body);
  assert.match(body, /To reorder/); assert.match(body, /by AI/); assert.match(body, /below the minimum 10/); assert.match(body, /Every 7 days/);
  const ticks = qa('reorder-tick').map((t) => t.querySelector('input'));
  assert.equal(ticks.length, 2); assert.ok(ticks.every((t) => t.checked), 'all ticked');
  assert.deepEqual(qa('reorder-qty').map((x) => x.value), ['50', '6']);
  assert.match(text(q1('reorder-raise')), /^Raise PR for 2 items$/);
  assert.doesNotMatch(text(document.body), /Raise MR/, 'no "Raise MR" on To reorder (user 2026-10-27)');
  await click(ticks[1]); await settle(40);
  await setValue(qa('reorder-qty')[0], '45');
  assert.match(text(q1('reorder-raise')), /Raise PR for 1 item$/);
  assert.ok(document.querySelector('[data-testid="full-screen-toggle"]'), 'full screen');
  await click(q1('reorder-raise')); await settle(80);
  assert.deepEqual(globalThis.__raised, { rows: [{ itemId: 601, qty: 45 }] });
  assert.match(src('pages/ToReorder.tsx'), /raised for stock — with Purchase/);
  assert.match(src('pages/ToReorder.tsx'), /purchase-requests\/\$\{out\.purchaseRequest\.id\}/, 'it opens the PR, not the MR');
});

// ── 4b: MR vs PR (user 2026-10-27) ──────────────────────────────────────────────
await check('MR inbox: Stores get "New PR" (straight to Purchase) beside "New MR"; departments get New MR only', async () => {
  reset(); asUser(['cf_erp_stores']);
  globalThis.__routes['GET /material-requests'] = () => ({ rows: [mrRow()] });
  await page(m.MaterialRequests, '/:company/cf_erp/material-requests', '/testco/cf_erp/material-requests');
  await settle(120);
  assert.ok(q1('new-pr') && q1('new-mr'), 'Stores: both');
  assert.equal(text(q1('new-pr')), 'New PR'); assert.equal(text(q1('new-mr')), 'New MR');
  assert.match(text(document.body), /Requests to Stores/);
  for (const [perms, label] of [[['cf_erp_orders_manage', 'cf_erp_inventory_view'], 'orders manage'], [['cf_erp_maintenance', 'cf_erp_inventory_view'], 'maintenance']]) {
    reset(); asUser(perms);
    globalThis.__routes['GET /material-requests'] = () => ({ rows: [] });
    await page(m.MaterialRequests, '/:company/cf_erp/material-requests', '/testco/cf_erp/material-requests');
    await settle(100);
    assert.ok(q1('new-mr'), `${label}: New MR (a request to Stores)`);
    assert.ok(!q1('new-pr'), `${label}: no New PR`);
  }
  reset(); asUser(['cf_erp_inventory_view']);
  globalThis.__routes['GET /material-requests'] = () => ({ rows: [] });
  await page(m.MaterialRequests, '/:company/cf_erp/material-requests', '/testco/cf_erp/material-requests');
  await settle(100);
  assert.ok(!q1('new-mr') && !q1('new-pr'), 'a viewer raises nothing');
});
await check('MR inbox shows what the server sends (it leaves internal MRs out); the page never asks for internal ones', async () => {
  reset(); asUser(['cf_erp_stores']);
  globalThis.__routes['GET /material-requests'] = () => ({ rows: [mrRow()] });
  await page(m.MaterialRequests, '/:company/cf_erp/material-requests', '/testco/cf_erp/material-requests');
  await settle(120);
  assert.doesNotMatch(lastCall('GET', '/material-requests').url, /internal/);
  assert.match(text(document.body), /MR-002082/);
});
await check('New PR: full screen, For Stock / General (no Sales order toggle), Raise PR → nothing sent while there are problems; the PR opens', async () => {
  reset(); asUser(['cf_erp_stores']);
  globalThis.__routes['GET /material-requests'] = () => ({ rows: [] });
  await page(m.MaterialRequests, '/:company/cf_erp/material-requests', '/testco/cf_erp/material-requests');
  await settle(100);
  await click(q1('new-pr')); await settle(80);
  const dlg = document.querySelector('.MuiDialog-root');
  assert.ok(dlg && dlg.querySelector('.MuiDialog-paperFullScreen'), 'full screen');
  assert.match(text(dlg), /New purchase request/); assert.match(text(dlg), /straight to Purchase/);
  assert.ok(q1('newpr-for-stock', dlg) && q1('newpr-for-general', dlg));
  assert.ok(!q1('newpr-for-sales_order', dlg) && !q1('newpr-for-maintenance_order', dlg), 'For is Stock or General');
  assert.equal(text(q1('newpr-raise', dlg)), 'Raise PR');
  assert.ok(!q1('newpr-maintenance', dlg), 'Stock: no order to charge');
  await click(q1('newpr-raise', dlg)); await settle(60);
  assert.match(text(q1('newpr-problems', dlg)), /Add at least one item/);
  assert.equal(calls('POST', '/stores/purchase-requests').length, 0);
  assert.equal(calls('POST', '/requisitions').length, 0);
  assert.match(src('pages/MaterialRequests.tsx'), /purchase-requests\/\$\{p\.id\}/, 'the PR opens');
  assert.match(src('components/Stores/NewMrDialog.tsx'), /raiseStoresPr\(newPrBody/);
});
await check('helpers: New PR body — Stock names no order; General may name a sales order and / or a maintenance order (→ For maintenance order)', () => {
  const rows = [{ item: { id: 1, code: 'A', name: 'A' }, qty: '3' }, { item: null, qty: '' }];
  assert.deepEqual(m.newPrBody('stock', 9, 4, '', rows), { forType: 'stock', lines: [{ itemId: 1, qty: 3 }] });
  assert.deepEqual(m.newPrBody('general', 9, null, 'gas', rows), { forType: 'general', orderId: 9, note: 'gas', lines: [{ itemId: 1, qty: 3 }] });
  assert.deepEqual(m.newPrBody('general', null, 4, '', rows), { forType: 'maintenance_order', maintenanceOrderId: 4, lines: [{ itemId: 1, qty: 3 }] });
  assert.deepEqual(m.NEW_PR_FOR.map((f) => f.value), ['stock', 'general']);
});
await check("an internal MR (under Stores' own PR) says so on its screen", async () => {
  reset(); asUser(['cf_erp_stores']);
  const line = { id: 111, item: ITEM_D, required: 50, inStock: 3, takeFromStock: 0, takeChosen: false, proposedTake: null, heldFromStock: 0, takeMax: 0, toBuy: 50, poRaised: 0, received: 0, onOrder: 0, locked: 0, open: 50, status: 'open', statusLabel: 'Open', sentence: '', purchase: [] };
  globalThis.__routes['GET /material-requests/2091'] = () => ({ id: 2091, code: 'MR-002091', supply: 'we_buy', supplyLabel: 'We buy', forType: 'stock', forLabel: 'Stock', manual: true, internal: true, maintenanceOrderId: null, notes: 'Reorder (by AI)',
    order: null, line: null, status: 'open', statusLabel: 'Open', stale: false, needKnown: false, needComplete: false, canEdit: true, reason: null, lines: [line], purchaseRequest: { id: 76, code: 'PR-000076', status: 'open', statusLabel: 'Open' }, purchaseOrders: [],
    sentence: "Stores' own purchase — raised straight to PR-000076 for Purchase. Not a request waiting for Stores, so it is not in the MR inbox.", raisedBy: { id: 1, name: 'Test' } });
  await page(m.MaterialRequestDetail, '/:company/cf_erp/material-requests/:id', '/testco/cf_erp/material-requests/2091');
  await settle(120);
  const body = text(document.body);
  assert.match(body, /Stores' own purchase/); assert.match(body, /PR-000076/);
});


// ── 5: the Procurement card ──────────────────────────────────────────────────────
const sub = { method: 'subcontract', methodLabel: 'Subcontract', minQty: null, maxQty: null, periodDays: null, periodicFrom: null, leadTimeDays: 12, orderMultiple: null, minOrderQty: null, preferredVendorIds: [], preferredVendors: [] };
const procFixture = (extra = {}) => ({
  subject: { id: 5, code: 'TMP-CL-1', name: 'Cleat on SO1', kind: 'item', itemType: 'temporary', definitionType: null },
  methods: [], own: null, inherited: { from: { id: 4, code: 'CL', name: 'Cleat' }, settings: sub }, effective: sub,
  source: 'definition', defaultMethod: 'make', sourceWords: 'From its definition CL.', ...extra,
});
await check("Procurement card: a temporary item shows its definition's method (no min / max for subcontract); switching to min / max shows them; save sends them", async () => {
  reset(); asUser(['cf_erp_catalog_manage']);
  globalThis.__routes['GET /procurement/5'] = () => procFixture();
  globalThis.__routes['PUT /procurement/5'] = (b) => { globalThis.__put = typeof b === 'string' ? JSON.parse(b) : b; return procFixture({ own: { ...sub, method: 'buy_min_max', methodLabel: 'Buy to min / max', minQty: 10, maxQty: 50 }, source: 'own', sourceWords: 'Set here.' }); };
  const Card = () => React.createElement(m.ProcurementCard, { masterId: 5, canEdit: true });
  await page(Card, '/x', '/x');
  await settle(120);
  assert.match(text(document.body), /From its definition CL/);
  assert.equal(q1('proc-method').value, 'subcontract');
  assert.ok(!q1('proc-minQty'), 'no min / max for subcontract');
  assert.equal(q1('proc-leadTimeDays').value, '12');
  assert.match(src('components/Stores/ProcurementCard.tsx'), /Follow the definition/);
  assert.match(src('pages/RecordDetail.tsx'), /<ProcurementCard key=\{`proc-\$\{id\}`\} masterId=\{id\}/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
