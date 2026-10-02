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
const built = await build({ alias: { '@shared/ui': resolve('src/shared/ui/SheetGrid.tsx') }, stdin: { contents: `export * from './src/apps/cf_erp/components/Bom/BomGrid'; export * from './src/apps/cf_erp/components/Bom/bomArrangement'; export * from './src/apps/cf_erp/components/Bom/bomModel'; export * from './src/apps/cf_erp/lib/stripLayout'; export * from './src/apps/cf_erp/components/Bom/FlowChoice'; export * from './src/apps/cf_erp/components/Bom/flowShown';`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic' });
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
const render = (p = props) => React.act(() => root.render(React.createElement(m.BomGrid, p)));
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
await check('The description shows after the dot', () => assert.match(document.body.textContent, /Row 4 · Girder G1/));
await check('Only rows that may be edited offer the description editor', () => {
  assert.equal(document.querySelectorAll('[aria-label^="Edit description of"]').length, 1);
  assert.ok(document.querySelector('[aria-label="Edit description of Row 4"]'));
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
  assert.match(document.body.textContent, /Row 4 · Girder G1/);
  await render(roleGrid);
});
await check('Adding the same item twice asks for no name — there is no repeat prompt any more', () => {
  assert.equal(m.nameProblem, undefined);
  const dialogs = readFileSync(resolve('src/apps/cf_erp/components/BomDialogs.tsx'), 'utf8');
  assert.doesNotMatch(dialogs, /USE_NAME_REQUIRED|already in this BOM|siblingIds/);
});
await check('Edit icon opens an input; Enter saves the typed description', async () => {
  await fire(document.querySelector('[aria-label="Edit description of Row 4"]'), 'click');
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
  const label = [...document.querySelectorAll('div')].find((d) => d.children.length === 0 && d.textContent === 'Row 4 · Girder G1');
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
// The wide sheet ("Line up all columns"): one column per value, hatched where a row lacks it.
await React.act(() => root.render(null));
localStorage.setItem('ui:sheetgrid.lineUp.bom-grid', 'true');
// HOLED is declared by the group but no row has a cell for it: nobody can use it.
await check('Only columns some row uses: an unused column is hidden', async () => {
  await render({ ...props, view: colView, onlyUsedColumns: true });
  const heads = [...document.querySelectorAll('thead th')].map((t) => t.textContent);
  assert.ok(heads.some((h) => h.startsWith('Length')));
  assert.ok(!heads.some((h) => h.startsWith('Holed')), heads.join('|'));
});
await check('All columns shows it again', async () => {
  await render({ ...props, view: colView, onlyUsedColumns: false });
  assert.ok([...document.querySelectorAll('thead th')].some((t) => t.textContent.startsWith('Holed')));
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
await check('A variable the row does not have is not-applicable: hatched, no text, not editable, says why', () => {
  const c = cell(1, colOf('Holed'));
  assert.equal(c.getAttribute('data-na'), 'true'); assert.equal(c.getAttribute('aria-readonly'), 'true'); assert.equal(c.textContent, '');
  assert.match(c.getAttribute('title'), /Not a value of Row 2/);
});
await check('A variable the row has stays a normal cell', () => {
  const c = cell(2, colOf('Holed'));
  assert.equal(c.getAttribute('data-na'), null); assert.equal(c.getAttribute('aria-readonly'), 'false');
});
await check('A required value that is empty is missing (amber), not not-applicable', () => {
  const c = cell(2, colOf('Length'));
  assert.equal(c.getAttribute('data-na'), null); assert.match(c.getAttribute('title'), /Missing/);
});
await check('Pasting over not-applicable cells skips them and says so', async () => {
  writes = []; const h = colOf('Holed');
  await fire(cell(1, h), 'click'); await fire(cell(2, h), 'click', { shiftKey: true });
  await clipboard(cell(2, h), 'paste', 'Yes');
  assert.equal(writes.length, 1); assert.equal(writes[0].row.node.id, 4);
  assert.match(document.body.textContent, /1 cell doesn't apply to its row and was skipped/);
});
const resNa = { mode: 'setup', specs: [{ spec: { code: 'WIDTH', name: 'Width', dataType: 'number' }, applicable: true, rule: { valueRule: 'fixed', isRequired: false }, value: { raw: 150, display: '150' } }, { spec: { code: 'DEPTH', name: 'Depth', dataType: 'number' }, applicable: false, rule: { valueRule: 'fixed', isRequired: false } }] };
await render({ ...props, view: null, records: { get: (id) => (id === 1 ? { resolution: { ...resNa, specs: [...resNa.specs, { ...resNa.specs[1], spec: { code: 'DEPTH', name: 'Depth', dataType: 'number' }, applicable: true }] } } : { resolution: resNa }) }, canEditValues: () => true });
await check('Record BOMs: an inapplicable spec is not-applicable, an applicable one is not', () => {
  assert.equal(cell(1, colOf('Depth')).getAttribute('data-na'), 'true');
  assert.equal(cell(0, colOf('Depth')).getAttribute('data-na'), null);
  assert.equal(cell(1, colOf('Width')).getAttribute('data-na'), null);
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
// ── strip layout: dimensions first (Thk · L · W), only a row's own cells ─────
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
const labelsAbove = (id) => [...(document.querySelector(`tr[data-labels-for="k${id}"]`)?.querySelectorAll('td.sg-label') ?? [])].map((td) => td.textContent);
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
await check('Short labels above each row\'s own cells, units in mono, ▾ on a drop-down', () => {
  assert.deepEqual(labelsAbove(4), ['Qty', 'Total', 'Thkmm', 'Lmm', 'Wmm', 'Grade▾']);
  assert.deepEqual(labelsAbove(5), ['Qty', 'Total', 'Grade▾']);
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
  assert.match(m.flowTooltip(m.flowShown(web, {}, lookup), web, true), /default, from the template/);
  assert.match(m.flowTooltip(m.flowShown(flange, {}, lookup), flange, true), /changed on this order.*default is GS-FLOW/);
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
await check('Bulk dialog applies one flow to every ticked row, warning about mixed kinds', async () => {
  let applied;
  const brows = flowRows.map((n) => ({ key: n.key, node: n, depth: 1, label: n.name }));
  await React.act(() => root.render(React.createElement(m.BulkFlowDialog, { open: true, rows: brows, flows: allFlows, shownOf: (n) => m.flowShown(n, {}, lookup), onClose: () => {}, onApply: (keys, id) => { applied = [keys, id]; } })));
  const apply = () => document.querySelector('[data-testid="bulk-apply"]');
  assert.equal(apply().disabled, true);
  for (const n of [web, stiff]) await fire(document.querySelector(`input[aria-label="Select ${n.name}"]`), 'click');
  await fire([...document.querySelectorAll('[data-testid="flow-option"]')][1], 'click');
  assert.equal(apply().disabled, false);
  assert.ok(!/different kinds/.test(document.body.textContent));
  await fire(document.querySelector('input[aria-label="Select Bolt"]'), 'click');
  assert.match(document.body.textContent, /different kinds/);
  await fire(apply(), 'click');
  assert.deepEqual(applied, [[web.key, stiff.key, bolt.key], 9]);
  // ...and those become pending 'flow' ops through the one Save path
  const p = applied[0].reduce((acc, k) => m.withFlow(acc, flowRows.find((n) => n.key === k), applied[1]), m.NO_PENDING);
  const byLine = m.nodesByLine(node(1, flowRows, { lineId: null, depth: 0 }));
  assert.deepEqual(m.pendingChanges(p, byLine).changes.map((c) => [c.op, c.lineId, c.flowId]), [['flow', 210, 9], ['flow', 230, 9], ['flow', 240, 9]]);
});
await React.act(() => root.render(null));
await React.act(() => root.unmount());
dom.window.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
