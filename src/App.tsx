/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { Suspense, lazy } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
} from "react-router-dom";
import CssBaseline from "@mui/material/CssBaseline";
import { AppThemeProvider } from "@core/contexts/ThemeContext";

import { Box, CircularProgress } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { AuthProvider, useAuth } from "@core/contexts/AuthContext";
import { getAudioRoutes } from "@apps/audio_intelligence/routes";
import { getSalesControlRoutes } from "@apps/sales_control/routes";
import { getFabFlowRoutes } from "@apps/fab_flow/routes";
import { getFabErpRoutes } from "@apps/fab_erp/routes";
import AppShell from "@core/components/AppShell";
import { RequireAppAccess } from "@core/components/RequireAppAccess";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import ForgotPassword from "./pages/auth/ForgotPassword";
import CompanyLanding from "./pages/auth/CompanyLanding";
import AppSelector from "./pages/auth/AppSelector";

const ProfilePage  = lazy(() => import("@apps/sales_control/pages/user/ProfilePage"));
const SettingsPage = lazy(() => import("@apps/sales_control/pages/user/SettingsPage"));
const AddCapability = lazy(() => import("@apps/audio_intelligence/pages/admin/AddCapability"));
const AdminRegister = lazy(() => import("@apps/audio_intelligence/pages/admin/AdminRegister"));
const AddUser = lazy(() => import("@apps/audio_intelligence/pages/admin/AddUser"));
const AddFeature = lazy(() => import("@apps/audio_intelligence/pages/admin/AddFeature"));
const CompanyDocuments = lazy(() => import("@apps/audio_intelligence/pages/admin/CompanyDocuments"));
const RoleMapping = lazy(() => import("@apps/audio_intelligence/pages/admin/RoleMapping"));
const ErrorLogs = lazy(() => import("@apps/audio_intelligence/pages/admin/ErrorLogs"));
const Actions = lazy(() => import("@apps/audio_intelligence/pages/admin/Actions"));
const AdminLayout = lazy(() => import("@core/layouts/AdminLayout"));
const Dashboard = lazy(() => import("@apps/audio_intelligence/pages/admin/Dashboard"));
const UserDashboard = lazy(() => import("./pages/user/Dashboard"));

function getSlugsFromPathname(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 2) {
    return { company: parts[0], app: parts[1] };
  }
  return { company: null, app: null } as any;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitialized } = useAuth();
  const location = useLocation();
  const { company } = getSlugsFromPathname(location.pathname);

  if (!isInitialized) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "50vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    const redirectTo = company ? `/${company}` : `/`;
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// Legacy paths redirect to consolidated dashboards
function RedirectToDashboard() {
  const { company, app } = useParams();
  const target = company && app ? `/${company}/${app}/dashboard` : "/";
  return <Navigate to={target} replace />;
}

function RedirectRoleDashboard() {
  const { company, app, role } = useParams();
  const target =
    company && app
      ? role
        ? `/${company}/${app}/${role}/dashboard`
        : `/${company}/${app}/dashboard`
      : "/";
  return <Navigate to={target} replace />;
}

function WorkspaceLanding() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%)",
      fontFamily: "'Inter', -apple-system, sans-serif", color: "#fff",
      textAlign: "center", padding: 24,
    }}>
      <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 800 }}>Welcome</h1>
      <p style={{ margin: 0, fontSize: 15, color: "rgba(255,255,255,0.5)" }}>
        Navigate to your workspace:{" "}
        <code style={{ background: "rgba(255,255,255,0.1)", padding: "2px 8px", borderRadius: 6 }}>
          yoursite.com/your-company
        </code>
      </p>
    </div>
  );
}

function App() {
  return (
    <AppThemeProvider>
      <CssBaseline enableColorScheme />
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <AuthProvider>
          <Router>
            <AppShell>
              <Suspense
                fallback={
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "50vh",
                    }}
                  >
                    <CircularProgress />
                  </Box>
                }
              >
              <Routes>
                {/* New company-level entry points */}
                <Route path="/:company" element={<CompanyLanding />} />
                <Route
                  path="/:company/apps"
                  element={<AppSelector />}
                />

                {/* Public routes with slugs */}
                <Route path="/:company/:app/login" element={<Login />} />
                <Route path="/:company/:app/register" element={<Register />} />
                <Route path="/:company/:app/forgot-password" element={<ForgotPassword />} />
                <Route
                  path="/:company/:app/admin/register"
                  element={<AdminRegister />}
                />

                {/* Protected admin routes with slugs */}
                <Route
                  path="/:company/:app/admin/dashboard"
                  element={
                    <ProtectedRoute>
                      <RequireAppAccess>
                        <AdminLayout />
                      </RequireAppAccess>
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Dashboard />} />
                  <Route path="capabilities-add" element={<AddCapability />} />
                  <Route path="add-feature" element={<AddFeature />} />
                  <Route path="add-user" element={<AddUser />} />
                  <Route
                    path="company-documents"
                    element={<CompanyDocuments />}
                  />
                  <Route path="team-documents" element={<CompanyDocuments />} />
                  <Route path="roles-mapping" element={<RoleMapping />} />
                  <Route path="error-logs" element={<ErrorLogs />} />
                  <Route path="actions" element={<Actions />} />
                </Route>


                {/* Audio Intelligence flow routes (audio_intelligence app) */}
                {getAudioRoutes(ProtectedRoute).map(r => (
                  <Route key={r.path as string} path={r.path as string} element={r.element as React.ReactElement} />
                ))}

                {/* sales_control flow routes (same components as audio_intelligence) */}
                {getSalesControlRoutes(ProtectedRoute).map(r => (
                  <Route key={r.path as string} path={r.path as string} element={r.element as React.ReactElement} />
                ))}

                {/* fab_flow routes */}
                {getFabFlowRoutes(ProtectedRoute).map(r => (
                  <Route key={r.path as string} path={r.path as string} element={r.element as React.ReactElement} />
                ))}

                {/* fab_erp routes */}
                {getFabErpRoutes(ProtectedRoute).map(r => (
                  <Route key={r.path as string} path={r.path as string} element={r.element as React.ReactElement} />
                ))}

                {/* Profile & Settings — generic across all apps */}
                <Route
                  path="/:company/:app/profile"
                  element={
                    <ProtectedRoute>
                      <RequireAppAccess>
                        <ProfilePage />
                      </RequireAppAccess>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/:company/:app/settings"
                  element={
                    <ProtectedRoute>
                      <RequireAppAccess>
                        <SettingsPage />
                      </RequireAppAccess>
                    </ProtectedRoute>
                  }
                />

                {/* Generic role-based dashboard (e.g. /:company/:app/salesman/dashboard or /:company/:app/manager/dashboard) */}
                <Route
                  path="/:company/:app/:role/dashboard"
                  element={
                    <ProtectedRoute>
                      <RequireAppAccess>
                        <UserDashboard />
                      </RequireAppAccess>
                    </ProtectedRoute>
                  }
                />

                {/* Quick Actions and Brand Detailing are integrated into Dashboard */}
                <Route
                  path="/:company/:app/quick-actions"
                  element={<RedirectToDashboard />}
                />
                <Route
                  path="/:company/:app/brand-detailing-practice"
                  element={<RedirectToDashboard />}
                />
                <Route
                  path="/:company/:app/:role/quick-actions"
                  element={<RedirectRoleDashboard />}
                />
                <Route
                  path="/:company/:app/:role/brand-detailing-practice"
                  element={<RedirectRoleDashboard />}
                />

                {/* Record audio is handled inside Dashboard now */}

                {/* Practice Results page */}
                <Route
                  path="/:company/:app/practice-results/:recordingId"
                  element={<RedirectToDashboard />}
                />

                {/* Full-page Analysis Detail */}
                <Route
                  path="/:company/:app/analysis/:id"
                  element={<RedirectToDashboard />}
                />

                {/* My Progress page */}
                <Route
                  path="/:company/:app/my-progress"
                  element={<RedirectToDashboard />}
                />

                {/* Call History page */}
                <Route
                  path="/:company/:app/call-history"
                  element={<RedirectToDashboard />}
                />

                {/* Past recordings consolidated under Dashboard */}

                {/* More page */}
                <Route
                  path="/:company/:app/more"
                  element={<RedirectToDashboard />}
                />

                {/* Also support the generic app-level dashboard (/:company/:app/dashboard) */}
                <Route
                  path="/:company/:app/dashboard"
                  element={
                    <ProtectedRoute>
                      <RequireAppAccess>
                        <UserDashboard />
                      </RequireAppAccess>
                    </ProtectedRoute>
                  }
                />

                {/* Single audio review page */}
                <Route
                  path="/:company/:app/audio/:id"
                  element={<RedirectToDashboard />}
                />

                {/* Root: prompt users to navigate to their company URL */}
                <Route path="/" element={<WorkspaceLanding />} />

                {/* 404 catch-all */}
                <Route
                  path="*"
                  element={
                    <div style={{ padding: "2rem" }}>
                      <h1>404 - Not Found</h1>
                      <p>The page you are looking for does not exist.</p>
                    </div>
                  }
                />
              </Routes>
              </Suspense>
            </AppShell>
          </Router>
        </AuthProvider>
      </LocalizationProvider>
    </AppThemeProvider>
  );
}

export default App;
