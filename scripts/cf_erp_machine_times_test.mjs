// Run from multi_app_fe: node scripts/cf_erp_machine_times_test.mjs
// CF_ERP machine times (§58 — a machine's own chart counts), rendered in jsdom with a mocked API:
//   · the time dialog's preview opens on the STANDARD (machine type), its picker marks machines with
//     their own chart, and a picked machine is shown side by side with the standard;
//   · a planner card's Machines: every machine of the type with what the work would take there,
//     "own chart" marked, old → new minutes / weeks / earliest ship week on a move, an unavailable
//     machine blocked with the server's sentence, the save and a refusal;
//   · a machine's Charts tab says how many planned steps follow its chart, and "go back to the
//     type's chart" shows the dry run.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/plan', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  try { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true }); } catch { /* skip */ }
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = (q) => ({ matches: /min-width/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
globalThis.matchMedia = dom.window.matchMedia;
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
globalThis.ResizeObserver = dom.window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const calls = [];
globalThis.__routes = [];
globalThis.__api = async (url, opts = {}) => {
  const path = url.replace(/^\/api\/[^/]+\/cf_erp/, '');
  const call = { method: opts.method ?? 'GET', path, body: opts.body };
  calls.push(call);
  const handler = globalThis.__routes.find(([m, re]) => m === call.method && re.test(path));
  if (!handler) throw new Error(`API request failed: 404 Not Found - {"message":"no mock for ${call.method} ${path}"}`);
  return handler[2](call);
};
const stubs = {
  '@core/api/client': 'export async function apiFetch(url, opts) { return globalThis.__api(url, opts); }',
  '@core/contexts/AuthContext': 'export const useAuth = () => ({ user: null });',
};
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom';
      export { React, createRoot, MemoryRouter };
      export * as E from './src/apps/cf_erp/lib/planner';
      export * as C from './src/apps/cf_erp/lib/charts';
      export { PreviewPanel } from './src/apps/cf_erp/components/FormulaBuilder/PreviewPanel';
      export { UnitMachines } from './src/apps/cf_erp/components/Plan/UnitMachines';
      export { machineLine } from './src/apps/cf_erp/components/Plan/model';
      export { ChartsPanel } from './src/apps/cf_erp/components/Charts/ChartsPanel';
      export { fieldIndex } from './src/apps/cf_erp/lib/formulaBuilder';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/(api\/client|contexts\/AuthContext)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
  } }],
  alias: { '@shared/ui': resolve('src/shared/ui/storage.ts') },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error', loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `machine-times-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter, E, C } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const app = document.getElementById('app');
let root = null;
const render = async (el) => {
  if (root) await React.act(async () => { root.unmount(); });
  document.body.querySelectorAll('.MuiPopover-root, .MuiDrawer-root, .MuiModal-root').forEach((n) => n.remove());
  app.replaceChildren(); const host = document.createElement('div'); app.appendChild(host); root = createRoot(host);
  await React.act(async () => { root.render(React.createElement(MemoryRouter, null, el)); await sleep(0); });
  await React.act(async () => { await sleep(30); });
};
const settle = async (ms = 30) => React.act(async () => { await sleep(ms); });
const click = async (el) => { assert.ok(el, 'nothing to click'); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await settle(); };
const q = (id) => document.querySelector(`[data-testid="${id}"]`);
const text = (id) => q(id)?.textContent ?? '';
const refuse = (status, body) => { throw new Error(`API request failed: ${status} x - ${JSON.stringify(body)}`); };

/* ── 1. the planner engine: what a move does ─────────────────────────────────────────────────── */
const periods = E.buildPeriods('2026-10-01', 3);
const cap = (v) => Object.fromEntries(periods.map((p) => [p.key, v]));
const unit = (work) => ({
  key: 'l11', orderId: 1, lineId: 11, level: 'line', pieceId: null, code: 'SO-A/1', name: 'Girder', depth: 0, parentKey: null, groupKey: 'l11',
  isMark: true, marks: 1, tonnes: 10, work: { cut: work }, noRate: 0, done: false, progress: 0, materials: [], committedDate: null,
  stages: [{ depth: 0, steps: [{ fn: 'cut', minutes: work }] }],
});
const snapshot = () => ({
  horizon: { from: periods[0].start, to: periods[periods.length - 1].end, periods },
  settings: { minLinesPerMonth: 1, allowPartialLines: true }, targets: {},
  functions: [{ key: 'cut', name: 'CNC plasma', machines: 2, capacity: cap(1000), noShifts: false, path: [] }, { key: 'contractor', name: 'Contractors', unlimited: true }],
  orders: [{ id: 1, code: 'SO-A', customer: 'KEPL', committedDate: null, priority: 1, lines: [{ id: 11, lineNo: 1, name: 'Girder', quantity: 1, locked: true, released: true, level: 'line', levels: [{ value: 'line', label: 'Whole' }] }] }],
  units: [unit(800)], entries: {}, ranks: {},
});
const snap = snapshot();
const label = (k) => periods.find((p) => p.key === k)?.label ?? k;

await check('a slower machine: 800 → 1,400 min on the type, one week becomes two, and the earliest ship week moves a week later', () => {
  const w = E.machineWhatIf(snap, {}, 'l11', 'cut', 600);
  assert.equal(w.minutesBefore, 800);
  assert.equal(w.minutesAfter, 1400);
  assert.equal(w.weeksBefore, 1);
  assert.equal(w.weeksAfter, 2);
  assert.equal(w.earliestBefore, periods[0].key);
  assert.equal(w.earliestAfter, periods[1].key);
});
await check('a faster machine never goes below zero, and the snapshot itself is not touched', () => {
  const w = E.machineWhatIf(snap, {}, 'l11', 'cut', -5000);
  assert.equal(w.minutesAfter, 0);
  assert.equal(snap.units[0].work.cut, 800);
  assert.equal(snap.units[0].stages[0].steps[0].minutes, 800);
  assert.equal(E.unitWithChange(snap.units[0], 'cut', 400).stages[0].steps[0].minutes, 1200);
});

/* ── 2. a card's Machines ────────────────────────────────────────────────────────────────────── */
const WHY = 'SO-A-GR-01: MC-3 cannot do Cutting (CUT) on this piece: its chart Cut speed (Thickness 80 mm) has no answer — Needs machine.CUT_SPEED is above the chart.';
const machinesOf = (machineId = null) => ({
  unitKey: 'l11', released: true, sharedRow: false,
  functions: [{
    key: 'cut', name: 'CNC plasma', steps: 3, stepIds: [1, 2, 3], minutesNow: machineId === 2 ? 1400 : 800, standardMinutes: 800, machineId, mixed: false,
    machines: [
      { id: 1, code: 'MC-1', name: 'Plasma 1', ownChart: false, available: true, minutes: 800, change: machineId === 2 ? -600 : 0, reason: null, stepsHere: 0 },
      { id: 2, code: 'MC-2', name: 'Plasma 2 (old)', ownChart: true, available: true, minutes: 1400, change: machineId === 2 ? 0 : 600, reason: null, stepsHere: machineId === 2 ? 3 : 0 },
      { id: 3, code: 'MC-3', name: 'Plasma 3', ownChart: true, available: false, minutes: null, change: null, reason: WHY, stepsHere: 0 },
    ],
  }],
});
let changed = 0;
const showMachines = () => render(React.createElement(m.UnitMachines, { unit: snap.units[0], snapshot: snap, plan: {}, periodLabel: label, canEdit: true, onChanged: () => { changed += 1; } }));

globalThis.__routes = [
  ['GET', /^\/planner\/units\/l11\/machines$/, () => machinesOf(null)],
  ['PUT', /^\/planner\/units\/l11\/machine$/, (c) => ({ unitKey: 'l11', functionKey: c.body.functionKey, machineId: c.body.machineId, steps: 3, changed: 3, before: 800, after: 1400, change: 600, machines: machinesOf(c.body.machineId) })],
];
await check('the card lists every machine of the type with what the work would take there; own charts are marked', async () => {
  await showMachines();
  assert.ok(q('unit-machines-fn-cut'), 'the machine type is shown');
  assert.match(text('unit-machines-fn-cut'), /CNC plasma · 3 open steps/);
  assert.match(text('unit-machines-fn-cut'), /800 min · standard/);
  assert.equal(q('unit-machine-own-1'), null, 'MC-1 has no chart of its own');
  assert.ok(q('unit-machine-own-2'), 'MC-2 is marked own chart');
  assert.match(text('unit-machine-2'), /1,400 min · \+600 min against now/);
  assert.match(text('unit-machine-1'), /the same as now/);
  assert.equal(m.machineLine(machinesOf().functions[0].machines[1]), 'MC-2 · own chart · 1,400 min (+600 min)');
});
await check('a machine whose chart has no answer is NOT available: it says why and cannot be picked', async () => {
  assert.equal(q('unit-machine-3').dataset.available, 'no');
  assert.match(text('unit-machine-why-3'), /Not available for this card\. SO-A-GR-01: MC-3 cannot do Cutting/);
  assert.match(text('unit-machine-why-3'), /Cut speed \(Thickness 80 mm\)/);
  assert.equal(q('unit-machine-pick-3').disabled, true);
  await click(q('unit-machine-pick-3'));
  assert.equal(q('unit-machine-effect'), null, 'nothing was picked');
});
await check('picking a machine shows old → new BEFORE saving: minutes, weeks, and the earliest ship week', async () => {
  await click(q('unit-machine-pick-2'));
  assert.match(text('unit-machine-effect'), /Move to MC-2/);
  assert.match(text('unit-machine-minutes'), /CNC plasma: 800 min → 1,400 min \(\+600 min\)/);
  assert.match(text('unit-machine-weeks'), /Shortest: 1 week → 2 weeks/);
  assert.equal(text('unit-machine-earliest'), `Earliest it can ship: ${label(periods[0].key)} → ${label(periods[1].key)}`);
  assert.equal(calls.filter((c) => c.method === 'PUT').length, 0, 'nothing is saved yet');
});
await check('Save sends ONE PUT with the type and the machine, the card re-reads, and the page is told', async () => {
  await click(q('unit-machine-save'));
  const puts = calls.filter((c) => c.method === 'PUT');
  assert.equal(puts.length, 1);
  assert.deepEqual(puts[0].body, { functionKey: 'cut', machineId: 2 });
  assert.equal(changed, 1);
  assert.match(text('unit-machine-2'), /on it now/);
  assert.equal(q('unit-machine-effect'), null);
  assert.ok(q('unit-machine-clear-cut'), 'it can be taken off the machine again');
});
await check('taking it off the machine shows the way back to the standard time', async () => {
  await click(q('unit-machine-clear-cut'));
  assert.match(text('unit-machine-effect'), /Back to the standard time/);
  assert.match(text('unit-machine-minutes'), /1,400 min → 800 min \(−600 min\)/);
});
await check('a refusal from the server is shown in its own words', async () => {
  globalThis.__routes[1] = ['PUT', /^\/planner\/units\/l11\/machine$/, () => refuse(422, { message: 'MC-2 cannot take this step.', code: 'MACHINE_CANNOT', problems: [WHY.replace('MC-3', 'MC-2')] })];
  await click(q('unit-machine-save'));
  assert.match(text('unit-machines-error'), /MC-2 cannot take this step\./);
  assert.match(text('unit-machines-error'), /its chart Cut speed \(Thickness 80 mm\) has no answer/);
});
await check('a line that is not released says when a machine can be picked', async () => {
  globalThis.__routes = [['GET', /^\/planner\/units\/l11\/machines$/, () => ({ unitKey: 'l11', released: false, sharedRow: false, functions: [], note: 'A machine is picked once the line is released and has steps that have not started.' })]];
  await showMachines();
  assert.match(text('unit-machines-note'), /picked once the line is released/);
});

/* ── 3. the time dialog's preview ────────────────────────────────────────────────────────────── */
const ctx = {
  operation: { id: 1, code: 'CUT', name: 'Cutting' },
  standard: { typeId: 9, typeName: 'CNC plasma' },
  machines: [
    { id: 7, code: 'MC-1', name: 'Plasma 1', typeId: 9, typeName: 'CNC plasma', ownChart: false, values: { RATE: 60 } },
    { id: 8, code: 'MC-2', name: 'Plasma 2 (old)', typeId: 9, typeName: 'CNC plasma', ownChart: true, values: { RATE: 30 } },
  ],
  machineFields: [{ code: 'RATE', name: 'Rate', dataType: 'number', measurementType: null, unit: null, example: 60, count: 2 }],
  itemFields: [], samplePieces: [],
};
const checks = [];
const answer = (value) => ({ ok: true, problems: [], names: [], result: { value, missing: [], error: null }, inputs: [] });
globalThis.__routes = [['POST', /^\/formulas\/check$/, (c) => { checks.push(c.body); return answer(c.body.machineId === 8 ? 2 : 1); }]];
const idx = m.fieldIndex(ctx.itemFields, ctx.machineFields);
const pickMachine = async (testid) => {
  await click(document.querySelector('.MuiSelect-select'));
  const opt = document.querySelector(`[data-testid="${testid}"]`);
  await click(opt);
  await settle(400);
};
await check('the preview opens on the STANDARD: the machine type is asked, no machine', async () => {
  await render(React.createElement(m.PreviewPanel, { expression: '60 / machine.RATE', ctx, idx, which: 'work' }));
  await settle(400);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].machineTypeId, 9);
  assert.equal(checks[0].machineId ?? null, null);
  assert.equal(text('preview-minutes'), '1 min');
  assert.equal(text('preview-basis'), 'Standard (machine type CNC plasma)');
  assert.equal(q('preview-compare'), null, 'nothing to compare with yet');
});
await check('the machine picker lists the standard first and marks the machines with their own chart', async () => {
  await click(document.querySelector('.MuiSelect-select'));
  const opts = [...document.querySelectorAll('[role="option"]')];
  assert.deepEqual(opts.map((o) => o.textContent), ['Standard (machine type CNC plasma)', 'MC-1 · Plasma 1', 'MC-2 · Plasma 2 (old) · own chart']);
  assert.equal(q('preview-machine-8').dataset.own, 'yes');
  assert.equal(q('preview-machine-7').dataset.own, 'no');
  await click(q('preview-machine-8'));
  await settle(400);
});
await check('a machine with its own chart: standard and machine side by side, and they differ', async () => {
  assert.equal(text('preview-minutes'), '2 min');
  assert.equal(text('preview-basis'), 'On MC-2 (own chart)');
  assert.equal(q('preview-compare').dataset.differs, 'yes');
  assert.equal(text('preview-standard-minutes'), '1 min');
  assert.equal(text('preview-machine-minutes'), '2 min');
  assert.match(text('preview-compare'), /They differ: plans are made on the standard and follow the machine once one is picked\./);
  const last = checks.slice(-2);
  assert.ok(last.some((b) => b.machineId === 8) && last.some((b) => b.machineTypeId === 9 && b.machineId == null), 'both were asked');
});
await check('a machine without one runs at the standard, and says so', async () => {
  await pickMachine('preview-machine-7');
  assert.equal(q('preview-compare').dataset.differs, 'no');
  assert.match(text('preview-compare'), /The same as the standard\./);
  assert.equal(text('preview-basis'), 'On MC-1');
});
await check('back on the standard: one result again', async () => {
  await pickMachine('preview-machine-standard');
  assert.equal(q('preview-compare'), null);
  assert.equal(text('preview-basis'), 'Standard (machine type CNC plasma)');
});

/* ── 4. a machine's Charts tab ───────────────────────────────────────────────────────────────── */
const th = { kind: 'spec', field: 'THICKNESS', label: 'Thickness', unit: 'mm', dataType: 'number' };
const type = { type: 'classification', id: 9, name: 'CNC plasma' };
const chart = (code, own) => ({
  specId: code === 'CUT_SPEED' ? 31 : 32, code, name: code === 'CUT_SPEED' ? 'Cut speed' : 'Pierce time', resultUnit: 'mm/min', mode: 'step_up', version: 2, axes: [th],
  definedAt: type, valueRule: 'defaulted', rows: [[10, 600], [20, 450]], value: { rows: [[10, 600], [20, 450]] },
  valueFrom: own ? { type: 'machine', id: 5, name: 'MC-2' } : type, own, usedBy: ['CUT'], shortForm: `machine.${code}`, nodes: {},
});
const impacts = [];
globalThis.__routes = [
  ['GET', /^\/machines\/5\/charts$/, () => [chart('CUT_SPEED', false), chart('PIERCE_TIME', true)]],
  ['GET', /^\/machines\/5\/time-impact$/, () => ({ steps: 12, changed: 0, minutesBefore: 480, minutesAfter: 480, minutesChange: 0, dropped: 0, cannot: [] })],
  ['POST', /^\/machines\/5\/charts\/32\/impact$/, (c) => { impacts.push(c.body); return { steps: 12, changed: 5, minutesBefore: 480, minutesAfter: 460, minutesChange: -20, dropped: 0, cannot: [] }; }],
];
await check('the impact sentence: counts, total, and steps that come off', () => {
  assert.equal(C.impactText({ steps: 12, changed: 5, minutesChange: 36, dropped: 0 }), '5 planned steps change (of 12 not started on this machine): +36 min in total.');
  assert.equal(C.impactText({ steps: 3, changed: 1, minutesChange: -20, dropped: 1 }), '1 planned step changes (of 3 not started on this machine): −20 min in total. 1 step comes off this machine: its chart has no answer for it.');
  assert.match(C.impactText({ steps: 0, changed: 0, minutesChange: 0, dropped: 0 }), /No planned step is on this machine yet/);
  assert.match(C.impactText({ steps: 2, changed: 0, minutesChange: 0, dropped: 0 }), /2 planned steps are on this machine and not started; their times do not change\./);
});
await check('the Charts tab says how many planned steps are on the machine, and beside "Give this machine its own chart" how many would follow it', async () => {
  await render(React.createElement(m.ChartsPanel, { subject: { type: 'machine', id: 5 }, canManage: true }));
  await settle(60);
  assert.match(text('charts-impact'), /12 planned steps are on this machine and not started \(480 min\)/);
  assert.match(text('charts-impact'), /you are told by how much before it is saved/);
  assert.equal(text('chart-impact-CUT_SPEED'), '12 planned steps would follow it');
  assert.equal(q('chart-impact-PIERCE_TIME'), null, 'a chart that is already its own has no such note');
});
await check('"Go back to the type’s chart" shows the dry run before anything is saved', async () => {
  const back = [...document.querySelectorAll('button')].find((b) => /Go back to the type/.test(b.textContent));
  await click(back);
  await settle(60);
  assert.deepEqual(impacts, [{ value: null }]);
  const dialog = document.querySelector('[role="dialog"]');
  assert.match(dialog.textContent, /5 planned steps change \(of 12 not started on this machine\): −20 min in total\./);
  assert.equal(calls.filter((c) => c.method === 'PUT' && /charts\/32\/values/.test(c.path)).length, 0);
});

if (root) await React.act(async () => { root.unmount(); });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
