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
 *   Home │ Organisation │ People │ Performance │ Time and leave │ Payroll │ Setup
 *
 * The clean-up removed every screen that was a second way to do something
 * (Work assignments, Work contexts, Manpower, Open points, Import, Leave types,
 * Contractors) and folded ten small screens into two with tabs (Libraries,
 * Logins and access). Two screens that are not built yet — Attendance and
 * Roster — keep their routes but have NO entry here, so neither the menu nor
 * the command palette offers them. routes.tsx redirects every old address.
 * Leave requests and Leave balances were built on 2026-10-16 (spec §22).
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
 *   performance  Plans, Actuals, Reviews, Actions
 *   time       Shifts, Holidays   leave      Leave requests, Leave balances, Leave policies
 *   payroll    Runs, Salaries (also the named pay view), Structures, Components, Statutory settings
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
const ATTENDANCE = TAG.attendance.view;
const PAYROLL = TAG.payroll.view;
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

/**
 * A sentinel, not a tag: "this login has approvals waiting, or holds leave
 * edit" (spec §22.6). It gates the Approvals entry; CfHrmsShell answers it from
 * the pending count (`api/approvals.ts`) and the leave edit right.
 */
export const APPROVER = 'cf_hrms_approver';

/**
 * A sentinel, not a tag: "this login holds payroll view AND the named pay view"
 * (spec §25.2). A nav entry carries one tag, and Runs and Salaries show
 * people's pay, which the server opens only with both. CfHrmsShell answers it.
 * The route itself is guarded on payroll view; the page says what is missing.
 */
export const PAY_SCREEN = 'cf_hrms_payroll_pay_screen';

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
      // The person's own leave: balances, asking for leave, their requests (spec §22.6).
      { key: 'my-leave', label: 'My leave', path: 'my-leave', permission: SELF, keywords: ['leave', 'apply for leave', 'ask for leave', 'holiday', 'day off', 'time off', 'balance', 'casual', 'sick', 'half day'] },
      // My month: days, punches, late marks, penalties; punch IN/OUT; ask to correct a day (spec §28.7).
      { key: 'my-attendance', label: 'My attendance', path: 'my-attendance', permission: SELF, keywords: ['attendance', 'punch', 'in time', 'out time', 'late', 'late mark', 'missing punch', 'correct', 'regularize', 'short permission', 'on duty', 'penalty'] },
      // My own salary breakdown and my released payslips (spec §25.2).
      { key: 'my-pay', label: 'My pay', path: 'my-pay', permission: SELF, keywords: ['salary', 'payslip', 'pay slip', 'ctc', 'my salary', 'net pay', 'take home', 'pf', 'tds', 'download payslip', 'claim', 'reimbursement', 'bill', 'lta', 'full and final', 'settlement'] },
      // My tax › File my return (spec §25.6): the person's own income-tax return, worked out; nothing is filed from the app.
      // My tax (spec §25.4): regime, declarations, proofs, the tax sheet, Forms 16 / 130.
      { key: 'my-tax', label: 'My tax', path: 'my-tax', permission: SELF, keywords: ['tax', 'income tax', 'tds', 'regime', 'old regime', 'new regime', 'declaration', '12bb', 'form 124', 'proof', 'investment proof', 'hra', 'rent', '80c', 'form 16', 'form 130', 'tax sheet'] },
      { key: 'my-tax-return', label: 'File my return', path: 'my-tax/return', permission: SELF, keywords: ['itr', 'income tax return', 'file my return', 'tax return', 'refund', 'form 16', 'form 130', 'itr-1', 'itr-2', 'sahaj', 'my tax', 'regime'] },
      // What waits for this login to decide — today leave. Shown with a pending count.
      { key: 'approvals', label: 'Approvals', path: 'approvals', permission: APPROVER, countKey: 'approvals', keywords: ['approve', 'reject', 'leave requests', 'waiting', 'pending', 'my team leave', 'decide', 'attendance correction', 'regularization', 'short permission', 'on duty', 'claim', 'bill', 'reimbursement'] },
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
      // Payroll P3b: people leaving or left, and their full and final settlement (exits/:employeeId).
      { key: 'exits', label: 'Exits', path: 'exits', hasDetail: true, permission: PAY_SCREEN, keywords: ['full and final', 'f&f', 'fnf', 'settlement', 'gratuity', 'notice pay', 'leave encashment', 'relieving', 'leaving', 'resigned', 'last working day', 'exit'] },
    ],
  },

  // ── What each person is measured on, period by period (spec §18) ─────────
  // A plan copies the KRAs and KPIs of the person's job as it stood on the
  // period's start; the job itself stays on Roles and Positions.
  {
    key: 'performance',
    label: 'Performance',
    screens: [
      { key: 'plans', label: 'Plans', path: 'plans', hasDetail: true, permission: PERFORMANCE, keywords: ['plan', 'period', 'kpi', 'kra', 'target', 'weight', 'quarter', 'month', 'performance', 'measure', 'activate', 'score'] },
      // What each person achieved, slot by slot (spec §19.3).
      { key: 'actuals', label: 'Actuals', path: 'actuals', permission: PERFORMANCE, keywords: ['actual', 'achievement', 'enter', 'result', 'on track', 'at risk', 'behind', 'kpi', 'month', 'slot', 'missing'] },
      // Check-ins and final reviews; what was agreed in them (spec §20.3).
      { key: 'reviews', label: 'Reviews', path: 'reviews', hasDetail: true, permission: PERFORMANCE, keywords: ['review', 'check-in', 'final review', 'rating', 'due', 'overdue', 'comment', 'blockers', 'close'] },
      { key: 'actions', label: 'Actions', path: 'actions', permission: PERFORMANCE, keywords: ['action', 'follow-up', 'owner', 'due', 'overdue', 'done', 'drop', 'agreed'] },
    ],
  },

  // ── When people work, and the leave they get ─────────────────────────────
  // Attendance was built 2026-10-19 (spec §28). Roster is not built yet: its route exists (routes.tsx)
  // but it has no entry here on purpose.
  {
    key: 'time',
    label: 'Time and leave',
    screens: [
      { key: 'shifts', label: 'Shifts', path: 'shifts', permission: TIME, keywords: ['general', 'day', 'night', 'timing', 'weekly off', 'working days'] },
      { key: 'holidays', label: 'Holidays', path: 'holidays', permission: TIME, keywords: ['calendar', 'festival', 'off'] },
      // Today, the muster, requests, penalties, policies, devices, imports, closing a month (spec §28.7).
      { key: 'attendance', label: 'Attendance', path: 'attendance', permission: ATTENDANCE, keywords: ['attendance', 'muster', 'muster roll', 'present', 'absent', 'late', 'punch', 'biometric', 'device', 'zkteco', 'essl', 'penalty', 'lop', 'overtime', 'close month', 'regularization'] },
      // Leave types are managed inside a policy, so "casual", "sick" and the rest find this.
      // Every request in scope, the same sheet as Approvals, and "Ask on behalf" (spec §22.6).
      { key: 'leave-requests', label: 'Leave requests', path: 'leave-requests', hasDetail: true, permission: LEAVE, keywords: ['leave', 'apply', 'approve', 'reject', 'cancel', 'on behalf', 'who is off', 'absent'] },
      // Person × leave type for one year; opening balances by hand or by Excel.
      { key: 'leave-balances', label: 'Leave balances', path: 'leave-balances', permission: LEAVE, keywords: ['balance', 'opening balance', 'carry forward', 'available', 'taken', 'excel', 'leave year'] },
      { key: 'leave-policies', label: 'Leave policies', path: 'leave-policies', hasDetail: true, permission: LEAVE, keywords: ['casual leave', 'sick leave', 'earned leave', 'leave types', 'entitlement', 'carry forward', 'encash', 'maternity', 'days a year', 'policy'] },
    ],
  },

  // ── Paying people (spec §25.2) ────────────────────────────────────────────
  // A month's run, each person's salary, and what a salary is built from.
  {
    key: 'payroll',
    label: 'Payroll',
    screens: [
      { key: 'payroll-runs', label: 'Runs', path: 'payroll-runs', hasDetail: true, permission: PAY_SCREEN, keywords: ['payroll', 'run', 'month', 'calculate', 'lock', 'release', 'payslip', 'bank file', 'neft', 'paid', 'lop', 'one-time', 'bonus', 'tds'] },
      { key: 'salaries', label: 'Salaries', path: 'salaries', hasDetail: true, permission: PAY_SCREEN, keywords: ['salary', 'ctc', 'revision', 'increment', 'raise', 'arrears', 'pay', 'excel'] },
      { key: 'pay-structures', label: 'Structures', path: 'pay-structures', hasDetail: true, permission: PAYROLL, keywords: ['salary structure', 'formula', 'basic', 'hra', 'special allowance', 'balance', 'ctc split', 'grade'] },
      { key: 'pay-components', label: 'Components', path: 'pay-components', permission: PAYROLL, keywords: ['earning', 'deduction', 'allowance', 'reimbursement', 'employer contribution', 'basic', 'hra', 'pf wage', 'esi wage', 'taxable'] },
      { key: 'statutory-settings', label: 'Statutory settings', path: 'statutory-settings', permission: PAYROLL, keywords: ['pf', 'esi', 'professional tax', 'pt', 'lwf', 'labour welfare fund', 'ceiling', 'rates', 'slabs', 'bank', 'debit account', 'ifsc'] },
      // Payroll extras P3a (spec §25.5): the month's PF ECR, ESI contribution sheet and PT return figures, from the locked run.
      { key: 'statutory-returns', label: 'Statutory returns', path: 'statutory-returns', permission: PAYROLL, keywords: ['ecr', 'pf return', 'epfo', 'uan', 'ncp days', 'esi return', 'esic', 'ip number', 'monthly contribution', 'professional tax return', 'form v', 'pt return'] },
      // Payroll P3b: claims against bills (reimbursements, flexible benefits, LTA), and the claim types with the payroll policy.
      { key: 'payroll-claims', label: 'Claims', path: 'payroll-claims', permission: PAY_SCREEN, keywords: ['claim', 'reimbursement', 'bill', 'expense', 'fuel', 'conveyance', 'phone', 'internet', 'lta', 'leave travel', 'meals', 'books', 'flexible benefit', 'approve claim'] },
      { key: 'payroll-claim-types', label: 'Claim types and policy', path: 'payroll-claim-types', permission: PAYROLL, keywords: ['claim types', 'yearly limit', 'payroll policy', 'overtime rate', 'overtime formula', 'encashment rate', 'notice pay rate', 'flexible year end', 'lapse', 'manager first', 'policy'] },
    ],
  },

  // ── Income tax in payroll (spec §25.4) ─────────────────────────────────────
  // Regimes and PANs, what people declared and proved, the deposits, the quarterly return, Forms 16 / 130.
  {
    key: 'tax',
    label: 'Tax',
    screens: [
      { key: 'tax-profiles', label: 'Profiles', path: 'tax-profiles', permission: PAYROLL, keywords: ['tax', 'regime', 'old regime', 'new regime', 'pan', 'no pan', 'age', 'metro', 'hra city', 'cut-off'] },
      { key: 'tax-declarations', label: 'Declarations', path: 'tax-declarations', hasDetail: true, permission: PAY_SCREEN, keywords: ['declaration', '12bb', 'form 124', 'rent', 'hra', '80c', 'ppf', 'lic', 'previous employer', 'form 12b', 'form 122'] },
      { key: 'tax-proofs', label: 'Proofs', path: 'tax-proofs', permission: PAY_SCREEN, keywords: ['proof', 'investment proof', 'verify', 'reject', 'receipts', 'rent receipt', 'bulk accept'] },
      { key: 'tax-challans', label: 'Challans', path: 'tax-challans', permission: PAYROLL, keywords: ['challan', 'tds deposit', 'bsr', 'itns 281', 'due date', '7th', 'interest'] },
      { key: 'tax-quarterly', label: 'Quarterly returns', path: 'tax-quarterly', permission: PAY_SCREEN, keywords: ['24q', 'form 138', 'quarterly return', 'tds return', 'rpu', 'fvu', 'annexure', 'protean'] },
      { key: 'tax-forms', label: 'Forms 16 / 130', path: 'tax-forms', permission: PAY_SCREEN, keywords: ['form 16', 'form 130', 'part a', 'part b', 'traces', '12ba', 'form 123', 'release'] },
      { key: 'tax-perquisites', label: 'Perquisites', path: 'tax-perquisites', permission: PAY_SCREEN, keywords: ['perquisite', 'company car', 'car perquisite', 'accommodation', 'rent free', 'interest free loan', 'concessional loan', 'sbi rate', 'gift', 'voucher', 'credit card', 'club', '12ba', 'form 123'] },
      { key: 'tax-form10e', label: 'Form 10E', path: 'tax-form10e', permission: PAY_SCREEN, keywords: ['form 10e', 'form 39', 'relief', 'section 89', 'section 157', 'arrears', 'arrears relief', 'back-dated'] },
      { key: 'tax-settings', label: 'Tax settings', path: 'tax-settings', permission: PAYROLL, keywords: ['tax settings', 'windows', 'declaration window', 'proof window', 'cut-off', 'ca reviewed', 'tan', 'deductor'] },
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
  // Not from /overview/nav-counts: CfHrmsShell adds it from GET /user/me/approvals.
  approvals: { tone: 'warning', suffix: 'waiting' },
};
