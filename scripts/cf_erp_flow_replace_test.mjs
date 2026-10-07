// Run from multi_app_fe: node scripts/cf_erp_flow_replace_test.mjs
// Flow › Steps: each step has Replace (⇄); it posts the new operation to /flow-steps/:id/replace, shows the flow it
// returns, and toasts what moved and what released lines keep. The edit dialog no longer changes the operation.
// The API is mocked; no network.
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
const CUT = opOf(1, 'CUT', 'Plasma cutting'), DRL = opOf(2, 'DRL', 'Drilling'), PNCH = opOf(3, 'PNCH', 'Punching');
const flowWith = (op) => ({ id: 7, code: 'CG-PLATEPART', name: 'Plate part', description: null, revision: 'A', status: 'active',
  steps: [{ id: 70, sequence: 10, operation: CUT, stepName: null, notes: null, waits: [] }, { id: 71, sequence: 20, operation: op, stepName: 'Holes', notes: null, waits: [{ id: 5, text: 'Waits until its parent is complete.', notes: null }] }],
  uses: { records: [], bomLines: 0, recordCount: 0 } });
const replaced = { from: DRL, to: PNCH, released: 12, overridesMoved: 2, cellsMoved: 3, kept: 1, waitsNaming: 0 };
globalThis.__routes = [
  ['GET', /^\/flows\/7$/, () => flowWith(DRL)],
  ['GET', /^\/operations/, () => [CUT, DRL, PNCH]],
  ['POST', /^\/flow-steps\/71\/replace$/, () => ({ flow: flowWith(PNCH), replaced })],
];
const toasts = [];
const app = document.getElementById('app');
const root = createRoot(app);
await React.act(async () => {
  root.render(React.createElement(m.ToastContext.Provider, { value: { success: (t) => toasts.push(t), error: () => {}, info: () => {} } },
    React.createElement(MemoryRouter, { initialEntries: ['/testco/cf_erp/flows/7'] },
      React.createElement(Routes, null, React.createElement(Route, { path: '/:company/cf_erp/flows/:id', element: React.createElement(m.FlowDetail) })))));
  await sleep(30);
});
await settle(50);

await check('replacedText says what moved and what released lines keep', () => {
  assert.equal(m.replacedText(replaced), 'DRL replaced by PNCH. 12 released steps keep DRL. Moved over: 2 time overrides and 3 contractor assignments. 1 left on DRL (the row already had one for PNCH).');
  assert.equal(m.replacedText({ ...replaced, released: 0, overridesMoved: 0, cellsMoved: 0, kept: 0, waitsNaming: 2 }), 'DRL replaced by PNCH. 2 wait rules elsewhere still name DRL — check them.');
});
await check('each step has Replace; it posts the new operation and shows the returned flow', async () => {
  const btn = byLabel('Replace operation of step DRL');
  assert.ok(btn, 'the Replace button is on the step');
  await click(btn);
  await settle(50);
  assert.match(document.body.textContent, /Replace Drilling/);
  assert.match(document.body.textContent, /Orders already released keep DRL/);
  const input = document.querySelector('[data-testid="replace-operation"]');
  await React.act(async () => { input.focus(); input.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })); await sleep(0); });
  await React.act(async () => { input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await sleep(10); });
  const opts = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent);
  assert.ok(!opts.some((t) => t.includes('DRL')), 'the current operation is not offered');
  const punch = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.includes('PNCH'));
  await click(punch);
  await settle();
  await click(button('Replace'));
  await settle(50);
  const post = calls.find((c) => c.method === 'POST' && c.path === '/flow-steps/71/replace');
  assert.deepEqual(post?.body, { operationId: 3 });
  assert.ok(byLabel('Replace operation of step PNCH'), 'the step now shows the new operation');
  assert.ok(toasts.some((t) => t.startsWith('DRL replaced by PNCH. 12 released steps keep DRL.')), toasts.join(' | '));
});
await check('the edit dialog no longer changes the operation', async () => {
  await click(byLabel('Edit step PNCH'));
  await settle(50);
  assert.match(document.body.textContent, /To change it, use Replace/);
  const opInput = [...document.querySelectorAll('input')].find((i) => i.closest('.MuiAutocomplete-root') && i.disabled);
  assert.ok(opInput, 'the operation field is read-only');
});

await React.act(async () => { root.unmount(); });
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 50);
