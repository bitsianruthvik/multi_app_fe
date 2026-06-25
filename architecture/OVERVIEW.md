# Frontend Architecture Overview

Last updated: 2026-05-19  
Stack: React 19 · React Router 7 · MUI 7 · TypeScript 5.9 · Vite 7

---

## Directory Map

```
multi_app_fe/src/
  App.tsx                     # Root: all route definitions + ProtectedRoute guard
  main.tsx                    # createRoot entry point
  theme.ts                    # MUI createTheme (global palette, component overrides)

  contexts/
    AuthContext.tsx            # Global auth state: user, JWT, companySlug, appSlug
    FlowContext.tsx            # audio_intelligence-specific: actionId, brandName, recordingId

  layouts/
    AdminLayout.tsx            # Sidebar shell for /admin/* routes — uses <Outlet />
    UserLayout.tsx             # Sidebar shell for all other authenticated routes — wraps {children}

  components/
    AppShell.tsx               # Routing decision: which layout wraps this path?
    Sidebar.tsx                # Collapsible sidebar with NavLink items + avatar/footer slots
    FlowBreadcrumb.tsx         # audio_intelligence flow breadcrumb
    AudioRecorder.tsx          # Web Audio API recorder + upload widget
    TopNavigation.tsx          # Stub (returns null — replaced by Sidebar)

  config/
    adminNav.tsx               # buildAdminNavItems(company, app) → NavItem[]
    userNav.tsx                # buildUserNavItems(company, app) → NavItem[]

  api/
    client.ts                  # fetch-based helpers: apiGet, apiPost, apiPut, apiDelete
    index.ts                   # re-exports from client.ts

  api-builder/
    index.ts                   # High-level query() and mutate() over the generic query API
    client.ts                  # Internal fetch wrapper used by api-builder

  utils/
    axiosConfig.ts             # Legacy axios instance + buildFullApiUrl(), buildPublicApiUrl()
    analysisFormatter.ts       # Formats raw AI analysis JSON into structured report

  hooks/
    usePermission.ts           # usePermission(featureTag) → boolean
    index.ts                   # re-exports

  types/
    flow.ts                    # Action, Brand types (audio_intelligence)

  pages/
    auth/
      CompanyLanding.tsx       # /:company — glass auth hub (login / register / reset tabs)
      AppSelector.tsx          # /:company/apps — app picker after auth
      Login.tsx                # /:company/:app/login
      Register.tsx             # /:company/:app/register
      ForgotPassword.tsx       # /:company/:app/forgot-password
      SelectCompany.tsx        # /select-company — legacy company/app picker

    admin/
      Dashboard.tsx            # /:company/:app/admin/dashboard (index) — KPIs + queue status
      AddUser.tsx              # …/add-user
      AddFeature.tsx           # …/add-feature
      AddCapability.tsx        # …/capabilities-add
      RoleMapping.tsx          # …/roles-mapping
      CompanyDocuments.tsx     # …/company-documents
      ErrorLogs.tsx            # …/error-logs
      Actions.tsx              # …/actions  ← audio_intelligence specific
      AdminRegister.tsx        # /:company/:app/admin/register

    user/
      Dashboard.tsx            # /:company/:app/dashboard — fetches "actions" (audio_intelligence)
      BrandPicker.tsx          # /:company/:app/flow/:actionId
      RecordingsInContext.tsx  # /:company/:app/flow/:actionId/:brandName
      AudioReview.tsx          # …/recording/:recordingId
      AnalysisDetail.tsx       # …/recording/:recordingId/analysis
      MyProgress.tsx           # …/flow/:actionId/performance
```

---

## Routing Architecture

### URL Structure

Every authenticated route is namespaced under `/:company/:app`:

```
Public:
  /:company                               CompanyLanding (login/register/reset tabs)
  /:company/apps                          AppSelector
  /:company/:app/login
  /:company/:app/register
  /:company/:app/forgot-password
  /select-company                         Legacy picker

Admin (nested, uses AdminLayout <Outlet />):
  /:company/:app/admin/dashboard          Admin dashboard index
  /:company/:app/admin/dashboard/add-user
  /:company/:app/admin/dashboard/add-feature
  /:company/:app/admin/dashboard/capabilities-add
  /:company/:app/admin/dashboard/roles-mapping
  /:company/:app/admin/dashboard/company-documents
  /:company/:app/admin/dashboard/error-logs
  /:company/:app/admin/dashboard/actions

User (wrapped by AppShell → UserLayout):
  /:company/:app/dashboard                UserDashboard (audio_intelligence: actions list)
  /:company/:app/:role/dashboard          Same — role-specific variant
  /:company/:app/flow/:actionId           BrandPicker
  /:company/:app/flow/:actionId/:brand    RecordingsInContext
  /:company/:app/flow/:actionId/:brand/recording/:id   AudioReview
  /:company/:app/flow/:actionId/:brand/recording/:id/analysis  AnalysisDetail
  /:company/:app/flow/:actionId/performance              MyProgress
```

### How Layout Is Chosen — AppShell

`AppShell.tsx` wraps the entire `<Routes>` tree and selects the layout per path:

```
path includes '/login', '/register', '/forgot-password'  → raw (glass page)
path matches /:company  (single segment)                 → raw (CompanyLanding)
path matches /:company/apps                              → raw (AppSelector)
path is /select-company                                  → raw
path includes '/admin/'                                  → raw  ← AdminLayout self-manages
everything else                                          → <UserLayout>{children}</UserLayout>
```

AdminLayout is self-contained: it renders `<Outlet />` for nested content, so AppShell doesn't
need to inject it. AppShell only adds UserLayout as a fallback for non-admin authenticated routes.

### Route Nesting Pattern — IMPORTANT

Admin routes today use React Router's nested route model:

```tsx
<Route path="/:company/:app/admin/dashboard" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
  <Route index element={<Dashboard />} />
  <Route path="add-user" element={<AddUser />} />
  ...
</Route>
```

AdminLayout renders `<Outlet />` for child content. This means AdminLayout is mounted ONCE and
child pages swap out — the sidebar does not remount on navigation. This is the correct pattern.

New app pages must follow the same nesting. See MULTI_APP_ISSUES.md §Issue-7.

---

## Authentication Flow

### State (AuthContext.tsx)

```typescript
{
  isAuthenticated: boolean
  isInitialized: boolean          // false until token verification completes
  user: {
    id, name, email, role,
    company, companyId,
    team, teamId,
    role_id, uiPermissions: any[]
  }
  companySlug: string | null
  appSlug: string | null
}
```

### Token lifecycle

1. Login (`POST /api/{company}/{app}/login`) → receives JWT
2. JWT stored in `localStorage.token`; slugs stored in `localStorage.companySlug` / `appSlug`
3. On app mount, AuthProvider reads localStorage and calls `/api/{company}/{app}/verify` (or `/api/{company}/auth/verify`)
4. If verify fails → clears localStorage → user sees login
5. `Authorization: Bearer <token>` sent on every API request

### Slug propagation

Slugs flow from three sources (in priority order):
1. URL params (most reliable — extracted from `useLocation().pathname` or `useParams()`)
2. AuthContext (`companySlug`, `appSlug`) — set at login, persisted in localStorage
3. localStorage directly — used during init before context is ready

---

## API Client Architecture

### Two coexisting HTTP clients (known issue — see MULTI_APP_ISSUES.md §Issue-10)

#### 1. fetch-based — preferred for new code
```typescript
// api/client.ts
import { apiGet, apiPost, apiPut, apiDelete } from '../api';

// Usage:
const data = await apiPost('/api/query/v1/base_resource', { resource: 'wf_clients', ... });
```
- Reads `VITE_API_HOST` env var for base URL
- Attaches JWT from localStorage
- 30s default timeout
- Returns parsed JSON or throws

#### 2. axios-based — legacy, do not use for new code
```typescript
// utils/axiosConfig.ts
import api, { buildFullApiUrl } from '../utils/axiosConfig';

// Usage:
const resp = await api.post(buildFullApiUrl('/login'), { email, password });
```
- Auto-extracts `company`/`app` from `window.location.pathname`
- Intercepts 401s and redirects to login
- Used in: AuthContext, user/Dashboard.tsx

#### 3. api-builder — for generic query API calls
```typescript
// api-builder/index.ts
import { query } from '../api-builder';

const result = await query({
  resource: 'wf_workflow_instances',
  fields: ['id', 'piece_mark', 'status'],
  filters: { assigned_employee_id: userId },
  sort: [{ field: 'scheduled_start', dir: 'ASC' }],
});
```
- Thin wrapper over `apiPost('/api/query/v1/base_resource', ...)`
- Handles cursor pagination and aggregates

### Generic Query API call shape

All CRUD goes through one endpoint: `POST /api/query/v1/base_resource`

```json
{
  "operation": "query",
  "resource": "wf_clients",
  "fields": ["id", "name", "contact_person"],
  "filters": { "company_id": 5 },
  "orderBy": [{ "field": "name", "direction": "ASC" }]
}
```

`company_id` is injected server-side from the JWT — never send it from the frontend.

---

## Nav System

### Admin nav — `config/adminNav.tsx`

`buildAdminNavItems(companySlug, appSlug)` is called by AdminLayout on every render.
Currently returns the same 8 items regardless of `appSlug`. The 6 platform management items
(Overview, Team Members, Feature Catalog, Permissions, Role Mapping, Documents, Error Logs)
are generic and appear for every app. The "Actions" item is audio_intelligence-specific.

For new apps, add a conditional block:

```typescript
export function buildAdminNavItems(companySlug: string, appSlug: string): NavItem[] {
  const base = `/${companySlug}/${appSlug}/admin/dashboard`;
  const platformItems: NavItem[] = [ ...six generic items... ];

  if (appSlug === 'workflow_fab') {
    return [
      ...platformItems,
      { label: 'Clients', to: `/${companySlug}/${appSlug}/admin/clients`, ... },
      // ...
    ];
  }

  // audio_intelligence default
  return [
    ...platformItems,
    { label: 'Actions', icon: <CategoryIcon />, to: `${base}/actions` },
  ];
}
```

### User nav — `config/userNav.tsx`

`buildUserNavItems(company, app)` is called by UserLayout. Currently returns a single "Home"
item pointing to `/{company}/{app}/dashboard`. Extend with `if (app === '...') { return [...] }`.

---

## Permission Model

Permissions are stored in `user.uiPermissions` (array of strings or objects with `feature_tag`).

```typescript
// Check a single permission
const canAccess = usePermission('admin_dashboard');

// Check any of a set
const canDoEither = useHasAnyPermission(['feature_a', 'feature_b']);
```

Sidebar items can include `permission?: string` — items whose permission the user lacks are
filtered out automatically by Sidebar.tsx.

---

## CSS / Theming

### MUI Theme (`theme.ts`)

```
primary:   #1d5fa8 (blue)
secondary: #0891b2 (teal)
error:     #dc2626
success:   #059669
Font:      Inter (via CSS import)
Radius:    10px default
```

### Sidebar CSS Custom Properties

The sidebar uses CSS variables for theming. These must be defined somewhere global
(currently they are NOT defined — see MULTI_APP_ISSUES.md §Issue-9):

```css
--sidebar-bg
--sidebar-text
--sidebar-text-muted
--sidebar-border
--sidebar-hover-bg
--sidebar-active-bg
--sidebar-active-border
--sidebar-active-text
--color-brand-500
--color-brand-700
```

---

## Adding a New App — Checklist

1. **Backend**: Create `apps/<slug>/` with `app.js`, `models/init.sql`, `resourceDef.json`
2. **DB**: Run `init.sql`; run seed script; run `fix-passwords.js`
3. **Admin nav**: Add `if (appSlug === '<slug>')` branch in `config/adminNav.tsx`
4. **User nav**: Add `if (app === '<slug>')` branch in `config/userNav.tsx`
5. **Pages**: Create `pages/admin/<slug>/` and `pages/user/<slug>/` components
6. **Routes**: Add lazy imports + `<Route>` entries in `App.tsx`
   - Admin pages: nest under a shared `<Route path="/:company/:app/admin">` with `<AdminLayout>`
   - User pages: flat routes — AppShell adds UserLayout automatically
7. **User dashboard**: Add app-conditional rendering in `pages/user/Dashboard.tsx` OR create a
   per-app dashboard page and add it as the index route
