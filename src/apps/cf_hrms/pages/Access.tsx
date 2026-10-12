import { TabbedScreen, type ScreenTab } from '../components/TabbedScreen';
import AccessPeople from './access/AccessPeople';
import AccessRoles from './access/AccessRoles';
import AccessCapabilities from './access/AccessCapabilities';
import AccessLogs from './access/AccessLogs';

/**
 * Setup › Logins and access — who can sign in, what their role may do, the
 * permission words behind it, and the error log. Four menu entries until
 * 2026-10-12, one screen with four tabs since (CF_HRMS_HIRING_SPEC.md §10).
 *
 * Platform-admin only, gated in navMeta.ts by the PLATFORM_ADMIN sentinel; each
 * tab is the same component it was as a page and still answers its own
 * permission question.
 */
const TABS: ScreenTab[] = [
  { value: 'logins', label: 'Logins', render: () => <AccessPeople /> },
  { value: 'roles', label: 'What a role can do', render: () => <AccessRoles /> },
  { value: 'capabilities', label: 'Capabilities and features', render: () => <AccessCapabilities /> },
  { value: 'logs', label: 'Error logs', render: () => <AccessLogs /> },
];

export default function Access() {
  return (
    <TabbedScreen
      title="Logins and access"
      subtitle="Accounts that can sign in to this company's apps, and what each role is allowed to do."
      tabs={TABS}
    />
  );
}
