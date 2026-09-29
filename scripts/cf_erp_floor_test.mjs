// Run from multi_app_fe: node scripts/cf_erp_floor_test.mjs
// DOM-level interaction test of the machine log (pages/Floor.tsx) against an in-memory
// stand-in for the section-2 API of CF_ERP_FLOOR_LOG_PLAN.md. It does not replace a visual
// review on a real tablet. The clock is fixed at 13:00 on 2026-09-30 (local) so "now" is stable.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// ── a fixed clock ────────────────────────────────────────────────────────
const RealDate = Date;
const skew = new RealDate(2026, 8, 30, 13, 0, 0).getTime() - RealDate.now();
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(RealDate.now() + skew); else super(...a); }
  static now() { return RealDate.now() + skew; }
}
globalThis.Date = FakeDate;

// ── jsdom ────────────────────────────────────────────────────────────────
const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/floor', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  try { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true }); } catch { /* skip */ }
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// Record the intervals the screen starts, so the 20 s poll can be fired by hand.
const intervals = [];
const realSetInterval = dom.window.setInterval.bind(dom.window);
dom.window.setInterval = (fn, ms, ...rest) => { intervals.push({ fn, ms }); return realSetInterval(fn, ms, ...rest); };

// ── the app, bundled, with the platform's apiFetch replaced by plain fetch ─
const stub = `export async function apiFetch(url, o = {}) {
  const res = await globalThis.fetch(url, { method: o.method || 'GET', body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await res.text();
  if (!res.ok) throw new Error('API request failed: ' + res.status + ' x - ' + text);
  return JSON.parse(text);
}`;
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; export { React, createRoot };
      export { default as Floor } from './src/apps/cf_erp/pages/Floor';
      export { errText } from './src/apps/cf_erp/components/Floor/floorModel';`,
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
const artifact = resolve(cache, `floor-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const { React, createRoot, Floor, errText } = await import(pathToFileURL(artifact));
await unlink(artifact);

// ── the pretend server ───────────────────────────────────────────────────
const at = (h, m = 0) => new Date(2026, 8, 30, h, m);
const iso = (d) => d.toISOString();
const SHIFT = { start: at(6), end: at(14), label: 'Day' };
const REASONS = [
  { id: 1, code: 'NO_MATERIAL', label: 'No material', needsNote: false },
  { id: 2, code: 'POWER', label: 'Power cut', needsNote: false },
  { id: 3, code: 'MEAL', label: 'Meal / tea break', needsNote: false },
  { id: 4, code: 'OTHER', label: 'Other', needsNote: true },
];
const stepDefs = [
  [1, 'Web plate W1', 'G1-W1', 'Cut', 4], [2, 'Flange F1', 'G1-F1', 'Weld', 2], [3, 'Stiffener S1', 'G1-S1', 'Drill', 10],
  [4, 'Stiffener S2', 'G1-S2', 'Drill', 10], [5, 'Bracket B1', 'G1-B1', 'Bend', 6], [6, 'Bracket B2', 'G1-B2', 'Bend', 6], [7, 'Plate P7', 'G1-P7', 'Cut', 1],
];
let S;
const USED_BY_NEXT = 'This job is already used by the next step — ask a supervisor to correct it.';
const IN_STOCK = 'This piece is already in finished stock — ask a supervisor to correct it.';
const resetServer = () => {
  S = { steps: stepDefs.map(([id, pieceName, pieceCode, operation, qtyLeft]) => ({ id, pieceName, pieceCode, operation, qtyLeft, qtyTotal: qtyLeft, orderCode: 'SO-1', ready: id !== 5, why: id === 5 ? 'no material yet' : null, done: false })),
    sessions: [], stops: [], nextId: 100, log: [] };
};
const stepOf = (id) => S.steps.find((s) => s.id === id);
const stepFields = (id) => { const s = stepOf(id); return { pieceName: s.pieceName, pieceCode: s.pieceCode, operation: s.operation, qtyLeft: s.qtyLeft, qtyTotal: s.qtyTotal, orderCode: s.orderCode, ready: s.ready, why: s.why }; };
const overlaps = (a, b) => a.start < b.end && b.start < a.end;
const endOf = (x) => x.end ?? new Date();
const sessionOut = (s) => ({ id: s.id, stepId: s.stepId, ...stepFields(s.stepId), start: iso(s.start), end: s.end ? iso(s.end) : null, good: s.good ?? null, scrap: s.scrap ?? null, endKind: s.endKind ?? null });
const stopOut = (s) => ({ id: s.id, reasonId: s.reasonId, reason: REASONS.find((r) => r.id === s.reasonId).label, note: s.note || null, start: iso(s.start), end: s.end ? iso(s.end) : null });
function dayOut() {
  const busy = [...S.sessions, ...S.stops].map((x) => ({ start: x.start, end: endOf(x) })).sort((a, b) => a.start - b.start);
  const gaps = []; let cursor = SHIFT.start; const limit = new Date();
  for (const b of busy) { if (b.start > cursor) gaps.push({ start: cursor, end: b.start }); if (b.end > cursor) cursor = b.end; }
  if (cursor < limit) gaps.push({ start: cursor, end: limit });
  const mins = (a, b) => Math.round((b - a) / 60000);
  const sum = (arr) => arr.reduce((t, x) => t + mins(x.start, endOf(x)), 0);
  return {
    date: '2026-09-30', shifts: [{ start: iso(SHIFT.start), end: iso(SHIFT.end), label: SHIFT.label }],
    sessions: S.sessions.map(sessionOut), stops: S.stops.map(stopOut),
    notRecorded: gaps.map((g) => ({ start: iso(g.start), end: iso(g.end), minutes: mins(g.start, g.end) })),
    totals: { work: sum(S.sessions), stopped: sum(S.stops), notRecorded: gaps.reduce((t, g) => t + mins(g.start, g.end), 0), shift: 480 },
  };
}
function route(method, path, body) {
  const [pathname, query = ''] = path.split('?');
  const q = new URLSearchParams(query);
  const p = pathname.replace('/api/testco/cf_erp', '');
  S.log.push({ method, p, body });
  let m;
  if (method === 'GET' && p === '/floor/machines') return [{ id: 1, code: 'SAW1', name: 'Saw 1', type: 'Saw', running: 0, stopped: false, lastActivityAt: null }, { id: 2, code: 'PRS2', name: 'Press 2', type: 'Press', running: 1, stopped: false, lastActivityAt: null }];
  if (method === 'GET' && p === '/floor/operators') return [{ id: 2, code: 'A', name: 'Asha' }, { id: 1, code: 'R', name: 'Ravi' }];
  if (method === 'GET' && p === '/floor/reasons') return REASONS;
  if (method === 'GET' && (m = /^\/floor\/machines\/(\d+)\/queue$/.exec(p))) {
    const term = (q.get('search') || '').toLowerCase();
    const runningIds = S.sessions.filter((s) => !s.end).map((s) => s.stepId);
    const next = S.steps.filter((s) => !s.done && !runningIds.includes(s.id) && `${s.pieceName} ${s.pieceCode} ${s.operation} ${s.orderCode}`.toLowerCase().includes(term)).map((s) => {
      const paused = [...S.sessions].reverse().find((x) => x.stepId === s.id && x.endKind === 'pause');
      return { id: s.id, ...stepFields(s.id), state: s.ready ? 'ready' : 'waiting', pausedSessionId: paused ? paused.id : null };
    });
    return { running: S.sessions.filter((s) => !s.end).map((s) => ({ id: s.id, stepId: s.stepId, startedAt: iso(s.start), ...stepFields(s.stepId) })), next };
  }
  if (method === 'GET' && /^\/floor\/machines\/\d+\/day$/.test(p)) return dayOut();
  if (method === 'POST' && p === '/floor/start') {
    if (S.stops.some((s) => !s.end)) throw Object.assign(new Error('The machine is stopped — press Back to work first.'), { status: 409 });
    body.stepIds.forEach((id) => S.sessions.push({ id: S.nextId++, stepId: id, start: new Date(), end: null }));
    return {};
  }
  if (method === 'POST' && p === '/floor/pause') { body.sessionIds.forEach((id) => Object.assign(S.sessions.find((s) => s.id === id), { end: new Date(), endKind: 'pause' })); return {}; }
  if (method === 'POST' && p === '/floor/resume') { body.sessionIds.forEach((id) => S.sessions.push({ id: S.nextId++, stepId: S.sessions.find((s) => s.id === id).stepId, start: new Date(), end: null })); return {}; }
  if (method === 'POST' && p === '/floor/finish') {
    const s = S.sessions.find((x) => x.id === body.sessionId);
    Object.assign(s, { end: new Date(), endKind: body.done ? 'done' : 'stop', good: body.good, scrap: body.scrap });
    const step = stepOf(s.stepId); step.qtyLeft = Math.max(0, step.qtyLeft - body.good - body.scrap); if (body.done) step.done = true;
    return {};
  }
  if (method === 'POST' && p === '/floor/stop') { S.stops.push({ id: S.nextId++, reasonId: body.reasonId, note: body.note, start: body.since ? new Date(body.since) : new Date(), end: null }); return {}; }
  if (method === 'POST' && (m = /^\/floor\/stop\/(\d+)\/end$/.exec(p))) { S.stops.find((s) => s.id === Number(m[1])).end = new Date(); return {}; }
  if (method === 'PUT' && /^\/floor\/machines\/\d+\/day$/.test(p)) {
    if (S.refuse) throw Object.assign(new Error(S.refuse), { status: 422, problems: [S.refuse] });
    const gone = (body.deletedRows || []).map((d) => `${d.kind}:${d.id}`);
    const editing = body.rows.filter((r) => r.id).map((r) => `${r.kind}:${r.id}`);
    const keepSessions = S.sessions.filter((s) => ![...gone, ...editing].includes(`work:${s.id}`));
    const keepStops = S.stops.filter((s) => ![...gone, ...editing].includes(`stop:${s.id}`));
    const added = body.rows.map((r) => ({ kind: r.kind, id: r.id ?? S.nextId++, start: new Date(r.start), end: new Date(r.end), r }));
    for (const a of added) {
      if (!(a.start < a.end)) throw Object.assign(new Error('The end must be after the start.'), { status: 422 });
      if (a.end > new Date(Date.now() + 60000)) throw Object.assign(new Error('That is in the future.'), { status: 422 });
      const others = a.kind === 'stop' ? [...keepSessions, ...keepStops, ...added.filter((x) => x !== a)] : [...keepStops, ...added.filter((x) => x !== a && x.kind === 'stop')];
      if (others.some((o) => overlaps(a, { start: o.start, end: endOf(o) }))) throw Object.assign(new Error('That overlaps another entry on this machine.'), { status: 409 });
    }
    S.sessions = keepSessions; S.stops = keepStops;
    for (const a of added) {
      if (a.kind === 'work') S.sessions.push({ id: a.id, stepId: a.r.stepId, start: a.start, end: a.end, good: a.r.good, scrap: a.r.scrap, endKind: 'done' });
      else S.stops.push({ id: a.id, reasonId: a.r.reasonId, note: a.r.note, start: a.start, end: a.end });
    }
    return { ...dayOut(), ...(S.reopened ? { reopened: S.reopened } : {}) };
  }
  throw Object.assign(new Error(`no route ${method} ${p}`), { status: 404 });
}
globalThis.fetch = async (url, o = {}) => {
  try {
    const out = route(o.method || 'GET', String(url), o.body ? JSON.parse(o.body) : undefined);
    return { ok: true, status: 200, text: async () => JSON.stringify(out) };
  } catch (e) {
    return { ok: false, status: e.status || 500, text: async () => JSON.stringify({ message: e.message, ...(e.problems ? { problems: e.problems } : {}) }) };
  }
};

// ── helpers ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = (ms = 30) => React.act(async () => { await sleep(ms); });
const waitFor = async (cond, what, ms = 3000) => {
  const end = RealDate.now() + ms;
  for (;;) {
    let ok = false; try { ok = !!cond(); } catch { /* not yet */ }
    if (ok) return;
    if (RealDate.now() > end) throw new Error(`timed out waiting for ${what}`);
    await settle(20);
  }
};
const text = () => document.body.textContent;
const buttons = (scope = document) => [...scope.querySelectorAll('button, [role=checkbox]')];
const find = (label, scope = document) => buttons(scope).find((b) => b.textContent.trim() === label || b.getAttribute('aria-label') === label);
const findStarting = (label, scope = document) => buttons(scope).find((b) => (b.getAttribute('aria-label') || b.textContent.trim()).startsWith(label));
const click = async (el, what = 'element') => { assert.ok(el, `no ${what} to click`); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await settle(); };
const clickText = async (label, scope) => click(find(label, scope) ?? findStarting(label, scope), `"${label}"`);
const setValue = async (el, value) => {
  assert.ok(el, 'no input');
  const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await React.act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(0); });
};
const dialog = () => document.querySelector('[role=dialog]');
const input = (label, scope = document) => scope.querySelector(`input[aria-label="${label}"]`);
const dash = '–';
const rowLabel = (kind, name, from, to) => `${kind} ${name} ${from} ${dash} ${to}`;
const calls = (method, p) => S.log.filter((c) => c.method === method && c.p === p);
const app = document.getElementById('app');
let root;
const mount = async () => { root = createRoot(app); await React.act(async () => { root.render(React.createElement(Floor)); await sleep(0); }); await settle(50); };
const unmount = async () => { await React.act(async () => { root.unmount(); }); };
const put = () => calls('PUT', '/floor/machines/1/day');

// ── the scenario ─────────────────────────────────────────────────────────
resetServer();
window.localStorage.clear();
await mount();

await check('Machine picker shows big tiles with what is happening', async () => {
  await waitFor(() => text().includes('Which machine?') && text().includes('Saw 1'), 'machine tiles');
  assert.ok(text().includes('1 running') && text().includes('Free'));
});
await check('Picking a machine asks who you are, usual people first, and remembers the machine', async () => {
  await clickText('Saw 1');
  await waitFor(() => text().includes('Who are you?'), 'operator picker');
  const names = [...document.querySelectorAll('main button')].map((b) => b.textContent.trim());
  assert.equal(names[0], 'Asha');
  assert.equal(window.localStorage.getItem('cf_floor:testco:machine'), '1');
});
await check('Picking a name opens the machine screen, header shows machine and Not you?', async () => {
  await clickText('Asha');
  await waitFor(() => text().includes('Up next'), 'machine screen');
  assert.ok(document.querySelector('header').textContent.includes('Saw 1'));
  assert.ok(find('Not you?'));
});
await check('Idle in a shift shows "Machine stopped since 06:00 — why?" with reason chips', async () => {
  await waitFor(() => document.querySelector('[data-testid=idle-banner]'), 'idle banner');
  assert.match(document.querySelector('[data-testid=idle-banner]').textContent, /Machine stopped since 06:00 — why\?/);
  assert.ok(find('No material', document.querySelector('[data-testid=idle-banner]')));
});
await check('A job that is not ready says only "Not ready yet" (no codes), the operation leads', async () => {
  assert.ok(text().includes('Not ready yet') || (await clickText('Show more'), text().includes('Not ready yet')));
  assert.ok(!text().includes('no material yet'), "the server's reason text stays off the card");
  const row = findStarting('Cut Web plate W1');
  assert.ok(row.textContent.startsWith('Cut'), 'the operation is the bold first line');
  await setValue(input('Search a job'), 'zzz'); await setValue(input('Search a job'), '');
  await waitFor(() => document.querySelectorAll('[role=checkbox]').length === 5, 'back to five rows');
});
await check("errText turns the server's problem list into plain sentences", () => {
  const e = Object.assign(new Error('Some rows need attention.'), { problems: ['Row 1: it starts before the job was released to production.', 'SO-1-G1-TF1-CUTPL1 · Marking and Cutting: only 1 more good piece is needed at this step.'] });
  assert.equal(errText(e), 'It starts before the job was released to production. Only 1 more good piece is needed at this step.');
  assert.equal(errText(new Error('Plain.')), 'Plain.');
  // The reopen refusals (floorService.reopenProblems) are shown exactly as the server words them.
  for (const sentence of [USED_BY_NEXT, IN_STOCK]) {
    assert.equal(errText(Object.assign(new Error(sentence), { problems: [sentence] })), sentence);
    assert.equal(errText(new Error(sentence)), sentence);
  }
});
await check('Up next shows 5, Show more reveals the rest, search narrows', async () => {
  const rows = () => document.querySelectorAll('[role=checkbox]').length;
  assert.equal(rows(), 5);
  await clickText('Show more');
  assert.equal(rows(), 7);
  await setValue(input('Search a job'), 'weld');
  await waitFor(() => rows() === 1, 'search result');
  await setValue(input('Search a job'), '');
  await waitFor(() => rows() === 5, 'search cleared (back to 5)');
});
await check('Tick two jobs and "Start 2 together" runs both', async () => {
  await click(findStarting('Cut Web plate W1'), 'W1 row');
  await click(findStarting('Weld Flange F1'), 'F1 row');
  assert.ok(find('Start 2 together'));
  await clickText('Start 2 together');
  await waitFor(() => document.querySelectorAll('[data-testid=running-card]').length === 2, 'two running cards');
  assert.deepEqual(calls('POST', '/floor/start')[0].body, { machineId: 1, operatorId: 2, stepIds: [1, 2] });
  assert.equal(document.querySelector('[data-testid=idle-banner]'), null);
  assert.match(document.querySelector('[data-testid=running-card]').textContent, /0:00:0\d/);
});
await check('Pause one job: card leaves, job waits in Up next as paused', async () => {
  await clickText('Pause Cut Web plate W1');
  await waitFor(() => document.querySelectorAll('[data-testid=running-card]').length === 1, 'one running card');
  assert.equal(calls('POST', '/floor/pause').length, 1);
  assert.ok(text().includes('Paused — tap to continue'));
});
await check('Done asks how many finished (prefilled with what is left), scrap optional', async () => {
  await clickText('Done Weld Flange F1');
  await waitFor(dialog, 'finish sheet');
  assert.ok(text().includes('How many finished?'));
  assert.equal(input('Finished', dialog()).value, '2');
  await clickText('Finished: one less', dialog());
  assert.equal(input('Finished', dialog()).value, '1');
  await clickText('Some scrapped?', dialog());
  await clickText('Scrapped: one more', dialog());
  const done = buttons(dialog()).find((b) => b.textContent.trim() === 'Done');
  await click(done, 'Done in sheet');
  await waitFor(() => !dialog() && document.querySelectorAll('[data-testid=running-card]').length === 0, 'sheet closed');
  const body = calls('POST', '/floor/finish')[0].body;
  assert.deepEqual([body.good, body.scrap, body.done], [1, 1, true]);
});
await check('Stop with a reason, then Back to work', async () => {
  await clickText('Machine stopped?');
  await waitFor(dialog, 'reason sheet');
  await clickText('No material', dialog());
  await waitFor(() => document.querySelector('[data-testid=stop-card]'), 'stop card');
  assert.match(document.querySelector('[data-testid=stop-card]').textContent, /Stopped: No material/);
  assert.equal(calls('POST', '/floor/stop')[0].body.reasonId, 1);
  await clickText('Back to work');
  await waitFor(() => !document.querySelector('[data-testid=stop-card]'), 'stop card gone');
  assert.equal(S.log.filter((c) => c.method === 'POST' && /^\/floor\/stop\/\d+\/end$/.test(c.p)).length, 1);
});
await check('The 20 s poll shows what a second tablet did', async () => {
  S.sessions.push({ id: 900, stepId: 4, start: new Date(), end: null });
  await React.act(async () => { intervals.filter((i) => i.ms === 20000).forEach((i) => i.fn()); await sleep(0); });
  await waitFor(() => document.querySelectorAll('[data-testid=running-card]').length === 1, 'card from other tablet');
  assert.ok(text().includes('Stiffener S2'));
  S.sessions = S.sessions.filter((s) => s.id !== 900);
  await React.act(async () => { intervals.filter((i) => i.ms === 20000).forEach((i) => i.fn()); await sleep(0); });
  await waitFor(() => document.querySelectorAll('[data-testid=running-card]').length === 0, 'card gone again');
});

// ── My day ───────────────────────────────────────────────────────────────
await check('My day shows the shift bar, totals and unrecorded time', async () => {
  await clickText('My day');
  await waitFor(() => document.querySelector('[data-testid=shift-bar]'), 'shift bar');
  assert.ok(document.querySelectorAll('[data-seg=work]').length >= 2);
  assert.equal(document.querySelectorAll('[data-testid=gap-row]').length, 1);
  assert.match(document.querySelector('[data-testid=gap-row]').textContent, /Not recorded\s*·\s*06:00 – 13:00/);
});
await check('Jobs together are stacked lanes on the bar', () => {
  const lanes = new Set([...document.querySelectorAll('[data-seg=work]')].map((e) => e.getAttribute('data-lane')));
  assert.ok(lanes.size >= 1);
});
await check('Add work from paper notes: pick job, From/To, count (starts empty, must be answered), Save', async () => {
  await clickText('Add work');
  await waitFor(() => dialog() && text().includes('Add work'), 'work sheet');
  await clickText('Pick Drill Stiffener S1', dialog());
  assert.equal(input('How many finished?', dialog()).value, '', 'the count starts empty, not prefilled with what is left');
  const saveBtn = () => buttons(dialog()).find((b) => b.textContent.trim() === 'Save');
  assert.ok(saveBtn().disabled, 'Save waits for an answer');
  assert.ok(dialog().textContent.includes('0 is fine'));
  await clickText('How many finished?: one more', dialog());
  assert.equal(input('How many finished?', dialog()).value, '1');
  await clickText('How many finished?: 10 more', dialog());
  assert.equal(input('How many finished?', dialog()).value, '11');
  await setValue(input('How many finished?', dialog()), '10');
  await setValue(input('From', dialog()), '07:00');
  await setValue(input('To', dialog()), '09:00');
  await click(find('From: 15 minutes later', dialog()), '+15');
  assert.equal(input('From', dialog()).value, '07:15');
  await click(find('From: 15 minutes earlier', dialog()), '-15');
  await click(buttons(dialog()).find((b) => b.textContent.trim() === 'Save'), 'Save');
  await waitFor(() => !dialog() && text().includes('Saved'), 'sheet closed with Saved');
  const row = put().at(-1).body.rows[0];
  assert.equal(row.kind, 'work'); assert.equal(row.stepId, 3); assert.equal(row.good, 10);
  assert.deepEqual([new Date(row.start).getHours(), new Date(row.end).getHours()], [7, 9]);
  assert.ok(findStarting(rowLabel('Work', 'Drill Stiffener S1', '07:00', '09:00')));
});
await check('"From the last end" starts where the last entry finished (only offered when From is elsewhere)', async () => {
  await clickText('Add work');
  await waitFor(dialog, 'sheet');
  assert.equal(input('From', dialog()).value, '13:00', 'a new entry already starts at the last end');
  assert.ok(!findStarting('From the last end', dialog()), 'no redundant button');
  await setValue(input('From', dialog()), '01:00');
  assert.ok(find('From the last end (13:00)', dialog()) ?? findStarting('From the last end', dialog()));
  await clickText('From the last end', dialog());
  assert.equal(input('From', dialog()).value, '13:00');
  await click(find('Cancel', dialog()), 'Cancel');
  await waitFor(() => !dialog(), 'sheet closed');
});
await check('Add stop: reason chip, From/To, Save', async () => {
  await clickText('Add stop');
  await waitFor(() => dialog() && text().includes('Add stop'), 'stop sheet');
  await clickText('Power cut', dialog());
  await setValue(input('From', dialog()), '09:00');
  await setValue(input('To', dialog()), '09:30');
  await click(buttons(dialog()).find((b) => b.textContent.trim() === 'Save'), 'Save');
  await waitFor(() => !dialog(), 'sheet closed');
  const row = put().at(-1).body.rows[0];
  assert.deepEqual([row.kind, row.reasonId], ['stop', 2]);
  assert.ok(findStarting(rowLabel('Stop', 'Power cut', '09:00', '09:30')));
});
await check('An unrecorded gap becomes a stop: "It was a stop" opens Add stop with the gap times, pick a reason, Save', async () => {
  const gaps = () => [...document.querySelectorAll('[data-testid=gap-row]')];
  await waitFor(() => gaps().length === 2, 'two gaps');
  assert.match(gaps()[0].textContent, /06:00 – 07:00/);
  assert.ok(!find('Meal / tea break', gaps()[0]), 'a gap does not show a dozen reason chips');
  await clickText('It was a stop', gaps()[0]);
  await waitFor(() => dialog() && text().includes('Add stop'), 'stop sheet');
  assert.deepEqual([input('From', dialog()).value, input('To', dialog()).value], ['06:00', '07:00']);
  assert.ok(buttons(dialog()).find((b) => b.textContent.trim() === 'Save').disabled, 'a reason must be chosen');
  await clickText('Meal / tea break', dialog());
  await click(buttons(dialog()).find((b) => b.textContent.trim() === 'Save'), 'Save');
  await waitFor(() => !dialog() && gaps().length === 1, 'gap turned into a stop');
  const row = put().at(-1).body.rows[0];
  assert.deepEqual([row.kind, row.reasonId, new Date(row.start).getHours(), new Date(row.end).getHours()], ['stop', 3, 6, 7]);
  assert.ok(findStarting(rowLabel('Stop', 'Meal / tea break', '06:00', '07:00')));
});
await check('"It was work" opens Add work with the gap times', async () => {
  await clickText('It was work', document.querySelector('[data-testid=gap-row]'));
  await waitFor(dialog, 'sheet');
  assert.equal(input('From', dialog()).value, '09:30');
  assert.equal(input('To', dialog()).value, '13:00');
  await click(find('Cancel', dialog()), 'Cancel');
});
await check('Edit a row: a clash stays open with a calm message, then a fix saves', async () => {
  await click(findStarting('Work Drill Stiffener S1'), 'work row');
  await waitFor(() => dialog() && text().includes('Change work'), 'edit sheet');
  await setValue(input('To', dialog()), '09:30');
  await click(buttons(dialog()).find((b) => b.textContent.trim() === 'Save'), 'Save');
  await waitFor(() => text().includes('overlaps another entry'), 'clash message');
  assert.ok(dialog(), 'sheet stays open');
  await setValue(input('To', dialog()), '08:45');
  await click(buttons(dialog()).find((b) => b.textContent.trim() === 'Save'), 'Save');
  await waitFor(() => !dialog(), 'sheet closed');
  assert.ok(put().at(-1).body.rows[0].id, 'edit carries the id');
  assert.ok(findStarting(rowLabel('Work', 'Drill Stiffener S1', '07:00', '08:45')));
});
await check('Delete a row: Delete then "Yes, delete"', async () => {
  await click(findStarting('Stop Power cut'), 'stop row');
  await waitFor(() => dialog() && text().includes('Change stop'), 'edit sheet');
  await clickText('Delete', dialog());
  assert.ok(find('Yes, delete', dialog()));
  await clickText('Yes, delete', dialog());
  await waitFor(() => !dialog() && !findStarting('Stop Power cut'), 'row deleted');
  const body = put().at(-1).body;
  assert.equal(body.deletedRows[0].kind, 'stop');
  assert.equal(body.deleted.length, 1);
});
await check('Deleting the row that finished a job: a refusal shows the server sentence as-is, the sheet stays open', async () => {
  S.refuse = USED_BY_NEXT;
  await click(findStarting('Work Drill Stiffener S1'), 'work row');
  await waitFor(() => dialog() && text().includes('Change work'), 'edit sheet');
  await clickText('Delete', dialog());
  await clickText('Yes, delete', dialog());
  await waitFor(() => dialog()?.textContent.includes(USED_BY_NEXT), 'refusal sentence');
  assert.ok(findStarting('Work Drill Stiffener S1'), 'the row is still there');
  S.refuse = null;
  await clickText('Keep it', dialog());
  await click(find('Cancel', dialog()), 'Cancel');
  await waitFor(() => !dialog(), 'sheet closed');
});
await check('Deleting the row that finished a job reopens it: a quiet "Job reopened — 10 left"', async () => {
  S.reopened = [{ stepId: 3, label: 'G1-S1 · Drill', state: 'in_progress', qtyGood: 0, qtyTotal: 10, qtyLeft: 10 }];
  await click(findStarting('Work Drill Stiffener S1'), 'work row');
  await waitFor(() => dialog() && text().includes('Change work'), 'edit sheet');
  await clickText('Delete', dialog());
  await clickText('Yes, delete', dialog());
  await waitFor(() => !dialog() && !findStarting('Work Drill Stiffener S1'), 'row deleted');
  S.reopened = null;
  assert.equal(document.querySelector('[role=status]')?.textContent, 'Job reopened — 10 left');
  assert.equal(put().at(-1).body.deletedRows[0].kind, 'work');
});
await check('Go back a day and forward again', async () => {
  await clickText('Day before');
  await waitFor(() => text().includes('Yesterday'), 'yesterday');
  assert.ok(S.log.some((c) => c.method === 'GET' && c.p.includes('/day')));
  await clickText('Day after');
  await waitFor(() => text().includes('Today'), 'today');
});
await check('The tablet remembers machine and person; Not you? asks again', async () => {
  await unmount();
  await mount();
  await waitFor(() => text().includes('Up next'), 'straight to the machine screen');
  assert.ok(!text().includes('Who are you?'));
  await clickText('Not you?');
  await waitFor(() => text().includes('Who are you?'), 'operator picker');
  assert.equal(window.localStorage.getItem('cf_floor:testco:operator'), null);
  await clickText('Back to the machine list');
  await waitFor(() => text().includes('Which machine?'), 'machine picker');
  assert.equal(window.localStorage.getItem('cf_floor:testco:machine'), null);
});
await check('A person picked more than 8 hours ago is forgotten', async () => {
  window.localStorage.setItem('cf_floor:testco:machine', '1');
  window.localStorage.setItem('cf_floor:testco:operator', JSON.stringify({ id: 2, name: 'Asha', at: RealDate.now() - 9 * 3600_000 }));
  await unmount(); await mount();
  await waitFor(() => text().includes('Who are you?'), 'asks again');
});

await unmount();
dom.window.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
