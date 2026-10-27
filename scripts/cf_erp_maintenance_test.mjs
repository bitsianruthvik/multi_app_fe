// Run from multi_app_fe: node scripts/cf_erp_maintenance_test.mjs
// MAINTENANCE (backend init.sql §82; TM/CF_ERP_ORDER_FLOW_PLAN.md "2026-10-18 — Maintenance (S6)"), rendered in jsdom against mocked
// routes shaped like the backend's answers (multi_app_be/scripts/cf_kepl/maintenance_test.mjs): the Maintenance menu, the machines
// board (down first, F raises a fault), Raise a fault (Breakdown prefilled), the MO page (S start, Close with cost, false alarm),
// the MR from an MO (prefilled lines, optional sales order), planned downtime (presets, words, next dates), the machine log's one
// entry point, and the dashboard card.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/maintenance', pretendToBeVisual: true });
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
dom.window.URL.createObjectURL = () => 'blob:x';
dom.window.URL.revokeObjectURL = () => {};
// A download link's click would navigate (jsdom cannot): the file is saved by the browser, not here.
dom.window.HTMLAnchorElement.prototype.click = function click() {};

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
      export * from './src/apps/cf_erp/lib/maintenance';
      export * as MA from './src/apps/cf_erp/api/maintenance';
      export { default as Board, MaintenanceOrders, MaintenancePlans, PlannedDowntime } from './src/apps/cf_erp/pages/Maintenance';
      export { default as Detail } from './src/apps/cf_erp/pages/MaintenanceOrderDetail';
      export { DowntimeDialog, MrFromOrderDialog, RaiseFaultDialog } from './src/apps/cf_erp/components/Maintenance/MaintenanceDialogs';
      export { MaintenanceCard } from './src/apps/cf_erp/components/Maintenance/MaintenanceCard';
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
const artifact = resolve(cache, `maintenance-test-${process.pid}.mjs`);
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
const mount = async (el, url = '/testco/cf_erp/maintenance', path = '*') => {
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
const fire = async (el, type) => { await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true })); await sleep(20); }); };
const click = (el) => fire(el, 'click');
const buttonIn = (scope, label) => [...scope.querySelectorAll('button, a')].find((b) => text(b) === label || text(b).startsWith(label));
const setValue = async (el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await React.act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(10); });
};
const calls = (method, path) => globalThis.__calls.filter((c) => c.method === method && c.path === path);
const lastCall = (method, path) => calls(method, path).at(-1);
const reset = () => { globalThis.__calls = []; globalThis.__routes = {}; globalThis.__user = null; };
const asUser = (perms, id = 7) => { globalThis.__user = { id, uiPermissions: perms }; };
const body = (c) => (typeof c?.body === 'string' ? JSON.parse(c.body) : c?.body);
const opened = [];
dom.window.open = (u) => { const tab = { location: { href: u }, close() {} }; opened.push(tab); return tab; };
globalThis.open = dom.window.open;

// ── fixtures, as the backend answers (multi_app_be/scripts/cf_kepl/maintenance_test.mjs) ─────────
const NOW = '2026-10-18 10:00:00';
const REASONS = [{ id: 1, code: 'NO_MATERIAL', label: 'No material', sortOrder: 10, needsNote: false, status: 'active' }, { id: 4, code: 'BREAKDOWN', label: 'Breakdown', sortOrder: 40, needsNote: false, status: 'active' }, { id: 12, code: 'OTHER', label: 'Other', sortOrder: 120, needsNote: true, status: 'active' }];
const machine = (id, code, status, extra = {}) => ({ id, code, name: `${code} machine`, type: 'Cutting', status, since: null, stopReason: null, downMinutes: null, fault: null, plannedNow: null, nextPlanned: null, openOrders: [], jobsRunning: 0, ...extra });
const BOARD = () => ({
  now: NOW, today: '2026-10-18',
  counts: { machines: 4, down: 1, planned: 1, stopped: 0, running: 1, idle: 1, openOrders: 2 },
  machines: [
    machine(1, 'SAW-01', 'running', { jobsRunning: 2 }),
    machine(2, 'PLS-01', 'down', { fault: { id: 50, code: 'MO-000050', status: 'open', title: 'Breakdown — leak' }, downMinutes: 95, openOrders: [{ id: 50, code: 'MO-000050', status: 'open', source: 'fault', title: 'Breakdown — leak' }] }),
    machine(3, 'DRL-01', 'idle'),
    machine(4, 'BND-01', 'planned', { plannedNow: { ruleId: 9, machineId: 4, reason: 'Monthly service', start: '2026-10-18 08:00', end: '2026-10-18 16:00', minutes: 480, now: true } }),
  ],
  planned: [{ ruleId: 9, machineId: 4, machineCode: 'BND-01', reason: 'Monthly service', start: '2026-10-18 08:00', end: '2026-10-18 16:00', minutes: 480, now: true }],
  reasons: REASONS,
});
const MO = (extra = {}) => ({
  id: 50, code: 'MO-000050', status: 'open', statusLabel: 'Open', source: 'fault', machine: { id: 2, code: 'PLS-01', name: 'Plasma' }, title: 'Breakdown — leak', note: 'leak',
  reason: 'Breakdown', plan: null, raisedAt: '2026-10-18 08:25:00', raisedBy: 'Ravi', startedAt: null, doneAt: null, cancelledAt: null, falseAlarm: false, workDone: null,
  stop: { id: 7, startedAt: '2026-10-18 08:25:00', endedAt: null, open: true }, machineDown: true, downtimeMinutes: 95, partsCost: null, otherCost: 0, costNote: null, cost: null,
  requisitions: [], canFalseAlarm: true, next: ['in_progress', 'waiting_parts'], events: [{ id: 1, event: 'raised', from: null, to: 'open', note: 'leak', by: 'Ravi', at: '2026-10-18T08:25:00' }], now: NOW, ...extra,
});
const keydown = async (key) => { await React.act(async () => { window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true })); await sleep(30); }); };
const dialog = () => document.querySelector('.MuiDialog-root');
const inputOf = (id) => q1(id)?.tagName === 'INPUT' ? q1(id) : q1(id)?.querySelector('input');

// ── 1: words and rules ──────────────────────────────────────────────────────────────────────────
await check('words: durations, the rule in words (same as the backend), the form as the backend input, board order', () => {
  assert.equal(m.durationText(45), '45 min'); assert.equal(m.durationText(125), '2 h 05 min'); assert.equal(m.durationText(60 * 27), '1 d 3 h'); assert.equal(m.durationText(null), '—');
  assert.equal(m.whenText('2026-10-18 08:00:00'), 'Sun 18 Oct, 08:00');
  assert.equal(m.ruleText({ kind: 'monthly', startsOn: '2026-10-01', startTime: '08:00', durationMinutes: 480, everyN: 1, monthWeek: 1, monthWeekday: 'sun', monthDay: null }), 'Every 1st Sunday, 08:00 for 8 h');
  assert.equal(m.ruleText({ kind: 'weekly', startsOn: '2026-10-01', startTime: '12:00', durationMinutes: 120, everyN: 1, weekdays: ['sun'] }), 'Every Sunday, 12:00 for 2 h');
  assert.equal(m.ruleText({ kind: 'once', startsOn: '2026-11-10', startTime: '22:00', durationMinutes: 90 }), 'Once, 2026-11-10 22:00 for 90 min');
  const f = m.PRESETS[0].apply(m.blankDowntime('2026-10-18'));
  const { body } = m.downtimeBody(4, f);
  assert.deepEqual(body, { machineId: 4, kind: 'monthly', reason: 'Preventive maintenance', startsOn: '2026-10-18', endsOn: null, startTime: '08:00', durationMinutes: 480, everyN: 1, notes: null, monthWeek: 1, monthWeekday: 'sun' });
  assert.deepEqual(m.downtimeBody(null, { ...f, kind: 'weekly', weekdays: [] }).problems, ['Choose the machine.', 'Choose the days of the week.']);
  assert.deepEqual(m.boardOrder(BOARD().machines).map((x) => x.code), ['PLS-01', 'BND-01', 'SAW-01', 'DRL-01']);
  assert.equal(m.costText({ partsCost: 1200, otherCost: 500, cost: 1700 }, (n) => `₹${n}`), '₹1700 (parts ₹1200 + other ₹500)');
});

await check('the API helpers call the §82 routes', async () => {
  reset();
  for (const k of ['GET /maintenance/board', 'POST /maintenance/faults', 'GET /maintenance/orders', 'POST /maintenance/orders/50/status', 'POST /maintenance/orders/50/false-alarm', 'POST /maintenance/orders/50/close', 'POST /maintenance/orders/50/requisition', 'GET /maintenance/plans', 'POST /maintenance/downtime', 'PUT /maintenance/downtime/9', 'GET /maintenance/summary']) globalThis.__routes[k] = () => ({});
  await m.MA.raiseFault({ machineId: 2, reasonId: 4, note: 'x' }); assert.deepEqual(body(lastCall('POST', '/maintenance/faults')), { machineId: 2, reasonId: 4, note: 'x' });
  await m.MA.listOrders({ status: 'done', search: 'leak' }); assert.match(lastCall('GET', '/maintenance/orders').url, /status=done&search=leak/);
  await m.MA.setOrderStatus(50, { status: 'in_progress' }); assert.equal(body(lastCall('POST', '/maintenance/orders/50/status')).status, 'in_progress');
  await m.MA.raiseMr(50, { lines: [{ itemId: 3, qty: 2 }], orderId: 900 }); assert.equal(body(lastCall('POST', '/maintenance/orders/50/requisition')).orderId, 900);
  await m.MA.previewDowntime({ machineId: 4, kind: 'once', reason: 'x', startsOn: '2026-10-20', startTime: '08:00', durationMinutes: 60 }); assert.equal(body(lastCall('POST', '/maintenance/downtime')).dryRun, true);
  await m.MA.updateDowntime(9, { reason: 'y' }); assert.deepEqual(body(lastCall('PUT', '/maintenance/downtime/9')), { reason: 'y' });
});

// ── 2: the menu ─────────────────────────────────────────────────────────────────────────────────
await check('the menu: a Maintenance tab — Machines, Maintenance orders, Preventive plans, Planned downtime — on cf_erp_maintenance', () => {
  const sec = m.SECTIONS.find((s) => s.key === 'maintenance');
  assert.equal(sec.label, 'Maintenance');
  // 2026-10-24: the machine register and Tools are in the Maintenance menu too, with their own (Production / Stores) permissions.
  assert.deepEqual(sec.screens.map((s) => s.path), ['maintenance', 'maintenance-orders', 'maintenance-plans', 'planned-downtime', 'machines', 'tools']);
  // 2026-10-27: the board, the orders and planned downtime are READ with production view too (PPC); the plans stay Maintenance's.
  assert.deepEqual(sec.screens.slice(0, 4).map((s) => s.permission), ['cf_erp_maintenance|cf_erp_production_view', 'cf_erp_maintenance|cf_erp_production_view', 'cf_erp_maintenance', 'cf_erp_maintenance|cf_erp_production_view']);
  assert.equal(sec.screens[1].hasDetail, true);
  assert.ok(src('routes.tsx').includes("'/:company/cf_erp/maintenance-orders/:id'"));
});

await check('production view reads the schedule with no write buttons: board (no fault), orders (no New), an MO (no moves), planned downtime (no New / Remove)', async () => {
  reset(); asUser(['cf_erp_production_view']);
  globalThis.__routes['GET /maintenance/board'] = () => BOARD();
  await mount(React.createElement(m.Board));
  await settle(100);
  assert.equal(qa('board-card').length, 4, 'the board is read');
  assert.equal(q1('board-fault'), null, 'no Raise a fault without maintenance / floor / production manage');
  globalThis.__routes['GET /maintenance/orders'] = () => ({ now: NOW, rows: [MO()] });
  await mount(React.createElement(m.MaintenanceOrders), '/testco/cf_erp/maintenance-orders');
  await settle(120);
  assert.match(text(document.body), /MO-000050/);
  assert.equal(q1('mo-new'), null, 'no New');
  globalThis.__routes['GET /maintenance/orders/50'] = () => MO();
  await mount(React.createElement(m.Routes, null, React.createElement(m.Route, { path: '/:company/cf_erp/maintenance-orders/:id', element: React.createElement(m.Detail) })), '/testco/cf_erp/maintenance-orders/50');
  await settle(120);
  assert.match(text(document.body), /Machine down 1 h 35 min/);
  assert.equal(q1('mo-actions'), null, 'no moves');
  assert.equal(q1('mo-close'), null); assert.equal(q1('mo-false-alarm'), null); assert.equal(q1('mo-mr'), null);
  globalThis.__routes['GET /maintenance/downtime'] = () => ({ today: '2026-10-18', rows: [] });
  await mount(React.createElement(m.PlannedDowntime), '/testco/cf_erp/planned-downtime');
  await settle(120);
  assert.match(text(document.body), /Planned downtime/);
  assert.equal(q1('dt-new'), null, 'no New');
  assert.equal(calls('POST', '/maintenance/downtime').length, 0);
});

// ── 3: the board and raising a fault ────────────────────────────────────────────────────────────
await check('the board: down first, planned now, the counts; Raise a fault (F) → prefilled Breakdown → posted', async () => {
  reset(); asUser(['cf_erp_maintenance']);
  globalThis.__routes['GET /maintenance/board'] = () => BOARD();
  globalThis.__routes['POST /maintenance/faults'] = () => ({ order: { id: 51, code: 'MO-000051' }, stopId: 8, message: 'DRL-01 is down. MO-000051 is open for maintenance.' });
  await mount(React.createElement(m.Board));
  await settle(100);
  const cards = qa('board-card');
  assert.deepEqual(cards.map((c) => c.getAttribute('data-status')), ['down', 'planned', 'running', 'idle']);
  assert.match(text(cards[0]), /MO-000050 · down 1 h 35 min/);
  assert.match(text(cards[1]), /Monthly service until/);
  assert.match(text(q1('board-planned')), /BND-01.*\(now\).*8 h.*Monthly service/);
  await keydown('f');
  assert.ok(dialog(), 'F opens Raise a fault');
  assert.equal(inputOf('fault-reason').value, '4', 'Breakdown is chosen');
  await click(buttonIn(dialog(), 'Cancel')); await settle(300);
  // From a card: the machine is fixed.
  await click(q1('card-fault', cards[3])); await settle(50);
  assert.match(text(q1('fault-machine')), /DRL-01/);
  await setValue(inputOf('fault-note'), 'Spindle noise');
  await click(buttonIn(dialog(), 'Machine is down')); await settle(100);
  assert.deepEqual(body(lastCall('POST', '/maintenance/faults')), { machineId: 3, reasonId: 4, note: 'Spindle noise', operatorId: null });
  assert.equal(calls('GET', '/maintenance/board').length, 2, 'the board reads again');
});

await check('on the floor the dialog reads the floor reasons and chooses Breakdown', async () => {
  reset(); asUser(['cf_erp_floor']);
  globalThis.__routes['GET /floor/reasons'] = () => REASONS;
  await mount(React.createElement(m.RaiseFaultDialog, { open: true, machine: { id: 3, code: 'DRL-01', name: 'Drill' }, onClose() {}, onDone() {} }));
  await settle(80);
  assert.equal(inputOf('fault-reason').value, '4', 'the floor list is read and Breakdown chosen');
  assert.ok(!buttonIn(dialog(), 'Machine is down').disabled);
});

// ── 4: orders ───────────────────────────────────────────────────────────────────────────────────
await check('the orders list: open ones, status words, down machines; search goes to the server', async () => {
  reset(); asUser(['cf_erp_maintenance']);
  globalThis.__routes['GET /maintenance/orders'] = () => ({ now: NOW, rows: [MO(), MO({ id: 49, code: 'MO-000049', status: 'waiting_parts', statusLabel: 'Waiting for parts', machineDown: false, source: 'preventive' })] });
  globalThis.__routes['GET /maintenance/board'] = () => BOARD();
  await mount(React.createElement(m.MaintenanceOrders), '/testco/cf_erp/maintenance-orders');
  await settle(120);
  const body1 = text(document.body);
  assert.match(body1, /MO-000050/); assert.match(body1, /Waiting for parts/); assert.match(body1, /Preventive/);
  assert.match(lastCall('GET', '/maintenance/orders').url, /status=active/);
});

await check('the MO page: Start (S), Close with other cost needs a note, false alarm', async () => {
  reset(); asUser(['cf_erp_maintenance']);
  let current = MO();
  globalThis.__routes['GET /maintenance/orders/50'] = () => current;
  globalThis.__routes['POST /maintenance/orders/50/status'] = () => { current = MO({ status: 'in_progress', statusLabel: 'In progress', next: ['waiting_parts'], startedAt: NOW }); return current; };
  globalThis.__routes['POST /maintenance/orders/50/close'] = () => { current = MO({ status: 'done', statusLabel: 'Done', machineDown: false, next: [], canFalseAlarm: false, otherCost: 1500, cost: 1500 }); return { order: current, downtimeMinutes: 120, message: 'MO-000050 is done — the machine is back up.' }; };
  globalThis.__routes['POST /maintenance/orders/50/false-alarm'] = () => ({ order: MO({ status: 'cancelled', falseAlarm: true, machineDown: false, next: [], canFalseAlarm: false }), message: 'ok' });
  await mount(React.createElement(m.Routes, null, React.createElement(m.Route, { path: '/:company/cf_erp/maintenance-orders/:id', element: React.createElement(m.Detail) })), '/testco/cf_erp/maintenance-orders/50');
  await settle(120);
  assert.match(text(document.body), /Machine down 1 h 35 min/);
  assert.ok(q1('mo-false-alarm'), 'a fault can be a false alarm');
  await keydown('s'); await settle(80);
  assert.equal(body(lastCall('POST', '/maintenance/orders/50/status')).status, 'in_progress');
  assert.match(text(q1('mo-actions')), /Waiting for parts/);
  await click(q1('mo-close')); await settle(50);
  await setValue(inputOf('close-cost'), '1500');
  assert.ok(buttonIn(dialog(), 'Done — machine is back up').disabled, 'a cost needs what it was for');
  await setValue(inputOf('close-cost-note'), 'Outside rewinding');
  await setValue(dialog().querySelector('[data-testid="close-work"]') ?? dialog().querySelector('textarea'), 'Rewound');
  await click(buttonIn(dialog(), 'Done — machine is back up')); await settle(120);
  assert.deepEqual(body(lastCall('POST', '/maintenance/orders/50/close')), { workDone: 'Rewound', otherCost: 1500, costNote: 'Outside rewinding' });
  assert.equal(q1('mo-actions'), null, 'a done order has no moves');
});

await check('MR from the MO: lines prefilled from the machine list, quantities editable, an optional sales order', async () => {
  reset(); asUser(['cf_erp_maintenance']);
  globalThis.__routes['GET /maintenance/orders/50/mr-lines'] = () => ({ resourcesKnown: true, canRaise: true, lines: [{ itemId: 11, code: 'SP-NOZ', name: 'Nozzle', kind: 'spare', qty: 2, uom: 'nos' }, { itemId: 12, code: 'CN-OIL', name: 'Oil', kind: 'consumable', qty: 1, uom: 'l' }] });
  globalThis.__routes['POST /maintenance/orders/50/requisition'] = () => ({ requisition: { id: 3, code: 'MR-0003' }, order: MO({ status: 'waiting_parts' }), message: 'MR-0003 went to Stores.' });
  let done = null;
  await mount(React.createElement(m.MrFromOrderDialog, { order: MO(), onClose() {}, onDone: (r) => { done = r; } }));
  await settle(100);
  assert.equal(qa('mr-line').length, 2);
  const qty = qa('mr-qty').map((x) => (x.tagName === 'INPUT' ? x : x.querySelector('input')));
  await setValue(qty[0], '4');
  await click(dialog().querySelector('[aria-label="Remove CN-OIL"]'));
  await click(buttonIn(dialog(), 'Send to Stores')); await settle(100);
  assert.deepEqual(body(lastCall('POST', '/maintenance/orders/50/requisition')), { lines: [{ itemId: 11, qty: 4, uom: 'nos' }], note: null, orderId: null });
  assert.equal(done?.message, 'MR-0003 went to Stores.');
  assert.match(src('components/Maintenance/MaintenanceDialogs.tsx'), /label="For sales order \(optional\)"/);
});

// ── 5: planned downtime ─────────────────────────────────────────────────────────────────────────
await check('planned downtime: the preset "Every 1st Sunday, 8 h" fills the form, the words and next dates show, Save posts it', async () => {
  reset(); asUser(['cf_erp_maintenance']);
  globalThis.__routes['POST /maintenance/downtime'] = (b) => { const x = typeof b === 'string' ? JSON.parse(b) : b; return x.dryRun ? { next: [{ start: '2026-11-01 08:00', end: '2026-11-01 16:00', minutes: 480 }] } : { id: 9, calendarRows: 24, next: [] }; };
  let msg = null;
  await mount(React.createElement(m.DowntimeDialog, { open: true, rule: null, today: '2026-10-18', machines: [{ id: 4, code: 'BND-01', name: 'Bender' }], machineId: 4, onClose() {}, onDone: (x) => { msg = x; } }));
  await settle(50);
  await click(q1('preset-first-sunday')); await settle(500);
  assert.match(text(q1('dt-summary')), /Every 1st Sunday, 08:00 for 8 h/);
  assert.match(text(q1('dt-summary')), /Next: Sun 1 Nov, 08:00/);
  await click(buttonIn(dialog(), 'Save')); await settle(100);
  const saved = calls('POST', '/maintenance/downtime').map(body).find((x) => !x.dryRun);
  assert.equal(saved.monthWeek, 1); assert.equal(saved.monthWeekday, 'sun'); assert.equal(saved.durationMinutes, 480); assert.equal(saved.machineId, 4);
  assert.match(msg, /24 calendar days/);
});

// ── 6: the floor and the dashboard ──────────────────────────────────────────────────────────────
await check('the machine log has ONE "Raise a fault" entry; the dashboard card shows downtime hours and cost', async () => {
  const floor = src('pages/Floor.tsx');
  assert.equal((floor.match(/data-testid="floor-raise-fault"/g) ?? []).length, 1);
  assert.match(floor, /<RaiseFaultDialog open=\{faulting\} machine=\{machine\} operatorId=\{operator\?\.id \?\? null\}/);
  assert.match(src('pages/Dashboard.tsx'), /<MaintenanceCard \/>/);
  reset(); asUser(['cf_erp_production_view']);
  globalThis.__routes['GET /maintenance/summary'] = () => ({ weekFrom: '2026-10-12', now: NOW, faultHours: 3.5, maintenanceHours: 2, plannedHours: 8, downtimeHours: 13.5, cost: 18250, doneThisWeek: 2, openOrders: 3, machinesDown: 1 });
  await mount(React.createElement(m.MaintenanceCard));
  await settle(80);
  assert.equal(text(q1('mc-hours')), '13.5 h');
  assert.match(text(q1('mc-cost')), /18,250/);
  assert.match(text(q1('maintenance-card')), /1 machine down · 3 open orders/);
});

await check('full screen on every Maintenance screen', () => {
  for (const id of ['maintenance-board', 'maintenance-orders', 'maintenance-plans', 'planned-downtime']) assert.match(src('pages/Maintenance.tsx'), new RegExp(`useFullScreen\\('${id}'\\)`));
  assert.match(src('pages/MaintenanceOrderDetail.tsx'), /useFullScreen\('maintenance-order'\)/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
