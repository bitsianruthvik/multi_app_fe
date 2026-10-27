// Run from multi_app_fe: node scripts/cf_erp_acceptance_test.mjs
// STEP 3A (backend init.sql §73; TM/CF_ERP_ORDER_FLOW_PLAN.md "2026-10-18 — Step 3A"), rendered in jsdom against mocked
// routes shaped like the backend's answers (multi_app_be/scripts/cf_kepl/acceptance_test.mjs):
//   the Customer acceptance step (grids prefilled from templates, the live check + estimate, the MR as PDF / Excel, send →
//   pending, locked after approval → a rate change), the Management inbox (only your kinds; context: charges, milestones,
//   stages, value; a PO's lines with the other quotes; approve, send back with a reason), the Orders board (lanes; the
//   post-production checklist ticked with a date and a note), Setup › Templates, the menu, and the old Confirm gone.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/orders/9001', pretendToBeVisual: true });
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
      export * from './src/apps/cf_erp/lib/acceptance';
      export * as AA from './src/apps/cf_erp/api/acceptance';
      export * as AP from './src/apps/cf_erp/api/approvals';
      export { AcceptanceStep } from './src/apps/cf_erp/components/Acceptance/AcceptanceStep';
      export { default as Approvals } from './src/apps/cf_erp/pages/Approvals';
      export { default as OrdersBoard } from './src/apps/cf_erp/pages/OrdersBoard';
      export { default as TermTemplates } from './src/apps/cf_erp/pages/TermTemplates';
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
const artifact = resolve(cache, `acceptance-test-${process.pid}.mjs`);
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
const mount = async (el, url = '/testco/cf_erp/orders/9001', path = '*') => {
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

// ── fixtures, as the backend answers (acceptance_test.mjs) ───────────────────────────────────────
const LISTS = {
  operations: [{ id: 11, code: 'FAB', name: 'Fabrication' }, { id: 12, code: 'PNT', name: 'Painting' }],
  formulaFields: [{ code: 'SURFACE_AREA', name: 'Surface area', dataType: 'number', unit: 'm2' }, { code: 'COATS', name: 'Coats', dataType: 'number', unit: null }],
  triggers: [['order_accepted', 'Order accepted (approved)'], ['design_frozen', 'Design frozen'], ['material_in_place', 'Material in place (all MR material locked or received)', true],
    ['customer_material_received', 'Customer material received', true], ['production_started', 'Production started'], ['operation_completed', 'Operation completed', true], ['dispatched', 'Dispatched'],
    ['fully_dispatched', 'Fully dispatched'], ['post_stage', 'Post-production stage done'], ['days_after', 'N days after'], ['fixed_date', 'Fixed date'], ['retention', 'Retention (released N months after a milestone)']]
    .map(([key, label, proRata]) => ({ key, label, proRata: !!proRata, needs: [] })),
  afterTriggers: ['order_accepted', 'design_frozen', 'material_in_place', 'customer_material_received', 'production_started', 'operation_completed', 'dispatched', 'fully_dispatched', 'post_stage'],
  dispatchModes: { each: 'Each dispatch separately (pro-rata per dispatch unit)', all: 'When everything is dispatched' },
  billing: { pro_rata: 'Pro-rata', on_completion: 'On completion' }, weightSources: { drawing: 'As per drawing', actual: 'Actual weight' },
};
const TERMS = {
  charges: [
    { key: 'fab', label: 'Fabrication', operationId: 11, basis: { type: 'weight', weight: 'drawing' }, rate: 45000, billing: 'pro_rata' },
    { key: 'pnt', label: 'Painting', operationId: 12, basis: { type: 'formula', expression: 'SURFACE_AREA * COATS', unit: 'm2' }, rate: 120, billing: 'on_completion' },
  ],
  material: { rate: 70000, weight: 'drawing' },
  lumpSums: [{ key: 'tr', label: 'Transport', amount: 50000 }],
  milestones: [
    { key: 'm1', label: 'Advance', kind: 'percent', value: 10, trigger: { type: 'order_accepted' }, proRata: false, creditDays: 0 },
    { key: 'm2', label: 'On dispatch', kind: 'percent', value: 80, trigger: { type: 'dispatched', mode: 'each' }, proRata: true, creditDays: 30 },
    { key: 'm3', label: 'After inspection', kind: 'percent', value: 10, trigger: { type: 'post_stage', stageKey: 's1' }, proRata: false, creditDays: 30 },
  ],
  stages: [{ key: 's1', name: 'Inspection by RITES' }, { key: 's2', name: 'Erection at site' }],
};
const EST = (value = 515760) => ({
  tonnes: 4, ourTonnes: 4, unweighedLines: [], value, materialCost: 200000, materialCostNote: 'The MR materials at the last price paid.', marginOverMaterial: value - 200000, marginPct: 61.22,
  charges: [{ key: 'fab', label: 'Fabrication', operation: 'Fabrication', quantity: 4, unit: 't', rate: 45000, amount: 180000, note: null }, { key: 'pnt', label: 'Painting', operation: 'Painting', quantity: 48, unit: 'm2', rate: 120, amount: 5760, note: '12 part rows' }],
  material: { quantity: 4, unit: 't', rate: 70000, amount: 280000 }, lumpSums: [{ key: 'tr', label: 'Transport', amount: 50000 }],
  milestones: [{ key: 'm1', label: 'Advance', amount: value * 0.1 }, { key: 'm2', label: 'On dispatch', amount: value * 0.8 }, { key: 'm3', label: 'After inspection', amount: value * 0.1 }], milestonesTotal: value, milestonesNote: null,
});
const order = { id: 9001, code: 'TEST-ACC-A', orderType: 'customer', status: 'inquiry', title: 'Bridge girders', lines: [], allowedTransitions: ['quoted', 'lost', 'cancelled'] };
const viewOf = (extra = {}) => ({
  order: { id: 9001, code: 'TEST-ACC-A', status: 'inquiry', orderType: 'customer', title: 'Bridge girders', customer: { id: 5, code: 'C', name: 'Railway Co' }, committedDate: '2026-12-31', materialSupply: 'we_buy', confirmedAt: null,
    lines: [{ id: 801, lineNo: 1, name: 'Girder', code: null, quantity: 2, committedDate: null, ownSupply: null, supply: 'we_buy', weightKgEach: 2000, weightT: 4 }] },
  state: 'none', locked: false, editable: true, editReason: null, saveMeans: 'Saving sends the terms to Management. The order is confirmed when they are approved.', supplyEditable: true,
  terms: JSON.parse(JSON.stringify(TERMS)), fromTemplates: true, estimate: EST(), approved: null, pending: null, sentBack: null, versions: [], confirmProblems: [],
  mrs: [{ id: 41, code: 'MR-TEST-ACC-A-1', lineNo: 1, supply: 'we_buy', held: true }], mrNote: 'The MR is shared with the customer and held: Purchase starts once the acceptance is approved.',
  postStages: [], lists: LISTS, templates: [{ id: 3, kind: 'charges', name: 'Bridge girders', isDefault: true, rows: { charges: TERMS.charges, material: TERMS.material, lumpSums: TERMS.lumpSums }, notes: null }], ...extra,
});

// ── 1: the words and the rows ───────────────────────────────────────────────────────────────────
await check('triggers in words, % total, keys, stage links, templates', () => {
  const names = { operation: (id) => (id === 12 ? 'Painting' : null), stage: (k) => (k === 's1' ? 'Inspection by RITES' : null), milestone: (k) => (k === 'm2' ? 'On dispatch' : null) };
  assert.equal(m.triggerWords({ type: 'operation_completed', operationId: 12 }, names), 'When Painting is completed');
  assert.equal(m.triggerWords({ type: 'dispatched', mode: 'each' }), 'On each dispatch');
  assert.equal(m.triggerWords({ type: 'dispatched', mode: 'all' }), 'When everything is dispatched');
  assert.equal(m.triggerWords({ type: 'post_stage', stageKey: 's1' }, names), 'When "Inspection by RITES" is done');
  assert.equal(m.triggerWords({ type: 'days_after', days: 30, after: { type: 'design_frozen' } }), '30 days after the design is frozen');
  assert.equal(m.triggerWords({ type: 'retention', months: 12, milestoneKey: 'm2' }, names), '12 months after "On dispatch"');
  assert.equal(m.triggerWords({ type: 'fixed_date', date: '2026-12-31' }), 'On 2026-12-31');
  assert.equal(m.triggerWords(null), 'Not chosen');
  assert.equal(m.percentTotal(TERMS.milestones), 100);
  assert.equal(m.newKey('m', TERMS.milestones), 'm4');
  assert.equal(m.proRataAllowed({ type: 'material_in_place' }), true); assert.equal(m.proRataAllowed({ type: 'order_accepted' }), false);
  const linked = m.linkStage(TERMS.milestones, 's2', 'm1');
  assert.deepEqual(linked[0].trigger, { type: 'post_stage', stageKey: 's2' }); assert.equal(m.milestoneOfStage(linked, 's2').key, 'm1');
  const t = m.applyTemplate(JSON.parse(JSON.stringify(TERMS)), { kind: 'stages', rows: { stages: [{ key: 's1', name: 'Load test' }] } });
  assert.deepEqual(t.stages, [{ key: 's1', name: 'Load test' }]); assert.equal(t.charges.length, 2, 'only its own kind changes');
  assert.deepEqual(Object.keys(m.templateRows(TERMS, 'charges')), ['charges', 'material', 'lumpSums']);
  assert.equal(m.termsBody({ ...TERMS, material: { rate: null, weight: 'drawing' }, stages: [{ key: 's9', name: ' ' }] }).material, null);
  assert.deepEqual(m.stateWords({ approved: null, pending: { version: 1 }, sentBack: null, state: 'pending' }), { label: 'Waiting for Management', family: 'warning' });
  assert.equal(m.stateWords({ approved: { version: 2 }, pending: null, sentBack: null, state: 'approved' }).label, 'Accepted (v2)');
  assert.equal(m.saveLabel({ approved: { version: 2 }, pending: null }), 'Send rate change for approval');
  assert.equal(m.saveLabel({ approved: null, pending: null }), 'Send for approval');
});

await check('the API helpers call the §73 routes', async () => {
  reset();
  for (const k of ['GET /orders/9001/acceptance', 'PUT /orders/9001/acceptance', 'POST /orders/9001/acceptance/withdraw', 'GET /approvals', 'POST /approvals/5/decide', 'GET /order-board', 'POST /order-post-stages/3/done', 'GET /term-templates']) globalThis.__routes[k] = () => ({});
  await m.AA.checkAcceptance(9001, TERMS); assert.equal(body(lastCall('PUT', '/orders/9001/acceptance')).dryRun, true);
  await m.AA.saveAcceptance(9001, TERMS, 'agreed'); const b = body(lastCall('PUT', '/orders/9001/acceptance')); assert.equal(b.dryRun, undefined); assert.equal(b.note, 'agreed');
  await m.AP.decideApproval(5, 'reject', 'too low'); assert.deepEqual(body(lastCall('POST', '/approvals/5/decide')), { decision: 'reject', note: 'too low' });
  await m.AP.listApprovals({ status: 'pending', type: 'purchase_order' }); assert.match(lastCall('GET', '/approvals').url, /status=pending&type=purchase_order/);
  await m.AA.getOrderBoard('girder'); assert.match(lastCall('GET', '/order-board').url, /search=girder/);
  await m.AA.markStageDone(3, { date: '2026-10-18', note: 'IC 44' }); assert.deepEqual(body(lastCall('POST', '/order-post-stages/3/done')), { date: '2026-10-18', note: 'IC 44' });
  await m.AA.listTemplates('stages', true); assert.match(lastCall('GET', '/term-templates').url, /kind=stages&lists=1/);
  assert.equal(m.AP.APPROVAL_TAGS.order_acceptance, 'cf_erp_approve_order_acceptance');
  assert.equal(m.AP.ANY_APPROVAL.split('|').length, 6);
});

// ── 2: the Customer acceptance step ─────────────────────────────────────────────────────────────
await check('the step: prefilled grids, the estimate, the MR to share, a change is checked live, send → waiting', async () => {
  reset(); asUser(['cf_erp_orders_view', 'cf_erp_orders_manage', 'cf_erp_inventory_view']);
  let view = viewOf();
  globalThis.__routes['GET /orders/9001/acceptance'] = () => view;
  globalThis.__routes['GET /orders/9001/mr-document'] = () => new Blob(['%PDF']);
  globalThis.__routes['PUT /orders/9001/acceptance'] = (b) => {
    const x = typeof b === 'string' ? JSON.parse(b) : b;
    if (x.dryRun) return { dryRun: true, terms: x, estimate: EST(x.charges[0].rate === 48000 ? 527760 : 515760), problems: x.charges[0].rate === 0 ? ['Charge 1 (Fabrication): give the rate.'] : [], changes: [] };
    view = viewOf({ state: 'pending', pending: { id: 1, version: 1, kind: 'acceptance', status: 'pending', note: x.note ?? null, savedBy: { id: 7, name: 'Sales' }, savedAt: '2026-10-18T09:00:00Z', decidedBy: null, decidedAt: null, decisionNote: null, approvalId: 5 }, saveMeans: 'Saving replaces the terms waiting for approval.' });
    return view;
  };
  await mount(React.createElement(m.AcceptanceStep, { order }));
  await settle(450);
  assert.equal(qa('acc-charge-row').length, 2); assert.equal(qa('acc-ms-row').length, 3); assert.equal(qa('acc-stage-row').length, 2);
  assert.ok(q1('acc-material-row'), 'the material row, since a line is bought by us');
  assert.equal(qa('acc-lump-row').length, 1);
  assert.match(text(q1('acc-est-value')), /5,15,760/);
  assert.match(text(q1('acc-est-margin')), /61.22 %/);
  assert.match(text(q1('acc-mr')), /shared with the customer and held/);
  assert.ok(q1('acc-mr-pdf') && q1('acc-mr-xlsx'), 'the MR as PDF and as Excel');
  await click(q1('acc-mr-pdf')); await settle(40);
  assert.match(lastCall('GET', '/orders/9001/mr-document').url, /format=pdf/);
  assert.match(text(qa('ms-words')[2]), /When "Inspection by RITES" is done/);
  assert.ok(calls('PUT', '/orders/9001/acceptance').some((c) => body(c).dryRun), 'checked and priced at once');
  // A rate typed → the live check runs with it.
  const rate = qa('charge-rate')[0];
  await setValue(rate, '48000'); await settle(450);
  const dry = calls('PUT', '/orders/9001/acceptance').filter((c) => body(c).dryRun).at(-1);
  assert.equal(body(dry).charges[0].rate, 48000);
  assert.match(text(q1('acc-est-value')), /5,27,760/);
  await setValue(rate, '0'); await settle(450);
  assert.match(text(q1('acc-problems')), /give the rate/);
  assert.equal(q1('acc-send').disabled, true, 'a problem holds the send');
  await setValue(rate, '45000'); await settle(450);
  await setValue(q1('acc-note'), 'Agreed on the call'); await settle(20);
  assert.equal(text(q1('acc-send')), 'Send for approval');
  await click(q1('acc-send')); await settle(120);
  const sent = calls('PUT', '/orders/9001/acceptance').filter((c) => !body(c).dryRun).at(-1);
  assert.equal(body(sent).note, 'Agreed on the call'); assert.equal(body(sent).charges[0].rate, 45000);
  assert.match(text(q1('acc-pending')), /Waiting for Management since/);
  assert.ok(q1('acc-take-back'), 'the pending terms can be taken back');
});

await check('accepted: the terms are locked, a change is a rate change; sent back shows the reason', async () => {
  reset(); asUser(['cf_erp_orders_view', 'cf_erp_orders_manage']);
  const approved = { id: 2, version: 2, kind: 'acceptance', status: 'approved', note: null, savedBy: null, savedAt: '2026-10-17T09:00:00Z', decidedBy: { id: 9, name: 'MD' }, decidedAt: '2026-10-18T09:00:00Z', decisionNote: null, approvalId: 6 };
  globalThis.__routes['GET /orders/9001/acceptance'] = () => viewOf({ state: 'approved', locked: true, approved, supplyEditable: false, saveMeans: 'Saving sends a rate change to Management. The approved terms stay in force until it is approved.',
    order: { ...viewOf().order, status: 'confirmed' }, mrs: [{ id: 41, code: 'MR-TEST-ACC-A-1', lineNo: 1, supply: 'we_buy', held: false }], mrNote: 'The MR is with Purchase.',
    postStages: [{ id: 3, key: 's1', name: 'Inspection by RITES', sequence: 1, done: false, doneOn: null, doneNote: null, doneBy: null, doneAt: null }],
    versions: [{ ...approved }, { id: 1, version: 1, kind: 'acceptance', status: 'rejected', savedAt: '2026-10-16T09:00:00Z', decidedAt: '2026-10-16T12:00:00Z', decidedBy: { id: 9, name: 'MD' }, decisionNote: 'Painting too low', savedBy: null, note: null, approvalId: 5 }] });
  globalThis.__routes['PUT /orders/9001/acceptance'] = () => ({ dryRun: true, terms: TERMS, estimate: EST(), problems: [], changes: ['Fabrication: rate 45000 → 48000.'] });
  await mount(React.createElement(m.AcceptanceStep, { order: { ...order, status: 'confirmed' } }));
  await settle(450);
  assert.match(text(q1('acc-locked')), /Accepted on .* by MD\. These terms are locked\./);
  assert.equal(text(q1('acc-send')), 'Send rate change for approval');
  assert.equal(q1('acc-send').disabled, true, 'nothing changed yet');
  assert.equal(q1('acc-order-supply').closest('.MuiInputBase-root').classList.contains('Mui-disabled'), true, 'who supplies the material is fixed');
  assert.match(text(q1('acc-changes')), /Fabrication: rate 45000 → 48000/);
  assert.match(text(q1('acc-history')), /v1 · acceptance · rejected .* — Painting too low/);
  assert.ok(q1('stage-checklist'), 'the post-production checklist');
  reset(); asUser(['cf_erp_orders_view', 'cf_erp_orders_manage']);
  globalThis.__routes['GET /orders/9001/acceptance'] = () => viewOf({ state: 'rejected', sentBack: { id: 1, version: 1, kind: 'acceptance', status: 'rejected', decidedBy: { id: 9, name: 'MD' }, decisionNote: 'Painting too low', savedAt: 'x', decidedAt: 'y', savedBy: null, note: null, approvalId: 5 }, fromTemplates: false });
  globalThis.__routes['PUT /orders/9001/acceptance'] = () => ({ dryRun: true, terms: TERMS, estimate: EST(), problems: [], changes: [] });
  await mount(React.createElement(m.AcceptanceStep, { order }));
  await settle(400);
  assert.match(text(q1('acc-sent-back')), /Sent back by MD: Painting too low/);
});

// ── 3: the Management inbox ─────────────────────────────────────────────────────────────────────
const acceptanceRow = { id: 5, type: 'order_acceptance', typeLabel: 'Customer acceptance', permission: 'cf_erp_approve_order_acceptance', subject: { type: 'order_acceptance', id: 1, code: 'TEST-ACC-A' }, order: { id: 9001, code: 'TEST-ACC-A', customer: 'Railway Co' },
  title: 'Customer acceptance of TEST-ACC-A (Railway Co)', summary: null, amount: 515760, status: 'pending', requestedBy: { id: 7, name: 'Sales' }, requestedAt: '2026-10-18T09:00:00Z', requestNote: 'Agreed on the call', decidedBy: null, decidedAt: null, decisionNote: null,
  context: { kind: 'order_acceptance', version: 1, versionKind: 'acceptance', order: { id: 9001, code: 'TEST-ACC-A', customer: 'Railway Co', committedDate: '2026-12-31', status: 'inquiry' },
    terms: { ...TERMS, charges: TERMS.charges.map((c) => ({ ...c, operation: c.operationId === 11 ? 'Fabrication' : 'Painting' })) }, estimate: EST(), approvedBefore: null, changes: [], note: 'Agreed on the call' } };
const poRow = { id: 6, type: 'purchase_order', typeLabel: 'Purchase order', permission: 'cf_erp_approve_purchase_order', subject: { type: 'purchase_order', id: 2325, code: 'PO-002325' }, order: null,
  title: 'Purchase order PO-002325 to Vendor A', summary: '1 line', amount: 300, status: 'pending', requestedBy: { id: 8, name: 'Buyer' }, requestedAt: '2026-10-18T10:00:00Z', requestNote: null, decidedBy: null, decidedAt: null, decisionNote: null,
  context: { kind: 'purchase_order', purchaseOrder: { id: 2325, code: 'PO-002325', status: 'requested', type: 'material', expectedDate: '2026-10-25', forOrder: { id: 9001, code: 'TEST-ACC-A' } }, vendor: { id: 31, name: 'Vendor A' },
    lines: [{ id: 1, lineNo: 1, item: { id: 501, code: 'PS', name: 'Plate', uom: 'nos' }, quantity: 3, received: 0, pending: 3, rate: 100, amount: 300, expectedDate: null,
      quotes: [{ supplier: { id: 31, name: 'Vendor A' }, rate: 100, deliveryDays: 7, remark: null, thisVendor: true, pr: 'PR-1' }, { supplier: { id: 32, name: 'Vendor B' }, rate: 90, deliveryDays: 9, remark: null, thisVendor: false, pr: 'PR-1' }],
      lowestQuote: 90, comparison: '₹10 per nos above the lowest quote.' }], amount: 300, pendingAmount: 300, reason: null } };
await check('the inbox: what is asked, by whom, the amounts, the context; approve; send back needs a reason', async () => {
  reset(); asUser(['cf_erp_approve_order_acceptance', 'cf_erp_approve_purchase_order'], 9);
  globalThis.__routes['GET /approvals'] = () => ({ rows: [acceptanceRow, poRow], counts: { order_acceptance: 1, purchase_order: 1 }, types: [{ key: 'order_acceptance', label: 'Customer acceptance' }, { key: 'purchase_order', label: 'Purchase order' }] });
  globalThis.__routes['POST /approvals/5/decide'] = () => ({ approval: { ...acceptanceRow, status: 'approved' }, result: { confirmed: true } });
  globalThis.__routes['POST /approvals/6/decide'] = () => ({ approval: { ...poRow, status: 'rejected' }, result: null });
  await mount(React.createElement(m.Approvals), '/testco/cf_erp/approvals');
  await settle(80);
  const cards = qa('approval-card');
  assert.equal(cards.length, 2);
  const acc = cards.find((c) => c.getAttribute('data-type') === 'order_acceptance');
  assert.match(text(q1('approval-estimate', acc)), /Estimated value ₹5,15,760 · margin over material ₹3,15,760 \(61.22 %\)/);
  assert.match(text(q1('approval-charges', acc)), /Painting.*SURFACE_AREA \* COATS \(m2\).*₹120\.00 \/ m2.*On completion/);
  assert.match(text(q1('approval-milestones', acc)), /On dispatch.*80 %.*On each dispatch \(pro-rata\).*30/);
  assert.match(text(q1('approval-stages', acc)), /1\. Inspection by RITES · 2\. Erection at site/);
  assert.match(text(document.body), /Sales asked .* · ₹5,15,760 · “Agreed on the call”/);
  const po = cards.find((c) => c.getAttribute('data-type') === 'purchase_order');
  assert.match(text(q1('approval-po-lines', po)), /Vendor B ₹90\.00 · 9 d.*₹10 per nos above the lowest quote/);
  // Approve the acceptance.
  await click(buttonIn(acc.closest('section') ?? acc.parentElement.parentElement, 'Approve') ?? qa('approval-approve')[0]); await settle(40);
  let dlg = document.querySelector('[role="dialog"]');
  await click(q1('approval-confirm', dlg)); await settle(80);
  assert.deepEqual(body(lastCall('POST', '/approvals/5/decide')), { decision: 'approve' });
  // Send back the PO: the button waits for the reason.
  await click(qa('approval-reject')[1] ?? qa('approval-reject')[0]); await settle(40);
  dlg = document.querySelector('[role="dialog"]');
  assert.equal(q1('approval-confirm', dlg).disabled, true, 'a reason first');
  await setValue(q1('approval-note', dlg), 'Vendor B is cheaper'); await settle(20);
  await click(q1('approval-confirm', dlg)); await settle(80);
  const rejectCall = lastCall('POST', '/approvals/6/decide');
  assert.equal(body(rejectCall).decision, 'reject'); assert.equal(body(rejectCall).note, 'Vendor B is cheaper');
});
await check('the inbox says when you asked for one yourself', async () => {
  reset(); asUser(['cf_erp_approve_purchase_order'], 8);
  globalThis.__routes['GET /approvals'] = () => ({ rows: [poRow], counts: { purchase_order: 1 }, types: [{ key: 'purchase_order', label: 'Purchase order' }] });
  await mount(React.createElement(m.Approvals), '/testco/cf_erp/approvals');
  await settle(80);
  assert.match(text(q1('approval-card')), /You asked for this one — somebody else in Management decides it/);
});

// ── 4: the Orders board ─────────────────────────────────────────────────────────────────────────
await check('the board: seven lanes from facts; a post-production card is a checklist ticked with a date and a note', async () => {
  reset(); asUser(['cf_erp_orders_view', 'cf_erp_orders_manage']);
  const card = (id, lane, extra = {}) => ({ id, code: `TEST-ACC-${id}`, title: null, customer: 'Railway Co', status: lane === 'closed' ? 'closed' : lane === 'inquiry' || lane === 'pending_approval' ? 'inquiry' : 'confirmed', lane, committedDate: '2026-12-31', overdue: false,
    facts: { lines: 1, released: 0, dispatched: '0 of 1 line shipped', material: '2 of 3 materials locked', materialInPlace: false, acceptance: null, rateChangePending: false }, stages: [], stagesDone: 0, canClose: false, ...extra });
  const LANES = [['inquiry', 'Inquiry / draft'], ['pending_approval', 'Pending approval'], ['material', 'Material'], ['in_production', 'In production'], ['dispatched', 'Dispatched'], ['post_production', 'Post-production'], ['closed', 'Closed']];
  const stage = { id: 3, key: 's1', name: 'Inspection by RITES', sequence: 1, done: false, doneOn: null, doneNote: null, doneBy: null, doneAt: null };
  globalThis.__routes['GET /order-board'] = () => ({ today: '2026-10-18', lanes: LANES.map(([key, label]) => ({ key, label, cards: key === 'material' ? [card(1, 'material')] : key === 'pending_approval' ? [card(2, 'pending_approval', { facts: { ...card(2, 'x').facts, acceptance: { status: 'pending', version: 1 } } })] : key === 'post_production' ? [card(3, 'post_production', { stages: [stage] })] : [] })) });
  globalThis.__routes['POST /order-post-stages/3/done'] = () => ({ stage: { ...stage, done: true, doneOn: '2026-10-18' }, orderClosed: false });
  await mount(React.createElement(m.OrdersBoard), '/testco/cf_erp/orders-board');
  await settle(80);
  assert.deepEqual(qa('board-lane').map((l) => l.getAttribute('data-lane')), LANES.map(([k]) => k));
  assert.match(text(q1('board-lane')), /Inquiry \/ draft/);
  assert.match(text(qa('board-card').find((c) => c.getAttribute('data-order') === '1')), /2 of 3 materials locked/);
  assert.match(text(qa('board-card').find((c) => c.getAttribute('data-order') === '2')), /Acceptance v1 waits for Management/);
  const post = qa('board-card').find((c) => c.getAttribute('data-order') === '3');
  assert.match(text(post), /0 of 1 stage done/);
  await click(post.querySelector('input[type="checkbox"]')); await settle(60);
  const dlg = document.querySelector('[role="dialog"]');
  assert.match(text(dlg), /"Inspection by RITES" done/);
  await setValue(q1('stage-note', dlg), 'RITES IC 4411'); await settle(10);
  await click(q1('stage-done', dlg)); await settle(80);
  const b = body(lastCall('POST', '/order-post-stages/3/done'));
  assert.equal(b.note, 'RITES IC 4411'); assert.match(b.date, /^\d{4}-\d{2}-\d{2}$/);
});

// ── 5: Setup › Templates, the menu, what went ───────────────────────────────────────────────────
const TEMPLATE_ROWS = () => ({ rows: [{ id: 3, kind: 'charges', name: 'Bridge girders', isDefault: true, rows: { charges: TERMS.charges, material: TERMS.material, lumpSums: TERMS.lumpSums }, notes: null },
  { id: 4, kind: 'stages', name: 'RITES + erection', isDefault: true, rows: { stages: TERMS.stages }, notes: null }], starter: { charges: {}, milestones: {}, stages: {} }, lists: LISTS });
await check('Setup › Templates with orders manage only: read, no Edit (templates are accounts manage, 2026-10-27)', async () => {
  reset(); asUser(['cf_erp_orders_view', 'cf_erp_orders_manage']);
  globalThis.__routes['GET /term-templates'] = TEMPLATE_ROWS;
  await mount(React.createElement(m.TermTemplates), '/testco/cf_erp/term-templates');
  await settle(80);
  assert.match(text(q1('tpl-list')), /Bridge girders/);
  assert.equal(q1('tpl-edit'), null, 'no Edit');
  assert.match(src('components/Acceptance/AcceptanceStep.tsx'), /const canSaveTemplate = isPermitted\('cf_erp_accounts_manage'\);/);
  assert.match(src('components/Acceptance/AcceptanceStep.tsx'), /\{canSaveTemplate && <Button size="small" onClick=\{\(\) => \{ setSaveTpl\(kind\); setTplName\(''\); \}\} data-testid=\{`save-tpl-\$\{kind\}`\}>Save as template<\/Button>\}/);
});

await check('Setup › Templates lists each kind, the default marked (accounts manage)', async () => {
  reset(); asUser(['cf_erp_accounts_view', 'cf_erp_accounts_manage']);
  globalThis.__routes['GET /term-templates'] = TEMPLATE_ROWS;
  await mount(React.createElement(m.TermTemplates), '/testco/cf_erp/term-templates');
  await settle(80);
  assert.match(text(q1('tpl-list')), /Bridge girders.*Fabrication ₹45,000\/t · Painting ₹120\/m2 · material ₹70,000\/t · Transport ₹50,000.*Default/);
  await click(buttonIn(document.body, 'Post-production stages')); await settle(40);
  assert.match(text(q1('tpl-list')), /RITES \+ erection.*1\. Inspection by RITES · 2\. Erection at site/);
  await click(q1('tpl-edit')); await settle(60);
  assert.equal(qa('acc-stage-row').length, 2, 'the stages grid in the editor');
});

await check('the menu: Management (Approvals, Overview) for any approval tag; Sales › Orders board; Setup › Templates', () => {
  const mgmt = m.SECTIONS.find((s) => s.key === 'mgmt');
  assert.equal(mgmt.label, 'Management');
  // 2026-10-24: Management holds the Dashboard, Plan health (the overview page), Approvals and Order costing.
  assert.deepEqual(mgmt.screens.map((s) => s.key), ['mgmt-dashboard', 'management-overview', 'approvals', 'mgmt-order-costing']);
  assert.equal(mgmt.screens.find((s) => s.key === 'approvals').permission.split('|').length, 6);
  assert.ok(m.SECTIONS.find((s) => s.key === 'sales').screens.some((s) => s.key === 'orders-board' && s.label === 'Orders board'));
  assert.ok(m.SECTIONS.find((s) => s.key === 'setup').screens.some((s) => s.key === 'term-templates' && s.label === 'Templates'));
  assert.match(m.SECTIONS.find((s) => s.key === 'purchase').screens.find((s) => s.key === 'purchase-orders').permission, /cf_erp_approve_purchase_order/);
});

await check('the old plain Confirm is gone: no ConfirmOrderDialog, no ConfirmPanel; the step and the tab are there', () => {
  assert.ok(!existsSync(resolve('src/apps/cf_erp/components/OrderProcess/ConfirmOrderDialog.tsx')), 'ConfirmOrderDialog is deleted');
  const body = src('components/OrderProcess/StageBody.tsx');
  assert.doesNotMatch(body, /ConfirmPanel|CONFIRM_WHAT_HAPPENS|stageKey === 'confirm'/);
  assert.match(body, /stageKey === 'acceptance'/);
  assert.doesNotMatch(src('lib/process.ts'), /CONFIRM_WHAT_HAPPENS|CONFIRM_STILL_ON_THE_PAGE/);
  const detail = src('pages/OrderDetail.tsx');
  assert.match(detail, /value: 'acceptance', label: 'Customer acceptance'/);
  assert.doesNotMatch(detail, /ConfirmOrderDialog/);
  assert.match(src('components/Acceptance/AcceptanceStep.tsx'), /useFullScreen\('so-acceptance'\)/, 'full screen');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
