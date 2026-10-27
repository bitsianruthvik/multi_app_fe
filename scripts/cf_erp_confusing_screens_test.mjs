// Run from multi_app_fe: node scripts/cf_erp_confusing_screens_test.mjs
// "FIX THE OTHER CONFUSING SCREEN ISSUES" (user, 2026-10-24), rendered in jsdom against mocked routes:
//   (1)  Invoices: the subtitle and empty state name both ways in — Billing (advance, milestones) and dispatch;
//   (2)  Management menu: Dashboard, Plan health (the old Overview page, renamed), Approvals, Order costing — the two shared
//        ones only for Management (an approval tag); Production keeps its Dashboard, Accounts its Order costing;
//        "&" in a permission (useIsPermitted); resolveNav keeps a shared path in the section it was opened from;
//   (3)  Maintenance menu: Machine register and Tools, same routes and permissions as in Production / Stores;
//   (4)  a machine's Tools & spares list: production manage OR maintenance (the shifts and the machine stay production);
//   (5)  Company tax details: orders OR accounts manage; HSN & GST by family: catalog OR accounts manage; the scrap rate on
//        Setup › Cutting: catalog OR inventory manage — allowed and refused;
//   (6)  the older work order page says it is the older view and links to the contractor work order;
//   (7)  no "Inventory ›" menu path is left;
//   (8)  Contractors / Suppliers: no role chips, the role's own title, "Also" for the other roles (hidden), the role locked
//        on the form;
//   (9)  the machine log's own header carries the help "i";
//   (10) Records: Items — Code first, Short name once, in the column menu; Definitions — Short name first;
//   (11) rows with no flow: the freeze checklist says release will refuse them; the Production step lists them up front
//        (release-check → noFlowRows) with Give them a flow.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/testco/cf_erp/home', pretendToBeVisual: true });
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
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client'; import { MemoryRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
      export { React, createRoot, MemoryRouter, Routes, Route, Link, useLocation };
      export { SECTIONS, resolveNav, navSectionOf } from './src/apps/cf_erp/navMeta';
      export { useIsPermitted } from './src/apps/cf_erp/hooks/useIsPermitted';
      export * as RF from './src/apps/cf_erp/lib/releaseFlow';
      export { ReleaseFlowGaps } from './src/apps/cf_erp/components/ProductionOrders/ReleaseFlowGaps';
      export { ScrapRateCard } from './src/apps/cf_erp/components/ScrapRateCard';
      export { TaxByFamilyCard } from './src/apps/cf_erp/components/Tax/TaxByFamilyCard';
      export { HelpProvider } from './src/apps/cf_erp/help/HelpProvider';
      export { default as Invoices } from './src/apps/cf_erp/pages/Invoices';
      export { default as CompanyTax } from './src/apps/cf_erp/pages/CompanyTax';
      export { default as Customers } from './src/apps/cf_erp/pages/Customers';
      export { default as WorkOrderDetail } from './src/apps/cf_erp/pages/WorkOrderDetail';
      export { default as Floor } from './src/apps/cf_erp/pages/Floor';
      export { ManagementOverview } from './src/apps/cf_erp/pages/Approvals';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/api\/client$/ }, () => ({ path: 'api', namespace: 'stub' }));
    b.onResolve({ filter: /^@core\/contexts\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'stub' }));
    b.onLoad({ filter: /^api$/, namespace: 'stub' }, () => ({ contents: apiStub, loader: 'js' }));
    b.onLoad({ filter: /^auth$/, namespace: 'stub' }, () => ({ contents: authStub, loader: 'js' }));
    // load.ts uses Vite's import.meta.glob; the drawer is never opened here.
    b.onResolve({ filter: /\/load$/ }, (a) => (a.importer.includes('help') ? { path: 'helpload', namespace: 'stub' } : undefined));
    b.onLoad({ filter: /^helpload$/, namespace: 'stub' }, () => ({ contents: 'export const helpIndex = () => ({ topics: [] });', loader: 'js' }));
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
const artifact = resolve(cache, `confusing-screens-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
const { React, createRoot, MemoryRouter, Routes, Route } = m;
const h = React.createElement;

let passed = 0, failed = 0;
const check = async (label, fn) => { if (process.env.ONLY && !label.includes(process.env.ONLY)) return; try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const src = (p) => readFileSync(resolve('src/apps/cf_erp', p), 'utf8');
const app = document.getElementById('app');
let root = null;
const mount = async (el) => {
  if (root) { await React.act(async () => { root.unmount(); }); root = null; }
  document.querySelectorAll('.MuiDialog-root, .MuiPopover-root, .MuiMenu-root').forEach((n) => n.remove());
  app.replaceChildren();
  const host = document.createElement('div'); app.appendChild(host);
  root = createRoot(host);
  await React.act(async () => { root.render(el); await sleep(60); });
};
const settle = async (ms = 60) => { await React.act(async () => { await sleep(ms); }); };
const qa = (id, scope = document) => [...scope.querySelectorAll(`[data-testid="${id}"]`)];
const q1 = (id, scope = document) => scope.querySelector(`[data-testid="${id}"]`);
const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const click = async (el) => { await React.act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); await sleep(40); }); };
const reset = (perms = []) => { globalThis.__calls = []; globalThis.__routes = {}; globalThis.__user = { id: 1, uiPermissions: perms }; };
const at = (url, path, el) => h(MemoryRouter, { initialEntries: [url] }, h(Routes, null, h(Route, { path, element: el })));
const page = (slug, el) => at(`/testco/cf_erp/${slug}`, `/:company/cf_erp/${slug.replace(/\/\d+$/, '/:id')}`, el);
const sec = (k) => m.SECTIONS.find((s) => s.key === k);
const APPROVE = 'cf_erp_approve_purchase_order';

// ── (1) Invoices ─────────────────────────────────────────────────────────────────────
await check('(1) Invoices: the subtitle and the empty state name Billing (advance, milestones) and the dispatch; the file says Accounts', async () => {
  reset(['cf_erp_accounts_view']);
  globalThis.__routes['GET /invoices'] = () => ({ rows: [], total: 0, counts: { status: {}, all: 0, issuedNoIrn: 0 } });
  await mount(page('invoices', h(m.Invoices)));
  const t = text(app);
  assert.match(t, /raised from Billing \(advance, milestones\) or with a dispatch/);
  assert.doesNotMatch(t, /A tax invoice goes with each dispatch/);
  assert.match(t, /Raise one from Accounts › Billing \(advance, milestones\), or ship a line/);
  assert.doesNotMatch(src('pages/Invoices.tsx'), /Sales › Invoices/);
  assert.match(src('pages/Invoices.tsx'), /Accounts › Invoices/);
});

// ── (2) Management menu ──────────────────────────────────────────────────────────────
await check('(2) Management holds Dashboard (/management), Plan health, Approvals and Order costing; Production keeps Dashboard, Accounts Order costing', () => {
  const mg = sec('mgmt');
  assert.deepEqual(mg.screens.map((s) => [s.label, s.path]), [['Dashboard', 'management'], ['Plan health', 'management-overview'], ['Approvals', 'approvals'], ['Order costing', 'order-costing']]);
  assert.equal(new Set(mg.screens.map((s) => s.key)).size, 4, 'keys unique in the section');
  const prodDash = sec('production').screens.find((s) => s.path === 'management');
  assert.equal(prodDash.label, 'Dashboard'); assert.equal(prodDash.permission, 'cf_erp_production_view');
  assert.ok(sec('accounts').screens.some((s) => s.path === 'order-costing' && s.permission === 'cf_erp_accounts_view'));
  // Shared screens in Management need what the page needs AND an approval tag.
  const dash = mg.screens[0].permission.split('|');
  assert.equal(dash.length, 6); assert.ok(dash.every((alt) => alt.startsWith('cf_erp_production_view&cf_erp_approve_')));
  assert.ok(mg.screens[3].permission.split('|').every((alt) => alt.startsWith('cf_erp_accounts_view&cf_erp_approve_')));
  assert.equal(mg.screens[1].permission.split('|').length, 6, 'Plan health: any approval tag, as before');
});

const probe = (tags) => {
  const out = {};
  function P() { const ok = m.useIsPermitted(); for (const t of tags) out[t] = ok(t); return null; }
  return { el: at('/testco/cf_erp/home', '/:company/cf_erp/home', h(P)), out };
};
await check('(2) useIsPermitted: "|" any one, "&" all of them — production alone sees Production › Dashboard, not the Management one', async () => {
  const mg = sec('mgmt');
  const tags = [mg.screens[0].permission, mg.screens[1].permission, mg.screens[3].permission, 'cf_erp_production_view', 'a&b|c'];
  reset(['cf_erp_production_view']);
  let p = probe(tags); await mount(p.el);
  assert.deepEqual(tags.map((t) => p.out[t]), [false, false, false, true, false], 'production view only: no Management tab');
  reset(['cf_erp_production_view', APPROVE, 'cf_erp_accounts_view']);
  p = probe(tags); await mount(p.el);
  assert.deepEqual(tags.map((t) => p.out[t]), [true, true, true, true, false], 'Management with production and accounts view');
  reset([APPROVE]);
  p = probe(tags); await mount(p.el);
  assert.deepEqual(tags.map((t) => p.out[t]), [false, true, false, false, false], 'an approver without production view sees Plan health only');
  reset(['a', 'b']);
  p = probe(['a&b|c', 'a&c', 'c|b&a']); await mount(p.el);
  assert.deepEqual([p.out['a&b|c'], p.out['a&c'], p.out['c|b&a']], [true, false, true]);
});

await check('(2)+(3) resolveNav: a path in two sections stays in the one it was opened from, else the first the user may see', () => {
  const allow = (tags) => (t) => !t || t.split('|').some((alt) => alt.split('&').every((x) => tags.includes(x)));
  assert.equal(m.resolveNav('/c/cf_erp/management').section.key, 'mgmt', 'no preference: first section listing it');
  assert.equal(m.resolveNav('/c/cf_erp/management', { prefer: 'production' }).section.key, 'production');
  assert.equal(m.resolveNav('/c/cf_erp/management', { isPermitted: allow(['cf_erp_production_view']) }).section.key, 'production', 'production people land in Production');
  assert.equal(m.resolveNav('/c/cf_erp/management', { prefer: 'mgmt', isPermitted: allow(['cf_erp_production_view']) }).section.key, 'production', 'a preference the user may not see is ignored');
  assert.equal(m.resolveNav('/c/cf_erp/machines/5', { prefer: 'maintenance' }).section.key, 'maintenance');
  assert.equal(m.resolveNav('/c/cf_erp/machines/5', { prefer: 'maintenance' }).detailId, '5');
  assert.equal(m.resolveNav('/c/cf_erp/machines/5').section.key, 'production');
  assert.equal(m.resolveNav('/c/cf_erp/machine-types/3', { prefer: 'maintenance' }).section.key, 'maintenance');
  assert.equal(m.resolveNav('/c/cf_erp/tools', { prefer: 'maintenance' }).section.key, 'maintenance');
  assert.equal(m.resolveNav('/c/cf_erp/tools').section.key, 'inventory');
  assert.equal(m.resolveNav('/c/cf_erp/tools', { prefer: 'sales' }).section.key, 'inventory', 'a section that does not list it is no preference');
  assert.equal(m.navSectionOf({ navSection: 'maintenance' }), 'maintenance');
  assert.equal(m.navSectionOf({ backTo: { label: 'x', path: 'y' } }), null);
  assert.equal(m.navSectionOf(null), null);
  // The menus put the section on their links; the shell reads it; the palette keeps one row per section.
  for (const f of ['components/shell/SectionNav.tsx', 'components/shell/TopNav.tsx', 'components/shell/MobileNavSheet.tsx']) assert.match(src(f), /state=\{\{ navSection: section\.key \}\}/, f);
  assert.match(src('components/shell/CfErpShell.tsx'), /resolveNav\(pathname, \{ prefer, isPermitted \}\)/);
  assert.match(src('components/CommandPalette.tsx'), /id: `nav:\$\{section\.key\}:\$\{screen\.path\}`/);
});

await check('(2) the Overview page is Plan health now (title), same path', async () => {
  reset([APPROVE]);
  globalThis.__routes['GET /planner/health'] = () => ({ baseline: null });
  await mount(page('management-overview', h(m.ManagementOverview)));
  const h1 = [...document.querySelectorAll('h1, h2, h4, h5')].map(text);
  assert.ok(h1.some((t) => t === 'Plan health'), JSON.stringify(h1));
  assert.ok(!h1.includes('Overview'));
});

// ── (3) Maintenance menu ─────────────────────────────────────────────────────────────
await check('(3) Maintenance lists the Machine register and Tools — the same routes and permissions as in Production and Stores', () => {
  const mt = sec('maintenance');
  const reg = mt.screens.find((s) => s.path === 'machines');
  const tools = mt.screens.find((s) => s.path === 'tools');
  assert.equal(reg.label, 'Machine register'); assert.ok(reg.hasDetail);
  assert.equal(reg.permission, sec('production').screens.find((s) => s.path === 'machines').permission);
  assert.equal(tools.permission, sec('inventory').screens.find((s) => s.path === 'tools').permission);
  assert.equal(new Set(mt.screens.map((s) => s.label)).size, mt.screens.length, 'no two "Machines" labels');
});

// ── (4) Tools & spares ───────────────────────────────────────────────────────────────
await check('(4) MachineDetail: Tools & spares with production manage OR maintenance; shifts / editing stay on production manage', () => {
  const s = src('pages/MachineDetail.tsx');
  assert.match(s, /const canResources = isPermitted\('cf_erp_production_manage\|cf_erp_maintenance'\);/);
  assert.match(s, /<MachineResourcesCard machineId=\{id\} canManage=\{canResources\} \/>/);
  assert.match(s, /const canManage = isPermitted\('cf_erp_production_manage'\);/);
  assert.match(s, /actions=\{canManage && \(/, 'edit / delete still production manage');
});

// ── (5) tax and scrap-rate permissions ───────────────────────────────────────────────
const TAX = { legalName: 'Placebo Steel', tradeName: null, gstin: null, stateCode: '36', stateName: 'Telangana', address1: null, address2: null, city: null, pincode: null, lutNumber: null, invoicePrefix: 'INV', einvoiceRequired: false, gstRates: [18] };
const taxRoutes = () => {
  globalThis.__routes['GET /settings/tax'] = () => TAX;
  globalThis.__routes['GET /tax/states'] = () => [{ code: '36', name: 'Telangana' }];
  globalThis.__routes['GET /tax/families'] = () => ({ gstRates: [18], families: [], gaps: { items: 0, noHsn: 0, noRate: 0 } });
};
for (const [label, perms, canEdit, canFamily] of [
  ['accounts manage', ['cf_erp_accounts_view', 'cf_erp_accounts_manage'], true, true],
  // 2026-10-27: Company tax details are accounts manage only — orders manage reads them.
  ['orders manage', ['cf_erp_orders_view', 'cf_erp_orders_manage'], false, false],
  ['catalog manage + orders view', ['cf_erp_orders_view', 'cf_erp_catalog_manage'], false, true],
  ['orders view only', ['cf_erp_orders_view'], false, false],
]) {
  await check(`(5) Company tax details with ${label}: details ${canEdit ? 'saved' : 'read only'}, family card ${canFamily ? 'allowed' : 'refused'}`, async () => {
    reset(perms); taxRoutes();
    await mount(page('company-tax', h(m.CompanyTax)));
    await settle();
    const t = text(app);
    assert.equal(/You can read these details but not change them/.test(t), !canEdit, 'details');
    assert.equal(/Setting a family needs the catalog manage or accounts manage permission/.test(t), !canFamily, 'family card');
  });
}
await check('(5) the Company tax details menu entry: orders view OR accounts view', () => {
  assert.equal(sec('setup').screens.find((s) => s.key === 'company-tax').permission, 'cf_erp_orders_view|cf_erp_accounts_view');
});
for (const [label, perms, ok] of [['catalog manage', ['cf_erp_catalog_view', 'cf_erp_catalog_manage'], true], ['inventory manage', ['cf_erp_inventory_manage'], true], ['catalog view only', ['cf_erp_catalog_view'], false]]) {
  await check(`(5) Setup › Cutting scrap rate with ${label}: ${ok ? 'Save scrap rate shown' : 'read only'}`, async () => {
    reset(perms);
    globalThis.__routes['GET /stock/scrap-rate'] = () => ({ ratePerKg: 32, note: null });
    await mount(page('cutting', h(m.ScrapRateCard)));
    const btn = [...document.querySelectorAll('button')].find((b) => text(b) === 'Save scrap rate');
    assert.equal(!!btn, ok);
    assert.equal(document.querySelector('[data-testid="scrap-rate-input"]').disabled, !ok);
  });
}

// ── (6) older work order page ────────────────────────────────────────────────────────
for (const kind of ['po', 'cells']) {
  await check(`(6) /work-orders/:id (${kind}): says it is the older view and links to the contractor work order`, async () => {
    reset(['cf_erp_production_view']);
    globalThis.__routes['GET /work-orders/41'] = () => ({ id: 41, code: 'WO-0041', kind, status: 'issued', contractorName: 'Ravi Fabricators', orderId: 9, orderCode: 'SO-1', orderLineId: 3, lineNo: 1, cellCount: 4, scope: [] });
    await mount(page('work-orders/41', h(m.WorkOrderDetail)));
    await settle();
    const note = q1('wo-older-view');
    assert.ok(note, 'the note');
    assert.match(text(note), /^This is the older work order view/);
    assert.match(text(note), kind === 'po' ? /run on its contractor work order page \(Accounts › Work orders\)/ : /operations on locked pieces/);
    assert.equal(q1('wo-open-contractor').getAttribute('href'), '/testco/cf_erp/contractor-work-orders/41');
  });
}
await check('(6) what links to the old page: the Dashboard work orders tab and an older contractor work order (no dead AssignPanel import)', () => {
  assert.match(src('components/Dashboard/WorkOrdersTab.tsx'), /`work-orders\/\$\{w\.id\}`/);
  assert.match(src('pages/ContractorWorkOrderDetail.tsx'), /`work-orders\/\$\{wo\.id\}`/);
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const users = walk(resolve('src/apps/cf_erp')).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('AssignPanel.tsx') && /from '[^']*AssignPanel'/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(users, [], 'AssignPanel (which also links there) is used nowhere');
});

// ── (7) no "Inventory ›" menu path ───────────────────────────────────────────────────
await check('(7) no "Inventory ›" menu path left in the screens, comments or help', () => {
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const hits = walk(resolve('src/apps/cf_erp')).filter((f) => /\.(tsx?|md)$/.test(f) && /Inventory ›/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
  assert.match(src('pages/PurchaseOrders.tsx'), /Stores › Receive against PO/);
  assert.match(src('pages/PurchaseOrderDetail.tsx'), /Stores › Receive against PO/);
});

// ── (8) Contractors / Suppliers ──────────────────────────────────────────────────────
const party = (id, roles) => ({ id, code: `P${id}`, name: `Party ${id}`, roles, contactName: null, email: null, phone: null, taxNumber: null, status: 'active' });
for (const [role, slug, title, other] of [['subcontractor', 'contractors', 'Contractors', 'Supplier'], ['supplier', 'suppliers', 'Suppliers', 'Customer']]) {
  await check(`(8) ${title}: no role chips, its own title, the other roles under a hidden "Also", the role locked on the form`, async () => {
    reset(['cf_erp_orders_view', 'cf_erp_parties_manage']);
    try { localStorage.clear(); } catch { /* none */ }
    globalThis.__routes['GET /parties'] = (b, url) => { assert.match(url, new RegExp(`role=${role}`)); return { rows: [party(1, [role, other === 'Supplier' ? 'supplier' : 'customer'])], total: 1, counts: { roles: {}, active: 1, inactive: 0, noContact: 0 } }; };
    await mount(at(`/testco/cf_erp/${slug}`, `/:company/cf_erp/${slug}`, h(m.Customers, { fixedRole: role })));
    await settle();
    const t = text(app);
    const h1 = [...document.querySelectorAll('h1, h2, h4, h5')].map(text);
    assert.ok(h1.includes(title), JSON.stringify(h1));
    for (const word of ['Customers', 'Suppliers', 'Contractors'].filter((w) => w !== title)) assert.ok(!t.includes(word), `no ${word} chip or words`);
    const heads = [...document.querySelectorAll('th')].map(text);
    assert.ok(heads.includes('Name') && !heads.includes('Roles') && !heads.includes('Also'), `the Also column starts hidden: ${JSON.stringify(heads)}`);
    const src8 = src('pages/Customers.tsx');
    assert.match(src8, /\{!fixedRole && ROLE_CHIPS\.map/);
    assert.match(src8, /header: 'Also'.*defaultHidden: true/);
    assert.match(src8, /lockRole=\{!!fixedRole\}/);
    // The form: the screen's role is ticked and cannot be unticked.
    const newBtn = [...document.querySelectorAll('button')].find((b) => /^New (contractor|supplier)$/.test(text(b)));
    await click(newBtn);
    const boxes = [...document.querySelectorAll('.MuiDialog-root input[type="checkbox"]')];
    const labels = boxes.map((b) => text(b.closest('label')));
    const mine = boxes[labels.findIndex((l) => l.startsWith(role === 'supplier' ? 'Supplier' : 'Contractor'))];
    assert.ok(mine.checked && mine.disabled, 'the role stays ticked');
    assert.ok(boxes.filter((b) => b !== mine).every((b) => !b.disabled), 'the other roles can still be added');
  });
}

// ── (9) the machine log's help button ────────────────────────────────────────────────
await check('(9) the machine log (no app header) shows the help "i" in its own header', async () => {
  reset(['cf_erp_floor']);
  try { localStorage.clear(); } catch { /* none */ }
  globalThis.__routes['GET /floor/machines'] = () => [];
  await mount(at('/testco/cf_erp/floor', '/:company/cf_erp/floor', h(m.HelpProvider, null, h(m.Floor))));
  await settle();
  const btn = document.querySelector('header [data-help-button]');
  assert.ok(btn, 'the button in the header');
  assert.equal(btn.getAttribute('aria-label'), 'Help for the machine log');
  // Without a HelpProvider it draws nothing (as everywhere).
  await mount(at('/testco/cf_erp/floor', '/:company/cf_erp/floor', h(m.Floor)));
  assert.equal(document.querySelector('[data-help-button]'), null);
});

// ── (10) Records columns ─────────────────────────────────────────────────────────────
await check('(10) Records: Definitions start with Short name; Items with Code, and Short name once, hidden, after BOM', () => {
  const s = src('pages/Records.tsx');
  const body = s.slice(s.indexOf('function columnsFor'), s.indexOf('export default function Records'));
  const defs = body.slice(body.indexOf("if (recordKind === 'definition')"), body.indexOf('const comesFrom'));
  const items = body.slice(body.indexOf('const comesFrom'));
  const keys = (part) => [...part.matchAll(/key: '([a-zA-Z]+)'/g)].map((x) => x[1]);
  assert.deepEqual(keys(defs), ['shortName', 'chooses']);
  assert.ok(/key: 'shortName', header: 'Short name',[^\n]*alwaysVisible: true/.test(defs));
  assert.deepEqual(keys(items), ['code', 'tracked', 'sourcing', 'bom', 'shortName']);
  assert.ok(/key: 'shortName', header: 'Short name', defaultHidden: true/.test(items));
  assert.equal((body.match(/key: 'shortName'/g) ?? []).length, 2, 'one per screen');
  assert.ok(/name, kind, classification,/.test(defs) && /name, kind, classification,/.test(items));
});

// ── (11) rows with no flow ───────────────────────────────────────────────────────────
await check('(11) the words: "Release will refuse these N rows until they have a flow"', () => {
  assert.equal(m.RF.releaseRefusesText(3), 'Release will refuse these 3 rows until they have a flow');
  assert.equal(m.RF.releaseRefusesText(1), 'Release will refuse this row until it has a flow');
  assert.equal(m.RF.rowNames(['A', 'B', 'C']), 'A, B and C');
  assert.equal(m.RF.rowNames(['A']), 'A');
  assert.equal(m.RF.rowNames(['A', 'B', 'C', 'D', 'E', 'F', 'G']), 'A, B, C, D, E and 2 more');
  assert.equal(m.RF.freezeFlowDetail(['Web', 'Flange']), 'Release will refuse these 2 rows until they have a flow: Web and Flange. Freezing is not held up — give them a flow now, or any time before release.');
  // The checklist and the confirm dialog use them; the freeze stays a warning.
  const lp = src('components/Lock/LockPanel.tsx');
  assert.match(lp, /detail: freezeFlowDetail\(ch\.rows\.map\(\(r\) => r\.name\)\)/);
  assert.match(lp, /\{releaseRefusesText\(noFlowRows\?\.length \?\? 0\)\}/);
  assert.match(lp, /Give them a flow<\/Button>/);
});
await check('(11) the lines the Production step checks: pending production orders, or every line while some are still to be created; never a released line', () => {
  assert.deepEqual(m.RF.linesToCheck({ lineIds: [1, 2, 3], pendingLineIds: [2], releasedLineIds: [], toCreate: false }), [2]);
  assert.deepEqual(m.RF.linesToCheck({ lineIds: [1, 2, 3], pendingLineIds: [], releasedLineIds: [3], toCreate: true }), [1, 2]);
  assert.deepEqual(m.RF.linesToCheck({ lineIds: [1, 2], pendingLineIds: [2, 2, 1], releasedLineIds: [1], toCreate: false }), [2]);
  assert.deepEqual(m.RF.linesToCheck({ lineIds: [1], pendingLineIds: [], releasedLineIds: [], toCreate: false }), []);
  const ps = src('components/ProductionOrders/ProductionStep.tsx');
  assert.match(ps, /<ReleaseFlowGaps lineIds=\{flowLines\} canGive=\{isPermitted\('cf_erp_orders_manage'\)\}/);
});
const rc = (lineId, lineNo, rows) => ({ line: { id: lineId, lineNo, orderId: 9, orderCode: 'SO-1', quantity: 1 }, ok: !rows.length, problems: rows.map((r) => `${r.name} has no flow — say how it is made.`), noFlowRows: rows });
await check('(11) Production step: the rows release would refuse are listed up front, per line, with Give them a flow', async () => {
  reset(['cf_erp_production_view', 'cf_erp_orders_manage']);
  globalThis.__routes['GET /order-lines/11/release-check'] = () => rc(11, 1, [{ recordId: 501, lineId: 71, name: 'Web plate' }, { recordId: 502, lineId: null, name: 'Girder G1' }]);
  globalThis.__routes['GET /order-lines/12/release-check'] = () => rc(12, 2, []);
  globalThis.__routes['GET /order-lines/13/release-check'] = () => ({ __status: 500, body: { message: 'boom' } });
  globalThis.__routes['GET /flows'] = () => [{ id: 7, code: 'FL-PLATE', name: 'Plate work', status: 'active' }];
  await mount(page('orders/9', h(m.ReleaseFlowGaps, { lineIds: [11, 12, 13], canGive: true })));
  await settle();
  const box = q1('release-flow-gaps');
  assert.ok(box);
  assert.match(text(box), /^Release will refuse these 2 rows until they have a flow\./);
  const rows = qa('release-flow-gap');
  assert.equal(rows.length, 1, 'only the line with gaps (a failing check hides nothing else)');
  assert.match(text(rows[0]), /Line 1: Web plate and Girder G1\./);
  await click(q1('release-give-flow'));
  const dlg = document.querySelector('.MuiDialog-root');
  assert.ok(dlg && /Give these rows a flow/.test(text(dlg)), 'the freeze checklist\'s own dialog');
  assert.equal(qa('give-flow-rows')[0].querySelectorAll('input[type="checkbox"]').length, 2);
});
await check('(11) nothing to say: no box; without the orders permission the list stays, the button does not', async () => {
  reset(['cf_erp_production_view']);
  globalThis.__routes['GET /order-lines/12/release-check'] = () => rc(12, 2, []);
  await mount(page('orders/9', h(m.ReleaseFlowGaps, { lineIds: [12], canGive: false })));
  assert.equal(q1('release-flow-gaps'), null);
  globalThis.__routes['GET /order-lines/11/release-check'] = () => rc(11, 1, [{ recordId: 501, lineId: 71, name: 'Web plate' }]);
  await mount(page('orders/9', h(m.ReleaseFlowGaps, { lineIds: [11], canGive: false })));
  assert.match(text(q1('release-flow-gaps')), /Release will refuse this row until it has a flow\./);
  assert.equal(q1('release-give-flow'), null);
  assert.match(text(q1('release-flow-gaps')), /needs the orders permission/);
});

if (root) await React.act(async () => { root.unmount(); });
console.log(`\ncf_erp_confusing_screens_test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
