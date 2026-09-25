/**
 * The single source of cf_hrms navigation. The two-row top nav, the breadcrumb
 * on detail pages, the ⌘K palette's "Go to" group and the mobile sheet all read
 * this one array — a second definition is how a nav and a breadcrumb drift
 * apart. See DESIGN_SYSTEM.md §3 and DESIGN_SYSTEM_APPENDIX.md §A5.
 *
 * THE SECTIONS ARE THE THREE WORLDS, NOT THE TABLE LIST (appendix §A1/§A5).
 *
 *   Home │ Organisation │ People │ Work │ Setup
 *            (DEFINE)     (STAFF)  (RUN)
 *
 * The first cut of this file listed tables — Organisation · People · Roles ·
 * Workforce · Leave · Documents · Setup — which is principle #1 inverted: seven
 * sections, six of them one or two screens, and six of the eleven entries under
 * "Roles" were vocabulary lists nobody opens in a normal week. Grouping by
 * mindset instead:
 *
 *   - Roles moved INTO Organisation. A role is part of what the organisation
 *     *is*; it was never a world of its own.
 *   - The six content masters (KRAs, Responsibilities, KPIs, Skills,
 *     Qualifications, Authorities) moved OUT of the top nav and into Setup.
 *     They are the vocabulary roles are written from, edited rarely.
 *   - Workforce + Leave merged into Work: attendance, roster, leave and
 *     manpower are one person's day, not two sections.
 *   - Documents joined People. A JD and a responsibility profile are things
 *     that come out of a person's record, not a fourth world.
 *
 * Every route that existed still exists and still has a nav entry; nothing was
 * dropped, only regrouped. routes.tsx is in the same order for the same reason.
 */
import type { NavSection, CountMetaMap } from '@shared/ui';

const ORG = 'cf_hrms_org_view';
const PEOPLE = 'cf_hrms_people_view';
const ROLES = 'cf_hrms_roles_manage';
const ATTENDANCE = 'cf_hrms_attendance_view';
const LEAVE = 'cf_hrms_leave_view';
const DOCS = 'cf_hrms_documents_generate';
const IMPORT = 'cf_hrms_import_manage';

/**
 * The gate on the Access screens — and the one entry here that is NOT a
 * feature tag.
 *
 * All thirteen cf_hrms tags describe HR work: employees, leave, the org chart.
 * None of them means "administer this tenant's accounts and permissions", and
 * a fourteenth would need a backend seed — where a tag nobody has been granted
 * resolves to false and hides the area from the very person who needs it. The
 * platform's existing answer to that question is the admin role name, which is
 * what App.tsx already uses to route an admin after login.
 *
 * So this is a sentinel: `CfHrmsShell` gives the shell a `can` predicate that
 * answers it from the role, and passes everything else through to the normal
 * feature-tag check. navMeta stays the single nav source, and the top nav, the
 * section row, the mobile sheet and ⌘K all hide the same four entries from the
 * same person. It is declared here, with no imports, so this file stays a plain
 * data module.
 */
export const PLATFORM_ADMIN = 'platform_admin';

export const SECTIONS: NavSection[] = [
  {
    key: 'home',
    label: 'Home',
    screens: [
      { key: 'home', label: 'Home', path: 'home', keywords: ['cockpit', 'today', 'what needs me', 'dashboard'] },
    ],
  },

  // ── DEFINE — what work exists and what the organisation looks like ───────
  {
    key: 'organisation',
    label: 'Organisation',
    screens: [
      { key: 'org-chart', label: 'Org chart', path: 'org-chart', permission: ORG, keywords: ['chart', 'hierarchy', 'tree', 'reporting', 'structure', 'vacancies', 'open points'] },
      { key: 'positions', label: 'Positions', path: 'positions', hasDetail: true, permission: ORG, countKey: 'vacancies', keywords: ['seats', 'sanctioned', 'headcount', 'vacancy'] },
      { key: 'roles', label: 'Roles', path: 'roles', hasDetail: true, permission: ROLES, countKey: 'roles', keywords: ['job', 'title', 'jd', 'kind of work', 'purpose', 'kra'] },
      { key: 'departments', label: 'Departments', path: 'departments', permission: ORG, countKey: 'departments', keywords: ['function', 'division'] },
      { key: 'locations', label: 'Locations', path: 'locations', permission: ORG, countKey: 'locations', keywords: ['plant', 'unit', 'site', 'branch', 'office'] },
      { key: 'work-contexts', label: 'Work contexts', path: 'work-contexts', permission: ORG, countKey: 'workContexts', keywords: ['machine', 'line', 'area', 'project', 'cell'] },
    ],
  },

  // ── STAFF — who is doing that work, right now ────────────────────────────
  {
    key: 'people',
    label: 'People',
    screens: [
      { key: 'employees', label: 'Employees', path: 'employees', hasDetail: true, permission: PEOPLE, countKey: 'employees', keywords: ['staff', 'person', 'workers', 'headcount', 'documents', 'identifiers'] },
      { key: 'assignments', label: 'Work assignments', path: 'assignments', hasDetail: true, permission: PEOPLE, countKey: 'activeAssignments', keywords: ['allocation', 'multiple roles', 'reporting', 'manager'] },
      { key: 'documents', label: 'Documents', path: 'documents', hasDetail: true, permission: DOCS, countKey: 'documents', keywords: ['jd', 'job description', 'responsibility profile', 'snapshot', 'pdf', 'docx', 'generated'] },
    ],
  },

  // ── RUN — the daily operation ────────────────────────────────────────────
  {
    key: 'work',
    label: 'Work',
    screens: [
      { key: 'attendance', label: 'Attendance', path: 'attendance', permission: ATTENDANCE, countKey: 'attendanceToMark', keywords: ['present', 'absent', 'regularisation', 'muster'] },
      { key: 'roster', label: 'Roster', path: 'roster', permission: ATTENDANCE, keywords: ['shift allocation', 'duty', 'day night'] },
      { key: 'leave-requests', label: 'Leave', path: 'leave-requests', hasDetail: true, permission: LEAVE, countKey: 'pendingLeave', keywords: ['apply', 'approval', 'absence', 'requests'] },
      { key: 'leave-balances', label: 'Leave balances', path: 'leave-balances', permission: LEAVE, keywords: ['entitlement', 'accrued', 'used'] },
      { key: 'manpower', label: 'Manpower', path: 'manpower', permission: ATTENDANCE, keywords: ['requirement', 'shortage', 'gap', 'required count'] },
    ],
  },

  // ── SETUP — the vocabulary and the rules everything else is built from ───
  {
    key: 'setup',
    label: 'Setup',
    screens: [
      { key: 'kras', label: 'KRAs', path: 'kras', permission: ROLES, keywords: ['key result area', 'outcome'] },
      { key: 'responsibilities', label: 'Responsibilities', path: 'responsibilities', permission: ROLES, keywords: ['duty', 'accountability', 'activity'] },
      { key: 'kpis', label: 'KPIs', path: 'kpis', permission: ROLES, keywords: ['indicator', 'measure', 'target'] },
      { key: 'skills', label: 'Skills', path: 'skills', permission: ROLES, keywords: ['competency', 'technical', 'behavioural'] },
      { key: 'qualifications', label: 'Qualifications', path: 'qualifications', permission: ROLES, keywords: ['education', 'certification', 'licence', 'degree'] },
      { key: 'authorities', label: 'Authorities', path: 'authorities', permission: ROLES, keywords: ['approve', 'decide', 'stop', 'escalate', 'limit'] },
      { key: 'shifts', label: 'Shifts', path: 'shifts', permission: ORG, keywords: ['general', 'day', 'night', 'timing', 'grace'] },
      { key: 'holidays', label: 'Holidays', path: 'holidays', permission: ORG, keywords: ['calendar', 'festival', 'off'] },
      { key: 'leave-types', label: 'Leave types', path: 'leave-types', permission: LEAVE, keywords: ['casual', 'sick', 'earned', 'entitlement'] },
      { key: 'reporting-types', label: 'Reporting types', path: 'reporting-types', permission: ORG, keywords: ['primary', 'functional', 'dotted', 'project', 'admin'] },
      { key: 'contractors', label: 'Contractors', path: 'contractors', permission: PEOPLE, keywords: ['contract labour', 'manpower supplier', 'agency'] },
      { key: 'open-points', label: 'Open points', path: 'open-points', permission: ORG, countKey: 'openPoints', keywords: ['doubt', 'question', 'unresolved', 'decision'] },
      { key: 'import', label: 'Import', path: 'import', permission: IMPORT, keywords: ['org chart', 'migration', 'excel', 'html', 'upload'] },

      // ── ACCESS — who can sign in, and what their role may do ─────────────
      // Setup, not a world of its own: an HR administrator visits these four a
      // handful of times a year, when somebody joins who needs a login or a
      // role's reach changes. They were the platform's shared admin area until
      // 2026-09-25, on a hardcoded dark sidebar that predates the design system
      // — which is why cf_hrms "looked nothing like cf_erp" to the client.
      //
      // PLATFORM_ADMIN is not a feature tag; see api/access.ts. CfHrmsShell
      // resolves it through the `can` predicate it hands the shell.
      { key: 'access-users', label: 'People with logins', path: 'access-users', permission: PLATFORM_ADMIN, keywords: ['user', 'account', 'login', 'sign in', 'invite', 'password', 'access'] },
      { key: 'access-roles', label: 'Roles and access', path: 'access-roles', permission: PLATFORM_ADMIN, keywords: ['permission', 'capability', 'grant', 'role mapping', 'what can they do', 'access'] },
      { key: 'access-capabilities', label: 'Capabilities and features', path: 'access-capabilities', permission: PLATFORM_ADMIN, keywords: ['feature', 'feature tag', 'capability', 'permission group', 'vocabulary'] },
      { key: 'access-logs', label: 'Error logs', path: 'access-logs', permission: PLATFORM_ADMIN, keywords: ['diagnostic', 'exception', 'failure', 'system log', 'trace'] },
    ],
  },
];

/**
 * How each count reads (DESIGN_SYSTEM.md §3.2). A size stays neutral; work that
 * is waiting on someone takes a tone and a word that makes it a phrase.
 *
 * A vacancy is not an error — it is a fact of a plant that is still hiring — so
 * it reads as a number with a word, not a red badge. The keys are supplied by
 * `GET /overview/nav-counts`, and that endpoint and this map are one contract:
 * rename a key in one and rename it in the other.
 *
 * There is deliberately no `manpowerGap` here. A gap against manpower
 * requirements is the same arithmetic as a vacancy against a seat, and two
 * badges in two sections saying almost the same number is worse than one. It
 * earns a badge when rosters exist and the gap becomes "nobody on that machine
 * tonight" rather than "that seat is empty".
 */
export const COUNT_META: CountMetaMap = {
  vacancies: { suffix: 'vacant' },
  openPoints: { tone: 'warning', suffix: 'open' },
  pendingLeave: { tone: 'warning', suffix: 'pending' },
  attendanceToMark: { tone: 'warning', suffix: 'to mark' },
};
