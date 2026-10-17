// Run from multi_app_fe: node scripts/cf_erp_production_views_test.mjs
// Production views (2026-10-17): the "Own steps" / "Including everything below" choice (lib/stepsView,
// OrderTree), work orders grouped by sales order (lib/dashboardWorkOrders, WorkOrdersTab), the
// Production orders page (lib/productionOrders, pages/ProductionOrders) and the "not in the plan"
// words (lib/planCheck) — against a pretend API. DOM-level; it does not replace a look in a browser.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/production-orders', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  try { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true }); } catch { /* skip */ }
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = (q) => ({ matches: /min-width/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
globalThis.matchMedia = dom.window.matchMedia;

const calls = [];
let routes = {};
globalThis.fetch = async (url) => {
  calls.push(String(url));
  const hit = Object.keys(routes).find((k) => String(url).includes(k));
  if (!hit) return { ok: false, status: 404, text: async () => 'no route' };
  const body = typeof routes[hit] === 'function' ? routes[hit](String(url)) : routes[hit];
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
};
const stubs = {
  '@core/api/client': `export async function apiFetch(url, o = {}) {
    const res = await globalThis.fetch(url, { method: o.method || 'GET' });
    const text = await res.text();
    if (!res.ok) throw new Error('API request failed: ' + res.status + ' x - ' + text);
    return JSON.parse(text);
  }`,
  '@core/contexts/AuthContext': 'export const useAuth = () => ({ user: { id: 7 } });',
};
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter, Routes, Route } from 'react-router-dom';
      export { React, createRoot, MemoryRouter, Routes, Route };
      export * from './src/apps/cf_erp/lib/stepsView';
      export * from './src/apps/cf_erp/lib/planCheck';
      export * from './src/apps/cf_erp/lib/productionOrders';
      export { groupBySalesOrder } from './src/apps/cf_erp/lib/dashboardWorkOrders';
      export { OrderTree } from './src/apps/cf_erp/components/Dashboard/OrderTree';
      export { WorkOrdersTab } from './src/apps/cf_erp/components/Dashboard/WorkOrdersTab';
      export { default as ProductionOrders } from './src/apps/cf_erp/pages/ProductionOrders';`,
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
const artifact = resolve(cache, `production-views-test-${process.pid}.mjs`);
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
const render = async (el, path = '/testco/cf_erp/x') => {
  app.replaceChildren(); const host = document.createElement('div'); app.appendChild(host); const root = createRoot(host);
  await React.act(async () => { root.render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Routes, null, React.createElement(Route, { path: '/:company/cf_erp/*', element: el })))); await sleep(0); });
  await settle(); return root;
};
const click = async (el, what) => { assert.ok(el, `no ${what} to click`); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await settle(); };
const $ = (sel) => app.querySelector(sel);
const $$ = (sel) => [...app.querySelectorAll(sel)];

// ── fixtures ────────────────────────────────────────────────────────────────
const op = (stepId, operationId, state, done, total, minutes) => ({ stepId, operationId, name: `op${operationId}`, state, done, total, minutes });
const piece = (id, parentId, level, code, extra = {}) => ({
  id, parentId, kind: 'piece', level, code, name: null, qty: 1, ops: [], completion: 0, weight: 'minutes', blocked: false, blockedCount: 0, blockedReason: null, blockedAt: null,
  running: 0, childCount: 0, childrenIncluded: true, lineId: 11, orderId: 1, ...extra,
});
// P1 own: 1 step 60 min, nothing done; including 160 min, 60 done.
const P1 = piece('p1', 'l11', 2, 'SO-A', {
  ops: [op(101, 5, 'todo', 0, 1, 60)], completion: 0.375, minutes: 160, minutesDone: 60, childCount: 1,
  own: { completion: 0, weight: 'minutes', steps: 1, stepsDone: 0, minutes: 60, minutesDone: 0 },
  byOperation: [{ operationId: 5, done: 1, total: 2, minutes: 90, minutesDone: 30 }, { operationId: 6, done: 3, total: 6, minutes: 70, minutesDone: 30 }],
});
const P2 = piece('p2', 'p1', 3, 'SO-A-B', { ops: [op(102, 6, 'done', 1, 1, 10)], completion: 1, minutes: 10, minutesDone: 10, own: { completion: 1, weight: 'minutes', steps: 1, stepsDone: 1, minutes: 10, minutesDone: 10 } });
const LINE = { id: 'l11', parentId: 'o1', kind: 'line', level: 1, code: 'Line 1', name: 'Girder', qty: 1, ops: [], completion: 0.375, weight: 'minutes', blocked: false, blockedCount: 0, blockedReason: null, blockedAt: null, running: 0, childCount: 1, childrenIncluded: true,
  own: { completion: 0, weight: 'minutes', steps: 1, stepsDone: 0, minutes: 60, minutesDone: 0, byOperation: [{ operationId: 5, done: 0, total: 1, minutes: 60, minutesDone: 0 }] } };
const NAMES = { 5: { code: 'ASM', name: 'Assemble' }, 6: { code: 'WLD', name: 'Weld' } };

await check('stepsView: own vs including per node, the line, the order card', async () => {
  assert.equal(m.viewCompletion(P1, 'own'), 0);
  assert.equal(m.viewCompletion(P1, 'all'), 0.375);
  assert.equal(m.viewCompletion({ ...P1, own: undefined }, 'own'), 0.375, 'an older server falls back to the subtree');
  const all = m.opTotals(P1, 'all', NAMES);
  assert.deepEqual(all.map((t) => [t.code, t.done, t.total, t.minutes]), [['ASM', 1, 2, 90], ['WLD', 3, 6, 70]]);
  assert.ok(Math.abs(all[1].pct - (30 / 70) * 100) < 1e-9, 'pct by minutes');
  assert.deepEqual(m.opTotals(P1, 'own', NAMES).map((t) => [t.code, t.done, t.total, t.minutes]), [['ASM', 0, 1, 60]]);
  assert.deepEqual(m.opTotals(LINE, 'own', NAMES).map((t) => t.code), ['ASM'], 'a line own = its top pieces');
  assert.equal(m.opTotals({ ...P2, byOperation: undefined }, 'all', NAMES)[0].minutes, 10, 'a leaf: including = its own ops');
  assert.equal(m.opTotals(piece('px', null, 2, 'X', { ops: [op(1, 5, 'todo', 0, 1, null)] }), 'all', NAMES)[0].pct, 0, 'no time: by count');
  assert.equal(m.lineViewPct({ progressPct: 37.5, own: { progressPct: 0 } }, 'own'), 0);
  assert.equal(m.lineViewPct({ progressPct: 37.5, own: { progressPct: 0 } }, 'all'), 37.5);
  assert.equal(m.orderViewPct({ progress: { pct: 40, own: { pct: 10 } } }, 'own'), 10);
  assert.match(m.opTotalTitle(all[1]), /Weld: 3 of 6 done · 30 of 70 min · 43%/);
});

await check('stepsView: remembered per user, junk ignored', async () => {
  assert.equal(m.loadStepsView(7), 'all');
  m.saveStepsView(7, 'own');
  assert.equal(m.loadStepsView(7), 'own');
  assert.equal(m.loadStepsView(8), 'all', 'another user keeps the default');
  window.localStorage.setItem('cf_erp.dash.stepsView.9', 'nonsense');
  assert.equal(m.loadStepsView(9), 'all');
  m.saveStepsView(7, 'all');
});

await check('OrderTree: the toggle switches every row between own and including, and is remembered', async () => {
  routes = { '/tracker/tree/children': (url) => {
    assert.match(url, /figures=1/, 'the dashboard asks for the figures');
    return url.includes('nodeId=l11') ? { node: LINE, operations: NAMES, nodes: [P1] } : { node: P1, operations: NAMES, nodes: [P2] };
  } };
  window.localStorage.removeItem('cf_erp.dash.tree.1');
  const order = { id: 1, code: 'SO-A', lineRows: [{ id: 11, lineNo: 1, item: { code: null, name: 'Girder' }, quantity: 1, released: true, releaseId: 3, progressPct: 37.5, own: { progressPct: 0 }, tonnes: null }] };
  const root = await render(React.createElement(m.OrderTree, { order }));
  await waitFor(() => $('[data-node="p1"]'), 'the top piece row');
  const pctOf = (id) => $(`[data-node="${id}"] [data-testid="completion-pct"]`)?.textContent;
  assert.equal(pctOf('p1'), '37%', 'including by default (37.5 % shown as the bar rounds)');
  assert.ok($('[data-node="p1"] [data-testid="op-totals"]'), 'per-operation totals when including');
  assert.equal($$('[data-node="p1"] [data-testid="op-total"]').length, 2);
  await click($('[data-testid="tree-steps-view"] [data-view="own"]'), 'Own steps');
  assert.equal(pctOf('p1'), '0%', 'own steps only');
  assert.ok($('[data-node="p1"] [data-testid="op-strip"]'), 'own: the step strip');
  assert.equal(window.localStorage.getItem('cf_erp.dash.stepsView.7'), 'own', 'remembered for the user');
  const lineHead = $('[data-testid="tree-line-head"] [data-testid="completion-pct"]');
  assert.equal(lineHead?.textContent, '0%', 'the line row follows');
  await click($('[data-testid="tree-steps-view"] [data-view="all"]'), 'Including');
  assert.equal(pctOf('p1'), '37%');
  await React.act(async () => root.unmount());
});

await check('work orders grouped by sales order: totals, order kept', async () => {
  const w = (id, orderId, code, contractor, steps, done, pct, extra = {}) => ({ id, code: `WO${id}`, status: 'issued', open: true, overdue: false, daysOverdue: 0, contractor: { id: contractor, name: `C${contractor}`, code: null },
    order: { id: orderId, code, revision: 1, title: null, status: 'confirmed' }, line: { id: orderId * 10, lineNo: 1, itemCode: null, itemName: null }, startDate: null, dueDate: null, notes: null,
    pieces: 1, released: steps > 0, operations: { assigned: 4, steps, done, inProgress: 0, onHold: 0, pct }, firstStartedAt: null, lastActivityAt: null, period: { opsDone: 0, stepsTouched: 0 }, byOperation: [], ...extra });
  const ws = [w(1, 1, 'SO-A', 1, 2, 1, 50), w(2, 2, 'SO-B', 1, 0, 0, null), w(3, 1, 'SO-A', 2, 2, 2, 100, { open: false, status: 'done' })];
  const g = m.groupBySalesOrder(ws);
  assert.deepEqual(g.map((x) => x.order.code), ['SO-A', 'SO-B']);
  assert.deepEqual(g[0].totals, { workOrders: 2, open: 1, overdue: 0, contractors: 2, steps: 4, done: 3, assigned: 8, pct: 75 });
  assert.equal(g[1].totals.pct, null, 'nothing released');
});

await check('WorkOrdersTab: Group by sales order shows the order summary and the cards under their order', async () => {
  const wo = (id, orderId, code) => ({ id, code: `WO${id}`, status: 'issued', open: true, overdue: false, daysOverdue: 0, contractor: { id: 1, name: 'Acme fab', code: null },
    order: { id: orderId, code, revision: 1, title: null, status: 'confirmed' }, line: { id: 9, lineNo: 1, itemCode: null, itemName: null }, startDate: null, dueDate: null, notes: null,
    pieces: 1, released: true, operations: { assigned: 2, steps: 2, done: 1, inProgress: 0, onHold: 0, pct: 50 }, firstStartedAt: null, lastActivityAt: null, period: { opsDone: 0, stepsTouched: 0 }, byOperation: [] });
  const data = {
    period: { from: '2026-10-01', to: '2026-10-17', days: 17, today: '2026-10-17', now: '2026-10-17T10:00:00', timezone: 'Asia/Kolkata' },
    plant: { workOrders: 2, open: 2, contractors: 1, contractorsActive: 1, operationsAssigned: 4, operationsReleased: 4, operationsDone: 2, pct: 50, notReleased: 0, overdue: 0, periodOps: 0, value: null },
    contractors: [{ id: 1, code: null, name: 'Acme fab', workOrders: 2, open: 2, active: 2, assigned: 4, steps: 4, done: 2, pct: 50, overdue: 0, periodOps: 0 }],
    salesOrders: [{ id: 1, code: 'SO-A', revision: 1, title: 'Girders', status: 'confirmed', workOrders: 1, open: 1, contractors: 1, assigned: 2, steps: 2, done: 1, pct: 50, overdue: 0, periodOps: 0 },
      { id: 2, code: 'SO-B', revision: 1, title: null, status: 'confirmed', workOrders: 1, open: 1, contractors: 1, assigned: 2, steps: 2, done: 1, pct: 50, overdue: 0, periodOps: 0 }],
    workOrders: [wo(1, 1, 'SO-A'), wo(2, 2, 'SO-B')], meta: { queries: 8, stages: 2, ms: 1 },
  };
  const root = await render(React.createElement(m.WorkOrdersTab, { data }));
  assert.ok($('[data-testid="contractor-summary"]'), 'contractor by default');
  const select = $('[data-testid="wo-group-by"]');
  assert.ok(select, 'the Group by choice');
  // MUI select: fire the change through its hidden input.
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await React.act(async () => { setter.call(select, 'order'); select.dispatchEvent(new dom.window.Event('input', { bubbles: true })); select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await sleep(0); });
  await settle();
  if (!$('[data-testid="order-summary"]')) {
    // Older MUI: open the menu and pick the option.
    await React.act(async () => { $('[role="combobox"]').dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })); await sleep(0); });
    await settle();
    await click([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent === 'Sales order'), 'Sales order option');
  }
  await waitFor(() => $('[data-testid="order-summary"]'), 'the sales order summary');
  assert.equal($$('[data-testid="order-summary-row"]').length, 2);
  assert.deepEqual($$('[data-testid="wo-order-group"]').map((g) => g.getAttribute('data-order')), ['SO-A', 'SO-B']);
  assert.match($('[data-testid="wo-order-totals"]').textContent, /1 work order · 1 open · 1 contractor · 50% complete \(1 of 2\)/);
  await click($('[data-testid="order-summary-row"][data-order="SO-B"]'), 'SO-B row');
  assert.deepEqual($$('[data-testid="wo-order-group"]').map((g) => g.getAttribute('data-order')), ['SO-B'], 'a row narrows to its order');
  await React.act(async () => root.unmount());
});

await check('productionOrders words', async () => {
  assert.equal(m.shipWeekText('2026-11-16', '2026'), 'week of 16 Nov');
  assert.equal(m.shipWeekText(null), 'not planned');
  assert.equal(m.shortDate('2027-01-04', '2026'), '4 Jan 2027');
  assert.equal(m.blockedText({ onHold: 2, material: 1, total: 3 }), '2 on hold · 1 waiting for material');
  assert.equal(m.blockedText({ onHold: 0, material: 0, total: 0 }), null);
  assert.equal(m.orderStatusText({ lines: 3, not_started: 2, in_progress: 1, done: 0, dispatched: 0 }), '3 lines · 2 not started · 1 in progress');
  assert.equal(m.lineTrackerPath({ orderId: 5, line: { id: 9 } }), 'orders/5?tab=production&line=9');
});

await check('Production orders page: grouped by sales order, collapsible, filters go to the server, a line opens its tracker', async () => {
  const line = (id, lineNo, status, pct, extra = {}) => ({ releaseId: id, orderId: id < 20 ? 1 : 2, line: { id, lineNo }, item: { id: 1, code: 'IT', name: 'Girder' }, quantity: 1, made: 0, delivered: 0,
    releasedAt: '2026-10-01', committedDate: null, plan: null, progress: { pct, basis: 'work', steps: 4, stepsDone: 1 }, forecast: { date: null, pace: null, plan: null, estimate: true }, status, blocked: { onHold: 0, material: 0, total: 0 }, ...extra });
  const page = (offset) => ({
    rows: offset === 0 ? [{ order: { id: 1, code: 'SO-A', revision: 1, title: 'Girders', status: 'confirmed', customer: { id: 4, name: 'Rail Co' }, committedDate: null },
      totals: { lines: 2, not_started: 1, in_progress: 1, done: 0, dispatched: 0, progressPct: 34.3, basis: 'work', steps: 8, stepsDone: 2, blocked: 1, lastShipWeek: '2026-11-16', planned: 1, forecast: '2026-11-20' },
      lines: [line(11, 1, 'in_progress', 37.5, { plan: { shipWeek: '2026-11-16', firstShip: '2026-11-20', lastShip: '2026-11-20', entries: 1 }, blocked: { onHold: 1, material: 0, total: 1 } }), line(12, 2, 'not_started', 0)] }]
      : [{ order: { id: 2, code: 'SO-B', revision: 1, title: null, status: 'confirmed', customer: null, committedDate: null },
        totals: { lines: 1, not_started: 0, in_progress: 0, done: 0, dispatched: 1, progressPct: 100, basis: 'work', steps: 1, stepsDone: 1, blocked: 0, lastShipWeek: null, planned: 0, forecast: null }, lines: [line(21, 1, 'dispatched', 100)] }],
    total: 2, limit: 20, offset, hasMore: offset === 0, lineTotal: 3,
    counts: { all: 3, open: 2, not_started: 1, in_progress: 1, done: 0, dispatched: 1 }, customers: [{ id: 4, name: 'Rail Co' }], status: 'open', today: '2026-10-17',
  });
  routes = { '/production-orders': (url) => page(/offset=20/.test(url) ? 20 : 0) };
  calls.length = 0;
  window.localStorage.removeItem('cf_erp.productionOrders.collapsed');
  const root = await render(React.createElement(m.ProductionOrders), '/testco/cf_erp/production-orders');
  await waitFor(() => $('[data-testid="po-order"]'), 'the order block');
  assert.match(calls[0], /status=open/, 'opens on lines not dispatched');
  assert.equal($$('[data-testid="po-line"]').length, 2);
  assert.match($('[data-testid="po-order-totals"]').textContent, /2 lines · 1 not started · 1 in progress · ships week of 16 Nov · forecast 20 Nov · 1 blocked/);
  const first = $('[data-testid="po-line"][data-line="11"]');
  assert.match(first.textContent, /Line 1/); assert.match(first.textContent, /week of 16 Nov/); assert.match(first.textContent, /In progress/); assert.match(first.textContent, /1 on hold/);
  await click($('[data-testid="po-order-head"]'), 'the order head');
  await waitFor(() => $$('[data-testid="po-line"]').length === 0, 'folded');
  assert.equal(window.localStorage.getItem('cf_erp.productionOrders.collapsed'), '[1]', 'remembered folded');
  await click($('[data-testid="po-order-head"]'), 'the order head');
  await waitFor(() => $$('[data-testid="po-line"]').length === 2, 'open again');
  await click($('[data-testid="po-next"]'), 'Next');
  await waitFor(() => $('[data-testid="po-order"][data-order="SO-B"]'), 'page 2');
  assert.ok(calls.some((u) => /offset=20/.test(u)), 'the next page of orders');
  assert.match(app.textContent, /Orders 21–21 of 2|Orders 21/);
  await React.act(async () => root.unmount());
});

await check('planCheck words', async () => {
  assert.equal(m.UNPLANNED_TEXT, 'This work is not in the plan.');
  assert.deepEqual(m.unplannedPlaces([{ orderCode: 'SO-A', lineNo: 1 }, { orderCode: 'SO-A', lineNo: 1 }, { orderCode: 'SO-B', lineNo: 2 }]), ['SO-A · line 1', 'SO-B · line 2']);
  assert.deepEqual(m.unplannedPicked([{ id: 1, planned: false }, { id: 2, planned: true }, { id: 3, planned: null }, { id: 4 }]).map((s) => s.id), [1], 'unknown counts as planned');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
