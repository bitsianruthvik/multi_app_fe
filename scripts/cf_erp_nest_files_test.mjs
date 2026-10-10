// Run from multi_app_fe: node scripts/cf_erp_nest_files_test.mjs
// Nesting v2, the customer's files (CF_ERP_NESTING_V2.md): the upload preview dialog (diff, blockers, force,
// ambiguous parts, plate picker, replace mode, left over), drop of many files, Remove plate, the plate card's
// origin line, the true-shape diagram, Nest the rest (summary + additions sent back), permission and locked states.
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
      export { NestFilesDialog } from './src/apps/cf_erp/components/Nesting/NestFilesDialog';
      export { PlateDiagram } from './src/apps/cf_erp/components/Nesting/PlateDiagram';
      export { acceptBody, restLine } from './src/apps/cf_erp/lib/nesting';`,
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
const artifact = resolve(cache, `nest-files-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const { React, createRoot, MemoryRouter, NestingPanel, NestFilesDialog, PlateDiagram, acceptBody, restLine } = await import(pathToFileURL(artifact));
await unlink(artifact);
const inRouter = (el) => React.createElement(MemoryRouter, null, el);

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); try { if (root) await React.act(async () => { root.unmount(); }); } catch { /* gone */ } root = null; document.body.innerHTML = ''; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = (ms = 30) => React.act(async () => { await sleep(ms); });
const waitFor = async (cond, what, ms = 4000) => {
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
const setSelect = async (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value').set;
  await React.act(async () => { setter.call(el, value); el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await sleep(0); });
  await settle();
};

/* ---- the contract's example payloads ------------------------------------------------------------ */
const ringPlacement = {
  partId: 'P1', cutPlateId: 116538, cutPlateCode: 'NVX-CG', x: 20, y: 20, length: 533.459, width: 422.966, rotationDeg: 17, mirrored: false,
  placedBy: 'customer', area: 137600, by: 'label', confidence: 1,
  rings: { outline: [[56.1807, 20], [553.4591, 172.0333], [345.1436, 442.9662], [20, 343.5598]], cutouts: [], holes: [] },
};
const fileRead = (filename, o = {}) => ({
  filename, bytes: 1810, hash: '7fb13f04', nestNo: 'NVX-B4', lotNo: 'NVX-B4', status: 'ok', action: 'add', units: 'mm',
  plate: { itemId: 116533, code: 'NVX-PS', thickness: 14.137, grade: 'NVX-GA', length: 3000, width: 1500, drawn: true, resolvedBy: 'size', offset: [0, 0], kerfMm: 3 },
  parts: 6, placed: 6, placements: [ringPlacement], counts: [{ cutPlateId: 116538, cutPlateCode: 'NVX-CG', qty: 6 }],
  errors: [], warnings: [], notes: ['The file does not draw the plate, so its parts are placed 3 mm in from the plate’s lower-left corner.'],
  metrics: { plateKg: 499.39, partsKg: 91.621, wasteKgTotal: 407.769, wastePct: 81.653, offcuts: 1, offcutKg: 401.706 }, ...o,
});
const totals = { plates: 5, uploadedPlates: 5, automaticPlates: 0, pieces: 39, piecesAddedByUs: 0, leftOverPieces: 4, leftOverToNest: 4 };
const leftOver = [{ cutPlateId: 116540, cutPlateCode: 'NVX-CA', qty: 4, thickness: 14.137, length: 500, width: 400, grade: 'NVX-GA', manual: false, leftOut: false }];
const answer = (o = {}) => ({
  dryRun: true, applied: false, mode: 'merge', canSave: true, needsForce: false, engine: 'shapePacker',
  files: [fileRead('NVX-B4_14.137mm_3000x1500.dxf')], problems: [], problemList: [], warnings: [], warningList: [],
  diff: {
    added: [{ lotNo: 'NVX-B1', filename: 'NVX-B1_14.137mm_3000x1500.dxf', plateCode: 'NVX-PS', pieces: 14, parts: [{ cutPlateId: 116550, cutPlateCode: 'NVX-CR', qty: 2 }] }],
    replaced: [{
      lotId: 5938, lotNo: 'NVX-B2', newLotNo: 'NVX-B2', filename: 'NVX-B2_14.137mm_3000x1500.dxf',
      was: { plateCode: 'NVX-PS', pieces: 20 }, now: { plateCode: 'NVX-PS', pieces: 14 },
      parts: [{ cutPlateId: 116550, cutPlateCode: 'NVX-CR', was: 5, now: 3, change: -2 }], moved: 13, added: 0, removed: 0,
      droppedOurs: [{ cutPlateId: 116540, cutPlateCode: 'NVX-CA', qty: 4 }],
    }],
    unchanged: [{ lotId: 5928, lotNo: 'NVX-B5', filename: 'NVX-B5.dxf', plateCode: 'NVX-PS', pieces: 14 }],
    removed: [{ lotId: 5930, lotNo: 'NVX-B3', origin: 'imported', filename: 'NVX-B3_14.137mm_3000x1500.dxf', plateCode: 'NVX-PS', pieces: 9, parts: [] }],
    droppedAuto: [], droppedOurs: [], renumbered: [],
  },
  coverage: [], leftOver, surplus: [], totals, message: '5 files read; plates: 5 added, 2 removed.', ...o,
});

/* ---- the stub server ------------------------------------------------------------------------------ */
const posts = [];
const calls = [];
let next = () => answer();
let delPayload = null;
let infoNow = null;
let planNow = null;
let runNow = { status: 'none' };
const metrics = { lots: 0, plates: 0, pieces: 0, areaBought: 0, usedArea: 0, wasteArea: 0, wastePct: 0, weightKg: 0, wasteKg: 0, thickness: null };
const piece = (id, code, x, y, l, w, extra = {}) => ({ id, cutPlateId: 116550, cutPlateCode: code, seqNo: 1, rowNo: 1, posNo: id, x, y, length: l, width: w, rotated: false, rotationDeg: 0, mirrored: false, placedBy: 'customer', ...extra });
const customerNest = (extra = {}) => ({
  id: 5928, lotNo: 'N12', plateItemId: 116533, plateCode: 'NVX-PS', plateName: 'PS', source: 'catalog', thickness: 14, grade: 'G', material: 'MS', density: 7850,
  length: 3000, width: 1500, requiredLength: null, requiredWidth: null, sheetArea: 4500000, usedArea: 1000000, wasteArea: 0, wastePct: 10, weightKg: 500, wasteKg: 50,
  sequences: [], pieces: [piece(1, 'NVX-CR', 20, 20, 1200, 400), piece(2, 'NVX-CR', 20, 450, 1200, 400)], origin: 'imported', verdict: 'fits', hasLayout: true,
  sourceKind: 'dxf', sourceFile: 'N12.dxf', layoutOrigin: 'customer', ...extra,
});
const autoNest = () => ({ ...customerNest({ id: 5999, lotNo: 'N-001', origin: 'auto', sourceKind: null, sourceFile: null, layoutOrigin: 'ours' }) });
const planWith = (nests, extra = {}) => ({
  line: { id: 1, lineNo: 1, orderId: 1, orderCode: 'SO-1', quantity: 1, orderStatus: 'draft' }, saved: true, basis: 'saved plan', manual: [], sizeAdvice: [], problems: [],
  groups: [{ key: 'g1', nests, unplaced: [], candidates: [], metrics: { ...metrics, plates: nests.length, pieces: 2 }, kerfMm: 3, seqGapMinMm: 10, seqGapMaxMm: 20, settingsBasis: '',
    cutPlates: [{ id: 116550, code: 'NVX-CR', name: 'CR', pieces: 2, length: 1200, width: 400, thickness: 14 }] }],
  totals: { ...metrics, plates: nests.length, pieces: 2, groups: 1, unplaced: 0 }, ...extra,
});
const info = (o = {}) => ({
  line: { id: 1, lineNo: 1, orderId: 1, orderCode: 'SO-1' }, canUpload: true, readOnlyReason: null, limits: { maxFiles: 200, maxFileBytes: 4194304, kinds: ['dxf'] },
  plates: [{ lotId: 5928, lotNo: 'N12', origin: 'imported', sourceKind: 'dxf', layoutOrigin: 'customer', plateCode: 'NVX-PS', length: 3000, width: 1500, pieces: 2, customerPieces: 2, ourPieces: 0, file: { id: 1, filename: 'N12.dxf', nestNo: 'N12' }, parts: [] }],
  coverage: [], leftOver, totals, ...o,
});
const reply = (out) => ({ ok: true, status: 200, text: async () => JSON.stringify(out) });
globalThis.fetch = async (url, o = {}) => {
  const method = o.method || 'GET';
  const u = String(url);
  calls.push(`${method} ${u}`);
  const body = o.body ? JSON.parse(o.body) : null;
  if (u.endsWith('/nesting/files') && method === 'POST') { posts.push(body); return reply(next(body)); }
  if (u.endsWith('/nesting/files')) return reply(infoNow ?? info());
  if (/\/nesting\/lots\/\d+$/.test(u) && method === 'DELETE') return reply(delPayload);
  if (u.includes('/nesting/runs/current')) return reply(runNow);
  if (u.endsWith('/nesting/accept') && method === 'POST') { posts.push({ accept: body }); return reply({ plates: 1, pieces: 3, replacedLots: 0, lots: 1, additions: { lots: 1, pieces: 2, rewrittenLots: 1 } }); }
  if (u.includes('/nesting/choices')) return { ok: false, status: 404, text: async () => '{}' };
  if (u.includes('/costs')) return reply({ lines: [] });
  if (u.endsWith('/nesting')) return reply(planNow ?? planWith([customerNest()]));
  return reply(planNow ?? planWith([customerNest()]));
};

let root = null;
const host = () => { const d = document.createElement('div'); document.body.appendChild(d); return d; };
const mountEl = async (el) => { root = createRoot(host()); await React.act(async () => { root.render(el); await sleep(0); }); };
const unmount = async () => { if (root) await React.act(async () => { root.unmount(); }); root = null; document.body.innerHTML = ''; };
const uploads = (...names) => names.map((n) => ({ filename: n, file: Buffer.from(`0\nSECTION ${n}`).toString('base64') }));
const dialog = (over = {}) => React.createElement(NestFilesDialog, {
  open: true, orderId: 1, lineId: 1, uploads: uploads('NVX-B4_14.137mm_3000x1500.dxf'), onClose: () => {}, onSaved: () => {}, onCompare: () => {}, ...over,
});
const mountPanel = async (props = {}) => mountEl(inRouter(React.createElement(NestingPanel, { orderId: 1, lineId: 1, canManage: true, ...props })));
const reset = () => { posts.length = 0; calls.length = 0; next = () => answer(); infoNow = null; planNow = null; runNow = { status: 'none' }; delPayload = null; };
const saveBtn = () => buttons().find((b) => ['Save', 'Save anyway'].includes(b.textContent.trim()));

await check('the preview is a dry run, and shows the diff: added, replaced, unchanged, removed', async () => {
  reset();
  await mountEl(dialog());
  await waitFor(() => document.querySelector('[data-testid=nest-diff]'), 'the diff');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].dryRun, true);
  assert.equal(posts[0].mode, 'merge');
  assert.equal(posts[0].files.length, 1);
  assert.equal(posts[0].files[0].filename, 'NVX-B4_14.137mm_3000x1500.dxf');
  assert.ok(posts[0].files[0].file.length > 10, 'base64 body');
  const diff = document.querySelector('[data-testid=nest-diff]').textContent;
  for (const w of ['Added 1', 'Replaced 1', 'Unchanged 1', 'Removed 1']) assert.ok(diff.includes(w), w);
  assert.ok(diff.includes('NVX-B1 is new') && diff.includes('NVX-B2 is replaced') && diff.includes('NVX-B3 is removed') && diff.includes('NVX-B5 is unchanged'));
  assert.ok(diff.includes('was 20 pieces, now 14') && diff.includes('13 moved'));
  assert.ok(diff.includes('NVX-CR 5 → 3'), 'what changed on the replaced plate');
  assert.ok(diff.includes('Our additions on this plate are dropped: NVX-CA ×4'));
  assert.ok(document.querySelector('[data-testid=nest-files-status]').textContent.includes('5 files read; plates: 5 added, 2 removed.'));
  assert.equal(saveBtn().textContent.trim(), 'Save');
  assert.equal(saveBtn().disabled, false);
  await unmount();
});

await check('each file shows its plate, parts matched and notes; the layout opens as a drawing', async () => {
  reset();
  await mountEl(dialog());
  await waitFor(() => document.querySelector('[data-testid=nest-file]'), 'a file row');
  const row = document.querySelector('[data-testid=nest-file]').textContent;
  assert.ok(row.includes('NVX-PS') && row.includes('3,000 × 1,500') && row.includes('found by size'));
  assert.ok(row.includes('Parts matched 6 of 6') && row.includes('New plate'));
  assert.ok(row.includes('The file does not draw the plate'));
  await click(find('Show the layout'), 'layout toggle');
  assert.ok(document.querySelector('[data-testid=nest-file] svg[role=img] path[data-part=shape]'), 'the customer part is drawn by its true shape');
  await unmount();
});

await check('a blocker disables Save and shows the backend sentence under its file', async () => {
  reset();
  const sentence = 'NVX-X1_14.137mm.dxf, plate NVX-PS: NVX-CR at (100, 100) and NVX-CR at (700, 300) overlap — two parts cannot be cut from the same steel.';
  next = () => answer({
    canSave: false, problems: [sentence], problemList: [{ code: 'OVERLAP', message: sentence, partId: 'P1' }],
    files: [fileRead('NVX-X1_14.137mm.dxf', { status: 'error', action: null, errors: [{ code: 'OVERLAP', message: sentence, partId: 'P1' }] })],
  });
  await mountEl(dialog({ uploads: uploads('NVX-X1_14.137mm.dxf') }));
  await waitFor(() => document.querySelector('[data-testid=nest-files-blocked]'), 'the blocked note');
  assert.ok(text().includes(sentence), 'the sentence as given');
  assert.equal(saveBtn().disabled, true, 'Save is disabled while blocked');
  assert.ok(find('Close'));
  await unmount();
});

await check('a warning that needs force turns Save into Save anyway, and the save sends force', async () => {
  reset();
  const w = 'NVX-X2.dxf, plate NVX-PS: NVX-CH at (1300, 100) and NVX-CH at (1601.5, 100) are 1.5 mm apart — closer than the 3 mm kerf we cut 14.137 mm plate with. The customer’s program may use another kerf — save anyway to keep the layout as drawn.';
  let saved = false;
  next = (body) => {
    if (body.dryRun === false) { saved = true; return answer({ dryRun: false, applied: true, needsForce: true, message: 'Saved 1 plate.', warnings: [w] }); }
    return answer({ needsForce: true, warnings: [w], warningList: [{ code: 'TOO_CLOSE', needsForce: true, message: w }], files: [fileRead('NVX-X2.dxf', { status: 'warning', warnings: [{ code: 'TOO_CLOSE', needsForce: true, message: w, pairs: [{ a: 'P1', b: 'P2', distance: 1.5, text: '1.5 mm apart' }] }] })] });
  };
  const got = [];
  await mountEl(dialog({ uploads: uploads('NVX-X2.dxf'), onSaved: (r) => got.push(r) }));
  await waitFor(() => saveBtn(), 'Save anyway');
  assert.equal(saveBtn().textContent.trim(), 'Save anyway');
  assert.equal(saveBtn().disabled, false);
  assert.ok(text().includes(w), 'the warning sentence');
  await click(saveBtn(), 'Save anyway');
  await waitFor(() => saved, 'the save');
  const last = posts[posts.length - 1];
  assert.equal(last.dryRun, false);
  assert.equal(last.force, true);
  await waitFor(() => document.querySelector('[data-testid=nest-files-saved]'), 'the saved note');
  assert.equal(got.length, 1);
  assert.ok(find('Compare with auto nesting'), 'the comparison is offered right after the save');
  await unmount();
});

await check('a plain Save sends no force', async () => {
  reset();
  next = (body) => (body.dryRun === false ? answer({ dryRun: false, applied: true }) : answer());
  await mountEl(dialog());
  await waitFor(() => saveBtn(), 'Save');
  await click(saveBtn(), 'Save');
  await waitFor(() => posts.some((p) => p.dryRun === false), 'the save');
  const last = posts[posts.length - 1];
  assert.equal(last.force, undefined);
  await unmount();
});

await check('an ambiguous part gets a chooser; choosing re-sends the dry run with choices', async () => {
  reset();
  const msg = 'NVX-X5.dxf, plate NVX-PS, part P2 at (1500, 100): it could be NVX-CX1 (14.137 mm NVX-GA) and NVX-CX2 (14.137 mm NVX-GA) — they are the same shape. Say which (choices), or label the part in the file.';
  const choices = [{ key: 'cp116552', cutPlateId: 116552, code: 'NVX-CX1', thickness: 14.137, grade: 'NVX-GA' }, { key: 'cp116553', cutPlateId: 116553, code: 'NVX-CX2', thickness: 14.137, grade: 'NVX-GA' }];
  next = (body) => {
    if (body.choices?.['NVX-X5.dxf']?.P2) return answer({ files: [fileRead('NVX-X5.dxf')] });
    return answer({ canSave: false, problems: [msg], problemList: [{ code: 'PART_AMBIGUOUS', message: msg, partId: 'P2', choices }],
      files: [fileRead('NVX-X5.dxf', { status: 'error', errors: [{ code: 'PART_AMBIGUOUS', message: msg, partId: 'P2', choices }] })] });
  };
  await mountEl(dialog({ uploads: uploads('NVX-X5.dxf') }));
  await waitFor(() => document.querySelector('[data-testid=part-chooser] select'), 'the chooser');
  assert.ok(text().includes(msg));
  const sel = document.querySelector('[data-testid=part-chooser] select');
  assert.ok([...sel.options].some((o) => o.textContent.startsWith('NVX-CX2')));
  const before = posts.length;
  await setSelect(sel, 'cp116553');
  await waitFor(() => posts.length > before, 'a second dry run');
  assert.equal(posts[posts.length - 1].dryRun, true);
  assert.deepEqual(posts[posts.length - 1].choices, { 'NVX-X5.dxf': { P2: 'cp116553' } });
  await waitFor(() => saveBtn(), 'Save enabled once settled');
  assert.ok(document.querySelector('[data-testid=part-chooser] select'), 'the chooser stays, so the choice can be changed');
  await unmount();
});

await check('an ambiguous plate gets a picker; choosing sends plateCode for that file only', async () => {
  reset();
  const msg = 'NVX-Y.dxf: 3000 × 1500 is 2 catalog plates (A, B) — name the one you mean (plateCode).';
  next = (body) => {
    const f = body.files.find((x) => x.filename === 'NVX-Y.dxf');
    if (f?.plateCode) return answer({ files: [fileRead('NVX-Y.dxf'), fileRead('NVX-Z.dxf')] });
    return answer({ canSave: false, problems: [msg], problemList: [{ code: 'PLATE_AMBIGUOUS', message: msg, choices: ['A', 'B'] }],
      files: [fileRead('NVX-Y.dxf', { status: 'error', plate: null, placed: 0, errors: [{ code: 'PLATE_AMBIGUOUS', message: msg, choices: ['A', 'B'] }] }), fileRead('NVX-Z.dxf')] });
  };
  await mountEl(dialog({ uploads: uploads('NVX-Y.dxf', 'NVX-Z.dxf') }));
  await waitFor(() => document.querySelector('[data-testid=plate-picker] select'), 'the plate picker');
  assert.ok(text().includes('No plate found yet'));
  const before = posts.length;
  await setSelect(document.querySelector('[data-testid=plate-picker] select'), 'B');
  await waitFor(() => posts.length > before, 'a second dry run');
  const last = posts[posts.length - 1];
  assert.equal(last.files.find((f) => f.filename === 'NVX-Y.dxf').plateCode, 'B');
  assert.equal(last.files.find((f) => f.filename === 'NVX-Z.dxf').plateCode, undefined);
  await unmount();
});

await check('a plate the catalog does not have gets a typed plate code', async () => {
  reset();
  const msg = 'NVX-N.dxf: no catalog plate is 2750 × 1300. Add it to the catalog, or name the plate you mean (plateCode).';
  next = (body) => (body.files[0].plateCode
    ? answer({ files: [fileRead('NVX-N.dxf')] })
    : answer({ canSave: false, problems: [msg], problemList: [{ code: 'PLATE_NOT_FOUND', message: msg }], files: [fileRead('NVX-N.dxf', { status: 'error', plate: null, errors: [{ code: 'PLATE_NOT_FOUND', message: msg }] })] }));
  await mountEl(dialog({ uploads: uploads('NVX-N.dxf') }));
  await waitFor(() => document.querySelector('[data-testid=plate-picker] input'), 'the plate code box');
  const input = document.querySelector('[data-testid=plate-picker] input');
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await React.act(async () => { setter.call(input, 'NVX-PS'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(0); });
  await click(find('Use this plate'), 'Use this plate');
  await waitFor(() => posts.some((p) => p.files[0].plateCode === 'NVX-PS'), 'the re-run with plateCode');
  await unmount();
});

await check('Replace everything is a switch with a clear warning, and sends mode replace', async () => {
  reset();
  await mountEl(dialog());
  await waitFor(() => document.querySelector('[data-testid=mode-line]'), 'the mode line');
  assert.ok(!document.querySelector('[data-testid=mode-line]').textContent.includes('will be removed'));
  const sw = document.querySelector('input[aria-label="Replace everything with these files"]');
  assert.ok(sw);
  const before = posts.length;
  await click(sw, 'the switch');
  await waitFor(() => posts.length > before, 'the re-run');
  assert.equal(posts[posts.length - 1].mode, 'replace');
  assert.ok(document.querySelector('[data-testid=mode-line]').textContent.includes('will be removed. Their pieces go back to left over.'));
  await unmount();
});

await check('the left-over list names the cut plate and quantity, and says Nest the rest will place them', async () => {
  reset();
  await mountEl(dialog());
  await waitFor(() => document.querySelector('[data-testid=nest-leftover]'), 'left over');
  const t = document.querySelector('[data-testid=nest-leftover]').textContent;
  assert.ok(t.includes('Left over (4)') && t.includes('NVX-CA') && t.includes('×4'));
  assert.ok(t.includes('Nest the rest will place them (4 of them)'));
  await unmount();
});

await check('dropping 3 DXF files on the panel sends them in ONE request (a dry run first)', async () => {
  reset();
  await mountPanel();
  await waitFor(() => document.querySelector('[data-testid=nest-drop-zone]') && find('Upload nesting files'), 'the panel');
  const zone = document.querySelector('[data-testid=nest-drop-zone]');
  const files = [1, 2, 3].map((i) => new dom.window.File([`0\nSECTION ${i}`], `N${i}.dxf`));
  const ev = new dom.window.Event('drop', { bubbles: true, cancelable: true });
  ev.dataTransfer = { types: ['Files'], files };
  await React.act(async () => { zone.dispatchEvent(ev); await sleep(0); });
  await waitFor(() => posts.length >= 1, 'the upload request', 5000);
  assert.equal(posts.length, 1, 'one request');
  assert.deepEqual(posts[0].files.map((f) => f.filename), ['N1.dxf', 'N2.dxf', 'N3.dxf']);
  assert.equal(posts[0].dryRun, true);
  await unmount();
});

await check('dropping something that is not a DXF says so and sends nothing', async () => {
  reset();
  await mountPanel();
  await waitFor(() => find('Upload nesting files'), 'the panel');
  const zone = document.querySelector('[data-testid=nest-drop-zone]');
  const ev = new dom.window.Event('drop', { bubbles: true, cancelable: true });
  ev.dataTransfer = { types: ['Files'], files: [new dom.window.File(['x'], 'sheet.xlsx')] };
  await React.act(async () => { zone.dispatchEvent(ev); await sleep(0); });
  await waitFor(() => text().includes('Drop DXF files here. For an Excel sheet, use Upload Excel.'), 'the hint');
  assert.equal(posts.length, 0);
  await unmount();
});

await check('the button takes many files at once', async () => {
  reset();
  await mountPanel();
  await waitFor(() => document.querySelector('[data-testid=nest-files-input]'), 'the input');
  const input = document.querySelector('[data-testid=nest-files-input]');
  assert.equal(input.multiple, true);
  assert.equal(input.getAttribute('accept'), '.dxf');
  assert.ok(find('Upload Excel'), 'Excel upload is kept');
  await unmount();
});

await check('a saved plate says where its layout came from, shows our additions apart, and offers Remove', async () => {
  reset();
  planNow = planWith([customerNest({ pieces: [piece(1, 'NVX-CR', 20, 20, 1200, 400), piece(2, 'NVX-CR', 20, 450, 1200, 400, { placedBy: 'ours' })] }), autoNest()]);
  await mountPanel();
  await waitFor(() => find('Draw the 2 plates'), 'the group');
  await click(find('Draw the 2 plates'), 'open group');
  await waitFor(() => document.querySelector('[data-testid=plate-origin]'), 'the origin line');
  assert.equal(document.querySelector('[data-testid=plate-origin]').textContent, "Customer's layout · N12.dxf");
  assert.ok(text().includes('1 added by us'));
  assert.ok(document.querySelector('svg[role=img] [data-by=ours]'), 'our part is marked');
  assert.ok(document.querySelector('svg[role=img] [data-by=customer]'));
  assert.ok(text().includes('Added by us') && text().includes("Customer's part"), 'the legend');
  assert.ok(find('Remove plate'));
  assert.ok(find('Customer’s file'));
  const thumbs = [...document.querySelectorAll('[data-testid=plate-thumbs] button')];
  await click(thumbs[1], 'the automatic plate');
  await waitFor(() => document.querySelector('[data-testid=plate-origin]').textContent === 'Nested here', 'Nested here');
  assert.ok(!find('Remove plate'), 'an automatic plate has no Remove');
  await unmount();
});

await check('Remove plate confirms, calls DELETE, refreshes, and says what goes back to left over', async () => {
  reset();
  delPayload = { applied: true, message: 'N12 is off the line; 2 pieces go back to be nested.', removed: { lotId: 5928, lotNo: 'N12', filename: 'N12.dxf', plateCode: 'NVX-PS', pieces: 2, parts: [{ cutPlateCode: 'NVX-CR', qty: 2 }] }, totals };
  await mountPanel();
  await waitFor(() => find('Draw the 1 plate'), 'the group');
  await click(find('Draw the 1 plate'), 'open group');
  await waitFor(() => find('Remove plate'), 'Remove');
  await click(find('Remove plate'), 'Remove');
  await waitFor(() => document.querySelector('[data-testid=remove-text]'), 'the confirmation');
  const t = document.querySelector('[data-testid=remove-text]').textContent;
  assert.ok(t.includes('Its 2 pieces go back to left over') && t.includes('NVX-CR ×2'));
  const plansBefore = calls.filter((c) => c.startsWith('GET') && c.endsWith('/nesting')).length;
  assert.ok(!calls.some((c) => c.startsWith('DELETE')), 'nothing yet');
  const confirmBtn = buttons().filter((b) => b.textContent.trim() === 'Remove plate').pop();
  await click(confirmBtn, 'confirm');
  await waitFor(() => calls.some((c) => c.startsWith('DELETE') && c.endsWith('/nesting/lots/5928')), 'the DELETE');
  await waitFor(() => calls.filter((c) => c.startsWith('GET') && c.endsWith('/nesting')).length > plansBefore, 'a refresh');
  await unmount();
});

await check('the diagram draws a path with a cut-out and a hole for a ring part, a rect for a plain one, and marks ours', async () => {
  const rings = { outline: [[100, 100], [900, 100], [900, 600], [100, 600]], cutouts: [[[300, 250], [700, 250], [700, 450], [300, 450]]], holes: [{ cx: 200, cy: 200, d: 26 }] };
  const nest = customerNest({ pieces: [
    piece(1, 'NVX-CG', 100, 100, 800, 500, { rings }),
    piece(2, 'NVX-CR', 1000, 100, 1200, 400),
    piece(3, 'NVX-CR', 1000, 600, 1200, 400, { placedBy: 'ours' }),
  ] });
  await mountEl(React.createElement(PlateDiagram, { nest, kerfMm: 3 }));
  await settle();
  const shape = document.querySelectorAll('svg[role=img] path[data-part=shape]');
  assert.equal(shape.length, 1, 'one path for the whole ring part');
  const d = shape[0].getAttribute('d');
  assert.equal((d.match(/M/g) ?? []).length, 3, 'outline + cut-out + hole');
  assert.ok(d.includes('a13,13'), 'the hole is a circle of d/2');
  assert.equal(shape[0].getAttribute('fill-rule'), 'evenodd');
  assert.ok(d.startsWith('M100,1400'), 'y is flipped to plate height');
  assert.equal(document.querySelectorAll('svg[role=img] rect[data-part=rect]').length, 2);
  const ours = document.querySelector('svg[role=img] [data-by=ours]');
  assert.ok(ours && ours.getAttribute('stroke-dasharray'), 'ours is dashed');
  assert.ok(text().includes('Added by us'));
  await unmount();
});

await check('300 drawn parts stay one path each', async () => {
  const rings = (x, y) => ({ outline: [[x, y], [x + 40, y], [x + 40, y + 40], [x, y + 40]], cutouts: [], holes: [{ cx: x + 20, cy: y + 20, d: 10 }] });
  const pieces = [];
  for (let i = 0; i < 300; i++) pieces.push(piece(i + 1, 'NVX-CG', (i % 30) * 90, Math.floor(i / 30) * 90, 40, 40, { rings: rings((i % 30) * 90, Math.floor(i / 30) * 90) }));
  await mountEl(React.createElement(PlateDiagram, { nest: customerNest({ pieces }), kerfMm: 3 }));
  await settle();
  assert.equal(document.querySelectorAll('svg[role=img] path[data-part=shape]').length, 300);
  assert.equal(document.querySelectorAll('svg[role=img] circle').length, 0, 'no per-hole elements');
  await unmount();
});

await check('Nest the rest says where each piece went, marks the plates, and Accept sends the additions back', async () => {
  reset();
  const rest = { pieces: [{ cutPlateId: 116538, cutPlateCode: 'NVX-CG', qty: 6, onExisting: [{ lotNo: 'N12', lotId: 5928, qty: 1 }, { lotNo: 'N13', lotId: 5935, qty: 4 }], onNew: [{ lotNo: 'N-001', qty: 1 }], unplaced: 0 }], onExisting: 5, onNew: 1, unplaced: 0, existingPlatesUsed: 2 };
  const additions = [{ lotId: 5928, lotNo: 'N12', plateItemId: 116533, plateCode: 'NVX-PS', length: 3000, width: 1500, layoutOrigin: 'customer', sourceFile: 'N12.dxf', kerfMm: 3, customerPieces: 2,
    pieces: [piece(9, 'NVX-CG', 20, 900, 500, 400, { placedBy: 'ours', id: undefined })] }];
  const proposal = planWith([autoNest()], { saved: false, basis: 'proposal', additions, rest });
  runNow = {
    runId: 'r1', lineId: 1, status: 'done', phase: 'done', progress: { done: 10, total: 10, pct: 100 }, startedAt: '2026-10-10T10:00:00Z', startedBy: 'Asha', finishedAt: null,
    elapsedMs: 100, budgetMs: 300000, effort: 'standard', log: [], error: null, summary: { plates: 1, pieces: 6, wastePct: 5, problems: 0 }, plan: proposal,
  };
  await mountPanel();
  await waitFor(() => document.querySelector('[data-testid=nest-rest]'), 'the rest summary');
  assert.ok(document.querySelector('[data-testid=nest-rest]').textContent.includes("5 on the customer's plates (2), 1 on new plates"));
  await click(find('Where each piece goes'), 'details');
  assert.ok(text().includes("1 on the customer's N12") && text().includes('4 on the customer’s N13'.replace('’', "'")) && text().includes('1 on new plate N-001'));
  assert.ok(document.querySelector('[data-testid=nest-addition]').textContent.includes('Gets more pieces'));
  await click(find('Accept this layout'), 'accept');
  await waitFor(() => posts.some((p) => p.accept), 'the accept');
  const body = posts.find((p) => p.accept).accept;
  assert.equal(body.additions.length, 1);
  assert.equal(body.additions[0].lotId, 5928);
  assert.equal(body.additions[0].pieces[0].placedBy, 'ours');
  assert.ok(Array.isArray(body.nests), 'the new plates go too');
  await unmount();
});

await check('helpers: acceptBody carries no additions when there are none; restLine reads plainly', async () => {
  assert.equal(acceptBody(planWith([autoNest()])).additions, undefined);
  assert.equal(restLine(null), null);
  assert.equal(restLine({ pieces: [], onExisting: 2, onNew: 0, unplaced: 1, existingPlatesUsed: 1 }), "The left-over pieces: 2 on the customer's plate (1), 0 on new plates. 1 could not be placed.");
});

await check('without the sales-order grant the upload is disabled and says why', async () => {
  reset();
  await mountPanel({ canManage: false });
  await waitFor(() => find('Upload nesting files'), 'the button');
  const b = find('Upload nesting files');
  assert.equal(b.disabled, true);
  assert.ok(b.parentElement.getAttribute('aria-label').includes('your role cannot change the order'));
  await unmount();
});

await check('a locked, released or unfrozen line uses the reason the backend gives', async () => {
  reset();
  infoNow = info({ canUpload: false, readOnlyReason: 'This line is released. Nesting cannot change now.' });
  await mountPanel();
  await waitFor(() => find('Upload nesting files') && find('Upload nesting files').disabled, 'a disabled button');
  assert.equal(find('Upload nesting files').parentElement.getAttribute('aria-label'), 'This line is released. Nesting cannot change now.');
  await waitFor(() => find('Draw the 1 plate'), 'the group');
  await click(find('Draw the 1 plate'), 'open group');
  assert.ok(!find('Remove plate'), 'no Remove on a locked line');
  await unmount();
});

await check('a free-layout plate shows its cut order and never says sequence, row, NaN or undefined', async () => {
  reset();
  const free = customerNest({
    id: 5990, lotNo: 'N-FREE', origin: 'auto', sourceKind: null, sourceFile: null, layoutOrigin: 'ours', layout: 'free', sequences: [],
    wasteKg: { kerf: 10, sequenceGaps: 0, rim: 5, offcut: 100, wastage: 20 }, weightKg: 500, partsKg: 365,
    pieces: [piece(1, 'NVX-CR', 20, 20, 1200, 400, { placedBy: 'ours' }), piece(2, 'NVX-CR', 20, 450, 1200, 400, { placedBy: 'ours' }), piece(3, 'NVX-CR', 1300, 20, 1200, 400, { placedBy: 'ours' })],
    rules: { status: 'ok', utilisationPct: 60, sharedCuts: 0, sharedLengthMm: 0, checks: [{ key: 'freeLayout', ok: true, label: 'Free layout', detail: 'Laid out by true shape.' }] },
  });
  planNow = planWith([free]);
  await mountPanel();
  await waitFor(() => find('Draw the 1 plate'), 'the group');
  await click(find('Draw the 1 plate'), 'open group');
  await waitFor(() => document.querySelector('[data-testid=plate-origin]'), 'the plate');
  assert.ok(document.querySelector('svg[role=img] [data-cut-order="1"]'), 'cut order 1 is written on the first part');
  assert.ok(document.querySelector('svg[role=img] [data-cut-order="3"]'));
  assert.match(document.querySelector('svg[role=img]').getAttribute('aria-label'), /cut in order along the plate/);
  assert.ok([...document.querySelectorAll('svg[role=img] title')].some((t) => t.textContent.includes('cut 1 of 3')), 'the tooltip says the cut order');
  await click(find('Details'), 'Details');
  assert.ok(text().includes('Cut order: 1 to 3, along the plate'));
  const t = document.body.textContent;
  const bare = t.replace('This plate has no rows or sequences.', '');
  assert.ok(!/sequences?/i.test(bare), 'no sequence wording');
  assert.ok(!/\brow\b/i.test(t.replace('This plate has no rows or sequences.', '')), 'no row wording');
  for (const bad of ['undefined', 'NaN']) assert.ok(!t.includes(bad), `no ${bad} on screen`);
  assert.ok(!t.includes('Sequence gaps'), 'the sequence-gap cause is dropped when there is none');
  await unmount();
});

await check('a row layout keeps its sequences and its sequence-gap cause', async () => {
  reset();
  const rows = customerNest({ id: 5991, lotNo: 'N-ROW', origin: 'auto', sourceKind: null, sourceFile: null, layoutOrigin: 'ours', layout: null,
    wasteKg: { kerf: 10, sequenceGaps: 8, rim: 5, offcut: 100, wastage: 20 }, weightKg: 500,
    sequences: [{ seqNo: 1, rows: 1, rowsAllowed: 3, pieces: 2, size: 'big' }] });
  planNow = planWith([rows]);
  await mountPanel();
  await waitFor(() => find('Draw the 1 plate'), 'the group');
  await click(find('Draw the 1 plate'), 'open group');
  await waitFor(() => document.querySelector('[data-testid=plate-origin]'), 'the plate');
  assert.ok(text().includes('Sequence gaps'));
  assert.ok(document.querySelector('svg[role=img] [data-cut-order]') == null);
  await unmount();
});

await check('a part across the plate edge is drawn in the error colour, listed, and not counted', async () => {
  reset();
  const msg = 'NVX-OUT.dxf, plate NVX-PS: NVX-CR at (2400, 600), 1200 × 400, runs off the plate by 600 mm, which is 3000 × 1500. It is not counted as nested.';
  const out = { partId: 'P7', cutPlateId: 116550, cutPlateCode: 'NVX-CR', x: 2400, y: 600, length: 1200, width: 400, placedBy: 'customer' };
  next = () => answer({
    canSave: false, problems: [msg], problemList: [{ code: 'OUTSIDE_PLATE', message: msg, partId: 'P7', cutPlateId: 116550, cutPlateCode: 'NVX-CR' }],
    files: [fileRead('NVX-OUT.dxf', { status: 'error', parts: 7, placed: 6, placements: [ringPlacement, out],
      errors: [{ code: 'OUTSIDE_PLATE', message: msg, partId: 'P7', cutPlateId: 116550, cutPlateCode: 'NVX-CR' }] })],
  });
  await mountEl(dialog({ uploads: uploads('NVX-OUT.dxf') }));
  await waitFor(() => document.querySelector('[data-testid=file-outside]'), 'the outside line');
  assert.ok(text().includes(msg), 'the sentence as given');
  assert.ok(document.querySelector('[data-testid=file-outside]').textContent.includes('1 part runs off the plate and is not counted as nested: NVX-CR.'));
  assert.ok(text().includes('Parts matched 6 of 7'));
  await click(find('Show the layout'), 'layout');
  const bad = document.querySelector('svg[role=img] [data-part=rect]');
  assert.ok(bad && bad.getAttribute('fill').includes('danger'), 'drawn in the error colour');
  assert.ok(text().includes('Off the plate'), 'legend entry');
  await unmount();
});

await check('scrap between parts is drawn and said; a shape taken from the nesting file is noted', async () => {
  reset();
  const kept = { ...ringPlacement, partId: 'P3', shapeFrom: 'nesting file' };
  next = () => answer({
    files: [fileRead('NVX-S.dxf', { placements: [ringPlacement, kept], scrap: [{ partId: 'S1', x: 900, y: 900, length: 80, width: 60 }],
      notes: ['A closed area between common-cut parts matches no cut plate, so it is scrap.'] })],
  });
  await mountEl(dialog({ uploads: uploads('NVX-S.dxf') }));
  await waitFor(() => document.querySelector('[data-testid=file-scrap]'), 'the scrap line');
  assert.ok(document.querySelector('[data-testid=file-scrap]').textContent.includes('1 area between parts is scrap, not a part.'));
  assert.ok(document.querySelector('[data-testid=file-shape-kept]').textContent.includes('1 part keeps the shape taken from the nesting file.'));
  await click(find('Show the layout'), 'layout');
  assert.equal(document.querySelectorAll('svg[role=img] rect[data-scrap]').length, 1);
  assert.ok(text().includes('Scrap between parts'));
  assert.ok([...document.querySelectorAll('svg[role=img] title')].some((t) => t.textContent.includes('Shape taken from the nesting file')));
  await unmount();
});

await check('RUN_BUSY is shown in the backend words and nothing is saved', async () => {
  reset();
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, o = {}) => {
    const body = o.body ? JSON.parse(o.body) : null;
    if (String(url).endsWith('/nesting/files') && body?.dryRun === false) return { ok: false, status: 422, text: async () => JSON.stringify({ code: 'RUN_BUSY', message: 'A nesting run is working on this line. Wait for it to finish, then save the files.' }) };
    return orig(url, o);
  };
  await mountEl(dialog());
  await waitFor(() => saveBtn() && !saveBtn().disabled, 'Save');
  await click(saveBtn(), 'Save');
  await waitFor(() => document.querySelector('[data-testid=nest-files-error]'), 'the refusal');
  assert.ok(document.querySelector('[data-testid=nest-files-error]').textContent.includes('A nesting run is working on this line.'));
  assert.ok(!find('Reload'), 'RUN_BUSY has nothing to reload');
  assert.ok(!document.querySelector('[data-testid=nest-files-saved]'));
  globalThis.fetch = orig;
  await unmount();
});

await check('409 CHANGED_MEANWHILE offers Reload, which reads the files again', async () => {
  reset();
  const orig = globalThis.fetch;
  let refuse = true;
  globalThis.fetch = async (url, o = {}) => {
    const body = o.body ? JSON.parse(o.body) : null;
    if (String(url).endsWith('/nesting/files') && body?.dryRun === false && refuse) {
      refuse = false;
      return { ok: false, status: 409, text: async () => JSON.stringify({ code: 'CHANGED_MEANWHILE', message: 'The plates on this line changed while this was being worked out. Look at the line again, then save again.' }) };
    }
    return orig(url, o);
  };
  await mountEl(dialog());
  await waitFor(() => saveBtn() && !saveBtn().disabled, 'Save');
  await click(saveBtn(), 'Save');
  await waitFor(() => find('Reload'), 'Reload');
  assert.ok(text().includes('changed while this was being worked out'));
  const before = posts.filter((x) => x.dryRun === true).length;
  await click(find('Reload'), 'Reload');
  await waitFor(() => posts.filter((x) => x.dryRun === true).length > before, 'a fresh dry run');
  globalThis.fetch = orig;
  await unmount();
});

await check('a DELETE refused with CHANGED_MEANWHILE offers Reload on the panel', async () => {
  reset();
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, o = {}) => {
    if (/\/nesting\/lots\/\d+$/.test(String(url)) && o.method === 'DELETE') return { ok: false, status: 409, text: async () => JSON.stringify({ code: 'CHANGED_MEANWHILE', message: 'The plates on this line changed.' }) };
    return orig(url, o);
  };
  await mountPanel();
  await waitFor(() => find('Draw the 1 plate'), 'the group');
  await click(find('Draw the 1 plate'), 'open group');
  await waitFor(() => find('Remove plate'), 'Remove');
  await click(find('Remove plate'), 'Remove');
  await click(buttons().filter((b) => b.textContent.trim() === 'Remove plate').pop(), 'confirm');
  await waitFor(() => document.querySelector('[data-testid=changed-meanwhile]'), 'the notice');
  assert.ok(document.querySelector('[data-testid=changed-meanwhile]').textContent.includes('Reload'));
  globalThis.fetch = orig;
  await unmount();
});

await check('a 422 for the whole request (too many files) is shown in the dialog', async () => {
  reset();
  next = () => { throw new Error('unused'); };
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, o = {}) => {
    if (String(url).endsWith('/nesting/files') && (o.method || 'GET') === 'POST') return { ok: false, status: 422, text: async () => JSON.stringify({ code: 'TOO_MANY_FILES', message: 'At most 200 files at a time.' }) };
    return orig(url, o);
  };
  await mountEl(dialog());
  await waitFor(() => document.querySelector('[data-testid=nest-files-error]'), 'the error');
  assert.ok(text().includes('At most 200 files at a time.'));
  globalThis.fetch = orig;
  await unmount();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
