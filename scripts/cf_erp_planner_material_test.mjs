// Run from multi_app_fe: node scripts/cf_erp_planner_material_test.mjs
// Buying v2 — the planner no longer decides material (TM/CF_ERP_BUYING_V2.md §4–5). The server's answer is
// units[].material (+ entries[].blocked, materialReady); the browser only enforces it. DOM harness as in
// cf_erp_plan_ui_test.mjs, with mocked routes carrying the contract's example payloads:
//  - a unit that WAITS cannot be dropped, and the page says why (even when old supply lots would cover it)
//  - a dated unit is refused before its earliest week and accepted in it (drag, keys, stretch)
//  - PUT /planner/changes → 422 MATERIAL_NOT_READY: the refused drop is reverted and the backend's problems shown
//  - a stored placement the server flags (entries[].blocked) shows the backend's message until it is moved
//  - auto-plan never places a waiting unit and books dated units from their earliest week
//  - a read-only user cannot drag
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
const artifact = resolve(cache, `planner-material-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const { React, createRoot, MemoryRouter, Plan, E, T, H, M } = await import(pathToFileURL(artifact));
await unlink(artifact);

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };

// ── fixture ──────────────────────────────────────────────────────────────
// One order, six plan units (each its own line), 100 min of cutting each; capacity never binds.
//   l1 ready · l2 WAITING (the contract's "buying was skipped" example) · l3 DATED (earliest = periods[4])
//   l4 SAVED in week 2 but its PO slipped: entries.l4.blocked · l5 WAITING while old-style supply lots would
//   cover its need (proves the browser no longer computes it) · l6 ready.
const periods = E.buildPeriods('2026-10-12', 3);
const KEY = (i) => periods[i].key;
const cap = (v) => Object.fromEntries(periods.map((p) => [p.key, v]));
const ITEM = (id, code) => ({ id, code, name: `BHMV2RB688 material ${code.slice(-1)}`, uom: 'kg' });
const WAIT_TEXT = 'BHMV2RB688-C: buying was skipped — waiting for stock (2 kg not in stock yet).';
const DATED_TEXT = 'BHMV2RB688-B: due 2 Nov 2026 on PO-001035.';
const STALE_MSG = 'Its material now arrives 2 Nov 2026 (it was 19 Oct 2026 when this card was placed) — it is planned to ship in the week of 19 Oct 2026. Move it to the week of 2 Nov 2026 or later. BHMV2RB688-B: due 2 Nov 2026 on PO-001035.';
const waitingMaterial = {
  state: 'waiting', readyDate: null, earliest: null, soft: false, materials: 3, text: WAIT_TEXT,
  reasons: [
    { item: ITEM(131264, 'BHMV2RB688-C'), need: 2, short: 2, state: 'waiting', date: null, skipped: true, requisitionLineId: 227, cover: [{ kind: 'none', qty: 2, date: null }], text: WAIT_TEXT },
    { item: ITEM(131263, 'BHMV2RB688-B'), need: 4, short: 0, state: 'dated', date: '2026-11-11', skipped: false, requisitionLineId: 226, cover: [{ kind: 'po', date: '2026-11-11', poCode: 'PO-001035', qty: 4 }], text: 'BHMV2RB688-B: due 11 Nov 2026 on PO-001035.' },
  ],
};
const readyMaterial = { state: 'ready', readyDate: periods[0].start, earliest: null, soft: false, materials: 1, text: 'BHMV2RB688-A: here.', reasons: [] };
const datedMaterial = { state: 'dated', readyDate: '2026-11-02', earliest: periods[4].start, soft: false, materials: 1, text: DATED_TEXT, reasons: [{ item: ITEM(131263, 'BHMV2RB688-B'), need: 4, short: 0, state: 'dated', date: '2026-11-02', skipped: false, text: DATED_TEXT }] };
const unit = (n, material) => ({ key: `l${n}`, orderId: 1, lineId: 10 + n, level: 'line', pieceId: null, code: `SO-M/${n}`, name: `Item ${n}`, depth: 0, parentKey: null, groupKey: `l${n}`, isMark: false, marks: 0, tonnes: 2, work: { cut: 100 }, noRate: 0, done: false, progress: 0, materials: [{ itemId: 'PL', qty: 1 }], material, committedDate: null });
const snapshot = () => ({
  horizon: { from: periods[0].start, to: periods[periods.length - 1].end, periods },
  settings: { minLinesPerMonth: 1, allowPartialLines: true },
  targets: {},
  functions: [{ key: 'cut', name: 'CNC plasma', machines: 2, capacity: cap(100000), noShifts: false, path: [{ id: 1, name: 'Machines', depth: 0, level: 'Family' }, { id: 10, name: 'Cutting', depth: 1, level: 'Subfamily' }, { id: 101, name: 'CNC plasma', depth: 2, level: 'Variant' }] }],
  orders: [{ id: 1, code: 'SO-M', customer: 'KEPL', committedDate: null, priority: 1, lines: [1, 2, 3, 4, 5, 6].map((n) => ({ id: 10 + n, lineNo: n, name: `Item ${n}`, quantity: 1, locked: true, released: false, level: 'line', levels: [{ value: 'line', label: 'Whole' }] })) }],
  units: [unit(1, readyMaterial), unit(2, waitingMaterial), unit(3, datedMaterial), unit(4, datedMaterial), unit(5, waitingMaterial), unit(6, readyMaterial)],
  // The OLD browser gate would have found l5 (and l2) covered: 100 in stock. The server says waiting.
  supply: { PL: { name: 'Plate', code: 'PL', uom: 'nos', lots: [{ date: periods[0].start, qty: 100, source: 'stock', received: true }] } },
  entries: { l4: { shipDate: KEY(1), startDate: null, pinned: true, blocked: { kind: 'material_late', message: STALE_MSG, readyDate: '2026-11-02', earliest: periods[4].start, was: { state: 'dated', date: '2026-10-19' } } } },
  materialReady: { engine: 2, today: '2026-10-12', counts: { ready: 2, dated: 2, late: 0, waiting: 2 }, blockedEntries: 1 },
  ranks: {},
});

// The contract's 422 (CF_ERP_BUYING_V2.md section 5.2), for the card the test names.
const PROBLEM = 'SO-M/1 cannot be planned yet — it is waiting for material. BHMV2RB688-C: buying was skipped — waiting for stock (2 kg not in stock yet).';
const refusal422 = (unitKey) => ({ message: PROBLEM, code: 'MATERIAL_NOT_READY', problems: [PROBLEM], detail: { units: [{ unitKey, kind: 'waiting', readyDate: null, earliest: null }] } });
let putReply = null;
const requests = [];
globalThis.fetch = async (url, o = {}) => {
  const u = new URL(String(url), 'http://localhost');
  requests.push({ method: o.method || 'GET', path: u.pathname, body: o.body ? JSON.parse(o.body) : null });
  if (u.pathname.endsWith('/planner') && (o.method || 'GET') === 'GET') return { ok: true, status: 200, text: async () => JSON.stringify(snapshot()) };
  if (u.pathname.endsWith('/planner/changes')) {
    if (putReply) return { ok: false, status: 422, text: async () => JSON.stringify(putReply) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ entries: {}, ranks: {} }) };
  }
  return { ok: true, status: 200, text: async () => '{}' };
};

const app = () => document.getElementById('app');
const $ = (id) => document.querySelector(`[data-testid="${id}"]`);
const settle = async () => { for (let i = 0; i < 6; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const show = async () => {
  const r = createRoot(app());
  await React.act(() => r.render(React.createElement(MemoryRouter, { initialEntries: ['/testco/cf_erp/plan'] }, React.createElement(Plan))));
  await settle();
  return r;
};
const pointer = async (target, type, x, y, init = {}) => {
  await React.act(async () => { target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y, pointerId: 1, ...init })); });
};
const click = async (el) => { await React.act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); await settle(); };
const key = async (target, k, init = {}) => { await React.act(async () => { target.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); }); await settle(); };
// jsdom has no layout: tree 250, not planned 92, weeks 48.
const xOf = (i) => 250 + 92 + i * 48 + 24;
/** drag a card (chip or bar) to week i; returns the drag hint's text seen just before the drop */
const dragTo = async (el, i) => {
  await pointer(el, 'pointerdown', 270, 120);
  await pointer(window, 'pointermove', 290, 120);
  await pointer(window, 'pointermove', xOf(i), 120);
  await settle();
  const hint = $('drag-hint')?.textContent ?? '';
  await pointer(window, 'pointerup', xOf(i), 120);
  await settle();
  return hint;
};
const reload = async () => { await React.act(() => root.unmount()); window.localStorage.clear(); root = await show(); };

// ── the engine ───────────────────────────────────────────────────────────
await check('engine: a waiting unit cannot be placed; the reason is the backend sentence', () => {
  const s = snapshot();
  for (const k of ['l2', 'l5']) {
    const r = E.canPlace(s, {}, k, KEY(3));
    assert.equal(r.ok, false);
    assert.equal(r.reason, WAIT_TEXT);
  }
});
await check('engine: old supply lots would cover l5, but the browser does not look — it is waiting', () => {
  const s = snapshot();
  assert.ok(s.supply.PL.lots[0].qty >= 100);
  const ev = E.evaluate(s, {});
  assert.equal(ev.units.l5.blockedKind, 'waiting');
  assert.equal(ev.units.l5.blocked, WAIT_TEXT);
  assert.equal(ev.units.l5.materialState, 'waiting');
  assert.equal(ev.units.l1.blocked, null);
  assert.equal(ev.units.l1.materialState, 'ready');
});
await check('engine: a dated unit is refused before its earliest week and accepted from it', () => {
  const s = snapshot();
  const early = E.canPlace(s, {}, 'l3', KEY(2));
  assert.equal(early.ok, false);
  assert.equal(early.earliest, KEY(4));
  assert.ok(early.reason.startsWith(DATED_TEXT), early.reason);
  assert.match(early.reason, /plan it for the week of 2 Nov or later/);
  assert.equal(E.canPlace(s, {}, 'l3', KEY(4)).ok, true);
  assert.equal(E.canPlace(s, {}, 'l3', KEY(6)).ok, true);
});
await check('engine: a stretched bar cannot start before the earliest week either', () => {
  const s = snapshot();
  const plan = { l3: { period: KEY(6), pinned: true } };
  const no = E.canStretch(s, plan, 'l3', KEY(2));
  assert.equal(no.ok, false);
  assert.equal(no.earliestStart, KEY(4));
  assert.equal(E.canStretch(s, plan, 'l3', KEY(4)).ok, true);
});
await check('engine: no `material` field (an old snapshot) means no gate, not the old supply gate', () => {
  const s = snapshot();
  s.units = s.units.map(({ material, ...rest }) => rest);
  s.supply = {};
  assert.equal(E.canPlace(s, {}, 'l2', KEY(0)).ok, true);
  assert.equal(E.canPlace(s, {}, 'l3', KEY(0)).ok, true);
  assert.equal(E.evaluate(s, {}).units.l2.blocked, null);
});
await check('engine: the saved placement the server flags carries its message until it is moved', () => {
  const s = snapshot();
  const ev = E.evaluate(s, E.planFromEntries(s));
  assert.equal(ev.units.l4.blocked, STALE_MSG);
  assert.equal(ev.units.l4.blockedKind, 'material_late');
  assert.match(ev.units.l4.blocked, /2 Nov 2026/);
  assert.match(ev.units.l4.blocked, /19 Oct 2026/);
  assert.equal(E.evaluate(s, { l4: { period: KEY(5), pinned: true } }).units.l4.blocked, null);
  assert.match(E.evaluate(s, { l4: { period: KEY(2), pinned: true } }).units.l4.blocked, /cannot ship before then/);
  const w = snapshot();
  w.entries.l4.blocked = { kind: 'waiting', message: 'It now waits for stock. When this card was placed its material was here.', readyDate: null, earliest: null, was: { state: 'ready', date: null } };
  const wev = E.evaluate(w, E.planFromEntries(w));
  assert.equal(wev.units.l4.blockedKind, 'waiting');
  assert.match(wev.units.l4.blocked, /now waits/);
});
await check('engine: refusedMoves ignores a card that stays where it is, and un-planning', () => {
  const s = snapshot();
  const saved = E.planFromEntries(s);
  assert.deepEqual(E.refusedMoves(s, saved, saved), []);
  assert.deepEqual(E.refusedMoves(s, saved, {}), []);
  assert.equal(E.refusedMoves(s, saved, { ...saved, l4: { period: KEY(2), pinned: true } }).length, 1);
});
await check('auto-plan: never places a waiting unit, books dated units from their earliest week, counts the waiting', () => {
  const s = snapshot();
  const { plan, notes } = E.autoPlan(s, {});
  assert.ok(!('l2' in plan) && !('l5' in plan), 'waiting units stay off the board');
  assert.ok(plan.l1 && plan.l6, 'ready units are placed');
  assert.ok(plan.l3 && plan.l4);
  assert.ok(periods.findIndex((p) => p.key === plan.l3.period) >= 4, `l3 ships ${plan.l3.period}`);
  assert.ok(periods.findIndex((p) => p.key === plan.l4.period) >= 4, `l4 ships ${plan.l4.period}`);
  assert.ok(notes.includes('2 cards wait for stock (buying skipped or no date yet) — see their reasons.'), notes.join(' | '));
  assert.ok(!notes.some((n) => /Buy list/.test(n)));
  assert.deepEqual(E.refusedMoves(s, {}, plan), [], 'the plan it makes is one the server would accept');
});

// ── the page ─────────────────────────────────────────────────────────────
let root;
await check('the header says how many cards wait (materialReady.counts); waiting cards say why', async () => {
  window.localStorage.clear();
  root = await show();
  assert.equal($('material-waiting').textContent, '2 cards wait for stock');
  assert.ok($('chip-l2') && $('chip-l5') && $('chip-l3'));
  assert.match($('chip-l2').getAttribute('aria-label'), /waiting for stock \(2 kg not in stock yet\)/);
  assert.equal($('change-count').textContent, 'All saved');
});
await check('a WAITING unit cannot be dropped on the board, and the hint says why (also when old supply would cover it)', async () => {
  for (const k of ['l2', 'l5']) {
    const hint = await dragTo($(`chip-${k}`), 1);
    assert.match(hint, /waiting for stock \(2 kg not in stock yet\)/, hint);
    assert.ok($(`chip-${k}`), 'still not planned');
    assert.equal($(`bar-${k}`), null);
  }
  assert.equal($('change-count').textContent, 'All saved');
  assert.equal($('drag-hint'), null);
});
await check('a DATED unit is refused before its earliest week, and accepted in it', async () => {
  const hint = await dragTo($('chip-l3'), 2);
  assert.match(hint, /due 2 Nov 2026 on PO-001035/, hint);
  assert.match(hint, /cannot ship before then/, hint);
  assert.ok($('chip-l3') && $('bar-l3') === null);
  assert.equal($('change-count').textContent, 'All saved');
  await dragTo($('chip-l3'), 4);
  assert.equal($('bar-l3').dataset.period, KEY(4));
  assert.equal($('change-count').textContent, '1 change');
});
await check('the stretch grip cannot start a dated bar before its earliest week', async () => {
  await dragTo($('bar-l3'), 7); // ship later, so there is room to stretch
  assert.equal($('bar-l3').dataset.period, KEY(7));
  const grip = $('stretch-l3');
  await pointer(grip, 'pointerdown', xOf(7), 120);
  await pointer(window, 'pointermove', xOf(7) - 10, 120);
  await pointer(window, 'pointermove', xOf(2), 120);
  await settle();
  assert.match($('drag-hint').textContent, /The work cannot start before/);
  await pointer(window, 'pointerup', xOf(2), 120);
  await settle();
  assert.doesNotMatch($('bar-l3').getAttribute('aria-label'), /Stretched/);
  await pointer(grip, 'pointerdown', xOf(7), 120);
  await pointer(window, 'pointermove', xOf(7) - 10, 120);
  await pointer(window, 'pointermove', xOf(5), 120);
  await pointer(window, 'pointerup', xOf(5), 120);
  await settle();
  assert.match($('bar-l3').getAttribute('aria-label'), /Stretched from/);
});
await check('a stale saved placement shows the backend flag (old and new date) until it is moved; the keys obey the rule too', async () => {
  await reload();
  const bar = $('bar-l4');
  assert.equal(bar.dataset.period, KEY(1));
  const label = bar.getAttribute('aria-label');
  assert.ok(label.includes('2 Nov 2026') && label.includes('19 Oct 2026'), label);
  assert.ok(label.includes(STALE_MSG), 'the backend message, word for word');
  // select it, one week right is still before 2 Nov: refused, nothing moves
  await pointer(bar, 'pointerdown', xOf(1), 120);
  await pointer(window, 'pointerup', xOf(1), 120);
  await settle();
  await key($('plan-grid'), 'ArrowRight');
  assert.equal($('bar-l4').dataset.period, KEY(1));
  assert.equal($('change-count').textContent, 'All saved');
  // four weeks right lands on/after the earliest week: moves, and the flag goes
  await key($('plan-grid'), 'ArrowRight', { shiftKey: true });
  assert.equal($('bar-l4').dataset.period, KEY(5));
  assert.ok(!$('bar-l4').getAttribute('aria-label').includes(STALE_MSG));
  assert.equal($('change-count').textContent, '1 change');
});
await check('the card sheet shows the backend text and the reasons (item, need, short, text) with a way to Purchase', async () => {
  await reload();
  await React.act(async () => { $('chip-l2').dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })); });
  await settle();
  assert.equal($('unit-material-text').textContent, `${WAIT_TEXT} — open Purchase`);
  const reasons = [...document.querySelectorAll('[data-testid="unit-material-reason"]')].map((r) => r.textContent);
  assert.equal(reasons.length, 2);
  assert.match(reasons[0], /BHMV2RB688-C.*2 kg · short 2.*buying was skipped/);
  assert.match(reasons[1], /BHMV2RB688-B.*due 11 Nov 2026 on PO-001035/);
  assert.ok([...document.querySelectorAll('a')].some((a) => a.textContent === 'open Purchase'));
});
await check('Save refused with 422 MATERIAL_NOT_READY: the refused drop is reverted, the backend problems are shown, the others stay', async () => {
  await reload();
  await dragTo($('chip-l1'), 2);
  await dragTo($('chip-l6'), 3);
  assert.equal($('change-count').textContent, '2 changes');
  putReply = refusal422('l1');
  const save = [...$('save-bar').querySelectorAll('button')].find((b) => b.textContent === 'Save');
  await click(save);
  const put = requests.filter((r) => r.method === 'PUT' && r.path.endsWith('/planner/changes')).at(-1);
  assert.deepEqual(put.body.entries.map((e) => e.unitKey).sort(), ['l1', 'l6']);
  assert.ok($('chip-l1'), 'l1 is back in Not planned');
  assert.equal($('bar-l1'), null);
  assert.equal($('bar-l6').dataset.period, KEY(3), 'the card the server did not refuse stays where it was dropped');
  assert.equal($('change-count').textContent, '1 change');
  assert.match($('save-refused').textContent, /SO-M\/1 cannot be planned yet — it is waiting for material\. BHMV2RB688-C: buying was skipped/);
  await click($('save-refused').querySelector('button'));
  assert.equal($('save-refused'), null, 'dismissible');
  putReply = null;
  await click([...$('save-bar').querySelectorAll('button')].find((b) => b.textContent === 'Save'));
  assert.equal($('change-count').textContent, 'All saved');
});
await check('a refused card that was planned in the saved plan goes back to its saved week, not off the board', async () => {
  await reload();
  const s0 = requests.length;
  await dragTo($('bar-l4'), 6);
  assert.equal($('bar-l4').dataset.period, KEY(6));
  putReply = refusal422('l4');
  await click([...$('save-bar').querySelectorAll('button')].find((b) => b.textContent === 'Save'));
  assert.equal($('bar-l4').dataset.period, KEY(1), 'back where it was saved');
  assert.equal($('change-count').textContent, 'All saved');
  assert.ok(requests.length > s0);
  putReply = null;
});
await check('auto-plan on the page: the banner counts the waiting cards, and Apply never places them', async () => {
  await reload();
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Auto-plan');
  await click(btn);
  await new Promise((r) => setTimeout(r, 60));
  await settle();
  assert.match(document.body.textContent, /2 cards wait for stock \(buying skipped or no date yet\) — see their reasons\./);
  await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Apply'));
  assert.ok($('chip-l2') && $('chip-l5'), 'waiting cards stay in Not planned');
  assert.ok($('bar-l1') && $('bar-l3'));
  assert.ok(periods.findIndex((p) => p.key === $('bar-l3').dataset.period) >= 4);
});
await check('a read-only user (no cf_erp_production_manage) cannot drag, save or auto-plan', async () => {
  globalThis.__user = { appRoles: { cf_erp: { uiPermissions: ['cf_erp_production_view'] } } };
  await reload();
  assert.equal($('save-bar'), null);
  assert.ok(![...document.querySelectorAll('button')].some((b) => b.textContent === 'Auto-plan'));
  await pointer($('chip-l1'), 'pointerdown', 270, 120);
  await pointer(window, 'pointermove', 290, 120);
  await pointer(window, 'pointermove', xOf(2), 120);
  assert.equal($('drag-hint'), null);
  await pointer(window, 'pointerup', xOf(2), 120);
  await settle();
  assert.ok($('chip-l1') && $('bar-l1') === null);
  globalThis.__user = null;
  await React.act(() => root.unmount());
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
