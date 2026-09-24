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
  /** feature_tag that gates it; undefined = always visible. */
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

export const SECTIONS: NavSection[] = [
  { key: 'home', label: 'Home', screens: [{ key: 'home', label: 'Home', path: 'home', keywords: ['cockpit', 'today', 'dashboard'] }] },
  {
    key: 'sales',
    label: 'Sales',
    screens: [
      { key: 'orders', label: 'Orders', path: 'orders', hasDetail: true, permission: ORDERS, countKey: 'openOrders', keywords: ['sales order', 'inquiry', 'quote', 'project'] },
      { key: 'customers', label: 'Customers', path: 'customers', permission: ORDERS, countKey: 'customers', keywords: ['suppliers', 'parties', 'vendors'] },
    ],
  },
  {
    key: 'catalog',
    label: 'Catalog',
    screens: [
      { key: 'items', label: 'Items', path: 'items', hasDetail: true, permission: VIEW, countKey: 'items', keywords: ['catalog', 'parts', 'material'] },
      { key: 'definitions', label: 'Definitions', path: 'definitions', hasDetail: true, permission: VIEW, countKey: 'definitions', keywords: ['templates', 'selections', 'blueprints'] },
    ],
  },
  {
    key: 'production',
    label: 'Production',
    screens: [
      { key: 'tracker', label: 'Tracker', path: 'tracker', permission: PRODUCTION, countKey: 'readySteps', keywords: ['work queue', 'shop floor', 'steps', 'release', 'reserve', 'material'] },
      { key: 'machines', label: 'Machines', path: 'machines', hasDetail: true, permission: PRODUCTION, countKey: 'machines', keywords: ['shifts', 'calendar', 'equipment'] },
      { key: 'operations', label: 'Operations', path: 'operations', hasDetail: true, permission: PRODUCTION, countKey: 'operations', keywords: ['timing', 'cut', 'weld'] },
      { key: 'flows', label: 'Flows', path: 'flows', hasDetail: true, permission: PRODUCTION, countKey: 'draftFlows', keywords: ['routing', 'steps', 'wait for'] },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    screens: [
      { key: 'stock', label: 'Stock', path: 'stock', permission: INVENTORY, countKey: 'stockLines', keywords: ['on hand', 'inventory', 'receive'] },
      { key: 'buy-list', label: 'To buy', path: 'buy-list', permission: INVENTORY, countKey: 'toBuy', keywords: ['shortage', 'short', 'procurement', 'buy', 'purchase', 'requisition'] },
      { key: 'purchase-orders', label: 'Purchase orders', path: 'purchase-orders', hasDetail: true, permission: INVENTORY, countKey: 'openPurchases', keywords: ['po', 'supplier', 'delivery', 'goods receipt', 'grn', 'procurement'] },
      { key: 'movements', label: 'Movements', path: 'movements', hasDetail: true, permission: INVENTORY, keywords: ['receipt', 'issue', 'transfer', 'grn', 'count', 'scrap'] },
      { key: 'batches', label: 'Batches', path: 'batches', hasDetail: true, permission: INVENTORY, countKey: 'heldBatches', keywords: ['heat', 'lot'] },
      { key: 'stocking-areas', label: 'Stocking areas', path: 'stocking-areas', hasDetail: true, permission: INVENTORY, countKey: 'areas', keywords: ['yard', 'store', 'location', 'wip'] },
    ],
  },
  {
    key: 'setup',
    label: 'Setup',
    screens: [
      { key: 'classification', label: 'Classification', path: 'classification', permission: VIEW, keywords: ['family', 'variant', 'tree', 'machine types'] },
      { key: 'specifications', label: 'Specifications', path: 'specifications', permission: VIEW, keywords: ['attributes', 'fields'] },
      { key: 'formulas', label: 'Formulas', path: 'formulas', permission: VIEW, keywords: ['calculation', 'roll-up', 'timing'] },
      { key: 'coding-rules', label: 'Coding rules', path: 'coding-rules', permission: VIEW, keywords: ['codes', 'numbering', 'names'] },
      // A process is how an order is worked through the office — never a flow,
      // which is how a girder is made and lives under Production.
      { key: 'processes', label: 'Processes', path: 'processes', hasDetail: true, permission: ORDERS, keywords: ['stages', 'order process', 'applies to', 'house default', 'workflow'] },
    ],
  },
];

/** Tone of a row-2 badge: a size stays neutral; a count of waiting work pulls the eye. */
export const COUNT_TONE: Record<string, { tone: BadgeTone; suffix?: string }> = {
  openOrders: { tone: 'info', suffix: 'open' },
  draftFlows: { tone: 'warning', suffix: 'draft' },
  heldBatches: { tone: 'warning', suffix: 'held' },
  readySteps: { tone: 'success', suffix: 'ready' },
  toBuy: { tone: 'danger', suffix: 'short' },
  openPurchases: { tone: 'info', suffix: 'open' },
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
  const [, , screenPath, detailId] = parts;
  for (const section of SECTIONS) {
    const screen = section.screens.find((s) => s.path === screenPath);
    if (screen) return { section, screen, detailId: screen.hasDetail && detailId ? detailId : null };
  }
  return null;
}

/** Every screen with its section — the palette's "Go to" list. */
export const allScreens = () => SECTIONS.flatMap((section) => section.screens.map((screen) => ({ section, screen })));

export const appPath = (company: string, path: string) => `/${company}/cf_erp/${path}`;
