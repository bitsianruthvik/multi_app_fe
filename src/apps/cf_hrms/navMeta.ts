/**
 * The single source of cf_hrms navigation. The two-row top nav, the breadcrumb
 * on detail pages, the ⌘K palette's "Go to" group and the mobile sheet all read
 * this one array — a second definition is how a nav and a breadcrumb drift
 * apart. See DESIGN_SYSTEM.md §3 and DESIGN_SYSTEM_APPENDIX.md §A5.
 *
 * FOUR GROUPS, ONE HOME FOR EACH THING (CF_HRMS_HIRING_SPEC.md §10, 2026-10-12).
 *
 *   Home │ Organisation │ People │ Time and leave │ Setup
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

const ORG = 'cf_hrms_org_view';
/** Settings only the people who can change them have a use for (the letter templates). */
const ORG_MANAGE = 'cf_hrms_org_manage';
const PEOPLE = 'cf_hrms_people_view';
/**
 * The self view (appendix §A3, last row: "Employee · self only"). It is the one
 * tag that grants a person something about THEMSELVES, and for a shop-floor
 * employee it is the only tag they hold — so "My place" is the only entry they
 * see anywhere in this file, and every section below disappears for them
 * (`TopNav` shows a section only when the user can reach at least one screen in
 * it). `routes.tsx` sends such a login straight here instead of to Home.
 */
const SELF = 'cf_hrms_self_view';
const ROLES = 'cf_hrms_roles_manage';
const LEAVE = 'cf_hrms_leave_view';
const DOCS = 'cf_hrms_documents_generate';

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

/**
 * The second sentinel (2026-10-09): "this person holds the self view and NO HR
 * screen" — a shop-floor employee. It gates the employee's own Org chart
 * entry, so an admin or HR user (who also holds cf_hrms_self_view) never sees a
 * second "Org chart" beside the company one. CfHrmsShell answers it with
 * `isSelfOnly`, and routes.tsx uses the same function to pick the landing page.
 */
export const SELF_ONLY = 'cf_hrms_self_only';

/** Every tag that gates an HR screen in this file. Holding any of them = not self-only. */
export const HR_SCREEN_TAGS = [
  'cf_hrms_org_view',
  'cf_hrms_people_view',
  'cf_hrms_roles_manage',
  'cf_hrms_attendance_view',
  'cf_hrms_leave_view',
  'cf_hrms_documents_generate',
  'cf_hrms_import_manage',
];

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
      { key: 'org-chart', label: 'Org chart', path: 'org-chart', permission: ORG, keywords: ['chart', 'hierarchy', 'tree', 'reporting', 'structure', 'vacancies'] },
      { key: 'departments', label: 'Departments', path: 'departments', permission: ORG, countKey: 'departments', keywords: ['function', 'division', 'section', 'machine', 'line', 'area', 'labels'] },
      { key: 'roles', label: 'Roles', path: 'roles', hasDetail: true, permission: ROLES, countKey: 'roles', keywords: ['job', 'title', 'jd', 'kind of work', 'purpose', 'kra'] },
      { key: 'positions', label: 'Positions', path: 'positions', hasDetail: true, permission: ORG, countKey: 'vacancies', keywords: ['headcount', 'vacancy', 'vacant', 'strength'] },
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
      { key: 'hiring', label: 'Hiring', path: 'hiring', hasDetail: true, permission: PEOPLE, keywords: ['recruit', 'candidate', 'offer letter', 'appointment letter', 'new joiner', 'vacancy', 'job description', 'onboarding'] },
      { key: 'documents', label: 'Documents', path: 'documents', hasDetail: true, permission: DOCS, countKey: 'documents', keywords: ['jd', 'job description', 'responsibility profile', 'snapshot', 'pdf', 'docx', 'generated'] },
    ],
  },

  // ── When people work, and the leave they get ─────────────────────────────
  // Attendance, Roster, Leave requests and Leave balances are not built yet.
  // Their routes exist (routes.tsx) but they have no entry here on purpose.
  {
    key: 'time',
    label: 'Time and leave',
    screens: [
      { key: 'shifts', label: 'Shifts', path: 'shifts', permission: ORG, keywords: ['general', 'day', 'night', 'timing', 'weekly off', 'working days'] },
      { key: 'holidays', label: 'Holidays', path: 'holidays', permission: ORG, keywords: ['calendar', 'festival', 'off'] },
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
      { key: 'code-formats', label: 'Code formats', path: 'code-formats', permission: ORG, keywords: ['employee code', 'position code', 'department code', 'role code', 'numbering', 'prefix', 'running number', 'reference number', 'sequence', 'coding rules'] },
      { key: 'letters', label: 'Letters', path: 'letters', permission: ORG_MANAGE, keywords: ['offer letter', 'appointment letter', 'template', 'docx', 'placeholder', 'signatory', 'probation', 'notice period', 'letterhead'] },
      // Six word lists a role is written from, one screen with a tab each.
      { key: 'libraries', label: 'Libraries', path: 'libraries', permission: ROLES, keywords: ['kra', 'key result area', 'responsibilities', 'duty', 'kpi', 'indicator', 'measure', 'skills', 'competency', 'qualifications', 'education', 'certification', 'authorities', 'approve', 'limit'] },
      { key: 'reporting-types', label: 'Reporting types', path: 'reporting-types', permission: ORG, keywords: ['primary', 'functional', 'dotted', 'project', 'admin'] },
      // Who can sign in and what their role may do — one screen with tabs.
      // PLATFORM_ADMIN is not a feature tag; CfHrmsShell answers it from the role.
      { key: 'access', label: 'Logins and access', path: 'access', permission: PLATFORM_ADMIN, keywords: ['user', 'account', 'login', 'sign in', 'invite', 'password', 'permission', 'capability', 'feature', 'grant', 'what can they do', 'error log', 'diagnostic'] },
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
