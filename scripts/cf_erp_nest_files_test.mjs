// Run from multi_app_fe: node scripts/cf_erp_nest_files_test.mjs
// Nesting v2, the customer's files (CF_ERP_NESTING_V2.md): the upload preview dialog (diff, blockers, force,
// ambiguous parts, plate picker, replace mode, left over), drop of many files, Remove plate, the plate card's
// origin line, the true-shape diagram, Nest the rest (summary + additions sent back), permission and locked states.
// Second pass, 2026-10-13: upload is the main door; ProNest job files (.nif) beside the DXFs — a header per job with its
// nests, × N plates, how the pieces were matched, what the job leaves un-nested, one pick list per part NAME; Save counts
// plates; the shape marker follows `shapeFrom`; a saved plate says ProNest / DXF / Ours; compare is off the screen.
// Third pass, 2026-10-14: the PARTS TABLE per job and for the DXFs (what each part went to and how), the 25 mm cutting allowance
// called out, and Choose / Change / Undo a part's cut piece from a ranked, searchable list (choices keyed by job file + part name,
// or by DXF file + part ids).
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
// jsdom has no layout; MUI's popper warns about an anchor with no size.
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
  line: { id: 1, lineNo: 1, orderId: 1, orderCode: 'SO-1' }, canUpload: true, readOnlyReason: null, limits: { maxFiles: 200, maxFileBytes: 4194304, kinds: ['dxf', 'nif'], maxPlates: 600 },
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
const saveBtn = () => document.querySelector('[data-testid=nest-files-save]');

const cand = (id, code, o = {}) => ({ cutPlateId: id, code, name: code, thickness: 25, length: 6120, width: 500, grade: 'E350', needed: 4, fit: 11000000 + id, why: 'same size', possible: true, ...o });
const partRow = (o = {}) => ({
  key: 'PART', partName: 'PART', nests: [1], pieces: 8, open: 0, drawn: [6135, 500], nameSize: [6135, 500],
  matched: { cutPlateId: 9, code: 'NF-CTF', by: 'name size', pieces: 8 }, status: 'matched',
  candidates: [cand(9, 'NF-CTF'), cand(12, 'NF-CX', { length: 6135 }), cand(15, 'NF-CWEB', { length: 2150, width: 750, why: '15 mm longer, 250 mm narrower', fit: 11300000 }), cand(18, 'NF-C16', { thickness: 16, why: 'other thickness (16 mm)', possible: false, fit: 20000000 })],
  ...o,
});
const optionCodes = () => [...document.querySelectorAll('[data-testid=part-option]')].map((o) => o.getAttribute('data-code'));
const pickOption = async (code) => click([...document.querySelectorAll('[data-testid=part-option]')].find((o) => o.getAttribute('data-code') === code), `option ${code}`);
const typeInto = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await React.act(async () => { setter.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(0); });
  await settle();
};

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
  assert.equal(saveBtn().textContent.trim(), 'Save 2 plates', 'the button says how many plates it writes (1 added + 1 replaced)');
  assert.equal(saveBtn().disabled, false);
  assert.equal(document.querySelector('[data-testid=save-why]'), null);
  await unmount();
});

await check('each file shows its plate, parts matched and notes; the layout opens as a drawing', async () => {
  reset();
  await mountEl(dialog());
  await waitFor(() => document.querySelector('[data-testid=nest-file]'), 'a file row');
  const row = document.querySelector('[data-testid=nest-file]').textContent;
  assert.ok(row.includes('NVX-PS') && row.includes('3,000 × 1,500') && row.includes('found by size'));
  assert.ok(row.includes('Parts matched 6 of 6') && row.includes('New plate'));
  assert.ok(document.querySelector('[data-testid=nest-file] [data-testid=file-thumb] svg'), 'the plate picture is in the row without asking');
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
  assert.equal(document.querySelector('[data-testid=save-why]').textContent, 'Nothing can be saved until the problems listed under each file are fixed.');
  assert.ok(document.querySelector('[data-testid=nest-files-blocked]').textContent.includes('1 of 1 file needs attention.'));
  assert.ok(find('Close'));
  await unmount();
});

await check('a warning that needs force asks ONE Save anyway confirmation listing it, and the save sends force', async () => {
  reset();
  const w = 'NVX-X2.dxf, plate NVX-PS: NVX-CH at (1300, 100) and NVX-CH at (1601.5, 100) are 1.5 mm apart — closer than the 3 mm kerf we cut 14.137 mm plate with. The customer’s program may use another kerf — save anyway to keep the layout as drawn.';
  let saved = false;
  next = (body) => {
    if (body.dryRun === false) { saved = true; return answer({ dryRun: false, applied: true, needsForce: true, message: 'Saved 1 plate.', warnings: [w] }); }
    return answer({ needsForce: true, warnings: [w], warningList: [{ code: 'TOO_CLOSE', needsForce: true, message: w }], files: [fileRead('NVX-X2.dxf', { status: 'warning', warnings: [{ code: 'TOO_CLOSE', needsForce: true, message: w, pairs: [{ a: 'P1', b: 'P2', distance: 1.5, text: '1.5 mm apart' }] }] })] });
  };
  const got = [];
  await mountEl(dialog({ uploads: uploads('NVX-X2.dxf'), onSaved: (r) => got.push(r) }));
  await waitFor(() => saveBtn() && !saveBtn().disabled, 'Save');
  assert.equal(saveBtn().textContent.trim(), 'Save 2 plates');
  assert.ok(text().includes(w), 'the warning sentence');
  assert.ok(!find('Save anyway'), 'no Save anyway before Save is pressed');
  await click(saveBtn(), 'Save');
  await waitFor(() => document.querySelector('[data-testid=save-anyway-list]'), 'the confirmation');
  assert.equal(saved, false, 'nothing is written before the confirmation');
  assert.ok(document.querySelector('[data-testid=save-anyway-list]').textContent.includes(w), 'the confirmation lists the warning in the backend words');
  await click(find('Save anyway'), 'Save anyway');
  await waitFor(() => saved, 'the save');
  const last = posts[posts.length - 1];
  assert.equal(last.dryRun, false);
  assert.equal(last.force, true);
  await waitFor(() => document.querySelector('[data-testid=nest-files-saved]'), 'the saved note');
  assert.equal(got.length, 1);
  // Compare is off the screen (2026-10-13): the saved view says what was saved and offers Done, nothing else.
  assert.ok(!find('Compare with our nesting') && !/compare|would do better/i.test(text()), 'no comparison after the save');
  assert.ok(find('Done'));
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

await check('an ambiguous DXF part is a row of the parts table; Choose cut piece re-sends the dry run with the choice on every part id of the row', async () => {
  reset();
  const msg = 'NVX-X5.dxf, plate NVX-PS, part P2 at (1500, 100): it could be NVX-CX1 (14.137 mm NVX-GA) and NVX-CX2 (14.137 mm NVX-GA) — they are the same shape. Say which (choices), or label the part in the file.';
  const dxfRow = (o) => partRow({ key: '14.137 mm | 1200 x 400 | -', partName: undefined, nests: undefined, label: null, thickness: 14.137, files: [{ filename: 'NVX-X5.dxf', partIds: ['P2', 'P3'] }], pieces: 2, drawn: [1200, 400], matched: null, status: 'ambiguous', open: 2,
    candidates: [cand(116552, 'NVX-CX1', { thickness: 14.137, length: 1200, width: 400, why: 'same shape' }), cand(116553, 'NVX-CX2', { thickness: 14.137, length: 1200, width: 400, why: 'same shape' })], ...o });
  next = (body) => {
    if (body.choices?.['NVX-X5.dxf']?.P2) return answer({ files: [fileRead('NVX-X5.dxf')], dxfPartRows: [dxfRow({ status: 'chosen', open: 0, matched: { cutPlateId: 116553, code: 'NVX-CX2', by: 'choice', pieces: 2 } })] });
    return answer({ canSave: false, problems: [msg], problemList: [{ code: 'PART_AMBIGUOUS', message: msg, partId: 'P2' }],
      files: [fileRead('NVX-X5.dxf', { status: 'error', errors: [{ code: 'PART_AMBIGUOUS', message: msg, partId: 'P2' }] })], dxfPartRows: [dxfRow()] });
  };
  await mountEl(dialog({ uploads: uploads('NVX-X5.dxf') }));
  await waitFor(() => document.querySelector('[data-testid=part-choose]'), 'the parts table');
  assert.ok(text().includes(msg));
  assert.ok(document.querySelector('[data-testid=nest-dxf-files] [data-testid=parts-table]'), 'the DXF parts table sits in the DXF group');
  assert.equal(document.querySelector('[data-testid=part-chooser]'), null, 'the old one-select-per-part chooser is gone');
  assert.equal(document.querySelector('[data-testid=part-choose]').getAttribute('aria-label'), 'Choose cut piece for part 1,200 × 400');
  const before = posts.length;
  await click(document.querySelector('[data-testid=part-choose]'), 'Choose cut piece');
  await waitFor(() => document.querySelector('[data-testid=part-picker]'), 'the picker');
  await pickOption('NVX-CX2');
  await waitFor(() => posts.length > before, 'a second dry run');
  assert.equal(posts[posts.length - 1].dryRun, true);
  assert.deepEqual(posts[posts.length - 1].choices, { 'NVX-X5.dxf': { P2: 'cp116553', P3: 'cp116553' } }, 'every part id of the row');
  await waitFor(() => saveBtn() && !saveBtn().disabled, 'Save enabled once settled');
  assert.equal(document.querySelector('[data-testid=part-how]').textContent, 'you chose it');
  assert.ok(document.querySelector('[data-testid=part-undo]') && document.querySelector('[data-testid=part-change]'), 'a chosen row can be undone or changed');
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
  assert.ok(t.includes('Left over on this line (4)') && t.includes('NVX-CA') && t.includes('×4'));
  assert.ok(t.includes('“Nest the rest ourselves” will place them (4 of them)'));
  await unmount();
});

await check('dropping 3 DXF files on the panel sends them in ONE request (a dry run first)', async () => {
  reset();
  await mountPanel();
  await waitFor(() => document.querySelector('[data-testid=nest-drop-zone]') && find('Upload more files'), 'the panel');
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

await check('dropping something that is not a nesting file says so and sends nothing', async () => {
  reset();
  await mountPanel();
  await waitFor(() => find('Upload more files'), 'the panel');
  const zone = document.querySelector('[data-testid=nest-drop-zone]');
  const ev = new dom.window.Event('drop', { bubbles: true, cancelable: true });
  ev.dataTransfer = { types: ['Files'], files: [new dom.window.File(['x'], 'sheet.xlsx')] };
  await React.act(async () => { zone.dispatchEvent(ev); await sleep(0); });
  await waitFor(() => text().includes('Drop ProNest job files (.nif) or DXF files here — one job file per thickness, or one DXF per plate.'), 'the hint');
  assert.equal(posts.length, 0);
  await unmount();
  // An API that reads DXF only keeps the old words.
  infoNow = info({ limits: { maxFiles: 200, maxFileBytes: 4194304, kinds: ['dxf'] } });
  await mountPanel();
  await waitFor(() => find('Upload more files'), 'the panel');
  assert.equal(document.querySelector('[data-testid=nest-files-input]').getAttribute('accept'), '.dxf');
  const ev2 = new dom.window.Event('drop', { bubbles: true, cancelable: true });
  ev2.dataTransfer = { types: ['Files'], files: [new dom.window.File(['x'], 'job.nif')] };
  await React.act(async () => { document.querySelector('[data-testid=nest-drop-zone]').dispatchEvent(ev2); await sleep(0); });
  await waitFor(() => text().includes('Drop DXF files here — one DXF per plate.'), 'the DXF-only hint');
  assert.equal(posts.length, 0);
  await unmount();
});

await check('the button takes many files at once', async () => {
  reset();
  await mountPanel();
  await waitFor(() => document.querySelector('[data-testid=nest-files-input]'), 'the input');
  const input = document.querySelector('[data-testid=nest-files-input]');
  assert.equal(input.multiple, true);
  assert.equal(input.getAttribute('accept'), '.nif,.dxf', 'ProNest job files and DXFs together, from limits.kinds');
  assert.equal(input.getAttribute('aria-label'), 'Nesting files (ProNest job files or DXF)');
  assert.ok(!find('Upload Excel') && !document.querySelector('input[accept=".xlsx"]'), 'the Excel sheet upload is retired from the screen');
  await unmount();
});

await check('a line nested by upload with pieces left over says so, with Nest the rest ourselves and Upload more files', async () => {
  reset();
  await mountPanel();
  await waitFor(() => document.querySelector('[data-testid=nest-left-over]'), 'the banner');
  const banner = document.querySelector('[data-testid=nest-left-over]');
  assert.ok(banner.textContent.includes('4 cut pieces are not nested yet') && banner.textContent.includes('NVX-CA') && banner.textContent.includes('×4'));
  // More files first and primary (the team nests in its own program); ours second.
  assert.deepEqual([...banner.querySelectorAll('button')].map((b) => b.textContent), ['Upload more files', 'Nest the rest ourselves']);
  assert.ok(find('Upload more files').className.includes('MuiButton-contained') && find('Nest the rest ourselves').className.includes('MuiButton-outlined'));
  assert.equal(document.querySelector('[data-testid=nest-doors]'), null, 'the doors are for a line with nothing nested');
  assert.equal(document.querySelector('[data-testid=summary-pieces]').textContent, 'Cut pieces nested39 of 43');
  await click(find('Nest the rest ourselves'), 'nest the rest');
  await waitFor(() => find('Start nesting'), 'the start dialog');
  assert.equal(document.querySelector('#nest-start-title').textContent, 'Nest the rest ourselves');
  assert.equal(document.querySelector('[data-testid=nest-start-sentence]').textContent, 'Lays out what the imported nests do not cover. Imported plates stay. Nothing is written until you use the result.');
  await click(find('Start nesting'), 'Start');
  await waitFor(() => calls.some((c) => c.startsWith('POST') && c.endsWith('/nesting/runs')), 'the run');
  const sent = calls.findIndex((c) => c.startsWith('POST') && c.endsWith('/nesting/runs'));
  assert.ok(sent >= 0);
  await unmount();
});

await check('the More menu of an uploaded line offers the upload again, the downloads and Start again with its warning — no comparison', async () => {
  reset();
  await mountPanel();
  await waitFor(() => document.querySelector('[data-testid=nest-more]'), 'More');
  await click(document.querySelector('[data-testid=nest-more]'), 'More');
  await waitFor(() => document.querySelector('[data-testid=more-again]'), 'the menu');
  const ids = [...document.querySelectorAll('#nest-more-menu [role=menuitem]')].map((m) => m.getAttribute('data-testid'));
  assert.deepEqual(ids, ['more-upload', 'more-cnc', 'more-sheet', 'more-again']);
  assert.ok(!/compare/i.test(text()), 'the comparison is off the screen');
  const up = document.querySelector('[data-testid=more-upload]').textContent;
  assert.ok(up.includes('ProNest job files (.nif) or one DXF per plate, up to 600 plates in one go.') && up.includes('A file uploaded again replaces its own plates.'));
  assert.ok(document.querySelector('[data-testid=more-again]').textContent.includes('Lays out the whole line again, automatically. Accepting it replaces the imported nests too.'));
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
  assert.equal(document.querySelector('[data-testid=plate-source]').textContent, 'DXF', 'the badge says which kind of file it came from');
  assert.ok(text().includes('1 added by us'));
  assert.ok(document.querySelector('svg[role=img] [data-by=ours]'), 'our part is marked');
  assert.ok(document.querySelector('svg[role=img] [data-by=customer]'));
  assert.ok(text().includes('Added by us') && text().includes("Customer's part"), 'the legend');
  assert.ok(find('Remove plate'));
  assert.ok(find('Customer’s file'));
  const thumbs = [...document.querySelectorAll('[data-testid=plate-thumbs] button')];
  await click(thumbs[1], 'the automatic plate');
  await waitFor(() => document.querySelector('[data-testid=plate-origin]').textContent === 'Nested here', 'Nested here');
  assert.equal(document.querySelector('[data-testid=plate-source]').textContent, 'Ours');
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
  await click(find('Use this nesting'), 'use this nesting');
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
  planNow = planWith([]);          // nothing nested: the two doors
  infoNow = info({ plates: [], leftOver: [], totals: null });
  await mountPanel({ canManage: false });
  await waitFor(() => find('Upload nesting files'), 'door 2');
  const b = find('Upload nesting files');
  assert.equal(b.disabled, true);
  assert.ok(b.parentElement.getAttribute('aria-label').includes('your role cannot change the order'));
  assert.ok(document.querySelector('[data-testid=door-upload-blocked]').textContent.includes('your role cannot change the order'), 'the blocked door says why, in words on the door');
  assert.equal(find('Nest it ourselves').disabled, false, 'looking at a layout of ours is still allowed');
  await unmount();
});

await check('a locked, released or unfrozen line uses the reason the backend gives', async () => {
  reset();
  infoNow = info({ canUpload: false, readOnlyReason: 'This line is released. Nesting cannot change now.' });
  await mountPanel();
  await waitFor(() => find('Upload more files') && find('Upload more files').disabled, 'a disabled button');
  assert.equal(find('Upload more files').parentElement.getAttribute('aria-label'), 'This line is released. Nesting cannot change now.');
  assert.equal(document.querySelector('[data-testid=left-over-upload-why]').textContent, 'This line is released. Nesting cannot change now.');
  await unmount();
  // The same on a line with nothing nested: the door is shut, and says so in the same words.
  planNow = planWith([]);
  infoNow = info({ canUpload: false, readOnlyReason: 'This line is released. Nesting cannot change now.', plates: [], leftOver: [], totals: null });
  await mountPanel();
  await waitFor(() => document.querySelector('[data-testid=door-upload-blocked]'), 'the shut door');
  assert.equal(document.querySelector('[data-testid=door-upload-blocked]').textContent, 'This line is released. Nesting cannot change now.');
  assert.equal(find('Upload nesting files').disabled, true);
  await unmount();
  planNow = null;
  infoNow = info({ canUpload: false, readOnlyReason: 'This line is released. Nesting cannot change now.' });
  await mountPanel();
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
  // Two pieces of one cut piece disagree (one has no shapeFrom at all), so its chip says nothing rather than guess.
  assert.equal(document.querySelector('[data-testid=nest-file] [data-testid=shape-from]'), null);
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

/* ==== ProNest job files (.nif), second pass 2026-10-13 ============================================== */
const J12 = '12MM-NECL-PATNA.nif';
const fromFile = (o = {}) => ({ ...ringPlacement, shapeFrom: 'nesting file', ...o });
const nestEntry = (file, n, of, o = {}) => fileRead(`${file} nest ${n}`, {
  sourceKind: 'pronest', sourceFile: file, jobName: file.replace(/\.nif$/, ''), program: 'ProNest LT', version: '16.2.1.9298',
  jobNestNo: n, jobNests: of, nestQuantity: 1, units: 'in', notes: [],
  nestNo: `${file.replace(/\.nif$/, '')}-N0${n}`, lotNo: `${file.replace(/\.nif$/, '')}-N0${n}`, lotNos: [`${file.replace(/\.nif$/, '')}-N0${n}`],
  copies: [{ copy: 1, lotNo: `${file.replace(/\.nif$/, '')}-N0${n}`, action: 'add', status: 'ok', counts: [] }],
  placements: [fromFile({ partName: '12MM-GUSSET-300X300- 8' })], ...o,
});
const jobLine = (file, o = {}) => ({
  filename: file, sourceKind: 'pronest', bytes: 1781211, program: 'ProNest LT', version: '16.2.1.9298', jobName: file.replace(/\.nif$/, ''), status: 'ok',
  lotPrefix: file.replace(/\.nif$/, ''), nests: 4, plates: 7, parts: 16, placed: 257, matched: 255,
  matchedBy: { label: 109, shape: 14, size: 25, 'name size': 8, quantity: 12 }, notNested: [], notes: [], ...o,
});
const added = (n) => Array.from({ length: n }, (_, i) => ({ lotNo: `L${i + 1}`, filename: 'x', plateCode: 'NVX-PS', pieces: 6, parts: [] }));
const jobAnswer = (o = {}) => answer({
  jobs: [jobLine(J12, {
    notNested: [
      { name: '12MM-ID PACK PL2-125X125- 144', required: 144, nested: 0, notNested: 144 },
      { name: '12MM-STIFF-90X400- 12', required: 12, nested: 10, notNested: 2 },
      { name: '12MM-END PL-200X600- 4', required: 4, nested: 3, notNested: 1 },
    ],
    notes: ['31 common-line-cut groups were opened into their pieces.'],
  })],
  files: [
    nestEntry(J12, 1, 4, {
      nestQuantity: 4, lotNo: '12MM-NECL-PATNA-N01-1', lotNos: [1, 2, 3, 4].map((k) => `12MM-NECL-PATNA-N01-${k}`),
      copies: [1, 2, 3, 4].map((k) => ({ copy: k, lotNo: `12MM-NECL-PATNA-N01-${k}`, action: k === 4 ? 'unchanged' : 'add', status: 'ok', counts: [] })),
    }),
    nestEntry(J12, 2, 4, {
      placements: [fromFile({ partId: 'P1', partName: '16MM-WEB PL1-2150X6130- 4', by: 'name size', outlineDiffers: { drawn: [6130, 2275.1], cutPiece: [6130, 2150] } }),
        fromFile({ partId: 'P2', partName: '16MM-WEB PL1-2150X6130- 4', by: 'name size', outlineDiffers: { drawn: [6130, 2275.1], cutPiece: [6130, 2150] } })],
    }),
    nestEntry(J12, 3, 4), nestEntry(J12, 4, 4),
  ],
  diff: { added: added(7), replaced: [], unchanged: [], removed: [], droppedAuto: [], droppedOurs: [], renumbered: [] },
  message: '1 file read (1 ProNest job: 4 nests, 7 plates); plates: 7 added.', ...o,
});
const jobOf = (file) => [...document.querySelectorAll('[data-testid=nest-job]')].find((j) => j.getAttribute('data-job') === file);
const nif = (...names) => uploads(...names);

await check('a ProNest job is ONE header with its nests under it; a nest cut on 4 plates says × 4 plates, lot numbers on demand', async () => {
  reset();
  next = () => jobAnswer();
  await mountEl(dialog({ uploads: nif(J12) }));
  await waitFor(() => document.querySelector('[data-testid=nest-job]'), 'the job');
  assert.equal(document.querySelectorAll('[data-testid=nest-job]').length, 1);
  const head = document.querySelector('[data-testid=job-header]');
  assert.equal(head.tagName, 'BUTTON', 'the header is a button: keyboard reachable');
  assert.equal(head.getAttribute('aria-expanded'), 'true', 'four nests: the job starts open');
  assert.ok(head.textContent.includes('12MM-NECL-PATNA'));
  assert.equal(document.querySelector('[data-testid=job-counts]').textContent, 'ProNest LT 16.2 · 4 nests · 7 plates · 257 pieces, 255 matched');
  const rows = [...jobOf(J12).querySelectorAll('[data-testid=nest-file]')];
  assert.deepEqual(rows.map((r) => r.querySelector('[data-testid=file-title]').textContent), ['Nest 1 of 4', 'Nest 2 of 4', 'Nest 3 of 4', 'Nest 4 of 4']);
  assert.ok(rows.every((r) => r.getAttribute('data-kind') === 'pronest'));
  assert.ok(rows[0].querySelector('[data-testid=file-thumb] svg'), 'each nest has its plate picture');
  assert.ok(rows[0].textContent.includes('Parts matched 6 of 6') && rows[0].textContent.includes('NVX-PS'));
  // × N plates, only on the nest that has N > 1; the lot numbers wait behind it.
  const qty = rows[0].querySelector('[data-testid=nest-quantity]');
  assert.equal(qty.textContent, '× 4 plates');
  assert.equal(rows[1].querySelector('[data-testid=nest-quantity]'), null);
  assert.ok(rows[1].textContent.includes('12MM-NECL-PATNA-N02'), 'a nest on one plate shows its lot number');
  assert.ok(!text().includes('12MM-NECL-PATNA-N01-3'), 'not shown until asked');
  assert.ok(rows[0].textContent.includes('3 new plates') && rows[0].textContent.includes('Unchanged'), 'one plate of the four may differ in what it does');
  await click(qty, '× 4 plates');
  await waitFor(() => document.querySelector('[data-testid=nest-lots]'), 'the lot numbers');
  assert.ok(document.querySelector('[data-testid=nest-lots]').textContent.includes('12MM-NECL-PATNA-N01-1, 12MM-NECL-PATNA-N01-2, 12MM-NECL-PATNA-N01-3, 12MM-NECL-PATNA-N01-4'));
  // No DXF group when there is no DXF, and the job's notes sit under its nests.
  assert.equal(document.querySelector('[data-testid=nest-dxf-files]'), null);
  assert.ok(document.querySelector('[data-testid=job-notes]').textContent.includes('31 common-line-cut groups'));
  await unmount();
});

await check('Save counts PLATES (a ×4 nest is 4), not nests or files', async () => {
  reset();
  next = () => jobAnswer();
  await mountEl(dialog({ uploads: nif(J12) }));
  await waitFor(() => saveBtn() && !saveBtn().disabled, 'Save');
  assert.equal(saveBtn().textContent.trim(), 'Save 7 plates', '4 nests, 1 file, 7 plates');
  assert.ok(document.querySelector('[data-testid=nest-diff]').textContent.includes('Added 7'));
  await unmount();
});

await check('how the pieces were matched is one quiet line per job, in plain words', async () => {
  reset();
  next = () => jobAnswer({ jobs: [jobLine(J12, { matchedBy: { quantity: 12, 'name size': 8, label: 109, shape: 14, size: 25, steel: 0, 'something new': 3 } })] });
  await mountEl(dialog({ uploads: nif(J12) }));
  await waitFor(() => document.querySelector('[data-testid=job-matched-by]'), 'the line');
  assert.equal(document.querySelector('[data-testid=job-matched-by]').textContent,
    'Pieces matched by mark 109 · by shape 14 · by size 25 · by the size in its name 8 · shared out by quantity 12 · by something new 3');
  await unmount();
});

await check('a part matched by the size in its name says both sizes in the parts table — the per-nest note is gone — and it is not an error', async () => {
  reset();
  const name = '16MM-WEB PL1-2150X6130- 4';
  next = () => jobAnswer({ jobs: [jobLine(J12, { partRows: [partRow({ key: name, partName: name, pieces: 8, drawn: [6130, 2275.1], matched: { cutPlateId: 9, code: 'NF-CWEB', by: 'name size', pieces: 8, outlineDiffers: { drawn: [6130, 2275.1], cutPiece: [6130, 2150] } },
    candidates: [cand(9, 'NF-CWEB', { length: 6130, width: 2150 })] })] })] });
  await mountEl(dialog({ uploads: nif(J12) }));
  await waitFor(() => document.querySelector('[data-testid=parts-table]'), 'the parts table');
  assert.equal(document.querySelector('[data-testid=file-name-size]'), null, 'no scattered per-nest line any more');
  const row = document.querySelector('[data-testid=part-row]');
  assert.equal(row.getAttribute('data-status'), 'matched');
  assert.equal(row.querySelector('[data-testid=part-how]').textContent, 'by the size in its name');
  assert.equal(row.querySelector('[data-testid=part-sizes]').textContent, 'drawn 6,130 × 2,275.1, the cut piece is 6,130 × 2,150');
  assert.equal(row.querySelector('[data-testid=part-matched-to]').textContent, 'NF-CWEB · 6,130 × 2,150');
  assert.ok(row.querySelector('[data-testid=part-change]') && !row.querySelector('[data-testid=part-choose]'));
  assert.equal(document.querySelector('[data-testid=file-errors]'), null);
  assert.equal(document.querySelector('[data-testid=nest-files-blocked]'), null);
  await unmount();
});

await check('what the JOB does not nest is its own collapsible list, apart from the line’s left over', async () => {
  reset();
  next = () => jobAnswer();
  await mountEl(dialog({ uploads: nif(J12) }));
  await waitFor(() => document.querySelector('[data-testid=job-not-nested]'), 'the list');
  const box = document.querySelector('[data-testid=job-not-nested]');
  const toggle = box.querySelector('button');
  assert.equal(toggle.textContent, '3 parts of this job are not fully nested (147 pieces)');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.ok(!text().includes('12MM-ID PACK PL2-125X125- 144'), 'shut until asked');
  await click(toggle, 'the not-nested list');
  await waitFor(() => box.textContent.includes('12MM-ID PACK PL2-125X125- 144'), 'the names');
  assert.ok(box.textContent.includes('12MM-ID PACK PL2-125X125- 144 — needs 144, nested 0, 144 not nested'));
  assert.ok(box.textContent.includes('12MM-STIFF-90X400- 12 — needs 12, nested 10, 2 not nested'));
  // The line's own left over stays where it was, in the line's cut-piece codes.
  const left = document.querySelector('[data-testid=nest-leftover]');
  assert.ok(left.textContent.includes('Left over on this line (4)') && left.textContent.includes('NVX-CA'));
  assert.ok(!left.textContent.includes('ID PACK') && !box.contains(left));
  await unmount();
});

await check('six jobs, 34 nests: every job is one line, shut; a job with a problem opens by itself; a click opens another', async () => {
  reset();
  const names = ['8MM', '10MM', '12MM', '16MM', '20MM', '36MM'].map((t) => `${t}-NECL-PATNA.nif`);
  const sizes = [6, 6, 6, 6, 5, 5];
  const bad = 'NF-CTOP is 36 mm and the plate is 40 mm, so it cannot be cut from it. The same goes for 3 more pieces of this part on the nest.';
  next = () => answer({
    canSave: false, problems: [bad], problemList: [{ code: 'PART_WRONG_THICKNESS', message: bad }],
    jobs: names.map((f, i) => jobLine(f, { nests: sizes[i], plates: sizes[i], status: i === 5 ? 'error' : 'ok' })),
    files: names.flatMap((f, i) => Array.from({ length: sizes[i] }, (_, k) => nestEntry(f, k + 1, sizes[i],
      i === 5 && k === 1 ? { status: 'error', errors: [{ code: 'PART_WRONG_THICKNESS', message: bad, partId: 'P1', partName: '36MM-TOP FL2-770X11950- 4', partIds: ['P1', 'P2', 'P3', 'P4'], count: 4 }] } : {}))),
  });
  await mountEl(dialog({ uploads: nif(...names) }));
  await waitFor(() => document.querySelectorAll('[data-testid=nest-job]').length === 6, 'six jobs');
  const heads = [...document.querySelectorAll('[data-testid=job-header]')];
  assert.deepEqual(heads.map((h) => h.getAttribute('aria-expanded')), ['false', 'false', 'false', 'false', 'false', 'true'], 'only the job with a problem is open');
  assert.equal(document.querySelectorAll('[data-testid=nest-file]').length, 5, 'only its nests are drawn');
  assert.ok(heads[5].textContent.includes('1 problem') && heads[0].textContent.includes('Read'));
  // A part problem comes once per part and nest, and is shown once.
  assert.equal(document.querySelectorAll('[data-testid=file-errors] li').length, 1);
  assert.equal(document.querySelector('[data-testid=file-errors] li').textContent, bad);
  assert.ok(document.querySelector('[data-testid=nest-files-blocked]').textContent.includes('1 of 34 nests need attention.'));
  assert.equal(saveBtn().disabled, true);
  assert.equal(document.querySelector('[data-testid=save-why]').textContent, 'Nothing can be saved until the problems listed above are fixed.');
  // Each shut job still says how it went, and can be opened.
  assert.equal(document.querySelectorAll('[data-testid=job-matched-by]').length, 6);
  await click(heads[0], 'the first job');
  await waitFor(() => document.querySelectorAll('[data-testid=nest-file]').length === 11, 'its 6 nests');
  assert.equal(heads[0].getAttribute('aria-expanded'), 'true');
  await click(heads[0], 'the first job again');
  await waitFor(() => document.querySelectorAll('[data-testid=nest-file]').length === 5, 'shut again');
  await unmount();
});

await check('a job that cannot be read says the backend sentence in its header and has no nests (UNSUPPORTED_VERSION, NEST_CHECK_FAILED)', async () => {
  reset();
  const old = 'old.nif: it was written by ProNest LT 15.1 (15.1.0.0000) — this reads ProNest 2025 LT (16.2). Export the nests as DXF, or send us a sample job so it can be added.';
  const broken = 'broken.nif: it does not agree with itself, so nothing of it is taken — nest 1, "36MM-TOP FL2-770X11950- 4" at (24.8, 5.2): its outline, put where the nest places it, is not the box the file stores for it (50.8 mm off) (check: placement box). Export the nests as DXF, or send us a sample job so it can be added.';
  const dead = (file, code, message) => ({ filename: file, sourceKind: 'pronest', sourceFile: file, status: 'error', action: null, lotNo: null, plate: null, parts: 0, placed: 0, placements: [], counts: [], errors: [{ code, message }], warnings: [], notes: [], metrics: null });
  const deadJob = (file, code, message, o = {}) => ({ filename: file, sourceKind: 'pronest', status: 'error', program: 'ProNest LT', version: '15.1.0.0000', jobName: null, lotPrefix: null, nests: 0, plates: 0, parts: 0, placed: 0, matched: 0, matchedBy: {}, notNested: [], notes: [], error: { code, message }, ...o });
  next = () => jobAnswer({
    canSave: false, problems: [old, broken], problemList: [{ code: 'UNSUPPORTED_VERSION', message: old }, { code: 'NEST_CHECK_FAILED', message: broken }],
    jobs: [jobLine(J12), deadJob('old.nif', 'UNSUPPORTED_VERSION', old), deadJob('broken.nif', 'NEST_CHECK_FAILED', broken, { version: '16.2.1.9298' })],
    files: [nestEntry(J12, 1, 1), dead('old.nif', 'UNSUPPORTED_VERSION', old), dead('broken.nif', 'NEST_CHECK_FAILED', broken)],
  });
  await mountEl(dialog({ uploads: nif(J12, 'old.nif', 'broken.nif') }));
  await waitFor(() => document.querySelectorAll('[data-testid=nest-job]').length === 3, 'three jobs');
  for (const [file, sentence] of [['old.nif', old], ['broken.nif', broken]]) {
    const job = jobOf(file);
    assert.equal(job.getAttribute('data-status'), 'error');
    assert.ok(job.querySelector('[data-testid=job-header]').textContent.includes(file) && job.querySelector('[data-testid=job-header]').textContent.includes('Cannot be read'));
    const alert = job.querySelector('[data-testid=job-error]');
    assert.equal(alert.getAttribute('role'), 'alert', 'said as an alert, not a footnote');
    assert.ok(alert.textContent.includes('Nothing of this job file is taken.') && alert.textContent.includes(sentence), 'the sentence as the backend wrote it');
    assert.equal(alert.textContent.split(sentence).length, 2, 'once: the job line and its one entry say the same thing');
    assert.equal(job.querySelectorAll('[data-testid=nest-file]').length, 0, 'no nests under it');
    assert.equal(job.querySelector('[data-testid=job-header]').disabled, true, 'nothing to open');
  }
  // The good job is still shown, and the top of the dialog names the files that failed.
  assert.equal(jobOf(J12).querySelectorAll('[data-testid=nest-file]').length, 1);
  const top = document.querySelector('[data-testid=nest-files-blocked]').textContent;
  assert.ok(top.includes('Nothing is saved. 2 job files cannot be read (old.nif, broken.nif).'), top);
  assert.ok(!top.includes('need attention'), 'the one good nest needs none');
  assert.equal(saveBtn().disabled, true);
  await unmount();
});

await check('.nif and DXF together: jobs first, the DXFs in their own group; dropping both sends both in one request', async () => {
  reset();
  next = () => jobAnswer({ files: [nestEntry(J12, 1, 2), fileRead('NVX-B4.dxf', { sourceKind: 'dxf', sourceFile: 'NVX-B4.dxf' }), nestEntry(J12, 2, 2), fileRead('NVX-B5.dxf')], jobs: [jobLine(J12, { nests: 2, plates: 2 })] });
  await mountPanel();
  await waitFor(() => find('Upload more files'), 'the panel');
  const ev = new dom.window.Event('drop', { bubbles: true, cancelable: true });
  ev.dataTransfer = { types: ['Files'], files: [new dom.window.File(['\u0000NIF'], J12), new dom.window.File(['0\nSECTION'], 'NVX-B4.dxf'), new dom.window.File(['0\nSECTION'], 'NVX-B5.DXF'), new dom.window.File(['x'], 'notes.txt')] };
  await React.act(async () => { document.querySelector('[data-testid=nest-drop-zone]').dispatchEvent(ev); await sleep(0); });
  await waitFor(() => posts.length >= 1, 'the upload request', 5000);
  assert.equal(posts.length, 1, 'one request');
  assert.deepEqual(posts[0].files.map((f) => f.filename), [J12, 'NVX-B4.dxf', 'NVX-B5.DXF'], 'whatever kind is dropped is used; the rest is left out');
  await waitFor(() => document.querySelector('[data-testid=nest-dxf-files]'), 'the review');
  const jobs = document.querySelector('[data-testid=nest-jobs]');
  const dxf = document.querySelector('[data-testid=nest-dxf-files]');
  assert.ok(jobs.textContent.includes('ProNest jobs (1)') && dxf.textContent.includes('DXF files (2)'));
  assert.ok(jobs.compareDocumentPosition(dxf) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, 'jobs first');
  assert.equal(jobs.querySelectorAll('[data-testid=nest-file]').length, 2);
  assert.deepEqual([...dxf.querySelectorAll('[data-testid=file-title]')].map((e) => e.textContent), ['NVX-B4.dxf', 'NVX-B5.dxf']);
  assert.ok(dxf.textContent.includes('Nest NVX-B4'), 'a DXF row is as it was');
  await unmount();
});

await check('an ambiguous part of a job is ONE row of the parts table (not one per nest), and the answer goes by file name and part name', async () => {
  reset();
  const part = '16MM-WEB PL2-2128X11944- 4';
  const msg = (n) => `${J12} nest ${n}, plate NVX-PS, part P1 ("${part}"): it could be NF-CWEBA and NF-CWEBB — they are the same shape. Say which (choices), or label the part in the file. The same goes for 3 more pieces of this part on the nest.`;
  const row = (o) => partRow({ key: part, partName: part, nests: [1, 2, 3], pieces: 12, open: 12, drawn: [11944, 2128], matched: null, status: 'ambiguous',
    candidates: [cand(116552, 'NF-CWEBA', { thickness: 16, why: 'same shape' }), cand(116553, 'NF-CWEBB', { thickness: 16, why: 'same shape' })], ...o });
  const amb = (n) => ({ status: 'error', errors: [{ code: 'PART_AMBIGUOUS', message: msg(n), partId: 'P1', partName: part, partIds: ['P1', 'P2', 'P3', 'P4'], count: 4, partKey: part }] });
  next = (body) => (body.choices?.[J12]?.[part]
    ? jobAnswer({ jobs: [jobLine(J12, { partRows: [row({ status: 'chosen', open: 0, matched: { cutPlateId: 116553, code: 'NF-CWEBB', by: 'choice', pieces: 12 } })] })] })
    : jobAnswer({ canSave: false, problems: [1, 2, 3].map(msg), jobs: [jobLine(J12, { status: 'error', partRows: [row()] })],
      files: [nestEntry(J12, 1, 4, amb(1)), nestEntry(J12, 2, 4, amb(2)), nestEntry(J12, 3, 4, amb(3)), nestEntry(J12, 4, 4)] }));
  await mountEl(dialog({ uploads: nif(J12) }));
  await waitFor(() => document.querySelector('[data-testid=part-choose]'), 'the parts table');
  assert.equal(document.querySelectorAll('[data-testid=part-row]').length, 1, 'three nests, twelve pieces, ONE row');
  assert.equal(document.querySelector('[data-testid=part-chooser]'), null);
  assert.equal(document.querySelector('[data-testid=nest-file] [data-testid=parts-table]'), null, 'asked on the job, not on a nest row');
  assert.equal(document.querySelector('[data-testid=part-how]').textContent, 'It could be more than one cut piece');
  const before = posts.length;
  await click(document.querySelector('[data-testid=part-choose]'), 'Choose cut piece');
  await waitFor(() => document.querySelector('[data-testid=part-picker]'), 'the picker');
  await pickOption('NF-CWEBB');
  await waitFor(() => posts.length > before, 'a second dry run');
  assert.deepEqual(posts[posts.length - 1].choices, { [J12]: { [part]: 'cp116553' } });
  await waitFor(() => saveBtn() && !saveBtn().disabled, 'Save enabled once settled');
  assert.equal(document.querySelectorAll('[data-testid=part-row]').length, 1);
  assert.equal(document.querySelector('[data-testid=job-header]').getAttribute('aria-expanded'), 'true', 'and the job does not shut under the hand');
  await unmount();
});

await check('a plate choice on a job is asked once, says it applies to every nest, and goes on the .nif', async () => {
  reset();
  const msg = (n) => `${J12} nest ${n}: 2500 × 6300 is 2 catalog plates (PL-12-A, PL-12-B) — name the one you mean (plateCode).`;
  const amb = (n) => ({ status: 'error', plate: null, placed: 0, placements: [], errors: [{ code: 'PLATE_AMBIGUOUS', message: msg(n), choices: ['PL-12-A', 'PL-12-B'] }] });
  next = (body) => (body.files[0].plateCode ? jobAnswer() : jobAnswer({ canSave: false, problems: [msg(1), msg(2)], jobs: [jobLine(J12, { status: 'error' })], files: [nestEntry(J12, 1, 2, amb(1)), nestEntry(J12, 2, 2, amb(2))] }));
  await mountEl(dialog({ uploads: nif(J12) }));
  await waitFor(() => document.querySelector('[data-testid=plate-picker] select'), 'the picker');
  assert.equal(document.querySelectorAll('[data-testid=plate-picker]').length, 1);
  assert.ok(document.querySelector('[data-testid=plate-picker]').textContent.includes('The plate you name is used for every nest of this job.'));
  assert.ok(text().includes(msg(1)) && text().includes(msg(2)), 'each nest still says its own sentence');
  await setSelect(document.querySelector('[data-testid=plate-picker] select'), 'PL-12-B');
  await waitFor(() => posts.some((p) => p.files[0].plateCode === 'PL-12-B'), 'the re-run');
  assert.equal(posts[posts.length - 1].files[0].filename, J12);
  await unmount();
});

/* ---- the parts table, 2026-10-14 ------------------------------------------------------------------ */
const GUSSET = '25MM-GUSSET-300X300- 6';
const FLANGE = '25MM-EG1-IG1 TOP FL1-500X6135- 8';
const STIFF = '25MM-STIFF-90X400- 12';
const allowanceRow = () => partRow({ key: FLANGE, partName: FLANGE, nests: [1, 2], pieces: 8, status: 'allowance',
  matched: { cutPlateId: 9, code: 'NF-CTF', by: 'name size', pieces: 8, allowanceMm: 15, outlineDiffers: { drawn: [6135, 500], cutPiece: [6120, 500] } } });
const gussetRow = (o = {}) => partRow({ key: GUSSET, partName: GUSSET, nests: [1], pieces: 6, open: 6, drawn: [300, 300], nameSize: [300, 300], matched: null, status: 'unmatched',
  candidates: [cand(21, 'NF-CG', { length: 300, width: 300 }), cand(22, 'NF-CG2', { length: 320, width: 300, why: '20 mm longer, same width', fit: 12000000 }), cand(23, 'NF-C16G', { thickness: 16, length: 300, width: 300, why: 'other thickness (16 mm)', possible: false, fit: 20000000 })], ...o });
const stiffRow = () => partRow({ key: STIFF, partName: STIFF, pieces: 12, drawn: [400, 90], matched: { cutPlateId: 30, code: 'NF-CST', by: 'label', pieces: 12 } });
const tableAnswer = (chosen) => jobAnswer({
  canSave: !!chosen, problems: chosen ? [] : ['3 parts of the job are not matched.'],
  jobs: [jobLine(J12, { status: chosen ? 'ok' : 'error', matchedBy: { 'name size': 8, size: 4, allowance: 8 },
    partRows: [chosen ? gussetRow({ status: 'chosen', open: 0, matched: { cutPlateId: 21, code: 'NF-CG', by: 'choice', pieces: 6 } }) : gussetRow(), allowanceRow(), stiffRow()] })],
});
const rowOf = (name) => [...document.querySelectorAll('[data-testid=part-row]')].find((r) => r.getAttribute('data-part') === name);

await check('a job shows a parts table: the part that matched nothing first and amber, the allowance called out, matched ones with Change', async () => {
  reset();
  next = () => tableAnswer(false);
  await mountEl(dialog({ uploads: nif(J12) }));
  await waitFor(() => jobOf(J12)?.querySelector('[data-testid=parts-table]'), 'the parts table');
  const table = jobOf(J12).querySelector('[data-testid=parts-table]');
  assert.equal(table.querySelector('table').getAttribute('aria-label'), 'Parts of 12MM-NECL-PATNA');
  assert.deepEqual([...table.querySelectorAll('th[scope=col]')].map((h) => h.textContent), ['Part', 'Drawn', 'Pieces', 'Matched to', 'How', 'Change'], 'a real table with column headers');
  const rows = [...table.querySelectorAll('[data-testid=part-row]')];
  assert.deepEqual(rows.map((r) => r.getAttribute('data-status')), ['unmatched', 'allowance', 'matched']);
  // The part that matched nothing.
  assert.ok(rows[0].textContent.startsWith(GUSSET) && rows[0].textContent.includes('300 × 300'));
  assert.equal(rows[0].querySelector('[data-testid=part-matched-to]').textContent, 'Not matched');
  assert.equal(rows[0].querySelector('[data-testid=part-how]').textContent, 'No cut piece found for it');
  const choose = rows[0].querySelector('[data-testid=part-choose]');
  assert.equal(choose.textContent, 'Choose cut piece');
  assert.equal(choose.getAttribute('aria-label'), `Choose cut piece for ${GUSSET}`);
  assert.ok(choose.className.includes('MuiButton-contained'), 'the primary action of an amber row');
  assert.equal(rows[0].querySelector('[data-testid=part-change]'), null);
  assert.equal(rows[0].querySelector('[data-testid=part-undo]'), null, 'nothing to undo');
  // The allowance is called out three ways: a badge, a sentence, and the way it was matched.
  assert.equal(rows[1].querySelector('[data-testid=part-allowance-badge]').textContent, '+15 mm');
  assert.equal(rows[1].querySelector('[data-testid=part-allowance]').textContent, 'nested 15 mm longer than the cut piece — taken as the cutting allowance');
  assert.equal(rows[1].querySelector('[data-testid=part-how]').textContent, 'with a 15 mm cutting allowance');
  assert.equal(rows[1].querySelector('[data-testid=part-matched-to]').textContent, 'NF-CTF · 6,120 × 500+15 mm');
  assert.equal(rows[1].querySelector('[data-testid=part-sizes]'), null, 'the allowance sentence is the sizes');
  assert.equal(rows[1].querySelector('[data-testid=part-change]').getAttribute('aria-label'), `Change the cut piece for ${FLANGE}`);
  // A part matched by its mark.
  assert.equal(rows[2].querySelector('[data-testid=part-how]').textContent, 'by mark');
  assert.equal(rows[2].querySelector('[data-testid=part-matched-to]').textContent, 'NF-CST');
  // The job's matched-by line counts the allowance as an "of which" and adds nothing to the total.
  assert.equal(document.querySelector('[data-testid=job-matched-by]').textContent, 'Pieces matched by size 4 · by the size in its name 8 · of which 8 with a cutting allowance');
  assert.equal(document.querySelector('[data-testid=job-counts]').textContent, 'ProNest LT 16.2 · 4 nests · 7 plates · 257 pieces, 255 matched');
  // Save says why, in words that name the parts.
  assert.equal(saveBtn().disabled, true);
  assert.equal(document.querySelector('[data-testid=save-why]').textContent, '1 part is not matched to a cut piece — choose one, or remove it from the job');
  await unmount();
});

await check('Choose cut piece: a ranked, searchable list; the choice goes by job file + part name; the row says you chose it; Undo takes it away', async () => {
  reset();
  next = (body) => (body.dryRun === false ? { ...tableAnswer(true), dryRun: false, applied: true, message: 'Saved.' } : tableAnswer(!!body.choices?.[J12]?.[GUSSET]));
  await mountEl(dialog({ uploads: nif(J12) }));
  await waitFor(() => rowOf(GUSSET), 'the parts table');
  assert.equal(document.querySelector('[data-testid=part-picker]'), null, 'no picker is open until asked (45 parts, not 45 pickers)');
  await click(rowOf(GUSSET).querySelector('[data-testid=part-choose]'), 'Choose cut piece');
  await waitFor(() => document.querySelector('[data-testid=part-picker]'), 'the picker');
  const picker = document.querySelector('[data-testid=part-picker]');
  assert.ok(picker.textContent.includes('Best fit first. The words say how the nested part compares with each cut piece.'));
  assert.deepEqual(optionCodes(), ['NF-CG', 'NF-CG2', 'NF-C16G'], 'the backend order, not re-sorted');
  const opts = [...document.querySelectorAll('[data-testid=part-option]')];
  assert.deepEqual(opts.map((o) => o.getAttribute('data-possible')), ['true', 'true', 'false'], 'the cut piece of another thickness is last');
  assert.equal(opts[0].textContent, 'NF-CG · 25 × 300 × 300 · E350 · needs 4same size', 'code, thickness × width × length, grade, needs — then the words');
  assert.equal(opts[1].textContent.endsWith('20 mm longer, same width'), true);
  assert.equal(opts[2].textContent.endsWith('other thickness (16 mm)'), true, 'the impossible one says why');
  // Search by size and by code; the order is kept.
  const input = picker.querySelector('input');
  await typeInto(input, '320');
  assert.deepEqual(optionCodes(), ['NF-CG2'], 'a size finds it');
  await typeInto(input, 'nf-c');
  assert.deepEqual(optionCodes(), ['NF-CG', 'NF-CG2', 'NF-C16G'], 'a code finds them, in the server order');
  const before = posts.length;
  await pickOption('NF-CG');
  await waitFor(() => posts.length > before, 'a re-preview');
  assert.equal(posts[posts.length - 1].dryRun, true);
  assert.deepEqual(posts[posts.length - 1].choices, { [J12]: { [GUSSET]: 'cp21' } });
  await waitFor(() => rowOf(GUSSET)?.getAttribute('data-status') === 'chosen', 'the row reads chosen');
  assert.equal(document.querySelector('[data-testid=part-picker]'), null, 'the picker closes');
  assert.equal(rowOf(GUSSET).querySelector('[data-testid=part-how]').textContent, 'you chose it');
  assert.equal(rowOf(GUSSET).querySelector('[data-testid=part-matched-to]').textContent, 'NF-CG · 300 × 300');
  assert.ok(rowOf(GUSSET).querySelector('[data-testid=part-change]') && !rowOf(GUSSET).querySelector('[data-testid=part-choose]'));
  assert.equal(document.querySelector('[data-testid=save-why]'), null);
  // Undo takes the choice away and reads the files again without it.
  const before2 = posts.length;
  await click(rowOf(GUSSET).querySelector('[data-testid=part-undo]'), 'Undo');
  await waitFor(() => posts.length > before2, 'a re-preview without it');
  assert.equal(posts[posts.length - 1].choices, undefined, 'no choice is sent');
  await waitFor(() => rowOf(GUSSET)?.getAttribute('data-status') === 'unmatched', 'the row is open again');
  assert.equal(rowOf(GUSSET).querySelector('[data-testid=part-undo]'), null);
  // Choose again; the choice survives re-previews and goes with Save.
  await click(rowOf(GUSSET).querySelector('[data-testid=part-choose]'), 'Choose cut piece');
  await waitFor(() => document.querySelector('[data-testid=part-option]'), 'the list');
  await pickOption('NF-CG');
  await waitFor(() => rowOf(GUSSET)?.getAttribute('data-status') === 'chosen', 'chosen again');
  await waitFor(() => saveBtn() && !saveBtn().disabled, 'Save');
  await click(saveBtn(), 'Save');
  await waitFor(() => posts.some((p) => p.dryRun === false), 'the save');
  assert.deepEqual(posts[posts.length - 1].choices, { [J12]: { [GUSSET]: 'cp21' } }, 'Save sends the choices');
  await unmount();
});

await check('Change on a matched part opens the same list; only one picker is open at a time; Cancel closes it', async () => {
  reset();
  next = (body) => tableAnswer(!!body.choices?.[J12]?.[GUSSET]);
  await mountEl(dialog({ uploads: nif(J12) }));
  await waitFor(() => rowOf(STIFF), 'the parts table');
  await click(rowOf(STIFF).querySelector('[data-testid=part-change]'), 'Change');
  await waitFor(() => document.querySelector('[data-testid=part-picker]'), 'the picker');
  assert.deepEqual(optionCodes(), ['NF-CTF', 'NF-CX', 'NF-CWEB', 'NF-C16'], 'every cut piece, best fit first, the other thickness last');
  await click(rowOf(GUSSET).querySelector('[data-testid=part-choose]'), 'Choose cut piece on another row');
  await waitFor(() => optionCodes().includes('NF-CG'), 'the other list');
  assert.equal(document.querySelectorAll('[data-testid=part-picker]').length, 1, 'one picker at a time');
  await click(find('Cancel'), 'Cancel');
  assert.equal(document.querySelector('[data-testid=part-picker]'), null);
  // Change a matched part: the choice is for that part name and rides along with the others.
  const before = posts.length;
  await click(rowOf(STIFF).querySelector('[data-testid=part-change]'), 'Change');
  await waitFor(() => document.querySelector('[data-testid=part-picker]'), 'the picker');
  await pickOption('NF-CX');
  await waitFor(() => posts.length > before, 'a re-preview');
  assert.deepEqual(posts[posts.length - 1].choices, { [J12]: { [STIFF]: 'cp12' } });
  await unmount();
});

await check('quantity sharing names its cut pieces; a part with some pieces open says n of m; a chosen part of another size says both sizes; DXF rows are named by mark or size', async () => {
  reset();
  const shared = partRow({ key: 'SHARED', partName: 'SHARED', pieces: 8, matched: { cutPlateId: 9, code: 'NF-A', by: 'quantity', pieces: 5 }, matchedTo: [{ cutPlateId: 9, code: 'NF-A', by: 'quantity', pieces: 5 }, { cutPlateId: 12, code: 'NF-B', by: 'quantity', pieces: 3 }] });
  const some = gussetRow({ key: 'SOME', partName: 'SOME', pieces: 6, open: 2, matched: { cutPlateId: 21, code: 'NF-CG', by: 'size', pieces: 4 } });
  const dxfLabel = partRow({ key: '25 mm | 6200 x 500 | TF1', partName: undefined, nests: undefined, label: 'TF1', thickness: 25, files: [{ filename: 'N1.dxf', partIds: ['P1'] }], pieces: 2, drawn: [6200, 500], status: 'chosen',
    matched: { cutPlateId: 9, code: 'NF-CTF', by: 'choice', pieces: 2, outlineDiffers: { drawn: [6200, 500], cutPiece: [6120, 500] } } });
  const dxfBare = partRow({ key: '25 mm | 700 x 400 | -', partName: undefined, nests: undefined, label: null, thickness: 25, files: [{ filename: 'N1.dxf', partIds: ['P2'] }], pieces: 1, drawn: [700, 400], matched: { cutPlateId: 12, code: 'NF-CX', by: 'shape', pieces: 1 } });
  next = () => jobAnswer({ jobs: [jobLine(J12, { partRows: [some, shared] })], files: [nestEntry(J12, 1, 1), fileRead('N1.dxf')], dxfPartRows: [dxfLabel, dxfBare] });
  await mountEl(dialog({ uploads: nif(J12, 'N1.dxf') }));
  await waitFor(() => rowOf('SHARED'), 'the table');
  assert.equal(rowOf('SHARED').querySelector('[data-testid=part-how]').textContent, 'shared out by quantity between NF-A, NF-B');
  assert.equal(rowOf('SHARED').querySelector('[data-testid=part-matched-to]').textContent, 'NF-A ×5, NF-B ×3');
  assert.equal(rowOf('SOME').querySelector('[data-testid=part-open]').textContent, '2 of 6 pieces not matched');
  const dxfRows = [...document.querySelector('[data-testid=nest-dxf-files]').querySelectorAll('[data-testid=part-row]')];
  assert.equal(dxfRows.length, 2);
  assert.ok(dxfRows[0].textContent.startsWith('TF1 · 25 mm'), 'a DXF part is named by its mark');
  assert.equal(dxfRows[0].querySelector('[data-testid=part-how]').textContent, 'you chose it');
  assert.equal(dxfRows[0].querySelector('[data-testid=part-sizes]').textContent, 'drawn 6,200 × 500, the cut piece is 6,120 × 500');
  assert.ok(dxfRows[1].textContent.startsWith('part 700 × 400 · 25 mm'), 'else by "part" and its size');
  assert.equal(dxfRows[1].querySelector('[data-testid=part-how]').textContent, 'by shape');
  await unmount();
});

await check('many matched parts fold away behind “Show all n parts”; the rows that need a look always show', async () => {
  reset();
  const many = Array.from({ length: 9 }, (_, i) => partRow({ key: `OK${i}`, partName: `OK${i}`, matched: { cutPlateId: 9, code: 'NF-CTF', by: 'label', pieces: 8 } }));
  const mk = (matched) => () => jobAnswer({ canSave: false, problems: ['x'], jobs: [jobLine(J12, { status: 'error', partRows: [gussetRow(), allowanceRow(), ...many.slice(0, matched)] })] });
  next = mk(9);
  await mountEl(dialog({ uploads: nif(J12) }));
  await waitFor(() => document.querySelector('[data-testid=parts-table]'), 'the table');
  assert.deepEqual([...document.querySelectorAll('[data-testid=part-row]')].map((r) => r.getAttribute('data-status')), ['unmatched', 'allowance'], 'the matched ones are folded');
  const toggle = document.querySelector('[data-testid=parts-show-all]');
  assert.equal(toggle.textContent, 'Show all 11 parts');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  await click(toggle, 'Show all');
  assert.equal(document.querySelectorAll('[data-testid=part-row]').length, 11);
  assert.equal(document.querySelector('[data-testid=parts-show-all]').textContent, 'Show fewer parts');
  await unmount();
  // Six matched parts or fewer are all shown; there is nothing to fold.
  next = mk(6);
  await mountEl(dialog({ uploads: nif(J12) }));
  await waitFor(() => document.querySelector('[data-testid=parts-table]'), 'the table');
  assert.equal(document.querySelectorAll('[data-testid=part-row]').length, 8);
  assert.equal(document.querySelector('[data-testid=parts-show-all]'), null);
  await unmount();
});

await check('Save names the parts still unmatched, over every job and the DXFs, singular and plural', async () => {
  reset();
  const dxfAmb = partRow({ key: 'D1', partName: undefined, nests: undefined, label: 'D1', files: [{ filename: 'N1.dxf', partIds: ['P1'] }], matched: null, status: 'ambiguous', open: 1, pieces: 1 });
  next = () => jobAnswer({ canSave: false, problems: ['x'], jobs: [jobLine(J12, { status: 'error', partRows: [gussetRow(), gussetRow({ key: 'G2', partName: 'G2' })] })], files: [nestEntry(J12, 1, 1), fileRead('N1.dxf')], dxfPartRows: [dxfAmb] });
  await mountEl(dialog({ uploads: nif(J12, 'N1.dxf') }));
  await waitFor(() => document.querySelector('[data-testid=save-why]'), 'the reason');
  assert.equal(document.querySelector('[data-testid=save-why]').textContent, '3 parts are not matched to a cut piece — choose one for each, or remove them from the job');
  assert.equal(saveBtn().disabled, true);
  assert.equal(saveBtn().getAttribute('aria-describedby'), 'nest-files-save-why');
  await unmount();
});

await check('every warning and blocker is shown by its sentence — a code this screen never heard of too — and all are in the ONE Save anyway', async () => {
  reset();
  const thin = `${J12} nest 1, plate NVX-PS: NF-CCOV is 9 mm and is nested on 10 mm plate (24 pieces). A piece may be cut from the next plate up — it is then 10 mm thick, not 9 — so check that is meant, then save anyway.`;
  const curve = 'NVX-B4.dxf, plate NVX-PS: 1 curve is a spline given only by control points — the outline is approximate. Export the nest with its curves as arcs or polylines, or save anyway.';
  const unknown = 'NVX-B4.dxf, plate NVX-PS: something this screen has never heard of — save anyway.';
  const warn = (code, message) => ({ code, needsForce: true, message });
  let forced = null;
  next = (body) => {
    if (body.dryRun === false) { forced = body.force; return jobAnswer({ dryRun: false, applied: true, message: 'Saved.' }); }
    return jobAnswer({
      needsForce: true, warnings: [thin, curve, unknown, thin], warningList: [warn('PART_THINNER_THAN_PLATE', thin), warn('CURVE_APPROXIMATE', curve), warn('BRAND_NEW_CODE', unknown)],
      jobs: [jobLine(J12, { status: 'warning', nests: 1, plates: 1 })],
      files: [nestEntry(J12, 1, 1, { status: 'warning', warnings: [{ ...warn('PART_THINNER_THAN_PLATE', thin), cutPlateCode: 'NF-CCOV', cutPlateThickness: 9, plateThickness: 10 }] }),
        fileRead('NVX-B4.dxf', { status: 'warning', warnings: [warn('CURVE_APPROXIMATE', curve), warn('BRAND_NEW_CODE', unknown)] })],
    });
  };
  await mountEl(dialog({ uploads: nif(J12, 'NVX-B4.dxf') }));
  await waitFor(() => saveBtn() && !saveBtn().disabled, 'Save');
  const shown = [...document.querySelectorAll('[data-testid=file-warnings] li')].map((e) => e.textContent);
  assert.deepEqual(shown, [thin, curve, unknown], 'each on its own row, in the backend words; the unknown one is not swallowed');
  assert.ok(document.querySelector('[data-testid=job-header]').textContent.includes('1 warning'));
  await click(saveBtn(), 'Save');
  await waitFor(() => document.querySelector('[data-testid=save-anyway-list]'), 'the confirmation');
  assert.equal(document.querySelector('#nest-files-confirm-title').textContent, 'Save with these 3 warnings?', 'counted once each');
  assert.deepEqual([...document.querySelectorAll('[data-testid=save-anyway-list] li')].map((e) => e.textContent), [thin, curve, unknown]);
  await click(find('Save anyway'), 'Save anyway');
  await waitFor(() => forced != null, 'the save');
  assert.equal(forced, true);
  // A blocker of a code nobody listed here is shown the same way.
  reset();
  const open = 'NVX-B4.dxf: a shape about 1200 x 400 at (645, 20) is not a closed outline: its ends are 4.2 mm apart at (1245, 20). Close it in the nesting program and export again.';
  const odd = 'NVX-B4.dxf: a brand new kind of problem.';
  next = () => answer({ canSave: false, problems: [open, odd], files: [fileRead('NVX-B4.dxf', { status: 'error', action: null, errors: [{ code: 'OPEN_CONTOUR', message: open, at: [1245, 20], gapMm: 4.2 }, { code: 'NEVER_SEEN', message: odd }] })] });
  await unmount();
  await mountEl(dialog({ uploads: uploads('NVX-B4.dxf') }));
  await waitFor(() => document.querySelector('[data-testid=file-errors]'), 'the errors');
  assert.deepEqual([...document.querySelectorAll('[data-testid=file-errors] li')].map((e) => e.textContent), [open, odd]);
  await unmount();
});

await check('the shape marker in the review follows shapeFrom, by its value', async () => {
  reset();
  const p = (id, code, shapeFrom) => ({ ...ringPlacement, partId: `P${id}`, cutPlateId: id, cutPlateCode: code, ...(shapeFrom === undefined ? {} : { shapeFrom }) });
  next = () => answer({ files: [fileRead('NVX-M.dxf', {
    placements: [p(1, 'CP-DRAWN', 'drawing'), p(2, 'CP-FILE', 'nesting file'), p(3, 'CP-RECT', 'dimensions'), p(4, 'CP-ODD', 'somewhere else'), p(5, 'CP-OLD', undefined)],
    counts: [1, 2, 3, 4, 5].map((id) => ({ cutPlateId: id, cutPlateCode: `C${id}`, qty: 1 })),
  })] });
  await mountEl(dialog({ uploads: uploads('NVX-M.dxf') }));
  await waitFor(() => document.querySelector('[data-testid=shape-from]'), 'the markers');
  const marks = [...document.querySelectorAll('[data-testid=nest-file] [data-testid=shape-from]')];
  assert.deepEqual(marks.map((m) => m.textContent), ['from drawing', 'from nesting file', 'from dimensions'], 'an unknown value and a missing field say nothing');
  assert.ok(document.querySelector('[data-testid=file-shape-kept]').textContent.startsWith('1 part keeps'), 'only the one whose value is "nesting file" — the field is on everything now');
  await unmount();
});

await check('a plate saved from a ProNest job wears the ProNest badge, offers the job file, and its pieces say from nesting file', async () => {
  reset();
  planNow = planWith([customerNest({
    id: 6001, lotNo: '16MM-NECL-PATNA-N07-2', sourceKind: 'pronest', sourceFile: '16MM-NECL-PATNA SPAN1.nif',
    pieces: [piece(1, 'NVX-CR', 20, 20, 1200, 400, { shapeFrom: 'nesting file' }), piece(2, 'NVX-CR', 20, 450, 1200, 400, { shapeFrom: 'nesting file' })],
  })]);
  // The cut piece itself has a drawing; on this plate the nesting file's outline is what is cut.
  planNow.groups[0].cutPlates[0].shapeFrom = 'drawing';
  infoNow = info({ plates: [{ lotId: 6001, lotNo: '16MM-NECL-PATNA-N07-2', origin: 'imported', sourceKind: 'pronest', layoutOrigin: 'customer', plateCode: 'NVX-PS', length: 3000, width: 1500, pieces: 2, customerPieces: 2, ourPieces: 0,
    file: { id: 9, filename: '16MM-NECL-PATNA SPAN1.nif', nestNo: '16MM-NECL-PATNA', kind: 'pronest' }, parts: [] }] });
  await mountPanel();
  await waitFor(() => find('Draw the 1 plate'), 'the group');
  await click(find('Draw the 1 plate'), 'open group');
  await waitFor(() => document.querySelector('[data-testid=plate-source]'), 'the badge');
  const badge = document.querySelector('[data-testid=plate-source]');
  assert.equal(badge.textContent, 'ProNest');
  assert.equal(badge.getAttribute('data-source'), 'pronest');
  assert.equal(badge.firstElementChild.getAttribute('aria-label'), 'Copied from a ProNest job: 16MM-NECL-PATNA, nest 7 (plate 2 of that nest).', 'job name and nest number in the tooltip');
  assert.equal(document.querySelector('[data-testid=plate-origin]').textContent, 'ProNest job · 16MM-NECL-PATNA SPAN1.nif');
  assert.equal(document.querySelector('[data-testid=plate-source-file]').textContent, 'Download job file (.nif)');
  assert.ok(find('Remove plate'), 'a ProNest plate is an uploaded plate like any other');
  await click(find('Details'), 'Details');
  await waitFor(() => document.querySelector('[data-testid=shape-from]'), 'the marker');
  assert.equal(document.querySelector('[data-testid=shape-from]').textContent, 'from nesting file');
  await click(find('Download job file (.nif)'), 'the job file');
  await waitFor(() => calls.some((c) => c === 'GET /api/testco/cf_erp/orders/1/lines/1/nesting/files/6001' || c.endsWith('/nesting/files/6001')), 'the download of the whole .nif');
  await unmount();
});

await check('a plate nested before a drawing changed says so, with the reason; staleInvalid says Nest again', async () => {
  reset();
  const why = 'The drawing of NVX-CR was replaced after this plate was saved; its figures are worked out on the shape as it is now.';
  const gone = 'The drawing of NVX-CR was removed after this plate was saved, and its pieces no longer fit the saved layout. Nest the line again.';
  planNow = planWith([
    { ...autoNest(), id: 7001, lotNo: 'N-001', stale: true, staleReason: why },
    { ...autoNest(), id: 7002, lotNo: 'N-002', stale: true, staleInvalid: true, staleReason: gone },
    { ...autoNest(), id: 7003, lotNo: 'N-003', stale: false, staleReason: null },
  ]);
  await mountPanel();
  await waitFor(() => find('Draw the 3 plates'), 'the group');
  await click(find('Draw the 3 plates'), 'open group');
  await waitFor(() => document.querySelector('[data-testid=plate-stale]'), 'the stale note');
  assert.equal(document.querySelector('[data-testid=group-stale]').textContent, '· 2 nested before a drawing changed');
  assert.equal(document.querySelector('[data-testid=plate-stale-chip]').textContent, 'Drawing changed');
  assert.equal(document.querySelector('[data-testid=plate-stale]').textContent, why);
  const thumbs = [...document.querySelectorAll('[data-testid=plate-thumbs] button')];
  await click(thumbs[1], 'the second plate');
  await waitFor(() => document.querySelector('[data-testid=plate-stale]').textContent === gone, 'its reason');
  assert.equal(document.querySelector('[data-testid=plate-stale-chip]').textContent, 'Nest again');
  await click(thumbs[2], 'the third plate');
  await waitFor(() => !document.querySelector('[data-testid=plate-stale]'), 'no note');
  assert.equal(document.querySelector('[data-testid=plate-stale-chip]'), null, 'stale: false lights nothing up');
  await unmount();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
