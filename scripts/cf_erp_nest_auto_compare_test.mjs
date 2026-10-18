// Run from multi_app_fe: node scripts/cf_erp_nest_auto_compare_test.mjs
// The Compare tab (2026-10-16, CF_ERP_NESTING_V2.md "Our nesting after an upload"): the tab is there only once a customer's
// nesting is saved; it shows "Running our nesting…" with the run's progress, then both sides — plates, steel, parts, waste
// WITH the offcuts, offcuts, cost ("not costed", never ₹0), cut length, piercings — the one-line verdict, per thickness, the
// left-over said apart, the plates drawn; it reads the stored result when opened later; a start that was lost is made once
// by the tab itself ({ run: true, auto: true }); a failure says why with Run again; and the lib helpers (compareTabRows, thicknessLine, autoRanLine).
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
      export { compareTabRows, thicknessLine, autoRanLine, NOT_COSTED } from './src/apps/cf_erp/lib/nesting';`,
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
const artifact = resolve(cache, `nest-auto-compare-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const { React, createRoot, MemoryRouter, NestingPanel, NestCompareTab, compareTabRows, thicknessLine, autoRanLine, NOT_COSTED } = await import(pathToFileURL(artifact));
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
const text = () => document.body.textContent;
const $ = (id) => document.querySelector(`[data-testid=${id}]`);
const click = async (el, what) => { assert.ok(el, `no ${what}`); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await settle(); };
const row = (key) => document.querySelector(`[data-testid=compare-tab-table] [data-row=${key}]`);
const cell = (key, col) => row(key)?.querySelector(`[data-col=${col}]`)?.textContent;

/* ---- the server, stubbed -------------------------------------------------------------------- */
const cost = (value, reason = null) => ({ value, currency: 'INR', basis: value == null ? null : 'list price', customerPlates: 0, reason });
const mUp = {
  plates: 5, pieces: 39, tonnesBought: 2.497, partsTonnes: 0.833, wastePct: 66.637, wasteKgTotal: 1663.904,
  wasteKg: { kerf: 25.101, sequenceGaps: 0, rim: 14.96, offcut: 1621.007, wastage: 2.833 },
  offcuts: { count: 7, kg: 1621.008, largestKg: 461.965, largestAreaM2: 4.163 }, cutLengthM: 78.92, sharedCutM: 0, piercings: 41, cost: cost(159305.41),
};
const mAuto = {
  plates: 3, pieces: 39, tonnesBought: 1.098, partsTonnes: 0.833, wastePct: 24.135, wasteKgTotal: 265,
  wasteKg: { kerf: 20, sequenceGaps: 0, rim: 10, offcut: 200, wastage: 35 },
  offcuts: { count: 4, kg: 200, largestKg: 100, largestAreaM2: 1 }, cutLengthM: 57.321, sharedCutM: 2, piercings: 41, cost: cost(97381.05),
};
const minutesAgo = (n) => new Date(Date.now() - n * 60000).toISOString();
const plate = (lotNo, lotId, origin, extra = {}) => ({ lotNo, lotId, origin, plateItemId: 1, plateCode: 'PL-12', thickness: 12, length: 3000, width: 1500, kerfMm: 3, pieces: 13, plateKg: 499.39, partsKg: 166.6, wastePct: 66.6, offcuts: 1, offcutKg: 300, cost: 30962.18, costBasis: 'list price', ...extra });
const nestOf = (id, lotNo, origin) => ({
  id, lotNo, plateItemId: 1, plateCode: 'PL-12', plateName: 'PL 12', source: 'catalog', thickness: 12, grade: 'E350', material: 'MS', density: 7850,
  length: 3000, width: 1500, requiredLength: null, requiredWidth: null, sheetArea: 4500000, usedArea: 1000000, wasteArea: 3500000, wastePct: 77.8, weightKg: 500, wasteKg: 389,
  sequences: [], origin, verdict: 'fits', hasLayout: true, layout: 'free', sourceKind: origin === 'imported' ? 'pronest' : null, layoutOrigin: origin === 'imported' ? 'customer' : null,
  pieces: [{ id: 1, cutPlateId: 10, cutPlateCode: 'CP-12X380X1400', seqNo: 1, rowNo: 1, posNo: 1, x: 20, y: 20, length: 1400, width: 380, rotated: false, rotationDeg: 0, mirrored: false, placedBy: origin === 'imported' ? 'customer' : 'ours' }],
});
const savedNest = nestOf(5950, 'N01', 'imported');
const autoNest = nestOf(null, 'N-001', 'auto');
const thick = [
  { thickness: 12, uploaded: { plates: 4, tonnesBought: 2.0, partsTonnes: 0.7, wasteKg: 1300, wastePct: 65, offcutKg: 1200, cost: 120000 }, auto: { plates: 2, tonnesBought: 0.8, partsTonnes: 0.7, wasteKg: 100, wastePct: 12.5, offcutKg: 80, cost: 70000 } },
  { thickness: 16, uploaded: { plates: 1, tonnesBought: 0.497, partsTonnes: 0.133, wasteKg: 364, wastePct: 73.2, offcutKg: 421, cost: 39305.41 }, auto: { plates: 1, tonnesBought: 0.298, partsTonnes: 0.133, wasteKg: 165, wastePct: 55.4, offcutKg: 120, cost: null } },
];
const ready = (o = {}) => ({
  line: { id: 1, lineNo: 1, orderId: 1, orderCode: 'SO-1' },
  demand: { pieces: 39, cutPlates: 11, coversWholeLine: false },
  uploaded: { metrics: mUp, perPlate: [plate('N01', 5950, 'imported')], files: [] },
  auto: { runId: 'run-1', scope: 'subset', status: 'ready', decision: null, ranAt: minutesAgo(3), startedBy: 'Asha · automatic, after the upload', params: { effort: 'standard' },
    trigger: 'upload', forThisUpload: true, stoppedEarly: false, metrics: mAuto, perPlate: [plate('N-001', null, 'auto', { cost: null })], unplaced: [], problems: [], plan: { groups: [{ nests: [autoNest] }] } },
  stale: null,
  delta: { plates: -2, tonnesBought: -1.399, cost: -61924.36 },
  headline: 'Ours uses 2 plates fewer, 1.4 t less steel and ₹61,924 less.',
  verdict: 'Our automatic nesting buys 2 plates fewer and 1.399 t less steel (₹61,924 less).',
  likeForLike: { same: true, uploadedPieces: 39, autoPieces: 39, differ: [], overNested: [] },
  byThickness: thick,
  leftOverSummary: { pieces: 15, cutPieces: 3, kg: 210.4, heldBack: 0, toNest: 15, untrackedPieces: 6, untrackedKg: 9, sentence: '15 pieces are left over by the upload (210 kg). They are in neither side. 6 pieces are cut from untracked offcuts (9 kg). They are in neither side.' },
  autoCompare: { trigger: 'upload', status: 'started', message: 'Our own Standard nesting of the same pieces runs in the background now. See the Compare tab.', at: minutesAgo(3), runId: 'run-1' },
  wholeLine: null, willReplace: null, run: null, lastFailure: null, canAccept: null, ...o,
});
const runSnap = { runId: 'run-2', lineId: 1, status: 'running', phase: 'packing', purpose: 'compare', progress: { done: 3, total: 10, pct: 33, best: { plates: 3, areaBoughtM2: 13.5, wastePct: 24.1, unplaced: 0, atMs: 3000, scope: 'subset' }, curve: [] }, canStop: true, stopRequested: false, stopped: false, startedAt: minutesAgo(1), startedBy: 'automatic, after the upload', finishedAt: null, elapsedMs: 4000, budgetMs: 600000, effort: 'standard', log: [], error: null, summary: null };
const running = () => ready({ auto: { runId: 'run-2', status: 'running', metrics: null, perPlate: [], reason: 'Our automatic nesting of these pieces is being worked out.' }, delta: null, headline: null, verdict: null, likeForLike: null, run: runSnap, stale: { runId: 'run-1', ranAt: minutesAgo(30), status: 'ready', reason: 'It nested a different demand' } });
const none = () => ready({ auto: { runId: null, status: 'none', metrics: null, perPlate: [], reason: 'No automatic run has nested these pieces yet.' }, delta: null, headline: null, verdict: null, likeForLike: null, autoCompare: null });

const planOf = (imported) => ({
  line: { id: 1, lineNo: 1, orderId: 1, orderCode: 'SO-1', quantity: 1, orderStatus: 'confirmed' }, saved: true, basis: 'saved plan', manual: [], sizeAdvice: [], problems: [], drift: [],
  groups: imported ? [{ key: 'g1', thickness: 12, grade: 'E350', material: 'MS', nests: [savedNest], unplaced: [], candidates: [], metrics: { lots: 1, plates: 1, pieces: 1, areaBought: 4500000, usedArea: 1000000, wasteArea: 3500000, wastePct: 77.8, weightKg: 500, wasteKg: 389, thickness: 12 }, kerfMm: 3, seqGapMinMm: 10, seqGapMaxMm: 20, settingsBasis: '', cutPlates: [] }] : [],
  totals: { lots: imported ? 1 : 0, plates: imported ? 1 : 0, pieces: imported ? 1 : 0, areaBought: 0, usedArea: 0, wasteArea: 0, wastePct: 0, weightKg: 0, wasteKg: 0, thickness: null, groups: imported ? 1 : 0, unplaced: 0 },
  coverage: [],
});

let compareNow = () => ready();
let imported = true;
let startReply = null;
const calls = [];
const starts = [];
const reply = (out, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(out) });
globalThis.fetch = async (url, o = {}) => {
  const method = o.method || 'GET';
  const u = String(url);
  calls.push(`${method} ${u}`);
  const body = o.body ? JSON.parse(o.body) : null;
  if (u.includes('/nesting/compare/stop')) return reply(runSnap);
  if (u.includes('/nesting/compare') && method === 'POST') { starts.push(body); return startReply ? startReply(body) : reply({ started: true, running: true, runId: 'run-2', status: 'running' }); }
  if (u.includes('/nesting/compare')) return reply(compareNow());
  if (u.endsWith('/nesting/files')) return reply({ line: { id: 1 }, canUpload: true, readOnlyReason: null, limits: { maxFiles: 200, maxFileBytes: 4194304, kinds: ['dxf', 'nif'] }, plates: [], coverage: [], leftOver: [], totals: null });
  if (u.includes('/nesting/runs/current')) return reply({ status: 'none' });
  if (u.includes('/nesting/choices')) return { ok: false, status: 404, text: async () => '{}' };
  if (u.includes('/plate-changes')) return reply({ line: { id: 1 }, gate: { covered: false, purchaseOrders: [], needsApproval: false, held: false, pending: null, message: null }, canApprove: false, requests: [] });
  if (u.includes('/section-nesting')) return reply({ profiles: [], problems: [], line: { id: 1 } });
  if (u.includes('/costs')) return reply({ lines: [] });
  return reply(planOf(imported));
};
const reset = () => { calls.length = 0; starts.length = 0; startReply = null; compareNow = () => ready(); imported = true; try { localStorage.clear(); } catch { /* none */ } };

const host = () => { const d = document.createElement('div'); document.body.appendChild(d); return d; };
const mountEl = async (el) => { root = createRoot(host()); await React.act(async () => { root.render(el); await sleep(0); }); };
const unmount = async () => { if (root) await React.act(async () => { root.unmount(); }); root = null; document.body.innerHTML = ''; };
const mountPanel = () => mountEl(inRouter(React.createElement(NestingPanel, { orderId: 1, lineId: 1, canManage: true })));
const mountTab = (props = {}) => mountEl(inRouter(React.createElement(NestCompareTab, { orderId: 1, lineId: 1, ...props })));

/* ---- the tab on the Nesting screen ---------------------------------------------------------- */

await check('no customer nesting saved: no tabs, the screen is as before', async () => {
  reset(); imported = false;
  await mountPanel();
  await settle(150);
  assert.equal($('nesting-tabs'), null, 'no tab bar');
  assert.ok(!calls.some((c) => c.includes('/nesting/compare')), 'the comparison is not even asked for');
  await unmount();
});

await check('a customer nesting saved: "Nesting" and "Compare with AI"; the comparison is read only when the tab opens', async () => {
  reset();
  await mountPanel();
  await waitFor(() => $('nesting-tabs'), 'the tabs');
  assert.match($('nesting-tabs').textContent, /Nesting.*Compare with AI/);
  assert.ok(!calls.some((c) => c.includes('/nesting/compare')), 'not read before the tab is opened');
  await click($('compare-tab-button'), 'the Compare tab');
  await waitFor(() => $('compare-tab-headline'), 'the verdict');
  assert.ok(calls.some((c) => c.includes('/nesting/compare?with=auto&detail=1')), 'read with our plan, to draw it');
  // The Nesting tab stays mounted (hidden), so a run being watched or a proposal under review is not lost.
  assert.ok(document.querySelector('[data-testid=compare-tab]'));
  assert.equal(localStorage.getItem('cf_erp_nest_tab_1'), 'compare', 'the tab is remembered for this line');
  await unmount();
});

await check('opened later: the stored result is read and shown at once, nothing is started', async () => {
  reset();
  localStorage.setItem('cf_erp_nest_tab_1', 'compare');
  await mountPanel();
  await waitFor(() => $('compare-tab-headline'), 'the verdict');
  assert.equal(starts.length, 0, 'nothing started');
  assert.equal($('compare-tab-headline').textContent, 'Ours uses 2 plates fewer, 1.4 t less steel and ₹61,924 less.');
  assert.match($('compare-tab-ran').textContent, /^Ran 3 min ago · Standard · started by the upload$/);
  await unmount();
});

/* ---- the figures ---------------------------------------------------------------------------- */

await check('side by side: plates, steel, parts, waste WITH the offcuts, offcuts, cost, cut length, piercings', async () => {
  reset();
  await mountTab();
  await waitFor(() => row('plates'), 'the rows');
  assert.deepEqual([...document.querySelectorAll('[data-testid=compare-tab-table] tbody tr')].map((r) => r.getAttribute('data-row')),
    ['plates', 'tonnesBought', 'netTonnes', 'partsTonnes', 'waste', 'offcutKg', 'cost', 'cutLengthM', 'piercings']);   // netTonnes: §87, 2026-10-18
  assert.equal(cell('plates', 'customer'), '5');
  assert.equal(cell('plates', 'ours'), '3');
  assert.match(cell('plates', 'diff'), /^↓ 2 fewerAI is better$/);
  assert.equal(cell('tonnesBought', 'customer'), '2.497 t');
  // Waste = bought − parts, offcuts included: 1,664 kg · 66.6% (not the kerf-only figure).
  assert.equal(cell('waste', 'customer'), '1,664 kg · 66.6%');
  assert.equal(cell('waste', 'ours'), '265 kg · 24.1%');
  assert.equal(cell('offcutKg', 'customer'), '1,621 kg (7)');
  assert.equal(row('offcutKg').getAttribute('data-better'), 'none', 'offcuts are information, not a verdict');
  assert.equal(cell('cost', 'customer'), '₹1,59,305');
  assert.match(cell('cost', 'diff'), /₹61,924 less/);
  assert.match(cell('piercings', 'diff'), /^Same$/);
  // Fixed layout, so the table never makes the page scroll sideways on a phone.
  assert.equal($('compare-tab-table').style.tableLayout || getComputedStyle($('compare-tab-table')).tableLayout, 'fixed');
  await unmount();
});

await check('a side with no price reads "not costed", never ₹0, with the reason on hover; the difference cannot be compared', async () => {
  reset();
  compareNow = () => ready({ auto: { ...ready().auto, metrics: { ...mAuto, cost: cost(null, 'No cost for PL-16: never received and no list price.') } }, delta: { plates: -2, tonnesBought: -1.399, cost: null } });
  await mountTab();
  await waitFor(() => row('cost'), 'the cost row');
  assert.equal(cell('cost', 'ours'), NOT_COSTED);
  assert.ok(!/₹0\b/.test(text()), 'no ₹0 anywhere');
  assert.equal(cell('cost', 'diff'), 'Cannot compare');
  assert.equal(document.querySelector('[data-row=cost] [data-col=ours] span[tabindex]')?.textContent, NOT_COSTED, 'a hover target carries the reason');
  await unmount();
});

await check('per thickness: one block per thickness, each side in one line; a thickness with no price says "not costed"', async () => {
  reset();
  await mountTab();
  await waitFor(() => $('compare-tab-thickness'), 'the thickness rows');
  const blocks = [...document.querySelectorAll('[data-testid=compare-tab-thickness] [data-thickness]')];
  assert.equal(blocks.length, 2);
  assert.match(blocks[0].textContent, /^12 mm/);
  assert.equal(blocks[0].querySelector('[data-side=customer]').textContent, 'Customer’s: 4 plates · 2.000 t · waste 1,300 kg (65.0%) · offcuts 1,200 kg · ₹1,20,000');
  assert.match(blocks[1].querySelector('[data-side=ours]').textContent, /· not costed$/);
  await unmount();
});

await check('the left-over and the offcut marks are said apart: in neither side', async () => {
  reset();
  await mountTab();
  await waitFor(() => $('compare-tab-left'), 'the left-over line');
  assert.match($('compare-tab-left').textContent, /^15 pieces are left over by the upload \(210 kg\)\. They are in neither side\. 6 pieces are cut from untracked offcuts/);
  await unmount();
});

await check('the plates of both sides; one opens as a drawing; the upload stays the saved nesting (no "use ours" button)', async () => {
  reset();
  await mountTab();
  await waitFor(() => $('compare-tab-plates-ours')?.querySelector('[data-plate]'), 'our plates');
  assert.match($('compare-tab-plates-customer').textContent, /Customer.s · 1 plate/);
  assert.match($('compare-tab-plates-ours').textContent, /not costed/, 'a plate with no rate');
  await click($('compare-tab-plates-ours').querySelector('[data-plate="N-001"]'), 'our plate');
  await waitFor(() => $('compare-tab-plates-ours').querySelector('svg'), 'the drawing');
  await click($('compare-tab-plates-customer').querySelector('[data-plate="N01"]'), 'the customer plate');
  await waitFor(() => $('compare-tab-plates-customer').querySelector('svg'), 'the customer drawing');
  assert.match(text(), /The upload stays the saved nesting/);
  assert.ok(![...document.querySelectorAll('button')].some((b) => /use (auto|ours)|replace/i.test(b.textContent)), 'adopting ours is not offered here');
  await unmount();
});

/* ---- while it runs, and when it was lost ---------------------------------------------------- */

await check('running: "AI is nesting…", the progress card, our column says running; the old result is out of date; it polls to ready', async () => {
  reset();
  let n = 0;
  compareNow = () => { n += 1; return n < 3 ? running() : ready({ auto: { ...ready().auto, runId: 'run-2' } }); };
  await mountTab();
  await waitFor(() => $('compare-tab-running'), 'the running state');
  assert.match($('compare-tab-running').textContent, /AI is nesting…/);
  assert.ok($('nest-run-card'), 'the run card with its progress');
  assert.equal(cell('plates', 'ours'), 'running…');
  assert.match($('compare-tab-stale').textContent, /earlier upload with other pieces\. It is out of date/);
  assert.equal(starts.length, 0, 'a running run is never started again');
  await waitFor(() => $('compare-tab-headline'), 'the result after polling', 9000);
  assert.ok(calls.filter((c) => c.includes('/nesting/compare?with=auto&detail=1')).length >= 2, 'the whole answer fetched again when done');
  await unmount();
});

await check('the server is waiting for a person\'s nesting run: it says so and keeps asking', async () => {
  reset();
  let n = 0;
  compareNow = () => { n += 1; return n < 2 ? { ...none(), autoCompare: { trigger: 'upload', status: 'waiting', message: 'A nesting run is working on this line. Our nesting of the upload starts when it is done.', at: minutesAgo(1), runId: null } } : ready(); };
  await mountTab();
  await waitFor(() => $('compare-tab-waiting'), 'the waiting note');
  assert.match($('compare-tab-waiting').textContent, /starts when it is done/);
  assert.equal(starts.length, 0, 'the tab does not start one over it');
  await waitFor(() => $('compare-tab-headline'), 'the result', 9000);
  await unmount();
});

await check('the server\'s start was lost (nothing answers, nothing runs, nothing failed): the tab starts it ONCE, as the server would', async () => {
  reset();
  let n = 0;
  compareNow = () => { n += 1; return n < 2 ? none() : (n < 4 ? running() : ready()); };
  await mountTab();
  await waitFor(() => starts.length === 1, 'one start');
  assert.deepEqual(starts[0], { run: true, auto: true, rerun: false });
  await waitFor(() => $('compare-tab-headline'), 'the result', 12000);
  assert.equal(starts.length, 1, 'started once only');
  await unmount();
});

await check('a failed run: why, in the server\'s words, and Run again (rerun)', async () => {
  reset();
  compareNow = () => ({ ...none(), lastFailure: { runId: 'run-1', error: { code: 'INTERRUPTED', message: 'The server restarted while this run was in flight, so it never finished — start it again.' } } });
  await mountTab();
  await waitFor(() => $('compare-tab-failed'), 'the failure');
  assert.match($('compare-tab-failed').textContent, /AI's nesting did not finish\. The server restarted/);
  assert.equal(starts.length, 0, 'a failure is not retried by itself');
  const again = [...$('compare-tab-failed').querySelectorAll('button')].find((b) => b.textContent === 'Run again');
  await click(again, 'Run again');
  assert.deepEqual(starts[0], { run: true, auto: true, rerun: true });
  await unmount();
});

await check('a start refused (a nesting run holds the line): the server\'s sentence is shown', async () => {
  reset();
  compareNow = () => none();
  startReply = () => reply({ code: 'RUN_BUSY', message: 'A nesting run is working on this line. Our nesting of the upload starts when it is done.' }, 422);
  await mountTab();
  await waitFor(() => $('compare-tab-error'), 'the refusal');
  assert.match($('compare-tab-error').textContent, /starts when it is done/);
  await unmount();
});

await check('no customer nesting (the tab reached anyway): it says to upload first', async () => {
  reset();
  compareNow = () => ({ ...none(), uploaded: null });
  await mountTab();
  await waitFor(() => $('compare-tab-empty'), 'the empty note');
  assert.match($('compare-tab-empty').textContent, /Upload the nesting files first/);
  assert.equal(starts.length, 0);
  await unmount();
});

await check('made for an earlier upload of the same pieces, and stopped early: the line under the verdict says both', async () => {
  reset();
  compareNow = () => ready({ auto: { ...ready().auto, forThisUpload: false, stoppedEarly: true, trigger: 'screen' } });
  await mountTab();
  await waitFor(() => $('compare-tab-ran'), 'the ran line');
  assert.equal($('compare-tab-ran').textContent, 'Ran 3 min ago · Standard · started from this tab · stopped early, so this is its best so far · made for an earlier upload of the same pieces');
  await unmount();
});

/* ---- the lib -------------------------------------------------------------------------------- */

await check('compareTabRows: who is better, info rows, a missing side', async () => {
  const rows = compareTabRows(mUp, mAuto);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(by.plates.better, 'ours');
  assert.equal(by.partsTonnes.diff, 'Same');
  assert.equal(by.offcutKg.better, 'none');
  assert.equal(compareTabRows(mAuto, mUp).find((r) => r.key === 'plates').better, 'customer');
  const half = compareTabRows(mUp, null);
  assert.ok(half.every((r) => r.ours === '—' && r.diff === '—'));
});

await check('thicknessLine and autoRanLine', async () => {
  assert.equal(thicknessLine(null), 'No plates of this thickness.');
  assert.equal(thicknessLine({ plates: 1, tonnesBought: 0.5, wasteKg: 100, wastePct: 20, offcutKg: 0, cost: null }), '1 plate · 0.500 t · waste 100 kg (20.0%) · not costed');
  assert.equal(autoRanLine({ ranAt: new Date().toISOString(), params: { effort: 'standard' }, trigger: 'person' }), 'Ran just now · Standard · started by hand');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
