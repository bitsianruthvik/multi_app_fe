// Run from multi_app_fe: node scripts/cf_erp_lock_bom_test.mjs
// Freeze stage, frozen: one strip (no repeated "frozen" cards), "Show the full BOM" reads the pieces once and draws the
// tree, and Download writes every piece as Excel / CSV. The API is mocked; no network.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/orders/5', pretendToBeVisual: true });
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
      export { LockPanel } from './src/apps/cf_erp/components/Lock/LockPanel';
      export { pieceBomTable, bomFileStem } from './src/apps/cf_erp/lib/pieceBomExport';`,
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
const artifact = resolve(cache, `lock-bom-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async (ms = 30) => React.act(async () => { await sleep(ms); });
const click = async (el) => { assert.ok(el, 'nothing to click'); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); };
const byLabel = (label) => document.querySelector(`[aria-label="${label}"]`);
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

// ── fixture ────────────────────────────────────────────────────────────────
const summary = { nodes: 3, pieces: 2, groups: 1, codes: 3, byRule: 3, builtIn: 0, duplicates: 0, duplicatePieces: 0, taken: 0, missing: 0 };
const nodes = [
  { k: 0, parentK: null, depth: 0, code: 'SO-1-SPAN-01', pieceNo: 1, pieceSeq: 1, quantity: 1, itemId: 10, rule: 'R' },
  { k: 1, parentK: 0, depth: 1, code: 'SO-1-SPAN-01-G1', pieceNo: 2, pieceSeq: 1, quantity: 1, itemId: 11, rule: 'R' },
  { k: 2, parentK: 1, depth: 2, code: 'SO-1-SPAN-01-G1-IS1-6', pieceNo: null, pieceSeq: '1-6', quantity: 6, itemId: 12, rule: 'R', label: 'Intermediate stiffener ×6' },
];
const items = { 10: { code: 'SPAN-001', name: 'Composite girder span', uom: 'nos' }, 11: { code: 'GLINE-001', name: 'Girder line', uom: 'nos' }, 12: { code: 'ISP', name: 'Intermediate Stiffener Plain', uom: 'nos' } };
const base = { line: { id: 5, lineNo: 10, lineType: 'standard', orderId: 1, orderCode: 'SO-1', orderStatus: 'confirmed', quantity: 2, item: { id: 10, code: 'SPAN-001', name: 'Composite girder span' } },
  released: null, truncated: false, summary, duplicates: [], taken: [], missing: [], position: { value: 1, text: '01', lines: 1 }, canLock: false, checks: [],
  locked: { at: '2026-10-03T05:55:00Z', by: { id: 1, name: 'Test User' }, position: 1, pieces: 3 }, nodes: [], items: {} };
globalThis.__routes = [
  ['GET', /^\/order-lines\/5\/lock\?nodes=1$/, () => ({ ...base, nodes, items })],
  ['GET', /^\/order-lines\/5\/lock$/, () => base],
];
const saved = [];
dom.window.URL.createObjectURL = globalThis.URL.createObjectURL = (blob) => { saved.push(blob); return 'blob:x'; };
dom.window.URL.revokeObjectURL = globalThis.URL.revokeObjectURL = () => {};
const downloads = [];
dom.window.HTMLAnchorElement.prototype.click = function click() { downloads.push(this.download); };

const root = createRoot(document.getElementById('app'));
await React.act(async () => {
  root.render(React.createElement(MemoryRouter, null, React.createElement(m.LockPanel, { lineId: 5, lineNo: 10, canManage: true, stages: [], onGoStage: () => {}, onChanged: () => {} })));
  await sleep(30);
});
await settle(50);

await check('pieceBomTable: a row per piece and group, parent codes, items', () => {
  const t = m.pieceBomTable(nodes, items);
  assert.deepEqual(t.columns, ['Level', 'Code', 'Parent code', 'Kind', 'No.', 'Quantity', 'UOM', 'Item code', 'Item name']);
  assert.equal(t.rows.length, 3);
  assert.deepEqual(t.rows[2], [2, 'SO-1-SPAN-01-G1-IS1-6', 'SO-1-SPAN-01-G1', 'Group of identical parts', '1-6', 6, 'nos', 'ISP', 'Intermediate Stiffener Plain']);
  assert.equal(m.bomFileStem('SO-20260924-0003', 10), 'SO-20260924-0003-line-10-BOM');
});
await check('frozen: one strip, no repeated "is frozen" cards or long explanation', () => {
  const text = document.body.textContent;
  assert.ok(document.querySelector('[data-testid="frozen-strip"]'), 'the strip is there');
  assert.match(text, /3 pieces coded · line position 01/);
  assert.match(text, /changes now need a new revision/);
  assert.ok(!/is frozen/.test(text), 'no "Line 10 is frozen" header');
  assert.ok(!/The frozen pieces/.test(text), 'no second card about the same pieces');
  assert.ok(!/Nesting, buying and production carry on/.test(text), 'the explanation is behind the ⓘ');
});
await check('Show the full BOM reads the pieces and draws the tree; Hide folds it', async () => {
  await click(document.querySelector('[data-testid="bom-toggle"]'));
  await settle(80);
  assert.ok(calls.some((c) => c.path === '/order-lines/5/lock?nodes=1'), 'the pieces were read');
  assert.match(document.body.textContent, /SO-1-SPAN-01-G1Girder line/, 'the tree opens on the top levels');
  await click(document.querySelector('[data-testid="bom-toggle"]'));
  await settle();
  assert.ok(!/SO-1-SPAN-01-G1Girder line/.test(document.body.textContent));
});
await check('Download writes the whole BOM as Excel and as CSV, reading the pieces only once', async () => {
  const reads = () => calls.filter((c) => c.path === '/order-lines/5/lock?nodes=1').length;
  const before = reads();
  await click(document.querySelector('[data-testid="bom-download"]'));
  await settle();
  await click(document.querySelector('[data-testid="bom-download-xlsx"]'));
  await settle(50);
  await click(document.querySelector('[data-testid="bom-download"]'));
  await settle();
  await click(document.querySelector('[data-testid="bom-download-csv"]'));
  await settle(50);
  assert.deepEqual(downloads, ['SO-1-line-10-BOM.xlsx', 'SO-1-line-10-BOM.csv']);
  assert.equal(reads(), before, 'already read for the tree');
  const csv = await saved[saved.length - 1].text();
  assert.match(csv, /SO-1-SPAN-01-G1-IS1-6,SO-1-SPAN-01-G1,Group of identical parts,1-6,6,nos,ISP,Intermediate Stiffener Plain/);
});

await React.act(async () => { root.unmount(); });
console.log(`
${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 50);
