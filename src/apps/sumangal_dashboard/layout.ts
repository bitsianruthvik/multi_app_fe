import { ERP_HOME } from './erpScreens';

/**
 * The dashboard had four layouts over the same data: 'topic', 'intent', 'flow' and 'erp' (the operations
 * dashboard, V15). The first three are switched off for now (user, 2026-11-25: "we will see later if we need
 * them"): every browser gets 'erp', and the old layout and screen addresses land on it. Their screens stay in the
 * code; turning a layout back on = returning it here and its routes in routes.tsx.
 */
export type Layout = 'topic' | 'intent' | 'flow' | 'erp';
const KEY = 'sumangal.layout';
const ON: Layout[] = ['erp'];

export function getLayout(): Layout {
  try {
    const v = window.localStorage.getItem(KEY) as Layout | null;
    return v && ON.includes(v) ? v : 'erp';
  } catch { return 'erp'; }
}
export function setLayout(v: Layout) {
  try { window.localStorage.setItem(KEY, v); } catch { /* private window: the layout just won't be remembered */ }
}
export const HOME: Record<Layout, string> = { topic: 'key-metrics', intent: 'x-alerts', flow: 'flow-asis-customer', erp: ERP_HOME };
