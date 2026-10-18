// Run from multi_app_fe: node scripts/cf_erp_nest_alternative_test.mjs
// AI'S NESTING STORED BESIDE THE MANUAL ONE (§87, 2026-10-18): the pure swap logic (lib/nesting.swapPlan,
// plateSizeChanges, the net-steel row of compareTabRows) and the Compare tab's swap — which side is the main one, the
// button, the confirm that says what changes (plates, steel, net steel, plate sizes, left over, the purchase orders on
// the line), the POST, the read after it; locked with the reason; and the Nesting screen keeping the Compare tab when
// AI's nesting is the main one and no customer's plate is saved. Against a pretend API; it does not replace a browser.
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
dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20, toJSON() { return {}; } });

const stub = `export async function apiFetch(url, o = {}) {
  const res = await globalThis.fetch(url, { method: o.method || 'GET', body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await res.text();
  if (!res.ok) throw new Error('API request failed: ' + res.status + ' x - ' + text);
  return JSON.parse(text);
}`;
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; export { React, createRoot }; export { MemoryRouter } from 'react-router-dom';
      export { NestingPanel } from './src/apps/cf_erp/components/Nesting/NestingPanel';
      export { NestCompareTab } from './src/apps/cf_erp/components/Nesting/NestCompareTab';
      export { PlateChangeProvider } from './src/apps/cf_erp/components/Nesting/PlateChange';
      export { swapPlan, plateSizeChanges, compareTabRows } from './src/apps/cf_erp/lib/nesting';`,
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
const artifact = resolve(cache, `nest-alternative-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const { React, createRoot, MemoryRouter, NestingPanel, NestCompareTab, PlateChangeProvider, swapPlan, plateSizeChanges, compareTabRows } = await import(pathToFileURL(artifact));
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
const click = async (el, what) => { assert.ok(el, `no ${what}`); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await settle(); };

/* ---- a comparison, as the server answers it ------------------------------------------------- */
const cost = (value) => ({ value, currency: 'INR', basis: 'list price', customerPlates: 0, reason: null });
const mUp = { plates: 5, pieces: 39, tonnesBought: 2.497, netTonnes: 0.876, partsTonnes: 0.833, wastePct: 66.6, wasteKgTotal: 1664, offcuts: { count: 7, kg: 1621 }, cutLengthM: 78.9, piercings: 41, cost: cost(159305) };
const mAi = { plates: 3, pieces: 39, tonnesBought: 1.098, netTonnes: 0.898, partsTonnes: 0.833, wastePct: 24.1, wasteKgTotal: 265, offcuts: { count: 4, kg: 200 }, cutLengthM: 57.3, piercings: 41, cost: cost(97381) };
const plate = (lotNo, origin, length, width, t = 14) => ({ lotNo, lotId: origin === 'imported' ? 100 + Number(lotNo.replace(/\D/g, '')) : null, origin, plateCode: 'PL', thickness: t, length, width, kerfMm: 3, pieces: 8, wastePct: 50, cost: 1000 });
const upPlates = [plate('B1', 'imported', 3000, 1500), plate('B2', 'imported', 3000, 1500), plate('B3', 'imported', 3000, 1500), plate('B4', 'imported', 3000, 1500), plate('B5', 'imported', 3000, 1500)];
const aiPlates = [plate('N-001', 'auto', 6000, 2000), plate('N-002', 'auto', 3000, 1500), plate('N-003', 'auto', 3000, 1500)];
const alt = (o = {}) => ({ main: 'uploaded', runId: 'run-1', swapCount: 0, swappedAt: null, locked: false, lockReason: null, canSwap: { to: 'ai', ok: true, reason: null }, leftOverAfter: 0, ...o });
const answer = (o = {}) => ({
  line: { id: 1, lineNo: 1, orderId: 1, orderCode: 'SO-1' }, demand: { pieces: 39, cutPlates: 11, coversWholeLine: true },
  uploaded: { metrics: mUp, perPlate: upPlates, files: [] },
  auto: { runId: 'run-1', status: 'ready', ranAt: new Date().toISOString(), params: { effort: 'standard' }, trigger: 'upload', metrics: mAi, perPlate: aiPlates, plan: { groups: [] } },
  stale: null, delta: { plates: -2, tonnesBought: -1.399 }, headline: "AI's nesting uses 2 plates fewer and 1.4 t less steel.", verdict: null,
  likeForLike: { same: true, uploadedPieces: 39, autoPieces: 39, differ: [], overNested: [] }, byThickness: [], leftOverSummary: null, autoCompare: null,
  wholeLine: null, willReplace: null, run: null, lastFailure: null, canAccept: null, alternative: alt(), ...o,
});

/* ---- the pure logic --------------------------------------------------------------------------- */

await check('plateSizeChanges: the sizes a swap adds and takes away, more first', async () => {
  assert.deepEqual(plateSizeChanges(upPlates, aiPlates), ['+1 × 14 mm 6,000 × 2,000 mm', '−3 × 14 mm 3,000 × 1,500 mm']);
  assert.deepEqual(plateSizeChanges(aiPlates, aiPlates), []);
});

await check('swapPlan: the customer\'s nesting is the main one — "Make AI\'s nesting the main one", with what changes', async () => {
  const p = swapPlan(answer());
  assert.equal(p.show, true);
  assert.equal(p.to, 'ai');
  assert.equal(p.ok, true);
  assert.equal(p.why, null);
  assert.equal(p.mainLabel, "The customer's nesting is the main one");
  assert.equal(p.label, "Make AI's nesting the main one");
  assert.deepEqual(p.lines.slice(0, 4), [
    'Plates: 5 → 3.', 'Steel bought: 2.497 t → 1.098 t.', 'Net steel (offcuts kept): 0.876 t → 0.898 t.',
    'Plate sizes: +1 × 14 mm 6,000 × 2,000 mm, −3 × 14 mm 3,000 × 1,500 mm.',
  ]);
  assert.ok(p.lines.includes("The customer's nesting is kept. You can switch back until the line has a production order."));
  assert.equal(p.onOrder, null, 'no PO, no warning');
});

await check('swapPlan: AI\'s is the main one — "Switch back", the figures the other way round', async () => {
  const p = swapPlan(answer({ alternative: alt({ main: 'ai', canSwap: { to: 'uploaded', ok: true, reason: null }, swapCount: 1 }) }));
  assert.equal(p.to, 'uploaded');
  assert.equal(p.label, "Switch back to the customer's nesting");
  assert.equal(p.mainLabel, "AI's nesting is the main one");
  assert.equal(p.lines[0], 'Plates: 3 → 5.');
  assert.equal(p.lines[3], 'Plate sizes: +3 × 14 mm 3,000 × 1,500 mm, −1 × 14 mm 6,000 × 2,000 mm.');
  assert.ok(p.lines.includes("AI's nesting is kept beside it."));
});

await check('swapPlan: pieces left over and the purchase orders on the line are said; nothing on a PO is changed', async () => {
  const p = swapPlan(answer({ alternative: alt({ leftOverAfter: 2 }) }), { covered: true, needsApproval: false, purchaseOrders: [{ code: 'PO-000163' }] });
  assert.ok(p.lines.includes("2 pieces the customer nested are not on AI's plates and will be left over."));
  assert.equal(p.onOrder, 'A purchase order covers this line (PO-000163). The swap changes the plates the line needs. Nothing on the purchase order is changed — the buyer changes it by hand.');
  const q = swapPlan(answer(), { covered: true, needsApproval: true, purchaseOrders: [{ code: 'PO-1' }, { code: 'PO-2' }] });
  assert.match(q.onOrder, /\(PO-1, PO-2\)\. The swap changes the plates the line needs and goes to the MD for approval first\./);
});

await check('swapPlan: locked (a production order) — off, with the reason; nothing to swap without both sides', async () => {
  const reason = 'Line 1 of SO-1 has production orders (PRD-1…) — its nesting is frozen.';
  const p = swapPlan(answer({ alternative: alt({ locked: true, lockReason: reason, canSwap: { to: 'ai', ok: false, reason } }) }));
  assert.equal(p.ok, false);
  assert.equal(p.why, reason);
  assert.equal(swapPlan(answer({ alternative: null })).show, false, 'no alternative');
  assert.equal(swapPlan(answer({ auto: { runId: 'run-2', status: 'running', metrics: null, perPlate: [] } })).show, false, 'AI still running');
  assert.equal(swapPlan(null).show, false);
});

await check('compareTabRows: net steel (offcuts kept) beside steel bought, lower is better', async () => {
  const rows = compareTabRows(mUp, mAi);
  const net = rows.find((r) => r.key === 'netTonnes');
  assert.equal(rows[2].key, 'netTonnes');
  assert.equal(net.customer, '0.876 t');
  assert.equal(net.ours, '0.898 t');
  assert.equal(net.diff, '↑ 0.022 t more');
  assert.equal(net.better, 'customer');
});

/* ---- the Compare tab ------------------------------------------------------------------------ */

let compareNow = () => answer();
let gate = { covered: false, purchaseOrders: [], needsApproval: false, held: false, pending: null, message: null };
let altNow = { main: null, valid: false, runId: null, swapCount: 0, swappedAt: null, locked: false, lockReason: null };
let imported = true;
const calls = [];
const swaps = [];
const reply = (out, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(out) });
const planOf = () => ({
  line: { id: 1, lineNo: 1, orderId: 1, orderCode: 'SO-1', quantity: 1, orderStatus: 'confirmed' }, saved: true, basis: 'saved plan', manual: [], sizeAdvice: [], problems: [], drift: [],
  groups: [], totals: { lots: 0, plates: 0, pieces: 0, areaBought: 0, usedArea: 0, wasteArea: 0, wastePct: 0, weightKg: 0, wasteKg: 0, thickness: null, groups: 0, unplaced: 0 }, coverage: [],
});
globalThis.fetch = async (url, o = {}) => {
  const method = o.method || 'GET';
  const u = String(url);
  calls.push(`${method} ${u}`);
  const body = o.body ? JSON.parse(o.body) : null;
  if (u.includes('/nesting/alternative/swap')) {
    swaps.push(body);
    const to = body.to;
    compareNow = () => answer({ alternative: alt(to === 'ai' ? { main: 'ai', canSwap: { to: 'uploaded', ok: true, reason: null }, swapCount: 1 } : { swapCount: 2 }) });
    return reply({ main: to, runId: 'run-1', plates: 3, replacedPlates: 5, leftOver: 0, message: to === 'ai' ? "AI's nesting is now the main one: 3 plates in place of the customer's 5 plates." : "The customer's nesting is the main one again.", plateChange: { direct: true, impact: null } });
  }
  if (u.includes('/nesting/alternative')) return reply(altNow);
  if (u.includes('/nesting/compare')) return reply(compareNow());
  if (u.endsWith('/nesting/files')) return reply({ line: { id: 1 }, canUpload: true, readOnlyReason: null, limits: { maxFiles: 200, maxFileBytes: 4194304, kinds: ['dxf', 'nif'] }, plates: imported ? [{ lotId: 101 }] : [], coverage: [], leftOver: [], totals: null });
  if (u.includes('/nesting/runs/current')) return reply({ status: 'none' });
  if (u.includes('/nesting/choices')) return { ok: false, status: 404, text: async () => '{}' };
  if (u.includes('/plate-changes')) return reply({ line: { id: 1 }, gate, canApprove: false, requests: [] });
  if (u.includes('/section-nesting')) return reply({ profiles: [], problems: [], line: { id: 1 } });
  if (u.includes('/costs')) return reply({ lines: [] });
  return reply(planOf());
};
const reset = () => {
  calls.length = 0; swaps.length = 0; compareNow = () => answer(); imported = true;
  gate = { covered: false, purchaseOrders: [], needsApproval: false, held: false, pending: null, message: null };
  altNow = { main: null, valid: false, runId: null, swapCount: 0, swappedAt: null, locked: false, lockReason: null };
  try { localStorage.clear(); } catch { /* none */ }
};
const host = () => { const d = document.createElement('div'); document.body.appendChild(d); return d; };
const mountEl = async (el) => { root = createRoot(host()); await React.act(async () => { root.render(el); await sleep(0); }); };
const unmount = async () => { if (root) await React.act(async () => { root.unmount(); }); root = null; document.body.innerHTML = ''; };
const mountTab = (props = {}) => mountEl(inRouter(React.createElement(PlateChangeProvider, { orderId: 1, lineId: 1 },
  React.createElement(NestCompareTab, { orderId: 1, lineId: 1, canManage: true, ...props }))));

await check('the tab says which nesting is the main one and offers the swap', async () => {
  reset();
  await mountTab();
  await waitFor(() => $('compare-tab-swap'), 'the swap row');
  assert.equal($('compare-tab-swap').getAttribute('data-main'), 'uploaded');
  assert.match($('compare-tab-swap').textContent, /The customer's nesting is the main one/);
  assert.equal($('compare-tab-swap-button').textContent, "Make AI's nesting the main one");
  assert.equal($('compare-tab-swap-button').disabled, false);
  await unmount();
});

await check('swap: the confirm says what changes, then one POST with the run on screen, and the tab reads again', async () => {
  reset();
  let swapped = 0;
  await mountTab({ onSwapped: () => { swapped += 1; } });
  await waitFor(() => $('compare-tab-swap-button'), 'the button');
  await click($('compare-tab-swap-button'), 'the swap button');
  await waitFor(() => $('compare-tab-swap-dialog'), 'the confirm');
  const lines = [...document.querySelectorAll('[data-testid=compare-tab-swap-lines] li')].map((li) => li.textContent);
  assert.deepEqual(lines.slice(0, 2), ['Plates: 5 → 3.', 'Steel bought: 2.497 t → 1.098 t.']);
  assert.equal($('compare-tab-swap-po'), null, 'no PO warning when no PO covers the line');
  const before = calls.filter((c) => c.includes('/nesting/compare?')).length;
  await click($('compare-tab-swap-confirm'), 'the confirm button');
  await waitFor(() => $('compare-tab-swap-done'), 'the done note');
  assert.equal(swaps.length, 1);
  assert.equal(swaps[0].to, 'ai');
  assert.equal(swaps[0].runId, 'run-1', 'the run that was on screen');
  assert.equal(swaps[0].impact, true, 'the before / after sheet is asked for (no PO)');
  assert.match($('compare-tab-swap-done').textContent, /AI's nesting is now the main one/);
  assert.ok(calls.filter((c) => c.includes('/nesting/compare?')).length > before, 'the comparison is read again');
  assert.equal(swapped, 1, 'the Nesting tab is told to read the plates again');
  await waitFor(() => $('compare-tab-swap')?.getAttribute('data-main') === 'ai', 'main: ai');
  assert.equal($('compare-tab-swap-button').textContent, "Switch back to the customer's nesting");
  await unmount();
});

await check('switch back: no run id is sent, the side goes back', async () => {
  reset();
  compareNow = () => answer({ alternative: alt({ main: 'ai', canSwap: { to: 'uploaded', ok: true, reason: null }, swapCount: 1 }) });
  await mountTab();
  await waitFor(() => $('compare-tab-swap-button'), 'the button');
  await click($('compare-tab-swap-button'), 'switch back');
  await waitFor(() => $('compare-tab-swap-dialog'), 'the confirm');
  await click($('compare-tab-swap-confirm'), 'confirm');
  await waitFor(() => swaps.length === 1, 'the POST');
  assert.equal(swaps[0].to, 'uploaded');
  assert.equal(swaps[0].runId, undefined);
  await unmount();
});

await check('a PO covers the line: the confirm warns, names it, and says nothing on it is changed', async () => {
  reset();
  gate = { covered: true, purchaseOrders: [{ id: 9, code: 'PO-000163', status: 'ordered' }], needsApproval: false, held: false, pending: null, message: null };
  await mountTab();
  await waitFor(() => $('compare-tab-swap-button'), 'the button');
  await settle(60);
  await click($('compare-tab-swap-button'), 'the swap button');
  await waitFor(() => $('compare-tab-swap-po'), 'the PO warning');
  assert.match($('compare-tab-swap-po').textContent, /PO-000163.*Nothing on the purchase order is changed/);
  await unmount();
});

await check('locked by a production order: the button is off and the reason is shown; a viewer sees no button', async () => {
  reset();
  const reason = 'Line 1 of SO-1 has production orders (PRD-1…) — its nesting is frozen.';
  compareNow = () => answer({ alternative: alt({ locked: true, lockReason: reason, canSwap: { to: 'ai', ok: false, reason } }) });
  await mountTab();
  await waitFor(() => $('compare-tab-swap-why'), 'the reason');
  assert.equal($('compare-tab-swap-why').textContent, reason);
  assert.equal($('compare-tab-swap-button').disabled, true);
  await unmount();
  reset();
  await mountTab({ canManage: false });
  await waitFor(() => $('compare-tab-swap'), 'the swap row');
  assert.equal($('compare-tab-swap-button'), null);
  await unmount();
});

await check('the Nesting screen keeps the Compare tab when AI\'s nesting is the main one and no customer\'s plate is saved', async () => {
  reset();
  imported = false;
  altNow = { main: 'ai', valid: true, runId: 'run-1', swapCount: 1, swappedAt: new Date().toISOString(), locked: false, lockReason: null };
  await mountEl(inRouter(React.createElement(NestingPanel, { orderId: 1, lineId: 1, canManage: true })));
  await waitFor(() => $('nesting-tabs'), 'the tabs');
  assert.ok(calls.some((c) => c.includes('/nesting/alternative')), 'the light read was made');
  await unmount();
  reset();
  imported = false;
  await mountEl(inRouter(React.createElement(NestingPanel, { orderId: 1, lineId: 1, canManage: true })));
  await settle(200);
  assert.equal($('nesting-tabs'), null, 'no alternative, nothing uploaded: no tabs');
  await unmount();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
