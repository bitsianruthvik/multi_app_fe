// Run from multi_app_fe: node scripts/cf_erp_order_flow_test.mjs
// The reworked sales-order flow: no cut rows in Structure, "Freeze design" wording,
// the confirm action button, the Plate column;
// since 2026-10-02 no Cut pieces tab — a "Cut pieces (N)" button on Nesting opens them in a dialog,
// and an old ?tab=cut-pieces link lands there.
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
Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
// The cut-pieces list the dialog reads (GET /order-lines/:id/cut-plates) — every other request answers 404.
const fetched = [];
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  const body = /\/order-lines\/7\/cut-plates/.test(String(url))
    ? { parts: 3, values: { missing: 0, items: 0, complete: true }, upToDate: true, lock: null, cutPlates: [
      { id: 1, code: 'CP-1', name: 'a', size: { thickness: 12, length: 900, width: 300, grade: 'E250' }, partCount: 2, plate: null, nest: null, plateQuantity: 0.1, plateQuantityBasis: 'area', note: null },
      { id: 2, code: 'CP-2', name: 'b', size: { thickness: 16, length: 600, width: 200, grade: 'E250' }, partCount: 1, plate: { id: 9, code: 'PL-9', name: 'p' }, nest: { nestNo: 'N-012' }, plateQuantity: 1, plateQuantityBasis: 'nesting', note: null },
    ] }
    : null;
  return body
    ? new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    : new Response('{"error":"nope"}', { status: 404 });
};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { act } = React;
const { MemoryRouter, useLocation } = await import('react-router-dom');

const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const authStub = resolve(cache, `order-flow-auth-${process.pid}.tsx`);
await writeFile(authStub, 'export const useAuth = () => ({ user: null });');
const entry = `export * from './src/apps/cf_erp/components/OrderProcess/StageBody';
export * from './src/apps/cf_erp/components/Nesting/CutPiecesDialog';
export { tabStages, tabFor, isCutPiecesKey, withCutPiecesOpen, CUT_PIECES_PARAM } from './src/apps/cf_erp/lib/process';
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

await check('Structure source: no toggle, no chip, a quiet line pointing at the cut pieces in Nesting', async () => {
  const panel = await readFile('src/apps/cf_erp/components/Bom/BomPanel.tsx', 'utf8');
  assert.ok(!/Show cut pieces|showCut|cutChip/.test(panel));
  assert.match(panel, /Cut pieces are worked out from the parts automatically — /);
  assert.match(panel, /see them in Nesting/);
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

// ── No Cut pieces stage (2026-10-02): the list is a dialog over Nesting ──
const st = (stageKey, more = {}) => ({ stageKey, label: stageKey, state: 'todo', requirement: 'required', applies: true, ...more });
await check('No Cut pieces tab: the train is lines, structure (values inside), freeze, nesting, buying, production', () => {
  const train = [st('lines'), st('structure'), st('values', { shownIn: 'structure' }), st('lock'), st('nesting'), st('buying'), st('production')];
  assert.deepEqual(m.tabStages(train).map((s) => s.stageKey), ['lines', 'structure', 'lock', 'nesting', 'buying', 'production']);
  // An older API still sending the stage: no tab either; it folds into Nesting.
  const old = [...train.slice(0, 3), st('cut_pieces'), ...train.slice(3)];
  assert.deepEqual(m.tabStages(old).map((s) => s.stageKey), ['lines', 'structure', 'lock', 'nesting', 'buying', 'production']);
  assert.equal(m.tabFor('cut_pieces', old), 'nesting');
});
await check('No Cut pieces tab: StageBody has no cut_pieces branch; Nesting has the button with the count', async () => {
  const body = await readFile('src/apps/cf_erp/components/OrderProcess/StageBody.tsx', 'utf8');
  assert.doesNotMatch(body, /stageKey === 'cut_pieces'/);
  assert.doesNotMatch(body, /<BlanksPanel/);
  assert.match(body, /<CutPiecesButton/);
  assert.doesNotMatch(body, /values and cut pieces are settled/);
  const nest = await readFile('src/apps/cf_erp/components/Nesting/NestingPanel.tsx', 'utf8');
  assert.match(nest, /<CutPiecesButton[^>]*count=\{cutPieceCount\}/);
});
await check('Nesting button: "Cut pieces (2)" opens the cut-pieces list in a dialog, and the address remembers it', async () => {
  await act(async () => { root.render(null); });
  let loc = null;
  const Spy = () => { loc = useLocation(); return null; };
  fetched.length = 0;
  await act(async () => {
    root.render(React.createElement(MemoryRouter, { initialEntries: ['/orders/1?tab=nesting'] },
      React.createElement(m.CutPiecesButton, { lineId: 7, lineNo: 10, count: 2, canManage: true }), React.createElement(Spy)));
  });
  const btn = document.querySelector('[data-testid="cut-pieces-button"]');
  assert.equal(btn.textContent.trim(), 'Cut pieces (2)');
  assert.equal(document.querySelector('[role="dialog"]'), null, 'shut until pressed');
  assert.equal(fetched.length, 0, 'nothing is read until it opens');
  await act(async () => { btn.click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  const dlg = document.querySelector('[role="dialog"]');
  assert.ok(dlg, 'the dialog is open');
  assert.match(dlg.textContent, /Cut pieces — line 10/);
  assert.ok(fetched.some((u) => /\/order-lines\/7\/cut-plates/.test(u)), fetched.join(' | '));
  assert.match(dlg.textContent, /CP-1/); assert.match(dlg.textContent, /CP-2/);
  assert.match(dlg.textContent, /chosen at nesting/, 'plate state of a piece not nested yet');
  assert.match(dlg.textContent, /N-012 · PL-9/, 'nest lot + plate of a nested piece');
  assert.ok([...dlg.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Make them now'), 'the fallback action is kept');
  assert.match(loc.search, /cutPieces=1/);
  assert.match(loc.search, /tab=nesting/);
  await act(async () => { dlg.querySelector('[aria-label="Close"]').click(); });
  assert.doesNotMatch(loc.search, /cutPieces/);
});
await check('Old link: ?tab=cut-pieces (and the old key) lands on Nesting with the cut-pieces dialog open', async () => {
  assert.ok(m.isCutPiecesKey('cut-pieces') && m.isCutPiecesKey('cut_pieces') && !m.isCutPiecesKey('nesting'));
  const next = m.withCutPiecesOpen(new URLSearchParams('tab=cut-pieces&line=5'));
  assert.equal(next.get('tab'), 'nesting');
  assert.equal(next.get(m.CUT_PIECES_PARAM), '1');
  assert.equal(next.get('line'), '5', 'the rest of the address is kept');
  const page = await readFile('src/apps/cf_erp/pages/OrderDetail.tsx', 'utf8');
  assert.match(page, /if \(isCutPiecesKey\(tabParam\)\) \{\s*setParams\(withCutPiecesOpen/);
  assert.match(page, /if \(isCutPiecesKey\(key\)\) \{[\s\S]{0,200}setParams\(withCutPiecesOpen/, 'a jump to the old key opens the dialog too');
  // …and the dialog opens straight from such an address.
  await act(async () => { root.render(null); });
  await act(async () => {
    root.render(React.createElement(MemoryRouter, { initialEntries: ['/orders/1?' + next.toString()] },
      React.createElement(m.CutPiecesButton, { lineId: 7, lineNo: 10, count: 2, canManage: false })));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  const dlg = document.querySelector('[role="dialog"]');
  assert.ok(dlg && /Cut pieces — line 10/.test(dlg.textContent));
  assert.ok(![...dlg.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Make them now'), 'no write for a read-only role');
});

await act(async () => { root.unmount(); });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
