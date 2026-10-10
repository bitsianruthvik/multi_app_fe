// Run from multi_app_fe: node scripts/cf_erp_flow_edit_test.mjs
// The flow page's steps as data (src/apps/cf_erp/lib/flowEdit.ts): the draft of LANES — split, add in a lane, split
// again, merge two of three, merge into a chosen lane, an open lane refused, removing a lane's only step, moving
// within and across lanes — what each step ends up starting AFTER, the rows and lane numbers as drawn, a flow from
// before lanes read as lanes, what Save sends, how the changes are counted, and Cancel = the saved flow untouched.
// Pure logic, no DOM. The last check prints the user's scenario of 2026-10-10 as a rows × lanes picture.
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function load(entry) {
  const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
}
const fe = await load('src/apps/cf_erp/lib/flowEdit.ts');

let passed = 0;
let failed = 0;
function check(label, fn) {
  try { fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.message}`); }
}

let opSeq = 0;
const ops = new Map();
const op = (code) => { if (!ops.has(code)) ops.set(code, { id: ++opSeq, code, name: `${code} name`, status: 'active' }); return ops.get(code); };
const wait = (id, relation) => ({ id, relation, targetDefinition: null, targetOperation: null, requiredStatus: 'done', notes: null, text: `Waits (${relation}).` });
const step = (id, sequence, code, extra = {}) => ({ id, sequence, operation: op(code), stepName: null, notes: null, waits: [], ...extra });
const newWait = { relation: 'siblings', targetDefinitionId: null, targetOperationId: 3, requiredStatus: 'started', notes: 'why', text: 'Waits until its siblings have started WLD name (WLD).' };

/** The draft by operation code: who starts after whom, lane numbers and rows. */
const codeOf = (d, k) => d.steps[k].operation.code;
const keyOf = (d, code) => Object.values(d.steps).find((s) => s.operation.code === code).key;
const afterMap = (d) => Object.fromEntries([...fe.graphOf(d)].map(([k, a]) => [codeOf(d, k), a.map((x) => codeOf(d, x)).sort()]).sort((x, y) => (x[0] < y[0] ? -1 : 1)));
const lanesOf = (d) => { const L = fe.layoutOf(d); return L.lanes.map((b) => `${b.col + 1}:${b.lane.steps.map((k) => codeOf(d, k)).join('>')}`).join(' | '); };
const rowsOf = (d) => { const L = fe.layoutOf(d); return Object.fromEntries(Object.keys(d.steps).map((k) => [codeOf(d, k), L.row.get(k) * 10])); };
const laneKey = (d, n) => fe.layoutOf(d).lanes.find((b) => b.col === n - 1).lane.key;   // by lane NUMBER as drawn (only one lane per number in these tests)
const laneOfCode = (d, code) => d.lanes.find((l) => l.steps.includes(keyOf(d, code)));
const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

// A flow from BEFORE lanes: numbers only. CUT 10 | DRL 20 + WLD 20 (side by side) | PNT 35.
const LEGACY = [
  step(11, 10, 'CUT'),
  step(12, 20, 'DRL', { stepName: 'Holes', waits: [wait(91, 'parent'), wait(92, 'children')] }),
  step(13, 20, 'WLD'),
  step(14, 35, 'PNT', { notes: 'Two coats' }),
];
const frozen = JSON.stringify(LEGACY);

check('a flow from before lanes reads as lanes: a shared number is a split, the next number where they meet', () => {
  const d = fe.draftOf(LEGACY);
  assert.equal(lanesOf(d), '1:CUT>DRL>PNT | 2:WLD');
  assert.deepEqual(afterMap(d), { CUT: [], DRL: ['CUT'], PNT: ['DRL', 'WLD'], WLD: ['CUT'] });
  assert.deepEqual(rowsOf(d), { CUT: 10, DRL: 20, WLD: 20, PNT: 30 });
  assert.equal(laneOfCode(d, 'WLD').from, keyOf(d, 'CUT'));
  assert.equal(laneOfCode(d, 'WLD').into, keyOf(d, 'PNT'));
  assert.deepEqual(fe.problemsOf(d), []);
  assert.equal(d.steps.s12.waits.length, 2);
});

check('…and untouched it has nothing to save, even with untidy numbers', () => {
  const c = fe.changesOf(LEGACY, fe.draftOf(LEGACY));
  assert.equal(c.count, 0);
  assert.equal(c.words, '');
  assert.equal(c.orderChanged, false);
});

check('a legacy criss-cross (two rows of two) keeps every wait: what lanes cannot draw is kept as "also after"', () => {
  const X = [step(1, 10, 'A'), step(2, 10, 'B'), step(3, 20, 'C'), step(4, 20, 'D'), step(5, 30, 'E')];
  const d = fe.draftOf(X);
  assert.deepEqual(afterMap(d), { A: [], B: [], C: ['A', 'B'], D: ['A', 'B'], E: ['C', 'D'] });
  assert.equal(fe.changesOf(X, d).count, 0);
  assert.deepEqual(fe.problemsOf(d), []);
});

check('a saved flow with lanes reads back exactly: lanes, rows, after', () => {
  const S = [
    { ...step(1, 10, 'A'), lane: 0, after: [] }, { ...step(2, 20, 'B1'), lane: 0, after: [1] }, { ...step(3, 20, 'C1'), lane: 1, after: [1] },
    { ...step(4, 30, 'B2'), lane: 0, after: [2] }, { ...step(5, 40, 'D'), lane: 0, after: [4, 3] },
  ];
  const d = fe.draftOf(S);
  assert.equal(lanesOf(d), '1:A>B1>B2>D | 2:C1');
  assert.deepEqual(afterMap(d), { A: [], B1: ['A'], B2: ['B1'], C1: ['A'], D: ['B2', 'C1'] });
  assert.deepEqual(fe.payloadOf(d).steps.map((s) => [s.id, s.lane, s.after]), [[1, 0, []], [2, 0, ['s1']], [3, 1, ['s1']], [4, 0, ['s2']], [5, 0, ['s4', 's3']]]);
  assert.equal(fe.changesOf(S, d).count, 0);
});

// A plain saved chain to edit: S1 … S4.
const CHAIN = ['S1', 'S2', 'S3', 'S4'].map((code, i) => ({ ...step(20 + i, (i + 1) * 10, code), lane: 0, after: i ? [19 + i] : [] }));
const chain = () => fe.draftOf(CHAIN);
const T = 'trunk';

check('add at a gap of the single lane: the new step takes that place and the rows below move on', () => {
  const d = fe.addStep(chain(), { lane: T, index: 1 }, op('QC'));
  assert.equal(lanesOf(d), '1:S1>QC>S2>S3>S4');
  assert.deepEqual(rowsOf(d), { S1: 10, QC: 20, S2: 30, S3: 40, S4: 50 });
  const c = fe.changesOf(CHAIN, d);
  assert.equal(c.count, 1);
  assert.equal(c.words, '1 step added');
  assert.equal(c.orderChanged, false, 'the saved steps kept their order');
  assert.equal(c.steps.get(keyOf(d, 'QC')).kind, 'new');
  assert.equal(lanesOf(fe.addStep(chain(), { lane: T, index: 0 }, op('QC'))), '1:QC>S1>S2>S3>S4');
  assert.equal(lanesOf(fe.addStep(chain(), { lane: T, index: 99 }, op('QC'))), '1:S1>S2>S3>S4>QC');
  assert.equal(lanesOf(fe.addStep(fe.draftOf([]), { lane: T, index: 0 }, op('QC'))), '1:QC');
});

check('split: a second lane opens beside the point, its first step after the step above the gap', () => {
  const d = fe.splitAt(chain(), { lane: T, index: 2 }, op('X1'));   // under S2
  assert.equal(lanesOf(d), '1:S1>S2>S3>S4 | 2:X1');
  assert.deepEqual(afterMap(d).X1, ['S2']);
  assert.deepEqual(rowsOf(d), { S1: 10, S2: 20, S3: 30, X1: 30, S4: 40 });
  assert.deepEqual(fe.problemsOf(d), ['Lane 2 (ends at X1) is still open — merge it back before saving.']);
});

check('split at the very top: the new lane starts with the flow, after nothing', () => {
  const d = fe.splitAt(chain(), { lane: T, index: 0 }, op('X1'));
  assert.deepEqual(afterMap(d).X1, []);
  assert.deepEqual(rowsOf(d).X1, 10);
});

check('add in a lane, and add under a split: beside the lanes, or before the split', () => {
  let d = fe.splitAt(chain(), { lane: T, index: 2 }, op('X1'));
  d = fe.addStep(d, { lane: laneKey(d, 2), index: 1 }, op('X2'));
  assert.equal(lanesOf(d), '1:S1>S2>S3>S4 | 2:X1>X2');
  assert.deepEqual(afterMap(d).X2, ['X1']);
  assert.equal(fe.splitsAbove(d, { lane: T, index: 2 }), true);
  assert.equal(fe.splitsAbove(d, { lane: T, index: 3 }), false);
  const beside = fe.addStep(d, { lane: T, index: 2 }, op('QC'));
  assert.deepEqual([afterMap(beside).QC, afterMap(beside).X1], [['S2'], ['S2']], 'beside: both start after S2');
  const before = fe.addStep(d, { lane: T, index: 2 }, op('QC'), { beforeSplit: true });
  assert.deepEqual([afterMap(before).QC, afterMap(before).X1, afterMap(before).S3], [['S2'], ['QC'], ['QC']], 'before the split: the lane now splits after the new step');
});

check('merge two lanes: the meeting step waits for the step above it and the last step of the lane that closes', () => {
  let d = fe.splitAt(chain(), { lane: T, index: 2 }, op('X1'));
  const choices = fe.mergeChoices(d, { lane: T, index: 3 });
  assert.equal(choices.available, true);
  assert.deepEqual(choices.lanes.map((l) => [l.number, l.ends, l.closable]), [[1, 'S4', false], [2, 'X1', true]]);
  assert.equal(fe.mergeChoices(chain(), { lane: T, index: 3 }).available, false, 'one lane: nothing to merge');
  const m = fe.mergeLanes(d, { closing: [laneKey(d, 2)], target: T, at: keyOf(d, 'S4') });
  assert.equal(m.error, null);
  d = m.draft;
  assert.deepEqual(afterMap(d), { S1: [], S2: ['S1'], S3: ['S2'], S4: ['S3', 'X1'], X1: ['S2'] });
  assert.deepEqual(fe.problemsOf(d), []);
  assert.equal(fe.mergeChoices(d, { lane: T, index: 4 }).available, false, 'after a merge: Add and Split again');
  const L = fe.layoutOf(d);
  assert.deepEqual([L.span.get(keyOf(d, 'S1')), L.span.get(keyOf(d, 'S3')), L.span.get(keyOf(d, 'S4'))], [[0, 1], [0, 0], [0, 1]], 'alone in its row = full width; the meeting step covers the lanes it joins');
});

check('merge at a NEW step when the lanes meet below the last one', () => {
  let d = fe.splitAt(chain(), { lane: T, index: 4 }, op('X1'));   // under S4, the last step
  const m = fe.mergeLanes(d, { closing: [laneKey(d, 2)], target: T, at: { operation: op('END') } });
  d = m.draft;
  assert.deepEqual(afterMap(d).END, ['S4', 'X1']);
  assert.deepEqual(fe.problemsOf(d), []);
});

check('a merge that would make a circle is refused in words; so is closing the trunk, a closed lane, nothing', () => {
  const d = fe.splitAt(chain(), { lane: T, index: 3 }, op('X1'));   // lane 2 splits after S3
  const bad = fe.mergeLanes(d, { closing: [laneKey(d, 2)], target: T, at: keyOf(d, 'S2') });
  assert.match(bad.error, /cannot meet there/);
  assert.equal(bad.draft, d);
  assert.deepEqual(fe.meetingSteps(d, [laneKey(d, 2)], T).steps.map((k) => codeOf(d, k)), ['S4'], 'only S4 is below where it split');
  assert.match(fe.mergeLanes(d, { closing: [T], target: laneKey(d, 2), at: keyOf(d, 'X1') }).error, /Lane 1 is the trunk/);
  assert.match(fe.mergeLanes(d, { closing: [], target: T, at: keyOf(d, 'S4') }).error, /Choose the lanes/);
  const done = fe.mergeLanes(d, { closing: [laneKey(d, 2)], target: T, at: keyOf(d, 'S4') }).draft;
  assert.match(fe.mergeLanes(done, { closing: [done.lanes[1].key], target: T, at: keyOf(done, 'S4') }).error, /already closed/);
});

check('split again → three lanes; merge two of three, the third stays open beside them; then merge all', () => {
  let d = fe.splitAt(chain(), { lane: T, index: 1 }, op('X1'));        // lane 2 after S1
  d = fe.splitAt(d, { lane: laneKey(d, 2), index: 1 }, op('Y1'));       // lane 2 split again → lane 3 after X1
  assert.equal(lanesOf(d), '1:S1>S2>S3>S4 | 2:X1 | 3:Y1');
  assert.deepEqual(afterMap(d).Y1, ['X1']);
  assert.deepEqual(fe.mergeChoices(d, { lane: T, index: 3 }).lanes.map((l) => [l.number, l.closable]), [[1, false], [2, true], [3, true]], 'three lanes: the picker lists them');
  let m = fe.mergeLanes(d, { closing: [laneKey(d, 2)], target: T, at: keyOf(d, 'S3') });
  assert.equal(m.error, null);
  d = m.draft;
  assert.deepEqual(afterMap(d).S3, ['S2', 'X1']);
  assert.deepEqual(fe.problemsOf(d), ['Lane 3 (ends at Y1) is still open — merge it back before saving.'], 'the third lane is still open');
  m = fe.mergeLanes(d, { closing: [laneKey(d, 3)], target: T, at: keyOf(d, 'S4') });
  d = m.draft;
  assert.deepEqual(afterMap(d).S4, ['S3', 'Y1']);
  assert.deepEqual(fe.problemsOf(d), []);
  // All at once.
  let all = fe.splitAt(chain(), { lane: T, index: 1 }, op('X1'));
  all = fe.splitAt(all, { lane: T, index: 1 }, op('Y1'));
  all = fe.mergeLanes(all, { closing: [laneKey(all, 2), laneKey(all, 3)], target: T, at: keyOf(all, 'S4') }).draft;
  assert.deepEqual(afterMap(all).S4, ['S3', 'X1', 'Y1']);
  assert.deepEqual(fe.problemsOf(all), []);
});

check('lanes to the bottom: every open lane is a problem, named by its number and where it ends', () => {
  let d = fe.splitAt(chain(), { lane: T, index: 1 }, op('X1'));
  d = fe.splitAt(d, { lane: T, index: 2 }, op('Y1'));
  assert.deepEqual(fe.problemsOf(d), ['Lane 2 (ends at X1) is still open — merge it back before saving.', 'Lane 3 (ends at Y1) is still open — merge it back before saving.']);
});

check('removing the only step of a lane removes the lane; removing a meeting step reopens the lanes or hands them on', () => {
  let d = fe.splitAt(chain(), { lane: T, index: 2 }, op('X1'));
  d = fe.mergeLanes(d, { closing: [laneKey(d, 2)], target: T, at: keyOf(d, 'S3') }).draft;
  const gone = fe.removeStep(d, keyOf(d, 'X1'));
  assert.equal(lanesOf(gone), '1:S1>S2>S3>S4');
  assert.deepEqual(afterMap(gone).S3, ['S2']);
  assert.equal(fe.changesOf(CHAIN, gone).count, 0, 'a step added and removed again is no change');
  const handed = fe.removeStep(d, keyOf(d, 'S3'));               // the meeting step goes: they meet at the next one
  assert.deepEqual(afterMap(handed).S4, ['S2', 'X1']);
  const reopened = fe.removeStep(fe.removeStep(d, keyOf(d, 'S4')), keyOf(d, 'S3'));   // no step below: open again
  assert.deepEqual(fe.problemsOf(reopened), ['Lane 2 (ends at X1) is still open — merge it back before saving.']);
  const split = fe.removeStep(d, keyOf(d, 'S2'));                 // the step it split after goes: it splits after the one above
  assert.deepEqual(afterMap(split).X1, ['S1']);
});

check('remove a saved step: counted, listed as removed, and the order of the rest is unchanged', () => {
  const d = fe.removeStep(chain(), 's21');
  const c = fe.changesOf(CHAIN, d);
  assert.equal(c.removed, 1);
  assert.equal(c.count, 1);
  assert.deepEqual(c.removedSteps.map((s) => s.operation.code), ['S2']);
  assert.equal(c.orderChanged, false);
  assert.deepEqual(rowsOf(d), { S1: 10, S3: 20, S4: 30 });
});

check('move within a lane, and back: an undone reorder is no change', () => {
  let m = fe.moveStep(chain(), 's22', { lane: T, index: 1 });       // S3 above S2
  assert.equal(lanesOf(m.draft), '1:S1>S3>S2>S4');
  let c = fe.changesOf(CHAIN, m.draft);
  assert.equal(c.orderChanged, true);
  assert.equal(c.count, 1);
  assert.deepEqual([...c.moved].sort(), ['s21', 's22']);
  m = fe.moveStepBy(m.draft, 's22', 'down');
  assert.equal(lanesOf(m.draft), '1:S1>S2>S3>S4');
  assert.equal(fe.changesOf(CHAIN, m.draft).count, 0);
  const far = fe.moveStep(chain(), 's20', { lane: T, index: 4 }).draft;   // S1 to the end
  assert.deepEqual([...fe.changesOf(CHAIN, far).moved], ['s20'], 'the one step that moved is the one marked');
  assert.equal(fe.moveStepBy(chain(), 's20', 'up').draft.lanes[0].steps[0], 's20', 'the ends do not wrap');
});

check('move across lanes: the step joins the other lane at that height; its old lane closes up', () => {
  let d = fe.splitAt(chain(), { lane: T, index: 1 }, op('X1'));
  d = fe.mergeLanes(d, { closing: [laneKey(d, 2)], target: T, at: keyOf(d, 'S4') }).draft;   // S1 | S2>S3 ‖ X1 | S4
  const side = fe.sideLane(d, 's21', 'right');
  assert.deepEqual(side, { lane: laneKey(d, 2), index: 0 });
  let m = fe.moveStepBy(d, 's21', 'right');                              // S2 into lane 2, above X1
  assert.equal(m.error, null);
  assert.equal(lanesOf(m.draft), '1:S1>S3>S4 | 2:S2>X1');
  assert.deepEqual(afterMap(m.draft), { S1: [], S2: ['S1'], S3: ['S1'], S4: ['S3', 'X1'], X1: ['S2'] });
  assert.equal(fe.changesOf(CHAIN, m.draft).orderChanged, true);
  m = fe.moveStep(m.draft, 's21', { lane: T, index: 1 });                // and back
  assert.equal(lanesOf(m.draft), '1:S1>S2>S3>S4 | 2:X1');
  assert.equal(fe.sideLane(d, 's20', 'left'), null);
  // The only step of a lane dragged into the trunk: the lane goes.
  const only = fe.moveStep(d, keyOf(d, 'X1'), { lane: T, index: 2 }).draft;
  assert.equal(lanesOf(only), '1:S1>S2>X1>S3>S4');
});

check('a meeting step stays the meeting point while it moves in its lane; it is refused where that makes no sense', () => {
  let d = fe.splitAt(chain(), { lane: T, index: 2 }, op('X1'));          // lane 2 after S2
  d = fe.mergeLanes(d, { closing: [laneKey(d, 2)], target: T, at: keyOf(d, 'S3') }).draft;   // meets at S3
  const down = fe.moveStep(d, 's22', { lane: T, index: 4 });             // S3 below S4: still where they meet
  assert.equal(down.error, null);
  assert.deepEqual([afterMap(down.draft).S3, afterMap(down.draft).S4], [['S4', 'X1'], ['S2']]);
  const up = fe.moveStep(d, 's22', { lane: T, index: 1 });               // above S2, which lane 2 splits after
  assert.match(up.error, /S3 cannot move there/);
  assert.equal(up.draft, d);
  const across = fe.moveStep(d, 's22', { lane: laneKey(d, 2), index: 0 });
  assert.match(across.error, /S3 is where lanes meet/);
});

check('replace the operation, rename, waits — as before', () => {
  let d = fe.setOperation(chain(), 's20', op('QC'));
  let c = fe.changesOf(CHAIN, d);
  assert.deepEqual(c.steps.get('s20'), { kind: 'changed', what: ['Operation was S1'] });
  d = fe.editStep(d, 's20', { stepName: 'Check' });
  assert.equal(fe.changesOf(CHAIN, d).words, '1 operation replaced · 1 step edited');
  d = fe.editStep(fe.setOperation(d, 's20', op('S1')), 's20', { stepName: '  ' });
  assert.equal(fe.changesOf(CHAIN, d).count, 0, 'spaces are not a name');
  let w = fe.draftOf(LEGACY);
  assert.equal(fe.waitClash(fe.findStep(w, 's12'), { ...newWait, relation: 'parent', targetOperationId: null }), true);
  w = fe.addWait(w, 's12', newWait);
  assert.equal(fe.findStep(w, 's12').waits[2].text, newWait.text);
  w = fe.removeWait(w, 's12', 'w91');
  c = fe.changesOf(LEGACY, w);
  assert.deepEqual([c.waitsAdded, c.waitsRemoved, c.count], [1, 1, 2]);
});

check('the payload: every step top to bottom with its key, lane and what it starts after', () => {
  let d = fe.splitAt(chain(), { lane: T, index: 2 }, op('X1'));
  d = fe.mergeLanes(d, { closing: [laneKey(d, 2)], target: T, at: keyOf(d, 'S4') }).draft;
  d = fe.editStep(d, keyOf(d, 'X1'), { stepName: ' Side ' });
  const x = keyOf(d, 'X1');
  assert.deepEqual(fe.payloadOf(d), { steps: [
    { id: 20, key: 's20', operationId: op('S1').id, stepName: null, notes: null, lane: 0, after: [], waits: [] },
    { id: 21, key: 's21', operationId: op('S2').id, stepName: null, notes: null, lane: 0, after: ['s20'], waits: [] },
    { id: 22, key: 's22', operationId: op('S3').id, stepName: null, notes: null, lane: 0, after: ['s21'], waits: [] },
    { key: x, operationId: op('X1').id, stepName: 'Side', notes: null, lane: 1, after: ['s21'], waits: [] },
    { id: 23, key: 's23', operationId: op('S4').id, stepName: null, notes: null, lane: 0, after: ['s22', x], waits: [] },
  ] });
});

check('cancel = the original: no function changes the saved steps or the draft it was given', () => {
  const d0 = chain();
  const snap = JSON.stringify(d0);
  let d = fe.addStep(d0, { lane: T, index: 0 }, op('QC'));
  d = fe.splitAt(d, { lane: T, index: 2 }, op('X1'));
  d = fe.addStep(d, { lane: laneKey(d, 2), index: 1 }, op('X2'), { beforeSplit: true });
  d = fe.mergeLanes(d, { closing: [laneKey(d, 2)], target: T, at: { operation: op('END') } }).draft;
  d = fe.moveStep(d, 's21', { lane: T, index: 4 }).draft;
  d = fe.removeStep(d, 's22');
  d = fe.setOperation(d, 's20', op('QC'));
  d = fe.editStep(d, 's23', { stepName: 'x', notes: 'y' });
  d = fe.addWait(d, 's23', newWait);
  assert.ok(fe.changesOf(CHAIN, d).count > 0);
  assert.equal(JSON.stringify(d0), snap, 'the draft it started from is untouched');
  assert.equal(JSON.stringify(LEGACY), frozen, 'the saved steps are untouched');
  assert.equal(fe.changesOf(CHAIN, fe.draftOf(CHAIN)).count, 0, 'a fresh draft of the saved flow is the original');
});

check('a step\'s times, in the shapes the time helpers and the time dialog read', () => {
  const none = { minutes: null, expression: null, display: null, formula: null };
  assert.equal(fe.timeViewOf(none), null);
  assert.deepEqual(fe.timeViewOf({ minutes: 5, expression: '5', display: '5', formula: null }), { minutes: 5, formula: null, expression: '5', display: '5' });
  const subject = { type: 'classification', id: 7, code: 'CNC', name: 'CNC cutting', level: 'Variant' };
  const time = { setup: none, work: { minutes: 3, expression: '3', display: '3', formula: null }, ruleId: 44, subject, eligible: true, rules: 2 };
  assert.equal(fe.ruleOfTime(1, time).id, 44);
  assert.equal(fe.ruleOfTime(1, { setup: none, work: none, ruleId: null, subject: null, eligible: null, rules: 0 }), null);
  assert.deepEqual(fe.timeOfRule(null), { setup: none, work: none, ruleId: null, subject: null, eligible: null, rules: 0 });
});

// ── The user's scenario, 2026-10-10 ──────────────────────────────────────────────────────────────────
check('THE SCENARIO: ten steps, lanes from S3 and S4, lane 2 onto S7, a parallel of lane 2, the old lane 3 into it — then closed and saved', () => {
  // 1. Ten steps in one lane.
  const TEN = Array.from({ length: 10 }, (_, i) => ({ ...step(101 + i, (i + 1) * 10, `S${i + 1}`), lane: 0, after: i ? [100 + i] : [] }));
  let d = fe.draftOf(TEN);
  const idx = (code) => d.lanes[0].steps.indexOf(keyOf(d, code));
  // 2. A second lane from step 3.
  d = fe.splitAt(d, { lane: T, index: idx('S3') + 1 }, op('L2A'));
  // 3. A third lane from step 4 — it is lane 3, right of the lane the trunk already opened.
  d = fe.splitAt(d, { lane: T, index: idx('S4') + 1 }, op('L3A'));
  assert.equal(lanesOf(d).split(' | ').slice(1).join(' | '), '2:L2A | 3:L3A');
  const lane2 = laneOfCode(d, 'L2A').key, old3 = laneOfCode(d, 'L3A').key;
  // 4. Close the second lane onto step 7.
  let m = fe.mergeLanes(d, { closing: [lane2], target: T, at: keyOf(d, 'S7') });
  assert.equal(m.error, null);
  d = m.draft;
  // 5. A step after step 5 in lane 1.
  d = fe.addStep(d, { lane: T, index: idx('S5') + 1 }, op('S5B'));
  // 6. A step in lane 2.
  d = fe.addStep(d, { lane: lane2, index: 1 }, op('L2B'));
  // 7. A parallel lane for lane 2: it opens right of lane 2, so it IS lane 3 and the old lane 3 is lane 4.
  d = fe.splitAt(d, { lane: lane2, index: 1 }, op('N3A'));
  const new3 = laneOfCode(d, 'N3A').key;
  let numbers = fe.laneNumbers(d);
  assert.deepEqual([numbers.get(T), numbers.get(lane2), numbers.get(new3), numbers.get(old3)], [1, 2, 3, 4], 'the new lane is lane 3; the original lane 3 moved to lane 4');
  // 8. Close the ORIGINAL lane 3 (now lane 4) into the new parallel of lane 2 (now lane 3) — a new meeting step in lane 3.
  const choices = fe.mergeChoices(d, { lane: old3, index: 1 });
  assert.deepEqual(choices.lanes.map((l) => [l.number, l.ends, l.closable]), [[1, 'S10', false], [2, 'L2B', false], [3, 'N3A', true], [4, 'L3A', true]], 'the picker lists every lane beside this point; the ones that can end here are lanes 3 and 4');
  m = fe.mergeLanes(d, { closing: [old3], target: new3, at: { operation: op('N3B') } });
  assert.equal(m.error, null);
  d = m.draft;
  // 9. The picture at this point: exactly what is wanted.
  assert.deepEqual(afterMap(d), sorted({
    S1: [], S2: ['S1'], S3: ['S2'], S4: ['S3'], S5: ['S4'], S5B: ['S5'], S6: ['S5B'], S7: ['L2B', 'S6'], S8: ['S7'], S9: ['S8'], S10: ['S9'],
    L2A: ['S3'], L2B: ['L2A'],
    N3A: ['L2A'], N3B: ['L3A', 'N3A'],
    L3A: ['S4'],
  }));
  assert.equal(lanesOf(d), '1:S1>S2>S3>S4>S5>S5B>S6>S7>S8>S9>S10 | 2:L2A>L2B | 3:N3A>N3B | 4:L3A');
  // 10. Lane 3 was never closed: it cannot be saved, and the problem names it.
  assert.deepEqual(fe.problemsOf(d), ['Lane 3 (ends at N3B) is still open — merge it back before saving.']);
  // Closed the natural way: into lane 2, the lane it split from, at a new step before lane 2 meets the trunk at S7.
  m = fe.mergeLanes(d, { closing: [new3], target: lane2, at: { operation: op('L2C') } });
  assert.equal(m.error, null);
  d = m.draft;
  assert.deepEqual(fe.problemsOf(d), []);
  const WANT = sorted({
    S1: [], S2: ['S1'], S3: ['S2'], S4: ['S3'], S5: ['S4'], S5B: ['S5'], S6: ['S5B'], S7: ['L2C', 'S6'], S8: ['S7'], S9: ['S8'], S10: ['S9'],
    L2A: ['S3'], L2B: ['L2A'], L2C: ['L2B', 'N3B'],
    N3A: ['L2A'], N3B: ['L3A', 'N3A'],
    L3A: ['S4'],
  });
  assert.deepEqual(afterMap(d), WANT);
  assert.deepEqual(sorted(rowsOf(d)), sorted({
    S1: 10, S2: 20, S3: 30, S4: 40, L2A: 40, S5: 50, L2B: 50, N3A: 50, L3A: 50, S5B: 60, N3B: 60, S6: 70, L2C: 70, S7: 80, S8: 90, S9: 100, S10: 110,
  }));
  numbers = fe.laneNumbers(d);
  assert.deepEqual([numbers.get(T), numbers.get(lane2), numbers.get(new3), numbers.get(old3)], [1, 2, 3, 4]);
  // What Save sends, by operation code: lane (0-based) and after.
  const p = fe.payloadOf(d);
  const byKey = new Map(p.steps.map((s) => [s.key, codeOf(d, s.key)]));
  assert.deepEqual(sorted(Object.fromEntries(p.steps.map((s) => [byKey.get(s.key), [s.lane, s.after.map((k) => byKey.get(k)).sort()]]))), sorted({
    S1: [0, []], S2: [0, ['S1']], S3: [0, ['S2']], S4: [0, ['S3']], S5: [0, ['S4']], S5B: [0, ['S5']], S6: [0, ['S5B']], S7: [0, ['L2C', 'S6']],
    S8: [0, ['S7']], S9: [0, ['S8']], S10: [0, ['S9']], L2A: [1, ['S3']], L2B: [1, ['L2A']], L2C: [1, ['L2B', 'N3B']], N3A: [2, ['L2A']], N3B: [2, ['L3A', 'N3A']], L3A: [3, ['S4']],
  }));
  assert.equal(p.steps.filter((s) => s.id != null).length, 10, 'the ten saved steps keep their ids');
  const c = fe.changesOf(TEN, d);
  assert.deepEqual([c.added, c.removed, c.orderChanged, c.count], [7, 0, false, 7], 'seven steps added; the ten saved ones are in the order they were');
  // Saved and read back (ids given, as the server would): the same picture, nothing to save.
  const idOf = new Map(p.steps.map((s, i) => [s.key, s.id ?? 900 + i]));
  const back = p.steps.map((s) => ({ ...step(idOf.get(s.key), fe.layoutOf(d).row.get(s.key) * 10, byKey.get(s.key)), lane: s.lane, after: s.after.map((k) => idOf.get(k)) }));
  const again = fe.draftOf(back);
  assert.deepEqual(afterMap(again), WANT);
  assert.equal(lanesOf(again), lanesOf(d));
  assert.equal(fe.changesOf(back, again).count, 0);
  console.log(`\n${fe.diagramOf(d)}\n`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
