/**
 * The single source of cf_erp navigation, as in fab_erp: the top nav's two
 * rows, the breadcrumb on detail pages, the ⌘K palette's "Go to" group and the
 * mobile sheet all read this. A second definition is how nav and breadcrumbs
 * drift apart — keep it to one.
 *
 * Sections follow the design system's two worlds: Sales, Catalog, Production and
 * Inventory are the day-to-day (orders, items, machines, flows, stock), Setup
 * configures what they are made of.
 */
export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface NavScreen {
  key: string;
  label: string;
  /** Path under /:company/cf_erp/ */
  path: string;
  /** Detail pages under this screen: /:company/cf_erp/<path>/:id */
  hasDetail?: boolean;
  /** feature_tag that gates it; undefined = always visible. Tags joined by "|" = any one of them. */
  permission?: string;
  /** Key into GET /nav-counts for the row-2 badge. */
  countKey?: string;
  /** Extra words the palette should match. */
  keywords?: string[];
}

export interface NavSection {
  key: string;
  label: string;
  screens: NavScreen[];
}

const VIEW = 'cf_erp_catalog_view';
const ORDERS = 'cf_erp_orders_view';
const PRODUCTION = 'cf_erp_production_view';
const INVENTORY = 'cf_erp_inventory_view';
const FLOOR = 'cf_erp_floor';
const PRODUCTION_MANAGE = 'cf_erp_production_manage';
/** §74: the Accounts section (Billing, Invoices, Receipts, Order costing). */
const ACCOUNTS = 'cf_erp_accounts_view';
/** The MD (approve plate changes) or the buyer (stock and buying manage) — any one of them. */
const PLATE_CHANGES = 'cf_erp_plate_change_approve|cf_erp_inventory_manage';
/**
 * MANAGEMENT (§73): the approvals inbox. Each kind of approval has its own tag; holding any one of them shows the
 * Management tab (the backend's approvalService.APPROVAL_TYPES; api/approvals.ts ANY_APPROVAL is the same list).
 */
const APPROVE_ANY = 'cf_erp_approve_order_acceptance|cf_erp_approve_purchase_order|cf_erp_approve_contractor_po|cf_erp_approve_po_close_short|cf_erp_approve_rate_change|cf_erp_approve_rebaseline';
/** Management approves purchase orders, so sees them (§71 the MD's "MD approval"; §73 the approval tags). */
const PURCHASE_ORDERS = `cf_erp_inventory_view|cf_erp_purchase|cf_erp_plate_change_approve|${APPROVE_ANY}`;
/**
 * §79 STORES CHAIN (user 2026-10-18): Need → MR → STORES (take from stock, raise the PR) → Purchase (quotes → PO) →
 * Management → Stores GRN → stock. Stores has its own tag; Purchase sees PRs and POs only. The older inventory tag still
 * opens both, so nobody loses a screen.
 */
const STORES = 'cf_erp_inventory_view|cf_erp_stores';
const PURCHASE = 'cf_erp_inventory_view|cf_erp_purchase';
/**
 * THE NESTING PLATE-CHANGE GATE IS OFF (§71, user 2026-10-18: "remove nesting approval from MD for now, will add back
 * later if required") — the backend's plateChangeService gate, default off. While it is off the "Plate changes" screen is
 * not in the menu (its page stays: a customer's substitute still goes to the MD there, linked from the MR screen and
 * Inventory › To return to customers). Turn both on together.
 */
/** §82: the Maintenance tab (also on every role that manages production). */
const MAINTENANCE = 'cf_erp_maintenance';
export const PLATE_CHANGE_GATE = false;

export const SECTIONS: NavSection[] = [
  { key: 'home', label: 'Home', screens: [{ key: 'home', label: 'Home', path: 'home', keywords: ['cockpit', 'today', 'dashboard'] }] },
  {
    key: 'sales',
    label: 'Sales',
    screens: [
      { key: 'orders', label: 'Orders', path: 'orders', hasDetail: true, permission: ORDERS, countKey: 'openOrders', keywords: ['sales order', 'inquiry', 'quote', 'project'] },
      // §73: every customer order in its lane (inquiry → pending approval → material → production → dispatched → post-production → closed).
      { key: 'orders-board', label: 'Orders board', path: 'orders-board', permission: ORDERS, keywords: ['board', 'kanban', 'lanes', 'pipeline', 'post-production', 'inspection', 'erection', 'handover', 'checklist'] },
      { key: 'customers', label: 'Customers', path: 'customers', permission: ORDERS, countKey: 'customers', keywords: ['suppliers', 'parties', 'vendors'] },
    ],
  },
  {
    // §73: what waits for Management's yes — one inbox — and room for dashboards later.
    key: 'mgmt',
    label: 'Management',
    screens: [
      { key: 'approvals', label: 'Approvals', path: 'approvals', permission: APPROVE_ANY, countKey: 'pendingApprovals', keywords: ['approve', 'approval', 'md', 'acceptance', 'rate change', 'purchase order', 'close short', 'inbox', 'pending'] },
      { key: 'management-overview', label: 'Overview', path: 'management-overview', permission: APPROVE_ANY, keywords: ['management', 'dashboard'] },
    ],
  },
  {
    // §74: ACCOUNTS — billing by payment milestones, the tax invoices, receipts, the cost sheet of each order. Contractor
    // work orders (Step 6, §85: raised from a production order, approved by Management, paid week by week) are "Work orders".
    key: 'accounts',
    label: 'Accounts',
    screens: [
      { key: 'billing', label: 'Billing', path: 'billing', permission: ACCOUNTS, countKey: 'billingDue', keywords: ['billing', 'milestones', 'payment terms', 'due', 'raise invoice', 'advance', 'retention', 'pro-rata', 'bill'] },
      { key: 'invoices', label: 'Invoices', path: 'invoices', hasDetail: true, permission: `${ORDERS}|${ACCOUNTS}`, keywords: ['tax invoice', 'gst', 'e-way', 'einvoice', 'irn', 'bill', 'dispatch', 'pdf'] },
      { key: 'receipts', label: 'Receipts', path: 'receipts', permission: ACCOUNTS, keywords: ['payment', 'receipt', 'received', 'outstanding', 'part payment', 'cheque', 'neft', 'upi', 'on account'] },
      { key: 'order-costing', label: 'Order costing', path: 'order-costing', permission: ACCOUNTS, keywords: ['cost sheet', 'margin', 'costing', 'material cost', 'consumables', 'scrap credit', 'profit'] },
      { key: 'contractor-work-orders', label: 'Work orders', path: 'contractor-work-orders', hasDetail: true, permission: ACCOUNTS, keywords: ['contractor', 'subcontract', 'job work', 'outsource', 'weekly payment', 'contractor po', 'tonnes'] },
    ],
  },
  {
    key: 'purchase',
    label: 'Purchase',
    screens: [
      // Purchase flow v3 (§71): PR (the RFQ, vendor columns) → PO (Management approval) → GRN. §79: MRs moved to Stores —
      // Purchase sees PRs only.
      { key: 'purchase-requests', label: 'Purchase requests', path: 'purchase-requests', hasDetail: true, permission: PURCHASE, keywords: ['purchase request', 'pr', 'rfq', 'quotation', 'quote', 'vendor', 'supplier', 'compare', 'rate', 'raise po'] },
      { key: 'purchase-orders', label: 'Purchase orders', path: 'purchase-orders', hasDetail: true, permission: PURCHASE_ORDERS, countKey: 'openPurchases', keywords: ['po', 'supplier', 'vendor', 'md approval', 'approve', 'close short', 'delivery', 'goods receipt', 'grn', 'contractor', 'material'] },
      // Plate changes asked after a PO covers a line (init.sql §62): hidden while the gate is off (§71).
      ...(PLATE_CHANGE_GATE ? [{ key: 'plate-changes', label: 'Plate changes', path: 'plate-changes', permission: PLATE_CHANGES, keywords: ['plate change', 'approve', 'approval', 'md', 're-nest', 'nesting change', 'checklist', 'po change'] }] : []),
      // Who we buy from — the parties screen pinned to suppliers (RFQs and POs pick from them).
      { key: 'suppliers', label: 'Suppliers', path: 'suppliers', permission: PURCHASE, keywords: ['supplier', 'vendor', 'party', 'mill', 'rfq'] },
    ],
  },
  {
    key: 'catalog',
    label: 'Catalog',
    screens: [
      { key: 'items', label: 'Items', path: 'items', hasDetail: true, permission: VIEW, countKey: 'items', keywords: ['catalog', 'parts', 'material', 'classification', 'family', 'subfamily', 'variant', 'tree'] },
      { key: 'definitions', label: 'Definitions', path: 'definitions', hasDetail: true, permission: VIEW, countKey: 'definitions', keywords: ['templates', 'selections', 'blueprints', 'classification'] },
      // Standard drawings (init.sql §69): a drawing number with its BOM and values, copied onto order lines.
      { key: 'standard-drawings', label: 'Standard drawings', path: 'standard-drawings', hasDetail: true, permission: `${ORDERS}|${VIEW}`, keywords: ['standard', 'rdso', 'drawing number', 'girder', 'bom', 'library', 'template drawing'] },
    ],
  },
  {
    key: 'production',
    label: 'Production',
    screens: [
      // Management's glance: by machine and by order. Not 'dashboard' — that path is the login landing (redirects to Home).
      { key: 'management', label: 'Dashboard', path: 'management', permission: PRODUCTION, keywords: ['management', 'utilisation', 'utilization', 'oee', 'downtime', 'stops', 'overtime', 'order progress', 'at risk', 'late', 'tonnes', 'kpi', 'report'] },
      // Step 5 (§84): the planner per production order, step by step — auto (AI) / manual (Management), baseline, plan health.
      { key: 'planner', label: 'Planner', path: 'planner', permission: PRODUCTION, keywords: ['planner', 'schedule', 'gantt', 'production order', 'capacity', 'shifts', 'baseline', 're-baseline', 'priority', 'rank', 'auto', 'manual', 'ai', 'late', 'slowed'] },
      { key: 'plan', label: 'Plan by month', path: 'plan', permission: PRODUCTION, keywords: ['planner', 'schedule', 'capacity', 'ship', 'month', 'goal', 'priority', 'auto-plan'] },
      // Every released line, by sales order (2026-10-17). A production order = a release; work orders stay the contractors'.
      { key: 'production-orders', label: 'Production orders', path: 'production-orders', permission: PRODUCTION, keywords: ['released', 'release', 'yet to plan', 'planned', 'in production', 'dispatch', 'closed', 'progress', 'status', 'sales order'] },
      { key: 'tracker', label: 'Tracker', path: 'tracker', permission: PRODUCTION, countKey: 'readySteps', keywords: ['work queue', 'shop floor', 'steps', 'release', 'reserve', 'material'] },
      { key: 'floor', label: 'Machine log', path: 'floor', permission: FLOOR, keywords: ['shop floor', 'operator', 'start', 'pause', 'stop', 'my day', 'shift log', 'tablet'] },
      { key: 'machines', label: 'Machines', path: 'machines', hasDetail: true, permission: PRODUCTION, countKey: 'machines', keywords: ['shifts', 'calendar', 'equipment', 'machine types', 'classification'] },
      { key: 'operations', label: 'Operations', path: 'operations', hasDetail: true, permission: PRODUCTION, countKey: 'operations', keywords: ['timing', 'cut', 'weld'] },
      // Work orders moved to Accounts (Step 6, §85); they are raised from a production order (Contractor work).
      { key: 'contractors', label: 'Contractors', path: 'contractors', permission: ORDERS, keywords: ['subcontractor', 'job work', 'outsource', 'vendor', 'party'] },
      { key: 'flows', label: 'Flows', path: 'flows', hasDetail: true, permission: PRODUCTION, countKey: 'draftFlows', keywords: ['routing', 'steps', 'wait for'] },
    ],
  },
  {
    // §79 (user 2026-10-18): STORES replaces Inventory (the key stays 'inventory' — links and tests name it). Every MR comes
    // here (MR inbox, filter by For); Stores take from stock and raise the PR; "To reorder" (by AI) feeds stock MRs; GRN
    // is "Receive against PO"; then stock, issues and returns, offcuts and scrap, tools.
    key: 'inventory',
    label: 'Stores',
    screens: [
      { key: 'material-requests', label: 'MR inbox', path: 'material-requests', hasDetail: true, permission: STORES, keywords: ['material request', 'mr', 'requisition', 'inbox', 'take from stock', 'earmark', 'locked', 'new mr', 'for', 'maintenance', 'general', 'stores'] },
      { key: 'to-reorder', label: 'To reorder', path: 'to-reorder', permission: STORES, keywords: ['reorder', 'min max', 'minimum', 'maximum', 'periodic', 'replenish', 'refill', 'stock mr', 'by ai', 'procurement method'] },
      { key: 'stock', label: 'Stock', path: 'stock', permission: INVENTORY, countKey: 'stockLines', keywords: ['on hand', 'inventory', 'receive'] },
      // §71: GRNs against purchase orders waiting for goods — several per PO; what arrives is locked for its order.
      { key: 'receive', label: 'Receive against PO', path: 'receive', permission: INVENTORY, keywords: ['grn', 'goods receipt', 'receive', 'delivery', 'purchase order', 'po', 'inward'] },
      { key: 'wip', label: 'Work in progress', path: 'wip', permission: INVENTORY, keywords: ['production ledger', 'pieces', 'in process', 'making', 'containers', 'segments', 'parts'] },
      { key: 'offcuts', label: 'Offcuts', path: 'offcuts', permission: INVENTORY, keywords: ['remnant', 'leftover', 'scrap', 'nest', 'plate', 'drop'] },
      // §81: tools are stock items; their life, per piece issued.
      { key: 'tools', label: 'Tools', path: 'tools', permission: INVENTORY, keywords: ['tool life', 'worn out', 'die', 'jig', 'gauge', 'cutter', 'spares', 'consumables'] },
      // Customer material not needed or not accepted (§68) — worked out on the read; a return movement clears it.
      { key: 'customer-returns', label: 'To return to customers', path: 'customer-returns', permission: INVENTORY, keywords: ['customer material', 'return', 'extra', 'substitute', 'send back', 'free issue'] },
      { key: 'movements', label: 'Movements', path: 'movements', hasDetail: true, permission: INVENTORY, keywords: ['receipt', 'issue', 'transfer', 'grn', 'count', 'scrap'] },
      { key: 'batches', label: 'Batches', path: 'batches', hasDetail: true, permission: INVENTORY, countKey: 'heldBatches', keywords: ['heat', 'lot'] },
      { key: 'stocking-areas', label: 'Stocking areas', path: 'stocking-areas', hasDetail: true, permission: INVENTORY, countKey: 'areas', keywords: ['yard', 'store', 'location', 'wip'] },
    ],
  },
  {
    // §82 MAINTENANCE (user 2026-10-18): the machines board (running / down / planned downtime), maintenance orders raised by a
    // fault or a preventive plan, the plans, and planned downtime written into the machine calendar the planner reads.
    key: 'maintenance',
    label: 'Maintenance',
    screens: [
      { key: 'maintenance', label: 'Machines', path: 'maintenance', permission: MAINTENANCE, keywords: ['maintenance', 'breakdown', 'fault', 'down', 'running', 'machines board', 'raise a fault'] },
      { key: 'maintenance-orders', label: 'Maintenance orders', path: 'maintenance-orders', hasDetail: true, permission: MAINTENANCE, keywords: ['mo', 'repair', 'breakdown', 'fault', 'false alarm', 'waiting for parts', 'spares'] },
      { key: 'maintenance-plans', label: 'Preventive plans', path: 'maintenance-plans', permission: MAINTENANCE, keywords: ['preventive', 'pm', 'service', 'lubrication', 'run hours', 'tonnes', 'every n days'] },
      { key: 'planned-downtime', label: 'Planned downtime', path: 'planned-downtime', permission: MAINTENANCE, keywords: ['downtime', 'shutdown', 'calendar', 'every sunday', 'holiday', 'machine off'] },
    ],
  },
  {
    key: 'setup',
    label: 'Setup',
    screens: [
      { key: 'specifications', label: 'Specifications', path: 'specifications', permission: VIEW, keywords: ['attributes', 'fields'] },
      { key: 'formulas', label: 'Value formulas', path: 'formulas', permission: VIEW, keywords: ['formulas', 'calculation', 'roll-up', 'weight', 'area'] },
      { key: 'coding-rules', label: 'Coding rules', path: 'coding-rules', permission: VIEW, keywords: ['codes', 'numbering', 'names'] },
      { key: 'company-tax', label: 'Company tax details', path: 'company-tax', permission: ORDERS, keywords: ['gst', 'gstin', 'tax', 'hsn', 'invoice prefix', 'lut', 'rates'] },
      { key: 'cutting', label: 'Cutting', path: 'cutting', permission: VIEW, keywords: ['cut from', 'plate', 'section', 'angle', 'beam', 'channel', 'saw', 'kerf', 'offcut', 'cut pieces', 'raw stock'] },
      { key: 'operators', label: 'Operators', path: 'operators', permission: PRODUCTION_MANAGE, keywords: ['people', 'workers', 'machine log', 'names'] },
      { key: 'stop-reasons', label: 'Stop reasons', path: 'stop-reasons', permission: PRODUCTION_MANAGE, keywords: ['downtime', 'breakdown', 'idle', 'machine log'] },
      // A process is how an order is worked through the office — never a flow,
      // which is how a girder is made and lives under Production.
      { key: 'processes', label: 'Processes', path: 'processes', hasDetail: true, permission: ORDERS, keywords: ['stages', 'order process', 'applies to', 'house default', 'workflow'] },
      // §73: what a customer acceptance starts from — charges, payment milestones, post-production stages.
      { key: 'term-templates', label: 'Templates', path: 'term-templates', permission: ORDERS, keywords: ['templates', 'charges', 'rates', 'milestones', 'payment terms', 'post-production', 'stages', 'acceptance'] },
    ],
  },
];

/** Tone of a row-2 badge: a size stays neutral; a count of waiting work pulls the eye. */
export const COUNT_TONE: Record<string, { tone: BadgeTone; suffix?: string }> = {
  openOrders: { tone: 'info', suffix: 'open' },
  draftFlows: { tone: 'warning', suffix: 'draft' },
  heldBatches: { tone: 'warning', suffix: 'held' },
  readySteps: { tone: 'success', suffix: 'ready' },
  openPurchases: { tone: 'info', suffix: 'open' },
  pendingApprovals: { tone: 'warning', suffix: 'waiting' },
  billingDue: { tone: 'warning', suffix: 'due' },
};

export interface ResolvedNav {
  section: NavSection;
  screen: NavScreen;
  detailId: string | null;
}

/** Which section and screen a pathname belongs to. /:company/cf_erp/<screen>[/<id>] */
export function resolveNav(pathname: string): ResolvedNav | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[1] !== 'cf_erp') return null;
  const [, , rawPath, detailId] = parts;
  // A machine type's page belongs to the Machines screen; it has no top-nav item of its own.
  const screenPath = rawPath === 'machine-types' ? 'machines' : rawPath;
  for (const section of SECTIONS) {
    const screen = section.screens.find((s) => s.path === screenPath);
    if (screen) return { section, screen, detailId: screen.hasDetail && detailId ? detailId : null };
  }
  return null;
}

/** Every screen with its section — the palette's "Go to" list. */
export const allScreens = () => SECTIONS.flatMap((section) => section.screens.map((screen) => ({ section, screen })));

export const appPath = (company: string, path: string) => `/${company}/cf_erp/${path}`;
