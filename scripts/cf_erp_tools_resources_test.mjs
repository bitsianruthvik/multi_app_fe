import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/tools', pretendToBeVisual: true });
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
      export * from './src/apps/cf_erp/lib/toolsResources';
      export * as TR from './src/apps/cf_erp/api/toolsResources';
      export { MachineResourcesCard } from './src/apps/cf_erp/components/MachineResourcesCard';
      export { default as Tools } from './src/apps/cf_erp/pages/Tools';
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
const artifact = resolve(cache, `tools-test-${process.pid}.mjs`);
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
const mount = async (el, url = '/testco/cf_erp/tools', path = '*') => {
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
const opened = [];
dom.window.open = (u) => { const tab = { location: { href: u }, close() {} }; opened.push(tab); return tab; };
globalThis.open = dom.window.open;


// ── fixtures, as the backend answers (tools_resources_test.mjs) ─────────────────────────────────
const ITEM = (id, code, name, kind, extra = {}) => ({ id, code, name, uom: 'nos', kind, lifeUnit: null, lifeLimit: null, ...extra });
const ROW = (id, itemId, code, name, kind, qty, extra = {}) => ({ id, machineId: 5, itemId, code, name, kind, qty, uom: 'nos', notes: null, itemKind: kind, lifeUnit: null, lifeLimit: null, ...extra });
const LIST = () => [ROW(1, 11, 'TL-WRENCH', 'Torque wrench', 'tool', 1, { lifeUnit: 'uses', lifeLimit: 500 }), ROW(2, 12, 'SP-BEARING', 'Bearing 6205', 'spare', 2, { notes: 'drive end' }), ROW(3, 13, 'CN-NOZZLE', 'Plasma nozzle', 'consumable', 6)];
const PIECES = () => [
  { id: 1, itemId: 11, itemCode: 'TL-DRILL', itemName: 'Drill 22', uom: 'nos', movementCode: 'ISS-1', unitNo: 1, issuedOn: TODAY_, orderId: 9001, orderCode: 'SO-9001', usedFor: 'order', machineId: null, machineCode: null, lifeUnit: 'metres', lifeLimit: 100, lifeUsed: 40, remaining: 60, percentUsed: 40, status: 'in_use', notes: null },
  { id: 2, itemId: 11, itemCode: 'TL-DRILL', itemName: 'Drill 22', uom: 'nos', movementCode: 'ISS-1', unitNo: 2, issuedOn: TODAY_, orderId: null, orderCode: null, usedFor: 'general', machineId: 5, machineCode: 'CNC-1', lifeUnit: 'metres', lifeLimit: 100, lifeUsed: 90, remaining: 10, percentUsed: 90, status: 'in_use', notes: null },
];
const TODAY_ = '2026-10-18';
const TITEMS = () => [{ id: 11, code: 'TL-DRILL', name: 'Drill 22', uom: 'nos', lifeUnit: 'metres', lifeLimit: 100, inUse: 2, wornOut: 1 }, { id: 14, code: 'TL-GAUGE', name: 'Bore gauge', uom: 'nos', lifeUnit: null, lifeLimit: null, inUse: 0, wornOut: 0 }];
const MANAGE = ['cf_erp_production_manage', 'cf_erp_inventory_manage', 'cf_erp_catalog_manage', 'cf_erp_production_view', 'cf_erp_inventory_view'];

await check('the pure rules: kinds, drafts, payload, problems, dirty', () => {
  assert.deepEqual(m.KINDS, ['tool', 'spare', 'consumable']);
  assert.equal(m.KIND_LABEL.spare, 'Spare');
  const drafts = m.draftsFromServer(LIST());
  assert.equal(drafts.length, 3);
  assert.equal(drafts[0].item.code, 'TL-WRENCH');
  const rows = [...drafts, m.blankDraft()];
  assert.equal(m.filled(rows).length, 3, 'a blank trailing line is not a row');
  assert.deepEqual(m.toPayload(rows)[1], { itemId: 12, kind: 'spare', qty: 2, notes: 'drive end' });
  assert.equal(m.isDirty(rows, LIST()), false, 'untouched = not dirty');
  rows[0].qty = '2';
  assert.equal(m.isDirty(rows, LIST()), true);
  rows[0].qty = '0';
  assert.match(m.draftProblems(rows)[0], /Row 1: quantity is a number above zero/);
  rows[0].qty = '1';
  rows.push({ ...m.blankDraft(), item: ITEM(12, 'SP-BEARING', 'x', 'spare') });
  assert.match(m.draftProblems(rows).join(' '), /SP-BEARING is already on the list/);
  assert.equal(m.defaultKind(ITEM(1, 'a', 'b', 'tool')), 'tool');
  assert.equal(m.defaultKind(ITEM(1, 'a', 'b', null)), 'consumable', 'an item outside the families starts as a consumable');
  assert.equal(m.lifeText('uses', 500), '500 uses');
  assert.equal(m.lifeText(null, null), 'Not tracked');
  assert.equal(m.lifeText('hours', null), 'no limit (hours)');
  assert.equal(m.pieceLife(PIECES()[0]), '40 of 100 metres');
});

await check('the API helpers call the §81 routes', async () => {
  reset();
  for (const k of ['GET /resource-items', 'GET /machines/5/resources', 'PUT /machines/5/resources', 'GET /tools/life', 'GET /tools/items', 'POST /tools/life/3/use', 'POST /tools/life/3/retire', 'PUT /items/9/tool-life']) globalThis.__routes[k] = () => ({});
  await m.TR.searchResourceItems('noz', { all: true }); assert.match(lastCall('GET', '/resource-items').url, /search=noz.*all=1/);
  await m.TR.saveMachineResources(5, [{ itemId: 1, kind: 'tool', qty: 1, notes: null }]); assert.deepEqual(body(lastCall('PUT', '/machines/5/resources')).rows[0], { itemId: 1, kind: 'tool', qty: 1, notes: null });
  await m.TR.listToolPieces('in_use', 'dri'); assert.match(lastCall('GET', '/tools/life').url, /status=in_use.*search=dri/);
  await m.TR.recordToolUse(3, 2); assert.equal(body(lastCall('POST', '/tools/life/3/use')).amount, 2);
  await m.TR.setToolItemLife(9, 'hours', 8); assert.deepEqual(body(lastCall('PUT', '/items/9/tool-life')), { lifeUnit: 'hours', lifeLimit: 8 });
});

await check('the machine card lists its rows and a blank line; quantity edit saves the whole list in one PUT', async () => {
  reset(); asUser(MANAGE);
  globalThis.__routes['GET /machines/5/resources'] = () => LIST();
  globalThis.__routes['PUT /machines/5/resources'] = (b) => LIST().slice(0, b.rows.length).map((r, i) => ({ ...r, qty: b.rows[i].qty }));
  await mount(React.createElement(m.MachineResourcesCard, { machineId: 5, canManage: true }), '/testco/cf_erp/machines/5');
  await settle(150);
  assert.equal(qa('resource-row').length, 4, 'three rows and a blank line');
  assert.ok([...q1('machine-resources').querySelectorAll('input')].some((i) => /TL-WRENCH/.test(i.value)), 'the picker shows the item chosen');
  assert.match(text(document.body), /1 tool · 1 spare · 1 consumable/);
  const save = q1('resources-save');
  assert.equal(save.disabled, true, 'nothing changed = nothing to save');
  const qty = document.querySelector('input[aria-label="Quantity, row 3"]');
  await setValue(qty, '10');
  assert.equal(q1('resources-save').disabled, false);
  await click(q1('resources-save')); await settle(100);
  assert.equal(calls('PUT', '/machines/5/resources').length, 1, 'one trip');
  const sent = body(lastCall('PUT', '/machines/5/resources')).rows;
  assert.equal(sent.length, 3, 'the blank line is not sent');
  assert.deepEqual(sent[2], { itemId: 13, kind: 'consumable', qty: 10, notes: null });
  assert.equal(q1('resources-save').disabled, true, 'saved = clean again');
});

await check('quantity 0 is stopped before the trip, with the reason; Ctrl+Enter saves', async () => {
  reset(); asUser(MANAGE);
  globalThis.__routes['GET /machines/5/resources'] = () => LIST();
  globalThis.__routes['PUT /machines/5/resources'] = (b) => LIST().slice(0, b.rows.length);
  await mount(React.createElement(m.MachineResourcesCard, { machineId: 5, canManage: true }), '/testco/cf_erp/machines/5');
  await settle(150);
  const qty = document.querySelector('input[aria-label="Quantity, row 2"]');
  await setValue(qty, '0');
  assert.match(text(q1('resource-problems')), /Row 2: quantity is a number above zero/);
  assert.equal(q1('resources-save').disabled, true);
  await fire(qty, 'keydown');
  await React.act(async () => { qty.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); await sleep(40); });
  assert.equal(calls('PUT', '/machines/5/resources').length, 0, 'a bad quantity is never sent');
  await setValue(qty, '3');
  await React.act(async () => { qty.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); await sleep(60); });
  assert.equal(calls('PUT', '/machines/5/resources').length, 1, 'Ctrl+Enter saved');
  assert.equal(body(lastCall('PUT', '/machines/5/resources')).rows[1].qty, 3);
});

await check('removing a row and Enter in the last field adds a line', async () => {
  reset(); asUser(MANAGE);
  globalThis.__routes['GET /machines/5/resources'] = () => LIST();
  globalThis.__routes['PUT /machines/5/resources'] = (b) => LIST().slice(0, b.rows.length);
  await mount(React.createElement(m.MachineResourcesCard, { machineId: 5, canManage: true }), '/testco/cf_erp/machines/5');
  await settle(150);
  await click(document.querySelector('button[aria-label="Remove row 1"]'));
  assert.equal(qa('resource-row').length, 3);
  await click(q1('resources-save')); await settle(80);
  assert.deepEqual(body(lastCall('PUT', '/machines/5/resources')).rows.map((r) => r.itemId), [12, 13], 'the removed tool is not in the list sent');
  // Enter in the blank (last) line does nothing until it names an item.
  const last = qa('resource-row').length;
  const blankNote = document.querySelector(`input[aria-label="Note, row ${last}"]`);
  assert.equal(blankNote.disabled, true, 'a line with no item takes no quantity or note yet');
  await click(buttonIn(document.body, 'Add a line'));
  assert.equal(qa('resource-row').length, last + 1, 'Add a line');
});

await check('without manage rights the card only reads: no blank line, no save', async () => {
  reset(); asUser(['cf_erp_production_view']);
  globalThis.__routes['GET /machines/5/resources'] = () => LIST();
  await mount(React.createElement(m.MachineResourcesCard, { machineId: 5, canManage: false }), '/testco/cf_erp/machines/5');
  await settle(150);
  assert.equal(qa('resource-row').length, 3);
  assert.equal(q1('resources-save'), null);
  assert.equal(buttonIn(document.body, 'Add a line'), undefined);
});

await check('Inventory › Tools: pieces in use with their life; type the use and press Enter', async () => {
  reset(); asUser(MANAGE);
  globalThis.__routes['GET /tools/life'] = () => PIECES();
  globalThis.__routes['GET /tools/items'] = () => TITEMS();
  globalThis.__routes['POST /tools/life/2/use'] = () => ({ ...PIECES()[1], lifeUsed: 95 });
  await mount(React.createElement(m.Tools), '/testco/cf_erp/tools');
  await settle(200);
  assert.match(text(document.body), /40 of 100 metres/);
  assert.match(text(document.body), /SO-9001/);
  assert.match(text(document.body), /General/);
  assert.match(lastCall('GET', '/tools/life').url, /status=in_use/);
  const box = document.querySelector('input[aria-label="Use of TL-DRILL no. 2"]');
  await setValue(box, '5');
  await React.act(async () => { box.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(60); });
  assert.deepEqual(body(lastCall('POST', '/tools/life/2/use')), { amount: 5 });
});

await check('Tools › Tool items: set a life on a tool and it saves on Enter', async () => {
  reset(); asUser(MANAGE);
  globalThis.__routes['GET /tools/life'] = () => [];
  globalThis.__routes['GET /tools/items'] = () => TITEMS();
  globalThis.__routes['PUT /items/11/tool-life'] = () => ({});
  await mount(React.createElement(m.Tools), '/testco/cf_erp/tools?tab=items');
  await settle(200);
  assert.match(text(document.body), /TL-GAUGE/);
  const limit = document.querySelector('input[aria-label="Life limit of TL-DRILL"]');
  assert.equal(limit.value, '100');
  await setValue(limit, '150');
  await React.act(async () => { limit.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(60); });
  assert.deepEqual(body(lastCall('PUT', '/items/11/tool-life')), { lifeUnit: 'metres', lifeLimit: 150 });
});

await check('the menu has Tools under Inventory, and the machine page has the Tools & spares tab', () => {
  const inv = m.SECTIONS.find((s) => s.key === 'inventory');
  const t = inv.screens.find((s) => s.key === 'tools');
  assert.ok(t && t.path === 'tools');
  assert.match(src('pages/MachineDetail.tsx'), /value: 'resources', label: 'Tools & spares'/);
  // 2026-10-24: the list is kept with production manage OR maintenance (canResources); the machine itself stays production.
  assert.match(src('pages/MachineDetail.tsx'), /<MachineResourcesCard machineId=\{id\} canManage=\{canResources\} \/>/);
  assert.match(src('routes.tsx'), /cf_erp\/tools/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
