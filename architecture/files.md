# Frontend File Map

**Root:** `C:\Users\Digital Initiatives\Desktop\TM\multi_app_fe`
**Stack:** React 19.1.1 · TypeScript 5.9.3 · Vite 7.1.7 · Material-UI 7.3.4 · React Router 7.9.4

This document covers every non-library, non-generated file in the repo.
Library code (`node_modules/`, `.git/`, `dist/`) is excluded.

---

## Monorepo Layout

```
multi_app_fe/
├── architecture/          ← this folder
├── mobile/
│   └── mobile_app/        ← Expo / React Native app
├── public/                ← static assets served by Vite
├── scripts/               ← local tunnel / ngrok helpers
├── shared/                ← types, hooks, services shared across web + mobile
├── src/                   ← main web application (Vite entry)
├── web/                   ← standalone web variant (separate package.json)
├── .env                   ← actual env vars (git-ignored)
├── .env.example           ← env template
├── API_MIGRATION.md       ← migration guide (centralised API client)
├── eslint.config.js       ← ESLint flat config
├── index.html             ← Vite HTML entry
├── package.json           ← root dependencies
├── tsconfig.json          ← root TS config (references app + node)
├── tsconfig.app.json      ← browser target TS config
├── tsconfig.node.json     ← Node/Vite config TS config
└── vite.config.ts         ← Vite dev server + proxy config
```

---

## Root Config Files

### `vite.config.ts`
Vite configuration.
- Dev server on **port 5173**, `host: true` (LAN accessible)
- Cloudflare tunnel support via `allowedHosts` + WSS HMR
- **Proxy rules** (all hit `VITE_BACKEND_URL`, default `http://localhost:4000`):
  - `/api` → backend
  - `/uploads` → backend
  - `/debug` → backend
- `VITE_TUNNEL_HOST` / `TUNNEL_HOSTNAME` env vars control HMR host

### `package.json`
Root workspace package.
Key prod deps: `react@19.1.1`, `@mui/material@7.3.4`, `react-router-dom@7.9.4`,
`axios@1.12.2`, `formik@2.4.6`, `yup@1.7.1`, `zod@4.1.12`, `dayjs`.
Key dev deps: `vite@7.1.7`, `typescript@5.9.3`, `@vitejs/plugin-react`, `eslint@9`.

### `.env.example`
Single env var template:
```
VITE_API_BASE_URL=https://multi-app-be.onrender.com
```
This is the **only** place the backend URL should be configured for the main `src/` app.

### `API_MIGRATION.md`
Documents the migration to a centralized API client (`src/api/client.ts`).
Records removal of hardcoded `localhost` URLs across components and the
consolidation onto `VITE_API_BASE_URL`.

### `eslint.config.js`
ESLint flat config — TypeScript + React rules.

### `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json`
Standard Vite TypeScript project references setup.
`tsconfig.app.json`: targets `ES2020`, includes `src/**/*.tsx?`.

### `index.html`
Vite HTML entry. Single `<div id="root">` + `<script type="module" src="/src/main.tsx">`.

---

## `src/` — Main Web Application

### Entry Points

| File | Purpose |
|------|---------|
| `src/main.tsx` | ReactDOM root — renders `<App />` inside `<StrictMode>` |
| `src/App.tsx` | Router tree, `<AuthProvider>` wrapper, all route definitions |

### `src/App.tsx` — Route Structure
```
/select-company                               → SelectCompany (public)
/:company/:app/login                          → Login (public)
/:company/:app/admin/register                 → AdminRegister (public)

/:company/:app/admin/dashboard                → AdminLayout (ProtectedRoute)
  /add-user                                   → AddUser
  /add-feature                                → AddFeature
  /capabilities-add                           → AddCapability
  /company-documents                          → CompanyDocuments
  /roles-mapping                              → RoleMapping

/:company/:app/dashboard                      → Dashboard (ProtectedRoute)
/:company/:app/:role/dashboard                → Dashboard (ProtectedRoute, role-scoped)
/:company/:app/practice-results/:recordingId  → PracticeResults (ProtectedRoute)
/:company/:app/analysis/:id                   → AnalysisDetail (ProtectedRoute)
/:company/:app/my-progress                    → MyProgress (ProtectedRoute)
/:company/:app/call-history                   → CallHistory (ProtectedRoute)
/:company/:app/more                           → More (ProtectedRoute)

/                                             → redirect to /select-company
```

---

### `src/api/`

| File | Purpose |
|------|---------|
| `client.ts` | **Primary API client.** `apiFetch<T>`, `apiGet`, `apiPost`, `apiPut`, `apiDelete`. Reads `VITE_API_BASE_URL`, attaches `Authorization: Bearer <token>` from `localStorage.getItem("token")`, 30 s timeout via `AbortController`, `credentials: "include"`. `getApiBaseUrl()` exported for legacy URL construction. |

### `src/api-builder/`
Manifest-driven, type-safe query builder for `POST /api/query/v1/base_resource`.

| File | Purpose |
|------|---------|
| `manifest.json` | Baked-in schema (version `1.2`). Defines `users` and `audio_recordings` resources with allowed fields and filter ops. Endpoint for both: `/api/query/v1/base_resource`. |
| `registry.ts` | Loads manifest — seeds from baked JSON, hydrates from `localStorage`, background-refreshes from `/schema/resources` with ETag. Exports `getResource(name)`, `initRegistryRefresh()`, `getCurrentManifest()`. |
| `client.ts` | Low-level `send(opts)` — wraps `fetch`, uses `buildSecurityHeaders`, 5 s timeout, retries once against `window.location.origin` on 404 or network error. |
| `security.ts` | `buildSecurityHeaders()` — attaches `Authorization` (reads `localStorage["token"]` or `localStorage["auth.token"]`), `x-request-id` (UUID), `X-Resource-Version` (schema version), `Idempotency-Key`. |
| `validate.ts` | `validateFields(resource, fields)` — checks each field is in manifest. `validateFilters(resource, filters)` — checks each filter op is allowed. |
| `serialize.ts` | `serializeGet` (builds query-string for GET), `serializePost` (builds POST body). Currently unused — mutate builds body directly in `index.ts`. |
| `index.ts` | Public API: `query(opts)` → builds `{ operation:"query", resource, fields, filters, orderBy, pagination }` body → `send()`. `mutate(opts)` → builds `{ operation:"insert"|"update", resource, data }` body → `send()`. |
| `README.md` | Usage guide for the api-builder. |

**Important:** `registry.ts` tries to refresh from `/schema/resources` — this endpoint does **not** exist in the current backend. The refresh silently fails and the baked manifest is used.

---

### `src/contexts/`

| File | Purpose |
|------|---------|
| `AuthContext.tsx` | Single auth context. State: `isAuthenticated`, `user`, `companySlug`, `appSlug`, `isInitialized`. On mount: reads `localStorage.token`, calls `GET /verify` via axios instance (company/app-scoped URL). `login()` writes to `localStorage`. `logout()` clears `localStorage` + calls `POST /auth/logout`. `getHomePath()` returns role-based route. |

---

### `src/utils/`

| File | Purpose |
|------|---------|
| `axiosConfig.ts` | **Legacy/secondary API client.** Creates an `axios` instance with `baseURL = ${API_HOST}/api/${company}/${app}`. Company + app slugs extracted from `window.location.pathname` **at module load time** (not reactive). Request interceptor: attaches `Authorization: Bearer <token>`. Response interceptor: redirects to `/:company/:app/login` on 401. Exports `buildFullApiUrl(path)` and `buildPublicApiUrl(path)`. Used by `AuthContext` and `Login`. |
| `analysisFormatter.ts` | `formatAnalysis(raw)` — parses raw JSON or string analysis, builds a structured text report + final JSON payload. Extracts scored sections, keywords, learning areas, recommendations. ~278 lines of synchronous computation. |
| `errorLogger.ts` | **Empty file** — no implementation. |

---

### `src/components/`

| File | Size | Purpose |
|------|------|---------|
| `AudioRecorder.tsx` | ~872 lines | Core recording component. `MediaRecorder` API, `AudioContext` with gain node + high-pass filter, near/far mode, real-time waveform visualization via `requestAnimationFrame`, base64 encoding of recorded audio, calls `mutate()` (api-builder) to insert into `audio_recordings`, polls for transcription/analysis completion. |
| `AppShell.tsx` | ~162 lines | Header wrapper — back button (`navigate(-1)`), page title, user pill (name + role), call-history button, logout button. Conditionally shows header. |
| `TopNavigation.tsx` | ~86 lines | Bottom tab bar — Record, My Progress, More. Hides on login/admin/register routes via `location.pathname` string matching. |

---

### `src/layouts/`

| File | Purpose |
|------|---------|
| `AdminLayout.tsx` | MUI `AppBar` + responsive `Drawer` sidebar. Menu items: Dashboard, Add User, Add Feature, Add Capability, Company Documents, Team Documents, Role Mapping. Logout button. Renders `<Outlet />` for nested admin routes. |

---

### `src/pages/auth/`

| File | Purpose |
|------|---------|
| `Login.tsx` | Email + password form (Formik + Yup). `POST` to `buildFullApiUrl("/login")`. On success: calls `auth.login(token, user, company, app)`, redirects to `getHomePath()`. Redirects already-authenticated users away. |
| `SelectCompany.tsx` | Fetches `/api/public/companies` → user picks company → fetches `/api/public/companies/:id/apps` → user picks app → navigates to `/:company/:app/login`. |

---

### `src/pages/user/`

| File | Size | Purpose |
|------|------|---------|
| `Dashboard.tsx` | ~1 911 lines | **God component.** Three phases: `quick` (just record), `brand` (pick medicine + record), `full` (full UI with tabs). Loads medicines via `query()` (api-builder on `audio_recordings`). View modes: `record`, `progress`, `team`. Contains recording history, drawer detail view, admin auto-redirect. Most complex file in codebase. |
| `CallHistory.tsx` | ~385 lines | Loads all user recordings via `query()`. Sends history array to `POST /api/history_analysis`. Polls `GET /api/analysis_status?job_id=...`. Displays trajectory + section trends. |
| `AudioReview.tsx` | ~202 lines | Debug/review page. `GET /api/query/v1/debug/audio/:id`. Re-triggers transcription via `POST /api/transcribe`. Uses `shared/services/apiClient.ts` (not main client). |
| `AnalysisDetail.tsx` | ~589 lines | Loads recording from api-builder, runs `formatAnalysis()` synchronously in render, displays scored accordion sections, met/missed criteria, improvement plan. |
| `MyProgress.tsx` | ~584 lines | Loads all recordings via api-builder, computes averages/trends client-side, renders 4-metric progress bars (Model Communication, Language Quality, Medical Accuracy, Closing & Action). |
| `PastRecordings.tsx` | ~134 lines | `POST /api/query/v1/base_resource` directly (raw fetch, not api-builder). Lists recordings with audio playback. |
| `PracticeResults.tsx` | — | Practice session results display. |
| `More.tsx` | ~218 lines | Profile card + disabled menu items (Profile, Settings, Help, About). App version `1.0.0`. Logout button. |
| `index.ts` | — | Re-exports for user pages. |

---

### `src/pages/admin/`

| File | Size | Purpose |
|------|------|---------|
| `Dashboard.tsx` | 27 lines | **Placeholder only.** Static stats cards (Users, Features, Capabilities) with hardcoded zeros. No data fetching. |
| `AddUser.tsx` | ~250 lines | Formik form — name, email, password, company (from public API), role (from public API), team (from public API). `POST` to `/admin/add-user`. |
| `AddFeature.tsx` | ~125 lines | Formik form — feature_name, feature_tag, type. `POST` to `/admin/add-feature`. |
| `AddCapability.tsx` | ~138 lines | Checkbox list of features from `/public/features`. `POST` to `/admin/add-feature-capability`. |
| `CompanyDocuments.tsx` | ~253 lines | File upload (`FormData` → `POST /uploads`). Lists `company_documents` / `team_documents` via api-builder. Medicine tagging. Tab switching between company-level and team-level docs. |
| `RoleMapping.tsx` | ~201 lines | Fetches roles + capabilities. Chip-based capability selection per role. `POST` to map capabilities to roles. |
| `AdminRegister.tsx` | — | Admin self-registration form. |
| `ErrorLogs.tsx` | — | Error log viewer (implementation unknown — `errorLogger.ts` is empty). |

---

### `src/styles/`

| File | Purpose |
|------|---------|
| `global.css` | Resets, utility classes (`.card`, `.btn`, `.grid`, `.center`), responsive breakpoints, skeleton animation, form styles, header/footer layout. |
| `theme.css` | Design tokens: `--color-primary: #0b66d1`, spacing scale (`--space-1` 4px → `--space-12` 48px), typography, border-radii, shadows, `--layout-max-width: 1200px`, motion timings (`--motion-fast: 160ms`, `--motion-slow: 320ms`). Includes `@media (prefers-color-scheme: dark)` block. |
| `pages/login.css` | Login page layout styles. |
| `pages/select-company.css` | Gradient card, form controls, accent bar, mobile adjustments. |
| `pages/user-dashboard.css` | Minimal — primary heading color + spacing. |
| `pages/admin-dashboard.css` | Admin dashboard layout. |
| `pages/admin-register.css` | Admin register form layout. |
| `pages/add-user.css` | Add-user form layout. |
| `pages/add-feature.css` | Add-feature form layout. |
| `pages/add-capability.css` | Add-capability page layout. |
| `pages/company-documents.css` | Forces `background: #ffffff !important` overrides, upload button, tabs, form controls. Heavy use of `!important`. |
| `pages/role-mapping.css` | Role mapping page layout. |
| `pages/audio-review.css` | Audio review page layout. |

---

## `shared/` — Cross-Platform Shared Code

| File | Purpose |
|------|---------|
| `services/apiClient.ts` | Simple fetch wrapper. Reads `VITE_API_HOST` (different from `VITE_API_BASE_URL`!). Falls back to `window.location.origin`. No auth header attached — relies on `credentials:"include"` cookies only. Exports `apiGet(path)` and `apiPost(path, body)`. Used by `AudioReview.tsx`. |
| `services/sessionService.ts` | Session management utilities. |
| `hooks/useAuth.ts` | Auth context hook. |
| `hooks/useUser.ts` | User context hook. |
| `types/user.ts` | `User` interface: `{ id, name, email?, role_id?, team_id?, company_id?, uiPermissions?: Array<{ feature_tag: string }> }`. |
| `utils/calculatePrice.ts` | Price calculation helper. |
| `utils/formatDate.ts` | Date formatting utility. |

---

## `mobile/mobile_app/` — Expo / React Native App

| Path | Purpose |
|------|---------|
| `app/(tabs)/dashboard.tsx` | Main mobile dashboard |
| `app/login.tsx` | Mobile login screen |
| `app/company-selection.tsx` | Company/app selection |
| `app/record-audio.tsx` | Audio recording screen |
| `app/recording-detail.tsx` | Recording detail / analysis |
| `app/brand-detailing-practice.tsx` | Practice mode |
| `app/call-history.tsx` | Call history screen |
| `app/my-journey.tsx` | Journey / progress screen |
| `app/my-progress.tsx` | Progress analytics |
| `app/admin/*` | Admin screens |
| `services/apiClient.ts` | Token-aware fetch wrapper (Expo) |
| `services/sessionService.ts` | Session management |
| `services/tokenStorage.ts` | `expo-secure-store` token persistence |
| `services/urlBuilder.ts` | URL construction |

---

## `scripts/`

| File | Purpose |
|------|---------|
| `localtunnel_dev.js` | Starts a localtunnel for local development |
| `ngrok_dev.js` | Starts ngrok tunnel for local development |

---

## API Client Summary

The codebase has **three different API clients** in active use:

| Client | File | Auth method | Used by |
|--------|------|------------|---------|
| Primary fetch client | `src/api/client.ts` | `localStorage["token"]` → `Authorization` header | Most pages (via api-builder or directly) |
| Axios instance | `src/utils/axiosConfig.ts` | `localStorage["token"]` → `Authorization` header | `AuthContext`, `Login`, some admin pages |
| Shared fetch client | `shared/services/apiClient.ts` | `credentials:"include"` only (no header) | `AudioReview.tsx` |

All three use `credentials: "include"` / `withCredentials: true` for cookie support.
