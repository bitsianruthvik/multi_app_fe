// Run from multi_app_fe: node scripts/cf_erp_selection_panel_test.mjs
// A selection "Picks from" a list of entries (branches at any level, single items; one item starred as default),
// narrowed by optional spec filters. No mode switch anywhere; Resolves to now shows the union's total.
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
      export { SelectionPanel } from './src/apps/cf_erp/components/SelectionPanel';
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
const artifact = resolve(cache, `selection-panel-test-${process.pid}.mjs`);
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
  await React.act(async () => { root.render(React.createElement(MemoryRouter, { initialEntries: [globalThis.__entry ?? '/testco/cf_erp/items'] }, wrapped)); await sleep(0); });
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


// ── fixtures ──────────────────────────────────────────────────────────────
const node = (id, parentId, depth, name, children = []) => ({
  id, parentId, depth, level: ['Family', 'Subfamily', 'Variant'][depth], scope: 'both', code: name.toUpperCase().replace(/\W/g, ''), name,
  description: null, sortOrder: 0, status: 'active', createdIn: null, itemCount: 1, definitionCount: 0, machineCount: 0, ruleCount: 0, selectionSources: 0,
  subtree: { machines: 0, items: 1, definitions: 0 }, visibleBecause: ['holds_items'], children,
});
const itemsTree = {
  screen: 'items', all: false, levels: ['Family', 'Subfamily', 'Variant'], leafDepth: 2, hiddenCount: 0,
  roots: [node(1, null, 0, 'Steel', [node(2, 1, 1, 'Plates', [node(3, 2, 2, 'E350')])])],
};
const ENTRIES = [
  { id: 11, kind: 'node', nodeId: 2, itemId: null, code: null, name: 'Plates', level: 'Subfamily', path: 'Steel › Plates', status: 'active', isDefault: false, sortOrder: 1 },
  { id: 12, kind: 'item', nodeId: null, itemId: 700, code: 'IT-0700', name: 'Gusset plate', level: null, path: 'E350', status: 'active', isDefault: true, sortOrder: 2 },
  { id: 13, kind: 'item', nodeId: null, itemId: 701, code: 'IT-0701', name: 'Base plate', level: null, path: 'E350', status: 'active', isDefault: false, sortOrder: 3 },
];
const selection = { definitionId: 5, entries: ENTRIES, allowedItems: [], criteria: [] };
const record = { id: 5, definition: { definitionType: 'selection', selectionMode: 'both', candidateClassificationId: 2 } };
const cands = (term) => ({
  mode: 'union', total: 42, truncated: true,
  candidates: [{ id: 700, code: 'IT-0700', name: term ? `Found ${term}` : 'Gusset plate', revision: null, classificationName: 'E350', isDefault: true, matchedValues: [{ specCode: 'THK', value: 12, unit: 'mm', source: 'item' }] }],
});
const records = [
  { id: 900, recordKind: 'item', kind: 'catalog', code: 'IT-0900', name: 'New plate', status: 'active' },
];
routes = {
  'GET /definitions/5/selection': () => selection,
  'GET /definitions/5/candidates*': (path) => cands(new URL(path, 'http://x').searchParams.get('search')),
  'GET /classification*': () => itemsTree,
  'GET /specifications': () => [],
  'GET /records*': () => ({ rows: records, total: 1 }),
};
const mount = async (canManage = true) => {
  await render(React.createElement(m.SelectionPanel, { record, canManage, onChanged: () => {} }));
  calls.length = 0;
};
const bodyOf = (c) => (typeof c.body === 'string' ? JSON.parse(c.body) : (c.body ?? {}));
const posts = (re) => calls.filter((c) => c.method === 'POST' && re.test(c.path));
const openAndPick = async (label, text) => {
  const input = inputLabelled(label);
  assert.ok(input, `no field "${label}"`);
  await React.act(async () => { input.focus(); input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await sleep(350); });
  await settle();
  const opt = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.includes(text));
  assert.ok(opt, `option "${text}" not offered: ${[...document.querySelectorAll('[role="option"]')].map((o) => o.textContent).join(' | ')}`);
  await click(opt);
};

await check('renders branch and item entries from the selection', async () => {
  await mount();
  const text = document.body.textContent;
  assert.match(text, /Picks from/);
  assert.match(text, /Plates/); assert.match(text, /Subfamily/); assert.match(text, /Steel › Plates/);
  assert.match(text, /IT-0700/); assert.match(text, /Gusset plate/); assert.match(text, /IT-0701/);
  assert.ok(document.querySelector('[aria-label="Remove the default star from IT-0700"]'), 'the default item shows a filled star');
  assert.ok(document.querySelector('[aria-label="Make IT-0701 the default"]'));
});

await check('no mode switch anywhere', async () => {
  await mount();
  assert.ok(!/Chooses from/.test(document.body.textContent));
  assert.ok(!/not used in this mode/i.test(document.body.textContent));
  assert.ok(!/An allowed list|Matching specifications|Allowed list/.test(document.body.textContent), 'no mode words');
});

await check('adding a branch posts { nodeId } to /definitions/:id/scope', async () => {
  await mount();
  await openAndPick('Branch to add', 'Plates');
  await click(button('Add branch'));
  const p = posts(/\/definitions\/5\/scope$/);
  assert.equal(p.length, 1);
  assert.deepEqual(bodyOf(p[0]), { nodeId: 2 });
});

await check('adding an item posts { itemId }', async () => {
  await mount();
  await openAndPick('Item to add', 'IT-0900');
  await click(button('Add item'));
  const p = posts(/\/definitions\/5\/scope$/);
  assert.equal(p.length, 1);
  assert.deepEqual(bodyOf(p[0]), { itemId: 900 });
});

await check('a duplicate entry shows the backend refusal', async () => {
  routes['POST /definitions/5/scope'] = () => refuse(409, { message: 'It is already there.', code: 'DUPLICATE_ENTRY' });
  await mount();
  await openAndPick('Item to add', 'IT-0900');
  await click(button('Add item'));
  assert.match(document.body.textContent, /already there/);
  delete routes['POST /definitions/5/scope'];
});

await check('remove calls DELETE /selection-scope/:id', async () => {
  await mount();
  await click(document.querySelector('[aria-label="Remove Plates"]'));
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.path === '/selection-scope/11'));
});

await check('a non-default star posts to /selection-scope/:id/default', async () => {
  await mount();
  await click(document.querySelector('[aria-label="Make IT-0701 the default"]'));
  const p = posts(/\/selection-scope\/13\/default$/);
  assert.equal(p.length, 1);
  assert.deepEqual(p[0].body ? bodyOf(p[0]) : {}, {});
});

await check('the filled star posts { isDefault: false }', async () => {
  await mount();
  await click(document.querySelector('[aria-label="Remove the default star from IT-0700"]'));
  const p = posts(/\/selection-scope\/12\/default$/);
  assert.equal(p.length, 1);
  assert.deepEqual(bodyOf(p[0]), { isDefault: false });
});

await check('read-only: no add controls, no remove buttons', async () => {
  await mount(false);
  assert.equal(button('Add branch'), undefined);
  assert.equal(document.querySelector('[aria-label="Remove Plates"]'), null);
});

await check('Resolves to now shows the total and Showing X of N', async () => {
  await mount();
  const text = document.body.textContent;
  assert.match(text, /Resolves to now/);
  assert.match(text, /42 items qualify/);
  assert.match(text, /Showing 1 of 42/);
  assert.match(text, /THK 12 mm/);
});

await check('the check box asks the server with ?search= after a pause', async () => {
  await mount();
  const input = inputLabelled('Check an item');
  await type(input, 'bolt');
  await React.act(async () => { await sleep(400); });
  await settle();
  assert.ok(calls.some((c) => c.method === 'GET' && /\/definitions\/5\/candidates\?search=bolt/.test(c.path)), 'search was sent');
  assert.match(document.body.textContent, /Found bolt/);
});

await check('spec filters card has the new wording', async () => {
  await mount();
  assert.match(document.body.textContent, /Spec filters/);
  assert.match(document.body.textContent, /Optional\. Narrow what the entries offer/);
});

if (root) await React.act(async () => root.unmount());
dom.window.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
