import { getApp } from '@apps/index';
import type { NavItem } from '@core/components/Sidebar';

export function buildUserNavItems(company: string, app: string, user?: { role?: string }): NavItem[] {
  const appDef = getApp(app);
  if (appDef?.buildUserNav) return appDef.buildUserNav(company, app, user);
  return [];
}
