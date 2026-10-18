// Run from multi_app_fe: node scripts/cf_erp_nest_grade_check_test.mjs
// GRADE / IMPACT CLASS IN NESTING (§90, 2026-10-19, item 22): the pure logic (lib/nesting gradeCheckView, lib/plateRules
// GRADE_RULE_WORDS) and the screens — the Compare tab's "Grade and impact class" block (a mismatch named, plate and cut
// piece; a plate that states no class; matches) and Setup › Cutting's rule (default / exact / higher), saved.
// Against a pretend API; it does not replace a browser.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/setup', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  try { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true }); } catch { /* skip */ }
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20, toJSON() { return {}; } });

const apiStub = `export async function apiFetch(url, o = {}) {
  const res = await globalThis.fetch(url, { method: o.method || 'GET', body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await res.text();
  if (!res.ok) throw new Error('API request failed: ' + res.status + ' x - ' + text);
  return JSON.parse(text);
}`;
const authStub = 'export const useAuth = () => ({ user: null });';
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; export { React, createRoot }; export { MemoryRouter } from 'react-router-dom';
      export { NestCompareTab } from './src/apps/cf_erp/components/Nesting/NestCompareTab';
      export { PlateChangeProvider } from './src/apps/cf_erp/components/Nesting/PlateChange';
      export { NestPlateRulesCard } from './src/apps/cf_erp/components/NestPlateRulesCard';
      export { gradeCheckView } from './src/apps/cf_erp/lib/nesting';
      export { GRADE_RULE_WORDS } from './src/apps/cf_erp/lib/plateRules';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/api\/client$/ }, () => ({ path: 'api', namespace: 'stub' }));
    b.onResolve({ filter: /^@core\/contexts\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'stub' }));
    b.onLoad({ filter: /^api$/, namespace: 'stub' }, () => ({ contents: apiStub, loader: 'js' }));
    b.onLoad({ filter: /^auth$/, namespace: 'stub' }, () => ({ contents: authStub, loader: 'js' }));
  } }],
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error', loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `nest-grade-check-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const { React, createRoot, MemoryRouter, NestCompareTab, PlateChangeProvider, NestPlateRulesCard, gradeCheckView, GRADE_RULE_WORDS } = await import(pathToFileURL(artifact));
await unlink(artifact);
const inRouter = (el) => React.createElement(MemoryRouter, null, el);

let passed = 0, failed = 0;
let root = null;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); try { if (root) await React.act(async () => { root.unmount(); }); } catch { /* gone */ } root = null; document.body.innerHTML = ''; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = (ms = 30) => React.act(async () => { await sleep(ms); });
const waitFor = async (cond, what, ms = 6000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false; try { ok = !!cond(); } catch { /* not yet */ }
    if (ok) return;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await settle(20);
  }
};
const $ = (id) => document.querySelector(`[data-testid=${id}]`);

/* ---- the server's shapes ---------------------------------------------------------------------- */
const entry = (o = {}) => ({ lotNo: 'B1', plateCode: 'PL-12-BR', plate: 'E350 BR', cutPlateId: 5, cutPlateCode: 'CP-B', need: 'E350 BO', pieces: 4, code: 'IMPACT', substitute: null, why: 'the plate is BR and the piece needs BO or better', ...o });
const bad = { ok: false, rule: 'better', blocking: true, mismatches: [entry()], unknown: [], substitutes: [], sentence: 'Grade / impact class do not match: CP-B (E350 BO, 4 pieces) on plate B1, PL-12-BR (E350 BR). Nest these pieces on a plate of their grade and impact class (A (no impact test) < BR (room temperature) < BO / B0 (0 °C) < C (−20 °C)).' };
const unknown = { ok: true, rule: 'better', mismatches: [], unknown: [entry({ lotNo: 'N-002', plateCode: 'PL-16', plate: 'E350', cutPlateCode: 'CP-C', need: 'E350 BR', pieces: 2, code: 'IMPACT_UNKNOWN', why: 'the piece needs BR and the plate does not state an impact class' })], substitutes: [], sentence: '2 pieces ask for an impact class (E350 BR) and PL-16 does not state one — check the mill certificate.' };
const good = { ok: true, rule: 'better', mismatches: [], unknown: [], substitutes: [entry({ code: null, substitute: 'impact', why: null })], sentence: 'Every piece is on a plate of its grade and impact class or better (4 pieces on a better plate).' };

/* ---- the pure logic ----------------------------------------------------------------------------- */

await check('gradeCheckView: a mismatch is an error, each line naming the cut piece, its class, the plate and why', async () => {
  const v = gradeCheckView(bad);
  assert.equal(v.tone, 'error');
  assert.equal(v.label, '1 mismatch');
  assert.deepEqual(v.lines, ['CP-B (E350 BO, 4 pieces) on B1, PL-12-BR (E350 BR) — the plate is BR and the piece needs BO or better']);
  assert.equal(v.sentence, bad.sentence);
});

await check('gradeCheckView: a plate that states no class is a warning; matches (some on a better plate) is ok; none → null', async () => {
  const u = gradeCheckView(unknown);
  assert.equal(u.tone, 'warning'); assert.equal(u.label, 'Impact class not stated');
  assert.match(u.lines[0], /^CP-C \(E350 BR, 2 pieces\) on N-002, PL-16 \(E350\) — the piece needs BR and the plate does not state an impact class$/);
  const g = gradeCheckView(good);
  assert.equal(g.tone, 'ok'); assert.equal(g.label, 'Matches (some on a better plate)');
  assert.equal(gradeCheckView({ ...good, substitutes: [] }).label, 'Matches');
  assert.equal(gradeCheckView(null), null);
});

await check("gradeCheckView: under 'warn' (the default) a mismatch is a warning — said, not refused", async () => {
  const v = gradeCheckView({ ...bad, rule: 'warn', blocking: false });
  assert.equal(v.tone, 'warning');
  assert.equal(v.label, '1 mismatch');
  assert.equal(v.lines.length, 1);
});

await check('GRADE_RULE_WORDS: warn only (the default) first, then the three refusing rules', async () => {
  assert.deepEqual(Object.keys(GRADE_RULE_WORDS), ['warn', 'better', 'exact', 'higher']);
  assert.equal(GRADE_RULE_WORDS.warn, 'Warn only (default)');
  assert.match(GRADE_RULE_WORDS.better, /impact class or a better one/);
  assert.match(GRADE_RULE_WORDS.higher, /higher grade of the same family/);
});

/* ---- the screens ------------------------------------------------------------------------------ */
const reply = (out, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(out) });
const cost = (value) => ({ value, currency: 'INR', basis: 'list price', customerPlates: 0, reason: null });
const m = { plates: 1, pieces: 8, tonnesBought: 1.13, netTonnes: 1.1, partsTonnes: 0.2, wastePct: 80, wasteKgTotal: 900, offcuts: { count: 1, kg: 30 }, cutLengthM: 12, piercings: 8, cost: cost(70000) };
const plate = (lotNo, origin) => ({ lotNo, lotId: null, origin, plateCode: 'PL', thickness: 12, length: 6000, width: 2000, kerfMm: 3, pieces: 8, wastePct: 50, cost: 1000 });
let upGrade = bad; let aiGrade = good;
const compare = () => ({
  line: { id: 1, lineNo: 1, orderId: 1, orderCode: 'SO-1' }, demand: { pieces: 8, cutPlates: 2, coversWholeLine: true },
  uploaded: { metrics: m, perPlate: [plate('B1', 'imported')], files: [], gradeCheck: upGrade },
  auto: { runId: 'run-1', status: 'ready', ranAt: new Date().toISOString(), params: { effort: 'standard' }, trigger: 'upload', metrics: m, perPlate: [plate('N-001', 'auto')], plan: { groups: [] }, customPlates: [], gradeCheck: aiGrade },
  stale: null, delta: { plates: 0 }, headline: 'The same.', verdict: null,
  likeForLike: { same: true, uploadedPieces: 8, autoPieces: 8, differ: [], overNested: [] }, byThickness: [], leftOverSummary: null, autoCompare: null,
  wholeLine: null, willReplace: null, run: null, lastFailure: null, canAccept: null, alternative: null,
});
const puts = [];
const rules = { on: false, schema: true, sizesSchema: true, plateSchema: true, gradeRule: null, gradeRuleDefault: 'warn', gradeRules: ['warn', 'better', 'exact', 'higher'], impactOrder: 'A (no impact test) < BR (room temperature) < BO / B0 (0 °C) < C (−20 °C)', customPlates: { on: false, maxLength: null, maxWidth: null, minLength: null, minWidth: null, step: null }, rows: [], resolved: [] };
globalThis.fetch = async (url, o = {}) => {
  const u = String(url); const method = o.method || 'GET';
  if (u.includes('/nest-shop-rules') && method === 'PUT') { const body = JSON.parse(o.body); puts.push(body); return reply({ ...rules, gradeRule: body.gradeRule }); }
  if (u.includes('/nesting/compare')) return reply(compare());
  if (u.includes('/plate-changes')) return reply({ line: { id: 1 }, gate: { covered: false, purchaseOrders: [], needsApproval: false, held: false, pending: null, message: null }, canApprove: false, requests: [] });
  return reply({ line: { id: 1 }, saved: true, basis: 'saved plan', groups: [], manual: [], sizeAdvice: [], problems: [], totals: {} });
};
const host = () => { const d = document.createElement('div'); document.body.appendChild(d); return d; };
const mountEl = async (el) => { root = createRoot(host()); await React.act(async () => { root.render(el); await sleep(0); }); };
const unmount = async () => { if (root) await React.act(async () => { root.unmount(); }); root = null; document.body.innerHTML = ''; };
const mountTab = () => mountEl(inRouter(React.createElement(PlateChangeProvider, { orderId: 1, lineId: 1 }, React.createElement(NestCompareTab, { orderId: 1, lineId: 1, canManage: true }))));

await check('the Compare tab: the customer\'s side has a mismatch — named, plate and cut piece; AI\'s matches', async () => {
  upGrade = bad; aiGrade = good;
  await mountTab();
  await waitFor(() => $('compare-tab-grade'), 'the grade block');
  const cust = $('compare-tab-grade').querySelector('[data-side="customer"]');
  const ours = $('compare-tab-grade').querySelector('[data-side="ours"]');
  assert.equal(cust.getAttribute('data-tone'), 'error');
  assert.match(cust.textContent, /1 mismatch/);
  assert.match(cust.textContent, /CP-B \(E350 BO, 4 pieces\) on B1, PL-12-BR \(E350 BR\) — the plate is BR and the piece needs BO or better/);
  assert.equal(ours.getAttribute('data-tone'), 'ok');
  assert.match(ours.textContent, /Matches \(some on a better plate\)/);
  assert.equal(ours.querySelector('ul'), null, 'no list when it matches');
  await unmount();
});

await check('the Compare tab: a plate that states no class is a warning, with the plate named', async () => {
  upGrade = good; aiGrade = unknown;
  await mountTab();
  await waitFor(() => $('compare-tab-grade'), 'the grade block');
  const ours = $('compare-tab-grade').querySelector('[data-side="ours"]');
  assert.equal(ours.getAttribute('data-tone'), 'warning');
  assert.match(ours.textContent, /Impact class not stated/);
  assert.match(ours.textContent, /CP-C \(E350 BR, 2 pieces\) on N-002, PL-16/);
  await unmount();
});

await check('Setup › Cutting: "Warn only (default)" shown first; choose "exactly the grade and impact class" and save — the PUT carries gradeRule exact', async () => {
  let saved = null;
  await mountEl(inRouter(React.createElement(NestPlateRulesCard, { rules, onSaved: (r) => { saved = r; } })));
  await waitFor(() => $('nest-plate-rules-card'), 'the card');
  const combo = $('nest-plate-rules-card').querySelector('[role="combobox"]');
  assert.ok(combo, 'the rule select');
  assert.equal(combo.textContent, 'Warn only (default)');
  await React.act(async () => { combo.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, button: 0 })); await sleep(10); });
  await waitFor(() => [...document.querySelectorAll('[role="option"]')].length >= 4, 'the options');
  const opts = [...document.querySelectorAll('[role="option"]')].map((li) => li.textContent);
  assert.deepEqual(opts, [GRADE_RULE_WORDS.warn, GRADE_RULE_WORDS.better, GRADE_RULE_WORDS.exact, GRADE_RULE_WORDS.higher], 'warn once, first');
  const opt = [...document.querySelectorAll('[role="option"]')].find((li) => li.textContent === GRADE_RULE_WORDS.exact);
  assert.ok(opt, 'the exact option');
  await React.act(async () => { opt.click(); await sleep(10); });
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Save plate rules');
  await React.act(async () => { btn.click(); await sleep(30); });
  await waitFor(() => puts.length === 1 && saved, 'the save');
  assert.equal(puts[0].gradeRule, 'exact');
  assert.equal(puts[0].customPlates.on, false, 'custom sizes stay off');
  assert.equal(saved.gradeRule, 'exact');
  await unmount();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
