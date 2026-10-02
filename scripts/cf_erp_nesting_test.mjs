// Run from multi_app_fe: node scripts/cf_erp_nesting_test.mjs
// DOM test of the Nesting panel's waiting line, Cancel, the effort chip and the capped note;
// the nesting choices (Step A pieces, Step B plates, persisted summary, block, reset);
// and the plate diagram (legend, rule badge, dimensions only above the zoom threshold).
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
      export * as diagram from './src/apps/cf_erp/lib/nestDiagram';`,
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
const { React, createRoot, NestingPanel, diagram, MemoryRouter } = await import(pathToFileURL(artifact));
// The panel's Cut pieces button keeps its dialog in the address, so it renders inside a router (as on the order page).
const inRouter = (el) => React.createElement(MemoryRouter, null, el);
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

/* The nesting choices (GET/PUT …/nesting/choices): one steel, two pieces and a
   NEST_MANUAL one, two plates. The PUT answers with the selection applied, and
   blocked when every plate is unticked — what the server does. */
const choicesFor = (cut = [], plates = []) => {
  const pieces = [
    { cutPlateId: 11, code: 'CP-A', name: 'A', thickness: 10, length: 500, width: 300, grade: 'E250', material: 'MS', pieces: 4, onImported: 0, toNest: 4, kgEach: 11.775, kg: 47.1, manual: false, excluded: cut.includes(11), note: null },
    { cutPlateId: 12, code: 'CP-B', name: 'B', thickness: 10, length: 400, width: 200, grade: 'E250', material: 'MS', pieces: 2, onImported: 0, toNest: 2, kgEach: 6.28, kg: 12.56, manual: false, excluded: cut.includes(12), note: null },
    { cutPlateId: 13, code: 'CP-M', name: 'M', thickness: 10, length: 300, width: 300, grade: 'E250', material: 'MS', pieces: 1, onImported: 0, toNest: 1, kgEach: 7.065, kg: 7.065, manual: true, excluded: false, note: 'NEST_MANUAL is set on this cut piece, so automatic nesting always leaves it out.' },
  ];
  const plateRows = [
    { plateItemId: 21, code: 'PL-2500', name: 'Plate', thickness: 10, length: 2500, width: 1250, grade: 'E250', material: 'MS', kgEach: 245, stock: { ours: 3, theirs: 0 }, preferred: false, lastPaid: { unitPrice: 15000, currency: 'INR', orderCode: 'PO-7', orderedAt: '2026-09-01' }, listPrice: { price: 60, basis: 'kg', currency: 'INR', perPlate: 14700 }, excluded: plates.includes(21) },
    { plateItemId: 22, code: 'PL-2000', name: 'Plate', thickness: 10, length: 2000, width: 1000, grade: 'E250', material: 'MS', kgEach: 157, stock: { ours: 0, theirs: 0 }, preferred: false, lastPaid: null, listPrice: null, excluded: plates.includes(22) },
  ];
  const can = pieces.filter((p) => !p.manual);
  const ticked = can.filter((p) => !p.excluded);
  const platesTicked = plateRows.filter((p) => !p.excluded).length;
  const blocked = ticked.length && !platesTicked ? '10 mm E250 MS: every plate it could be cut from is unticked, so its pieces have nothing to be nested on.' : null;
  const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);
  const leftOut = can.filter((p) => p.excluded);
  return {
    line: { id: 1, lineNo: 1, orderId: 1, orderCode: 'SO-1', quantity: 1 }, canSave: true, readOnlyReason: null,
    groups: [{
      key: '10|E250|MS', thickness: 10, grade: 'E250', material: 'MS', kerfMm: 3, settingsBasis: 'band', pieces, plates: plateRows,
      offcutsInStock: { count: 1, kg: 20, biggestMm2: 1, note: 'Drops' },
      summary: { cutPlates: can.length, pieces: sum(can, 'toNest'), kg: sum(can, 'kg'), ticked: { cutPlates: ticked.length, pieces: sum(ticked, 'toNest'), kg: sum(ticked, 'kg') }, platesOffered: 2, platesTicked },
      blocked, noCandidate: null,
    }],
    unusable: [], manual: [],
    excluded: { cutPlateIds: cut, plateIds: plates },
    summary: {
      cutPlatesLeftOut: leftOut.length, piecesLeftOut: sum(leftOut, 'toNest'), kgLeftOut: sum(leftOut, 'kg'), platesExcluded: plates.length, leftOut: [], excludedPlates: [],
      pieces: sum(can, 'toNest'), kg: sum(can, 'kg'), ticked: { pieces: sum(ticked, 'toNest'), kg: sum(ticked, 'kg') },
    },
    blocked: blocked ? [blocked] : [],
  };
};
let choicesNow = choicesFor();
const puts = [];

let posts = [];
let release = null;
let planNow = null;              // a saved plan to serve instead of the empty one
globalThis.fetch = async (url, o = {}) => {
  const method = o.method || 'GET';
  let out;
  if (String(url).includes('/nesting/choices')) {
    if (method === 'PUT') {
      const body = JSON.parse(o.body);
      puts.push(body);
      choicesNow = choicesFor(body.excludedCutPlateIds, body.excludedPlateIds);
    }
    out = choicesNow;
  } else if (String(url).includes('/costs')) {
    out = { lines: [] };
  } else if (method === 'POST' && String(url).endsWith('/plan')) {
    posts.push(JSON.parse(o.body));
    const budget = { effort: 'standard', capped: true };
    out = await new Promise((r) => { release = () => r(plan({ saved: false, basis: 'proposal', budget })); });
  } else out = planNow ?? plan();
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
await React.act(async () => { root.render(inRouter(React.createElement(NestingPanel, { orderId: 1, lineId: 1, canManage: true }))); await sleep(0); });
await waitFor(() => find('Nest everything'), 'the panel');

await check('the toolbar has a "Cut pieces (N)" button (the cut pieces are not a stage any more)', async () => {
  const b = find('Cut pieces (');
  assert.ok(b, 'no Cut pieces button');
  assert.match(b.textContent.trim(), /^Cut pieces \(\d+\)$/);
});

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

const boxes = (sel) => [...document.querySelectorAll(sel)];
const tickOf = (row) => row.querySelector('input[type=checkbox]');
const toggle = async (input, what) => { assert.ok(input, `no ${what}`); await React.act(async () => { input.click(); await sleep(0); }); await settle(40); };

await check('Step A lists the pieces by steel, all ticked, NEST_MANUAL unticked and explained', async () => {
  // A proposal is on screen from the tests above, so the steps are folded to one line.
  assert.ok(text().includes('0 pieces left out · 0 plates excluded') && !text().includes('What to nest'));
  await click(find('Choose pieces and plates'), 'open the steps');
  await waitFor(() => boxes('[data-testid=choice-piece]').length === 3, 'piece rows');
  assert.ok(text().includes('What to nest'));
  assert.ok(text().includes('10 mm E250 MS'), 'grouped by steel');
  const [a, b, m] = boxes('[data-testid=choice-piece]');
  assert.equal(tickOf(a).checked, true); assert.equal(tickOf(b).checked, true);
  assert.equal(tickOf(m).checked, false, 'NEST_MANUAL is unticked');
  assert.equal(tickOf(m).disabled, true, 'and cannot be ticked here');
  assert.ok(m.textContent.includes('NEST_MANUAL') && text().includes('automatic nesting always leaves it out'));
  assert.ok(text().includes('0 pieces left out · 0 plates excluded'));
  assert.ok(text().includes('2 of 2 cut pieces · 6 of 6 pcs'), 'the group count + kg summary');
});

await check('unticking a piece saves the whole selection and shows the persisted summary', async () => {
  await toggle(tickOf(boxes('[data-testid=choice-piece]')[1]), 'CP-B tick');
  await waitFor(() => puts.length === 1, 'the PUT');
  assert.deepEqual(puts[0], { excludedCutPlateIds: [12], excludedPlateIds: [] });
  await waitFor(() => text().includes('2 pieces left out · 0 plates excluded'), 'the summary from the server');
  assert.equal(tickOf(boxes('[data-testid=choice-piece]')[1]).checked, false);
  assert.ok(boxes('[data-testid=choice-piece]')[1].textContent.includes('Left out'));
});

await check('Step B lists the candidate plates with stock and prices; unticking all blocks Nest', async () => {
  await click(find('2 · Plates'), 'plates tab');
  await waitFor(() => boxes('[data-testid=choice-plate]').length === 2, 'plate rows');
  const [p1, p2] = boxes('[data-testid=choice-plate]');
  assert.ok(p1.textContent.includes('PL-2500') && p1.textContent.includes('3 in stock') && p1.textContent.includes('Last paid') && p1.textContent.includes('/ plate'));
  assert.ok(p2.textContent.includes('Never bought'));
  assert.ok(text().includes('offcut of this steel in stock'));
  await toggle(tickOf(p1), 'PL-2500');
  await waitFor(() => puts.length === 2, 'second PUT');
  assert.deepEqual(puts[1], { excludedCutPlateIds: [12], excludedPlateIds: [21] });
  await waitFor(() => text().includes('1 plate excluded'), 'plates excluded');
  await toggle(tickOf(boxes('[data-testid=choice-plate]')[1]), 'PL-2000');
  await waitFor(() => document.querySelector('[data-testid=nest-blocked]'), 'the block');
  assert.ok(text().includes('every plate it could be cut from is unticked'));
  assert.equal(find('Nest everything').disabled, true, 'Nest is disabled while blocked');
});

await check('Reset clears both lists and unblocks Nest', async () => {
  await click(find('Reset'), 'Reset');
  await waitFor(() => puts.length === 4, 'the reset PUT');
  assert.deepEqual(puts.at(-1), { excludedCutPlateIds: [], excludedPlateIds: [] });
  await waitFor(() => text().includes('0 pieces left out · 0 plates excluded'), 'reset summary');
  assert.equal(find('Nest everything').disabled, false);
  assert.ok(!document.querySelector('[data-testid=nest-blocked]'));
});

// ---- the plate diagram ----------------------------------------------------
const nestFx = {
  id: 9, lotNo: 'N-001', plateItemId: 22, plateCode: 'PL-2000', plateName: 'Plate', source: 'catalog', thickness: 10, grade: 'E250', material: 'MS', density: 7850,
  length: 2000, width: 1000, requiredLength: 1506, requiredWidth: 803, sheetArea: 2e6, usedArea: 450000, wasteArea: 1.55e6, wastePct: 77.5, weightKg: 157,
  wasteKg: { kerf: 3, sequenceGaps: 0, rim: 1, offcut: 80, wastage: 38 }, waste: { kerf: 1, sequenceGaps: 0, rim: 1, offcut: 1, wastage: 1 }, partsKg: 35,
  origin: 'auto', verdict: null, forced: false, reasons: [], hasLayout: true,
  sequences: [{ seqNo: 1, rows: 1, rowsAllowed: 3, pieces: 2, size: 'big' }, { seqNo: 2, rows: 1, rowsAllowed: 3, pieces: 1, size: 'big' }],
  pieces: [
    { cutPlateId: 11, cutPlateCode: 'CP-A', seqNo: 1, rowNo: 1, posNo: 1, x: 700, y: 300, length: 500, width: 300, rotated: false },
    { cutPlateId: 11, cutPlateCode: 'CP-A', seqNo: 1, rowNo: 1, posNo: 2, x: 1203, y: 300, length: 500, width: 300, rotated: false },
    { cutPlateId: 12, cutPlateCode: 'CP-B', seqNo: 2, rowNo: 1, posNo: 1, x: 700, y: 606, length: 400, width: 200, rotated: false },
  ],
  offcuts: [{ offcutNo: 'N-001-A', area: 500000, weightKg: 39, rect: { x: 3, y: 3, length: 600, width: 900 }, bbox: { x: 3, y: 3, length: 600, width: 900 }, outline: [[[3, 3], [603, 3], [603, 903], [3, 903]]] }],
  rules: {
    status: 'warn', utilisationPct: 22.5, sharedCuts: 1, sharedLengthMm: 300,
    checks: [
      { key: 'kerf', ok: true, label: 'Kerf 3 mm', detail: 'Inside the 2.5–5 mm band.' },
      { key: 'sequenceGap', ok: false, label: 'Sequence gap 3 mm', detail: 'Sequences 1 and 2 are 3 mm apart; the gap between sequences is 5–8 mm.' },
    ],
  },
};
const savedPlan = plan({
  saved: true, basis: 'saved plan',
  groups: [{ key: 'g1', thickness: 10, grade: 'E250', material: 'MS', nests: [nestFx], unplaced: [], candidates: [], metrics: { ...metrics, lots: 1, plates: 1, pieces: 3 }, kerfMm: 3, seqGapMinMm: 5, seqGapMaxMm: 8, settingsBasis: '', cutPlates: [], orderMarginLengthMm: null, orderMarginWidthMm: null, guillotine: false, deterministic: null, elapsedMs: null }],
  choices: { cutPlatesLeftOut: 1, piecesLeftOut: 2, kgLeftOut: 12.56, platesExcluded: 1, leftOut: [], excludedPlates: [] },
  drift: [],
});

await check('the diagram helpers find the shared cut and keep dimensions off below the zoom threshold', async () => {
  const laid = diagram.laidOut(nestFx.pieces);
  const cuts = diagram.sharedCuts(laid, 3);
  assert.equal(cuts.length, 1, 'the two A pieces one kerf apart share a cut');
  assert.equal(cuts[0].vertical, true); assert.equal(cuts[0].x1, 1201.5);
  const gaps = diagram.seqGaps(diagram.seqBoxes(laid));
  assert.equal(gaps[0].gap, 6);
  const args = { scale: 1, fontPx: 10, pieces: laid, kerf: 3, cuts, gaps, offcuts: nestFx.offcuts, view: { x: 0, y: -100, w: 2100, h: 1200 }, flipY: (y) => 1000 - y };
  assert.equal(diagram.dimensionLabels({ ...args, zoom: 1 }).length, 0);
  const at2 = diagram.dimensionLabels({ ...args, zoom: diagram.DIM_ZOOM });
  assert.ok(at2.some((d) => d.kind === 'part' && d.text === '500 × 300'));
  assert.ok(at2.some((d) => d.kind === 'offcut'));
  assert.ok(at2.some((d) => d.kind === 'gap' && d.text === 'gap 6'));
  const tiny = diagram.dimensionLabels({ ...args, zoom: 2, scale: 0.05 });
  assert.ok(!tiny.some((d) => d.kind === 'part'), 'a part too small on screen carries no label');
  assert.deepEqual(diagram.ruleBadge(nestFx.rules), { tone: 'warning', mark: '⚠', label: '1 rule broken' });
});

const root2Host = document.createElement('div');
document.body.appendChild(root2Host);
await React.act(async () => { root.unmount(); });
planNow = savedPlan;
const root2 = createRoot(root2Host);
await React.act(async () => { root2.render(inRouter(React.createElement(NestingPanel, { orderId: 1, lineId: 2, canManage: true }))); await sleep(0); });
await waitFor(() => find('Draw the 1 plate'), 'the saved plan');

await check('a saved plan says what its choices left out, and folds the steps away', async () => {
  assert.ok(document.querySelector('[data-testid=plan-choices]')?.textContent.includes('2 pieces left out · 1 plate excluded'));
  assert.ok(!text().includes('What to nest'), 'the steps are folded when a plan is saved');
  assert.ok(find('Choose pieces and plates'), 'one click opens them');
});

await check('the open plate shows thumbnails, the rule badge with reasons, and a legend', async () => {
  await click(find('Draw the 1 plate'), 'open the group');
  await waitFor(() => document.querySelector('[data-testid=diagram-legend]'), 'the diagram');
  assert.equal(document.querySelectorAll('[data-testid=plate-thumbs] button').length, 1);
  const badge = document.querySelector('[data-testid=rule-badge]');
  assert.equal(badge.getAttribute('data-status'), 'warn');
  assert.ok(badge.textContent.includes('1 rule broken') && badge.textContent.includes('22.5% used'));
  assert.ok(text().includes('1 shared cut'));
  const legend = document.querySelector('[data-testid=diagram-legend]').textContent;
  for (const w of ['Seq 1', 'Seq 2', 'Kerf', 'Shared cut', 'Rim / edge margin', 'Offcut (kept)', 'Scrap']) assert.ok(legend.includes(w), `legend: ${w}`);
  await click(find('Why'), 'Why');
  await waitFor(() => document.querySelector('[data-testid=rule-checks]'), 'the checks');
  assert.ok(text().includes('Sequences 1 and 2 are 3 mm apart'));
  assert.equal(document.querySelectorAll('svg[role=img] line[stroke="var(--c-chart-3)"]').length, 1, 'the shared cut is drawn in its own colour');
});

await check('dimensions appear on the diagram only above the zoom threshold', async () => {
  assert.equal(document.querySelectorAll('[data-dim]').length, 0, 'none at 1×');
  assert.ok(text().includes('Zoom in (2× or more) to see dimensions'));
  await click(find('Zoom in'), 'zoom 1');
  assert.equal(document.querySelectorAll('[data-dim]').length, 0, 'none at 1.6×');
  await click(find('Zoom in'), 'zoom 2');
  await waitFor(() => document.querySelectorAll('[data-dim=part]').length > 0, 'part labels');
  const dims = [...document.querySelectorAll('[data-dim]')].map((e) => e.textContent);
  assert.ok(dims.includes('500 × 300'), dims.join(' | '));
  assert.ok(document.querySelector('[data-dim=plate]'), 'the plate size as dimension lines');
  await click(find('Fit the plate'), 'fit');
  assert.equal(document.querySelectorAll('[data-dim]').length, 0, 'gone again at Fit');
});

await React.act(async () => { root2.unmount(); });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
