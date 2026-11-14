/**
 * The dashboard has three layouts over the same data:
 *  - 'topic'  : by subject (orders, production, shipping, vendors, quality, customers);
 *  - 'intent' : by what the reader wants to do (alerts, today, this month, long term, decisions);
 *  - 'flow'   : by how an order moves: As-is (what is open today) and Historic (orders that came in a range),
 *               each with Customer, Planning, Production and Dispatch.
 * The choice is kept in this browser so the layouts can be compared side by side.
 */
export type Layout = 'topic' | 'intent' | 'flow';
const KEY = 'sumangal.layout';

export function getLayout(): Layout {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'intent' || v === 'flow' ? v : 'topic';
  } catch { return 'topic'; }
}
export function setLayout(v: Layout) {
  try { window.localStorage.setItem(KEY, v); } catch { /* private window: the layout just won't be remembered */ }
}
export const HOME: Record<Layout, string> = { topic: 'key-metrics', intent: 'x-alerts', flow: 'flow-asis-customer' };
