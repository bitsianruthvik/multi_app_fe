// Run from multi_app_fe: node scripts/cf_erp_so_restructure_test.mjs
// The sales order's steps, restructured (step 2 of the redesign, user 2026-10-18; TM/CF_ERP_ORDER_FLOW_PLAN.md
// "2026-10-18 — Sales order steps v2"): Structure & values is ONE step for the whole order (every line a group,
// add / move / remove lines right there, a standard drawing too, full screen), then the EXECUTION PLAN (production
// order level, dispatch level, a live preview from a dry run, save; read only after the freeze). The stage tabs show
// the order's roll-up on an order-wide step and keep the "Working on" picker for the per-line steps only.
// The real components in jsdom against mocked routes shaped as the backend answers.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/orders/3', pretendToBeVisual: true });
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
dom.window.HTMLElement.prototype.scrollTo = function scrollTo() {};
globalThis.CSS = globalThis.CSS ?? { escape: (s) => String(s) };

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
      export { OrderStructureStep } from './src/apps/cf_erp/components/OrderStructure/OrderStructureStep';
      export { ExecutionPlanPanel } from './src/apps/cf_erp/components/OrderStructure/ExecutionPlanPanel';
      export { OrderStageTabs } from './src/apps/cf_erp/components/OrderProcess/StageTabs';
      export { StageBody } from './src/apps/cf_erp/components/OrderProcess/StageBody';
      export * from './src/apps/cf_erp/lib/process';
      export * from './src/apps/cf_erp/lib/executionPlan';
      export * from './src/apps/cf_erp/lib/orderStructure';
      export { movedLine } from './src/apps/cf_erp/api/orderStructure';`,
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
const artifact = resolve(cache, `so-restructure-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { if (process.env.ONLY && !label.includes(process.env.ONLY)) return; try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const app = document.getElementById('app');
let root = null;
const render = async (el, at = '/testco/cf_erp/orders/3') => {
  if (root) { await React.act(async () => { root.unmount(); }); root = null; }
  document.querySelectorAll('.MuiDialog-root, .MuiPopover-root, .MuiPopper-root, .MuiMenu-root').forEach((n) => n.remove());
  app.replaceChildren();
  const host = document.createElement('div'); app.appendChild(host);
  root = createRoot(host);
  await React.act(async () => { root.render(React.createElement(MemoryRouter, { initialEntries: [at] }, el)); await sleep(40); });
};
const settle = async (ms = 50) => { await React.act(async () => { await sleep(ms); }); };
const q1 = (id, scope = document) => scope.querySelector(`[data-testid="${id}"]`);
const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const fire = async (el, type, init = {}) => { await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, ...init })); await sleep(20); }); };
const click = (el) => fire(el, 'click');
const byLabel = (scope, label) => scope.querySelector(`[aria-label="${label}"]`);
const calls = (method, path) => globalThis.__calls.filter((c) => c.method === method && c.path === path);
const lastCall = (method, path) => calls(method, path).at(-1);
const bodyOf = (c) => (typeof c?.body === 'string' ? JSON.parse(c.body) : c?.body);
const reset = ({ open = [] } = {}) => {
  globalThis.__calls = []; globalThis.__routes = {}; globalThis.__user = null;
  try { window.localStorage.clear(); window.localStorage.setItem('cf_erp.so.groups.3', JSON.stringify({ open, known: [41, 42, 43] })); } catch { /* none */ }
};
const pick = async (selectInput, optionText) => {
  // MUI select: open with mousedown on its button, then click the option.
  const btn = selectInput.closest('.MuiInputBase-root').querySelector('[role="combobox"], [role="button"]');
  await fire(btn, 'mousedown', { button: 0 }); await settle();
  const opt = [...document.querySelectorAll('[role="option"]')].find((o) => text(o) === optionText || text(o).startsWith(optionText));
  if (!opt) throw new Error(`no option "${optionText}" — ${[...document.querySelectorAll('[role="option"]')].map(text).join(' | ')}`);
  await click(opt); await settle();
};

// ── fixtures, shaped as the backend answers ───────────────────────────────────
const line = (id, lineNo, more = {}) => ({
  id, lineNo, lineType: 'custom', position: lineNo, quantity: 3, committedDate: null, description: null, notes: null, rate: null, rateBasis: 'tonne',
  item: { id: 1000 + id, code: null, name: 'Bridge span', status: 'draft', kind: 'temporary', uom: 'nos', revision: null },
  design: { id: 6095, code: 'SPAN', name: 'Bridge span' }, bomRevision: null, bom: null, structure: { temporaryItems: 206, unresolvedSelections: 0 },
  release: null, revisesLineId: null, standard: null, ...more,
});
const order = (lines) => ({
  id: 3, code: 'SO260008', orderType: 'customer', title: 't', customer: { id: 1, code: 'C', name: 'Cust' }, customerReference: null, status: 'inquiry',
  receivedOn: null, committedDate: null, confirmedAt: null, deliveryAddress: null, notes: null, overdue: false, allowedTransitions: ['confirmed'], createdAt: '', updatedAt: '',
  lines, revision: 1, total: null,
});
const stage = (stageKey, label, state, more = {}) => ({ stageKey, label, sequence: 1, requirement: 'required', applies: true, decidedBy: 'data', state, detail: `${label} detail`, blockers: [], waitingOn: null, ...more });
const ROLL = [
  stage('structure', 'Structure & values', 'done', { scope: 'order' }),
  stage('values', 'Values', 'partial', { scope: 'order', shownIn: 'structure', detail: '3 values missing — X, Y' }),
  stage('execution_plan', 'Execution plan', 'todo', { scope: 'order' }),
  stage('lock', 'Freeze design', 'todo'),
  stage('nesting', 'Nesting', 'todo'),
  stage('buying', 'Material request', 'todo', { scope: 'order' }),
  stage('production', 'Production', 'todo'),
];
const lineStages = (lockState) => ROLL.map((s) => (s.stageKey === 'lock' ? { ...s, state: lockState, detail: `line lock ${lockState}` } : s));
const VIEW = {
  order: { id: 3, code: 'SO260008', status: 'inquiry' }, process: { id: 9, code: 'PRC', name: 'Sales order', status: 'active' }, reason: null,
  lines: [{ lineId: 41, lineNo: 1, item: null, quantity: 3, stages: lineStages('done') }, { lineId: 42, lineNo: 2, item: null, quantity: 1, stages: lineStages('partial') }],
  stages: ROLL, nextStage: 'values', blockers: [],
};
const LEVELS = [{ id: 6094, name: 'Girder line', depth: 1, perUnit: 4 }, { id: 6090, name: 'Girder segment', depth: 2, perUnit: 20 }];
const planLine = (lineId, lineNo, more = {}) => ({
  lineId, lineNo, lineType: 'custom', quantity: lineNo === 1 ? 3 : 1, item: { id: 1000 + lineId, code: null, name: 'Bridge span' }, frozen: false, released: false, made: true,
  own: null, plan: { production: { level: 'line', levelId: null }, dispatch: { level: 'same', levelId: null } }, source: 'default', words: 'One production order for the line, dispatched the same way',
  levels: LEVELS, rows: 206, productionCount: 1, dispatchCount: 1, problems: [], ...more,
});
const part = (items, count = items.length) => ({ count, items, more: Math.max(0, count - items.length), sentence: `This order will make ${count} production orders: ${items.slice(0, 3).join(', ')}.` });
const PLAN = (more = {}) => ({
  order: { id: 3, code: 'SO260008', status: 'inquiry' }, dryRun: false, editable: true, readOnlyReason: null, saved: null,
  plan: { production: { level: 'line', levelId: null }, dispatch: { level: 'same', levelId: null } }, planWords: 'x',
  defaults: { production: { level: 'line', levelId: null }, dispatch: { level: 'same', levelId: null } },
  lines: [planLine(41, 1), planLine(42, 2), planLine(43, 3, { lineType: 'standard', made: false, levels: [], productionCount: 0, dispatchCount: null, item: { id: 9, code: 'PL-6', name: 'MS Plate' } })],
  levels: [{ id: 6094, name: 'Girder line', depth: 1, lineNos: [1, 2], onEveryLine: true }, { id: 6090, name: 'Girder segment', depth: 2, lineNos: [1, 2], onEveryLine: true }],
  templates: [{ key: 'per_line', label: 'One per line (usual)', plan: { production: { level: 'line', levelId: null }, dispatch: { level: 'same', levelId: null } } },
    { key: 'per_6094', label: 'One per Girder line', plan: { production: { level: 'assembly', levelId: 6094 }, dispatch: { level: 'same', levelId: null } } }],
  preview: { production: part(['SO260008 · Line 1 · Bridge span ×3', 'SO260008 · Line 2 · Bridge span ×1']), dispatch: { ...part(['SO260008 · Line 1 · Bridge span ×3', 'SO260008 · Line 2 · Bridge span ×1']), sentence: 'It will ship in 2 dispatch units.' }, limit: 60 },
  problems: [], note: 'Nothing is built from this plan yet. Production orders are made from it in a later step, and nesting will then run per production order.',
  ...more,
});

// ── 1. the words and the model ───────────────────────────────────────────────
await check('order-wide vs per-line steps; an old ?tab=lines lands on Structure & values', () => {
  assert.equal(m.isOrderWide({ stageKey: 'structure', scope: 'order' }), true);
  assert.equal(m.isOrderWide({ stageKey: 'lock', scope: undefined }), false);
  assert.equal(m.isOrderWide({ stageKey: 'execution_plan' }), true, 'an API without scope: the FE set says so');
  assert.equal(m.isOrderWide({ stageKey: 'nesting', scope: null }), false);
  assert.equal(m.tabAlias('lines'), 'structure');
  assert.equal(m.tabAlias('nesting'), 'nesting');
  assert.equal(m.tabAlias('ordervalues'), 'structure', 'the Order values tab is gone: its links land on step 1');
  assert.equal(m.withOrderValuesOpen(new URLSearchParams('tab=ordervalues&x=1')).toString(), 'tab=structure&x=1&orderValues=1');
  assert.match(m.WORKING_ON_HELP, /Freeze design, Nesting and Production are done one line at a time/);
});
await check('stagesShown: the roll-up on an order-wide step; the line\'s own for per-line steps only', () => {
  const ln = VIEW.lines[1];
  assert.deepEqual(m.stagesShown(ROLL, ln, false).map((s) => s.state), ROLL.map((s) => s.state));
  const per = m.stagesShown(ROLL, ln, true);
  assert.equal(per.find((s) => s.stageKey === 'lock').detail, 'line lock partial');
  assert.equal(per.find((s) => s.stageKey === 'execution_plan'), ROLL.find((s) => s.stageKey === 'execution_plan'), 'order-wide stays the roll-up');
  assert.deepEqual(m.tabStages(ROLL).map((s) => s.stageKey), ['structure', 'execution_plan', 'lock', 'nesting', 'buying', 'production'], 'Values is a check on Structure & values');
});
await check('execution plan words: choices encoded, the PUT body, what changed, coarser dispatch', () => {
  assert.equal(m.encodeChoice({ level: 'assembly', levelId: 6094 }), 'assembly:6094');
  assert.deepEqual(m.decodeChoice('assembly:6094'), { level: 'assembly', levelId: 6094 });
  assert.deepEqual(m.decodeChoice('unit'), { level: 'unit', levelId: null });
  assert.equal(m.dispatchTooBig('unit', 'line'), true);
  assert.equal(m.dispatchTooBig('line', 'unit'), false);
  assert.equal(m.dispatchTooBig('assembly', 'same'), false);
  const v = PLAN();
  const d = m.draftOf(v);
  assert.equal(m.draftChanged(d, v), false);
  const d2 = { ...d, production: { level: 'unit', levelId: null } };
  assert.equal(m.draftChanged(d2, v), true);
  assert.deepEqual(m.inputOf(d2, v, true), { production: { level: 'unit', levelId: null }, dispatch: { level: 'same', levelId: null }, lines: [{ lineId: 41, own: null }, { lineId: 42, own: null }], dryRun: true },
    'frozen lines and the stock line are not sent');
  assert.equal(m.lineCountWords({ made: false, plan: v.lines[0].plan, productionCount: 0 }), 'None — from stock');
  assert.match(m.savedWords(v), /^Not saved yet/);
  assert.equal(m.savedWords({ ...v, saved: { at: '2026-10-18T10:00:00Z', by: { id: 1, name: 'Asha' } } }).startsWith('Saved by Asha on'), true);
});
await check('a line group\'s marks: rows, values missing, frozen', () => {
  const marks = m.lineGroupWords({ ...line(41, 1), lock: { lockedAt: 'x' } }, lineStages('done'));
  assert.deepEqual(marks.map((x) => x.label), ['Frozen', '206 rows', '3 values missing']);
  assert.deepEqual(m.movedLine([41, 42, 43], 2, -1), [41, 43, 42]);
  assert.deepEqual(m.movedLine([41, 42, 43], 0, -1), [41, 42, 43]);
  assert.equal(m.openGroupsAtStart([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]).size, 1, 'a big order opens with its first line');
});

// ── 2. the stage tabs ───────────────────────────────────────────────────────
await check('tabs: no Line items, Structure & values first, Execution plan second; the picker only on a per-line step', async () => {
  reset();
  const props = { process: VIEW.process, lines: VIEW.lines, stages: m.tabStages(ROLL), line: VIEW.lines[0], nextKey: 'structure', active: 'structure', onTab: () => {}, onPickLine: () => {}, reference: [{ value: 'details', label: 'Details' }], checksFor: (k) => m.checksOn(k, ROLL) };
  await render(React.createElement(m.OrderStageTabs, { ...props, showPicker: false }));
  const tabs = [...document.querySelectorAll('[role="tab"]')].map((t) => t.getAttribute('data-tab'));
  assert.deepEqual(tabs, ['structure', 'execution_plan', 'lock', 'nesting', 'buying', 'production', 'details']);
  assert.ok(!/Working on/.test(text(app)), 'no line picker on an order-wide step');
  assert.ok(!/Line items/.test(text(app)));
  await render(React.createElement(m.OrderStageTabs, { ...props, active: 'lock', showPicker: true }));
  assert.match(text(app), /Working on/);
});

// ── 3. Structure & values ────────────────────────────────────────────────────
await check('Structure & values: every line a group, with its marks and actions; add from a standard drawing right there', async () => {
  reset();
  await render(React.createElement(m.OrderStructureStep, { order: order([line(41, 1), line(42, 2, { quantity: 1 }), line(43, 3, { lineType: 'standard', item: { id: 9, code: 'PL-6', name: 'MS Plate', status: 'active', kind: 'catalog', uom: 'nos', revision: null }, structure: null })]), view: VIEW, onOrderSaved: () => {}, onChanged: () => {} }));
  const step = q1('structure-step');
  assert.match(text(step), /Structure & values/);
  assert.match(text(step), /All 3 lines of the order, each with its parts and values/);
  assert.ok(q1('line-group-1') && q1('line-group-2') && q1('line-group-3'), 'a group per line');
  assert.match(text(q1('line-group-1')), /Line 1.*Bridge span.*×3.*gets its code when the design is frozen/);
  assert.match(text(q1('line-group-1')), /206 rows/);
  assert.match(text(q1('line-group-1')), /3 values missing/);
  assert.ok(q1('add-line') && q1('add-from-standard'), 'Add line and From a standard drawing, on the step itself');
  assert.ok(q1('full-screen-toggle'), 'full screen on the step');
  assert.equal(calls('GET', '/order-lines/41/structure').length, 0, 'a folded group reads nothing');
  await click(q1('add-from-standard'));
  const dlg = document.querySelector('[role="dialog"]');
  assert.ok(dlg && /Drawing number/.test(text(dlg)), 'the add dialog opens straight on "From a standard drawing"');
});
await check('lines move up and down right there; a frozen line keeps its number', async () => {
  reset();
  let saved = null;
  globalThis.__routes['PUT /orders/3/line-order'] = (body) => { const b = typeof body === 'string' ? JSON.parse(body) : body; return order(b.lineIds.map((id, i) => line(id, i + 1))); };
  await render(React.createElement(m.OrderStructureStep, { order: order([line(41, 1), line(42, 2), line(43, 3)]), view: VIEW, onOrderSaved: (o) => { saved = o; }, onChanged: () => {} }));
  await click(byLabel(app, 'Move line 3 up'));
  assert.deepEqual(bodyOf(lastCall('PUT', '/orders/3/line-order')), { lineIds: [41, 43, 42] });
  assert.deepEqual(saved.lines.map((l) => l.id), [41, 43, 42], 'the order that came back is shown');
  reset();
  await render(React.createElement(m.OrderStructureStep, { order: order([line(41, 1, { lock: { lockedAt: 'x', position: 1 } }), line(42, 2), line(43, 3)]), view: VIEW, onOrderSaved: () => {}, onChanged: () => {} }));
  assert.equal(byLabel(app, 'Move line 2 up').disabled, true, 'moving above a frozen line would renumber it');
  assert.equal(byLabel(app, 'Move line 3 up').disabled, false);
  assert.equal(byLabel(app, 'Remove line 1'), null, 'a frozen line cannot be removed');
  assert.match(text(q1('line-group-1')), /Frozen/);
  reset();
  await render(React.createElement(m.OrderStructureStep, { order: order([line(41, 1), line(42, 2, { structure: { temporaryItems: 206, unresolvedSelections: 0, cutPieces: 12 } }), line(43, 3)]), view: VIEW, onOrderSaved: () => {}, onChanged: () => {} }));
  assert.equal(byLabel(app, 'Move line 2 up').disabled, true, 'a line with cut pieces keeps its number');
  assert.equal(byLabel(app, 'Move line 3 up').disabled, true, 'so nothing swaps with it');
  assert.equal(m.fixedNumberWhy({ lineNo: 2, release: null, structure: { temporaryItems: 1, unresolvedSelections: 0, cutPieces: 3 } }, false), 'Line 2 cannot move: its cut pieces carry its line number.');
});
await check('an old link to the Order values tab opens step 1 with the order values open', async () => {
  reset();
  globalThis.__routes['GET /orders/3/spec-defaults'] = () => ({ __status: 500, body: { message: 'not in this test' } });
  await render(React.createElement(m.OrderStructureStep, { order: order([line(41, 1)]), view: VIEW, onOrderSaved: () => {}, onChanged: () => {} }), '/testco/cf_erp/orders/3?tab=structure&orderValues=1');
  assert.equal(q1('order-values-toggle').getAttribute('aria-expanded'), 'true');
  await render(React.createElement(m.OrderStructureStep, { order: order([line(41, 1)]), view: VIEW, onOrderSaved: () => {}, onChanged: () => {} }));
  assert.equal(q1('order-values-toggle').getAttribute('aria-expanded'), 'false', 'folded otherwise');
});
await check('a line group opens (and the line\'s grid is read); full screen fills the window', async () => {
  reset({ open: [] });
  globalThis.__routes['GET /order-lines/41/structure'] = () => ({ __status: 500, body: { message: 'not in this test' } });
  await render(React.createElement(m.OrderStructureStep, { order: order([line(41, 1), line(42, 2)]), view: VIEW, onOrderSaved: () => {}, onChanged: () => {} }));
  await click(q1('line-toggle-1')); await settle(60);
  assert.ok(calls('GET', '/order-lines/41/structure').length >= 1, 'opening a group reads that line\'s structure');
  assert.equal(calls('GET', '/order-lines/42/structure').length, 0, 'the folded one is not read');
  await click(q1('full-screen-toggle'));
  assert.ok(q1('full-screen-frame'), 'full screen');
});

// ── 4. the execution plan ───────────────────────────────────────────────────
await check('execution plan: prefilled with the usual, the live preview, a template, save', async () => {
  reset();
  globalThis.__routes['GET /orders/3/execution-plan'] = () => PLAN();
  globalThis.__routes['PUT /orders/3/execution-plan'] = (body) => {
    const b = typeof body === 'string' ? JSON.parse(body) : body;
    const unit = b.production?.level === 'unit';
    const items = unit ? ['SO260008 · Line 1 · Bridge span 1 of 3', 'SO260008 · Line 1 · Bridge span 2 of 3', 'SO260008 · Line 1 · Bridge span 3 of 3', 'SO260008 · Line 2 · Bridge span 1 of 1'] : ['SO260008 · Line 1 · Bridge span ×3'];
    return PLAN({ dryRun: !!b.dryRun, plan: { production: b.production, dispatch: b.dispatch }, preview: { production: part(items), dispatch: part(items), limit: 60 }, saved: b.dryRun ? null : { at: '2026-10-18T10:00:00Z', by: { id: 1, name: 'Asha' } } });
  };
  let changed = 0;
  await render(React.createElement(m.ExecutionPlanPanel, { orderId: 3, onChanged: () => { changed += 1; } }));
  await settle(80);
  const panel = q1('execution-plan');
  assert.ok(panel, 'the panel');
  assert.equal(q1('prod-line').getAttribute('aria-pressed'), 'true', 'production defaults to per line');
  assert.equal(q1('disp-same').getAttribute('aria-pressed'), 'true', 'dispatch defaults to the same');
  assert.match(text(q1('plan-sentence')), /^This order will make 2 production orders: SO260008 · Line 1 · Bridge span ×3/);
  assert.match(text(q1('plan-line-3')), /Taken from stock/);
  assert.match(text(q1('plan-saved')), /Not saved yet/);
  assert.match(text(q1('plan-saved')), /nesting will then run per production order/);
  assert.equal(q1('plan-save').disabled, false, 'the default can be saved as it is');
  await click(q1('prod-unit')); await settle(400);
  const dry = bodyOf(lastCall('PUT', '/orders/3/execution-plan'));
  assert.equal(dry.dryRun, true, 'a change asks for a dry run');
  assert.deepEqual(dry.production, { level: 'unit', levelId: null });
  assert.equal(text(q1('preview-production-count')), '4 units');
  assert.match(text(q1('preview-production')), /Bridge span 2 of 3/);
  assert.equal(q1('disp-line').disabled, true, 'dispatch per line would be bigger than a production order per unit');
  await click(q1('plan-save')); await settle(80);
  const savedBody = bodyOf(lastCall('PUT', '/orders/3/execution-plan'));
  assert.equal(savedBody.dryRun, undefined, 'the save is not a dry run');
  assert.deepEqual(savedBody.production, { level: 'unit', levelId: null });
  assert.equal(changed, 1, 'the order\'s stages are read again');
  assert.match(text(q1('plan-saved')), /Saved by Asha/);
  // A template sets the order's choice in one click.
  await click([...q1('plan-templates').querySelectorAll('button')].find((b) => text(b) === 'One per Girder line')); await settle(400);
  assert.deepEqual(bodyOf(lastCall('PUT', '/orders/3/execution-plan')).production, { level: 'assembly', levelId: 6094 });
});
await check('execution plan: a line its own way, picked in the grid', async () => {
  reset();
  globalThis.__routes['GET /orders/3/execution-plan'] = () => PLAN();
  globalThis.__routes['PUT /orders/3/execution-plan'] = () => PLAN({ dryRun: true });
  await render(React.createElement(m.ExecutionPlanPanel, { orderId: 3 }));
  await settle(80);
  const sel = byLabel(q1('plan-line-1'), 'Line 1: production orders');
  await pick(sel, 'Per Girder line'); await settle(400);
  const body = bodyOf(lastCall('PUT', '/orders/3/execution-plan'));
  assert.deepEqual(body.lines.find((l) => l.lineId === 41).own, { production: { level: 'assembly', levelId: 6094 }, dispatch: { level: 'same', levelId: null } });
  assert.equal(body.lines.find((l) => l.lineId === 42).own, null, 'line 2 still follows the order');
});
await check('execution plan: read only after the freeze, and a problem holds the save', async () => {
  reset();
  globalThis.__routes['GET /orders/3/execution-plan'] = () => PLAN({ editable: false, readOnlyReason: 'Every line is frozen, so the plan is fixed. A change needs a revision of the order.', lines: [planLine(41, 1, { frozen: true }), planLine(42, 2, { frozen: true })] });
  await render(React.createElement(m.ExecutionPlanPanel, { orderId: 3 }));
  await settle(80);
  assert.match(text(q1('execution-plan')), /Every line is frozen, so the plan is fixed/);
  assert.equal(q1('plan-save'), null, 'no save');
  assert.equal(q1('prod-unit').disabled, true);
  assert.ok(byLabel(q1('plan-line-1'), 'Frozen'), 'the frozen line is marked');
  reset();
  globalThis.__routes['GET /orders/3/execution-plan'] = () => PLAN({ problems: ['Line 2 has no Girder line — choose another level for it.'] });
  await render(React.createElement(m.ExecutionPlanPanel, { orderId: 3 }));
  await settle(80);
  assert.match(text(q1('plan-problems')), /Line 2 has no Girder line/);
  assert.equal(q1('plan-save').disabled, true);
});

// ── 5. the stage bodies ─────────────────────────────────────────────────────
await check('StageBody: Structure & values is the whole-order step; Execution plan its own screen', async () => {
  reset();
  globalThis.__routes['GET /orders/3/execution-plan'] = () => PLAN();
  const common = { view: VIEW, line: VIEW.lines[0], order: order([line(41, 1), line(42, 2)]), production: null, productionError: null, onPickLine: () => {}, onOrderSaved: () => {}, onReleaseChanged: () => {}, onReloadAll: () => {}, onGoStage: () => {} };
  await render(React.createElement(m.StageBody, { ...common, stage: ROLL[0] }));
  assert.ok(q1('structure-step'), 'Structure & values');
  assert.ok(q1('line-group-1') && q1('line-group-2'), 'both lines on it — no line picked');
  await render(React.createElement(m.StageBody, { ...common, stage: ROLL[2] }));
  await settle(80);
  assert.ok(q1('execution-plan'), 'Execution plan');
});

if (root) await React.act(async () => { root.unmount(); });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
