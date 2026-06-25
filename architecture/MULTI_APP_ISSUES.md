# Multi-App Frontend Issues — Prioritised Todo

Last updated: 2026-05-19

This document lists every architectural issue in the frontend that prevents the platform from
cleanly hosting multiple apps. Issues are ranked by severity:
- **CRITICAL** — workflow_fab (or any new app) will be visibly broken without this fix
- **HIGH** — silently wrong or fragile; causes subtle bugs under certain conditions  
- **MEDIUM** — technical debt that compounds as apps are added
- **LOW** — nice-to-have quality improvements

---

## CRITICAL

---

### Issue-1: Admin nav returns the same items for every app

**File**: `src/config/adminNav.tsx:13-58`

**Problem**: `buildAdminNavItems(companySlug, appSlug)` receives `appSlug` as a parameter but
completely ignores it. It always returns the same 8 items — the last one ("Actions") is
audio_intelligence-specific. A workflow_fab admin will see the Actions menu item (irrelevant)
and will NOT see the Clients, End Clients, Projects, Workflow Types, Workflow Templates, or
Work Items items.

**Current code**:
```typescript
export function buildAdminNavItems(companySlug: string, appSlug: string): NavItem[] {
  const base = `/${companySlug}/${appSlug}/admin/dashboard`;
  return [
    { label: 'Admin Overview', ... },
    { label: 'Team Members', ... },
    // ... 5 more platform-generic items ...
    { label: 'Actions', icon: <CategoryIcon />, to: `${base}/actions` }, // AI-specific!
  ];
}
```

**Fix**:
Split into a `platformItems` base (generic to all apps) + per-app extension block:

```typescript
export function buildAdminNavItems(companySlug: string, appSlug: string): NavItem[] {
  const base = `/${companySlug}/${appSlug}/admin/dashboard`;
  const platformItems: NavItem[] = [
    { label: 'Admin Overview', icon: <DashboardRoundedIcon />, to: base, end: true },
    { label: 'Team Members',   icon: <GroupRoundedIcon />,     to: `${base}/add-user` },
    { label: 'Feature Catalog',icon: <ExtensionRoundedIcon />, to: `${base}/add-feature` },
    { label: 'Permissions',    icon: <VpnKeyRoundedIcon />,    to: `${base}/capabilities-add` },
    { label: 'Role Mapping',   icon: <AccountTreeRoundedIcon />, to: `${base}/roles-mapping` },
    { label: 'Documents',      icon: <FolderRoundedIcon />,    to: `${base}/company-documents` },
    { label: 'Error Logs',     icon: <BugReportRoundedIcon />, to: `${base}/error-logs` },
  ];

  if (appSlug === 'workflow_fab') {
    const wfBase = `/${companySlug}/${appSlug}/admin`;
    return [
      ...platformItems,
      { label: 'Clients',             icon: <BusinessIcon />,    to: `${wfBase}/clients` },
      { label: 'End Clients',         icon: <GroupsIcon />,      to: `${wfBase}/end-clients` },
      { label: 'Projects',            icon: <FolderIcon />,      to: `${wfBase}/projects` },
      { label: 'Workflow Types',      icon: <CategoryIcon />,    to: `${wfBase}/workflow-types` },
      { label: 'Workflow Templates',  icon: <DescriptionIcon />, to: `${wfBase}/workflow-templates` },
      { label: 'Work Items',          icon: <AssignmentIcon />,  to: `${wfBase}/work-items` },
    ];
  }

  // Default: audio_intelligence
  return [...platformItems, { label: 'Actions', icon: <CategoryIcon />, to: `${base}/actions` }];
}
```

---

### Issue-2: User Dashboard is audio_intelligence-specific

**File**: `src/pages/user/Dashboard.tsx`

**Problem**: The user-facing dashboard (served at `/:company/:app/dashboard` for ALL apps) fetches
the `actions` table and renders action cards. "Actions" is an audio_intelligence concept.
A workflow_fab user will see an empty "No actions configured yet" message.

**Current code**:
```typescript
// Dashboard.tsx — fetches audio_intelligence-specific resource
const resp = await api.post(`${API_HOST}/api/query/v1/base_resource`, {
  resource: 'actions',   // ← audio_intelligence only
  ...
});
// Navigates to /:company/:app/flow/:actionId  ← audio_intelligence flow
```

**Fix (Option A — recommended for clarity)**: Each app provides its own dashboard page.
`Dashboard.tsx` becomes a dispatcher:

```typescript
// pages/user/Dashboard.tsx
import { useLocation } from 'react-router-dom';
import AudioIntelligenceDashboard from './audio_intelligence/Dashboard';
import WorkflowFabDashboard from './workflow_fab/DashboardPage';

export default function UserDashboard() {
  const parts = useLocation().pathname.split('/').filter(Boolean);
  const app = parts[1];
  if (app === 'workflow_fab') return <WorkflowFabDashboard />;
  return <AudioIntelligenceDashboard />; // current Dashboard.tsx content
}
```

**Fix (Option B — simpler, acceptable for small number of apps)**: Add an if-block at the top
of the existing Dashboard.tsx and render different content per app slug.

---

### Issue-3: workflow_fab has no routes registered in App.tsx

**File**: `src/App.tsx`

**Problem**: The 7 workflow_fab pages (6 admin + 1 user board) have no `<Route>` entries yet.
Navigating to `/placebo_fabtech/workflow_fab/admin/clients` will hit the 404 catch-all.

**Fix**: Add lazy imports and routes as specified in PLAN.md EU-10. Key decision on nesting
pattern — see Issue-7 below before implementing this.

---

## HIGH

---

### Issue-4: AdminLayout extracts slugs from `window.location` instead of React Router

**File**: `src/layouts/AdminLayout.tsx:104-106`

**Problem**:
```typescript
const parts = window.location.pathname.split('/').filter(Boolean);
const companySlug = parts[0] || 'company';
const appSlug = parts[1] || 'app';
```

`window.location` is a browser global that does NOT participate in React's render cycle. During
client-side navigation, React Router updates its internal state before `window.location` reflects
the new URL. On fast navigations, AdminLayout may build nav items for the PREVIOUS route's app slug,
causing a flash of wrong nav items.

UserLayout (correctly) uses `useLocation()` from react-router — same result but reactive.

**Fix**:
```typescript
import { useLocation } from 'react-router-dom';
// inside AdminLayout():
const location = useLocation();
const parts = location.pathname.split('/').filter(Boolean);
const companySlug = parts[0] || '';
const appSlug = parts[1] || '';
```

---

### Issue-5: Admin routes for new apps cannot use AdminLayout's <Outlet> correctly

**File**: `src/App.tsx:139-158`

**Problem**: Current admin pages are nested under one `<Route path="/:company/:app/admin/dashboard">`:
```tsx
<Route path="/:company/:app/admin/dashboard" element={<AdminLayout />}>
  <Route index element={<Dashboard />} />
  <Route path="add-user" element={<AddUser />} />
  ...
</Route>
```
AdminLayout mounts ONCE; child pages swap via `<Outlet />` — the sidebar does not remount.

EU-10 (PLAN.md) currently proposes adding workflow_fab pages as FLAT routes:
```tsx
<Route path="/:company/:app/admin/clients" element={<ProtectedRoute><AdminLayout><WfClientsPage/></AdminLayout></ProtectedRoute>} />
```
This means AdminLayout instantiates fresh on EVERY navigation between admin pages — the sidebar
collapses, localStorage state re-reads, re-renders fully. The user sees a sidebar flash.

**Fix**: Add a second nested route group for workflow_fab pages:
```tsx
<Route path="/:company/:app/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
  {/* workflow_fab pages */}
  <Route path="clients"             element={<WfClientsPage />} />
  <Route path="end-clients"         element={<WfEndClientsPage />} />
  <Route path="projects"            element={<WfProjectsPage />} />
  <Route path="workflow-types"      element={<WfWorkflowTypesPage />} />
  <Route path="workflow-templates"  element={<WfWorkflowTemplatesPage />} />
  <Route path="work-items"          element={<WfWorkItemsPage />} />
</Route>
```
Note: the existing `/:company/:app/admin/dashboard` nested route group must stay for backward
compatibility with the existing pages. Two separate `<Route>` groups with AdminLayout is fine —
React Router handles them independently.

---

### Issue-6: User dashboard route at `/:company/:app/dashboard` renders audio_intelligence content for all apps

**File**: `src/App.tsx:277-284`

**Problem**: The route:
```tsx
<Route path="/:company/:app/dashboard" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
```
...sends every app's users to the audio_intelligence action-picker dashboard. There is no dispatch
mechanism. workflow_fab users hitting `/placebo_fabtech/workflow_fab/dashboard` see an empty actions list.

**Fix**: Implement the dispatch pattern described in Issue-2. Or point each app at a dedicated
dashboard route and redirect `/:company/:app/dashboard` based on app slug.

---

### Issue-7: Audio_intelligence flow routes are globally registered — bleed across all apps

**File**: `src/App.tsx:163-210`

**Problem**: Routes like `/:company/:app/flow/:actionId` match for ANY company/app combination,
including `placebo_fabtech/workflow_fab`. A workflow_fab user who somehow lands on
`/placebo_fabtech/workflow_fab/flow/1` will see BrandPicker loading audio recordings — wrong data,
confusing UX, no error.

This is not breaking today (no links point there), but becomes a real risk as more apps share
the platform.

**Fix (long-term)**: Prefix audio_intelligence-only routes with an app guard component:
```tsx
// AudioIntelligenceGuard: renders 404 if appSlug !== 'audio_intelligence'
<Route path="/:company/:app/flow/:actionId" element={
  <ProtectedRoute><AudioIntelligenceGuard><FlowProvider><BrandPicker /></FlowProvider></AudioIntelligenceGuard></ProtectedRoute>
} />
```

**Acceptable short-term**: Leave as-is. Routes return empty data for wrong-app users, not a crash.
Document that flow routes are AI-only.

---

## MEDIUM

---

### Issue-8: AppShell layout detection is path-string-based, not route-aware

**File**: `src/components/AppShell.tsx`

**Problem**:
```typescript
const isAdminRoute = location.pathname.includes('/admin/');
const onLoginPage = location.pathname.includes('/login') || ...
```
String matching on the full path is fragile:
- A page called `/placebo_fabtech/workflow_fab/admin-tools` (hypothetical) would be misidentified as admin
- A future rename of `/admin/` breaks detection silently

**Fix (medium-term)**: Pass layout intent through React context or route meta, not path sniffing.
Short-term acceptable as long as URL conventions are followed: all admin routes include `/admin/`.

---

### Issue-9: Sidebar CSS custom properties are undefined globally

**Files**: `src/layouts/AdminLayout.tsx`, `src/layouts/UserLayout.tsx`, `src/components/Sidebar.tsx`

**Problem**: Sidebar renders with CSS variables like `var(--sidebar-bg)`, `var(--sidebar-text)`,
`var(--color-brand-500)`, etc. None of these are defined in `src/index.css` or any global
stylesheet. The sidebar falls back to browser defaults — typically transparent background and
inherited text color. This may render correctly by coincidence (MUI sets `background.paper` on
the container) but is semantically wrong and will break if the parent background changes.

**Variables that need definitions** (in `src/index.css` under `:root {}`):
```css
:root {
  --sidebar-bg: #1a2744;
  --sidebar-text: #e2e8f0;
  --sidebar-text-muted: #94a3b8;
  --sidebar-border: rgba(255,255,255,0.08);
  --sidebar-hover-bg: rgba(255,255,255,0.06);
  --sidebar-active-bg: rgba(255,255,255,0.12);
  --sidebar-active-border: #3b82f6;
  --sidebar-active-text: #ffffff;
  --color-brand-500: #3b82f6;
  --color-brand-700: #1d4ed8;
}
```

---

### Issue-10: Two HTTP clients coexist — axios (legacy) and fetch (preferred)

**Files**: `src/utils/axiosConfig.ts`, `src/api/client.ts`, `src/contexts/AuthContext.tsx`,
`src/pages/user/Dashboard.tsx`

**Problem**: 
- `api/client.ts` exports `apiPost`, `apiGet`, etc. (fetch-based) — used in new code
- `utils/axiosConfig.ts` exports an axios instance — used in AuthContext and user/Dashboard.tsx
- Both work but maintain two separate request pipelines, two 401-handling strategies, two
  base-URL resolution mechanisms

**Impact**: New app pages using `apiPost` won't benefit from the axios 401 interceptor; they
handle errors differently. Debugging HTTP issues requires checking both pipelines.

**Fix**: Migrate AuthContext and user/Dashboard.tsx to use `apiPost`/`apiGet`. Once no callers
remain on axios, delete `utils/axiosConfig.ts`. This is a 2-3 day migration.

**Priority for new app development**: All new pages (workflow_fab EU-8, EU-9) MUST use
`apiPost`/`apiGet` — do NOT introduce new axios usage.

---

### Issue-11: No Error Boundaries — any page crash kills the whole app

**File**: `src/App.tsx:106-309`

**Problem**: The `<Suspense>` wrapper handles loading states but not runtime errors. If any page
component throws during render (e.g., trying to access `null.name` from an API response),
React unmounts the entire tree and the user sees a blank white screen.

**Fix**: Wrap each route group in an `<ErrorBoundary>` component:
```tsx
class ErrorBoundary extends React.Component<...> {
  // renders fallback UI with "Something went wrong" + retry button
}

// Usage:
<Route path="/:company/:app/admin/dashboard" element={
  <ProtectedRoute>
    <ErrorBoundary>
      <AdminLayout />
    </ErrorBoundary>
  </ProtectedRoute>
}>
```

---

## LOW

---

### Issue-12: No TypeScript types for API responses — `any` throughout

**Files**: Most page components

**Problem**: API calls return `any` or use type assertions. TypeScript's safety nets are bypassed.
A backend field rename breaks the UI silently at runtime.

**Fix**: Define per-resource types in `src/types/` and use generics:
```typescript
// types/workflowFab.ts
export interface WfClient {
  id: number;
  company_id: number;
  name: string;
  contact_person?: string;
  contact_email?: string;
  ...
}

// Usage:
const result = await apiPost<{ data: WfClient[] }>('/api/query/v1/base_resource', { resource: 'wf_clients' });
```

---

### Issue-13: No per-app theming

**File**: `src/theme.ts`, `src/App.tsx`

**Problem**: All apps share one MUI theme (blue/teal palette). A future customer may want their
app to match their brand colors.

**Fix (when needed)**: Move `ThemeProvider` inside an app-aware component that selects theme
based on `appSlug`:
```typescript
const themes = {
  audio_intelligence: audioTheme,
  workflow_fab: workflowTheme,
};
const theme = themes[appSlug] ?? defaultTheme;
```

---

### Issue-14: FlowProvider is coupled to audio_intelligence but wraps global routes

**File**: `src/App.tsx:164-210`

**Problem**: `<FlowProvider>` is used to wrap the audio_intelligence flow route pages. It's
harmless to workflow_fab pages (they never use FlowContext), but it's misleading — FlowContext
implies a multi-step flow that is audio_intelligence-specific.

**Fix (low priority)**: Once audio_intelligence routes are clearly separated (see Issue-7),
FlowProvider wraps naturally within those routes only.

---

## Summary Table

| # | Issue | Severity | Files Affected | Effort |
|---|-------|----------|----------------|--------|
| 1 | Admin nav ignores appSlug | CRITICAL | adminNav.tsx | 1h |
| 2 | User Dashboard is AI-specific | CRITICAL | pages/user/Dashboard.tsx | 2h |
| 3 | workflow_fab routes not in App.tsx | CRITICAL | App.tsx | 2h (EU-10) |
| 4 | AdminLayout uses window.location | HIGH | layouts/AdminLayout.tsx | 30m |
| 5 | New admin pages can't nest in Outlet | HIGH | App.tsx | 1h |
| 6 | Dashboard route serves AI to all apps | HIGH | App.tsx | 1h |
| 7 | Flow routes bleed across all apps | HIGH | App.tsx | 2h |
| 8 | AppShell uses path string matching | MEDIUM | AppShell.tsx | 2h |
| 9 | Sidebar CSS vars undefined | MEDIUM | index.css | 30m |
| 10 | Dual HTTP clients (axios + fetch) | MEDIUM | many | 2 days |
| 11 | No Error Boundaries | MEDIUM | App.tsx | 3h |
| 12 | No TypeScript types for API | LOW | src/types/ + pages | ongoing |
| 13 | No per-app theming | LOW | theme.ts | 4h |
| 14 | FlowProvider scope too broad | LOW | App.tsx | 1h |

**Immediate action required before workflow_fab demo**: Issues 1, 2, 3, 4, 5.
