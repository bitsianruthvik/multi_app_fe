import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import PersonRounded from '@mui/icons-material/PersonRounded';
import WorkOutlineRounded from '@mui/icons-material/WorkOutlineRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import QuestionAnswerRounded from '@mui/icons-material/QuestionAnswerRounded';
import {
  AppShell, ThemeScope, ToastProvider, CommandPaletteProvider,
  type Can, type PaletteAction, type PaletteRecord,
} from '@shared/ui';
import { HiringDialogProvider } from '../HiringDialog';
import { SECTIONS, COUNT_META, SELF_ONLY, APPROVER, PAY_SCREEN, DASHBOARD } from '../../navMeta';
import { TAG, useAccessWatch, useCan } from '../../access/can';
import { MyAccessLine } from '../../access/Guard';
import { fetchNavCounts } from '../../api/client';
import { usePendingApprovals } from '../../api/approvals';
import { peopleApi } from '../../api/people';
import { orgChartApi } from '../../api/orgchart';
import { complianceApi } from '../../api/compliance';
import { NOTIFICATIONS_CHANGED, notificationsApi } from '../../api/dashboard';
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
  { label: 'Employee', path: 'employees?new=1', permission: TAG.employees.edit },
  { label: 'Role', path: 'roles?new=1', permission: TAG.roles.edit },
  { label: 'Position', path: 'positions?new=1', permission: TAG.positions.edit },
];

/**
 * The palette's "Actions" group. Deliberately the same three as QUICK_CREATE and
 * gated on the same tags — two lists that disagree about what you can create is
 * worse than one list in two places.
 */
const PALETTE_ACTIONS: PaletteAction[] = [
  ...QUICK_CREATE.map((q) => ({
    id: `new-${q.path.split('?')[0]}`,
    label: `New ${q.label.toLowerCase()}`,
    hint: 'Create',
    path: q.path,
    permission: q.permission,
  })),
  // "Do it in words" (spec §14): the command bar on the org chart, opened and focused.
  // Gated on positions edit — the right most of its actions need; each step is checked on its own anyway.
  {
    id: 'do-in-words',
    label: 'Do it in words',
    hint: 'Add sections, roles, positions, KRAs — or move people — by describing it',
    path: 'org-chart?words=1',
    permission: TAG.positions.edit,
  },
];

const RECORD_ICON = (type: string) => {
  if (type === 'employee') return <PersonRounded fontSize="small" />;
  if (type === 'position') return <AccountTreeRounded fontSize="small" />;
  if (type === 'ask') return <QuestionAnswerRounded fontSize="small" />;
  return <WorkOutlineRounded fontSize="small" />;
};

// No `shortcutGroups` here on purpose: the kit's ShortcutsHelp already ships the
// palette, `?` and Esc bindings. Add a group only for a shortcut unique to
// cf_hrms — the org chart's collapse keys will earn one.

export function CfHrmsShell({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  /**
   * The nav's permission predicate — the same answer every button on every
   * screen gets (`access/can.ts`). Passing it to both the palette and the shell
   * is the point: the top nav, the section row, the mobile sheet and ⌘K all
   * hide the same entries from the same person.
   *
   * `useAccessWatch` re-reads the person's rights from the server on load and
   * whenever the tab comes back into view, so a change of access role reaches
   * an open tab without signing out.
   */
  useAccessWatch();
  const access = useCan();
  /**
   * Approvals (spec §22.6): asked for any login that could have some — the self
   * view (a manager is an employee) or leave edit (HR, the Owner). The count is
   * the nav badge, and it decides whether the entry shows at all.
   */
  const pendingApprovals = usePendingApprovals(access.named.selfView || access.leave.edit || access.attendance.edit);
  const can = useCallback<Can>(
    (tag?: string) => {
      // The employee's own Org chart entry: self view and no HR screen (navMeta.ts).
      if (tag === SELF_ONLY) return access.selfOnly;
      if (tag === APPROVER) return access.leave.edit || access.attendance.edit || (pendingApprovals ?? 0) > 0;
      // Payroll runs and salaries show people's pay: payroll view AND the named pay view (navMeta.ts).
      if (tag === PAY_SCREEN) return access.payroll.view && access.named.payView;
      // The dashboard (spec §42.1): any area one of its tiles shows.
      if (tag === DASHBOARD) return access.employees.view || access.attendance.view || access.positions.view || access.payroll.view;
      return access.has(tag);
    },
    [access, pendingApprovals],
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
   * The bell: the login's own unread notifications (spec §42.3 — absence digests), plus, for a login with
   * Compliance view, law changes waiting to be acknowledged and deadlines in the next three days (spec §36.4).
   * It opens Notifications, which links on to Compliance. Read on load and every five minutes; advisory — a
   * failure shows no badge.
   */
  const mayCompliance = access.compliance.view;
  const [bellCount, setBellCount] = useState(0);
  useEffect(() => {
    let live = true;
    const read = () => {
      Promise.all([
        notificationsApi.list(true).then((n) => n.unread).catch(() => 0),
        mayCompliance ? complianceApi.bell().then((b) => b.count).catch(() => 0) : Promise.resolve(0),
      ]).then(([mine, law]) => { if (live) setBellCount(mine + law); });
    };
    read();
    const t = window.setInterval(read, 5 * 60 * 1000);
    // Acknowledging, marking a deadline done or reading a notification re-reads it at once.
    window.addEventListener('cf-hrms-compliance-changed', read);
    window.addEventListener(NOTIFICATIONS_CHANGED, read);
    return () => { live = false; window.clearInterval(t); window.removeEventListener('cf-hrms-compliance-changed', read); window.removeEventListener(NOTIFICATIONS_CHANGED, read); };
  }, [mayCompliance]);

  const navCounts = useMemo(
    () => (pendingApprovals ? { ...counts, approvals: pendingApprovals } : counts),
    [counts, pendingApprovals],
  );

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
  const mayAsk = access.has(TAG.positions.view);
  const searchRecords = useCallback(async (q: string): Promise<PaletteRecord[]> => {
    const [people, content] = await Promise.allSettled([
      peopleApi.list({ search: q }),
      orgChartApi.search(q, { mode: 'exact' }),
    ]);

    const out: PaletteRecord[] = [];

    // "Who owns X?" (spec §21): a question typed here is offered first as "Ask: …",
    // which opens Ask on the org chart with it. The instant results below stay exact-word.
    if (mayAsk && /^(who|whose|which|what)\b|\?$|\S+\s+\S+/i.test(q)) {
      out.push({
        id: 'ask',
        type: 'ask',
        label: `Ask: ${q}`,
        hint: 'Who owns it — people first, by meaning',
        path: `org-chart?ask=${encodeURIComponent(q)}`,
      });
    }

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
      for (const hit of content.value.items.slice(0, 6)) {
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
  }, [mayAsk]);

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
            counts={navCounts}
            countMeta={COUNT_META}
            quickCreate={QUICK_CREATE}
            can={can}
            accountItems={<MyAccessLine />}
            notificationsPath="notifications"
            notificationCount={bellCount}
          >
            <HiringDialogProvider>{children}</HiringDialogProvider>
          </AppShell>
        </CommandPaletteProvider>
      </ToastProvider>
    </ThemeScope>
  );
}

export default CfHrmsShell;
