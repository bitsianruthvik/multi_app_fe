// Run from multi_app_fe: node scripts/cf_erp_money_test.mjs
// Money on the CF_ERP screens: Indian grouping, no decimals in lists / two in detail, a missing cost reads
// "not costed" (never ₹0), customer stock is never valued as ours, a partial order total says so.
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
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const base = './src/apps/cf_erp';
const entry = `export * from '${base}/lib/money'; export * from '${base}/lib/homeMoney'; export * from '${base}/components/Money'; export * from '${base}/components/OrderTotalBar'; export * from '${base}/components/PurchaseMoney';`;
const built = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic' });
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `money-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const app = () => document.getElementById('app');
const show = async (el) => { const root = createRoot(app()); await React.act(() => root.render(el)); return root; };

await check('rupees use Indian grouping, no decimals in a list, two in a detail', () => {
  assert.equal(m.rupeeText(1234567), '₹12,34,567');
  assert.equal(m.rupeeText(99999), '₹99,999');
  assert.equal(m.rupeeText(1234567.5, 2), '₹12,34,567.50');
  assert.equal(m.rupeeText(0), '₹0');
  assert.equal(m.rupeeText(-2500), '-₹2,500');
  assert.equal(m.rupeeText(56889502.06), '₹5,68,89,502');
});
await check('a missing cost is "not costed", never ₹0', () => {
  assert.equal(m.rupeeText(null), 'not costed');
  assert.equal(m.rupeeText(undefined, 2), 'not costed');
  assert.equal(m.rupeeText(Number.NaN), 'not costed');
  assert.equal(m.priceText(null), 'not costed');
  assert.equal(m.rateText(null, 'tonne'), 'no rate');
  assert.notEqual(m.rupeeText(null), m.rupeeText(0));
});
await check('prices keep paise only when they have them; rates name their basis', () => {
  assert.equal(m.priceText(85000), '₹85,000');
  assert.equal(m.priceText(1250.5), '₹1,250.50');
  assert.equal(m.rateText(85000, 'tonne'), '₹85,000 per tonne');
  assert.equal(m.rateText(12, 'unit'), '₹12 per piece');
  assert.equal(m.rateText(80, 'kg'), '₹80 per kg');
  assert.equal(m.billedText(669.288260, 't'), '× 669.288 t');
  assert.equal(m.billedText(null, 't'), null);
});
await check('kilograms and quantities', () => {
  assert.equal(m.kgText(1250.5), '1,250.5 kg');
  assert.equal(m.kgText(null), '—');
  assert.equal(m.qtyKgText({ qty: 5, kg: 600 }, 'nos'), '5 nos · 600 kg');
  assert.equal(m.qtyKgText({ qty: 5, kg: null }, 'nos'), '5 nos');
  assert.equal(m.qtyKgText({ qty: 40, kg: 40 }, 'kg'), '40 kg');
});
await check('Money renders the amount, or a muted "not costed"', async () => {
  let root = await show(React.createElement(m.Money, { value: 1234567 }));
  assert.equal(document.querySelector('[data-testid="money"]').textContent, '₹12,34,567');
  assert.equal(document.querySelector('[data-testid="not-costed"]'), null);
  await React.act(() => root.unmount());
  root = await show(React.createElement(m.Money, { value: null }));
  assert.equal(document.querySelector('[data-testid="not-costed"]').textContent, 'not costed');
  assert.equal(document.querySelector('[data-testid="money"]'), null);
  assert.ok(!app().textContent.includes('₹0'));
  await React.act(() => root.unmount());
  root = await show(React.createElement(m.Money, { value: undefined, missing: 'no rate' }));
  assert.equal(document.querySelector('[data-testid="not-costed"]').textContent, 'no rate');
  await React.act(() => root.unmount());
  root = await show(React.createElement(m.Money, { value: 1250.5, digits: 2 }));
  assert.equal(app().textContent, '₹1,250.50');
  await React.act(() => root.unmount());
});
await check('a stock row with no cost reads not costed; part costed says so; zero with uncosted stock is not ₹0', async () => {
  let root = await show(React.createElement(m.StockValue, { value: null, uncostedQty: 5 }));
  assert.equal(app().textContent, 'not costed');
  await React.act(() => root.unmount());
  root = await show(React.createElement(m.StockValue, { value: 0, uncostedQty: 5 }));
  assert.equal(app().textContent, 'not costed');
  await React.act(() => root.unmount());
  root = await show(React.createElement(m.StockValue, { value: 5000, uncostedQty: 2 }));
  assert.match(app().textContent, /₹5,000 \+ part not costed/);
  await React.act(() => root.unmount());
  root = await show(React.createElement(m.StockValue, { value: 5000, uncostedQty: 0 }));
  assert.equal(app().textContent, '₹5,000');
  await React.act(() => root.unmount());
});
await check('the owner tag names the customer; ours is plain', async () => {
  let root = await show(React.createElement(m.OwnerTag, { name: 'Acme Bridges' }));
  assert.equal(app().textContent, 'Acme Bridges');
  await React.act(() => root.unmount());
  root = await show(React.createElement(m.OwnerTag, { name: null }));
  assert.equal(app().textContent, 'Ours');
  await React.act(() => root.unmount());
  assert.equal(m.ownerLabel({ party: { id: 1, code: 'A', name: 'Acme' }, order: null }), 'Acme');
  assert.equal(m.ownerLabel(null), 'Ours');
});
await check('order total: complete says nothing; partial names the lines', async () => {
  let root = await show(React.createElement(m.OrderTotalBar, { total: { amount: 56889502.06, complete: true, unpricedLines: [], unmeasuredLines: [] } }));
  assert.equal(document.querySelector('[data-testid="order-total-warning"]'), null);
  assert.match(app().textContent, /₹5,68,89,502/);
  await React.act(() => root.unmount());
  root = await show(React.createElement(m.OrderTotalBar, { total: { amount: 50100, complete: false, unpricedLines: [20, 30], unmeasuredLines: [40] } }));
  const w = document.querySelector('[data-testid="order-total-warning"]').textContent;
  assert.match(w, /Not the whole order/); assert.match(w, /lines 20, 30 have no rate/); assert.match(w, /line 40 has no weight or length yet/);
  await React.act(() => root.unmount());
});
await check('last paid hint: supplier and date, one-click use, nothing to use when it already matches', async () => {
  const lastPaid = { unitPrice: 1250, orderId: 1, orderCode: 'PO-1', date: '2026-09-12T00:00:00.000Z', supplierName: 'Acme Steel' };
  let used = null;
  let root = await show(React.createElement(m.LastPaidHint, { lastPaid, current: 1000, onUse: (p) => { used = p; } }));
  assert.match(app().textContent, /last paid ₹1,250 \(Acme Steel, 2026-09-12\)/);
  const btn = app().querySelector('button');
  assert.equal(btn.textContent, 'Use');
  await React.act(() => btn.click());
  assert.equal(used, 1250);
  await React.act(() => root.unmount());
  root = await show(React.createElement(m.LastPaidHint, { lastPaid, current: 1250, onUse: () => {} }));
  assert.equal(app().querySelector('button'), null);
  await React.act(() => root.unmount());
  root = await show(React.createElement(m.LastPaidHint, { lastPaid: null }));
  assert.match(app().textContent, /never bought before/);
  await React.act(() => root.unmount());
});
await check('material margin = order total less material issued', () => {
  assert.deepEqual(m.materialMargin(1000000, 700000), { margin: 300000, pct: 30 });
  assert.equal(m.materialMargin(null, 5), null);
  assert.equal(m.materialMargin(0, 5), null);
});
await check('home tiles: ours valued apart, customers never added in, a missing permission drops its tile', () => {
  const val = {
    groupBy: 'owner', ours: { quantity: 10, value: 250000, uncostedQty: 0 }, customers: { quantity: 500, value: 99999999, uncostedQty: 0 },
    groups: [
      { key: 'ours', ours: { quantity: 10, value: 250000, uncostedQty: 0 }, customers: { quantity: 0, value: 0, uncostedQty: 0 }, rows: 4, owner: null },
      { key: 'party:7', owner: { id: 7, name: 'Acme' }, ours: { quantity: 0, value: 0, uncostedQty: 0 }, customers: { quantity: 500, value: 99999999, uncostedQty: 0 }, rows: 3 },
    ],
  };
  const po = [{ totals: { amount: 120000, unpricedLines: 1 } }, { totals: { amount: 30000, unpricedLines: 0 } }];
  const orders = [{ total: { amount: 5000000, complete: true } }, { total: { amount: 100000, complete: false } }];
  const all = m.moneyStats({ stockValue: val, openPurchases: po, orderBook: orders }, () => {});
  assert.deepEqual(all.map((s) => s.label), ['Stock value (ours)', 'Customer material held', 'Open purchase orders', 'Order book']);
  assert.equal(all[0].display, '₹2,50,000');
  assert.ok(!all[0].display.includes('9,99,99,999'));
  assert.equal(all[1].display, '3 lots');
  assert.equal(all[2].display, '₹1,50,000'); assert.match(all[2].hint, /1 line has no price/);
  assert.equal(all[3].display, '₹51,00,000'); assert.match(all[3].hint, /1 order is not fully priced/);
  const none = m.moneyStats({ stockValue: { ...val, ours: { quantity: 3, value: 0, uncostedQty: 3 } }, openPurchases: null, orderBook: null }, () => {});
  assert.deepEqual(none.map((s) => s.label), ['Stock value (ours)', 'Customer material held']);
  assert.equal(none[0].display, 'not costed');
});
dom.window.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
