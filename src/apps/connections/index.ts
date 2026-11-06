import type { NavItem } from '@core/components/Sidebar';

/**
 * connections uses the shared shell (@shared/ui AppShell) driven by navMeta.ts.
 * The empty list is only because apps/index.ts registers every app with the same shape.
 */
function buildUserNav(): NavItem[] {
  return [];
}

export const connectionsApp = {
  slug: 'connections',
  buildUserNav,
  Dashboard: null,
  routes: [],
};
