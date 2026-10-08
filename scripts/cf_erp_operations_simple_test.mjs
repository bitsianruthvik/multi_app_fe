// Run from multi_app_fe: node scripts/cf_erp_operations_simple_test.mjs
// The simple Operations screens (2026-10-02): the LIST is one row per operation with its machine type, setup time and time
// per quantity in plain words, editable in place; clicking a time opens the time builder; an operation with no rule gets one
// when a machine type is picked (or a time is clicked, which asks for the machine type first); an operation with several rules
// shows its main one and a "+N more rules" link; the PAGE is one card with Advanced folded (remembered per device) holding the
// rules table, the machines it reaches and "How long?". The API is mocked; no network.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/operations', pretendToBeVisual: true });
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
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = RO; dom.window.ResizeObserver = RO;

const calls = [];
let routes = [];
globalThis.__api = async (url, opts = {}) => {
  const method = opts.method ?? 'GET';
  const path = url.replace(/^\/api\/testco\/cf_erp/, '');
  calls.push({ method, path, body: opts.body });
  const hit = routes.find(([mm, re]) => mm === method && re.test(path));
  if (!hit) throw new Error(`API request failed: 404 Not Found - {"message":"no mock for ${method} ${path}"}`);
  return hit[2](path, opts.body);
};
const stubs = {
  '@core/api/client': 'export async function apiFetch(url, opts) { return globalThis.__api(url, opts); }',
  '@core/contexts/AuthContext': 'export const useAuth = () => ({ user: null });',
};
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
      export { React, createRoot, MemoryRouter, Routes, Route, useLocation };
      export { default as Operations } from './src/apps/cf_erp/pages/Operations';
      export { default as OperationDetail } from './src/apps/cf_erp/pages/OperationDetail';
      export { ToastProvider } from './src/apps/cf_erp/components/Toast';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/(api\/client|contexts\/AuthContext)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
  } }],
  alias: { '@shared/ui': resolve('src/shared/ui/storage.ts') },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `operations-simple-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter, Routes, Route } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const app = document.getElementById('app');
let root = null;
let here = '';
const Probe = () => { here = m.useLocation().pathname + m.useLocation().search; return null; };
const render = async (entry) => {
  if (root) await React.act(async () => { root.unmount(); });
  document.body.querySelectorAll('.MuiPopover-root, .MuiDrawer-root, .MuiModal-root, .MuiPopper-root').forEach((n) => n.remove());
  app.replaceChildren(); const host = document.createElement('div'); app.appendChild(host); root = createRoot(host);
  const tree = React.createElement(m.ToastProvider, null, React.createElement(m.MemoryRouter, { initialEntries: [entry] },
    React.createElement(Probe), React.createElement(m.Routes, null,
      React.createElement(m.Route, { path: '/:company/cf_erp/operations', element: React.createElement(m.Operations) }),
      React.createElement(m.Route, { path: '/:company/cf_erp/operations/:id', element: React.createElement(m.OperationDetail) }))));
  await React.act(async () => { root.render(tree); await sleep(0); });
  await settle(60);
};
const settle = async (ms = 40) => React.act(async () => { await sleep(ms); });
const click = async (el) => { assert.ok(el, 'nothing to click'); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await settle(); };
const q = (id) => document.querySelector(`[data-testid="${id}"]`);
const text = (id) => q(id)?.textContent.replace(/\s+/g, ' ').trim();
const openPicker = async () => {
  const input = document.querySelector('.MuiPopover-root input');
  assert.ok(input, 'the machine-type picker is open');
  await React.act(async () => { input.focus(); input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await sleep(0); });
  await settle();
};
const option = (re) => [...document.querySelectorAll('[role="option"]')].find((o) => re.test(o.textContent));

// ── fixture ───────────────────────────────────────────────────────────────
const node = (id, parentId, depth, name, children = []) => ({
  id, parentId, depth, level: ['Family', 'Subfamily', 'Variant'][depth], scope: 'machine', code: name.toUpperCase().replace(/\W/g, ''), name,
  description: null, sortOrder: 0, status: 'active', createdIn: null, itemCount: 0, definitionCount: 0, machineCount: 1, ruleCount: 0, selectionSources: 0,
  subtree: { items: 0, definitions: 0, machines: 1 }, visibleBecause: ['holds_machines'], children,
});
const machineTree = { screen: 'machines', all: false, levels: ['Family', 'Subfamily', 'Variant'], leafDepth: 2, hiddenCount: 0,
  roots: [node(1, null, 0, 'Cutting', [node(2, 1, 1, 'Plasma', [node(3, 2, 2, 'PL-V')])]), node(10, null, 0, 'Welding', [node(11, 10, 1, 'SAW')])] };
const subj = (type, id, code, name, level) => ({ type, id, code, name, level });
// A time as the API hands it over (§49): `expression` is always the text; a rule's own expression has a formula with no id.
const tv = (minutes, formula = null) => ({ minutes, expression: minutes != null ? String(minutes) : formula?.expression, formula });
const rule = (id, opId, subject, setup, work, extra = {}) => ({ id, operationId: opId, subject, eligible: true, setup, work, effectiveFrom: null, effectiveTo: null, notes: null, ...extra });
const cutRate = { id: null, code: null, expression: 'item.CUT_LENGTH / 1000 * 2.8' };
const fitRule1 = rule(31, 3, subj('classification', 11, 'SAW', 'SAW', 'Subfamily'), tv(5), tv(0.5));
const fitRule2 = rule(32, 3, subj('machine', 7, 'SAW-01', 'SAW Machine 1', 'Machine'), null, tv(0.4));
const ops = [
  { id: 1, code: 'CUT', name: 'Plasma cut', description: 'Cut plate', status: 'active', flowCount: 3, ruleCount: 1, mainRule: rule(11, 1, subj('classification', 2, 'PLASMA', 'Plasma', 'Subfamily'), tv(12), tv(null, cutRate)) },
  { id: 2, code: 'WELD', name: 'Weld', description: null, status: 'active', flowCount: 0, ruleCount: 0, mainRule: null },
  { id: 3, code: 'FIT', name: 'Fit up', description: null, status: 'active', flowCount: 2, ruleCount: 2, mainRule: fitRule1 },
  { id: 4, code: 'DRILL', name: 'Drill', description: null, status: 'active', flowCount: 1, ruleCount: 1, mainRule: rule(41, 4, subj('classification', 3, 'PL-V', 'PL-V', 'Variant'), null, null) },
].map((o) => ({ ...o, createdAt: '2026-01-01', updatedAt: '2026-01-02' }));
const specs = [{ id: 1, code: 'CUT_LENGTH', name: 'Cut length', dataType: 'number', measurementType: 'LENGTH', defaultUom: 'mm' }];
const detail = (o, rules, flows, machines = []) => ({ ...o, rules, flows, machines });
const ctx = { operation: { id: 1, code: 'CUT', name: 'Plasma cut' }, machines: [], machineFields: [], itemFields: [{ code: 'CUT_LENGTH', name: 'Cut length', dataType: 'number', measurementType: 'LENGTH', unit: 'mm', example: 2400, count: 3 }], samplePieces: [] };
const baseRoutes = () => [
  ['GET', /^\/operations$/, () => ops],
  ['GET', /^\/formulas$/, () => []],
  ['GET', /^\/specifications$/, () => specs],
  ['GET', /^\/classification\?screen=machines$/, () => machineTree],
  ['GET', /^\/classification$/, () => machineTree],
  ['GET', /^\/operations\/\d+\/formula-builder/, () => ctx],
  ['GET', /^\/machines/, () => []],
  ['POST', /^\/formulas\/check$/, () => ({ ok: true, problems: [], references: [], itemRefs: [], machineRefs: [], kind: 'timing', result: { value: 1 }, inputs: [] })],
  ['POST', /^\/operations\/(\d+)\/rules$/, (p, b) => rule(900, Number(p.split('/')[2]), subj('classification', b.subjectId, 'X', b.subjectId === 2 ? 'Plasma' : 'SAW', 'Subfamily'), b.setupExpression ? tv(null, { id: null, code: null, expression: b.setupExpression }) : null, b.workExpression ? tv(null, { id: null, code: null, expression: b.workExpression }) : null)],
  ['PUT', /^\/operation-rules\/\d+$/, () => ({})],
  ['DELETE', /^\/operation-rules\/\d+$/, () => ({ ok: true })],
  ['PUT', /^\/operations\/\d+$/, () => ({})],
  ['GET', /^\/operations\/1$/, () => detail(ops[0], [ops[0].mainRule], [{ id: 1, code: 'FLOWA', name: 'Flow A', status: 'active', sequence: 1, times: 1 }, { id: 2, code: 'FLOWB', name: 'Flow B', status: 'active', sequence: 2, times: 1 }],
    [{ machine: { id: 5, code: 'PL-01', name: 'Plasma 1' }, eligible: true, from: ops[0].mainRule.subject, setup: tv(12), work: tv(null, cutRate) }])],
  ['GET', /^\/operations\/3$/, () => detail(ops[2], [fitRule1, fitRule2], [{ id: 2, code: 'FLOWB', name: 'Flow B', status: 'active', sequence: 3, times: 1 }])],
  ['GET', /^\/operations\/2$/, () => detail(ops[1], [], [])],
];
const reset = () => { calls.length = 0; routes = baseRoutes(); try { localStorage.clear(); } catch { /* none */ } };

// ── the list ──────────────────────────────────────────────────────────────
await check('list: one row per operation, machine type and both times in plain words', async () => {
  reset(); await render('/testco/cf_erp/operations');
  assert.equal(text('op-type-1'), 'Plasma');
  assert.equal(text('op-setup-1'), '12 min');
  assert.match(text('op-work-1'), /^2\.8 min per m of cut length/i, text('op-work-1'));
  assert.equal(text('op-type-3'), 'SAW');
  assert.equal(text('op-work-3'), '0.5 min');
  const body = document.body.textContent;
  assert.ok(!/Timing rules/.test(body), 'the old "Timing rules" count column is gone');
  assert.ok(/Used in flows/.test(body) && /Machine type/.test(body) && /Setup time/.test(body) && /Time per quantity/.test(body));
  assert.equal(calls.filter((c) => c.path === '/operations').length, 1, 'one list read, nothing per row');
});

await check('list: a missing time reads amber "Set time"; a missing machine type reads "Set machine type"', async () => {
  assert.equal(text('op-work-4'), 'Set time');
  assert.equal(text('op-type-2'), 'Set machine type');
  assert.equal(text('op-work-2'), 'Set time');
});

await check('list: an operation with several rules shows its main one and "+N more rules" linking to Advanced', async () => {
  const chip = q('op-more-3');
  assert.ok(chip, 'the chip is there'); assert.match(chip.textContent, /\+1 more rule$/);
  assert.match(chip.getAttribute('href'), /operations\/3\?advanced=1$/);
  assert.equal(q('op-more-1'), null, 'a single-rule row has no chip');
});

await check('list: clicking a time cell opens the time builder for that rule (and does not open the page)', async () => {
  here = '';
  await click(q('op-work-1'));
  assert.ok(q('time-builder'), 'the builder is open');
  assert.equal(q('time-builder-title').textContent, 'Work, per piece');
  assert.equal(q('formula-text').value, 'item.CUT_LENGTH / 1000 * 2.8', 'it opens with its own expression');
  assert.match(document.querySelector('[data-testid="time-builder"]').textContent, /CUT · Plasma cut/i);
  assert.ok(!/operations\/1/.test(here), `the row did not navigate (${here})`);
  assert.ok(calls.some((c) => /^\/operations\/1\/formula-builder/.test(c.path) && /subjectId=2/.test(c.path)), 'the builder read the fields for the rule\'s machine type');
});

await check('list: saving a number in the dialog writes it to the SAME rule as workExpression (no formula is made) and reloads the list', async () => {
  const ta = q('formula-text');
  assert.ok(ta, 'the one formula editor');
  const set = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
  await React.act(async () => { set.call(ta, '3.5'); ta.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(0); });
  await settle(400);
  const save = q('builder-save');
  assert.equal(save.textContent, 'Save');
  calls.length = 0;
  await click(save); await settle(80);
  const put = calls.find((c) => c.method === 'PUT');
  assert.ok(put && put.path === '/operation-rules/11', JSON.stringify(calls));
  assert.deepEqual(put.body, { workExpression: '3.5' });
  assert.ok(!calls.some((c) => c.path.startsWith('/formulas') && c.path !== '/formulas/check'), 'no shared formula touched');
  assert.ok(calls.some((c) => c.method === 'GET' && c.path === '/operations'), 'the list reloaded');
});

await check('list: clicking a SETUP cell opens the same dialog, titled Setup, per run, and saves setupExpression', async () => {
  reset(); await render('/testco/cf_erp/operations');
  await click(q('op-setup-1'));
  assert.equal(q('time-builder-title').textContent, 'Setup, per run');
  assert.equal(q('formula-text').value, '12');
  const ta = q('formula-text');
  const set = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
  await React.act(async () => { set.call(ta, '15'); ta.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(0); });
  await settle(400);
  calls.length = 0;
  await click(q('builder-save')); await settle(80);
  const put = calls.find((c) => c.method === 'PUT');
  assert.ok(put && put.path === '/operation-rules/11', JSON.stringify(calls));
  assert.deepEqual(put.body, { setupExpression: '15' });
});

await check('list: picking a machine type on a row with NO rule creates its rule', async () => {
  reset(); await render('/testco/cf_erp/operations');
  await click(q('op-type-2'));
  assert.match(text('type-prompt'), /WELD/);
  await openPicker();
  const opt = option(/SAW/);
  assert.ok(opt, 'SAW is offered');
  calls.length = 0;
  await click(opt); await settle(60);
  const post = calls.find((c) => c.method === 'POST');
  assert.ok(post && post.path === '/operations/2/rules', JSON.stringify(calls));
  assert.deepEqual({ t: post.body.subjectType, id: post.body.subjectId }, { t: 'classification', id: 11 });
  assert.ok(!calls.some((c) => c.method === 'DELETE'), 'nothing removed');
  assert.ok(calls.some((c) => c.method === 'GET' && c.path === '/operations'), 'the list reloaded');
  assert.ok(!q('time-builder'), 'no builder when only the type was set');
});

await check('list: clicking a TIME on a row with no rule asks for the machine type first, then creates the rule and opens the builder', async () => {
  reset(); await render('/testco/cf_erp/operations');
  await click(q('op-work-2'));
  assert.ok(/time belongs to a machine type/i.test(document.body.textContent), 'it says why it asks');
  await openPicker();
  calls.length = 0;
  await click(option(/Plasma/)); await settle(80);
  assert.ok(calls.some((c) => c.method === 'POST' && c.path === '/operations/2/rules'), 'the rule was created');
  assert.ok(q('time-builder'), 'the builder opened for the new rule');
});

await check('list: changing the machine type of a ruled row adds the new rule with the same times and removes the old one', async () => {
  reset(); await render('/testco/cf_erp/operations');
  await click(q('op-type-1'));
  await openPicker();
  calls.length = 0;
  await click(option(/SAW/)); await settle(80);
  const post = calls.find((c) => c.method === 'POST');
  assert.ok(post && post.path === '/operations/1/rules', JSON.stringify(calls));
  assert.equal(post.body.setupExpression, '12'); assert.equal(post.body.workExpression, 'item.CUT_LENGTH / 1000 * 2.8'); assert.equal(post.body.subjectId, 11);
  assert.ok(!('setupMinutes' in post.body) && !('workFormulaId' in post.body), 'no old time fields');
  const del = calls.find((c) => c.method === 'DELETE');
  assert.ok(del && del.path === '/operation-rules/11', 'the old rule was removed');
  assert.ok(calls.findIndex((c) => c.method === 'POST') < calls.findIndex((c) => c.method === 'DELETE'), 'added before removed');
});

// ── the page ──────────────────────────────────────────────────────────────
await check('page: one simple card — name, code, status, machine type, both times, flows as links; no facts strip, no cross links', async () => {
  reset(); await render('/testco/cf_erp/operations/1');
  const card = q('op-card');
  assert.ok(card, 'the card');
  assert.equal(text('op-name'), 'Plasma cut');
  assert.match(card.textContent, /CUT/);
  assert.equal(text('op-type-1'), 'Plasma');
  assert.equal(text('op-setup-1'), '12 min');
  assert.match(text('op-work-1'), /^2\.8 min per m/);
  const flows = q('op-flows');
  assert.match(flows.textContent, /Used in flows:\s*FLOWA\s*·\s*FLOWB/);
  assert.deepEqual([...flows.querySelectorAll('a')].map((a) => a.getAttribute('href')), ['/testco/cf_erp/flows/1', '/testco/cf_erp/flows/2']);
  const body = document.body.textContent;
  for (const gone of ['Machines that can', 'Timing rules', 'Step of', 'Machines and times']) assert.ok(!body.includes(gone), `"${gone}" is not on the page`);
});

await check('page: Advanced is folded by default — rules table, "Machines it reaches today" and "How long?" are not shown', async () => {
  assert.equal(q('advanced-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(q('advanced-body'), null);
  const body = document.body.textContent;
  assert.ok(!body.includes('Which machines, and how long') && !body.includes('Machines it reaches today') && !body.includes('How long?'));
});

await check('page: opening Advanced shows all three, is remembered on the next visit, and folding it is remembered too', async () => {
  await click(q('advanced-toggle'));
  assert.ok(q('advanced-body'));
  const body = q('advanced-body').textContent;
  assert.ok(body.includes('Which machines, and how long') && body.includes('Machines it reaches today') && body.includes('How long?'));
  assert.ok(body.includes('PL-01'), 'the machines table is filled');
  await render('/testco/cf_erp/operations/1');
  assert.ok(q('advanced-body'), 'still open on the next visit');
  await click(q('advanced-toggle'));
  await render('/testco/cf_erp/operations/1');
  assert.equal(q('advanced-body'), null, 'folded stays folded');
});

await check('page: a time on the card opens the same time dialog (setup and work)', async () => {
  await click(q('op-setup-1'));
  assert.ok(q('time-builder'));
  assert.equal(q('time-builder-title').textContent, 'Setup, per run');
  await render('/testco/cf_erp/operations/1');
  await click(q('op-work-1'));
  assert.equal(q('time-builder-title').textContent, 'Work, per piece');
});

await check('page: ?advanced=1 (from "+N more rules") opens Advanced, and the card says which rule it shows', async () => {
  reset(); await render('/testco/cf_erp/operations/3?advanced=1');
  assert.ok(q('advanced-body'), 'open');
  assert.match(text('op-more-rules'), /\+1 more rule in Advanced/);
  assert.equal(text('op-type-3'), 'SAW', 'the main rule is the machine-type one, not the single machine');
  const rows = q('advanced-body').textContent;
  assert.ok(rows.includes('SAW-01'), 'the per-machine rule is in the table');
});

await check('page: a name is renamed in place (Enter saves, PUT name only)', async () => {
  reset(); await render('/testco/cf_erp/operations/1');
  await click(q('op-name'));
  const input = q('op-name-input');
  assert.ok(input, 'an input');
  const set = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await React.act(async () => { set.call(input, 'Plasma cutting'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(0); });
  calls.length = 0;
  await React.act(async () => { input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(0); });
  await settle(60);
  const put = calls.find((c) => c.method === 'PUT');
  assert.ok(put && put.path === '/operations/1' && JSON.stringify(put.body) === '{"name":"Plasma cutting"}', JSON.stringify(calls));
});

await check('page: an operation with no rule shows "Set machine type" and no flows line text but "none yet"', async () => {
  reset(); await render('/testco/cf_erp/operations/2');
  assert.equal(text('op-type-2'), 'Set machine type');
  assert.match(text('op-flows'), /none yet/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
