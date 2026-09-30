// Run from multi_app_fe: node scripts/cf_erp_nesting_test.mjs
// DOM test of the Nesting panel's waiting line, Cancel, the effort chip and the capped note.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/orders/1', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  try { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true }); } catch { /* skip */ }
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const stub = `export async function apiFetch(url, o = {}) {
  const res = await globalThis.fetch(url, { method: o.method || 'GET', body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await res.text();
  if (!res.ok) throw new Error('API request failed: ' + res.status + ' x - ' + text);
  return JSON.parse(text);
}`;
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; export { React, createRoot };
      export { NestingPanel } from './src/apps/cf_erp/components/Nesting/NestingPanel';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stub-api', setup(b) {
    b.onResolve({ filter: /^@core\/api\/client$/ }, () => ({ path: 'apiclient', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: stub, loader: 'js' }));
  } }],
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `nesting-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const { React, createRoot, NestingPanel } = await import(pathToFileURL(artifact));
await unlink(artifact);

const metrics = { lots: 0, plates: 0, pieces: 0, areaBought: 0, usedArea: 0, wasteArea: 0, wastePct: 0, weightKg: 0, wasteKg: 0, thickness: null };
const plan = (extra = {}) => ({
  line: { id: 1, lineNo: 1, orderId: 1, orderCode: 'SO-1', quantity: 1, orderStatus: 'draft' },
  saved: false, basis: 'nothing saved yet', manual: [], sizeAdvice: [], problems: [],
  groups: [{
    key: 'g1', nests: [], unplaced: [], candidates: [], metrics, kerfMm: 3, seqGapMinMm: 10, seqGapMaxMm: 20, settingsBasis: '',
    cutPlates: [{ id: 1, code: 'CP1', name: 'CP1', pieces: 2944, length: 1, width: 1, thickness: 10 }],
  }],
  totals: { ...metrics, groups: 1, unplaced: 0 }, ...extra,
});

let posts = [];
let release = null;
globalThis.fetch = async (url, o = {}) => {
  const method = o.method || 'GET';
  let out;
  if (method === 'POST' && String(url).endsWith('/plan')) {
    posts.push(JSON.parse(o.body));
    const budget = { effort: 'standard', capped: true };
    out = await new Promise((r) => { release = () => r(plan({ saved: false, basis: 'proposal', budget })); });
  } else out = plan();
  return { ok: true, status: 200, text: async () => JSON.stringify(out) };
};

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = (ms = 30) => React.act(async () => { await sleep(ms); });
const waitFor = async (cond, what, ms = 3000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false; try { ok = !!cond(); } catch { /* not yet */ }
    if (ok) return;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await settle(20);
  }
};
const text = () => document.body.textContent;
const find = (label) => [...document.querySelectorAll('button, [role=menuitem]')].find((b) => b.textContent.trim() === label || b.getAttribute('aria-label') === label || b.textContent.trim().startsWith(label));
const click = async (el, what) => { assert.ok(el, `no ${what}`); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await settle(); };

const root = createRoot(document.getElementById('app'));
await React.act(async () => { root.render(React.createElement(NestingPanel, { orderId: 1, lineId: 1, canManage: true })); await sleep(0); });
await waitFor(() => find('Nest everything'), 'the panel');

await check('the effort chip shows Standard and opens three one-line choices', async () => {
  const chip = find('Effort');
  assert.ok(chip.textContent.includes('Standard'));
  assert.ok(!find('More'), 'the ... menu is gone');
  await click(chip, 'chip');
  await waitFor(() => text().includes('squeezes the last kilos'), 'menu');
  assert.ok(text().includes('a good first layout') && text().includes('usually the best value'));
  await click(find('Deep'), 'Deep');
  assert.ok(find('Effort').textContent.includes('Deep'));
});

await check('a running proposal shows pieces, a timer, the bound and Cancel', async () => {
  await click(find('Nest everything'), 'nest');
  await waitFor(() => text().includes('Packing 2,944 pieces… 0:0'), 'progress line');
  assert.ok(text().includes('Deep takes up to about 10 minutes'));
  assert.deepEqual(posts[0].effort, 'deep');
  await waitFor(() => text().includes('0:01'), 'the timer tick', 2500);
  assert.ok(text().includes('server may finish anyway'));
});

await check('Cancel stops waiting, and a late answer is ignored', async () => {
  await click(find('Cancel'), 'Cancel');
  assert.ok(!text().includes('Packing 2,944'));
  release();
  await settle(60);
  assert.ok(!text().includes('Nothing here is written down yet'), 'the cancelled answer must not show');
});

await check('a capped result says so once', async () => {
  await click(find('Nest everything'), 'nest again');
  await waitFor(() => text().includes('Packing 2,944'), 'progress');
  release();
  await waitFor(() => text().includes('Nothing here is written down yet'), 'proposal');
  assert.equal(text().split('Stopped at the time limit').length - 1, 1);
});

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
