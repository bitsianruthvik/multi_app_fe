// Run from multi_app_fe: node scripts/cf_erp_nest_custom_plate_test.mjs
// CUSTOM PLATE SIZES THE AI PROPOSES (§90, 2026-10-19, item 20): the pure logic (lib/nesting customPlateBadge,
// customPlatesLine, acceptBody sending the custom size, swapPlan saying it; lib/plateRules) and the screens — the Compare
// tab saying "custom size, not in the catalog yet" for AI's plates, and Setup › Cutting's plate-rules card switching
// custom sizes on with the mill's limits. Against a pretend API; it does not replace a browser.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/setup', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  try { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true }); } catch { /* skip */ }
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20, toJSON() { return {}; } });

const apiStub = `export async function apiFetch(url, o = {}) {
  const res = await globalThis.fetch(url, { method: o.method || 'GET', body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await res.text();
  if (!res.ok) throw new Error('API request failed: ' + res.status + ' x - ' + text);
  return JSON.parse(text);
}`;
const authStub = 'export const useAuth = () => ({ user: globalThis.__user ?? null });';
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; export { React, createRoot }; export { MemoryRouter } from 'react-router-dom';
      export { NestCompareTab } from './src/apps/cf_erp/components/Nesting/NestCompareTab';
      export { PlateChangeProvider } from './src/apps/cf_erp/components/Nesting/PlateChange';
      export { NestPlateRulesCard } from './src/apps/cf_erp/components/NestPlateRulesCard';
      export { customPlateBadge, customPlatesLine, acceptBody, swapPlan, CUSTOM_NOT_IN_CATALOG } from './src/apps/cf_erp/lib/nesting';
      export { plateRulesBody, limitsDraft, badMm } from './src/apps/cf_erp/lib/plateRules';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/api\/client$/ }, () => ({ path: 'api', namespace: 'stub' }));
    b.onResolve({ filter: /^@core\/contexts\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'stub' }));
    b.onLoad({ filter: /^api$/, namespace: 'stub' }, () => ({ contents: apiStub, loader: 'js' }));
    b.onLoad({ filter: /^auth$/, namespace: 'stub' }, () => ({ contents: authStub, loader: 'js' }));
  } }],
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error', loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `nest-custom-plate-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const {
  React, createRoot, MemoryRouter, NestCompareTab, PlateChangeProvider, NestPlateRulesCard,
  customPlateBadge, customPlatesLine, acceptBody, swapPlan, CUSTOM_NOT_IN_CATALOG, plateRulesBody, limitsDraft, badMm,
} = await import(pathToFileURL(artifact));
await unlink(artifact);
const inRouter = (el) => React.createElement(MemoryRouter, null, el);

let passed = 0, failed = 0;
let root = null;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); try { if (root) await React.act(async () => { root.unmount(); }); } catch { /* gone */ } root = null; document.body.innerHTML = ''; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = (ms = 30) => React.act(async () => { await sleep(ms); });
const waitFor = async (cond, what, ms = 6000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false; try { ok = !!cond(); } catch { /* not yet */ }
    if (ok) return;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await settle(20);
  }
};
const $ = (id) => document.querySelector(`[data-testid=${id}]`);

/* ---- the server's shapes ---------------------------------------------------------------------- */
const proposal = (o = {}) => ({
  steelKey: '12|E350|MS', thickness: 12, length: 1950, width: 1900, grade: 'E350', material: 'MS', impactClass: 'BO', inCatalog: false, itemId: null, code: null,
  plates: 1, replaces: [{ plateItemId: 7, plateCode: 'PL-12-6000', length: 6000, width: 2000, plates: 1 }], savingKg: 781.4,
  before: { plates: 1, kg: 1130.4 }, after: { plates: 1, kg: 349 }, limits: null,
  sentence: `AI proposes a custom plate 12 mm × 1950 × 1900 E350 BO for 1 plate of PL-12-6000: 781.4 kg less steel bought, and as much less waste. ${'Custom size, not in the catalog yet — it is added to the catalog when this nesting is used.'}`, ...o,
});
const customNest = (o = {}) => ({
  lotNo: 'N-001', plateItemId: null, plateCode: 'CUSTOM 1950 × 1900', plateName: 'Custom plate', source: 'catalog', thickness: 12, grade: 'E350', material: 'MS', density: 7850,
  length: 1950, width: 1900, requiredLength: 1809, requiredWidth: 1812, sheetArea: 3705000, usedArea: 2000000, wasteArea: 1705000, wastePct: 46, weightKg: 349, wasteKg: 0, sequences: [], layout: 'free',
  pieces: [{ cutPlateId: 5, seqNo: 1, rowNo: 1, x: 3, y: 3, length: 1200, width: 400, rotated: false, rotationDeg: 0 }],
  customPlate: { thickness: 12, length: 1950, width: 1900, grade: 'E350', material: 'MS', impactClass: 'BO', inCatalog: false, itemId: null, code: null, replaces: { plateItemId: 7, plateCode: 'PL-12-6000', length: 6000, width: 2000 }, note: 'Custom size, not in the catalog yet — it is added to the catalog when this nesting is used.' },
  ...o,
});

/* ---- the pure logic ----------------------------------------------------------------------------- */

await check('customPlateBadge: a custom size not in the catalog yet says so (warning), what it replaces in the title; the catalog\'s own custom size is info; a catalog plate none', async () => {
  const b = customPlateBadge(customNest());
  assert.equal(b.label, 'Custom size — not in the catalog yet');
  assert.equal(b.family, 'warning');
  assert.ok(b.title.includes(CUSTOM_NOT_IN_CATALOG) && b.title.includes('It replaces PL-12-6000 (6,000 × 2,000)') && b.title.includes('E350 BO'), b.title);
  const c = customPlateBadge(customNest({ plateItemId: 99, customPlate: { ...customNest().customPlate, inCatalog: true, itemId: 99, code: 'P-12X1900X1950' } }));
  assert.equal(c.label, 'Custom size');
  assert.equal(c.family, 'info');
  assert.match(c.title, /a size the catalog has \(P-12X1900X1950\)/);
  assert.equal(customPlateBadge({ plateItemId: 7, customPlate: null }), null);
});

await check('customPlatesLine: the new sizes and the steel they save, in one line; none new → null', async () => {
  assert.equal(customPlatesLine([proposal(), proposal({ steelKey: 'x', thickness: 16, length: 1700, width: 1700, savingKg: 1144 })]),
    "AI's nesting uses 2 custom plate sizes not in the catalog yet (12 mm × 1,950 × 1,900, 16 mm × 1,700 × 1,700; 1,925 kg less steel): they are added to the catalog when it is used.");
  assert.equal(customPlatesLine([proposal({ inCatalog: true })]), null);
  assert.equal(customPlatesLine(undefined), null);
});

await check('acceptBody: a plate of a custom size not in the catalog sends its size (the server makes the plate); a catalog plate sends none', async () => {
  const plan = { groups: [{ key: 'g', nests: [customNest(), { ...customNest({ lotNo: 'N-002', plateItemId: 7, plateCode: 'PL-12-6000', customPlate: null }) }] }] };
  const body = acceptBody(plan);
  assert.deepEqual(body.nests[0].customPlate, { length: 1950, width: 1900, impactClass: 'BO' });
  assert.equal(body.nests[0].plateItemId, null);
  assert.equal(body.nests[1].customPlate, undefined);
});

await check('swapPlan: making AI\'s nesting the main one says the custom sizes it adds to the catalog', async () => {
  const m = { plates: 1, pieces: 8, tonnesBought: 0.35, netTonnes: 0.3, partsTonnes: 0.2, wastePct: 40, wasteKgTotal: 150, cutLengthM: 10, piercings: 8, cost: { value: 1, reason: null } };
  const a = {
    uploaded: { metrics: { ...m, tonnesBought: 1.13 }, perPlate: [] }, auto: { runId: 'r', status: 'ready', metrics: m, perPlate: [], customPlates: [proposal()] },
    alternative: { main: 'uploaded', runId: 'r', swapCount: 0, swappedAt: null, locked: false, lockReason: null, canSwap: { to: 'ai', ok: true, reason: null }, leftOverAfter: 0 },
  };
  const p = swapPlan(a);
  assert.ok(p.lines.some((l) => l.startsWith("AI's nesting uses a custom plate size not in the catalog yet (12 mm × 1,950 × 1,900")), p.lines.join(' | '));
});

await check('plateRulesBody / limitsDraft / badMm: blank = null; on / off kept; a size out of range is said', async () => {
  const d = limitsDraft({ on: true, maxLength: 12500, maxWidth: 2500, minLength: null, minWidth: null, step: 100 });
  assert.deepEqual(d, { maxLength: '12500', maxWidth: '2500', minLength: '', minWidth: '', step: '100' });
  assert.deepEqual(plateRulesBody('', true, d), { gradeRule: null, customPlates: { on: true, maxLength: 12500, maxWidth: 2500, minLength: null, minWidth: null, step: 100 } });
  assert.equal(badMm(''), false); assert.equal(badMm('0'), true); assert.equal(badMm('40000'), true); assert.equal(badMm('abc'), true); assert.equal(badMm('6000'), false);
});

/* ---- the screens ------------------------------------------------------------------------------ */
const reply = (out, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(out) });
const cost = (value) => ({ value, currency: 'INR', basis: 'list price', customerPlates: 0, reason: null });
const mUp = { plates: 1, pieces: 8, tonnesBought: 1.13, netTonnes: 1.1, partsTonnes: 0.2, wastePct: 80, wasteKgTotal: 900, offcuts: { count: 1, kg: 30 }, cutLengthM: 12, piercings: 8, cost: cost(70000) };
const mAi = { ...mUp, tonnesBought: 0.349, netTonnes: 0.349, wastePct: 40, wasteKgTotal: 150, offcuts: { count: 0, kg: 0 }, cost: cost(22000) };
const plate = (lotNo, origin, length, width, custom = null) => ({ lotNo, lotId: null, origin, plateCode: custom ? 'CUSTOM 1950 × 1900' : 'PL', thickness: 12, length, width, kerfMm: 3, pieces: 8, wastePct: 50, cost: 1000, custom });
const compare = () => ({
  line: { id: 1, lineNo: 1, orderId: 1, orderCode: 'SO-1' }, demand: { pieces: 8, cutPlates: 2, coversWholeLine: true },
  uploaded: { metrics: mUp, perPlate: [plate('B1', 'imported', 6000, 2000)], files: [], gradeCheck: { ok: true, rule: 'better', mismatches: [], unknown: [], substitutes: [], sentence: 'Every piece is on a plate of its grade and impact class.' } },
  auto: {
    runId: 'run-1', status: 'ready', ranAt: new Date().toISOString(), params: { effort: 'standard' }, trigger: 'upload', metrics: mAi,
    perPlate: [plate('N-001', 'auto', 1950, 1900, { inCatalog: false, length: 1950, width: 1900, grade: 'E350', impactClass: 'BO', replaces: { plateCode: 'PL' } })],
    plan: { groups: [] }, customPlates: [proposal()], gradeCheck: { ok: true, rule: 'better', mismatches: [], unknown: [], substitutes: [], sentence: 'Every piece is on a plate of its grade and impact class.' },
  },
  stale: null, delta: { plates: 0 }, headline: "AI's nesting uses 0.8 t less steel.", verdict: null,
  likeForLike: { same: true, uploadedPieces: 8, autoPieces: 8, differ: [], overNested: [] }, byThickness: [], leftOverSummary: null, autoCompare: null,
  wholeLine: null, willReplace: null, run: null, lastFailure: null, canAccept: null, alternative: null,
});
const puts = [];
let rulesNow = { on: false, schema: true, sizesSchema: true, plateSchema: true, gradeRule: null, gradeRuleDefault: 'exact', gradeRules: ['warn', 'better', 'exact', 'higher'], impactOrder: 'A (no impact test) < BR (room temperature) < BO / B0 (0 °C) < C (−20 °C)', customPlates: { on: false, maxLength: null, maxWidth: null, minLength: null, minWidth: null, step: null }, rows: [], resolved: [] };
globalThis.fetch = async (url, o = {}) => {
  const u = String(url); const method = o.method || 'GET';
  const body = o.body ? JSON.parse(o.body) : null;
  if (u.includes('/nest-shop-rules') && method === 'PUT') { puts.push(body); rulesNow = { ...rulesNow, gradeRule: body.gradeRule, customPlates: body.customPlates }; return reply(rulesNow); }
  if (u.includes('/nest-shop-rules')) return reply(rulesNow);
  if (u.includes('/nesting/compare')) return reply(compare());
  if (u.includes('/plate-changes')) return reply({ line: { id: 1 }, gate: { covered: false, purchaseOrders: [], needsApproval: false, held: false, pending: null, message: null }, canApprove: false, requests: [] });
  return reply({ line: { id: 1 }, saved: true, basis: 'saved plan', groups: [], manual: [], sizeAdvice: [], problems: [], totals: {} });
};
const host = () => { const d = document.createElement('div'); document.body.appendChild(d); return d; };
const mountEl = async (el) => { root = createRoot(host()); await React.act(async () => { root.render(el); await sleep(0); }); };
const unmount = async () => { if (root) await React.act(async () => { root.unmount(); }); root = null; document.body.innerHTML = ''; };

await check('the Compare tab: AI\'s custom plate size said — "not in the catalog yet" — and its plate marked so in the list', async () => {
  await mountEl(inRouter(React.createElement(PlateChangeProvider, { orderId: 1, lineId: 1 }, React.createElement(NestCompareTab, { orderId: 1, lineId: 1, canManage: true }))));
  await waitFor(() => $('compare-tab-custom'), 'the custom sizes');
  const t = $('compare-tab-custom').textContent;
  assert.match(t, /AI's nesting uses a custom plate size not in the catalog yet \(12 mm × 1,950 × 1,900; 781 kg less steel\)/);
  assert.ok(t.includes('Custom size, not in the catalog yet'), t);
  const marked = document.querySelector('[data-custom="new"]');
  assert.ok(marked && /custom size, not in the catalog yet/.test(marked.textContent), 'the plate is marked');
  await unmount();
});

await check('Setup › Cutting: switch custom sizes on, type the mill\'s limits, save — the PUT carries them (blank = null)', async () => {
  let saved = null;
  await mountEl(inRouter(React.createElement(NestPlateRulesCard, { rules: rulesNow, onSaved: (r) => { saved = r; } })));
  await waitFor(() => $('nest-plate-rules-card'), 'the card');
  const sw = document.querySelector('input[aria-label="Let the AI propose custom plate sizes"]');
  assert.ok(sw && !sw.checked);
  await React.act(async () => { sw.click(); await sleep(0); });
  const type = async (label, v) => {
    const el = document.querySelector(`input[aria-label="${label} custom plate mm"]`);
    assert.ok(el && !el.disabled, `${label} field enabled`);
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    await React.act(async () => { setter.call(el, v); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(0); });
  };
  await type('Longest', '12500'); await type('Widest', '2500'); await type('Step', '100');
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Save plate rules');
  assert.ok(btn && !btn.disabled);
  await React.act(async () => { btn.click(); await sleep(30); });
  await waitFor(() => puts.length === 1 && saved, 'the save');
  assert.deepEqual(puts[0], { gradeRule: null, customPlates: { on: true, maxLength: 12500, maxWidth: 2500, minLength: null, minWidth: null, step: 100 } });
  assert.equal(saved.customPlates.on, true);
  await type('Longest', '0');
  const btn2 = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Save plate rules');
  assert.equal(btn2.disabled, true, 'a size of 0 cannot be saved');
  await unmount();
});

await check('Setup › Cutting: without §90 the card says so and nothing can be changed', async () => {
  await mountEl(inRouter(React.createElement(NestPlateRulesCard, { rules: { ...rulesNow, plateSchema: false }, onSaved: () => {} })));
  await waitFor(() => $('nest-plate-rules-card'), 'the card');
  assert.match($('nest-plate-rules-card').textContent, /init\.sql §90/);
  assert.equal(document.querySelector('input[aria-label="Let the AI propose custom plate sizes"]').disabled, true);
  await unmount();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
