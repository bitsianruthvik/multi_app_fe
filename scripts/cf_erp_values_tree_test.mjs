// Run from multi_app_fe: node scripts/cf_erp_values_tree_test.mjs
// The Values stage = the Structure tree grid with gaps in amber (jsdom, not a visual review).
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MouseEvent', 'KeyboardEvent', 'Event']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const contents = [
  "export * from './src/apps/cf_erp/components/Bom/BomGrid';",
  "export * from './src/apps/cf_erp/components/Bom/bomArrangement';",
  "export * from './src/apps/cf_erp/components/Bom/bomModel';",
  "export * from './src/apps/cf_erp/components/Values/valuesModel';",
].join('\n');
const built = await build({ alias: { '@shared/ui': resolve('src/shared/ui/SheetGrid.tsx') }, stdin: { contents, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic' });
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `values-tree-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const node = (id, children = [], more = {}) => ({ id, key: `k${id}`, name: `Row ${id}`, code: null, kind: 'temporary', status: 'draft', depth: 1, quantity: 1, total: 1, lineId: id * 10, lineNo: id * 10, position: 1, role: null, selection: null, resolved: true, flow: null, bom: null, uom: 'nos', children, ...more });
// 1 > (2 > (4, 5), 3 > 6, 7): gaps on 4 (two) and 6 (one); 5 is complete; 3 is a shared record
const tree = node(1, [node(2, [node(4), node(5)]), node(3, [node(6)]), node(7)], { lineId: null, depth: 0 });
const all = new Set(['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7']);
const rows = m.arrangedRows(tree, all, m.NO_PENDING);
const col = (code) => ({ code, name: code, dataType: 'number', rule: 'entered', required: true, editable: true, unit: null, decimals: null });
const cell = (input, missing) => ({ input, missing });
const view = {
  editable: true, optionLists: {}, lock: null,
  groups: [
    { key: 'own', own: true, columns: [col('LENGTH'), col('WIDTH')], rows: [
      { id: 4, cells: { LENGTH: cell('', true), WIDTH: cell('', true) } },
      { id: 5, cells: { LENGTH: cell('10', false), WIDTH: cell('5', false) } },
      { id: 6, cells: { LENGTH: cell('', true), WIDTH: cell('7', false) } },
    ] },
    { key: 'shared', own: false, columns: [col('LENGTH')], rows: [{ id: 3, cells: { LENGTH: cell('', true) } }] },
  ],
};

await check('gaps: server gaps of own records only, shared rows left to their record', () => {
  const g = m.computeGaps(view, undefined);
  assert.deepEqual([...g.keys()].sort(), [4, 6]);
  assert.deepEqual(g.get(4), ['LENGTH', 'WIDTH']);
});
await check('gaps: typing a value clears the gap, emptying a required one makes it', () => {
  const g = m.computeGaps(view, { 4: { LENGTH: '12' }, 5: { LENGTH: '' } });
  assert.deepEqual(g.get(4), ['WIDTH']);
  assert.deepEqual(g.get(5), ['LENGTH']);
});
await check('summary sentence: values and rows, or the all-clear', () => {
  assert.equal(m.gapSentence(m.computeGaps(view, undefined)), '3 values missing · 2 rows');
  assert.equal(m.gapSentence(m.computeGaps(view, { 4: { LENGTH: '1', WIDTH: '1' }, 6: { LENGTH: '1' } })), 'Every required value is filled');
  assert.equal(m.gapSentence(new Map([[4, ['A']]])), '1 value missing · 1 row');
});
await check('only-missing keeps the gap rows and every ancestor, drops the rest', () => {
  assert.deepEqual(m.keepGapRows(rows, new Set([4, 6])).map((r) => r.node.key), ['k1', 'k2', 'k4', 'k3', 'k6']);
});
await check('only-missing with no gap shows nothing', () => assert.equal(m.keepGapRows(rows, new Set()).length, 0));

const props = (shown, gaps) => ({ rows: shown, view, pending: m.NO_PENDING, busy: false, canEdit: () => false, canEditValues: () => true, gaps,
  onWrites: () => {}, onMove: () => {}, dropRefusal: () => null, onToggle: () => {}, trailingCell: () => null, flowCell: () => null, markOf: () => null, placeholderOf: () => null });
const root = createRoot(document.getElementById('app'));
const shown = m.keepGapRows(rows, new Set([4, 6]));
await React.act(() => root.render(React.createElement(m.BomGrid, props(shown, m.computeGaps(view, undefined)))));
await check('the grid draws the same tree rows, ancestors kept, complete rows gone', () => {
  const names = [...document.querySelectorAll('[role="rowheader"]')].map((x) => x.textContent);
  assert.equal(names.filter((n) => /Row \d/.test(n)).length, 5);
  assert.ok(!names.some((n) => n.includes('Row 5')) && !names.some((n) => n.includes('Row 7')));
});
await check('missing cells are amber, complete ones are not', () => {
  const tds = [...document.querySelectorAll('td.sg-data')];
  const missing = tds.filter((td) => td.getAttribute('title')?.startsWith('Missing'));
  assert.equal(missing.length, 3);
  assert.ok(tds.length > missing.length);
});
await check('each row with gaps carries a count chip', () => {
  assert.deepEqual([...document.querySelectorAll('[data-testid="row-gaps"]')].map((c) => c.textContent), ['2 missing', '1 missing']);
});
await check('a typed value takes the gap and the chip away once live', async () => {
  const live = m.computeGaps(view, { 4: { LENGTH: '9', WIDTH: '9' } });
  await React.act(() => root.render(React.createElement(m.BomGrid, props(shown, live))));
  assert.deepEqual([...document.querySelectorAll('[data-testid="row-gaps"]')].map((c) => c.textContent), ['1 missing']);
  assert.equal([...document.querySelectorAll('td.sg-data')].filter((td) => td.getAttribute('title')?.startsWith('Missing')).length, 1);
});
await React.act(() => root.unmount());
dom.window.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
