import { useMemo } from 'react';
import { TabbedScreen, type ScreenTab } from '../components/TabbedScreen';
import { useIsPlatformAdmin } from '../api/access';
import AccessRoles from './access/AccessRoles';
import AccessLogins from './access/AccessLogins';
import AccessLogs from './access/AccessLogs';

/**
 * Setup › Logins and access (CF_HRMS_HIRING_SPEC.md §12.7).
 *
 *   Access roles   what each access role may do — the tick-box table
 *   Logins         who can sign in, with which access role
 *   Error logs     the platform's log; listed only for the platform admin
 *
 * The route is guarded by the right to manage logins and access roles. The tab
 * is in the address (`?tab=logins`); an address that names a tab which is not
 * listed — the old `?tab=capabilities`, or `?tab=logs` for anyone but the
 * platform admin — lands on Access roles.
 */
export default function Access() {
  const platformAdmin = useIsPlatformAdmin();
  const tabs = useMemo<ScreenTab[]>(
    () => [
      { value: 'roles', label: 'Access roles', render: () => <AccessRoles /> },
      { value: 'logins', label: 'Logins', render: () => <AccessLogins /> },
      ...(platformAdmin ? [{ value: 'logs', label: 'Error logs', render: () => <AccessLogs /> }] : []),
    ],
    [platformAdmin],
  );

  return (
    <TabbedScreen
      title="Logins and access"
      subtitle="Who can sign in to HRMS, and what each access role may do."
      tabs={tabs}
    />
  );
}
