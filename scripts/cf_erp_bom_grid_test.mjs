// Run from multi_app_fe: node scripts/cf_erp_bom_grid_test.mjs
// DOM-level interaction tests. These do not replace a visual browser review.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MouseEvent', 'KeyboardEvent', 'Event']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const built = await build({ alias: { '@shared/ui': resolve('src/shared/ui/SheetGrid.tsx') }, stdin: { contents: `export * from './src/apps/cf_erp/components/Bom/BomGrid'; export * from './src/apps/cf_erp/components/Bom/bomArrangement'; export * from './src/apps/cf_erp/components/Bom/bomModel'; export * from './src/apps/cf_erp/lib/stripLayout'; export * from './src/apps/cf_erp/lib/codeSegments'; export * from './src/apps/cf_erp/components/Bom/FlowChoice'; export * from './src/apps/cf_erp/components/Bom/flowShown'; export * from './src/apps/cf_erp/components/Bom/ChoiceCell'; export * from './src/apps/cf_erp/components/Bom/selectionChoice'; export { LinkChip } from './src/apps/cf_erp/components/Bom/LinkChip'; export * from './src/apps/cf_erp/lib/links';`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic' });
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `bom-grid-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const node = (id, children = [], more = {}) => ({ id, key: `k${id}`, name: `Row ${id}`, code: null, kind: 'temporary', status: 'draft', depth: 1, quantity: 1, total: 1, lineId: id * 10, lineNo: id * 10, position: 1, role: null, selection: null, resolved: true, flow: null, bom: null, uom: 'nos', children, ...more });
const tree = node(1, [node(2, [node(4), node(5)]), node(3)], { lineId: null, depth: 0, quantity: 2, total: 2 });
const expanded = new Set(['k1', 'k2', 'k3', 'k4', 'k5']);
const project = (p) => m.arrangedRows(tree, expanded, p);
const saved = JSON.stringify(tree);
let p = m.NO_PENDING, rs = project(p);
const row = (id) => rs.find((r) => r.node.id === id && !r.paste);
await check('Copy inserts directly below source and preserves siblings', () => {
  p = m.duplicateBelow(p, row(4), { key: 'copy-1', source: row(4).node, sourceLineId: 40, parentId: 2, parentKey: 'k2', quantity: '1' });
  rs = project(p);
  assert.deepEqual(rs.map((r) => r.node.key), ['k1', 'k2', 'k4', 'copy-1', 'k5', 'k3']);
});
await check('Unsaved copy can move into another assembly', () => {
  p = m.moveRow(p, rs.find((r) => r.paste), row(3), 'inside'); rs = project(p);
  assert.equal(rs.find((r) => r.paste).parent.id, 3);
  assert.equal(rs.filter((r) => r.paste).length, 1);
});
await check('Moving an assembly carries children and updates totals', () => {
  p = m.moveRow(p, row(2), row(3), 'inside'); p = { ...p, quantity: { 30: '3' } }; rs = project(p);
  assert.equal(row(2).parent.id, 3); assert.equal(row(4).node.depth, 3); assert.equal(row(4).node.total, 6);
});
await check('Save resolves new-copy keys without losing IDs of moved rows', () => {
  const changes = m.pendingChanges(p, m.nodesByLine(tree)).changes;
  assert.equal(changes.find((ch) => ch.op === 'paste').key, 'copy-1');
  assert.deepEqual(changes.find((ch) => ch.op === 'arrange').groups.find((g) => g.parentId === 3).lineIds, ['copy-1', 20]);
});
await check('Undo copy removes it from all destination lists', () => { p = m.undoCopy(p, 'copy-1'); rs = project(p); assert.ok(!rs.some((r) => r.paste)); assert.ok(!Object.values(p.arrangement).flat().includes('copy-1')); });
await check('Draft moves never mutate the original tree', () => assert.equal(JSON.stringify(tree), saved));
await check('Copy then undo leaves no unsaved change', () => {
  const source = project(m.NO_PENDING).find((r) => r.node.id === 4);
  const draft = m.duplicateBelow(m.NO_PENDING, source, { key: 'copy-undo', source: source.node, sourceLineId: 40, parentId: 2, parentKey: 'k2', quantity: '1' });
  assert.equal(m.pendingChanges(m.pruneArrangement(m.undoCopy(draft, 'copy-undo'), tree), m.nodesByLine(tree)).changes.length, 0);
});
await check('Copy sends the quantity currently typed, even before source save', () => {
  const edit = { ...m.NO_PENDING, quantity: { 40: '7' } };
  const current = project(edit).find((r) => r.node.id === 4);
  const draft = m.duplicateBelow(edit, current, { key: 'copy-quantity', source: current.node, sourceLineId: 40, parentId: 2, parentKey: 'k2', quantity: '7' });
  assert.equal(m.pendingChanges(draft, m.nodesByLine(tree)).changes.find((ch) => ch.op === 'paste').quantity, 7);
});
await check('Shared subassemblies retain unique occurrence keys', () => {
  const a = node(9, [node(8, [], { key: 'left-child' })], { key: 'left' });
  const b = node(9, [node(8, [], { key: 'right-child' })], { key: 'right', lineId: 91 });
  const r = node(1, [a, b], { lineId: null });
  const rows = m.arrangedRows(r, new Set(['k1', 'left', 'right']), m.NO_PENDING);
  assert.deepEqual(rows.map((x) => x.node.key), ['k1', 'left', 'left-child', 'right', 'right-child']);
});

rs = project(m.NO_PENDING);
// (A plain value column, not a dimension — dimensions lead a row and are tested on their own below.)
const view = { editable: true, optionLists: {}, groups: [{ columns: [
  { code: 'LEN', name: 'Length', dataType: 'number', rule: 'entered', editable: true },
  { code: 'WEIGHT', name: 'Weight', dataType: 'number', rule: 'calculated', editable: false },
], rows: rs.map((r) => ({ id: r.node.id, readOnly: r.node.id === 5 ? 'Shared item' : undefined, cells: { LEN: { input: String(r.node.id * 100) }, WEIGHT: { display: '50' } } })) }] };
let writes = [];
const props = { rows: rs, view, pending: m.NO_PENDING, busy: false, canEdit: () => true, canEditValues: () => true,
  onWrites: (w) => { writes = w; }, onMove: () => {}, dropRefusal: () => null, onToggle: () => {}, trailingCell: () => null, flowCell: () => null, markOf: () => null, placeholderOf: () => null };
const root = createRoot(document.getElementById('app'));
const { MemoryRouter } = await import('react-router-dom');
// The grid links each row's name to its record, so it renders inside a router.
const render = (p = props) => React.act(() => root.render(React.createElement(MemoryRouter, { initialEntries: ['/acme/cf_erp/definitions/1?tab=bom'] }, React.createElement(m.BomGrid, p))));
const cell = (r, c) => document.querySelector(`[data-cell="${r}:${c}"]`);
/** A data cell by its column key (strip layout puts a key in a different slot per row). */
const cellKey = (r, key) => document.querySelector(`[data-cell^="${r}:"][data-col-key="${key}"]`);
const fire = async (el, type, init = {}) => React.act(() => el.dispatchEvent(type.startsWith('key') ? new KeyboardEvent(type, { bubbles: true, ...init }) : new MouseEvent(type, { bubbles: true, ...init })));
const clipboard = async (el, type, text = '') => {
  let copied;
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text, setData: (_, value) => { copied = value; } } });
  await React.act(() => el.dispatchEvent(event)); return copied;
};
await render();
await check('Single click selects a cell without opening an editor', async () => { await fire(cell(2, 3), 'click'); assert.equal(cell(2, 3).getAttribute('aria-selected'), 'true'); assert.equal(document.querySelectorAll('input').length, 0); });
await check('Selected cell copies its displayed value', async () => assert.equal(await clipboard(cell(2, 3), 'copy'), '400'));
await check('Single-cell paste writes the destination only', async () => { await clipboard(cell(2, 3), 'paste', '1250'); assert.equal(writes.length, 1); assert.equal(writes[0].row.node.id, 4); assert.equal(writes[0].text, '1250'); });
await check('Shift-click selects a range for Excel copy', async () => { await fire(cell(1, 3), 'click'); await fire(cell(2, 3), 'click', { shiftKey: true }); assert.equal(await clipboard(cell(2, 3), 'copy'), '200\n400'); });
await check('Paste one value fills an editable selection', async () => { await clipboard(cell(2, 3), 'paste', '999'); assert.equal(writes.length, 2); assert.ok(writes.every((w) => w.text === '999')); });
await check('Block paste refuses everything when it crosses a locked cell', async () => { writes = []; await fire(cell(2, 3), 'click'); await clipboard(cell(2, 3), 'paste', '900\n800'); assert.equal(writes.length, 0); assert.match(document.body.textContent, /Nothing pasted/); });
await check('Calculated cells remain read-only', async () => { await fire(cell(2, 4), 'dblclick'); assert.equal(document.querySelectorAll('input').length, 0); assert.equal(cell(2, 4).getAttribute('aria-readonly'), 'true'); });
await check('Double click opens the cell editor', async () => { await fire(cell(2, 3), 'dblclick'); assert.equal(document.querySelector('input[aria-label="Length"]').value, '400'); });
await check('Escape cancels the editor without writing', async () => { writes = []; await fire(document.querySelector('input'), 'keydown', { key: 'Escape' }); assert.equal(document.querySelectorAll('input').length, 0); assert.equal(writes.length, 0); });
await check('Typing begins replacement; Enter commits and moves down', async () => { await fire(cell(2, 3), 'keydown', { key: '7' }); assert.equal(document.querySelector('input').value, '7'); await fire(document.querySelector('input'), 'keydown', { key: 'Enter' }); assert.equal(writes[0].text, '7'); assert.equal(cell(3, 3).getAttribute('aria-selected'), 'true'); });
await check('Tab navigates without opening a value panel', async () => { await fire(cell(1, 3), 'click'); await fire(cell(1, 3), 'keydown', { key: 'Tab' }); assert.equal(cell(1, 4).getAttribute('aria-selected'), 'true'); });
await check('Root quantity is read-only', () => assert.equal(cell(0, 1).getAttribute('aria-readonly'), 'true'));
await check('Dragging the handle advertises before/inside/after and moves the row', async () => {
  let moved;
  await render({ ...props, onMove: (...args) => { moved = args; } });
  const handle = document.querySelector('[aria-label="Move Row 4"]');
  const target = cell(4, 0).closest('tr');
  target.getBoundingClientRect = () => ({ top: 100, height: 100 });
  const dt = { setData: () => {}, effectAllowed: '', dropEffect: '' };
  const dragEvent = async (el, type, y) => { const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: y }); Object.defineProperty(e, 'dataTransfer', { value: dt }); await React.act(() => el.dispatchEvent(e)); };
  await dragEvent(handle, 'dragstart', 0);
  await dragEvent(target, 'dragover', 110); assert.match(target.textContent, /Before this row/);
  await dragEvent(target, 'dragover', 150); assert.match(target.textContent, /Into Row 3/);
  await dragEvent(target, 'dragover', 195); assert.match(target.textContent, /After this row/);
  await dragEvent(target, 'drop', 195); assert.equal(moved[0].node.id, 4); assert.equal(moved[1].node.id, 3); assert.equal(moved[2], 'after');
});
await check('Saving disables cell writes and dragging', async () => { writes = []; await render({ ...props, busy: true }); await fire(cell(2, 3), 'click'); await clipboard(cell(2, 3), 'paste', '500'); assert.equal(writes.length, 0); assert.ok([...document.querySelectorAll('[draggable]')].every((el) => el.getAttribute('draggable') === 'false')); });
const resolution = { mode: 'setup', specs: [{ spec: { code: 'WIDTH', name: 'Width', dataType: 'number' }, captureAt: 'item', applicable: true, rule: { valueRule: 'fixed', isRequired: false }, value: { raw: 150, display: '150', from: 'here', source: 'entered' } }] };
await render({ ...props, view: null, records: { get: () => ({ resolution }) }, canEditValues: (r) => r.node.depth === 0 });
await check('Definition root keeps editable setup values', async () => { assert.equal(cellKey(0, 'WIDTH').getAttribute('aria-readonly'), 'false'); await fire(cellKey(0, 'WIDTH'), 'dblclick'); assert.equal(document.querySelector('input').value, '150'); await fire(document.querySelector('input'), 'keydown', { key: 'Escape' }); });
await check('Definition children keep specifications locked but quantities editable', () => { assert.equal(cellKey(1, 'WIDTH').getAttribute('aria-readonly'), 'true'); assert.equal(cell(1, 1).getAttribute('aria-readonly'), 'false'); });
await check('Locked child cell can still be copied', async () => { await fire(cellKey(1, 'WIDTH'), 'click'); assert.equal(await clipboard(cellKey(1, 'WIDTH'), 'copy'), '150'); });

// ── cut pieces, descriptions, columns the rows use ───────────────────────────
await check('Cut pieces are left out of the drawn rows, and its part loses the chevron goes', () => {
  const cutPlate = node(7, [node(8, [], { role: 'Raw plate', name: 'Plate (cut to size)' })], { role: 'Cut from', name: 'Cut plate 25 × 500 × 11650 E350' });
  const part = node(6, [cutPlate], { name: 'Flange plate' });
  const t2 = node(1, [part, node(9)], { lineId: null, depth: 0 });
  const all = m.arrangedRows(t2, new Set(['k1', 'k6', 'k7']), m.NO_PENDING);
  assert.equal(all.length, 5);
  const hidden = m.withoutCutPieces(all);
  assert.deepEqual(hidden.map((r) => r.node.id), [1, 6, 9]);
  assert.equal(hidden.find((r) => r.node.id === 6).hasChildren, false);
  assert.equal(m.isCutPiece(cutPlate) && m.isCutPiece(cutPlate.children[0]) && !m.isCutPiece(part), true);
});
await check('A part with other children keeps its chevron when only the cut plate is hidden', () => {
  const part = node(6, [node(7, [], { role: 'Cut from' }), node(8)], { name: 'Part' });
  const hidden = m.withoutCutPieces(m.arrangedRows(node(1, [part], { lineId: null, depth: 0 }), new Set(['k1', 'k6']), m.NO_PENDING));
  assert.deepEqual(hidden.map((r) => r.node.id), [1, 6, 8]);
  assert.equal(hidden[1].hasChildren, true);
});
await check('A typed description is sent as a role change; unchanged text sends nothing', () => {
  const byLine = m.nodesByLine(tree);
  const one = m.pendingChanges({ ...m.NO_PENDING, role: { 40: ' Left end ' } }, byLine).changes;
  assert.deepEqual(one, [{ op: 'role', lineId: 40, role: 'Left end' }]);
  assert.equal(m.pendingChanges({ ...m.NO_PENDING, role: { 40: '' } }, byLine).changes.length, 0);
  assert.deepEqual(m.pendingChanges({ ...m.NO_PENDING, role: { 40: '  ' }, quantity: {} }, m.nodesByLine(node(1, [node(4, [], { role: 'End' })], { lineId: null }))).changes, [{ op: 'role', lineId: 40, role: null }]);
});
await check('A copy keeps its source description and is made at once (no "(copy)", no "Copy of")', async () => {
  const fsx = await import('node:fs');
  const dir = new URL('../src/apps/cf_erp/components/Bom/', import.meta.url);
  const panel = fsx.readFileSync(new URL('BomPanel.tsx', dir), 'utf8');
  const tree = fsx.readFileSync(new URL('BomTree.tsx', dir), 'utf8');
  const grid = fsx.readFileSync(new URL('BomGrid.tsx', dir), 'utf8');
  for (const [name, text] of [['BomPanel', panel], ['BomTree', tree], ['BomGrid', grid]]) {
    for (const bad of ['(copy)', 'Copy of ', 'Save to edit this copy']) assert.ok(!text.includes(bad), `${name} still words a copy as a copy: ${bad}`);
  }
  // The Copy button sends ONE paste change straight away, after the source, with the source's own description.
  const dup = panel.slice(panel.indexOf('const duplicate = async'), panel.indexOf('const dropRefusal'));
  assert.ok(dup.includes("bom.saveChanges([{ op: 'paste', sourceLineId: lineId, parentId: row.parent.id, afterLineId: lineId"), 'one paste, right after the source');
  assert.ok(dup.includes('role: roleOf(row)'), "with the source's own description");
  assert.ok(!/setPending/.test(dup), 'a copy must not wait in the pending state');
});
const roleProps = { ...props, view, pending: m.NO_PENDING, records: undefined, canEditValues: () => true, canEdit: () => true };
let roleSaved = [];
const roles = { 4: 'Girder G1' };
const roleGrid = { ...roleProps, rows: rs, roleOf: (r) => roles[r.node.id] ?? r.node.role, canEditRole: (r) => r.node.id === 4, onRole: (r, t) => { roleSaved.push([r.node.id, t]); } };
await render(roleGrid);
await check('Line 1 is the name only: the description is its tooltip, not text', () => {
  const link = [...document.querySelectorAll('a')].find((a) => a.textContent === 'Row 4');
  assert.ok(link, 'the name is there');
  assert.doesNotMatch(document.body.textContent, /Girder G1/, 'the description is not drawn');
  assert.equal(link.parentElement.textContent, 'Row 4');
  assert.equal(link.parentElement.getAttribute('title'), 'Row 4 · Girder G1 — double-click to change the description');
});
await check('There is no description pencil any more (the description is edited under ⋯ → Edit line details)', () => {
  assert.equal(document.querySelectorAll('[aria-label^="Edit description of"]').length, 0);
});
await check('One name per row: a role that repeats the name is not shown twice', async () => {
  assert.equal(m.rowLabel('Web', 'web'), 'Web');
  assert.equal(m.rowLabel('Web', '  WEB  '), 'Web');
  assert.equal(m.rowLabel('Top  flange', 'top flange'), 'Top  flange');
  assert.equal(m.rowLabel('Cover plate', 'Top flange outer'), 'Cover plate · Top flange outer');
  assert.equal(m.rowLabel('Plate (cut to size)', 'Raw plate'), 'Plate (cut to size) · Raw plate');
  assert.equal(m.rowLabel('Web', null), 'Web');
  await render({ ...roleGrid, roleOf: (r) => (r.node.id === 5 ? 'row 5' : roles[r.node.id] ?? r.node.role) });
  assert.doesNotMatch(document.body.textContent, /Row 5 · row 5/i);
  assert.match(document.body.textContent, /Row 5/);
  assert.ok([...document.querySelectorAll('[title^="Row 4 · Girder G1"]')].length === 1, 'the description rides on the name as a tooltip');
  await render(roleGrid);
});
await check('Adding the same item twice asks for no name — there is no repeat prompt any more', () => {
  assert.equal(m.nameProblem, undefined);
  const dialogs = readFileSync(resolve('src/apps/cf_erp/components/BomDialogs.tsx'), 'utf8');
  assert.doesNotMatch(dialogs, /USE_NAME_REQUIRED|already in this BOM|siblingIds/);
});
await check('Double-clicking the name opens an input; Enter saves the typed description', async () => {
  await fire([...document.querySelectorAll('[title^="Row 4 · Girder G1"]')][0], 'dblclick');
  const input = document.querySelector('input[aria-label="Description of Row 4"]');
  assert.equal(input.value, 'Girder G1');
  const set = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await React.act(async () => { set.call(input, 'Girder G2'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await fire(document.querySelector('input[aria-label="Description of Row 4"]'), 'keydown', { key: 'Enter' });
  assert.deepEqual(roleSaved, [[4, 'Girder G2']]);
  assert.equal(document.querySelector('input[aria-label="Description of Row 4"]'), null);
});
await check('Double-clicking the label opens it too, and Escape changes nothing', async () => {
  roleSaved = [];
  // The name inside it is a link to the record; the rest of the label still opens the description.
  const label = [...document.querySelectorAll('div')].find((d) => d.getAttribute('title')?.startsWith('Row 4 · Girder G1') && d.querySelector(':scope > a'));
  await fire(label, 'dblclick');
  assert.ok(document.querySelector('input[aria-label="Description of Row 4"]'));
  await fire(document.querySelector('input[aria-label="Description of Row 4"]'), 'keydown', { key: 'Escape' });
  assert.equal(document.querySelector('input[aria-label="Description of Row 4"]'), null);
  assert.deepEqual(roleSaved, []);
});
await check('A legacy pending copy is just marked new (no "Save to edit this copy")', async () => {
  const c = m.duplicateBelow(m.NO_PENDING, row(4), { key: 'copy-h', source: row(4).node, sourceLineId: 40, parentId: 2, parentKey: 'k2', quantity: '1' });
  await render({ ...roleGrid, rows: m.arrangedRows(tree, expanded, c), pending: c });
  assert.ok(document.body.textContent.includes('New copy') && !document.body.textContent.includes('Save to edit this copy'));
});
const colView = { editable: true, optionLists: {}, groups: [{ columns: [
  { code: 'LENGTH', name: 'Length', dataType: 'number', rule: 'entered', editable: true },
  { code: 'HOLED', name: 'Holed', dataType: 'boolean', rule: 'entered', editable: true },
], rows: rs.map((r) => ({ id: r.node.id, cells: r.node.id === 4 ? { LENGTH: { input: '1' } } : { LENGTH: { input: '2' } } })) }] };
// (The "Line up all columns" mode is gone: a row shows only its own cells, each with its label.)
await check('A row name opens its record and carries the way back to this BOM', async () => {
  await render();
  const links = [...document.querySelectorAll('a')].filter((a) => a.textContent === 'Row 2');
  assert.equal(links.length, 1, 'Row 2 is a link');
  assert.equal(links[0].getAttribute('href'), '/acme/cf_erp/items/2');
  assert.ok(![...document.querySelectorAll('a')].some((a) => a.textContent === 'Row 1'), 'the record itself is not a link');
});
await React.act(() => root.render(null));
// HOLED is declared by the group but no row has a cell for it: nobody can use it, so it is never drawn.
await check('Only columns some row uses: an unused column is never drawn', async () => {
  await render({ ...props, view: colView });
  assert.ok(document.querySelector('[data-col-key="LENGTH"]'));
  assert.equal(document.querySelector('[data-col-key="HOLED"]'), null);
});
// ── not applicable vs missing ────────────────────────────────────────────────
const naView = { editable: true, optionLists: {}, groups: [{ columns: [
  { code: 'LENGTH', name: 'Length', dataType: 'number', rule: 'entered', editable: true },
  { code: 'HOLED', name: 'Holed', dataType: 'boolean', rule: 'entered', editable: true },
], rows: rs.map((r) => ({ id: r.node.id, cells: r.node.id === 4 ? { LENGTH: { input: '' }, HOLED: { input: 'true' } } : { LENGTH: { input: '2' } } })) }] };
const naProps = { ...props, view: naView, gaps: new Map([[4, ['LENGTH']]]) };
await render(naProps);
// rs order: k1(row 0), k2, k4, k5, k3; data columns: 1 Quantity, 2 Total, then the value columns (editable first, in order).
const colOf = (name) => [...document.querySelectorAll('thead th')].findIndex((t) => t.textContent.startsWith(name));
await check('A variable the row does not have is not drawn on that row; a row that has it draws a normal cell', () => {
  assert.equal(cellKey(1, 'HOLED'), null, 'row 2 has no Holed');
  const c = cellKey(2, 'HOLED');
  assert.equal(c.getAttribute('data-na'), null); assert.equal(c.getAttribute('aria-readonly'), 'false');
});
await check('A required value that is empty is missing (amber), not not-applicable', () => {
  const c = cellKey(2, 'LENGTH');
  assert.equal(c.getAttribute('data-na'), null); assert.match(c.getAttribute('title'), /Missing/);
});
await check('Only what is missing: a row shows just its missing cells (no Qty, no Total, no other value); rows with none show no value cells', async () => {
  await React.act(() => root.render(null));
  localStorage.setItem('ui:sheetgrid.lineUp.bom-grid', 'true'); // an old "line up" choice is ignored: there is one layout
  await render({ ...naProps, onlyMissing: new Map([[4, ['LENGTH']]]) });
  const dataCells = [...document.querySelectorAll('td.sg-data')];
  assert.equal(dataCells.length, 1, dataCells.map((c) => c.getAttribute('data-col-key')).join(','));
  assert.equal(dataCells[0].getAttribute('data-col-key'), 'LENGTH');
  assert.match(dataCells[0].getAttribute('title'), /Missing/);
  assert.equal(document.querySelector('[data-layout]').getAttribute('data-layout'), 'strip');
  assert.equal(document.querySelector('[data-testid="sheet-grid-line-up"]'), null, 'no Line up switch');
  localStorage.removeItem('ui:sheetgrid.lineUp.bom-grid');
  await render(naProps);
  assert.ok([...document.querySelectorAll('td.sg-data')].length > 1, 'off: every cell of the rows again');
});
const resNa = { mode: 'setup', specs: [{ spec: { code: 'WIDTH', name: 'Width', dataType: 'number' }, applicable: true, rule: { valueRule: 'fixed', isRequired: false }, value: { raw: 150, display: '150' } }, { spec: { code: 'DEPTH', name: 'Depth', dataType: 'number' }, applicable: false, rule: { valueRule: 'fixed', isRequired: false } }] };
await render({ ...props, view: null, records: { get: (id) => (id === 1 ? { resolution: { ...resNa, specs: [...resNa.specs, { ...resNa.specs[1], spec: { code: 'DEPTH', name: 'Depth', dataType: 'number' }, applicable: true }] } } : { resolution: resNa }) }, canEditValues: () => true });
await check('Record BOMs: an inapplicable spec is not drawn, an applicable one is', () => {
  assert.equal(cellKey(1, 'DEPTH'), null);
  assert.equal(cellKey(0, 'DEPTH').getAttribute('data-na'), null);
  assert.equal(cellKey(1, 'WIDTH').getAttribute('data-na'), null);
});
await check('Record BOM rows show their position code, the same child twice with two codes', async () => {
  const twin = (id, more = {}) => node(id, [], { kind: 'template', code: 'SEG-002', name: 'Girder segment', ...more });
  const kit = node(1, [twin(2), twin(3), node(4, [], { kind: 'catalog', code: 'BLT-9', name: 'Bolt', quantity: 4 })], { kind: 'template', code: 'GLINE-002', lineId: null, depth: 0 });
  const codes = { k1: 'GLINE-002', k2: 'GLINE-002-SEG1', k3: 'GLINE-002-SEG2', k4: 'GLINE-002-BLT1-4' };
  const recRows = m.arrangedRows(kit, new Set(['k1', 'k2', 'k3', 'k4']), m.NO_PENDING);
  await render({ ...props, rows: recRows, placeholderOf: (r) => (codes[r.node.key] ? { code: codes[r.node.key], title: 'position', itemCode: r.node.code } : null) });
  const shown = [...document.querySelectorAll('[data-testid="row-code"]')].map((e) => e.textContent);
  assert.ok(shown.includes('GLINE-002-SEG1') && shown.includes('GLINE-002-SEG2'), shown.join(', '));
  assert.ok(shown.includes('GLINE-002-BLT1-4'));
  assert.match(document.body.textContent, /GLINE-002-SEG1 · SEG-002/);
  assert.equal([...document.body.textContent.matchAll(/Girder segment/g)].length >= 2, true);
  await render();
});
// ── the row header: name, flow and chips on line 1; the whole code on line 2 ──────
const longCode = 'SO260002-SPAN-01-G2-SEG4-WEB-STIFFENER-INTERMEDIATE-LONGER-THAN-ANY-CELL-L5';
const codeGrid = (codes, over = {}) => ({ ...props, flowCell: () => React.createElement('button', { 'data-testid': 'flow-chip' }, 'GIRDER-SEGMENT DEFAULT'),
  trailingCell: () => React.createElement('button', { 'aria-label': 'Copy it below' }, 'c'), placeholderOf: (r) => codes[r.node.id] ?? null, ...over });
await check('Line 1 holds the name and the flow chip; the code is on its own line below, with no description beside it', async () => {
  await render(codeGrid({ 4: { code: 'A-B', title: 'position' } }, { roleOf: () => 'Girder G1' }));
  const head = cell(2, 0);
  const line1 = head.querySelector('a').parentElement.parentElement;
  assert.ok(line1.querySelector('[data-testid="flow-chip"]'), 'the flow chip shares line 1 with the name');
  assert.ok(!line1.querySelector('[data-testid="row-code"]'), 'the code is not on line 1');
  const below = head.querySelector('[data-testid="sg-rowhead-below"]');
  assert.ok(below && below.querySelector('[data-testid="row-code"]'), 'the code is on the second line');
  assert.doesNotMatch(head.textContent, /Girder G1/);
});
await check('A long code is in the DOM whole — no ellipsis style, wrapping allowed', async () => {
  await render(codeGrid({ 4: { code: longCode, title: 'position' } }));
  const code = cell(2, 0).querySelector('[data-testid="row-code"]');
  assert.equal(code.textContent, longCode);
  const line = cell(2, 0).querySelector('[data-testid="row-code-line"]');
  for (const el of [code, line]) { const css = window.getComputedStyle(el); assert.notEqual(css.textOverflow, 'ellipsis'); assert.notEqual(css.whiteSpace, 'nowrap'); }
  assert.notEqual(window.getComputedStyle(line).overflow, 'hidden');
});
await check('Each # shows the numbers it takes, in brackets: (1,2,3), (5,6), (1–16), nested', async () => {
  const hole = (from, to, values) => ({ from, to, ...(values ? { values } : {}) });
  assert.equal(m.codeWithNumbers('SO260002-CG#-L4', [{ text: 'SO260002-CG' }, hole(1, 3, [1, 2, 3]), { text: '-L4' }]), 'SO260002-CG(1,2,3)-L4');
  assert.equal(m.codeWithNumbers('EDP#', [{ text: 'EDP' }, hole(5, 6, [5, 6])]), 'EDP(5,6)');
  assert.equal(m.codeWithNumbers('IDP#', [{ text: 'IDP' }, hole(1, 16)]), 'IDP(1–16)');
  assert.equal(m.codeWithNumbers('BLB#', [{ text: 'BLB' }, hole(1, 60)]), 'BLB(1–60)');
  assert.equal(m.codeWithNumbers('X#', [{ text: 'X' }, hole(1, 6, [1, 2, 3, 4, 5, 6])]), 'X(1,2,3,4,5,6)');
  assert.equal(m.codeWithNumbers('X#', [{ text: 'X' }, hole(1, 7)]), 'X(1–7)', 'more than six: a range');
  assert.equal(m.codeWithNumbers('CG#-L#-STP1', [{ text: 'CG' }, hole(1, 3, [1, 2, 3]), { text: '-L' }, hole(1, 4, [1, 2, 3, 4]), { text: '-STP1' }]), 'CG(1,2,3)-L(1,2,3,4)-STP1');
  assert.equal(m.codeWithNumbers('A-#', null), 'A-#', 'no segments from the backend: the plain code');
  await render(codeGrid({ 4: { code: 'SO260002-CG#-L#-STP1', title: 'position', segments: [{ text: 'SO260002-CG' }, hole(1, 3, [1, 2, 3]), { text: '-L' }, hole(1, 16), { text: '-STP1' }] } }));
  assert.equal(cell(2, 0).querySelector('[data-testid="row-code"]').textContent, 'SO260002-CG(1,2,3)-L(1–16)-STP1');
  assert.equal(cell(2, 0).querySelector('[data-testid="row-code-line"]').getAttribute('title'), m.CODE_NUMBERS_TITLE);
  assert.equal(m.CODE_NUMBERS_TITLE, 'Codes are given when the design is frozen. The numbers in brackets are the copies this row stands for.');
});
// ── line 1: the row's own part of the code, beside its name ─────────────────────
const hl = (from, to, values) => ({ from, to, ...(values ? { values } : {}) });
const T = (text) => ({ text });
const CG = [T('SO260002-CG'), hl(1, 3, [1, 2, 3])];
const L1 = [...CG, T('-L1')], L12 = [...L1, T('-2')], IS = [...L12, T('-IS'), hl(1, 12)];
const EDP = [...CG, T('-EDP'), hl(1, 2, [1, 2])], SFP = [...CG, T('-L2-STP1-SFP'), hl(1, 4)];
const ownChips = () => [...document.querySelectorAll('[data-testid="row-own-code"]')].map((e) => e.textContent);
const chain = (specs, over = {}) => {
  // specs: [name, placeholder, parentNumber]; the parent defaults to the top row.
  const rowsOf = specs.map(([name, ph, parent], i) => ({ id: i + 1, name, ph, parent: parent ?? 1 }));
  const build = (r) => node(r.id, rowsOf.filter((c) => c.id !== 1 && c.parent === r.id).map(build), { name: r.name, kind: 'template', ...(r.id === 1 ? { lineId: null, depth: 0 } : {}) });
  const top = build(rowsOf[0]);
  const by = new Map(rowsOf.map((r) => [r.id, r.ph]));
  return { ...codeGrid({}, { placeholderOf: (r) => by.get(r.node.id) ?? null, ...over }), rows: m.arrangedRows(top, new Set(rowsOf.map((r) => 'k' + r.id)), m.NO_PENDING) };
};
const ph = (code, segments) => ({ code, title: 't', segments });
await check('Own part of the code beside the name: CG(1,2,3), L1, 2, IS(1–12), EDP(1,2), SFP(1–4)', async () => {
  await render(chain([
    ['Composite girder span', ph('SO260002-CG#', CG)], ['Girder line', ph('SO260002-CG#-L1', L1), 1], ['Girder segment', ph('SO260002-CG#-L1-2', L12), 2],
    ['Intermediate stiffener', ph('SO260002-CG#-L1-2-IS#', IS), 3], ['End diaphragm', ph('SO260002-CG#-EDP#', EDP), 1],
    ['Girder line 2', ph('SO260002-CG#-L2', [...CG, T('-L2')]), 1], ['Stiffener', ph('SO260002-CG#-L2-STP1', [...CG, T('-L2-STP1')]), 6], ['Stiffener plate', ph('SO260002-CG#-L2-STP1-SFP#', SFP), 7]], { orderCode: 'SO260002' }));
  assert.deepEqual(ownChips(), ['CG(1,2,3)', 'L1', '2', 'IS(1–12)', 'EDP(1,2)', 'L2', 'STP1', 'SFP(1–4)']);
  const chip = document.querySelector('[data-testid="row-own-code"]');
  assert.equal(chip.getAttribute('title'), "This row's own part of the code.");
  assert.equal(window.getComputedStyle(chip).fontFamily.includes('mono'), true);
  const line1 = chip.parentElement;
  const kids = [...line1.children].map((e) => e.getAttribute('data-testid') ?? e.tagName);
  assert.ok(kids.indexOf('row-own-code') > 0 && kids.indexOf('row-own-code') < kids.indexOf('flow-chip'), kids.join());
  assert.equal(window.getComputedStyle(line1).flexWrap, 'wrap', 'the flow chip wraps before anything is cut');
  const fulls = [...document.querySelectorAll('[data-testid="row-code"]')].map((e) => e.textContent);
  assert.equal(fulls[3], 'SO260002-CG(1,2,3)-L1-2-IS(1–12)', 'the full code below is unchanged');
});
await check('Own part falls back to the code minus the parent code when segments are missing; nothing when that fails', async () => {
  await render(chain([['Top', ph('SO1-A', null)], ['Kid', ph('SO1-A-B2', null)], ['Odd', ph('ZZZ', null)]]));
  assert.deepEqual(ownChips(), ['SO1-A', 'B2'], 'the top row has no order code so its whole code shows; Odd shows nothing');
});
await check('Top row without a known order prefix shows its whole code; with a known one only what follows', async () => {
  await render(chain([['Top', ph('SO260002-CG#', CG)]]));
  assert.deepEqual(ownChips(), ['SO260002-CG(1,2,3)']);
  await render(chain([['Top', ph('SO260002-CG#', CG)]], { orderCode: 'SO260002' }));
  assert.deepEqual(ownChips(), ['CG(1,2,3)']);
});
await check('A catalog row with no code shows its item code (STUD-002)', async () => {
  const g = chain([['Girder line', ph('SO260002-CG#-L1', L1)], ['Shear stud', null]]);
  g.rows[1].node.kind = 'catalog'; g.rows[1].node.code = 'STUD-002';
  await render(g);
  assert.ok(ownChips().includes('STUD-002'), ownChips().join());
});
await check('The action buttons keep their labels exactly (the grid does not rename them)', async () => {
  await render(codeGrid({}, { canEdit: () => true }));
  assert.ok(document.querySelector('[aria-label="Move Row 4"]'));
  assert.ok(document.querySelector('[aria-label="Collapse Row 2"]'));
  assert.ok(document.querySelector('[aria-label="Copy it below"]'), 'the trailing cell is still drawn in the header');
});
await check('A long column label wraps onto two lines (line clamp 2, no ellipsis cut) and the cell tooltip carries the full name', async () => {
  const longView = { editable: true, optionLists: {}, groups: [{ columns: [
    { code: 'HOLES_GIRDER_TOP', name: 'Holes - girder top flange', dataType: 'number', rule: 'entered', editable: true },
    { code: 'LEN2', name: 'Len', dataType: 'number', rule: 'entered', editable: true },
  ], rows: rs.map((r) => ({ id: r.node.id, cells: { HOLES_GIRDER_TOP: { input: '4' }, LEN2: { input: '2' } } })) }] };
  await React.act(() => root.render(null));
  await render({ ...props, view: longView });
  const long = document.querySelector('[data-col-key="HOLES_GIRDER_TOP"]');
  assert.equal(long.getAttribute('data-name'), 'Holes - girder top flange', 'the whole name, not cut to 14 letters');
  assert.equal(long.getAttribute('data-label-lines'), '2');
  assert.match(long.getAttribute('title'), /^Holes - girder top flange — /);
  assert.equal(document.querySelector('[data-col-key="LEN2"]').getAttribute('data-label-lines'), null, 'a short name stays on one line');
  const css = [...document.styleSheets].flatMap((sh) => [...sh.cssRules].map((r) => r.cssText)).join(' ');
  assert.match(css, /-webkit-line-clamp:\s*2/);
  const rule = css.split('}').find((r) => r.includes('::before') && r.includes('attr(data-name)')) ?? '';
  assert.match(rule, /white-space:\s*normal/); assert.doesNotMatch(rule, /nowrap|text-overflow:\s*ellipsis/);
  assert.equal(m.sheetLabel('ANY', 'Hole drilling thickness'), 'Hole drilling thickness');
  assert.equal(m.shortLabel('ANY', 'Hole drilling thickness') === 'Hole drilling thickness', false, 'shortLabel still cuts (the grid no longer uses it)');
});
await check('A narrow window makes the grid read-only and says so in one plain line above it', async () => {
  const stub = (narrow) => { window.matchMedia = (q) => ({ matches: narrow && q === '(max-width:599.95px)', media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }); };
  await React.act(() => root.render(null));
  stub(true);
  await render();
  const note = document.querySelector('[data-testid="sheet-grid-narrow-note"]');
  assert.ok(note, 'the note is there');
  assert.equal(note.textContent, 'This window is too narrow to edit here. Widen it to change values.');
  assert.equal(cell(2, 3).getAttribute('aria-readonly'), 'true', 'and the cells are read-only');
  await React.act(() => root.render(null));
  stub(false);
  await render();
  assert.equal(document.querySelector('[data-testid="sheet-grid-narrow-note"]'), null, 'a wide window has no note');
  assert.equal(cell(2, 3).getAttribute('aria-readonly'), 'false');
});
await render();
// ── strip layout: dimensions first (Thk · L · W), only a row's own cells ─────
await check('Relevance: Total only when it differs from Qty; Ship unit only on assemblies / answered rows; roll-up weight last', () => {
  assert.equal(m.totalAdds(1, 1), false); assert.equal(m.totalAdds(2, 4), true);
  assert.equal(m.shipUnitRelevant(false, '', false), false, 'a part with no answer carries no ship-unit cell');
  assert.equal(m.shipUnitRelevant(true, '', false), true, 'an assembly does');
  assert.equal(m.shipUnitRelevant(false, 'true', false), true, 'a row that answered keeps it');
  assert.equal(m.shipUnitRelevant(false, '', true), true, 'a required-but-missing value is never hidden');
  assert.deepEqual(m.rollupsLast(['WEIGHT', 'GRADE', 'SHIP_UNIT']), ['GRADE', 'SHIP_UNIT', 'WEIGHT']);
});
await check('dimensionsFirst: one dimension → all three lead, in the order Thk, L, W', () => {
  assert.deepEqual(m.DIMENSION_CODES, ['THICKNESS', 'LENGTH', 'WIDTH']);
  assert.deepEqual(m.dimensionsFirst(['GRADE', 'WIDTH']), ['THICKNESS', 'LENGTH', 'WIDTH', 'GRADE']);
  assert.deepEqual(m.dimensionsFirst(['WIDTH', 'GRADE', 'LENGTH', 'THICKNESS', 'HOLED']), ['THICKNESS', 'LENGTH', 'WIDTH', 'GRADE', 'HOLED']);
});
await check('dimensionsFirst: none → skipped altogether, the rest keep their order', () => {
  assert.deepEqual(m.dimensionsFirst(['GRADE', 'HOLED']), ['GRADE', 'HOLED']);
  assert.deepEqual(m.dimensionsFirst([]), []);
});
await check('short labels: Thk / L / W for the dimensions, a cut name otherwise', () => {
  assert.equal(m.shortLabel('THICKNESS', 'Thickness'), 'Thk'); assert.equal(m.shortLabel('LENGTH', 'Length'), 'L'); assert.equal(m.shortLabel('WIDTH', 'Width'), 'W');
  assert.equal(m.shortLabel('ZZ', 'Coat'), 'Coat');
  assert.equal(m.shortLabel('ZZ', 'A very long specification name'), 'A very long s…');
  assert.equal(m.opShortLabel({ code: 'WLD', name: 'Welding' }), 'Welding');
  assert.equal(m.opShortLabel({ code: 'SAW', name: 'Submerged arc welding' }), 'SAW');
});
await React.act(() => root.render(null));
localStorage.removeItem('ui:sheetgrid.lineUp.bom-grid');
const dimCol = (code, name, more = {}) => ({ code, name, dataType: 'number', rule: 'entered', editable: true, unit: 'mm', ...more });
const dimView = { editable: true, optionLists: {}, groups: [{ columns: [
  dimCol('GRADE', 'Grade', { dataType: 'option', unit: null }), dimCol('THICKNESS', 'Thickness'), dimCol('LENGTH', 'Length'), dimCol('WIDTH', 'Width'),
], rows: rs.map((r) => ({ id: r.node.id, cells: r.node.id === 4 ? { THICKNESS: { input: '12' }, GRADE: { input: '' } }
  : r.node.id === 5 ? { GRADE: { input: '' } }
    : r.node.id === 2 ? { WIDTH: { input: '300' }, LENGTH: { input: '9000' }, THICKNESS: { input: '10' } } : {} })) }] };
await render({ ...props, view: dimView });
const rowIdx = (id) => rs.findIndex((r) => r.node.id === id);
const keysIn = (id) => [...document.querySelectorAll(`[data-cell^="${rowIdx(id)}:"][data-col-key]`)].map((td) => td.getAttribute('data-col-key'));
const labelsAbove = (id) => [...document.querySelectorAll(`[data-cell^="${rowIdx(id)}:"][data-col-key]`)].map((td) => td.getAttribute('data-name'));
await check('Structure grid draws the strip layout by default', () => assert.equal(document.querySelector('table').getAttribute('data-layout'), 'strip'));
await check('A row with ONE dimension shows all three first (Thk · L · W); the ones it lacks are n/a so rows line up', () => {
  assert.deepEqual(keysIn(4), ['$quantity', '$total', 'THICKNESS', 'LENGTH', 'WIDTH', 'GRADE']);
  assert.equal(document.querySelector(`[data-cell^="${rowIdx(4)}:"][data-col-key="LENGTH"]`).getAttribute('data-na'), 'true');
  assert.equal(document.querySelector(`[data-cell^="${rowIdx(4)}:"][data-col-key="THICKNESS"]`).textContent, '12');
});
await check('A row with all three dimensions shows them first too, in the same slots', () => {
  assert.deepEqual(keysIn(2), ['$quantity', '$total', 'THICKNESS', 'LENGTH', 'WIDTH']);
});
await check('A row with NO dimension skips them altogether', () => {
  assert.deepEqual(keysIn(5), ['$quantity', '$total', 'GRADE']);
  assert.deepEqual(keysIn(3), ['$quantity', '$total']);
});
await check('Each cell names itself inside the box (short label + unit); no label lines; a drop-down keeps its caret', () => {
  assert.equal(document.querySelectorAll('.sg-labelrow').length, 0, 'no label lines');
  assert.deepEqual(labelsAbove(4), ['Qty', 'Total', 'Thk mm', 'L mm', 'W mm', 'Grade']);
  assert.deepEqual(labelsAbove(5), ['Qty', 'Total', 'Grade']);
  const grade = document.querySelector(`[data-cell^="${rowIdx(4)}:"][data-col-key="GRADE"]`);
  assert.equal(grade.getAttribute('data-dropdown'), 'true');
});
await check('Typing a value then ArrowRight keeps it and moves to the next cell of the row', async () => {
  writes = [];
  const thk = document.querySelector(`[data-cell^="${rowIdx(2)}:"][data-col-key="THICKNESS"]`);
  await fire(thk, 'click'); await fire(thk, 'keydown', { key: '8' });
  await fire(document.querySelector('input'), 'keydown', { key: 'ArrowRight' });
  assert.deepEqual(writes.map((w) => [w.row.node.id, w.code, w.text]), [[2, 'THICKNESS', '8']]);
  assert.equal(document.querySelector(`[data-cell^="${rowIdx(2)}:"][data-col-key="LENGTH"]`).getAttribute('aria-selected'), 'true');
});

// ── operation flow: default vs changed, reset, bulk ──────────────────────────
const gs = { id: 7, code: 'GS-FLOW', name: 'Girder standard', from: 'template' };
const flowRows = [
  node(21, [], { name: 'Web', flow: { ...gs } }),
  node(22, [], { name: 'Flange', flow: { id: 8, code: 'FL-CUSTOM', name: 'Flange special', from: 'line', usual: { id: 7, code: 'GS-FLOW', name: 'Girder standard', from: 'template' } } }),
  node(23, [], { name: 'Stiffener', flow: null }),
  node(24, [], { name: 'Bolt', kind: 'catalog', flow: null }),
];
const lookup = (id) => ({ 7: gs, 8: { id: 8, code: 'FL-CUSTOM', name: 'Flange special' }, 9: { id: 9, code: 'FL-NEW', name: 'New one' } })[id];
const [web, flange, stiff, bolt] = flowRows;
await check('A flow from the template shows as default; one set on the line shows as changed', () => {
  assert.equal(m.flowShown(web, {}, lookup).tag, 'default');
  assert.equal(m.flowShown(flange, {}, lookup).tag, 'changed');
  assert.equal(m.flowShown(flange, {}, lookup).usual.code, 'GS-FLOW');
  assert.equal(m.flowShown(stiff, {}, lookup).tag, null);
  assert.equal(m.flowTooltip(m.flowShown(web, {}, lookup), web, true), 'GS-FLOW — this row’s flow (taken from its definition when the order was made).');
  assert.equal(m.flowTooltip(m.flowShown(flange, {}, lookup), flange, true), 'FL-CUSTOM — changed on this order line. The row’s own flow is GS-FLOW.');
});
// ── an order row's flow is its own: the top row, and taking the definition's flow again (2026-10-10) ──
const defNew = { id: 9, code: 'FL-NEW', name: 'New one' };
const allFlowsEarly = [
  { id: 7, code: 'GS-FLOW', name: 'Girder standard', status: 'active', steps: [] },
  { id: 9, code: 'FL-NEW', name: 'New one', status: 'active', steps: [] },
  { id: 10, code: 'OLD', name: 'Retired', status: 'obsolete', steps: [] },
];
// The top row of an order line: no BOM line holds it. Its definition has since moved to FL-NEW.
const topRow = node(20, flowRows, { name: 'Girder', lineId: null, lineNo: null, depth: 0, flow: { ...gs, from: 'item' }, definitionFlow: defNew });
const webMoved = { ...web, definitionFlow: defNew };                                   // own GS-FLOW, definition now FL-NEW
const flangeMoved = { ...flange, definitionFlow: defNew };                             // line names FL-CUSTOM, own GS-FLOW, definition FL-NEW
const stiffMoved = { ...stiff, definitionFlow: defNew };                               // no flow at all, definition FL-NEW
const webSame = { ...web, definitionFlow: { id: 7, code: 'GS-FLOW', name: 'Girder standard' } };
await check('The tooltip says whose flow it is, and when the definition has moved on', () => {
  const tip = (n, p = m.NO_PENDING) => m.flowTooltip(m.flowShown(n, p.flow, lookup, p.ownFlow), n, true);
  assert.equal(tip(webSame), 'GS-FLOW — this row’s flow (taken from its definition when the order was made).');
  assert.equal(tip(webMoved), 'GS-FLOW — this row’s flow (taken from its definition when the order was made). Its definition is made by FL-NEW today.');
  assert.equal(tip(flangeMoved), 'FL-CUSTOM — changed on this order line. The row’s own flow is GS-FLOW. Its definition is made by FL-NEW today.');
  assert.match(tip(stiffMoved), /has no flow.*Its definition is made by FL-NEW today\./);
  assert.equal(m.flowTooltip(m.flowShown(bolt, { 240: 9 }, lookup), bolt, false), 'FL-NEW — changed on this order line. The row has no flow of its own.');
  // the two visual states stay: the row's own flow is 'default', a line's choice is 'changed'
  assert.deepEqual([webMoved, flangeMoved, stiffMoved, topRow].map((n) => m.flowShown(n, {}, lookup).tag), ['default', 'changed', null, 'default']);
});
await check('Take-again is offered only when the definition’s flow is not the flow the row is made by', () => {
  const offer = (n, p = m.NO_PENDING) => m.flowShown(n, p.flow, lookup, p.ownFlow).takeAgain?.code ?? null;
  assert.deepEqual([offer(webSame), offer(web), offer(webMoved), offer(flangeMoved), offer(stiffMoved), offer(topRow)], [null, null, 'FL-NEW', 'FL-NEW', 'FL-NEW', 'FL-NEW']);
  // a line that already names the definition's flow is made by it: nothing to take
  assert.equal(offer(webMoved, m.withFlow(m.NO_PENDING, webMoved, 9)), null);
  assert.equal(m.takeAgainNote(defNew), 'The definition is made by FL-NEW today; this row keeps the flow it was created with until you take it.');
});
await check('The top row’s flow is its own: a pending own-flow edit by record, saved as ownFlow', () => {
  const p1 = m.withFlowChoice(m.NO_PENDING, topRow, 9);
  assert.deepEqual([p1.ownFlow, p1.flow], [{ 20: 9 }, {}]);
  const s = m.flowShown(topRow, p1.flow, lookup, p1.ownFlow);
  assert.deepEqual([s.flow.code, s.tag, s.unsaved, s.chosen, s.usual.code, s.takeAgain], ['FL-NEW', 'default', true, null, 'FL-NEW', null]);
  const byLine = m.nodesByLine(topRow), byRecord = m.nodesByRecord(topRow);
  assert.deepEqual(m.pendingChanges(p1, byLine, byRecord).changes, [{ op: 'ownFlow', recordId: 20, flowId: 9 }]);
  // choosing what is saved takes the entry away; "each row's default" leaves the top row alone
  assert.equal(m.pendingChanges(m.withFlowChoice(p1, topRow, 7), byLine, byRecord).changes.length, 0);
  assert.equal(m.withFlowChoice(m.NO_PENDING, topRow, null), m.NO_PENDING);
  // a row held by a line still goes through the line, exactly as before
  assert.deepEqual(m.pendingChanges(m.withFlowChoice(m.NO_PENDING, web, 9), byLine, byRecord).changes, [{ op: 'flow', lineId: 210, flowId: 9 }]);
  // a catalog item in the structure has no own flow to set here
  assert.equal(m.withOwnFlow(m.NO_PENDING, bolt, 9), m.NO_PENDING);
});
await check('Take-again: own flow = the definition’s AND the line’s choice cleared, both pending, saved together', () => {
  const tree2 = node(30, [webMoved, flangeMoved, stiffMoved], { lineId: null, depth: 0, flow: { ...gs, from: 'item' }, definitionFlow: defNew });
  const byLine = m.nodesByLine(tree2), byRecord = m.nodesByRecord(tree2);
  const p = m.withDefinitionFlow(m.NO_PENDING, flangeMoved);
  assert.deepEqual([p.ownFlow, p.flow], [{ 22: 9 }, { 220: null }]);
  assert.deepEqual(m.pendingChanges(p, byLine, byRecord).changes, [{ op: 'flow', lineId: 220, flowId: null }, { op: 'ownFlow', recordId: 22, flowId: 9 }]);
  const s = m.flowShown(flangeMoved, p.flow, lookup, p.ownFlow);
  assert.deepEqual([s.flow.code, s.tag, s.unsaved, s.takeAgain], ['FL-NEW', 'default', true, null]);
  assert.equal(m.flowTooltip(s, flangeMoved, true), 'FL-NEW — this row’s flow (taken from its definition when the order was made).');
  // a row whose line named nothing: only its own flow changes
  assert.deepEqual(m.pendingChanges(m.withDefinitionFlow(m.NO_PENDING, webMoved), byLine, byRecord).changes, [{ op: 'ownFlow', recordId: 21, flowId: 9 }]);
  // a row with no flow at all takes it too; the top row has no line to clear
  assert.deepEqual(m.pendingChanges(m.withDefinitionFlow(m.NO_PENDING, stiffMoved), byLine, byRecord).changes, [{ op: 'ownFlow', recordId: 23, flowId: 9 }]);
  assert.deepEqual(m.pendingChanges(m.withDefinitionFlow(m.NO_PENDING, tree2), byLine, byRecord).changes, [{ op: 'ownFlow', recordId: 30, flowId: 9 }]);
  // nothing to take without a definition's flow
  assert.equal(m.withDefinitionFlow(m.NO_PENDING, web), m.NO_PENDING);
});
await check('The picker offers "Take the definition’s flow again" first, and the top row has no default entry', async () => {
  let took = 0, picked;
  await React.act(() => root.render(React.createElement(m.FlowChoiceList, { flows: allFlowsEarly, chosen: null, usual: gs, takeAgain: defNew, onTakeAgain: () => { took += 1; }, onPick: (id) => { picked = id; } })));
  let opts = [...document.querySelectorAll('[role="option"]')];
  assert.match(opts[0].textContent, /^Take the definition’s flow again — FL-NEW/);
  assert.ok(opts[0].textContent.includes('The definition is made by FL-NEW today; this row keeps the flow it was created with until you take it.'));
  assert.ok(opts[1].textContent.includes('Use the default (GS-FLOW)'));
  await fire(document.querySelector('[data-testid="flow-take-again"]'), 'click');
  assert.deepEqual([took, picked], [1, undefined]);
  // no entry when there is nothing to take
  await React.act(() => root.render(React.createElement(m.FlowChoiceList, { flows: allFlowsEarly, chosen: null, usual: gs, takeAgain: null, onTakeAgain: () => {}, onPick: () => {} })));
  assert.equal(document.querySelector('[data-testid="flow-take-again"]'), null);
  // the top row: the flows only (its own is marked), plus take-again
  await React.act(() => root.render(React.createElement(m.FlowChoiceList, { flows: allFlowsEarly, chosen: 7, usual: 'own', takeAgain: defNew, onTakeAgain: () => {}, onPick: (id) => { picked = id; } })));
  opts = [...document.querySelectorAll('[role="option"]')];
  assert.equal(document.querySelector('[data-testid="flow-use-default"]'), null);
  assert.deepEqual(opts.map((o) => o.getAttribute('aria-selected')), ['false', 'true', 'false']);
  await fire(opts[2], 'click'); assert.equal(picked, 9);
});
await check('Bulk change lists the top row; one flow for all becomes its own flow and the others’ line flows', () => {
  const tree3 = node(40, [web, stiff], { name: 'Girder', lineId: null, depth: 0, flow: { ...gs, from: 'item' } });
  const p = [tree3, web, stiff].reduce((acc, n) => m.withFlowChoice(acc, n, 9), m.NO_PENDING);
  assert.deepEqual(m.pendingChanges(p, m.nodesByLine(tree3), m.nodesByRecord(tree3)).changes,
    [{ op: 'flow', lineId: 210, flowId: 9 }, { op: 'flow', lineId: 230, flowId: 9 }, { op: 'ownFlow', recordId: 40, flowId: 9 }]);
});
await check('A waiting choice shows as changed + unsaved, and reset shows the default again', () => {
  const picked = m.withFlow(m.NO_PENDING, web, 9);
  const s1 = m.flowShown(web, picked.flow, lookup);
  assert.equal(s1.tag, 'changed'); assert.equal(s1.flow.code, 'FL-NEW'); assert.equal(s1.unsaved, true);
  const reset = m.withFlow(m.NO_PENDING, flange, null);
  const s2 = m.flowShown(flange, reset.flow, lookup);
  assert.equal(s2.tag, 'default'); assert.equal(s2.flow.code, 'GS-FLOW'); assert.equal(s2.unsaved, true);
  assert.equal(Object.keys(m.withFlow(picked, web, null).flow).length, 0);
});
await check('No-flow chip is amber for a made row and plain for a bought one', async () => {
  const chip = (n) => React.createElement(m.FlowChip, { shown: m.flowShown(n, {}, lookup), made: m.isMade(n), label: 'x', tooltip: 't', onClick: () => {} });
  await React.act(() => root.render(React.createElement('div', null, chip(web), chip(stiff), chip(bolt))));
  const chips = [...document.querySelectorAll('[data-testid="flow-chip"]')];
  assert.deepEqual(chips.map((c) => c.getAttribute('data-flow-tag')), ['default', 'none', 'none']);
  assert.match(chips[0].textContent, /GS-FLOW.*default/i);
  assert.match(chips[1].textContent, /No flow/);
  assert.notEqual(chips[1].getAttribute('class'), chips[2].getAttribute('class'));
});
const allFlows = [
  { id: 7, code: 'GS-FLOW', name: 'Girder standard', status: 'active', steps: [{ sequence: 2, operation: { id: 2, code: 'WLD', name: 'Welding' } }, { sequence: 1, operation: { id: 1, code: 'CUT', name: 'Cutting' } }] },
  { id: 9, code: 'FL-NEW', name: 'New one', status: 'draft', steps: [] },
  { id: 10, code: 'OLD', name: 'Retired', status: 'obsolete', steps: [] },
];
await check('Picker lists the default first, steps in order, and hides obsolete flows', async () => {
  let picked;
  await React.act(() => root.render(React.createElement(m.FlowChoiceList, { flows: allFlows, chosen: null, usual: { id: 7, code: 'GS-FLOW', name: 'Girder standard', from: 'template' }, onPick: (id) => { picked = id; } })));
  const opts = [...document.querySelectorAll('[role="option"]')];
  assert.ok(opts[0].textContent.includes("Use the default (GS-FLOW)"));
  assert.equal(opts.length, 3);
  assert.match(opts[1].textContent, /Cutting › Welding/);
  assert.ok(!/OLD/.test(document.body.textContent));
  await fire(opts[2], 'click'); assert.equal(picked, 9);
  await fire(document.querySelector('[data-testid="flow-use-default"]'), 'click'); assert.equal(picked, null);
});
// (The bulk "Change flow…" dialog is gone: flows change per row, with the row's flow chip.)
// ---- A selection row's item, on the row itself (init.sql §42, 2026-10-02) ----
const selOf = { id: 900, code: 'SELST', name: 'Shear stud' };
const unchosen = node(61, [], { name: 'Shear stud', kind: 'selection', selection: selOf, resolved: false });
const autoRow = node(62, [], { name: 'Stud 19x100', kind: 'catalog', selection: selOf, resolved: true, autoChosen: true });
const chosenRow = node(63, [], { name: 'Stud 22x125', kind: 'catalog', selection: selOf, resolved: true, autoChosen: false });
const plateRow = node(64, [], { name: 'Plate (cut to size)', kind: 'selection', selection: { id: 901, code: 'SELPL', name: 'Plate' }, resolved: false, underCutPlate: true });
const plainRow = node(65, [], { name: 'Bolt', kind: 'catalog' });
const selTree = node(1, [unchosen, autoRow, chosenRow, plateRow, plainRow], { lineId: null, depth: 0 });
const selRows = m.arrangedRows(selTree, new Set(['k1']), m.NO_PENDING);
let chosenLines = [];
const choiceProps = (editable) => ({ ...props, rows: selRows, choiceCell: (r) => React.createElement(m.ChoiceCell, { node: r.node, editable, why: 'The design is frozen.', onChoose: (id) => chosenLines.push(id) }) });
await check('An unchosen selection row shows an amber "Choose item" on the row; clicking opens its chooser', async () => {
  chosenLines = [];
  await render(choiceProps(true));
  const buttons = [...document.querySelectorAll('[data-testid="choose-item"]')];
  assert.equal(buttons.length, 1, 'only the person-chosen selection row, not the cut plate\'s raw plate');
  assert.match(buttons[0].textContent, /Choose item/);
  assert.equal(buttons[0].tagName, 'BUTTON');
  await fire(buttons[0], 'click');
  assert.deepEqual(chosenLines, [610]);
});
await check('A row the system chose says "default · change"; clicking opens the chooser', async () => {
  chosenLines = [];
  const tag = [...document.querySelectorAll('[data-testid="auto-chosen"]')];
  assert.equal(tag.length, 1);
  assert.equal(tag[0].textContent, 'default · change');
  assert.match(tag[0].getAttribute('title'), /automatically/);
  await fire(tag[0], 'click');
  assert.deepEqual(chosenLines, [620]);
});
await check('A row a person chose shows a quiet "Change"; plain and plate rows show nothing', async () => {
  chosenLines = [];
  const change = [...document.querySelectorAll('[data-testid="change-item"]')];
  assert.equal(change.length, 1);
  await fire(change[0], 'click');
  assert.deepEqual(chosenLines, [630]);
  assert.equal(document.querySelectorAll('[data-testid="choose-item"], [data-testid="auto-chosen"], [data-testid="change-item"]').length, 3);
});
await check('Clicking the choice does not select the row\'s cells or start a drag', async () => {
  const btn = document.querySelector('[data-testid="choose-item"]');
  await fire(btn, 'mousedown');
  assert.equal(document.querySelectorAll('[aria-selected="true"]').length, 0);
});
await check('Read-only: "Not chosen" stays visible (never hidden), "default" without a button, no Change', async () => {
  chosenLines = [];
  await render(choiceProps(false));
  const nc = document.querySelector('[data-testid="choose-item"]');
  assert.equal(nc.tagName, 'SPAN'); assert.equal(nc.textContent, 'Not chosen'); assert.equal(nc.getAttribute('title'), 'The design is frozen.');
  assert.equal(document.querySelector('[data-testid="auto-chosen"]').textContent, 'default');
  assert.equal(document.querySelectorAll('[data-testid="change-item"]').length, 0);
  assert.equal(document.querySelectorAll('button[data-testid="choose-item"], button[data-testid="auto-chosen"], button[data-testid="change-item"]').length, 0);
});
await check('choiceState: choose / auto / chosen, and nothing for plain rows and a cut plate\'s raw plate', () => {
  assert.deepEqual([unchosen, autoRow, chosenRow, plateRow, plainRow].map(m.choiceState), ['choose', 'auto', 'chosen', null, null]);
});
await check('"N to choose" walks the rows still to choose in tree order (folded branches included), wrapping', () => {
  const deep = node(71, [], { name: 'Deep stud', kind: 'selection', selection: selOf, resolved: false });
  const asm = node(70, [deep], { name: 'Assembly' });
  const t = node(1, [unchosen, asm, autoRow, plateRow, node(72, [], { kind: 'selection', selection: selOf, resolved: false })], { lineId: null, depth: 0 });
  const targets = m.unchosenTargets(t);
  assert.deepEqual(targets.map((x) => x.key), ['k61', 'k71', 'k72'], 'the plate and the chosen rows are skipped');
  assert.deepEqual(targets[1].ancestors, ['k1', 'k70'], 'a jump opens the branch above the row');
  assert.deepEqual([m.nextTarget(3, -1), m.nextTarget(3, 0), m.nextTarget(3, 2), m.nextTarget(0, -1)], [0, 1, 0, -1]);
});
// ── linked copies: the chip's place on a row, and its states ────────────────────────────────────────────────────────
const phOf = (r) => (r.node.id === 4 ? { code: 'SO1-G(1)-W(1,2)', title: 'code', segments: [{ text: 'SO1-G' }, { from: 1, to: 1 }, { text: '-W' }, { from: 1, to: 2 }] } : r.node.id === 2 ? { code: 'SO1-G(1)', title: 'code', segments: [{ text: 'SO1-G' }, { from: 1, to: 1 }] } : null);
const linkProps = { ...props, view, rows: m.arrangedRows(tree, expanded, m.NO_PENDING), placeholderOf: phOf, flowCell: (r) => React.createElement('span', { 'data-testid': 'flow-x', 'data-row': r.node.id }, 'FLOW'),
  linkCell: (r) => (r.node.id === 4 ? React.createElement(m.LinkChip, { state: { kind: 'linked', group: 'G', members: [4, 5], others: 3 }, name: 'Row 4', onOpen: () => {} }) : r.node.id === 5 ? React.createElement(m.LinkChip, { state: { kind: 'suggest', others: [2, 4] }, name: 'Row 5', onOpen: () => {} }) : null) };
await check('the link chip sits after the own-code chip and before the flow chip on line 1; a row with no copies shows none', async () => {
  await render(linkProps);
  const chip4 = document.querySelector('[data-testid="row-link"][aria-label^="Row 4:"]');
  assert.ok(chip4, 'the chip is drawn');
  const line1 = chip4.parentElement;
  const order = [...line1.children].map((c) => c.getAttribute('data-testid') || (c.tagName === 'DIV' ? 'name' : c.tagName));
  assert.deepEqual(order.filter((t) => ['name', 'row-own-code', 'row-link', 'flow-x'].includes(t)), ['name', 'row-own-code', 'row-link', 'flow-x']);
  assert.equal(document.querySelectorAll('[data-testid="row-link"]').length, 2);
  assert.equal(document.querySelector('[data-testid="row-link"][aria-label^="Row 2:"]'), null);
});
await check('chip states: linked ⧉ n (solid), an offer = n (dashed), changing (amber); plural and singular titles', async () => {
  const linked = document.querySelector('[data-testid="row-link"][data-state="linked"]');
  assert.equal(linked.textContent, '⧉ 3');
  assert.equal(linked.getAttribute('title'), 'Same design as 3 other rows — click to see them');
  const offer = document.querySelector('[data-testid="row-link"][data-state="suggest"]');
  assert.equal(offer.textContent, '= 2');
  assert.equal(offer.getAttribute('title'), 'Identical to 2 other rows — link them');
  assert.equal(m.linkedTitle(1), 'Same design as 1 other row — click to see them');
  await render({ ...linkProps, linkCell: (r) => (r.node.id === 4 ? React.createElement(m.LinkChip, { state: { kind: 'linked', group: 'G', members: [4, 5], others: 1 }, changing: true, name: 'Row 4', onOpen: () => {} }) : null) });
  const changing = document.querySelector('[data-testid="row-link"]');
  assert.equal(changing.getAttribute('data-state'), 'changing');
  assert.match(changing.getAttribute('title'), /you choose whether its copies change too/);
});
await check('clicking the chip opens its list and does not select the cell or start a drag', async () => {
  let opened = null;
  await render({ ...linkProps, linkCell: (r) => (r.node.id === 4 ? React.createElement(m.LinkChip, { state: { kind: 'linked', group: 'G', members: [4, 5], others: 1 }, name: 'Row 4', onOpen: (a) => { opened = a; } }) : null) });
  await fire(document.querySelector('[data-testid="row-link"]'), 'click');
  assert.ok(opened, 'onOpen got the chip as its anchor');
  assert.equal(document.querySelectorAll('[aria-selected="true"]').length, 0);
});
await React.act(() => root.render(null));
await React.act(() => root.unmount());
dom.window.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
