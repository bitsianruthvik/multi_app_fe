// The 3D view's light-up rule (src/apps/cf_erp/lib/model3d.ts): which level of a line's 3D model is lit.
//   node scripts/cf_erp_model3d_test.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const built = await build({ entryPoints: ['./src/apps/cf_erp/lib/model3d.ts'], bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external' });
await mkdir(resolve('node_modules/.cache'), { recursive: true });
const artifact = resolve('node_modules/.cache', `model3d-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);

let passed = 0; let failed = 0;
const check = (name, fn) => { try { fn(); passed++; console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, e.message); } };
const model = { schema: 'cf-erp-model3d/1', units: 'mm', elements: [
  { id: 'e1', mark: 'V2', in: ['MTA'] }, { id: 'e2', mark: 'V2', in: ['MTB'] }, { id: 'e3', mark: 'JL2A', in: ['MTA'] }, { id: 'e4', mark: 'BCG', in: ['FS'] },
] };
check('the open row lights up when the model has its mark', () => assert.equal(m.litMark(model, ['V2', 'MTA']), 'V2'));
check('a plate part with no mark of its own lights up the deepest level above it', () => assert.equal(m.litMark(model, ['V13-TF', 'V2', 'MTA']), 'V2'));
check('an assembly level lights up everything under it', () => {
  assert.equal(m.litMark(model, ['mta']), 'MTA');
  assert.deepEqual(model.elements.filter((e) => m.isLit(e, 'MTA')).map((e) => e.id), ['e1', 'e3']);
});
check('nothing known: nothing lit', () => { assert.equal(m.litMark(model, ['XX', null, undefined]), null); assert.equal(m.isLit(model.elements[0], null), false); });
check('a member says its length and section; a shaped plate its outline size and thickness', () => {
  assert.equal(m.sizeWords({ member: { a: [0, 0, 0], b: [0, 0, 6400], up: [0, 1, 0], section: { type: 'I', h: 1000, bTop: 700, tTop: 32, bBot: 700, tBot: 32, tw: 16 } } }), 'length 6,400 mm · I 1,000 deep · flanges 700×32 · web 16');
  assert.equal(m.sizeWords({ plate: { pts: [[0, 0], [2995, 0], [2995, 2125], [0, 2125]], t: 32 } }), '2,995 × 2,125 × 32 mm (shaped)');
  assert.equal(m.sizeWords({ member: { a: [0, 0, 0], b: [10800, 0, 0], up: [0, 0, 1], section: { type: 'pipe', d: 406, t: 12 } } }), 'length 10,800 mm · pipe Ø406 × 12');
});
check('a part in 3D says L × W × T; the thickness comes from the file name when the row has none', () => {
  assert.equal(m.sizeWords({ rings: [[[0, 0]]], lengthMm: 10200, widthMm: 300, thicknessMm: 16, label: 'TP' }), '10,200 × 300 × 16 mm');
  assert.equal(m.thicknessFromName('JL2A-GP_32mm_E350.dxf'), 32);
  assert.equal(m.thicknessFromName('TP_16mm_IS2062GrB.dxf'), 16);
  assert.equal(m.thicknessFromName('CG(1–3).dxf'), null);
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
