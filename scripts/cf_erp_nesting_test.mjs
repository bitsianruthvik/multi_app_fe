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
let released = false;
let runNow = null;               // the run the stub's server holds
const release = () => { released = true; };
const snap = (status, extra = {}) => ({
  runId: 'r1', lineId: 1, status, phase: status === 'done' ? 'done' : 'packing', progress: { done: status === 'done' ? 10 : 3, total: 10, pct: status === 'done' ? 100 : 30 },
  startedAt: '2026-10-03T10:00:00Z', startedBy: 'Asha', finishedAt: null, elapsedMs: 4000, budgetMs: 600000, effort: 'deep',
  log: [{ at: '2026-10-03T10:00:01Z', text: 'Reading the order' }], error: null,
  summary: status === 'done' ? { plates: 0, pieces: 0, wastePct: 0, problems: 0 } : null, ...extra,
});
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
  } else if (method === 'POST' && String(url).endsWith('/nesting/runs')) {
    posts.push(JSON.parse(o.body));
    released = false; runNow = true;
    out = snap('running');
  } else if (String(url).includes('/nesting/runs/current')) {
    if (!runNow) out = { status: 'none' };
    else if (!released) out = snap('running');
    else out = snap('done', String(url).includes('plan=1') ? { plan: plan({ saved: false, basis: 'proposal', budget: { effort: 'standard', capped: true } }) } : {});
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
await waitFor(() => find('Nest by AI'), 'the panel');
const q = (sel) => document.querySelector(sel);
const esc = async () => { await click(document.querySelector('#nest-more-menu .MuiBackdrop-root'), 'the menu backdrop'); await settle(60); };

await check('nothing nested: the step is two doors, each with one sentence and one button, and nothing else to choose', async () => {
  const doors = q('[data-testid=nest-doors]');
  assert.ok(doors, 'the doors');
  assert.equal(doors.querySelectorAll('button').length, 2, 'one button per door');
  const ours = q('[data-testid=door-ours]').textContent;
  const up = q('[data-testid=door-upload]').textContent;
  // UPLOAD IS THE MAIN DOOR (2026-10-13): it comes first and its button is the filled one; ours is the fallback.
  assert.deepEqual([...doors.children].map((d) => d.getAttribute('data-testid')), ['door-upload', 'door-ours'], 'upload first');
  assert.deepEqual([...doors.querySelectorAll('button')].map((b) => b.textContent), ['Upload nesting files', 'Nest by AI']);
  assert.equal(q('[data-testid=door-upload]').getAttribute('data-primary'), 'true');
  assert.equal(q('[data-testid=door-ours]').getAttribute('data-primary'), 'false');
  assert.ok(find('Upload nesting files').className.includes('MuiButton-contained'), 'the upload button is the primary one');
  assert.ok(find('Nest by AI').className.includes('MuiButton-outlined'), 'ours is outlined');
  assert.ok(ours.includes('Nesting by AI') && ours.includes('No nesting of your own? AI lays the cut pieces out on plates from your catalog.'));
  assert.ok(up.includes('Upload your nesting') && up.includes("Drop the ProNest job files (.nif, one per thickness) or one DXF per plate. AI matches the parts to this order line's cut pieces."));
  // The picker takes both kinds together (this API does not say which it reads: both).
  assert.equal(q('[data-testid=nest-files-input]').getAttribute('accept'), '.nif,.dxf');
  assert.equal(find('Nest by AI').disabled, false);
  assert.equal(find('Upload nesting files').disabled, false);
  // What used to sit above and around them is behind door 1 or in More.
  assert.ok(!q('[data-testid=plates-to-use]') && !q('[data-testid=choices-summary]') && !q('[data-testid=nest-summary]'));
  assert.ok(!text().includes('Nothing is laid out yet') && !/rectangle/i.test(text()));
});

await check('More holds CNC, the Excel sheet download and Start again; compare and the Excel upload are gone', async () => {
  assert.ok(!find('Upload Excel') && !find('Download Excel') && !q('input[accept=".xlsx"]'), 'no Excel buttons on the screen');
  await click(q('[data-testid=nest-more]'), 'More');
  await waitFor(() => q('[data-testid=more-again]'), 'the menu');
  const items = [...document.querySelectorAll('#nest-more-menu [role=menuitem]')];
  assert.deepEqual(items.map((m) => m.getAttribute('data-testid')), ['more-cnc', 'more-cncAi', 'more-sheet', 'more-again']);
  assert.ok(!q('[data-testid=more-compare]') && !/compare/i.test(text()), 'the comparison is off the screen (2026-10-13)');
  assert.ok(q('[data-testid=more-cnc]').textContent.includes('Download CNC files (zip)'));
  assert.ok(q('[data-testid=more-sheet]').textContent.includes('Download nesting sheet') && q('[data-testid=more-sheet]').textContent.includes('For reference only.'));
  assert.ok(q('[data-testid=more-again]').textContent.includes('Start again'));
  // Nothing is nested, so two of them cannot be used — and each says why.
  assert.equal(q('[data-testid=more-cnc-why]').textContent, 'Nothing is nested yet.');
  assert.equal(q('[data-testid=more-again-why]').textContent, 'Nothing is nested yet.');
  assert.notEqual(q('[data-testid=more-sheet]').getAttribute('aria-disabled'), 'true', 'the sheet can always be downloaded');
  assert.ok(!text().includes('Upload Excel') && !text().includes('Upload sheet'), 'no upload of any sheet in the menu');
  await esc();
  await waitFor(() => !q('[data-testid=more-again]'), 'the menu shut');
});

await check('the toolbar has a "Cut pieces (N)" button (the cut pieces are not a stage any more)', async () => {
  const b = find('Cut pieces (');
  assert.ok(b, 'no Cut pieces button');
  assert.match(b.textContent.trim(), /^Cut pieces \(\d+\)$/);
});

await check('door 1 asks how hard to try (Standard picked), with the plain line, and says what the run will do', async () => {
  await click(find('Nest by AI'), 'door 1');
  await waitFor(() => q('[data-testid=effort-line]'), 'the start dialog');
  const choice = q('[data-testid=effort-choice]');
  assert.deepEqual([...choice.querySelectorAll('button')].map((b) => b.textContent), ['Quickup to 5 min', 'Standardup to 10 min', 'Deepup to 20 min', 'Longup to 1 hour']);
  assert.equal(q('[data-effort=standard]').getAttribute('aria-pressed'), 'true');
  assert.equal(q('[data-testid=effort-line]').textContent, 'These are ceilings. A small line finishes early.');
  assert.equal(q('[data-testid=nest-start-sentence]').textContent, 'Lays out every cut piece on the line. Nothing is written until you use the result.');
  assert.ok(q('[data-testid=choices-summary]'), 'the pieces and plates to nest are reachable from here');
  await click(q('[data-effort=deep]'), '20 min');
  assert.equal(q('[data-effort=deep]').getAttribute('aria-pressed'), 'true');
});

await check('a run shows the running card, sends the effort, and locks the run buttons', async () => {
  await click(find('Start nesting'), 'Start');
  await waitFor(() => document.querySelector('[data-testid=nest-run-card]'), 'running card');
  assert.deepEqual(posts[0].effort, 'deep');
  assert.ok(text().includes('Packing plates (3/10 tries)') && text().includes('of 10:00 used'));
  await waitFor(() => !find('Start nesting'), 'the start dialog shut');
  assert.ok(!q('[data-testid=nest-doors]'), 'no second run can be started while one is going');
  assert.ok(text().includes('you can leave this page'));
  await waitFor(() => text().includes('0:05'), 'the timer tick', 2500);
});

await check('when the server finishes, the proposal appears once, with its capped note and Discard', async () => {
  release();
  await waitFor(() => text().includes('Nothing here is written down yet'), 'proposal', 5000);
  assert.equal(text().split('Stopped at the time limit').length - 1, 1);
  assert.ok(find('Discard') && !find('Cancel'));
  assert.ok(find('Use this nesting'), 'the one primary');
  assert.ok(!q('[data-testid=nest-doors]'), 'the doors are away while a proposal waits');
});

const boxes = (sel) => [...document.querySelectorAll(sel)];
const tickOf = (row) => row.querySelector('input[type=checkbox]');
const toggle = async (input, what) => { assert.ok(input, `no ${what}`); await React.act(async () => { input.click(); await sleep(0); }); await settle(40); };

await check('Step A lists the pieces by steel, all ticked, NEST_MANUAL unticked and explained', async () => {
  // The pieces and plates live behind door 1; from a proposal that is "Nest again". They open folded to one line.
  await click(find('Nest again'), 'Nest again');
  await waitFor(() => q('[data-testid=choices-summary]'), 'the start dialog');
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
  assert.equal(find('Start nesting').disabled, true, 'Start is disabled while blocked');
  assert.equal(q('[data-testid=nest-start-why]').textContent, 'Nesting is blocked until each steel has a plate ticked.');
  assert.ok(q('[data-testid=door-steel-blocked]'), 'and door 1 says so too, with the proposal gone');
  assert.equal(find('Nest by AI').disabled, false, 'the door stays open: the plates are ticked behind it');
});

await check('Reset clears both lists and unblocks Nest', async () => {
  await click(find('Reset'), 'Reset');
  await waitFor(() => puts.length === 4, 'the reset PUT');
  assert.deepEqual(puts.at(-1), { excludedCutPlateIds: [], excludedPlateIds: [] });
  await waitFor(() => text().includes('0 pieces left out · 0 plates excluded'), 'reset summary');
  assert.equal(find('Start nesting').disabled, false);
  assert.ok(!document.querySelector('[data-testid=nest-blocked]') && !q('[data-testid=door-steel-blocked]'));
  await click(find('Cancel'), 'Cancel');
  await waitFor(() => !find('Start nesting'), 'the start dialog shut');
  assert.ok(q('[data-testid=nest-doors]'), 'back at the two doors');
});

// ---- the plate diagram ----------------------------------------------------
const nestFx = {
  id: 9, lotNo: 'N-001', plateItemId: 22, plateCode: 'PL-2000', plateName: 'Plate', source: 'catalog', thickness: 10, grade: 'E250', material: 'MS', density: 7850,
  length: 2000, width: 1000, requiredLength: 1506, requiredWidth: 803, sheetArea: 2e6, usedArea: 450000, wasteArea: 1.55e6, wastePct: 77.5, weightKg: 157,
  wasteKg: { kerf: 3, sequenceGaps: 0, rim: 1, offcut: 80, wastage: 38 }, waste: { kerf: 1, sequenceGaps: 0, rim: 1, offcut: 1, wastage: 1 }, partsKg: 35,
  origin: 'auto', verdict: null, forced: false, reasons: [], hasLayout: true,
  sequences: [{ seqNo: 1, rows: 1, rowsAllowed: 3, pieces: 2, size: 'big' }, { seqNo: 2, rows: 1, rowsAllowed: 3, pieces: 1, size: 'big' }],
  pieces: [
    { cutPlateId: 11, cutPlateCode: 'CP-A', seqNo: 1, rowNo: 1, posNo: 1, x: 700, y: 300, length: 500, width: 300, rotated: false, shapeFrom: 'dimensions' },
    { cutPlateId: 11, cutPlateCode: 'CP-A', seqNo: 1, rowNo: 1, posNo: 2, x: 1203, y: 300, length: 500, width: 300, rotated: false, shapeFrom: 'dimensions' },
    // No rings on it and lying square: this morning's inference would have called it "from dimensions". The field says drawing.
    { cutPlateId: 12, cutPlateCode: 'CP-B', seqNo: 2, rowNo: 1, posNo: 1, x: 700, y: 606, length: 400, width: 200, rotated: false, shapeFrom: 'drawing' },
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
  groups: [{ key: 'g1', thickness: 10, grade: 'E250', material: 'MS', nests: [nestFx], unplaced: [], candidates: [], metrics: { ...metrics, lots: 1, plates: 1, pieces: 3 }, kerfMm: 3, seqGapMinMm: 5, seqGapMaxMm: 8, settingsBasis: '', cutPlates: [
      { id: 11, code: 'CP-A', name: 'A', pieces: 2, length: 500, width: 300, thickness: 10, grade: 'E250', material: 'MS', shapeFrom: 'dimensions', shapeNote: 'Its rows have 2 different drawings, so it is nested as its rectangle.' },
      { id: 12, code: 'CP-B', name: 'B', pieces: 1, length: 400, width: 200, thickness: 10, grade: 'E250', material: 'MS', shapeFrom: 'drawing', shapeNote: null },
    ], orderMarginLengthMm: null, orderMarginWidthMm: null, guillotine: false, deterministic: null, elapsedMs: null }],
  choices: { cutPlatesLeftOut: 1, piecesLeftOut: 2, kgLeftOut: 12.56, platesExcluded: 1, leftOut: [], excludedPlates: [] },
  drift: [],
  totals: { ...metrics, plates: 1, pieces: 3, weightKg: 157, groups: 1, unplaced: 0 },
  // What the line needs against what is on a plate: CP-B is one short, and CP-M (held back by hand) three.
  coverage: [
    { cutPlateId: 11, cutPlateCode: 'CP-A', needed: 2, nested: 2, diff: 0, manual: false, leftOut: false },
    { cutPlateId: 12, cutPlateCode: 'CP-B', needed: 2, nested: 1, diff: -1, manual: false, leftOut: false },
    { cutPlateId: 13, cutPlateCode: 'CP-M', needed: 3, nested: 0, diff: -3, manual: true, leftOut: false },
  ],
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
planNow = savedPlan; runNow = null;
const root2 = createRoot(root2Host);
await React.act(async () => { root2.render(inRouter(React.createElement(NestingPanel, { orderId: 1, lineId: 2, canManage: true }))); await sleep(0); });
await waitFor(() => find('Draw the 1 plate'), 'the saved plan');

await check('a saved plan says what its choices left out, and folds the steps away', async () => {
  assert.ok(document.querySelector('[data-testid=plan-choices]')?.textContent.includes('2 pieces left out · 1 plate excluded'));
  assert.ok(!text().includes('What to nest'), 'the steps are not on the screen when a plan is saved');
  assert.ok(!document.querySelector('[data-testid=nest-doors]'), 'nor are the two doors');
  await click(document.querySelector('[data-testid=nest-more]'), 'More');
  await waitFor(() => document.querySelector('[data-testid=more-again]'), 'the menu');
  assert.ok(document.querySelector('[data-testid=more-again]').textContent.includes('Lays out the whole line again'));
  await click(document.querySelector('[data-testid=more-again]'), 'Start again');
  await waitFor(() => find('Choose pieces and plates'), 'the steps, behind Start again');
  assert.equal(document.querySelector('#nest-start-title').textContent, 'Start again');
  await click(find('Cancel'), 'Cancel');
  await waitFor(() => !find('Start nesting'), 'the start dialog shut');
});

await check('after nesting: one summary strip, and a banner with two buttons for what is left over', async () => {
  const strip = document.querySelector('[data-testid=nest-summary]');
  assert.ok(strip, 'the strip');
  assert.equal(document.querySelector('[data-testid=summary-plates]').textContent, 'Plates1');
  assert.ok(document.querySelector('[data-testid=summary-steel]').textContent.endsWith(' t'));
  assert.ok(document.querySelector('[data-testid=summary-waste]').textContent.includes('%'));
  assert.equal(document.querySelector('[data-testid=summary-pieces]').textContent, 'Cut pieces nested3 of 7');
  const banner = document.querySelector('[data-testid=nest-left-over]');
  assert.ok(banner.textContent.includes('4 cut pieces are not nested yet'));
  assert.ok(banner.textContent.includes('CP-B') && banner.textContent.includes('×1') && banner.textContent.includes('CP-M') && banner.textContent.includes('×3'));
  assert.ok(document.querySelector('[data-testid=left-over-held]').textContent.startsWith('3 of them are held back from automatic nesting'));
  // More files first and primary; ours second; third (§61, 2026-10-14) the pieces cut from untracked offcuts.
  const [more, ours, loose] = [...banner.querySelectorAll('button')];
  assert.equal(banner.querySelectorAll('button').length, 3);
  assert.equal(loose.textContent, 'Mark the rest as cut from offcuts');
  assert.ok(more.className.includes('MuiButton-contained') && ours.className.includes('MuiButton-outlined'));
  // Nothing on this line was uploaded, so a run of ours lays the WHOLE line out again — and the button says that.
  assert.equal(ours.textContent, 'Nest the line again by AI');
  assert.equal(more.textContent, 'Upload more files');
  assert.equal(ours.disabled, false); assert.equal(more.disabled, false);
  await click(ours, 'nest ourselves');
  await waitFor(() => find('Start nesting'), 'the start dialog');
  assert.equal(document.querySelector('#nest-start-title').textContent, 'Start again');
  await click(find('Cancel'), 'Cancel');
  await waitFor(() => !find('Start nesting'), 'the start dialog shut');
});

await check('a cut piece on a plate says where its shape came from, quietly', async () => {
  await click(find('Draw the 1 plate'), 'open the group');
  await waitFor(() => find('Details'), 'the plate card');
  await click(find('Details'), 'Details');
  await waitFor(() => document.querySelector('[data-testid=shape-from]'), 'the marker');
  // Driven by the answer's `shapeFrom`, not by what the pieces look like.
  const marks = [...document.querySelectorAll('[data-testid=shape-from]')];
  assert.deepEqual(marks.map((e) => e.textContent), ['from dimensions', 'from drawing']);
  assert.deepEqual(marks.map((e) => e.getAttribute('data-shape')), ['dimensions', 'drawing']);
  // `shapeNote` is the marker's tooltip: only where the server sent one.
  assert.equal(marks[0].getAttribute('title'), 'Its rows have 2 different drawings, so it is nested as its rectangle.');
  assert.equal(marks[0].getAttribute('tabindex'), '0', 'the note can be reached by keyboard');
  assert.equal(marks[1].getAttribute('title'), null);
  // An automatic plate says so.
  assert.equal(document.querySelector('[data-testid=plate-source]').textContent, 'By AI');
  assert.equal(document.querySelector('[data-testid=plate-stale-chip]'), null, 'nothing is stale here');
  await click(find('Hide the plates'), 'shut the group');
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
