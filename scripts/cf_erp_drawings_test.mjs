// Run from multi_app_fe: node scripts/cf_erp_drawings_test.mjs
// CF_ERP drawings (DXF or PDF, any level): the pure helpers behind the Structure tab's "Drawings" dialog — number formats,
// the outline as one even-odd SVG path with y flipped, the size check, the summary sentence, what a save would keep.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const built = await build({ entryPoints: ['./src/apps/cf_erp/lib/drawings.ts'], bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external' });
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `drawings-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);

let passed = 0, failed = 0;
const check = (label, fn) => { try { fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.message}`); } };

const geo = { lengthMm: 200, widthMm: 100, areaMm2: 15000, rectAreaMm2: 20000, usePct: 75, cutLengthMm: 1234.5, piercings: 2, holes: 3, holeDiameters: [22, 22, 18.5], innerCuts: 1,
  rings: [[[0, 0], [200, 0], [200, 100], [0, 100]], [[10, 10], [20, 10], [20, 20]]] };
const row = (over = {}) => ({ id: 1, code: 'P-1', name: 'Gusset', level: 'Plate part', isPlatePart: true, pieces: 4, lengthMm: 200, widthMm: 100, thicknessMm: 12, sizeMatches: true, ...over });
const summary = (over = {}) => ({ rows: 152, rowsWithDrawing: 34, parts: 40, partsWithShape: 12, pieces: 310, piecesWithShape: 96, rectAreaM2: 10, trueAreaM2: 7.1, usePct: 71, rectKg: 5000, trueKg: 3760, savingKg: 1240, waiting: 0, ...over });

check('numbers use thousands separators and say a missing one with a dash', () => {
  assert.equal(m.fmtMm(12345.6), '12,346');
  assert.equal(m.fmtKg(1240), '1,240 kg');
  assert.equal(m.fmtM2(1234.567), '1,234.57 m²');
  assert.equal(m.fmtPct(71.04), '71.0%');
  assert.equal(m.fmtMm(null), '—');
  assert.equal(m.fmtKg(undefined), '—');
  assert.equal(m.fmtPct(NaN), '—');
});

check('cut length reads in metres, one decimal', () => {
  assert.equal(m.fmtCutM(1234.5), '1.2 m');
  assert.equal(m.fmtCutM(12500), '12.5 m');
  assert.equal(m.fmtCutM(null), '—');
});

check('sizeText groups both sides', () => {
  assert.equal(m.sizeText(12000, 1500), '12,000 × 1,500 mm');
  assert.equal(m.sizeText(null, 90), '— × 90 mm');
});

check('the outline is one path, every ring closed, y flipped', () => {
  const d = m.ringsPath(geo.rings, 100);
  assert.equal((d.match(/M/g) ?? []).length, 2);
  assert.equal((d.match(/Z/g) ?? []).length, 2);
  assert.ok(d.startsWith('M0 100L200 100L200 0L0 0Z'), d);
  assert.ok(d.includes('M10 90L20 90L20 80Z'), d);
});

check('rings with fewer than two good points are skipped', () => {
  assert.equal(m.ringsPath([[[1, 1]], [[0, 0], [5, NaN]], []], 10), '');
  assert.equal(m.ringsPath([], 10), '');
});

check('outlineShape gives the viewBox of the rectangle', () => {
  assert.equal(m.outlineShape(geo).viewBox, '0 0 200 100');
});

check('size check: match, differ, not compared, and no drawing', () => {
  assert.equal(m.sizeCheck(row(), geo).mark, '✓');
  const bad = m.sizeCheck(row({ sizeMatches: false, lengthMm: 210 }), geo);
  assert.equal(bad.mark, '⚠');
  assert.match(bad.text, /Row 210 × 100 mm but the drawing is 200 × 100 mm/);
  assert.equal(m.sizeCheck(row({ sizeMatches: null }), geo).mark, '·');
  assert.equal(m.sizeCheck(row(), null).mark, '·');
});

check('row codes fall back to the name', () => {
  assert.equal(m.rowCodes([row(), row({ id: 2, code: null, name: 'Web' })]), 'P-1, Web');
  assert.equal(m.rowCodes([]), '—');
});

check('hole diameters are counted and sorted', () => {
  assert.equal(m.holesTitle(geo), '1 × Ø18.5 mm, 2 × Ø22 mm');
  assert.equal(m.holesTitle({ ...geo, holes: 0, holeDiameters: [] }), 'No holes to drill.');
});

check('the summary says the rows covered, then the shapes, use and saving', () => {
  assert.equal(m.summaryWords(summary()),
    '34 of 152 rows have a drawing. 12 of 40 plate parts have a shape (96 of 310 pieces). Their shapes use 71% of their rectangles — true-shape nesting could save up to 1,240 kg on them.');
});

check('with no plate-part shape the summary is the first sentence only', () => {
  assert.equal(m.summaryWords(summary({ partsWithShape: 0, piecesWithShape: 0, usePct: null, savingKg: 0 })), '34 of 152 rows have a drawing.');
  assert.equal(m.summaryWords(summary({ rows: 1, rowsWithDrawing: 0, partsWithShape: 0 })), '0 of 1 row has a drawing.');
});

check('a use between 99.5 and 100 shows one decimal, never 100%', () => {
  const s = m.summaryWords(summary({ usePct: 99.7, savingKg: 30 }));
  assert.match(s, /use 99.7% of/);
  assert.ok(!/100%/.test(s));
});

check('the summary with nothing to save says so, not "0 kg"', () => {
  const s = m.summaryWords(summary({ savingKg: 0, usePct: 100 }));
  assert.ok(!/0 kg/.test(s));
  assert.match(s, /little for true-shape nesting to save/);
});

check('the empty state, hint and intro use the agreed words', () => {
  assert.equal(m.NO_DRAWINGS, 'Upload a drawing for each row, named by its drawing mark.');
  assert.match(m.NO_MARK_HINT, /drop the file on its row/);
  const intro = m.INTRO.replace(/’/g, "'");
  assert.ok(intro.startsWith('A drawing is a sheet of the register (a number and a revision) and its file'));
  assert.ok(intro.includes('Upload again over an issued drawing and it becomes the next revision.'));
  assert.ok(intro.endsWith("A plate part's DXF is also read as its shape: true area, cut length and piercings."));
});

const reg = (action, over = {}) => ({ action, drawingId: 7, code: 'DRW-7', number: 'G1-1', revision: 'B', fromRevision: 'A', ...over });
check('registerWords says what a save does for all four actions', () => {
  assert.equal(m.registerWords(reg('create', { revision: 'A' })), 'New drawing G1-1 rev A');
  assert.equal(m.registerWords(reg('attach')), 'Goes on G1-1 rev B');
  assert.equal(m.registerWords(reg('revise')), 'G1-1: rev A → B');
  assert.equal(m.registerWords(reg('replace')), 'Replaces the file of G1-1 rev B (draft)');
  assert.equal(m.registerWords(null), '—');
  assert.equal(m.refText({ number: 'G1-1', revision: 'C' }), 'G1-1 rev C');
});

check('rowChoices lists each row once from all three sources and keeps a mark', () => {
  const r = (id, over = {}) => ({ id, code: 'C' + id, name: 'Row ' + id, level: 'Plate part', ...over });
  const view = {
    rowsWithoutDrawing: [{ ...r(1), mark: 'M1', pieces: 1, isPlatePart: true }, { ...r(2, { code: null }), mark: null, pieces: 1, isPlatePart: false }],
    drawings: [{ mark: 'D1', rows: [r(2), r(3)] }, { mark: 'D2', rows: [r(3)] }],
    waiting: [{ drawing: {}, rows: [r(1), r(4)] }],
  };
  const c = m.rowChoices(view);
  assert.deepEqual(c.map((x) => x.id), [1, 2, 3, 4]);
  assert.equal(c[1].label, 'Row 2');
  assert.equal(c[1].mark, 'D1');
  assert.equal(c[0].label, 'C1');
  assert.equal(m.prefillNumber(c, [1, 3]), 'M1');
  assert.equal(m.prefillNumber(c, [4]), '');
  assert.equal(m.prefillNumber(c, []), '');
});

check('coveringRow finds saved and waiting drawings of one row', () => {
  const v = { drawings: [{ id: 1, rows: [{ id: 5 }] }, { id: 2, rows: [{ id: 6 }] }], waiting: [{ drawing: { id: 9 }, rows: [{ id: 5 }] }] };
  const out = m.coveringRow(v, 5);
  assert.deepEqual(out.saved.map((d) => d.id), [1]);
  assert.deepEqual(out.waiting.map((w) => w.drawing.id), [9]);
});

check('the delete body names the register drawing that stays', () => {
  assert.equal(m.deleteBody({ number: 'G1-1', revision: 'A' }), 'The file is removed. The drawing G1-1 rev A stays in the register, waiting for a file.');
});

check('the summary adds the waiting sentence only when something waits', () => {
  assert.equal(m.summaryWords(summary({ partsWithShape: 0, piecesWithShape: 0, usePct: null, savingKg: 0, waiting: 3 })), '34 of 152 rows have a drawing. 3 waiting for a file.');
  assert.ok(!/waiting/.test(m.summaryWords(summary({ waiting: 0 }))));
});

check('the button shows n of m rows only once rows are known', () => {
  assert.equal(m.buttonLabel(null), 'Upload drawings');
  assert.equal(m.buttonLabel({ rows: 0, rowsWithDrawing: 0 }), 'Upload drawings');
  assert.equal(m.buttonLabel({ rows: 152, rowsWithDrawing: 0 }), 'Upload drawings');
  assert.equal(m.buttonLabel({ rows: 152, rowsWithDrawing: 34 }), 'Drawings · 34 of 152');
});

check('only new and replacing files are saved', () => {
  const f = (status) => ({ name: `${status}.dxf`, mark: status, status, rows: [], geometry: null, problems: [], warnings: [], register: null });
  const kept = m.savable(['new', 'replaces', 'unmatched', 'error'].map(f)).map((x) => x.status);
  assert.deepEqual(kept, ['new', 'replaces']);
});

check('DXF and PDF names are taken, in any case; nothing else', () => {
  assert.equal(m.drawingKind('BIC-01.dxf'), 'dxf');
  assert.equal(m.drawingKind('G1-1.PDF'), 'pdf');
  assert.equal(m.drawingKind('BIC-01.dwg'), null);
  assert.equal(m.drawingKind('pdf'), null);
  assert.ok(m.isDxf('A.DXF') && !m.isDxf('A.pdf'));
  assert.ok(m.isDrawingFile('a.pdf') && !m.isDrawingFile('a.png'));
});

check('picked files: wrong kind and over 4 MB are set aside', () => {
  const f = (name, size) => ({ name, size });
  const out = m.sortPicked([f('a.dxf', 10), f('b.pdf', 4 * 1024 * 1024), f('c.pdf', 4 * 1024 * 1024 + 1), f('d.png', 1)]);
  assert.deepEqual(out.ok.map((x) => x.name), ['a.dxf', 'b.pdf']);
  assert.deepEqual(out.tooBig, ['c.pdf']);
  assert.deepEqual(out.wrongKind, ['d.png']);
});

check('level helpers: comma-joined, deduped, grouped in first-met order', () => {
  assert.equal(m.levelText(['Girder segment', 'Plate part']), 'Girder segment, Plate part');
  assert.equal(m.levelText([]), '—');
  assert.equal(m.levelText(null), '—');
  assert.deepEqual(m.levelsOfRows([row(), row({ id: 2, level: 'Span' }), row({ id: 3 })]), ['Plate part', 'Span']);
  const g = m.groupByLevel([{ id: 1, level: 'Span' }, { id: 2, level: 'Part' }, { id: 3, level: 'Span' }]);
  assert.deepEqual(g.map((x) => [x.level, x.rows.map((r) => r.id)]), [['Span', [1, 3]], ['Part', [2]]]);
});


// ── DOM tests: the toolbar label, the row icon, a drop on a row, "Choose row…" ───────────────────────────────────
const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MouseEvent', 'KeyboardEvent', 'Event', 'File', 'FileReader', 'Blob', 'HTMLInputElement']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');
const stub = resolve('node_modules/.cache', `drawings-api-stub-${process.pid}.mjs`);
await writeFile(stub, [
  'export const getDrawings = async () => null;',
  'export const uploadDrawings = async (o, l, files, dryRun) => { (globalThis.__calls ??= []).push({ o, l, files, dryRun }); return globalThis.__reply(files, dryRun); };',
  'export const deleteDrawing = async () => null; export const startDrawing = async () => null;',
  'export const downloadDrawing = async () => {}; export const downloadRegisterFile = async () => {};',
].join('\n'));
const domBuilt = await build({
  alias: { '@shared/ui': resolve('src/shared/ui/SheetGrid.tsx') },
  plugins: [{ name: 'api-stub', setup(b) {
    b.onResolve({ filter: /\/api\/drawings$/ }, () => ({ path: stub }));
    // The cf_erp client wraps the core fetch and auth context; nothing here calls them.
    b.onResolve({ filter: /^@core\/(api\/client|contexts\/AuthContext)$/ },(x) => ({ path: x.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (x) => ({ loader: 'js', resolveDir: process.cwd(), contents: x.path.endsWith('client') ? 'export async function apiFetch() { return {}; }' : 'export const useAuth = () => ({ user: null });' }));
  } }],
  stdin: { contents: "export { DrawingsButton, DrawingsDialog } from './src/apps/cf_erp/components/Drawings/DrawingsDialog'; export { RowDrawingCell } from './src/apps/cf_erp/components/Drawings/RowDrawingCell'; export { BomGrid } from './src/apps/cf_erp/components/Bom/BomGrid'; export * from './src/apps/cf_erp/components/Bom/bomArrangement'; export * from './src/apps/cf_erp/components/Bom/bomModel'; export { rowDrawing } from './src/apps/cf_erp/lib/drawings';", resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
});
const domArtifact = resolve(cache, `drawings-dom-test-${process.pid}.mjs`);
await writeFile(domArtifact, domBuilt.outputFiles[0].text);
const d = await import(pathToFileURL(domArtifact));
await unlink(domArtifact); await unlink(stub);

const checkAsync = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack ?? e.message}`); } };
const act = (fn) => React.act(fn);
const root = createRoot(document.getElementById('app'));
const view = (over = {}) => ({
  line: { id: 5, lineNo: 1, orderId: 1, orderCode: 'SO-1', released: false }, drawings: [], waiting: [],
  rowsWithoutDrawing: [{ id: 7, code: 'GUS-1', name: 'Gusset plate', level: 'Plate part', mark: null, pieces: 4, isPlatePart: true }, { id: 8, code: 'WEB-2', name: 'Web', level: 'Plate part', mark: null, pieces: 2, isPlatePart: true }],
  summary: { rows: 5, rowsWithDrawing: 0, parts: 2, partsWithShape: 0, pieces: 6, piecesWithShape: 0, rectAreaM2: 0, trueAreaM2: 0, usePct: null, rectKg: 0, trueKg: 0, savingKg: 0, waiting: 0 }, ...over,
});
const provide = (data) => ({ data, error: null, loading: false, setData: () => {} });
const buttonText = () => document.querySelector('[data-testid="drawings-button"]')?.textContent;

await checkAsync('toolbar button: "Upload drawings" while no row has one, "Drawings · n of m" after', async () => {
  await act(() => root.render(React.createElement(d.DrawingsButton, { orderId: 1, lineId: 5, canManage: true, drawings: provide(view()) })));
  assert.equal(buttonText(), 'Upload drawings');
  await act(() => root.render(React.createElement(d.DrawingsButton, { orderId: 1, lineId: 5, canManage: true, drawings: provide(view({ summary: { ...view().summary, rowsWithDrawing: 2 } })) })));
  assert.equal(buttonText(), 'Drawings · 2 of 5');
});

const node = (id, name, more = {}) => ({ id, key: `k${id}`, name, code: null, kind: 'temporary', status: 'draft', depth: 1, quantity: 1, total: 1, lineId: id * 10, lineNo: id, position: 1, role: null, selection: null, resolved: true, flow: null, bom: null, uom: 'nos', children: [], ...more });
const tree = node(1, 'Girder', { lineId: null, depth: 0, children: [node(7, 'Gusset plate'), node(8, 'Web')] });
const rows = d.arrangedRows(tree, new Set(['k1']), d.NO_PENDING);
const gridView = { editable: true, optionLists: {}, groups: [{ columns: [{ code: 'LEN', name: 'Length', dataType: 'number', rule: 'entered', editable: true }], rows: rows.map((r) => ({ id: r.node.id, cells: { LEN: { input: '1' } } })) }] };
const drops = [];
const withFile = view({ drawings: [{ id: 1, mark: 'WEB-2', fileName: 'WEB-2.dxf', fileKind: 'dxf', uploadedAt: '', drawing: { id: 9, code: null, number: 'SO-1/WEB-2', revision: 'B', status: 'issued', title: null, earlier: [] }, levels: ['Plate part'], geometry: null, rows: [{ id: 8, code: 'WEB-2', name: 'Web', level: 'Plate part', isPlatePart: true, pieces: 2, lengthMm: 1, widthMm: 1, thicknessMm: 1, sizeMatches: null }], warnings: [] }] });
const gridProps = {
  rows, view: gridView, pending: d.NO_PENDING, busy: false, canEdit: () => true, canEditValues: () => true, onWrites: () => {}, onMove: () => {}, dropRefusal: () => null, onToggle: () => {},
  flowCell: () => null, markOf: () => null, placeholderOf: () => null,
  trailingCell: (r) => (r.parent ? React.createElement(d.RowDrawingCell, { name: r.node.name, state: d.rowDrawing(withFile, r.node.id), onClick: () => {} }) : null),
  fileDrop: { canDrop: (r) => !!r.parent, onDrop: (r, files) => drops.push({ id: r.node.id, files: files.map((f) => f.name) }) },
};
await act(() => root.render(React.createElement(MemoryRouter, { initialEntries: ['/acme/cf_erp/orders/1'] }, React.createElement(d.BomGrid, gridProps))));

await checkAsync('an editable row shows its drawing icon: upload invitation when empty, file icon with its revision when it has one', async () => {
  const cells = [...document.querySelectorAll('[data-testid="row-drawing"]')];
  assert.equal(cells.length, 2);
  const gusset = cells.find((c) => /Gusset plate/.test(c.getAttribute('aria-label')));
  assert.equal(gusset.getAttribute('aria-label'), 'Upload a drawing for Gusset plate');
  assert.equal(gusset.getAttribute('data-state'), 'none');
  assert.ok(!gusset.disabled);
  const web = cells.find((c) => /WEB-2/.test(c.getAttribute('aria-label')));
  assert.equal(web.getAttribute('data-state'), 'file');
  assert.match(web.getAttribute('aria-label'), /WEB-2\.dxf · rev B/);
  assert.match(web.textContent, /B/);
});
const dropEvent = async (el, type, files) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: { types: ['Files'], files, dropEffect: '' } });
  await act(() => el.dispatchEvent(e));
  return e;
};
await checkAsync('a file dragged over a row is accepted, and dropping it hands the files and THAT row to the panel', async () => {
  const tr = document.querySelector('[aria-label="Move Web"]').closest('tr');
  const file = new File(['x'], 'anything.pdf', { type: 'application/pdf' });
  const over = await dropEvent(tr, 'dragover', [file]);
  assert.equal(over.defaultPrevented, true);
  await dropEvent(tr, 'drop', [file]);
  assert.deepEqual(drops, [{ id: 8, files: ['anything.pdf'] }]);
});
await checkAsync('a row that needs a save first says so and is disabled', async () => {
  await act(() => root.render(React.createElement(d.RowDrawingCell, { name: 'Copy', state: d.rowDrawing(null, 1), why: 'Save your changes first', onClick: () => {} })));
  const b = document.querySelector('[data-testid="row-drawing"]');
  assert.equal(b.getAttribute('aria-label'), 'Save your changes first');
  assert.ok(b.disabled);
});

const dialog = (props) => React.createElement(MemoryRouter, null, React.createElement(d.DrawingsDialog, { open: true, onClose: () => {}, orderId: 1, lineId: 5, canManage: true, view: view(), error: null, loading: false, onView: () => {}, ...props }));
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
globalThis.__reply = (files, dryRun) => ({ dryRun, saved: false, view: null, files: files.map((f) => ({ name: f.name, mark: f.name.replace(/\.[^.]+$/, ''), fileKind: 'pdf', status: f.rowId != null ? 'new' : 'unmatched', rows: [], geometry: null, problems: [], warnings: [], notes: [], register: null })) });
await checkAsync('a file dropped on a row is read (dry run) with that row as its target', async () => {
  globalThis.__calls = [];
  const file = new File(['%PDF-1.4 x'], 'sheet 7.pdf', { type: 'application/pdf' });
  await act(() => root.render(dialog({ focusRow: { id: 7, name: 'GUS-1' }, incoming: { files: [file], rowId: 7, seq: 1 } })));
  await flush();
  assert.equal(globalThis.__calls.length, 1);
  assert.equal(globalThis.__calls[0].dryRun, true);
  assert.equal(globalThis.__calls[0].files[0].rowId, 7);
  assert.equal(globalThis.__calls[0].files[0].name, 'sheet 7.pdf');
});
await checkAsync('a file dropped on the background is read matched by name (no target)', async () => {
  globalThis.__calls = [];
  const file = new File(['%PDF-1.4 x'], 'G1-1.pdf', { type: 'application/pdf' });
  await act(() => root.render(dialog({ incoming: { files: [file], rowId: null, seq: 2 } })));
  await flush();
  assert.equal(globalThis.__calls.length, 1);
  assert.ok(!('rowId' in globalThis.__calls[0].files[0]));
});
await checkAsync('an unmatched file gets a "Choose row…" picker; choosing a row reads it again aimed at that row', async () => {
  globalThis.__calls = [];
  const file = new File(['%PDF-1.4 x'], 'mystery.pdf', { type: 'application/pdf' });
  await act(() => root.render(dialog({ incoming: { files: [file], rowId: null, seq: 3 } })));
  await flush();
  const input = document.querySelector('[data-testid="choose-row"]');
  assert.ok(input, 'the picker is there');
  assert.equal(input.getAttribute('placeholder'), 'Choose row…');
  await act(async () => { input.focus(); });
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    set.call(input, 'gus'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  const opts = [...document.querySelectorAll('[role="option"]')];
  assert.equal(opts.length, 1, 'searching by name narrows the list');
  assert.match(opts[0].textContent, /GUS-1/);
  await act(async () => { opts[0].click(); });
  await flush();
  assert.equal(globalThis.__calls.length, 2);
  assert.equal(globalThis.__calls[1].dryRun, true);
  assert.equal(globalThis.__calls[1].files[0].rowId, 7);
  assert.equal(document.querySelector('[data-testid="choose-row"]'), null, 'no longer unmatched');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
