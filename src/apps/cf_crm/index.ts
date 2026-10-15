import type { NavItem } from '@core/components/Sidebar';

/**
 * cf_crm draws its own screen (CfCrmFrame, a full-screen page), so it has no
 * platform nav. The empty list is only because apps/index.ts registers every
 * app with the same shape.
 */
function buildUserNav(): NavItem[] {
  return [];
}

export const cfCrmApp = {
  slug: 'cf_crm',
  buildUserNav,
  Dashboard: null,
  routes: [],
};
