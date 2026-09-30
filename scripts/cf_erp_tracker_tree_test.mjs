// Run from multi_app_fe: node scripts/cf_erp_tracker_tree_test.mjs
// The Tracker's progress tree: the operation strip's states, the completion bar,
// the tree model (branches, levels, only-blocked), and the screen against a pretend
// /tracker/tree API (open a branch, "Show only blocked", search).
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/tracker', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  try { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true }); } catch { /* skip */ }
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// Wide screen: the four-column layout.
dom.window.matchMedia = (q) => ({ matches: /min-width/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
globalThis.matchMedia = dom.window.matchMedia;

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
      export * from './src/apps/cf_erp/lib/trackerTree';
      export { OpStrip, CompletionBar, BlockedMark } from './src/apps/cf_erp/components/Tracker/TreeParts';
      export { TrackerTree } from './src/apps/cf_erp/components/Tracker/TrackerTree';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/(api\/client|contexts\/AuthContext)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
  } }],
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `tracker-tree-test-${process.pid}.mjs`);
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
const op = (stepId, name, state, done = 0, total = 1, extra = {}) => ({ stepId, operationId: stepId, name, state, done, total, ...extra });
const node = (id, parentId, level, code, extra = {}) => ({
  id, parentId, kind: id[0] === 'o' ? 'order' : id[0] === 'l' ? 'line' : 'piece', level, code, name: null, qty: 1, ops: [],
  completion: 0, weight: 'count', blocked: false, blockedCount: 0, blockedReason: null, blockedAt: null, running: 0,
  childCount: 0, childrenIncluded: true, ...extra,
});

await check('pctText never says 0% or 100% when it is not', () => {
  assert.equal(m.pctText(null), '—'); assert.equal(m.pctText(0), '0%'); assert.equal(m.pctText(0.004), '<1%');
  assert.equal(m.pctText(0.374), '37%'); assert.equal(m.pctText(0.999), '99%'); assert.equal(m.pctText(1), '100%');
});
await check('pill text: a mark, or k/n when part of a count is done', () => {
  assert.equal(m.opPillText(op(1, 'Cut', 'done', 1, 1)), '✓');
  assert.equal(m.opPillText(op(1, 'Fit-up', 'partial', 2, 6)), '2/6');
  assert.equal(m.opPillText(op(1, 'Weld', 'running', 0, 6)), '▸');
  assert.equal(m.opPillText(op(1, 'Weld', 'running', 3, 6)), '3/6');
  assert.equal(m.opPillText(op(1, 'Drill', 'blocked')), '!');
  assert.equal(m.opPillText(op(1, 'Paint', 'todo', 0, 6)), '');
});
await check('pill hover names the operation and says where it stands', () => {
  assert.equal(m.opTitle(op(1, 'Fit-up', 'partial', 2, 6)), 'Fit-up — 2 of 6 done');
  assert.equal(m.opTitle(op(1, 'Welding', 'blocked', 0, 1, { reason: 'On hold: crane' })), 'Welding — blocked: On hold: crane');
  assert.equal(m.opTitle(op(1, 'Cut', 'todo', 0, 1, { ready: true })), 'Cut — ready to start');
  assert.equal(m.opTitle(op(1, 'Cut', 'todo')), 'Cut — not started');
  assert.equal(m.opsDoneText([op(1, 'a', 'done'), op(2, 'b', 'todo'), op(3, 'c', 'partial', 1, 2)]), '1 of 3 done');
});

await check('the strip draws one pill per operation, in order, with its state', async () => {
  const ops = [op(1, 'CNC Cutting', 'done'), op(2, 'Drilling', 'running'), op(3, 'Fit-up', 'partial', 2, 6), op(4, 'Welding', 'blocked', 0, 1, { reason: 'Needs PL-12 — 1 plate to reserve' }), op(5, 'Painting', 'todo')];
  const root = await render(React.createElement(m.OpStrip, { ops }));
  const pills = [...document.querySelectorAll('[data-testid="op-pill"]')];
  assert.deepEqual(pills.map((p) => p.dataset.state), ['done', 'running', 'partial', 'blocked', 'todo']);
  assert.equal(pills[2].textContent, '2/6');
  assert.equal(pills[0].textContent, '✓');
  assert.match(pills[3].getAttribute('aria-label'), /Welding — blocked: Needs PL-12/);
  await unmount(root);
});
await check('the completion bar shows the percentage and fills to it', async () => {
  const root = await render(React.createElement('div', null,
    React.createElement(m.CompletionBar, { value: 0.374 }), React.createElement(m.CompletionBar, { value: null }), React.createElement(m.CompletionBar, { value: 1 })));
  const bars = [...document.querySelectorAll('[data-testid="completion"]')];
  assert.equal(bars[0].querySelector('[data-testid="completion-pct"]').textContent, '37%');
  assert.equal(bars[0].getAttribute('aria-valuenow'), '37');
  assert.equal(bars[1].textContent, '—');
  assert.equal(bars[2].textContent, '100%');
  assert.match(bars[0].innerHTML, /width: 37\.4%/);
  await unmount(root);
});
await check('the blocked mark counts pieces under a parent and says "Blocked" on a piece', async () => {
  const root = await render(React.createElement('div', null,
    React.createElement(m.BlockedMark, { node: node('p1', 'l1', 2, 'A', { childCount: 3, blockedCount: 3, blockedReason: 'On hold: crane', blockedAt: 'A-1' }) }),
    React.createElement(m.BlockedMark, { node: node('p2', 'p1', 3, 'A-1', { blocked: true, blockedCount: 1 }) }),
    React.createElement(m.BlockedMark, { node: node('p3', 'p1', 3, 'A-2') })));
  const marks = [...document.querySelectorAll('[data-testid="blocked-mark"]')].map((x) => x.textContent);
  assert.deepEqual(marks, ['3 blocked', 'Blocked']);
  await unmount(root);
});

await check('model: rows follow open nodes; only-blocked hides clean branches', () => {
  const t = m.fromNodes([
    node('o1', null, 0, 'SO-1', { childCount: 1, blockedCount: 1 }),
    node('l1', 'o1', 1, 'Line 10', { childCount: 2, blockedCount: 1 }),
    node('p1', 'l1', 2, 'SO-1-SPAN-01-1', { childCount: 1, blockedCount: 1 }),
    node('p3', 'p1', 3, 'SO-1-SPAN-01-1-G1', { blocked: true, blockedCount: 1 }),
    node('p2', 'l1', 2, 'SO-1-SPAN-01-2', { childCount: 4, childrenIncluded: false }),
  ]);
  const open = m.openToLevel(t, 3);
  assert.deepEqual([...open].sort(), ['l1', 'o1', 'p1', 'p2'].sort());
  assert.deepEqual(m.visibleRows(t, open).map((r) => r.node.id), ['o1', 'l1', 'p1', 'p3', 'p2']);
  assert.deepEqual(m.visibleRows(t, open, { onlyBlocked: true }).map((r) => r.node.id), ['o1', 'l1', 'p1', 'p3']);
  assert.deepEqual(m.visibleRows(t, open).map((r) => r.depth), [0, 1, 2, 3, 2]);
  assert.equal(m.needsChildren(t, t.byId.get('p2')), true);
  assert.equal(m.needsChildren(t, t.byId.get('p1')), false);
});
await check('model: a branch replaces what a search brought, in the server\'s order', () => {
  let t = m.fromNodes([node('l1', null, 1, 'L', { childCount: 3, childrenIncluded: false }), node('p9', 'l1', 2, 'L-3', { match: true })]);
  t = m.mergeBranch(t, 'l1', null, [node('p7', 'l1', 2, 'L-1'), node('p8', 'l1', 2, 'L-2'), node('p9', 'l1', 2, 'L-3')]);
  assert.deepEqual(m.visibleRows(t, new Set(['l1'])).map((r) => r.node.id), ['l1', 'p7', 'p8', 'p9']);
  assert.equal(t.loaded.has('l1'), true);
  const r = m.refreshNodes(t, [node('p8', 'l1', 2, 'L-2', { completion: 0.5 }), node('zz', 'l1', 2, 'new')]);
  assert.equal(r.byId.get('p8').completion, 0.5);
  assert.equal(r.byId.has('zz'), false);
});

// ── the screen, against a pretend server ─────────────────────────────────
const calls = [];
const opsNames = { 1: { code: 'CUT', name: 'CNC Cutting' }, 2: { code: 'FIT', name: 'Fit-up' }, 3: { code: 'WLD', name: 'Welding' } };
const wire = (o) => { const { name: _n, ...rest } = o; return rest; };   // the server leaves the operation's own name out
const TREE = [
  node('o1', null, 0, 'SO-1', { name: 'KEPL', childCount: 1, blockedCount: 1, completion: 0.25, blockedReason: 'On hold: crane', blockedAt: 'SO-1-SPAN-01-1-G1' }),
  node('l1', 'o1', 1, 'Line 10', { name: 'Composite girder span', childCount: 2, blockedCount: 1, completion: 0.25, orderId: 1, lineId: 1 }),
  node('p1', 'l1', 2, 'SO-1-SPAN-01-1', { name: 'Composite girder span', childCount: 2, blockedCount: 1, completion: 0.4, ops: [wire(op(10, 'Fit-up', 'todo'))] }),
  node('p3', 'p1', 3, 'SO-1-SPAN-01-1-G1', { name: 'Girder', blocked: true, blockedCount: 1, ops: [wire(op(11, 'Welding', 'blocked', 0, 1, { reason: 'On hold: crane' }))].map((o) => ({ ...o, operationId: 3 })) }),
  node('p4', 'p1', 3, 'SO-1-SPAN-01-1-G2', { name: 'Girder', childCount: 2, childrenIncluded: false, completion: 0.5 }),
  node('p2', 'l1', 2, 'SO-1-SPAN-01-2', { name: 'Composite girder span', childCount: 1, childrenIncluded: false }),
];
const KIDS_P4 = [
  node('p5', 'p4', 4, 'SO-1-SPAN-01-1-G2-TF1', { name: 'Top flange', ops: [wire({ ...op(12, 'x', 'done'), operationId: 1 }), wire({ ...op(13, 'x', 'partial', 2, 6), operationId: 2 })] }),
  node('p6', 'p4', 4, 'SO-1-SPAN-01-1-G2-WB1', { name: 'Web', ops: [wire({ ...op(14, 'x', 'todo'), operationId: 1 })] }),
];
function route(path) {
  const [pathname, query = ''] = path.split('?');
  const q = new URLSearchParams(query);
  const p = pathname.replace('/api/testco/cf_erp', '');
  calls.push({ p, q: Object.fromEntries(q) });
  const base = { scope: {}, orders: [{ id: 1, code: 'SO-1', title: null, customer: 'KEPL', status: 'confirmed', open: true, lines: [{ id: 1, lineNo: 10, releaseId: 1, itemName: 'Span' }] }],
    summary: { orders: 1, lines: 1, pieces: 6, blockedPieces: 1, runningSteps: 0, steps: 6, stepsDone: 1, completion: 0.25, weight: 'count' },
    depth: 4, search: null, onlyBlocked: false, total: 8, truncated: false, basisNote: { piece: 'p', row: 'r' }, operations: opsNames };
  if (p === '/tracker/tree') {
    let nodes = TREE;
    if (q.get('onlyBlocked') === '1') nodes = TREE.filter((n) => n.blockedCount > 0).map((n) => ({ ...n, childrenIncluded: false }));
    if (q.get('search')) nodes = TREE.filter((n) => ['o1', 'l1', 'p1', 'p4'].includes(n.id)).map((n) => ({ ...n, childrenIncluded: false, match: n.id === 'p4' }));
    return { ...base, nodes, returned: nodes.length };
  }
  if (p === '/tracker/tree/children' && q.get('nodeId') === 'p4') return { node: TREE[4], operations: opsNames, nodes: KIDS_P4 };
  throw Object.assign(new Error(`no route ${p}`), { status: 404 });
}
globalThis.fetch = async (url) => {
  try { return { ok: true, status: 200, text: async () => JSON.stringify(route(String(url))) }; }
  catch (e) { return { ok: false, status: e.status || 500, text: async () => JSON.stringify({ message: e.message }) }; }
};
const rowIds = () => [...document.querySelectorAll('[data-testid="tree-row"]')].map((r) => r.dataset.node);
const row = (id) => document.querySelector(`[data-testid="tree-row"][data-node="${id}"]`);

await check('the screen: tree opened to level 2, bars on parents, pills on pieces, names filled in', async () => {
  const root = await render(React.createElement(MemoryRouter, { initialEntries: ['/testco/cf_erp/tracker'] }, React.createElement(m.TrackerTree)));
  await waitFor(() => rowIds().length > 0, 'rows');
  assert.deepEqual(rowIds(), ['o1', 'l1', 'p1', 'p3', 'p4', 'p2']);
  assert.equal(row('l1').querySelector('[data-testid="completion-pct"]').textContent, '25%');
  assert.equal(row('p3').querySelector('[data-testid="completion"]'), null, 'a leaf has no bar');
  assert.equal(row('p3').querySelector('[data-testid="op-pill"]').dataset.state, 'blocked');
  assert.match(row('p3').querySelector('[data-testid="op-pill"]').getAttribute('aria-label'), /^Welding — blocked: On hold: crane/);
  assert.equal(row('o1').querySelector('[data-testid="blocked-mark"]').textContent, '1 blocked');
  assert.match(document.body.textContent, /1 of 6/);   // operations done in the summary
  await unmount(root);
});
await check('the screen: opening a branch that was not read fetches it and shows k/n', async () => {
  calls.length = 0;
  const root = await render(React.createElement(MemoryRouter, { initialEntries: ['/testco/cf_erp/tracker'] }, React.createElement(m.TrackerTree)));
  await waitFor(() => row('p4'), 'p4');
  await click(row('p4'), 'p4');
  await waitFor(() => row('p5'), 'p5 after opening');
  assert.ok(calls.some((c) => c.p === '/tracker/tree/children' && c.q.nodeId === 'p4'));
  const pills = [...row('p5').querySelectorAll('[data-testid="op-pill"]')];
  assert.deepEqual(pills.map((p) => p.textContent), ['✓', '2/6']);
  assert.match(pills[1].getAttribute('aria-label'), /^Fit-up — 2 of 6 done/);
  assert.match(row('p5').textContent, /1 of 2 done/);
  await click(row('p4'), 'p4 again');
  assert.equal(row('p5'), null, 'closing hides the branch');
  await unmount(root);
});
await check('the screen: "Show only blocked" asks the server and hides clean branches', async () => {
  calls.length = 0;
  const root = await render(React.createElement(MemoryRouter, { initialEntries: ['/testco/cf_erp/tracker'] }, React.createElement(m.TrackerTree)));
  await waitFor(() => rowIds().length === 6, 'rows');
  const sw = document.querySelector('input[type="checkbox"]');
  await click(sw, 'only-blocked switch');
  await waitFor(() => calls.some((c) => c.q.onlyBlocked === '1'), 'onlyBlocked request');
  await waitFor(() => rowIds().length === 4, 'blocked rows only');
  assert.deepEqual(rowIds(), ['o1', 'l1', 'p1', 'p3']);
  await unmount(root);
});
await check('the screen: a search opens the path to what it found and marks it', async () => {
  calls.length = 0;
  const root = await render(React.createElement(MemoryRouter, { initialEntries: ['/testco/cf_erp/tracker'] }, React.createElement(m.TrackerTree)));
  await waitFor(() => rowIds().length > 0, 'rows');
  const box = document.querySelector('input[placeholder^="Search a code"]');
  await React.act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(box, 'G2'); box.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(0); });
  await waitFor(() => calls.some((c) => c.q.search === 'G2'), 'search request', 2000);
  await waitFor(() => rowIds().join() === 'o1,l1,p1,p4', 'search rows');
  await unmount(root);
});

dom.window.close();
console.log(`\n${passed} passed, ${failed} failed`);
// MUI leaves timers behind in jsdom; do not wait for them.
process.exit(failed ? 1 : 0);
