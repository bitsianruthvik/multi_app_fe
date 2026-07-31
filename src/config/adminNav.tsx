import { buildPlatformAdminItems } from '@apps/audio_intelligence/index';
import { getApp } from '@apps/index';
import type { NavItem } from '@core/components/Sidebar';

export function buildAdminNavItems(companySlug: string, appSlug: string): NavItem[] {
  const app = getApp(appSlug);
  // Only some app manifests declare buildAdminNav, so the registry's union type
  // doesn't have the property on every member — `app?.buildAdminNav` is a type
  // error even though it is a safe runtime check. `in` narrows the union properly.
  if (app && 'buildAdminNav' in app && typeof app.buildAdminNav === 'function') {
    return app.buildAdminNav(companySlug, appSlug);
  }
  // Fallback: just platform items
  return buildPlatformAdminItems(companySlug, appSlug);
}
