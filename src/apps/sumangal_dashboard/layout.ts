/**
 * The dashboard has two layouts over the same screens and data:
 *  - 'topic'  : by subject (orders, production, shipping, vendors, quality, customers);
 *  - 'intent' : by what the reader wants to do (alerts, today, this month, long term, decisions).
 * The choice is kept in this browser so the two can be compared side by side.
 */
export type Layout = 'topic' | 'intent';
const KEY = 'sumangal.layout';

export function getLayout(): Layout {
  try { return window.localStorage.getItem(KEY) === 'intent' ? 'intent' : 'topic'; } catch { return 'topic'; }
}
export function setLayout(v: Layout) {
  try { window.localStorage.setItem(KEY, v); } catch { /* private window: the layout just won't be remembered */ }
}
export const HOME: Record<Layout, string> = { topic: 'key-metrics', intent: 'x-alerts' };
