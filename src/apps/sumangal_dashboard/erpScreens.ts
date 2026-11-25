/**
 * The screens of the operations dashboard (the ERP dashboard, V15). Each is one pane of the page in the frame
 * (public/sumangal-v15.html); the app's own menu opens them, so the frame shows no menu of its own.
 * Paths are `erp/<slug>`; navMeta.ts builds the menu from this list and routes.tsx the route.
 */
export type ErpScreen = { slug: string; pane: string; label: string; section: 'now' | 'history'; about: string; keywords: string[] };

export const ERP_SCREENS: ErpScreen[] = [
  { slug: 'wip', pane: 'pWip', section: 'now', label: 'Work in progress', about: 'Pieces in production by stage and how long they have waited, and what is out with fettling contractors and vendors.', keywords: ['wip', 'stage', 'age', 'stale', 'fettling'] },
  { slug: 'ready', pane: 'pRfd', section: 'now', label: 'Ready to dispatch', about: 'Cleared castings in the finished store, not yet dispatched, by customer and age.', keywords: ['rfd', 'cleared', 'finished store', 'stock'] },
  { slug: 'production', pane: 'pProd', section: 'now', label: 'Production', about: 'What went through each step, day by day, for the dates you choose.', keywords: ['output', 'per day', 'poured', 'stage'] },
  { slug: 'vendors', pane: 'pVen', section: 'now', label: 'Vendors', about: 'Material out with vendors and contractors, for how long, and how many days of work each has queued.', keywords: ['challan', 'machining', 'fettling', 'job work', 'out'] },
  { slug: 'orders', pane: 'pOrd', section: 'now', label: 'Orders & customers', about: 'Open order lines per customer: in work, ready, short and overdue.', keywords: ['customers', 'open orders', 'overdue', 'late', 'order lines'] },
  { slug: 'trace', pane: 'pTrace', section: 'now', label: 'Trace a batch or order', about: 'Follow one batch, order or work order through every step.', keywords: ['batch', 'order', 'work order', 'heat', 'find'] },
  { slug: 'production-trend', pane: 'pTrend', section: 'history', label: 'Production trend', about: 'Output of each step by day, week, month or year, against its own average.', keywords: ['trend', 'monthly', 'output'] },
  { slug: 'wip-trend', pane: 'pWipT', section: 'history', label: 'WIP trend', about: 'How much was in work at each stage at the end of every period.', keywords: ['wip', 'trend', 'history'] },
  { slug: 'time', pane: 'pTime', section: 'history', label: 'Where time goes', about: 'Days spent at each stage, from order to dispatch.', keywords: ['lead time', 'days', 'bottleneck', 'cycle'] },
  { slug: 'vendor-performance', pane: 'pVperf', section: 'history', label: 'Vendor performance', about: 'How fast each vendor returns material and how much of it is rejected later.', keywords: ['turnaround', 'speed', 'quality', 'vendor'] },
  { slug: 'capacity', pane: 'pCap', section: 'history', label: 'Capacity', about: 'In-house and outsourced output per step against the pour rate it has to keep up with.', keywords: ['kg per day', 'pour rate', 'target', 'outsourced'] },
  { slug: 'dispatch', pane: 'pDisp', section: 'history', label: 'Dispatch trends', about: 'What each customer received, how often, and how much of it on time.', keywords: ['on time', 'shipped', 'customer'] },
  { slug: 'quality', pane: 'pQual', section: 'history', label: 'Quality', about: 'Rejections by process, department and reason, and the parts with the most.', keywords: ['rejection', 'pareto', 'department', 'reason', 'defect'] },
  { slug: 'scrap', pane: 'pScrap', section: 'history', label: 'Scrap', about: 'Machining and turning scrap by vendor and part, and contract fettling rejections.', keywords: ['machining scrap', 'turning', 'metal removed'] },
  { slug: 'insights', pane: 'pIns', section: 'history', label: 'Insights', about: 'Batch and heat sizes, extra pieces bought, and manual work orders.', keywords: ['batch size', 'heat', 'manual'] },
];

export const erpBySlug = (slug?: string) => ERP_SCREENS.find((s) => s.slug === slug) ?? ERP_SCREENS[0];
export const erpByPane = (pane?: string) => ERP_SCREENS.find((s) => s.pane === pane);
export const ERP_HOME = `erp/${ERP_SCREENS[0].slug}`;
