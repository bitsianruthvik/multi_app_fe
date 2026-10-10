// Run from multi_app_fe: node scripts/cf_erp_nest_run_test.mjs
// Nesting runs live on the server: the api helpers' paths and methods, the panel's running card
// (progress, phase, log), resume on open, the interrupted note, a refused run, Discard, and
// source checks (polling, LinearProgress, log box, no AuthContext in the panel).
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/orders/1', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  try { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true }); } catch { /* skip */ }
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const stub = `export async function apiFetch(url, o = {}) {
  const res = await globalThis.fetch(url, { method: o.method || 'GET', body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await res.text();
  if (!res.ok) throw new Error('API request failed: ' + res.status + ' x - ' + text);
  return JSON.parse(text);
}`;
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; export { React, createRoot }; export { MemoryRouter } from 'react-router-dom';
      export { NestingPanel } from './src/apps/cf_erp/components/Nesting/NestingPanel';
      export { startNestRun, getNestRun, discardNestRun } from './src/apps/cf_erp/api/nesting';
      export { phaseWords, runSummary, logTime } from './src/apps/cf_erp/lib/nesting';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stub-api', setup(b) {
    b.onResolve({ filter: /^@core\/api\/client$/ }, () => ({ path: 'apiclient', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: stub, loader: 'js' }));
  } }],
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `nest-run-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const { React, createRoot, NestingPanel, MemoryRouter, startNestRun, getNestRun, discardNestRun, phaseWords, runSummary, logTime } = await import(pathToFileURL(artifact));
await unlink(artifact);
const inRouter = (el) => React.createElement(MemoryRouter, null, el);

const metrics = { lots: 0, plates: 0, pieces: 0, areaBought: 0, usedArea: 0, wasteArea: 0, wastePct: 0, weightKg: 0, wasteKg: 0, thickness: null };
const plan = () => ({
  line: { id: 1, lineNo: 1, orderId: 1, orderCode: 'SO-1', quantity: 1, orderStatus: 'draft' },
  saved: false, basis: 'proposal', manual: [], sizeAdvice: [], problems: [], groups: [],
  totals: { ...metrics, groups: 0, unplaced: 0 },
});
const snap = (status, extra = {}) => ({
  runId: 'r1', lineId: 1, status, phase: status === 'done' ? 'done' : 'packing',
  progress: { done: 3, total: 10, pct: status === 'done' ? 100 : 30 },
  startedAt: '2026-10-03T10:00:00Z', startedBy: 'Asha', finishedAt: null, elapsedMs: 4000, budgetMs: 300000, effort: 'standard',
  log: [{ at: '2026-10-03T10:00:01Z', text: 'Reading the order' }, { at: '2026-10-03T10:00:02Z', text: 'Grouping by steel: 2 groups' }],
  error: null, summary: status === 'done' ? { plates: 125, pieces: 2944, wastePct: 6, problems: 2 } : null, ...extra,
});

const calls = [];
let server = { current: { status: 'none' } };
globalThis.fetch = async (url, o = {}) => {
  const method = o.method || 'GET';
  calls.push(`${method} ${url}`);
  let out;
  if (String(url).endsWith('/runs/current/stop') && method === 'POST') out = server.onStop ? server.onStop() : server.current;
  else if (String(url).includes('/nesting/runs/current')) {
    out = server.current;
    if (method === 'GET' && out.status === 'done' && !String(url).includes('plan=1')) { const { plan: _p, ...rest } = out; out = rest; }
    if (method === 'DELETE') server.current = { status: 'none' };
    if (method === 'DELETE') out = { ok: true, running: false };
  } else if (String(url).endsWith('/nesting/runs') && method === 'POST') {
    server.lastBody = o.body ? JSON.parse(o.body) : null;
    out = server.start ?? snap('running');
    server.current = out;
  } else if (String(url).includes('/nesting/choices')) return { ok: false, status: 404, text: async () => '{}' };
  else if (String(url).includes('/costs')) out = { lines: [] };
  else out = plan();
  return { ok: true, status: 200, text: async () => JSON.stringify(out) };
};

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = (ms = 30) => React.act(async () => { await sleep(ms); });
const waitFor = async (cond, what, ms = 4000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false; try { ok = !!cond(); } catch { /* not yet */ }
    if (ok) return;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await settle(20);
  }
};
const text = () => document.body.textContent;
const find = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label || b.textContent.trim().startsWith(label));
const click = async (el, what) => { assert.ok(el, `no ${what}`); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await settle(); };

const host = () => { const d = document.createElement('div'); document.body.appendChild(d); return d; };
let root = null;
const mount = async (lineId = 1) => {
  root = createRoot(host());
  await React.act(async () => { root.render(inRouter(React.createElement(NestingPanel, { orderId: 1, lineId, canManage: true }))); await sleep(0); });
};
const unmount = async () => { await React.act(async () => { root.unmount(); }); root = null; };

await check('the helpers use the runs paths and methods', async () => {
  calls.length = 0;
  await startNestRun(1, 2, { effort: 'deep', seed: 7 });
  await getNestRun(1, 2);
  await getNestRun(1, 2, { plan: true });
  await discardNestRun(1, 2);
  assert.ok(calls[0].startsWith('POST ') && calls[0].endsWith('/orders/1/lines/2/nesting/runs'));
  assert.ok(calls[1].endsWith('/runs/current') && calls[2].endsWith('/runs/current?plan=1'));
  assert.ok(calls[3].startsWith('DELETE ') && calls[3].endsWith('/runs/current'));
  server.current = { status: 'none' };
});

await check('phase words and the done summary read the way the run was asked to', async () => {
  assert.equal(phaseWords(snap('running', { phase: 'reading' })), 'Reading the order');
  assert.equal(phaseWords(snap('running', { phase: 'grouping' })), 'Grouping by steel');
  assert.equal(phaseWords(snap('running')), 'Packing plates (3/10 tries)');
  assert.equal(phaseWords(snap('running', { phase: 'shaping' })), 'Choosing the best layouts');
  assert.equal(runSummary(snap('done')), '125 plates · 2,944 pieces · 6.0% waste · 2 problems');
  assert.match(logTime('2026-10-03T10:00:01Z'), /^\d\d:\d\d:\d\d$/);
});

await check('opening the page mid-run shows the running card, its log, a progress bar, and locks the run button', async () => {
  server.current = snap('running');
  calls.length = 0;
  await mount();
  await waitFor(() => document.querySelector('[data-testid=nest-run-card]'), 'running card');
  assert.ok(calls.some((c) => c.endsWith('/nesting/runs/current')), 'asks the server on open');
  assert.ok(document.querySelector('[role=progressbar]'), 'a progress bar');
  assert.equal(document.querySelector('[role=progressbar]').getAttribute('aria-valuenow'), '30');
  const log = document.querySelector('[data-testid=nest-run-log]');
  assert.ok(log.textContent.includes('Grouping by steel: 2 groups'));
  assert.ok(text().includes('you can leave this page') && text().includes('of 5:00 used') && text().includes('Started by Asha'));
  await waitFor(() => find('Nest everything'), 'the toolbar');
  assert.equal(find('Nest everything').disabled, true);
});

await check('while it runs the page polls, and polling stops when the page is left', async () => {
  const n = () => calls.filter((c) => c.includes('/runs/current')).length;
  const before = n();
  await waitFor(() => n() > before, 'a poll', 3500);
  await unmount();
  const after = n();
  await settle(1800);
  assert.equal(n(), after, 'no polls after unmount');
});

await check('coming back after it finished shows the proposal with the summary, the log and Discard', async () => {
  server.current = snap('done', { plan: plan() });
  calls.length = 0;
  await mount();
  await waitFor(() => text().includes('Nothing here is written down yet'), 'the proposal');
  assert.ok(calls.some((c) => c.includes('runs/current?plan=1')), 'fetched the proposal');
  assert.ok(document.querySelector('[data-testid=nest-run-done]').textContent.includes('125 plates · 2,944 pieces · 6.0% waste · 2 problems'));
  assert.ok(find('Show run log'));
  await click(find('Show run log'), 'log toggle');
  assert.ok(document.querySelector('[data-testid=nest-run-log]'));
  await click(find('Discard'), 'Discard');
  assert.ok(calls.some((c) => c.startsWith('DELETE') && c.endsWith('/runs/current')), 'Discard forgets the run');
  await waitFor(() => !text().includes('Nothing here is written down yet'), 'proposal gone');
  await unmount();
});

await check('a run refused up front shows the service words and its problems', async () => {
  server.current = { status: 'none' };
  server.start = snap('failed', { phase: 'failed', error: { code: 'NOT_FROZEN', message: 'Freeze the design first.', problems: ['Line 1 is not frozen'] } });
  await mount();
  await waitFor(() => find('Nest everything'), 'the toolbar');
  await click(find('Nest everything'), 'nest');
  await waitFor(() => text().includes('Freeze the design first.'), 'the message');
  assert.ok(text().includes('Line 1 is not frozen'));
  assert.equal(document.querySelector('[data-testid=nest-run-card]'), null);
  assert.equal(find('Nest everything').disabled, false, 'the run can be started again');
  server.start = undefined;
  await unmount();
});

await check('a run seen running that the server no longer knows is called interrupted', async () => {
  server.current = snap('running');
  await mount(5);
  await waitFor(() => document.querySelector('[data-testid=nest-run-card]'), 'running card');
  assert.equal(localStorage.getItem('cf_erp_nest_run_seen_5'), 'r1');
  server.current = { status: 'none' };           // the server restarted
  await waitFor(() => document.querySelector('[data-testid=nest-run-interrupted]'), 'interrupted note', 4000);
  assert.ok(text().includes('The run was interrupted (the server restarted) — start it again.'));
  assert.equal(document.querySelector('[data-testid=nest-run-card]'), null);
  assert.equal(localStorage.getItem('cf_erp_nest_run_seen_5'), null);
  await unmount();
});

const rich = (extra = {}) => snap('running', {
  progress: {
    done: 3, total: 10, pct: 30,
    best: { plates: 124, areaBoughtM2: 3511.2, wastePct: 5.092, unplaced: 0, atMs: 3021, scope: 'rest' },
    curve: [
      { atMs: 1000, plates: 130, areaBoughtM2: 3600, wastePct: 8.1, unplaced: 0 },
      { atMs: 2000, plates: 126, areaBoughtM2: 3540, wastePct: 6.2, unplaced: 0 },
      { atMs: 3021, plates: 124, areaBoughtM2: 3511.2, wastePct: 5.092, unplaced: 0 },
    ],
  },
  canStop: true, stopRequested: false, stopped: false, ...extra,
});

await check('the run card shows the best so far, the time used of the budget, and the improvement curve', async () => {
  server.current = rich();
  await mount();
  await waitFor(() => document.querySelector('[data-testid=nest-run-card]'), 'running card');
  assert.equal(document.querySelector('[data-testid=nest-run-best]').textContent.includes('Best so far: 124 plates · 5.1% waste'), true);
  assert.ok(text().includes('0:04 of 5:00 used'));
  const spark = document.querySelector('[data-testid=nest-run-spark]');
  assert.ok(spark, 'a sparkline');
  assert.equal(spark.querySelectorAll('path').length, 1, 'one path, no per-point elements');
  assert.match(spark.getAttribute('aria-label'), /Waste fell from 8\.1% to 5\.1%/);
  await unmount();
});

await check('before any layout exists the card says it is still looking, and draws no curve', async () => {
  server.current = snap('running', { progress: { done: 0, total: 10, pct: 0, best: null, curve: [] }, canStop: true });
  await mount();
  await waitFor(() => document.querySelector('[data-testid=nest-run-card]'), 'running card');
  assert.ok(document.querySelector('[data-testid=nest-run-best]').textContent.includes('Looking for the first layout'));
  assert.equal(document.querySelector('[data-testid=nest-run-spark]'), null);
  await unmount();
});

await check('Stop and use this posts the stop route, says it is stopping, and the finished proposal arrives', async () => {
  server.current = rich();
  server.onStop = () => { server.current = snap('done', { stopped: true, plan: plan() }); return rich({ stopRequested: true }); };
  calls.length = 0;
  await mount();
  await waitFor(() => find('Stop and use this'), 'the stop button');
  assert.ok(find('Cancel'), 'Cancel sits beside it');
  assert.equal(find('Stop and use this').disabled, false);
  await click(find('Stop and use this'), 'Stop');
  assert.ok(calls.some((c) => c.startsWith('POST ') && c.endsWith('/nesting/runs/current/stop')), 'the stop route');
  assert.ok(document.querySelector('[data-testid=nest-run-stopping]'), 'it says it is stopping');
  assert.equal(find('Stop and use this').disabled, true);
  await waitFor(() => text().includes('Nothing here is written down yet'), 'the proposal', 6000);
  server.onStop = undefined;
  await unmount();
});

await check('Stop is off when the run cannot stop yet; Cancel deletes the run and the card goes', async () => {
  server.current = rich({ canStop: false });
  calls.length = 0;
  await mount();
  await waitFor(() => find('Stop and use this'), 'the stop button');
  assert.equal(find('Stop and use this').disabled, true);
  await click(find('Cancel'), 'Cancel');
  assert.ok(calls.some((c) => c.startsWith('DELETE ') && c.endsWith('/runs/current')));
  await waitFor(() => !document.querySelector('[data-testid=nest-run-card]'), 'the card gone');
  await unmount();
});

const resumedRun = (extra = {}) => rich({
  resumed: true, canStop: false,
  progress: { done: 3, total: 10, pct: 30, resumes: 2, checkpointAt: '2026-10-10T10:00:00Z', checkpointAgeMs: 40000,
    best: { plates: 124, areaBoughtM2: 3511.2, wastePct: 5.092, unplaced: 0, atMs: 3021, scope: 'rest' }, curve: [],
    keepAwake: { on: true, configured: true, runs: 1, everyMs: 240000, pings: 5, failures: 1, lastPingAt: new Date().toISOString(), lastOkAt: new Date(Date.now() - 120000).toISOString(), lastStatus: 200, lastError: 'timeout' } },
  ...extra,
});

await check('the effort picker reads 5 min / 10 min / 20 min / 1 hour, with the long-run line; 1 hour sends long', async () => {
  server.current = { status: 'none' };
  await mount();
  await waitFor(() => document.querySelector('button[aria-label=Effort]'), 'the chip');
  await click(document.querySelector('button[aria-label=Effort]'), 'chip');
  await waitFor(() => document.querySelector('[data-testid=effort-long-line]'), 'menu');
  const items = [...document.querySelectorAll('[role=menuitem]')].map((m) => m.textContent.trim().replace(/Up to.*/, ''));
  assert.deepEqual(items, ['5 min', '10 min', '20 min', '1 hour']);
  assert.equal(document.querySelector('[data-testid=effort-long-line]').textContent, 'A long run keeps going on the server if you close this page. Come back later for the result.');
  await click([...document.querySelectorAll('[role=menuitem]')].find((m) => m.textContent.startsWith('1 hour')), '1 hour');
  assert.ok(document.querySelector('button[aria-label=Effort]').textContent.includes('1 hour'));
  server.start = snap('running');
  await click(find('Nest everything'), 'nest');
  await waitFor(() => server.lastBody, 'the start');
  assert.equal(server.lastBody.effort, 'long');
  server.start = undefined;
  await unmount();
});

await check('a picked-up run says so with its count and checkpoint age; Stop still works though it is not live; details only when present', async () => {
  server.current = resumedRun();
  server.onStop = () => { server.current = snap('done', { stopped: true, plan: plan() }); return resumedRun({ stopRequested: true }); };
  calls.length = 0;
  await mount();
  await waitFor(() => document.querySelector('[data-testid=nest-run-resumed]'), 'the resumed line');
  assert.equal(document.querySelector('[data-testid=nest-run-resumed]').textContent, 'Picked up again after an interruption (2 times)');
  assert.equal(document.querySelector('[data-testid=nest-run-checkpoint]').textContent, 'Last saved 40 s ago');
  assert.ok(find('Stop and use this'), 'not hidden');
  assert.equal(find('Stop and use this').disabled, false, 'works on a run that is not live');
  assert.equal(document.querySelector('[data-testid=nest-run-details]'), null, 'details are folded away');
  await click(document.querySelector('[data-testid=nest-run-details-toggle]'), 'Details');
  const d = document.querySelector('[data-testid=nest-run-details]').textContent;
  assert.ok(d.includes('Keeping the server awake: on') && d.includes('Last answered 2 min ago') && d.includes('1 failed ping: timeout'));
  await click(find('Stop and use this'), 'Stop');
  assert.ok(calls.some((c) => c.startsWith('POST ') && c.endsWith('/runs/current/stop')));
  server.onStop = undefined;
  await unmount();
});

await check('a run never picked up shows no resumed line, no checkpoint line and no details', async () => {
  server.current = rich();
  await mount();
  await waitFor(() => document.querySelector('[data-testid=nest-run-card]'), 'card');
  assert.equal(document.querySelector('[data-testid=nest-run-resumed]'), null);
  assert.equal(document.querySelector('[data-testid=nest-run-checkpoint]'), null);
  assert.equal(document.querySelector('[data-testid=nest-run-details-toggle]'), null);
  await unmount();
});

await check('a failed run shows the backend reason and Start again starts a new run', async () => {
  server.current = snap('failed', { phase: 'failed', error: { code: 'DEMAND_CHANGED', message: 'The line changed while the run slept, so its checkpoint no longer fits. Start it again.', problems: null } });
  server.start = snap('running');
  server.lastBody = null;
  await mount();
  await waitFor(() => document.querySelector('[data-testid=nest-run-failed]'), 'the failed note');
  assert.ok(document.querySelector('[data-testid=nest-run-failed]').textContent.includes('The line changed while the run slept'));
  await click(find('Start again'), 'Start again');
  await waitFor(() => server.lastBody, 'a new run');
  server.start = undefined;
  await unmount();
});

await check('a finished run from the offline runner says where it was nested, and is otherwise a normal proposal', async () => {
  server.current = snap('done', { startedBy: 'offline runner (KEPL-LAPTOP)', finishedAt: '2026-10-10T16:40:00Z', restored: true, plan: plan() });
  await mount();
  await waitFor(() => document.querySelector('[data-testid=nest-run-done]'), 'the done note');
  assert.match(document.querySelector('[data-testid=nest-run-offline]').textContent, /^Nested on a computer, 10 Oct 2026/);
  assert.ok(text().includes('Nothing here is written down yet'));
  assert.ok(find('Accept this layout'));
  await unmount();
});

await check('source: polling, running card with LinearProgress, log box, interrupted message, Discard, no AuthContext in the panel', async () => {
  const panel = await readFile('src/apps/cf_erp/components/Nesting/NestingPanel.tsx', 'utf8');
  const card = await readFile('src/apps/cf_erp/components/Nesting/NestRunCard.tsx', 'utf8');
  const lib = await readFile('src/apps/cf_erp/lib/nesting.ts', 'utf8');
  assert.match(panel, /POLL_MS = 1500/);
  assert.match(panel, /getNestRun\(orderId, lineId, \{ plan: true \}\)/);
  assert.match(panel, /startNestRun\(/);
  assert.match(panel, /discardNestRun\(/);
  assert.ok(!/\/plan`/.test(panel), 'the panel no longer awaits /plan');
  assert.match(panel, /RUN_INTERRUPTED/);
  assert.match(panel, /clearTimeout\(timer\)/, 'polling is cleaned up');
  assert.match(card, /LinearProgress/);
  assert.match(card, /variant="determinate"/);
  assert.match(card, /nest-run-log/);
  assert.match(card, /scrollTop = el\.scrollHeight/);
  assert.match(lib, /The run was interrupted \(the server restarted\) — start it again\./);
  assert.ok(!/AuthContext/.test(panel + card));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
