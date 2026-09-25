import React, { lazy } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { RequireAppAccess } from '@core/components/RequireAppAccess';
import { CfHrmsShell } from './components/shell/CfHrmsShell';

const Home = lazy(() => import('./pages/Home'));

// Organisation (DEFINE)
const OrgChart = lazy(() => import('./pages/OrgChart'));
const Positions = lazy(() => import('./pages/Positions'));
const PositionDetail = lazy(() => import('./pages/PositionDetail'));
const Roles = lazy(() => import('./pages/Roles'));
const RoleDetail = lazy(() => import('./pages/RoleDetail'));
const Departments = lazy(() => import('./pages/Departments'));
const Locations = lazy(() => import('./pages/Locations'));
const WorkContexts = lazy(() => import('./pages/WorkContexts'));

// People (STAFF)
const Employees = lazy(() => import('./pages/Employees'));
const EmployeeDetail = lazy(() => import('./pages/EmployeeDetail'));
const Assignments = lazy(() => import('./pages/Assignments'));
const AssignmentDetail = lazy(() => import('./pages/AssignmentDetail'));
const Documents = lazy(() => import('./pages/Documents'));
const DocumentDetail = lazy(() => import('./pages/DocumentDetail'));

// Work (RUN)
const Attendance = lazy(() => import('./pages/Attendance'));
const Roster = lazy(() => import('./pages/Roster'));
const LeaveRequests = lazy(() => import('./pages/LeaveRequests'));
const LeaveRequestDetail = lazy(() => import('./pages/LeaveRequestDetail'));
const LeaveBalances = lazy(() => import('./pages/LeaveBalances'));
const Manpower = lazy(() => import('./pages/Manpower'));

// Setup — the vocabulary the rest is written from
const Kras = lazy(() => import('./pages/Kras'));
const Responsibilities = lazy(() => import('./pages/Responsibilities'));
const Kpis = lazy(() => import('./pages/Kpis'));
const Skills = lazy(() => import('./pages/Skills'));
const Qualifications = lazy(() => import('./pages/Qualifications'));
const Authorities = lazy(() => import('./pages/Authorities'));
const Shifts = lazy(() => import('./pages/Shifts'));
const Holidays = lazy(() => import('./pages/Holidays'));
const LeaveTypes = lazy(() => import('./pages/LeaveTypes'));
const ReportingTypes = lazy(() => import('./pages/ReportingTypes'));
const Contractors = lazy(() => import('./pages/Contractors'));
const OpenPoints = lazy(() => import('./pages/OpenPoints'));
const ImportOrgChart = lazy(() => import('./pages/ImportOrgChart'));

// Setup › Access — the platform's own admin screens, rebuilt for this app
const AccessPeople = lazy(() => import('./pages/access/AccessPeople'));
const AccessRoles = lazy(() => import('./pages/access/AccessRoles'));
const AccessCapabilities = lazy(() => import('./pages/access/AccessCapabilities'));
const AccessLogs = lazy(() => import('./pages/access/AccessLogs'));

/**
 * cf_hrms routes. **Paths must match navMeta.ts** — it is what the shell, the
 * breadcrumb, the ⌘K palette and the mobile sheet all read. Adding a screen
 * means adding it in both files, or it will render without nav.
 *
 * The blocks below are in navMeta's section order (Home · Organisation ·
 * People · Work · Setup) so the two files can be read side by side and a
 * missing entry is visible rather than inferred.
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

  function ToHome() {
    const { company } = useParams<{ company: string }>();
    return <Navigate to={`/${company}/cf_hrms/home`} replace />;
  }

  /**
   * Sends one of the platform's old admin URLs to its cf_hrms replacement.
   *
   * These paths still exist in App.tsx for every other app, where they render
   * `AdminLayout` — the dark sidebar that predates the design system. They are
   * shadowed here rather than edited there, because fab_erp, cf_erp,
   * audio_intelligence and sales_control still use those screens exactly as
   * they are, and this work is cf_hrms only.
   */
  function ToScreen({ path }: { path: string }) {
    const { company } = useParams<{ company: string }>();
    return <Navigate to={`/${company}/cf_hrms/${path}`} replace />;
  }

  return [
    { path: '/:company/cf_hrms', element: <ToHome /> },
    { path: '/:company/cf_hrms/dashboard', element: <ToHome /> },
    { path: '/:company/cf_hrms/home', element: wrap(<Home />) },

    // Organisation (DEFINE) — Roles lives here: a role is part of what the
    // organisation IS, not a world of its own.
    { path: '/:company/cf_hrms/org-chart', element: wrap(<OrgChart />) },
    { path: '/:company/cf_hrms/positions', element: wrap(<Positions />) },
    { path: '/:company/cf_hrms/positions/:id', element: wrap(<PositionDetail />) },
    { path: '/:company/cf_hrms/roles', element: wrap(<Roles />) },
    { path: '/:company/cf_hrms/roles/:id', element: wrap(<RoleDetail />) },
    { path: '/:company/cf_hrms/departments', element: wrap(<Departments />) },
    { path: '/:company/cf_hrms/locations', element: wrap(<Locations />) },
    { path: '/:company/cf_hrms/work-contexts', element: wrap(<WorkContexts />) },

    // People (STAFF) — including the documents that come out of a person's record
    { path: '/:company/cf_hrms/employees', element: wrap(<Employees />) },
    { path: '/:company/cf_hrms/employees/:id', element: wrap(<EmployeeDetail />) },
    { path: '/:company/cf_hrms/assignments', element: wrap(<Assignments />) },
    { path: '/:company/cf_hrms/assignments/:id', element: wrap(<AssignmentDetail />) },
    { path: '/:company/cf_hrms/documents', element: wrap(<Documents />) },
    { path: '/:company/cf_hrms/documents/:id', element: wrap(<DocumentDetail />) },

    // Work (RUN)
    { path: '/:company/cf_hrms/attendance', element: wrap(<Attendance />) },
    { path: '/:company/cf_hrms/roster', element: wrap(<Roster />) },
    { path: '/:company/cf_hrms/leave-requests', element: wrap(<LeaveRequests />) },
    { path: '/:company/cf_hrms/leave-requests/:id', element: wrap(<LeaveRequestDetail />) },
    { path: '/:company/cf_hrms/leave-balances', element: wrap(<LeaveBalances />) },
    { path: '/:company/cf_hrms/manpower', element: wrap(<Manpower />) },

    // Setup — the six content masters first (they are the vocabulary roles are
    // written from), then the rules and the one-off import.
    { path: '/:company/cf_hrms/kras', element: wrap(<Kras />) },
    { path: '/:company/cf_hrms/responsibilities', element: wrap(<Responsibilities />) },
    { path: '/:company/cf_hrms/kpis', element: wrap(<Kpis />) },
    { path: '/:company/cf_hrms/skills', element: wrap(<Skills />) },
    { path: '/:company/cf_hrms/qualifications', element: wrap(<Qualifications />) },
    { path: '/:company/cf_hrms/authorities', element: wrap(<Authorities />) },
    { path: '/:company/cf_hrms/shifts', element: wrap(<Shifts />) },
    { path: '/:company/cf_hrms/holidays', element: wrap(<Holidays />) },
    { path: '/:company/cf_hrms/leave-types', element: wrap(<LeaveTypes />) },
    { path: '/:company/cf_hrms/reporting-types', element: wrap(<ReportingTypes />) },
    { path: '/:company/cf_hrms/contractors', element: wrap(<Contractors />) },
    { path: '/:company/cf_hrms/open-points', element: wrap(<OpenPoints />) },
    { path: '/:company/cf_hrms/import', element: wrap(<ImportOrgChart />) },

    // Setup › Access — logins, what a role may do, the vocabulary behind it,
    // and the error log. Inside CfHrmsShell like every other route, so they get
    // the two-row nav, the palette, the theme and the tokens.
    { path: '/:company/cf_hrms/access-users', element: wrap(<AccessPeople />) },
    { path: '/:company/cf_hrms/access-roles', element: wrap(<AccessRoles />) },
    { path: '/:company/cf_hrms/access-capabilities', element: wrap(<AccessCapabilities />) },
    { path: '/:company/cf_hrms/access-logs', element: wrap(<AccessLogs />) },

    // ── The old shared admin URLs, shadowed ──────────────────────────────
    //
    // App.tsx routes `/:company/:app/admin/dashboard/*` to AdminLayout wrapping
    // audio_intelligence's admin pages. React Router v6 ranks by specificity,
    // and a literal `cf_hrms` segment outranks the `:app` parameter, so these
    // win for this app alone and App.tsx needs no edit. Verified in the browser
    // before the screens were built, because the whole approach rests on it.
    //
    // Actions, Company documents and Team documents have no replacement on
    // purpose: the first is audio_intelligence's concept, and cf_hrms already
    // has a Documents screen that means something else entirely (generated JDs
    // and responsibility profiles). A second Documents under a second meaning
    // is worse than none, so those land on Home.
    { path: '/:company/cf_hrms/admin/dashboard', element: <ToHome /> },
    { path: '/:company/cf_hrms/admin/dashboard/add-user', element: <ToScreen path="access-users" /> },
    { path: '/:company/cf_hrms/admin/dashboard/roles-mapping', element: <ToScreen path="access-roles" /> },
    { path: '/:company/cf_hrms/admin/dashboard/capabilities-add', element: <ToScreen path="access-capabilities" /> },
    { path: '/:company/cf_hrms/admin/dashboard/add-feature', element: <ToScreen path="access-capabilities" /> },
    { path: '/:company/cf_hrms/admin/dashboard/error-logs', element: <ToScreen path="access-logs" /> },
    { path: '/:company/cf_hrms/admin/dashboard/actions', element: <ToHome /> },
    { path: '/:company/cf_hrms/admin/dashboard/company-documents', element: <ToHome /> },
    { path: '/:company/cf_hrms/admin/dashboard/team-documents', element: <ToHome /> },
  ];
}
