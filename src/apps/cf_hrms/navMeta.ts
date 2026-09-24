/**
 * The single source of cf_hrms navigation. The two-row top nav, the breadcrumb
 * on detail pages, the ⌘K palette's "Go to" group and the mobile sheet all read
 * this one array — a second definition is how a nav and a breadcrumb drift
 * apart. See DESIGN_SYSTEM.md §3 and CF_HRMS_PLAN.md §8.
 *
 * Sections follow the model, not the table list: Organisation is the shape of
 * the company, People is who is in it, Roles is what work exists, Workforce and
 * Leave are the daily run, Documents is what the model produces, Setup is the
 * vocabulary everything else is built from.
 */
import type { NavSection, CountMetaMap } from '@shared/ui';

const ORG = 'cf_hrms_org_view';
const PEOPLE = 'cf_hrms_people_view';
const ROLES = 'cf_hrms_roles_manage';
const ATTENDANCE = 'cf_hrms_attendance_view';
const LEAVE = 'cf_hrms_leave_view';
const DOCS = 'cf_hrms_documents_generate';
const IMPORT = 'cf_hrms_import_manage';

export const SECTIONS: NavSection[] = [
  {
    key: 'home',
    label: 'Home',
    screens: [
      { key: 'home', label: 'Home', path: 'home', keywords: ['cockpit', 'today', 'dashboard'] },
    ],
  },
  {
    key: 'organisation',
    label: 'Organisation',
    screens: [
      { key: 'org-chart', label: 'Org chart', path: 'org-chart', permission: ORG, keywords: ['chart', 'hierarchy', 'tree', 'reporting', 'structure'] },
      { key: 'positions', label: 'Positions', path: 'positions', hasDetail: true, permission: ORG, countKey: 'vacancies', keywords: ['seats', 'sanctioned', 'headcount', 'vacancy'] },
      { key: 'departments', label: 'Departments', path: 'departments', permission: ORG, countKey: 'departments', keywords: ['function', 'division'] },
      { key: 'locations', label: 'Locations', path: 'locations', permission: ORG, countKey: 'locations', keywords: ['plant', 'unit', 'site', 'branch', 'office'] },
      { key: 'work-contexts', label: 'Work contexts', path: 'work-contexts', permission: ORG, countKey: 'workContexts', keywords: ['machine', 'line', 'area', 'project', 'cell'] },
    ],
  },
  {
    key: 'people',
    label: 'People',
    screens: [
      { key: 'employees', label: 'Employees', path: 'employees', hasDetail: true, permission: PEOPLE, countKey: 'employees', keywords: ['staff', 'person', 'workers', 'headcount'] },
      { key: 'assignments', label: 'Work assignments', path: 'assignments', hasDetail: true, permission: PEOPLE, countKey: 'activeAssignments', keywords: ['allocation', 'multiple roles', 'reporting', 'manager'] },
    ],
  },
  {
    key: 'roles',
    label: 'Roles',
    screens: [
      { key: 'roles', label: 'Roles', path: 'roles', hasDetail: true, permission: ROLES, countKey: 'roles', keywords: ['job', 'title', 'jd', 'kind of work'] },
      { key: 'kras', label: 'KRAs', path: 'kras', permission: ROLES, countKey: 'kras', keywords: ['key result area', 'outcome'] },
      { key: 'responsibilities', label: 'Responsibilities', path: 'responsibilities', permission: ROLES, countKey: 'responsibilities', keywords: ['duty', 'accountability', 'activity'] },
      { key: 'kpis', label: 'KPIs', path: 'kpis', permission: ROLES, countKey: 'kpis', keywords: ['indicator', 'measure', 'target'] },
      { key: 'skills', label: 'Skills', path: 'skills', permission: ROLES, keywords: ['competency', 'technical', 'behavioural'] },
      { key: 'qualifications', label: 'Qualifications', path: 'qualifications', permission: ROLES, keywords: ['education', 'certification', 'licence', 'degree'] },
      { key: 'authorities', label: 'Authorities', path: 'authorities', permission: ROLES, keywords: ['approve', 'decide', 'stop', 'escalate', 'limit'] },
    ],
  },
  {
    key: 'workforce',
    label: 'Workforce',
    screens: [
      { key: 'attendance', label: 'Attendance', path: 'attendance', permission: ATTENDANCE, countKey: 'attendanceToFix', keywords: ['present', 'absent', 'regularisation', 'muster'] },
      { key: 'roster', label: 'Roster', path: 'roster', permission: ATTENDANCE, keywords: ['shift allocation', 'duty', 'day night'] },
      { key: 'manpower', label: 'Manpower', path: 'manpower', permission: ATTENDANCE, countKey: 'manpowerGap', keywords: ['requirement', 'shortage', 'gap', 'required count'] },
    ],
  },
  {
    key: 'leave',
    label: 'Leave',
    screens: [
      { key: 'leave-requests', label: 'Requests', path: 'leave-requests', hasDetail: true, permission: LEAVE, countKey: 'pendingLeave', keywords: ['apply', 'approval', 'absence'] },
      { key: 'leave-balances', label: 'Balances', path: 'leave-balances', permission: LEAVE, keywords: ['entitlement', 'accrued', 'used'] },
    ],
  },
  {
    key: 'documents',
    label: 'Documents',
    screens: [
      { key: 'documents', label: 'Generated', path: 'documents', hasDetail: true, permission: DOCS, keywords: ['jd', 'job description', 'responsibility profile', 'snapshot', 'pdf', 'docx'] },
    ],
  },
  {
    key: 'setup',
    label: 'Setup',
    screens: [
      { key: 'shifts', label: 'Shifts', path: 'shifts', permission: ORG, keywords: ['general', 'day', 'night', 'timing', 'grace'] },
      { key: 'holidays', label: 'Holidays', path: 'holidays', permission: ORG, keywords: ['calendar', 'festival', 'off'] },
      { key: 'leave-types', label: 'Leave types', path: 'leave-types', permission: LEAVE, keywords: ['casual', 'sick', 'earned', 'entitlement'] },
      { key: 'reporting-types', label: 'Reporting types', path: 'reporting-types', permission: ORG, keywords: ['primary', 'functional', 'dotted', 'project', 'admin'] },
      { key: 'contractors', label: 'Contractors', path: 'contractors', permission: PEOPLE, keywords: ['contract labour', 'manpower supplier', 'agency'] },
      { key: 'open-points', label: 'Open points', path: 'open-points', permission: ORG, countKey: 'openPoints', keywords: ['doubt', 'question', 'unresolved', 'decision'] },
      { key: 'import', label: 'Import', path: 'import', permission: IMPORT, keywords: ['org chart', 'migration', 'excel', 'html', 'upload'] },
    ],
  },
];

/**
 * How each count reads. A size stays neutral; work that is waiting on someone
 * takes a tone. A vacancy is not an error — it is a fact of a growing plant —
 * so it reads as a number with a word, not a red badge.
 */
export const COUNT_META: CountMetaMap = {
  vacancies: { suffix: 'vacant' },
  openPoints: { tone: 'warning', suffix: 'open' },
  pendingLeave: { tone: 'warning', suffix: 'pending' },
  attendanceToFix: { tone: 'warning', suffix: 'to fix' },
  manpowerGap: { tone: 'danger', suffix: 'short' },
};
