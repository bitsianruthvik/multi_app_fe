// Run from multi_app_fe: node scripts/cf_erp_procurement_test.mjs
// Procurement screens: a purchase request's buttons follow `allowed` and the approve permission, the comparison marks
// cheapest / fastest / expired / not quoted and offers an award radio per line, the quote grid takes a paste from
// Excel (and refuses text in a number cell), and a missing price reads "not quoted", never zero rupees.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/rfqs/1', pretendToBeVisual: true });
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

const stubs = {
  '@core/api/client': 'export async function apiFetch() { throw new Error("no network in this test"); }',
  '@core/contexts/AuthContext': 'export const useAuth = () => ({ user: null });',
};
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom';
      export { React, createRoot, MemoryRouter };
      export * from './src/apps/cf_erp/lib/procurement';
      export { RequestActionBar, RequestHistory } from './src/apps/cf_erp/components/RequestParts';
      export { RfqComparison } from './src/apps/cf_erp/components/RfqComparison';
      export { QuoteGrid } from './src/apps/cf_erp/components/QuoteDialog';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/(api\/client|contexts\/AuthContext)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
  } }],
  alias: { '@shared/ui': resolve('src/shared/ui/SheetGrid.tsx') },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `procurement-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const app = document.getElementById('app');
const render = async (el) => { app.replaceChildren(); const host = document.createElement('div'); app.appendChild(host); const root = createRoot(host); await React.act(async () => { root.render(React.createElement(MemoryRouter, null, el)); await sleep(0); }); await React.act(async () => { await sleep(30); }); return root; };
const click = async (el) => { assert.ok(el, 'nothing to click'); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); };
const buttons = () => [...document.querySelectorAll('button')].map((b) => b.textContent.trim());
const q = (id) => document.querySelector(`[data-testid="${id}"]`);

// ── purchase request buttons ──────────────────────────────────────────────
const req = (allowed) => ({ id: 1, code: 'PR-000001', status: 'submitted', lines: [], allowed: { edit: false, submit: false, approve: false, reject: false, cancel: false, makeRfq: false, ...allowed } });
const bar = (request, perms, count = 0, onAction = () => {}) => React.createElement(m.RequestActionBar, { request, canManage: true, canApprove: true, makeRfqCount: count, onAction, ...perms });

await check('request buttons: only what `allowed` says', async () => {
  await render(bar(req({ submit: true, cancel: true })));
  assert.deepEqual(buttons(), ['Submit for approval', 'Cancel']);
  await render(bar(req({ approve: true, reject: true, cancel: true })));
  assert.deepEqual(buttons(), ['Approve', 'Reject', 'Cancel']);
  await render(bar(req({ makeRfq: true }), {}, 3));
  assert.deepEqual(buttons(), ['Make RFQ (3 lines)']);
  await render(bar(req({ makeRfq: true }), {}, 0));
  assert.deepEqual(buttons(), []);
});
await check('approve and reject need the approve permission even when allowed', async () => {
  await render(bar(req({ approve: true, reject: true, cancel: true }), { canApprove: false }));
  assert.deepEqual(buttons(), ['Cancel']);
  await render(bar(req({ submit: true }), { canManage: false }));
  assert.deepEqual(buttons(), []);
});
await check('a button reports its action', async () => {
  const seen = [];
  await render(bar(req({ approve: true, reject: true }), {}, 0, (a) => seen.push(a)));
  await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Reject'));
  await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Approve'));
  assert.deepEqual(seen, ['reject', 'approve']);
});
await check('history lists who, what and the note', async () => {
  await render(React.createElement(m.RequestHistory, { history: [{ at: '2026-10-01T09:00:00Z', action: 'rejected', by: { id: 1, name: 'Asha' }, note: 'Too early' }] }));
  assert.match(q('request-history').textContent, /2026-10-01 Asha — rejected/);
  assert.match(q('request-history').textContent, /Too early/);
});

// ── comparison ────────────────────────────────────────────────────────────
const item = { id: 1, code: 'PL-10', name: 'Plate 10 mm', uom: 'kg' };
const cell = (supplierId, extra = {}) => ({ supplierId, quoteLineId: supplierId * 10, unitPrice: 100, amount: 1000, freightShare: 0, landedUnit: 100, gstRate: 18, leadTimeDays: 10, valid: true, cheapest: false, fastest: false, lastPaid: null, ...extra });
const comparison = {
  suppliers: [{ id: 5, name: 'Alpha Steel', total: 1000, landedTotal: 1010, linesQuoted: 1 }, { id: 6, name: 'Beta Metals', total: 900, landedTotal: 905, linesQuoted: 1 }, { id: 7, name: 'Gamma Traders', total: null, landedTotal: null, linesQuoted: 0 }],
  lines: [
    { rfqLine: { id: 11, lineNo: 1, item, quantity: 10, neededBy: null }, cells: [cell(5, { landedUnit: 101, fastest: true, leadTimeDays: 5, lastPaid: { price: 95, date: '2026-09-01' } }), cell(6, { unitPrice: 90, amount: 900, landedUnit: 90.5, cheapest: true, leadTimeDays: 20 }), cell(7, { unitPrice: null, amount: null, landedUnit: null, quoteLineId: null, leadTimeDays: null })] },
    { rfqLine: { id: 12, lineNo: 2, item: { ...item, id: 2, code: 'PL-12' }, quantity: 5, neededBy: null }, cells: [cell(5, { landedUnit: 120 }), cell(6, { valid: false, cheapest: true, landedUnit: 80 }), cell(7, { unitPrice: null, amount: null, landedUnit: null, quoteLineId: null })] },
  ],
};

await check('comparison flags: cheapest, fastest, expired, not quoted', async () => {
  await render(React.createElement(m.RfqComparison, { comparison, choices: {}, onChoose() {}, editable: true }));
  assert.match(q('cmp-cell-11-6').dataset.flags, /cheapest/);
  assert.match(q('cmp-cell-11-5').dataset.flags, /fastest/);
  assert.doesNotMatch(q('cmp-cell-11-5').dataset.flags, /cheapest/);
  assert.match(q('cmp-cell-12-6').dataset.flags, /expired/);
  assert.doesNotMatch(q('cmp-cell-12-6').dataset.flags, /cheapest/);
  assert.match(q('cmp-cell-11-7').dataset.flags, /not-quoted/);
  assert.equal(q('cmp-cell-11-7').textContent, 'not quoted');
  assert.match(q('cmp-cell-11-5').textContent, /last paid ₹95 on 2026-09-01/);
});
await check('award radio: one per quoted cell (none when not quoted), reports the pick', async () => {
  const picks = [];
  await render(React.createElement(m.RfqComparison, { comparison, choices: { 11: 6 }, onChoose: (l, s) => picks.push([l, s]), editable: true }));
  const radio = (line, sup) => q(`cmp-cell-${line}-${sup}`).querySelector('input[type="radio"]');
  assert.equal(radio(11, 6).checked, true);
  assert.equal(radio(11, 5).checked, false);
  assert.equal(radio(12, 6).disabled, false); // an expired quote may still be awarded on purpose
  assert.equal(radio(11, 6).disabled, false);
  assert.equal(radio(11, 7), null);
  await click(radio(11, 5));
  assert.deepEqual(picks, [[11, 5]]);
  assert.match(q('cmp-awarded-11').textContent, /Beta Metals/);
  assert.match(q('cmp-awarded-12').textContent, /Not awarded/);
  assert.match(q('cmp-awarded-total-6').textContent, /1 line, ₹900\.00/);
  await render(React.createElement(m.RfqComparison, { comparison, choices: {}, onChoose() {}, editable: false }));
  assert.equal(q('cmp-cell-11-5').querySelector('input[type="radio"]').disabled, true);
});
await check('award helpers: cheapest per line skips expired; body un-awards lines with no pick', () => {
  assert.deepEqual(m.cheapestChoices(comparison), { 11: 6, 12: 5 });
  assert.deepEqual(m.awardBody(comparison, { 11: 6, 12: null }), [{ rfqLineId: 11, quoteLineId: 60 }, { rfqLineId: 12, quoteLineId: null }]);
  assert.ok(m.sameChoices({ 11: 6 }, { 11: 6, 12: null }));
  assert.ok(!m.sameChoices({ 11: 6 }, { 11: 5 }));
});

// ── quote entry ───────────────────────────────────────────────────────────
await check('quote cells: numbers tidied, text refused, empty stays empty', () => {
  assert.deepEqual(m.readQuoteCell('unitPrice', '₹ 1,250.50'), { ok: true, text: '1250.5' });
  assert.deepEqual(m.readQuoteCell('gstRate', '18%'), { ok: true, text: '18' });
  assert.deepEqual(m.readQuoteCell('leadTimeDays', '14 days'), { ok: true, text: '14' });
  assert.deepEqual(m.readQuoteCell('unitPrice', ''), { ok: true, text: '' });
  assert.equal(m.readQuoteCell('unitPrice', 'abc').ok, false);
  assert.equal(m.readQuoteCell('gstRate', '180').ok, false);
  assert.equal(m.readQuoteCell('leadTimeDays', '2.5').ok, false);
  assert.deepEqual(m.readQuoteCell('remark', ' ex-works '), { ok: true, text: 'ex-works' });
  assert.equal(m.quoteLineBody(11, { unitPrice: '', gstRate: '18', leadTimeDays: '', qtyOffered: '', remark: '' }).unitPrice, null);
  assert.equal(m.quoteLineBody(11, { unitPrice: '0', gstRate: '', leadTimeDays: '', qtyOffered: '', remark: '' }).unitPrice, 0);
});
await check('quote grid: a pasted block from Excel fills rows and columns; a bad cell is refused in words', async () => {
  const lines = [{ id: 11, lineNo: 1, item, quantity: 10, neededBy: null }, { id: 12, lineNo: 2, item: { ...item, id: 2, code: 'PL-12' }, quantity: 5, neededBy: null }];
  let draft = { 11: m.emptyQuoteLine(), 12: m.emptyQuoteLine() };
  const show = () => render(React.createElement(m.QuoteGrid, { lines, draft, onDraft: (d) => { draft = d; } }));
  await show();
  const cellEl = (r, c) => document.querySelector(`[data-cell="${r}:${c + 1}"]`);
  const paste = async (el, text) => {
    const event = new dom.window.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
    await React.act(async () => { el.dispatchEvent(event); await sleep(0); });
  };
  await click(cellEl(0, 0));
  await paste(cellEl(0, 0), '₹1,250\t18%\t14\t10\tex-works\n980\t18\t7\t\t');
  assert.equal(draft[11].unitPrice, '1250');
  assert.equal(draft[11].gstRate, '18');
  assert.equal(draft[11].leadTimeDays, '14');
  assert.equal(draft[11].remark, 'ex-works');
  assert.equal(draft[12].unitPrice, '980');
  assert.equal(draft[12].leadTimeDays, '7');
  await show();
  assert.equal(cellEl(0, 0).textContent, '1250');
  await click(cellEl(0, 0));
  await paste(cellEl(0, 0), 'call us');
  assert.equal(draft[11].unitPrice, '1250');
  assert.match(q('quote-grid').textContent, /"call us" is not a number/);
  assert.equal(m.pricedLines(draft), 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
