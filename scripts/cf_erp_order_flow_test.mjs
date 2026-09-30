// Run from multi_app_fe: node scripts/cf_erp_order_flow_test.mjs
// The reworked sales-order flow: no cut rows in Structure, "Freeze design" wording,
// the confirm action button, the planned chip and filters on the buy list, the Plate column.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
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
const { act } = React;
const { MemoryRouter } = await import('react-router-dom');

const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const authStub = resolve(cache, `order-flow-auth-${process.pid}.tsx`);
await writeFile(authStub, 'export const useAuth = () => ({ user: null });');
const entry = `export * from './src/apps/cf_erp/components/OrderProcess/StageBody';
export * from './src/apps/cf_erp/components/PlannedChip';
export * from './src/apps/cf_erp/lib/buyList';
export * from './src/apps/cf_erp/lib/cutPieces';
export * from './src/apps/cf_erp/components/Bom/bomArrangement';
export * from './src/apps/cf_erp/components/Bom/bomModel';`;
const built = await build({
  define: { 'import.meta.env': '{"VITE_API_BASE_URL":"http://localhost:4000","VITE_API_HOST":"http://localhost:4000"}' }, loader: { '.css': 'empty' }, tsconfig: 'tsconfig.app.json', alias: { '@core/contexts/AuthContext': authStub },
  stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
});
const artifact = resolve(cache, `order-flow-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact); await unlink(authStub);

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const host = document.getElementById('app');
const root = createRoot(host);
const render = async (el) => { await act(async () => { root.render(React.createElement(MemoryRouter, null, el)); }); };
const buttons = () => [...document.querySelectorAll('button')].map((b) => b.textContent.trim());

const order = { id: 1, code: 'SO-1', title: 'T', orderType: 'customer', committedDate: null, lines: [{ committedDate: null }], allowedTransitions: ['confirmed', 'lost'] };
const stage = (waitingOn) => ({ stageKey: 'buying', label: 'Buying', state: 'todo', requirement: 'required', applies: true, waitingOn });
const noop = () => {};

await check('Structure: cut rows are dropped and the part loses its chevron', () => {
  const n = (id, children = [], more = {}) => ({ id, key: `k${id}`, name: `Row ${id}`, code: null, kind: 'temporary', status: 'draft', depth: 1, quantity: 1, total: 1, lineId: id * 10, lineNo: id, position: 1, role: null, selection: null, resolved: true, flow: null, bom: null, uom: 'nos', children, ...more });
  const cut = n(7, [n(8, [], { role: 'Raw plate' })], { role: 'Cut from' });
  const tree = n(1, [n(6, [cut]), n(9)], { lineId: null, depth: 0 });
  const rows = m.withoutCutPieces(m.arrangedRows(tree, new Set(['k1', 'k6', 'k7']), m.NO_PENDING));
  assert.deepEqual(rows.map((r) => r.node.id), [1, 6, 9]);
  assert.equal(rows.find((r) => r.node.id === 6).hasChildren, false);
  assert.equal(m.cutChip, undefined);
});

await check('Structure source: no toggle, no chip, a quiet line naming Cut pieces', async () => {
  const panel = await readFile('src/apps/cf_erp/components/Bom/BomPanel.tsx', 'utf8');
  assert.ok(!/Show cut pieces|showCut|cutChip/.test(panel));
  assert.match(panel, /Cut pieces are worked out from the parts — /);
  const grid = await readFile('src/apps/cf_erp/components/Bom/BomGrid.tsx', 'utf8');
  assert.ok(!/cutChip|Show cut pieces/.test(grid));
});

await check('Wording: no user-facing "Lock the line" / "Locked" / "Go to Lock" left in the order flow', async () => {
  const files = [];
  const walk = async (d) => { for (const e of await readdir(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) await walk(p); else if (/\.tsx?$/.test(e.name)) files.push(p); } };
  await walk('src/apps/cf_erp');
  const bad = [];
  for (const f of files) {
    const src = await readFile(f, 'utf8');
    for (const re of [/Lock the line/, /Go to Lock\b/, />Locked on/, /Lock line \$\{/, /\bline is locked\b/i]) {
      for (const line of src.split('\n')) { if (re.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)) bad.push(`${f}: ${line.trim().slice(0, 90)}`); }
    }
  }
  assert.deepEqual(bad, []);
  const panel = await readFile('src/apps/cf_erp/components/Lock/LockPanel.tsx', 'utf8');
  assert.match(panel, /Freeze the design/); assert.match(panel, /Frozen on/);
});

await check('Confirm action: a waitingOn with action confirm shows "Confirm the order" and opens the date dialog', async () => {
  await render(React.createElement(m.WaitingOn, { stage: stage({ stageKey: null, action: 'confirm', message: 'Confirm the order first — nothing is bought for an inquiry.' }), label: null, order, onGo: noop, onOrderSaved: noop, onReloadAll: noop }));
  assert.ok(buttons().includes('Confirm the order'));
  assert.ok(!buttons().some((t) => t.startsWith('Go to')));
  await act(async () => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Confirm the order').click(); });
  assert.match(document.body.textContent, /Committed date/);
  assert.match(document.body.textContent, /Confirm order\?/);
});

await check('A stage waitingOn still jumps to its stage', async () => {
  await act(async () => { root.render(null); });
  await render(React.createElement(m.WaitingOn, { stage: stage({ stageKey: 'nesting', message: 'Nest first.' }), label: 'Nesting', order, onGo: noop, onOrderSaved: noop, onReloadAll: noop }));
  assert.ok(buttons().includes('Go to Nesting'));
  assert.ok(!buttons().includes('Confirm the order'));
});

await check('Plate column: chosen at nesting / nest lot / hand-chosen plate', () => {
  assert.equal(m.plateText({ plate: null }), 'chosen at nesting');
  assert.equal(m.plateText({ plate: { code: 'PL-1', name: 'x', isSelection: true } }), 'chosen at nesting');
  assert.equal(m.plateText({ plate: { code: 'PL-9', name: 'x' }, nest: { nestNo: 'N-012' } }), 'N-012 · PL-9');
  assert.equal(m.plateText({ plate: { code: 'PL-9', name: 'x' } }), 'PL-9');
});

await check('Planned chip shows order/line, and the filters split released from planned', async () => {
  await act(async () => { root.render(null); });
  await render(React.createElement(m.PlannedChip, { row: { source: { orderId: 1, orderCode: 'SO-20260930-0001', lineId: 5, lineNo: 10 } } }));
  assert.equal(document.querySelector('[data-testid="planned-chip"]').textContent, 'planned · SO-20260930-0001/10 — not released yet');
  const rows = [{ item: { id: 1 } }, { item: { id: 1 }, planned: true, source: { lineId: 5 } }, { item: { id: 2 }, planned: true, source: { lineId: 6 } }];
  assert.equal(m.byKind(rows, 'all').length, 3);
  assert.equal(m.byKind(rows, 'released').length, 1);
  assert.equal(m.byKind(rows, 'planned').length, 2);
  assert.equal(new Set(rows.map(m.buyRowId)).size, 3);
});

await act(async () => { root.unmount(); });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
