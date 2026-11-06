import type { NavSection } from '@shared/ui';

/** The single source of sumangal_dashboard navigation. routes.tsx must use the same paths. */
export const SECTIONS: NavSection[] = [
  {
    key: 'home',
    label: 'Home',
    screens: [
      { label: 'What changed', path: 'what-changed', keywords: ['movers', 'compare', 'up', 'down', 'month', 'summary'] },
    ],
  },
  {
    key: 'orders',
    label: 'Orders',
    screens: [
      { label: 'Order journey', path: 'journey', keywords: ['timeline', 'due date', 'late', 'on time', 'gantt'] },
      { label: 'Planning', path: 'planning', keywords: ['work order', 'batch', 'sub-batch', 'split', 'extra', 'rework', 'start'] },
      { label: 'Action list', path: 'actions', keywords: ['chase', 'past due', 'not poured', 'waiting'] },
      { label: 'Open orders', path: 'orders', keywords: ['pending', 'on time', 'late', 'plan', 'casting date'] },
    ],
  },
  {
    key: 'production',
    label: 'Production',
    screens: [
      { label: 'Where the time goes', path: 'time-spent', keywords: ['days', 'stages', 'lead time', 'bottleneck', 'after pouring'] },
      { label: 'Batches and sub-batches', path: 'batches', keywords: ['split', 'sub-batch', 'heat', 'a b c'] },
      { label: 'All steps', path: 'production', keywords: ['stages', 'wip', 'kg per day'] },
      { label: 'Injection', path: 'step-injection', keywords: ['wax'] },
      { label: 'Assembly', path: 'step-assembly', keywords: ['tree'] },
      { label: 'Coating', path: 'step-coating', keywords: ['shell', 'dipping'] },
      { label: 'Dewaxing', path: 'step-dewaxing', keywords: ['autoclave'] },
      { label: 'Melting', path: 'step-melting', keywords: ['pouring', 'heats', 'charge', 'scrap', 'energy', 'meters', 'solar', 'gas', 'furnace'] },
      { label: 'Fettling', path: 'step-fettling', keywords: ['grinding'] },
      { label: 'Heat treatment', path: 'step-heat-treatment', keywords: ['annealing', 'normalizing'] },
      { label: 'Inspection', path: 'step-inspection', keywords: ['qc'] },
      { label: 'Machining inspection', path: 'step-machining-inspection', keywords: ['machining'] },
      { label: 'Dispatch', path: 'step-dispatch', keywords: ['shipping', 'export', 'domestic'] },
    ],
  },
  {
    key: 'shipping',
    label: 'Shipping',
    screens: [
      { label: 'Customer rhythm', path: 'rhythm', keywords: ['frequency', 'how often', 'missed', 'skipped', 'monthly', 'slot'] },
      { label: 'Ready and waiting', path: 'ready-waiting', keywords: ['cleared', 'not shipped', 'next shipment', 'stock'] },
      { label: 'Orders per shipment', path: 'orders-per-shipment', keywords: ['lot', 'minimum quantity', 'clubbed', 'container', 'order size'] },
    ],
  },
  {
    key: 'vendors',
    label: 'Vendors',
    screens: [
      { label: 'Job-work vendors', path: 'vendors', keywords: ['turnaround', 'machining', 'turning', 'fettling', 'polishing', 'outward', 'inward'] },
      { label: 'Machining orders', path: 'machining-orders', keywords: ['purchase order', 'po', 'open'] },
      { label: 'Material suppliers', path: 'material-suppliers', keywords: ['scrap', 'alloy', 'purchase', 'rate', 'grn'] },
    ],
  },
  {
    key: 'quality',
    label: 'Quality',
    screens: [
      { label: 'Problem parts', path: 'problem-parts', keywords: ['worse', 'better', 'rejected parts'] },
      { label: 'Rejection', path: 'quality', keywords: ['reason', 'stage', 'department', 'yield'] },
    ],
  },
  { key: 'customers', label: 'Customers', screens: [{ label: 'Customers', path: 'customers', keywords: ['sales', 'price', 'billing', 'credit'] }] },
];
