// Run from multi_app_fe: node scripts/cf_erp_flow_replace_test.mjs
// Flow › Steps, the page itself: VIEW shows each step's setup and time per piece and edits nothing; Edit steps works on a
// draft — replace, the + in a gap (Add / Split / Merge), lanes side by side, an open lane stopping Save, the arrows, Undo —
// and sends nothing until Save, which PUTs the whole picture once to /flows/:id/steps (key, lane, after); a refusal lists
// every problem and stays in edit mode; Cancel asks first and puts the saved flow back.
// The API is mocked; no network. (The draft's own logic: scripts/cf_erp_flow_edit_test.mjs.)
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/flows/7', pretendToBeVisual: true });
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
globalThis.ResizeObserver = dom.window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const calls = [];
globalThis.__api = async (url, opts = {}) => {
  const path = url.replace(/^\/api\/[^/]+\/cf_erp/, '');
  const call = { method: opts.method ?? 'GET', path, body: typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body };
  calls.push(call);
  const handler = globalThis.__routes.find(([mt, re]) => mt === call.method && re.test(path));
  if (!handler) throw new Error(`API request failed: 404 Not Found - {"message":"no mock for ${call.method} ${path}"}`);
  return handler[2](call);
};
const stubs = {
  '@core/api/client': 'export async function apiFetch(url, opts) { return globalThis.__api(url, opts); }',
  '@core/contexts/AuthContext': 'export const useAuth = () => ({ user: null });',
};
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter, Routes, Route } from 'react-router-dom';
      export { React, createRoot, MemoryRouter, Routes, Route };
      export { default as FlowDetail } from './src/apps/cf_erp/pages/FlowDetail';
      export { ToastContext } from './src/apps/cf_erp/components/toastContext';
      export { replacedText } from './src/apps/cf_erp/lib/production';`,
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
const artifact = resolve(cache, `flow-replace-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter, Routes, Route } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async (ms = 30) => React.act(async () => { await sleep(ms); });
const click = async (el) => { assert.ok(el, 'nothing to click'); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); };
const byLabel = (label) => document.querySelector(`[aria-label="${label}"]`);
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

// ── fixture ────────────────────────────────────────────────────────────────
const opOf = (id, code, name) => ({ id, code, name, status: 'active' });
const CUT = opOf(1, 'CUT', 'Plasma cutting'), DRL = opOf(2, 'DRL', 'Drilling'), PNCH = opOf(3, 'PNCH', 'Punching'), QC = opOf(4, 'QC', 'Inspection');
const none = { minutes: null, expression: null, display: null, formula: null };
const fixed = (n) => ({ minutes: n, expression: String(n), display: String(n), formula: null });
const cutTime = { setup: fixed(5), work: fixed(12), ruleId: 44, subject: { type: 'classification', id: 9, code: 'CNC', name: 'CNC cutting', level: 'Variant' }, eligible: true, rules: 1 };
const noTime = { setup: none, work: none, ruleId: null, subject: null, eligible: null, rules: 0 };
const parentWait = { id: 5, relation: 'parent', targetDefinition: null, targetOperation: null, requiredStatus: 'done', text: 'Waits until its parent is complete.', notes: null };
const flowWith = (steps) => ({ id: 7, code: 'CG-PLATEPART', name: 'Plate part', description: null, revision: 'A', status: 'active', linked: true, steps, uses: { records: [], bomLines: 0, recordCount: 0 } });
const savedSteps = [
  { id: 70, sequence: 10, lane: 0, after: [], operation: CUT, stepName: null, notes: null, time: cutTime, waits: [] },
  { id: 71, sequence: 20, lane: 0, after: [70], operation: DRL, stepName: 'Holes', notes: null, time: noTime, waits: [parentWait] },
];
// After the save: CUT 10 | QC 20 ‖ CUT 20 | PNCH 30 (the meeting step).
const afterSave = [
  savedSteps[0],
  { id: 72, sequence: 20, lane: 0, after: [70], operation: QC, stepName: null, notes: null, time: noTime, waits: [] },
  { id: 73, sequence: 20, lane: 1, after: [70], operation: CUT, stepName: null, notes: null, time: cutTime, waits: [] },
  { id: 71, sequence: 30, lane: 0, after: [72, 73], operation: PNCH, stepName: 'Holes', notes: null, time: noTime, waits: [parentWait] },
];
const replaced = { from: DRL, to: PNCH, released: 12, overridesMoved: 2, cellsMoved: 3, kept: 1, waitsNaming: 0 };
let refuseSave = true;
globalThis.__routes = [
  ['GET', /^\/flows\/7$/, () => flowWith(savedSteps)],
  ['GET', /^\/operations/, () => [CUT, DRL, PNCH, QC]],
  ['GET', /^\/specifications$/, () => []],
  ['GET', /^\/classification/, () => ({ screen: 'machines', all: false, levels: ['Family', 'Subfamily', 'Variant'], leafDepth: 2, hiddenCount: 0, roots: [] })],
  ['PUT', /^\/flows\/7\/steps$/, () => {
    if (refuseSave) throw new Error(`API request failed: 422 Unprocessable Entity - ${JSON.stringify({ message: 'CG-PLATEPART cannot be saved like this.', code: 'INVALID', problems: ['Step 4 (PNCH): Operation PNCH is inactive.'] })}`);
    return { flow: flowWith(afterSave), summary: '2 steps added, 1 operation replaced.', changes: {}, synced: true, dryRun: false };
  }],
];
const toasts = [];
const errors = [];
const app = document.getElementById('app');
const root = createRoot(app);
await React.act(async () => {
  root.render(React.createElement(m.ToastContext.Provider, { value: { success: (t) => toasts.push(t), error: (t) => errors.push(t), info: () => {} } },
    React.createElement(MemoryRouter, { initialEntries: ['/testco/cf_erp/flows/7'] },
      React.createElement(Routes, null, React.createElement(Route, { path: '/:company/cf_erp/flows/:id', element: React.createElement(m.FlowDetail) })))));
  await sleep(30);
});
await settle(50);

const testId = (id) => document.querySelector(`[data-testid="${id}"]`);
const writes = () => calls.filter((c) => c.method !== 'GET');
const pickOperation = async (code, id = 'pick-operation') => {
  const input = testId(id);
  assert.ok(input, 'the operation picker is open');
  await React.act(async () => { input.focus(); input.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })); await sleep(0); });
  await React.act(async () => { input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await sleep(10); });
  const offered = [...document.querySelectorAll('[role="option"]')];
  const texts = offered.map((o) => o.textContent);
  if (code) { await click(offered.find((o) => o.textContent.includes(code))); await settle(); }
  return texts;
};
const numbersShown = () => [...document.querySelectorAll('[data-testid^="row-number-"]')].map((n) => n.textContent);
/** The picture as drawn: "row/lane CODE" for every card, top to bottom, left to right. */
const drawn = () => [...document.querySelectorAll('[data-testid^="flow-cell-"]')]
  .map((c) => ({ row: Number(c.getAttribute('data-row')), lane: Number(c.getAttribute('data-lane')), code: c.querySelector('[data-testid^="step-card-"]').textContent.match(/(CUT|DRL|PNCH|QC)/)[1] }))
  .sort((a, b) => a.row - b.row || a.lane - b.lane).map((c) => `${c.row}/${c.lane} ${c.code}`).join(' · ');
const bar = () => testId('flow-edit-bar').textContent;
/** Opens the "+" of a gap and picks one of its menu items. */
const gapMenu = async (gapId, item) => {
  await click(testId(`gap-${gapId}`));
  await settle(50);
  if (item) { await click(testId(item)); await settle(350); }
};
const closeMenu = async () => { await React.act(async () => { document.querySelector('.MuiBackdrop-root')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(350); }); };

await check('replacedText (the per-step replace route\'s toast) still says what moved', () => {
  assert.equal(m.replacedText(replaced), 'DRL replaced by PNCH. 12 released steps keep DRL. Moved over: 2 time overrides and 3 contractor assignments. 1 left on DRL (the row already had one for PNCH).');
});
await check('view mode: each card shows the operation\'s setup and time per piece, and where it runs', () => {
  const cut = testId('step-times-s70').textContent, drl = testId('step-times-s71').textContent;
  assert.match(cut, /Setup5 min per run/);
  assert.match(cut, /Time per piece12 min per piece/);
  assert.match(cut, /Runs onCNC cutting/);
  assert.match(drl, /No time yet/);
  assert.match(drl, /No setup/);
  assert.match(drl, /No machine type yet/);
  assert.match(document.body.textContent, /Waits until its parent is complete\./);
  assert.deepEqual(numbersShown(), ['10', '20']);
  assert.equal(drawn(), '1/1 CUT · 2/1 DRL');
});
await check('view mode: nothing edits the flow — no move, replace, remove or gap', () => {
  assert.equal(byLabel('Replace operation of step DRL'), null);
  assert.equal(byLabel('Remove step DRL'), null);
  assert.equal(byLabel('Move step CUT down'), null);
  assert.equal(document.querySelector('[data-testid^="gap-"]'), null);
  assert.equal(testId('flow-edit-bar'), null);
});
await check('view mode: the formula is edited from the card; an operation with no rule is asked for its machine type first', async () => {
  assert.ok(byLabel('Edit the setup time of CUT') && byLabel('Edit the time per piece of CUT'));
  await click(byLabel('Edit the time per piece of DRL'));
  await settle(50);
  assert.match(testId('type-prompt').textContent, /DRL · which machine type does it\?/);
  await closeMenu();
});
await check('Edit steps: the page goes into edit mode and sends nothing; every gap of the lane has a +', async () => {
  await click(testId('edit-steps'));
  await settle();
  assert.match(bar(), /No changes yet/);
  assert.equal(testId('save-steps').disabled, true, 'nothing to save yet');
  assert.ok(testId('gap-trunk:0') && testId('gap-trunk:1') && testId('gap-trunk:2'));
  assert.ok(byLabel('Lane 1: add, split or merge between CUT and DRL'));
  assert.ok(byLabel('Move step DRL up') && byLabel('Drag step CUT'));
  assert.equal(writes().length, 0);
});
await check('a single lane offers Add and Split — no Merge', async () => {
  await gapMenu('trunk:1', null);
  assert.ok(testId('gap-add') && testId('gap-split'));
  assert.equal(testId('gap-merge'), null);
  assert.equal(testId('gap-add-before'), null);
  await closeMenu();
});
await check('replace is pending: the card is marked Changed and no request is made', async () => {
  await click(byLabel('Replace operation of step DRL'));
  await settle(50);
  assert.match(document.body.textContent, /Replace Drilling/);
  const offered = await pickOperation('PNCH');
  assert.ok(!offered.some((t) => t.includes('DRL')), 'the current operation is not offered');
  await click(button('Replace'));
  await settle(50);
  const card = testId('step-card-s71');
  assert.equal(card.getAttribute('data-mark'), 'changed');
  assert.match(card.textContent, /PunchingPNCHChanged/);
  assert.match(bar(), /1 change not saved · 1 operation replaced/);
  assert.equal(writes().length, 0);
});
await check('Add at a gap: the step goes in there and the numbers are shown as they will be', async () => {
  await gapMenu('trunk:1', 'gap-add');
  assert.match(document.body.textContent, /Add a step here/);
  await pickOperation('QC');
  await click(button('Add step'));
  await settle(50);
  assert.deepEqual(numbersShown(), ['10', '20', '30']);
  assert.equal(drawn(), '1/1 CUT · 2/1 QC · 3/1 PNCH');
  assert.equal(document.querySelectorAll('[data-mark="new"]').length, 1);
  assert.match(bar(), /2 changes not saved · 1 step added · 1 operation replaced/);
});
await check('Split: a second lane opens beside the point — and while it is open the flow cannot be saved', async () => {
  await gapMenu('trunk:1', 'gap-split');               // under CUT
  assert.match(document.body.textContent, /Split lane 1 — the first step of the new lane/);
  await pickOperation('CUT');
  assert.match(document.body.textContent, /Already in this flow 1x — this is another pass/);
  await click(button('Split'));
  await settle(50);
  assert.equal(testId('flow-steps').getAttribute('data-lanes'), '2');
  assert.equal(drawn(), '1/1 CUT · 2/1 QC · 2/2 CUT · 3/1 PNCH');
  assert.match(document.body.textContent, /Lane 1 · trunk/);
  assert.match(testId('flow-problems').textContent, /Lane 2 \(ends at CUT\) is still open — merge it back before saving\./);
  assert.equal(testId('save-steps').disabled, true, 'an open lane: Save is off');
  assert.match(testId('step-card-s70').textContent, /Lane 2 splits off after this step\./);
});
await check('inside lanes every gap offers Add, Split and Merge; Merge with two lanes and a step below is done at once', async () => {
  await gapMenu('trunk:2', null);                       // above PNCH, in lane 1
  assert.ok(testId('gap-add') && testId('gap-split') && testId('gap-merge'));
  await click(testId('gap-merge'));
  await settle(350);
  assert.equal(testId('flow-problems'), null, 'the lane is closed');
  assert.match(testId('step-card-s71').textContent, /Lane 2 meets here — this step waits for its last step too\./);
  assert.equal(testId('save-steps').disabled, false);
  assert.match(bar(), /3 changes not saved · 2 steps added · 1 operation replaced/);
  await gapMenu('trunk:3', null);                       // after the merge: Add and Split again
  assert.equal(testId('gap-merge'), null);
  await closeMenu();
});
await check('the arrows move a step in its lane; a move that makes no sense is refused in words; Undo takes a change back', async () => {
  await click(byLabel('Move step QC down'));           // QC below PNCH, where lane 2 meets: PNCH still waits for lane 2
  await settle();
  assert.equal(drawn(), '1/1 CUT · 2/2 CUT · 3/1 PNCH · 4/1 QC');
  await click(testId('undo-step'));
  await settle();
  assert.equal(drawn(), '1/1 CUT · 2/1 QC · 2/2 CUT · 3/1 PNCH');
  await click(byLabel('Move step PNCH to the lane on its right'));   // a meeting step does not leave its lane
  await settle();
  assert.match(errors[errors.length - 1] ?? '', /PNCH is where lanes meet/);
  assert.equal(drawn(), '1/1 CUT · 2/1 QC · 2/2 CUT · 3/1 PNCH');
  assert.equal(writes().length, 0);
});
await check('Save sends the whole picture once; a refusal shows every problem and stays in edit mode', async () => {
  await click(testId('save-steps'));
  await settle(50);
  const puts = calls.filter((c) => c.method === 'PUT');
  assert.equal(puts.length, 1);
  const sent = puts[0].body.steps;
  const [qc, cut2] = [sent[1].key, sent[2].key];
  assert.deepEqual(sent, [
    { id: 70, key: 's70', operationId: 1, stepName: null, notes: null, lane: 0, after: [], waits: [] },
    { key: qc, operationId: 4, stepName: null, notes: null, lane: 0, after: ['s70'], waits: [] },
    { key: cut2, operationId: 1, stepName: null, notes: null, lane: 1, after: ['s70'], waits: [] },
    { id: 71, key: 's71', operationId: 3, stepName: 'Holes', notes: null, lane: 0, after: [qc, cut2], waits: [{ id: 5 }] },
  ]);
  assert.match(bar(), /CG-PLATEPART cannot be saved like this\./);
  assert.match(bar(), /Step 4 \(PNCH\): Operation PNCH is inactive\./);
  assert.match(bar(), /3 changes not saved/, 'still in edit mode, nothing lost');
  assert.equal(toasts.length, 0);
});
await check('Save again: one more request, the summary is toasted and the page is back in view mode — lanes drawn read-only', async () => {
  refuseSave = false;
  await click(testId('save-steps'));
  await settle(50);
  assert.equal(writes().length, 2);
  assert.equal(writes().every((c) => c.method === 'PUT' && c.path === '/flows/7/steps'), true, 'the per-step routes are never called');
  assert.deepEqual(toasts, ['2 steps added, 1 operation replaced.']);
  assert.equal(testId('flow-edit-bar'), null);
  assert.deepEqual(numbersShown(), ['10', '20', '30']);
  assert.equal(drawn(), '1/1 CUT · 2/1 QC · 2/2 CUT · 3/1 PNCH');
  assert.match(testId('step-card-s71').textContent, /Lane 2 meets here/);
  assert.equal(document.querySelectorAll('[data-mark="new"], [data-mark="changed"]').length, 0);
  assert.equal(document.querySelector('[data-testid^="gap-"]'), null);
});
await check('removing a lane\'s only step removes the lane; the step is listed as removed; Cancel asks first and puts the saved flow back', async () => {
  await click(testId('edit-steps'));
  await settle();
  await click([...document.querySelectorAll('[aria-label="Remove step CUT"]')].find((b) => b.closest('[data-testid="flow-cell-s73"]')));
  await settle();
  assert.equal(testId('flow-steps').getAttribute('data-lanes'), '1');
  assert.equal(drawn(), '1/1 CUT · 2/1 QC · 3/1 PNCH');
  assert.match(testId('removed-steps').textContent, /Removed.*Plasma cutting/);
  assert.match(bar(), /1 change not saved · 1 removed/);
  await click(button('Cancel'));
  await settle(50);
  assert.match(document.body.textContent, /Discard the changes\?/);
  await click(button('Discard changes'));
  await settle(350);
  assert.equal(testId('flow-edit-bar'), null);
  assert.equal(drawn(), '1/1 CUT · 2/1 QC · 2/2 CUT · 3/1 PNCH');
  assert.equal(writes().length, 2, 'cancel sends nothing');
});
await check('Cancel with no changes leaves edit mode at once', async () => {
  await click(testId('edit-steps'));
  await settle();
  await click(button('Cancel'));
  await settle(50);
  assert.equal(testId('flow-edit-bar'), null);
});
await check('Merge asks which lanes meet, which lane goes on, and the step they meet at — a lane closed into another lane', async () => {
  await click(testId('edit-steps'));
  await settle();
  await click(byLabel('Lane 2: add, split or merge after CUT'));     // lane 2's own bottom gap
  await settle(50);
  await click(testId('gap-split'));
  await settle(350);
  await pickOperation('DRL');
  await click(button('Split'));
  await settle(50);
  assert.equal(drawn(), '1/1 CUT · 2/1 QC · 2/2 CUT · 3/1 PNCH · 3/3 DRL');
  assert.match(testId('flow-problems').textContent, /Lane 3 \(ends at DRL\) is still open/);
  await click(byLabel('Lane 3: add, split or merge after DRL'));
  await settle(50);
  await click(testId('gap-merge'));
  await settle(350);
  assert.match(document.body.textContent, /Which lanes meet here\?/);
  const boxes = [...document.querySelectorAll('[role="dialog"] input[type="checkbox"]')];
  assert.deepEqual(boxes.map((b) => [b.getAttribute('aria-label'), b.checked, b.disabled]), [
    ['Lane 1 — ends at PNCH', false, false], ['Lane 2 — ends at CUT', true, false], ['Lane 3 — ends at DRL', true, true],
  ], 'this lane, and by default the lane on its left');
  assert.equal(testId('merge-target').value, 'l73', 'it continues in lane 2, the leftmost of the chosen');
  assert.equal(testId('merge-at').value, 'new', 'no step of lane 2 is below where lane 3 split off: a new step');
  assert.equal(button('Merge').disabled, true, 'the new step needs its operation');
  await pickOperation('QC', 'merge-operation');
  await click(button('Merge'));
  await settle(350);
  assert.equal(testId('flow-problems'), null);
  assert.equal(drawn(), '1/1 CUT · 2/1 QC · 2/2 CUT · 3/3 DRL · 4/2 QC · 5/1 PNCH');
  assert.match(bar(), /2 changes not saved · 2 steps added/);
  await click(button('Cancel'));
  await settle(50);
  await click(button('Discard changes'));
  await settle(350);
  assert.equal(writes().length, 2);
});

await React.act(async () => { root.unmount(); });
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 50);
