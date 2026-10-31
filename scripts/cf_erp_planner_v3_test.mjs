// Run from multi_app_fe: node scripts/cf_erp_planner_v3_test.mjs
// STEP 5 — the PLANNER per production order (backend init.sql §84; TM/CF_ERP_ORDER_FLOW_PLAN.md "2026-10-18 — Step 5"),
// rendered in jsdom against mocked routes shaped like the backend's answers (multi_app_be/scripts/cf_kepl/planner_v3_test.mjs):
// the day helpers, the menu, the Planner (by production order / by machine type, "Planned by AI" / "by Management",
// slowed-by words, baseline tick), keys (M manual, Alt+↓ moves a rank, P pin, S save, B re-baseline), and plan health.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/planner', pretendToBeVisual: true });
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
      export * from './src/apps/cf_erp/lib/planner3';
      export * as PA from './src/apps/cf_erp/api/planner3';
      export { default as Planner } from './src/apps/cf_erp/pages/Planner';
      export { PlanHealthCard } from './src/apps/cf_erp/components/Planner3/PlanHealthCard';
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
const artifact = resolve(cache, `planner-v3-test-${process.pid}.mjs`);
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
const mount = async (el, url = '/testco/cf_erp/planner', path = '*') => {
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
const settle = async (ms = 60) => { await React.act(async () => { await sleep(ms); }); };
const qa = (id, scope = document) => [...scope.querySelectorAll(`[data-testid="${id}"]`)];
const q1 = (id, scope = document) => scope.querySelector(`[data-testid="${id}"]`);
const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const click = async (el) => { await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); await sleep(30); }); };
const setValue = async (el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await React.act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(10); });
};
const key = async (k, opts = {}) => { await React.act(async () => { window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, ...opts })); await sleep(40); }); };
const calls = (method, path) => globalThis.__calls.filter((c) => c.method === method && c.path === path);
const lastCall = (method, path) => calls(method, path).at(-1);
const reset = () => { globalThis.__calls = []; globalThis.__routes = {}; globalThis.__user = null; };
const asUser = (perms, id = 7) => { globalThis.__user = { id, uiPermissions: perms }; };
const body = (c) => (typeof c?.body === 'string' ? JSON.parse(c.body) : c?.body);

// ── fixtures, as the backend answers ─────────────────────────────────────────────────────────────
const DAYS = Array.from({ length: 14 }, (_, i) => { const d = new Date(2026, 9, 19 + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
const PO = (id, rank, extra = {}) => ({
  id, code: `SO2600${id}-P01`, label: `SO2600${id} · Span ${rank} of 2`, orderId: 900 + id, orderCode: `SO2600${id}`, status: 'planned', released: true, state: 'planned',
  rank, manual: { earliestStart: null, rank: null, pinned: false }, committedDate: '2026-10-25', money: 125000, minutesLeft: 900,
  steps: 4, stepsDone: 0, unplanned: 0, noRate: 0, start: '2026-10-19 00:00:00', end: '2026-10-21 06:00:00', late: false,
  baseline: { start: '2026-10-19 00:00:00', end: '2026-10-20 18:00:00' }, slipDays: 1, slowedBy: [], waitingFor: null, ...extra,
});
const PLAN = (extra = {}) => ({
  today: '2026-10-19', now: '2026-10-19 08:00:00', mode: 'auto', storedMode: 'auto', madeBy: 'AI', days: DAYS, horizonDays: 365, passes: 2,
  productionOrders: [
    PO(8, 1),
    PO(9, 2, { late: true, committedDate: '2026-10-20', end: '2026-10-24 12:00:00', slipDays: 3, slowedBy: [{ kind: 'capacity', text: 'CNC Plasma busy with SO260008 · Span 1 of 2', days: 2 }, { kind: 'material', text: 'material — PL-12: due 23 Oct on PO-000163.', days: 1 }] }),
    PO(10, 3, { state: 'not_released', status: 'yet_to_plan', steps: 0, start: null, end: null, baseline: null, slipDays: null, waitingFor: 'Release it to plan it — a production order Yet to plan has no steps yet.' }),
  ],
  machineTypes: [
    { key: '3306', name: 'CNC Plasma Cutting', unlimited: false, machines: [{ id: 1, code: 'PLS-01', name: 'Plasma', hasShifts: true, down: false }, { id: 2, code: 'PLS-02', name: 'Plasma 2', hasShifts: true, down: true }],
      capacity: DAYS.map(() => 480), load: DAYS.map((_, i) => (i === 0 ? 480 : i === 1 ? 200 : 0)), byPo: DAYS.map((_, i) => (i === 0 ? { 8: 300, 9: 180 } : {})) },
  ],
  baseline: { id: 1, version: 1, savedAt: '2026-10-18 10:00:00', approvedAt: '2026-10-18 10:00:00' }, pendingRebaseline: null,
  saved: { at: '2026-10-18T10:00:00', mode: 'auto' },
  health: { compared: 2, onTime: 0, late: 2, onTimePct: 0, slipDays: 4, byReason: [{ kind: 'capacity', label: 'Machine busy', orders: 2, days: 4 }], worst: [] },
  counts: { productionOrders: 3, steps: 8, unplanned: 0, late: 1 },
  ...extra,
});
const PERMS = ['cf_erp_production_view', 'cf_erp_production_manage'];

// ── 1: the day helpers ───────────────────────────────────────────────────────────────────────────
await check('helpers: a bar on the day columns, load %, minutes in words, rank moves, slip and slowed-by words', () => {
  const days = ['2026-10-19', '2026-10-20', '2026-10-21'];
  assert.deepEqual(m.barOf('2026-10-19 12:00:00', '2026-10-20 06:00:00', days), { left: 0.5, width: 0.75 });
  assert.deepEqual(m.barOf('2026-10-10 00:00:00', '2026-10-19 06:00:00', days), { left: 0, width: 0.25 });
  assert.equal(m.barOf(null, '2026-10-19 06:00:00', days), null);
  const t = PLAN().machineTypes[0];
  assert.equal(m.loadPct(t, 0), 100); assert.equal(m.loadTone(m.loadPct(t, 0)), 'full'); assert.equal(m.loadTone(m.loadPct(t, 1)), 'mid'); assert.equal(m.loadTone(m.loadPct(t, 3)), 'none');
  assert.equal(m.loadTone(120), 'over');
  assert.deepEqual(m.dayOrders(t, 0, PLAN().productionOrders).map((x) => x.id), [8, 9]);
  assert.equal(m.minutesText(45), '45 min'); assert.equal(m.minutesText(210), '3.5 h'); assert.equal(m.minutesText(0.003), '1 s'); assert.equal(m.minutesText(3000), '2 d 2 h');
  const orders = PLAN().productionOrders;
  assert.deepEqual(m.moveRank(orders, 9, -1), [{ id: 9, rank: 1 }, { id: 8, rank: 2 }, { id: 10, rank: 3 }]);
  assert.deepEqual(m.moveRank(orders, 8, -1).map((x) => x.id), [8, 9, 10]);
  assert.equal(m.slipText(orders[1]), '+3 d late'); assert.equal(m.slipText(PO(1, 1, { slipDays: 0 })), 'on time'); assert.equal(m.slipText(PO(1, 1, { end: null })), 'cannot finish');
  assert.equal(m.slowedText(orders[1]), 'Slowed by CNC Plasma busy with SO260008 · Span 1 of 2 (+1 more)');
  assert.match(m.slowedText(orders[2]), /Release it to plan it/);
  assert.equal(m.MODE_WORDS.auto.made, 'Planned by AI'); assert.equal(m.MODE_WORDS.manual.made, 'Planned by Management');
});

await check('the API helpers call the §84 routes', async () => {
  reset();
  for (const k of ['GET /planner3', 'GET /planner3/health', 'PUT /planner3/settings', 'PUT /planner3/orders', 'POST /planner3/run', 'POST /planner3/rebaseline']) globalThis.__routes[k] = () => ({});
  await m.PA.getPlan3({ mode: 'manual', po: 9 }); assert.match(lastCall('GET', '/planner3').url, /mode=manual&po=9/);
  await m.PA.putPlanMode('manual'); assert.deepEqual(body(lastCall('PUT', '/planner3/settings')), { mode: 'manual' });
  await m.PA.putOrderInputs([{ id: 9, rank: 1 }]); assert.deepEqual(body(lastCall('PUT', '/planner3/orders')), { rows: [{ id: 9, rank: 1 }] });
  await m.PA.askRebaseline('two days down'); assert.deepEqual(body(lastCall('POST', '/planner3/rebaseline')), { note: 'two days down' });
});

// ── 2: the menu ─────────────────────────────────────────────────────────────────────────────────
await check('the menu: Production › Planner (production manage, 2026-10-31), the monthly plan kept as "Plan by month"', () => {
  const sec = m.SECTIONS.find((s) => s.key === 'production');
  const p = sec.screens.find((s) => s.key === 'planner');
  assert.ok(p, 'planner screen');
  assert.equal(p.path, 'planner'); assert.equal(p.label, 'Planner'); assert.equal(p.permission, 'cf_erp_production_manage');
  assert.ok(sec.screens.findIndex((s) => s.key === 'planner') < sec.screens.findIndex((s) => s.key === 'plan'));
  assert.equal(sec.screens.find((s) => s.key === 'plan').label, 'Plan by month');
  assert.match(src('routes.tsx'), /cf_erp\/planner'/);
});

// ── 3: the planner ──────────────────────────────────────────────────────────────────────────────
let plan = PLAN();
const routes = () => {
  globalThis.__routes['GET /planner3'] = (_b, url) => (/po=9/.test(url)
    ? { ...plan, steps: [{ id: 51, productionOrderId: 9, label: 'SO260009-G1 · Cut', operation: 'CUT', typeKey: '3306', machineId: 1, state: 'pending', minutes: 600, planned: 600, noRate: false, start: '2026-10-20 00:00:00', end: '2026-10-21 06:00:00', real: false, binding: 'capacity', why: null }] }
    : plan);
  globalThis.__routes['PUT /planner3/settings'] = (b) => { const x = typeof b === 'string' ? JSON.parse(b) : b; plan = PLAN({ mode: x.mode, storedMode: x.mode, madeBy: x.mode === 'auto' ? 'AI' : 'Management' }); return { mode: x.mode }; };
  globalThis.__routes['PUT /planner3/orders'] = () => ({ saved: 1 });
  globalThis.__routes['POST /planner3/run'] = () => ({ saved: { at: '2026-10-19 08:00:00', mode: 'auto', madeBy: 'AI', steps: 8, productionOrders: 3 }, baseline: null, late: 1, unplanned: 0 });
  globalThis.__routes['POST /planner3/rebaseline'] = () => ({ baseline: { id: 2, version: 2, status: 'pending' }, approvalId: 77 });
};

await check('the Planner: production orders in rank order, "Planned by AI", late, slowed by, baseline tick, Yet to plan', async () => {
  reset(); asUser(PERMS); plan = PLAN(); routes();
  await mount(React.createElement(m.Planner));
  await settle(120);
  const rows = qa('plan-order');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => Number(r.dataset.id)), [8, 9, 10]);
  assert.match(text(q1('plan-madeby')), /Planned by AI/);
  assert.match(text(rows[1]), /Late/);
  assert.match(text(rows[1]), /Slowed by CNC Plasma busy with SO260008 · Span 1 of 2 \(\+1 more\)/);
  assert.match(text(rows[1]), /\+3 d late/);
  assert.equal(qa('plan-baseline', rows[0]).length, 1);
  assert.equal(qa('plan-bar', rows[2]).length, 0);
  assert.match(text(rows[2]), /Yet to plan/);
  assert.match(text(document.body), /On time vs baseline v1/);
});

await check('keys: M switches to manual (stored), the rank and earliest start fields appear; Alt+↓ moves the picked row', async () => {
  await key('m');
  await settle(120);
  assert.deepEqual(body(lastCall('PUT', '/planner3/settings')), { mode: 'manual' });
  assert.match(text(q1('plan-madeby')), /Planned by Management/);
  assert.equal(qa('plan-rank').length, 3);
  await click(qa('plan-order')[0]);
  await key('ArrowDown', { altKey: true });
  await settle(80);
  assert.deepEqual(body(lastCall('PUT', '/planner3/orders')), { rows: [{ id: 9, rank: 1 }, { id: 8, rank: 2 }, { id: 10, rank: 3 }] });
  const start = qa('plan-start')[1];
  await setValue(start, '2026-10-25');
  await React.act(async () => { start.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true })); await sleep(40); });
  assert.deepEqual(body(lastCall('PUT', '/planner3/orders')), { rows: [{ id: 9, earliestStart: '2026-10-25' }] });
});

await check('keys: A back to automatic; P pins the picked production order; S saves the plan', async () => {
  await key('a');
  await settle(120);
  assert.deepEqual(body(lastCall('PUT', '/planner3/settings')), { mode: 'auto' });
  await click(qa('plan-order')[1]);
  await key('p');
  assert.deepEqual(body(lastCall('PUT', '/planner3/orders')), { rows: [{ id: 9, pinned: true }] });
  await key('s');
  await settle(60);
  assert.equal(calls('POST', '/planner3/run').length, 1);
});

await check('Enter opens the picked production order\'s steps (GET ?po=)', async () => {
  await key('Enter');
  await settle(120);
  assert.match(lastCall('GET', '/planner3').url, /po=9/);
  assert.equal(qa('plan-step').length, 1);
  assert.match(text(q1('plan-steps')), /SO260009-G1 · Cut/);
  await click([...document.querySelectorAll('.MuiDialog-root button')].find((b) => text(b) === 'Close'));
  await settle(300);
});

await check('B asks Management to re-baseline (a reason is needed)', async () => {
  await mount(React.createElement(m.Planner));
  await settle(120);
  await key('b');
  await settle(40);
  const send = q1('plan-rebaseline-send');
  assert.ok(send?.disabled, 'disabled without a reason');
  await setValue(q1('plan-rebaseline-note'), 'Plasma 2 is out for two days');
  await click(q1('plan-rebaseline-send'));
  await settle(60);
  assert.deepEqual(body(lastCall('POST', '/planner3/rebaseline')), { note: 'Plasma 2 is out for two days' });
});

await check('2: by machine type — a cell per day, coloured by load, the down machine marked', async () => {
  await key('2');
  await settle(60);
  const row = q1('plan-type');
  assert.ok(row);
  assert.match(text(row), /CNC Plasma Cutting/);
  assert.match(text(row), /PLS-02 · down/);
  const cells = qa('plan-cell', row);
  assert.equal(cells.length, 14);
  assert.equal(cells[0].dataset.tone, 'full');
  assert.equal(cells[1].dataset.tone, 'mid');
  assert.match(cells[0].getAttribute('title'), /SO26008 · Span 1 of 2 — 5 h/);
});

await check('a production view without manage sees the plan but no save / mode writes', async () => {
  reset(); asUser(['cf_erp_production_view']); plan = PLAN(); routes();
  await mount(React.createElement(m.Planner));
  await settle(120);
  assert.equal(q1('plan-save'), null);
  await key('s');
  await key('m');
  assert.equal(calls('POST', '/planner3/run').length, 0);
  assert.equal(calls('PUT', '/planner3/settings').length, 0);
});

// ── 4: plan health on the Management dashboard ──────────────────────────────────────────────────
await check('plan health: on time %, late, slip by reason, slipping most', async () => {
  reset(); asUser(['cf_erp_approve_rebaseline']);
  globalThis.__routes['GET /planner3/health'] = () => ({ baseline: { id: 1, version: 3, savedAt: '2026-10-18', approvedAt: null }, savedAt: '2026-10-19', compared: 4, onTime: 3, late: 1, onTimePct: 75, slipDays: 2,
    byReason: [{ kind: 'material', label: 'Material', orders: 1, days: 2 }], worst: [{ id: 9, code: 'SO260009-P01', label: 'SO260009 · Span 2 of 2', slipDays: 2, reason: 'material — PL-12 due 23 Oct' }] });
  await mount(React.createElement(m.PlanHealthCard));
  await settle(80);
  assert.equal(text(q1('plan-health-pct')), '75%');
  assert.match(text(q1('plan-health')), /1late against the baseline|1 late against the baseline/);
  assert.match(text(q1('plan-health-reasons')), /Material2 days1 production order|Material 2 days 1 production order/);
  assert.match(text(q1('plan-health')), /SO260009 · Span 2 of 2 — \+2 d · material — PL-12 due 23 Oct/);
  assert.match(src('pages/Approvals.tsx'), /<PlanHealthCard \/>/);
});

await check('full screen and keys are on the Planner', () => {
  assert.match(src('pages/Planner.tsx'), /useFullScreen\('planner3'\)/);
  assert.match(src('pages/Planner.tsx'), /FullScreenToggle/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
