// Run from multi_app_fe: node scripts/cf_erp_plate_change_test.mjs
// Plate changes after a purchase order, approved by the MD (init.sql §62, 2026-10-16, CF_ERP_NESTING_V2.md): the lib
// (lib/plateChange.ts), the gate every plate save goes through (PlateChangeProvider.submit: the reason dialog once a PO
// covers the line, the impact sheet after; no PO → the save with `impact: true` and the "what changed" sheet; a server
// that asks for a reason → the dialog; `tryFirst`), the impact sheet, a request card (approve / reject / withdraw, the
// buyer's checklist), the panel on the Nesting screen (held / covered), and the Plate changes page across orders.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/plate-changes', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  try { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true }); } catch { /* skip */ }
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20, toJSON() { return {}; } });

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
      export { PlateChangeProvider, PlateChangeCard, ImpactSheet, PlateChangesPanel } from './src/apps/cf_erp/components/Nesting/PlateChange';
      export { usePlateChange } from './src/apps/cf_erp/components/Nesting/plateChangeContext';
      export { default as PlateChangesPage } from './src/apps/cf_erp/pages/PlateChanges';
      export { metricRows, plateLines, checklistProgress, checklistFacts, statusBadge, askedWords, plateSize } from './src/apps/cf_erp/lib/plateChange';
      export { isRequested, directImpact } from './src/apps/cf_erp/api/plateChanges';
      export { SECTIONS } from './src/apps/cf_erp/navMeta';`,
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
const artifact = resolve(cache, `plate-change-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const M = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter } = M;
const inRouter = (el, path = '/testco/cf_erp/orders/1') => React.createElement(MemoryRouter, { initialEntries: [path] }, el);

let passed = 0, failed = 0;
let root = null;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); try { if (root) await React.act(async () => { root.unmount(); }); } catch { /* gone */ } root = null; document.body.innerHTML = ''; } };
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
const $ = (id) => document.querySelector(`[data-testid=${id}]`);
const $$ = (id) => [...document.querySelectorAll(`[data-testid=${id}]`)];
const click = async (el, what) => { assert.ok(el, `no ${what}`); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await settle(); };
const typeInto = async (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
  await React.act(async () => { setter.call(el, value); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(0); });
  await settle();
};
const host = () => { const d = document.createElement('div'); document.body.appendChild(d); return d; };
const mountEl = async (el) => { root = createRoot(host()); await React.act(async () => { root.render(el); await sleep(0); }); };
const unmount = async () => { if (root) await React.act(async () => { root.unmount(); }); root = null; document.body.innerHTML = ''; };

/* ---- fixtures: an impact sheet as the server writes it -------------------------------------- */
const metricsOf = (o) => ({ plates: 2, pieces: 40, tonnesBought: 2.663, partsTonnes: 1.9, wasteKg: 763, wastePct: 28.65, offcutKg: 410, offcuts: 3, cost: { value: 165106, basis: 'list price', reason: null }, ...o });
const PL = (id, code, t, l, w, count, extra = {}) => ({ plateItemId: id, code, name: code, thickness: t, length: l, width: w, grade: 'E350', count, kg: 1, ...extra });
const impact = {
  kind: 'upload', kindLabel: 'Save nesting files', direct: false, reason: 'Customer revised the nesting.', requestedBy: { id: 15, name: 'Ravi' },
  plates: {
    before: [PL(1, 'PL-12X2000X6000', 12, 6000, 2000, 1), PL(2, 'PL-12X1500X3000', 12, 3000, 1500, 1)],
    after: [PL(2, 'PL-12X1500X3000', 12, 3000, 1500, 4)],
    added: [], removed: [PL(1, 'PL-12X2000X6000', 12, 6000, 2000, 1, { from: 1, to: 0 })], changed: [PL(2, 'PL-12X1500X3000', 12, 3000, 1500, 4, { from: 1, to: 4 })],
    same: false, words: [],
  },
  before: metricsOf(),
  after: metricsOf({ plates: 4, tonnesBought: 3.198, wasteKg: 1298, wastePct: 40.59, offcutKg: 900, cost: { value: 198270, basis: 'list price', reason: null } }),
  delta: { plates: 2, pieces: 0, tonnesBought: 0.535, partsTonnes: 0, wasteKg: 535, wastePct: 11.94, offcutKg: 490, cost: 33164 },
  choice: null,
  buying: {
    purchaseOrders: [{ id: 101, code: 'PO-000101', status: 'ordered' }],
    items: [
      { itemId: 1, code: 'PL-12X2000X6000', name: 'Plate', uom: 'nos', plate: true, needBefore: 1, needAfter: 0, change: -1, ordered: 1, received: 0, held: 0, onOrder: [{ poId: 101, poCode: 'PO-000101', status: 'ordered', purchaseLineId: 5, quantity: 1, received: 0 }] },
      { itemId: 2, code: 'PL-12X1500X3000', name: 'Plate', uom: 'nos', plate: true, needBefore: 1, needAfter: 4, change: 3, ordered: 1, received: 1, held: 1, onOrder: [{ poId: 101, poCode: 'PO-000101', status: 'ordered', purchaseLineId: 6, quantity: 1, received: 1 }] },
    ],
    plates: { ordered: 2, received: 1, held: 1 },
    text: 'On order for this line: PO-000101. Plates ordered 2, received 1, held 1.',
  },
  sentence: '2 plates more · 0.535 t more steel · ₹33,164 more. Waste 28.7% → 40.6%.',
};
const checklist = {
  open: 2,
  items: [
    { ...impact.buying.items[0], actions: [{ key: 'i1-1', kind: 'reduce', quantity: 1, poId: 101, poCode: 'PO-000101', purchaseLineId: 5, text: "Reduce PO-000101's PL-12X2000X6000 line by 1 nos.", done: false, doneBy: null, doneAt: null }], note: null },
    { ...impact.buying.items[1], actions: [{ key: 'i2-1', kind: 'add', quantity: 3, poId: 101, poCode: 'PO-000101', purchaseLineId: 6, text: 'Add 3 nos to PO-000101 (PL-12X1500X3000).', done: false, doneBy: null, doneAt: null }], note: null },
  ],
};
const request = (o = {}) => ({
  id: 7, code: 'PC-000007', kind: 'upload', kindLabel: 'Save nesting files', status: 'pending', statusLabel: 'Waiting for approval', stale: false,
  reason: 'Customer revised the nesting.', order: { id: 1, code: 'SO260009' }, line: { id: 1, lineNo: 1, name: 'Span' },
  requestedBy: { id: 15, name: 'Ravi' }, requestedAt: '2026-10-16T05:00:00.000Z', decidedBy: null, decidedAt: null, decisionNote: null, appliedAt: null,
  impact, checklist: null, canApprove: true, whyNotApprove: null, canReject: true, canWithdraw: true, canTick: false, ...o,
});

/* ---- the server, stubbed -------------------------------------------------------------------- */
let gate = { covered: false, purchaseOrders: [], needsApproval: false, held: false, pending: null, message: null };
let lineRequests = [];
let saveReply = null;
const calls = [];
const bodies = [];
const reply = (out, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(out) });
const reset = () => { gate = { covered: false, purchaseOrders: [], needsApproval: false, held: false, pending: null, message: null }; lineRequests = []; saveReply = null; calls.length = 0; bodies.length = 0; };
const metrics = { lots: 1, plates: 1, pieces: 2, areaBought: 4500000, usedArea: 1000000, wasteArea: 3500000, wastePct: 77.8, weightKg: 500, wasteKg: 389, thickness: 12 };
const plan = {
  line: { id: 1, lineNo: 1, orderId: 1, orderCode: 'SO260009', quantity: 1, orderStatus: 'confirmed' }, saved: true, basis: 'saved plan', manual: [], sizeAdvice: [], problems: [], drift: [],
  groups: [{ key: 'g1', nests: [], unplaced: [], candidates: [], metrics, kerfMm: 3, seqGapMinMm: 10, seqGapMaxMm: 20, settingsBasis: '', cutPlates: [] }],
  totals: { ...metrics, groups: 1, unplaced: 0 }, coverage: [],
};
globalThis.fetch = async (url, o = {}) => {
  const method = o.method || 'GET';
  const u = String(url);
  calls.push(`${method} ${u}`);
  const body = o.body ? JSON.parse(o.body) : null;
  if (body) bodies.push({ url: u, method, body });
  if (u.includes('/nesting/plate-changes')) return reply({ line: { id: 1 }, gate, canApprove: true, requests: lineRequests });
  if (u.includes('/plate-changes?status=')) return reply({ status: 'pending', counts: { pending: 1, stale: 0, approved: 0 }, canApprove: true, requests: [request()] });
  const act = /\/plate-changes\/(\d+)\/(approve|reject|withdraw|checklist)$/.exec(u);
  if (act) {
    if (act[2] === 'approve') return reply(request({ status: 'approved', statusLabel: 'Approved — buyer to act', canApprove: false, canReject: false, canWithdraw: false, checklist, decisionNote: body.note ?? null, decidedBy: { id: 16, name: 'MD' } }));
    if (act[2] === 'reject') return reply(request({ status: 'rejected', statusLabel: 'Rejected', canApprove: false, canReject: false, canWithdraw: false, decisionNote: body.note }));
    if (act[2] === 'withdraw') return reply(request({ status: 'withdrawn', statusLabel: 'Withdrawn', canApprove: false, canReject: false, canWithdraw: false }));
    const items = checklist.items.map((x) => ({ ...x, actions: x.actions.map((a) => (a.key === body.key ? { ...a, done: body.done, doneBy: body.done ? { id: 16, name: 'Buyer' } : null } : a)) }));
    return reply(request({ status: 'approved', statusLabel: 'Approved — buyer to act', canApprove: false, canReject: false, canWithdraw: false, canTick: true, checklist: { items, open: 1 } }));
  }
  if (u.includes('/fake-save')) return saveReply ? saveReply(body) : reply({ applied: true, message: 'Saved.' });
  if (u.endsWith('/nesting/files')) return reply({ line: { id: 1 }, canUpload: true, readOnlyReason: null, limits: { maxFiles: 200, maxFileBytes: 4194304, kinds: ['dxf', 'nif'] }, plates: [], coverage: [], leftOver: [], totals: null });
  if (u.includes('/nesting/runs/current')) return reply({ status: 'none' });
  if (u.includes('/nesting/choices')) return { ok: false, status: 404, text: async () => '{}' };
  return reply(plan);
};

/** A save button wired the way the Nesting screen wires its saves. */
let lastOut;
function Harness({ opts }) {
  const pc = M.usePlateChange();
  const [out, setOut] = React.useState('none');
  const go = async () => {
    try {
      const r = await pc.submit('Take the plate off', (f) => globalThis.fetch('/api/testco/cf_erp/fake-save', { method: 'POST', body: JSON.stringify({ lotId: 5, ...f }) })
        .then(async (res) => { const t = JSON.parse(await res.text()); if (!res.ok) { const e = new Error(t.message); e.code = t.code; throw e; } return t; }), opts);
      lastOut = r; setOut(r == null ? 'null' : 'saved');
    } catch (e) { setOut(`error ${e.code}`); }
  };
  return React.createElement('div', null,
    React.createElement('button', { 'data-testid': 'harness-save', onClick: go }, 'Save'),
    React.createElement('span', { 'data-testid': 'harness-out' }, out));
}
const mountHarness = (opts = {}) => mountEl(inRouter(React.createElement(M.PlateChangeProvider, { orderId: 1, lineId: 1 }, React.createElement(Harness, { opts }))));

/* ---- the lib -------------------------------------------------------------------------------- */
await check('lib: the before / after / difference rows — plates, steel, parts, waste with offcuts, cost; worse in red', async () => {
  const rows = Object.fromEntries(M.metricRows(impact).map((r) => [r.key, r]));
  assert.deepEqual([rows.plates.before, rows.plates.after, rows.plates.diff, rows.plates.worse], ['2', '4', '+2', true]);
  assert.deepEqual([rows.steel.before, rows.steel.after, rows.steel.diff], ['2.663 t', '3.198 t', '+0.535 t']);
  assert.equal(rows.parts.diff, '0');
  assert.equal(rows.waste.before, '763 kg · 28.6%');
  assert.equal(rows.waste.diff, '+535 kg · +11.9%');
  assert.match(rows.waste.hint, /Offcuts count as waste/);
  assert.deepEqual([rows.cost.before, rows.cost.after, rows.cost.diff, rows.cost.worse], ['₹1,65,106', '₹1,98,270', '+₹33,164', true]);
  const cheaper = Object.fromEntries(M.metricRows({ ...impact, delta: { ...impact.delta, plates: -1, cost: -500 } }).map((r) => [r.key, r]));
  assert.deepEqual([cheaper.plates.diff, cheaper.plates.worse, cheaper.cost.diff, cheaper.cost.worse], ['−1', false, '−₹500', false]);
  const unpriced = Object.fromEntries(M.metricRows({ ...impact, after: metricsOf({ cost: { value: null, basis: null, reason: 'No cost for PL-X: it has never been received or bought and has no list price.' } }), delta: { ...impact.delta, cost: null, costReason: 'No cost for PL-X.' } }).map((r) => [r.key, r]));
  assert.deepEqual([unpriced.cost.after, unpriced.cost.diff, unpriced.cost.hint], ['not costed', 'not costed', 'No cost for PL-X.']);
});

await check('lib: plate lines, sizes, the checklist progress and facts, the badge, "Asked by …"', async () => {
  assert.deepEqual(M.plateLines(impact).map((l) => [l.tone, l.text]), [['remove', '−1 × PL-12X2000X6000 (12 mm × 6,000 × 2,000)'], ['change', 'PL-12X1500X3000 (12 mm × 3,000 × 1,500): 1 → 4']]);
  assert.equal(M.plateSize({ thickness: 14.137, length: 3000, width: 1500 }), '14.137 mm × 3,000 × 1,500');
  assert.equal(M.checklistProgress(checklist).text, '0 of 2 done');
  assert.equal(M.checklistProgress({ items: [{ actions: [] }], open: 0 }).text, 'Nothing to change on the purchase orders');
  assert.equal(M.checklistFacts(checklist.items[1]), 'Need 1 → 4 · PO-000101: 1 (1 received) · held 1');
  assert.deepEqual(M.statusBadge({ status: 'pending', stale: true, statusLabel: 'Waiting for approval' }), { family: 'danger', label: 'Out of date' });
  assert.deepEqual(M.statusBadge({ status: 'applied', stale: false, statusLabel: 'Done' }), { family: 'success', label: 'Done' });
  assert.equal(M.askedWords({ requestedBy: { name: 'Ravi' }, requestedAt: '2026-10-16T05:00:00.000Z' }), 'Asked by Ravi on 16 Oct 2026');
  assert.equal(M.isRequested({ requested: true, plateChange: {} }), true);
  assert.equal(M.isRequested({ applied: true }), false);
  assert.equal(M.directImpact({ plateChange: { direct: true, impact: { ...impact, plates: { ...impact.plates, same: true } } } }), null, 'no plate moved: no sheet');
});

await check('nav: "Plate changes" sits under Purchase, for the MD or the buyer', async () => {
  const s = M.SECTIONS.find((x) => x.key === 'purchase').screens.find((x) => x.key === 'plate-changes');
  assert.equal(s.path, 'plate-changes');
  assert.equal(s.permission, 'cf_erp_plate_change_approve|cf_erp_inventory_manage');
});

/* ---- the gate ------------------------------------------------------------------------------- */
await check('no PO: the save is sent with impact: true and goes through; the "Saved — what changed" sheet shows the before / after', async () => {
  reset();
  saveReply = () => reply({ applied: true, message: 'Off.', plateChange: { direct: true, impact: { ...impact, direct: true, reason: null } } });
  await mountHarness();
  await waitFor(() => calls.some((c) => c.includes('/nesting/plate-changes')), 'the gate read');
  await click($('harness-save'), 'save');
  await waitFor(() => $('harness-out').textContent === 'saved', 'saved');
  assert.deepEqual(bodies.find((b) => b.url.includes('fake-save')).body, { lotId: 5, impact: true });
  await waitFor(() => $('plate-change-sheet'), 'the sheet');
  assert.match($('plate-change-sheet').textContent, /Saved — what changed/);
  assert.match($('plate-change-sheet').textContent, /No purchase order covers this line yet, so it was saved straight away/);
  assert.equal($('impact-sentence').textContent, impact.sentence);
  assert.equal($('plate-change-reason'), null, 'no reason was asked');
  await unmount();
});

await check('`impact: false` (a change that moves no plate): the body is the save\'s own, and no sheet', async () => {
  reset();
  await mountHarness({ impact: false });
  await waitFor(() => calls.some((c) => c.includes('/nesting/plate-changes')), 'the gate read');
  await click($('harness-save'), 'save');
  await waitFor(() => $('harness-out').textContent === 'saved', 'saved');
  assert.deepEqual(bodies.find((b) => b.url.includes('fake-save')).body, { lotId: 5 });
  assert.equal($('plate-change-sheet'), null);
  await unmount();
});

await check('a PO covers the line: the reason is asked first (Send waits for it); the request comes back; the sheet says it was sent', async () => {
  reset();
  gate = { covered: true, purchaseOrders: [{ id: 101, code: 'PO-000101', status: 'ordered' }], needsApproval: true, held: false, pending: null, message: 'A purchase order covers this line (PO-000101). A change to its plates goes to the MD for approval.' };
  saveReply = (b) => reply({ requested: true, applied: false, plateChange: request({ reason: b.reason }), message: 'Sent for approval as PC-000007.' });
  await mountHarness();
  await waitFor(() => calls.some((c) => c.includes('/nesting/plate-changes')), 'the gate read');
  await settle(50);
  await click($('harness-save'), 'save');
  await waitFor(() => $('plate-change-reason'), 'the reason dialog');
  assert.match($('plate-change-why').textContent, /PO-000101/);
  assert.equal(bodies.filter((b) => b.url.includes('fake-save')).length, 0, 'nothing sent before the reason');
  assert.ok($('plate-change-send').disabled, 'Send waits for a reason');
  await typeInto($('plate-change-reason-input'), 'Supplier has no 11 mm.');
  assert.ok(!$('plate-change-send').disabled);
  await click($('plate-change-send'), 'send');
  await waitFor(() => $('harness-out').textContent === 'null', 'resolved null (nothing saved)');
  assert.deepEqual(bodies.find((b) => b.url.includes('fake-save')).body, { lotId: 5, reason: 'Supplier has no 11 mm.' });
  await waitFor(() => $('plate-change-sheet'), 'the sheet');
  assert.match($('plate-change-sheet').textContent, /Sent for approval · PC-000007/);
  assert.match($('plate-change-sheet').textContent, /Nothing is saved until it is approved/);
  assert.ok($('impact-table'), 'with the figures');
  await unmount();
});

await check('cancel the reason: nothing is sent, the save resolves null', async () => {
  reset();
  gate = { covered: true, purchaseOrders: [{ id: 101, code: 'PO-000101', status: 'ordered' }], needsApproval: true, held: false, pending: null, message: 'covered' };
  await mountHarness();
  await waitFor(() => calls.some((c) => c.includes('/nesting/plate-changes')), 'the gate read');
  await settle(50);
  await click($('harness-save'), 'save');
  await waitFor(() => $('plate-change-reason'), 'the reason dialog');
  const cancel = [...$('plate-change-reason').querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel');
  await click(cancel, 'cancel');
  await waitFor(() => $('harness-out').textContent === 'null', 'resolved null');
  assert.equal(bodies.filter((b) => b.url.includes('fake-save')).length, 0);
  await unmount();
});

await check('the screen thought there was no PO, the server asks for a reason (PLATE_CHANGE_REASON): the dialog opens, then it is sent', async () => {
  reset();
  saveReply = (b) => (b.reason ? reply({ requested: true, applied: false, plateChange: request(), message: 'Sent.' })
    : reply({ code: 'PLATE_CHANGE_REASON', message: 'A purchase order covers this line (PO-000101). A change to its plates goes to the MD for approval. Say why the change is needed.' }, 422));
  await mountHarness();
  await waitFor(() => calls.some((c) => c.includes('/nesting/plate-changes')), 'the gate read');
  await click($('harness-save'), 'save');
  await waitFor(() => $('plate-change-reason'), 'the reason dialog');
  await typeInto($('plate-change-reason-input'), 'Re-nested to save steel.');
  await click($('plate-change-send'), 'send');
  await waitFor(() => $('harness-out').textContent === 'null', 'sent');
  assert.equal(bodies.filter((b) => b.url.includes('fake-save')).length, 2);
  await unmount();
});

await check('`tryFirst` with a PO: sent without a reason first — the server let it through (pieces cut from offcuts that change no plate)', async () => {
  reset();
  gate = { covered: true, purchaseOrders: [{ id: 101, code: 'PO-000101', status: 'ordered' }], needsApproval: true, held: false, pending: null, message: 'covered' };
  await mountHarness({ tryFirst: true, impact: false });
  await waitFor(() => calls.some((c) => c.includes('/nesting/plate-changes')), 'the gate read');
  await settle(50);
  await click($('harness-save'), 'save');
  await waitFor(() => $('harness-out').textContent === 'saved', 'saved directly');
  assert.deepEqual(bodies.find((b) => b.url.includes('fake-save')).body, { lotId: 5 });
  assert.equal($('plate-change-reason'), null);
  void lastOut;
  await unmount();
});

/* ---- a request ------------------------------------------------------------------------------ */
await check('the impact sheet: sentence, why, the plates that change, the table, and what is on order', async () => {
  reset();
  await mountEl(React.createElement(M.ImpactSheet, { impact }));
  assert.equal($('impact-sentence').textContent, impact.sentence);
  assert.match($('impact-sheet').textContent, /Why: Customer revised the nesting\. — Ravi/);
  assert.match($('impact-plates').textContent, /−1 × PL-12X2000X6000 \(12 mm × 6,000 × 2,000\)/);
  assert.match($('impact-cost').textContent, /₹1,65,106.*₹1,98,270.*\+₹33,164/);
  assert.match($('impact-waste').textContent, /763 kg · 28.6%.*1,298 kg · 40.6%/);
  assert.equal($('impact-buying').textContent, 'On order for this line: PO-000101. Plates ordered 2, received 1, held 1.');
  assert.equal($$('impact-item').length, 2);
  assert.match($$('impact-item')[1].textContent, /PL-12X1500X3000.*PO-000101.*1.*4.*1.*1.*1/);
  await unmount();
});

await check('a pending request: Approve (with a note) sends it and shows the buyer checklist; the buyer ticks a line', async () => {
  reset();
  let latest = request();
  const Host = () => {
    const [r, setR] = React.useState(latest);
    latest = r;
    return React.createElement(M.PlateChangeCard, { request: r, onChanged: setR, defaultOpen: true });
  };
  await mountEl(inRouter(React.createElement(Host)));
  assert.match($('plate-change-card').textContent, /PC-000007.*Waiting for approval.*Save nesting files/);
  await click($('plate-change-approve'), 'approve');
  const note = document.querySelector('textarea');
  await typeInto(note, 'Go ahead.');
  const confirm = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Approve and save');
  await click(confirm, 'approve and save');
  await waitFor(() => $('plate-change-checklist'), 'the checklist');
  assert.deepEqual(bodies.find((b) => b.url.endsWith('/plate-changes/7/approve')).body, { note: 'Go ahead.' });
  assert.match($('plate-change-checklist').textContent, /For the buyer · 0 of 2 done/);
  assert.match($('plate-change-checklist').textContent, /Reduce PO-000101's PL-12X2000X6000 line by 1 nos\./);
  assert.match($('plate-change-checklist').textContent, /Add 3 nos to PO-000101 \(PL-12X1500X3000\)\./);
  assert.match($('plate-change-checklist').textContent, /The purchase orders are not changed by themselves/);
  assert.equal($('plate-change-approve'), null, 'decided: no Approve');
  // Not the buyer: the boxes are off. Give the card the buyer's grant and tick one.
  assert.ok($$('checklist-action')[0].querySelector('input').disabled);
  await unmount();
  latest = request({ status: 'approved', statusLabel: 'Approved — buyer to act', canApprove: false, canReject: false, canWithdraw: false, canTick: true, checklist });
  await mountEl(inRouter(React.createElement(Host)));
  await click($$('checklist-action')[1].querySelector('input'), 'tick');
  await waitFor(() => bodies.some((b) => b.url.endsWith('/plate-changes/7/checklist')), 'the tick');
  assert.deepEqual(bodies.find((b) => b.url.endsWith('/plate-changes/7/checklist')).body, { key: 'i2-1', done: true });
  await waitFor(() => /1 of 2 done/.test($('plate-change-checklist').textContent), 'progress');
  await unmount();
});

await check('the asker sees why they cannot approve; reject needs a note; withdraw', async () => {
  reset();
  let r = request({ canApprove: false, whyNotApprove: 'You asked for this change — somebody else has to approve it.' });
  const Host = () => { const [x, setX] = React.useState(r); r = x; return React.createElement(M.PlateChangeCard, { request: x, onChanged: setX }); };
  await mountEl(inRouter(React.createElement(Host)));
  assert.equal($('plate-change-approve'), null);
  assert.equal($('plate-change-why-not').textContent, 'You asked for this change — somebody else has to approve it.');
  await click($('plate-change-reject'), 'reject');
  const rejectBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Reject' && b.closest('[role=dialog]'));
  assert.ok(rejectBtn.disabled, 'a note is needed');
  await typeInto(document.querySelector('[role=dialog] textarea'), 'We need that plate.');
  await click(rejectBtn, 'reject');
  await waitFor(() => /Rejected/.test($('plate-change-card').textContent), 'rejected');
  assert.match($('plate-change-card').textContent, /Rejected: We need that plate\./);
  await unmount();
  r = request();
  await mountEl(inRouter(React.createElement(Host)));
  await click($('plate-change-withdraw'), 'withdraw');
  await click([...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Withdraw'), 'withdraw');
  await waitFor(() => /Withdrawn/.test($('plate-change-card').textContent), 'withdrawn');
  await unmount();
});

await check('an out-of-date request says so, in words', async () => {
  reset();
  await mountEl(inRouter(React.createElement(M.PlateChangeCard, { request: request({ stale: true, canApprove: false, whyNotApprove: "The line's plates or its buying changed after it was asked. Withdraw it and ask again." }), onChanged: () => {} })));
  assert.match($('plate-change-card').textContent, /Out of date/);
  assert.match($('plate-change-card').textContent, /It cannot be approved\. Withdraw it and ask again\./);
  await unmount();
});

/* ---- the Nesting screen --------------------------------------------------------------------- */
await check('the Nesting screen: a line a PO covers says so; a held line says which request holds it, and lists it', async () => {
  reset();
  gate = { covered: true, purchaseOrders: [{ id: 101, code: 'PO-000101', status: 'ordered' }], needsApproval: true, held: false, pending: null, message: 'A purchase order covers this line (PO-000101). A change to its plates goes to the MD for approval.' };
  await mountEl(inRouter(React.createElement(M.NestingPanel, { orderId: 1, lineId: 1, canManage: true })));
  await waitFor(() => $('plate-change-covered'), 'the covered note');
  assert.match($('plate-change-covered').textContent, /PO-000101/);
  await unmount();
  gate = { ...gate, held: true, pending: { id: 7, code: 'PC-000007', kindLabel: 'Save nesting files', reason: 'x', requestedBy: { id: 15, name: 'Ravi' }, stale: false },
    message: 'Plate change PC-000007 is waiting for approval on line 1 of SO260009 (asked by Ravi: "x"). Nesting is held until it is approved, rejected or withdrawn.' };
  lineRequests = [request()];
  await mountEl(inRouter(React.createElement(M.NestingPanel, { orderId: 1, lineId: 1, canManage: true })));
  await waitFor(() => $('plate-change-held'), 'the held banner');
  assert.match($('plate-change-held').textContent, /PC-000007 is waiting for approval.*Nesting is held/);
  assert.equal($$('plate-change-card').length, 1);
  await unmount();
});

await check('no PO and no request: the Nesting screen shows nothing about plate changes', async () => {
  reset();
  await mountEl(inRouter(React.createElement(M.NestingPanel, { orderId: 1, lineId: 1, canManage: true })));
  await waitFor(() => calls.some((c) => c.includes('/nesting/plate-changes')), 'the gate read');
  await settle(50);
  assert.equal($('plate-changes-panel'), null);
  await unmount();
});

/* ---- the page ------------------------------------------------------------------------------- */
await check('the Plate changes page: waiting for approval by default, each request with its order and line', async () => {
  reset();
  await mountEl(inRouter(React.createElement(M.PlateChangesPage), '/testco/cf_erp/plate-changes'));
  await waitFor(() => $('plate-changes-list'), 'the list');
  assert.ok(calls.some((c) => c.includes('/plate-changes?status=pending')));
  assert.match($('plate-changes-list').textContent, /PC-000007.*SO260009 · line 1/);
  assert.ok($('plate-change-approve'), 'approvable here');
  await unmount();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
