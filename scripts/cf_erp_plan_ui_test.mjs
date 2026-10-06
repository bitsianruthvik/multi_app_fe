// Run from multi_app_fe: node scripts/cf_erp_plan_ui_test.mjs
// Production › Plan (pages/Plan.tsx, components/Plan/*) rendered in jsdom from a fixture GET /planner:
// the tree expands and collapses (and is remembered), a simulated pointer drag moves a unit and the
// machine-area usage follows it live (and turns red over capacity), warnings are shown but never
// block, undo / redo, the keyboard moves a selection, reorder within a line, and Save sends ONE
// PUT /planner/changes with the entries and the line's new unit order.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/plan', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  try { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true }); } catch { /* skip */ }
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
if (!globalThis.PointerEvent) globalThis.PointerEvent = class extends dom.window.MouseEvent { constructor(t, o = {}) { super(t, o); this.pointerId = o.pointerId ?? 1; } };
window.PointerEvent = globalThis.PointerEvent;

const apiStub = `export async function apiFetch(url, o = {}) {
  const res = await globalThis.fetch(url, { method: o.method || 'GET', body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await res.text();
  if (!res.ok) throw new Error('API request failed: ' + res.status + ' x - ' + text);
  return JSON.parse(text);
}`;
const authStub = `export function useAuth() { return { user: globalThis.__user ?? null }; }`;
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom';
      export { React, createRoot, MemoryRouter };
      export { default as Plan } from './src/apps/cf_erp/pages/Plan';
      export * as E from './src/apps/cf_erp/lib/planner';
      export * as T from './src/apps/cf_erp/components/Plan/tree';
      export * as H from './src/apps/cf_erp/components/Plan/history';
      export * as M from './src/apps/cf_erp/components/Plan/model';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/api\/client$/ }, () => ({ path: 'api', namespace: 'stub' }));
    b.onResolve({ filter: /^@core\/contexts\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'stub' }));
    b.onLoad({ filter: /^api$/, namespace: 'stub' }, () => ({ contents: apiStub, loader: 'js' }));
    b.onLoad({ filter: /^auth$/, namespace: 'stub' }, () => ({ contents: authStub, loader: 'js' }));
  } }],
  alias: { '@shared/ui': resolve('src/shared/ui/SideSheet.tsx') }, // the page uses only SideSheet from the kit
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error', loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `plan-ui-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const { React, createRoot, MemoryRouter, Plan, E, T, H, M } = await import(pathToFileURL(artifact));
await unlink(artifact);

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };

// ── fixture ──────────────────────────────────────────────────────────────
// Order A (rank 1, promised 18 Oct): line 11 planned by girder line (depth 2): span p1 → girder lines
// p2, p3 → segments p4..p7 (marks). A segment = 300 min cutting + 300 min welding, 10 t, 1 PL.
// Cutting and welding have 1000 min a week, so one girder line is 60 % of a week and two are 120 %.
// p2 ships in week 1 (pinned); p3 is not planned. Order B: one unlocked line that needs item XX,
// which nobody has ordered (the material gate) — it can still be put on the plan, with a warning.
const periods = E.buildPeriods('2026-10-01', 3);
const P0 = periods[0].key, P1 = periods[1].key, P3 = periods[3].key;
const cap = (v) => Object.fromEntries(periods.map((p) => [p.key, v]));
const path = (area, areaId, type, typeId) => [{ id: 1, name: 'Machines', depth: 0, level: 'Family' }, { id: areaId, name: area, depth: 1, level: 'Subfamily' }, { id: typeId, name: type, depth: 2, level: 'Variant' }];
const seg = (id, parent, code) => ({ key: `p${id}`, orderId: 1, lineId: 11, level: '3', pieceId: id, code, name: 'Girder segment', depth: 3, parentKey: parent, groupKey: parent, isMark: true, marks: 1, tonnes: 10, work: { cut: 300, weld: 300 }, noRate: 0, done: false, progress: 0, materials: [{ itemId: 'PL', qty: 1 }], committedDate: null });
const agg = (key, id, depth, parent, group, code, name, n) => ({ key, orderId: 1, lineId: 11, level: id == null ? 'line' : String(depth), pieceId: id, code, name, depth, parentKey: parent, groupKey: group, isMark: false, marks: n, tonnes: 10 * n, work: { cut: 300 * n, weld: 300 * n }, noRate: 0, done: false, progress: 0, materials: [{ itemId: 'PL', qty: n }], committedDate: null });
const snapshot = () => ({
  horizon: { from: periods[0].start, to: periods[periods.length - 1].end, periods },
  settings: { minLinesPerMonth: 1, allowPartialLines: true },
  targets: { '2026-10': 50 },
  functions: [
    { key: 'cut', name: 'CNC plasma', machines: 2, capacity: cap(1000), noShifts: false, path: path('Cutting', 10, 'CNC plasma', 101) },
    { key: 'weld', name: 'SAW welder', machines: 1, capacity: cap(1000), noShifts: false, path: path('Welding', 20, 'SAW welder', 201) },
    { key: 'mig', name: 'MIG set', machines: 2, capacity: cap(1000), noShifts: false, path: path('Welding', 20, 'MIG set', 202) },
    { key: 'drill', name: 'Radial drill', machines: 1, capacity: cap(1000), noShifts: false, path: path('Drilling', 30, 'Radial drill', 301) },
    { key: 'jig', name: 'Fit-up jig', machines: 2, capacity: cap(1000), noShifts: false, path: path('Assembly', 40, 'Fit-up jig', 401) },
    { key: 'blast', name: 'Shot blaster', machines: 1, capacity: cap(1000), noShifts: false, path: path('Finishing', 50, 'Shot blaster', 501) },
    { key: 'contractor', name: 'Contractors', unlimited: true },
  ],
  orders: [
    { id: 1, code: 'SO-A', customer: 'KEPL', committedDate: '2026-10-18', priority: 1, lines: [{ id: 11, lineNo: 1, name: 'Bridge', quantity: 1, locked: true, released: false, level: '2', levels: [{ value: 'line', label: 'Whole' }, { value: '1', label: 'Bridge span' }, { value: '2', label: 'Girder line' }, { value: '3', label: 'Girder segment' }] }] },
    { id: 2, code: 'SO-B', customer: 'X', committedDate: '2026-12-20', priority: 2, lines: [{ id: 21, lineNo: 1, name: 'Stock', quantity: 1, locked: false, released: false, level: 'line', levels: [{ value: 'line', label: 'Whole' }] }] },
  ],
  units: [
    agg('l11', null, 0, null, 'l11', 'SO-A/1', 'Bridge', 4),
    agg('p1', 1, 1, null, 'p1', 'SO-A-S1', 'Bridge span', 4),
    { ...agg('p2', 2, 2, 'p1', 'p2', 'SO-A-S1-G1', 'Girder line', 2), splittable: true, bomLineId: 55 },
    agg('p3', 3, 2, 'p1', 'p3', 'SO-A-S1-G2', 'Girder line', 2),
    seg(4, 'p2', 'SO-A-S1-G1-1'), seg(5, 'p2', 'SO-A-S1-G1-2'), seg(6, 'p3', 'SO-A-S1-G2-1'), seg(7, 'p3', 'SO-A-S1-G2-2'),
    { key: 'l21', orderId: 2, lineId: 21, level: 'line', pieceId: null, code: 'SO-B/1', name: 'Stock', depth: 0, parentKey: null, groupKey: 'l21', isMark: false, marks: 0, tonnes: 5, work: { drill: 100, contractor: 600 }, noRate: 0, done: false, progress: 0, materials: [{ itemId: 'XX', qty: 3 }], committedDate: null },
  ],
  supply: { PL: { name: 'Plate', code: 'PL', uom: 'nos', lots: [{ date: periods[0].start, qty: 100, source: 'stock', received: true }] } },
  entries: { p2: { shipDate: P0, pinned: true } },
  ranks: {},
});

const requests = [];
globalThis.fetch = async (url, o = {}) => {
  const u = new URL(String(url), 'http://localhost');
  requests.push({ method: o.method || 'GET', path: u.pathname, body: o.body ? JSON.parse(o.body) : null });
  if (u.pathname.endsWith('/planner') && (o.method || 'GET') === 'GET') return { ok: true, status: 200, text: async () => JSON.stringify(snapshot()) };
  if (u.pathname.endsWith('/planner/changes')) return { ok: true, status: 200, text: async () => JSON.stringify({ entries: {}, ranks: {} }) };
  return { ok: true, status: 200, text: async () => '{}' };
};

const app = () => document.getElementById('app');
const $ = (id) => document.querySelector(`[data-testid="${id}"]`);
const settle = async () => { for (let i = 0; i < 6; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const show = async () => {
  const root = createRoot(app());
  await React.act(() => root.render(React.createElement(MemoryRouter, { initialEntries: ['/testco/cf_erp/plan'] }, React.createElement(Plan))));
  await settle();
  return root;
};
const click = async (el, init = {}) => { await React.act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, ...init })); }); await settle(); };
const pointer = async (target, type, x, y, init = {}) => {
  await React.act(async () => { target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y, pointerId: 1, ...init })); });
};
const key = async (target, k, init = {}) => { await React.act(async () => { target.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); }); await settle(); };
const rowIds = () => [...document.querySelectorAll('[data-testid^="row-"]')].map((r) => r.dataset.testid.slice(4));
// jsdom has no layout: the grid is 0 px wide, so its columns are the defaults (tree 250, not planned 92, weeks 48).
const G = T && { tree: 250, back: 92, col: 48 };
const xOfPeriod = (i) => G.tree + G.back + i * G.col + G.col / 2;
const cuttingCell = (p) => $(`usage-a10-${p}`);

// ── pure parts ───────────────────────────────────────────────────────────
await check('areas: the Subfamily splits the shop into 5 areas (Machines alone is 1); welding holds two types', () => {
  const set = E.machineAreas(snapshot().functions);
  assert.equal(set.depth, 1);
  assert.equal(set.level, 'Subfamily');
  assert.deepEqual(set.areas.filter((a) => !a.unlimited).map((a) => a.name), ['Assembly', 'Cutting', 'Drilling', 'Finishing', 'Welding']);
  assert.deepEqual(set.areas.find((a) => a.name === 'Welding').fnKeys, ['weld', 'mig']);
  assert.equal(set.areas.find((a) => a.name === 'Welding').machines, 3);
  assert.ok(set.areas.at(-1).unlimited && set.areas.at(-1).name === 'Contractors');
});
await check('history: commit / undo / redo, and a new commit drops the redo stack', () => {
  let h = H.startHistory({ plan: {}, ranks: {} });
  const a = { plan: { x: { period: P0, pinned: true } }, ranks: {} };
  const b = { plan: { x: { period: P1, pinned: true } }, ranks: {} };
  h = H.commit(H.commit(h, a), b);
  assert.equal(h.present, b);
  h = H.undo(h); assert.equal(h.present, a);
  h = H.redo(h); assert.equal(h.present, b);
  h = H.commit(H.undo(h), { plan: {}, ranks: { x: 1 } });
  assert.equal(h.future.length, 0);
});
await check('tree state: expand to a level, toggle against it, and survive a bad localStorage value', () => {
  let e = T.toLevel(2);
  assert.equal(T.isOpen(e, 'o:1', 0), true);
  assert.equal(T.isOpen(e, 'l:11', 1), false);
  e = T.toggle(e, 'l:11', 1);
  assert.equal(T.isOpen(e, 'l:11', 1), true);
  e = T.toggle(e, 'l:11', 1);
  assert.deepEqual(e.open, []);
  window.localStorage.setItem('k', '{nope');
  assert.deepEqual(T.loadExpand('k'), T.DEFAULT_EXPAND);
});

await check('splitAction: a splittable row offers the split; a child of a split row offers the join; others nothing', () => {
  const u = (o) => ({ key: 'x', code: 'SO-A-S1', name: 'Span', pieceId: 1, quantity: 1, ...o });
  const parent = u({ key: 'p1', split: true, bomLineId: 9 });
  const child = u({ key: 'p2', parentKey: 'p1' });
  const all = [parent, child, u({ key: 'p3', splittable: true, bomLineId: 7 }), u({ key: 'p4' })];
  const a = M.splitAction(all, all[2], 'SO-A');
  assert.deepEqual([a.split, a.target.key, a.label], [true, 'p3', 'Plan its parts separately']);
  const b = M.splitAction(all, child, 'SO-A');
  assert.deepEqual([b.split, b.target.key, b.label], [false, 'p1', 'Plan S1 as one unit again']);
  assert.equal(M.splitAction(all, all[3], 'SO-A'), null);
  assert.equal(M.splitAction([u({ key: 'z', splittable: true })], u({ key: 'z', splittable: true }), 'SO-A'), null, 'no BOM row, no action');
});
await check('copyText: "3 of 6" for one of a row of units, nothing for a row of one or a line card', () => {
  const six = [1, 2, 3, 4, 5, 6].map((i) => ({ key: 'p9#' + i, pieceId: 9, copy: i }));
  assert.equal(M.copyText(six, six[2]), '3 of 6');
  assert.equal(M.copyText([{ key: 'p8', pieceId: 8, copy: null }], { key: 'p8', pieceId: 8, copy: null }), null);
  assert.equal(M.copyText([], { key: 'l1', pieceId: null }), null);
});

// ── the page ─────────────────────────────────────────────────────────────
let root;
await check('the plan is a tree: order › line › girder lines; the segments are inside, collapsed', async () => {
  window.localStorage.clear();
  root = await show();
  const ids = rowIds();
  assert.deepEqual(ids.slice(0, 4), ['o:1', 'l:11', 'u:p2', 'u:p3'], ids.join(' '));
  assert.ok(!ids.includes('u:p4'), 'segments start collapsed');
  assert.ok(ids.includes('o:2') && ids.includes('u:l21'));
  assert.equal($('bar-p2').dataset.period, P0);
  assert.ok($('chip-p3'), 'p3 waits in Not planned');
});
await check('expand a girder line: its segments show, riding with it; collapse hides them again; remembered per device', async () => {
  await click($('toggle-u:p2'));
  let ids = rowIds();
  assert.deepEqual(ids.slice(2, 5), ['u:p2', 'u:p4', 'u:p5']);
  assert.equal($('row-u:p4').dataset.kind, 'child');
  const saved = JSON.parse(window.localStorage.getItem('cf_erp.plan.tree.testco'));
  assert.deepEqual(saved.open, ['u:p2']);
  await click($('toggle-u:p2'));
  ids = rowIds();
  assert.ok(!ids.includes('u:p4'));
  await click($('toggle-o:1'));
  assert.ok(!rowIds().includes('l:11'), 'a collapsed order hides its lines');
  await click($('toggle-o:1'));
  await click($('expand-all'));
  assert.ok(rowIds().includes('u:p6'), 'expand all opens every unit');
  await click($('expand-all'));
  assert.deepEqual(rowIds(), ['o:1', 'o:2'], 'collapse all leaves the orders');
  await React.act(() => root.unmount());
  root = await show();
  assert.deepEqual(rowIds(), ['o:1', 'o:2'], 'the state came back from localStorage');
  window.localStorage.clear();
  await React.act(() => root.unmount());
  root = await show();
});
await check('machine areas: one row per area, cutting at 60 % in week 1 (green), contractors in hours', async () => {
  assert.ok($('usage-panel'));
  assert.ok($('usage-row-a10') && $('usage-row-a20') && $('usage-row-fcontractor'));
  assert.equal(cuttingCell(P0).textContent, '60%');
  assert.equal(cuttingCell(P0).dataset.band, 'ok');
  assert.equal($(`usage-a20-${P0}`).textContent, '30%', 'welding = 600 of 2000 min (two types)');
});
await check('drag the unplanned girder line onto week 1: usage follows LIVE and turns red (120 %), the hint warns', async () => {
  const chip = $('chip-p3');
  await pointer(chip, 'pointerdown', G.tree + 20, 120);
  await pointer(window, 'pointermove', G.tree + 40, 120);
  await pointer(window, 'pointermove', xOfPeriod(0), 120);
  await settle();
  assert.equal(cuttingCell(P0).textContent, '120%');
  assert.equal(cuttingCell(P0).dataset.band, 'over');
  assert.match($('drag-hint').textContent, /S1-G2 → wk/);
  assert.match($('drag-hint').textContent, /Cutting 120% in wk/);
  assert.equal($('change-count').textContent, 'All saved', 'nothing changes until the drop');
  await pointer(window, 'pointerup', xOfPeriod(0), 120);
  await settle();
  assert.equal($('bar-p3').dataset.period, P0);
  assert.equal($('change-count').textContent, '1 change');
  assert.equal(cuttingCell(P0).dataset.band, 'over');
});
await check('undo (Ctrl+Z) puts it back; redo (Ctrl+Y) moves it again', async () => {
  await key(window, 'z', { ctrlKey: true });
  assert.ok($('chip-p3'), 'back in Not planned');
  assert.equal(cuttingCell(P0).dataset.band, 'ok');
  assert.equal($('change-count').textContent, 'All saved');
  await key(window, 'y', { ctrlKey: true });
  assert.equal($('bar-p3').dataset.period, P0);
});
await check('drag a planned bar sideways: it snaps to the week under the pointer', async () => {
  const bar = $('bar-p3');
  await pointer(bar, 'pointerdown', xOfPeriod(0), 150);
  await pointer(window, 'pointermove', xOfPeriod(0) + 10, 150);
  await pointer(window, 'pointermove', xOfPeriod(3) + 13, 150);
  await pointer(window, 'pointerup', xOfPeriod(3) + 13, 150);
  await settle();
  assert.equal($('bar-p3').dataset.period, P3);
  assert.equal(cuttingCell(P0).dataset.band, 'ok');
});
await check('stretch grip: dragging the left edge of a bar to an earlier week stretches it; double-click on the grip puts it back', async () => {
  const lead = periods.findIndex((p) => p.key === $('bar-p3').dataset.period); // one week of work: starts where it ships
  const grip = $('stretch-p3');
  assert.match(grip.getAttribute('aria-label'), /^Stretch: start SO-A-S1-G2 earlier$/);
  await pointer(grip, 'pointerdown', xOfPeriod(lead), 120);
  await pointer(window, 'pointermove', xOfPeriod(lead) - 10, 120);
  await pointer(window, 'pointermove', xOfPeriod(1), 120);
  await settle();
  assert.match($('drag-hint').textContent, /starts wk/);
  await pointer(window, 'pointerup', xOfPeriod(1), 120);
  await settle();
  assert.equal($('bar-p3').dataset.period, P3, 'the ship week did not move');
  assert.match($('bar-p3').getAttribute('aria-label'), /Stretched from/);
  await React.act(async () => { $('stretch-p3').dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })); });
  await settle();
  assert.doesNotMatch($('bar-p3').getAttribute('aria-label'), /Stretched from/);
  assert.equal($('change-count').textContent, '1 change');
});
await check('a material gate or a promised date is a WARNING, never a block: SO-B lands without its material', async () => {
  const chip = $('chip-l21');
  await pointer(chip, 'pointerdown', G.tree + 20, 300);
  await pointer(window, 'pointermove', G.tree + 40, 300);
  await pointer(window, 'pointermove', xOfPeriod(1), 300);
  await settle();
  assert.match($('drag-hint').textContent, /Stock: Not ordered: item XX is short by 3/);
  await pointer(window, 'pointerup', xOfPeriod(1), 300);
  await settle();
  assert.equal($('bar-l21').dataset.period, P1);
  assert.match($('bar-l21').getAttribute('aria-label'), /Not ordered/);
});
await check('Esc during a drag cancels it', async () => {
  const bar = $('bar-l21');
  await pointer(bar, 'pointerdown', xOfPeriod(1), 300);
  await pointer(window, 'pointermove', xOfPeriod(1) + 10, 300);
  await pointer(window, 'pointermove', xOfPeriod(5), 300);
  await key(window, 'Escape');
  await pointer(window, 'pointerup', xOfPeriod(5), 300);
  await settle();
  assert.equal($('bar-l21').dataset.period, P1);
  assert.equal($('drag-hint'), null);
});
await check('multi-select (click, Ctrl-click) and the arrow keys move both a week; Shift+arrow moves four', async () => {
  const p2 = $('bar-p2');
  await pointer(p2, 'pointerdown', xOfPeriod(0), 90);
  await pointer(window, 'pointerup', xOfPeriod(0), 90);
  await settle();
  const p3 = $('bar-p3');
  await pointer(p3, 'pointerdown', xOfPeriod(3), 120, { ctrlKey: true });
  await pointer(window, 'pointerup', xOfPeriod(3), 120);
  await settle();
  assert.equal($('bar-p2').getAttribute('aria-pressed'), 'true');
  assert.equal($('bar-p3').getAttribute('aria-pressed'), 'true');
  await key($('plan-grid'), 'ArrowRight');
  assert.equal($('bar-p2').dataset.period, P1);
  assert.equal($('bar-p3').dataset.period, periods[4].key);
  await key($('plan-grid'), 'ArrowRight', { shiftKey: true });
  assert.equal($('bar-p2').dataset.period, periods[5].key);
  await key($('plan-grid'), 'ArrowLeft', { shiftKey: true });
  await key($('plan-grid'), 'ArrowLeft');
  assert.equal($('bar-p2').dataset.period, P0);
});
await check('a drag moves every selected unit by the same number of weeks', async () => {
  const p2 = $('bar-p2');
  await pointer(p2, 'pointerdown', xOfPeriod(0), 90);
  await pointer(window, 'pointermove', xOfPeriod(0) + 10, 90);
  await pointer(window, 'pointermove', xOfPeriod(2), 90);
  await pointer(window, 'pointerup', xOfPeriod(2), 90);
  await settle();
  assert.equal($('bar-p2').dataset.period, periods[2].key);
  assert.equal($('bar-p3').dataset.period, periods[5].key);
});
await check('reorder within the line (Alt+↓ on G1): G2 comes first', async () => {
  const p2 = $('bar-p2');
  await pointer(p2, 'pointerdown', xOfPeriod(2), 90);
  await pointer(window, 'pointerup', xOfPeriod(2), 90);
  await settle();
  await key($('plan-grid'), 'ArrowDown', { altKey: true });
  const ids = rowIds();
  assert.ok(ids.indexOf('u:p3') < ids.indexOf('u:p2'), ids.join(' '));
});
await check('reorder by dragging the grip: G1 back above G2', async () => {
  const grip = $('row-u:p2').querySelector('[aria-label^="Drag to change"]');
  // rows: o:1 (0), l:11 (1), u:p3 (2), u:p2 (3) — the header is 46 px; drop on the top half of row 2
  await pointer(grip, 'pointerdown', 40, 46 + 3 * 34 + 10);
  await pointer(window, 'pointermove', 40, 46 + 3 * 34 - 10);
  await pointer(window, 'pointermove', 40, 46 + 2 * 34 + 5);
  await pointer(window, 'pointerup', 40, 46 + 2 * 34 + 5);
  await settle();
  const ids = rowIds();
  assert.ok(ids.indexOf('u:p2') < ids.indexOf('u:p3'), ids.join(' '));
});
await check('click a usage cell: the units loading it light up, the others dim; click again to clear', async () => {
  await click(cuttingCell(periods[2].key));
  assert.match($('highlight-chip').textContent, /1 unit loads Cutting in wk/);
  assert.equal($('row-u:p3').style.opacity || getComputedStyle($('row-u:p3')).opacity, '0.35');
  await click(cuttingCell(periods[2].key));
  assert.equal($('highlight-chip'), null);
});
await check('Save sends ONE PUT /planner/changes with the moved entries and the line\'s unit order', async () => {
  requests.length = 0;
  // a real rank change first, so the order is saved: G2 above G1
  const p3 = $('bar-p3');
  await pointer(p3, 'pointerdown', xOfPeriod(5), 120);
  await pointer(window, 'pointerup', xOfPeriod(5), 120);
  await settle();
  await key($('plan-grid'), 'ArrowUp', { altKey: true });
  const before = $('change-count').textContent;
  assert.match(before, /^\d+ changes$/);
  const save = [...$('save-bar').querySelectorAll('button')].find((b) => b.textContent === 'Save');
  await click(save);
  const puts = requests.filter((r) => r.method === 'PUT');
  assert.equal(puts.length, 1);
  assert.ok(puts[0].path.endsWith('/api/testco/cf_erp/planner/changes'));
  const byKey = Object.fromEntries(puts[0].body.entries.map((e) => [e.unitKey, e]));
  assert.equal(byKey.p2.shipDate, periods[2].start);
  assert.equal(byKey.p3.shipDate, periods[5].start);
  assert.equal(byKey.p3.pinned, true);
  assert.equal(byKey.l21.shipDate, periods[1].start);
  assert.deepEqual(puts[0].body.ranks, [{ lineId: 11, unitKeys: ['p3', 'p2'] }]);
  assert.equal($('change-count').textContent, 'All saved');
});
await check('Delete takes the selection off the plan', async () => {
  await key($('plan-grid'), 'Delete');
  assert.ok($('chip-p3'));
  assert.equal($('change-count').textContent, '1 change');
});
await check('row menu: a splittable row offers "Plan its parts separately"; with unsaved changes it refuses, then PUTs the split', async () => {
  const menuItem = () => document.querySelector('[role="menuitem"]');
  requests.length = 0;
  await click($('menu-p2'));
  assert.equal(menuItem().textContent, 'Plan its parts separately');
  await click(menuItem());
  assert.equal(requests.filter((r) => r.method === 'PUT').length, 0, 'unsaved changes: nothing is sent');
  const discard = [...$('save-bar').querySelectorAll('button')].find((b) => b.textContent === 'Discard');
  await click(discard);
  await click($('menu-p2'));
  await click(menuItem());
  const put = requests.find((r) => r.method === 'PUT');
  assert.ok(put.path.endsWith('/api/testco/cf_erp/planner/lines/11/splits'));
  assert.deepEqual(put.body, { bomLineId: 55, split: true });
  assert.ok(requests.some((r) => r.method === 'GET' && r.path.endsWith('/planner')), 'the board is read again');
  await React.act(() => root.unmount());
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
