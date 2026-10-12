// Run from multi_app_fe: node scripts/cf_erp_links_test.mjs
// CF_ERP linked copies ("same design"): the pure rules (lib/links, lib/drawingFileName, the changes Save sends), then the real
// BomPanel in jsdom against a mocked server — the chip, the members list, the one question at Save and Check, what each answer
// sends, the confirm before an action that would break a link, link / unlink, Undo, and the Excel import choice.
// The server's answers are shaped exactly as CF_ERP_LINKED_COPIES_PLAN.md §3 says.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/acme/cf_erp/orders/1', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MouseEvent', 'KeyboardEvent', 'Event', 'File', 'FileReader', 'Blob', 'HTMLInputElement']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const copied = [];
Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async (t) => { copied.push(t); } }, configurable: true });
dom.window.matchMedia = dom.window.matchMedia ?? (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
globalThis.matchMedia = dom.window.matchMedia;

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');

const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
globalThis.__apiFetch = async () => { throw new Error('no reply set'); };
const built = await build({
  alias: { '@shared/ui': resolve('src/shared/ui/SheetGrid.tsx') },
  plugins: [{ name: 'stub-core', setup(b) {
    b.onResolve({ filter: /^@core\/(api\/client|contexts\/AuthContext)$/ }, (x) => ({ path: x.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ loader: 'js', resolveDir: process.cwd(), contents: 'export async function apiFetch(path, opts) { return globalThis.__apiFetch(path, opts); } export const useAuth = () => ({ user: null });' }));
  } }],
  stdin: { contents: `
    export { BomPanel } from './src/apps/cf_erp/components/Bom/BomPanel';
    export { BomSheetDialog } from './src/apps/cf_erp/components/Bom/BomSheetDialog';
    export { LinkChip } from './src/apps/cf_erp/components/Bom/LinkChip';
    export { ToastContext } from './src/apps/cf_erp/components/toastContext';
    export * from './src/apps/cf_erp/components/Bom/bomModel';
    export * from './src/apps/cf_erp/lib/links';
    export * from './src/apps/cf_erp/lib/drawingFileName';
    export * from './src/apps/cf_erp/lib/codeSegments';
    export { applyBomSheet, previewBomSheet } from './src/apps/cf_erp/api/bomSheet';
  `, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
});
const artifact = resolve(cache, `links-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack ?? e.message}`); } };

// ── 1. the pure rules ────────────────────────────────────────────────────────────────────────────────────────────────
const links = { rows: { 2: { g: 'G1', n: 2 }, 3: { g: 'G1', n: 2 }, 4: { g: 'G2', n: 2 }, 6: { g: 'G2', n: 2 }, 10: { same: [11] }, 11: { same: [10] }, 12: { apart: true } }, groups: { G1: [2, 3], G2: [4, 6] } };
await check('linkState reads the server block: linked with its others, an offer, kept apart, nothing', () => {
  assert.deepEqual(m.linkState(links, 2), { kind: 'linked', group: 'G1', members: [2, 3], others: 1 });
  assert.deepEqual(m.linkState(links, 10), { kind: 'suggest', others: [11] });
  assert.equal(m.linkState(links, 12).kind, 'apart');
  assert.equal(m.linkState(links, 99).kind, 'none');
  assert.equal(m.linkState(null, 2).kind, 'none');
  assert.equal(m.linkState({ rows: { 5: { g: 'X', n: 1 } }, groups: {} }, 5).kind, 'none', 'a group of one is no group');
});
await check('the chip words: "Same design as n other rows", "Identical to n other rows"', () => {
  assert.equal(m.linkedTitle(1), 'Same design as 1 other row — click to see them');
  assert.equal(m.linkedTitle(3), 'Same design as 3 other rows — click to see them');
  assert.equal(m.suggestTitle(2), 'Identical to 2 other rows — link them');
  assert.equal(m.brokenSentence(2), '2 rows are no longer the same as their copies.');
  assert.equal(m.brokenSentence(1), '1 row is no longer the same as its copies.');
});

const nd = (id, name, children = [], more = {}) => ({ id, key: `k${id}`, name, code: null, kind: 'temporary', status: 'draft', depth: 1, quantity: 1, total: 1, lineId: id * 10, lineNo: id, position: id, role: null, selection: null, resolved: true, flow: null, bom: null, uom: 'nos', children, ...more });
const tree = nd(1, 'Span', [
  nd(2, 'Girder A', [nd(4, 'Web A', [], { quantity: 2 }), nd(5, 'Flange A')]),
  nd(3, 'Girder B', [nd(6, 'Web B', [], { quantity: 2 }), nd(7, 'Flange B')]),
  nd(10, 'Plate X'), nd(11, 'Plate Y'),
], { lineId: null, depth: 0 });
const flat = m.walkNodes(tree);
const byLine = m.nodesByLine(tree);
const ctx = { links, flat, byLine };
await check('a value typed on a linked row asks; on a row with no copies it does not', () => {
  const a = m.touchedByPending({ quantity: {}, remove: {}, values: { 4: { GRADE: 'E450' } } }, ctx);
  assert.equal(a.touches.length, 1);
  assert.deepEqual([a.touches[0].key, a.touches[0].kind, a.touches[0].copies, a.touches[0].members], ['v:4:GRADE', 'value', 1, [4, 6]]);
  assert.deepEqual(a.above.map((x) => x.label), ['Girder A'], 'the row above that will stop matching its copies');
  assert.equal(m.touchedByPending({ quantity: {}, remove: {}, values: { 5: { GRADE: 'E450' }, 10: { GRADE: 'E450' } } }, ctx).touches.length, 0, 'Flange A is alone; Plate X is only an offer');
  assert.equal(m.touchedByPending({ quantity: {}, remove: {}, values: { 4: { GRADE: 'E450' } } }, { ...ctx, links: null }).touches.length, 0, 'no links block, no question');
});
await check('the same value given to every copy asks nothing and is sent as "all"', () => {
  const same = m.touchedByPending({ quantity: {}, remove: {}, values: { 4: { GRADE: 'E450' }, 6: { GRADE: ' E450 ' } } }, ctx);
  assert.equal(same.touches.length, 0);
  assert.deepEqual(same.unanimous.sort(), ['v:4:GRADE', 'v:6:GRADE']);
  const differ = m.touchedByPending({ quantity: {}, remove: {}, values: { 4: { GRADE: 'E450' }, 6: { GRADE: 'E350' } } }, ctx);
  assert.equal(differ.touches.length, 2, 'two different values are two questions');
});
await check('a quantity or a removal belongs to the PARENT design: it asks for the parent\'s copies', () => {
  const q = m.touchedByPending({ quantity: { 40: '3' }, remove: {} }, ctx);
  assert.deepEqual(q.touches.map((t) => [t.key, t.kind, t.copies, t.group]), [['q:40', 'quantity', 1, 'G1']]);
  assert.match(q.touches[0].what, /Quantity 2 → 3 in Girder A/);
  assert.deepEqual(q.above.map((x) => x.label), [], 'the parent is the touched group, not "above"');
  const r = m.touchedByPending({ quantity: {}, remove: { 50: true } }, ctx);
  assert.deepEqual(r.touches.map((t) => [t.key, t.kind]), [['r:50', 'remove']]);
  assert.equal(m.touchedByPending({ quantity: { 40: '2' }, remove: {} }, ctx).touches.length, 0, 'an unchanged quantity is no change');
  assert.equal(m.touchedByPending({ quantity: { 100: '3' }, remove: {} }, ctx).touches.length, 0, 'Plate X sits in a row with no copies');
});
await check('undecided / chooseAll', () => {
  const t = m.touchedByPending({ quantity: {}, remove: {}, values: { 4: { GRADE: 'E450' } } }, ctx).touches;
  assert.equal(m.undecided(t, undefined).length, 1);
  assert.equal(m.undecided(t, m.chooseAll(t, 'one')).length, 0);
  assert.deepEqual(m.chooseAll(t, 'all'), { 'v:4:GRADE': 'all' });
});
await check('linkedFrom: the linked rows from a node up to the top', () => {
  assert.deepEqual(m.linkedFrom(flat, 'k4', links).map((x) => x.label), ['Web A', 'Girder A']);
  assert.deepEqual(m.linkedFrom(flat, 'k4', links, false).map((x) => x.label), ['Girder A']);
  assert.deepEqual(m.linkedFrom(flat, 'k10', links), []);
});
await check('what Save sends: nothing about copies when nobody was asked; the op answer when everybody agrees; per-write answers when they differ', () => {
  const base = { ...m.NO_PENDING, values: { 4: { GRADE: 'E450' }, 5: { GRADE: 'E350' } }, quantity: { 40: '3' } };
  const plain = m.pendingChanges(base, byLine).changes;
  assert.deepEqual(plain, [{ op: 'quantity', lineId: 40, quantity: 3 }, { op: 'values', writes: [{ recordId: 4, specCode: 'GRADE', value: 'E450' }, { recordId: 5, specCode: 'GRADE', value: 'E350' }] }]);
  const all = m.pendingChanges({ ...base, linkChoice: { 'v:4:GRADE': 'all', 'q:40': 'all' } }, byLine).changes;
  assert.deepEqual(all, [{ op: 'quantity', lineId: 40, quantity: 3, links: 'all' }, { op: 'values', links: 'all', writes: [{ recordId: 4, specCode: 'GRADE', value: 'E450' }, { recordId: 5, specCode: 'GRADE', value: 'E350' }] }]);
  const mixed = m.pendingChanges({ ...base, values: { 4: { GRADE: 'E450' }, 6: { GRADE: 'E450x' } }, quantity: {}, linkChoice: { 'v:4:GRADE': 'all', 'v:6:GRADE': 'one' } }, byLine).changes;
  assert.deepEqual(mixed, [{ op: 'values', links: 'one', writes: [{ recordId: 4, specCode: 'GRADE', value: 'E450', links: 'all' }, { recordId: 6, specCode: 'GRADE', value: 'E450x' }] }]);
  const one = m.pendingChanges({ ...base, quantity: {}, linkChoice: { 'v:4:GRADE': 'one' } }, byLine).changes;
  assert.equal(one[0].links, 'one');
  const rm = m.pendingChanges({ ...m.NO_PENDING, remove: { 50: true }, linkChoice: { 'r:50': 'all' } }, byLine).changes;
  assert.deepEqual(rm, [{ op: 'remove', lineId: 50, links: 'all' }]);
});
await check('the drawing file name is the code with its numbers in brackets, as the preview prints it', () => {
  const seg = (...s) => s;
  const A = seg({ text: 'SO1-CG' }, { from: 1, to: 1 }, { text: '-L' }, { from: 1, to: 1 }, { text: '-1-TFL1' });
  const B = seg({ text: 'SO1-CG' }, { from: 1, to: 1 }, { text: '-L' }, { from: 5, to: 5 }, { text: '-1-TFL1' });
  assert.equal(m.drawingFileName([{ code: 'x', segments: A }, { code: 'x', segments: B }]), 'SO1-CG(1)-L(1,5)-1-TFL1.dxf');
  assert.equal(m.drawingFileName([{ code: 'x', segments: seg({ text: 'L' }, { from: 2, to: 4 }) }]), 'L(2–4).dxf');
  assert.equal(m.drawingFileName([{ code: 'x', segments: seg({ text: 'L' }, { from: 1, to: 3, values: [1, 2, 3] }) }, { code: 'x', segments: seg({ text: 'L' }, { from: 6, to: 6, values: [6] }) }], 'pdf'), 'L(1–3,6).pdf');
  assert.equal(m.drawingFileName([{ code: 'G2/1', segments: null }]), 'G2-1.dxf', 'a code with no segments is used as it is, made safe for a file name');
  assert.equal(m.drawingFileName([{ code: null }]), null);
  // The name is exactly what codeWithNumbers prints for the merged segments.
  assert.equal(m.codeWithNumbers('', m.mergeSegments([A, B])), 'SO1-CG(1)-L(1,5)-1-TFL1');
  // A run of three or more is a range in a FILE NAME (the code preview keeps printing as it does).
  const nums = (...values) => seg({ text: 'P' }, { from: values[0], to: values[values.length - 1], values });
  assert.equal(m.drawingFileName([{ code: 'x', segments: seg({ text: 'L' }, { from: 1, to: 5, values: [1, 2, 3, 4, 5] }, { text: '-1-TFL1' }) }]), 'L(1–5)-1-TFL1.dxf');
  assert.equal(m.drawingFileName([{ code: 'x', segments: seg({ text: 'IS1-' }, { from: 8, to: 12, values: [8, 9, 10, 12] }) }]), 'IS1-(8–10,12).dxf');
  assert.equal(m.drawingFileName([{ code: 'x', segments: seg({ text: 'EDP' }, { from: 1, to: 8, values: [1, 2, 4, 5, 6, 8] }) }]), 'EDP(1,2,4–6,8).dxf');
  assert.equal(m.drawingFileName([{ code: 'x', segments: nums(7, 8) }]), 'P(7,8).dxf', 'two in a row stay listed');
  assert.equal(m.codeWithNumbers('', seg({ text: 'L' }, { from: 1, to: 5, values: [1, 2, 3, 4, 5] })), 'L(1,2,3,4,5)', 'the preview is unchanged');
  assert.equal(m.mergeSegments([A, seg({ text: 'other' })]), null, 'rows built differently cannot be merged');
});

// ── 2. the real BomPanel against a mocked server ─────────────────────────────────────────────────────────────────────
const act = (fn) => React.act(fn);
const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const fire = (el, type, init = {}) => act(async () => { el.dispatchEvent(type.startsWith('key') ? new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }) : new MouseEvent(type, { bubbles: true, cancelable: true, ...init })); });
const click = (el) => act(async () => { el.click(); });
const setInput = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
const byText = (sel, text) => qa(sel).find((e) => e.textContent.trim() === text);
const toasts = [];
const posts = [];
let responseFor = () => ({});

const node = (id, name, children = [], more = {}) => nd(id, name, children, more);
const root = node(1, 'Span', [
  node(2, 'Girder A', [node(4, 'Web A', [], { quantity: 2 }), node(5, 'Flange A')]),
  node(3, 'Girder B', [node(6, 'Web B', [], { quantity: 2 }), node(7, 'Flange B')]),
  node(10, 'Plate X'), node(11, 'Plate Y'),
], { lineId: null, depth: 0 });
const ids = [1, 2, 4, 5, 3, 6, 7, 10, 11];
const valuesView = (extra = {}) => ({
  line: { id: 5, lineNo: 1, lineType: 'custom', quantity: 1 }, order: { id: 1, code: 'SO-1', status: 'draft' }, root: { id: 1, code: null, name: 'Span' },
  editable: true, lock: null, truncated: false, optionLists: {},
  counts: { rows: 9, own: 9, shared: 0, missingOwn: 0, missingShared: 0, rowsMissing: 0, unresolved: 0, noValues: 0 },
  groups: [{ key: 'g', own: true, classification: { id: 1, code: null, name: 'Plates', path: 'Plates' },
    columns: [{ code: 'GRADE', name: 'Grade', dataType: 'text', unit: null, decimals: null, rule: 'entered', required: false, editable: true }],
    rows: ids.map((id) => ({ id, code: null, name: `Row ${id}`, kind: 'temporary', status: 'draft', depth: 1, parent: null, places: 1, lineNo: id, position: id, quantity: 1, missing: 0, cells: { GRADE: { input: 'E350' } } })) }],
  links, ...extra,
});
const structure = () => ({
  root, stats: { nodes: 9, temporary: 9, drafts: 0, unresolved: 0, maxDepth: 2 }, truncated: false,
  line: { id: 5, lineNo: 1, lineType: 'custom', quantity: 1 }, order: { id: 1, code: 'SO-1', status: 'draft', editable: true, locked: false, released: false },
});
const placeholders = { rows: [
  { bomLineId: 20, itemId: 2, code: 'SO1-G(1)', pieces: 1, seqRange: null, segments: [{ text: 'SO1-G' }, { from: 1, to: 1 }] },
  { bomLineId: 30, itemId: 3, code: 'SO1-G(2)', pieces: 1, seqRange: null, segments: [{ text: 'SO1-G' }, { from: 2, to: 2 }] },
  { bomLineId: 40, itemId: 4, code: 'SO1-G(1)-W(1,2)', pieces: 2, seqRange: null, segments: [{ text: 'SO1-G' }, { from: 1, to: 1 }, { text: '-W' }, { from: 1, to: 2 }] },
  { bomLineId: 60, itemId: 6, code: 'SO1-G(2)-W(1,2)', pieces: 2, seqRange: null, segments: [{ text: 'SO1-G' }, { from: 2, to: 2 }, { text: '-W' }, { from: 1, to: 2 }] },
] };
const drawingsView = { line: { id: 5, lineNo: 1, orderId: 1, orderCode: 'SO-1', released: false }, drawings: [], waiting: [], rowsWithoutDrawing: [], summary: { rows: 9, rowsWithDrawing: 0, parts: 0, partsWithShape: 0, pieces: 9, piecesWithShape: 0, rectAreaM2: 0, trueAreaM2: 0, usePct: null, rectKg: 0, trueKg: 0, savingKg: 0, waiting: 0 } };
const reply = (path, opts) => {
  if (opts?.method === 'POST' && /\/bom-changes$/.test(path)) {
    posts.push(opts.body);
    return { applied: !opts.body.dryRun, dryRun: !!opts.body.dryRun, summary: { sentence: 'it is done', counts: {} }, results: [], ...responseFor(opts.body) };
  }
  if (/\/order-lines\/5\/structure$/.test(path)) return structure();
  if (/\/order-lines\/5\/values$/.test(path)) return valuesView();
  if (/\/order-lines\/5\/placeholders$/.test(path)) return placeholders;
  if (/\/orders\/1\/lines\/5\/drawings$/.test(path)) return drawingsView;
  if (/\/flows$/.test(path)) return [];
  throw new Error(`API request failed: 404 Not Found - {"message":"no route in the test: ${path}"}`);
};
globalThis.__apiFetch = async (path, opts) => reply(path, opts);

const appRoot = createRoot(document.getElementById('app'));
const mount = async () => {
  posts.length = 0; toasts.length = 0; responseFor = () => ({});
  await act(() => appRoot.render(React.createElement(m.ToastContext.Provider, { value: { success: (t) => toasts.push(t), info: (t) => toasts.push(t), error: (t) => toasts.push(t) } },
    React.createElement(MemoryRouter, { initialEntries: ['/acme/cf_erp/orders/1'] }, React.createElement(m.BomPanel, { source: { kind: 'orderLine', lineId: 5 }, ownsBom: true })))));
  await flush();
};
const unmount = async () => { await act(() => appRoot.render(null)); await flush(); };
/** The grade cell of the n-th drawn row (Span 0, Girder A 1, Web A 2, Flange A 3, Girder B 4, Web B 5, Flange B 6, Plate X 7, Plate Y 8). */
const gradeCell = (n) => q(`[data-cell^="${n}:"][data-col-key="GRADE"]`);
const typeGrade = async (n, text) => {
  await fire(gradeCell(n), 'click'); await fire(gradeCell(n), 'dblclick');
  const input = q('input[aria-label="Grade"]');
  await act(async () => { setInput.call(input, text); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await fire(input, 'keydown', { key: 'Enter' });
};
const chip = (name) => qa('[data-testid="row-link"]').find((c) => c.getAttribute('aria-label').startsWith(`${name}:`));
const button = (text) => qa('button').find((b) => b.textContent.trim() === text || b.textContent.trim().startsWith(text));
const saveButton = () => qa('button').find((b) => /^Save( \d+ changes?)?$/.test(b.textContent.trim()));
const lastPost = () => posts.at(-1);

await mount();
await check('the chip: ⧉ n linked, dashed = n for an offer, nothing on rows with no copies; it sits after the own-code chip and before the flow chip', async () => {
  const chips = qa('[data-testid="row-link"]');
  assert.deepEqual(chips.map((c) => c.textContent), ['⧉ 1', '⧉ 1', '⧉ 1', '⧉ 1', '= 1', '= 1']);
  const ga = chip('Girder A');
  assert.equal(ga.getAttribute('title'), 'Same design as 1 other row — click to see them');
  assert.equal(ga.getAttribute('data-state'), 'linked');
  const x = chip('Plate X');
  assert.equal(x.getAttribute('title'), 'Identical to 1 other row — link them');
  assert.equal(x.getAttribute('data-state'), 'suggest');
  assert.equal(x.textContent, '= 1');
  assert.equal(chip('Span'), undefined, 'the top row has none');
  assert.equal(chip('Flange A'), undefined);
  // order on line 1 of a row: name, own-code chip, link chip, flow chip — the link chip is a sibling after the own code
  const line1 = ga.parentElement;
  const kids = [...line1.children];
  assert.ok(kids.indexOf(ga) > 0, 'after the name');
});
await check('the row still fits: the header wraps, the name is never cut', async () => {
  const header = chip('Girder A').parentElement;
  const cs = dom.window.getComputedStyle(header);
  assert.equal(cs.flexWrap, 'wrap', 'line 1 wraps');
  assert.ok(!/text-overflow:\s*ellipsis/.test(chip('Girder A').outerHTML));
});

await check('the members list: each row with where it sits, its code, its pieces, Go to; this row is flagged', async () => {
  await click(chip('Girder A'));
  const pop = q('[data-testid="link-popover"]');
  assert.ok(pop);
  assert.match(pop.textContent, /Girder A is the same design as 1 other row/);
  const members = qa('[data-testid="link-member"]');
  assert.deepEqual(members.map((x) => x.getAttribute('data-record')), ['2', '3']);
  assert.match(members[0].textContent, /this row/);
  assert.match(members[1].textContent, /Girder B/);
  assert.match(members[1].textContent, /in Span|^Girder B/);
  assert.match(members[1].querySelector('[data-testid="link-member-code"]').textContent, /SO1-G\(2\)/, 'the code preview, brackets as the grid prints them');
  assert.equal(members[0].querySelector('[data-testid="link-goto"]'), null, 'no Go to for the row itself');
  assert.ok(members[1].querySelector('[data-testid="link-goto"]'));
});
await check('"Copy drawing file name" copies the bracket name of the whole group', async () => {
  copied.length = 0;
  await click(q('[data-testid="link-copy-name"]'));
  await flush();
  assert.deepEqual(copied, ['SO1-G(1,2).dxf']);
});
await check('Unlink and "Keep it apart" are sent at once as unlink ops', async () => {
  await click(q('[data-testid="link-unlink"]')); await flush();
  assert.deepEqual(lastPost(), { scope: { orderLineId: 5 }, dryRun: false, changes: [{ op: 'unlink', recordId: 2 }] });
  assert.ok(toasts.includes('Unlinked.'));
  await click(chip('Girder A')); await click(q('[data-testid="link-apart"]')); await flush();
  assert.deepEqual(lastPost().changes, [{ op: 'unlink', recordId: 2, keepApart: true }]);
});
await check('an offer: "Link these rows" sends a link op for this row and the identical ones', async () => {
  await click(chip('Plate X'));
  assert.match(q('[data-testid="link-popover"]').textContent, /Plate X is identical to 1 other row/);
  assert.equal(q('[data-testid="link-unlink"]'), null);
  await click(q('[data-testid="link-link"]')); await flush();
  assert.deepEqual(lastPost().changes, [{ op: 'link', recordIds: [10, 11] }]);
});
await check('the ⋯ menu offers "Link to identical rows…" and it opens the same list', async () => {
  await click(qa('button[aria-label="More actions for Plate X"]')[0]);
  const item = q('[data-testid="row-link-menu"]');
  assert.equal(item.textContent, 'Link to identical rows…');
  await click(item);
  assert.match(q('[data-testid="link-popover"]').textContent, /identical to 1 other row/);
  await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  await click(q('[data-testid="link-popover"]')?.closest('[role="presentation"]')?.querySelector('.MuiBackdrop-root') ?? document.body);
});

// A fresh panel for the Save tests.
await unmount(); await mount();
await check('Save with no linked rows is one click: no question, no "links" on the request', async () => {
  await typeGrade(7, 'E550');                       // Plate X: only an offer, no copies
  await click(saveButton()); await flush();
  assert.equal(q('[data-testid="link-choice"]'), null);
  assert.equal(posts.length, 1);
  assert.deepEqual(lastPost().changes, [{ op: 'values', writes: [{ recordId: 10, specCode: 'GRADE', value: 'E550' }] }]);
});

await unmount(); await mount();
const askOnWeb = async () => { await typeGrade(2, 'E450'); await click(saveButton()); await flush(); };
await check('a change to a row with copies asks ONCE at Save: three choices, what changed, the rows above that will stop matching', async () => {
  await askOnWeb();
  const dlg = q('[data-testid="link-choice"]');
  assert.ok(dlg, 'the question');
  assert.equal(posts.length, 0, 'nothing is sent before the answer');
  assert.match(dlg.textContent, /Should the copies change too\?/);
  assert.deepEqual(['Apply to all copies', 'Only these rows', 'Choose per row'].map((t) => !!byText('[data-testid="link-choice"] button', t)), [true, true, true]);
  assert.match(q('[data-testid="link-choice-list"]').textContent, /Web A — Grade E350 → E450 \(1 copy\)/);
  assert.match(q('[data-testid="link-choice-above"]').textContent, /Girder A \(1 copy\)/);
  assert.equal(q('[data-testid="row-link"][data-state="changing"]')?.getAttribute('aria-label').startsWith('Web A'), true, 'the chip shows the row is being changed');
});
await check('"Apply to all copies" sends links: all on the values op', async () => {
  await click(q('[data-testid="link-choice-all"]')); await flush();
  assert.equal(posts.length, 1);
  assert.deepEqual(lastPost().changes, [{ op: 'values', links: 'all', writes: [{ recordId: 4, specCode: 'GRADE', value: 'E450' }] }]);
  assert.equal(q('[data-testid="link-choice"]'), null);
});
await unmount(); await mount();
await check('"Only these rows" sends links: one', async () => {
  await askOnWeb();
  await click(q('[data-testid="link-choice-one"]')); await flush();
  assert.deepEqual(lastPost().changes, [{ op: 'values', links: 'one', writes: [{ recordId: 4, specCode: 'GRADE', value: 'E450' }] }]);
});
await unmount(); await mount();
await check('"Choose per row" is a table (row · what changed · copies · All / This one); each answer rides on its own write', async () => {
  await typeGrade(2, 'E450'); await typeGrade(5, 'E550');   // Web A and Web B: linked to each other, typed differently
  await click(saveButton()); await flush();
  await click(q('[data-testid="link-choice-each"]'));
  const rows = qa('[data-testid="link-choice-row"]');
  assert.deepEqual(rows.map((r) => r.getAttribute('data-key')), ['v:4:GRADE', 'v:6:GRADE']);
  assert.deepEqual([...rows[0].querySelectorAll('td')].slice(0, 3).map((td) => td.textContent), ['Web A', 'Grade E350 → E450', '1']);
  assert.equal(posts.length, 0);
  await click(rows[1].querySelector('[data-testid="link-pick"][data-value="one"]'));
  await click(q('[data-testid="link-choice-go"]')); await flush();
  assert.deepEqual(lastPost().changes, [{ op: 'values', links: 'one', writes: [{ recordId: 4, specCode: 'GRADE', value: 'E450', links: 'all' }, { recordId: 6, specCode: 'GRADE', value: 'E550' }] }]);
});
await unmount(); await mount();
await check('the same value given to every copy asks nothing and is sent as all copies', async () => {
  await typeGrade(2, 'E450'); await typeGrade(5, 'E450');
  await click(saveButton()); await flush();
  assert.equal(q('[data-testid="link-choice"]'), null);
  assert.deepEqual(lastPost().changes, [{ op: 'values', links: 'all', writes: [{ recordId: 4, specCode: 'GRADE', value: 'E450' }, { recordId: 6, specCode: 'GRADE', value: 'E450' }] }]);
});
await unmount(); await mount();
await check('Check asks the same question once; Save afterwards does not ask again; Check shows what the server says', async () => {
  responseFor = (body) => (body.dryRun ? { links: { needsChoice: false, touched: [{ recordId: 4, label: 'Web A', group: 'G2', count: 2, members: [4, 6], specs: ['GRADE'], reason: 'values', choice: 'all' }], breaks: [{ recordId: 2, label: 'Girder A', was: 'G1', now: null, because: 'child' }] } } : {});
  await typeGrade(2, 'E450');
  await click(button('Check')); await flush();
  assert.ok(q('[data-testid="link-choice"]'));
  assert.equal(posts.length, 0);
  await click(q('[data-testid="link-choice-all"]')); await flush();
  assert.equal(posts.length, 1);
  assert.deepEqual([lastPost().dryRun, lastPost().changes[0].links], [true, 'all']);
  assert.match(q('[data-testid="check-links-all"]').textContent, /also changes the copies of Web A/);
  assert.match(q('[data-testid="check-links-breaks"]').textContent, /1 row is no longer the same as its copies\. \(Girder A\)/);
  await click(saveButton()); await flush();
  assert.equal(q('[data-testid="link-choice"]'), null, 'already answered');
  assert.deepEqual([lastPost().dryRun, lastPost().changes[0].links], [false, 'all']);
});
await unmount(); await mount();
await check('after Save a notice says how many rows are no longer the same as their copies, with Undo', async () => {
  responseFor = () => ({ links: { needsChoice: false, touched: [], breaks: [{ recordId: 4, label: 'Web A', was: 'G2', because: 'value' }, { recordId: 2, label: 'Girder A', was: 'G1', because: 'child' }] } });
  await askOnWeb();
  await click(q('[data-testid="link-choice-one"]')); await flush();
  assert.equal(q('[data-testid="links-broken"]').textContent, '2 rows are no longer the same as their copies.');
  await click(q('[data-testid="links-undo"]')); await flush();
  // The old value goes back on the row that changed (only it), then the rows are linked again — in ONE request.
  assert.deepEqual(lastPost().changes, [
    { op: 'values', links: 'one', writes: [{ recordId: 4, specCode: 'GRADE', value: 'E350' }] },
    { op: 'link', recordIds: [4, 6] },
    { op: 'link', recordIds: [2, 3] },
  ]);
  assert.ok(toasts.includes('Back to the same design as their copies.'));
});
await unmount(); await mount();
await check('a quantity is asked for the parent\'s copies and rides on the quantity op', async () => {
  const qty = q('[data-cell^="2:"][data-col-key="$quantity"]') ?? q('[data-cell="2:0"]');
  await fire(qty, 'click'); await fire(qty, 'dblclick');
  const input = q('input[aria-label="Quantity"]');
  await act(async () => { setInput.call(input, '3'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await fire(input, 'keydown', { key: 'Enter' });
  await click(saveButton()); await flush();
  assert.match(q('[data-testid="link-choice-list"]').textContent, /Web A — Quantity 2 → 3 in Girder A/);
  await click(q('[data-testid="link-choice-all"]')); await flush();
  assert.deepEqual(lastPost().changes, [{ op: 'quantity', lineId: 40, quantity: 3, links: 'all' }]);
});

await unmount(); await mount();
await check('a copy inside a linked row asks BEFORE it is made; saying no makes nothing', async () => {
  await click(qa('button[aria-label="Copy Web A below"]')[0]);
  assert.equal(posts.length, 0, 'nothing sent yet');
  const dlg = [...document.querySelectorAll('[role="dialog"]')].find((d) => /Stop matching its copies\?/.test(d.textContent));
  assert.ok(dlg, 'the confirm');
  assert.match(dlg.textContent, /Girder A is the same design as 1 other row\. This makes it different from them, so they stop being copies\./);
  await click(byText('[role="dialog"] button', 'Cancel')); await flush();
  assert.equal(posts.length, 0);
});
await check('saying yes makes the copy', async () => {
  await click(qa('button[aria-label="Copy Web A below"]')[0]);
  await click(byText('[role="dialog"] button', 'Go on')); await flush();
  assert.equal(posts.length, 1);
  assert.equal(lastPost().changes[0].op, 'paste');
  assert.equal(lastPost().changes[0].sourceLineId, 40);
});
await check('a copy in a row with no copies is made without a question', async () => {
  posts.length = 0;
  await click(qa('button[aria-label="Copy Plate X below"]')[0]); await flush();
  assert.equal(posts.length, 1);
  assert.equal(lastPost().changes[0].op, 'paste');
  assert.ok(![...document.querySelectorAll('[role="dialog"]')].some((d) => /Stop matching/.test(d.textContent)));
});
await check('"Add a line inside" a linked row asks first', async () => {
  await click(qa('button[aria-label="More actions for Girder A"]')[0]);
  await click(byText('[role="menuitem"]', 'Add a line inside'));
  assert.ok([...document.querySelectorAll('[role="dialog"]')].some((d) => /Stop matching its copies\?/.test(d.textContent)));
  await click(byText('[role="dialog"] button', 'Cancel'));
});
await unmount();

await mount();
await check('link and unlink wait while there are unsaved changes (they would be read against the old structure)', async () => {
  await typeGrade(7, 'E550');
  await click(chip('Girder A'));
  assert.equal(q('[data-testid="link-unlink"]').disabled, true);
  assert.equal(q('[data-testid="link-apart"]').disabled, true);
  assert.equal(posts.length, 0);
  await click(q('.MuiPopover-root .MuiBackdrop-root')); await flush();
});
await unmount();
await mount();
await check('Discard throws the answers away with the changes: asked again next time', async () => {
  await typeGrade(2, 'E450'); await click(saveButton()); await flush();
  await click(byText('[data-testid="link-choice"] button', 'Cancel')); await flush();
  assert.equal(posts.length, 0, 'closing the question sends nothing');
  await click(button('Cancel')); await flush();
  await typeGrade(2, 'E450'); await click(saveButton()); await flush();
  assert.ok(q('[data-testid="link-choice"]'), 'asked again');
});
await unmount();


// ── 3. the Excel import ──────────────────────────────────────────────────────────────────────────────────────────────
const sheetResult = (links) => ({ dryRun: true, ok: true, summary: { sentence: '2 values changed' }, changes: [{ action: 'update', path: 'Web A', field: 'Grade', from: 'E350', to: 'E450' }], problems: [], ...(links ? { links } : {}) });
await check('the import preview offers the two choices for the whole file only when a change is not the same across copies', async () => {
  const picks = [];
  const dlg = (result, links) => act(() => appRoot.render(React.createElement(m.BomSheetDialog, { open: true, fileName: 'a.xlsx', result, busy: false, onClose() {}, onApply() {}, links, onLinks: (v) => picks.push(v) })));
  await dlg(sheetResult(null), 'all');
  assert.equal(q('[data-testid="sheet-links"]'), null);
  await dlg(sheetResult({ needsChoice: false, touched: [], breaks: [] }), 'all');
  assert.equal(q('[data-testid="sheet-links"]'), null);
  await dlg(sheetResult({ needsChoice: true, touched: [{ recordId: 4, label: 'Web A', group: 'G2', count: 2, members: [4, 6], specs: ['GRADE'], reason: 'value', choice: null }], breaks: [] }), 'all');
  const box = q('[data-testid="sheet-links"]');
  assert.ok(box);
  assert.match(box.textContent, /Apply to all copies/);
  assert.match(box.textContent, /Only the rows in the file/);
  assert.equal(q('[data-testid="sheet-links-all"]').checked, true);
  await click(q('[data-testid="sheet-links-one"]'));
  assert.deepEqual(picks, ['one']);
  await act(() => appRoot.render(null));
});
await check('the import sends the answer as `links` (and nothing when none was asked)', async () => {
  const sent = [];
  globalThis.__apiFetch = async (path, opts) => { sent.push({ path, body: opts.body }); return { ok: true }; };
  await m.applyBomSheet({ kind: 'orderLine', lineId: 5 }, 'B64', 'one');
  await m.previewBomSheet({ kind: 'orderLine', lineId: 5 }, 'B64', 'all');
  await m.applyBomSheet({ kind: 'orderLine', lineId: 5 }, 'B64');
  assert.deepEqual(sent.map((s) => s.body), [{ fileBase64: 'B64', links: 'one' }, { fileBase64: 'B64', dryRun: true, links: 'all' }, { fileBase64: 'B64' }]);
  assert.ok(sent[0].path.endsWith('/cf_erp/order-lines/5/sheet'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
