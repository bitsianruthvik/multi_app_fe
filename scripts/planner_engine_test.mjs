// Run from multi_app_fe: node scripts/planner_engine_test.mjs
// Pure engine tests for src/apps/cf_erp/lib/planner (contract: TM/CF_ERP_PLANNER_PLAN.md §1–3).
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
// Order B (priority 2): line 21, unlocked, one line unit needing item XX (no supply).
const periods = E.buildPeriods('2026-10-01', 3);
const cap = (v) => Object.fromEntries(periods.map((p) => [p.key, v]));
const seg = (id, parent, group, code) => ({ key: `p${id}`, orderId: 1, lineId: 11, level: '3', pieceId: id, code, name: code, depth: 3, parentKey: parent, groupKey: group, isMark: true, marks: 1, tonnes: 10, work: { cut: 300, weld: 300 }, noRate: 0, done: false, progress: 0, materials: [{ itemId: 'PL', qty: 1 }], committedDate: null });
const agg = (key, id, depth, parent, group, code, n) => ({ key, orderId: 1, lineId: 11, level: id == null ? 'line' : String(depth), pieceId: id, code, name: code, depth, parentKey: parent, groupKey: group, isMark: false, marks: n, tonnes: 10 * n, work: { cut: 300 * n, weld: 300 * n }, noRate: 0, done: false, progress: 0, materials: [{ itemId: 'PL', qty: n }], committedDate: null });
function fixture(over = {}) {
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
      { key: 'l21', orderId: 2, lineId: 21, level: 'line', pieceId: null, code: 'SO-B/1', name: 'Stock', depth: 0, parentKey: null, groupKey: 'l21', isMark: false, marks: 0, tonnes: 5, work: { cut: 100, contractor: 5000 }, noRate: 1, done: false, progress: 0, materials: [{ itemId: 'XX', qty: 3 }], committedDate: null },
    ],
    supply: {
      PL: { name: 'Plate 20', code: 'PL20', uom: 'nos', lots: [{ date: '2026-10-01', qty: 2, source: 'stock', received: true }, { date: '2026-10-20', qty: 2, source: 'PO-1', received: false }] },
    },
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

// ── Lead spread and load ────────────────────────────────────────────────────────────────────────
check('lead = ceil(bottleneck / 0.6 × avg capacity), capped at 4; load spread evenly over the lead', () => {
  const s = fixture();
  const ev = E.evaluate(s, { p1: { period: pk(3), pinned: false } }, { levels: { 11: '1' } });
  const u = ev.units.p1;
  assert.equal(u.lead, 2); // 1200 / 600 = 2
  assert.equal(u.leadStart, pk(2));
  assert.equal(ev.load.cut[pk(2)].minutes, 600);
  assert.equal(ev.load.cut[pk(3)].minutes, 600);
  assert.equal(ev.load.cut[pk(1)].minutes, 0);
  assert.equal(ev.load.cut[pk(3)].pct, 60);
  assert.equal(E.evaluate(s, {}).units.p2.lead, 1); // 600 / 600 = 1
  const big = fixture({ units: fixture().units.map((x) => (x.key === 'p1' ? { ...x, work: { cut: 99999 } } : x)) });
  assert.equal(E.evaluate(big, {}, { levels: { 11: '1' } }).units.p1.lead, 4);
  // lead squeezed at the start of the horizon
  const ev0 = E.evaluate(s, { p1: { period: pk(0), pinned: false } }, { levels: { 11: '1' } });
  assert.equal(ev0.load.cut[pk(0)].minutes, 1200);
  assert.equal(ev0.units.p1.leadStart, pk(0));
});

check('load sums over units; contractor is unlimited; overload flagged', () => {
  const s = fixture();
  const lv = { levels: { 11: '3' } };
  const plan = { p4: { period: pk(1), pinned: false }, p5: { period: pk(1), pinned: false }, p6: { period: pk(1), pinned: false }, p7: { period: pk(2), pinned: false } };
  // p6 at pk(1) takes... material: stock 2 → first two in plan order; the others need PO-1 (period starting ≥ 20 Oct)
  const ev = E.evaluate(s, plan, lv);
  assert.equal(ev.load.cut[pk(1)].minutes, 900);
  assert.equal(ev.load.weld[pk(1)].minutes, 900);
  assert.equal(ev.load.cut[pk(2)].minutes, 300);
  assert.equal(ev.units.p4.overload, false);
  const plan2 = { ...plan, p7: { period: pk(1), pinned: false } };
  const ev2 = E.evaluate(s, plan2, lv);
  assert.equal(ev2.load.cut[pk(1)].minutes, 1200);
  assert.ok(ev2.load.cut[pk(1)].pct > 100);
  assert.equal(ev2.units.p4.overload, true);
  assert.equal(ev2.score.overloadedCells, 2);
  const ev3 = E.evaluate(s, { l21: { period: pk(5), pinned: false } });
  assert.equal(ev3.load.contractor[pk(5)].minutes, 5000);
  assert.equal(ev3.load.contractor[pk(5)].capacity, null);
  assert.equal(ev3.load.contractor[pk(5)].pct, 0);
  assert.equal(ev3.score.overloadedCells, 0);
});

// ── Material ────────────────────────────────────────────────────────────────────────────────────
check('material: stock first, then POs by date, in plan order (ship period, then priority)', () => {
  const s = fixture();
  const poPeriod = idxOf(periods.find((p) => p.start >= '2026-10-20').key);
  const ev = E.evaluate(s, { p2: { period: pk(1), pinned: false }, p3: { period: pk(poPeriod), pinned: false } });
  assert.equal(ev.units.p2.materialSource, 'stock');
  assert.equal(ev.units.p3.materialSource, 'PO-1');
  assert.equal(ev.units.p3.materialDate, '2026-10-20');
  assert.equal(ev.units.p3.blocked, null);
  // swap ship periods → swap supply
  const ev2 = E.evaluate(s, { p3: { period: pk(1), pinned: false }, p2: { period: pk(poPeriod), pinned: false } });
  assert.equal(ev2.units.p3.materialSource, 'stock');
  assert.equal(ev2.units.p2.materialSource, 'PO-1');
  // both early → the second in priority order is material-late
  const ev3 = E.evaluate(s, { p2: { period: pk(1), pinned: false }, p3: { period: pk(1), pinned: false } });
  assert.equal(ev3.units.p2.blocked, null);
  assert.equal(ev3.units.p3.blockedKind, 'material_late');
  assert.match(ev3.units.p3.blocked, /20 Oct \(PO-1\)/);
});

check('material: uncovered need is blocked "not ordered" (planned or not)', () => {
  const s = fixture();
  const ev = E.evaluate(s, {});
  assert.equal(ev.units.l21.blockedKind, 'not_ordered');
  assert.match(ev.units.l21.blocked, /^Not ordered: item XX is short by 3/);
  const small = fixture({ supply: { PL: { name: 'Plate', code: 'PL20', uom: 'nos', lots: [{ date: '2026-10-01', qty: 3, source: 'stock', received: true }] } } });
  const ev2 = E.evaluate(small, { p2: { period: pk(2), pinned: false }, p3: { period: pk(3), pinned: false } });
  assert.equal(ev2.units.p2.blocked, null);
  assert.equal(ev2.units.p3.blockedKind, 'not_ordered'); // needs 2, only 1 left
  assert.match(ev2.units.p3.blocked, /PL20 is short by 1 nos/);
  assert.equal(ev2.score.blockedUnits, 2);
});

check('canPlace refuses material and lead violations with a reason; allows overload', () => {
  const s = fixture();
  const poPeriod = idxOf(periods.find((p) => p.start >= '2026-10-20').key);
  const plan = { p2: { period: pk(1), pinned: false } };
  const r = E.canPlace(s, plan, 'p3', pk(1));
  assert.equal(r.ok, false);
  assert.match(r.reason, /Material arrives 20 Oct \(PO-1\)/);
  assert.equal(r.earliest, pk(poPeriod));
  assert.equal(E.canPlace(s, plan, 'p3', pk(poPeriod)).ok, true);
  const nr = E.canPlace(s, {}, 'l21', pk(3));
  assert.equal(nr.ok, false);
  assert.match(nr.reason, /Not ordered/);
  // lead: span at span level, lead 2 → must start at/after the PO period
  const lv = { levels: { 11: '1' } };
  const two = fixture({ supply: { PL: { name: 'Plate', code: 'PL20', uom: 'nos', lots: [{ date: '2026-10-20', qty: 9, source: 'PO-1', received: false }] } } });
  const lr = E.canPlace(two, {}, 'p1', pk(poPeriod), lv);
  assert.equal(lr.ok, false);
  assert.match(lr.reason, /2-week lead/);
  assert.equal(lr.earliest, pk(poPeriod + 1));
  assert.equal(E.canPlace(two, {}, 'p1', pk(poPeriod + 1), lv).ok, true);
  // overload is allowed by hand
  const heavy = { p2: { period: pk(1), pinned: false } };
  const hs = fixture({ functions: [{ key: 'cut', name: 'Cut', capacity: cap(10) }, { key: 'weld', name: 'Weld', capacity: cap(10) }] });
  assert.equal(E.canPlace(hs, heavy, 'p2', pk(1)).ok, true);
  assert.equal(E.canPlace(s, {}, 'p2', 'nope').ok, false);
  assert.equal(E.canPlace(s, {}, 'p1', pk(3)).ok, false); // above the line's level
});

check('a received lot before the horizon counts from the first period', () => {
  const s = fixture({ supply: { PL: { name: 'P', code: 'PL', uom: 'nos', lots: [{ date: '2026-09-15', qty: 9, source: 'PO-7', received: true }] } } });
  assert.equal(E.canPlace(s, {}, 'p2', pk(0)).ok, true);
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
const richSupply = { PL: { name: 'P', code: 'PL', uom: 'nos', lots: [{ date: '2026-10-01', qty: 99, source: 'stock', received: true }] } };

check('autoPlan: never overloads, respects material, deterministic', () => {
  const s = fixture();
  const a = E.autoPlan(s, {});
  const b = E.autoPlan(s, {});
  assert.deepEqual(a, b);
  const ev = E.evaluate(s, a.plan);
  assert.equal(ev.score.overloadedCells, 0);
  for (const [k, u] of Object.entries(ev.units)) if (u.period) assert.equal(u.blocked, null, `${k} placed but blocked`);
  assert.ok(a.plan.p2 && a.plan.p3, 'both girder lines placed');
  assert.ok(!a.plan.l21, 'not-ordered line stays off the board');
  assert.ok(a.notes.some((n) => /isn't ordered/.test(n)), a.notes.join(' | '));
  assert.ok(a.notes.some((n) => /^October: \d+ t of the 50 t goal/.test(n)), a.notes.join(' | '));
});

check('autoPlan notes: cards off the board say why, counted, before the month lines', () => {
  // default fixture: both girder lines fit; line 21 needs XX, which nobody ordered
  const a = E.autoPlan(fixture(), {});
  assert.equal(a.notes[0], "1 card waits for material that isn't ordered — see the Buy list.", a.notes.join(' | '));
  assert.ok(a.notes.findIndex((n) => n.startsWith('October:')) > 0, 'the reason comes before the month lines');
  // material due after the horizon (January)
  const lv = { levels: { 11: '3' } };
  const late = E.autoPlan(fixture({ supply: { PL: { name: 'P', code: 'PL', uom: 'nos', lots: [{ date: '2027-01-11', qty: 99, source: 'PO-7', received: false }] } } }), {}, lv);
  assert.ok(late.notes.includes('4 cards wait for material due after December.'), late.notes.join(' | '));
  assert.ok(late.notes.includes("1 card waits for material that isn't ordered — see the Buy list."), late.notes.join(' | '));
  assert.ok(late.notes.indexOf("1 card waits for material that isn't ordered — see the Buy list.") < late.notes.findIndex((n) => n.startsWith('October:')));
  // no capacity for a segment anywhere (300 min over at most 4 weeks > 50 a week)
  const tight = fixture({ supply: richSupply, functions: [{ key: 'cut', name: 'Cut', capacity: cap(50) }, { key: 'weld', name: 'Weld', capacity: cap(50) }] });
  const t = E.autoPlan(tight, {}, { ...lv, minLinesPerMonth: 0 });
  assert.ok(t.notes.includes("4 cards don't fit the capacity left."), t.notes.join(' | '));
  assert.ok(!t.notes.some((n) => /due after|too late/.test(n)), t.notes.join(' | '));
  // nothing ordered at all: the months short of a line say it is material, once for the run of months
  const none = E.autoPlan(fixture({ supply: {} }), {});
  assert.ok(none.notes.includes("3 cards wait for material that isn't ordered — see the Buy list."), none.notes.join(' | '));
  assert.ok(none.notes.includes('October, November and December ship no whole line — the material for another is not ordered.'), none.notes.join(' | '));
  assert.ok(!none.notes.some((n) => /not enough capacity or material/.test(n)), 'no generic line when the reason is known');
  // capacity keeps the girder lines out, missing material keeps line 21 out: the note names both
  const capShort = E.autoPlan(tight, {}, { ...lv, minLinesPerMonth: 1 });
  assert.ok(capShort.notes.includes('October, November and December ship no whole line — the material for another is not ordered, or another does not fit the capacity left.'), capShort.notes.join(' | '));
  // …and only capacity when every candidate has its material
  const capOnly = E.autoPlan(fixture({ supply: richSupply, units: fixture().units.filter((u) => u.key !== 'l21'), functions: tight.functions }), {}, { ...lv, minLinesPerMonth: 1 });
  assert.ok(capOnly.notes.includes('October, November and December ship no whole line — another does not fit the capacity left.'), capOnly.notes.join(' | '));
});

check('autoPlan: pins stay exactly where they are', () => {
  const s = fixture({ supply: richSupply });
  const late = pk(periods.length - 1);
  const plan = { p3: { period: late, pinned: true }, p2: { period: pk(9), pinned: false } };
  const a = E.autoPlan(s, plan);
  assert.deepEqual(a.plan.p3, { period: late, pinned: true });
  assert.equal(a.plan.p2.pinned, false);
  assert.ok(idxOf(a.plan.p2.period) < 9, 'unpinned card is re-planned (earliest)');
  assert.ok(a.notes[0].startsWith('Kept 1 pinned card'));
  // a pin that overloads stays, and autoPlan adds nothing to that cell
  const hs = fixture({ supply: richSupply, functions: [{ key: 'cut', name: 'Cut', capacity: cap(250) }, { key: 'weld', name: 'Weld', capacity: cap(250) }] });
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

check('autoPlan: split a span that cannot finish in a month into its lines, with a note', () => {
  // capacity 250/period: a girder line (600) fits in a month, the span (1200, lead 4) does not fit a period window
  const s = fixture({ supply: richSupply, functions: [{ key: 'cut', name: 'Cut', capacity: cap(160) }, { key: 'weld', name: 'Weld', capacity: cap(160) }] });
  const lv = { levels: { 11: '1' } };
  const a = E.autoPlan(s, {}, lv);
  assert.ok(!a.plan.p1, 'the span itself is not planned');
  assert.ok(a.plan.p2 || a.plan.p3, 'its lines are');
  const note = a.notes.find((n) => n.startsWith('Split S1 into 2 girder lines'));
  assert.ok(note, a.notes.join(' | '));
  assert.match(note, /— \d+ ships? in October/);
  const ev = E.evaluate(s, a.plan, lv);
  assert.equal(ev.score.overloadedCells, 0);
  assert.ok(ev.units.p2, 'board shows the girder lines after the split');
});

check('autoPlan: whole line in a month when it completes there; partial fill otherwise', () => {
  const s = fixture({ supply: richSupply });
  const lv = { levels: { 11: '3' } };
  const a = E.autoPlan(s, {}, lv);
  const ev = E.evaluate(s, a.plan, lv);
  assert.equal(ev.lines.p2.month, '2026-10');
  assert.equal(ev.lines.p3.month, '2026-10');
  // tiny capacity: a line needs 600 per function, a month gives 5 × 100 = 500 → only partial
  const t = fixture({ supply: richSupply, functions: [{ key: 'cut', name: 'Cut', capacity: cap(100) }, { key: 'weld', name: 'Weld', capacity: cap(100) }] });
  const withPartial = E.autoPlan(t, {}, { ...lv, allowPartialLines: true, minLinesPerMonth: 0 });
  const noPartial = E.autoPlan(t, {}, { ...lv, allowPartialLines: false, minLinesPerMonth: 0 });
  const evP = E.evaluate(t, withPartial.plan, lv), evN = E.evaluate(t, noPartial.plan, lv);
  assert.equal(evP.score.overloadedCells, 0);
  assert.equal(evN.score.overloadedCells, 0);
  assert.ok(evP.months['2026-10'].tonnes > 0, 'partial fill ships marks in October');
  assert.equal(evN.months['2026-10'].tonnes, 0, 'no partial lines → October stays empty');
});

check('autoPlan: min-lines rule — says so when a month cannot ship a line; pins untouched', () => {
  // pins fill October; nothing else can finish there
  const s = fixture({ supply: richSupply, functions: [{ key: 'cut', name: 'Cut', capacity: cap(300) }, { key: 'weld', name: 'Weld', capacity: cap(300) }] });
  const lv = { levels: { 11: '3' } };
  const octIdx = periods.map((p, i) => [p, i]).filter(([p]) => p.month === '2026-10').map(([, i]) => i);
  const pins = { p4: { period: pk(octIdx[0]), pinned: true } };
  const a = E.autoPlan(s, pins, { ...lv, minLinesPerMonth: 1 });
  assert.deepEqual(a.plan.p4, pins.p4);
  const ev = E.evaluate(s, a.plan, lv);
  for (const ym of Object.keys(ev.months)) {
    if (ev.months[ym].linesShipped < 1 && Object.values(ev.units).some((u) => !u.period)) {
      assert.ok(a.notes.some((n) => n.startsWith(E.monthLong(ym))), `${ym} has a note`);
    }
  }
  assert.ok(ev.months['2026-10'].linesShipped >= 1, a.notes.join(' | '));
  // min 2 lines: October can carry both lines at 300/period (each segment 300)
  const b = E.autoPlan(s, {}, { ...lv, minLinesPerMonth: 2 });
  const evb = E.evaluate(s, b.plan, lv);
  assert.equal(evb.score.overloadedCells, 0);
  assert.equal(evb.months['2026-10'].linesShipped, 2, b.notes.join(' | '));
});

check('autoPlan: a line that completes in the month is placed before partial fill of a higher-priority line', () => {
  // Order A (priority 1) = 12-segment line, too big for October (5 weeks × 1000 min, 500 min each);
  // order C (priority 2) = one 2-segment line whose material arrives for the last October week.
  // Whole step first: A fails, C fits whole in the last week; partial fill then gives A the rest.
  const segs = [];
  for (let i = 0; i < 12; i++) segs.push({ key: `a${i}`, orderId: 1, lineId: 11, level: '1', pieceId: 100 + i, code: `A-${i}`, name: `A-${i}`, depth: 1, parentKey: null, groupKey: 'gA', isMark: true, marks: 1, tonnes: 10, work: { cut: 500 }, noRate: 0, done: false, progress: 0, materials: [], committedDate: null });
  const c = [0, 1].map((i) => ({ key: `c${i}`, orderId: 3, lineId: 31, level: '1', pieceId: 200 + i, code: `C-${i}`, name: `C-${i}`, depth: 1, parentKey: null, groupKey: 'gC', isMark: true, marks: 1, tonnes: 5, work: { cut: 500 }, noRate: 0, done: false, progress: 0, materials: [{ itemId: 'Q', qty: 1 }], committedDate: null }));
  const octIdx = periods.map((p, i) => [p, i]).filter(([p]) => p.month === '2026-10').map(([, i]) => i);
  const lastOct = periods[octIdx[octIdx.length - 1]];
  const s = fixture({
    orders: [
      { id: 1, code: 'SO-A', customer: 'K', committedDate: '2026-12-31', priority: 1, lines: [{ id: 11, lineNo: 1, name: 'A', quantity: 1, locked: true, released: false, level: '1', levels: [{ value: '1', label: 'Segment' }] }] },
      { id: 3, code: 'SO-C', customer: 'K', committedDate: '2026-12-31', priority: 2, lines: [{ id: 31, lineNo: 1, name: 'C', quantity: 1, locked: true, released: false, level: '1', levels: [{ value: '1', label: 'Segment' }] }] },
    ],
    units: [...segs, ...c],
    functions: [{ key: 'cut', name: 'Cut', capacity: cap(1000) }],
    supply: { Q: { name: 'Q', code: 'Q', uom: 'nos', lots: [{ date: lastOct.start, qty: 2, source: 'PO-9', received: false }] } },
  });
  const a = E.autoPlan(s, {}, { minLinesPerMonth: 1 });
  const ev = E.evaluate(s, a.plan);
  assert.equal(ev.score.overloadedCells, 0);
  assert.equal(ev.lines.gC.month, '2026-10', a.notes.join(' | '));
  assert.ok(ev.months['2026-10'].linesShipped >= 1);
  const aInOct = segs.filter((u) => ev.units[u.key].period && periods[idxOf(ev.units[u.key].period)].month === '2026-10').length;
  assert.equal(aInOct, 8, 'A fills the other 8 half-weeks of October');
  assert.equal(ev.lines.gA.month, '2026-11');
});

check('autoPlan: determinism across calls and fresh snapshot copies', () => {
  const s1 = fixture({ supply: richSupply });
  const s2 = JSON.parse(JSON.stringify(s1));
  const lv = { levels: { 11: '3' } };
  assert.deepEqual(E.autoPlan(s1, {}, lv), E.autoPlan(s2, {}, lv));
});

// ── feedback ────────────────────────────────────────────────────────────────────────────────────
check('feedback: tonnes deltas, lines moving month, functions crossing 100%, late / blocked', () => {
  const s = fixture({ supply: richSupply });
  const nov = periods.findIndex((p) => p.month === '2026-11');
  const lateIdx = periods.findIndex((p) => p.end > '2026-11-15');
  const before = E.evaluate(s, { p2: { period: pk(1), pinned: false }, p3: { period: pk(2), pinned: false } });
  const after = E.evaluate(s, { p2: { period: pk(1), pinned: false }, p3: { period: pk(lateIdx), pinned: false } });
  const lines = E.feedback(before, after);
  assert.ok(lines.includes('-20 t in Oct'), lines.join(' | '));
  assert.ok(lines.includes('+20 t in Nov'), lines.join(' | '));
  assert.ok(lines.includes('Girder line G2 now ships in Nov'), lines.join(' | '));
  assert.ok(lines.includes('G2 now ships after the committed date'), lines.join(' | '));
  const over = E.evaluate(s, { p2: { period: pk(nov + 1), pinned: false }, p3: { period: pk(nov + 1), pinned: false } });
  const fb2 = E.feedback(before, over);
  assert.ok(fb2.some((l) => new RegExp(`^CNC plasma cutting 120% in ${periods[nov + 1].label}$`).test(l)), fb2.join(' | '));
  assert.ok(E.feedback(over, before).some((l) => /^SAW welding back under 100% in /.test(l)));
  const blocked = E.evaluate(fixture(), { p2: { period: pk(1), pinned: false }, p3: { period: pk(1), pinned: false } });
  const okEv = E.evaluate(fixture(), { p2: { period: pk(1), pinned: false } });
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
  assert.deepEqual(diff, [{ unitKey: 'p3', shipDate: periods[4].start, pinned: false }, { unitKey: 'p2', shipDate: null, pinned: false }]);
});

// ── Performance: 2,000 units × 15 periods × 40 functions ────────────────────────────────────────
function synthetic(seed = 7) {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const fns = Array.from({ length: 40 }, (_, i) => ({ key: `f${i}`, name: `Function ${i}`, machines: 2, capacity: cap(2400 + Math.floor(rnd() * 4000)), noShifts: false }));
  fns.push({ key: 'contractor', name: 'Contractors', unlimited: true });
  const items = Array.from({ length: 12 }, (_, i) => `I${i}`);
  const supply = {};
  for (const it of items) supply[it] = { name: it, code: it, uom: 't', lots: [{ date: '2026-10-01', qty: 40, source: 'stock', received: true }, { date: '2026-10-21', qty: 60, source: `PO-${it}a`, received: false }, { date: '2026-11-18', qty: 80, source: `PO-${it}b`, received: false }] };
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
          const segU = { key: `p${pid}`, orderId: o + 1, lineId, level: '3', pieceId: pid++, code: `${gl.code}-${k}`, name: 'segment', depth: 3, parentKey: gl.key, groupKey: gl.key, isMark: true, marks: 1, tonnes: 2 + rnd() * 3, work, noRate: 0, done: false, progress: 0, materials: [{ itemId: items[Math.floor(rnd() * items.length)], qty: 0.5 + rnd() }], committedDate: null };
          units.push(segU);
          addUp(gl, segU);
        }
        addUp(span, gl);
      }
      addUp(line, span);
    }
  }
  return fixture({ functions: fns, orders, units, supply, targets: { '2026-10': 300, '2026-11': 300, '2026-12': 300 } });
}

const timings = {};
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
  assert.ok(ap2.notes.some((n) => n.startsWith('Split ')), 'mixed levels split some spans: ' + ap2.notes.join(' | '));
  console.log('   notes (mixed):', ap2.notes.join(' | '));
});

check('performance: tight capacity + scarce material + min 3 lines a month stays < 300 ms and never overloads', () => {
  const base = synthetic(11);
  const tight = { ...base, functions: base.functions.map((f) => (f.unlimited ? f : { ...f, capacity: Object.fromEntries(Object.entries(f.capacity).map(([k, v]) => [k, Math.round(v / 6)])) })),
    supply: Object.fromEntries(Object.entries(base.supply).map(([k, v]) => [k, { ...v, lots: v.lots.map((l) => ({ ...l, qty: l.qty / 3 })) }])) };
  const allSeg = { levels: Object.fromEntries(tight.orders.map((o) => [o.lines[0].id, '3'])), minLinesPerMonth: 3 };
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
