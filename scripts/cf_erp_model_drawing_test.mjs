// Run from multi_app_fe: node scripts/cf_erp_model_drawing_test.mjs
// A level's drawing read straight from the one model (user, 2026-11-02; lib/modelDrawing.ts), on every real model in
// drawing_bom/out: expanding gives every piece, every level draws, one copy of a repeated level is shown, tiny pieces are
// left out and said so, and a downloaded DXF reads back through the viewer's own parser with the same lines. Prints each
// set's slowest level.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const out = await build({
  stdin: { contents: "export * from './src/apps/cf_erp/lib/modelDrawing.ts'; export { parseDxf } from './src/apps/cf_erp/lib/dxfView.ts'; export { elementGeometries } from './src/apps/cf_erp/lib/model3dGeometry.ts';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const file = resolve(cache, `model-drawing-${process.pid}.mjs`);
await writeFile(file, out.outputFiles[0].text);
const { expandModel, levelDrawing, modelHasLevel, modelHasPiece, pieceDrawing, piecesOfLevel, viewToDxf, parseDxf, elementGeometries } = await import(pathToFileURL(file));
await unlink(file);

let passed = 0; let failed = 0;
const check = (label, fn) => { try { fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.message}`); } };

const ROOT = resolve('../drawing_bom/out');
const sets = readdirSync(ROOT).filter((d) => existsSync(join(ROOT, d, 'model.json')));
const read = (s) => JSON.parse(readFileSync(join(ROOT, s, 'model.json'), 'utf8'));

check(`every set has a /2 model (${sets.length})`, () => {
  assert.ok(sets.includes('TCPL_TRUSS_75M') && sets.includes('TT_24M') && sets.filter((s) => s.startsWith('RDSO_')).length >= 17);
  for (const s of sets) assert.equal(read(s).schema, 'cf-erp-model3d/2', s);
});

const timing = [];
for (const s of sets) {
  const model = read(s);
  check(`${s}: expanding gives every piece, plates with their shapes`, () => {
    const x = expandModel(model);
    const want = model.elements.reduce((n, e) => n + (e.studs ? e.studs.ni * e.studs.nj : 1), 0) + 2 * (model.boltSet?.rows?.length ?? 0);   // each bolt: head and nut
    assert.equal(x.elements.length, want);
    assert.equal(x.parts, undefined);
    for (const e of x.elements) if (e.part) assert.ok(e.plate?.pts?.length >= 3, `${e.id} has no outline`);
    assert.equal(expandModel(x), x, 'an expanded model comes through as it is');
  });
  check(`${s}: every level in the model draws`, () => {
    const levels = new Set(model.elements.flatMap((e) => e.in ?? []));
    let worst = 0; let worstAt = ''; let biggest = 0;
    for (const l of levels) {
      const t = performance.now();
      const d = levelDrawing(model, l);
      const ms = performance.now() - t;
      assert.ok(d, `${l} did not draw`);
      assert.ok(d.view.bounds.maxX > d.view.bounds.minX && d.view.bounds.maxY > d.view.bounds.minY, `${l} has no size`);
      assert.ok(d.view.layers.some((y) => y.name === 'OUTLINE' && y.count > 0), `${l} has no outline`);
      if (ms > worst) { worst = ms; worstAt = l; }
      biggest = Math.max(biggest, d.view.layers.filter((y) => y.name !== 'HIDDEN').reduce((n, y) => n + y.d.length, 0));
    }
    timing.push({ s, levels: levels.size, worst: Math.round(worst), worstAt, shownKb: Math.round(biggest / 1024), jsonKb: Math.round(readFileSync(join(ROOT, s, 'model.json')).length / 1024) });
  });
}

const truss = read('TCPL_TRUSS_75M');
const tt = read('TT_24M');

check('truss: one copy of a joint of four is shown, and says so', () => {
  const pieces = piecesOfLevel(expandModel(truss), 'JL2B');
  const leaves = pieces.length;
  assert.ok(leaves > 10 && leaves < 40, `${leaves} pieces`);
  const d = levelDrawing(truss, 'JL2B');
  assert.match(d.view.layers.find((l) => l.name === 'TEXT').texts.at(-1).lines[0], /one of 4/);
});
check('truss: a whole span leaves the studs out and says how many', () => {
  const d = levelDrawing(truss, 'SPAN');
  assert.match(d.view.layers.find((l) => l.name === 'TEXT').texts.at(-1).lines[0], /\d+ too small to see/);
});
check('T&T: a girder segment holds its web, flanges and stiffeners', () => {
  const marks = new Set(piecesOfLevel(expandModel(tt), 'G2-S1').map((e) => e.mark));
  for (const m of ['WEB-S1', 'TF-S1', 'BF-S1-G2G4', 'BS2', 'BS3', 'IS1']) assert.ok(marks.has(m), m);
});
check('3D: every piece of the truss and the T&T builds', () => {
  for (const m of [truss, tt]) for (const e of expandModel(m).elements.filter((x, i) => !x.member || x.member.section.type !== 'pipe' || i % 40 === 0)) assert.ok(elementGeometries(e).length > 0, e.id);
});
check('a part is not a level: the viewer keeps its file', () => {
  assert.equal(modelHasLevel(truss, 'BCP-WB'), false);
  assert.equal(modelHasLevel(truss, 'JL2B'), true);
  assert.equal(modelHasLevel(truss, null), false);
});
check('codes label the pieces when the line has them', () => {
  const d = levelDrawing(truss, 'JL2B', { 'JL2B-GP': 'STS1-MTB1-JL2B1-GP1' });
  assert.ok(d.view.layers.find((l) => l.name === 'TEXT').texts.some((t) => t.lines[0] === 'STS1-MTB1-JL2B1-GP1'));
});
check('a DXF of the view reads back through the viewer: same lines, holes and words', () => {
  for (const [m, l] of [[truss, 'JL2B'], [tt, 'DP3']]) {
    const d = levelDrawing(m, l);
    const back = parseDxf(viewToDxf(d.view));
    for (const name of ['OUTLINE', 'HIDDEN', 'HOLES', 'DIM']) {
      const a = d.view.layers.find((y) => y.name === name); const b = back.layers.find((y) => y.name === name);
      if (a) assert.equal(b?.count, a.count, `${l} ${name}`);
    }
    assert.equal(back.layers.find((y) => y.name === 'TEXT').texts.length, d.view.layers.find((y) => y.name === 'TEXT').texts.length);
    const w0 = d.view.bounds; const w1 = back.bounds;
    assert.ok(w1.maxX - w1.minX <= w0.maxX - w0.minX + 1);
  }
});

// 2026-11-07: a piece with no DXF (a bracing angle, a bolt) is drawn ALONE from the model — one element, not its level.
check('a bracing angle with no DXF draws alone from the model', () => {
  const s = sets.find((x) => /JNPA_36M_P7P8/.test(x));
  if (!s) { console.log('  (no JNPA package here)'); return; }
  const model = read(s);
  assert.equal(modelHasLevel(model, 'ANG1'), false, 'ANG1 is a piece, not a level');
  assert.equal(modelHasPiece(model, 'ang1'), true);
  const d = pieceDrawing(model, 'ANG1');
  assert.ok(d && d.view.bounds, 'drawn');
  assert.equal(d.pieces, 1, 'one angle, not all 161');
  assert.equal(pieceDrawing(model, 'NOPE'), null);
});

// 2026-11-07: the model's bolts are pieces in 3D (a head and a nut each, lit with their joint) and stay off the 2D sheets.
check('bolts: each row of boltSet is a head and a nut in the joint it bolts; the sheets leave them out', () => {
  const s = sets.find((x) => /JNPA_36M_P7P8/.test(x)); if (!s) { console.log('  (no JNPA package here)'); return; }
  const model = read(s); if (!model.boltSet?.rows?.length) { console.log('  (no bolts placed in JNPA yet)'); return; }
  const x = expandModel(model);
  const bolts = x.elements.filter((e) => e.bolt);
  assert.equal(bolts.length, model.boltSet.rows.length * 2, 'head and nut per bolt');
  assert.ok(bolts.every((e) => e.member && e.in?.length && e.member.section.d > 20), 'drawn as members, with the joint path');
  assert.ok(bolts.every((e) => e.member.a.every(Number.isFinite) && e.member.b.every(Number.isFinite)));
  const lvl = model.boltSet.levels[model.boltSet.rows[0][1]].split('<')[0];
  const d = levelDrawing(model, lvl); assert.ok(d, `level ${lvl} still draws`);
  assert.equal(d.pieces, piecesOfLevel(expandModel(model), lvl.toUpperCase()).filter((e) => !e.bolt).length, 'bolts not on the sheet');
});

console.log(`\nset | levels | slowest level (this PC) | largest view shown | model size`);
for (const t of timing) console.log(`${t.s.padEnd(16)} ${String(t.levels).padStart(3)}  ${String(t.worst).padStart(5)} ms ${t.worstAt.padEnd(14)} ${String(t.shownKb).padStart(5)} kB  ${String(t.jsonKb).padStart(5)} kB`);
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
