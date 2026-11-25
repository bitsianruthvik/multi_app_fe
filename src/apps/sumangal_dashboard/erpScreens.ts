/**
 * The screens of the operations dashboard (the ERP dashboard, V15). Each is one pane of the page in the frame
 * (public/sumangal-v15.html); the app's own menu opens them, so the frame shows no menu of its own.
 * Paths are one segment (the shell's menu reads only the first segment after the app); navMeta.ts builds the
 * menu from this list and routes.tsx the routes. `period`: the screen uses History's shared From–To; `quick`: Today's choice of today / yesterday / this week /
 * this month (Production only; Today's other screens are as of now, user 2026-11-25); `about`: the tab's hover hint; `age`: the age range.
 */
export type ErpScreen = { slug: string; pane: string; label: string; section: 'now' | 'history'; about: string; keywords: string[]; period?: boolean; quick?: boolean; age?: boolean };

export const ERP_SCREENS: ErpScreen[] = [
  { slug: 'wip', age: true, pane: 'pWip', section: 'now', label: 'Work in progress', about: 'Pieces in production by stage and age, and material out with contractors and vendors.', keywords: ['wip', 'stage', 'age', 'stale', 'fettling'] },
  { slug: 'ready', age: true, pane: 'pRfd', section: 'now', label: 'Ready to dispatch', about: 'Cleared castings not yet dispatched, by customer and age.', keywords: ['rfd', 'cleared', 'finished store', 'stock'] },
  { slug: 'production', quick: true, pane: 'pProd', section: 'now', label: 'Production', about: 'Output of every step: today, yesterday, this week or this month.', keywords: ['output', 'per day', 'poured', 'stage'] },
  { slug: 'vendors', age: true, pane: 'pVen', section: 'now', label: 'Vendors', about: 'Material out with vendors and contractors, and for how long.', keywords: ['challan', 'machining', 'fettling', 'job work', 'out'] },
  { slug: 'orders', age: true, pane: 'pOrd', section: 'now', label: 'Orders & customers', about: 'Open order lines per customer: in work, ready, short, overdue.', keywords: ['customers', 'open orders', 'overdue', 'late', 'order lines'] },
  { slug: 'trace', pane: 'pTrace', section: 'now', label: 'Trace a batch or order', about: 'One batch, order or work order through every step.', keywords: ['batch', 'order', 'work order', 'heat', 'find'] },
  { slug: 'production-trend', period: true, pane: 'pTrend', section: 'history', label: 'Production trend', about: 'Output of each step over time against its average.', keywords: ['trend', 'monthly', 'output'] },
  { slug: 'wip-trend', period: true, pane: 'pWipT', section: 'history', label: 'WIP trend', about: 'Work in progress at each stage, period by period.', keywords: ['wip', 'trend', 'history'] },
  { slug: 'time', period: true, pane: 'pTime', section: 'history', label: 'Where time goes', about: 'Days spent at each stage, order to dispatch.', keywords: ['lead time', 'days', 'bottleneck', 'cycle'] },
  { slug: 'vendor-performance', period: true, pane: 'pVperf', section: 'history', label: 'Vendor performance', about: 'Vendor turnaround and the rejections that follow.', keywords: ['turnaround', 'speed', 'quality', 'vendor'] },
  { slug: 'capacity', period: true, pane: 'pCap', section: 'history', label: 'Capacity', about: 'In-house and outsourced output per step against the pour rate.', keywords: ['kg per day', 'pour rate', 'target', 'outsourced'] },
  { slug: 'dispatch', period: true, pane: 'pDisp', section: 'history', label: 'Dispatch trends', about: 'What each customer received, how often, how much on time.', keywords: ['on time', 'shipped', 'customer'] },
  { slug: 'quality', period: true, pane: 'pQual', section: 'history', label: 'Quality', about: 'Rejections by process, department, reason and part.', keywords: ['rejection', 'pareto', 'department', 'reason', 'defect'] },
  { slug: 'scrap', period: true, pane: 'pScrap', section: 'history', label: 'Scrap', about: 'Machining and turning scrap by vendor and part.', keywords: ['machining scrap', 'turning', 'metal removed'] },
  { slug: 'insights', pane: 'pIns', section: 'history', label: 'Insights', about: 'Batch and heat sizes, extra pieces, manual work orders.', keywords: ['batch size', 'heat', 'manual'] },
];

export function erpBySlug(slug: string | undefined, fallback: false): ErpScreen | undefined;
export function erpBySlug(slug?: string): ErpScreen;
export function erpBySlug(slug?: string, fallback = true) { return ERP_SCREENS.find((s) => s.slug === slug) ?? (fallback ? ERP_SCREENS[0] : undefined); }
export const erpByPane = (pane?: string) => ERP_SCREENS.find((s) => s.pane === pane);
export const ERP_HOME = ERP_SCREENS[0].slug;
export const isErpPath = (pathname: string) => !!erpBySlug(pathname.split('/').filter(Boolean)[2], false);
