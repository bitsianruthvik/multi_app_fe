// Run from multi_app_fe: node scripts/cf_erp_nesting_void_test.mjs
// Nesting before the freeze (user, 2026-11-01): a nested line warns before a structure change (lib/nestingVoid.ts
// nestedState / nestedBanner on the Structure step), a save's `nestingVoided` is said after (nestingVoidedNote), and the
// Nesting stage no longer waits for Freeze design.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const out = await build({ entryPoints: ['./src/apps/cf_erp/lib/nestingVoid.ts'], bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external' });
await mkdir(resolve('node_modules/.cache'), { recursive: true });
const file = resolve('node_modules/.cache', `nesting-void-${process.pid}.mjs`);
await writeFile(file, out.outputFiles[0].text);
const m = await import(pathToFileURL(file));
await unlink(file);

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.message}`); } };
const stage = (detail, more = {}) => ({ stageKey: 'nesting', label: 'Nesting', sequence: 4, requirement: 'required', applies: true, decidedBy: 'data', state: 'done', detail, blockers: [], ...more });

await check('a saved nesting is read off the Nesting stage: "37 plates laid out, …" → 37 plates', () => {
  assert.deepEqual(m.nestedState([stage('37 plates laid out, 412 pieces placed, 2 by hand')]), { plates: 37 });
  assert.deepEqual(m.nestedState([stage('1 plate laid out, 3 pieces placed')]), { plates: 1 });
  assert.deepEqual(m.nestedState([stage('1,204 plates laid out · 12 cut sections still to lay out on bars', { state: 'partial' })]), { plates: 1204 });
});
await check('out of date is still nested (count unknown); not nested, not applicable or no stage → null', () => {
  assert.deepEqual(m.nestedState([stage('The nesting is out of date — 2 cut pieces changed')]), { plates: null });
  assert.equal(m.nestedState([stage('4 cut plates to lay out', { state: 'todo' })]), null);
  assert.equal(m.nestedState([stage('37 plates laid out', { applies: false })]), null);
  assert.equal(m.nestedState([]), null); assert.equal(m.nestedState(null), null);
});
await check('a structured count from the server wins over the words', () => {
  assert.deepEqual(m.nestedState([stage('whatever', { nested: { plates: 9 } })]), { plates: 9 });
  assert.equal(m.nestedState([stage('37 plates laid out', { nested: { plates: 0 } })]), null);
});
await check('the banner before a change says the plates and what voids it', () => {
  assert.equal(m.nestedBanner({ plates: 37 }), 'This line is nested (37 plates). A change to the structure — quantities, sizes, parts added or removed — voids the nesting.');
  assert.match(m.nestedBanner({ plates: 1 }), /\(1 plate\)/);
  assert.match(m.nestedBanner({ plates: null }), /\(its plates are saved\)/);
});
await check("after a save: the server's message, else words of our own; nothing when the nesting was left alone", () => {
  const msg = 'The structure changed (2 cut pieces need a different number of pieces), so the nesting of line 1 is void: 37 plates were taken off. Nest the line again.';
  assert.equal(m.nestingVoidedNote({ applied: true, nestingVoided: { voided: true, plates: 37, why: 'x', message: msg } }), msg);
  assert.equal(m.nestingVoidedNote({ nestingVoided: { voided: true, plates: 3 } }), 'The structure changed, so the nesting is void: 3 plates were taken off. Nest the line again.');
  assert.equal(m.nestingVoidedNote({ nestingVoided: { voided: false } }), null);
  assert.equal(m.nestingVoidedNote({ applied: true }), null); assert.equal(m.nestingVoidedNote(null), null);
  assert.deepEqual(m.nestingVoidedNotes({ lines: [{ lineId: 1, nestingVoided: { voided: true, message: 'a' } }, { lineId: 2 }] }), ['a']);
});
await check('the screens use it: Structure step banner; BOM save, copy and Excel import, the values editor and a record\'s values say a voided nesting', async () => {
  const src = (p) => readFile(`src/apps/cf_erp/${p}`, 'utf8');
  const step = await src('components/OrderStructure/OrderStructureStep.tsx');
  assert.match(step, /nestedState\(lineStages\(l\.id\)\)/); assert.match(step, /!l\.release && !lineLock\(l\)/); assert.match(step, /nestedBanner\(nested\)/);
  const panel = await src('components/Bom/BomPanel.tsx');
  assert.equal((panel.match(/sayVoided\((out|result)\)/g) ?? []).length, 3, 'save, copy, Excel import');
  assert.match(panel, /data-testid="nesting-voided"/);
  assert.match(await src('components/Bom/BomValuesEditor.tsx'), /nestingVoidedNote\(out\)/);
  assert.match(await src('pages/RecordDetail.tsx'), /nestingVoidedNote\(out\)/);
});
await check('Nesting no longer waits for Freeze design', async () => {
  const body = await readFile('src/apps/cf_erp/components/OrderProcess/StageBody.tsx', 'utf8');
  assert.doesNotMatch(body, /Freeze the design first/);
  assert.doesNotMatch(body, /notFrozen/);
  const help = await readFile('src/apps/cf_erp/help/content/order/order-nesting.md', 'utf8');
  assert.doesNotMatch(help, /It comes after Freeze design/);
  assert.match(help, /does not wait for Freeze design/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
