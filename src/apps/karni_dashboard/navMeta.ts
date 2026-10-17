import type { NavSection } from '@shared/ui';

/**
 * The single source of karni_dashboard navigation (top nav, section row,
 * breadcrumb, ⌘K, mobile sheet). routes.tsx must use the same paths.
 */
export const SECTIONS: NavSection[] = [
  {
    key: 'home',
    label: 'Overview',
    screens: [{ label: 'Overview', path: 'overview', keywords: ['home', 'kpi', 'summary'] }],
  },
  {
    key: 'sales',
    label: 'Sales',
    screens: [
      { label: 'Sales', path: 'sales', keywords: ['invoices', 'revenue', 'customers'] },
      { label: 'Sales orders', path: 'sales-orders', keywords: ['open orders', 'so'] },
      { label: 'Receivables', path: 'receivables', keywords: ['ageing', 'aging', 'outstanding', 'debtors'] },
    ],
  },
  {
    key: 'purchase',
    label: 'Purchase',
    screens: [
      { label: 'Purchase orders', path: 'purchase-orders', keywords: ['po', 'vendors'] },
      { label: 'Payables', path: 'payables', keywords: ['creditors', 'ageing', 'aging'] },
    ],
  },
  {
    key: 'stock',
    label: 'Stock',
    screens: [{ label: 'Inventory', path: 'inventory', keywords: ['items', 'stock', 'shortage'] }],
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
