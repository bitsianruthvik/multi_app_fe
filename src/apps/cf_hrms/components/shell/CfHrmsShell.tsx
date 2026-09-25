import { useEffect, useState, useCallback, type ReactNode } from 'react';
import PersonRounded from '@mui/icons-material/PersonRounded';
import WorkOutlineRounded from '@mui/icons-material/WorkOutlineRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import {
  AppShell, ThemeScope, ToastProvider, CommandPaletteProvider, useIsPermitted,
  type Can, type PaletteAction, type PaletteRecord,
} from '@shared/ui';
import { SECTIONS, COUNT_META, PLATFORM_ADMIN } from '../../navMeta';
import { fetchNavCounts } from '../../api/client';
import { useIsPlatformAdmin } from '../../api/access';
import { peopleApi } from '../../api/people';
import { orgChartApi } from '../../api/orgchart';
// Side effect: registers every cf_hrms status with its tone and label, so a
// StatusBadge reads the same on every screen. Every route renders inside this
// shell, so importing it here covers the whole app.
import '../../statusMap';

/**
 * The cf_hrms shell. Everything structural lives in @shared/ui — this file only
 * supplies what is genuinely cf_hrms: the nav source, the brand mark, the quick
 * create list, the palette's own actions and search, and where the badge counts
 * come from.
 *
 * If you find yourself adding layout or chrome here, it belongs in the kit
 * instead (DESIGN_SYSTEM.md, "The kit").
 *
 * ORDER MATTERS: ThemeScope > CommandPaletteProvider > AppShell. `TopNav`'s
 * search field and the ⌘K binding both come from the palette context, and
 * `commandPaletteContext` deliberately defaults to a NO-OP so a missing provider
 * is inert rather than a crash. That is a good default — a broken palette should
 * not take the app down — but it means forgetting the provider fails *silently*:
 * the search field renders, the shortcut does nothing, and nothing appears in
 * the console. cf_hrms shipped that way until 2026-09-24. If ⌘K ever stops
 * working, look here first.
 */
const QUICK_CREATE = [
  { label: 'Employee', path: 'employees?new=1', permission: 'cf_hrms_people_manage' },
  { label: 'Work assignment', path: 'assignments?new=1', permission: 'cf_hrms_assignments_manage' },
  { label: 'Role', path: 'roles?new=1', permission: 'cf_hrms_roles_manage' },
  { label: 'Position', path: 'positions?new=1', permission: 'cf_hrms_org_manage' },
];

/**
 * The palette's "Actions" group. Deliberately the same four as QUICK_CREATE and
 * gated on the same tags — two lists that disagree about what you can create is
 * worse than one list in two places.
 */
const PALETTE_ACTIONS: PaletteAction[] = QUICK_CREATE.map((q) => ({
  id: `new-${q.path.split('?')[0]}`,
  label: `New ${q.label.toLowerCase()}`,
  hint: 'Create',
  path: q.path,
  permission: q.permission,
}));

const RECORD_ICON = (type: string) => {
  if (type === 'employee') return <PersonRounded fontSize="small" />;
  if (type === 'position') return <AccountTreeRounded fontSize="small" />;
  return <WorkOutlineRounded fontSize="small" />;
};

// No `shortcutGroups` here on purpose: the kit's ShortcutsHelp already ships the
// palette, `?` and Esc bindings. Add a group only for a shortcut unique to
// cf_hrms — the org chart's collapse keys will earn one.

export function CfHrmsShell({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  /**
   * The nav's permission predicate.
   *
   * Every cf_hrms screen is gated by a feature tag, which `useIsPermitted`
   * answers on its own — so this exists for exactly one case: the four Access
   * screens under Setup, which administer the PLATFORM's accounts and
   * permissions rather than anything in HR. There is no feature tag for that
   * (see api/access.ts), and the platform's existing answer to "may this person
   * administer the tenant" is the admin role name, which is what App.tsx
   * already uses to route an admin after login.
   *
   * Passing it to both the palette and the shell is the point: navMeta stays
   * the single nav source, and the top nav, the section row, the mobile sheet
   * and ⌘K all hide the same four entries from the same person.
   */
  const permitted = useIsPermitted();
  const isPlatformAdmin = useIsPlatformAdmin();
  const can = useCallback<Can>(
    (tag?: string) => (tag === PLATFORM_ADMIN ? isPlatformAdmin : permitted(tag)),
    [permitted, isPlatformAdmin],
  );

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

  /**
   * What "Records" means in an HRMS: a person, and the content a role is written
   * from. People come from the employee list's own search; the second half is
   * the org chart's KRA/Responsibility/KPI/qualification search, which answers
   * the question this app is uniquely able to answer — *who is accountable for
   * this?* — and returns the positions that carry the matching text.
   *
   * Both are allowed to fail. A palette that shows screens is still useful when
   * record search is down, so a rejected half resolves to nothing rather than
   * taking the whole result with it.
   */
  const searchRecords = useCallback(async (q: string): Promise<PaletteRecord[]> => {
    const [people, content] = await Promise.allSettled([
      peopleApi.list({ search: q }),
      orgChartApi.search(q),
    ]);

    const out: PaletteRecord[] = [];

    if (people.status === 'fulfilled') {
      for (const e of people.value.items.slice(0, 6)) {
        out.push({
          id: `emp-${e.id}`,
          type: 'employee',
          label: e.fullName,
          hint: [e.employeeCode, e.employmentStatus !== 'ACTIVE' ? e.employmentStatus.toLowerCase() : null]
            .filter(Boolean).join(' · '),
          path: `employees/${e.id}`,
        });
      }
    }

    if (content.status === 'fulfilled') {
      for (const hit of content.value.slice(0, 6)) {
        const first = hit.matches[0];
        out.push({
          id: `pos-${hit.positionId}`,
          type: 'position',
          label: hit.title,
          // Say WHY it matched — a bare position title under a search for
          // "compliance" looks like a mistake until you see the line that hit.
          hint: first ? `${first.kind.toLowerCase()}: ${first.text.slice(0, 70)}` : hit.positionCode ?? undefined,
          path: `positions/${hit.positionId}`,
        });
      }
    }

    return out;
  }, []);

  return (
    <ThemeScope appSlug="cf_hrms">
      <ToastProvider>
        <CommandPaletteProvider
          appSlug="cf_hrms"
          sections={SECTIONS}
          actions={PALETTE_ACTIONS}
          searchRecords={searchRecords}
          recordIcon={RECORD_ICON}
          placeholder="Search people and responsibilities — or jump to a screen"
          can={can}
        >
          <AppShell
            appSlug="cf_hrms"
            sections={SECTIONS}
            brand={{ label: 'HRMS', initial: 'H' }}
            counts={counts}
            countMeta={COUNT_META}
            quickCreate={QUICK_CREATE}
            can={can}
          >
            {children}
          </AppShell>
        </CommandPaletteProvider>
      </ToastProvider>
    </ThemeScope>
  );
}

export default CfHrmsShell;
