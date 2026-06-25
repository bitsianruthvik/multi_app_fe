# Frontend + Backend Restructuring Plan — Multi-App Platform
Generated: 2026-05-19

## Decisions Locked (Wave 0)

| # | Decision | Answer |
|---|---|---|
| D1 | Per-app role model | Option B: new `app_user_access` table. `users.role_id` stays as legacy fallback. |
| D2 | B2 response shape | `{ id, name, slug, userRoleId, uiPermissions: string[] }` per app |
| D3 | uiPermissions scope | Per-app. Derived from `app_user_access.role_id → role_capability(app_id) → features` |
| D4 | HTTP client for new code | fetch-based `apiPost`/`apiGet`. No new axios usage anywhere. |
| D5 | app_user_access seed rule | Every existing user gets one row per app in their company, role_id = their current `users.role_id` |
| D6 | isAdminRole() predicate | Centralised function in `src/core/utils/roles.ts`. Checks lowercased role name includes 'admin'. |
| D7 | Platform admin location | Stays at `/:company/:app/admin` for Phase 1. Company-wide admin panel deferred. |
| D8 | apps.is_public schema drift | Add `is_public TINYINT(1) DEFAULT 1` to `core-init.sql` to match production. |
| D9 | CrudPage timing | Build first workflow_fab page by hand. Extract CrudPage from duplication. Not Wave 1. |
| D10 | App registration contract | Each app exports single `src/apps/<slug>/index.ts` with `{ slug, adminNav, userNav, routes, Dashboard }` |

---

## Wave 0 — DB Decisions + Schema Fixes (no behaviour change)
**Run before any code changes. Verifiable by inspection.**

### DB-0a: Fix `core-init.sql` schema drift
`apps.is_public` exists in production but is missing from `core-init.sql` and the DB dump.
Fresh-DB rebuilds silently break `publicController.getCompanyApps`.

**Action**: Edit `multi_app_be/models/core-init.sql` — add to the `apps` CREATE TABLE:
```sql
is_public TINYINT(1) NOT NULL DEFAULT 1,
```
And add to `role_capability` CREATE TABLE (if not yet present):
```sql
app_id INT NULL,
KEY idx_rc_app (app_id),
CONSTRAINT fk_rc_app FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
```
And add the `app_user_access` table (see DB-1a).

**Gate**: A fresh `SOURCE core-init.sql` completes without error.

---

## Wave 1 — DB: Additive DDL (safe, no downtime, no data changes)
**Run on the live DB. All changes are additive. No existing rows affected.**

### DB-1a: Create `app_user_access` table
File: `multi_app_be/migrations/core/004_app_user_access.sql`
```sql
CREATE TABLE IF NOT EXISTS app_user_access (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  app_id     INT NOT NULL,
  role_id    INT NOT NULL,
  company_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL DEFAULT NULL,
  UNIQUE KEY uq_user_app (user_id, app_id),
  KEY idx_aua_app     (app_id),
  KEY idx_aua_company (company_id),
  KEY idx_aua_role    (role_id),
  CONSTRAINT fk_aua_user    FOREIGN KEY (user_id)    REFERENCES users(id)     ON DELETE CASCADE,
  CONSTRAINT fk_aua_app     FOREIGN KEY (app_id)     REFERENCES apps(id)      ON DELETE CASCADE,
  CONSTRAINT fk_aua_role    FOREIGN KEY (role_id)    REFERENCES roles(id)     ON DELETE CASCADE,
  CONSTRAINT fk_aua_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
**Risk**: None — new table, no existing data touched.

### DB-1b: Add `app_id` to `role_capability`
File: `multi_app_be/migrations/core/005_role_capability_app_id.sql`
```sql
-- Guard: MySQL 8.0 has no ADD COLUMN IF NOT EXISTS
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'role_capability'
    AND COLUMN_NAME  = 'app_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE role_capability ADD COLUMN app_id INT NULL AFTER company_id, ADD KEY idx_rc_app (app_id), ADD CONSTRAINT fk_rc_app FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE',
  'SELECT ''app_id column already exists, skipping'' AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
```
`NULL app_id` = applies to all apps in the company. Existing rows unchanged — fully backward compatible.

### DB-1c: Ensure `apps.is_public` exists in production
File: `multi_app_be/migrations/core/006_apps_is_public.sql`
```sql
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'apps'
    AND COLUMN_NAME  = 'is_public'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE apps ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 1 AFTER slug, ADD KEY idx_apps_public (is_public)',
  'SELECT ''is_public already exists'' AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
```

### DB-1d: Create workflow_fab tables
File: `multi_app_be/apps/workflow_fab/models/init.sql`
Full DDL as specified in PLAN.md (wf_clients, wf_end_clients, wf_projects, wf_workflow_types,
wf_workflow_templates, wf_workflow_instances). Plus additional indexes:
```sql
ALTER TABLE wf_workflow_instances
  ADD KEY idx_wfwi_status   (status),
  ADD KEY idx_wfwi_priority (priority);
ALTER TABLE wf_projects
  ADD KEY idx_wfp_status (status);
```

### DB-1e: Update `resourceDef.json` and FE `manifest.json`
- Add `app_user_access` resource to `multi_app_be/resourceDef.json`
- Add `is_public` field to the `apps` resource entry
- Add all 6 `wf_*` resources to `multi_app_be/apps/workflow_fab/resourceDef.json` (create file)
- Add corresponding entries to `multi_app_fe/src/api-builder/manifest.json` (temporary, until B4 endpoint exists)

**Wave 1 DB Gate**:
```sql
SHOW TABLES LIKE 'app_user_access';          -- must return 1 row
SHOW COLUMNS FROM role_capability LIKE 'app_id';   -- must return 1 row
SHOW COLUMNS FROM apps LIKE 'is_public';     -- must return 1 row
SHOW TABLES LIKE 'wf_%';                     -- must return 6 rows
```

---

## Wave 1a — FE: Folder Restructure (single dedicated agent, no parallel)
**Must complete and pass build gate before anything else in Wave 1b starts.**

### F1: Complete folder restructure + path aliases

**New structure**:
```
src/
  apps/
    audio_intelligence/
      contexts/
        FlowContext.tsx         ← MOVE from src/contexts/
      pages/
        admin/
          Dashboard.tsx         ← MOVE from src/pages/admin/
          Actions.tsx           ← MOVE from src/pages/admin/
          AddUser.tsx           ← MOVE (shared — see note below)
          AddFeature.tsx        ← MOVE
          AddCapability.tsx     ← MOVE
          RoleMapping.tsx       ← MOVE
          ErrorLogs.tsx         ← MOVE
          CompanyDocuments.tsx  ← MOVE
          AdminRegister.tsx     ← MOVE
        user/
          BrandPicker.tsx       ← MOVE from src/pages/user/
          RecordingsInContext.tsx ← MOVE
          AudioReview.tsx       ← MOVE
          AnalysisDetail.tsx    ← MOVE
          MyProgress.tsx        ← MOVE
          Dashboard.tsx         ← MOVE (audio_intelligence's action-picker dashboard)
      index.ts                  ← NEW: app registration contract
    workflow_fab/
      pages/
        admin/                  ← NEW (empty for now — pages built in Wave 2)
        user/                   ← NEW (empty for now)
      index.ts                  ← NEW

  core/
    layouts/
      AdminLayout.tsx           ← MOVE from src/layouts/
      UserLayout.tsx            ← MOVE
    components/
      AppShell.tsx              ← MOVE from src/components/
      Sidebar.tsx               ← MOVE
      FlowBreadcrumb.tsx        ← MOVE to apps/audio_intelligence/ (AI-specific)
      AudioRecorder.tsx         ← MOVE to apps/audio_intelligence/components/
      TopNavigation.tsx         ← DELETE (returns null, dead code)
    contexts/
      AuthContext.tsx            ← MOVE from src/contexts/ (NOT FlowContext)
    hooks/
      usePermission.ts          ← MOVE from src/hooks/
      index.ts                  ← MOVE
    utils/
      roles.ts                  ← NEW: isAdminRole() predicate
      axiosConfig.ts            ← MOVE from src/utils/ (legacy, keep for now)
      analysisFormatter.ts      ← MOVE to apps/audio_intelligence/utils/
    api/
      client.ts                 ← MOVE from src/api/
      index.ts                  ← MOVE
    api-builder/
      index.ts                  ← MOVE from src/api-builder/
      registry.ts               ← MOVE
      manifest.json             ← MOVE
      client.ts                 ← MOVE
      validate.ts               ← MOVE

  pages/
    auth/                       ← STAYS (not app-specific)
      CompanyLanding.tsx
      AppSelector.tsx
      Login.tsx
      Register.tsx
      ForgotPassword.tsx
      SelectCompany.tsx

  shared/
    components/                 ← NEW (empty for Wave 1a; CrudPage added in Wave 2)
```

**NOTE on "platform" admin pages**: AddUser, AddFeature, AddCapability, RoleMapping, ErrorLogs,
CompanyDocuments manage company-wide platform concerns, not audio_intelligence specifically.
For Wave 1a, move them under `apps/audio_intelligence/pages/admin/` to keep things simple.
Phase 2 decision: promote to a company-level admin if needed.

**Path aliases** — add to `vite.config.ts` and `tsconfig.json`:
```typescript
// vite.config.ts resolve.alias:
'@core':   '/src/core',
'@apps':   '/src/apps',
'@shared': '/src/shared',
'@pages':  '/src/pages',
```
```json
// tsconfig.json compilerOptions.paths:
"@core/*":   ["src/core/*"],
"@apps/*":   ["src/apps/*"],
"@shared/*": ["src/shared/*"],
"@pages/*":  ["src/pages/*"]
```

**App registration contract** — `src/apps/audio_intelligence/index.ts`:
```typescript
export const audioIntelligenceApp = {
  slug: 'audio_intelligence',
  adminNav: buildAdminNavItems,   // function(company, app) → NavItem[]
  userNav:  buildUserNavItems,    // function(company, app) → NavItem[]
  routes:   audioRoutes,          // RouteObject[]
  Dashboard: AudioDashboard,      // React component
};
```

**`src/apps/index.ts`** (app registry):
```typescript
import { audioIntelligenceApp } from './audio_intelligence';
import { workflowFabApp }       from './workflow_fab';

export const appRegistry = [audioIntelligenceApp, workflowFabApp];
export function getApp(slug: string) {
  return appRegistry.find(a => a.slug === slug);
}
```

**Agent instructions**:
1. Create full new directory tree
2. Move every file to its new location
3. Update every import in every file to use new paths (use path aliases where possible)
4. Delete `TopNavigation.tsx` (returns null — confirmed dead)
5. Update `tsconfig.json` and `vite.config.ts`
6. Run `npx tsc --noEmit` and fix all errors before declaring done

**Wave 1a Gate** (must all pass before 1b starts):
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm run lint` — zero new errors
- [ ] `npm run build` — succeeds
- [ ] Dev server starts, `/placebo_fabtech/audio_intelligence/login` loads
- [ ] Login → AppSelector → click audio_intelligence → admin dashboard loads with correct nav
- [ ] No `window.location` references remain outside of AppShell (grep check)

---

## Wave 1b — FE + BE: Parallel Additive Fixes
**All independent. Run after Wave 1a gate passes. Can use parallel agents.**

### F10: Fix AdminLayout slug extraction
**File**: `src/core/layouts/AdminLayout.tsx`

Replace:
```typescript
const parts = window.location.pathname.split('/').filter(Boolean);
const companySlug = parts[0] || 'company';
const appSlug = parts[1] || 'app';
```
With:
```typescript
import { useLocation } from 'react-router-dom';
const location = useLocation();
const parts = location.pathname.split('/').filter(Boolean);
const companySlug = parts[0] || '';
const appSlug = parts[1] || '';
```

### F10b: Fix AppShell layout detection
**File**: `src/core/components/AppShell.tsx`

Replace path string-matching with `useMatch`:
```typescript
import { useLocation, useMatch } from 'react-router-dom';

const isAdminRoute  = !!useMatch('/:company/:app/admin/*');
const isAdminDash   = !!useMatch('/:company/:app/admin/dashboard/*');
const onLoginPage   = !!useMatch('/:company/:app/login') ||
                      !!useMatch('/:company/:app/register') ||
                      !!useMatch('/:company/:app/forgot-password');
const onCompanyLanding = !!useMatch({ path: '/:company', end: true });
const onAppSelector    = !!useMatch('/:company/apps');
const onSelectCompany  = !!useMatch('/select-company');
```

### F12: Define CSS custom properties
**File**: `src/index.css`

Add under `:root {}`:
```css
:root {
  --sidebar-bg:           #1a2744;
  --sidebar-text:         #e2e8f0;
  --sidebar-text-muted:   #94a3b8;
  --sidebar-border:       rgba(255, 255, 255, 0.08);
  --sidebar-hover-bg:     rgba(255, 255, 255, 0.06);
  --sidebar-active-bg:    rgba(255, 255, 255, 0.12);
  --sidebar-active-border:#3b82f6;
  --sidebar-active-text:  #ffffff;
  --color-brand-500:      #3b82f6;
  --color-brand-700:      #1d4ed8;
}
/* Per-app overrides (add app class to AppShell root div) */
.app-workflow_fab {
  --color-brand-500: #059669;
  --color-brand-700: #047857;
}
```

### F13: Add Error Boundaries
**File**: `src/core/components/ErrorBoundary.tsx` (new)

Two boundaries:
1. **Shell-level**: wraps AppShell — preserves nav if page crashes
2. **Page-level**: wraps `<Outlet />` inside AdminLayout and the children in UserLayout — isolates crashes to the content area

```typescript
// Usage in AdminLayout.tsx:
<Box component="main" ...>
  <ErrorBoundary level="page">
    <Outlet />
  </ErrorBoundary>
</Box>
```

### B4: Backend schema endpoint
**File**: `multi_app_be/core/routes/schemaRoutes.js` (new)

`GET /api/:companySlug/schema/resources` — authenticated (requires JWT).

Logic:
1. Load `resourceDef.json` (core resources)
2. For each app the user has access to (via `app_user_access`), load `apps/<slug>/resourceDef.json`
3. Merge all resources
4. Transform to frontend manifest format:
   - `name`: resource key
   - `endpoint`: `/api/query/v1/base_resource`
   - `fields`: array of keys from `fields` object
   - `writeFields`: from `writeFields` array
5. Return `{ schemaVersion, generatedAt, resources: [...] }` with `ETag` header
6. Set `Cache-Control: private, must-revalidate` and `Vary: Authorization`

**Test**: `curl -H "Authorization: Bearer <token>" http://localhost:4000/api/placebo_fabtech/schema/resources`
Expected: JSON with all core resources + workflow_fab's 6 wf_* resources.

### F-roles: Create `isAdminRole()` utility
**File**: `src/core/utils/roles.ts` (new)
```typescript
const ADMIN_ROLE_NAMES = ['admin', 'administrator', 'superadmin', 'owner'];

export function isAdminRole(roleName: string | null | undefined): boolean {
  if (!roleName) return false;
  return ADMIN_ROLE_NAMES.some(r => roleName.toLowerCase().includes(r));
}
```
Replace all `role.includes('admin')` usages across the codebase with this function.

**Wave 1b Gate**:
- [ ] Sidebar renders with correct colours (inspect `--sidebar-bg` in DevTools — not transparent)
- [ ] Navigate fast between admin pages — no nav flash (AdminLayout useLocation fix)
- [ ] `GET /api/placebo_fabtech/schema/resources` returns 200 with correct resource list
- [ ] Unauthenticated request to schema endpoint returns 401
- [ ] ErrorBoundary: manually throw in one page — nav stays visible, error UI shows

---

## Wave 1c — FE: Wire Manifest Refresh (after B4 is live)
**Single step. Depends on B4 returning 200.**

### F2: Call `initRegistryRefresh` post-login
**File**: `src/core/contexts/AuthContext.tsx`

After successful login AND after successful token verify on app load:
```typescript
import { initRegistryRefresh } from '@core/api-builder/registry';

// Inside login() and inside the verify useEffect, after setting auth state:
const company = companySlug; // already available in context
initRegistryRefresh({
  url: `${API_HOST}/api/${company}/schema/resources`,
  onUpdated: (m) => console.debug('[api-builder] manifest refreshed', m.schemaVersion),
});
```
Do NOT await — fire and forget. The first login will use the baked manifest; subsequent queries
use the refreshed one. Future: if manifest fetch fails, baked manifest is the fallback (already handled).

**Wave 1c Gate**:
- [ ] Login, open Network tab, observe `GET /api/{company}/schema/resources` fires within 1s
- [ ] `localStorage.getItem('api_builder_manifest')` in console returns JSON with wf_* resources

---

## Wave 2 — FE: App Routing, Nav, and workflow_fab Pages
**Parallel within the wave. All depend on Wave 1a completing.**

### F5+F6: Nav dispatch per app
**Files**: `src/apps/audio_intelligence/index.ts`, `src/apps/workflow_fab/index.ts`,
`src/core/layouts/AdminLayout.tsx`, `src/core/layouts/UserLayout.tsx`

Pattern: Each app's `index.ts` exports `buildAdminNav(company, app)` and `buildUserNav(company, app)`.
Layouts call `getApp(appSlug)?.adminNav(company, app) ?? []`.

**Audio_intelligence admin nav** (7 items):
- Platform items: Admin Overview, Team Members, Feature Catalog, Permissions, Role Mapping, Documents, Error Logs
- App item: Actions

**Workflow_fab admin nav** (13 items):
- Platform items (same 7)
- App items: Clients, End Clients, Projects, Workflow Types, Workflow Templates, Work Items

**User nav per app**:
- audio_intelligence: Home
- workflow_fab: Home, My Work Board

### F7: User Dashboard dispatcher
**File**: `src/pages/user/Dashboard.tsx` — becomes a pure dispatcher

```typescript
import { getApp } from '@apps/index';
import { useLocation } from 'react-router-dom';

export default function UserDashboard() {
  const parts = useLocation().pathname.split('/').filter(Boolean);
  const appSlug = parts[1];
  const App = getApp(appSlug);
  if (!App?.Dashboard) return <GenericDashboard />;  // fallback, not a crash
  return <App.Dashboard />;
}
```

`GenericDashboard` shows: "App not configured. Contact your administrator."

### F8+F9: Per-app route registries + correct nesting

**`src/apps/audio_intelligence/routes.tsx`**:
```tsx
// Exports RouteObject[] for all audio_intelligence routes
// Includes: flow routes, user dashboard, admin pages
// FlowProvider wraps only these routes — not global
export const audioRoutes: RouteObject[] = [
  {
    path: '/:company/audio_intelligence/flow/:actionId',
    element: <ProtectedRoute><FlowProvider><BrandPicker /></FlowProvider></ProtectedRoute>
  },
  // ... all /flow/* routes
];
```

**`src/apps/workflow_fab/routes.tsx`**:
```tsx
export const workflowFabRoutes: RouteObject[] = [
  // Admin pages — nested under shared AdminLayout:
  {
    path: '/:company/workflow_fab/admin',
    element: <ProtectedRoute><AdminLayout /></ProtectedRoute>,
    children: [
      { path: 'clients',            element: <WfClientsPage /> },
      { path: 'end-clients',        element: <WfEndClientsPage /> },
      { path: 'projects',           element: <WfProjectsPage /> },
      { path: 'workflow-types',     element: <WfWorkflowTypesPage /> },
      { path: 'workflow-templates', element: <WfWorkflowTemplatesPage /> },
      { path: 'work-items',         element: <WfWorkItemsPage /> },
    ]
  },
  // User board:
  {
    path: '/:company/workflow_fab/user/board',
    element: <ProtectedRoute><WfBoardPage /></ProtectedRoute>
  }
];
```

**`src/App.tsx`** — slimmed down, imports from registry:
```tsx
import { appRegistry } from '@apps/index';

// Inside <Routes>:
{appRegistry.flatMap(app => app.routes)}
{/* Platform routes: admin dashboard shell, auth, select-company */}
```

**Important**: The existing `/:company/:app/admin/dashboard` nested route (platform shell with
AddUser, AddFeature, etc.) stays in App.tsx as a platform-level route, not in any app's routes.tsx.
It applies to all apps since it manages company-level entities.

### F-guard: `<RequireAppAccess>` component (new)
**File**: `src/core/components/RequireAppAccess.tsx`

Reads `appRoles` from AuthContext (added in Wave 3). In Wave 2, reads from the existing
`user.role` as a temporary pass-through (so it's wired but not enforced until Wave 3).

```typescript
export function RequireAppAccess({ appSlug, children }) {
  const { appRoles, user } = useAuth();
  // Wave 2: appRoles doesn't exist yet, allow through
  // Wave 3: check appRoles[appSlug] exists
  if (appRoles && !appRoles[appSlug]) {
    return <Navigate to={`/${companySlug}/apps`} replace />;
  }
  return <>{children}</>;
}
```

Wrap every app's route subtree with this.

### workflow_fab pages (built in dependency order)

**Step 1**: Build `WfClientsPage.tsx` by hand (no CrudPage abstraction yet).
Simple: fetch list → MUI Table → Add/Edit Dialog → soft delete.

**Step 2**: Build `WfWorkflowTypesPage.tsx` by hand (second page).

**Step 3**: Extract `<CrudPage>` from the duplication between the two hand-built pages.
**File**: `src/shared/components/CrudPage.tsx`
Props: `resource, columns, formFields, title, softDelete?`

**Step 4**: Build remaining 4 admin pages using `<CrudPage>`:
- `WfEndClientsPage.tsx` — includes client_id Select
- `WfProjectsPage.tsx` — includes client_id + status + dates
- `WfWorkflowTemplatesPage.tsx` — includes workflow_type_id Select
- `WfWorkItemsPage.tsx` — includes project, template, employee dropdowns + status + dates

**Step 5**: Build `WfBoardPage.tsx` (user board — see PLAN.md EU-9 for full spec).

**Wave 2 Gate**:
- [ ] `GET /:company/audio_intelligence/admin/dashboard` — nav shows AI nav items only
- [ ] `GET /:company/workflow_fab/admin/clients` — nav shows workflow_fab items only
- [ ] Navigate `/placebo_fabtech/workflow_fab/flow/1` — returns 404 (flow routes scoped to AI)
- [ ] workflow_fab Clients page: create, list, edit, soft-delete all work end-to-end
- [ ] workflow_fab Work Items page: instance list shows with correct status chips
- [ ] workflow_fab board page: loads and shows only logged-in user's instances
- [ ] audio_intelligence: all existing flows work unchanged
- [ ] Browser back button works correctly between admin pages
- [ ] `npm run build` clean

---

## Wave 3 — DB Data Migration + Auth & Access Control
**Strictly sequential. Test each step before starting the next. Highest blast radius.**

### DB-3a: Backfill `app_user_access`
**File**: `multi_app_be/migrations/core/007_backfill_app_user_access.sql`

```sql
-- STEP 1: Verify counts before running
SELECT
  (SELECT COUNT(*) FROM users    WHERE deleted_at IS NULL) AS users,
  (SELECT COUNT(*) FROM apps     WHERE deleted_at IS NULL) AS apps,
  (SELECT COUNT(*) FROM companies WHERE deleted_at IS NULL) AS companies;

-- STEP 2: Preview what will be inserted (run SELECT first, INSERT second)
SELECT u.id AS user_id, a.id AS app_id, u.role_id, u.company_id
FROM users u
JOIN apps a ON a.company_id = u.company_id AND a.deleted_at IS NULL
WHERE u.deleted_at IS NULL;

-- STEP 3: Insert (idempotent via ON DUPLICATE KEY)
INSERT INTO app_user_access (user_id, app_id, role_id, company_id)
SELECT u.id, a.id, u.role_id, u.company_id
FROM users u
JOIN apps a ON a.company_id = u.company_id AND a.deleted_at IS NULL
WHERE u.deleted_at IS NULL
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);

-- STEP 4: Verify
SELECT COUNT(*) AS total_rows FROM app_user_access WHERE deleted_at IS NULL;
-- Expected: users_per_company × apps_per_company for each company
-- Spot-check:
SELECT u.email, a.slug, r.name AS role
FROM app_user_access aua
JOIN users u ON u.id = aua.user_id
JOIN apps  a ON a.id = aua.app_id
JOIN roles r ON r.id = aua.role_id
LIMIT 20;
```

**Rollback**: `TRUNCATE TABLE app_user_access;` (safe — no foreign keys point TO this table).

**Gate**: Row count = expected cross-join count. Spot-check 3 known users.

---

### B2: Authenticated apps endpoint
**File**: `multi_app_be/core/routes/appsRoutes.js` (new or extend existing)

`GET /api/:companySlug/apps` — requires JWT.

Response shape (decided in D2):
```json
[
  {
    "id": 1,
    "name": "Audio Intelligence",
    "slug": "audio_intelligence",
    "userRoleId": 3,
    "uiPermissions": ["admin_dashboard", "view_recordings", "upload_audio"]
  }
]
```

Logic:
1. Get `company_id` from JWT
2. Query `app_user_access` for `user_id = req.user.id AND deleted_at IS NULL`
3. For each app row: resolve `uiPermissions` via `role_id → role_capability(WHERE app_id = app.id OR app_id IS NULL) → features_capability → features.feature_tag`
4. Return array

**Test**:
```bash
# User with 2 apps:
curl -H "Authorization: Bearer <token>" http://localhost:4000/api/placebo_fabtech/apps
# → array of 2 apps with correct userRoleId and uiPermissions

# User with 0 apps:
curl -H "Authorization: Bearer <other-token>" http://localhost:4000/api/placebo_fabtech/apps
# → []

# No token:
curl http://localhost:4000/api/placebo_fabtech/apps
# → 401
```

---

### B3: Login/verify response includes per-app roles
**File**: `multi_app_be/core/controllers/authController.js`

After user lookup, fetch `app_user_access` rows and build `appRoles`:
```javascript
const appAccess = await db.query(
  `SELECT aua.app_id, aua.role_id, a.slug,
          GROUP_CONCAT(f.feature_tag) AS permissions
   FROM app_user_access aua
   JOIN apps a ON a.id = aua.app_id
   LEFT JOIN role_capability rc ON rc.role_id = aua.role_id
     AND (rc.app_id = aua.app_id OR rc.app_id IS NULL)
     AND rc.deleted_at IS NULL
   LEFT JOIN features_capability fc ON fc.capability_id = rc.capability_id
   LEFT JOIN JSON_TABLE(fc.features_json, '$[*]' COLUMNS (fid INT PATH '$')) jt ON TRUE
   LEFT JOIN features f ON f.id = jt.fid AND f.deleted_at IS NULL
   WHERE aua.user_id = ? AND aua.deleted_at IS NULL
   GROUP BY aua.app_id`,
  [user.id]
);

const appRoles = {};
for (const row of appAccess) {
  appRoles[row.slug] = {
    roleId: row.role_id,
    uiPermissions: row.permissions ? row.permissions.split(',') : [],
  };
}
// Include in response: { token, user: { ...existing, appRoles } }
```

**CRITICAL**: Do NOT break existing JWT structure. Add `appRoles` to the response body but keep
the JWT payload unchanged for now. Frontend reads `appRoles` from the login response and stores
in AuthContext (not from JWT decoding). This avoids invalidating existing tokens.

---

### Update `User` type and all consumers

**File**: `src/core/contexts/AuthContext.tsx` and `src/core/types/auth.ts` (new)

```typescript
export interface AppRole {
  roleId: number;
  uiPermissions: string[];
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;          // legacy company-level role, kept for backward compat
  company: string;
  companyId: number;
  team: string;
  teamId: number;
  role_id: number;
  team_id: number;
  appRoles: Record<string, AppRole>;  // NEW: keyed by app slug
}
```

Update `login()` in AuthContext to store `appRoles` from response.
Update `verify()` to re-fetch appRoles (call B2 endpoint after verify succeeds).

Grep for all `user.uiPermissions` usages — replace with `useAppPermissions(appSlug)` hook (below).

---

### F3: AppSelector → authenticated endpoint

**File**: `src/pages/auth/AppSelector.tsx`

Replace:
```typescript
api.get(`${API_HOST}/api/public/companies/${companySlug}/apps`)
```
With:
```typescript
apiGet(`/api/${companySlug}/apps`)  // authenticated, uses JWT
```

AppSelector now receives `userRoleId` and `uiPermissions` per app. Store in AuthContext via
new `setAppRoles()` method.

**Empty state**: User with zero apps sees:
```
"Your admin hasn't given you access to any apps yet. Contact your administrator."
[Sign Out button]
```
Not a crash. Not a redirect loop.

---

### F4: App-level admin detection

**File**: `src/pages/auth/AppSelector.tsx` (handleAppSelect), `src/core/utils/roles.ts`

```typescript
const handleAppSelect = (app: AppWithAccess) => {
  selectApp(app.slug);
  // Use app-level role, not global user.role
  const appRole = user.appRoles?.[app.slug];
  const roleName = appRole
    ? roles.find(r => r.id === appRole.roleId)?.name ?? ''
    : user.role; // fallback for transition period
  const isAdmin = isAdminRole(roleName);
  navigate(
    isAdmin
      ? `/${companySlug}/${app.slug}/admin/dashboard`
      : `/${companySlug}/${app.slug}/dashboard`
  );
};
```

---

### `usePermission` per-app update

**File**: `src/core/hooks/usePermission.ts`

```typescript
import { useAuth } from '@core/contexts/AuthContext';
import { useLocation } from 'react-router-dom';

export function usePermission(featureTag: string): boolean {
  const { user } = useAuth();
  const parts = useLocation().pathname.split('/').filter(Boolean);
  const appSlug = parts[1];

  // Per-app permissions (Wave 3+)
  const appRole = user?.appRoles?.[appSlug];
  if (appRole) {
    return appRole.uiPermissions.includes(featureTag);
  }

  // Legacy fallback (Wave 2 and below, or apps not yet migrated)
  const perms = user?.uiPermissions ?? [];
  return Array.isArray(perms)
    ? perms.some((p: any) =>
        typeof p === 'string' ? p === featureTag : p?.feature_tag === featureTag
      )
    : false;
}
```

**Wave 3 Gate (per step)**:
- [ ] **DB-3a**: Row count correct. Spot-check 3 users. `ROLLBACK` tested on dev.
- [ ] **B2**: Three curl tests pass (2-app user, 0-app user, no token).
- [ ] **B3**: Login response body contains `appRoles` object. Existing JWT still decoded by `protect` middleware.
- [ ] **User type**: `tsc --noEmit` clean after type update.
- [ ] **F3**: AppSelector Network tab shows `/api/{company}/apps` not `/api/public/...`. 0-app user sees correct empty state.
- [ ] **F4**: User with different roles per app — verify each app card navigates to correct dashboard type.
- [ ] **usePermission**: Admin-only nav item hidden for operator role in workflow_fab, visible in audio_intelligence for same user.

---

## Complete Change Inventory

| ID | Change | Wave | Type | Risk |
|----|--------|------|------|------|
| DB-0a | Fix core-init.sql schema drift (is_public) | 0 | DDL fix | Low |
| DB-1a | Create app_user_access table | 1 | New table | None |
| DB-1b | Add app_id to role_capability | 1 | Nullable column | None |
| DB-1c | Add is_public to apps (guarded ALTER) | 1 | Nullable column | Low |
| DB-1d | Create workflow_fab init.sql (6 tables) | 1 | New tables | None |
| DB-1e | Update resourceDef.json + manifest.json | 1 | Config | Low |
| F1 | Folder restructure + path aliases | 1a | Move + imports | Medium |
| F10 | AdminLayout useLocation fix | 1b | 2-line change | Low |
| F10b | AppShell useMatch fix | 1b | Refactor | Low |
| F12 | CSS custom properties | 1b | CSS addition | None |
| F13 | Error Boundaries | 1b | New component | None |
| F-roles | isAdminRole() utility | 1b | New file | None |
| B4 | Schema endpoint /api/{company}/schema/resources | 1b | New endpoint | Low |
| F2 | Wire manifest refresh post-login | 1c | AuthContext edit | Low |
| F5+F6 | Nav dispatch per app | 2 | Refactor | Low |
| F7 | Dashboard dispatcher | 2 | Refactor | Low |
| F8+F9 | Per-app route registries + nesting | 2 | Refactor | Medium |
| F-guard | RequireAppAccess component | 2 | New component | None |
| WF-pages | workflow_fab admin + board pages | 2 | New pages | Low |
| CrudPage | Extract from 2 hand-built pages | 2 | Extraction | Low |
| DB-3a | Backfill app_user_access | 3 | Data migration | HIGH |
| B2 | Authenticated apps endpoint | 3 | New endpoint | Medium |
| B3 | Login/verify includes appRoles | 3 | Auth change | HIGH |
| User type | Update User type + consumers | 3 | Type change | Medium |
| F3 | AppSelector authenticated endpoint | 3 | FE auth change | Medium |
| F4 | App-level admin detection | 3 | FE auth change | Medium |
| usePermission | Per-app permission hook | 3 | Hook change | Medium |

---

## Execution Sequence Diagram

```
Wave 0: DB-0a (schema drift fix — edit file, not run on DB yet)
   │
   ▼
Wave 1 DB: DB-1a, DB-1b, DB-1c, DB-1d, DB-1e  ← run on DB, all parallel
   │
   ▼
Wave 1a FE: F1 (single agent, folder restructure)  ← must complete + pass build
   │
   ├── Wave 1b (all parallel):
   │     F10, F10b, F12, F13, F-roles (FE)
   │     B4 (BE schema endpoint)
   │
   └── Wave 1c (after B4 live):
         F2 (manifest refresh wiring)
   │
   ▼
Wave 2 (parallel tracks):
   Track A: F5+F6 → F7 → F8+F9 + F-guard
   Track B: WF page 1 (hand) → WF page 2 (hand) → CrudPage → WF pages 3-6 → WF board
   (Track A and B can run in parallel)
   │
   ▼
Wave 3 (strictly sequential):
   DB-3a → verify → B2 → verify → B3 + User type → verify → F3 → verify → F4 → verify → usePermission
```
