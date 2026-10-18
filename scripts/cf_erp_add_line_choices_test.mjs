// Run from multi_app_fe: node scripts/cf_erp_add_line_choices_test.mjs
//
// ADD LINE — three choices (user, 2026-10-18) + NEW-ORDER values (init.sql §77; BE routes/addLine.js).
// The words and rules (lib/addLine), the grid's amber "AI · check" chip for a row AI was unsure of (BomGrid), and the
// banner over a line built from a new drawing (AiLineBanner) against a stubbed API. DOM-level; it does not replace a
// look in a browser.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div><div id="banner"></div></body></html>', { url: 'http://localhost/acme/cf_erp/orders/1', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MouseEvent', 'KeyboardEvent', 'Event', 'FocusEvent', 'InputEvent']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');

const stub = `
  export const calls = [];
  export let state = null;
  export const setState = (s) => { state = s; };
  export const getDrawingImport = async () => state;
  export const clearAiFlags = async (lineId, rowIds) => { calls.push({ lineId, rowIds }); const cleared = state.open.length; state = { ...state, open: [] }; return { ...state, cleared }; };
  export const getNewOrderDefaults = async () => null;
  export const addLineFromDrawing = async () => null;
  export const saveLineAsStandard = async () => null;`;
const built = await build({
  alias: { '@shared/ui': resolve('src/shared/ui/SheetGrid.tsx') },
  plugins: [{
    name: 'stub-add-line-api',
    setup(b) {
      b.onResolve({ filter: /api\/addLine$/ }, () => ({ path: 'stub', namespace: 'stub' }));
      b.onResolve({ filter: /^@core\/api\/client$/ }, () => ({ path: 'core', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
        contents: a.path === 'core' ? "export const apiFetch = async () => { throw new Error('no server in this test'); };" : stub, loader: 'js',
      }));
    },
  }],
  stdin: {
    contents: `export * from './src/apps/cf_erp/components/Bom/BomGrid'; export * from './src/apps/cf_erp/components/Bom/bomArrangement'; export * from './src/apps/cf_erp/components/Bom/bomModel';
      export * as al from './src/apps/cf_erp/lib/addLine'; export { AiLineBanner } from './src/apps/cf_erp/components/OrderStructure/AiLineBanner';
      export * as api from './src/apps/cf_erp/api/addLine';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `add-line-choices-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };

/* ---------------------------------------------------------------------------
 * The words and rules
 * ------------------------------------------------------------------------ */
await check('three choices for a customer order, in the user\'s order, keys 1-2-3', () => {
  const c = m.al.addChoices('customer');
  assert.deepEqual(c.map((x) => [x.key, x.hotkey, x.title]), [['parts', '1', 'Build from parts'], ['standard', '2', 'From a standard drawing'], ['drawing', '3', 'From a new drawing']]);
  assert.match(c[2].hint, /AI/);
});
await check('a stock order builds from parts only', () => {
  assert.deepEqual(m.al.addChoices('stock').map((x) => x.key), ['parts']);
});
await check('keyboard: a digit picks, arrows move and wrap', () => {
  const c = m.al.addChoices('customer');
  assert.equal(m.al.choiceForKey('3', c), 'drawing');
  assert.equal(m.al.choiceForKey('9', c), null);
  assert.equal(m.al.moveChoice(2, 'ArrowRight', 3), 0);
  assert.equal(m.al.moveChoice(0, 'ArrowLeft', 3), 2);
  assert.equal(m.al.moveChoice(1, 'Tab', 3), 1);
});
await check('a drawing file: DWG / DXF taken, a PDF refused politely, anything else refused', () => {
  assert.deepEqual(m.al.drawingFileKind('NECL-48M-SPAN.DXF'), { kind: 'dxf' });
  assert.deepEqual(m.al.drawingFileKind('span.dwg'), { kind: 'dwg' });
  assert.match(m.al.drawingFileKind('scan.pdf').error, /^Thanks — PDF drawings \(scans\) cannot be read by AI yet/);
  assert.equal(m.al.drawingFileKind('notes.txt').error, 'The drawing must be a DWG or a DXF file.');
});
await check('a BOM line note splits into the AI flag and the rest', () => {
  assert.deepEqual(m.al.splitAiNote('DRILL ON ASSEMBLY · Check (by AI): quantity not on the drawing — set to 1'), { ai: 'quantity not on the drawing — set to 1', rest: 'DRILL ON ASSEMBLY' });
  assert.deepEqual(m.al.splitAiNote('Check (by AI): a; b'), { ai: 'a; b', rest: null });
  assert.deepEqual(m.al.splitAiNote(null), { ai: null, rest: null });
});
await check('the New order dialog sends only filled values; the prefill says where it came from', () => {
  assert.deepEqual(m.al.defaultsToSend({ GRADE: '12', COATS: '', IMPACT_CLASS: ' 5 ' }), [{ specCode: 'GRADE', value: '12' }, { specCode: 'IMPACT_CLASS', value: '5' }]);
  assert.equal(m.al.prefillWord('last_order', 'SO260012'), 'As on SO260012');
  assert.equal(m.al.prefillWord('template', null), 'What the templates use');
  assert.equal(m.al.prefillWord(undefined, null), null);
  assert.equal(m.al.flagsWord(0), 'All checked');
  assert.equal(m.al.flagsWord(1), '1 row to check');
  assert.equal(m.al.flagsWord(22), '22 rows to check');
});

/* ---------------------------------------------------------------------------
 * The grid: an amber "AI · check" chip on a row AI was unsure of
 * ------------------------------------------------------------------------ */
const node = (id, children = [], more = {}) => ({ id, key: `k${id}`, name: `Row ${id}`, code: null, kind: 'temporary', status: 'draft', depth: 1, quantity: 1, total: 1, lineId: id * 10, lineNo: id * 10, position: 1, role: null, selection: null, resolved: true, flow: null, bom: null, notes: null, children, ...more });
const tree = node(1, [
  node(2, [], { notes: 'Check (by AI): quantity not on the drawing — set to 1' }),
  node(3, [], { notes: 'DRILL ON ASSEMBLY · Check (by AI): its shape or holes need a look' }),
  node(4, [], { notes: 'DRILL ON ASSEMBLY' }),
  node(5),
], { lineId: null, depth: 0 });
const rows = m.arrangedRows(tree, new Set(['k1', 'k2', 'k3', 'k4', 'k5']), m.NO_PENDING);
const props = { rows, view: null, pending: m.NO_PENDING, busy: false, canEdit: () => false, canEditValues: () => false,
  onWrites: () => {}, onMove: () => {}, dropRefusal: () => null, onToggle: () => {}, trailingCell: () => null, flowCell: () => null, markOf: () => null, placeholderOf: () => null };
const root = createRoot(document.getElementById('app'));
const { MemoryRouter } = await import('react-router-dom');
await React.act(() => root.render(React.createElement(MemoryRouter, {}, React.createElement(m.BomGrid, props))));
await check('two rows carry the AI chip, with the reason as its tooltip', () => {
  const chips = [...document.querySelectorAll('[data-testid="row-ai-flag"]')];
  assert.equal(chips.length, 2);
  assert.equal(chips[0].textContent, 'AI · check');
  assert.equal(chips[0].getAttribute('title'), 'Check (by AI): quantity not on the drawing — set to 1');
  assert.equal(chips[1].getAttribute('title'), 'Check (by AI): its shape or holes need a look');
});
await check('a plain note keeps its own "Note" chip — without the AI part', () => {
  const notes = [...document.querySelectorAll('[data-testid="row-note"]')];
  assert.equal(notes.length, 2);
  assert.ok(notes.every((n) => n.getAttribute('title') === 'DRILL ON ASSEMBLY'));
});

/* ---------------------------------------------------------------------------
 * The banner over a line built from a new drawing
 * ------------------------------------------------------------------------ */
const bannerRoot = createRoot(document.getElementById('banner'));
const banner = () => document.getElementById('banner');
const flush = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
let saved = 0, removed = 0, changed = 0;
const bannerProps = { lineId: 9, refreshKey: 1, editable: true, hasStandard: false, onSaveStandard: () => { saved++; }, onRemove: () => { removed++; }, onChanged: () => { changed++; } };
await check('nothing shows over a line not read from a drawing', async () => {
  m.api.setState({ lineId: 9, import: null, open: [] });
  await React.act(() => bannerRoot.render(React.createElement(m.AiLineBanner, bannerProps)));
  await flush();
  assert.equal(banner().querySelector('[data-testid="ai-line-banner"]'), null);
});
await check('a line built by AI: the file, the parts, the rows to check, and the three actions', async () => {
  m.api.setState({ lineId: 9, import: { file: 'NECL-48M-SPAN.dxf', kind: 'dxf', parts: 22, rows: 27, flagged: 23, weightKg: null, at: '' }, open: Array.from({ length: 23 }, (_, i) => ({ rowId: i + 1, notes: 'Check (by AI): x' })) });
  await React.act(() => bannerRoot.render(React.createElement(m.AiLineBanner, { ...bannerProps, refreshKey: 2 })));
  await flush();
  const b = banner().querySelector('[data-testid="ai-line-banner"]');
  assert.ok(b);
  assert.match(b.textContent, /Built by AI from NECL-48M-SPAN\.dxf · 22 parts · 23 rows to check/);
  assert.ok(b.querySelector('[data-testid="ai-mark-checked"]'));
  assert.ok(b.querySelector('[data-testid="ai-save-standard"]'));
  assert.ok(b.querySelector('[data-testid="ai-remove-line"]'));
});
await check('"Save as a standard drawing" and "Remove line" hand over to the step (its dialog and its confirm)', async () => {
  await React.act(() => banner().querySelector('[data-testid="ai-save-standard"]').click());
  await React.act(() => banner().querySelector('[data-testid="ai-remove-line"]').click());
  assert.deepEqual([saved, removed], [1, 1]);
});
await check('"Mark all checked": one request for the line, then "All checked"', async () => {
  await React.act(async () => { banner().querySelector('[data-testid="ai-mark-checked"]').click(); await new Promise((r) => setTimeout(r, 0)); });
  assert.deepEqual(m.api.calls, [{ lineId: 9, rowIds: undefined }]);
  assert.equal(banner().querySelector('[data-testid="ai-open-count"]').textContent, 'All checked');
  assert.equal(banner().querySelector('[data-testid="ai-mark-checked"]'), null);
  assert.equal(changed, 1);
});
await check('a line tied to a standard, or one that no longer changes, offers less', async () => {
  await React.act(() => bannerRoot.render(React.createElement(m.AiLineBanner, { ...bannerProps, refreshKey: 3, hasStandard: true })));
  await flush();
  assert.equal(banner().querySelector('[data-testid="ai-save-standard"]'), null);
  await React.act(() => bannerRoot.render(React.createElement(m.AiLineBanner, { ...bannerProps, refreshKey: 4, editable: false })));
  await flush();
  assert.equal(banner().querySelector('button'), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
