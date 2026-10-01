// Run from multi_app_fe: node scripts/cf_erp_order_production_grid_test.mjs
// The order line's Production grid (components/Production/ProductionGrid.tsx): the
// piece-code tree down the left with the codes in full (parent prefix stepped back),
// the line's operations across, a cell per piece per operation — done / partial /
// running / blocked / not started, hatched where the operation is not in the flow,
// a % on rows that gather what is under them — a branch fetched when opened, and a
// cell click opening the piece's steps with their actions (none when read-only).
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
// A wide screen: the grid is interactive (below 600 px it would be read-only by design).
dom.window.matchMedia = (q) => ({ matches: /min-width/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
globalThis.matchMedia = dom.window.matchMedia;
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};

const stubs = {
  '@core/api/client': `export async function apiFetch(url, o = {}) {
    const res = await globalThis.fetch(url, { method: o.method || 'GET', body: o.body === undefined ? undefined : JSON.stringify(o.body) });
    const text = await res.text();
    if (!res.ok) throw new Error('API request failed: ' + res.status + ' x - ' + text);
    return JSON.parse(text);
  }`,
  '@core/contexts/AuthContext': 'export const useAuth = () => ({ user: null });',
};
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom';
      export { React, createRoot, MemoryRouter };
      export * from './src/apps/cf_erp/lib/trackerGrid';
      export { ProductionGrid } from './src/apps/cf_erp/components/Production/ProductionGrid';
      export { ToastProvider } from './src/apps/cf_erp/components/Toast';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/(api\/client|contexts\/AuthContext)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
  } }],
  alias: { '@shared/ui': resolve('src/shared/ui/SheetGrid.tsx') },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `order-production-grid-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = (ms = 30) => React.act(async () => { await sleep(ms); });
const waitFor = async (cond, what, ms = 3000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false; try { ok = !!cond(); } catch { /* not yet */ }
    if (ok) return;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await settle(20);
  }
};
const app = document.getElementById('app');
const render = async (el) => { app.replaceChildren(); const host = document.createElement('div'); app.appendChild(host); const root = createRoot(host); await React.act(async () => { root.render(el); await sleep(0); }); await settle(); return root; };
const unmount = async (root) => React.act(async () => root.unmount());
const click = async (el, what) => { assert.ok(el, `no ${what} to click`); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await settle(); };

// ── fixtures ──────────────────────────────────────────────────────────────
const row = (id, parentId, level, code, extra = {}) => ({
  id, parentId, kind: id[0] === 'l' ? 'line' : 'piece', level, code, name: null, qty: 1, completion: 0, weight: 'count',
  blockedCount: 0, blockedReason: null, blockedAt: null, running: 0, childCount: 0, childrenIncluded: true, cells: {}, ...extra,
});
const own = (state, extra = {}) => ({ state, done: state === 'done' ? 1 : 0, total: 1, stepIds: [], ...extra });
const up = (done, total) => ({ rollup: true, done, total });

await check('cell text: ✓ done, k/n partly, ▸ running, ! blocked, • ready, a faint dot not started, % gathered', () => {
  assert.equal(m.gridCellText(own('done')), '✓');
  assert.equal(m.gridCellText(own('partial', { done: 2, total: 6 })), '2/6');
  assert.equal(m.gridCellText(own('partial')), '…');
  assert.equal(m.gridCellText(own('running')), '▸');
  assert.equal(m.gridCellText(own('running', { done: 3, total: 6 })), '▸ 3/6');
  assert.equal(m.gridCellText(own('blocked')), '!');
  assert.equal(m.gridCellText(own('todo', { ready: true })), '•');
  assert.equal(m.gridCellText(own('todo')), '·');
  assert.equal(m.gridCellText(up(1, 3)), '33%');
  assert.equal(m.gridCellText(up(3, 3)), '✓');
  assert.equal(m.gridCellText(up(0, 3)), '0%');
  assert.equal(m.gridCellState(up(1, 3)), 'partial');
  assert.equal(m.gridCellState(up(0, 3)), 'todo');
  assert.equal(m.gridCellState(up(3, 3)), 'done');
});
await check('cell hover: the operation, the piece, where it stands, why it is blocked, its passes, what is below', () => {
  assert.equal(m.gridCellTitle(own('blocked', { reason: 'On hold: crane' }), 'Welding', 'G1'), 'Welding on G1 — blocked · On hold: crane');
  assert.equal(m.gridCellTitle(own('partial', { done: 2, total: 6 }), 'Fit-up', 'G2'), 'Fit-up on G2 — partly done · 2 of 6 done');
  assert.equal(m.gridCellTitle(own('todo', { ready: true }), 'Cutting', 'TF1'), 'Cutting on TF1 — ready to start');
  assert.match(m.gridCellTitle(own('done', { passes: [{ stepId: 1, name: 'SAW (pass 1 of 2)', state: 'done', done: 1, total: 1 }, { stepId: 2, name: null, state: 'done', done: 1, total: 1 }], below: { done: 1, total: 4 } }), 'SAW', 'S1'),
    /SAW \(pass 1 of 2\): done; pass 2: done · below it: 1 of 4 done$/);
  assert.equal(m.gridCellTitle(up(1, 4), 'Cutting', 'SPAN-1'), 'Cutting under SPAN-1: 1 of 4 done (25%). Open the row to see which.');
  assert.equal(m.naTitle('Fit-up', 'TF1', true), "Fit-up is not in TF1's flow");
});
await check('code prefix: a child\'s code steps back the part its parent piece already says (never the line\'s)', () => {
  const line = row('l1', null, 0, 'Line 10');
  const span = row('p1', 'l1', 1, 'SO-1-SPAN-01-1');
  const g = row('p2', 'p1', 2, 'SO-1-SPAN-01-1-G1');
  assert.equal(m.codePrefix(span, line), '');
  assert.equal(m.codePrefix(g, span), 'SO-1-SPAN-01-1');
  assert.equal(m.codePrefix(row('p9', 'p1', 2, 'OTHER-1'), span), '');
});
await check('model: open to a level, rows follow open rows, a branch merges in, open rows to re-read', () => {
  let t = m.gridFromNodes([
    row('l1', null, 0, 'Line 10', { childCount: 1 }),
    row('p1', 'l1', 1, 'S1', { childCount: 2 }),
    row('p2', 'p1', 2, 'S1-G1'),
    row('p3', 'p1', 2, 'S1-G2', { childCount: 1, childrenIncluded: false }),
  ]);
  const open = m.openGridToLevel(t, 2);
  assert.deepEqual([...open].sort(), ['l1', 'p1']);
  assert.deepEqual(m.visibleGridRows(t, open).map((r) => [r.row.id, r.depth]), [['l1', 0], ['p1', 1], ['p2', 2], ['p3', 2]]);
  assert.equal(m.gridNeedsChildren(t, t.byId.get('p3')), true);
  t = m.mergeGridBranch(t, 'p3', null, [row('p4', 'p3', 3, 'S1-G2-TF1')]);
  const open2 = new Set([...open, 'p3']);
  assert.deepEqual(m.visibleGridRows(t, open2).map((r) => r.row.id), ['l1', 'p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(m.openBeyond(t, open2, 2), ['p3']);
});

// ── the screen, against a pretend server ─────────────────────────────────
const OPS = [
  { id: 1, code: 'CUT', name: 'Cutting', done: 1, total: 3 },
  { id: 2, code: 'FIT', name: 'Fit-up', done: 0, total: 2 },
  { id: 3, code: 'WLD', name: 'Welding', done: 0, total: 1 },
];
const GRID = [
  row('l1', null, 0, 'Line 10', { name: 'Composite girder span', childCount: 1, childrenIncluded: true, completion: 0.25, blockedCount: 1, cells: { 1: up(1, 3), 2: up(0, 2), 3: up(0, 1) } }),
  row('p1', 'l1', 1, 'SO-1-SPAN-01-1', { name: 'Span', childCount: 2, completion: 0.3, blockedCount: 1, ownSteps: 1, cells: { 1: up(1, 3), 2: own('todo', { stepIds: [10], below: { done: 0, total: 1 } }), 3: up(0, 1) } }),
  row('p2', 'p1', 2, 'SO-1-SPAN-01-1-G1', { name: 'Girder', completion: 0.5, blockedCount: 1, blockedReason: 'On hold: crane', ownSteps: 2, cells: { 1: own('done', { stepIds: [20] }), 3: own('blocked', { stepIds: [21], reason: 'On hold: crane' }) } }),
  row('p3', 'p1', 2, 'SO-1-SPAN-01-1-G2', { name: 'Girder', childCount: 1, childrenIncluded: false, ownSteps: 1, cells: { 1: up(0, 2), 2: own('todo', { stepIds: [30], ready: true }) } }),
];
const KIDS_P3 = [row('p4', 'p3', 3, 'SO-1-SPAN-01-1-G2-TF1', { name: 'Top flange', qty: 6, basis: 'row', ownSteps: 1, cells: { 1: own('partial', { stepIds: [40], done: 2, total: 6 }) } })];
const step = (id, opId, name, status, extra = {}) => ({
  id, sequence: 1, operation: { id: opId, code: name.slice(0, 3).toUpperCase(), name }, stepName: null, label: `G1 · ${name}`, quantity: 1, qtyGood: status === 'done' ? 1 : 0, qtyScrap: 0,
  state: status === 'on_hold' ? 'on_hold' : status === 'done' ? 'done' : 'pending', status, machine: null, workOrder: null, workOrderId: null, workOrderCode: null, contractorName: null,
  estSetupMinutes: null, estWorkMinutes: null, estMinutes: null, startedAt: null, finishedAt: null, waits: [], blockers: [], requirementIds: [], ...extra,
});
const calls = [];
function route(path) {
  const [pathname, query = ''] = path.split('?');
  const q = new URLSearchParams(query);
  const p = pathname.replace('/api/testco/cf_erp', '');
  calls.push({ p, q: Object.fromEntries(q) });
  if (p === '/tracker/grid') {
    return {
      lineId: 1, released: true, releaseId: 7, order: { id: 1, code: 'SO-1', status: 'confirmed' },
      summary: { pieces: 4, blockedPieces: 1, runningSteps: 0, steps: 6, stepsDone: 1, completion: 0.25, weight: 'count', ready: 1, notReady: 4 },
      operations: OPS, depth: 2, total: 5, returned: GRID.length, basisNote: { piece: 'Counted for this piece.', row: 'Counted for the group.' }, nodes: GRID,
    };
  }
  if (p === '/tracker/grid/children' && q.get('nodeId') === 'p3') return { node: { ...GRID[3], childrenIncluded: true }, nodes: KIDS_P3 };
  if (p === '/tracker/tree/node' && q.get('nodeId') === 'p2') {
    return {
      node: { id: 'p2', parentId: 'p1', kind: 'piece', level: 3, code: 'SO-1-SPAN-01-1-G1', name: 'Girder', qty: 1, ops: [], completion: 0.5, weight: 'count', blocked: true, blockedCount: 1, blockedReason: 'On hold: crane', blockedAt: null, running: 0, childCount: 0, childrenIncluded: true, basis: 'piece' },
      operations: { 1: { code: 'CUT', name: 'Cutting' }, 3: { code: 'WLD', name: 'Welding' } },
      path: [{ id: 'o1', kind: 'order', code: 'SO-1' }, { id: 'l1', kind: 'line', code: 'Line 10' }, { id: 'p1', kind: 'piece', code: 'SO-1-SPAN-01-1' }],
      order: { id: 1, code: 'SO-1' }, line: { id: 1, lineNo: 10 },
      steps: [step(20, 1, 'Cutting', 'done'), step(21, 3, 'Welding', 'on_hold')],
    };
  }
  throw Object.assign(new Error(`no route ${p}`), { status: 404 });
}
globalThis.fetch = async (url) => {
  try { return { ok: true, status: 200, text: async () => JSON.stringify(route(String(url))) }; }
  catch (e) { return { ok: false, status: e.status || 500, text: async () => JSON.stringify({ message: e.message }) }; }
};
const grid = (canAct = true) => React.createElement(MemoryRouter, { initialEntries: ['/testco/cf_erp/orders/1'] },
  React.createElement(m.ToastProvider ?? React.Fragment, null, React.createElement(m.ProductionGrid, { lineId: 1, canAct })));
const tr = (id) => document.querySelector(`tr[data-row="${id}"]`);
const rowIds = () => [...document.querySelectorAll('tbody tr[data-row]')].map((x) => x.dataset.row);
const heads = () => [...document.querySelectorAll('thead th')].map((th) => th.textContent);
/** The data cell of a row under a column: 0 = Done (%), 1.. = the operations in order. */
const cell = (id, col) => tr(id)?.querySelectorAll('td[role="gridcell"]')[col];

await check('the grid: codes down the left, Done then the operations across in flow order, opened to the level under the top pieces', async () => {
  const root = await render(grid());
  await waitFor(() => rowIds().length > 0, 'rows');
  assert.deepEqual(rowIds(), ['l1', 'p1', 'p2', 'p3']);
  const h = heads();
  assert.equal(h[0], 'Piece');
  assert.match(h[1], /^Done/);
  assert.match(h[2], /^Cutting/); assert.match(h[3], /^Fit-up/); assert.match(h[4], /^Welding/);
  assert.match(h[2], /33%/, 'the column says how much of the operation the line has done');
  assert.equal(calls.filter((c) => c.p === '/tracker/grid').length >= 1, true);
  await unmount(root);
});
await check('the grid: the full code shows, the parent\'s part of it stepped back', async () => {
  const root = await render(grid());
  await waitFor(() => tr('p2'), 'p2');
  const head = tr('p2').querySelector('[role="rowheader"]');
  assert.equal(head.querySelector('[data-testid="code-prefix"]').textContent, 'SO-1-SPAN-01-1');
  assert.equal(head.querySelector('[data-testid="code-own"]').textContent, '-G1');
  assert.match(head.textContent, /SO-1-SPAN-01-1-G1/);
  assert.equal(tr('p1').querySelector('[data-testid="code-prefix"]'), null, 'a top piece under the line shows its code whole');
  assert.match(tr('p2').querySelector('[data-testid="row-blocked"]').textContent, /blocked/);
  await unmount(root);
});
await check('the grid: done ✓, blocked ! with its reason, hatched where the operation is not in the flow', async () => {
  const root = await render(grid());
  await waitFor(() => tr('p2'), 'p2');
  const cut = cell('p2', 1), fit = cell('p2', 2), weld = cell('p2', 3);
  assert.equal(cut.dataset.state, 'done'); assert.equal(cut.textContent, '✓');
  assert.equal(weld.dataset.state, 'blocked'); assert.equal(weld.textContent, '!');
  assert.match(weld.getAttribute('title'), /Welding on SO-1-SPAN-01-1-G1 — blocked · On hold: crane/);
  assert.equal(fit.dataset.na, 'true', 'Fit-up is not in G1\'s flow');
  assert.equal(fit.textContent, '');
  assert.match(fit.getAttribute('title'), /Fit-up is not in SO-1-SPAN-01-1-G1's flow/);
  assert.equal(fit.getAttribute('aria-disabled'), 'true', 'a hatched cell is not a cell to work in');
  assert.equal(cell('p3', 2).textContent, '•', 'a ready step shows a dot');
  await unmount(root);
});
await check('the grid: rows above show a % per operation gathered from what is under them, and a % complete', async () => {
  const root = await render(grid());
  await waitFor(() => tr('l1'), 'line row');
  assert.equal(cell('l1', 0).textContent, '25%', 'the Done column');
  assert.equal(cell('l1', 1).textContent, '33%');
  assert.equal(cell('l1', 1).dataset.state, 'rollup-partial');
  assert.equal(cell('l1', 2).textContent, '0%');
  assert.match(cell('l1', 1).getAttribute('title'), /Cutting under Line 10: 1 of 3 done \(33%\)/);
  assert.equal(cell('p1', 2).dataset.state, 'todo', 'a parent\'s own step shows its own state');
  assert.match(cell('p1', 2).getAttribute('title'), /below it: 0 of 1 done/);
  assert.equal(cell('p1', 0).textContent, '30%');
  await unmount(root);
});
await check('the grid: opening a row that was not read fetches its branch, and shows 2/6 on a group', async () => {
  calls.length = 0;
  const root = await render(grid());
  await waitFor(() => tr('p3'), 'p3');
  const chevron = tr('p3').querySelector('button[aria-label^="Expand"]');
  await click(chevron, 'p3 chevron');
  await waitFor(() => tr('p4'), 'p4 after opening');
  assert.ok(calls.some((c) => c.p === '/tracker/grid/children' && c.q.nodeId === 'p3'));
  assert.equal(cell('p4', 1).textContent, '2/6');
  assert.equal(cell('p4', 1).dataset.state, 'partial');
  assert.equal(tr('p4').querySelector('[data-testid="code-own"]').textContent, '-TF1');
  await click(tr('p3').querySelector('button[aria-label^="Collapse"]'), 'p3 collapse');
  assert.equal(tr('p4'), null, 'closing hides the branch');
  await unmount(root);
});
await check('the grid: clicking a cell opens that piece\'s steps with their actions, the clicked step outlined', async () => {
  calls.length = 0;
  const root = await render(grid(true));
  await waitFor(() => tr('p2'), 'p2');
  await click(cell('p2', 3), 'Welding cell');
  await waitFor(() => document.querySelectorAll('[data-testid="step-card"]').length === 2, 'step cards in the drawer');
  assert.ok(calls.some((c) => c.p === '/tracker/tree/node' && c.q.nodeId === 'p2'));
  const focused = document.querySelector('[data-testid="step-card"][data-focused="true"]');
  assert.equal(focused?.dataset.step, '21');
  assert.ok([...focused.querySelectorAll('button')].some((b) => /Resume/.test(b.textContent)), 'the held step offers Resume');
  await unmount(root);
});
await check('the grid: read-only — the drawer shows the steps but no actions', async () => {
  const root = await render(grid(false));
  await waitFor(() => tr('p2'), 'p2');
  await click(cell('p2', 3), 'Welding cell');
  await waitFor(() => document.querySelectorAll('[data-testid="step-card"]').length === 2, 'step cards');
  const buttons = [...document.querySelectorAll('[data-testid="step-card"] button')].map((b) => b.textContent);
  assert.deepEqual(buttons.filter((t) => /Resume|Start|Record/.test(t)), []);
  assert.match(document.body.textContent, /does not allow recording work here/);
  await unmount(root);
});
await check('the grid: a hatched cell opens nothing', async () => {
  calls.length = 0;
  const root = await render(grid());
  await waitFor(() => tr('p2'), 'p2');
  await click(cell('p2', 2), 'hatched Fit-up cell');
  await settle(60);
  assert.equal(calls.some((c) => c.p === '/tracker/tree/node'), false);
  await unmount(root);
});

dom.window.close();
console.log(`\n${passed} passed, ${failed} failed`);
// MUI leaves timers behind in jsdom; do not wait for them.
process.exit(failed ? 1 : 0);
