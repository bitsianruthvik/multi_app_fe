# Frontend TODO

> Generated: 2026-05-17
> Sources: `multi_app_fe` codebase + `multi_app_be/architecture/` (API_REFERENCE.md, routes.md, data-access.md)
> Rule: only files inside `C:\Users\Digital Initiatives\Desktop\TM` were consulted.

---

## Part 1 — FE ↔ BE Compatibility

Everything here is a gap between what the FE currently calls and what the backend actually exposes.

---

### 1.1 — Token Storage: localStorage vs httpOnly Cookie

**Current:** `src/contexts/AuthContext.tsx` and `src/api/client.ts` both read `localStorage.getItem("token")` and send `Authorization: Bearer <token>`.
The backend sets a `Set-Cookie: token=...` httpOnly cookie **and** returns `token` in the response body.
`shared/services/apiClient.ts` only sends `credentials: "include"` — it attaches **no** `Authorization` header, so it relies solely on the cookie. If the cookie is httpOnly and the frontend is on a different origin, this silently fails.

**Required:**
- [ ] Decide on one auth mechanism: **cookie-only** (httpOnly, most secure) or **localStorage Bearer** (current). The backend supports both.
- [ ] If sticking with localStorage: ensure `shared/services/apiClient.ts` (`AudioReview.tsx`) also attaches the `Authorization` header — currently it does not.
- [ ] If switching to cookie-only: remove all `localStorage.setItem("token", ...)` calls in `AuthContext.tsx` login and remove `Authorization` header injection from all three clients.
- [ ] Ensure `credentials: "include"` is set on every fetch/axios call (currently missing from some direct fetch calls in `PastRecordings.tsx`).

---

### 1.2 — Login Response Shape

**Current (`Login.tsx`):** Expects `response.data.token` and `response.data.user` from `POST /:company/:app/login`.
**Backend (`API_REFERENCE.md`):** Returns `{ message, user: { id, name, email, role, team, company, companyId, company_id, uiPermissions }, token, dashboardRoute, company }`.

- [ ] Verify `Login.tsx` correctly reads `response.data.user` (not `response.data.data`) — trace the axios response unwrapping.
- [ ] Store and use `dashboardRoute` from login response to redirect user to the correct post-login page instead of relying solely on `getHomePath()` role switch.
- [ ] Map `user.uiPermissions` (array of `{ feature_tag }`) into the auth context so the FE can gate UI elements — currently `uiPermissions` is stored in context but never consumed anywhere in the web app.

---

### 1.3 — Verify Endpoint Method

**Current (`AuthContext.tsx` line ~64):** `api.get("/verify")` — GET request. ✓ matches backend spec.
**Also check:** the axios `baseURL` is `${API_HOST}/api/${company}/${app}` — so the full URL is `${API_HOST}/api/${company}/${app}/verify`. This matches `GET /api/:company/:appSlug/verify`. ✓

- [ ] No change needed on verify method, but confirm `companySlug` and `appSlug` in `localStorage` are populated **before** `initializeAuth()` runs. If they are empty on first mount, axios extracts slugs from `window.location.pathname` — this will be empty strings on `/select-company`.

---

### 1.4 — Logout: Call Backend Endpoint

**Current (`AuthContext.tsx` line ~107):** `api.post("/auth/logout").catch(() => {})` — already correct.  
Backend route: `POST /api/:company/:appSlug/auth/logout`.
- [ ] Confirm the axios instance resolves this to the right URL (it should: `baseURL/auth/logout`). ✓
- [ ] After logout, redirect to `/select-company` — currently `getHomePath()` returns `"/login"` for unauthenticated user, not the select-company page.

---

### 1.5 — `POST /api/history_analysis` — Endpoint Not in Backend Spec

**Current (`CallHistory.tsx`):** `POST /api/history_analysis` with array of recordings.
**Backend spec:** No such endpoint documented in `API_REFERENCE.md` or `routes.md`.

- [ ] Confirm this endpoint exists on the running backend (check `multi_app_be/apps/` for any custom route).
- [ ] If it does not exist: replace with client-side history computation or add a new backend worker job triggered via `POST /api/query/v1/base_resource` aggregation.
- [ ] `GET /api/analysis_status?job_id=...` — also not in backend spec. Confirm or replace with a `query({ resource: "audio_recordings", filters: { "id.eq": jobId } })` polling loop that checks `status` field.

---

### 1.6 — `POST /api/transcribe` — Old Endpoint Pattern

**Current (`AudioReview.tsx`):** `POST /api/transcribe` via `shared/services/apiClient.ts`.
**Backend spec (`API_REFERENCE.md`):** `POST /api/:company/:appSlug/audio/transcribe` with body `{ audio_id: number }`.

- [ ] Update `AudioReview.tsx` to call `POST /api/${company}/${app}/audio/transcribe` instead of `/api/transcribe`.
- [ ] Switch from `shared/services/apiClient.ts` (no auth header) to `src/api/client.ts` (`apiPost`) — the transcribe endpoint requires a valid JWT.
- [ ] Pass `{ audio_id: recordingId }` as body (current body shape may differ).

---

### 1.7 — `GET /api/query/v1/debug/audio/:id` — Debug Route in Production Code

**Current (`AudioReview.tsx`):** Uses the `/debug/` route to load a recording for review.
**Backend spec:** Debug routes (`/debug/data`, `/debug/jwt`) require admin JWT. The specific `/debug/audio/:id` path is not documented.

- [ ] Replace with `query({ resource: "audio_recordings", fields: [...], filters: { "id.eq": id } })` via the api-builder.
- [ ] Remove dependency on undocumented debug endpoint.

---

### 1.8 — `POST /api/analyze_by_id_async` — Endpoint Not in Backend Spec

**Current (`AudioRecorder.tsx` or `AnalysisDetail.tsx`):** Async analysis trigger.
**Backend spec:** No such route in `API_REFERENCE.md`.

- [ ] Confirm whether this custom route exists in the backend app code.
- [ ] If deprecated: the backend already runs analysis automatically after transcription (audio upload → background transcription worker → analysis stored in `audio_recordings.analysis`). Remove the manual trigger and instead poll `audio_recordings.status` via api-builder.

---

### 1.9 — Admin Endpoints Not in Backend Spec

**Current:**
- `POST /admin/add-feature` — `AddFeature.tsx`
- `POST /admin/add-feature-capability` — `AddCapability.tsx`
- `POST /admin/add-user` — `AddUser.tsx`

**Backend spec:** Only `POST /api/:company/:appSlug/admin/register` is documented for admin routes.

- [ ] Replace `POST /admin/add-user` with `POST /api/query/v1/base_resource` using `{ operation:"insert", resource:"users", data:{name,email,password,role_id,team_id} }`.
- [ ] Replace `POST /admin/add-feature` with `{ operation:"insert", resource:"features", data:{name, feature_tag, type} }`.
- [ ] Replace `POST /admin/add-feature-capability` with `{ operation:"insert", resource:"features_capability", data:{feature_id, capability_id} }`.
- [ ] Replace `RoleMapping.tsx` capability assignments with `{ operation:"insert", resource:"role_capability", data:{role_id, capability_id} }`.
- [ ] Fetch roles in `AddUser.tsx` from `GET /api/public/roles` (already doing `/public/roles` ✓) and teams from `GET /api/public/teams` ✓.

---

### 1.10 — Document Upload: URL Pattern

**Current (`CompanyDocuments.tsx`):** File upload to `POST /uploads` via raw `fetch`.
**Backend spec:** `POST /api/:company/:appSlug/document/upload` — multipart fields: `doc_file` (required), `resource` (required: `"company"` or `"team"`), `team_id` (if team), `medicine`, `id`.

- [ ] Update upload URL from `/uploads` to `/api/${company}/${app}/document/upload`.
- [ ] Ensure `resource` field is included in `FormData` (`"company"` or `"team"` based on active tab).
- [ ] Add `team_id` to FormData when uploading team documents.
- [ ] After upload, refresh documents list via `query({ resource: "company_documents" })` or `resource: "team_documents"`.
- [ ] Use `POST /api/:company/:appSlug/document/update_medicine` with `{ document_id, medicine }` for medicine tagging (confirm current implementation uses this path).

---

### 1.11 — Audio Upload: URL and Fields

**Current (`AudioRecorder.tsx`):** Calls `mutate()` (api-builder insert) to store audio — sends base64 `audio_data` directly into `audio_recordings` table.
**Backend spec:** `POST /api/:company/:appSlug/audio/upload` — multipart/form-data with `audio_file` field. Backend converts to MP3 internally and triggers transcription as a background job.

- [ ] Evaluate whether continuing to store raw `audio_data` via base_resource insert bypasses the backend's audio processing pipeline (MP3 conversion, transcription worker).
- [ ] If yes: switch `AudioRecorder.tsx` to `POST /api/${company}/${app}/audio/upload` with `FormData` containing `audio_file` (Blob), `title`, `status`, and `idempotencyKey`.
- [ ] Remove manual base64 encoding in `AudioRecorder.tsx` — backend handles file conversion.
- [ ] Poll `audio_recordings.status` via api-builder query after upload instead of triggering `/api/analyze_by_id_async`.

---

### 1.12 — `api-builder/registry.ts`: `/schema/resources` Endpoint Missing

**Current (`registry.ts` line ~70):** Background refresh hits `GET /schema/resources` with ETag.
**Backend spec:** No such endpoint documented.

- [ ] Either add `/schema/resources` to the backend (returns same shape as `manifest.json`) or remove the registry refresh call from `initRegistryRefresh()` and rely solely on the baked-in manifest.
- [ ] Until resolved, the silent failure means the manifest is never updated from the server — any new resources added to `resourceDef.json` on the backend will not be queryable without a FE deploy.

---

### 1.13 — `manifest.json`: Missing Resources

**Current (`manifest.json`):** Only defines `users` and `audio_recordings`.
**Backend `resourceDef.json` (from `API_REFERENCE.md`):** Also exposes `companies`, `apps`, `roles`, `teams`, `features`, `features_capability`, `role_capability`, `company_documents`, `team_documents`.

- [ ] Add `companies` resource to manifest — needed for `SelectCompany` and admin pages instead of hitting `/api/public/companies` raw.
- [ ] Add `roles`, `teams`, `features`, `features_capability`, `role_capability` to manifest — enables `AddUser`, `AddFeature`, `AddCapability`, `RoleMapping` to use typed api-builder calls.
- [ ] Add `company_documents`, `team_documents` to manifest — enables `CompanyDocuments` listing to use api-builder.

---

### 1.14 — `shared/services/apiClient.ts`: Wrong Env Var + No Auth Header

**Current:** Reads `VITE_API_HOST` (not defined in `.env.example`). Falls back to `window.location.origin` (port 5173 in dev — the Vite dev server, not the backend).
**Impact:** `AudioReview.tsx` silently hits the wrong host in development. No `Authorization` header — authenticated endpoints will return 401.

- [ ] Rename env var to `VITE_API_BASE_URL` in `shared/services/apiClient.ts` to match the standard.
- [ ] Add `Authorization: Bearer ${localStorage.getItem("token")}` header to both `apiGet` and `apiPost` in `shared/services/apiClient.ts`.
- [ ] Or: replace `AudioReview.tsx`'s use of `shared/services/apiClient.ts` with `src/api/client.ts` which already handles both.

---

### 1.15 — `axiosConfig.ts`: Slug Extraction Not Reactive

**Current (`axiosConfig.ts` lines 16–27):** Company + app slugs are extracted from `window.location.pathname` once at **module load time**. The axios `baseURL` is set once and never updated.

- [ ] If the user navigates between companies/apps in the same session (e.g., back to `/select-company` and picks a new app), the axios instance still uses the old slugs.
- [ ] Fix by extracting slugs inside the request interceptor (per-request) instead of at module init, or migrate callers to `src/api/client.ts` + explicit URL construction.

---

### 1.16 — uiPermissions: Stored But Never Used

**Current:** `user.uiPermissions` (array of `{ feature_tag }`) is stored in auth context state but no component reads it to gate any UI element or route.

- [ ] Create a `usePermission(featureTag: string): boolean` hook that reads `user.uiPermissions` from context.
- [ ] Gate admin sidebar menu items (AddUser, AddFeature, etc.) using `usePermission`.
- [ ] Gate admin route access in `ProtectedRoute` using the same hook.

---

### 1.17 — Job Queue Status: Admin Panel Gap

**Backend:** `GET /api/admin/jobs/status` returns `{ queues: [{ name, waiting, active, completed, failed, delayed }] }`.
**Current FE:** Not called anywhere. Admin `Dashboard.tsx` shows hardcoded zeros.

- [ ] Add API call in `src/pages/admin/Dashboard.tsx` to `GET /api/admin/jobs/status`.
- [ ] Display live queue stats (transcription queue, doc-intel queue) on the admin dashboard.

---

### 1.18 — App Context: Company Branding Not Fetched

**Backend:** `GET /api/:company/:appSlug/app/query` returns `{ appSlug, companyName, settings, raw }`.
**Current FE:** Not called anywhere. Company name is derived only from the URL slug.

- [ ] Fetch app context after successful login and store `companyName` + `settings` in auth context or a separate app context.
- [ ] Use `companyName` in `AppShell.tsx` header instead of showing nothing / slug.

---

### 1.19 — `PastRecordings.tsx`: Raw Fetch Instead of api-builder

**Current (`PastRecordings.tsx`):** `POST /api/query/v1/base_resource` via direct `fetch()` — duplicates the api-builder, no validation, no security headers.

- [ ] Replace with `query({ resource: "audio_recordings", fields: [...], filters: { "recorded_by.eq": user.name } })` from api-builder.

---

### 1.20 — Aggregation Queries Not Yet Used

**Backend:** `base_resource` supports `aggregate: { functions: [{fn, field, alias}], groupBy, having }` for COUNT/SUM/AVG/MIN/MAX.
**Current FE:** Never used. All stats (avg score, progress %) computed client-side from full record sets.

- [ ] `MyProgress.tsx`: replace client-side average computation with `aggregate: { functions: [{fn:"AVG", field:"score", alias:"avg_score"}], groupBy:["medicine"] }`.
- [ ] `CallHistory.tsx`: replace full dataset load + client-side trend with server-side aggregation grouped by `created_at` date.
- [ ] `admin/Dashboard.tsx`: show live counts using `{ fn:"COUNT", field:"*", alias:"total" }` on `users`, `audio_recordings`, `features`.

---

## Part 2 — Top 10 Performance Issues

Based on analysis of the actual `multi_app_fe` source files.

---

### P1. `Dashboard.tsx` Is a 1 911-Line God Component
**File:** `src/pages/user/Dashboard.tsx`
A single component handles three phases (`quick`, `brand`, `full`), three view modes (`record`, `progress`, `team`), recording history, drawer detail, admin redirect, medicine loading, and polling. Every state update re-evaluates the full component tree. Impossible to memoize sub-sections effectively.
**Fix:** Split into phase-specific components (`QuickCapture`, `BrandDashboard`, `FullDashboard`) each in their own file. Extract the drawer and history list into separate components wrapped in `React.memo`.

---

### P2. No Code Splitting — All Routes Eagerly Bundled
**File:** `src/App.tsx`
Every page (`Dashboard`, `AnalysisDetail`, `MyProgress`, `CallHistory`, `AdminLayout`, etc.) is statically imported at the top of `App.tsx`. The full application JS bundle is downloaded on first load, regardless of which route the user visits.
**Fix:** Wrap every `<Route element={...}>` target in `React.lazy(() => import("./pages/..."))` and add a top-level `<Suspense fallback={<CircularProgress />}>` in `App.tsx`. Priority: admin routes, `AnalysisDetail`, `MyProgress`.

---

### P3. `AudioRecorder.tsx` Creates AudioContext on Every Mount
**File:** `src/components/AudioRecorder.tsx` (~872 lines)
A new `AudioContext` (+ GainNode + BiquadFilterNode) is created each time the component mounts. If the recorder is unmounted and remounted (e.g., tab switching on Dashboard), old contexts accumulate. Browsers limit the number of concurrent `AudioContext` instances; excess ones are silently suspended.
**Fix:** Create `AudioContext` lazily on first recording start (not on mount). Store the context in a `useRef` and reuse it across renders. Call `audioContext.close()` in the `useEffect` cleanup.

---

### P4. `requestAnimationFrame` Loop Not Cancelled on Unmount
**File:** `src/components/AudioRecorder.tsx`
The waveform visualizer uses `requestAnimationFrame` in a loop. If the component unmounts while recording is active (e.g., user navigates away), the rAF loop continues running, accessing a detached canvas element and preventing garbage collection.
**Fix:** Store the `requestAnimationFrame` ID in a `useRef`. In the `useEffect` cleanup return: `cancelAnimationFrame(rafIdRef.current)`.

---

### P5. `formatAnalysis()` Runs Synchronously in Render — Not Memoized
**File:** `src/pages/user/AnalysisDetail.tsx`, `src/utils/analysisFormatter.ts`
`formatAnalysis(raw)` is ~278 lines of synchronous string parsing, JSON parsing, scoring computation, and recommendation generation. It runs on every render of `AnalysisDetail` because its result is not memoized.
**Fix:** Wrap the call in `useMemo(() => formatAnalysis(rawAnalysis), [rawAnalysis])`. The analysis string from the backend is immutable per recording, so the memo will only recompute on a new recording load.

---

### P6. `CallHistory.tsx` and `MyProgress.tsx` Load All Recordings — No Pagination
**Files:** `src/pages/user/CallHistory.tsx`, `src/pages/user/MyProgress.tsx`
Both pages query `audio_recordings` with no `pagination` limit, fetching the full history for a user. A user with 500 recordings downloads all 500 rows (including base64 `audio_data` if not excluded) before any UI renders.
**Fix:** Add `pagination: { limit: 50 }` + infinite scroll or "Load more" button. Use `fields` selection to exclude `audio_data` and `transcription` fields from list queries (only fetch them on detail views).

---

### P7. `AnalysisDetail.tsx` Fetches `audio_data` (Base64 Audio) in List Query
**File:** `src/pages/user/AnalysisDetail.tsx` and anywhere `audio_recordings` is queried without explicit `fields`
The api-builder manifest lists `audio_data` as a queryable field but queries without a `fields` restriction return all columns — including the full base64-encoded audio blob. This dramatically inflates response payload size.
**Fix:** Always pass explicit `fields: ["id", "title", "score", "analysis", "status", "created_at", "medicine", "keywords_of_improvement"]` on list queries. Only request `audio_data` / `audio_url` / `processed_url` on the detail view when the user needs to play audio.

---

### P8. Polling with No Cleanup — Potential Interval Leak
**File:** `src/pages/user/CallHistory.tsx`
`CallHistory.tsx` polls `GET /api/analysis_status?job_id=...` using a timer. If the component unmounts before the job completes (user navigates away), the interval/timeout continues firing and may call `setState` on an unmounted component, triggering React warnings and leaking memory.
**Fix:** Store the interval/timeout ID. Return a cleanup function from the `useEffect` that calls `clearInterval` / `clearTimeout`.

---

### P9. `analysisFormatter.ts` Called Without Memoization Across Multiple Components
**Files:** `src/pages/user/AnalysisDetail.tsx`, `src/pages/user/Dashboard.tsx` (detail drawer)
`formatAnalysis` may be called in multiple locations for the same recording. Each call re-parses and re-computes the full analysis object.
**Fix:** Memoize per `recording.id` using a module-level `Map` cache (`const cache = new Map<number, FormattedAnalysis>()`), or at minimum `useMemo` at each call site. Clear the cache when a recording is updated.

---

### P10. `axiosConfig.ts` Imported at Module Level — Eager Side Effects at Boot
**File:** `src/utils/axiosConfig.ts` lines 13–14
The file logs `console.debug("API_HOST from environment ->", API_HOST)` and calls `extractSlugs()` (which reads `window.location.pathname`) at module evaluation time — before React renders. This is a side-effectful module import that runs on every page load even for routes that never use axios directly.
**Fix:** Move `extractSlugs()` inside the request interceptor (called per-request, not at module init). Remove the `console.debug` from module scope. Ultimately, consolidate onto `src/api/client.ts` and remove the axios instance.

---

## Part 3 — Top 10 UI Issues

Based on analysis of the actual `multi_app_fe` source files.

---

### U1. Admin `Dashboard.tsx` Is a Placeholder — Shows Hardcoded Zeros
**File:** `src/pages/admin/Dashboard.tsx` (27 lines)
The admin dashboard displays "Users", "Features", "Capabilities" stat cards with no actual data fetch. All values are static/hardcoded. Admins see a useless page.
**Fix:** Fetch live counts from `POST /api/query/v1/base_resource` with `aggregate: { functions: [{ fn:"COUNT", field:"*", alias:"total" }] }` for each resource. Add job queue health from `GET /api/admin/jobs/status`.

---

### U2. `More.tsx` — Profile, Settings, Help, About Are All Disabled
**File:** `src/pages/user/More.tsx`
Four out of five menu items (`Profile`, `Settings`, `Help`, `About`) are rendered as visually active list items but are completely non-functional (no `onClick`, no navigation). Users will tap them expecting to go somewhere.
**Fix:** Either implement the routes or visually mark them as "Coming soon" (dimmed text, `disabled` prop, or a `Chip` label). Do not present non-functional navigation items without indication.

---

### U3. `TopNavigation.tsx` Hides Itself via Brittle String Matching
**File:** `src/components/TopNavigation.tsx`
The bottom nav hides itself using `!location.pathname.includes('login')` and similar string checks. This means any future route containing the substring `"login"` (e.g., `/admin/login-audit`) would also hide the nav bar.
**Fix:** Use an explicit allowlist of route patterns where nav should show, or a layout-based approach (render `<TopNavigation>` only inside user-facing `<Layout>` component, not in `App.tsx` globally).

---

### U4. `AppShell.tsx` Back Button Always Uses `navigate(-1)` — Breaks on Direct Load
**File:** `src/components/AppShell.tsx`
`navigate(-1)` only works if there is history to go back to. If a user opens a deep link (e.g., `/company/app/analysis/42`) directly, the back button navigates to the browser's previous page (which may be outside the app) instead of the correct parent route.
**Fix:** Pass an explicit `backPath` prop to `AppShell` from each page. Fall back to `navigate(-1)` only if `backPath` is not provided and `window.history.length > 1`.

---

### U5. `company-documents.css` Uses Pervasive `!important` Overrides
**File:** `src/styles/pages/company-documents.css`
Multiple declarations force `background: #ffffff !important` and white text overrides throughout the document management page. This is a sign of MUI theme conflicts and will cause issues in any future dark-mode implementation or theme change.
**Fix:** Apply a custom MUI `sx` prop or a scoped CSS Module on the `CompanyDocuments` component instead of `!important` global overrides. Resolve the underlying MUI theme conflict that's causing the page to render with wrong background.

---

### U6. `errorLogger.ts` Is Empty — No Error Logging Implemented
**File:** `src/utils/errorLogger.ts` (1 line, no implementation)
Errors from API calls, audio processing failures, and analysis errors are only caught in local `try/catch` blocks with no centralised tracking. The `ErrorLogs.tsx` admin page likely has nothing to display.
**Fix:** Implement `errorLogger.ts` with at minimum: `logError(context: string, error: unknown)` that posts to a `POST /api/query/v1/base_resource` insert on an `error_logs` resource (or a simple `console.error` structured wrapper). Wire up all catch blocks to call it.

---

### U7. `SelectCompany.tsx` — No Handling When Company Has No Apps
**File:** `src/pages/auth/SelectCompany.tsx`
If the selected company has zero associated apps, the second dropdown is empty and the "Continue" button is active but leads nowhere. No message is shown.
**Fix:** After fetching apps, if the array is empty show a message: "No apps available for this company. Contact your administrator." Disable the submit button until both a company and an app are selected.

---

### U8. Dashboard `quick`/`brand` Phases Have No Visual Phase Indicator
**File:** `src/pages/user/Dashboard.tsx`
The three phases (`quick`, `brand`, `full`) change the UI significantly but there is no indicator showing the user which phase they are in or how to progress between them. Users in `quick` mode may not know `brand` and `full` modes exist.
**Fix:** Add a compact phase indicator (stepper or segmented control) at the top of the dashboard. Show a tooltip or onboarding hint on first visit explaining the phase system.

---

### U9. `AudioRecorder.tsx` — Near/Far Mode Has No User Explanation
**File:** `src/components/AudioRecorder.tsx`
The two recording modes ("near" and "far") apply different audio processing (different gain/filter settings) but the UI labels are just "near" and "far" with no explanation of when to use each.
**Fix:** Add a tooltip or info icon next to the mode selector explaining: "Near — holding phone close to mouth", "Far — phone on desk / speaker distance". Consider defaulting to the appropriate mode based on device type.

---

### U10. `AnalysisDetail.tsx` — Accordion Sections All Start Collapsed, Score Not Visible on Load
**File:** `src/pages/user/AnalysisDetail.tsx`
All accordion sections are collapsed by default. The user's overall score is shown, but individual section scores are hidden until each accordion is expanded. A user who scored poorly in one section has no visual cue to look there.
**Fix:** Auto-expand the lowest-scoring section on load. Show a colour-coded score chip (red/amber/green) on each accordion summary row so users can see all section scores at a glance without expanding. Use MUI `Accordion defaultExpanded` for the weakest section.

---

## Quick Wins (Under 1 Hour Each)

- [ ] Add `cancelAnimationFrame(rafId)` cleanup in `AudioRecorder.tsx` (P4)
- [ ] Add `clearInterval` / `clearTimeout` cleanup in `CallHistory.tsx` polling (P8)
- [ ] Wrap `formatAnalysis()` calls in `useMemo` in `AnalysisDetail.tsx` (P5, P9)
- [ ] Add `fields: [...]` to every api-builder `query()` call to exclude `audio_data` (P7)
- [ ] Mark disabled items in `More.tsx` as "Coming soon" with visual treatment (U2)
- [ ] Add empty-apps guard in `SelectCompany.tsx` (U7)
- [ ] Update `shared/services/apiClient.ts` to read `VITE_API_BASE_URL` and attach auth header (1.14)
- [ ] Update `AudioReview.tsx` transcribe endpoint from `/api/transcribe` → `/api/${company}/${app}/audio/transcribe` (1.6)
- [ ] Add `pagination: { limit: 50 }` to `CallHistory` and `MyProgress` queries (P6)
- [ ] Replace hardcoded zeros in admin `Dashboard.tsx` with live aggregate queries (U1, 1.17)
