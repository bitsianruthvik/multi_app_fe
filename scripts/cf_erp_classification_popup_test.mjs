// Run from multi_app_fe: node scripts/cf_erp_classification_popup_test.mjs
// Classification is managed from the screens that use it: a "Classification" button on Items opens a pop-up with the
// screen's DERIVED tree and counts; adding stamps createdIn for that screen; a refused retire shows the backend's words;
// the classification picker has "Show all branches" at the bottom of its list; and the Items kind chips are answered
// by the server (Temporary asks for kind=temporary, All for kinds=catalog,temporary) with counts from kindCounts.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/items', pretendToBeVisual: true });
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

// ── the fake server ───────────────────────────────────────────────────────
const calls = [];
let routes = {};
globalThis.__api = async (url, opts = {}) => {
  const method = opts.method ?? 'GET';
  const path = url.replace(/^\/api\/testco\/cf_erp/, '');
  calls.push({ method, path, body: opts.body });
  for (const [pattern, fn] of Object.entries(routes)) {
    const [m, p] = pattern.split(' ');
    if (m === method && (p.endsWith('*') ? path.startsWith(p.slice(0, -1)) : path === p)) return fn(path, opts.body);
  }
  return method === 'GET' ? [] : { ok: true };
};
const refuse = (status, body) => { throw new Error(`API request failed: ${status} Conflict - ${JSON.stringify(body)}`); };

const stubs = {
  '@core/api/client': 'export async function apiFetch(url, opts) { return globalThis.__api(url, opts); }',
  '@core/contexts/AuthContext': 'export const useAuth = () => ({ user: null });',
};
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom';
      export { React, createRoot, MemoryRouter };
      export * from './src/apps/cf_erp/lib/classificationScreens';
      export * from './src/apps/cf_erp/lib/records';
      export { ClassificationManager } from './src/apps/cf_erp/components/ClassificationManager';
      export { ClassificationPicker } from './src/apps/cf_erp/components/ClassificationPicker';
      export { default as Records } from './src/apps/cf_erp/pages/Records';
      export { ToastProvider } from './src/apps/cf_erp/components/Toast';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/(api\/client|contexts\/AuthContext)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
  } }],
  alias: { '@shared/ui': resolve('src/shared/ui/index.ts') },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `classification-popup-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const app = document.getElementById('app');
let root = null;
const render = async (el) => {
  if (root) await React.act(async () => root.unmount());
  app.replaceChildren(); document.body.querySelectorAll('.MuiDialog-root, .MuiPopper-root, .MuiAutocomplete-popper').forEach((n) => n.remove());
  const host = document.createElement('div'); app.appendChild(host); root = createRoot(host);
  const wrapped = m.ToastProvider ? React.createElement(m.ToastProvider, null, el) : el;
  await React.act(async () => { root.render(React.createElement(MemoryRouter, { initialEntries: ['/testco/cf_erp/items'] }, wrapped)); await sleep(0); });
  await settle();
};
const settle = async () => { await React.act(async () => { await sleep(40); }); };
const click = async (el) => { assert.ok(el, 'nothing to click'); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })); el.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true })); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await settle(); };
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const q = (id) => document.querySelector(`[data-testid="${id}"]`);
const type = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await React.act(async () => { setter.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(0); });
};
const inputLabelled = (label) => {
  const lab = [...document.querySelectorAll('label')].find((l) => l.textContent.replace('*', '').trim() === label);
  return lab ? document.getElementById(lab.getAttribute('for')) : null;
};

// ── fixtures: the Items screen's tree ─────────────────────────────────────
const node = (id, parentId, depth, name, sub, why, children = [], extra = {}) => ({
  id, parentId, depth, level: ['Family', 'Subfamily', 'Variant'][depth], scope: 'both', code: name.toUpperCase().replace(/\W/g, ''), name,
  description: null, sortOrder: 0, status: 'active', createdIn: null, itemCount: depth === 2 ? sub.items : 0, definitionCount: depth === 2 ? sub.definitions : 0,
  machineCount: 0, ruleCount: 0, selectionSources: 0, subtree: { machines: 0, ...sub }, visibleBecause: why, children, ...extra,
});
const itemsTree = {
  screen: 'items', all: false, levels: ['Family', 'Subfamily', 'Variant'], leafDepth: 2, hiddenCount: 2,
  roots: [
    node(1, null, 0, 'Steel', { items: 1472, definitions: 1 }, ['holds_items'], [
      node(2, 1, 1, 'Plates', { items: 1472, definitions: 1 }, ['holds_items'], [node(3, 2, 2, 'E350', { items: 1472, definitions: 1 }, ['holds_items'])]),
    ]),
    node(9, null, 0, 'Empty from items', { items: 0, definitions: 0 }, ['created_here'], [], { createdIn: 'items' }),
  ],
};
const allTree = {
  ...itemsTree, all: true,
  roots: [...itemsTree.roots, node(20, null, 0, 'Fabricated', { items: 0, definitions: 19 }, [], [
    node(21, 20, 1, 'Girders', { items: 0, definitions: 19 }, [], [node(22, 21, 2, 'Plate girder', { items: 0, definitions: 19 }, [], [], { hidden: true })], { hidden: true }),
  ], { hidden: true })],
};

await check('words: holdings text matches the backend refusal, reasons read as words', () => {
  assert.equal(m.holdingsText({ items: 3, definitions: 1, machines: 0 }), '3 items · 1 definition · 0 machines');
  assert.equal(m.reasonText(['holds_items', 'selection_source']), 'holds items · a selection picks from it');
  assert.equal(m.screenTreePath('definitions', true), '/classification?screen=definitions&all=1');
  assert.deepEqual(m.kindQuery('item', ''), { kinds: 'catalog,temporary' });
  assert.deepEqual(m.kindQuery('item', 'temporary'), { kind: 'temporary' });
  assert.deepEqual(m.kindQuery('definition', ''), {});
  assert.equal(m.kindCount('item', '', { catalog: 1426, temporary: 208, template: 0, selection: 0 }), 1634);
});

const recordsRoutes = () => ({
  'GET /classification?screen=items': () => itemsTree,
  'GET /classification?screen=items&all=1': () => allTree,
  'GET /rules*': () => [],
  'GET /classification/1/resolved': () => ({ mode: 'setup', chain: [], specs: [], missingRequired: [], problems: [], unassignedValues: [] }),
  'GET /classification/9/resolved': () => ({ mode: 'setup', chain: [], specs: [], missingRequired: [], problems: [], unassignedValues: [] }),
  'GET /records*': (path) => ({ total: path.includes('kind=temporary') ? 208 : path.includes('kind=catalog') ? 1426 : 1634, rows: [], kindCounts: { catalog: 1426, temporary: 208, template: 0, selection: 0 } }),
});

await check('Items: the Classification button opens the pop-up with the screen\'s derived tree and counts', async () => {
  routes = recordsRoutes();
  calls.length = 0;
  await render(React.createElement(m.Records, { recordKind: 'item' }));
  assert.ok(calls.some((c) => c.path === '/classification?screen=items'), 'the page reads its own screen tree');
  await click(button('Classification'));
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog, 'pop-up open');
  assert.match(dialog.textContent, /Classification — Items/);
  assert.ok(q('cls-node-1') && q('cls-node-9'), 'Steel and the items-made empty family are listed');
  assert.ok(!q('cls-node-20'), 'a definitions-only family is not on Items');
  assert.equal(q('cls-count-1').textContent, '1,472');
  assert.match(q('cls-hidden-note').textContent, /2 other branches hold nothing for Items/);
  await click(q('cls-node-1').querySelector('.tree-row'));
  assert.match(q('cls-holds').textContent, /Holds 1,472 items · 1 definition · 0 machines/);
});

await check('Items: adding a family stamps createdIn=items', async () => {
  routes['POST /classification'] = () => ({ id: 77 });
  calls.length = 0;
  await click(button('Add family'));
  await type(inputLabelled('Code'), 'NEWF');
  await type(inputLabelled('Name'), 'New family');
  await click(button('Create'));
  const post = calls.find((c) => c.method === 'POST' && c.path === '/classification');
  assert.ok(post, 'POST sent');
  assert.equal(post.body.createdIn, 'items');
  assert.equal(post.body.parentId, null);
  assert.equal(post.body.code, 'NEWF');
});

await check('Items: a refused retire shows the backend\'s words in the confirm', async () => {
  routes['DELETE /classification/1'] = () => refuse(409, { code: 'IN_USE', message: 'Steel holds 1472 items · 1 definition · 0 machines; it also has 1 Subfamily below it.', problems: [] });
  await click(q('cls-node-1').querySelector('.tree-row'));
  await click(button('Retire'));
  const confirm = [...document.querySelectorAll('[role="dialog"]')].pop();
  assert.match(confirm.textContent, /it will be refused/);
  await click([...confirm.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Retire'));
  const after = [...document.querySelectorAll('[role="dialog"]')].pop();
  assert.match(after.textContent, /Steel holds 1472 items · 1 definition · 0 machines/);
});

await check('Items: the Temporary chip asks the server for kind=temporary, All for both kinds; counts from kindCounts', async () => {
  routes = recordsRoutes();
  calls.length = 0;
  await render(React.createElement(m.Records, { recordKind: 'item' }));
  const first = calls.filter((c) => c.path.startsWith('/records')).pop();
  assert.match(first.path, /kinds=catalog%2Ctemporary/);
  const chip = [...document.querySelectorAll('button, [role="button"]')].find((b) => /Temporary \(one order\)/.test(b.textContent));
  assert.ok(chip, 'Temporary chip');
  assert.match(chip.textContent, /208/);
  calls.length = 0;
  await click(chip);
  const asked = calls.filter((c) => c.path.startsWith('/records')).pop();
  assert.ok(asked, 'a new list request');
  assert.match(asked.path, /[?&]kind=temporary/);
  assert.doesNotMatch(asked.path, /kinds=/);
});

await check('Picker: "Show all branches" at the bottom of the list loads the whole side and offers a hidden branch', async () => {
  routes = recordsRoutes();
  calls.length = 0;
  let picked = null;
  await render(React.createElement(m.ClassificationPicker, { tree: itemsTree, value: null, onChange: (id) => { picked = id; }, screen: 'items', label: 'Variant' }));
  const input = document.querySelector('input');
  await React.act(async () => { input.focus(); input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await sleep(0); });
  await settle();
  const footer = q('picker-show-all');
  assert.ok(footer, 'the toggle is at the bottom of the open list');
  assert.match(footer.textContent, /Show all branches/);
  assert.match(footer.textContent, /2 more/);
  const options = () => [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent);
  assert.ok(!options().some((t) => /Plate girder/.test(t)), 'the hidden branch is not offered yet');
  await click(footer.querySelector('input[type="checkbox"]'));
  assert.ok(calls.some((c) => c.path === '/classification?screen=items&all=1'), 'the whole side was read');
  assert.ok(options().some((t) => /Plate girder/.test(t)), 'the hidden Variant is offered now');
  void picked;
});

await check('Picker without a screen has no toggle (filters keep their old behaviour)', async () => {
  await render(React.createElement(m.ClassificationPicker, { tree: itemsTree, value: null, onChange: () => {}, label: 'Variant' }));
  const input = document.querySelector('input');
  await React.act(async () => { input.focus(); input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await sleep(0); });
  await settle();
  assert.equal(q('picker-show-all'), null);
});

await check('Move targets: one level up, same side, not the current parent', () => {
  const t = { ...allTree, roots: [...allTree.roots] };
  const plates = itemsTree.roots[0].children[0];
  assert.deepEqual(m.moveTargets(t, plates).map((x) => x.path), ['Empty from items', 'Fabricated']);
});

if (root) await React.act(async () => root.unmount());
dom.window.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
