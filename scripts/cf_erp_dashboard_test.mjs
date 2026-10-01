// Run from multi_app_fe: node scripts/cf_erp_dashboard_test.mjs
// Production › Dashboard (pages/Dashboard.tsx, components/Dashboard/*, lib/dashboard.ts) rendered in jsdom
// from fixture replies of GET /dashboard/machines and GET /dashboard/orders. The clock is fixed at
// 13:00 on Wed 2026-09-30 so "this week" is Mon 28 Sep – Wed 30 Sep.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const RealDate = Date;
const skew = new RealDate(2026, 8, 30, 13, 0, 0).getTime() - RealDate.now();
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(RealDate.now() + skew); else super(...a); }
  static now() { return RealDate.now() + skew; }
}
globalThis.Date = FakeDate;

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/management', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  try { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true }); } catch { /* skip */ }
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The platform's apiFetch → plain fetch; the auth context → a user with the grants the test sets.
const apiStub = `export async function apiFetch(url, o = {}) {
  const res = await globalThis.fetch(url, { method: o.method || 'GET' });
  const text = await res.text();
  if (!res.ok) throw new Error('API request failed: ' + res.status + ' x - ' + text);
  return JSON.parse(text);
}`;
const authStub = `export function useAuth() { return { user: globalThis.__user ?? null }; }`;
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter } from 'react-router-dom';
      export { React, createRoot, MemoryRouter };
      export { default as Dashboard } from './src/apps/cf_erp/pages/Dashboard';
      export * as L from './src/apps/cf_erp/lib/dashboard';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/api\/client$/ }, () => ({ path: 'api', namespace: 'stub' }));
    b.onResolve({ filter: /^@core\/contexts\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'stub' }));
    b.onLoad({ filter: /^api$/, namespace: 'stub' }, () => ({ contents: apiStub, loader: 'js' }));
    b.onLoad({ filter: /^auth$/, namespace: 'stub' }, () => ({ contents: authStub, loader: 'js' }));
  } }],
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `dashboard-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const { React, createRoot, MemoryRouter, Dashboard, L } = await import(pathToFileURL(artifact));
await unlink(artifact);

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };

// ── fixtures ─────────────────────────────────────────────────────────────
const period = { from: '2026-09-28', to: '2026-09-30', days: 3, today: '2026-09-30', now: '2026-09-30T13:00:00', timezone: 'Asia/Kolkata' };
const day = (date, shift, runIn, stop, overtime = 0, tonnes = 0) => ({ date, shift, run: runIn + overtime, runIn, stop, overtime, tonnes });
const machine = (over) => ({
  id: 1, code: 'CNC-01', name: 'CNC plasma', type: { id: 10, name: 'CNC cutting' }, hasShifts: true,
  now: { state: 'running', inShift: true, running: [{ operation: 'Cutting', pieceCode: 'S1-G2-TF1', orderCode: 'SO-1', since: '2026-09-30T10:40:00' }], stop: null, lastActivityAt: '2026-09-30T10:40:00' },
  shiftMin: 1260, runMin: 900, runInShiftMin: 840, overtimeMin: 60, stopMin: 120, stopInShiftMin: 120, notRecordedMin: 240, utilisationPct: 66.7,
  output: { operationsDone: 42, stepsWorked: 45, piecesGood: 130, piecesScrap: 2, tonnes: 18.4, unweighedSessions: 0 },
  standard: { earnedMin: 810, coveragePct: 100, performancePct: 90 },
  reasons: [{ id: 4, code: 'BREAKDOWN', label: 'Breakdown', minutes: 90, count: 2 }, { id: 5, code: 'POWER', label: 'Power cut', minutes: 30, count: 1 }],
  operators: [{ id: 7, name: 'Ravi', minutes: 700 }],
  days: [day('2026-09-28', 420, 300, 60), day('2026-09-29', 420, 360, 60, 60), day('2026-09-30', 420, 180, 0)],
  time: cncTime,
  ...over,
});
// Where the shift time went: buckets that add up to the shift exactly (as the backend sends them).
const B = (key, label, kind, minutes, extra = {}) => ({ key, label, kind, minutes, ...extra });
const R = (id, code, label, kind, sortOrder) => ({ key: `reason:${id}`, reasonId: id, code, label, kind, sortOrder });
const SETUP = R(3, 'SETUP', 'Setup / changeover', 'planned', 70), BRK = R(4, 'BREAKDOWN', 'Breakdown', 'unplanned', 40), PWR = R(5, 'POWER', 'Power cut', 'unplanned', 50), CRN = R(6, 'CRANE', 'Waiting for crane', 'unplanned', 20), DRW = R(7, 'DRAWING', 'Waiting for drawing', 'unplanned', 100);
const cncTime = { noShift: false, shiftMinutes: 1440, netShiftMinutes: 1260, overtimeMinutes: 60, stopOutsideShiftMinutes: 0, utilisationPct: 66.7, buckets: [
  B('run', 'Running', 'run', 840), { ...SETUP, minutes: 60, stops: 1 }, B('break', 'Break (shift pattern)', 'break', 180), { ...BRK, minutes: 90, stops: 2 }, { ...PWR, minutes: 30, stops: 1 }, B('unrecorded', 'Not recorded', 'unrecorded', 240),
] };
const sawTime = { noShift: false, shiftMinutes: 1440, netShiftMinutes: 1260, overtimeMinutes: 140, stopOutsideShiftMinutes: 0, utilisationPct: 20.6, buckets: [
  B('run', 'Running', 'run', 260), B('break', 'Break (shift pattern)', 'break', 180), { ...CRN, minutes: 90, stops: 2 }, B('unrecorded', 'Not recorded', 'unrecorded', 910),
] };
const paintTime = { noShift: true, shiftMinutes: 0, netShiftMinutes: 0, overtimeMinutes: 0, stopOutsideShiftMinutes: 0, utilisationPct: null, buckets: [B('run', 'Running', 'run', 0)] };
const path = (...ns) => ns.map(([id, name], depth) => ({ id, name, depth, level: ['Family', 'Subfamily', 'Variant'][depth] }));
const roll = (t, n, noShift = 0) => ({ machines: n, noShiftMachines: noShift, noShiftRunMinutes: 0, ...t });
const time = {
  plant: roll({ shiftMinutes: 2880, netShiftMinutes: 2520, overtimeMinutes: 200, stopOutsideShiftMinutes: 0, utilisationPct: 43.7, buckets: [
    B('run', 'Running', 'run', 1100), { ...SETUP, minutes: 60, stops: 1 }, B('break', 'Break (shift pattern)', 'break', 360), { ...CRN, minutes: 90, stops: 2 }, { ...BRK, minutes: 90, stops: 2 }, { ...PWR, minutes: 30, stops: 1 }, B('unrecorded', 'Not recorded', 'unrecorded', 1150),
  ] }, 3, 1),
  types: [
    { id: 10, name: 'CNC cutting', path: path([1, 'Machines'], [2, 'Cutting'], [10, 'CNC cutting']), machineIds: [1], ...roll(cncTime, 1) },
    { id: 12, name: 'Painting', path: path([1, 'Machines'], [3, 'Finishing'], [12, 'Painting']), machineIds: [3], ...roll(paintTime, 1, 1) },
    { id: 11, name: 'Welding', path: path([1, 'Machines'], [4, 'Joining'], [11, 'Welding']), machineIds: [2], ...roll(sawTime, 1) },
  ],
  reasons: [{ ...SETUP, minutes: 60, stops: 1, machines: 1 }, { ...CRN, minutes: 90, stops: 2, machines: 1 }, { ...BRK, minutes: 90, stops: 2, machines: 1 }, { ...PWR, minutes: 30, stops: 1, machines: 1 }, { ...DRW, minutes: 0, stops: 0, machines: 0 }],
  noShift: [{ id: 3, code: 'PAINT-01', name: 'Paint booth', typeId: 12, runMinutes: 0, stopMinutes: 0 }],
};
const machines = {
  period,
  time,
  plant: {
    machines: 3, runningNow: 1, stoppedNow: 1, idleInShiftNow: 0, offShiftNow: 1, withoutShifts: 1,
    shiftMin: 2520, runMin: 1300, runInShiftMin: 1100, overtimeMin: 60, stopMin: 300, notRecordedMin: 900,
    utilisationPct: 43.7, recordedPct: 64.3, operationsDone: 60, piecesGood: 170,
    tonnesHandled: 30.2, tonnesFinished: 12.5, tonnesDispatched: 6.4, unweighedMovements: 0, earnedMin: 1000, performancePct: 76.9,
    topReasons: [{ id: 4, code: 'BREAKDOWN', label: 'Breakdown', minutes: 210, count: 3, machines: 2 }, { id: 6, code: 'CRANE', label: 'Waiting for crane', minutes: 90, count: 2, machines: 1 }],
    days: [day('2026-09-28', 840, 500, 120), day('2026-09-29', 840, 400, 120, 60), day('2026-09-30', 840, 200, 60)],
  },
  types: [{ id: 10, name: 'CNC cutting' }, { id: 11, name: 'Welding' }],
  machines: [
    machine({}),
    machine({ id: 2, code: 'SAW-01', name: 'SAW welder', type: { id: 11, name: 'Welding' }, utilisationPct: 20.6, runInShiftMin: 260, runMin: 400, stopMin: 180, stopInShiftMin: 180, notRecordedMin: 660,
      now: { state: 'stopped', inShift: true, running: [], stop: { reason: 'Waiting for crane', since: '2026-09-30T11:15:00' }, lastActivityAt: '2026-09-30T11:15:00' },
      output: { operationsDone: 18, stepsWorked: 18, piecesGood: 40, piecesScrap: 0, tonnes: null, unweighedSessions: 4 },
      reasons: [{ id: 6, code: 'CRANE', label: 'Waiting for crane', minutes: 90, count: 2 }], time: sawTime }),
    machine({ id: 3, code: 'PAINT-01', name: 'Paint booth', type: { id: 12, name: 'Painting' }, hasShifts: false, shiftMin: 0, runInShiftMin: 0, runMin: 0, overtimeMin: null, stopMin: 0, stopInShiftMin: 0, notRecordedMin: 0, utilisationPct: null,
      now: { state: 'off_shift', inShift: false, running: [], stop: null, lastActivityAt: null }, reasons: [], days: [day('2026-09-28', 0, 0, 0), day('2026-09-29', 0, 0, 0), day('2026-09-30', 0, 0, 0)],
      output: { operationsDone: 0, stepsWorked: 0, piecesGood: 0, piecesScrap: 0, tonnes: 0, unweighedSessions: 0 }, time: paintTime }),
  ],
  meta: { queries: 9, stages: 2, ms: 40 },
};
const stage = (operationId, code, name, steps, done, workMinLeft, extra = {}) => ({ operationId, code, name, steps, done, inProgress: 0, onHold: 0, contracted: 0, pctDone: Math.round((done / steps) * 1000) / 10, workMinLeft, ...extra });
const order = (over) => ({
  id: 100, code: 'SO-20260930-0001', revision: 1, title: 'ROB 59.3 m', orderType: 'customer', planPriority: 1,
  customer: { id: 9, name: 'KEPL Infrastructure' }, committedDate: '2026-10-10',
  progress: { pct: 34.2, basis: 'tonnes', lineBasis: 'work', stepsTotal: 16972, workMinLeft: 90000 },
  tonnes: { total: 669.29, made: 120.5, dispatched: 60.1, unweighedLines: [] },
  lines: { total: 2, released: 2, made: 0, dispatched: 0 },
  period: { workMin: 3000, pctGained: 4.1, tonnesMade: 12, tonnesDispatched: 6 },
  forecast: { date: '2026-12-20', pace: '2026-12-20', pacePctPerWeek: 5.2, plan: null, planComplete: false, planned: 1, estimate: true },
  risk: { status: 'at_risk', daysLeft: 10, slipDays: 71, why: 'Forecast 2026-12-20 is 71 days after the committed 2026-10-10.' },
  stages: [stage(1, 'CUT', 'Cutting', 6000, 6000, 0), stage(2, 'DRILL', 'Drilling', 3000, 2400, 3000), stage(3, 'FITUP', 'Fit-up', 2000, 400, 40000, { onHold: 2 }), stage(4, 'WELD', 'Welding', 2000, 100, 45000, { inProgress: 5 }), stage(5, 'PAINT', 'Painting', 400, 0, 2000)],
  bottleneck: { operationId: 4, code: 'WELD', name: 'Welding', basis: 'work', workMinLeft: 45000, stepsLeft: 1900, sharePct: 50 },
  blocked: { onHold: 2, holdReasons: [{ reason: 'Crane broken', count: 2 }], materialSteps: 14 },
  material: { requirements: 128, items: 12, fullyIssued: 40, covered: 9, inStock: 1, onOrder: 1, toBuy: 1, short: [
    { itemId: 55, code: 'PL-12X2500X12100', name: 'Plate 12 mm', uom: 'nos', needed: 14, issued: 0, reserved: 5, short: 9, shortSteps: 9, freeNow: 0, onOrder: 4, expected: '2026-10-05', status: 'to_buy' },
  ] },
  money: { value: 56889502.06, valueComplete: true, unpricedLines: [], invoiced: 5100000, invoicedCount: 1, draftInvoices: 1, materialCost: 2300000, materialUncostedRows: 0 },
  lineRows: [
    { id: 1, lineNo: 10, item: { id: 5, code: 'SPAN1', name: 'Composite girder span 1', uom: 'nos' }, quantity: 1, made: 0, delivered: 0, released: true, releaseId: 3, noSteps: false, committedDate: null,
      progressPct: 40, basis: 'work', estCoveragePct: 100, stepsTotal: 9000, tonnes: 334.6, tonnesMade: 0, tonnesDispatched: 0,
      period: { workMin: 2000, pctGained: 5, made: 0, dispatched: 0, tonnesMade: 0, tonnesDispatched: 0 }, plan: { last: '2026-11-02', first: '2026-10-05', entries: 12 }, amount: 28444751.03 },
    { id: 2, lineNo: 20, item: { id: 6, code: 'SPAN2', name: 'Composite girder span 2', uom: 'nos' }, quantity: 1, made: 0, delivered: 0, released: false, releaseId: null, noSteps: false, committedDate: null,
      progressPct: 0, basis: null, estCoveragePct: null, stepsTotal: 0, tonnes: 334.6, tonnesMade: 0, tonnesDispatched: 0,
      period: { workMin: 0, pctGained: 0, made: 0, dispatched: 0, tonnesMade: 0, tonnesDispatched: 0 }, plan: null, amount: 28444751.03 },
  ],
  ...over,
});
const ordersReply = (withMoney) => {
  const late = order({ id: 101, code: 'SO-20260801-0003', title: 'FOB girders', committedDate: '2026-09-25', risk: { status: 'late', daysLeft: -5, slipDays: 5, why: 'Committed for 2026-09-25; 5 days past it.' },
    blocked: { onHold: 0, holdReasons: [], materialSteps: 0 }, material: { requirements: 0, items: 0, fullyIssued: 0, covered: 0, inStock: 0, onOrder: 0, toBuy: 0, short: [] } });
  const ok = order({ id: 102, code: 'SO-20260901-0007', title: 'Foot bridge', committedDate: '2027-03-01', risk: { status: 'on_track', daysLeft: 152, slipDays: -40, why: 'ok' }, stages: [], bottleneck: null,
    blocked: { onHold: 0, holdReasons: [], materialSteps: 0 }, material: { requirements: 0, items: 0, fullyIssued: 0, covered: 0, inStock: 0, onOrder: 0, toBuy: 0, short: [] } });
  const os = [late, order({}), ok].map((o) => (withMoney ? o : { ...o, money: null, lineRows: o.lineRows.map(({ amount, ...l }) => l) }));
  return {
    period, withMoney, orders: os, meta: { queries: 14, stages: 3, ms: 300 },
    totals: { orders: 3, lines: 6, late: 1, atRisk: 1, onTrack: 1, noForecast: 0, noDate: 0, done: 0, tonnes: 2007.87, tonnesMade: 361.5, tonnesDispatched: 180.3, tonnesComplete: true,
      periodTonnesMade: 36, periodTonnesDispatched: 18, onHold: 2, materialSteps: 14, value: withMoney ? 170668506 : null, valueComplete: withMoney ? true : null, invoiced: withMoney ? 15300000 : null, materialCost: withMoney ? 6900000 : null },
  };
};

// The tracker tree of line 1 (SPAN1): line (level 1) › spans › girder lines › parts. Ids and fields as GET /tracker/tree/children sends them.
const op = (stepId, operationId, state, done = 0, total = 1) => ({ stepId, operationId, name: '', done, total, state });
const tnode = (id, parentId, level, code, name, over = {}) => ({
  id, parentId, kind: level === 1 ? 'line' : 'piece', level, code, name, qty: 1, ops: [], completion: 0.5, weight: 'minutes', blocked: false, blockedCount: 0, blockedReason: null, blockedAt: null,
  running: 0, childCount: 0, childrenIncluded: false, steps: 0, stepsDone: 0, ...over,
});
const TREE = [
  tnode('l1', 'o101', 1, 'SO-20260930-0001/10', 'Composite girder span 1', { childCount: 2, steps: 30, stepsDone: 12 }),
  tnode('p10', 'l1', 2, 'SPAN1-S1', 'Span 1', { childCount: 2, completion: 0.4, blockedCount: 3, blockedReason: 'On hold: crane', blockedAt: 'SPAN1-S1-G1-W1', steps: 20, stepsDone: 8, running: 1 }),
  tnode('p20', 'l1', 2, 'SPAN1-S2', 'Span 2', { childCount: 0, completion: 1, ops: [op(1, 1, 'done'), op(2, 2, 'done')], steps: 2, stepsDone: 2 }),
  tnode('p11', 'p10', 3, 'SPAN1-S1-G1', 'Girder line 1', { childCount: 1, completion: 0.3, steps: 8, stepsDone: 2 }),
  tnode('p13', 'p10', 3, 'SPAN1-S1-G2', 'Girder line 2', { childCount: 0, ops: [op(3, 1, 'done'), op(4, 2, 'partial', 2, 6), op(5, 3, 'todo')], steps: 3, stepsDone: 1 }),
  tnode('p12', 'p11', 4, 'SPAN1-S1-G1-W1', 'Web 1', { childCount: 0, ops: [op(6, 1, 'blocked', 0, 1)], blockedCount: 1, blockedReason: 'On hold: crane', steps: 1, stepsDone: 0 }),
];
const OPS = { 1: { code: 'CUT', name: 'Cutting' }, 2: { code: 'FIT', name: 'Fit-up' }, 3: { code: 'WELD', name: 'Welding' } };
function treeChildren(nodeId, depth) {
  const node = TREE.find((n) => n.id === nodeId);
  if (!node) return null;
  const out = [];
  const walk = (id) => { for (const n of TREE.filter((x) => x.parentId === id)) { out.push(n); if (n.level - node.level < depth) walk(n.id); } };
  walk(nodeId);
  const inc = (n) => ({ ...n, childrenIncluded: n.childCount > 0 && (n.id === nodeId || n.level - node.level < depth) });
  return { node: inc(node), operations: OPS, nodes: out.map(inc) };
}
function treePiece(nodeId) {
  const node = TREE.find((n) => n.id === nodeId);
  return { node, operations: OPS, path: [], order: { id: 100, code: 'SO-20260930-0001' }, line: { id: 1, lineNo: 10 }, steps: [] };
}

let withMoney = true;
const requests = [];
globalThis.fetch = async (url) => {
  requests.push(String(url));
  const u = new URL(String(url), 'http://localhost');
  const body = u.pathname.endsWith('/dashboard/machines') ? machines : u.pathname.endsWith('/dashboard/orders') ? ordersReply(withMoney)
    : u.pathname.endsWith('/tracker/tree/children') ? treeChildren(u.searchParams.get('nodeId'), Number(u.searchParams.get('depth') || 1))
    : u.pathname.endsWith('/tracker/tree/node') ? treePiece(u.searchParams.get('nodeId')) : null;
  return { ok: !!body, status: body ? 200 : 404, text: async () => JSON.stringify(body ?? { message: 'not found' }) };
};

const app = () => document.getElementById('app');
const text = () => app().textContent;
const settle = async () => { for (let i = 0; i < 6; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const show = async (url) => {
  const root = createRoot(app());
  await React.act(() => root.render(React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(Dashboard))));
  await settle();
  return root;
};
const click = async (el) => { await React.act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); await settle(); };
const byTestId = (id) => [...document.querySelectorAll(`[data-testid="${id}"]`)];

// ── lib ──────────────────────────────────────────────────────────────────
await check('periods: this week starts Monday; this month on the 1st; custom is capped at 92 days', () => {
  assert.deepEqual(L.periodRange('week', '2026-09-30'), { from: '2026-09-28', to: '2026-09-30' });
  assert.deepEqual(L.periodRange('week', '2026-09-28'), { from: '2026-09-28', to: '2026-09-28' });
  assert.deepEqual(L.periodRange('month', '2026-09-30'), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(L.periodRange('today', '2026-09-30'), { from: '2026-09-30', to: '2026-09-30' });
  assert.deepEqual(L.periodRange('last30', '2026-09-30'), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(L.periodRange('custom', '2026-09-30', { from: '2026-01-01', to: '2026-12-31' }), { from: '2026-01-01', to: '2026-04-02' });
});
await check('numbers read plainly; a missing weight is "not weighed", never 0 t', () => {
  assert.equal(L.hoursText(0), '0 h'); assert.equal(L.hoursText(45), '45 min'); assert.equal(L.hoursText(450), '7.5 h'); assert.equal(L.hoursText(74400), '1,240 h');
  assert.equal(L.tonnesText(null), 'not weighed'); assert.equal(L.tonnesText(0.354), '0.35 t'); assert.equal(L.tonnesText(669.29), '669 t'); assert.equal(L.tonnesText(12.44), '12.4 t');
  assert.equal(L.pctText(null), '—'); assert.equal(L.pctText(66.7), '67%');
  assert.equal(L.daysLeftText(-5), '5 days late'); assert.equal(L.daysLeftText(1), 'in 1 day'); assert.equal(L.daysLeftText(0), 'due today');
});
await check('shift bar shares add up to 100; a machine with no shifts has none', () => {
  const s = L.shiftShares({ shiftMin: 840, runInShiftMin: 180, stopInShiftMin: 120, notRecordedMin: 540 });
  assert.ok(Math.abs(s.run + s.stop + s.gap + s.other - 100) < 1e-9);
  assert.equal(Math.round(s.run * 10) / 10, 21.4);
  assert.equal(L.shiftShares({ shiftMin: 0, runInShiftMin: 0, stopInShiftMin: 0, notRecordedMin: 0 }), null);
});
await check('sort: lowest utilisation first, a machine with no shifts last; most stops first', () => {
  assert.deepEqual(L.sortMachines(machines.machines, 'utilisation').map((m) => m.code), ['SAW-01', 'CNC-01', 'PAINT-01']);
  assert.deepEqual(L.sortMachines(machines.machines, 'stops').map((m) => m.code), ['SAW-01', 'CNC-01', 'PAINT-01']);
  assert.deepEqual(L.sortMachines(machines.machines, 'tonnes').map((m) => m.code)[0], 'CNC-01');
});

// ── the page ─────────────────────────────────────────────────────────────
await check('opens on By machine for this week, asking both tabs for Mon 28 – Wed 30 Sep', async () => {
  requests.length = 0;
  const root = await show('/testco/cf_erp/management');
  assert.ok(requests.some((r) => r.includes('/api/testco/cf_erp/dashboard/machines?from=2026-09-28&to=2026-09-30')), requests.join('\n'));
  assert.ok(requests.some((r) => r.includes('/dashboard/orders?from=2026-09-28&to=2026-09-30')));
  assert.ok(byTestId('machines-tab').length === 1);
  assert.match(text(), /28 Sep – 30 Sep/);
  assert.match(text(), /as of 13:00/);
  await React.act(() => root.unmount());
});
await check('the plant strip: utilisation, overtime, stops by reason, not recorded, tonnes, now — and late orders', async () => {
  const root = await show('/testco/cf_erp/management');
  assert.match(byTestId('tile-utilisation')[0].textContent, /44%.*18 h run of 42 h shift/);
  assert.match(byTestId('tile-run')[0].textContent, /1 h overtime/);
  assert.match(byTestId('tile-stops')[0].textContent, /5 h.*Breakdown 3\.5 h · Waiting for crane 1\.5 h/);
  assert.match(byTestId('tile-recorded')[0].textContent, /15 h.*64% of shift time is logged/);
  assert.match(byTestId('tile-output')[0].textContent, /12\.5 t.*6\.4 t dispatched.*30\.2 t through machines/);
  assert.match(byTestId('tile-now')[0].textContent, /1 \/ 3.*1 stopped.*2 orders late or at risk/);
  assert.equal(byTestId('daily-bars').length, 1);
  await React.act(() => root.unmount());
});
await check('machine cards: worst utilisation first; status in words; no shifts reads "—"; no weight is not weighed', async () => {
  const root = await show('/testco/cf_erp/management');
  const cards = byTestId('machine-card');
  assert.deepEqual(cards.map((c) => c.getAttribute('data-machine')), ['SAW-01', 'CNC-01', 'PAINT-01']);
  assert.match(cards[0].textContent, /Stopped · Waiting for crane since 11:15/);
  assert.match(cards[0].textContent, /21%/);
  assert.match(cards[0].textContent, /4 jobs not weighed/);
  assert.ok(!/0 t/.test(cards[0].textContent), 'never 0 t for a missing weight');
  assert.match(cards[1].textContent, /Running · Cutting on S1-G2-TF1 since 10:40/);
  assert.match(cards[1].textContent, /1 h OT/);
  assert.match(cards[2].textContent, /no shifts/);
  assert.ok(cards[1].querySelector('[data-testid="sparkline"]'), 'a daily sparkline');
  assert.ok(cards[1].querySelector('[data-seg="run"]') && cards[1].querySelector('[data-seg="unrecorded"]'), 'run and not-recorded segments');
  await React.act(() => root.unmount());
});
const dbl = async (el) => { await React.act(async () => { el.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })); }); await settle(); };
const segPcts = (bar) => [...bar.querySelectorAll('[data-seg]')].map((x) => Number(x.getAttribute('data-pct')));
await check('where the shift time went: lib — colours per bucket kind, areas as the planner groups them, top buckets', () => {
  const st = L.bucketStyles(time.reasons);
  assert.equal(st.run.color, 'var(--c-state-running)');
  assert.ok(st.unrecorded.hatch);
  assert.match(st['reason:3'].color, /info-600.*neutral-600/, 'planned = blue-grey');
  assert.match(st['reason:4'].color, /danger-600.*warning-600/, 'unplanned = amber → red');
  assert.notEqual(st['reason:4'].color, st['reason:5'].color, 'one shade per unplanned reason');
  const areas = L.timeAreas(time.types);
  assert.deepEqual(areas.map((a) => a.name), ['Cutting', 'Finishing', 'Joining']);
  assert.equal(areas[0].shiftMinutes, 1440);
  assert.equal(areas[0].buckets.reduce((s, b) => s + b.minutes, 0), 1440);
  assert.equal(L.topBucketsText(cncTime), 'Running 58% · Not recorded 17% · Break (shift pattern) 13%');
});
await check('where the shift time went: one row per type under its area, each a 100 % bar; no shift reads so', async () => {
  const root = await show('/testco/cf_erp/management');
  assert.equal(byTestId('shift-time').length, 1);
  assert.deepEqual(byTestId('time-area-row').map((r) => r.getAttribute('data-area')), ['Cutting', 'Finishing', 'Joining']);
  const rows = byTestId('time-type-row');
  assert.deepEqual(rows.map((r) => r.getAttribute('data-type')), ['CNC cutting', 'Painting', 'Welding']);
  for (const r of [rows[0], rows[2]]) {
    const bar = r.querySelector('[data-testid="time-bar"]');
    assert.ok(bar, 'a bar');
    assert.ok(Math.abs(segPcts(bar).reduce((a, b) => a + b, 0) - 100) < 0.05, `${r.getAttribute('data-type')} adds to 100: ${segPcts(bar)}`);
  }
  assert.match(rows[0].textContent, /Running 58% · Not recorded 17% · Break \(shift pattern\) 13%/);
  assert.match(rows[0].textContent, /67%/); assert.match(rows[0].textContent, /1 h/);
  assert.match(rows[2].textContent, /21%.*2\.3 h/);
  assert.match(rows[1].textContent, /No shift in the period/);
  assert.match(byTestId('time-no-shift')[0].textContent, /PAINT-01/);
  assert.ok(rows[0].querySelector('[data-seg="reason:4"]') && rows[0].querySelector('[data-seg="unrecorded"]'), 'reason and not-recorded segments');
  assert.match(rows[0].querySelector('[data-testid="time-bar"]').getAttribute('aria-label'), /CNC cutting: Running 58%/);
  await React.act(() => root.unmount());
});
await check('double-click a type row opens its machines with a breadcrumb; Collapse closes; the chevron does the same', async () => {
  const root = await show('/testco/cf_erp/management');
  const cnc = byTestId('time-type-row').find((r) => r.getAttribute('data-type') === 'CNC cutting');
  assert.equal(byTestId('time-machines').length, 0);
  await dbl(cnc);
  const block = byTestId('time-machines')[0];
  assert.ok(block, 'machines shown');
  assert.match(block.querySelector('[data-testid="time-breadcrumb"]').textContent, /All machines › Cutting › CNC cutting/);
  assert.deepEqual(byTestId('time-machine-row').map((r) => r.getAttribute('data-machine')), ['CNC-01']);
  const mbar = byTestId('time-machine-row')[0].querySelector('[data-testid="time-bar"]');
  assert.ok(Math.abs(segPcts(mbar).reduce((a, b) => a + b, 0) - 100) < 0.05);
  assert.equal(cnc.querySelector('[data-testid="time-expand"]').getAttribute('aria-expanded'), 'true');
  await click(block.querySelector('[data-testid="time-collapse"]'));
  assert.equal(byTestId('time-machines').length, 0);
  const weld = byTestId('time-type-row').find((r) => r.getAttribute('data-type') === 'Welding');
  await click(weld.querySelector('[data-testid="time-expand"]'));
  assert.deepEqual(byTestId('time-machine-row').map((r) => r.getAttribute('data-machine')), ['SAW-01']);
  await click(byTestId('time-collapse-all')[0]);
  assert.equal(byTestId('time-machines').length, 0);
  await React.act(() => root.unmount());
});
await check('double-click a machine row (or its open button) opens the machine sheet with its 100 % bar', async () => {
  const root = await show('/testco/cf_erp/management');
  await dbl(byTestId('time-type-row').find((r) => r.getAttribute('data-type') === 'CNC cutting'));
  await dbl(byTestId('time-machine-row')[0]);
  const sheet = document.querySelector('[data-testid="machine-sheet"]');
  assert.ok(sheet, 'sheet open');
  assert.match(sheet.textContent, /CNC-01/);
  const st = sheet.querySelector('[data-testid="sheet-time"]');
  assert.ok(st, 'its shift time');
  assert.match(st.textContent, /Breakdown · 2×.*1\.5 h.*6%/);
  await React.act(() => root.unmount());
  const root2 = await show('/testco/cf_erp/management');
  await click(byTestId('time-type-row').find((r) => r.getAttribute('data-type') === 'Welding').querySelector('[data-testid="time-expand"]'));
  await click(byTestId('time-open-machine')[0]);
  assert.match(document.querySelector('[data-testid="machine-sheet"]').textContent, /SAW-01/);
  await React.act(() => root2.unmount());
});
await check('the legend lists every reason with hours and %; a click highlights it on every bar', async () => {
  const root = await show('/testco/cf_erp/management');
  const items = byTestId('time-legend-item');
  assert.deepEqual(items.map((i) => i.getAttribute('data-key')), ['run', 'reason:3', 'break', 'reason:6', 'reason:4', 'reason:5', 'reason:7', 'unrecorded']);
  const brk = items.find((i) => i.getAttribute('data-key') === 'reason:4');
  assert.match(brk.textContent, /Breakdown.*1\.5 h · 3%/);
  assert.match(items.find((i) => i.getAttribute('data-key') === 'reason:7').textContent, /Waiting for drawing.*0 h · 0%/);
  assert.match(items.find((i) => i.getAttribute('data-key') === 'reason:3').textContent, /planned/);
  await click(brk);
  assert.equal(brk.getAttribute('aria-pressed'), 'true');
  const cnc = byTestId('time-type-row').find((r) => r.getAttribute('data-type') === 'CNC cutting');
  assert.equal(cnc.querySelector('[data-seg="reason:4"]').getAttribute('data-dim'), '0');
  assert.equal(cnc.querySelector('[data-seg="run"]').getAttribute('data-dim'), '1');
  assert.match(cnc.querySelector('[data-testid="time-caption"]').textContent, /Breakdown 6% · 1\.5 h · 2 stops/);
  await click(brk);
  assert.equal(brk.getAttribute('aria-pressed'), 'false');
  assert.equal(cnc.querySelector('[data-seg="run"]').getAttribute('data-dim'), '0');
  await React.act(() => root.unmount());
});
await check('the type filter narrows the cards', async () => {
  const root = await show('/testco/cf_erp/management');
  const chip = [...document.querySelectorAll('.MuiChip-root')].find((c) => c.textContent === 'Welding');
  await click(chip);
  assert.deepEqual(byTestId('machine-card').map((c) => c.getAttribute('data-machine')), ['SAW-01']);
  await React.act(() => root.unmount());
});
await check('a card opens the machine sheet: pace vs standard is an estimate, stop reasons, who ran it', async () => {
  const root = await show('/testco/cf_erp/management');
  await click(byTestId('machine-card').find((c) => c.getAttribute('data-machine') === 'CNC-01'));
  const sheet = document.querySelector('[data-testid="machine-sheet"]');
  assert.ok(sheet, 'sheet open');
  assert.match(sheet.textContent, /Pace vs standard.*90%/);
  assert.ok(sheet.querySelector('[data-testid="estimate-tag"]'));
  assert.match(sheet.textContent, /Breakdown.*1\.5 h · 2×/);
  assert.match(sheet.textContent, /Ravi/);
  await React.act(() => root.unmount());
});
await check('By order: late first, then at risk; forecast labelled an estimate; stages, bottleneck, holds, material, money', async () => {
  const root = await show('/testco/cf_erp/management?tab=orders');
  assert.equal(byTestId('orders-tab').length, 1);
  const cards = byTestId('order-card');
  assert.deepEqual(cards.map((c) => c.getAttribute('data-order')), ['SO-20260801-0003', 'SO-20260930-0001', 'SO-20260901-0007']);
  assert.match(cards[0].textContent, /Late/); assert.match(cards[0].textContent, /5 days late/);
  const risky = cards[1];
  assert.match(risky.textContent, /At risk/);
  assert.match(risky.querySelector('[data-testid="order-forecast"]').textContent, /20 Dec · 71 d after/);
  assert.ok(risky.querySelector('[data-testid="order-forecast"] [data-testid="estimate-tag"]'));
  assert.equal(risky.querySelector('[data-testid="order-pct"]').textContent, '34%');
  assert.deepEqual([...risky.querySelectorAll('[data-stage]')].map((s) => s.getAttribute('data-stage')), ['CUT', 'DRILL', 'FITUP', 'WELD', 'PAINT']);
  assert.match(risky.querySelector('[data-testid="order-bottleneck"]').textContent, /Welding — 750 h \(50% of what is left\)/);
  assert.match(risky.querySelector('[data-testid="order-holds"]').textContent, /2 on hold — Crane broken ×2/);
  assert.match(risky.querySelector('[data-testid="order-material"]').textContent, /1 in stock to reserve · 1 on order · 1 to buy \(14 steps wait\)/);
  assert.match(risky.textContent, /₹5,68,89,502/);
  assert.match(byTestId('tile-risk')[0].textContent, /2.*1 late · 1 at risk · 1 on track/);
  assert.match(byTestId("tile-money")[0].textContent, /₹17.1 Cr.*₹1.53 Cr invoiced.*₹69 L material issued/);
  assert.equal(L.croreText(56889502.06), "₹5.69 Cr"); assert.equal(L.croreText(510000), "₹5.1 L"); assert.equal(L.croreText(99999), "₹99,999"); assert.equal(L.croreText(null), "—");
  assert.match(cards[2].textContent, /Not released to production yet/);
  await React.act(() => root.unmount());
});
await check('expanding an order shows its lines and the short material', async () => {
  const root = await show('/testco/cf_erp/management?tab=orders');
  const card = byTestId('order-card').find((c) => c.getAttribute('data-order') === 'SO-20260930-0001');
  await click(card.querySelector('[aria-expanded]'));
  const lines = card.querySelector('[data-testid="order-lines"]');
  assert.ok(lines, 'lines shown');
  assert.match(lines.textContent, /SPAN1.*40%.*335 t/);
  assert.match(lines.textContent, /week of 2 Nov/);
  assert.match(lines.textContent, /not released yet/);
  assert.match(lines.textContent, /PL-12X2500X12100.*9 nos.*To buy/);
  await React.act(() => root.unmount());
});
await check('the risk filter shows only late orders', async () => {
  const root = await show('/testco/cf_erp/management?tab=orders');
  const chip = [...document.querySelectorAll('.MuiChip-root')].find((c) => /^Late 1$/.test(c.textContent));
  await click(chip);
  assert.deepEqual(byTestId('order-card').map((c) => c.getAttribute('data-order')), ['SO-20260801-0003']);
  await React.act(() => root.unmount());
});
await check('without orders view the backend sends no money, and the screen shows none', async () => {
  withMoney = false;
  const root = await show('/testco/cf_erp/management?tab=orders');
  assert.equal(byTestId('tile-money').length, 0);
  assert.ok(!/₹/.test(text()), 'no rupee anywhere');
  withMoney = true;
  await React.act(() => root.unmount());
});
await check('a custom period sends its own dates', async () => {
  requests.length = 0;
  const root = await show('/testco/cf_erp/management?period=custom&from=2026-08-01&to=2026-08-31');
  assert.ok(requests.some((r) => r.includes('/dashboard/machines?from=2026-08-01&to=2026-08-31')), requests.join('\n'));
  assert.match(text(), /1 Aug – 31 Aug/);
  await React.act(() => root.unmount());
});
await check('a user with only production view sees both tabs; orders view alone opens on By order', async () => {
  globalThis.__user = { uiPermissions: ['cf_erp_orders_view'] };
  requests.length = 0;
  const root = await show('/testco/cf_erp/management');
  assert.ok(!requests.some((r) => r.includes('/dashboard/machines')), 'no machines request');
  assert.equal(byTestId('tab-machines').length, 0);
  assert.equal(byTestId('orders-tab').length, 1);
  await React.act(() => root.unmount());
  globalThis.__user = { uiPermissions: ['cf_erp_production_view'] };
  const root2 = await show('/testco/cf_erp/management');
  assert.equal(byTestId('tab-machines').length, 1); assert.equal(byTestId('tab-orders').length, 1);
  await React.act(() => root2.unmount());
  globalThis.__user = null;
});

// ── By order › the piece-code tree ───────────────────────────────────────
const treeCalls = () => requests.filter((r) => r.includes('/tracker/tree'));
const searches = () => treeCalls().map((r) => new URL(r, 'http://x').search);
const openRisky = async (url = '/testco/cf_erp/management?tab=orders') => {
  const root = await show(url);
  const card = byTestId('order-card').find((c) => c.getAttribute('data-order') === 'SO-20260930-0001');
  await click(card.querySelector('[aria-expanded]'));
  return { root, card };
};
const rowsOf = (card) => [...card.querySelectorAll('[data-testid="tree-row"]')].map((r) => r.getAttribute('data-node'));
await check('tree: no request until an order card is opened; then the released line opens one level (spans)', async () => {
  window.localStorage.clear(); requests.length = 0;
  const root = await show('/testco/cf_erp/management?tab=orders');
  assert.equal(treeCalls().length, 0, 'first load asks for no tree');
  const card = byTestId('order-card').find((c) => c.getAttribute('data-order') === 'SO-20260930-0001');
  await click(card.querySelector('[aria-expanded]'));
  assert.deepEqual(searches(), ['?nodeId=l1&depth=1'], treeCalls().join('\n'));
  assert.deepEqual(rowsOf(card), ['p10', 'p20']);
  const span = card.querySelector('[data-node="p10"]');
  assert.match(span.textContent, /SPAN1-S1/); assert.match(span.textContent, /Span 1/);
  assert.match(span.querySelector('[data-testid="completion-pct"]').textContent, /40%/);
  assert.match(span.querySelector('[data-testid="blocked-mark"]').textContent, /3 blocked/);
  assert.match(span.textContent, /On hold: crane/);
  assert.ok(span.querySelector('[role="img"][aria-label="1 running now"]'), 'running dot');
  assert.match(span.textContent, /8 of 20 operations/, 'a parent with no strip of its own says n of m operations');
  assert.equal(card.querySelector('[data-node="p20"]').querySelectorAll('[data-testid="op-pill"]').length, 2, 'a piece with steps shows its pills');
  assert.match(card.querySelector('[data-testid="level-picker"] [aria-pressed="true"]').textContent, /Level 1/);
  await React.act(() => root.unmount());
});
await check('tree: opening a row reads the next level only; the parent code is greyed in the child', async () => {
  window.localStorage.clear();
  const { root, card } = await openRisky();
  requests.length = 0;
  await click(card.querySelector('[data-node="p10"]'));
  assert.deepEqual(searches(), ['?nodeId=p10&depth=1']);
  assert.deepEqual(rowsOf(card), ['p10', 'p11', 'p13', 'p20']);
  const code = card.querySelector('[data-node="p11"] [data-testid="tree-code"]');
  assert.equal(code.children[0].textContent, 'SPAN1-S1'); assert.equal(code.children[1].textContent, '-G1');
  requests.length = 0;
  await click(card.querySelector('[data-node="p10"]')); await click(card.querySelector('[data-node="p10"]'));
  assert.equal(treeCalls().length, 0, 'closing and opening again costs nothing');
  assert.equal(card.querySelector('[data-node="p13"]').querySelectorAll('[data-testid="op-pill"]').length, 3);
  await React.act(() => root.unmount());
});
await check('tree: "Open to" level 2 / 3 / All / Lines', async () => {
  window.localStorage.clear();
  const { root, card } = await openRisky();
  const pick = async (lvl) => { requests.length = 0; await click(card.querySelector(`[data-testid="level-picker"] [data-level="${lvl}"]`)); };
  await pick('2');
  assert.deepEqual(searches(), ['?nodeId=l1&depth=2']);
  assert.deepEqual(rowsOf(card), ['p10', 'p11', 'p13', 'p20']);
  await pick('3');
  assert.deepEqual(searches(), ['?nodeId=l1&depth=3']);
  assert.deepEqual(rowsOf(card), ['p10', 'p11', 'p12', 'p13', 'p20']);
  assert.equal(card.querySelector('[data-node="p12"]').getAttribute('data-depth'), '2');
  await pick('all');
  assert.deepEqual(searches(), ['?nodeId=l1&depth=99']);
  assert.equal(rowsOf(card).length, 5);
  await pick('0');
  assert.equal(treeCalls().length, 0, 'closing to lines asks for nothing');
  assert.deepEqual(rowsOf(card), []);
  assert.equal(card.querySelectorAll('[data-testid="tree-line"]').length, 2, 'the lines stay');
  await pick('1');
  assert.deepEqual(rowsOf(card), ['p10', 'p20']);
  await React.act(() => root.unmount());
});
await check('tree: an unreleased line says so and has nothing to open; Production links', async () => {
  window.localStorage.clear();
  const { root, card } = await openRisky();
  const un = card.querySelector('[data-testid="tree-line"][data-released="false"]');
  assert.match(un.querySelector('[data-testid="tree-unreleased"]').textContent, /Not released yet — nothing to track below the line/);
  assert.equal(un.querySelector('[data-testid="tree-line-head"]').getAttribute('aria-expanded'), null);
  requests.length = 0;
  await click(un.querySelector('[data-testid="tree-line-head"]'));
  assert.equal(treeCalls().length, 0);
  const hrefs = [...card.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  assert.ok(hrefs.some((h) => /\/orders\/100\?tab=production$/.test(h)), 'order-level link');
  assert.ok(hrefs.some((h) => /\/orders\/100\?tab=production&line=1$/.test(h)), 'line link');
  await React.act(() => root.unmount());
});
await check('tree: a code opens the piece drawer; a line collapses and reopens', async () => {
  window.localStorage.clear();
  const { root, card } = await openRisky();
  requests.length = 0;
  await click(card.querySelector('[data-node="p20"] [data-testid="tree-code"]'));
  assert.ok(requests.some((r) => r.includes('/tracker/tree/node?nodeId=p20')), requests.join('\n'));
  assert.ok(document.querySelector('.MuiDrawer-root'), 'drawer open');
  assert.match(document.querySelector('.MuiDrawer-root').textContent, /SPAN1-S2/);
  await click(document.querySelector('.MuiDrawer-root [aria-label="Close"]'));
  await click(card.querySelector('[data-testid="tree-line-head"]'));
  assert.deepEqual(rowsOf(card), []);
  await click(card.querySelector('[data-testid="tree-line-head"]'));
  assert.deepEqual(rowsOf(card), ['p10', 'p20']);
  await React.act(() => root.unmount());
});
await check('tree: what is open is remembered per order on the device', async () => {
  window.localStorage.clear();
  const first = await openRisky();
  await click(first.card.querySelector('[data-node="p10"]'));
  const saved = JSON.parse(window.localStorage.getItem('cf_erp.dash.tree.100'));
  assert.ok(saved.open.includes('l1') && saved.open.includes('p10'), JSON.stringify(saved));
  assert.equal(window.localStorage.getItem('cf_erp.dash.tree.102'), null);
  await React.act(() => first.root.unmount());
  const { root, card } = await openRisky();
  assert.deepEqual(rowsOf(card), ['p10', 'p11', 'p13', 'p20'], 'comes back as it was');
  await React.act(() => root.unmount());
  window.localStorage.setItem('cf_erp.dash.tree.100', '{not json');
  const bad = await openRisky();
  assert.deepEqual(rowsOf(bad.card), ['p10', 'p20'], 'junk in storage falls back to the default');
  await React.act(() => bad.root.unmount());
  window.localStorage.clear();
});
await check('tree: a failed read says so on the line and can be tried again', async () => {
  window.localStorage.clear();
  const real = globalThis.fetch;
  let fail = true;
  globalThis.fetch = async (url) => (fail && String(url).includes('/tracker/tree/children') ? { ok: false, status: 500, text: async () => JSON.stringify({ message: 'boom' }) } : real(url));
  const { root, card } = await openRisky();
  assert.match(card.querySelector('[data-testid="tree-error"]').textContent, /Could not read this line/);
  fail = false;
  await click(card.querySelector('[data-testid="tree-error"] button'));
  assert.equal(card.querySelectorAll('[data-testid="tree-error"]').length, 0);
  assert.deepEqual(rowsOf(card), ['p10', 'p20']);
  globalThis.fetch = real;
  await React.act(() => root.unmount());
  window.localStorage.clear();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 50);
