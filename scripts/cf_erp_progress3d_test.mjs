// The 3D progress view's rules (src/apps/cf_erp/lib/progress3d.ts): each piece the colour of its row's flow step; a row
// gone into its parent takes the parent's look (a sub-assembly is one colour); uncut parts are ghosts; a step being
// worked pulses; outside the production order it is faint.
//   node scripts/cf_erp_progress3d_test.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const built = await build({ entryPoints: ['./src/apps/cf_erp/lib/progress3d.ts'], bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external' });
await mkdir(resolve('node_modules/.cache'), { recursive: true });
const artifact = resolve('node_modules/.cache', `progress3d-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);

let passed = 0; let failed = 0;
const check = (name, fn) => { try { fn(); passed++; console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, e.message); } };
const U = (state, extra = {}) => ({ state, op: null, inProgress: false, pieces: 1, done: state === 'done' ? 1 : 0, cut: null, inOrder: true, ...extra });
const ops = [{ code: 'CUT', name: 'CNC cutting', seq: 10 }, { code: 'FIT', name: 'Fit-up', seq: 20 }, { code: 'WELD', name: 'Welding', seq: 30 }];
const prog = {
  lineId: 1, orderId: 9, orderCode: 'SO1', quantity: 2, released: true, operations: ops,
  rows: [
    { rowId: 1, parentRowId: null, mark: 'G1', markNorm: 'G1', depth: 0, level: 'Girder', name: 'Girder G1', units: [U('working', { op: { code: 'WELD', name: 'Welding' }, inProgress: true }), U('waiting', { op: { code: 'FIT', name: 'Fit-up' } })] },
    { rowId: 2, parentRowId: 1, mark: 'WEB-S1', markNorm: 'WEB-S1', depth: 1, level: 'Plate part', name: 'Web', units: [U('joined'), U('working', { op: { code: 'CUT', name: 'CNC cutting' } })] },
    { rowId: 3, parentRowId: 1, mark: 'BS2', markNorm: 'BS2', depth: 1, level: 'Plate part', name: 'Stiffener', units: [U('joined'), U('waiting', { op: { code: 'CUT', name: 'CNC cutting' }, cut: { done: 0, total: 4 } })] },
    { rowId: 4, parentRowId: null, mark: 'DP1', markNorm: 'DP1', depth: 0, level: 'Diaphragm', name: 'Diaphragm', units: [U('done'), U('done', { inOrder: false })] },
  ],
};
const byMark = m.marksOf(prog);

check('an element finds its row by its own mark (spaces / underscores do not matter)', () => {
  assert.equal(m.rowOfElement({ id: 'a', mark: 'web_s1', in: ['G1'] }, byMark).rowId, 2);
});
check('an element with no row of its own falls to the level it is in', () => {
  assert.equal(m.rowOfElement({ id: 'b', mark: 'XX', in: ['G1'] }, byMark).rowId, 1);
  assert.equal(m.rowOfElement({ id: 'c', mark: 'XX', in: ['YY'] }, byMark), null);
});
check('a part gone into its girder takes the girder\'s look: the girder\'s operation colour, and it pulses with it', () => {
  const web = m.lookOf(prog, prog.rows[1], 0); const girder = m.lookOf(prog, prog.rows[0], 0);
  assert.equal(web.colour, girder.colour);
  assert.equal(web.colour, m.opColour(ops, 'WELD'));
  assert.equal(web.pulse, true);
  assert.match(web.words, /Web · in Girder G1 · at Welding \(being worked\)/);
});
check('in another unit the same part is on its own step (units are separate)', () => {
  assert.equal(m.lookOf(prog, prog.rows[1], 1).colour, m.opColour(ops, 'CUT'));
});
check('one colour per operation, in flow order, all different', () => {
  const cs = ops.map((o) => m.opColour(ops, o.code));
  assert.equal(new Set(cs).size, 3);
});
check('a part whose cut pieces are not cut yet is a ghost, waiting, and says how many are cut', () => {
  const l = m.lookOf(prog, prog.rows[2], 1);
  assert.equal(l.ghost, true); assert.equal(l.colour, m.WAITING); assert.match(l.words, /cut 0 of 4/);
});
check('done is green; outside the production order it is faint', () => {
  assert.equal(m.lookOf(prog, prog.rows[3], 0).colour, m.DONE);
  assert.equal(m.lookOf(prog, prog.rows[3], 1).faint, true);
});
check('not released: steel, with words', () => {
  const p2 = { ...prog, released: false, rows: prog.rows.map((r) => ({ ...r, units: r.units.map(() => U('not_released')) })) };
  const l = m.lookOf(p2, p2.rows[0], 0);
  assert.equal(l.colour, m.NOT_RELEASED); assert.match(l.words, /not released yet/);
});
check('the legend names only what is on screen, operations in flow order, and the ghost', () => {
  const looks = [m.lookOf(prog, prog.rows[0], 0), m.lookOf(prog, prog.rows[1], 1), m.lookOf(prog, prog.rows[2], 1), m.lookOf(prog, prog.rows[3], 0)];
  const lg = m.legendOf(prog, looks).map((x) => x.label);
  assert.deepEqual(lg, ['CNC cutting', 'Welding', 'Done', 'Cut pieces not cut yet']);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
