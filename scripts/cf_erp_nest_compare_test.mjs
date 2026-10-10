// Run from multi_app_fe: node scripts/cf_erp_nest_compare_test.mjs
// Nesting v2, the comparison (CF_ERP_NESTING_V2.md section 6): an existing run is pulled up without starting one, none starts
// and polls to ready, stale offers Run again, a missing figure is a dash with the reason, the difference reads in words and
// an arrow, same-pieces / whole-line, a plate opens as a drawing, each accept button posts the right side, permission.
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
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; export { React, createRoot }; export { MemoryRouter } from 'react-router-dom';
      export { NestingPanel } from './src/apps/cf_erp/components/Nesting/NestingPanel';
      export { NestCompareDialog } from './src/apps/cf_erp/components/Nesting/NestCompareDialog';
      export { differenceText, COMPARE_ROWS, ranAgo } from './src/apps/cf_erp/lib/nesting';`,
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
const artifact = resolve(cache, `nest-compare-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const { React, createRoot, MemoryRouter, NestingPanel, NestCompareDialog, differenceText, COMPARE_ROWS, ranAgo } = await import(pathToFileURL(artifact));
await unlink(artifact);

let passed = 0, failed = 0;
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
const buttons = () => [...document.querySelectorAll('button')];
const find = (label) => buttons().find((b) => b.textContent.trim() === label) ?? buttons().find((b) => b.textContent.trim().startsWith(label));
const click = async (el, what) => { assert.ok(el, `no ${what}`); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await settle(); };

/* ---- the contract's example payload (arrays cut) ----------------------------------------------- */
const cost = (value, reason = null) => ({ value, currency: 'INR', basis: 'list price', customerPlates: 0, reason });
const mUp = {
  plates: 5, pieces: 39, tonnesBought: 2.497, partsTonnes: 0.833, wastePct: 66.637, wasteKgTotal: 1663.904,
  wasteKg: { kerf: 25.101, sequenceGaps: 0, rim: 14.96, offcut: 1621.007, wastage: 2.833 },
  offcuts: { count: 7, kg: 1621.008, largestKg: 461.965, largestAreaM2: 4.163 }, cutLengthM: 78.92, sharedCutM: 0, piercings: 41, cost: cost(159305.41),
};
const mAuto = {
  plates: 3, pieces: 39, tonnesBought: 1.498, partsTonnes: 0.833, wastePct: 44.396, wasteKgTotal: 665.125,
  wasteKg: { kerf: 20, sequenceGaps: 0, rim: 10, offcut: 600, wastage: 35.125 },
  offcuts: { count: 4, kg: 600, largestKg: 300, largestAreaM2: 3 }, cutLengthM: 57.321, sharedCutM: 2, piercings: 41, cost: cost(97381.05),
};
const plate = (lotNo, lotId, origin, extra = {}) => ({ lotNo, lotId, origin, file: origin === 'imported' ? `${lotNo}.dxf` : null, plateItemId: 116533, plateCode: 'NVX-PS', thickness: 14.137, length: 3000, width: 1500, kerfMm: 2.5, pieces: 14, plateKg: 499.39, partsKg: 273.788, wastePct: 45.176, offcuts: 1, offcutKg: 213.453, cost: 30962.18, costBasis: 'list price', ...extra });
const minutesAgo = (n) => new Date(Date.now() - n * 60000).toISOString();
const autoNest = { id: null, lotNo: 'N-001', plateItemId: 116533, plateCode: 'NVX-PS', plateName: 'PS', source: 'catalog', thickness: 14, grade: 'G', material: 'MS', density: 7850, length: 3000, width: 1500,
  requiredLength: null, requiredWidth: null, sheetArea: 4500000, usedArea: 1000000, wasteArea: 0, wastePct: 10, weightKg: 500, wasteKg: 50, sequences: [], hasLayout: true,
  pieces: [{ cutPlateId: 1, cutPlateCode: 'NVX-CR', seqNo: 1, rowNo: 1, posNo: 1, x: 3, y: 3, length: 1200, width: 400, rotated: false }] };
const savedNest = { ...autoNest, id: 5950, lotNo: 'NVX-B1', origin: 'imported', sourceKind: 'dxf', layoutOrigin: 'customer', sourceFile: 'NVX-B1.dxf' };
const answer = (o = {}) => ({
  line: { id: 1, lineNo: 1, orderId: 1, orderCode: 'SO-1' },
  demand: { pieces: 39, cutPlates: 11, coversWholeLine: false },
  uploaded: { metrics: mUp, perPlate: [plate('NVX-B1', 5950, 'imported'), plate('NVX-B2', 5951, 'imported')], files: [] },
  auto: { runId: 'run-1', rowId: 32, scope: 'subset', status: 'ready', decision: null, ranAt: minutesAgo(3), startedBy: 'Asha', params: { effort: 'quick' },
    metrics: mAuto, perPlate: [plate('N-001', null, 'auto', { pieces: 20 })], unplaced: [], problems: [], plan: { groups: [{ nests: [autoNest] }] } },
  stale: null,
  delta: { plates: -2, tonnesBought: -0.999 },
  verdict: 'Our automatic nesting buys 2 plates fewer and 0.999 t less steel (₹61,924 less). Waste is 44.396% automatic against 66.637% uploaded.',
  likeForLike: { same: true, uploadedPieces: 39, autoPieces: 39, differ: [], overNested: [] },
  wholeLine: { saved: { metrics: { ...mUp, plates: 6, tonnesBought: 3 }, perPlate: [plate('NVX-B1', 5950, 'imported')], complete: true, leftOverPieces: 0 },
    auto: { runId: 'run-1', scope: 'line', status: 'ready', metrics: { ...mAuto, plates: 4, tonnesBought: 2 }, perPlate: [plate('N-001', null, 'auto')] },
    delta: { plates: -2, tonnesBought: -1, cost: -50000 }, verdict: 'On the whole line our nesting buys 2 plates fewer and 1 t less steel.', deltaReason: null },
  willReplace: { side: 'auto', customerPlates: 3, ourPlates: 1, plates: 4, customerPieces: 24, ourPiecesOnCustomerPlates: 12, ourPieces: 1, pieces: 37, customerFiles: 3,
    withPlates: 3, withPieces: 37, notNestedAfter: 2, withReason: null,
    message: 'Taking our automatic nesting replaces everything saved on this line: 3 uploaded plates (24 pieces as the customer nested them, and 12 pieces we added to them) and 1 plate of our own (1 piece). In their place: 3 plates holding 37 pieces; 2 pieces stay un-nested.' },
  run: null, lastFailure: null, canAccept: { uploaded: true, auto: true, reason: null }, ...o,
});
const noRun = () => answer({ auto: { runId: null, status: 'none', metrics: null, perPlate: [], reason: null }, delta: null, verdict: null, wholeLine: null, likeForLike: null });
const runSnap = (pct) => ({ runId: 'run-2', lineId: 1, status: 'running', phase: 'packing', progress: { done: 3, total: 10, pct, best: { plates: 124, areaBoughtM2: 3511.2, wastePct: 5.092, unplaced: 0, atMs: 3000, scope: 'rest' }, curve: [{ atMs: 1000, plates: 130, areaBoughtM2: 3600, wastePct: 8.1, unplaced: 0 }, { atMs: 2000, plates: 124, areaBoughtM2: 3511, wastePct: 5.092, unplaced: 0 }] }, canStop: true, stopRequested: false, stopped: false, startedAt: minutesAgo(1), startedBy: 'Asha', finishedAt: null, elapsedMs: 4000, budgetMs: 60000, effort: 'quick', log: [{ at: minutesAgo(1), text: 'Packing' }], error: null, summary: null });

const calls = [];
const bodies = [];
let getNow = () => answer();
const reply = (out) => ({ ok: true, status: 200, text: async () => JSON.stringify(out) });
globalThis.fetch = async (url, o = {}) => {
  const method = o.method || 'GET';
  const u = String(url);
  calls.push(`${method} ${u}`);
  const body = o.body ? JSON.parse(o.body) : null;
  if (body) bodies.push({ u, method, body });
  if (u.endsWith('/compare/stop') && method === 'POST') { stops.push(1); return reply(runSnap(60)); }
  if (u.endsWith('/nesting/compare') && method === 'DELETE') { cancels.push(1); return reply({ ok: true, cancelled: true, runId: 'run-2' }); }
  if (u.includes('/nesting/compare/accept') && acceptFail) return { ok: false, status: acceptFail.status, text: async () => JSON.stringify(acceptFail.body) };
  if (u.includes('/nesting/compare') && method === 'POST' && startFail && !u.includes('/accept')) return { ok: false, status: 422, text: async () => JSON.stringify(startFail) };
  if (u.includes('/nesting/compare/accept')) return reply({ decision: body.side, message: body.side === 'auto' ? 'Our automatic nesting is saved: 3 plates in place of 5 uploaded plates.' : 'The uploaded nesting stays.' });
  if (u.includes('/nesting/compare') && method === 'POST') { startedRuns.push(body); return reply({ started: true, running: true, runId: 'run-2', status: 'running' }); }
  if (u.includes('/nesting/compare')) return reply(getNow());
  if (u.includes('/runs/current') && method === 'DELETE') return reply({ ok: true, running: false });
  if (u.includes('/runs/current')) return reply({ status: 'none' });
  if (u.includes('/nesting/choices')) return { ok: false, status: 404, text: async () => '{}' };
  if (u.includes('/costs')) return reply({ lines: [] });
  if (u.endsWith('/nesting/files')) return reply({ canUpload: true, plates: [{ lotId: 5950, lotNo: 'NVX-B1', sourceKind: 'dxf', layoutOrigin: 'customer' }], leftOver: [], coverage: [] });
  return reply({
    line: { id: 1, lineNo: 1, orderId: 1, orderCode: 'SO-1', quantity: 1, orderStatus: 'draft' }, saved: true, basis: 'saved plan', manual: [], sizeAdvice: [], problems: [], groups: [],
    totals: { lots: 0, plates: 0, pieces: 0, areaBought: 0, usedArea: 0, wasteArea: 0, wastePct: 0, weightKg: 0, wasteKg: 0, thickness: null, groups: 0, unplaced: 0 },
  });
};
const startedRuns = [];
const stops = [];
const cancels = [];
let startFail = null;
let acceptFail = null;

let root = null;
const host = () => { const d = document.createElement('div'); document.body.appendChild(d); return d; };
const mountEl = async (el) => { root = createRoot(host()); await React.act(async () => { root.render(el); await sleep(0); }); };
const unmount = async () => { if (root) await React.act(async () => { root.unmount(); }); root = null; document.body.innerHTML = ''; };
const decided = [];
const dlg = (over = {}) => React.createElement(NestCompareDialog, {
  open: true, orderId: 1, lineId: 1, canManage: true, savedNests: [savedNest], onClose: () => {}, onDecided: (m) => decided.push(m), ...over,
});
const reset = () => { stops.length = 0; cancels.length = 0; startFail = null; acceptFail = null; calls.length = 0; bodies.length = 0; startedRuns.length = 0; decided.length = 0; getNow = () => answer(); };
const row = (key) => document.querySelector(`[data-row=${key}]`);
const posted = (suffix) => bodies.filter((b) => b.u.endsWith(suffix) && b.method === 'POST');

await check('an existing run is pulled up at once, with when it ran, and no run is started', async () => {
  reset();
  await mountEl(dlg());
  await waitFor(() => document.querySelector('[data-testid=compare-table]'), 'the table');
  assert.equal(startedRuns.length, 0, 'nothing started');
  assert.ok(!calls.some((c) => c.startsWith('POST') && c.includes('/compare') && !c.includes('/accept')));
  assert.match(document.querySelector('[data-testid=compare-ran]').textContent, /^ran 3 min ago · by Asha$/);
  assert.ok(calls.some((c) => c.includes('compare?with=auto&detail=1')), 'asks for the proposal to draw');
  await unmount();
});

await check('the verdict sentence heads the dialog, as the backend wrote it', async () => {
  reset();
  await mountEl(dlg());
  await waitFor(() => document.querySelector('[data-testid=compare-verdict]'), 'the verdict');
  assert.ok(document.querySelector('[data-testid=compare-verdict]').textContent.startsWith('Our automatic nesting buys 2 plates fewer and 0.999 t less steel'));
  await unmount();
});

await check('every metric is a row; two columns and a difference with an arrow and who is better', async () => {
  reset();
  await mountEl(dlg());
  await waitFor(() => row('plates'), 'rows');
  // Sequence gaps is shown only when a side has any (free layouts have none).
  for (const r of COMPARE_ROWS) if (r.key !== 'wasteGaps') assert.ok(row(r.key), `row ${r.key}`);
  assert.equal(row('plates').querySelector('[data-col=uploaded]').textContent, '5');
  assert.equal(row('plates').querySelector('[data-col=auto]').textContent, '3');
  assert.equal(row('plates').querySelector('[data-col=diff]').textContent, '↓Auto 2 less · auto is better');
  assert.equal(row('tonnesBought').querySelector('[data-col=uploaded]').textContent, '2.497 t');
  assert.equal(row('wastePct').querySelector('[data-col=diff]').textContent, '↓Auto 22.2% less · auto is better');
  assert.equal(row('piercings').querySelector('[data-col=diff]').textContent, '=Same');
  assert.equal(row('cost').querySelector('[data-col=auto]').textContent, '₹97,381');
  assert.equal(row('offcuts').getAttribute('data-better'), 'none', 'offcuts are information, not a verdict');
  assert.match(text(), /Customer.s nesting/);
  await unmount();
});

await check('differenceText says the customer’s side is better when it is', async () => {
  const plates = COMPARE_ROWS.find((r) => r.key === 'plates');
  const d = differenceText(plates, 3, 5);
  assert.equal(d.side, 'uploaded');
  assert.equal(d.arrow, '↑');
  assert.match(d.text, /customer's is better/);
  assert.equal(differenceText(plates, null, 5).text, '—');
  assert.equal(differenceText(plates, 0, 0).side, 'same');
  assert.equal(ranAgo(new Date(Date.now() - 30000).toISOString()), 'ran just now');
});

await check('a missing figure shows a dash with the backend reason on hover, never 0', async () => {
  reset();
  getNow = () => answer({ auto: { ...answer().auto, metrics: { ...mAuto, cost: cost(null, 'NVX-PS has no price, so the cost of this side is not known.') } } });
  await mountEl(dlg());
  await waitFor(() => row('cost'), 'the cost row');
  const autoCell = row('cost').querySelector('[data-col=auto]');
  assert.equal(autoCell.textContent, '—');
  assert.equal(autoCell.querySelector('[data-null]').parentElement.getAttribute('aria-label') ?? autoCell.querySelector('[data-null]').getAttribute('aria-label'), 'NVX-PS has no price, so the cost of this side is not known.');
  assert.equal(row('cost').querySelector('[data-col=diff]').textContent, '—', 'no difference from a missing figure');
  assert.ok(!autoCell.textContent.includes('0'));
  await unmount();
});

await check('with no run, it says so, and Run auto nesting starts one, shows progress and polls to ready', async () => {
  reset();
  let phase = 'none';
  getNow = () => (phase === 'none' ? noRun()
    : phase === 'running' ? answer({ auto: { runId: 'run-2', status: 'running', metrics: null, perPlate: [] }, run: runSnap(30), delta: null, verdict: null })
      : answer({ auto: { ...answer().auto, runId: 'run-2', ranAt: new Date().toISOString() } }));
  await mountEl(dlg());
  await waitFor(() => document.querySelector('[data-testid=compare-none]'), 'the none state');
  assert.ok(find('Run auto nesting to compare'));
  assert.equal(row('plates').querySelector('[data-col=auto]').textContent, '—', 'the auto side is empty, not zero');
  assert.equal(find('Use auto nesting instead').disabled, true);
  phase = 'running';
  await click(find('Run auto nesting to compare'), 'Run');
  assert.equal(startedRuns.length, 1);
  assert.equal(startedRuns[0].run, true);
  assert.equal(startedRuns[0].rerun, false);
  await waitFor(() => document.querySelector('[data-testid=nest-run-card]'), 'the progress card');
  assert.equal(document.querySelector('[role=progressbar]').getAttribute('aria-valuenow'), '30');
  assert.ok(find('Stop and use this') && find('Cancel'), 'Stop and use this sits beside Cancel');
  assert.ok(document.querySelector('[data-testid=nest-run-best]').textContent.includes('Best so far: 124 plates \u00b7 5.1% waste'));
  assert.ok(document.querySelector('[data-testid=nest-run-spark]'), 'the improvement curve');
  const getsBefore = calls.filter((c) => c.startsWith('GET') && c.includes('/compare')).length;
  phase = 'ready';
  await waitFor(() => document.querySelector('[data-testid=compare-ran]'), 'ready', 8000);
  assert.ok(calls.filter((c) => c.startsWith('GET') && c.includes('/compare')).length > getsBefore, 'polled');
  assert.equal(document.querySelector('[data-testid=nest-run-card]'), null);
  assert.equal(row('plates').querySelector('[data-col=auto]').textContent, '3');
  await unmount();
});

await check('Cancel uses the comparison cancel route, not the nesting run one', async () => {
  reset();
  getNow = () => answer({ auto: { runId: 'run-2', status: 'running', metrics: null, perPlate: [] }, run: runSnap(10), delta: null, verdict: null });
  await mountEl(dlg());
  await waitFor(() => find('Cancel'), 'Cancel');
  await click(find('Cancel'), 'Cancel');
  assert.equal(cancels.length, 1);
  assert.ok(calls.some((c) => c.startsWith('DELETE') && c.endsWith('/nesting/compare')));
  assert.ok(!calls.some((c) => c.endsWith('/runs/current')), 'the old assumed route is gone');
  await unmount();
});

await check('a stale run says so, hides its figures, and Run again packs again', async () => {
  reset();
  getNow = () => answer({ auto: { runId: null, status: 'stale', metrics: null, perPlate: [] }, stale: { runId: 'old', ranAt: minutesAgo(90), status: 'ready', reason: 'The line has changed since this run.' }, delta: null, verdict: null });
  await mountEl(dlg());
  await waitFor(() => document.querySelector('[data-testid=compare-stale]'), 'the stale note');
  assert.ok(text().includes('The line has changed since this run.'));
  assert.equal(row('plates').querySelector('[data-col=auto]').textContent, '—');
  await click(find('Run again'), 'Run again');
  assert.equal(startedRuns.length, 1);
  assert.equal(startedRuns[0].rerun, true);
  await unmount();
});

await check('Run again on a ready run sends rerun', async () => {
  reset();
  await mountEl(dlg());
  await waitFor(() => find('Run again'), 'Run again');
  await click(find('Run again'), 'Run again');
  assert.equal(startedRuns[0].rerun, true);
  await unmount();
});

await check('Same pieces / Whole line switch the figures', async () => {
  reset();
  await mountEl(dlg());
  await waitFor(() => row('plates'), 'rows');
  assert.equal(row('plates').querySelector('[data-col=uploaded]').textContent, '5');
  await click(find('Whole line'), 'Whole line');
  assert.equal(row('plates').querySelector('[data-col=uploaded]').textContent, '6');
  assert.equal(row('plates').querySelector('[data-col=auto]').textContent, '4');
  assert.equal(document.querySelector('[data-testid=compare-verdict]').textContent, 'On the whole line our nesting buys 2 plates fewer and 1 t less steel.');
  assert.equal(row('plates').querySelector('[data-col=diff]').textContent, '\u2193Auto 2 less \u00b7 auto is better');
  assert.equal(row('tonnesBought').querySelector('[data-col=diff]').textContent, '\u2193Auto 1 t less \u00b7 auto is better');
  await click(find('Same pieces'), 'Same pieces');
  assert.equal(row('plates').querySelector('[data-col=uploaded]').textContent, '5');
  await unmount();
});

await check('pieces that differ between the two sides are called out', async () => {
  reset();
  getNow = () => answer({ likeForLike: { same: false, uploadedPieces: 39, autoPieces: 37, differ: [{}], overNested: [] } });
  await mountEl(dlg());
  await waitFor(() => document.querySelector('[data-testid=compare-unlike]'), 'the warning');
  assert.ok(text().includes('39 against 37'));
  await unmount();
});

await check('each column lists its plates; clicking one draws it', async () => {
  reset();
  await mountEl(dlg());
  await waitFor(() => document.querySelector('[data-side="Customer\'s nesting"]'), 'the lists');
  const up = document.querySelector('[data-side="Customer\'s nesting"]');
  const auto = document.querySelector('[data-side="Auto nesting"]');
  assert.equal(up.querySelectorAll('button').length, 2);
  assert.equal(auto.querySelectorAll('button').length, 1);
  assert.equal(up.querySelector('svg'), null);
  await click(up.querySelectorAll('button')[0], 'plate');
  assert.ok(up.querySelector('svg[role=img]'), 'the customer plate is drawn from the saved plan');
  await click(auto.querySelectorAll('button')[0], 'auto plate');
  assert.ok(auto.querySelector('svg[role=img]'), 'the auto plate is drawn from the run');
  await click(up.querySelectorAll('button')[1], 'a plate with no drawing');
  assert.ok(up.textContent.includes('There is no drawing for this plate.'));
  await unmount();
});

await check('Keep the customer’s nesting posts side uploaded with the run id', async () => {
  reset();
  await mountEl(dlg());
  await waitFor(() => find('Keep the customer'), 'Keep');
  await click(find('Keep the customer'), 'Keep');
  await waitFor(() => decided.length === 1, 'decided');
  const p = posted('/compare/accept');
  assert.equal(p.length, 1);
  assert.deepEqual(p[0].body, { side: 'uploaded', runId: 'run-1' });
  assert.equal(decided[0], 'The uploaded nesting stays.');
  await unmount();
});

await check('Use auto nesting instead asks first, says what is replaced, then posts side auto', async () => {
  reset();
  await mountEl(dlg());
  await waitFor(() => find('Use auto nesting instead'), 'Use auto');
  await click(find('Use auto nesting instead'), 'Use auto');
  await waitFor(() => document.querySelector('[data-testid=compare-confirm]'), 'the confirmation');
  assert.equal(document.querySelector('[data-testid=compare-confirm]').textContent, answer().willReplace.message, 'the backend sentence, as given');
  const facts = document.querySelector('[data-testid=compare-replace-facts]').textContent;
  assert.ok(facts.includes('Goes: 4 plates (3 uploaded, 1 ours), 3 customer files.') && facts.includes('Comes: 3 plates holding 37 pieces. 2 stay un-nested.'));
  assert.equal(posted('/compare/accept').length, 0, 'nothing is written before the confirmation');
  await click(find('Replace with auto nesting'), 'confirm');
  await waitFor(() => decided.length === 1, 'decided');
  assert.deepEqual(posted('/compare/accept')[0].body, { side: 'auto', runId: 'run-1' });
  assert.ok(decided[0].startsWith('Our automatic nesting is saved'));
  await unmount();
});

await check('without the grant both accept buttons are off and the reason is given', async () => {
  reset();
  await mountEl(dlg({ canManage: false }));
  await waitFor(() => find('Use auto nesting instead'), 'buttons');
  assert.equal(find('Use auto nesting instead').disabled, true);
  assert.equal(find('Keep the customer').disabled, true);
  assert.ok(find('Use auto nesting instead').parentElement.getAttribute('aria-label').includes('your role cannot change the order'));
  assert.ok(find('Run again'), 'looking and running stay open to a viewer');
  await unmount();
});

await check('the backend’s canAccept reason is used when a side cannot be taken', async () => {
  reset();
  getNow = () => answer({ canAccept: { uploaded: true, auto: false, reason: 'The automatic run has no plan for the whole line.' } });
  await mountEl(dlg());
  await waitFor(() => find('Use auto nesting instead'), 'buttons');
  assert.equal(find('Use auto nesting instead').disabled, true);
  assert.equal(find('Keep the customer').disabled, false);
  assert.equal(find('Use auto nesting instead').parentElement.getAttribute('aria-label'), 'The automatic run has no plan for the whole line.');
  await unmount();
});

await check('a decided comparison says so and offers Run again; the accept buttons are off', async () => {
  reset();
  getNow = () => answer({ auto: { ...answer().auto, status: 'accepted', decision: 'uploaded' } });
  await mountEl(dlg());
  await waitFor(() => document.querySelector('[data-testid=compare-decided]'), 'the note');
  assert.equal(find('Use auto nesting instead').disabled, true);
  assert.ok(row('plates').querySelector('[data-col=auto]').textContent === '3', 'its figures stay visible');
  await unmount();
});

await check('with nothing uploaded the dialog says there is nothing to compare', async () => {
  reset();
  getNow = () => answer({ uploaded: null });
  await mountEl(dlg());
  await waitFor(() => text().includes('nothing to compare'), 'the note');
  await unmount();
});

await check('Stop and use this posts the comparison stop route and says it is stopping', async () => {
  reset();
  getNow = () => answer({ auto: { runId: 'run-2', status: 'running', metrics: null, perPlate: [] }, run: runSnap(30), delta: null, verdict: null });
  await mountEl(dlg());
  await waitFor(() => find('Stop and use this'), 'the stop button');
  assert.equal(find('Stop and use this').disabled, false);
  await click(find('Stop and use this'), 'Stop');
  assert.equal(stops.length, 1);
  assert.ok(calls.some((c) => c.startsWith('POST') && c.endsWith('/nesting/compare/stop')));
  assert.equal(startedRuns.length, 0, 'it did not start another run');
  await unmount();
});

await check('the picker is labelled by time, with one plain line', async () => {
  reset();
  getNow = () => noRun();
  await mountEl(dlg());
  await waitFor(() => document.querySelector('[data-testid=compare-none]'), 'the none state');
  const labels = [...document.querySelectorAll('[aria-label="How hard to look"] button')].map((b) => b.textContent.trim());
  assert.deepEqual(labels, ['5 min', '10 min', '20 min', '1 hour']);
  assert.equal(document.querySelector('[data-testid=effort-line]').textContent, 'These are ceilings. A small line finishes early.');
  await click(find('20 min'), '20 min');
  await click(find('Run auto nesting to compare'), 'Run');
  assert.equal(startedRuns[0].effort, 'deep');
  await unmount();
});

await check('the difference is the backend’s own number, not one worked out here', async () => {
  reset();
  getNow = () => answer({ delta: { plates: -7, tonnesBought: -0.999 } });
  await mountEl(dlg());
  await waitFor(() => row('plates'), 'rows');
  assert.equal(row('plates').querySelector('[data-col=diff]').textContent, '↓Auto 7 less · auto is better', '5 against 3 would say 2: the backend said 7');
  await unmount();
});

await check('every null metric carries its reason: cost, waste %, the difference, and a side with no run', async () => {
  reset();
  const tip = (el) => el.querySelector('[data-null]').parentElement.getAttribute('aria-label') ?? el.querySelector('[data-null]').getAttribute('aria-label');
  getNow = () => answer({
    auto: { ...answer().auto, metrics: { ...mAuto, wastePct: null, wastePctReason: 'The parts’ true steel is not known for NVX-CM.', cost: cost(null, 'NVX-PS has no price.') } },
    delta: { plates: -2, cost: null, costReason: 'No price for NVX-PS, so there is no cost difference.' },
  });
  await mountEl(dlg());
  await waitFor(() => row('cost'), 'rows');
  assert.equal(row('wastePct').querySelector('[data-col=auto]').textContent, '—');
  assert.equal(tip(row('wastePct').querySelector('[data-col=auto]')), 'The parts’ true steel is not known for NVX-CM.');
  assert.equal(tip(row('cost').querySelector('[data-col=auto]')), 'NVX-PS has no price.');
  assert.equal(row('cost').querySelector('[data-col=diff]').textContent, '—');
  assert.equal(tip(row('cost').querySelector('[data-col=diff]')), 'No price for NVX-PS, so there is no cost difference.');
  await unmount();
  reset();
  getNow = () => answer({ delta: null, deltaReason: 'The two sides do not hold the same pieces yet.', verdict: null });
  await mountEl(dlg());
  await waitFor(() => row('plates'), 'rows');
  assert.equal(row('plates').querySelector('[data-col=diff]').textContent, '—');
  assert.equal(tip(row('plates').querySelector('[data-col=diff]')), 'The two sides do not hold the same pieces yet.');
  assert.equal(document.querySelector('[data-testid=compare-verdict]').textContent, 'The two sides do not hold the same pieces yet.', 'the reason stands where the verdict would be');
  await unmount();
  reset();
  getNow = () => answer({ auto: { runId: null, status: 'unavailable', metrics: null, perPlate: [], reason: 'The line is not frozen, so it cannot be nested.' }, delta: null, verdict: null, wholeLine: null, likeForLike: null });
  await mountEl(dlg());
  await waitFor(() => row('plates'), 'rows');
  assert.equal(tip(row('plates').querySelector('[data-col=auto]')), 'The line is not frozen, so it cannot be nested.');
  await unmount();
  reset();
  getNow = () => answer({ wholeLine: { ...answer().wholeLine, auto: { runId: null, status: 'none', metrics: null, perPlate: [], reason: 'No whole-line plan yet.' }, delta: null, deltaReason: 'No whole-line plan yet.', verdict: null } });
  await mountEl(dlg());
  await waitFor(() => find('Whole line'), 'toggle');
  await click(find('Whole line'), 'Whole line');
  assert.equal(tip(row('plates').querySelector('[data-col=auto]')), 'No whole-line plan yet.');
  await unmount();
});

await check('each plate is drawn with its own kerf from the payload', async () => {
  reset();
  await mountEl(dlg());
  await waitFor(() => document.querySelector('[data-side="Customer\'s nesting"]'), 'lists');
  const up = document.querySelector('[data-side="Customer\'s nesting"]');
  await click(up.querySelectorAll('button')[0], 'plate');
  assert.ok([...up.querySelectorAll('svg title')].some((t) => t.textContent.includes('Rim: 2.5 mm cut off every plate edge')), 'the kerf is the plate’s 2.5, not a fixed 3');
  await unmount();
});

await check('RUN_BUSY on starting a comparison is shown in the backend words', async () => {
  reset();
  getNow = () => noRun();
  startFail = { code: 'RUN_BUSY', message: 'A nesting run is working on this line. Wait for it to finish.' };
  await mountEl(dlg());
  await waitFor(() => find('Run auto nesting to compare'), 'Run');
  await click(find('Run auto nesting to compare'), 'Run');
  await waitFor(() => document.querySelector('[data-testid=compare-error]'), 'the refusal');
  assert.ok(document.querySelector('[data-testid=compare-error]').textContent.includes('A nesting run is working on this line.'));
  assert.ok(!find('Reload'));
  await unmount();
});

await check('409 CHANGED_MEANWHILE on accept offers Reload, which reads the comparison again', async () => {
  reset();
  acceptFail = { status: 409, body: { code: 'CHANGED_MEANWHILE', message: 'The plates on this line changed while this was being worked out.' } };
  await mountEl(dlg());
  await waitFor(() => find('Keep the customer'), 'Keep');
  await click(find('Keep the customer'), 'Keep');
  await waitFor(() => find('Reload'), 'Reload');
  assert.equal(decided.length, 0);
  const before = calls.filter((c) => c.startsWith('GET') && c.includes('/compare')).length;
  acceptFail = null;
  await click(find('Reload'), 'Reload');
  await waitFor(() => calls.filter((c) => c.startsWith('GET') && c.includes('/compare')).length > before, 'a fresh read');
  await unmount();
});

await check('the compare picker has 1 hour and the long-run line; a run made offline says where it was nested', async () => {
  reset();
  getNow = () => noRun();
  await mountEl(dlg());
  await waitFor(() => document.querySelector('[data-testid=compare-none]'), 'none');
  const labels = [...document.querySelectorAll('[aria-label="How hard to look"] button')].map((b) => b.textContent.trim());
  assert.deepEqual(labels, ['5 min', '10 min', '20 min', '1 hour']);
  assert.ok(document.querySelector('[data-testid=effort-long-line]').textContent.includes('keeps going on the server'));
  await click(find('1 hour'), '1 hour');
  await click(find('Run auto nesting to compare'), 'Run');
  assert.equal(startedRuns[0].effort, 'long');
  await unmount();
  reset();
  getNow = () => answer({ auto: { ...answer().auto, startedBy: 'offline runner (KEPL-LAPTOP)', ranAt: '2026-10-10T16:40:00Z' } });
  await mountEl(dlg());
  await waitFor(() => document.querySelector('[data-testid=compare-ran]'), 'ready');
  assert.match(document.querySelector('[data-testid=compare-ran]').textContent, /Nested on a computer, 10 Oct 2026/);
  assert.equal(row('plates').querySelector('[data-col=auto]').textContent, '3', 'otherwise a normal ready run');
  await unmount();
});

await check('the panel offers Compare when uploaded plates exist, and opens the dialog', async () => {
  reset();
  await mountEl(React.createElement(MemoryRouter, null, React.createElement(NestingPanel, { orderId: 1, lineId: 1, canManage: true })));
  await waitFor(() => find('Compare with auto nesting'), 'the button');
  await click(find('Compare with auto nesting'), 'Compare');
  await waitFor(() => document.querySelector('[data-testid=compare-table]'), 'the dialog');
  await unmount();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
