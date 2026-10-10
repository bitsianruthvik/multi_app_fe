// Run from multi_app_fe: node scripts/planner_engine_test.mjs
// Pure engine tests for src/apps/cf_erp/lib/planner (contract: TM/CF_ERP_PLANNER_PLAN.md §1–3,
// booking: TM/CF_ERP_PLANNER_V2_PLAN.md — finite capacity, priority order, stretch, fastest).
// Material is the SERVER's answer (TM/CF_ERP_BUYING_V2.md §5): each unit carries `material`, the browser only enforces it.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';

const built = await build({ stdin: { contents: `export * from './src/apps/cf_erp/lib/planner';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external' });
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `planner-engine-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const E = await import(pathToFileURL(artifact));
await unlink(artifact);
let passed = 0, failed = 0;
const check = (label, fn) => { try { fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };

// ── Fixture ─────────────────────────────────────────────────────────────────────────────────────
// Order A (priority 1): line 11 → span S1 (p1) → girder lines G1 (p2), G2 (p3) → segments (marks)
// p4,p5 under G1 and p6,p7 under G2. Each segment: cut 300, weld 300, 10 t, 1 PL.
// Order B (priority 2): line 21, unlocked, one line unit needing item XX (the server says: not ordered).
const periods = E.buildPeriods('2026-10-01', 3);
const cap = (v) => Object.fromEntries(periods.map((p) => [p.key, v]));
const seg = (id, parent, group, code) => ({ key: `p${id}`, orderId: 1, lineId: 11, level: '3', pieceId: id, code, name: code, depth: 3, parentKey: parent, groupKey: group, isMark: true, marks: 1, tonnes: 10, work: { cut: 300, weld: 300 }, noRate: 0, done: false, progress: 0, materials: [{ itemId: 'PL', qty: 1 }], material: READY, committedDate: null });
const agg = (key, id, depth, parent, group, code, n) => ({ key, orderId: 1, lineId: 11, level: id == null ? 'line' : String(depth), pieceId: id, code, name: code, depth, parentKey: parent, groupKey: group, isMark: false, marks: n, tonnes: 10 * n, work: { cut: 300 * n, weld: 300 * n }, noRate: 0, done: false, progress: 0, materials: [{ itemId: 'PL', qty: n }], material: READY, committedDate: null });
// The server's per-unit answer (shape: UnitMaterialInfo).
const READY = { state: 'ready', readyDate: '2026-10-01', earliest: null, soft: false, materials: 1, text: 'PL20: in stock.', reasons: [] };
const dated = (date, text = `PL20: due ${date} on PO-1.`, earliest = date) => ({ state: 'dated', readyDate: date, earliest, soft: false, materials: 1, text, reasons: [] });
const lateMat = (date = '2026-10-05') => ({ state: 'late', readyDate: date, earliest: null, soft: false, materials: 1, text: `PL20: was due ${date}, not here yet.`, reasons: [] });
const waiting = (text = 'Waiting for stock: PL20 short by 1. Buying was skipped for it.') => ({ state: 'waiting', readyDate: null, earliest: null, soft: false, materials: 1, text, reasons: [] });
const NOT_ORDERED = 'Not ordered: item XX is short by 3.';
/** The first plan period starting on/after a date (what the server sends as `earliest`). */
const periodFrom = (d) => periods.find((p) => p.start >= d)?.start ?? null;
/** fixture({ mat: { p3: dated(...) } }) puts the server's answer on those units; the rest are ready (l21 is not ordered). */
function fixture(over = {}) {
  const { mat = {}, ...rest } = over;
  const f = base(rest);
  f.units = f.units.map((u) => ({ ...u, material: mat[u.key] ?? u.material }));
  return f;
}
function base(over = {}) {
  return {
    horizon: { from: periods[0].start, to: periods[periods.length - 1].end, periods },
    settings: { minLinesPerMonth: 1, allowPartialLines: true },
    targets: { '2026-10': 50 },
    functions: [
      { key: 'cut', name: 'CNC plasma cutting', machines: 1, capacity: cap(1000), noShifts: false },
      { key: 'weld', name: 'SAW welding', machines: 1, capacity: cap(1000), noShifts: false },
      { key: 'contractor', name: 'Contractors', unlimited: true },
    ],
    orders: [
      { id: 1, code: 'SO-A', customer: 'KEPL', committedDate: '2026-11-15', priority: 1, lines: [{ id: 11, lineNo: 1, name: 'Bridge', quantity: 1, locked: true, released: false, level: '2', levels: [{ value: 'line', label: 'Whole' }, { value: '1', label: 'Bridge span' }, { value: '2', label: 'Girder line' }, { value: '3', label: 'Girder segment' }] }] },
      { id: 2, code: 'SO-B', customer: 'X', committedDate: '2026-12-20', priority: 2, lines: [{ id: 21, lineNo: 1, name: 'Stock', quantity: 1, locked: false, released: false, level: 'line', levels: [{ value: 'line', label: 'Whole' }] }] },
    ],
    units: [
      agg('l11', null, 0, null, 'l11', 'SO-A/1', 4),
      agg('p1', 1, 1, null, 'p1', 'S1', 4),
      agg('p2', 2, 2, 'p1', 'p2', 'G1', 2),
      agg('p3', 3, 2, 'p1', 'p3', 'G2', 2),
      seg(4, 'p2', 'p2', 'G1-1'), seg(5, 'p2', 'p2', 'G1-2'), seg(6, 'p3', 'p3', 'G2-1'), seg(7, 'p3', 'p3', 'G2-2'),
      { key: 'l21', orderId: 2, lineId: 21, level: 'line', pieceId: null, code: 'SO-B/1', name: 'Stock', depth: 0, parentKey: null, groupKey: 'l21', isMark: false, marks: 0, tonnes: 5, work: { cut: 100, contractor: 5000 }, noRate: 1, done: false, progress: 0, materials: [{ itemId: 'XX', qty: 3 }], material: waiting(NOT_ORDERED), committedDate: null },
    ],
    entries: {},
    ...over,
  };
}
const pk = (i) => periods[i].key;
const idxOf = (key) => periods.findIndex((p) => p.key === key);

// ── Periods ─────────────────────────────────────────────────────────────────────────────────────
check('periods are ISO weeks cut at month ends', () => {
  assert.equal(periods[0].start, '2026-10-01');
  assert.equal(periods[0].end, '2026-10-04'); // Thu → Sun
  assert.equal(periods[periods.length - 1].end, '2026-12-31');
  const octLast = periods.filter((p) => p.month === '2026-10').pop();
  assert.equal(octLast.end, '2026-10-31');
  const novFirst = periods.find((p) => p.month === '2026-11');
  assert.equal(novFirst.start, '2026-11-01');
  assert.equal(novFirst.end, '2026-11-01'); // Sunday 1 Nov is its own period
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    assert.equal(p.start.slice(0, 7), p.end.slice(0, 7), 'a period stays inside one month');
    const dow = new Date(`${p.end}T00:00:00Z`).getUTCDay();
    const monthEnd = new Date(Date.UTC(+p.end.slice(0, 4), +p.end.slice(5, 7), 0)).toISOString().slice(0, 10);
    assert.ok(dow === 0 || p.end === monthEnd, `${p.end} is a Sunday or a month end`);
    if (i) assert.equal(new Date(`${p.start}T00:00:00Z`) - new Date(`${periods[i - 1].end}T00:00:00Z`), 86400000);
  }
  assert.ok(periods.length >= 14 && periods.length <= 16, `~15 periods (${periods.length})`);
  assert.equal(E.periodContaining(periods, '2026-10-31'), idxOf(octLast.key));
});

// ── Active units / levels ───────────────────────────────────────────────────────────────────────
check('board shows the current level; levels option overrides; split via child entries', () => {
  const s = fixture();
  assert.deepEqual(E.activeUnitKeys(s, {}), ['p2', 'p3', 'l21']);
  assert.deepEqual(E.activeUnitKeys(s, {}, { levels: { 11: '1' } }), ['p1', 'l21']);
  assert.deepEqual(E.activeUnitKeys(s, {}, { levels: { 11: 'line' } }), ['l11', 'l21']);
  // span level with an entry for G1 only → split: G1 planned, G2 unplanned card
  assert.deepEqual(E.activeUnitKeys(s, { p2: { period: pk(2), pinned: false } }, { levels: { 11: '1' } }), ['p2', 'p3', 'l21']);
  const ev = E.evaluate(s, {});
  assert.deepEqual(Object.keys(ev.units).sort(), ['l21', 'p2', 'p3']);
  assert.deepEqual(Object.keys(E.dropLineEntries(s, { p2: { period: pk(1), pinned: true }, l21: { period: pk(1), pinned: false } }, 11)), ['l21']);
});

// ── Booking and load ────────────────────────────────────────────────────────────────────────
check('booking: a card placed by hand books BACK from its ship week into the hours left, each step before the next', () => {
  const s = fixture({  });
  const lv = { levels: { 11: '1' } };
  // span: cut 1200 then weld 1200, 1000 a week each → weld fills week 3 and 200 of week 2, cut fills week 2 and 200 of week 1
  const ev = E.evaluate(s, { p1: { period: pk(3), pinned: true } }, lv);
  const u = ev.units.p1;
  assert.equal(u.leadStart, pk(1));
  assert.equal(u.lead, 3);
  assert.equal(ev.load.weld[pk(3)].minutes, 1000);
  assert.equal(ev.load.weld[pk(2)].minutes, 200);
  assert.equal(ev.load.cut[pk(2)].minutes, 1000);
  assert.equal(ev.load.cut[pk(1)].minutes, 200);
  assert.equal(ev.load.cut[pk(3)].minutes, 0, 'cutting comes before welding');
  assert.deepEqual(u.booked[pk(1)], { cut: 200 });
  assert.equal(u.overload, false);
  assert.equal(u.minWeeks, 3, 'an empty shop: cut weeks 0–1, weld weeks 1–2');
  // stages set the order: here welding (deeper level) comes first, then cutting
  const st = fixture({ units: fixture().units.map((x) => (x.key === 'p2' ? { ...x, work: { cut: 500, weld: 1500 }, stages: [{ depth: 3, steps: [{ fn: 'weld', minutes: 1500 }] }, { depth: 2, steps: [{ fn: 'cut', minutes: 500 }] }] } : x)) });
  const evs = E.evaluate(st, { p2: { period: pk(3), pinned: true } });
  assert.deepEqual(evs.units.p2.booked[pk(3)], { cut: 500, weld: 1000 });
  assert.deepEqual(evs.units.p2.booked[pk(2)], { weld: 500 });
  // the horizon starts: what does not fit by week 0 lands there and shows as overload
  const ev0 = E.evaluate(s, { p1: { period: pk(0), pinned: true } }, lv);
  assert.equal(ev0.load.cut[pk(0)].minutes, 1200);
  assert.equal(ev0.units.p1.leadStart, pk(0));
  assert.equal(ev0.units.p1.overload, true);
  // an auto-placed (unpinned) card books FORWARD from its material, as early as it can
  const fw = E.evaluate(s, { p1: { period: pk(3), pinned: false } }, lv);
  assert.equal(fw.units.p1.leadStart, pk(0));
  assert.deepEqual(fw.units.p1.booked[pk(0)], { cut: 1000 });
  assert.deepEqual(fw.units.p1.booked[pk(2)], { weld: 200 });
  assert.equal(fw.units.p1.booked[pk(3)], undefined, 'done before its ship week');
});

check('booking: finite capacity in priority order — the card behind takes what is left', () => {
  const s = fixture({  });
  const ev = E.evaluate(s, { p2: { period: pk(3), pinned: true }, p3: { period: pk(3), pinned: true } });
  assert.equal(ev.units.p2.leadStart, pk(3), 'G1 (ahead) books its whole chain in week 3');
  assert.equal(ev.units.p3.leadStart, pk(2), 'G2 gets the 400 left in week 3 and goes back into week 2');
  assert.deepEqual(ev.units.p3.booked[pk(3)], { weld: 400 });
  assert.deepEqual(ev.units.p3.booked[pk(2)], { weld: 200, cut: 600 });
  assert.equal(ev.score.overloadedCells, 0);
  // pinned by hand books first, whatever its priority
  const pin = E.evaluate(s, { p2: { period: pk(3), pinned: false }, p3: { period: pk(3), pinned: true } });
  assert.equal(pin.units.p3.leadStart, pk(3));
  assert.equal(pin.units.p2.leadStart, pk(0), 'the auto-placed G1 books forward around the pin');
});
check('load sums over units; contractor is unlimited; overload flagged', () => {
  // the server holds the four segments to week 1 or later, so the hand-pinned cards cannot book back before it and the cell overloads
  const wk1 = dated(periods[1].start, 'PL20: due the second week.', periods[1].start);
  const s = fixture({ mat: { p4: wk1, p5: wk1, p6: wk1, p7: wk1 } });
  const lv = { levels: { 11: '3' } };
  const plan = { p4: { period: pk(1), pinned: true }, p5: { period: pk(1), pinned: true }, p6: { period: pk(1), pinned: true }, p7: { period: pk(2), pinned: true } };
  const ev = E.evaluate(s, plan, lv);
  assert.equal(ev.load.cut[pk(1)].minutes, 900);
  assert.equal(ev.load.weld[pk(1)].minutes, 900);
  assert.equal(ev.load.cut[pk(2)].minutes, 300);
  assert.equal(ev.units.p4.overload, false);
  const plan2 = { ...plan, p7: { period: pk(1), pinned: true } };
  const ev2 = E.evaluate(s, plan2, lv);
  assert.equal(ev2.load.cut[pk(1)].minutes, 1200);
  assert.ok(ev2.load.cut[pk(1)].pct > 100);
  assert.equal(ev2.units.p4.overload, true);
  assert.equal(ev2.score.overloadedCells, 2);
  const ev3 = E.evaluate(s, { l21: { period: pk(5), pinned: true } });
  assert.equal(ev3.load.contractor[pk(5)].minutes, 5000);
  assert.equal(ev3.load.contractor[pk(5)].capacity, null);
  assert.equal(ev3.load.contractor[pk(5)].pct, 0);
  assert.equal(ev3.score.overloadedCells, 0);
});

// ── Material ────────────────────────────────────────────────────────────────────────────────────
const PO = periodFrom('2026-10-20');
const poIdx = idxOf(PO);
const PO_TEXT = 'PL20: due 20 Oct 2026 on PO-1.';
check('material: the server\'s answer reaches the card and is enforced (ready / dated / late; a pin and an auto card alike)', () => {
  const s = fixture({ mat: { p3: dated('2026-10-20', PO_TEXT, PO), p2: lateMat() } });
  const ok = E.evaluate(s, { p2: { period: pk(1), pinned: false }, p3: { period: pk(poIdx), pinned: false } });
  assert.equal(ok.units.p2.materialState, 'late');
  assert.equal(ok.units.p2.blocked, null, 'late has no date to hold the card to');
  assert.equal(ok.units.p3.materialState, 'dated');
  assert.equal(ok.units.p3.materialDate, '2026-10-20');
  assert.match(ok.units.p3.materialText, /20 Oct 2026 on PO-1/);
  assert.equal(ok.units.p3.blocked, null);
  assert.equal(ok.units.p3.leadStart, pk(poIdx), 'its work starts no earlier than the earliest week');
  for (const pinned of [false, true]) {
    const early = E.evaluate(s, { p3: { period: pk(1), pinned } });
    assert.equal(early.units.p3.blockedKind, 'material_late');
    assert.match(early.units.p3.blocked, /20 Oct 2026 on PO-1/);
    assert.equal(early.score.blockedUnits, 2, 'p3 and the not-ordered l21');
  }
  // no claiming in the browser: the answer does not depend on which card is pinned first
  const a = E.evaluate(s, { p3: { period: pk(poIdx), pinned: true }, p2: { period: pk(1), pinned: false } });
  const b = E.evaluate(s, { p2: { period: pk(1), pinned: true }, p3: { period: pk(poIdx), pinned: false } });
  for (const ev of [a, b]) { assert.equal(ev.units.p2.blocked, null); assert.equal(ev.units.p3.blocked, null); }
  // no material on a unit = no gate
  const none = fixture();
  none.units = none.units.map((u) => { const { material, ...r } = u; return r; });
  assert.equal(E.evaluate(none, { l21: { period: pk(0), pinned: false } }).units.l21.blocked, null);
});
check('material: a card the server says WAITS is blocked with its sentence (planned or not)', () => {
  const s = fixture();
  const ev = E.evaluate(s, {});
  assert.equal(ev.units.l21.blockedKind, 'waiting');
  assert.match(ev.units.l21.blocked, /^Not ordered: item XX is short by 3/);
  assert.equal(ev.units.l21.materialDate, null);
  const two = fixture({ mat: { p3: waiting('Waiting for stock: PL20 short by 1 nos.') } });
  const ev2 = E.evaluate(two, { p2: { period: pk(2), pinned: false }, p3: { period: pk(3), pinned: false } });
  assert.equal(ev2.units.p2.blocked, null);
  assert.equal(ev2.units.p3.blockedKind, 'waiting');
  assert.match(ev2.units.p3.blocked, /PL20 short by 1 nos/);
  assert.equal(ev2.score.blockedUnits, 2); // p3 and the not-ordered l21
  // the server's call stands whatever else the snapshot carries (a leftover supply is ignored)
  const stocked = { ...two, supply: { PL: { name: 'P', code: 'PL', uom: 'nos', lots: [{ date: '2026-10-01', qty: 99, source: 'stock', received: true }] } } };
  assert.equal(E.evaluate(stocked, { p3: { period: pk(3), pinned: false } }).units.p3.blockedKind, 'waiting');
});

check('canPlace refuses what material makes impossible, with a reason; allows overload', () => {
  const s = fixture({ mat: { p3: dated('2026-10-20', PO_TEXT, PO) } });
  const plan = { p2: { period: pk(1), pinned: true } };
  const r = E.canPlace(s, plan, 'p3', pk(1));
  assert.equal(r.ok, false);
  assert.match(r.reason, /20 Oct 2026 on PO-1/);
  assert.match(r.reason, /cannot ship before then/);
  assert.equal(r.earliest, pk(poIdx));
  assert.equal(E.canPlace(s, plan, 'p3', pk(poIdx)).ok, true);
  assert.equal(E.canPlace(s, plan, 'p3', pk(poIdx + 1)).ok, true);
  const nr = E.canPlace(s, {}, 'l21', pk(3));
  assert.equal(nr.ok, false);
  assert.match(nr.reason, /Not ordered/);
  assert.equal(nr.earliest, null, 'a waiting card has no earliest week');
  // an earliest week after the plan ends: refused, no week to offer
  const beyond = fixture({ mat: { p2: dated('2027-01-11', 'PL20: due 11 Jan 2027.') } });
  const br = E.canPlace(beyond, {}, 'p2', pk(periods.length - 1));
  assert.equal(br.ok, false);
  assert.match(br.reason, /after the last week/);
  assert.equal(br.earliest ?? null, null);
  // a span dated at the PO week: refused before it, accepted from it
  const lv = { levels: { 11: '1' } };
  const two = fixture({ mat: { p1: dated('2026-10-20', PO_TEXT, PO) } });
  const lr = E.canPlace(two, {}, 'p1', pk(poIdx - 1), lv);
  assert.equal(lr.ok, false);
  assert.equal(lr.earliest, pk(poIdx));
  // restored: the week it is dated is not enough when the work needs two weeks after it (cut 1200 runs into the next week, weld after)
  const tu = E.canPlace(two, {}, 'p1', pk(poIdx + 1), lv);
  assert.equal(tu.ok, false);
  assert.match(tu.reason, /takes until/);
  assert.equal(tu.earliest, pk(poIdx + 2));
  assert.equal(E.canPlace(two, {}, 'p1', pk(poIdx + 2), lv).ok, true);
  // overload is allowed by hand
  const heavy = { p2: { period: pk(1), pinned: false } };
  const hs = fixture({ functions: [{ key: 'cut', name: 'Cut', capacity: cap(10) }, { key: 'weld', name: 'Weld', capacity: cap(10) }] });
  assert.equal(E.canPlace(hs, heavy, 'p2', pk(1)).ok, true);
  assert.equal(E.canPlace(s, {}, 'p2', 'nope').ok, false);
  assert.equal(E.canPlace(s, {}, 'p1', pk(3)).ok, false); // above the line's level
});

check('stretch: work spreads evenly from the start week; moves keep the width; not before material', () => {
  const s = fixture({  });
  const lv = { levels: { 11: '1' } };
  const ev = E.evaluate(s, { p1: { period: pk(4), start: pk(1), pinned: true } }, lv);
  assert.equal(ev.units.p1.leadStart, pk(1));
  assert.equal(ev.units.p1.lead, 4);
  assert.equal(ev.units.p1.start, pk(1));
  for (let i = 1; i <= 4; i++) { assert.equal(ev.load.cut[pk(i)].minutes, 300); assert.equal(ev.load.weld[pk(i)].minutes, 300); }
  const plan = { p1: { period: pk(4), pinned: false } };
  assert.deepEqual(E.stretchTo(s, plan, 'p1', pk(0)).p1, { period: pk(4), start: pk(0), pinned: true });
  assert.deepEqual(E.stretchTo(s, { p1: { period: pk(4), start: pk(0), pinned: true } }, 'p1', null).p1, { period: pk(4), pinned: true });
  assert.deepEqual(E.stretchTo(s, plan, 'p1', pk(4)).p1, { period: pk(4), pinned: true }, 'a start at the ship week is no stretch');
  const moved = E.dragTo(s, { p1: { period: pk(4), start: pk(1), pinned: true } }, ['p1'], 'p1', pk(6));
  assert.deepEqual(moved.p1, { period: pk(6), start: pk(3), pinned: true });
  const back = E.shiftBy(s, { p1: { period: pk(4), start: pk(1), pinned: true } }, ['p1'], -3);
  assert.deepEqual(back.p1, { period: pk(1), start: pk(0), pinned: true }, 'clamped at the first week');
  // not before its material
  const two = fixture({ mat: { p2: dated('2026-10-20', PO_TEXT, PO) } });
  const poPeriod = poIdx;
  const pp = { p2: { period: pk(6), pinned: true } };
  const no = E.canStretch(two, pp, 'p2', pk(2));
  assert.equal(no.ok, false);
  assert.match(no.reason, /cannot start before/);
  assert.equal(no.earliestStart, pk(poPeriod));
  assert.equal(E.canStretch(two, pp, 'p2', pk(poPeriod)).ok, true);
  assert.equal(E.canStretch(two, pp, 'p2', pk(7)).ok, false, 'not after its ship week');
  const bad = E.evaluate(two, { p2: { period: pk(6), start: pk(2), pinned: true } });
  assert.equal(bad.units.p2.blockedKind, 'material_late');
  assert.match(bad.units.p2.blocked, /work cannot start before/);
  // a waiting card is not refused a stretch here (it cannot be planned at all)
  assert.equal(E.canStretch(fixture(), { l21: { period: pk(6), pinned: true } }, 'l21', pk(2)).ok, true);
});

check('fastest: as early as material and the hours left by the cards ahead allow', () => {
  const s = fixture({  });
  assert.equal(E.fastest(s, {}, 'p4', { levels: { 11: '3' } }), pk(0));
  // G1 pinned in week 0 leaves 400 a machine there: G2 cuts 400 + 200, then welds in week 1
  assert.equal(E.fastest(s, { p2: { period: pk(0), pinned: true } }, 'p3'), pk(1));
  // a card behind it in priority makes room
  assert.equal(E.fastest(s, { p3: { period: pk(0), pinned: false } }, 'p2'), pk(0));
  assert.equal(E.fastest(fixture(), {}, 'l21'), null, 'not ordered');
  const d = E.fastest(fixture({ mat: { p3: dated('2026-10-20', PO_TEXT, PO) } }), { p2: { period: pk(0), pinned: true } }, 'p3');
  assert.equal(d, pk(poIdx), 'from its earliest week');
});
check('material ready before the horizon (earliest null) counts from the first period', () => {
  const s = fixture({ mat: { p2: { state: 'ready', readyDate: '2026-09-15', earliest: null, soft: false, materials: 1, text: 'PL20: received 15 Sep.', reasons: [] } } });
  assert.equal(E.canPlace(s, {}, 'p2', pk(0)).ok, true);
  assert.equal(E.fastest(s, {}, 'p2'), pk(0));
});

// ── Lines, months, late ─────────────────────────────────────────────────────────────────────────
check('a line ships in the period of its LAST mark; tonnes by month; completes tick', () => {
  const s = fixture({ supply: { PL: { name: 'P', code: 'PL', uom: 'nos', lots: [{ date: '2026-10-01', qty: 9, source: 'stock', received: true }] } } });
  const lv = { levels: { 11: '3' } };
  const nov = periods.findIndex((p) => p.month === '2026-11');
  const ev = E.evaluate(s, { p4: { period: pk(1), pinned: false }, p5: { period: pk(nov), pinned: false } }, lv);
  assert.equal(ev.lines.p2.period, pk(nov));
  assert.equal(ev.lines.p2.month, '2026-11');
  assert.equal(ev.lines.p3.period, null);
  assert.equal(ev.months['2026-10'].tonnes, 10);
  assert.equal(ev.months['2026-10'].linesShipped, 0);
  assert.equal(ev.months['2026-10'].marksShipped, 1);
  assert.equal(ev.months['2026-11'].linesShipped, 1);
  assert.equal(ev.months['2026-10'].target, 50);
  assert.equal(ev.months['2026-11'].target, null);
  assert.deepEqual(ev.units.p5.completesLines, ['p2']);
  assert.deepEqual(ev.units.p4.completesLines, []);
  // a span ships both of its lines at once
  const ev2 = E.evaluate(s, { p1: { period: pk(4), pinned: false } }, { levels: { 11: '1' } });
  assert.equal(ev2.lines.p2.period, pk(4));
  assert.equal(ev2.lines.p3.period, pk(4));
  assert.equal(ev2.months['2026-10'].linesShipped, 2);
  assert.equal(ev2.months['2026-10'].marksShipped, 4);
  assert.equal(ev2.months['2026-10'].tonnes, 40);
  assert.equal(ev2.score.tonnesInHorizon, 40);
  assert.deepEqual(ev2.units.p1.completesLines.sort(), ['p2', 'p3']);
  assert.equal(ev2.months['2026-10'].bottleneck.fn, 'cut');
});

check('late = ship period end after the committed date', () => {
  const s = fixture({ supply: { PL: { name: 'P', code: 'PL', uom: 'nos', lots: [{ date: '2026-10-01', qty: 9, source: 'stock', received: true }] } } });
  const onTime = periods.findIndex((p) => p.end <= '2026-11-15' && p.month === '2026-11');
  const lateIdx = periods.findIndex((p) => p.end > '2026-11-15');
  const ev = E.evaluate(s, { p2: { period: pk(onTime), pinned: false }, p3: { period: pk(lateIdx), pinned: false } });
  assert.equal(ev.units.p2.late, false);
  assert.equal(ev.units.p3.late, true);
  assert.equal(ev.score.lateUnits, 1);
});

// ── autoPlan ────────────────────────────────────────────────────────────────────────────────────
check('autoPlan: never overloads, respects material, deterministic', () => {
  const s = fixture();
  const a = E.autoPlan(s, {});
  const b = E.autoPlan(s, {});
  assert.deepEqual(a, b);
  const ev = E.evaluate(s, a.plan);
  assert.equal(ev.score.overloadedCells, 0);
  for (const [k, u] of Object.entries(ev.units)) if (u.period) assert.equal(u.blocked, null, `${k} placed but blocked`);
  assert.ok(a.plan.p2 && a.plan.p3, 'both girder lines placed');
  assert.ok(!a.plan.l21, 'a card the server says waits stays off the board');
  assert.ok(a.notes.some((n) => /waits? for stock/.test(n)), a.notes.join(' | '));
  // a dated card is not placed before its earliest week
  const d = fixture({ mat: { p3: dated('2026-10-20', PO_TEXT, PO) } });
  const ad = E.autoPlan(d, {});
  assert.ok(idxOf(ad.plan.p3.period) >= poIdx, 'p3 ships no earlier than its earliest week');
  assert.equal(E.evaluate(d, ad.plan).units.p3.blocked, null);
  assert.ok(a.notes.some((n) => /^October: \d+ t of the 50 t goal/.test(n)), a.notes.join(' | '));
});

check('autoPlan notes: cards off the board say why, counted, before the month lines', () => {
  const a = E.autoPlan(fixture(), {});
  assert.equal(a.notes[0], '1 card waits for stock (buying skipped or no date yet) — see its reasons.', a.notes.join(' | '));
  assert.ok(a.notes.findIndex((n) => n.startsWith('October:')) > 0, 'the reason comes before the month lines');
  const lv = { levels: { 11: '3' } };
  const after = dated('2027-01-11', 'PL20: due 11 Jan 2027.');
  const late = E.autoPlan(fixture({ mat: { p4: after, p5: after, p6: after, p7: after } }), {}, lv);
  assert.ok(late.notes.includes('4 cards wait for material due after December.'), late.notes.join(' | '));
  assert.ok(late.notes.includes('1 card waits for stock (buying skipped or no date yet) — see its reasons.'), late.notes.join(' | '));
  // 50 a week: four segments need 1,200 min of cutting, the horizon gives ~750
  const tight = fixture({ functions: [{ key: 'cut', name: 'Cut', capacity: cap(50) }, { key: 'weld', name: 'Weld', capacity: cap(50) }] });
  const t = E.autoPlan(tight, {}, lv);
  assert.ok(t.notes.some((n) => /cards? (doesn't|don't) fit the machine hours left before the end of December\./.test(n)), t.notes.join(' | '));
  assert.ok(!t.notes.some((n) => /due after|too late/.test(n)), t.notes.join(' | '));
  assert.equal(E.evaluate(tight, t.plan, lv).score.overloadedCells, 0);
  const none = E.autoPlan(fixture({ mat: { p2: waiting(), p3: waiting() } }), {});
  assert.ok(none.notes.includes('3 cards wait for stock (buying skipped or no date yet) — see their reasons.'), none.notes.join(' | '));
  // a machine type with no shifts cannot be timed: its work is planned free and named
  const noShift = fixture({ functions: [{ key: 'cut', name: 'Cut', capacity: cap(0) }, { key: 'weld', name: 'Weld', capacity: cap(1000) }] });
  const ns = E.autoPlan(noShift, {}, lv);
  assert.equal(Object.keys(ns.plan).length, 4);
  assert.ok(ns.notes.includes('Cut has no shift time in this plan — its work is shown but cannot be timed; set its shifts.'), ns.notes.join(' | '));
});
check('autoPlan: pins stay exactly where they are', () => {
  const s = fixture();
  const late = pk(periods.length - 1);
  const plan = { p3: { period: late, pinned: true }, p2: { period: pk(9), pinned: false } };
  const a = E.autoPlan(s, plan);
  assert.deepEqual(a.plan.p3, { period: late, pinned: true });
  assert.equal(a.plan.p2.pinned, false);
  assert.ok(idxOf(a.plan.p2.period) < 9, 'unpinned card is re-planned (earliest)');
  assert.ok(a.notes[0].startsWith('Kept 1 pinned card'));
  // a pin that overloads stays, and autoPlan adds nothing to that cell
  const hs = fixture({ functions: [{ key: 'cut', name: 'Cut', capacity: cap(250) }, { key: 'weld', name: 'Weld', capacity: cap(250) }] });
  const pins = { p4: { period: pk(1), pinned: true }, p5: { period: pk(1), pinned: true } };
  const p = E.autoPlan(hs, pins, { levels: { 11: '3' } });
  assert.deepEqual(p.plan.p4, { period: pk(1), pinned: true });
  const ev = E.evaluate(hs, p.plan, { levels: { 11: '3' } });
  const pinOnly = E.evaluate(hs, pins, { levels: { 11: '3' } });
  assert.ok(pinOnly.score.overloadedCells > 0);
  assert.equal(ev.score.overloadedCells, pinOnly.score.overloadedCells);
  for (const fn of ['cut', 'weld']) for (const [k, c] of Object.entries(ev.load[fn])) if (c.pct > 100) assert.equal(c.minutes, pinOnly.load[fn][k].minutes, 'nothing added to an overloaded cell');
  for (const k of ['p6', 'p7']) if (p.plan[k]) assert.notEqual(p.plan[k].period, pk(1));
});

check('autoPlan: each card as early as it can, in priority order', () => {
  const s = fixture({  });
  const lv = { levels: { 11: '3' } };
  const a = E.autoPlan(s, {}, lv);
  // segments 300 + 300 each, 1000 a week: three fit week 0, the fourth needs week 1
  assert.deepEqual(['p4', 'p5', 'p6', 'p7'].map((k) => a.plan[k]?.period), [pk(0), pk(0), pk(0), pk(1)]);
  const ev = E.evaluate(s, a.plan, lv);
  assert.equal(ev.score.overloadedCells, 0);
  for (const k of ['p4', 'p5', 'p6', 'p7']) assert.equal(ev.units[k].overload, false);
  assert.equal(ev.lines.p2.month, '2026-10');
});
check('autoPlan: a later order runs alongside in the hours an earlier one leaves free', () => {
  // Order A (priority 1): 12 segments, cut 200 then weld 800 — welding is A's limit, cutting has room.
  // Order C (priority 2): 2 segments of cutting only, material in the last October week.
  const segs = [];
  for (let i = 0; i < 12; i++) segs.push({ key: `a${i}`, orderId: 1, lineId: 11, level: '1', pieceId: 100 + i, code: `A-${i}`, name: `A-${i}`, depth: 1, parentKey: null, groupKey: 'gA', isMark: true, marks: 1, tonnes: 10, work: { cut: 200, weld: 800 }, noRate: 0, done: false, progress: 0, materials: [], committedDate: null });
  const c = [0, 1].map((i) => ({ key: `c${i}`, orderId: 3, lineId: 31, level: '1', pieceId: 200 + i, code: `C-${i}`, name: `C-${i}`, depth: 1, parentKey: null, groupKey: 'gC', isMark: true, marks: 1, tonnes: 5, work: { cut: 400 }, noRate: 0, done: false, progress: 0, materials: [{ itemId: 'Q', qty: 1 }], committedDate: null }));
  const octIdx = periods.map((p, i) => [p, i]).filter(([p]) => p.month === '2026-10').map(([, i]) => i);
  const lastOct = periods[octIdx[octIdx.length - 1]];
  const s = fixture({
    orders: [
      { id: 1, code: 'SO-A', customer: 'K', committedDate: '2026-12-31', priority: 1, lines: [{ id: 11, lineNo: 1, name: 'A', quantity: 1, locked: true, released: false, level: '1', levels: [{ value: '1', label: 'Segment' }] }] },
      { id: 3, code: 'SO-C', customer: 'K', committedDate: '2026-12-31', priority: 2, lines: [{ id: 31, lineNo: 1, name: 'C', quantity: 1, locked: true, released: false, level: '1', levels: [{ value: '1', label: 'Segment' }] }] },
    ],
    units: [...segs, ...c.map((u) => ({ ...u, material: dated(lastOct.start, 'Q: due in the last October week.', lastOct.start) }))],
    functions: [{ key: 'cut', name: 'Cut', capacity: cap(1000) }, { key: 'weld', name: 'Weld', capacity: cap(1000) }],
  });
  const a = E.autoPlan(s, {});
  const ev = E.evaluate(s, a.plan);
  assert.equal(ev.score.overloadedCells, 0);
  assert.equal(ev.lines.gC.period, lastOct.key, 'C ships the week its material comes, while A is still welding');
  assert.ok(idxOf(ev.lines.gA.period) > idxOf(lastOct.key), 'A finishes later');
  assert.ok(a.notes.some((n) => /^Up to 2 orders are in work at once/.test(n)), a.notes.join(' | '));
});
check('autoPlan: determinism across calls and fresh snapshot copies', () => {
  const s1 = fixture();
  const s2 = JSON.parse(JSON.stringify(s1));
  const lv = { levels: { 11: '3' } };
  assert.deepEqual(E.autoPlan(s1, {}, lv), E.autoPlan(s2, {}, lv));
});

// ── feedback ────────────────────────────────────────────────────────────────────────────────────
check('feedback: tonnes deltas, lines moving month, functions crossing 100%, late / blocked', () => {
  const s = fixture();
  const lateIdx = periods.findIndex((p) => p.end > '2026-11-15');
  const before = E.evaluate(s, { p2: { period: pk(1), pinned: false }, p3: { period: pk(2), pinned: false } });
  const after = E.evaluate(s, { p2: { period: pk(1), pinned: false }, p3: { period: pk(lateIdx), pinned: false } });
  const lines = E.feedback(before, after);
  assert.ok(lines.includes('-20 t in Oct'), lines.join(' | '));
  assert.ok(lines.includes('+20 t in Nov'), lines.join(' | '));
  assert.ok(lines.includes('Girder line G2 now ships in Nov'), lines.join(' | '));
  assert.ok(lines.includes('G2 now ships after the committed date'), lines.join(' | '));
  const over = E.evaluate(s, { p2: { period: pk(0), pinned: false }, p3: { period: pk(0), pinned: false } });
  const fb2 = E.feedback(before, over);
  assert.ok(fb2.some((l) => new RegExp(`^CNC plasma cutting 120% in ${periods[0].label}$`).test(l)), fb2.join(' | '));
  assert.ok(E.feedback(over, before).some((l) => /^SAW welding back under 100% in /.test(l)));
  const fb = fixture({ mat: { p3: dated('2026-10-20', PO_TEXT, PO) } });
  const blocked = E.evaluate(fb, { p2: { period: pk(1), pinned: false }, p3: { period: pk(1), pinned: false } });
  const okEv = E.evaluate(fb, { p2: { period: pk(1), pinned: false } });
  assert.ok(E.feedback(okEv, blocked).some((l) => l === 'G2 is now blocked by material'));
  assert.deepEqual(E.feedback(before, before), []);
  const offPlan = E.evaluate(s, { p2: { period: pk(1), pinned: false } });
  assert.ok(E.feedback(before, offPlan).includes('Girder line G2 no longer ships in this plan'));
});

check('entries round trip: planFromEntries / entriesDiff', () => {
  const s = fixture({ entries: { p2: { shipDate: periods[3].start, pinned: true }, p9: { shipDate: '2030-01-01', pinned: false } } });
  const plan = E.planFromEntries(s);
  assert.deepEqual(plan, { p2: { period: pk(3), pinned: true } });
  const diff = E.entriesDiff(s, plan, { p3: { period: pk(4), pinned: false } });
  assert.deepEqual(diff, [{ unitKey: 'p3', shipDate: periods[4].start, startDate: null, pinned: false }, { unitKey: 'p2', shipDate: null, startDate: null, pinned: false }]);
  // a stretch round-trips as startDate
  const st = fixture({ entries: { p2: { shipDate: periods[5].start, startDate: periods[2].start, pinned: true } } });
  const sp = E.planFromEntries(st);
  assert.deepEqual(sp, { p2: { period: pk(5), start: pk(2), pinned: true } });
  assert.deepEqual(E.entriesDiff(st, sp, { p2: { period: pk(5), pinned: true } }), [{ unitKey: 'p2', shipDate: periods[5].start, startDate: null, pinned: true }]);
});

// ── Performance: 2,000 units × 15 periods × 40 functions ────────────────────────────────────────
// ~5% of segments wait for stock, ~20% are dated to a week inside the horizon, the rest are ready.
const servedMaterial = (r) => (r < 0.05 ? waiting() : r < 0.25 ? dated(periods[1 + (Math.floor(r * 100) % 6)].start) : READY);
function synthetic(seed = 7) {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const fns = Array.from({ length: 40 }, (_, i) => ({ key: `f${i}`, name: `Function ${i}`, machines: 2, capacity: cap(2400 + Math.floor(rnd() * 4000)), noShifts: false }));
  fns.push({ key: 'contractor', name: 'Contractors', unlimited: true });
  const items = Array.from({ length: 12 }, (_, i) => `I${i}`);
  const orders = [], units = [];
  let pid = 1;
  const levels = ['1', '2', '3', 'line'];
  for (let o = 0; o < 22; o++) {
    const lineId = 1000 + o;
    const level = levels[o % 4];
    orders.push({ id: o + 1, code: `SO-${o}`, customer: 'C', committedDate: `2026-${o % 2 ? '11' : '12'}-${String(10 + (o % 18)).padStart(2, '0')}`, priority: o % 5 === 0 ? null : o + 1, lines: [{ id: lineId, lineNo: 1, name: `L${o}`, quantity: 2, locked: true, released: false, level, levels: [{ value: 'line', label: 'Whole' }, { value: '1', label: 'Span' }, { value: '2', label: 'Girder line' }, { value: '3', label: 'Segment' }] }] });
    const line = { key: `l${lineId}`, orderId: o + 1, lineId, level: 'line', pieceId: null, code: `SO-${o}/1`, name: 'line', depth: 0, parentKey: null, groupKey: `l${lineId}`, isMark: false, marks: 0, tonnes: 0, work: {}, noRate: 0, done: false, progress: 0, materials: [], committedDate: null };
    units.push(line);
    const addUp = (parent, child) => {
      parent.tonnes += child.tonnes;
      parent.marks += child.isMark ? 1 : child.marks;
      for (const [k, v] of Object.entries(child.work)) parent.work[k] = (parent.work[k] ?? 0) + v;
      for (const mt of child.materials) parent.materials.push({ ...mt });
    };
    for (let sp = 0; sp < 2; sp++) {
      const span = { key: `p${pid}`, orderId: o + 1, lineId, level: '1', pieceId: pid++, code: `S${o}-${sp}`, name: 'span', depth: 1, parentKey: null, groupKey: '', isMark: false, marks: 0, tonnes: 0, work: {}, noRate: 0, done: false, progress: 0, materials: [], committedDate: null };
      span.groupKey = span.key;
      units.push(span);
      for (let g = 0; g < 4; g++) {
        const gl = { key: `p${pid}`, orderId: o + 1, lineId, level: '2', pieceId: pid++, code: `S${o}-${sp}-G${g}`, name: 'girder line', depth: 2, parentKey: span.key, groupKey: '', isMark: false, marks: 0, tonnes: 0, work: {}, noRate: 0, done: false, progress: 0, materials: [], committedDate: null };
        gl.groupKey = gl.key;
        units.push(gl);
        for (let k = 0; k < 10; k++) {
          const work = {};
          const nf = 3 + Math.floor(rnd() * 4);
          for (let f = 0; f < nf; f++) work[`f${Math.floor(rnd() * 40)}`] = 60 + Math.floor(rnd() * 300);
          if (rnd() < 0.1) work.contractor = 200;
          const segU = { key: `p${pid}`, orderId: o + 1, lineId, level: '3', pieceId: pid++, code: `${gl.code}-${k}`, name: 'segment', depth: 3, parentKey: gl.key, groupKey: gl.key, isMark: true, marks: 1, tonnes: 2 + rnd() * 3, work, noRate: 0, done: false, progress: 0, materials: [{ itemId: items[Math.floor(rnd() * items.length)], qty: 0.5 + rnd() }], material: servedMaterial(rnd()), committedDate: null };
          units.push(segU);
          addUp(gl, segU);
        }
        addUp(span, gl);
      }
      addUp(line, span);
    }
  }
  return fixture({ functions: fns, orders, units, targets: { '2026-10': 300, '2026-11': 300, '2026-12': 300 } });
}

const timings = {};
// ── 2026-10-01 rework: ranks, moves, machine areas ───────────────────────────────────────────────
check('ranks: a line\'s hand-dragged order comes first in priority, and auto-plan follows it', () => {
  const s0 = fixture({ settings: { minLinesPerMonth: 0, allowPartialLines: true } });
  const p0 = E.unitPriority(s0);
  assert.ok(p0.get('p2') < p0.get('p3'), 'structure order without ranks');
  const s1 = fixture({ settings: { minLinesPerMonth: 0, allowPartialLines: true }, ranks: { p3: 1, p2: 2 } });
  const p1 = E.unitPriority(s1);
  assert.ok(p1.get('p3') < p1.get('p2'), 'G2 ranked first');
  assert.ok(p1.get('l21') > p1.get('p2'), 'ranks never jump the order ranking (order B stays after order A)');
  // The material answer is the server's and the same whatever the order: ranks only decide who books hours first.
  const m = (ranks) => fixture({ ranks, mat: { p2: dated('2026-10-20', PO_TEXT, PO) } });
  assert.ok(E.evaluate(m({}), { p2: { period: pk(1), pinned: false } }).units.p2.blocked);
  assert.ok(E.evaluate(m({ p3: 1, p2: 2 }), { p2: { period: pk(1), pinned: false } }).units.p2.blocked);
  // tight shop (700 min a week per machine, 600 cut + 600 weld per girder line): the ranked line gets the first hours and ships first
  const tight = (ranks) => fixture({ ranks, functions: [{ key: 'cut', name: 'Cut', capacity: cap(700) }, { key: 'weld', name: 'Weld', capacity: cap(700) }] });
  const shipOf = (s, k) => idxOf(E.autoPlan(s, {}).plan[k].period);
  assert.ok(shipOf(tight({}), 'p2') < shipOf(tight({}), 'p3'), 'structure order without ranks: G1 first');
  assert.ok(shipOf(tight({ p3: 1, p2: 2 }), 'p3') < shipOf(tight({ p3: 1, p2: 2 }), 'p2'), 'ranked G2 ships first');
});
check('moves: dragTo shifts planned units by the anchor\'s delta (clamped) and lands unplanned ones on the target; all pinned', () => {
  const s = fixture();
  const plan = { p2: { period: pk(1), pinned: false }, p3: { period: pk(periods.length - 2), pinned: false } };
  const n = E.dragTo(s, plan, ['p2', 'p3', 'l21'], 'p2', pk(3));
  assert.equal(n.p2.period, pk(3));
  assert.equal(n.p3.period, pk(periods.length - 1), 'clamped to the last week');
  assert.equal(n.l21.period, pk(3), 'the unplanned one lands on the target');
  assert.ok(n.p2.pinned && n.p3.pinned && n.l21.pinned);
  assert.deepEqual(Object.keys(E.dragTo(s, plan, ['p2'], 'p2', null)), ['p3'], 'null target = off the plan');
  const n2 = E.dragTo(s, {}, ['p2', 'p3'], 'p2', pk(2));
  assert.equal(n2.p2.period, pk(2)); assert.equal(n2.p3.period, pk(2));
  assert.equal(plan.p2.period, pk(1), 'the input plan is not touched');
});
check('moves: shiftBy (arrow keys), unplan, reorderKeys', () => {
  const s = fixture();
  const plan = { p2: { period: pk(0), pinned: true } };
  assert.equal(E.shiftBy(s, plan, ['p2'], -1), plan, 'nothing to do at the first week: same object');
  assert.equal(E.shiftBy(s, plan, ['p2'], 2).p2.period, pk(2));
  assert.equal(E.shiftBy(s, plan, ['p3'], 1, pk(0)).p3.period, pk(0), 'an unplanned unit is placed where told');
  assert.deepEqual(E.unplan(plan, ['p2']), {});
  assert.deepEqual(E.reorderKeys(['a', 'b', 'c', 'd'], ['c', 'a'], 'b'), ['a', 'c', 'b', 'd']);
  assert.deepEqual(E.reorderKeys(['a', 'b', 'c'], ['a'], null), ['b', 'c', 'a']);
  assert.deepEqual(E.reorderKeys(['a', 'b', 'c'], ['c'], 'a'), ['c', 'a', 'b']);
});
check('moves: rankLine replaces one line\'s order; rankChanges finds the lines that changed', () => {
  const s = fixture();
  const r1 = E.rankLine(s, { l21: 1 }, 11, ['p3', 'p2']);
  assert.deepEqual(r1, { l21: 1, p3: 1, p2: 2 });
  const r2 = E.rankLine(s, r1, 11, ['p2', 'p3']);
  assert.deepEqual(E.rankChanges(s, r1, r2), [{ lineId: 11, unitKeys: ['p2', 'p3'] }]);
  assert.deepEqual(E.rankChanges(s, r1, r1), []);
  assert.deepEqual(E.rankChanges(s, r1, { l21: 1 }), [{ lineId: 11, unitKeys: [] }], 'cleared = an empty order');
});
check('machine areas: the level giving 4–10 areas, else nearest 7; no tree = one area per type; unlimited apart', () => {
  const fn = (key, area, aid) => ({ key, name: key, machines: 1, capacity: {}, path: [{ id: 1, name: 'Machines', depth: 0, level: 'Family' }, { id: aid, name: area, depth: 1, level: 'Subfamily' }, { id: 100 + aid * 10 + key.length, name: key, depth: 2, level: 'Variant' }] });
  const four = [fn('a', 'Cutting', 2), fn('b', 'Welding', 3), fn('bb', 'Welding', 3), fn('c', 'Drilling', 4), fn('d', 'Painting', 5), { key: 'contractor', name: 'Contractors', unlimited: true }];
  const set = E.machineAreas(four);
  assert.equal(set.depth, 1); assert.equal(set.level, 'Subfamily');
  assert.deepEqual(set.areas.map((a) => a.name), ['Cutting', 'Drilling', 'Painting', 'Welding', 'Contractors']);
  assert.equal(set.areas.find((a) => a.name === 'Welding').machines, 2);
  const three = E.machineAreas(four.slice(0, 4));
  assert.equal(three.depth, 2, '3 subfamilies is too few — the variant level (4 types) is in range');
  const flat = E.machineAreas([{ key: 'x', name: 'X', capacity: {} }, { key: 'y', name: 'Y', capacity: {} }]);
  assert.equal(flat.depth, null); assert.equal(flat.level, 'Machine type'); assert.equal(flat.areas.length, 2);
});
check('machine areas from an asset register: only types with plan work choose the level; idle types keep their area\'s capacity', () => {
  const at = (key, fam, fid, sub, sid) => ({ key, name: key, machines: 1, capacity: {}, path: [{ id: fid, name: fam, depth: 0, level: 'Family' }, { id: sid, name: sub, depth: 1, level: 'Subfamily' }] });
  const fns = [
    at('cnc', 'Machines', 1, 'Cutting', 11), at('drill', 'Machines', 1, 'Drilling', 12), at('saw', 'Machines', 1, 'Welding', 13),
    at('mig', 'Machines', 1, 'Welding', 13), at('blast', 'Machines', 1, 'Finishing', 14),
    at('panel', 'Electrical', 2, 'Panels', 21), at('truck', 'Vehicles', 3, 'Trucks', 31), at('crane', 'Material handling', 4, 'Cranes', 41),
  ];
  const working = new Set(['cnc', 'drill', 'saw', 'blast']);
  const set = E.machineAreas(fns, working);
  assert.equal(set.level, 'Subfamily', 'the families would be 4 areas of mostly idle assets');
  assert.deepEqual(set.areas.map((a) => a.name), ['Cutting', 'Drilling', 'Finishing', 'Welding']);
  assert.deepEqual(set.areas.find((a) => a.name === 'Welding').fnKeys.sort(), ['mig', 'saw'], 'idle MIG still counts in Welding\'s capacity');
  assert.equal(E.workingFunctions({ units: [{ work: { cnc: 5, drill: 0 } }, { work: { saw: 2 } }] }).size, 2);
});
check('area usage = Σ of its functions\' minutes ÷ Σ capacity per week and over the horizon; bands 75 / 100', () => {
  const capAll = (v) => Object.fromEntries(periods.map((p) => [p.key, v]));
  const s = fixture({ functions: [
    { key: 'cut', name: 'Cut', machines: 1, capacity: capAll(1000), path: [{ id: 1, name: 'M', depth: 0 }, { id: 2, name: 'Cutting', depth: 1, level: 'Subfamily' }] },
    { key: 'weld', name: 'Weld', machines: 1, capacity: capAll(1000), path: [{ id: 1, name: 'M', depth: 0 }, { id: 3, name: 'Welding', depth: 1, level: 'Subfamily' }] },
    { key: 'contractor', name: 'Contractors', unlimited: true },
  ] });
  const set = E.machineAreas(s.functions);
  const ev = E.evaluate(s, { p2: { period: pk(0), pinned: true }, p3: { period: pk(0), pinned: true } });
  const rows = E.areaUsage(s, ev, set);
  const cut = rows.find((r) => r.name === 'Cutting');
  assert.equal(cut.cells[pk(0)].minutes, 1200);
  assert.equal(cut.cells[pk(0)].pct, 120);
  assert.equal(E.usageBand(cut.cells[pk(0)]), 'over');
  assert.equal(cut.total.minutes, 1200);
  assert.ok(Math.abs(cut.total.pct - 120 / periods.length) < 1e-9);
  assert.equal(E.usageBand({ minutes: 740, capacity: 1000, pct: 74 }), 'ok');
  assert.equal(E.usageBand({ minutes: 750, capacity: 1000, pct: 75 }), 'warn');
  assert.equal(E.usageBand({ minutes: 1000, capacity: 1000, pct: 100 }), 'warn');
  assert.equal(E.usageBand({ minutes: 0, capacity: 1000, pct: 0 }), 'none');
  const con = rows.find((r) => r.unlimited);
  assert.equal(con.cells[pk(0)].capacity, null);
  const d = E.cellDrivers(s, ev, ['cut'], pk(0));
  assert.deepEqual(d.map((x) => x.unitKey).sort(), ['p2', 'p3']);
  assert.equal(d[0].minutes, 600);
  assert.deepEqual(E.cellDrivers(s, ev, ['cut'], pk(1)), [], 'nothing loads week 2');
});

check('performance: evaluate < 50 ms and autoPlan < 300 ms at 2,000 units × 15 periods × 40 functions', () => {
  const s = synthetic();
  assert.ok(s.units.length >= 2000, `${s.units.length} units`);
  assert.equal(s.functions.length, 41);
  assert.ok(s.horizon.periods.length >= 15);
  const allSeg = { levels: Object.fromEntries(s.orders.map((o) => [o.lines[0].id, '3'])) };
  let t = performance.now();
  const first = E.evaluate(s, {}, allSeg);
  timings.evaluateCold = performance.now() - t;
  assert.ok(Object.keys(first.units).length >= 1700, 'segment level: ~1,760 cards');
  t = performance.now();
  const ap = E.autoPlan(s, {}, allSeg);
  timings.autoPlanSegments = performance.now() - t;
  t = performance.now();
  const ap2 = E.autoPlan(s, {});
  timings.autoPlanMixed = performance.now() - t;
  const runs = 10;
  t = performance.now();
  let ev;
  for (let i = 0; i < runs; i++) ev = E.evaluate(s, ap.plan, allSeg);
  timings.evaluateWarm = (performance.now() - t) / runs;
  t = performance.now();
  const keys = Object.keys(ap.plan);
  for (let i = 0; i < 20; i++) E.canPlace(s, ap.plan, keys[i * 7 % keys.length], s.horizon.periods[i % 15].key, allSeg);
  timings.canPlace = (performance.now() - t) / 20;
  assert.ok(timings.evaluateWarm < 50, `evaluate ${timings.evaluateWarm.toFixed(1)} ms`);
  assert.ok(timings.evaluateCold < 150, `evaluate cold (incl. index) ${timings.evaluateCold.toFixed(1)} ms`);
  assert.ok(timings.autoPlanSegments < 300, `autoPlan ${timings.autoPlanSegments.toFixed(1)} ms`);
  assert.ok(timings.autoPlanMixed < 300, `autoPlan mixed ${timings.autoPlanMixed.toFixed(1)} ms`);
  assert.equal(ev.score.overloadedCells, 0, 'autoPlan never overloads (synthetic)');
  assert.equal(E.evaluate(s, ap2.plan).score.overloadedCells, 0);
  for (const u of Object.values(ev.units)) if (u.period) assert.equal(u.blocked, null);
  assert.ok(ev.score.tonnesInHorizon > 0);
  assert.deepEqual(E.autoPlan(s, {}, allSeg).plan, ap.plan, 'deterministic at scale');
  console.log('   notes (mixed):', ap2.notes.join(' | '));
});

check('performance: tight capacity + waiting/dated material + pins stays < 300 ms and never overloads', () => {
  const base = synthetic(11);
  const tight = { ...base, functions: base.functions.map((f) => (f.unlimited ? f : { ...f, capacity: Object.fromEntries(Object.entries(f.capacity).map(([k, v]) => [k, Math.round(v / 6)])) })) };
  const allSeg = { levels: Object.fromEntries(tight.orders.map((o) => [o.lines[0].id, '3'])) };
  const pins = {};
  Object.keys(E.evaluate(tight, {}, allSeg).units).slice(0, 40).forEach((k, i) => (pins[k] = { period: tight.horizon.periods[i % 15].key, pinned: true }));
  let t = performance.now();
  const a = E.autoPlan(tight, pins, allSeg);
  timings.autoPlanTight = performance.now() - t;
  t = performance.now();
  const b = E.autoPlan(tight, {}, { ...allSeg, levels: {} });
  timings.autoPlanTightMixed = performance.now() - t;
  assert.ok(timings.autoPlanTight < 300, `${timings.autoPlanTight.toFixed(1)} ms`);
  assert.ok(timings.autoPlanTightMixed < 300, `${timings.autoPlanTightMixed.toFixed(1)} ms`);
  const pinOnly = E.evaluate(tight, pins, allSeg);
  const ev = E.evaluate(tight, a.plan, allSeg);
  for (const [fn, row] of Object.entries(ev.load)) for (const [k, c] of Object.entries(row)) if (c.pct > 100) assert.ok(c.minutes <= pinOnly.load[fn][k].minutes + 1e-6, `${fn} ${k} overloaded by autoPlan`);
  for (const [k, e] of Object.entries(pins)) assert.deepEqual(a.plan[k], e);
  assert.equal(E.evaluate(tight, b.plan).score.overloadedCells, 0);
  for (const u of Object.values(ev.units)) if (u.period && !u.pinned) assert.equal(u.blocked, null);
  console.log('   notes (tight):', a.notes.join(' | '));
});
console.log(`   timings ms: ${Object.entries(timings).map(([k, v]) => `${k}=${v.toFixed(1)}`).join(', ')}`);

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
