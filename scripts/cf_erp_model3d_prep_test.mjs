// The 3D view's preparation (src/apps/cf_erp/lib/model3dPrep.ts): each distinct shape built once, every piece placed by
// a matrix, holes kept as (x, y, Ø) for markers, a bad piece left out, a fingerprint that follows the drawing.
//   node scripts/cf_erp_model3d_prep_test.mjs [path/to/model.json …]   (with a model: also times it against the old build)
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const entry = `export * from './src/apps/cf_erp/lib/model3dPrep.ts'; export { elementGeometries } from './src/apps/cf_erp/lib/model3dGeometry.ts'; export { expandModel } from './src/apps/cf_erp/lib/modelDrawing.ts';`;
const built = await build({ stdin: { contents: entry, resolveDir: resolve('.'), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external' });
await mkdir(resolve('node_modules/.cache'), { recursive: true });
const artifact = resolve('node_modules/.cache', `model3dprep-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const THREE = await import('three');

let passed = 0; let failed = 0;
const check = (name, fn) => { try { fn(); passed++; console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, e.message); } };

const sq = [[0, 0], [400, 0], [400, 200], [0, 200]];
const file = {
  schema: 'cf-erp-model3d/2', units: 'mm',
  parts: { GP: { pts: sq, t: 10, holes: [[50, 50, 22], [350, 50, 22]] } },
  elements: [
    { id: 'a', mark: 'GP', in: ['J1'], part: 'GP', o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], w: [0, 0, 1] },
    { id: 'b', mark: 'GP', in: ['J2'], part: 'GP', o: [1000, 0, 0], u: [0, 1, 0], v: [0, 0, 1], w: [1, 0, 0] },
    // mirrored: same part, its own (re-wound) shape
    { id: 'c', mark: 'GP', in: ['J3'], part: 'GP', o: [2000, 0, 0], u: [1, 0, 0], v: [0, -1, 0], w: [0, 0, 1] },
    { id: 'm1', mark: 'C1', member: { a: [0, 0, 0], b: [6000, 0, 0], up: [0, 0, 1], section: { type: 'I', h: 400, bTop: 200, tTop: 16, bBot: 200, tBot: 16, tw: 10 } } },
    { id: 'm2', mark: 'C1', member: { a: [0, 3000, 0], b: [0, 3000, 2500], up: [1, 0, 0], section: { type: 'I', h: 400, bTop: 200, tTop: 16, bBot: 200, tBot: 16, tw: 10 } } },
    { id: 'bad', mark: 'X', box: { c: [0, 0, 0], size: [NaN, 10, 10] } },
    { id: 's', mark: 'ST', studs: { a: [0, 0, 500], di: [100, 0, 0], ni: 3, dj: [0, 100, 0], nj: 2, d: 19, h: 100, up: [0, 0, 1] } },
  ],
};
const model = m.expandModel(file);
const p = m.prepareModel(model);

check('one shape per distinct part / section / stud (and one more for the mirrored copy)', () => {
  assert.deepEqual(p.geoms.map((g) => g.key).sort(), ['m:{"type":"I","h":400,"bTop":200,"tTop":16,"bBot":200,"tBot":16,"tw":10}', 'm:{"type":"pipe","d":19,"t":9.5}', 'p:GP', 'p:GP|m'].sort());
});
check('every piece is drawn except the one with a NaN size', () => {
  const none = [...p.elGeom].map((g, i) => (g < 0 ? model.elements[i].id : null)).filter(Boolean);
  assert.deepEqual(none, ['bad']);
});
check('holes are kept as markers (x, y, Ø), not cut: 3 plates × 2 holes', () => {
  assert.equal(p.holeCount, 6);
  assert.deepEqual([...p.geoms.find((g) => g.key === 'p:GP').holes], [50, 50, 22, 350, 50, 22]);
});
check('each piece lands where the old one-by-one build put it (same box)', () => {
  model.elements.forEach((e, i) => {
    if (p.elGeom[i] < 0) return;
    const bb = new THREE.Box3(); for (const g of m.elementGeometries(e)) { g.computeBoundingBox(); bb.union(g.boundingBox); }
    const got = [...p.elBox.subarray(i * 6, i * 6 + 6)];
    const want = [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z];
    got.forEach((x, k) => assert.ok(Math.abs(x - want[k]) < 0.01, `${e.id}[${k}] ${x} vs ${want[k]}`));
  });
});
check('a hole marker sits at the hole, as wide as the hole, through the plate and 1 mm proud of each face', () => {
  const i = 1; const g = p.geoms[p.elGeom[i]]; const out = new Float32Array(32);
  m.holeMatrices(g, p.elMat.subarray(i * 16, i * 16 + 16), out, 0);
  const M = new THREE.Matrix4().fromArray(out, 0);
  // piece b: x→y, y→z, thickness along x from 1000
  const c = new THREE.Vector3(0, 0, 0).applyMatrix4(M); assert.deepEqual([c.x, c.y, c.z].map((v) => Math.round(v * 100) / 100), [1005, 50, 50]);
  const edge = new THREE.Vector3(1, 0, 0).applyMatrix4(M); assert.ok(Math.abs(edge.distanceTo(c) - 11) < 1e-6);
  const face = new THREE.Vector3(0, 0, 0.5).applyMatrix4(M); assert.ok(Math.abs(face.x - 1011) < 1e-6);
});
check('the fingerprint follows the drawing, not the words', () => {
  const h = m.hashModel(model);
  assert.equal(m.hashModel(m.expandModel(JSON.parse(JSON.stringify(file)))), h);
  const named = JSON.parse(JSON.stringify(file)); named.elements[0].label = 'renamed'; named.elements[0].src = 'x';
  assert.equal(m.hashModel(m.expandModel(named)), h);
  const moved = JSON.parse(JSON.stringify(file)); moved.elements[0].o = [1, 0, 0];
  assert.notEqual(m.hashModel(m.expandModel(moved)), h);
  const holed = JSON.parse(JSON.stringify(file)); holed.parts.GP.holes.push([200, 100, 26]);
  assert.notEqual(m.hashModel(m.expandModel(holed)), h);
});
check('built a slice at a time, it says how far it is and ends the same', () => {
  const it = m.prepareSteps(model, 'h', 3); const seen = []; let r = it.next();
  while (!r.done) { seen.push(r.value); r = it.next(); }
  assert.ok(seen.length >= 3 && seen.every((f, k) => f > 0 && f <= 1 && (k === 0 || f > seen[k - 1])));
  assert.deepEqual([...r.value.elGeom], [...p.elGeom]);
});

// Real models: the build is timed against the old one (every piece built on its own, every hole cut).
for (const path of process.argv.slice(2)) {
  const big = m.expandModel(JSON.parse(await readFile(path, 'utf8')));
  let t = performance.now(); const hash = m.hashModel(big); const tHash = performance.now() - t;
  t = performance.now(); const q = m.prepareModel(big, hash); const tNew = performance.now() - t;
  t = performance.now(); let n = 0; for (const e of big.elements) n += m.elementGeometries(e).length; const tOld = performance.now() - t;
  const drawn = [...q.elGeom].filter((g) => g >= 0).length;
  console.log(`${path}: ${big.elements.length} pieces, ${drawn} drawn from ${q.geoms.length} shapes, ${q.holeCount} holes · fingerprint ${Math.round(tHash)} ms · prepare ${Math.round(tNew)} ms · old build (geometry only) ${Math.round(tOld)} ms`);
  check(`${path}: every piece the old build drew is drawn`, () => {
    big.elements.forEach((e, i) => { if (q.elGeom[i] < 0) assert.equal(m.elementGeometries(e).length, 0, e.id); });
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
