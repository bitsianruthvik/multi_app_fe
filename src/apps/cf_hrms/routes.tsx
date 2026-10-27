import React, { lazy } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { RequireAppAccess } from '@core/components/RequireAppAccess';
import { CfHrmsShell } from './components/shell/CfHrmsShell';
import { TAG, useCan } from './access/can';
import { AnyOf, Guard } from './access/Guard';

const Home = lazy(() => import('./pages/Home'));
// Karni's requirements round (spec §42): the management dashboard, the manpower report, the bell's page.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Manpower = lazy(() => import('./pages/Manpower'));
const Notifications = lazy(() => import('./pages/Notifications'));

// The employee self view. Not lazy-grouped with anything else: for a
// shop-floor login these are the only chunks they load.
const MyPlace = lazy(() => import('./pages/MyPlace'));
// The employee's own slice of the org chart — their landing screen. A separate
// page from OrgChart: it imports api/self only, never the company-wide chart.
const MyOrgChart = lazy(() => import('./pages/MyOrgChart'));
// The person's own leave, and what waits for them to approve (spec §22.6).
const MyLeave = lazy(() => import('./pages/MyLeave'));
// My attendance, and a manager's team calendar (spec §28.7).
const MyAttendance = lazy(() => import('./pages/MyAttendance'));
const TeamAttendance = lazy(() => import('./pages/TeamAttendance'));
const Approvals = lazy(() => import('./pages/Approvals'));
// My own salary and payslips (spec §25.2). Imports myPayApi only.
const MyPay = lazy(() => import('./pages/MyPay'));
// My tax › File my return (spec §25.6): the person's own income-tax return; P2 builds the rest of My tax around it.
const MyTaxReturn = lazy(() => import('./pages/MyTaxReturn'));
// My tax (spec §25.4): regime, declarations, proofs, the tax sheet, forms. Imports myTaxApi only.
const MyTax = lazy(() => import('./pages/MyTax'));

// Organisation
const OrgChart = lazy(() => import('./pages/OrgChart'));
const Departments = lazy(() => import('./pages/Departments'));
const Roles = lazy(() => import('./pages/Roles'));
const RoleDetail = lazy(() => import('./pages/RoleDetail'));
const Positions = lazy(() => import('./pages/Positions'));
const PositionDetail = lazy(() => import('./pages/PositionDetail'));
const Locations = lazy(() => import('./pages/Locations'));

// People
const Employees = lazy(() => import('./pages/Employees'));
const EmployeeDetail = lazy(() => import('./pages/EmployeeDetail'));
const Hiring = lazy(() => import('./pages/Hiring'));
const HiringDetail = lazy(() => import('./pages/HiringDetail'));
const Documents = lazy(() => import('./pages/Documents'));
const DocumentDetail = lazy(() => import('./pages/DocumentDetail'));

// Performance
const PerformancePlans = lazy(() => import('./pages/PerformancePlans'));
const PerformancePlan = lazy(() => import('./pages/PerformancePlan'));
const PerformanceActuals = lazy(() => import('./pages/PerformanceActuals'));
const PerformanceReviews = lazy(() => import('./pages/PerformanceReviews'));
const PerformanceReview = lazy(() => import('./pages/PerformanceReview'));
const PerformanceActions = lazy(() => import('./pages/PerformanceActions'));

// Time and leave
const Shifts = lazy(() => import('./pages/Shifts'));
const Holidays = lazy(() => import('./pages/Holidays'));
const LeavePolicies = lazy(() => import('./pages/LeavePolicies'));
const LeavePolicyDetail = lazy(() => import('./pages/LeavePolicyDetail'));
const LeaveRequests = lazy(() => import('./pages/LeaveRequests'));
const LeaveRequestDetail = lazy(() => import('./pages/LeaveRequestDetail'));
const LeaveBalances = lazy(() => import('./pages/LeaveBalances'));

// Payroll (spec §25.2)
const PayrollRuns = lazy(() => import('./pages/PayrollRuns'));
const PayrollRunDetail = lazy(() => import('./pages/PayrollRunDetail'));
const Salaries = lazy(() => import('./pages/Salaries'));
const SalaryDetail = lazy(() => import('./pages/SalaryDetail'));
const PayStructures = lazy(() => import('./pages/PayStructures'));
const PayStructureDetail = lazy(() => import('./pages/PayStructureDetail'));
const PayComponents = lazy(() => import('./pages/PayComponents'));
const StatutorySettings = lazy(() => import('./pages/StatutorySettings'));
// The law layer (spec §36.1): rules in force, read-only.
const RulesInForce = lazy(() => import('./pages/RulesInForce'));
const PayrollComplianceTodos = lazy(() => import('./pages/PayrollComplianceTodos'));
const PayrollBonus = lazy(() => import('./pages/PayrollBonus'));

// Income tax in payroll (spec §25.4)
const TaxProfiles = lazy(() => import('./pages/TaxProfiles'));
const TaxDeclarations = lazy(() => import('./pages/TaxDeclarations'));
const TaxProofs = lazy(() => import('./pages/TaxProofs'));
const TaxSheet = lazy(() => import('./pages/TaxSheet'));
const TaxChallans = lazy(() => import('./pages/TaxChallans'));
const TaxQuarterly = lazy(() => import('./pages/TaxQuarterly'));
const TaxForms = lazy(() => import('./pages/TaxForms'));
const TaxSettings = lazy(() => import('./pages/TaxSettings'));
// Payroll extras P3a (spec §25.5): statutory return files, perquisites, Form 10E / 39
const StatutoryReturns = lazy(() => import('./pages/StatutoryReturns'));
// Compliance (spec §36.4, §36.5): notices, the deadline calendar, the CA's review.
const Compliance = lazy(() => import('./pages/Compliance'));
const TaxPerquisites = lazy(() => import('./pages/TaxPerquisites'));
const TaxForm10E = lazy(() => import('./pages/TaxForm10E'));
// Payroll P3b: claims, claim types and the payroll policy, exits and full and final
const PayrollClaims = lazy(() => import('./pages/PayrollClaims'));
const PayrollClaimTypes = lazy(() => import('./pages/PayrollClaimTypes'));
const Exits = lazy(() => import('./pages/Exits'));
const ExitSettlement = lazy(() => import('./pages/ExitSettlement'));

// Not built yet: the route answers, the menu and the command palette do not
// offer it (navMeta.ts has no entry for these two).
const Attendance = lazy(() => import('./pages/Attendance'));
const Roster = lazy(() => import('./pages/Roster'));

// Setup
const CodeFormats = lazy(() => import('./pages/CodeFormats'));
const HiringSettings = lazy(() => import('./pages/HiringSettings'));
const Libraries = lazy(() => import('./pages/Libraries'));
const ReportingTypes = lazy(() => import('./pages/ReportingTypes'));
const PerformanceSettings = lazy(() => import('./pages/PerformanceSettings'));
const Access = lazy(() => import('./pages/Access'));

/**
 * cf_hrms routes. **Paths must match navMeta.ts** — it is what the shell, the
 * breadcrumb, the ⌘K palette and the mobile sheet all read. Adding a screen
 * means adding it in both files, or it will render without nav.
 *
 * The blocks below are in navMeta's group order (Home · Organisation · People ·
 * Performance · Time and leave · Payroll · Setup) so the two files can be read side by side. After them
 * come the old addresses: every screen the 2026-10-12 clean-up removed or
 * merged redirects to where that work is done now, so a bookmark never 404s.
 */
export function getCfHrmsRoutes(
  ProtectedRoute: React.ComponentType<{ children: React.ReactNode }>,
): RouteObject[] {
  const wrap = (el: React.ReactElement) => (
    <ProtectedRoute>
      <RequireAppAccess>
        <CfHrmsShell>{el}</CfHrmsShell>
      </RequireAppAccess>
    </ProtectedRoute>
  );

  /**
   * Where a login should land.
   *
   * `Home` carries NO permission tag, so without this an employee holding only
   * the self view would land on it: a page of cards, every one of them
   * permission-gated away, under a nav with nothing in it.
   *
   * The test is "does this person have any HR screen to land on at all", not
   * "are they an employee": an HR executive who also holds the self view still
   * belongs on Home.
   */
  /** A screen behind the `view` right of its area (spec §12.7). */
  const guarded = (tag: string, el: React.ReactElement) => wrap(<Guard tag={tag}>{el}</Guard>);

  function useSelfOnly(): boolean {
    // One definition, shared with the nav's SELF_ONLY sentinel (access/can.ts).
    return useCan().selfOnly;
  }

  /** Since 2026-10-09 an employee lands on their own slice of the org chart. */
  const SELF_LANDING = 'my-org-chart';

  function ToHome() {
    const { company } = useParams<{ company: string }>();
    const selfOnly = useSelfOnly();
    return <Navigate to={`/${company}/cf_hrms/${selfOnly ? SELF_LANDING : 'home'}`} replace />;
  }

  /**
   * The Home route itself. An employee who types the URL, follows a bookmark or
   * clicks the brand mark gets their own org chart rather than an empty Home.
   */
  function HomeOrMyPlace() {
    const { company } = useParams<{ company: string }>();
    if (useSelfOnly()) return <Navigate to={`/${company}/cf_hrms/${SELF_LANDING}`} replace />;
    return <Home />;
  }

  /**
   * The employee chart is for a self-only login. Anyone who can open the
   * company chart goes to it instead of to a slice of it.
   */
  function MyOrgChartOrCompany() {
    const { company } = useParams<{ company: string }>();
    if (!useSelfOnly()) return <Navigate to={`/${company}/cf_hrms/org-chart`} replace />;
    return <MyOrgChart />;
  }

  /**
   * Sends an old address to the screen that does that work now. `path` may carry
   * a query (`libraries?tab=kpis`). Not wrapped in the shell: it renders nothing,
   * and the screen it lands on does its own sign-in and access checks.
   */
  function ToScreen({ path }: { path: string }) {
    const { company } = useParams<{ company: string }>();
    // The old address's filters come along (`/departments?label=3` → `/org-units?label=3`),
    // unless the new address names its own (`libraries?tab=kras`).
    const { search } = useLocation();
    return <Navigate to={`/${company}/cf_hrms/${path}${path.includes('?') ? '' : search}`} replace />;
  }

  const old = (from: string, to: string): RouteObject => ({
    path: `/:company/cf_hrms/${from}`,
    element: <ToScreen path={to} />,
  });

  return [
    { path: '/:company/cf_hrms', element: <ToHome /> },
    // The management dashboard (spec §42.1): any one of the areas its tiles show; each tile checks its own right.
    { path: '/:company/cf_hrms/dashboard', element: wrap(<AnyOf tags={[TAG.employees.view, TAG.attendance.view, TAG.positions.view, TAG.payroll.view]}><Dashboard /></AnyOf>) },
    { path: '/:company/cf_hrms/manpower', element: guarded(TAG.positions.view, <Manpower />) },
    { path: '/:company/cf_hrms/notifications', element: wrap(<Notifications />) },
    { path: '/:company/cf_hrms/home', element: wrap(<HomeOrMyPlace />) },

    // The signed-in person's own place. Inside the same shell as everything
    // else — an employee gets the real app with two entries in it, not a
    // stripped-down variant.
    { path: '/:company/cf_hrms/my-place', element: guarded(TAG.named.selfView, <MyPlace />) },
    // The employee's own org chart slice. Anyone with the company chart is sent
    // there instead, so an admin following an employee's link sees the full chart.
    { path: '/:company/cf_hrms/my-org-chart', element: wrap(<MyOrgChartOrCompany />) },
    // A manager on a team member's plan (spec §18.2: drafts only, never activate
    // or cancel). Under my-place so the shell's breadcrumb reads "My place › …".
    { path: '/:company/cf_hrms/my-place/team-plans/:id', element: guarded(TAG.named.selfView, <PerformancePlan mode="team" />) },
    // …and enters actuals for the people below them (spec §19.2).
    { path: '/:company/cf_hrms/my-place/team-actuals', element: guarded(TAG.named.selfView, <PerformanceActuals mode="team" />) },
    // Reviews (spec §20.3): my own (I write my part), and a manager's on someone below them.
    { path: '/:company/cf_hrms/my-place/reviews/:id', element: guarded(TAG.named.selfView, <PerformanceReview mode="self" />) },
    { path: '/:company/cf_hrms/my-place/team-reviews/:id', element: guarded(TAG.named.selfView, <PerformanceReview mode="team" />) },
    // My leave (spec §22.6): every login with the self view.
    { path: '/:company/cf_hrms/my-leave', element: guarded(TAG.named.selfView, <MyLeave />) },
    // My attendance (spec §28.7): every login with the self view; the team calendar under My place.
    { path: '/:company/cf_hrms/my-attendance', element: guarded(TAG.named.selfView, <MyAttendance />) },
    { path: '/:company/cf_hrms/my-place/team-attendance', element: guarded(TAG.named.selfView, <TeamAttendance />) },
    // My pay (spec §25.2): my salary breakdown and my released payslips.
    { path: '/:company/cf_hrms/my-pay', element: guarded(TAG.named.selfView, <MyPay />) },
    { path: '/:company/cf_hrms/my-tax', element: guarded(TAG.named.selfView, <MyTax />) },
    { path: '/:company/cf_hrms/my-tax/return', element: guarded(TAG.named.selfView, <MyTaxReturn />) },
    // Approvals: no single right opens it — a manager has items, HR and the Owner
    // hold leave edit. The server answers for the login; an empty list is fine.
    { path: '/:company/cf_hrms/approvals', element: wrap(<Approvals />) },

    // Organisation
    { path: '/:company/cf_hrms/org-chart', element: guarded(TAG.positions.view, <OrgChart />) },
    // Org units (spec §33): departments, sections, machines … The old /departments redirects below.
    { path: '/:company/cf_hrms/org-units', element: guarded(TAG.org.view, <Departments />) },
    { path: '/:company/cf_hrms/roles', element: guarded(TAG.roles.view, <Roles />) },
    { path: '/:company/cf_hrms/roles/:id', element: guarded(TAG.roles.view, <RoleDetail />) },
    { path: '/:company/cf_hrms/positions', element: guarded(TAG.positions.view, <Positions />) },
    { path: '/:company/cf_hrms/positions/:id', element: guarded(TAG.positions.view, <PositionDetail />) },
    { path: '/:company/cf_hrms/locations', element: guarded(TAG.org.view, <Locations />) },

    // People — including the documents that come out of a person's record
    { path: '/:company/cf_hrms/employees', element: guarded(TAG.employees.view, <Employees />) },
    { path: '/:company/cf_hrms/employees/:id', element: guarded(TAG.employees.view, <EmployeeDetail />) },
    { path: '/:company/cf_hrms/hiring', element: guarded(TAG.hiring.view, <Hiring />) },
    { path: '/:company/cf_hrms/hiring/:id', element: guarded(TAG.hiring.view, <HiringDetail />) },
    { path: '/:company/cf_hrms/documents', element: guarded(TAG.documents.view, <Documents />) },
    { path: '/:company/cf_hrms/documents/:id', element: guarded(TAG.documents.view, <DocumentDetail />) },
    // Exits and full and final (payroll P3b): payroll view; amounts need the named pay view (the page says so).
    { path: '/:company/cf_hrms/exits', element: guarded(TAG.payroll.view, <Exits />) },
    { path: '/:company/cf_hrms/exits/:employeeId', element: guarded(TAG.payroll.view, <ExitSettlement />) },

    // Performance (spec §18.3)
    { path: '/:company/cf_hrms/plans', element: guarded(TAG.performance.view, <PerformancePlans />) },
    { path: '/:company/cf_hrms/plans/:id', element: guarded(TAG.performance.view, <PerformancePlan mode="hr" />) },
    // Actuals (spec §19.3)
    { path: '/:company/cf_hrms/actuals', element: guarded(TAG.performance.view, <PerformanceActuals mode="hr" />) },
    // Reviews and actions (spec §20.3)
    { path: '/:company/cf_hrms/reviews', element: guarded(TAG.performance.view, <PerformanceReviews />) },
    { path: '/:company/cf_hrms/reviews/:id', element: guarded(TAG.performance.view, <PerformanceReview mode="hr" />) },
    { path: '/:company/cf_hrms/actions', element: guarded(TAG.performance.view, <PerformanceActions />) },

    // Time and leave
    { path: '/:company/cf_hrms/shifts', element: guarded(TAG.time.view, <Shifts />) },
    { path: '/:company/cf_hrms/holidays', element: guarded(TAG.time.view, <Holidays />) },
    { path: '/:company/cf_hrms/leave-policies', element: guarded(TAG.leave.view, <LeavePolicies />) },
    { path: '/:company/cf_hrms/leave-policies/:id', element: guarded(TAG.leave.view, <LeavePolicyDetail />) },
    // Leave requests and balances (spec §22.6). A request opens in a sheet over the list.
    { path: '/:company/cf_hrms/leave-requests', element: guarded(TAG.leave.view, <LeaveRequests />) },
    { path: '/:company/cf_hrms/leave-requests/:id', element: guarded(TAG.leave.view, <LeaveRequestDetail />) },
    { path: '/:company/cf_hrms/leave-balances', element: guarded(TAG.leave.view, <LeaveBalances />) },

    // Attendance (spec §28.7), behind its own area. Roster is not built yet: reachable by address only.
    { path: '/:company/cf_hrms/attendance', element: guarded(TAG.attendance.view, <Attendance />) },
    { path: '/:company/cf_hrms/roster', element: guarded(TAG.time.view, <Roster />) },

    // Payroll (spec §25.2). Runs and salaries show people's pay: the route opens on
    // payroll view, and the page itself says so when the named pay view is missing.
    { path: '/:company/cf_hrms/payroll-runs', element: guarded(TAG.payroll.view, <PayrollRuns />) },
    { path: '/:company/cf_hrms/payroll-runs/:id', element: guarded(TAG.payroll.view, <PayrollRunDetail />) },
    { path: '/:company/cf_hrms/salaries', element: guarded(TAG.payroll.view, <Salaries />) },
    { path: '/:company/cf_hrms/salaries/:id', element: guarded(TAG.payroll.view, <SalaryDetail />) },
    { path: '/:company/cf_hrms/pay-structures', element: guarded(TAG.payroll.view, <PayStructures />) },
    { path: '/:company/cf_hrms/pay-structures/:id', element: guarded(TAG.payroll.view, <PayStructureDetail />) },
    { path: '/:company/cf_hrms/pay-components', element: guarded(TAG.payroll.view, <PayComponents />) },
    { path: '/:company/cf_hrms/statutory-settings', element: guarded(TAG.payroll.view, <StatutorySettings />) },
    { path: '/:company/cf_hrms/rules-in-force', element: guarded(TAG.payroll.view, <RulesInForce />) },
    // Compliance checks (spec §36.3): to-dos with a fix, and the statutory bonus. Payroll view; amounts need pay view (the page says so).
    { path: '/:company/cf_hrms/payroll-compliance', element: guarded(TAG.payroll.view, <PayrollComplianceTodos />) },
    { path: '/:company/cf_hrms/payroll-compliance/:id', element: guarded(TAG.payroll.view, <PayrollComplianceTodos />) },
    { path: '/:company/cf_hrms/payroll-bonus', element: guarded(TAG.payroll.view, <PayrollBonus />) },
    { path: '/:company/cf_hrms/payroll-bonus/:id', element: guarded(TAG.payroll.view, <PayrollBonus />) },
    // Tax (spec §25.4): payroll view; the screens with people's amounts say so when the named pay view is missing.
    { path: '/:company/cf_hrms/tax-profiles', element: guarded(TAG.payroll.view, <TaxProfiles />) },
    { path: '/:company/cf_hrms/tax-declarations', element: guarded(TAG.payroll.view, <TaxDeclarations />) },
    { path: '/:company/cf_hrms/tax-declarations/:employeeId', element: guarded(TAG.payroll.view, <TaxDeclarations />) },
    { path: '/:company/cf_hrms/tax-proofs', element: guarded(TAG.payroll.view, <TaxProofs />) },
    { path: '/:company/cf_hrms/tax-sheet/:employeeId', element: guarded(TAG.payroll.view, <TaxSheet />) },
    { path: '/:company/cf_hrms/tax-challans', element: guarded(TAG.payroll.view, <TaxChallans />) },
    { path: '/:company/cf_hrms/tax-quarterly', element: guarded(TAG.payroll.view, <TaxQuarterly />) },
    { path: '/:company/cf_hrms/tax-forms', element: guarded(TAG.payroll.view, <TaxForms />) },
    { path: '/:company/cf_hrms/tax-settings', element: guarded(TAG.payroll.view, <TaxSettings />) },
    // Payroll extras P3a (spec §25.5): payroll view; amounts and files need the named pay view (the page says so).
    { path: '/:company/cf_hrms/statutory-returns', element: guarded(TAG.payroll.view, <StatutoryReturns />) },
    { path: '/:company/cf_hrms/compliance', element: guarded(TAG.compliance.view, <Compliance />) },
    { path: '/:company/cf_hrms/tax-perquisites', element: guarded(TAG.payroll.view, <TaxPerquisites />) },
    { path: '/:company/cf_hrms/tax-form10e', element: guarded(TAG.payroll.view, <TaxForm10E />) },
    // Payroll P3b: claims (amounts need the named pay view), claim types and the payroll policy.
    { path: '/:company/cf_hrms/payroll-claims', element: guarded(TAG.payroll.view, <PayrollClaims />) },
    { path: '/:company/cf_hrms/payroll-claim-types', element: guarded(TAG.payroll.view, <PayrollClaimTypes />) },

    // Setup
    { path: '/:company/cf_hrms/code-formats', element: guarded(TAG.setup.view, <CodeFormats />) },
    { path: '/:company/cf_hrms/letters', element: guarded(TAG.setup.view, <HiringSettings />) },
    { path: '/:company/cf_hrms/libraries', element: guarded(TAG.roles.view, <Libraries />) },
    { path: '/:company/cf_hrms/reporting-types', element: guarded(TAG.setup.view, <ReportingTypes />) },
    { path: '/:company/cf_hrms/performance-settings', element: guarded(TAG.setup.view, <PerformanceSettings />) },
    { path: '/:company/cf_hrms/access', element: guarded(TAG.named.accessManage, <Access />) },

    // ── Old addresses (clean-up of 2026-10-12, spec §10) ─────────────────
    // The plans list is one segment (navMeta.ts says why); the longer spelling still lands there.
    old('performance', 'plans'),
    old('performance/plans', 'plans'),
    // A person's positions are on the employee's own page now.
    old('assignments', 'employees'),
    old('assignments/:id', 'employees'),
    old('contractors', 'employees'),
    // A machine, a line and an area are org units.
    old('work-contexts', 'org-units'),
    // "Departments" became "Org units" (spec §33, 2026-10-24).
    old('departments', 'org-units'),
    old('manpower', 'positions'),
    old('open-points', 'home'),
    old('import', 'home'),
    // Leave types are managed inside a leave policy.
    old('leave-types', 'leave-policies'),
    // Six library screens became six tabs of one.
    old('kras', 'libraries?tab=kras'),
    old('responsibilities', 'libraries?tab=responsibilities'),
    old('kpis', 'libraries?tab=kpis'),
    old('skills', 'libraries?tab=skills'),
    old('qualifications', 'libraries?tab=qualifications'),
    old('authorities', 'libraries?tab=authorities'),
    // Four access screens became four tabs of one.
    old('access-users', 'access?tab=logins'),
    old('access-roles', 'access?tab=roles'),
    old('access-capabilities', 'access?tab=capabilities'),
    old('access-logs', 'access?tab=logs'),

    // ── The platform's old shared admin URLs, shadowed ───────────────────
    //
    // App.tsx routes `/:company/:app/admin/dashboard/*` to AdminLayout wrapping
    // audio_intelligence's admin pages. React Router v6 ranks by specificity,
    // and a literal `cf_hrms` segment outranks the `:app` parameter, so these
    // win for this app alone and App.tsx needs no edit.
    //
    // Actions, Company documents and Team documents have no replacement on
    // purpose: the first is audio_intelligence's concept, and cf_hrms already
    // has a Documents screen that means something else entirely. Those land on
    // Home.
    { path: '/:company/cf_hrms/admin/dashboard', element: <ToHome /> },
    old('admin/dashboard/add-user', 'access?tab=logins'),
    old('admin/dashboard/roles-mapping', 'access?tab=roles'),
    old('admin/dashboard/capabilities-add', 'access?tab=capabilities'),
    old('admin/dashboard/add-feature', 'access?tab=capabilities'),
    old('admin/dashboard/error-logs', 'access?tab=logs'),
    { path: '/:company/cf_hrms/admin/dashboard/actions', element: <ToHome /> },
    { path: '/:company/cf_hrms/admin/dashboard/company-documents', element: <ToHome /> },
    { path: '/:company/cf_hrms/admin/dashboard/team-documents', element: <ToHome /> },
  ];
}
