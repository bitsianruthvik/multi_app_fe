import { buildPlatformAdminItems } from '@apps/audio_intelligence/index';
import { getApp } from '@apps/index';
import type { NavItem } from '@core/components/Sidebar';

export function buildAdminNavItems(companySlug: string, appSlug: string): NavItem[] {
  const app = getApp(appSlug);
  if (app?.buildAdminNav) return app.buildAdminNav(companySlug, appSlug);
  // Fallback: just platform items
  return buildPlatformAdminItems(companySlug, appSlug);
}
