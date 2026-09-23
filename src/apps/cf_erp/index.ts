import type { NavItem } from '@core/components/Sidebar';

/**
 * cf_erp does not use the shared sidebar rail: its navigation is the two-row
 * shell (components/shell/CfErpShell.tsx), driven by navMeta.ts. This returns
 * an empty list only because apps/index.ts registers every app with the same
 * shape — do not add nav entries here; one nav definition is the rule.
 */
function buildUserNav(): NavItem[] {
  return [];
}

export const cfErpApp = {
  slug: 'cf_erp',
  buildUserNav,
  Dashboard: null,
  routes: [],
};
