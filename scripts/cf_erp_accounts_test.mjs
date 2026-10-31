// Run from multi_app_fe: node scripts/cf_erp_accounts_test.mjs
// STEP 3B (backend init.sql §74; TM/CF_ERP_ORDER_FLOW_PLAN.md "2026-10-18 — Step 3B"), rendered in jsdom against mocked
// routes shaped like the backend's answers (multi_app_be/scripts/cf_kepl/accounts_test.mjs):
//   the Accounts menu (Billing with its due badge, Invoices, Receipts, Order costing), the Billing board (lanes, overdue in
//   red, tick due cards of one order → Raise invoice: preview with CGST/SGST or IGST, then raise → the PDF), Record a
//   payment (prefilled with what is owed), Receipts, Order costing and its cost sheet, the issue dialog's required
//   "Used for", the Orders board's payment line, and full screen on every Accounts screen.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/billing', pretendToBeVisual: true });
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
dom.window.URL.createObjectURL = () => 'blob:x';
dom.window.URL.revokeObjectURL = () => {};
// A download link's click would navigate (jsdom cannot): the file is saved by the browser, not here.
dom.window.HTMLAnchorElement.prototype.click = function click() {};

globalThis.__calls = [];
globalThis.__routes = {};
globalThis.__user = null;
const apiStub = `export async function apiFetch(url, o = {}) {
  const method = o.method || 'GET';
  const path = url.replace(/^\\/api\\/[^/]+\\/cf_erp/, '').split('?')[0];
  globalThis.__calls.push({ method, path, url, body: o.body });
  const h = globalThis.__routes[method + ' ' + path];
  if (!h) throw new Error('API request failed: 404 x - ' + JSON.stringify({ message: 'No mock for ' + method + ' ' + path }));
  const r = await h(o.body, url);
  if (r && r.__status) throw new Error('API request failed: ' + r.__status + ' x - ' + JSON.stringify(r.body));
  return r;
}`;
const authStub = 'export const useAuth = () => ({ user: globalThis.__user });';
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter, Routes, Route } from 'react-router-dom';
      export { React, createRoot, MemoryRouter, Routes, Route };
      export * from './src/apps/cf_erp/lib/accounts';
      export * as AC from './src/apps/cf_erp/api/accounts';
      export { default as Billing } from './src/apps/cf_erp/pages/Billing';
      export { default as Receipts } from './src/apps/cf_erp/pages/Receipts';
      export { default as OrderCosting } from './src/apps/cf_erp/pages/OrderCosting';
      export { default as OrdersBoard } from './src/apps/cf_erp/pages/OrdersBoard';
      export { MovementDialog } from './src/apps/cf_erp/components/MovementDialog';
      export { SECTIONS, COUNT_TONE } from './src/apps/cf_erp/navMeta';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/api\/client$/ }, () => ({ path: 'api', namespace: 'stub' }));
    b.onResolve({ filter: /^@core\/contexts\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'stub' }));
    b.onLoad({ filter: /^api$/, namespace: 'stub' }, () => ({ contents: apiStub, loader: 'js' }));
    b.onLoad({ filter: /^auth$/, namespace: 'stub' }, () => ({ contents: authStub, loader: 'js' }));
    b.onResolve({ filter: /^@shared\/ui$/ }, () => ({ path: 'sharedui', namespace: 'stub' }));
    b.onLoad({ filter: /^sharedui$/, namespace: 'stub' }, () => ({
      contents: `export * from ${JSON.stringify(resolve('src/shared/ui/SheetGrid.tsx'))}; export * from ${JSON.stringify(resolve('src/shared/ui/storage.ts'))};`,
      loader: 'ts', resolveDir: process.cwd(),
    }));
  } }],
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'error', loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{"VITE_API_HOST":"http://localhost:4000"}' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `accounts-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter, Routes, Route } = m;

let passed = 0, failed = 0;
const check = async (label, fn) => { if (process.env.ONLY && !label.includes(process.env.ONLY)) return; try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const src = (p) => readFileSync(resolve('src/apps/cf_erp', p), 'utf8');
const app = document.getElementById('app');
let root = null;
const mount = async (el, url = '/testco/cf_erp/billing', path = '*') => {
  if (root) { await React.act(async () => { root.unmount(); }); root = null; }
  document.querySelectorAll('.MuiDialog-root, .MuiPopover-root, .MuiMenu-root').forEach((n) => n.remove());
  app.replaceChildren();
  const host = document.createElement('div'); app.appendChild(host);
  root = createRoot(host);
  await React.act(async () => {
    root.render(React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(Routes, null, React.createElement(Route, { path, element: el }))));
    await sleep(80);
  });
};
const settle = async (ms = 50) => { await React.act(async () => { await sleep(ms); }); };
const qa = (id, scope = document) => [...scope.querySelectorAll(`[data-testid="${id}"]`)];
const q1 = (id, scope = document) => scope.querySelector(`[data-testid="${id}"]`);
const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const fire = async (el, type) => { await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true })); await sleep(20); }); };
const click = (el) => fire(el, 'click');
const buttonIn = (scope, label) => [...scope.querySelectorAll('button, a')].find((b) => text(b) === label || text(b).startsWith(label));
const setValue = async (el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await React.act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await sleep(10); });
};
const calls = (method, path) => globalThis.__calls.filter((c) => c.method === method && c.path === path);
const lastCall = (method, path) => calls(method, path).at(-1);
const reset = () => { globalThis.__calls = []; globalThis.__routes = {}; globalThis.__user = null; };
const asUser = (perms, id = 7) => { globalThis.__user = { id, uiPermissions: perms }; };
const body = (c) => (typeof c?.body === 'string' ? JSON.parse(c.body) : c?.body);
const opened = [];
dom.window.open = (u) => { const tab = { location: { href: u }, close() {} }; opened.push(tab); return tab; };
globalThis.open = dom.window.open;

// ── fixtures, as the backend answers (accounts_test.mjs) ─────────────────────────────────────────
const TODAY = '2026-10-18';
const ms = (key, label, extra = {}) => ({ key, label, trigger: 'When the order is accepted', kind: 'percent', value: 10, creditDays: 0, proRata: false, amount: 51576, ...extra });
const card = (id, status, extra = {}) => ({
  id, orderId: 9001, orderCode: 'TEST-ACCT-A', customer: 'Railway Co', title: null, milestone: ms('m1', 'Advance'), partKey: id.split('|')[2], note: null,
  amount: 51576, fraction: 1, dueOn: TODAY, daysDue: 0, status, overdue: false, daysOverdue: 0, invoice: null, ...extra,
});
const INV = { id: 77, invoiceNo: 'INV/26-27/0001', invoiceDate: TODAY, dueDate: '2026-10-18', creditDays: 0, grandTotal: 81147, received: 40000, outstanding: 41147 };
const BOARD = () => ({
  today: TODAY,
  counts: { due: 2, overdue: 1, dueAmount: 68767.98 },
  orders: [{ id: 9001, code: 'TEST-ACCT-A', customer: 'Railway Co', title: null, status: 'confirmed', value: 515760, milestonesTotal: 515760, billed: 68767.98, invoiced: 81147, received: 40000, outstanding: 41147, onAccount: 0, due: 68767.98, dueCount: 2, upcoming: 400000, overdue: true, fullyBilled: false, fullyPaid: false }],
  lanes: [
    { key: 'upcoming', label: 'Upcoming', total: 51576, cards: [card('9001|m8|rest', 'upcoming', { milestone: ms('m8', 'Retention', { trigger: '12 months after "On dispatch"' }), dueOn: null, note: '12 months after "On dispatch"' })] },
    { key: 'due', label: 'Due to bill', total: 68767.98, cards: [
      card('9001|m1|all', 'due'),
      card('9001|m2|w2026-10-05', 'due', { milestone: ms('m2', 'Material in place', { proRata: true, creditDays: 15 }), amount: 17191.98, dueOn: '2026-10-11', daysDue: 7, note: 'Week of 2026-10-05: 33.33 % material in place' }),
      card('9002|b1|all', 'due', { orderId: 9002, orderCode: 'TEST-ACCT-B', milestone: ms('b1', 'Design frozen'), amount: 20000 }),
    ] },
    { key: 'billed', label: 'Billed', total: 25788, cards: [card('9001|m4|mv5', 'billed', { milestone: ms('m4', 'On dispatch'), amount: 25788, overdue: true, daysOverdue: 3, invoice: INV })] },
    { key: 'paid', label: 'Paid', total: 0, cards: [] },
  ],
});
const PLAN = (b) => ({
  dryRun: true, order: { id: 9001, code: 'TEST-ACCT-A', customer: 'Railway Co' }, invoiceDate: b.invoiceDate ?? TODAY, creditDays: b.creditDays ?? 0, dueDate: TODAY,
  cards: b.cards.map((id) => ({ id, label: 'x', note: null, amount: 1 })),
  buyer: { name: 'Railway Co', gstin: '27AABCR1234K1Z5', stateName: 'Maharashtra', stateCode: '27' }, placeOfSupply: { code: '27', name: 'Maharashtra' }, isIgst: false,
  lines: b.cards.map((id, i) => ({ slNo: i + 1, card: id, milestoneKey: 'm', partKey: 'all', label: 'Advance', note: null, description: `Line ${i + 1} (TEST-ACCT-A)`, hsnCode: '7308', gstRate: 18, taxable: 100, cgst: 9, sgst: 9, igst: 0, total: 118 })),
  totals: { taxable: 68767.98, cgst: 6189.12, sgst: 6189.12, igst: 0, tax: 12378.24, roundOff: -0.22, grandTotal: 81146, inWords: 'Rupees Eighty One Thousand One Hundred Forty Six Only' },
  problems: [],
});
const PAYMENTS = { order: { id: 9001, code: 'TEST-ACCT-A', status: 'confirmed', customer: 'Railway Co' },
  invoices: [{ id: 77, invoiceNo: 'INV/26-27/0001', invoiceDate: TODAY, dueDate: TODAY, kind: 'billing', grandTotal: 81147, received: 40000, outstanding: 41147 }],
  receipts: [], invoiced: 81147, received: 40000, onAccount: 0, outstanding: 41147, billing: null, fullyPaid: false };

// ── 1: words and rules ──────────────────────────────────────────────────────────────────────────
await check('the words of a card and the invoice rules', () => {
  const b = BOARD();
  const [adv, mat, other] = b.lanes[1].cards;
  assert.equal(m.cardWhen(adv), `Due from today (${TODAY})`);
  assert.equal(m.cardWhen(mat), 'Due since 2026-10-11 (7 days)');
  assert.equal(m.cardWhen(b.lanes[0].cards[0]), '12 months after "On dispatch"');
  assert.match(m.cardWhen(b.lanes[2].cards[0]), /^Overdue by 3 days · ₹41,147 owed$/);
  assert.deepEqual(m.canInvoiceTogether([adv, mat]), { ok: true, reason: null });
  assert.match(m.canInvoiceTogether([adv, other]).reason, /same order/);
  assert.match(m.canInvoiceTogether([b.lanes[0].cards[0]]).reason, /Only due cards/);
  assert.deepEqual(m.toggleCard([adv], mat).map((c) => c.id), [adv.id, mat.id]);
  assert.deepEqual(m.toggleCard([adv, mat], other).map((c) => c.id), [other.id], 'another order starts a new selection');
  assert.deepEqual(m.toggleCard([adv, mat], adv).map((c) => c.id), [mat.id]);
  assert.equal(m.sumAmounts([adv, mat]), 68767.98);
  assert.equal(m.marginFamily(-2), 'danger'); assert.equal(m.marginFamily(25), 'success');
});

await check('the API helpers call the §74 routes', async () => {
  reset();
  for (const k of ['GET /accounts/billing', 'POST /accounts/invoices', 'GET /accounts/receipts', 'POST /accounts/receipts', 'DELETE /accounts/receipts/5', 'GET /accounts/orders/9001/payments', 'GET /accounts/costing', 'GET /accounts/costing/9001']) globalThis.__routes[k] = () => ({});
  await m.AC.getBillingBoard('girder'); assert.match(lastCall('GET', '/accounts/billing').url, /search=girder/);
  await m.AC.previewInvoice({ orderId: 9001, cards: ['9001|m1|all'] }); assert.equal(body(lastCall('POST', '/accounts/invoices')).dryRun, true);
  await m.AC.raiseInvoice({ orderId: 9001, cards: ['9001|m1|all'], creditDays: 15 }); const b = body(lastCall('POST', '/accounts/invoices')); assert.equal(b.dryRun, undefined); assert.equal(b.creditDays, 15);
  await m.AC.recordReceipt({ invoiceId: 77, amount: 100, mode: 'upi' }); assert.deepEqual(body(lastCall('POST', '/accounts/receipts')), { invoiceId: 77, amount: 100, mode: 'upi' });
  await m.AC.removeReceipt(5, 'Typed twice'); assert.deepEqual(body(lastCall('DELETE', '/accounts/receipts/5')), { reason: 'Typed twice' });
  await m.AC.getCosting('A'); assert.match(lastCall('GET', '/accounts/costing').url, /search=A/);
});

// ── 2: the menu ─────────────────────────────────────────────────────────────────────────────────
await check('the menu: a top-level Accounts with Billing (its due badge), Invoices, Receipts, Order costing', () => {
  const acc = m.SECTIONS.find((s) => s.key === 'accounts');
  assert.equal(acc.label, 'Accounts');
  assert.deepEqual(acc.screens.map((s) => s.key), ['billing', 'invoices', 'receipts', 'order-costing', 'contractor-work-orders']);
  assert.equal(acc.screens[0].countKey, 'billingDue');
  assert.equal(acc.screens[0].permission, 'cf_erp_accounts_view');
  assert.deepEqual(m.COUNT_TONE.billingDue, { tone: 'warning', suffix: 'due' }, 'the badge reads "Billing 3 due"');
  const sales = m.SECTIONS.find((s) => s.key === 'sales');
  assert.ok(!sales.screens.some((s) => s.key === 'invoices'), 'Invoices moved to Accounts');
  assert.equal(acc.screens[1].permission, 'cf_erp_orders_manage|cf_erp_accounts_view', 'Invoices: Accounts, and whoever manages orders (2026-10-31)');
});

// ── 3: the Billing board ────────────────────────────────────────────────────────────────────────
await check('the board: four lanes, the money, overdue in red; tick due cards of one order → Raise invoice → the PDF', async () => {
  reset(); asUser(['cf_erp_accounts_view', 'cf_erp_accounts_manage', 'cf_erp_orders_view']);
  globalThis.__routes['GET /accounts/billing'] = () => BOARD();
  globalThis.__routes['POST /accounts/invoices'] = (b) => { const x = typeof b === 'string' ? JSON.parse(b) : b; return x.dryRun ? PLAN(x) : { id: 78, invoiceNo: 'INV/26-27/0002', status: 'issued', dueDate: TODAY, creditDays: 0, totals: { grandTotal: 81146 }, received: 0, outstanding: 81146 }; };
  globalThis.__routes['GET /accounts/invoices/78/pdf'] = () => new Blob(['%PDF']);
  await mount(React.createElement(m.Billing));
  await settle(120);
  assert.deepEqual(qa('billing-lane').map((l) => l.getAttribute('data-lane')), ['upcoming', 'due', 'billed', 'paid']);
  assert.match(text(qa('billing-lane')[1]), /Due to bill.*3 · ₹68,768/);
  assert.match(text(q1('billing-summary')), /2 due to bill · ₹68,768.*1 overdue/);
  const red = qa('bill-card').find((c) => c.getAttribute('data-overdue') === '1');
  assert.ok(red && /Overdue by 3 days/.test(text(red)), 'the overdue card says so');
  assert.ok(buttonIn(red, 'Record payment'), 'a billed card takes a payment');
  assert.equal(qa('bill-tick').length, 3, 'only due cards can be ticked');
  await click(qa('bill-tick')[0].querySelector('input') ?? qa('bill-tick')[0]); await click(qa('bill-tick')[1].querySelector('input') ?? qa('bill-tick')[1]);
  assert.match(text(q1('billing-selection')), /2 cards of TEST-ACCT-A · ₹68,767.98 before tax/);
  await click(q1('billing-raise')); await settle(400);
  const dry = calls('POST', '/accounts/invoices').filter((c) => body(c).dryRun).at(-1);
  assert.deepEqual(body(dry).cards, ['9001|m1|all', '9001|m2|w2026-10-05']);
  assert.equal(qa('raise-line').length, 2);
  assert.match(text(q1('raise-tax-words')), /Within the state \(Maharashtra\): CGST \+ SGST/);
  assert.match(text(q1('raise-totals')), /CGST ₹6,189.12 · SGST ₹6,189.12.*Invoice total ₹81,146.00/);
  assert.equal(q1('raise-credit').value, '0', 'credit days prefilled from the milestones');
  assert.ok(document.querySelector('[data-testid="raise-invoice-dialog"] [data-testid="full-screen-toggle"]'), 'the dialog has full screen');
  await click(q1('raise-confirm')); await settle(150);
  const raised = calls('POST', '/accounts/invoices').filter((c) => !body(c).dryRun).at(-1);
  assert.deepEqual(body(raised).cards, ['9001|m1|all', '9001|m2|w2026-10-05']);
  assert.equal(calls('GET', '/accounts/invoices/78/pdf').length, 1, 'the PDF opens');
  assert.ok(q1('full-screen-toggle'), 'the board has full screen');
});

await check('a card of another order starts a new selection; a problem holds the raise and shows where to fix it', async () => {
  reset(); asUser(['cf_erp_accounts_view', 'cf_erp_accounts_manage']);
  globalThis.__routes['GET /accounts/billing'] = () => BOARD();
  globalThis.__routes['POST /accounts/invoices'] = (b) => ({ ...PLAN(typeof b === 'string' ? JSON.parse(b) : b), problems: [{ text: 'Line 1 has no HSN code.', fix: { label: 'Open the template', to: 'definitions/5' } }] });
  await mount(React.createElement(m.Billing));
  await settle(120);
  await click(qa('bill-tick')[0].querySelector('input') ?? qa('bill-tick')[0]); await click(qa('bill-tick')[2].querySelector('input') ?? qa('bill-tick')[2]);
  assert.match(text(q1('billing-selection')), /1 card of TEST-ACCT-B/);
  await click(q1('billing-raise')); await settle(400);
  assert.match(text(q1('raise-problems')), /no HSN code.*Open the template/);
  assert.equal(q1('raise-confirm').disabled, true);
});

await check('view only: no ticks, no Raise, no Record payment', async () => {
  reset(); asUser(['cf_erp_accounts_view']);
  globalThis.__routes['GET /accounts/billing'] = () => BOARD();
  await mount(React.createElement(m.Billing));
  await settle(120);
  assert.equal(qa('bill-tick').length, 0); assert.equal(qa('bill-pay').length, 0);
});

// ── 4: payments ─────────────────────────────────────────────────────────────────────────────────
await check('Record payment on a billed card: prefilled with what the invoice owes; saved', async () => {
  reset(); asUser(['cf_erp_accounts_view', 'cf_erp_accounts_manage']);
  globalThis.__routes['GET /accounts/billing'] = () => BOARD();
  globalThis.__routes['GET /accounts/orders/9001/payments'] = () => PAYMENTS;
  globalThis.__routes['POST /accounts/receipts'] = () => ({ receipt: { id: 1 }, allocated: 41147, onAccount: 0, message: '₹41,147 recorded against one invoice.', order: { ...PAYMENTS, outstanding: 0 }, closed: false });
  await mount(React.createElement(m.Billing));
  await settle(120);
  await click(q1('bill-pay')); await settle(150);
  assert.match(text(q1('receipt-owed')), /Railway Co owes ₹41,147 on 1 invoice/);
  assert.equal(q1('receipt-amount').value, '41147');
  await setValue(q1('receipt-reference'), 'UTR 99'); await settle(20);
  await click(q1('receipt-save')); await settle(150);
  const b = body(lastCall('POST', '/accounts/receipts'));
  assert.equal(b.invoiceId, 77); assert.equal(b.amount, '41147'); assert.equal(b.mode, 'bank'); assert.equal(b.reference, 'UTR 99');
});

await check('Receipts: the list; Record a payment starts from an order', async () => {
  reset(); asUser(['cf_erp_accounts_view', 'cf_erp_accounts_manage']);
  globalThis.__routes['GET /accounts/receipts'] = () => ({ rows: [{ id: 1, code: 'RC-000001', date: TODAY, amount: 40000, mode: 'bank', modeLabel: 'Bank transfer (NEFT / RTGS)', reference: 'UTR123', notes: null, order: { id: 9001, code: 'TEST-ACCT-A' }, customer: 'Railway Co', invoice: { id: 77, invoiceNo: 'INV/26-27/0001' }, allocated: 40000, onAccount: 0, by: 'Sales', createdAt: TODAY }], modes: {} });
  await mount(React.createElement(m.Receipts), '/testco/cf_erp/receipts');
  await settle(150);
  assert.match(text(document.body), /RC-000001.*TEST-ACCT-A.*INV\/26-27\/0001.*₹40,000.00/);
  assert.equal(q1('receipt-new').disabled, true, 'choose the order first');
  assert.ok(q1('full-screen-toggle'));
});

// ── 5: order costing ────────────────────────────────────────────────────────────────────────────
const ROW = { order: { id: 9001, code: 'TEST-ACCT-A', title: null, status: 'confirmed', customer: 'Railway Co' }, contract: 515760, charged: 510000, invoiced: 68767.98, received: 81147,
  material: 40, consumables: 120, contractor: 0, credits: 1500, creditsScrap: 1500, creditsOffcuts: 0, customerMaterial: { rows: 0, quantity: 0 }, uncostedRows: 0, margin: 511340, marginPct: 100.26 };
await check('Order costing: one row per order; a row opens its cost sheet (charged − material − consumables − contractor + credits)', async () => {
  reset(); asUser(['cf_erp_accounts_view']);
  globalThis.__routes['GET /accounts/costing'] = () => ({ rows: [ROW], totals: { contract: 515760, charged: 510000, material: 40, consumables: 120, contractor: 0, credits: 1500, margin: 511340 }, generalThisMonth: { value: 50, uncostedRows: 0 } });
  globalThis.__routes['GET /accounts/costing/9001'] = () => ({ ...ROW, hasTerms: true, lines: [], totals: {},
    earned: { total: 510000, contract: 515760, rows: [{ key: 'fab', label: 'Fabrication', kind: 'charge', quantity: 4, earnedQuantity: 4, unit: 't', rate: 45000, amount: 180000, contract: 180000, note: '100 % through Fabrication' }, { key: 'pnt', label: 'Painting', kind: 'charge', quantity: 48, earnedQuantity: 0, unit: 'm2', rate: 120, amount: 0, contract: 5760, note: 'On completion — 0 % through so far' }] },
    items: [{ itemId: 1, code: 'MA', name: 'Material A', uom: 'kg', kind: 'material', quantity: 4, value: 40, uncosted: 0 }, { itemId: 2, code: 'WIRE', name: 'Welding wire', uom: 'kg', kind: 'consumable', quantity: 12, value: 120, uncosted: 0 }] });
  await mount(React.createElement(m.OrderCosting), '/testco/cf_erp/order-costing');
  await settle(150);
  assert.match(text(q1('costing-totals')), /charged ₹5,10,000 · material ₹40 · consumables ₹120 · credits ₹1,500 · margin ₹5,11,340.*General \(overhead\) issues this month: ₹50/);
  const rowEl = [...document.querySelectorAll('tr')].find((r) => /TEST-ACCT-A/.test(text(r)) && /₹5,11,340/.test(text(r)));
  assert.ok(rowEl, 'the order row with its margin');
  await click(rowEl.querySelectorAll('td')[1] ?? rowEl); await settle(200);
  assert.match(text(q1('cs-charged')), /Charged so far\s*₹5,10,000.00/);
  assert.match(text(q1('cs-material')), /− Material issued \(at cost\)\s*₹40.00/);
  assert.match(text(q1('cs-consumables')), /− Consumables issued\s*₹120.00/);
  assert.match(text(q1('cs-credits')), /\+ Credits: scrap and offcuts\s*₹1,500.00/);
  assert.match(text(q1('cs-margin')), /Margin\s*₹5,11,340.00/);
  assert.equal(qa('cs-earned').length, 2); assert.match(text(qa('cs-item')[1]), /Consumable.*Welding wire.*12 kg.*₹120.00/);
});

// ── 6: issue "Used for" ─────────────────────────────────────────────────────────────────────────
await check('an issue says what it is used for: nothing chosen holds Post; General or a sales order', async () => {
  reset(); asUser(['cf_erp_inventory_view', 'cf_erp_inventory_manage']);
  globalThis.__routes['GET /stocking-areas'] = () => [{ id: 1, code: 'ST', name: 'Store', purpose: 'storage', status: 'active' }];
  globalThis.__routes['GET /stock'] = () => [];
  await mount(React.createElement(m.MovementDialog, { open: true, type: 'issue', onClose() {}, onPosted() {} }), '/testco/cf_erp/movements');
  await settle(150);
  const dlg = document.querySelector('.MuiDialog-root');
  assert.ok(q1('used-for', dlg), 'the Used for choice');
  assert.match(text(dlg), /Say what it is used for: a sales order, or General\./);
  assert.equal(buttonIn(dlg, 'Post').disabled, true);
  await click(q1('used-for-order', dlg)); await settle(40);
  assert.match(text(dlg), /Choose the sales order it is used for\./);
  await click(q1('used-for-general', dlg)); await settle(40);
  assert.match(text(dlg), /Overhead: not charged to any order\./);
  assert.match(text(dlg), /Choose the area it comes from\./, 'the next thing to do');
});

// ── 6b (2026-10-19): Receive stock lists only storage / quarantine areas, like the GRN ─────────────────────────────
await check('Receive stock: Into lists storage and quarantine only; a dispatch area preset is refused by name; with none, where to make one', async () => {
  const AREAS = [{ id: 1, code: 'ST', name: 'Store', purpose: 'storage', status: 'active' }, { id: 2, code: 'QA', name: 'Inspection', purpose: 'quarantine', status: 'active' },
    { id: 3, code: 'DSP', name: 'Dispatch yard', purpose: 'dispatch', status: 'active' }, { id: 4, code: 'WIP1', name: 'Cutting bay', purpose: 'wip', status: 'active' }];
  reset(); asUser(['cf_erp_inventory_view', 'cf_erp_inventory_manage']);
  globalThis.__routes['GET /stocking-areas'] = () => AREAS;
  await mount(React.createElement(m.MovementDialog, { open: true, type: 'receipt', onClose() {}, onPosted() {} }), '/testco/cf_erp/stock');
  await settle(150);
  let dlg = document.querySelector('.MuiDialog-root');
  const input = q1('receipt-area', dlg).querySelector('input');
  await React.act(async () => { input.focus(); input.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })); input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await sleep(60); });
  const options = [...document.querySelectorAll('[role="option"]')].map((o) => text(o));
  assert.deepEqual(options, ['ST · Store', 'QA · Inspection'], `options: ${options.join(' | ')}`);
  assert.match(text(q1('receipt-area', dlg)), /Storage or quarantine only/);
  // a page that presets a dispatch area (an old link) cannot post into it
  reset(); asUser(['cf_erp_inventory_view', 'cf_erp_inventory_manage']);
  globalThis.__routes['GET /stocking-areas'] = () => AREAS;
  await mount(React.createElement(m.MovementDialog, { open: true, type: 'receipt', preset: { areaId: 3 }, onClose() {}, onPosted() {} }), '/testco/cf_erp/stock');
  await settle(150);
  dlg = document.querySelector('.MuiDialog-root');
  assert.match(text(dlg), /DSP is a dispatch area — goods coming in go into a storage area/);
  assert.equal(buttonIn(dlg, 'Post').disabled, true);
  // no storage area at all
  reset(); asUser(['cf_erp_inventory_view', 'cf_erp_inventory_manage']);
  globalThis.__routes['GET /stocking-areas'] = () => AREAS.slice(2);
  await mount(React.createElement(m.MovementDialog, { open: true, type: 'receipt', onClose() {}, onPosted() {} }), '/testco/cf_erp/stock');
  await settle(150);
  dlg = document.querySelector('.MuiDialog-root');
  assert.match(text(q1('receipt-area', dlg)), /Make a storage area in Stores › Stocking areas/);
  assert.equal(buttonIn(dlg, 'Post').disabled, true);
  // the area page offers Receive only on a storage area; customer material lists storage areas
  assert.match(readFileSync(resolve('src/apps/cf_erp/pages/StockingAreaDetail.tsx'), 'utf8'), /a\.purpose === 'storage' \? \['receipt', 'issue', 'transfer', 'adjustment'\] : \['transfer', 'issue', 'adjustment'\]/);
  assert.match(readFileSync(resolve('src/apps/cf_erp/components/CustomerMaterialPanel.tsx'), 'utf8'), /canReceiveInto\(a\) && a\.purpose === 'storage'/);
});

// ── 7: the Orders board ─────────────────────────────────────────────────────────────────────────
await check('the Orders board says what is owed: it closes once fully paid', async () => {
  reset(); asUser(['cf_erp_orders_view', 'cf_erp_orders_manage']);
  const st = (id, done) => ({ id, key: `s${id}`, name: `Stage ${id}`, sequence: id, done, doneOn: done ? TODAY : null, doneNote: null, doneBy: null, doneAt: null });
  globalThis.__routes['GET /order-board'] = () => ({ today: TODAY, lanes: [{ key: 'post_production', label: 'Post-production', cards: [{ id: 3, code: 'TEST-ACCT-A', title: null, customer: 'Railway Co', status: 'confirmed', lane: 'post_production', committedDate: '2026-12-31', overdue: false,
    facts: { lines: 1, released: 1, dispatched: '1 of 1 line shipped', material: 'x', materialInPlace: true, acceptance: null, rateChangePending: false, payment: { fullyPaid: false, outstanding: 41147, due: 0, upcoming: 0, received: 40000, text: '₹41,147 to be received' } },
    stages: [st(1, true), st(2, true)], stagesDone: 2, canClose: false }] }] });
  await mount(React.createElement(m.OrdersBoard), '/testco/cf_erp/orders-board');
  await settle(150);
  assert.match(text(q1('board-payment')), /₹41,147 to be received — it closes once fully paid/);
  assert.equal(q1('board-close'), null, 'no Close while money is owed');
});

await check('full screen on every Accounts screen; the cost card on the order page reads the cost sheet', () => {
  for (const [f, id] of [['pages/Billing.tsx', 'accounts-billing'], ['pages/Receipts.tsx', 'accounts-receipts'], ['pages/OrderCosting.tsx', 'accounts-costing']]) assert.match(src(f), new RegExp(`useFullScreen\\('${id}'\\)`), f);
  const dialogs = src('components/Accounts/AccountsDialogs.tsx');
  assert.match(dialogs, /useFullScreen\('accounts-raise-invoice'\)/); assert.match(dialogs, /useFullScreen\('accounts-receipt'\)/);
  assert.match(src('components/OrderCostsCard.tsx'), /getCostSheet\(order\.id\)/);
  assert.match(src('pages/OrderCosting.tsx'), /useFullScreen\('accounts-cost-sheet'\)/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
