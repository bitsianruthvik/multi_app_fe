// Run from multi_app_fe: node scripts/cf_erp_classification_popup_test.mjs
// Classification is managed from the screens that use it: a "Classification" button on Items opens a pop-up with the
// screen's DERIVED tree and counts; adding stamps createdIn for that screen; a refused retire shows the backend's words;
// the classification picker has "Show all branches" at the bottom of its list; and the Items kind chips are answered
// by the server (Temporary asks for kind=temporary, All for kinds=catalog,temporary) with counts from the server.
// 2026-10-02 (Records paging): Items pages (paged=1&limit=100), EVERY filter (kind, status, classification, search) is sent
// to the server, the chips and the Matching / Active / Draft / Without a code tiles are the server's counts (not the loaded
// rows'), Load more reaches the rest, Export asks all=1, and a refetch shows the progress bar and dims the old rows.
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

// 700 items: i%4==3 temporary; status draft / active / obsolete; every 20th has no code; classification 3 or 5 (under 2).
const RECS = Array.from({ length: 700 }, (_, i) => ({
  id: i + 1, recordKind: 'item', kind: i % 4 === 3 ? 'temporary' : 'catalog', code: i % 20 === 0 ? null : `IT-${String(i).padStart(4, '0')}`, name: `Item ${i}`,
  status: i % 5 === 0 ? 'draft' : i % 11 === 0 ? 'obsolete' : 'active', classificationId: i % 2 ? 3 : 5, classificationName: i % 2 ? 'E350' : 'E410', revision: null,
  item: { itemType: i % 4 === 3 ? 'temporary' : 'catalog', trackedBy: 'quantity', uom: 'nos', sourcing: 'stock' }, bomLineCount: null, bomStatus: null,
}));
let recordsDelay = 0;
const recordsServer = async (path) => {
  const u = new URL(path, 'http://x');
  const q = Object.fromEntries(u.searchParams);
  if (recordsDelay) await sleep(recordsDelay);
  const kinds = q.kind ? [q.kind] : (q.kinds ?? 'catalog').split(',');
  const sub = q.classificationId === '2' ? [3, 5] : q.classificationId ? [Number(q.classificationId)] : null;
  const term = (q.search ?? '').toLowerCase();
  const rest = RECS.filter((r) => (!sub || sub.includes(r.classificationId)) && (!term || r.name.toLowerCase().includes(term) || (r.code ?? '').toLowerCase().includes(term)));
  const kindIn = (r) => kinds.includes(r.kind);
  const stIn = (r) => !q.status || r.status === q.status;
  const match = rest.filter((r) => kindIn(r) && stIn(r));
  const limit = q.all ? match.length : Number(q.limit ?? 100);
  const offset = Number(q.offset ?? 0);
  const kc = (k) => rest.filter((r) => r.kind === k && stIn(r)).length;
  const sc = (st) => rest.filter((r) => kindIn(r) && r.status === st).length;
  return {
    rows: match.slice(offset, offset + limit), total: match.length, limit, offset, hasMore: offset + limit < match.length,
    counts: {
      total: match.length, kind: { catalog: kc('catalog'), temporary: kc('temporary'), template: 0, selection: 0 },
      status: { draft: sc('draft'), active: sc('active'), obsolete: sc('obsolete'), all: rest.filter(kindIn).length },
      noCode: match.filter((r) => !r.code).length, overall: 700,
    },
  };
};
const recordsCalls = () => calls.filter((c) => c.path.startsWith('/records'));
const stripText = () => document.body.textContent;
const tile = (label) => { const m2 = new RegExp(label.replace(/[()]/g, '\\$&') + '\\s*([\\d,]+)').exec(stripText()); return m2 ? Number(m2[1].replace(/,/g, '')) : null; };

const recordsRoutes = () => ({
  'GET /classification?screen=items': () => itemsTree,
  'GET /classification?screen=items&all=1': () => allTree,
  'GET /rules*': () => [],
  'GET /classification/1/resolved': () => ({ mode: 'setup', chain: [], specs: [], missingRequired: [], problems: [], unassignedValues: [] }),
  'GET /classification/9/resolved': () => ({ mode: 'setup', chain: [], specs: [], missingRequired: [], problems: [], unassignedValues: [] }),
  'GET /records*': recordsServer,
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

await check('Items: pages from the server (paged=1&limit=100); chips and tiles are the server counts over ALL matches, not the 100 loaded rows', async () => {
  routes = recordsRoutes();
  recordsDelay = 0;
  calls.length = 0;
  await render(React.createElement(m.Records, { recordKind: 'item' }));
  const first = recordsCalls().pop();
  assert.match(first.path, /paged=1/);
  assert.match(first.path, /limit=100/);
  assert.match(first.path, /kinds=catalog%2Ctemporary/);
  assert.equal(document.querySelectorAll('tr[data-row]').length, 100, 'one page of rows is loaded');
  await React.act(async () => { await sleep(1000); });
  // 700 items, none filtered: Matching 700 (no "of N" when unfiltered), Active counted by the server
  const active = RECS.filter((r) => r.status === 'active').length;
  assert.equal(tile('Matching'), 700);
  assert.equal(tile('Active'), active, 'Active is the server count over 700, not the loaded rows');
  assert.equal(tile('Draft'), RECS.filter((r) => r.status === 'draft').length);
  assert.equal(tile('Without a code'), RECS.filter((r) => !r.code).length);
  const chip = [...document.querySelectorAll('button, [role="button"]')].find((b2) => /Temporary \(one order\)/.test(b2.textContent));
  assert.ok(chip, 'Temporary chip');
  assert.match(chip.textContent, /175/);
  assert.ok(!/first 500/.test(document.body.textContent), 'no 500-row note');
});

await check('Items: the Temporary chip, a status chip and the search all go to the server; tiles follow the counts', async () => {
  calls.length = 0;
  const chip = [...document.querySelectorAll('button, [role="button"]')].find((b2) => /Temporary \(one order\)/.test(b2.textContent));
  await click(chip);
  let asked = recordsCalls().pop();
  assert.match(asked.path, /[?&]kind=temporary/);
  assert.doesNotMatch(asked.path, /kinds=/);
  await React.act(async () => { await sleep(1000); });
  assert.equal(tile('Matching (of 700)'), 175, 'Matching is the filtered total, with the overall figure beside it');
  const draftChip = [...document.querySelectorAll('button, [role="button"]')].find((b2) => /^Draft/.test(b2.textContent.trim()) && !/Draft\s*\d+$/.test('') );
  await click(draftChip);
  asked = recordsCalls().pop();
  assert.match(asked.path, /[?&]status=draft/);
  assert.match(asked.path, /kind=temporary/);
  await React.act(async () => { await sleep(1000); });
  const wantDraft = RECS.filter((r) => r.kind === 'temporary' && r.status === 'draft').length;
  assert.equal(tile('Matching (of 700)'), wantDraft);
  assert.equal(tile('Active'), RECS.filter((r) => r.kind === 'temporary' && r.status === 'active').length, 'Active ignores the status chip (a choice, like the chips)');
  const search = document.querySelector('input[placeholder="Search code or name"]');
  await type(search, 'Item 7');
  await React.act(async () => { await sleep(400); });
  asked = recordsCalls().pop();
  assert.match(asked.path, /search=Item\+7|search=Item%207/);
  assert.equal(new Set(recordsCalls().map((c) => c.path)).size >= 3, true);
});

await check('Items: Load more reaches the next page of the matches', async () => {
  routes = recordsRoutes();
  recordsDelay = 0;
  calls.length = 0;
  await render(React.createElement(m.Records, { recordKind: 'item' }));
  const lm = q('dt-load-more');
  assert.ok(lm, 'Load more is offered (100 of 700)');
  assert.match(lm.textContent, /100 of 700/);
  calls.length = 0;
  await click(lm.querySelector('button'));
  assert.match(recordsCalls().pop().path, /offset=100/);
  assert.equal(document.querySelectorAll('tr[data-row]').length, 200);
});

await check('Items: a classification filter (?classificationId=2 = the subtree) and a status come from the URL and go to the server', async () => {
  routes = recordsRoutes();
  recordsDelay = 0;
  globalThis.__entry = '/testco/cf_erp/items?classificationId=2&status=active';
  calls.length = 0;
  await render(React.createElement(m.Records, { recordKind: 'item' }));
  globalThis.__entry = undefined;
  const asked = recordsCalls().pop();
  assert.match(asked.path, /classificationId=2/);
  assert.match(asked.path, /status=active/);
  await React.act(async () => { await sleep(1000); });
  const want = RECS.filter((r) => r.status === 'active');
  assert.equal(tile('Matching (of 700)'), want.length);
  assert.equal(tile('Active'), want.length);
});

await check('Items: every refetch shows the progress bar and dims the old rows, then clears', async () => {
  routes = recordsRoutes();
  recordsDelay = 0;
  await render(React.createElement(m.Records, { recordKind: 'item' }));
  assert.equal(q('dt-refreshing'), null, 'no bar when idle');
  recordsDelay = 300;
  const chip = [...document.querySelectorAll('button, [role="button"]')].find((b2) => /Temporary \(one order\)/.test(b2.textContent));
  await React.act(async () => {
    chip.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await sleep(60);
  });
  assert.ok(q('dt-refreshing'), 'the progress bar is up while the answer is on its way');
  const busy = document.querySelector('[data-busy="1"]');
  assert.ok(busy, 'the old rows are marked busy (dimmed)');
  assert.equal(getComputedStyle(busy).opacity, '0.45');
  assert.ok(document.querySelectorAll('tr[data-row]').length > 0, 'the old rows stay visible (dimmed), not a blank table');
  // the chip already shows as selected before the answer
  await React.act(async () => { await sleep(500); });
  assert.equal(q('dt-refreshing'), null, 'the bar is gone once the answer is in');
  assert.equal(document.querySelector('[data-busy="1"]'), null);
  recordsDelay = 0;
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
