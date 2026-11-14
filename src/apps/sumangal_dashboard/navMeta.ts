import type { NavSection } from '@shared/ui';

/** The single source of sumangal_dashboard navigation. routes.tsx must use the same paths. */
export const SECTIONS: NavSection[] = [
  {
    key: 'home',
    label: 'Home',
    screens: [
      { label: 'Key metrics', path: 'key-metrics', keywords: ['summary', 'overview', 'kpi', 'main', 'dashboard'] },
      { label: 'What changed', path: 'what-changed', keywords: ['movers', 'compare', 'up', 'down', 'month'] },
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
  { key: 'layout', label: 'By intent ⇄', screens: [{ label: 'Open the by-intent dashboard', path: 'layout-intent', keywords: ['switch', 'second dashboard', 'intent', 'alerts', 'today'] }] },
  { key: 'layout-flow', label: 'By flow ⇄', screens: [{ label: 'Open the by-flow dashboard', path: 'layout-flow', keywords: ['switch', 'as-is', 'historic', 'flow', 'third'] }] },
];

/** The second layout: the same data arranged by what the reader wants to do. Detail screens are shared with the first. */
export const INTENT_SECTIONS: NavSection[] = [
  { key: 'x-alerts', label: 'Alerts', screens: [{ label: 'Alerts', path: 'x-alerts', keywords: ['wrong', 'awry', 'warning', 'attention', 'outside'] }] },
  { key: 'x-today', label: 'Today', screens: [{ label: 'Today', path: 'x-today', keywords: ['daily', 'day to day', 'work list', 'pour', 'inspect', 'ship', 'chase', 'stock'] }] },
  { key: 'x-month', label: 'This month', screens: [{ label: 'This month', path: 'x-month', keywords: ['monthly plan', 'due', 'load', 'capacity', 'shipments expected', 'materials'] }] },
  { key: 'x-long-term', label: 'Long term', screens: [{ label: 'Long term', path: 'x-long-term', keywords: ['trend', 'year', 'growth', 'customers', 'mix'] }] },
  { key: 'x-decisions', label: 'Decisions', screens: [{ label: 'Decisions', path: 'x-decisions', keywords: ['which vendor', 'which supplier', 'extra', 'customer', 'compare', 'tactical'] }] },
  {
    key: 'x-details',
    label: 'All detail screens',
    screens: SECTIONS.filter((s) => s.key !== 'layout').flatMap((s) => s.screens).filter((s) => !s.path.startsWith('step-')),
  },
  { key: 'layout', label: 'By topic ⇄', screens: [{ label: 'Open the by-topic dashboard', path: 'layout-topic', keywords: ['switch', 'first dashboard', 'topic'] }] },
];

/** The third layout: As-is (what is open now) and Historic (orders in a range), each with the same four screens. */
const flowScreens = (mode: 'asis' | 'historic') => [
  { label: 'Customer', path: `flow-${mode}-customer`, keywords: ['sales', 'value', 'tonnes', 'units', 'order type', 'part type'] },
  { label: 'Planning', path: `flow-${mode}-planning`, keywords: ['batch', 'sub-batch', 'plan', 'yet to plan', 'split', 'accuracy'] },
  { label: 'Production', path: `flow-${mode}-production`, keywords: ['wip', 'work in progress', 'aging', 'stage', 'step', 'today'] },
  { label: 'Dispatch', path: `flow-${mode}-dispatch`, keywords: ['shipment', 'volume', 'frequency', 'top ten', 'dispatch'] },
];

/** The third layout's navigation: As-is and Historic, each with Customer, Planning, Production and Dispatch. */
export const FLOW_SECTIONS: NavSection[] = [
  { key: 'flow-asis', label: 'As-is', screens: flowScreens('asis') },
  { key: 'flow-historic', label: 'Historic', screens: flowScreens('historic') },
  { key: 'layout', label: 'By topic ⇄', screens: [{ label: 'Open the by-topic dashboard', path: 'layout-topic', keywords: ['switch', 'first dashboard', 'topic'] }] },
  { key: 'layout-intent', label: 'By intent ⇄', screens: [{ label: 'Open the by-intent dashboard', path: 'layout-intent', keywords: ['switch', 'second dashboard', 'intent', 'alerts', 'today'] }] },
];
