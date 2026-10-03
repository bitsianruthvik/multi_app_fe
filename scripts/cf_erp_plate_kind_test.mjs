// Run from multi_app_fe: node scripts/cf_erp_plate_kind_test.mjs
// Standard / custom plates: the API helpers (path, method, body) through a stubbed fetch,
// and source checks that the "Plates to use" control, the disabled-run note, the kind chips
// and "Not used — standard plates only" exist.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

globalThis.window = { location: { pathname: '/testco/cf_erp/orders/1' } };
let passed = 0; let failed = 0;
const check = async (name, fn) => {
  try { await fn(); passed += 1; console.log(`ok   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${e.message}`); }
};

const stub = `export async function apiFetch(url, o = {}) {
  const res = await globalThis.fetch(url, { method: o.method || 'GET', body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await res.text();
  if (!res.ok) throw new Error('API request failed: ' + res.status + ' x - ' + text);
  return JSON.parse(text);
}`;
const built = await build({
  stdin: { contents: `export { setNestPlates, setPlateKind } from './src/apps/cf_erp/api/nesting';`, resolveDir: process.cwd(), loader: 'ts' },
  plugins: [{ name: 'stub-api', setup(b) {
    b.onResolve({ filter: /^@core\/api\/client$/ }, () => ({ path: 'apiclient', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: stub, loader: 'js' }));
  } }],
  bundle: true, write: false, format: 'esm', platform: 'browser', logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `plate-kind-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const { setNestPlates, setPlateKind } = await import(pathToFileURL(artifact));
await unlink(artifact);

const calls = [];
globalThis.fetch = async (url, o = {}) => {
  calls.push({ url: String(url), method: o.method || 'GET', body: o.body ? JSON.parse(o.body) : undefined });
  return { ok: true, status: 200, text: async () => '{"lineId":7,"plateChoice":"standard"}' };
};

await check('setNestPlates PUTs …/nesting/plates with { plates }', async () => {
  const out = await setNestPlates(3, 7, 'standard');
  const c = calls.at(-1);
  assert.ok(c.url.includes('/orders/3/lines/7/nesting/plates'), c.url);
  assert.equal(c.method, 'PUT');
  assert.deepEqual(c.body, { plates: 'standard' });
  assert.equal(out.plateChoice, 'standard');
  await setNestPlates(3, 7, 'any');
  assert.deepEqual(calls.at(-1).body, { plates: 'any' });
});

await check('setPlateKind PUTs /records/:id/values with PLATE_KIND', async () => {
  await setPlateKind(21, 'STANDARD');
  const c = calls.at(-1);
  assert.ok(c.url.includes('/records/21/values'), c.url);
  assert.equal(c.method, 'PUT');
  assert.deepEqual(c.body, { values: [{ specCode: 'PLATE_KIND', value: 'STANDARD' }] });
});

const panel = await readFile('src/apps/cf_erp/components/Nesting/NestingPanel.tsx', 'utf8');
const choices = await readFile('src/apps/cf_erp/components/Nesting/NestChoices.tsx', 'utf8');

await check('the Plates to use control has both options and saves through setNestPlates', () => {
  assert.ok(panel.includes('Plates to use'));
  assert.ok(panel.includes('Standard plates only') && panel.includes('Standard and custom'));
  assert.ok(panel.includes('setNestPlates('));
  assert.ok(/not marked/.test(panel), 'unknown plates are counted and named');
});

await check('every run button waits for the choice, with an amber note', () => {
  assert.ok(panel.includes('Choose which plates to use before nesting.'));
  assert.ok(panel.includes('plateChoice === null'));
  assert.equal((panel.match(/\|\| platesUnset/g) ?? []).length, 3, 'main, redo-all and short-pieces buttons');
});

await check('PLATES_NOT_CHOSEN shows the server message in place', () => {
  assert.ok(panel.includes("'PLATES_NOT_CHOSEN'"));
  assert.ok(panel.includes('plates-not-chosen-error'));
});

await check('Step B rows carry Standard / Custom chips, the flip, and the not-used line', () => {
  assert.ok(choices.includes("'Standard'") && choices.includes("'Custom'"));
  assert.ok(choices.includes('Not marked — counted as custom'));
  assert.ok(choices.includes('Mark as standard') && choices.includes('Mark as custom'));
  assert.ok(choices.includes('Not used — standard plates only'));
  assert.ok(choices.includes('allowed === false'));
  assert.ok(choices.includes('setPlateKind('));
});

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
