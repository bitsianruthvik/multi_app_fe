// Run from multi_app_fe: node scripts/cf_erp_detail_collapse_test.mjs
// The order page's header card folds to one line, remembered per device. DOM-level; not a visual review.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MouseEvent', 'KeyboardEvent', 'Event']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');
const built = await build({ alias: { '@shared/ui': resolve('src/shared/ui/storage.ts') }, stdin: { contents: `export * from './src/apps/cf_erp/components/DetailLayout';`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic' });
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `detail-collapse-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };

const root = createRoot(document.getElementById('app'));
const h = React.createElement;
const page = (extra = {}) => h(MemoryRouter, null, h(m.DetailLayout, {
  header: h('div', { 'data-testid': 'full-header' }, 'FULL HEADER with facts'),
  crossLinks: h('span', { 'data-testid': 'links' }, 'links'),
  beforeTabs: h('div', { 'data-testid': 'stages' }, 'stage tabs'),
  collapsible: { id: 'order-test', summary: h('span', null, 'SO-1 · Customer · Inquiry · ₹10') },
  maxWidth: 'none', ...extra,
}, h('div', { 'data-testid': 'grid' }, 'GRID')));
const render = (p) => React.act(() => root.render(p));
const click = (el) => React.act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const q = (sel) => document.querySelector(sel);

await render(page());
await check('Expanded by default: full header and links show, with a Hide details toggle', async () => {
  assert.ok(q('[data-testid="full-header"]') && q('[data-testid="links"]'));
  assert.ok(q('button[aria-label="Hide order details"]'));
  assert.ok(!q('[data-testid="detail-summary"]'));
});
await check('Hiding folds to one compact line; the stage tabs and the grid stay', async () => {
  await click(q('button[aria-label="Hide order details"]'));
  assert.ok(!q('[data-testid="full-header"]') && !q('[data-testid="links"]'));
  assert.match(q('[data-testid="detail-summary"]').textContent, /SO-1 · Customer · Inquiry · ₹10/);
  assert.ok(q('[data-testid="stages"]') && q('[data-testid="grid"]'));
  assert.equal(JSON.parse(dom.window.localStorage.getItem('ui:detail.collapsed.order-test')), true);
});
await check('The choice is remembered per device across a re-mount', async () => {
  await React.act(() => root.render(null));
  await render(page());
  assert.ok(q('[data-testid="detail-summary"]') && !q('[data-testid="full-header"]'));
});
await check('Show details brings the header back and forgets the fold', async () => {
  await click(q('button[aria-label="Show order details"]'));
  assert.ok(q('[data-testid="full-header"]') && q('[data-testid="links"]'));
  assert.equal(JSON.parse(dom.window.localStorage.getItem('ui:detail.collapsed.order-test')), false);
});
await check('Without `collapsible` there is no toggle (other pages are unchanged)', async () => {
  await render(page({ collapsible: undefined }));
  assert.ok(!q('button[aria-label="Hide order details"]') && q('[data-testid="full-header"]'));
});

await React.act(() => root.unmount());
dom.window.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
