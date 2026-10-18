import { labelForPath, type NavSection } from '@shared/ui';

/**
 * The single source of karni_dashboard navigation (top nav, section row,
 * breadcrumb, ⌘K, mobile sheet). routes.tsx must use the same paths.
 */
export const SECTIONS: NavSection[] = [
  {
    key: 'home',
    label: 'Home',
    screens: [
      { label: 'Needs attention', path: 'attention', keywords: ['insights', 'alerts', 'action', 'exceptions', 'issues'] },
      { label: 'Overview', path: 'overview', keywords: ['home', 'kpi', 'summary', 'today'] },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    screens: [
      { label: 'Sales', path: 'sales', keywords: ['invoices', 'revenue', 'customers', 'register', 'item wise', 'hsn'] },
      { label: 'Sales orders', path: 'sales-orders', keywords: ['pending so', 'open orders', 'so', 'backlog'] },
      { label: 'Dispatch', path: 'dispatch', keywords: ['delivery', 'deliveries', 'shipping', 'logistics'] },
      { label: 'Receivables', path: 'receivables', keywords: ['ageing', 'aging', 'outstanding', 'debtors', 'collections', 'incoming payments'] },
    ],
  },
  {
    key: 'purchase',
    label: 'Purchase',
    screens: [
      { label: 'Purchase', path: 'purchase', keywords: ['register', 'po vs grpo', 'grn', 'vendors', 'spend'] },
      { label: 'Purchase orders', path: 'purchase-orders', keywords: ['open po'] },
      { label: 'Payables', path: 'payables', keywords: ['creditors', 'ageing', 'aging', 'vendor payments', 'outgoing'] },
    ],
  },
  {
    key: 'production',
    label: 'Production',
    screens: [{ label: 'Production', path: 'production', keywords: ['machine', 'output', 'yield', 'wip', 'routing', 'printing', 'lamination', 'slitting', 'packing'] }],
  },
  {
    key: 'stock',
    label: 'Stock',
    screens: [{ label: 'Inventory', path: 'inventory', keywords: ['items', 'stock', 'warehouse', 'godown', 'shortage', 'consumption', 'transfer'] }],
  },
  {
    key: 'sap',
    label: 'SAP',
    screens: [
      { label: 'SAP reports', path: 'sap-reports', keywords: ['queries', 'query manager'] },
      { label: 'Connection', path: 'connection', keywords: ['connector', 'sync', 'status'] },
    ],
  },
];

/** The menu label of a screen path, e.g. "sales-orders" → "Sales orders". */
export const labelForScreen = (path: string) => labelForPath(SECTIONS, path);
