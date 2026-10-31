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
await check('Structure & values: every line a group, with its marks and actions; one Add line with three choices right there', async () => {
  reset();
  await render(React.createElement(m.OrderStructureStep, { order: order([line(41, 1), line(42, 2, { quantity: 1 }), line(43, 3, { lineType: 'standard', item: { id: 9, code: 'PL-6', name: 'MS Plate', status: 'active', kind: 'catalog', uom: 'nos', revision: null }, structure: null })]), view: VIEW, onOrderSaved: () => {}, onChanged: () => {} }));
  const step = q1('structure-step');
  assert.match(text(step), /Structure & values/);
  assert.match(text(step), /All 3 lines of the order, each with its parts and values/);
  assert.ok(q1('line-group-1') && q1('line-group-2') && q1('line-group-3'), 'a group per line');
  assert.match(text(q1('line-group-1')), /Line 1.*Bridge span.*×3.*gets its code when the design is frozen/);
  assert.match(text(q1('line-group-1')), /206 rows/);
  assert.match(text(q1('line-group-1')), /3 values missing/);
  assert.ok(q1('add-line') && !q1('add-from-standard'), 'ONE Add line on the step (2026-10-18: three choices inside it)');
  assert.ok(q1('full-screen-toggle'), 'full screen on the step');
  assert.equal(calls('GET', '/order-lines/41/structure').length, 0, 'a folded group reads nothing');
  await click(q1('add-line'));
  let dlg = document.querySelector('[role="dialog"]');
  assert.ok(dlg && q1('add-choice-parts') && q1('add-choice-standard') && q1('add-choice-drawing'), 'the add dialog offers the three choices as cards');
  assert.match(text(dlg), /Build from parts.*From a standard drawing.*From a new drawing/);
  await click(q1('add-choice-standard'));
  dlg = document.querySelector('[role="dialog"]');
  assert.ok(dlg && /Drawing number/.test(text(dlg)), '"From a standard drawing" asks for the drawing number');
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

// ── 4. the execution plan (2026-11-01: three cards, batches, shipping folded away) ─────────────────────────────
const typeInto = async (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await React.act(async () => { setter.call(el, value); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(20); });
};
const checked = (el) => el?.getAttribute('aria-checked') === 'true';
// Line 1 (×3 spans) per Girder line: 4 a span = 12 pieces, in tree order.
const PIECES = [1, 2, 3].flatMap((u) => [1, 2, 3, 4].map((g) => ({ key: `L41U${u}A6094:${500 + g}#1`, label: `Bridge span ${u} · Girder line ${g}`, unitNo: u })));
const UNIT_PIECES = [1, 2, 3].map((u) => ({ key: `L41U${u}`, label: `Bridge span ${u}`, unitNo: u }));
const planPut = (extra = () => ({})) => (body) => {
  const b = typeof body === 'string' ? JSON.parse(body) : body;
  const lvl = b.production?.level;
  const pieces = lvl === 'assembly' ? PIECES : lvl === 'unit' ? UNIT_PIECES : [];
  const groups = (b.groups ?? []).filter((g) => g.keys.every((k) => k.startsWith('L41U')));
  const lines = [planLine(41, 1, { plan: { production: b.production, dispatch: b.dispatch }, pieces, piecesTotal: pieces.length, groups }), planLine(42, 2, { plan: { production: b.production, dispatch: b.dispatch }, pieces: [], groups: [] }),
    planLine(43, 3, { lineType: 'standard', made: false, levels: [], productionCount: 0, dispatchCount: null, item: { id: 9, code: 'PL-6', name: 'MS Plate' } })];
  const items = lvl === 'unit' ? ['SO260008 · Line 1 · Bridge span 1 of 3', 'SO260008 · Line 1 · Bridge span 2 of 3', 'SO260008 · Line 1 · Bridge span 3 of 3', 'SO260008 · Line 2 · Bridge span 1 of 1'] : ['SO260008 · Line 1 · Bridge span ×3'];
  return PLAN({ dryRun: !!b.dryRun, plan: { production: b.production, dispatch: b.dispatch, groups: b.groups ?? [] }, lines, preview: { production: part(items), dispatch: part(items), limit: 60 },
    saved: b.dryRun ? null : { at: '2026-10-18T10:00:00Z', by: { id: 1, name: 'Asha' } }, ...extra(b) });
};
await check('batch maths: sizes typed, equal batches, a click moves a piece, the PUT body carries the batches', () => {
  assert.deepEqual(m.parseSizes('4, 8'), [4, 8]);
  assert.deepEqual(m.parseSizes('4 8+2 x -1'), [4, 8, 2, 1], 'any separator; never throws');
  assert.deepEqual(m.parseSizes(''), []);
  const g = m.groupsFromSizes(PIECES, [4, 8]);
  assert.deepEqual(g.map((x) => x.keys.length), [4, 8]);
  assert.equal(g[0].keys[0], PIECES[0].key);
  assert.deepEqual(m.groupsFromSizes(PIECES, [5, 20, 3]).map((x) => x.keys.length), [5, 7], 'sizes past the pieces stop');
  assert.deepEqual(m.equalSizes(12, 5), [5, 5, 2]);
  assert.deepEqual(m.equalSizes(12, 0), []);
  // A click: batch 1 → batch 2; the last batch → a new one; alone in the last → on its own; on its own → batch 1.
  let gs = m.movePiece(g, PIECES[0].key, PIECES);
  assert.deepEqual(gs.map((x) => x.keys.length), [3, 9]);
  assert.equal(gs[1].keys[0], PIECES[0].key, 'kept in tree order');
  gs = m.movePiece(gs, PIECES[0].key, PIECES);
  assert.deepEqual(gs.map((x) => x.keys.length), [3, 8, 1], 'out of the last batch: a new batch');
  gs = m.movePiece(gs, PIECES[0].key, PIECES);
  assert.deepEqual(gs.map((x) => x.keys.length), [3, 8], 'alone in the last batch: back on its own');
  gs = m.movePiece(gs, PIECES[0].key, PIECES);
  assert.deepEqual(gs.map((x) => x.keys.length), [4, 8], 'on its own: into batch 1');
  assert.equal(m.sizesText(gs), '4, 8');
  const s = m.batchSummary(PIECES, m.groupsFromSizes(PIECES, [4]), 'Girder line');
  assert.deepEqual([s.batches[0].title, s.alone.length], ['Batch 1 — 4 Girder lines', 8]);
  assert.equal(m.plainLabel('Per sub-assembly: Girder line — 20 production orders'), 'Per Girder line — 20 production orders');
  assert.equal(m.plainLabel('As the order: Per line — 1 production order'), 'Same as the whole order: Per line — 1 production order');
  // The PUT body: a line following the order sends its batches at the top; a line of its own inside its own plan.
  const v = PLAN({ plan: { production: { level: 'assembly', levelId: 6094 }, dispatch: { level: 'same', levelId: null } } });
  const d = { ...m.draftOf(v), production: { level: 'assembly', levelId: 6094 }, groups: { 41: g, 42: [], 43: [] } };
  const body = m.inputOf(d, v, true);
  assert.deepEqual(body.groups.map((x) => x.keys.length), [4, 8]);
  const d2 = { ...d, own: { ...d.own, 41: { production: { level: 'unit', levelId: null }, dispatch: { level: 'same', levelId: null } } }, groups: { 41: [{ name: null, keys: ['L41U1', 'L41U3'] }] } };
  const body2 = m.inputOf(d2, v, true);
  assert.equal(body2.groups, undefined, 'no batches for the order (and none saved)');
  assert.deepEqual(body2.lines.find((l) => l.lineId === 41).own.groups, [{ name: null, keys: ['L41U1', 'L41U3'] }]);
  assert.equal(m.draftChanged(d, v), true, 'batches are a change');
});
await check('execution plan: three cards, the live preview, split per unit, shipping folded away, save', async () => {
  reset();
  globalThis.__routes['GET /orders/3/execution-plan'] = () => PLAN();
  globalThis.__routes['PUT /orders/3/execution-plan'] = planPut();
  let changed = 0;
  await render(React.createElement(m.ExecutionPlanPanel, { orderId: 3, onChanged: () => { changed += 1; } }));
  await settle(80);
  assert.ok(q1('execution-plan'), 'the panel');
  assert.ok(checked(q1('mode-line')), 'production defaults to one per line');
  assert.match(text(q1('mode-order')), /^All at once/);
  assert.match(text(q1('mode-split')), /^Split into batches/);
  assert.equal(q1('plan-templates'), null, 'no template buttons any more');
  assert.match(text(q1('plan-sentence')), /^This order will make 2 production orders: SO260008 · Line 1 · Bridge span ×3/);
  assert.match(text(q1('plan-saved')), /Not saved yet/);
  assert.match(text(q1('plan-saved')), /nesting will then run per production order/);
  assert.equal(q1('plan-save').disabled, false, 'the default can be saved as it is');
  assert.match(text(q1('execution-plan')), /Line 3: taken from stock/);
  await click(q1('mode-split')); await settle(500);
  assert.deepEqual(bodyOf(lastCall('PUT', '/orders/3/execution-plan')).production, { level: 'assembly', levelId: 6094 }, 'Split starts with the first level by its own name');
  assert.equal(bodyOf(lastCall('PUT', '/orders/3/execution-plan')).dryRun, true, 'a change asks for a dry run');
  assert.ok(checked(q1('mode-split')));
  assert.equal(text(q1('split-assembly-6094')), 'Each Girder line');
  assert.equal(text(q1('split-unit')), 'Each Bridge span', 'per unit by the item\'s name (a line has 3)');
  await click(q1('split-unit')); await settle(500);
  assert.deepEqual(bodyOf(lastCall('PUT', '/orders/3/execution-plan')).production, { level: 'unit', levelId: null });
  assert.equal(text(q1('preview-production-count')), '4 units');
  assert.match(text(q1('batches-line-1')), /Line 1 · Bridge span ×3 — 3 Bridge spans/);
  assert.equal(q1('preview-dispatch'), null, 'shipping is folded away');
  await click(q1('shipping-toggle')); await settle(40);
  assert.match(text(q1('shipping-why')), /Per line is not offered: a shipment cannot be bigger than a production order/);
  assert.ok(q1('preview-dispatch'), 'the dispatch preview inside');
  await click(q1('plan-save')); await settle(80);
  const savedBody = bodyOf(lastCall('PUT', '/orders/3/execution-plan'));
  assert.equal(savedBody.dryRun, undefined, 'the save is not a dry run');
  assert.deepEqual(savedBody.production, { level: 'unit', levelId: null });
  assert.equal(changed, 1, 'the order\'s stages are read again');
  assert.match(text(q1('plan-saved')), /Saved by Asha/);
});
await check('batches: type "4, 8", chips coloured by batch, a click moves a piece, equal batches, the rest, clear', async () => {
  reset();
  globalThis.__routes['GET /orders/3/execution-plan'] = () => PLAN();
  globalThis.__routes['PUT /orders/3/execution-plan'] = planPut();
  await render(React.createElement(m.ExecutionPlanPanel, { orderId: 3 }));
  await settle(80);
  await click(q1('mode-split')); await settle(500);
  assert.match(text(q1('batches-line-1')), /Line 1 · Bridge span ×3 — 12 Girder lines/);
  assert.match(text(q1('rest-1')), /No batches yet: all 12 — each becomes its own production order/);
  assert.match(text(q1('batches-line-2')), /Nothing to split on this line/, 'line 2 came back with no pieces');
  await typeInto(q1('sizes-1'), '4, 8'); await settle(40);
  assert.equal(byLabel(q1('pieces-1'), 'Bridge span 1 · Girder line 1: Batch 1') !== null, true, 'the first piece is in batch 1');
  assert.ok(byLabel(q1('pieces-1'), 'Bridge span 2 · Girder line 1: Batch 2'), 'the fifth in batch 2');
  assert.match(text(q1('batch-list-1')), /Batch 1 — 4 Girder lines: Bridge span 1 · Girder line 1, .*Batch 2 — 8 Girder lines/);
  assert.equal(q1('rest-1'), null, 'nothing left over');
  await settle(500);
  const body = bodyOf(lastCall('PUT', '/orders/3/execution-plan'));
  assert.deepEqual(body.groups.map((g) => g.keys.length), [4, 8], 'the dry run carries the batches');
  assert.deepEqual(body.groups[0].keys, PIECES.slice(0, 4).map((p) => p.key));
  // A click on the first piece: on to batch 2 — the sizes box follows.
  await click(q1('piece-1-0')); await settle(40);
  assert.ok(byLabel(q1('pieces-1'), 'Bridge span 1 · Girder line 1: Batch 2'));
  assert.equal(q1('sizes-1').value, '3, 9');
  // Equal batches of 5.
  await typeInto(q1('equal-size-1'), '5'); await click(q1('equal-1')); await settle(40);
  assert.equal(q1('sizes-1').value, '5, 5, 2');
  assert.match(text(q1('batch-list-1')), /Batch 3 — 2 Girder lines/);
  // Fewer than all: the rest stay on their own, and can go in one batch.
  await typeInto(q1('sizes-1'), '4,'); await settle(40);
  assert.equal(q1('sizes-1').value, '4,', 'typing is not rewritten under the cursor');
  assert.match(text(q1('rest-1')), /8 left over — each becomes its own production order/);
  await click(q1('rest-batch-1')); await settle(40);
  assert.equal(q1('sizes-1').value, '4, 8');
  await click(q1('clear-1')); await settle(40);
  assert.match(text(q1('rest-1')), /No batches yet: all 12/);
  assert.equal(q1('sizes-1').value, '');
  // Another level clears the batches (they were pieces of the old one).
  await typeInto(q1('sizes-1'), '6, 6'); await settle(500);
  await click(q1('split-unit')); await settle(500);
  assert.deepEqual(bodyOf(lastCall('PUT', '/orders/3/execution-plan')).groups ?? [], [], 'changing what it is split by clears the batches');
});
await check('batches: a problem from the server holds the save; a failed preview never throws', async () => {
  reset();
  globalThis.__routes['GET /orders/3/execution-plan'] = () => PLAN();
  globalThis.__routes['PUT /orders/3/execution-plan'] = planPut((b) => (b.groups?.length ? { problems: ['Line 1: Bridge span 1 · Girder line 1 is in Batch 1 and in Batch 2 — a piece goes in one batch only.'] } : {}));
  await render(React.createElement(m.ExecutionPlanPanel, { orderId: 3 }));
  await settle(80);
  await click(q1('mode-split')); await settle(500);
  await typeInto(q1('sizes-1'), '4, 8'); await settle(500);
  assert.match(text(q1('plan-problems')), /a piece goes in one batch only/);
  assert.equal(q1('plan-save').disabled, true);
  globalThis.__routes['PUT /orders/3/execution-plan'] = () => ({ __status: 500, body: { message: 'down' } });
  await typeInto(q1('sizes-1'), '3'); await settle(500);
  assert.ok(q1('plan-preview-error'), 'one quiet line');
  assert.ok(q1('execution-plan'), 'the panel stays');
});
await check('execution plan: a line its own way, picked in the folded table', async () => {
  reset();
  globalThis.__routes['GET /orders/3/execution-plan'] = () => PLAN();
  globalThis.__routes['PUT /orders/3/execution-plan'] = () => PLAN({ dryRun: true });
  await render(React.createElement(m.ExecutionPlanPanel, { orderId: 3 }));
  await settle(80);
  assert.equal(q1('plan-lines'), null, 'folded away');
  await click(q1('lines-toggle')); await settle(40);
  const sel = byLabel(q1('plan-line-1'), 'Line 1: production orders');
  await pick(sel, 'Per Girder line'); await settle(500);
  const body = bodyOf(lastCall('PUT', '/orders/3/execution-plan'));
  assert.deepEqual(body.lines.find((l) => l.lineId === 41).own, { production: { level: 'assembly', levelId: 6094 }, dispatch: { level: 'same', levelId: null } });
  assert.equal(body.lines.find((l) => l.lineId === 42).own, null, 'line 2 still follows the order');
  assert.match(text(q1('plan-line-3')), /Taken from stock/);
});
await check('execution plan: read only after the freeze, and a problem holds the save', async () => {
  reset();
  globalThis.__routes['GET /orders/3/execution-plan'] = () => PLAN({ editable: false, readOnlyReason: 'Every line is frozen, so the plan is fixed. A change needs a revision of the order.', lines: [planLine(41, 1, { frozen: true }), planLine(42, 2, { frozen: true })] });
  await render(React.createElement(m.ExecutionPlanPanel, { orderId: 3 }));
  await settle(80);
  assert.match(text(q1('execution-plan')), /Every line is frozen, so the plan is fixed/);
  assert.equal(q1('plan-save'), null, 'no save');
  assert.equal(q1('mode-split').disabled, true);
  await click(q1('lines-toggle')); await settle(40);
  assert.ok(byLabel(q1('plan-line-1'), 'Frozen'), 'the frozen line is marked');
  reset();
  globalThis.__routes['GET /orders/3/execution-plan'] = () => PLAN({ problems: ['Line 2 has no Girder line — choose another level for it.'] });
  await render(React.createElement(m.ExecutionPlanPanel, { orderId: 3 }));
  await settle(80);
  assert.match(text(q1('plan-problems')), /Line 2 has no Girder line/);
  assert.equal(q1('plan-save').disabled, true);
});

// ── 4b. nothing to choose, choose by result (2026-10-24) ─────────────────────
const opt = (key, label, more = {}) => {
  const [level, id] = key.split(':');
  return { key, choice: { level, levelId: id ? Number(id) : null }, name: label.split(' — ')[0], label, count: 1, problem: null, hidden: false, sameAs: null, ...more };
};
const OPTIONS = {
  production: {
    options: [opt('order', 'Whole order — 1 production order'), opt('line', 'Per line — 2 production orders', { count: 2 }),
      opt('unit', 'Per unit — 2 production orders (one per unit)', { count: 2, hidden: true, sameAs: 'line' }),
      opt('assembly:6094', 'Per sub-assembly: Girder line — 20 production orders (each Girder line + the rest)', { count: 20 })],
    note: 'Per unit gives the same here (every line is 1 unit).',
  },
  dispatch: {
    options: [opt('same', 'Same as production orders — 2 dispatch units', { count: 2 }), opt('line', 'Per line — 2 dispatch units', { count: 2, hidden: true, sameAs: 'same' }),
      opt('unit', 'Per unit — 2 dispatch units (one per unit)', { count: 2, hidden: true, sameAs: 'same' })],
    note: 'Per line gives the same here (it matches the production orders); Per unit gives the same here (every line is 1 unit).',
  },
};
const lineOpts = {
  production: { options: [opt('order', "Whole order — together with the order's other lines", { count: null }), opt('line', 'Per line — 1 production order'),
    opt('unit', 'Per unit — 1 production order', { hidden: true, sameAs: 'line' }), opt('assembly:6094', 'Per sub-assembly: Girder line — 5 production orders (each Girder line + the rest)', { count: 5 })],
  note: 'Per unit gives the same here (the line is 1 unit).', asOrder: 'As the order: Per line — 1 production order' },
  dispatch: { options: [opt('same', 'Same as production orders — 1 dispatch unit'), opt('line', 'Per line — 1 dispatch unit', { hidden: true, sameAs: 'same' })], note: null, asOrder: 'As the order: Same as production orders — 1 dispatch unit' },
};
const NOTHING = '1 production order, ships as 1 dispatch unit — nothing to choose for this order.';
await check('the words: visible options keep the chosen one; the line table only with more than one line; nothing-to-choose saved words', () => {
  assert.deepEqual(m.visibleOptions(OPTIONS.production, 'line').map((o) => o.key), ['order', 'line', 'assembly:6094']);
  assert.deepEqual(m.visibleOptions(OPTIONS.production, 'unit').map((o) => o.key), ['order', 'line', 'unit', 'assembly:6094'], 'the chosen option is never hidden');
  assert.equal(m.showsLineTable(PLAN()), true);
  assert.equal(m.showsLineTable(PLAN({ lines: [planLine(41, 1)] })), false);
  assert.match(m.savedWords(PLAN({ nothingToChoose: true })), /^Nothing to choose — the default is the plan/);
  assert.deepEqual(m.barOptions(PLAN(), 'production').options.map((o) => o.label), ['Whole order', 'Per line', 'Per unit', 'Per sub-assembly: Girder line', 'Per sub-assembly: Girder segment'], 'an older server: plain words');
});
await check('nothing to choose: one sentence and Change; Change opens the panel, with no per-line table for one line', async () => {
  reset();
  globalThis.__routes['GET /orders/3/execution-plan'] = () => PLAN({ nothingToChoose: true, summary: NOTHING, lines: [planLine(41, 1, { quantity: 1, levels: [] })], levels: [],
    options: { production: { options: [opt('order', 'Whole order — 1 production order', { hidden: true, sameAs: 'line' }), opt('line', 'Per line — 1 production order'), opt('unit', 'Per unit — 1 production order', { hidden: true, sameAs: 'line' })], note: 'Whole order gives the same here (the order has one line); Per unit gives the same here (the line is 1 unit).' },
      dispatch: { options: [opt('same', 'Same as production orders — 1 dispatch unit'), opt('line', 'Per line — 1 dispatch unit', { hidden: true }), opt('unit', 'Per unit — 1 dispatch unit', { hidden: true })], note: null } } });
  await render(React.createElement(m.ExecutionPlanPanel, { orderId: 3 }));
  await settle(80);
  assert.equal(text(q1('plan-nothing')), NOTHING);
  assert.equal(q1('mode-line'), null, 'no cards while collapsed');
  assert.equal(q1('plan-save'), null, 'nothing to save');
  await click(q1('plan-change')); await settle(40);
  assert.ok(q1('mode-line'), 'Change opens the panel');
  assert.match(text(q1('mode-line')), /One per line.*1 production order/);
  assert.equal(q1('mode-order'), null, 'All at once gives the same on one line: not offered');
  assert.equal(q1('mode-split').disabled, true, 'nothing to split by (one span, no levels)');
  assert.equal(q1('lines-toggle'), null, 'no per-line table for an order of one line');
  assert.match(text(q1('plan-saved')), /Nothing to choose — the default is the plan/);
});
await check('choose by result: the cards say what they make; the line selects and shipping read plainly; the chosen one always shows', async () => {
  reset();
  globalThis.__routes['GET /orders/3/execution-plan'] = () => PLAN({ nothingToChoose: false, summary: '2 production orders, ships as 2 dispatch units.', options: OPTIONS,
    lines: [planLine(41, 1, { options: lineOpts }), planLine(42, 2, { quantity: 1, options: lineOpts }), planLine(43, 3, { lineType: 'standard', made: false, levels: [], productionCount: 0, dispatchCount: null, options: null, item: { id: 9, code: 'PL-6', name: 'MS Plate' } })] });
  globalThis.__routes['PUT /orders/3/execution-plan'] = () => PLAN({ dryRun: true, options: OPTIONS });
  await render(React.createElement(m.ExecutionPlanPanel, { orderId: 3 }));
  await settle(80);
  assert.equal(q1('plan-nothing'), null, 'something to choose: the whole panel');
  assert.match(text(q1('mode-order')), /All at once.*1 production order$/);
  assert.match(text(q1('mode-line')), /One per line.*2 production orders$/);
  await click(q1('shipping-toggle')); await settle(40);
  assert.match(text(q1('shipping-toggle')), /Shipping: Same as production orders/);
  assert.match(text(q1('disp-note')), /^Per line gives the same here \(it matches the production orders\)/);
  await click(q1('lines-toggle')); await settle(40);
  assert.ok(q1('plan-lines'), 'the per-line table with three lines');
  // A line's select: "Same as the whole order" says what it gives; its Per unit (the line is 1 unit) is hidden.
  const sel = byLabel(q1('plan-line-2'), 'Line 2: production orders');
  const btn = sel.closest('.MuiInputBase-root').querySelector('[role="combobox"], [role="button"]');
  await fire(btn, 'mousedown', { button: 0 }); await settle();
  const opts = [...document.querySelectorAll('[role="option"]')].map(text);
  assert.deepEqual(opts, ['Same as the whole order: Per line — 1 production order', "Whole order — together with the order's other lines", 'Per line — 1 production order', 'Per Girder line — 5 production orders (each Girder line + the rest)']);
  await click([...document.querySelectorAll('[role="option"]')].find((o) => text(o).startsWith('Per Girder line'))); await settle(500);
  assert.deepEqual(bodyOf(lastCall('PUT', '/orders/3/execution-plan')).lines.find((l) => l.lineId === 42).own.production, { level: 'assembly', levelId: 6094 });
  // The saved choice stays visible though it would be folded in.
  reset();
  globalThis.__routes['GET /orders/3/execution-plan'] = () => PLAN({ plan: { production: { level: 'unit', levelId: null }, dispatch: { level: 'same', levelId: null } }, options: OPTIONS });
  await render(React.createElement(m.ExecutionPlanPanel, { orderId: 3 }));
  await settle(80);
  assert.ok(checked(q1('mode-split')), 'per unit is a split');
  assert.ok(q1('split-unit') && q1('split-unit').getAttribute('aria-pressed') === 'true', 'the chosen Each Bridge span shows, pressed');
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
