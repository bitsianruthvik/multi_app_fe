import { useEffect, useState, type ReactNode } from 'react';
import { AppShell, ThemeScope, ToastProvider } from '@shared/ui';
import { SECTIONS, COUNT_META } from '../../navMeta';
import { fetchNavCounts } from '../../api/client';
// Side effect: registers every cf_hrms status with its tone and label, so a
// StatusBadge reads the same on every screen. Every route renders inside this
// shell, so importing it here covers the whole app.
import '../../statusMap';

/**
 * The cf_hrms shell. Everything structural lives in @shared/ui — this file only
 * supplies what is genuinely cf_hrms: the nav source, the brand mark, the quick
 * create list, and where the badge counts come from.
 *
 * If you find yourself adding layout or chrome here, it belongs in the kit
 * instead (DESIGN_SYSTEM.md, "The kit").
 */
const QUICK_CREATE = [
  { label: 'Employee', path: 'employees?new=1', permission: 'cf_hrms_people_manage' },
  { label: 'Work assignment', path: 'assignments?new=1', permission: 'cf_hrms_assignments_manage' },
  { label: 'Role', path: 'roles?new=1', permission: 'cf_hrms_roles_manage' },
  { label: 'Position', path: 'positions?new=1', permission: 'cf_hrms_org_manage' },
];

// No `shortcutGroups` here on purpose: the kit's ShortcutsHelp already ships the
// palette, `?` and Esc bindings. Add a group only for a shortcut unique to
// cf_hrms — the org chart's collapse keys will earn one.

export function CfHrmsShell({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Advisory by contract: fetchNavCounts swallows its own failures and returns
  // {}, so a slow or broken count never blocks navigation or shows an error.
  useEffect(() => {
    let live = true;
    fetchNavCounts().then((c) => {
      if (live) setCounts(c);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <ThemeScope appSlug="cf_hrms">
      <ToastProvider>
        <AppShell
          appSlug="cf_hrms"
          sections={SECTIONS}
          brand={{ label: 'HRMS', initial: 'H' }}
          counts={counts}
          countMeta={COUNT_META}
          quickCreate={QUICK_CREATE}
        >
          {children}
        </AppShell>
      </ToastProvider>
    </ThemeScope>
  );
}

export default CfHrmsShell;
