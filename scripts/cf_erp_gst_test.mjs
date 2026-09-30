// Run from multi_app_fe: node scripts/cf_erp_gst_test.mjs
// GST on the CF_ERP screens: the GSTIN box's live feedback, the tax line under an order amount, the order total's
// CGST + SGST vs IGST split, the invoice's problems list, the wording of Issue, and the amount in words.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MouseEvent', 'KeyboardEvent', 'Event', 'HTMLInputElement']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const base = './src/apps/cf_erp';
const entry = `export * from '${base}/lib/gst'; export * from '${base}/components/GstUi'; export * from '${base}/components/InvoiceParts'; export * from '${base}/components/OrderTotalBar'; export * from '${base}/lib/money';`;
const built = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic' });
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `gst-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const app = () => document.getElementById('app');
const show = async (el) => { const root = createRoot(app()); await React.act(() => root.render(el)); return root; };
const q = (id) => document.querySelector(`[data-testid="${id}"]`);
const typeInto = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await React.act(async () => { setter.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
};
const settle = () => React.act(async () => { await new Promise((r) => setTimeout(r, 20)); });

await check('rates and the header chip: "no GST rate" is never 0%', () => {
  assert.equal(m.gstRateText(18), '18%');
  assert.equal(m.gstRateText(0.25), '0.25%');
  assert.equal(m.gstRateText(0), '0%');
  assert.equal(m.gstRateText(null), 'no GST rate');
  assert.equal(m.hsnChipText('7308', 18), 'HSN 7308 · GST 18%');
  assert.equal(m.hsnChipText('7308', null), 'HSN 7308 · no GST rate');
  assert.equal(m.hsnChipText('998833', 18, true), 'SAC 998833 · GST 18%');
  assert.equal(m.hsnChipText(null, null), null);
});

await check('the tax line under an amount: rate and rupees, or the server\'s note', () => {
  assert.equal(m.lineTaxText({ gstRate: 18, taxTotal: 180000, taxNote: null }), 'GST 18% ₹1,80,000');
  assert.equal(m.lineTaxText({ gstRate: null, taxTotal: null, taxNote: 'no GST rate on the item' }), 'no GST rate on the item');
  assert.equal(m.lineTaxText(null), null);
});

await check('GSTIN box: counts characters, checks at 15, shows the state, refuses a bad one in plain words', async () => {
  const calls = [];
  const results = { GOOD: { valid: true, stateCode: '27', stateName: 'Maharashtra', pan: 'ABCDE1234F', message: null }, BAD: { valid: false, stateCode: null, stateName: null, pan: null, message: 'The check digit is wrong — please re-read the GSTIN.' } };
  const check15 = async (g) => { calls.push(g); return g.startsWith('27') ? results.GOOD : results.BAD; };
  const got = [];
  function Host() {
    const [v, setV] = React.useState('');
    return React.createElement(m.GstinField, { value: v, onChange: setV, check: check15, onResult: (r) => got.push(r.stateCode), debounceMs: 0 });
  }
  const root = await show(React.createElement(Host));
  const input = q('gstin-input');
  assert.match(q('gstin-feedback').textContent, /^Leave empty/);
  await typeInto(input, '27abcde');
  assert.equal(q('gstin-feedback').textContent, 'A GSTIN has 15 characters — 7 so far.');
  assert.equal(input.value, '27ABCDE');
  assert.equal(calls.length, 0);
  await typeInto(input, '27ABCDE1234F1Z5');
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(q('gstin-feedback').textContent, 'Valid — Maharashtra (27) · PAN ABCDE1234F');
  assert.equal(q('gstin-feedback').dataset.tone, 'ok');
  assert.deepEqual(got, ['27']);
  await typeInto(input, '29ABCDE1234F1Z5');
  await settle();
  assert.equal(q('gstin-feedback').textContent, 'The check digit is wrong — please re-read the GSTIN.');
  assert.equal(q('gstin-feedback').dataset.tone, 'bad');
  assert.deepEqual(got, ['27'], 'a bad GSTIN fills nothing');
  await typeInto(input, '29ABCDE1234F1Z55');
  assert.match(q('gstin-feedback').textContent, /this has 16/);
  await React.act(() => root.unmount());
});

await check('order total: CGST + SGST inside the state, IGST across states, never a ₹0 for "not priced"', async () => {
  const total = (extra) => ({ amount: 1000000, complete: true, unpricedLines: [], unmeasuredLines: [], ...extra });
  let root = await show(React.createElement(m.OrderTotalBar, { lineCount: 1, total: total({ taxable: 1000000, cgst: 90000, sgst: 90000, igst: 0, tax: 180000, gross: 1180000, isIgst: false }) }));
  let text = q('order-tax').textContent;
  assert.equal(text, 'Taxable₹10,00,000CGST₹90,000SGST₹90,000Total incl. GST₹11,80,000');
  await React.act(() => root.unmount());
  root = await show(React.createElement(m.OrderTotalBar, { lineCount: 1, total: total({ taxable: 1000000, cgst: 0, sgst: 0, igst: 180000, tax: 180000, gross: 1180000, isIgst: true }) }));
  text = q('order-tax').textContent;
  assert.equal(text, 'Taxable₹10,00,000IGST₹1,80,000Total incl. GST₹11,80,000');
  assert.ok(!text.includes('CGST') && !text.includes('SGST'));
  await React.act(() => root.unmount());
  // no tax figures from the server: the plain pre-tax total stands
  root = await show(React.createElement(m.OrderTotalBar, { lineCount: 1, total: total({}) }));
  assert.equal(q('order-tax'), null);
  assert.match(app().textContent, /Order total, before tax₹10,00,000/);
  await React.act(() => root.unmount());
  root = await show(React.createElement(m.OrderTotalBar, { lineCount: 2, total: { amount: 0, complete: false, unpricedLines: [1, 2], unmeasuredLines: [] } }));
  assert.match(app().textContent, /not priced/);
  assert.ok(!app().textContent.includes('₹0'));
  await React.act(() => root.unmount());
});

await check('invoice problems: each one listed with its jump link, none = nothing drawn', async () => {
  const gone = [];
  const problems = ['Company GSTIN not set', { text: 'Line 2 has no HSN code', fix: { label: 'Open the item', to: 'items/9' } }, { label: 'Buyer state unknown', to: 'customers' }];
  let root = await show(React.createElement(m.InvoiceProblems, { problems, onGo: (to) => gone.push(to) }));
  const items = [...document.querySelectorAll('[data-testid="invoice-problem"]')];
  assert.equal(items.length, 3);
  assert.match(items[0].textContent, /Company GSTIN not set/);
  assert.equal(items[0].querySelector('button'), null);
  assert.match(items[1].textContent, /Line 2 has no HSN code.*Open the item/);
  await React.act(async () => { items[1].querySelector('button').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  assert.deepEqual(gone, ['items/9']);
  assert.ok(items[2].querySelector('button'), 'a bare { label, to } still offers its link');
  await React.act(() => root.unmount());
  root = await show(React.createElement(m.InvoiceProblems, { problems: [], onGo: () => {} }));
  assert.equal(q('invoice-problems'), null);
  await React.act(() => root.unmount());
  assert.deepEqual(m.normalizeProblems(['a']).map((p) => p.text), ['a']);
});

await check('Issue says what it does: a number, frozen, and how a mistake is mended', async () => {
  const inv = { order: { id: 1, code: 'SO-20260930-0001' }, customer: { id: 2, name: 'KEPL Infra' }, totals: { taxable: 1000000, cgst: 90000, sgst: 90000, igst: 0, roundOff: 0.4, grandTotal: 1180000, inWords: null } };
  const t = m.issueConfirmText(inv);
  assert.equal(t.title, 'Issue this invoice to KEPL Infra?');
  assert.match(t.lead, /Issuing gives it the next invoice number and freezes it/);
  assert.match(t.lead, /₹11,80,000\.00 for SO-20260930-0001/);
  const root = await show(React.createElement(m.IssueConfirmBody, { invoice: inv }));
  const text = q('issue-confirm').textContent;
  assert.match(text, /Frozen at that moment/);
  assert.match(text, /the lines, rates and tax/);
  assert.match(text, /cancelled .* or corrected with a credit note/);
  await React.act(() => root.unmount());
});

await check('invoice totals: split by place of supply, round-off on its own line, amount in words under the total', async () => {
  const totals = { taxable: 1000000, cgst: 90000, sgst: 90000, igst: 0, roundOff: -0.4, grandTotal: 1180000, inWords: 'Rupees Eleven Lakh Eighty Thousand only' };
  let root = await show(React.createElement(m.InvoiceTotals, { totals, isIgst: false }));
  assert.match(q('invoice-totals').textContent, /Taxable value₹10,00,000\.00CGST₹90,000\.00SGST₹90,000\.00Round-off-₹0\.40Total₹11,80,000\.00/);
  assert.equal(q('in-words').textContent, 'Rupees Eleven Lakh Eighty Thousand only');
  await React.act(() => root.unmount());
  root = await show(React.createElement(m.InvoiceTotals, { totals: { ...totals, cgst: 0, sgst: 0, igst: 180000 }, isIgst: true }));
  assert.ok(!q('invoice-totals').textContent.includes('CGST'));
  assert.match(q('invoice-totals').textContent, /IGST₹1,80,000\.00/);
  await React.act(() => root.unmount());
  root = await show(React.createElement(m.AmountInWords, { words: null }));
  assert.equal(q('in-words'), null);
  await React.act(() => root.unmount());
});

await check('invoice list words and the e-way hint', () => {
  assert.equal(m.invoiceNoText({ invoiceNo: null, status: 'draft' }), 'Draft');
  assert.equal(m.invoiceNoText({ invoiceNo: 'INV/26-27/0001', status: 'issued' }), 'INV/26-27/0001');
  assert.equal(m.ewayHint(49999), null);
  assert.match(m.ewayHint(50001), /e-way bill/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
