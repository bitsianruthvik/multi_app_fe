// Run from multi_app_fe: node scripts/cf_erp_grn_money_test.mjs
// CF_ERP GRN money capture (init.sql §80): the live arithmetic agrees with the backend's (grnMoney.js) on the same cases;
// the Receive button's blockers; and the GRN dialog itself — prefilled from the PO line and the item, CGST + SGST vs IGST,
// the state picker when the company has no GST state, "Invoice to follow", freight into the landed cost, the request it sends.
// The API is mocked; no network.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/acme/cf_erp/receive', pretendToBeVisual: true });
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

// ── fixtures ────────────────────────────────────────────────────────────────
const item = (id, code, trackedBy = 'quantity') => ({ id, code, name: `${code} name`, uom: 'nos', trackedBy });
const line = (id, it, quantity, unitPrice) => ({ id, lineNo: id, item: it, quantity, received: 0, outstanding: quantity, unitPrice, amount: null, expectedDate: null, note: null, receipts: [] });
const PO = { id: 7, code: 'PO-7', supplier: { id: 3, name: 'Steel Co' }, suppliedByCustomer: false, stage: 'waiting', lines: [line(11, item(1, 'PL-A'), 10, 100), line(12, item(2, 'PL-B'), 5, 200)] };
const ctxOf = (o = {}) => ({
  purchaseOrder: { id: 7, code: 'PO-7', reverseCharge: false, suppliedByCustomer: false },
  company: { stateCode: '27', stateName: 'Maharashtra', gstin: '27AAPFU0939F1ZV' },
  supplier: { id: 3, name: 'Steel Co', stateCode: '27', registration: 'regular', gstin: null },
  gstRates: [0, 5, 12, 18, 28], supply: { isIgst: false, zeroRated: false, note: null, problem: null },
  needsCompanyState: false, needsSupplierState: false,
  lines: [{ lineId: 11, itemId: 1, unitPrice: 100, uom: 'nos', hsnCode: '7208', gstRate: 18 }, { lineId: 12, itemId: 2, unitPrice: 200, uom: 'nos', hsnCode: '7306', gstRate: 12 }],
  ...o,
});
let CTX = ctxOf();
const AREAS = [{ id: 1, code: 'MAIN', name: 'Main store', purpose: 'storage', status: 'active', machine: null, notes: null }];
const calls = [];
globalThis.__routes = [
  ['GET', /^\/purchase-orders\/7\/grn-context/, () => CTX],
  ['GET', /^\/stocking-areas$/, () => AREAS],
  ['GET', /^\/tax\/states$/, () => [{ code: '27', name: 'Maharashtra' }, { code: '29', name: 'Karnataka' }]],
  ['POST', /^\/purchase-orders\/7\/grn$/, ({ body }) => ({ bill: { id: 1, invoice: { pending: !!body.invoice.pending, no: body.invoice.no ?? null, date: body.invoice.date ?? null } }, movements: [], held: [], order: { code: 'PO-7', stage: 'part_received' }, warnings: [] })],
];
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
  '@shared/ui': `export * from ${JSON.stringify(resolve('src/shared/ui/SheetGrid.tsx').split('\\').join('/'))}; export * from ${JSON.stringify(resolve('src/shared/ui/storage.ts').split('\\').join('/'))};`,
};
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client';
      export { React, createRoot };
      export { GrnDialog } from './src/apps/cf_erp/components/GrnDialog';
      export * from './src/apps/cf_erp/lib/grnMoney';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^(@core\/(api\/client|contexts\/AuthContext)|@shared\/ui)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js', resolveDir: process.cwd() }));
  } }],
  loader: { '.css': 'empty' },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `grn-money-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async (ms = 40) => React.act(async () => { await sleep(ms); });
const click = async (el) => { assert.ok(el, 'nothing to click'); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await settle(); };
const setValue = async (input, value) => {
  assert.ok(input, 'no input');
  await React.act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await sleep(0);
  });
};
const q = (id) => document.querySelector(`[data-testid="${id}"]`);
const qa = (id) => [...document.querySelectorAll(`[data-testid="${id}"]`)];
const near = (a, b, eps = 0.005) => Math.abs(a - b) <= eps;

// ── 1. the arithmetic agrees with the backend's ─────────────────────────────
const BE = await import(pathToFileURL(resolve('../multi_app_be/apps/cf_erp/services/grnMoney.js')).href);
const TAX = await import(pathToFileURL(resolve('../multi_app_be/apps/cf_erp/services/taxService.js')).href);
await check('the same bill, worked out here and by the backend, agrees to the paisa (intra, inter, none; taxable and plain charges)', () => {
  const cases = [
    { lines: [{ quantity: '10', unitPrice: '100', discountMode: 'pct', discountValue: '10', gstRate: '18' }, { quantity: '5', unitPrice: '200', discountMode: 'amt', discountValue: '50', gstRate: '12' }],
      freight: { amount: '190', taxable: true, gstRate: '18' }, other: { amount: '', taxable: false, gstRate: '18' } },
    { lines: [{ quantity: '3', unitPrice: '33.33', discountMode: 'pct', discountValue: '7.5', gstRate: '5' }, { quantity: '7', unitPrice: '12.345', discountMode: 'pct', discountValue: '', gstRate: '28' }, { quantity: '1', unitPrice: '0', discountMode: 'pct', discountValue: '', gstRate: '0' }],
      freight: { amount: '100.01', taxable: false, gstRate: '18' }, other: { amount: '55.55', taxable: true, gstRate: '5' } },
  ];
  for (const kind of ['intra', 'inter', 'none']) {
    const supply = kind === 'none' ? TAX.supplyOf({ supplierState: null, placeOfSupply: '27', registration: 'unregistered', direction: 'in' }) : TAX.supplyOf({ supplierState: kind === 'intra' ? '27' : '29', placeOfSupply: '27', registration: 'regular', direction: 'in' });
    for (const c of cases) {
      const fe = m.computeGrn({ ...c, kind });
      const be = BE.computeGrnMoney({
        lines: c.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountMode: l.discountValue ? l.discountMode : null, discountValue: l.discountValue, gstRate: l.gstRate })),
        charges: { freight: c.freight, other: c.other }, supply,
      });
      assert.ok(near(fe.totals.total, be.totals.total, 1e-9), `${kind}: total ${fe.totals.total} vs ${be.totals.total}`);
      assert.ok(near(fe.totals.landed, be.totals.landed, 1e-9), `${kind}: landed`);
      for (const k of ['cgst', 'sgst', 'igst', 'taxable']) assert.ok(near(fe.totals[k], be.totals[k], 1e-9), `${kind}: ${k}`);
      fe.lines.forEach((l, i) => {
        assert.ok(near(l.freightShare, be.lines[i].freightAlloc, 1e-9), `${kind}: share ${i}`);
        assert.ok(near(l.landedUnitCost, be.lines[i].landedUnitCost, 1e-9), `${kind}: landed unit ${i}`);
      });
    }
  }
});

await check('shares of a charge add up to it exactly', () => {
  for (let t = 0; t < 300; t++) {
    const w = Array.from({ length: 1 + (t % 6) }, (_, i) => ((t * 13 + i * 7) % 9));
    const total = ((t * 7919) % 100000) / 100;
    const s = m.shareOut(total, w);
    assert.ok(Math.abs(s.reduce((a, b) => a + b, 0) - total) < 1e-9);
  }
});

await check('which tax: same state CGST+SGST, another IGST, an unregistered supplier none, a missing state unknown', () => {
  assert.equal(m.supplyKind({ companyState: '27', supplierState: '27' }), 'intra');
  assert.equal(m.supplyKind({ companyState: '27', supplierState: '29' }), 'inter');
  assert.equal(m.supplyKind({ companyState: null, supplierState: '29' }), null);
  assert.equal(m.supplyKind({ companyState: '27', supplierState: null, registration: 'unregistered' }), 'none');
});

await check('Receive is blocked, in words, until price, GST rate and invoice are given (or "to follow")', () => {
  const lineIn = { quantity: '5', unitPrice: '', mrp: '', discountMode: 'pct', discountValue: '', gstRate: '' };
  const base = { header: { invoiceNo: '', invoiceDate: '', invoicePending: false, areaId: '1' }, kind: 'intra', needsState: null, freight: { amount: '', taxable: false, gstRate: '' }, other: { amount: '', taxable: false, gstRate: '' } };
  const b = m.grnBlockers({ ...base, lines: [{ included: true, label: 'PL-A', outstanding: 10, in: lineIn }] });
  assert.ok(b.some((x) => /invoice number/.test(x)) && b.some((x) => /invoice date/.test(x)) && b.some((x) => /unit price is required/.test(x)) && b.some((x) => /GST rate is required/.test(x)), b.join(' | '));
  const ok = m.grnBlockers({ ...base, header: { ...base.header, invoicePending: true }, lines: [{ included: true, label: 'PL-A', outstanding: 10, in: { ...lineIn, unitPrice: '10', gstRate: '18' } }] });
  assert.deepEqual(ok, []);
  assert.ok(m.grnBlockers({ ...base, header: { ...base.header, invoicePending: true }, lines: [{ included: true, label: 'PL-A', outstanding: 10, in: { ...lineIn, quantity: '11', unitPrice: '10', gstRate: '18' } }] }).some((x) => /only 10/.test(x)));
  assert.ok(m.grnBlockers({ ...base, header: { ...base.header, invoicePending: true }, freight: { amount: '50', taxable: true, gstRate: '' }, lines: [{ included: true, label: 'PL-A', outstanding: 10, in: { ...lineIn, unitPrice: '10', gstRate: '18' } }] }).some((x) => /Freight is taxable/.test(x)));
  assert.ok(m.grnBlockers({ ...base, lines: [{ included: false, label: 'PL-A', outstanding: 10, in: lineIn }] }).some((x) => /Tick at least one line/.test(x)));
  assert.deepEqual(m.grnBlockers({ ...base, kind: 'none', header: { ...base.header, invoicePending: true }, lines: [{ included: true, label: 'PL-A', outstanding: 10, in: { ...lineIn, unitPrice: '10' } }] }), [], 'no GST rate needed from a supplier who charges none');
});

// ── 2. the dialog ───────────────────────────────────────────────────────────
let root;
const mount = async (po = PO, lineId = 11, onReceived = () => {}) => {
  if (root) await React.act(async () => { root.unmount(); });
  document.getElementById('app').innerHTML = '';
  root = createRoot(document.getElementById('app'));
  await React.act(async () => { root.render(React.createElement(m.GrnDialog, { po, lineId, onClose: () => {}, onReceived })); await sleep(60); });
  await settle(120);
};
const rowOf = (n) => qa('grn-row')[n];
const inRow = (n, id) => rowOf(n).querySelector(`[data-testid="${id}"]`);

await check('opens with the clicked line ticked, price from the PO, HSN and GST rate from the item, CGST + SGST for a same-state supplier', async () => {
  CTX = ctxOf(); calls.length = 0;
  await mount();
  assert.ok(q('grn-dialog'), 'dialog open');
  assert.equal(qa('grn-row').length, 2, 'both pending lines are on the grid');
  assert.equal(inRow(0, 'grn-price').value, '100'); assert.equal(inRow(0, 'grn-hsn').value, '7208'); assert.equal(inRow(0, 'grn-qty').value, '10');
  assert.equal(inRow(1, 'grn-hsn').value, '7306');
  assert.ok(inRow(1, 'grn-qty').disabled, 'the other line is not ticked');
  assert.match(q('grn-supply').textContent, /CGST \+ SGST/);
  assert.match(q('grn-lines').textContent, /CGST \+ SGST ₹/);
  assert.ok(near(Number(q('grn-total').textContent.replace(/[^\d.]/g, '')), 1180), `total ${q('grn-total').textContent}`);
});

await check('Receive stays disabled — and says why — until the invoice is typed', async () => {
  assert.ok(q('grn-receive').disabled);
  assert.match(q('grn-blocker').textContent, /invoice number/);
  await setValue(q('grn-invoice-no'), 'S-100');
  assert.match(q('grn-blocker').textContent, /invoice date/);
  await setValue(q('grn-invoice-date'), '2026-10-17');
  assert.ok(!q('grn-receive').disabled, q('grn-blocker').textContent);
});

await check('a discount and freight change the taxable value, the tax, the landed cost and the total as you type', async () => {
  await setValue(inRow(0, 'grn-discount'), '10');                      // 10% of 1,000 → taxable 900
  await setValue(q('grn-freight'), '90');                              // not taxable: only the landed cost moves
  const t = (id) => Number(q(id).textContent.replace(/[^\d.]/g, ''));
  assert.ok(near(t('grn-total'), 900 + 90 + 162), `total ${t('grn-total')}`);       // 900 + 90 freight + 18% of 900
  assert.ok(near(t('grn-landed'), 990), `landed ${t('grn-landed')}`);
  assert.equal(inRow(0, 'grn-price').value, '100');
  assert.match(rowOf(0).textContent, /99\.0000|99\.00/, 'landed unit cost = 990 / 10');
});

await check('booking sends the money: lines with price / discount / HSN / rate, the invoice, the freight', async () => {
  const got = [];
  await mount(PO, 11, (r) => got.push(r));
  await setValue(q('grn-invoice-no'), 'S-101'); await setValue(q('grn-invoice-date'), '2026-10-17');
  await setValue(inRow(0, 'grn-mrp'), '150'); await setValue(inRow(0, 'grn-discount'), '10'); await setValue(q('grn-freight'), '90');
  calls.length = 0;
  await click(q('grn-receive'));
  const post = calls.find((c) => c.method === 'POST');
  assert.ok(post, 'POST sent');
  assert.equal(post.path, '/purchase-orders/7/grn');
  assert.deepEqual(post.body.invoice, { no: 'S-101', date: '2026-10-17' });
  assert.equal(post.body.stockingAreaId, '1');
  assert.equal(post.body.lines.length, 1);
  const l = post.body.lines[0];
  assert.equal(l.lineId, 11); assert.equal(l.unitPrice, '100'); assert.equal(l.mrp, '150'); assert.equal(l.discountMode, 'pct'); assert.equal(l.discountValue, '10'); assert.equal(l.hsnCode, '7208'); assert.equal(l.gstRate, '18');
  assert.equal(post.body.charges.freight.amount, '90'); assert.equal(post.body.charges.freight.taxable, false);
  assert.equal(got.length, 1, 'onReceived called');
});

await check('"Invoice to follow" lifts the invoice requirement and sends the flag', async () => {
  await mount();
  const box = document.querySelector('input[aria-label="Invoice to follow"]');
  await click(box);
  assert.ok(!q('grn-receive').disabled, q('grn-blocker').textContent);
  calls.length = 0;
  await click(q('grn-receive'));
  assert.equal(calls.find((c) => c.method === 'POST').body.invoice.pending, true);
});

await check('a supplier in another state: IGST, and no CGST / SGST column', async () => {
  CTX = ctxOf({ supplier: { id: 3, name: 'Steel Co', stateCode: '29', registration: 'regular', gstin: null } });
  await mount();
  assert.match(q('grn-supply').textContent, /IGST/);
  assert.match(q('grn-lines').textContent, /IGST ₹/);
  assert.ok(!/CGST \+ SGST ₹/.test(q('grn-lines').textContent));
});

await check('company GST state not set: a warning and a picker; booking is blocked until one is picked, then sent', async () => {
  CTX = ctxOf({ company: { stateCode: null, stateName: null, gstin: null }, needsCompanyState: true });
  await mount();
  assert.ok(q('grn-state-warning'), 'warning shown');
  assert.match(q('grn-state-warning').textContent, /not set/);
  await click(document.querySelector('input[aria-label="Invoice to follow"]'));
  assert.ok(q('grn-receive').disabled);
  assert.match(q('grn-blocker').textContent, /company's GST state/);
  const native = q('grn-company-state');
  assert.ok(native, 'picker present');
  await setValue(native, '27');
  await settle();
  assert.ok(!q('grn-receive').disabled, q('grn-blocker').textContent);
  assert.match(q('grn-supply').textContent, /CGST \+ SGST/, 'the picked state decides the split');
  calls.length = 0;
  await click(q('grn-receive'));
  assert.equal(calls.find((c) => c.method === 'POST').body.companyStateCode, '27');
});

await check('full screen is a button on the dialog', async () => {
  CTX = ctxOf();
  await mount();
  const btn = q('grn-full-screen');
  assert.ok(btn);
  await click(btn);
  assert.ok(document.querySelector('.MuiDialog-paperFullScreen'), 'the dialog is full screen');
  await click(q('grn-full-screen'));
  assert.ok(!document.querySelector('.MuiDialog-paperFullScreen'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
