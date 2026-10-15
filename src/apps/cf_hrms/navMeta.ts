/**
 * The single source of cf_hrms navigation. The two-row top nav, the breadcrumb
 * on detail pages, the ⌘K palette's "Go to" group and the mobile sheet all read
 * this one array — a second definition is how a nav and a breadcrumb drift
 * apart. See DESIGN_SYSTEM.md §3 and DESIGN_SYSTEM_APPENDIX.md §A5.
 *
 * FOUR GROUPS, ONE HOME FOR EACH THING (CF_HRMS_HIRING_SPEC.md §10, 2026-10-12),
 * and since 2026-10-15 a fifth, Performance (§18.3), between People and Time
 * and leave:
 *
 *   Home │ Organisation │ People │ Performance │ Time and leave │ Setup
 *
 * The clean-up removed every screen that was a second way to do something
 * (Work assignments, Work contexts, Manpower, Open points, Import, Leave types,
 * Contractors) and folded ten small screens into two with tabs (Libraries,
 * Logins and access). Four screens that are not built yet — Attendance, Roster,
 * Leave requests, Leave balances — keep their routes but have NO entry here, so
 * neither the menu nor the command palette offers them. routes.tsx redirects
 * every old address.
 */
import type { NavSection, CountMetaMap } from '@shared/ui';

import { TAG, SCREEN_TAGS } from './access/can';

/**
 * Every entry is gated by the `view` right of its area (CF_HRMS_HIRING_SPEC.md
 * §12.1). The tags live in `access/can.ts`; this file only says which screen
 * belongs to which area:
 *
 *   org        Departments, Locations
 *   roles      Roles, Libraries
 *   positions  Org chart, Positions
 *   employees  Employees          hiring     Hiring          documents  Documents
 *   performance  Plans
 *   time       Shifts, Holidays   leave      Leave policies
 *   setup      Code formats, Letters, Reporting types, Performance settings
 *
 * The plans path is ONE segment (`plans`, `plans/:id`): the shell matches a
 * screen on the first segment after the app slug, so a two-segment path would
 * lose its menu highlight and breadcrumb. A manager's view of a team member's
 * plan lives under My place (`my-place/team-plans/:id`) for the same reason.
 *
 * A screen without its `view` is in neither the menu nor the command palette,
 * and `routes.tsx` answers its address with "You do not have access to this
 * screen".
 */
const ORG = TAG.org.view;
const ROLES = TAG.roles.view;
const POSITIONS = TAG.positions.view;
const PEOPLE = TAG.employees.view;
const HIRING = TAG.hiring.view;
const DOCS = TAG.documents.view;
const PERFORMANCE = TAG.performance.view;
const TIME = TAG.time.view;
const LEAVE = TAG.leave.view;
const SETUP = TAG.setup.view;
/** Logins and access roles. The Owner (platform role `admin`) holds it by name. */
const ACCESS = TAG.named.accessManage;
/**
 * The self view: the one tag that grants a person something about THEMSELVES.
 * For a shop-floor employee it is the only tag they hold, so "My place" and
 * their own Org chart are the only entries they see.
 */
const SELF = TAG.named.selfView;

/**
 * A sentinel, not a tag: "this person holds the self view and NO HR screen" — a
 * shop-floor employee. It gates the employee's own Org chart entry, so an HR
 * user (who also holds the self view) never sees a second "Org chart" beside
 * the company one. CfHrmsShell answers it from `useCan().selfOnly`.
 */
export const SELF_ONLY = 'cf_hrms_self_only';

/** Every tag that opens an HR screen. Holding any of them = not self-only. */
export const HR_SCREEN_TAGS = SCREEN_TAGS;

/** True for a login that holds the self view and no HR screen at all. */
export function isSelfOnly(permitted: (tag?: string) => boolean): boolean {
  return permitted(SELF) && !HR_SCREEN_TAGS.some((tag) => permitted(tag));
}

export const SECTIONS: NavSection[] = [
  {
    key: 'home',
    label: 'Home',
    screens: [
      { key: 'home', label: 'Home', path: 'home', keywords: ['today', 'what needs me', 'dashboard'] },
      /**
       * The employee's Org chart — their own slice (managers above, their team
       * below), served by GET /user/me/orgchart. SELF_ONLY, so only a login with
       * no HR screen sees it; everyone else has the company chart under
       * Organisation. It is the employee's landing screen (`routes.tsx`).
       */
      { key: 'my-org-chart', label: 'Org chart', path: 'my-org-chart', permission: SELF_ONLY, keywords: ['chart', 'my manager', 'my team', 'hierarchy', 'who do i report to', 'reporting'] },
      /**
       * "My place" sits in Home rather than in a group of its own: for an
       * employee it is one of two reachable screens, and a group holding a
       * single entry would be a menu with one item in it.
       */
      { key: 'my-place', label: 'My place', path: 'my-place', permission: SELF, keywords: ['me', 'my job', 'my manager', 'who do i report to', 'my team', 'my responsibilities', 'self', 'profile'] },
    ],
  },

  // ── What the organisation looks like ─────────────────────────────────────
  {
    key: 'organisation',
    label: 'Organisation',
    screens: [
      { key: 'org-chart', label: 'Org chart', path: 'org-chart', permission: POSITIONS, keywords: ['chart', 'hierarchy', 'tree', 'reporting', 'structure', 'vacancies'] },
      { key: 'departments', label: 'Departments', path: 'departments', permission: ORG, countKey: 'departments', keywords: ['function', 'division', 'section', 'machine', 'line', 'area', 'labels'] },
      { key: 'roles', label: 'Roles', path: 'roles', hasDetail: true, permission: ROLES, countKey: 'roles', keywords: ['job', 'title', 'jd', 'kind of work', 'purpose', 'kra'] },
      { key: 'positions', label: 'Positions', path: 'positions', hasDetail: true, permission: POSITIONS, countKey: 'vacancies', keywords: ['headcount', 'vacancy', 'vacant', 'strength'] },
      { key: 'locations', label: 'Locations', path: 'locations', permission: ORG, countKey: 'locations', keywords: ['plant', 'unit', 'site', 'branch', 'office'] },
    ],
  },

  // ── Who is doing that work ───────────────────────────────────────────────
  {
    key: 'people',
    label: 'People',
    screens: [
      // "Positions held", moving a person and a second position all live on the
      // employee's own page now — hence the keywords.
      { key: 'employees', label: 'Employees', path: 'employees', hasDetail: true, permission: PEOPLE, countKey: 'employees', keywords: ['staff', 'person', 'workers', 'headcount', 'identifiers', 'positions held', 'move', 'transfer', 'contractor'] },
      // A hiring STARTS on a vacant position (Organisation); this is where the
      // ones in progress are found again. The candidate is not an employee yet,
      // which is why it is its own entry and not a filter on Employees.
      { key: 'hiring', label: 'Hiring', path: 'hiring', hasDetail: true, permission: HIRING, keywords: ['recruit', 'candidate', 'offer letter', 'appointment letter', 'new joiner', 'vacancy', 'job description', 'onboarding'] },
      { key: 'documents', label: 'Documents', path: 'documents', hasDetail: true, permission: DOCS, countKey: 'documents', keywords: ['jd', 'job description', 'responsibility profile', 'snapshot', 'pdf', 'docx', 'generated'] },
    ],
  },

  // ── What each person is measured on, period by period (spec §18) ─────────
  // A plan copies the KRAs and KPIs of the person's job as it stood on the
  // period's start; the job itself stays on Roles and Positions.
  {
    key: 'performance',
    label: 'Performance',
    screens: [
      { key: 'plans', label: 'Plans', path: 'plans', hasDetail: true, permission: PERFORMANCE, keywords: ['plan', 'period', 'kpi', 'kra', 'target', 'weight', 'quarter', 'month', 'performance', 'measure', 'activate'] },
    ],
  },

  // ── When people work, and the leave they get ─────────────────────────────
  // Attendance, Roster, Leave requests and Leave balances are not built yet.
  // Their routes exist (routes.tsx) but they have no entry here on purpose.
  {
    key: 'time',
    label: 'Time and leave',
    screens: [
      { key: 'shifts', label: 'Shifts', path: 'shifts', permission: TIME, keywords: ['general', 'day', 'night', 'timing', 'weekly off', 'working days'] },
      { key: 'holidays', label: 'Holidays', path: 'holidays', permission: TIME, keywords: ['calendar', 'festival', 'off'] },
      // Leave types are managed inside a policy, so "casual", "sick" and the rest find this.
      { key: 'leave-policies', label: 'Leave policies', path: 'leave-policies', hasDetail: true, permission: LEAVE, keywords: ['casual leave', 'sick leave', 'earned leave', 'leave types', 'entitlement', 'carry forward', 'encash', 'maternity', 'days a year', 'policy'] },
    ],
  },

  // ── The rules and word lists everything else is built from ───────────────
  {
    key: 'setup',
    label: 'Setup',
    screens: [
      // How every code is built — departments, roles, positions, locations,
      // employees and letter reference numbers. Nobody types a code.
      { key: 'code-formats', label: 'Code formats', path: 'code-formats', permission: SETUP, keywords: ['employee code', 'position code', 'department code', 'role code', 'numbering', 'prefix', 'running number', 'reference number', 'sequence', 'coding rules'] },
      { key: 'letters', label: 'Letters', path: 'letters', permission: SETUP, keywords: ['offer letter', 'appointment letter', 'template', 'docx', 'placeholder', 'signatory', 'probation', 'notice period', 'letterhead'] },
      // Six word lists a role is written from, one screen with a tab each.
      { key: 'libraries', label: 'Libraries', path: 'libraries', permission: ROLES, keywords: ['kra', 'key result area', 'responsibilities', 'duty', 'kpi', 'indicator', 'measure', 'skills', 'competency', 'qualifications', 'education', 'certification', 'authorities', 'approve', 'limit'] },
      // The performance year, the default plan frequency, the rating scale and each role's frequency.
      { key: 'performance-settings', label: 'Performance settings', path: 'performance-settings', permission: SETUP, keywords: ['performance year', 'year start', 'april', 'frequency', 'monthly', 'quarterly', 'half-yearly', 'yearly', 'rating scale', 'plan', 'period'] },
      { key: 'reporting-types', label: 'Reporting types', path: 'reporting-types', permission: SETUP, keywords: ['primary', 'functional', 'dotted', 'project', 'admin'] },
      // Who can sign in and what their role may do — one screen with tabs.
      { key: 'access', label: 'Logins and access', path: 'access', permission: ACCESS, keywords: ['user', 'account', 'login', 'sign in', 'invite', 'password', 'permission', 'capability', 'feature', 'grant', 'what can they do', 'error log', 'diagnostic'] },
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
 * rename a key in one and rename it in the other. Only keys whose screen is in
 * the menu belong here.
 */
export const COUNT_META: CountMetaMap = {
  vacancies: { suffix: 'vacant' },
};
