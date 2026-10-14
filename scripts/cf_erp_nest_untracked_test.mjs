// Run from multi_app_fe: node scripts/cf_erp_nest_untracked_test.mjs
// "Mark the rest as cut from untracked offcuts" (init.sql §61, 2026-10-14, CF_ERP_NESTING_V2.md): the left-over banner's
// third button, the dialog (left-over cut pieces by short name — size + part — with pieces, kg and cost at the plate rate,
// all ticked; untick some; Mark n pieces), the line on the plan ("n pieces · x kg cut from untracked offcuts") with Undo,
// a refusal in the server's words, the upload review saying a mark shrinks, the costs (NestMoney, OrderCostsCard), the
// read-only states, and the lib helpers (leftOverOf, untrackedLine, untrackedRequest).
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
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
      export { NestFilesDialog } from './src/apps/cf_erp/components/Nesting/NestFilesDialog';
      export { OrderCostsCard } from './src/apps/cf_erp/components/OrderCostsCard';
      export { leftOverOf, untrackedLine, untrackedRequest, UNTRACKED_WORDS } from './src/apps/cf_erp/lib/nesting';`,
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
const artifact = resolve(cache, `nest-untracked-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const { React, createRoot, MemoryRouter, NestingPanel, NestFilesDialog, OrderCostsCard, leftOverOf, untrackedLine, untrackedRequest, UNTRACKED_WORDS } = await import(pathToFileURL(artifact));
await unlink(artifact);
const inRouter = (el) => React.createElement(MemoryRouter, null, el);

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
const text = () => document.body.textContent;
const $ = (id) => document.querySelector(`[data-testid=${id}]`);
const $$ = (id) => [...document.querySelectorAll(`[data-testid=${id}]`)];
const click = async (el, what) => { assert.ok(el, `no ${what}`); await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await sleep(0); }); await settle(); };

/* ---- the server, stubbed -------------------------------------------------------------------- */
const CODE = (s) => `SO260009-1-${s}-E350`;
const metrics = { lots: 1, plates: 1, pieces: 2, areaBought: 4500000, usedArea: 1000000, wasteArea: 3500000, wastePct: 77.8, weightKg: 500, wasteKg: 389, thickness: 12 };
const nest = {
  id: 5928, lotNo: '12MM-N01', plateItemId: 1, plateCode: 'PL-12', plateName: 'PL 12', source: 'catalog', thickness: 12, grade: 'E350', material: 'MS', density: 7850,
  length: 3000, width: 1500, requiredLength: null, requiredWidth: null, sheetArea: 4500000, usedArea: 1000000, wasteArea: 3500000, wastePct: 77.8, weightKg: 500, wasteKg: 389,
  sequences: [], origin: 'imported', verdict: 'fits', hasLayout: true, sourceKind: 'pronest', sourceFile: '12MM.nif', layoutOrigin: 'customer',
  pieces: [{ id: 1, cutPlateId: 10, cutPlateCode: CODE('12X380X1400'), seqNo: 1, rowNo: 1, posNo: 1, x: 20, y: 20, length: 1400, width: 380, rotated: false, rotationDeg: 0, mirrored: false, placedBy: 'customer' }],
};
const coverage = (packMarked) => [
  { cutPlateId: 10, cutPlateCode: CODE('12X380X1400'), needed: 1, nested: 1, diff: 0, untracked: 0, leftOver: 0 },
  { cutPlateId: 20, cutPlateCode: CODE('12X125X125'), needed: 144, nested: 0, diff: -144, untracked: packMarked, leftOver: 144 - packMarked },
  { cutPlateId: 30, cutPlateCode: CODE('10X100X200'), needed: 29, nested: 0, diff: -29, untracked: 0, leftOver: 29, manual: true },
];
const planOf = (packMarked) => ({
  line: { id: 1, lineNo: 1, orderId: 1, orderCode: 'SO260009', quantity: 1, orderStatus: 'confirmed' }, saved: true, basis: 'saved plan', manual: [], sizeAdvice: [], problems: [], drift: [],
  groups: [{ key: 'g1', nests: [nest], unplaced: [], candidates: [], metrics, kerfMm: 3, seqGapMinMm: 10, seqGapMaxMm: 20, settingsBasis: '', cutPlates: [] }],
  totals: { ...metrics, groups: 1, unplaced: 0 },
  coverage: coverage(packMarked),
  untracked: packMarked ? { pieces: packMarked, kg: packMarked * 1.472, cutPieces: [{ cutPlateId: 20, code: CODE('12X125X125'), name: 'cp', qty: packMarked, kgEach: 1.472, kg: packMarked * 1.472 }] } : { pieces: 0, kg: 0, cutPieces: [] },
});
const row = (id, size, part, mark, qty, kgEach, extra = {}) => ({
  cutPlateId: id, code: CODE(size), name: 'cut piece', thickness: 12, length: 1, width: 1, grade: 'E350', parts: [{ name: part, mark }],
  needed: qty, nested: 0, untracked: 0, qty, kgEach, kg: Math.round(kgEach * qty * 1000) / 1000,
  ratePlate: { id: 7, code: 'PL-12X2500X6300-E350', name: 'Plate' }, rate: { perKg: 62, basis: 'average cost' }, cost: Math.round(kgEach * qty * 62 * 100) / 100, heldBack: false, ...extra,
});
const stateOf = (marked) => {
  const left = [row(20, '12X125X125', 'Packing plate', 'PK1', 144 - marked, 1.472), row(30, '10X100X200', 'Shim', 'SH2', 29, 1.57, { heldBack: true, rate: null, cost: null })].filter((r) => r.qty > 0);
  const m = marked ? [row(20, '12X125X125', 'Packing plate', 'PK1', marked, 1.472)] : [];
  const t = (rs) => ({ pieces: rs.reduce((a, r) => a + r.qty, 0), kg: rs.reduce((a, r) => a + r.kg, 0), cost: rs.reduce((a, r) => a + (r.cost ?? 0), 0), uncostedPieces: rs.reduce((a, r) => a + (r.cost == null ? r.qty : 0), 0) });
  return { line: { id: 1 }, canMark: true, readOnlyReason: null, leftOver: left, marked: m, totals: { leftOver: t(left), marked: t(m) }, summary: marked ? `${marked} pieces · ${Math.round(marked * 1.472)} kg cut from untracked offcuts` : null };
};
let marked = 0;
let markReply = null;
const calls = [];
const posts = [];
const reply = (out, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(out) });
const costsOf = () => ({
  order: { id: 1, code: 'SO260009', revision: 0, customer: null },
  lines: [{ line: { id: 1, lineNo: 1, orderId: 1, revision: 0, item: { id: 1, code: 'SPAN', name: 'Span' } },
    issued: { value: 0, quantity: 0, uncostedRows: 0 }, customerIssued: { value: 0, quantity: 0, uncostedRows: 0 }, scrap: { value: 0, uncostedRows: 0 },
    nest: { lots: 1, customerLots: 0, plateValue: 31000, wastageKg: 300, wastageValue: 18600, offcutKg: 89, offcutValue: 5500, uncostedLots: 0,
      untracked: { pieces: marked, kg: marked * 1.472, value: Math.round(marked * 1.472 * 62 * 100) / 100, uncostedPieces: 0 } } }],
  notOnALine: { issued: { value: 0 }, customerIssued: { value: 0 }, scrap: { value: 0 } },
  totals: { issuedValue: 0, customerIssuedValue: 0, scrapValue: 0, plateValue: 31000, wastageValue: 18600, offcutValue: 5500, uncostedRows: 0, untrackedValue: Math.round(marked * 1.472 * 62 * 100) / 100, untrackedKg: marked * 1.472 },
});
globalThis.fetch = async (url, o = {}) => {
  const method = o.method || 'GET';
  const u = String(url);
  calls.push(`${method} ${u}`);
  const body = o.body ? JSON.parse(o.body) : null;
  if (u.includes('/nesting/untracked')) {
    if (method === 'GET') return reply(stateOf(marked));
    if (method === 'POST') {
      posts.push(body);
      if (markReply) return markReply(body);
      marked = body.all ? 144 : body.pieces.filter((p) => p.cutPlateId === 20).reduce((a, p) => a + p.quantity, 0);
      return reply({ ...stateOf(marked), applied: true, message: `Marked ${marked} pieces as cut from untracked offcuts.` });
    }
    if (method === 'DELETE') { const was = marked; marked = 0; return reply({ ...stateOf(0), applied: true, message: `Undone: ${was} pieces are left over again.` }); }
  }
  if (u.endsWith('/nesting/files')) return reply({ line: { id: 1 }, canUpload: true, readOnlyReason: null, limits: { maxFiles: 200, maxFileBytes: 4194304, kinds: ['dxf', 'nif'] }, plates: [], coverage: [], leftOver: [], totals: null });
  if (u.includes('/nesting/runs/current')) return reply({ status: 'none' });
  if (u.includes('/nesting/choices')) return { ok: false, status: 404, text: async () => '{}' };
  if (u.includes('/costs')) return reply(costsOf());
  if (u.endsWith('/nesting')) return reply(planOf(marked));
  return reply(planOf(marked));
};

const host = () => { const d = document.createElement('div'); document.body.appendChild(d); return d; };
const mountEl = async (el) => { root = createRoot(host()); await React.act(async () => { root.render(el); await sleep(0); }); };
const unmount = async () => { if (root) await React.act(async () => { root.unmount(); }); root = null; document.body.innerHTML = ''; };
const mountPanel = async (props = {}) => mountEl(inRouter(React.createElement(NestingPanel, { orderId: 1, lineId: 1, canManage: true, ...props })));
const reset = () => { marked = 0; markReply = null; calls.length = 0; posts.length = 0; };
const ticks = () => $$('untracked-row').map((r) => r.querySelector('input[type=checkbox]'));

/* ---- the lib -------------------------------------------------------------------------------- */
await check('lib: leftOverOf takes the plan\'s leftOver, else needed − nested − untracked; untrackedLine; untrackedRequest', async () => {
  assert.equal(leftOverOf({ needed: 10, nested: 4, untracked: 2, leftOver: 3 }), 3);
  assert.equal(leftOverOf({ needed: 10, nested: 4, untracked: 2 }), 4);
  assert.equal(leftOverOf({ needed: 10, nested: 4 }), 6);
  assert.equal(leftOverOf({ needed: 2, nested: 4 }), 0);
  assert.equal(untrackedLine({ pieces: 173, kg: 1234.4 }), '173 pieces · 1,234 kg cut from untracked offcuts');
  assert.equal(untrackedLine({ pieces: 1, kg: 1.5 }), `1 piece · 2 kg ${UNTRACKED_WORDS}`);
  assert.equal(untrackedLine({ pieces: 0, kg: 0 }), null);
  assert.deepEqual(untrackedRequest([{ cutPlateId: 1, qty: 3 }, { cutPlateId: 2, qty: 5 }, { cutPlateId: 3, qty: 0 }], new Set([2, 3])), [{ cutPlateId: 2, quantity: 5 }]);
});

/* ---- the panel ------------------------------------------------------------------------------ */
await check('the left-over banner counts what is left (173) and has a third button: Mark the rest as cut from offcuts', async () => {
  reset();
  await mountPanel();
  await waitFor(() => $('nest-left-over'), 'the banner');
  assert.match($('nest-left-over').textContent, /173 cut pieces are not nested yet/);
  const b = $('left-over-untracked');
  assert.ok(b && !b.disabled, 'the button is there and enabled');
  assert.equal(b.textContent.trim(), 'Mark the rest as cut from offcuts');
  assert.equal($('untracked-strip'), null, 'nothing marked: no strip');
  await unmount();
});

await check('the dialog: short names (size + part), pieces, kg and cost at the plate rate, all ticked, the sum, the consequences', async () => {
  reset();
  await mountPanel();
  await waitFor(() => $('left-over-untracked'), 'the button');
  await click($('left-over-untracked'), 'mark button');
  await waitFor(() => $$('untracked-row').length === 2, 'two rows');
  const rows = $$('untracked-row').map((r) => r.textContent);
  assert.match(rows[0], /12 × 125 × 125.*Packing plate.*144.*212.*₹13,142/, rows[0]);
  assert.match(rows[1], /10 × 100 × 200.*Shim.*held back.*29.*46.*not costed/, rows[1]);
  assert.ok(!rows[0].includes('SO260009-1-'), 'the common part of the code is dropped');
  assert.ok(ticks().every((t) => t.checked), 'all ticked by default');
  assert.match($('untracked-sum').textContent, /^173 pieces · 257 kg · ₹13,142 at the plate rate · 29 pieces have no plate rate yet$/);
  const d = $('untracked-dialog').textContent;
  assert.match(d, /need no plate/); assert.match(d, /no heat number/); assert.match(d, /plate rate per kg/); assert.match(d, /undo/);
  assert.equal($('untracked-save').textContent.trim(), 'Mark 173 pieces');
  await unmount();
});

await check('all ticked: Mark sends { all: true }; the plan reloads — banner gone, the strip says the pieces and kg, with Undo', async () => {
  reset();
  await mountPanel();
  await waitFor(() => $('left-over-untracked'), 'the button');
  await click($('left-over-untracked'), 'mark button');
  await waitFor(() => $$('untracked-row').length === 2, 'rows');
  // Untick the shim: only the packing goes, with its quantity.
  await click(ticks()[1], 'shim tick');
  assert.equal($('untracked-save').textContent.trim(), 'Mark 144 pieces');
  await click($('untracked-save'), 'save');
  await waitFor(() => posts.length === 1, 'the POST');
  assert.deepEqual(posts[0], { pieces: [{ cutPlateId: 20, quantity: 144 }] });
  await waitFor(() => $('untracked-strip'), 'the strip');
  assert.equal($('untracked-line').textContent, '144 pieces · 212 kg cut from untracked offcuts');
  assert.ok($('untracked-undo'), 'Undo');
  await waitFor(() => /29 cut pieces are not nested yet/.test($('nest-left-over')?.textContent ?? ''), 'the banner counts 29');
  await waitFor(() => $('nest-money-untracked'), 'the money line');
  assert.match($('nest-money-untracked').textContent, /From untracked offcuts.*₹13,142.*211.968 kg, at the plate rate/);
  // Now everything: the request is { all: true }.
  await click($('left-over-untracked'), 'mark button');
  await waitFor(() => $$('untracked-row').length === 1, 'one row left');
  await click($('untracked-save'), 'save');
  await waitFor(() => posts.length === 2, 'the second POST');
  assert.deepEqual(posts[1], { all: true });
  await unmount();
});

await check('Undo: DELETE, the pieces are left over again and the strip goes', async () => {
  reset();
  marked = 144;
  await mountPanel();
  await waitFor(() => $('untracked-undo'), 'Undo');
  await click($('untracked-undo'), 'undo');
  await waitFor(() => calls.some((c) => c.startsWith('DELETE') && c.includes('/nesting/untracked')), 'the DELETE');
  await waitFor(() => !$('untracked-strip'), 'the strip goes');
  await waitFor(() => /173 cut pieces are not nested yet/.test($('nest-left-over')?.textContent ?? ''), 'all left over again');
  await unmount();
});

await check('a refusal is shown in the server\'s words, and the dialog stays open', async () => {
  reset();
  markReply = () => reply({ code: 'UNTRACKED_INVALID', message: 'Those pieces cannot be marked as cut from untracked offcuts.', problems: ['SO260009-1-12X125X125-E350: only 2 pieces are left over, so 144 cannot be marked.'] }, 422);
  await mountPanel();
  await waitFor(() => $('left-over-untracked'), 'the button');
  await click($('left-over-untracked'), 'mark button');
  await waitFor(() => $$('untracked-row').length === 2, 'rows');
  await click($('untracked-save'), 'save');
  await waitFor(() => $('untracked-error'), 'the error');
  assert.match($('untracked-error').textContent, /cannot be marked/);
  assert.ok($('untracked-dialog'), 'still open');
  await unmount();
});

await check('without the order grant: the button is off and says why; no Undo on the strip', async () => {
  reset();
  marked = 100;
  await mountPanel({ canManage: false });
  await waitFor(() => $('untracked-strip'), 'the strip');
  assert.equal($('untracked-undo'), null);
  assert.ok($('left-over-untracked').disabled, 'disabled');
  await unmount();
});

/* ---- the upload review ---------------------------------------------------------------------- */
await check('the upload review says a mark shrinks — on the preview and after the save', async () => {
  reset();
  const shrink = { pieces: 4, cutPieces: 1, shrinks: [{ cutPlateId: 20, cutPlateCode: CODE('12X125X125'), was: 6, now: 4 }], message: '2 pieces marked as cut from untracked offcuts are nested in these files now, so the mark shrinks (… 6 → 4).' };
  const ans = (o = {}) => ({
    dryRun: true, applied: false, mode: 'merge', canSave: true, needsForce: false, files: [], jobs: [], dxfPartRows: [], problems: [], problemList: [], warnings: [], warningList: [], missingPlates: [],
    diff: { added: [{ lotNo: 'E2', filename: 'E2.dxf', plateCode: 'PL-12', pieces: 2, parts: [{ cutPlateId: 20, cutPlateCode: CODE('12X125X125'), qty: 2 }] }], replaced: [], unchanged: [], removed: [], droppedAuto: [], droppedOurs: [], renumbered: [] },
    coverage: [], leftOver: [], surplus: [], untracked: shrink,
    cutPieces: [{ cutPlateId: 20, code: CODE('12X125X125'), name: 'cp', thickness: 12, length: 125, width: 125, grade: 'E350', needed: 144, parts: [{ name: 'Packing plate', mark: 'PK1' }] },
      { cutPlateId: 10, code: CODE('12X380X1400'), name: 'cp', thickness: 12, length: 1400, width: 380, grade: 'E350', needed: 1, parts: [] }],
    totals: null, message: 'Read.', ...o,
  });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, o = {}) => (String(url).endsWith('/nesting/files') && (o.method || 'GET') === 'POST'
    ? reply(JSON.parse(o.body).dryRun ? ans() : ans({ dryRun: false, applied: true, message: 'Saved.', saved: { lots: 1, pieces: 2, offcuts: 0, removedLots: 0 } }))
    : realFetch(url, o));
  try {
    await mountEl(React.createElement(NestFilesDialog, { open: true, orderId: 1, lineId: 1, uploads: [{ filename: 'E2.dxf', file: 'MA==' }], onClose: () => {}, onSaved: () => {}, onCompare: () => {} }));
    await waitFor(() => $('nest-untracked-shrinks'), 'the shrink line');
    assert.equal($('nest-untracked-shrinks').textContent, '2 pieces marked as cut from offcuts are in these files now — the mark drops: 12 × 125 × 125 6 → 4.');
    await click($('nest-files-save'), 'save');
    await waitFor(() => $('nest-files-saved'), 'saved');
    assert.match($('nest-untracked-shrinks').textContent, /the mark dropped: SO260009-1-12X125X125-E350 6 → 4\.$/);
  } finally { globalThis.fetch = realFetch; }
  await unmount();
});

/* ---- the costs card ------------------------------------------------------------------------- */
await check('the order\'s costs: a "From offcuts" column, and the material margin counts that steel (said in words)', async () => {
  reset();
  marked = 144;
  await mountEl(inRouter(React.createElement(OrderCostsCard, { order: { id: 1, total: { amount: 100000, complete: true } } })));
  await waitFor(() => /From offcuts/.test(text()), 'the column');
  assert.match(text(), /₹13,142/);
  assert.match($('order-margin').textContent, /less material.*₹13,142/);
  assert.match($('order-margin').textContent, /material includes ₹13,142 of steel cut from untracked offcuts, at the plate rate/);
  await unmount();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
