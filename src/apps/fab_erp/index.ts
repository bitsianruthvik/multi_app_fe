import type { NavItem } from '@core/components/Sidebar';

/**
 * fab_erp no longer uses the shared sidebar rail.
 *
 * Navigation is the two-row top nav rendered by
 * `components/nav/FabErpShell.tsx`, and its single source of truth is
 * `navMeta.ts` — which also feeds the breadcrumb and the ⌘K palette.
 * See FAB_ERP_UX_ELEVATION_PLAN.md §2.1.
 *
 * This returns an empty list rather than being deleted because `apps/index.ts`
 * registers every app with the same shape. Do NOT re-add nav entries here: a
 * second nav definition is exactly what drifted last time — the old rail and
 * the old breadcrumb map disagreed, leaving 12 routes with no label and 4
 * labels with no route.
 */
function buildUserNav(): NavItem[] {
  return [];
}

export const fabErpApp = {
  slug: 'fab_erp',
  buildUserNav,
  Dashboard: null,
  routes: [],
};
