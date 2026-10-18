// Run from multi_app_fe: node scripts/cf_erp_screen_fixes_test.mjs
// Screen fixes from the production walkthrough of 2026-10-18 (TM/walkthrough/log.md, log2.md), rendered in jsdom:
//   (8)  full screen keeps what is typed (the frame never remounts the step); unsaved edits ask Save / Discard / Stay
//        before a link, another tab or folding the line takes them away;
//   (11) PR quote cells: a focused cell is never overwritten by a server answer, a slow early answer never puts back a
//        later one, Enter saves and moves down, a bad rate is never sent (lib/quoteCells);
//   (14) the stage foot's tooltips are not interactive and open beside their buttons;
//   (18) section sizes: the nearest sizes' words and the values of a new size (lib/sectionPick); the picker shows the
//        nearest sizes when the typed one is not in the catalog and offers "Add … to the catalog".
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/purchase-requests/61', pretendToBeVisual: true });
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
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
      export { React, createRoot, MemoryRouter, Routes, Route, Link, useLocation };
      export { FullScreenFrame } from './src/apps/cf_erp/components/FullScreen';
      export { useUnsavedGuard, leavingTarget } from './src/apps/cf_erp/hooks/useUnsavedGuard';
      export { UnsavedDialog } from './src/apps/cf_erp/components/UnsavedGuard';
      export * as QC from './src/apps/cf_erp/lib/quoteCells';
      export * as SP from './src/apps/cf_erp/lib/sectionPick';
      export { SectionPicker } from './src/apps/cf_erp/components/SectionPicker';
      export { StageFoot } from './src/apps/cf_erp/components/OrderProcess/StageFoot';
      export { default as PurchaseRequestDetail } from './src/apps/cf_erp/pages/PurchaseRequestDetail';`,
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
const artifact = resolve(cache, `screen-fixes-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter, Routes, Route, Link, useLocation, QC, SP } = m;
const h = React.createElement;

let passed = 0, failed = 0;
const check = async (label, fn) => { if (process.env.ONLY && !label.includes(process.env.ONLY)) return; try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const src = (p) => readFileSync(resolve('src', p), 'utf8');
const app = document.getElementById('app');
let root = null;
const mount = async (el) => {
  if (root) { await React.act(async () => { root.unmount(); }); root = null; }
  document.querySelectorAll('.MuiDialog-root, .MuiPopover-root, .MuiMenu-root, .MuiAutocomplete-popper').forEach((n) => n.remove());
  app.replaceChildren();
  const host = document.createElement('div'); app.appendChild(host);
  root = createRoot(host);
  await React.act(async () => { root.render(el); await sleep(40); });
};
const settle = async (ms = 40) => { await React.act(async () => { await sleep(ms); }); };
const qa = (id, scope = document) => [...scope.querySelectorAll(`[data-testid="${id}"]`)];
const q1 = (id, scope = document) => scope.querySelector(`[data-testid="${id}"]`);
const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const click = async (el) => { await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); await sleep(30); }); };
const setValue = async (el, v) => {
  await React.act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(10); });
};
const focusIn = async (el) => { await React.act(async () => { el.focus(); el.dispatchEvent(new dom.window.FocusEvent('focusin', { bubbles: true })); await sleep(10); }); };
const blur = async (el) => { await React.act(async () => { el.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true })); await sleep(40); }); };
const key = async (el, k, more = {}) => { await React.act(async () => { el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...more })); await sleep(30); }); };
const reset = () => { globalThis.__calls = []; globalThis.__routes = {}; globalThis.__user = null; };

// ── (8) full screen never remounts the step ─────────────────────────────────────────
await check('full screen: entering and leaving keeps what the step holds (no remount); off it adds no box of its own', async () => {
  let mounts = 0;
  function Step() {
    const [typed, setTyped] = React.useState('');
    React.useEffect(() => { mounts++; }, []);
    return h('input', { 'data-testid': 'typed', value: typed, onChange: (e) => setTyped(e.target.value) });
  }
  function Host() {
    const [on, setOn] = React.useState(false);
    return h('div', null, h('button', { 'data-testid': 'toggle', onClick: () => setOn((v) => !v) }, 'fs'), h(m.FullScreenFrame, { on, onExit: () => setOn(false) }, h(Step)));
  }
  await mount(h(Host));
  await setValue(q1('typed'), '20 values typed');
  assert.equal(q1('full-screen-frame'), null);
  await click(q1('toggle'));
  assert.ok(q1('full-screen-frame'), 'full screen');
  assert.equal(q1('typed').value, '20 values typed', 'kept going into full screen');
  await click(q1('toggle'));
  assert.equal(q1('full-screen-frame'), null);
  assert.equal(q1('typed').value, '20 values typed', 'kept coming out of full screen');
  assert.equal(mounts, 1, 'the step was mounted once');
  // Esc while typing in a field belongs to the field, not to the frame.
  await click(q1('toggle'));
  await key(q1('typed'), 'Escape');
  assert.ok(q1('full-screen-frame'), 'Esc in a field does not leave full screen');
  await React.act(async () => { window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' })); await sleep(20); });
  assert.equal(q1('full-screen-frame'), null, 'Esc elsewhere does');
});

// ── (8) unsaved edits: Save / Discard / Stay ─────────────────────────────────────────
const guardHost = ({ onSave, onDiscard, lineId = 7 }) => {
  function Where() { return h('div', { 'data-testid': 'where' }, useLocation().pathname); }
  function Panel() {
    const [dirty, setDirty] = React.useState(true);
    const guard = m.useUnsavedGuard({ active: dirty, lineId, onSave: async () => { const ok = await onSave(); if (ok) setDirty(false); return ok; }, onDiscard: () => { onDiscard(); setDirty(false); } });
    return h('div', null,
      h(Link, { to: '/elsewhere', 'data-testid': 'leave' }, 'Elsewhere'),
      h('button', { 'data-testid': 'fold-mine', 'data-guard-line': String(lineId) }, 'fold mine'),
      h('button', { 'data-testid': 'fold-other', 'data-guard-line': '99' }, 'fold other'),
      h('span', { 'data-testid': 'dirty' }, String(dirty)),
      h(m.UnsavedDialog, { guard, count: 20 }));
  }
  return h(MemoryRouter, { initialEntries: ['/here'] }, h(Where), h(Routes, null, h(Route, { path: '/here', element: h(Panel) }), h(Route, { path: '/elsewhere', element: h('div', null, 'gone') })));
};
await check('unsaved edits: a link is held and asks Save / Discard / Stay; Stay keeps the screen and the edits', async () => {
  let saved = 0, discarded = 0;
  await mount(guardHost({ onSave: async () => { saved++; return true; }, onDiscard: () => { discarded++; } }));
  await click(q1('leave'));
  assert.equal(text(q1('where')), '/here', 'not navigated yet');
  assert.ok(q1('unsaved-dialog'), 'asked');
  assert.match(text(q1('unsaved-dialog')), /20 changes to this BOM are not saved/);
  await click(q1('unsaved-stay')); await settle(250);
  assert.equal(text(q1('where')), '/here');
  assert.equal(text(q1('dirty')), 'true');
  assert.equal(saved + discarded, 0);
});
await check('unsaved edits: Discard drops them and the held link goes on', async () => {
  let discarded = 0;
  await mount(guardHost({ onSave: async () => true, onDiscard: () => { discarded++; } }));
  await click(q1('leave'));
  await click(q1('unsaved-discard')); await settle();
  assert.equal(discarded, 1);
  assert.equal(text(q1('where')), '/elsewhere', 'navigated after Discard');
});
await check('unsaved edits: Save saves first, then goes on; a failed save stays', async () => {
  let saved = 0;
  await mount(guardHost({ onSave: async () => { saved++; return false; }, onDiscard: () => {} }));
  await click(q1('leave'));
  await click(q1('unsaved-save')); await settle();
  assert.equal(saved, 1); assert.equal(text(q1('where')), '/here', 'a failed save stays');
  await mount(guardHost({ onSave: async () => { saved++; await sleep(20); return true; }, onDiscard: () => {} }));
  await click(q1('leave'));
  await click(q1('unsaved-save')); await settle(80);
  assert.equal(saved, 2); assert.equal(text(q1('where')), '/elsewhere', 'saved, then navigated');
});
await check('unsaved edits: folding THIS line is held, another line\'s fold is not; a tab not selected is leaving', async () => {
  await mount(guardHost({ onSave: async () => true, onDiscard: () => {} }));
  await click(q1('fold-other'));
  assert.equal(q1('unsaved-dialog'), null, 'another line folds freely');
  await click(q1('fold-mine'));
  assert.ok(q1('unsaved-dialog'), 'folding this line asks');
  const tab = document.createElement('button'); tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', 'false');
  const sel = document.createElement('button'); sel.setAttribute('role', 'tab'); sel.setAttribute('aria-selected', 'true');
  const blank = document.createElement('a'); blank.href = '/x'; blank.target = '_blank';
  assert.equal(m.leavingTarget(tab, 7), tab);
  assert.equal(m.leavingTarget(sel, 7), null);
  assert.equal(m.leavingTarget(blank, 7), null, 'a new browser tab is not leaving');
  const all = document.createElement('button'); all.setAttribute('data-guard-line', 'all');
  assert.equal(m.leavingTarget(all, 7), all, '"all" (the stage foot, fold every line) is leaving for every line');
});
await check('the BOM panel uses the guard (Save / Discard / Stay), Ctrl+S, and marks its line; the step marks its folds and the foot', async () => {
  const panel = src('apps/cf_erp/components/Bom/BomPanel.tsx');
  assert.match(panel, /useUnsavedGuard\(\{ active: editOn && dirty, lineId: gridLineId/);
  assert.match(panel, /<UnsavedDialog guard=\{guard\}/);
  assert.match(panel, /e\.key\.toLowerCase\(\) !== 's'/);
  assert.ok(!/window\.confirm/.test(panel), 'no bare OK / Cancel any more');
  const step = src('apps/cf_erp/components/OrderStructure/OrderStructureStep.tsx');
  assert.match(step, /data-guard-line=\{isOpen \? l\.id : undefined\}/);
  assert.match(step, /aria-label="Fold every line" data-guard-line="all"/);
  assert.match(step, /SectionCard title="Structure & values" sx=\{\{ overflow: 'clip' \}\}/, 'the card no longer traps the sticky save bar');
  assert.match(src('apps/cf_erp/components/OrderProcess/StageFoot.tsx'), /data-guard-line="all"/);
  // The grid's fill height stops growing once its top has scrolled off, so what is below it can be reached.
  assert.match(src('shared/ui/SheetGrid.tsx'), /window\.innerHeight - Math\.max\(0, box\.getBoundingClientRect\(\)\.top\) - 72/);
});

// ── (14) the stage foot's tooltips ───────────────────────────────────────────────────
await check('stage foot: tooltips are not interactive, wait, and open beside their buttons (never over the one above)', async () => {
  const foot = src('apps/cf_erp/components/OrderProcess/StageFoot.tsx');
  assert.match(foot, /const FOOT_TIP = \{ disableInteractive: true, enterDelay: 500/);
  assert.match(foot, /<Tooltip \{\.\.\.FOOT_TIP\} placement="right"/);
  assert.match(foot, /<Tooltip \{\.\.\.FOOT_TIP\} placement="left"/);
  const stages = [{ stageKey: 'execution_plan', label: 'Execution plan', state: 'todo', optional: false, detail: '' }, { stageKey: 'lock', label: 'Freeze design', state: 'todo', optional: false, detail: '' }];
  let went = null;
  await mount(h(m.StageFoot, { stages, current: stages[0], onGo: (k) => { went = k; } }));
  const fwd = [...document.querySelectorAll('button')].find((b) => /Freeze design/.test(text(b)));
  assert.ok(fwd, 'the way on');
  await click(fwd);
  assert.equal(went, 'lock');
});

// ── (11) PR quote cells ──────────────────────────────────────────────────────────────
await check('quote cells (pure): a focused / sending / typed-ahead cell keeps its text; an idle one takes the server\'s', () => {
  let d = QC.draftOf('62000');
  d = { ...d, focused: true, text: '6150' };
  assert.equal(QC.reconcile(d, '62000').text, '6150', 'focused: never overwritten');
  assert.equal(QC.reconcile(d, '70000').base, '70000', 'but the base moves');
  d = { ...d, focused: false, sent: '61500', text: '61500' };
  assert.equal(QC.reconcile(d, '62000').text, '61500', 'its own save is on its way');
  d = QC.settle(d, '61500');
  assert.deepEqual([d.text, d.base, d.sent], ['61500', '61500', null], 'the save answered');
  assert.equal(QC.reconcile({ ...d, text: '61' }, '61500').text, '61', 'typed, not sent yet: kept');
  assert.equal(QC.reconcile(d, '63000').text, '63000', 'idle: the server wins (another person, a re-read)');
  assert.equal(QC.toSend(QC.draftOf('5')), null, 'nothing changed: nothing to send');
  assert.equal(QC.toSend({ ...QC.draftOf('5'), text: ' 6 ' }), '6');
  assert.equal(QC.toSend({ ...QC.draftOf('5'), text: '6', sent: '6' }), null, 'never twice at once');
  // Typed on while a save was on its way: the answer does not replace the newer text.
  const ahead = QC.settle({ text: '615', base: '600', focused: false, sent: '61' }, '61');
  assert.equal(ahead.text, '615'); assert.equal(QC.toSend(ahead), '615', 'and it goes next');
  const failedSave = QC.settle({ text: '61', base: '60', focused: false, sent: '61' }, null);
  assert.equal(failedSave.text, '61', 'a failed save keeps the text, to try again');
  assert.equal(QC.parseRate(''), null); assert.equal(QC.parseRate('62.5'), 62.5); assert.equal(QC.parseRate('₹ 1,25,000'), 125000);
  assert.equal(QC.parseRate('62..5'), 'invalid'); assert.equal(QC.parseRate('abc'), 'invalid'); assert.equal(QC.parseRate('-5'), 'invalid');
});

const PB = { id: 101, code: 'PL-10', name: 'Plate 10', uom: 'kg' };
const PS = { id: 102, code: 'PL-12', name: 'Plate 12', uom: 'kg' };
const prLine = (id, item, extra = {}) => ({ id, item, needed: 3, poRaised: 0, received: 0, open: 3, statusLabel: 'To order', ...extra });
const prFixture = (quotes = { 71: { rate: 71000, deliveryDays: 10, remark: null }, 72: { rate: 62000, deliveryDays: 7, remark: null } }) => ({
  id: 61, code: 'PR-000061', status: 'open', statusLabel: 'Open', today: '2026-10-18', requisition: { id: 41, code: 'MR-1' },
  order: null, line: null, canEdit: true, createdAt: '2026-10-18', notes: null,
  lines: [prLine(71, PB), prLine(72, PS)],
  vendors: [{ id: 81, supplier: { id: 31, code: null, name: 'Vendor A' }, quotes, purchaseOrders: [] }],
  purchaseOrders: [], counts: { lines: 2, open: 2, vendors: 1 },
});
const prPage = () => h(MemoryRouter, { initialEntries: ['/testco/cf_erp/purchase-requests/61'] }, h(Routes, null, h(Route, { path: '/:company/cf_erp/purchase-requests/:id', element: h(m.PurchaseRequestDetail) })));
const rateOf = (lineId) => [...document.querySelectorAll('[data-testid="pr-rate"]')].find((r) => r.closest(`[data-line="${lineId}"]`));

await check('PR grid: a server answer (another cell\'s save) never overwrites the cell being typed in', async () => {
  reset(); globalThis.__user = { uiPermissions: ['cf_erp_inventory_manage', 'cf_erp_inventory_view'] };
  globalThis.__routes['GET /purchase-requests/61'] = () => prFixture();
  // The server answers line 71's save with line 72 still at 62000 — while line 72 is being typed in.
  globalThis.__routes['PUT /purchase-request-vendors/81/quotes'] = async (b) => { await sleep(20); const q = b.quotes[0]; return prFixture({ 71: { rate: q.lineId === 71 ? q.rate : 71000, deliveryDays: 10, remark: null }, 72: { rate: q.lineId === 72 ? q.rate : 62000, deliveryDays: 7, remark: null } }); };
  await mount(prPage());
  const a = rateOf(71), b = rateOf(72);
  await focusIn(a); await setValue(a, '70500'); await blur(a);
  await focusIn(b); await setValue(b, '615');     // typing in 72 while 71's answer comes back
  await settle(60);
  assert.equal(rateOf(72).value, '615', 'the typed text stays under the cursor');
  assert.equal(rateOf(71).value, '70500', 'the saved cell shows what was saved');
  await setValue(b, '61500'); await blur(b); await settle(60);
  const puts = globalThis.__calls.filter((c) => c.method === 'PUT');
  assert.deepEqual(puts.map((c) => c.body.quotes[0]), [{ lineId: 71, rate: 70500, deliveryDays: 10, remark: null }, { lineId: 72, rate: 61500, deliveryDays: 7, remark: null }], 'each cell saved once, with its full text');
  assert.equal(rateOf(72).value, '61500');
});
await check('PR grid: a slow early answer never puts back what a later save changed', async () => {
  reset(); globalThis.__user = { uiPermissions: ['cf_erp_inventory_manage', 'cf_erp_inventory_view'] };
  let state = { 71: { rate: 71000, deliveryDays: 10, remark: null }, 72: { rate: 62000, deliveryDays: 7, remark: null } };
  globalThis.__routes['GET /purchase-requests/61'] = () => prFixture(state);
  globalThis.__routes['PUT /purchase-request-vendors/81/quotes'] = async (b) => {
    const q = b.quotes[0];
    state = { ...state, [q.lineId]: { ...state[q.lineId], rate: q.rate } };
    const snap = prFixture(state);
    await sleep(q.lineId === 71 ? 120 : 10);   // 71's answer is slow, 72's fast
    return snap;
  };
  await mount(prPage());
  await setValue(rateOf(71), '70000'); await blur(rateOf(71));
  await setValue(rateOf(72), '60000'); await blur(rateOf(72));
  await settle(200);
  assert.equal(rateOf(72).value, '60000', '72 keeps the later save, though 71\'s older answer came last');
  assert.equal(rateOf(71).value, '70000');
});
await check('PR grid: Enter saves and moves down the column; Esc puts back the saved rate; a bad rate is said, never sent', async () => {
  reset(); globalThis.__user = { uiPermissions: ['cf_erp_inventory_manage', 'cf_erp_inventory_view'] };
  globalThis.__routes['GET /purchase-requests/61'] = () => prFixture();
  globalThis.__routes['PUT /purchase-request-vendors/81/quotes'] = () => prFixture();
  await mount(prPage());
  await focusIn(rateOf(71)); await setValue(rateOf(71), '72000');
  await key(rateOf(71), 'Enter'); await settle(30);
  assert.equal(document.activeElement, rateOf(72), 'Enter moved down');
  assert.equal(globalThis.__calls.filter((c) => c.method === 'PUT').length, 1, 'and saved');
  await setValue(rateOf(72), '61,000x');
  await key(rateOf(72), 'Escape');
  assert.equal(rateOf(72).value, '62000', 'Esc: the saved rate is back');
  await setValue(rateOf(72), '6x1'); await blur(rateOf(72));
  assert.equal(globalThis.__calls.filter((c) => c.method === 'PUT').length, 1, 'a bad rate is not sent');
  assert.match(text(document.body), /A rate is a number/);
});
await check('PR grid: the frozen Line column is frozen from md up only, and narrower', () => {
  const pr = src('apps/cf_erp/pages/PurchaseRequestDetail.tsx');
  assert.match(pr, /position: \{ xs: 'static', md: 'sticky' \}/);
  assert.match(pr, /<Box component="th" sx=\{\{ \.\.\.headSx, \.\.\.FROZEN \}\}>Line<\/Box>/);
  const grid = src('shared/ui/SheetGrid.tsx');
  assert.match(grid, /position: \{ xs: 'static', sm: 'sticky' \}/, 'the BOM grid\'s frozen column scrolls on a phone');
  assert.match(grid, /min\(\$\{w\}px, max\(40vw, 100vw - 700px\), 50vw\)/, 'and is narrower on a small window');
});

// ── (18) section sizes ───────────────────────────────────────────────────────────────
const bar = (id, legs, t, grade = 'E250', len = 10000) => ({ id, code: `ISA-${id}`, name: `ISA ${legs[0]} x ${legs[1]} x ${t} x ${len} ${grade} BO`, depth: legs[0], width: legs[1], thickness: t, lengthMm: len, sectionArea: null, grade, nodeName: 'Angles' });
const near = {
  size: { profile: null, dims: [110, 110, 12], lengthMm: null }, exact: [],
  nearest: [
    { key: 'a', label: '100 × 100 × 12', profile: 'ISA', distance: 0.09, differs: 'legs 10 mm smaller', weight: 'lighter', weightPct: -10, bars: [bar(1, [100, 100], 12), bar(2, [100, 100], 12, 'E350')] },
    { key: 'b', label: '130 × 130 × 12', profile: 'ISA', distance: 0.18, differs: 'legs 20 mm bigger', weight: 'heavier', weightPct: 19, bars: Array.from({ length: 8 }, (_, i) => bar(10 + i, [130, 130], 12)) },
  ],
  like: bar(1, [100, 100], 12),
};
await check('section sizes (pure): the nearest sizes in words, at most six bars a size, the new size\'s values', () => {
  assert.equal(SP.sizeLabel(near.size), '110 × 110 × 12');
  assert.equal(SP.sizeLabel({ profile: 'ISA', dims: [110], lengthMm: null }), 'ISA 110');
  assert.equal(SP.nearWords(near.nearest[0]), '100 × 100 × 12 — legs 10 mm smaller · about 10% lighter');
  assert.equal(SP.nearWords(near.nearest[1]), '130 × 130 × 12 — legs 20 mm bigger · about 19% heavier');
  assert.equal(SP.nearWords({ label: 'x', differs: 'y', weight: 'same', weightPct: 0 }), 'x — y · about the same weight');
  const opts = SP.nearOptions(near.nearest);
  assert.equal(opts.length, 2 + SP.BARS_PER_SIZE);
  assert.equal(opts.at(-1).more, 2, 'the last bar of a size says how many more there are');
  assert.deepEqual(SP.newSizeValues(near.size, near.like), { DEPTH: '110', WIDTH: '110', THICKNESS: '12' });
  assert.deepEqual(SP.newSizeValues({ profile: null, dims: [100, 150, 10], lengthMm: null }, { depth: 65, width: 100, thickness: 8 }), { DEPTH: '100', WIDTH: '150', THICKNESS: '10' }, 'the longer leg where the like bar has it');
  assert.equal(SP.canAddSize(near.size, [], near.like), true);
  assert.equal(SP.canAddSize(near.size, [bar(5, [110, 110], 12)], near.like), false, 'not when the size exists');
  assert.equal(SP.canAddSize({ profile: 'ISA', dims: [110], lengthMm: null }, [], near.like), false, 'not from one number');
});
await check('section picker: a size the catalog lacks shows the nearest sizes, grouped, and offers "Add 110 × 110 × 12 to the catalog"', async () => {
  reset();
  globalThis.__routes['GET /section-stock'] = (_, url) => (/search=110/.test(url) ? [] : [bar(1, [100, 100], 12)]);
  globalThis.__routes['GET /section-stock/nearest'] = () => near;
  let picked = null;
  await mount(h(m.SectionPicker, { value: null, onPick: (r) => { picked = r; } }));
  const input = q1('section-picker');
  await React.act(async () => { input.focus(); input.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })); await sleep(0); });
  await setValue(input, '110 x 110 x 12');
  await settle(400);
  assert.ok(globalThis.__calls.some((c) => c.path === '/section-stock/nearest' && /search=110/.test(c.url)), 'asked for the nearest');
  const groups = qa('section-group').map(text);
  assert.ok(groups.some((g) => /Nearest: 100 × 100 × 12 — legs 10 mm smaller · about 10% lighter/.test(g)), groups.join(' | '));
  assert.ok(groups.some((g) => /130 × 130 × 12 .*heavier/.test(g)));
  assert.match(text(document.body), /No 110 × 110 × 12 in the catalog — the nearest sizes are listed/);
  assert.match(text(q1('section-add-size')), /Add 110 × 110 × 12 to the catalog/);
  const opt = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.includes('ISA-2'));
  await click(opt);
  assert.equal(picked?.id, 2, 'a near bar can be picked');
});

if (root) await React.act(async () => { root.unmount(); });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
