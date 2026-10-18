// Run from multi_app_fe: node scripts/cf_erp_get_retry_test.mjs
// A READ THAT FAILED FOR A MOMENT IS ASKED AGAIN, ONCE (src/apps/cf_erp/api/client.ts, 2026-10-18).
// Production: "Record payment" opened on "Something went wrong" — GET /accounts/orders/:id/payments was a 500 once
// (the database had closed the pooled connection) and a 200 on the second click. GETs are retried once on a network
// failure, 502, 503 (the backend's DB_CONNECTION_LOST) or 504; never on a plain 500, a timeout, a 4xx, or any write.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

globalThis.window = { location: { pathname: '/placebo/cf_erp/billing' } };
globalThis.__calls = [];
globalThis.__script = [];
const apiStub = `export async function apiFetch(url, o = {}) {
  globalThis.__calls.push({ method: o.method || 'GET', url });
  const next = globalThis.__script.shift();
  if (!next) throw new Error('no scripted answer');
  if (next.throw) throw new Error(next.throw);
  return next.ok;
}`;
const built = await build({
  stdin: { contents: `export * from './src/apps/cf_erp/api/client'; export { orderPayments } from './src/apps/cf_erp/api/accounts';`, resolveDir: process.cwd(), loader: 'ts' },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/api\/client$/ }, () => ({ path: 'api', namespace: 'stub' }));
    b.onLoad({ filter: /^api$/, namespace: 'stub' }, () => ({ contents: apiStub, loader: 'js' }));
  } }],
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error',
  define: { 'import.meta.env': '{"VITE_API_HOST":"http://localhost:4000"}' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const file = resolve(cache, `cf_erp_get_retry_${process.pid}.mjs`);
await writeFile(file, built.outputFiles[0].text);
const M = await import(pathToFileURL(file).href);
await unlink(file);

let pass = 0, fail = 0;
const ok = (label, cond) => { if (cond) pass += 1; else { fail += 1; console.error('FAIL', label); } };
const run = async (label, script, fn) => {
  globalThis.__calls = []; globalThis.__script = script.slice();
  try { return { value: await fn(), calls: globalThis.__calls.length }; } catch (e) { return { error: e, calls: globalThis.__calls.length }; }
};
const e500 = { throw: 'API request failed: 500 Internal Server Error - {"message":"Something went wrong."}' };
const e503 = { throw: 'API request failed: 503 Service Unavailable - {"message":"The connection to the database dropped for a moment. Try again — if you were saving, reload first to see whether it was saved.","code":"DB_CONNECTION_LOST"}' };
const net = { throw: 'Network Error' };
const tmo = { throw: 'timeout of 30000ms exceeded (timed out)' };
const e422 = { throw: 'API request failed: 422 Unprocessable - {"message":"Nope.","code":"INVALID"}' };
const pay = { order: { id: 690001, code: 'SO260014' }, invoices: [], receipts: [] };

const t0 = Date.now();
let r = await run('payments 503 then 200', [e503, { ok: pay }], () => M.orderPayments(690001));
ok('the payments read that met the database hang-up (503) answers on its retry', r.value?.order?.code === 'SO260014');
ok('… asked exactly twice', r.calls === 2);
ok('… after a short pause', Date.now() - t0 >= M.GET_RETRY_DELAY_MS - 50);
ok('… the path is the order payments path', globalThis.__calls.every((c) => c.url === '/api/placebo/cf_erp/accounts/orders/690001/payments'));

r = await run('503 then 200', [e503, { ok: { a: 1 } }], () => M.cfApi.get('/x'));
ok('a 503 (database connection dropped) is retried', r.value?.a === 1 && r.calls === 2);
r = await run('network then 200', [net, { ok: { a: 2 } }], () => M.cfApi.get('/x'));
ok('a network failure (instance restarting) is retried', r.value?.a === 2 && r.calls === 2);

r = await run('503 twice', [e503, e503], () => M.cfApi.get('/x'));
ok('two failures: the error reaches the screen', r.error instanceof M.CfApiError && r.calls === 2);
ok('… with the server\'s words, not "Something went wrong"', /database dropped for a moment/.test(r.error?.message ?? '') && r.error?.code === 'DB_CONNECTION_LOST' && r.error?.status === 503);
r = await run('network twice', [net, net], () => M.cfApi.get('/x'));
ok('a server that stays unreachable says it may be restarting', /may be restarting/.test(r.error?.message ?? '') && r.error?.status === 0);

r = await run('timeout', [tmo, { ok: 1 }], () => M.cfApi.get('/x'));
ok('a timeout is NOT retried (the server was there, just slow)', r.error?.code === 'TIMED_OUT' && r.calls === 1);
r = await run('422', [e422, { ok: 1 }], () => M.cfApi.get('/x'));
ok('a 4xx is NOT retried', r.error?.status === 422 && r.calls === 1);
for (const m of ['post', 'put', 'patch']) {
  r = await run(m, [e500, { ok: 1 }], () => M.cfApi[m]('/x', {}));
  ok(`a ${m.toUpperCase()} is never repeated (it may have landed)`, r.error?.status === 500 && r.calls === 1);
}
r = await run('delete', [net, { ok: 1 }], () => M.cfApi.del('/x'));
ok('a DELETE is never repeated', r.error?.status === 0 && r.calls === 1);
r = await run('ok first', [{ ok: { a: 3 } }], () => M.cfApi.get('/x'));
ok('a read that works is asked once', r.value?.a === 3 && r.calls === 1);

ok('isRetryableRead: not a plain GET 500 (the server answered)', !M.isRetryableRead('GET', new M.CfApiError(500, 'x')));
r = await run('500 then 200', [e500, { ok: 1 }], () => M.cfApi.get('/x'));
ok('a plain 500 reaches the screen at once (asked once)', r.error?.status === 500 && r.calls === 1);
ok('isRetryableRead: not GET 404', !M.isRetryableRead('GET', new M.CfApiError(404, 'x')));
ok('isRetryableRead: not POST 503', !M.isRetryableRead('POST', new M.CfApiError(503, 'x')));

console.log(`cf_erp_get_retry_test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
