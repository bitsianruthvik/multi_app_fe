import type { NavItem } from '@core/components/Sidebar';

/**
 * karni_dashboard uses the shared shell (@shared/ui AppShell) driven by
 * navMeta.ts. The empty list is only because apps/index.ts registers every
 * app with the same shape.
 */
function buildUserNav(): NavItem[] {
  return [];
}

export const karniDashboardApp = {
  slug: 'karni_dashboard',
  buildUserNav,
  Dashboard: null,
  routes: [],
};
