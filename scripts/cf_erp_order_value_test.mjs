// Run from multi_app_fe: node scripts/cf_erp_order_value_test.mjs
// ONE ORDER VALUE; SCRAP & OFFCUTS; GST GAPS (2026-10-18; backend orderValueService / acceptanceService / costingService /
// taxFamilyService; BE suites order_value_test.mjs and scrap_offcut_charge_test.mjs). Rendered in jsdom against mocked
// routes shaped like the backend's answers:
//   the order value words (estimate / awaiting approval / accepted · estimate …), the order total bar once terms exist,
//   the Charges grid's scrap & offcuts bases and their units, the approval card's basis words, the cost sheet's scrap
//   & offcuts block with its "not costed" flags and links, and Setup › Company tax details › HSN & GST by family.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/orders/9001', pretendToBeVisual: true });
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
      export * from './src/apps/cf_erp/lib/orderValue';
      export { blankScrapCharge, chargeBasisText, chargeRateText, chargeRateUnit } from './src/apps/cf_erp/lib/acceptance';
      export { OrderValueText } from './src/apps/cf_erp/components/OrderValueText';
      export { OrderTotalBar } from './src/apps/cf_erp/components/OrderTotalBar';
      export { ChargesGrid } from './src/apps/cf_erp/components/Acceptance/TermGrids';
      export { ScrapOffcutsBlock } from './src/apps/cf_erp/pages/OrderCosting';
      export { TaxByFamilyCard } from './src/apps/cf_erp/components/Tax/TaxByFamilyCard';`,
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
const artifact = resolve(cache, `order-value-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter, Routes, Route } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const app = document.getElementById('app');
let root = null;
const mount = async (el) => {
  if (root) { await React.act(async () => { root.unmount(); }); root = null; }
  app.replaceChildren();
  const host = document.createElement('div'); app.appendChild(host);
  root = createRoot(host);
  await React.act(async () => {
    root.render(React.createElement(MemoryRouter, { initialEntries: ['/testco/cf_erp/x'] }, React.createElement(Routes, null, React.createElement(Route, { path: '/:company/cf_erp/*', element: el }))));
    await sleep(80);
  });
};
const q1 = (id) => document.querySelector(`[data-testid="${id}"]`);
const qa = (id) => [...document.querySelectorAll(`[data-testid="${id}"]`)];
const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const click = async (el) => { await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); await sleep(30); }); };

const V = (o) => ({ amount: null, basis: 'none', label: 'not priced', estimate: null, estimateComplete: false, accepted: null, pendingValue: null, differs: false, ...o });

await check('order value words: estimate, awaiting approval, accepted · estimate, a rate change waiting, not priced', async () => {
  assert.equal(m.orderValueText(V({ amount: 6914690, basis: 'estimate', label: 'estimate', estimate: 6914690, estimateComplete: true })), '₹69,14,690 estimate');
  assert.equal(m.orderValueText(V({ amount: 3872227, basis: 'awaiting_approval', estimate: 69146903, differs: true })), '₹38,72,227 terms awaiting approval · estimate ₹6,91,46,903');
  assert.equal(m.orderValueText(V({ amount: 3872227, basis: 'accepted', accepted: 3872227, estimate: 69146903, differs: true })), '₹38,72,227 accepted · estimate ₹6,91,46,903');
  assert.equal(m.orderValueText(V({ amount: 3872227, basis: 'accepted', accepted: 3872227, estimate: 3872227, differs: false })), '₹38,72,227 accepted');
  assert.match(m.orderValueText(V({ amount: 3872227, basis: 'accepted', pendingValue: 4000000 })), /rate change ₹40,00,000 waiting/);
  assert.equal(m.orderValueText(V({})), 'not priced');
  assert.equal(m.orderValueText(V({ amount: 500, basis: 'estimate', estimateComplete: false })), '₹500 estimate, part');
});

await check('the header value renders its tag and the estimate beside it; compact leaves the estimate out', async () => {
  const v = V({ amount: 3872227, basis: 'accepted', accepted: 3872227, estimate: 69146903, differs: true });
  await mount(React.createElement(m.OrderValueText, { value: v }));
  assert.equal(q1('order-value').getAttribute('data-basis'), 'accepted');
  assert.match(text(q1('order-value')), /₹38,72,227\s*accepted/);
  assert.match(text(q1('order-value-detail')), /estimate ₹6,91,46,903/);
  await mount(React.createElement(m.OrderValueText, { value: v, compact: true }));
  assert.equal(q1('order-value-detail'), null);
});

await check('order total bar: with accepted terms it leads with the acceptance and calls the line total the estimate', async () => {
  const total = { amount: 69146903, complete: true, unpricedLines: [], unmeasuredLines: [] };
  await mount(React.createElement(m.OrderTotalBar, { total, lineCount: 1, value: V({ amount: 3872227, basis: 'accepted', accepted: 3872227, estimate: 69146903, differs: true }) }));
  assert.match(text(q1('order-total-terms')), /Order value \(customer acceptance\), before tax\s*₹38,72,227\s*accepted/);
  assert.match(text(q1('order-total')), /Estimate from the line rates, before tax₹6,91,46,903/);
  await mount(React.createElement(m.OrderTotalBar, { total, lineCount: 1, value: V({ amount: 69146903, basis: 'estimate', estimate: 69146903, estimateComplete: true }) }));
  assert.equal(q1('order-total-terms'), null);
  assert.match(text(q1('order-total')), /Order total, before tax₹6,91,46,903/);
});

const LISTS = {
  operations: [{ id: 11, code: 'FAB', name: 'Fabrication' }, { id: 13, code: 'CUT', name: 'Plasma cutting' }],
  formulaFields: [], triggers: [], afterTriggers: [], dispatchModes: { each: '', all: '' }, billing: { pro_rata: '', on_completion: '' }, weightSources: { drawing: '', actual: '' },
};
await check('charges grid: the scrap & offcuts bases, their units (/kg, %), the kg note, and "Scrap & offcuts" adds one on the cutting operation', async () => {
  let terms = {
    charges: [
      { key: 'c1', label: 'Fabrication', operationId: 11, basis: { type: 'weight', weight: 'drawing' }, rate: 45000, billing: 'pro_rata' },
      { key: 'c2', label: 'Scrap', operationId: 13, basis: { type: 'scrap', of: 'scrap' }, rate: 20, billing: 'pro_rata' },
      { key: 'c3', label: 'Scrap %', operationId: 13, basis: { type: 'scrap', of: 'material_pct' }, rate: 5, billing: 'on_completion' },
    ],
    material: { rate: 70000, weight: 'drawing' }, lumpSums: [], milestones: [], stages: [],
  };
  const estimate = { charges: [
    { key: 'c1', quantity: 4, unit: 't', amount: 180000, note: null },
    { key: 'c2', quantity: 39.25, unit: 'kg', amount: 785, note: 'From the nesting: 2 plates, scrap 39.25 kg, offcuts 43.9 kg', basisKind: 'scrap', scrapOf: 'scrap', rateUnit: '₹/kg' },
    { key: 'c3', quantity: 280000, unit: '₹ material', amount: 14000, note: '5 % of the material charged', basisKind: 'scrap', scrapOf: 'material_pct', rateUnit: '%' },
  ], material: { quantity: 4, unit: 't', rate: 70000, amount: 280000 }, lumpSums: [], milestones: [] };
  const onChange = (patch) => { terms = { ...terms, ...patch }; };
  await mount(React.createElement(m.ChargesGrid, { terms, onChange, lists: LISTS, editable: true, estimate }));
  const rows = qa('acc-charge-row');
  assert.equal(rows.length, 3);
  assert.equal(rows[1].querySelector('[data-testid="charge-basis"]').value, 'scrap:scrap');
  assert.match(text(rows[1]), /\/kg/);
  assert.match(text(rows[2]), /%/);
  assert.match(text(rows[2]), /₹2,80,000\s*material/);
  assert.match(text(qa('charge-scrap-note')[0]), /From the nesting: 2 plates/);
  assert.equal(q1('add-scrap-charge'), null, 'one scrap charge is there already: no second button');
  terms = { ...terms, charges: [terms.charges[0]] };
  await mount(React.createElement(m.ChargesGrid, { terms, onChange, lists: LISTS, editable: true, estimate: null }));
  await click(q1('add-scrap-charge'));
  const added = terms.charges.at(-1);
  assert.deepEqual([added.label, added.operationId, added.basis], ['Scrap & offcuts', 13, { type: 'scrap', of: 'scrap' }]);
});

await check('approval card words: basis and rate of every kind', async () => {
  const rupee = (n) => `₹${n}`;
  assert.equal(m.chargeBasisText({ type: 'scrap', of: 'offcut' }), 'Scrap & offcuts — Offcut kg × rate');
  assert.equal(m.chargeBasisText({ type: 'weight', weight: 'actual' }), 'Actual weight');
  assert.equal(m.chargeBasisText({ type: 'formula', expression: 'SA * COATS', unit: 'm2' }), 'SA * COATS (m2)');
  assert.equal(m.chargeRateText(20, { type: 'scrap', of: 'scrap' }, rupee), '₹20 / kg');
  assert.equal(m.chargeRateText(5, { type: 'scrap', of: 'material_pct' }, rupee), '5 % of material');
  assert.equal(m.chargeRateText(45000, { type: 'weight', weight: 'drawing' }, rupee), '₹45000 / t');
  assert.equal(m.chargeRateUnit({ type: 'formula', expression: 'x', unit: 'm²' }), 'm²');
});

await check('cost sheet: scrap & offcuts actual vs charged, "not costed" flags with their links', async () => {
  const so = {
    actual: { scrapKg: 50, scrapValue: 0, offcutKg: 120, offcutValue: 7200, offcutLots: 1 }, ratePerKg: null,
    charges: [{ key: 's1', label: 'Scrap & offcuts', of: 'scrap', estimate: 39.25, unit: 'kg', rate: 20, contract: 785, earned: 785, actualKg: 50, onActual: 1000 }],
    charged: { contract: 785, earned: 785 },
    flags: [
      { code: 'NO_SCRAP_RATE', message: 'Scrap 50 kg not costed — set the scrap rate.', fix: { label: 'Setup › Cutting (scrap rate)', to: 'cutting' } },
      { code: 'NOT_COSTED', message: 'PL-10: 1 stock row not costed — set the plate rate (received with no price).', fix: { label: 'Open the item', to: 'items/77' } },
    ],
  };
  await mount(React.createElement(m.ScrapOffcutsBlock, { so }));
  assert.match(text(q1('cs-scrap-value')), /not costed/);
  assert.match(text(q1('cs-scrap-offcuts')), /Offcuts kept \(1 lot\)\s*120 kg/);
  assert.match(text(q1('cs-scrap-charge')), /estimate 39\.3 kg × ₹20\.00\/kg = ₹785; earned so far ₹785 · actual 50 kg would be ₹1,000/);
  const flags = qa('cs-flag');
  assert.equal(flags.length, 2);
  assert.equal(flags[0].querySelector('a').getAttribute('href'), '/testco/cf_erp/cutting');
  assert.equal(flags[1].querySelector('a').getAttribute('href'), '/testco/cf_erp/items/77');
});

await check('Company tax details › HSN & GST by family: the gaps, the suggestion filled in, Set sends it', async () => {
  globalThis.__user = { id: 7, uiPermissions: ['cf_erp_catalog_manage'] };
  let families = [
    { nodeId: 501, path: 'Steel › Plates › Plate', items: 196, noHsn: 196, noRate: 196, hsnCodes: [], rates: [], suggestion: { hsnCode: '7208', gstRate: 18, why: 'Flat-rolled steel — MS plates (7208)', rateOnList: true } },
    { nodeId: 502, path: 'Steel › Angles › Angle', items: 10, noHsn: 0, noRate: 0, hsnCodes: ['7216'], rates: [18], suggestion: { hsnCode: '7216', gstRate: 18, why: 'Angles (7216)', rateOnList: true } },
  ];
  globalThis.__routes['GET /tax/families'] = () => ({ gstRates: [0, 5, 12, 18, 28], families, gaps: { items: 206, noHsn: 196, noRate: 196 } });
  globalThis.__routes['PUT /tax/families/501'] = () => { families = families.map((f) => (f.nodeId === 501 ? { ...f, noHsn: 0, noRate: 0, hsnCodes: ['7208'], rates: [18] } : f)); return { dryRun: false, path: 'Steel › Plates › Plate', items: 196, definitions: 1, overwrite: false }; };
  await mount(React.createElement(m.TaxByFamilyCard));
  await React.act(async () => { await sleep(80); });
  assert.match(text(q1('tax-family-gaps')), /206 catalog items · 196 without an HSN code · 196 without a GST rate/);
  const row = qa('tax-family-row')[0];
  assert.match(text(row), /196 no GST rate.*suggested Flat-rolled steel — MS plates \(7208\), 18 %/);
  assert.equal(row.querySelector('[data-testid="tax-family-hsn"]').value, '7208', 'the suggestion is filled in, not saved');
  assert.equal(globalThis.__calls.filter((c) => c.method === 'PUT').length, 0);
  await click(row.querySelector('[data-testid="tax-family-set"]'));
  const put = globalThis.__calls.find((c) => c.method === 'PUT');
  const body = typeof put.body === 'string' ? JSON.parse(put.body) : put.body;
  assert.deepEqual(body, { hsnCode: '7208', gstRate: 18, overwrite: false });
  await React.act(async () => { await sleep(80); });
  assert.match(text(qa('tax-family-row')[0]), /now 7208/);
});

if (root) await React.act(async () => { root.unmount(); });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
