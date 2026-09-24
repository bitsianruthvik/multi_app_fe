import type { NavItem } from '@core/components/Sidebar';

/**
 * cf_hrms uses the shared shell (@shared/ui AppShell) driven by navMeta.ts, not
 * the platform sidebar rail. This returns an empty list only because
 * apps/index.ts registers every app with the same shape — do not add nav
 * entries here; one nav definition is the rule (DESIGN_SYSTEM.md §3).
 */
function buildUserNav(): NavItem[] {
  return [];
}

export const cfHrmsApp = {
  slug: 'cf_hrms',
  buildUserNav,
  Dashboard: null,
  routes: [],
};
