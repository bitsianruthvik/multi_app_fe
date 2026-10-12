import React, { lazy } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { useIsPermitted } from '@shared/ui';
import { RequireAppAccess } from '@core/components/RequireAppAccess';
import { CfHrmsShell } from './components/shell/CfHrmsShell';
import { isSelfOnly } from './navMeta';

const Home = lazy(() => import('./pages/Home'));

// The employee self view. Not lazy-grouped with anything else: for a
// shop-floor login these are the only chunks they load.
const MyPlace = lazy(() => import('./pages/MyPlace'));
// The employee's own slice of the org chart — their landing screen. A separate
// page from OrgChart: it imports api/self only, never the company-wide chart.
const MyOrgChart = lazy(() => import('./pages/MyOrgChart'));

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

// Time and leave
const Shifts = lazy(() => import('./pages/Shifts'));
const Holidays = lazy(() => import('./pages/Holidays'));
const LeavePolicies = lazy(() => import('./pages/LeavePolicies'));
const LeavePolicyDetail = lazy(() => import('./pages/LeavePolicyDetail'));

// Not built yet: the route answers, the menu and the command palette do not
// offer it (navMeta.ts has no entry for these four).
const Attendance = lazy(() => import('./pages/Attendance'));
const Roster = lazy(() => import('./pages/Roster'));
const LeaveRequests = lazy(() => import('./pages/LeaveRequests'));
const LeaveRequestDetail = lazy(() => import('./pages/LeaveRequestDetail'));
const LeaveBalances = lazy(() => import('./pages/LeaveBalances'));

// Setup
const CodeFormats = lazy(() => import('./pages/CodeFormats'));
const HiringSettings = lazy(() => import('./pages/HiringSettings'));
const Libraries = lazy(() => import('./pages/Libraries'));
const ReportingTypes = lazy(() => import('./pages/ReportingTypes'));
const Access = lazy(() => import('./pages/Access'));

/**
 * cf_hrms routes. **Paths must match navMeta.ts** — it is what the shell, the
 * breadcrumb, the ⌘K palette and the mobile sheet all read. Adding a screen
 * means adding it in both files, or it will render without nav.
 *
 * The blocks below are in navMeta's group order (Home · Organisation · People ·
 * Time and leave · Setup) so the two files can be read side by side. After them
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
   * `cf_hrms_self_view` would land on it: a page of cards, every one of them
   * permission-gated away, under a nav with nothing in it.
   *
   * The test is "does this person have any HR screen to land on at all", not
   * "are they an employee": an HR executive who also holds the self view still
   * belongs on Home.
   */
  function useSelfOnly(): boolean {
    // One definition, shared with the nav's SELF_ONLY sentinel (navMeta.ts).
    return isSelfOnly(useIsPermitted());
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
    return <Navigate to={`/${company}/cf_hrms/${path}`} replace />;
  }

  const old = (from: string, to: string): RouteObject => ({
    path: `/:company/cf_hrms/${from}`,
    element: <ToScreen path={to} />,
  });

  return [
    { path: '/:company/cf_hrms', element: <ToHome /> },
    { path: '/:company/cf_hrms/dashboard', element: <ToHome /> },
    { path: '/:company/cf_hrms/home', element: wrap(<HomeOrMyPlace />) },

    // The signed-in person's own place. Inside the same shell as everything
    // else — an employee gets the real app with two entries in it, not a
    // stripped-down variant.
    { path: '/:company/cf_hrms/my-place', element: wrap(<MyPlace />) },
    // The employee's own org chart slice. Anyone with the company chart is sent
    // there instead, so an admin following an employee's link sees the full chart.
    { path: '/:company/cf_hrms/my-org-chart', element: wrap(<MyOrgChartOrCompany />) },

    // Organisation
    { path: '/:company/cf_hrms/org-chart', element: wrap(<OrgChart />) },
    { path: '/:company/cf_hrms/departments', element: wrap(<Departments />) },
    { path: '/:company/cf_hrms/roles', element: wrap(<Roles />) },
    { path: '/:company/cf_hrms/roles/:id', element: wrap(<RoleDetail />) },
    { path: '/:company/cf_hrms/positions', element: wrap(<Positions />) },
    { path: '/:company/cf_hrms/positions/:id', element: wrap(<PositionDetail />) },
    { path: '/:company/cf_hrms/locations', element: wrap(<Locations />) },

    // People — including the documents that come out of a person's record
    { path: '/:company/cf_hrms/employees', element: wrap(<Employees />) },
    { path: '/:company/cf_hrms/employees/:id', element: wrap(<EmployeeDetail />) },
    { path: '/:company/cf_hrms/hiring', element: wrap(<Hiring />) },
    { path: '/:company/cf_hrms/hiring/:id', element: wrap(<HiringDetail />) },
    { path: '/:company/cf_hrms/documents', element: wrap(<Documents />) },
    { path: '/:company/cf_hrms/documents/:id', element: wrap(<DocumentDetail />) },

    // Time and leave
    { path: '/:company/cf_hrms/shifts', element: wrap(<Shifts />) },
    { path: '/:company/cf_hrms/holidays', element: wrap(<Holidays />) },
    { path: '/:company/cf_hrms/leave-policies', element: wrap(<LeavePolicies />) },
    { path: '/:company/cf_hrms/leave-policies/:id', element: wrap(<LeavePolicyDetail />) },

    // Time and leave — not built yet. Reachable by address only.
    { path: '/:company/cf_hrms/attendance', element: wrap(<Attendance />) },
    { path: '/:company/cf_hrms/roster', element: wrap(<Roster />) },
    { path: '/:company/cf_hrms/leave-requests', element: wrap(<LeaveRequests />) },
    { path: '/:company/cf_hrms/leave-requests/:id', element: wrap(<LeaveRequestDetail />) },
    { path: '/:company/cf_hrms/leave-balances', element: wrap(<LeaveBalances />) },

    // Setup
    { path: '/:company/cf_hrms/code-formats', element: wrap(<CodeFormats />) },
    { path: '/:company/cf_hrms/letters', element: wrap(<HiringSettings />) },
    { path: '/:company/cf_hrms/libraries', element: wrap(<Libraries />) },
    { path: '/:company/cf_hrms/reporting-types', element: wrap(<ReportingTypes />) },
    { path: '/:company/cf_hrms/access', element: wrap(<Access />) },

    // ── Old addresses (clean-up of 2026-10-12, spec §10) ─────────────────
    // A person's positions are on the employee's own page now.
    old('assignments', 'employees'),
    old('assignments/:id', 'employees'),
    old('contractors', 'employees'),
    // A machine, a line and an area are departments.
    old('work-contexts', 'departments'),
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
