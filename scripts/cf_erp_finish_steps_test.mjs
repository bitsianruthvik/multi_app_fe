// Run from multi_app_fe: node scripts/cf_erp_finish_steps_test.mjs
// 2026-10-31: the Tracker's "Finish selected" sends a big selection in parts (lib/finishSteps.ts) and sends again the
// steps refused only because they waited on a later part; Nesting's "Add this plate to the catalog" says what it added
// (lib/nestMissingSteel.ts). The server side is multi_app_be/scripts/cf_kepl/step_batch_test.mjs and
// nest_missing_plates_test.mjs §8.
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function load(entry) {
  const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
}
const F = await load('src/apps/cf_erp/lib/finishSteps.ts');
const S = await load('src/apps/cf_erp/lib/nestMissingSteel.ts');

let passed = 0;
let failed = 0;
async function check(label, fn) {
  try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.message}`); }
}

/**
 * A fake server: step n waits on step n - 1 when `chain` says so; it finishes, in waves, what is ready within one
 * request (as stepBatchService does) and refuses the rest "It cannot start yet. …".
 */
function fakeServer({ chain = () => false, refuse = new Map() } = {}) {
  const doneSet = new Set();
  const calls = [];
  const post = async (ids) => {
    calls.push(ids.length);
    assert.ok(ids.length <= F.FINISH_BATCH, `a request of ${ids.length}`);
    const open = new Set(ids);
    const done = []; const refused = [];
    for (const id of ids) if (refuse.has(id)) { open.delete(id); refused.push({ stepId: id, label: `s${id}`, reason: refuse.get(id) }); }
    let wave = 0;
    for (;;) {
      const now = [...open].filter((id) => !chain(id) || doneSet.has(id - 1));
      if (!now.length) break;
      wave += 1;
      for (const id of now) { open.delete(id); doneSet.add(id); done.push({ stepId: id, label: `s${id}`, good: 1, wave }); }
    }
    for (const id of open) refused.push({ stepId: id, label: `s${id}`, reason: `It cannot start yet. Waiting for s${id - 1} to finish first.` });
    return { done, refused, waves: wave, message: '' };
  };
  return { post, calls, doneSet };
}

await check('a selection within the cap is one request', async () => {
  const srv = fakeServer();
  const out = await F.finishInParts([1, 2, 3, 3], srv.post);
  assert.deepEqual(srv.calls, [3]);
  assert.equal(out.done.length, 3); assert.equal(out.refused.length, 0); assert.equal(out.requests, 1);
  assert.equal(F.finishSentence(out), 'Finished 3 steps.');
});

await check('615 steps go in parts of 200, with progress after each', async () => {
  const srv = fakeServer();
  const seen = [];
  const out = await F.finishInParts(Array.from({ length: 615 }, (_, i) => i + 1), srv.post, (d, t) => seen.push([d, t]));
  assert.deepEqual(srv.calls, [200, 200, 200, 15]);
  assert.equal(out.done.length, 615);
  assert.deepEqual(seen.at(-1), [615, 615]);
});

await check('a step that waited on a LATER part is sent again once that part is done', async () => {
  // Named last first: 300 waits on 299 … — the first part holds 300..101, which wait on 100..1 in the second part.
  const ids = Array.from({ length: 300 }, (_, i) => 300 - i);
  const srv = fakeServer({ chain: (id) => id > 1 });
  const out = await F.finishInParts(ids, srv.post);
  assert.equal(out.done.length, 300, `done ${out.done.length}, refused ${out.refused.length}`);
  assert.equal(out.refused.length, 0);
  assert.ok(out.requests >= 3, `requests ${out.requests}`);
});

await check('a refusal for another reason is not sent again; one still waiting on something else is said once', async () => {
  const srv = fakeServer({ chain: (id) => id === 250, refuse: new Map([[5, 'It is on hold — resume it first.']]) });
  // 250 waits on 249, which is not in the selection.
  const ids = [...Array.from({ length: 220 }, (_, i) => i + 1), 250];
  const out = await F.finishInParts(ids, srv.post);
  assert.equal(out.done.length, 219);
  assert.deepEqual(out.refused.map((r) => r.stepId), [5, 250]);
  assert.equal(F.finishSentence(out), 'Finished 219 steps. 2 were not — each says why.');
  assert.ok(F.waitsOnOthers(out.refused[1]) && !F.waitsOnOthers(out.refused[0]));
});

await check('nothing finished', async () => {
  assert.equal(F.finishSentence({ done: [], refused: [{ stepId: 1, label: null, reason: 'x' }], requests: 1 }), 'No step was finished. 1 was not — each says why.');
});

await check('the missing steel in words, and what was added', async () => {
  assert.equal(S.steelWords({ thickness: 12, material: 'MS', grade: 'E250', impactClass: 'BR' }), '12 mm MS E250 BR');
  assert.equal(S.steelWords({ thickness: 8, material: null, grade: 'E250', impactClass: null }), '8 mm E250');
  const added = S.addedWords({ created: [{ key: 'k', itemId: 1, code: 'PL-12X2500X12000-E250BR', name: 'n', kind: 'custom', sizedFrom: 'thickness', length: 12000, width: 2500 }], skipped: [], message: '' });
  assert.match(added, /^Added PL-12X2500X12000-E250BR \(12,?000 × 2,?500\) to the catalog\./);
  assert.equal(S.addedWords({ created: [], skipped: [{ key: 'k', why: 'Already in the catalog: X.' }], message: 'm' }), 'Already in the catalog: X.');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
