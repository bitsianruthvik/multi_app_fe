// Run from multi_app_fe: node scripts/cf_erp_role_perms_test.mjs
// ORDERS MANAGE IS TOO BROAD (user decisions 2026-10-27; backend scripts/cf_kepl/role_perms_test.mjs, init.sql §94):
//   A  invoices (raise from dispatches, edit, issue, cancel, IRN, e-way), Company tax details and Setup › Templates are
//      written with cf_erp_accounts_manage only — the screens read the same for orders view; deleting an order shows
//      only with cf_erp_orders_delete (the MD);
//   B  PPC (production manage) dispatches, ships, reserves and issues to production; Plan health and the maintenance
//      schedule (board, orders, planned downtime) are in the menu for production view, read only.
// The menu is navMeta itself, evaluated with the useIsPermitted rule ("a&b|c") for each role's real tag list; the gates
// on the screens are read from the source.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

let passed = 0, failed = 0;
const check = async (label, fn) => {
  try { await fn(); passed++; console.log(`  PASS  ${label}`); } catch (e) { failed++; console.log(`  FAIL  ${label}\n        ${e.message.split('\n').join('\n        ')}`); }
};
const src = (p) => readFileSync(resolve('src/apps/cf_erp', p), 'utf8');

const built = await build({ entryPoints: ['src/apps/cf_erp/navMeta.ts'], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error' });
const { SECTIONS } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

const tags = (...t) => t.map((x) => `cf_erp_${x}`);
const ROLES = {
  ordersOnly: tags('catalog_manage', 'catalog_view', 'inventory_view', 'orders_manage', 'orders_view', 'parties_manage', 'production_view', 'purchase'),
  ppc: tags('catalog_view', 'floor', 'inventory_view', 'orders_manage', 'orders_view', 'production_manage', 'production_view'),
  accounts: tags('accounts_view', 'accounts_manage'),
  md: tags('catalog_view', 'catalog_manage', 'setup_manage', 'codegen_manage', 'orders_view', 'orders_manage', 'orders_delete', 'parties_manage',
    'production_view', 'production_manage', 'inventory_view', 'inventory_manage', 'accounts_view', 'accounts_manage', 'floor', 'stores', 'purchase',
    'maintenance', 'purchase_approve', 'plate_change_approve', 'approve_order_acceptance', 'approve_purchase_order', 'approve_contractor_po',
    'approve_po_close_short', 'approve_rate_change', 'approve_rebaseline'),
};
/** The useIsPermitted rule: "|" = any, "&" = all. */
const can = (perms, tag) => !tag || tag.split('|').some((alt) => alt.split('&').every((t) => perms.includes(t.trim())));
const screensOf = (perms) => SECTIONS.flatMap((s) => s.screens.filter((x) => can(perms, x.permission)).map((x) => `${s.key}/${x.path}`));
const sees = (role, sectionPath) => screensOf(ROLES[role]).includes(sectionPath);

// ── A: the menu reads are unchanged; the writes are gated on the screens ────────────────────────────────
await check('A menu: Invoices, Company tax details and Templates still show for orders view (read), and for Accounts', () => {
  for (const role of ['ordersOnly', 'ppc', 'md']) {
    assert.ok(sees(role, 'accounts/invoices'), `${role} Invoices`);
    assert.ok(sees(role, 'setup/company-tax'), `${role} Company tax`);
    assert.ok(sees(role, 'setup/term-templates'), `${role} Templates`);
  }
  assert.ok(sees('accounts', 'accounts/invoices') && sees('accounts', 'setup/company-tax') && sees('accounts', 'setup/term-templates'), 'Accounts keep them');
});
await check('A screens: every invoice / tax / template write asks cf_erp_accounts_manage, none asks orders manage', () => {
  assert.match(src('pages/InvoiceDetail.tsx'), /const canManage = useIsPermitted\(\)\('cf_erp_accounts_manage'\);/);
  assert.match(src('components/OrderInvoicesCard.tsx'), /const canManage = useIsPermitted\(\)\('cf_erp_accounts_manage'\);/);
  assert.match(src('components/TrackerDialogs.tsx'), /const canInvoice = useIsPermitted\(\)\('cf_erp_accounts_manage'\);/);
  assert.match(src('pages/CompanyTax.tsx'), /const canEdit = useIsPermitted\(\)\('cf_erp_accounts_manage'\);/);
  assert.match(src('pages/TermTemplates.tsx'), /const canManage = useIsPermitted\(\)\('cf_erp_accounts_manage'\);/);
  assert.match(src('components/Acceptance/AcceptanceStep.tsx'), /const canSaveTemplate = isPermitted\('cf_erp_accounts_manage'\);/);
  for (const f of ['pages/InvoiceDetail.tsx', 'components/OrderInvoicesCard.tsx', 'pages/CompanyTax.tsx', 'pages/TermTemplates.tsx']) {
    assert.doesNotMatch(src(f), /cf_erp_orders_manage/, f);
  }
  // The HSN & GST by family card is unchanged: catalog manage OR accounts manage.
  assert.match(src('components/Tax/TaxByFamilyCard.tsx'), /useIsPermitted\(\)\('cf_erp_catalog_manage\|cf_erp_accounts_manage'\)/);
});
await check('A order page: the delete button needs cf_erp_orders_delete; status buttons and Revise stay on orders manage', () => {
  const s = src('pages/OrderDetail.tsx');
  assert.match(s, /const canDelete = isPermitted\('cf_erp_orders_delete'\);/);
  assert.match(s, /: canDelete && DELETABLE\.includes\(o\.status\) && \(/);
  assert.match(s, /const canManage = isPermitted\('cf_erp_orders_manage'\);/);
  assert.match(s, /actions=\{canManage && \(/);
  assert.ok(!can(ROLES.ordersOnly, 'cf_erp_orders_delete') && !can(ROLES.ppc, 'cf_erp_orders_delete') && can(ROLES.md, 'cf_erp_orders_delete'));
});

// ── B: PPC moves stock for production; Plan health and the maintenance schedule are read with production view ──
const MOVE = 'cf_erp_inventory_manage|cf_erp_production_manage';
await check('B1 screens: Dispatch (order step and production order page), Reserve / Issue on the tracker — inventory OR production manage', () => {
  assert.match(src('components/ProductionOrders/ProductionStep.tsx'), new RegExp(`const canShip = isPermitted\\('${MOVE.replace('|', '\\|')}'\\);`));
  assert.match(src('pages/ProductionOrderDetail.tsx'), new RegExp(`\\{isPermitted\\('${MOVE.replace('|', '\\|')}'\\) && po\\.actions\\.dispatch &&`));
  assert.match(src('pages/Tracker.tsx'), new RegExp(`const canStock = isPermitted\\('${MOVE.replace('|', '\\|')}'\\);`));
  assert.ok(can(ROLES.ppc, MOVE) && !can(ROLES.ordersOnly, MOVE) && !can(ROLES.accounts, MOVE));
  // Stock movements, receipts and the rest of Stores stay inventory manage.
  assert.match(src('pages/Movements.tsx'), /const canManage = useIsPermitted\(\)\('cf_erp_inventory_manage'\);/);
  assert.match(src('pages/Stock.tsx'), /const canManage = useIsPermitted\(\)\('cf_erp_inventory_manage'\);/);
  assert.match(src('pages/OrderDetail.tsx'), /const canReserve = isPermitted\('cf_erp_inventory_manage'\);/);
});
await check('B2 menu: Production › Plan health (the management-overview page) for production manage (2026-10-31); Management keeps its own', () => {
  const prod = SECTIONS.find((s) => s.key === 'production');
  const ph = prod.screens.find((x) => x.key === 'plan-health');
  assert.equal(ph.path, 'management-overview');
  assert.equal(ph.permission, 'cf_erp_production_manage');
  for (const role of ['ppc', 'md']) assert.ok(sees(role, 'production/management-overview'), role);
  assert.ok(!sees('ordersOnly', 'production/management-overview'), 'production view alone: no Production tab (2026-10-31)');
  assert.ok(!sees('accounts', 'production/management-overview'));
  assert.ok(!sees('ppc', 'mgmt/management-overview') && !sees('ppc', 'mgmt/approvals'), 'PPC has no Management tab');
  assert.ok(sees('md', 'mgmt/management-overview'));
  // The page itself has no write: the plan health card and a link to the planner.
  const page = src('pages/Approvals.tsx');
  const body = page.slice(page.indexOf('export function ManagementOverview'), page.indexOf('export function ManagementOverview') + 600);
  assert.match(body, /<PlanHealthCard \/>/);
  assert.doesNotMatch(body, /onClick/);
});
await check('B3 menu: Maintenance › Machines, Maintenance orders, Planned downtime for production manage (PPC, 2026-10-31); Preventive plans stay Maintenance\'s', () => {
  assert.ok(!sees('ordersOnly', 'maintenance/maintenance'), 'production view alone: no Maintenance tab (2026-10-31)');
  for (const role of ['ppc']) {
    assert.ok(sees(role, 'maintenance/maintenance'), `${role} board`);
    assert.ok(sees(role, 'maintenance/maintenance-orders'), `${role} orders`);
    assert.ok(sees(role, 'maintenance/planned-downtime'), `${role} downtime`);
    assert.ok(!sees(role, 'maintenance/maintenance-plans'), `${role} plans`);
  }
  assert.ok(!sees('accounts', 'maintenance/maintenance'));
  // The pages' writes stay on cf_erp_maintenance.
  const m = src('pages/Maintenance.tsx');
  assert.equal((m.match(/const canManage = useIsPermitted\(\)\(MAINTENANCE\);/g) ?? []).length, 3);
  assert.match(src('pages/MaintenanceOrderDetail.tsx'), /const canManage = useIsPermitted\(\)\(MAINTENANCE\);/);
});

// ── C (2026-10-27): the two gaps closed ──────────────────────────────────────────────────────────────────
await check('C1 Accounts alone raise dispatch invoices from Accounts › Invoices — no sales order needed', () => {
  assert.ok(sees('accounts', 'accounts/invoices'), 'Accounts see Invoices');
  assert.ok(!sees('accounts', 'sales/orders'), 'and still no sales orders (the reason for the card)');
  assert.match(src('pages/Invoices.tsx'), /<ShippedNotInvoicedCard \/>/);
  const card = src('components/ShippedNotInvoicedCard.tsx');
  assert.match(card, /const canManage = useIsPermitted\(\)\('cf_erp_accounts_manage'\);/);
  assert.match(card, /uninvoicedOrders\(\)/);
  assert.match(card, /makeInvoice\(orderId, movementIds\)/);
  assert.match(src('api/gst.ts'), /cfApi\.get<\{ rows: UninvoicedOrder\[\] \}>\('\/invoices\/uninvoiced'\)/);
});
await check('C2 the order-level material supply saves through its own route (Stores may), not PUT /orders/:id', () => {
  const a = src('components/Acceptance/AcceptanceStep.tsx');
  assert.match(a, /\/orders\/\$\{order\.id\}\/material-supply`, \{ supply: v \}/);
  assert.doesNotMatch(a, /\{ materialSupply: v \}/);
  assert.match(a, /const canSupply = isPermitted\('cf_erp_inventory_manage'\) \|\| canManage;/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
