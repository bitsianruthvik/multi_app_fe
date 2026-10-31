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
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
