// Run from multi_app_fe: node scripts/cf_hrms_org_move_test.mjs
// MOVING AN ORG UNIT — the pure parts (src/apps/cf_hrms/components/orgMove.ts, CF_HRMS spec §34.3, §40.4).
// Browser check 2026-10-27: after a drag that "stuck", the confirm said "from Production to BFL" and the unit
// landed under Slitting. Now: a drop while a move is being confirmed is ignored (planDrop busy), the confirm
// sends the move its words were written for (MoveConfirm), and the keep-or-switch answer names where the default
// really comes from (switchChoiceText) instead of calling a grand-parent's head "the new parent's head".
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const built = await build({
  stdin: { contents: `export * from './src/apps/cf_hrms/components/orgMove';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error',
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const file = resolve(cache, `cf_hrms_org_move_${process.pid}.mjs`);
await writeFile(file, built.outputFiles[0].text);
const M = await import(pathToFileURL(file).href);
await unlink(file);

let pass = 0, fail = 0;
const ok = (label, fn) => { try { fn(); pass += 1; } catch (e) { fail += 1; console.error('FAIL', label, '\n ', e.message); } };

// Management(1) > Production(2) > [Slitting(3), BFL(4), Printing(5)];  Stores(6) under Management.
const rows = [
  { id: 1, parentId: null, sortOrder: 1 },
  { id: 2, parentId: 1, sortOrder: 1 },
  { id: 3, parentId: 2, sortOrder: 1 },
  { id: 4, parentId: 2, sortOrder: 2 },
  { id: 5, parentId: 2, sortOrder: 3 },
  { id: 6, parentId: 1, sortOrder: 2 },
];

ok('zones: top quarter before, middle onto, bottom quarter after', () => {
  const r = { top: 100, height: 40 };
  assert.equal(M.zoneOf(105, r), 'before');
  assert.equal(M.zoneOf(120, r), 'inside');
  assert.equal(M.zoneOf(135, r), 'after');
});

ok('onto another unit: a move to confirm, to exactly that unit', () => {
  assert.deepEqual(M.planDrop({ unitId: 6, targetId: 4, zone: 'inside' }, rows), { kind: 'confirm', move: { unitId: 6, parentId: 4 } });
});

ok('a second drop while a move is being confirmed does nothing (it cannot replace the move the dialog names)', () => {
  const first = M.planDrop({ unitId: 6, targetId: 4, zone: 'inside' }, rows);
  const second = M.planDrop({ unitId: 6, targetId: 3, zone: 'inside' }, rows, { busy: true });
  assert.equal(first.kind, 'confirm');
  assert.equal(second.kind, 'none');
});

ok('onto its own parent, onto itself, unknown ids: nothing', () => {
  assert.equal(M.planDrop({ unitId: 4, targetId: 2, zone: 'inside' }, rows).kind, 'none');
  assert.equal(M.planDrop({ unitId: 4, targetId: 4, zone: 'inside' }, rows).kind, 'none');
  assert.equal(M.planDrop({ unitId: 99, targetId: 4, zone: 'inside' }, rows).kind, 'none');
});

ok('between siblings: a reorder (with the old order for Undo); the same order: nothing', () => {
  assert.deepEqual(M.planDrop({ unitId: 5, targetId: 3, zone: 'before' }, rows), { kind: 'reorder', parentId: 2, before: [3, 4, 5], after: [5, 3, 4] });
  assert.deepEqual(M.planDrop({ unitId: 3, targetId: 5, zone: 'after' }, rows), { kind: 'reorder', parentId: 2, before: [3, 4, 5], after: [4, 5, 3] });
  assert.equal(M.planDrop({ unitId: 3, targetId: 4, zone: 'before' }, rows).kind, 'none');
});

ok('between units of another parent: a move to that parent, at that place', () => {
  assert.deepEqual(M.planDrop({ unitId: 6, targetId: 4, zone: 'after' }, rows), { kind: 'confirm', move: { unitId: 6, parentId: 2, sortOrder: 3 } });
  assert.deepEqual(M.planDrop({ unitId: 3, targetId: 1, zone: 'before' }, rows), { kind: 'confirm', move: { unitId: 3, parentId: null, sortOrder: 1 } });
});

const pos = (title, occupantName) => ({ positionId: 1, title, code: null, occupantName });
const line = (p) => `${p.title} — ${p.occupantName ?? 'vacant'}`;

ok('switch: the new parent HAS a head — named as the new parent’s head', () => {
  const t = M.switchChoiceText({ mode: 'CHOSEN', ask: true, current: null, afterMove: pos('Plant head', 'Ravi'),
    afterMoveFrom: { id: 2, name: 'Production', type: null }, newParent: { id: 2, name: 'Production', type: null, hasHead: true } }, line);
  assert.equal(t, 'Switch to Production’s head — Plant head — Ravi');
});

ok('switch: the new parent has NO head — "the default … the nearest head above (BFL has no head yet)", never "the new parent’s head"', () => {
  const t = M.switchChoiceText({ mode: 'CHOSEN', ask: true, current: null, afterMove: pos('Chairman', 'A. Karni'),
    afterMoveFrom: { id: 1, name: 'Management', type: null }, newParent: { id: 4, name: 'BFL', type: null, hasHead: false } }, line);
  assert.equal(t, 'Switch to the default — Chairman — A. Karni, the nearest head above, in Management (BFL has no head yet)');
  assert.ok(!/new parent/.test(t));
});

ok('switch: no head anywhere above — "the default — nobody for now"', () => {
  const t = M.switchChoiceText({ mode: 'CHOSEN', ask: true, current: null, afterMove: null, afterMoveFrom: null,
    newParent: { id: 4, name: 'BFL', type: null, hasHead: false } }, line);
  assert.equal(t, 'Switch to the default — nobody for now (no unit from BFL up has a head yet)');
});

console.log(`cf_hrms_org_move_test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
