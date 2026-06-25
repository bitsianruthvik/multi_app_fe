# Frontend Error Audit
Generated: 2026-05-17

Full repo scan of `src/`, `shared/`, and `mobile/`. Every entry includes exact file + function + line. Errors are grouped by severity: Blocking → High → Medium.

---

## BLOCKING ERRORS
> These will crash the app, cause infinite re-renders, or make core features silently fail.

---

### E01 — State setter called during render (infinite re-render loop)
**File:** `src/components/AudioRecorder.tsx`  
**Function:** `AudioRecorder` (component body, lines 100–104)  
**Code:**
```ts
if (defaultTitle && !title) {
  try { setTitle(defaultTitle); } catch (e) {}
}
```
**Problem:** `setTitle()` is called unconditionally in the render body (not inside a `useEffect` or event handler). Every render where `defaultTitle` is set but `title` is empty triggers another state update → infinite re-render loop. React will throw "Too many re-renders."  
**Fix:** Move to `useEffect(() => { if (defaultTitle) setTitle(defaultTitle); }, [defaultTitle])`.

---

### E02 — State setter called during render (infinite re-render loop)
**File:** `src/pages/user/Dashboard.tsx`  
**Function:** `UserDashboard` (component body, lines 539–543)  
**Code:**
```ts
if (phase !== "full" && !hasAudioRecordingPermission) {
  if (phase === "quick") {
    setPhaseAndUrl("full"); // ← called during render
  }
}
```
**Problem:** `setPhaseAndUrl` calls `setPhase` and `navigate` directly in the render body (not in `useEffect`). Any render where the condition is true triggers another state change → infinite loop.  
**Fix:** Wrap in `useEffect(() => { ... }, [phase, hasAudioRecordingPermission])`.

---

### E03 — Wrong field name causes validation error on medicines query
**File:** `src/pages/user/Dashboard.tsx`  
**Function:** `loadMedicines` (anonymous async, lines 201–213), inside `useEffect` at line 200  
**Code:**
```ts
const payload = {
  operation: "query",
  resource: "team_documents",
  fields: ["medicines"],  // ← wrong field name
};
```
**Problem:** The `team_documents` resource in `src/api-builder/manifest.json` defines the field as `"medicine"` (singular), not `"medicines"`. The api-builder's `validateFields()` will throw `"Field not allowed on resource team_documents: medicines"` and the entire medicine list will fall back to hardcoded dummy values `["Medicine A", "Medicine B", "Medicine C"]`.  
**Fix:** Change `"medicines"` → `"medicine"`.

---

### E04 — `runHistoryAnalysis` sends raw fetch with no auth token and wrong endpoint
**File:** `src/pages/user/CallHistory.tsx`  
**Function:** `runHistoryAnalysis` (lines 79–121)  
**Code:**
```ts
const apiUrl = "/api/history_analysis";
const response = await fetch(apiUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ recorded_by: user.name }),
});
```
**Problems:**  
1. No `Authorization: Bearer <token>` header — will get HTTP 401 on any authenticated backend route.  
2. Relative URL `/api/history_analysis` routes through the Vite proxy. The backend uses `/:company/:app/...` scoped routes; `/api/history_analysis` is not in the documented backend spec.  
**Fix:** Use `apiPost()` from `src/api/client.ts` with the correct company/app-scoped endpoint and pass the auth token automatically.

---

### E05 — Document upload posts to a nonexistent endpoint with no auth token
**File:** `src/pages/admin/CompanyDocuments.tsx`  
**Function:** `handleFile` (lines 69–124)  
**Code:**
```ts
const url = `${API_HOST}/api/query/v1/upload_document`;
const resp = await fetch(url, {
  method: "POST",
  credentials: "include",
  body: fd,
  // ← no Authorization header
});
```
**Problems:**  
1. The endpoint `POST /api/query/v1/upload_document` does not exist in the backend.  
2. No `Authorization` header — will get HTTP 401.  
**Fix:** Use the correct document upload endpoint (e.g., `POST /api/:company/:app/document/upload`) and add `Authorization: Bearer <token>` header.

---

### E06 — Medicine tagging posts to a nonexistent endpoint
**File:** `src/pages/admin/CompanyDocuments.tsx`  
**Function:** `handleSaveMedicine` (lines 142–172)  
**Code:**
```ts
const url = `${API_HOST}/api/update_document_medicine`;
const resp = await api.post(url, {
  document_id: selectedDocId,
  medicine: medicineInput.trim(),
});
```
**Problem:** `POST /api/update_document_medicine` does not exist in the backend. The medicine tag save will always fail with 404.  
**Fix:** Use `mutate()` from `src/api-builder` with the `company_documents` or `team_documents` resource to update the `medicine` field via the standard base_resource endpoint.

---

### E07 — Role mapping loads capabilities from a nonexistent endpoint
**File:** `src/pages/admin/RoleMapping.tsx`  
**Function:** `fetchData` (lines 46–61), inside `useEffect` at line 45  
**Code:**
```ts
api.get("/public/capabilities"),
```
**Problem:** `GET /api/public/capabilities` (after slug injection) does not exist in the documented backend. The capabilities array stays empty, so the chip selector renders nothing and role mapping is completely non-functional.  
**Fix:** Replace with `query({ resource: "features_capability", fields: ["id", "feature_id", "capability_id"] })` via the api-builder, or use the correct backend endpoint if one exists.

---

### E08 — `api-builder/client.ts` fallback URL points to Vite dev server, not backend
**File:** `src/api-builder/client.ts`  
**Function:** `send` (lines 37–42)  
**Code:**
```ts
const originBase =
  typeof window !== "undefined"
    ? `${window.location.origin}${opts.url.startsWith("/") ? "" : "/"}${opts.url}`
    : fullUrl;
```
**Problem:** On any first-attempt failure (404, network error, timeout), the retry uses `window.location.origin` (the Vite dev server at port 5173) instead of the actual backend. The retried request hits the frontend dev server, which returns an HTML `index.html` page, not API data. Callers see a JSON parse failure or unexpected HTML response instead of a clear API error.  
**Fix:** Remove the `originBase` fallback or make it configurable. All retry logic should use the same backend URL.

---

### E09 — `api-builder/client.ts` couples to `axiosConfig` — cascades if env var is missing
**File:** `src/api-builder/client.ts`  
**Function:** Module level (line 2)  
**Code:**
```ts
import { API_HOST } from "../utils/axiosConfig";
```
**Problem:** `axiosConfig.ts` throws at module-init if `VITE_API_BASE_URL` is undefined (lines 6–10 of `axiosConfig.ts`). Because `api-builder/client.ts` imports it, every `query()` and `mutate()` call across the entire app will also throw. This is an unexpected coupling — api-builder uses native `fetch`, not axios, yet it depends on the axios module.  
**Fix:** Read `import.meta.env.VITE_API_BASE_URL` directly in `api-builder/client.ts` instead of importing from `axiosConfig`.

---

## HIGH-PRIORITY ERRORS
> These break important features but don't necessarily crash the whole app.

---

### E10 — `getHomePath()` generates incorrect paths (missing slugs)
**File:** `src/contexts/AuthContext.tsx`  
**Function:** `getHomePath` (lines 118–130)  
**Code:**
```ts
case "admin":
  return user.company ? `/${user.company}/admin` : "/admin";
case "user":
  return "/dashboard";
case "manager":
  return "/manager/dashboard";
```
**Problems:**  
- Admin path uses `user.company` (company **name**, not slug) and is missing the app slug and the `/dashboard` suffix. Should be `/${companySlug}/${appSlug}/admin/dashboard`.  
- User path `/dashboard` has no company/app slugs — navigating to it shows a blank/404.  
- Manager path `/manager/dashboard` has no slugs either.  
**Locations:** Lines 122, 124, 126 in `getHomePath`.

---

### E11 — Token verify called without company/app slugs on initial load
**File:** `src/contexts/AuthContext.tsx`  
**Function:** `initializeAuth` (lines 57–84), called from `useEffect` at line 52  
**Code:**
```ts
const response = await api.get("/verify");
```
**Problem:** On page load at `/select-company` or `/`, the axios interceptor (`axiosConfig.ts` lines 36–52) extracts company/app from the URL path but finds none, so `config.baseURL` = `${API_HOST}/api`. The request hits `GET /api/verify` instead of `GET /api/:company/:app/verify`. If the backend requires slug context for verify, the token check always fails, and all returning users are silently logged out.  
**Fix:** Store the company/app slugs in localStorage and inject them explicitly into the verify call rather than relying on URL extraction.

---

### E12 — Wrong max score values in MyProgress (inconsistent with AnalysisDetail)
**File:** `src/pages/user/MyProgress.tsx`  
**Function:** `loadProgress` (lines 54–174)  
**Code (lines 87–93):**
```ts
metrics = {
  modelCommunication: { score: 0, maxScore: 40 }, // ← should be 30
  languageQuality:    { score: 0, maxScore: 25 }, // ✓ correct
  medicalAccuracy:    { score: 0, maxScore: 15 }, // ← should be 25
  closingOrientation: { score: 0, maxScore: 20 }, // ✓ correct
}
```
**Problem:** `AnalysisDetail.tsx:getMaxForSection` (lines 99–107) defines:
- `model_communication_compliance` → max **30**
- `medical_scientific_accuracy` → max **25**

MyProgress uses 40 and 15 respectively. The progress bars and averages in MyProgress are mathematically wrong and do not match what is shown in AnalysisDetail.  
**Fix:** Align both files: `modelCommunication.maxScore = 30`, `medicalAccuracy.maxScore = 25`.

---

### E13 — Team member filter uses wrong field to exclude self (may include manager)
**File:** `src/pages/user/Dashboard.tsx`  
**Function:** `handleLoadTeamMembers` (lines 394–442)  
**Code (lines 420–422):**
```ts
const salesmen = rows.filter((r: any) => r.role_id !== user?.role_id);
```
**Problems:**  
1. If `user?.role_id` is `undefined` (the field is optional on the `User` type), the condition `r.role_id !== undefined` is `true` for every row → the manager is included in their own team list.  
2. Filtering by `role_id` removes ALL users sharing the manager's role, not just the current user — intended to exclude self but has collateral effect.  
**Fix:** Filter by `r.id !== user?.id` to exclude only the logged-in user, not their entire role.

---

### E14 — Admin `AddUser` form sends `mutate()` without `company_id`
**File:** `src/pages/admin/AddUser.tsx`  
**Function:** `formik.onSubmit` (lines 92–127)  
**Code (lines 106–116):**
```ts
const response = await mutate({
  resource: "users",
  fields: ["id", "name", "email"],
  data: {
    name: values.name,
    email: values.email,
    password: values.password,
    role_id,
    team_id,
    // ← company_id is never passed
  },
});
```
**Problem:** The form collects the company name (via dropdown), but `company_id` (the FK needed for DB insert) is never resolved or sent. New users will be created without a company association, breaking all company-scoped queries.  
**Fix:** Look up the selected company's `id` from the loaded `companies` array and pass `company_id` in the `data` object.

---

### E15 — `AddUser` fetches teams and roles from undocumented public endpoints
**File:** `src/pages/admin/AddUser.tsx`  
**Function:** `fetchData` (lines 60–80), inside `useEffect` at line 59  
**Code (lines 63–66):**
```ts
api.get<Team[]>(buildPublicApiUrl("/teams")),
api.get<Role[]>(buildPublicApiUrl("/roles")),
```
**Problem:** `buildPublicApiUrl("/teams")` → `GET /api/public/teams` and `GET /api/public/roles` are not in the documented backend spec. If these routes don't exist, all team and role dropdowns are empty and users cannot be assigned to any team/role.  
**Fix:** Use `query({ resource: "teams", ... })` and `query({ resource: "roles", ... })` via the api-builder.

---

### E16 — 404 catch-all route is commented out
**File:** `src/App.tsx`  
**Function:** `App` (lines 256–264)  
**Code:**
```tsx
{/* <Route
  path="*"
  element={
    <div style={{ padding: "2rem" }}>
      <h1>404 - Not Found</h1>
      ...
    </div>
  }
/> */}
```
**Problem:** No wildcard route exists. Any mistyped or stale URL renders a completely blank page with no error or navigation aid.  
**Fix:** Uncomment or implement a proper 404 page.

---

### E17 — `PastRecordings` useEffect missing `user` in dependency array
**File:** `src/pages/user/PastRecordings.tsx`  
**Function:** Component body `useEffect` (line 33–35)  
**Code:**
```ts
useEffect(() => {
  load();
}, []); // ← user not in deps
```
**Problem:** `load()` (lines 37–70) uses `user?.name` to filter recordings. With empty deps, `load()` only runs once on mount. If `user` is `null` at mount time (auth still initializing), recordings load with no filter (all records returned). The component never re-fetches when user becomes available.  
**Fix:** Add `user` to the dependency array: `}, [user])`.

---

### E18 — `CompanyDocuments` useEffect missing `teamId` in dependency array
**File:** `src/pages/admin/CompanyDocuments.tsx`  
**Function:** Component body `useEffect` (lines 64–67)  
**Code:**
```ts
useEffect(() => {
  load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tab]); // ← teamId not in deps
```
**Problem:** `load()` uses `teamId` to filter team documents, but `teamId` is not in the effect's dependency array. Changing `teamId` and clicking the Refresh button manually works, but the component does not automatically reload when `teamId` is updated, making the filter UX broken without a manual refresh click.  
**Fix:** Add `teamId` to the dependency array.

---

### E19 — Back button on quick-phase dashboard navigates authenticated users to login (redirect flash)
**File:** `src/components/AppShell.tsx`  
**Function:** `computeBackTarget` (lines 33–58)  
**Code (lines 47–48):**
```ts
if (phase === "quick") return `/${company}/${appSlug}/login`;
```
**Problem:** An authenticated user on the main dashboard (`?phase=quick`) who presses the global back button is sent to the login page. `Login.tsx` immediately detects `isAuthenticated === true` (its `useEffect` at line 38) and redirects them back to `?phase=quick`. This causes a visible flash/redirect loop on every back press.  
**Fix:** Return `null` for the quick phase so the browser's native `navigate(-1)` is used, or redirect to `/select-company` instead of the login page.

---

### E20 — `console.log` called directly in `UserDashboard` render body (runs every render)
**File:** `src/pages/user/Dashboard.tsx`  
**Function:** `UserDashboard` (component body, lines 151–154)  
**Code:**
```ts
console.log(
  "[USER DASHBOARD] Rendering user dashboard component - pathname:",
  location.pathname,
);
```
**Problem:** This `console.log` is not inside a `useEffect` or event handler — it is in the render function body and executes on every single render of the dashboard. In React Strict Mode (which is enabled in `src/main.tsx`), every render runs twice in development. This floods the console and also signals unintended work on every render cycle.  
**Fix:** Remove the log or move into a `useEffect` with appropriate deps.

---

## MEDIUM-PRIORITY ERRORS
> Stale code, dead code, or quality issues that will surface as bugs during growth.

---

### E21 — Duplicate field entries in `audio_recordings` manifest
**File:** `src/api-builder/manifest.json`  
**Lines:** 35, 37, 38 (inside the `audio_recordings` resource `fields` array)  
**Problem:** Fields `"analysis"`, `"score"`, and `"keywords_of_improvement"` each appear twice. The `validateFields` function in `validate.ts` builds a `Set` from the fields list, so duplicates don't cause a validation error, but they indicate schema drift and may confuse future developers or tooling.  
**Fix:** Remove the duplicate entries at lines 35–38.

---

### E22 — Empty import from react-router-dom (dead code)
**File:** `src/pages/user/MyProgress.tsx`  
**Function:** Module level (line 14)  
**Code:**
```ts
import {} from "react-router-dom";
```
**Problem:** Imports nothing. Dead import. TypeScript/ESLint may silently ignore it, but it signals an abandoned refactor.  
**Fix:** Remove the line entirely.

---

### E23 — `errorLogger.ts` is an empty file — any consumer will get runtime errors
**File:** `src/utils/errorLogger.ts`  
**Problem:** The file exists (1 empty line) but exports nothing. If any file imports and calls a function from it (e.g., `logError(...)`), it will throw `TypeError: logError is not a function` at runtime. The file was referenced in the architecture plans as a required utility.  
**Fix:** Either implement the logger or remove the file and all imports of it.

---

### E24 — `More.tsx` has dead navigation code that can never execute
**File:** `src/pages/user/More.tsx`  
**Function:** `handleTabChange` / `onClick` (lines 145–150)  
**Code:**
```ts
if (item.id === "pastRecordings") {
  navigate(`/${company}/${app}/past-recordings`);
}
```
**Problem:**  
1. No item in the `menuItems` array (lines 32–58) has `id: "pastRecordings"` — all items have `disabled: true` and IDs `"profile"`, `"settings"`, `"help"`, `"about"`. This block can never execute.  
2. The route `/:company/:app/past-recordings` does not exist in `src/App.tsx` — even if the button were added, the navigation would show a blank page.  
**Fix:** Remove the dead `if` block or wire it to an actual route.

---

### E25 — `AnalysisDetail` destructures unused route params
**File:** `src/pages/user/AnalysisDetail.tsx`  
**Function:** `AnalysisDetail` (lines 110–113)  
**Code:**
```ts
const { company, app, id } = useParams<{
  company: string; app: string; id: string;
}>();
```
**Problem:** `company` and `app` are destructured but never referenced anywhere in the component. The back navigation is handled by `AppShell`, so these are genuinely unused. Minor dead code, but could mislead a developer into thinking the component uses slug context.  
**Fix:** Destructure only `id`.

---

### E26 — `generateRecommendations` uses `Math.random()` — non-deterministic analysis output
**File:** `src/utils/analysisFormatter.ts`  
**Function:** `generateRecommendations` (lines 238–268)  
**Code (lines 255–262):**
```ts
while (recs.length < 4 && generic.length > 0) {
  const randomIdx = Math.floor(Math.random() * generic.length);
  recs.push(generic.splice(randomIdx, 1)[0]);
}
```
**Problem:** When fewer than 4 specific learning areas are identified, generic recommendations are selected randomly. Two calls with the same analysis input (but as an object rather than a string) return different recommendations since only string inputs are cached. This makes the UI non-deterministic for object inputs.  
**Fix:** Use a deterministic selection (e.g., slice the first N generics) instead of `Math.random()`.

---

### E27 — Multiple `console.log` / `console.error` statements in production handlers
**Locations:**
| File | Function | Lines |
|---|---|---|
| `src/pages/user/Dashboard.tsx` | `UserDashboard` render body | 151–154 |
| `src/pages/user/Dashboard.tsx` | `useEffect` (phase/permission check) | 174–195 |
| `src/pages/user/Dashboard.tsx` | `handleLoadTeamMembers` | 397–399, 417–419, 424, 428 |
| `src/pages/auth/Login.tsx` | `formik.onSubmit` | 87, 95–99, 105–110, 136 |
| `src/pages/user/Dashboard.tsx` | `saveRecording` / `AudioRecorder` | 313, 324 |

**Problem:** Debug-level logs left in production paths expose internal state (user objects, tokens, route logic) to the browser console. These are not behind a dev-mode guard.  
**Fix:** Remove all `console.log` calls from production code. Keep only `console.warn` / `console.error` for genuine unexpected failures.

---

### E28 — `handleLoadTeamMembers` called without `await` inside `useEffect`
**File:** `src/pages/user/Dashboard.tsx`  
**Function:** `useEffect` (lines 164–198)  
**Code (line 185):**
```ts
handleLoadTeamMembers();  // ← no await, fire-and-forget
```
**Problem:** Calling an async function without `await` inside a non-async callback means any unhandled rejections are silently swallowed. While `handleLoadTeamMembers` has a `catch` block, any error in the function before the try/catch (e.g., a thrown import error) won't propagate to the component error boundary.  
**Fix:** Wrap in a proper try/catch or use `.catch(console.error)` explicitly, and be explicit that fire-and-forget is intentional.

---

## SUMMARY TABLE

| ID | Severity | File | Function | Line(s) | Description |
|----|----------|------|----------|---------|-------------|
| E01 | **BLOCKING** | `src/components/AudioRecorder.tsx` | `AudioRecorder` | 100–104 | `setTitle()` in render body → infinite re-renders |
| E02 | **BLOCKING** | `src/pages/user/Dashboard.tsx` | `UserDashboard` | 539–543 | `setPhaseAndUrl()` in render body → infinite re-renders |
| E03 | **BLOCKING** | `src/pages/user/Dashboard.tsx` | `loadMedicines` | 203–213 | Wrong field `"medicines"` vs `"medicine"` → validation throws |
| E04 | **BLOCKING** | `src/pages/user/CallHistory.tsx` | `runHistoryAnalysis` | 92–97 | No auth header + undocumented endpoint → 401 |
| E05 | **BLOCKING** | `src/pages/admin/CompanyDocuments.tsx` | `handleFile` | 81–88 | Nonexistent upload endpoint + no auth header |
| E06 | **BLOCKING** | `src/pages/admin/CompanyDocuments.tsx` | `handleSaveMedicine` | 151–155 | Nonexistent medicine-save endpoint |
| E07 | **BLOCKING** | `src/pages/admin/RoleMapping.tsx` | `fetchData` | 50–51 | Nonexistent `/public/capabilities` endpoint → empty chips |
| E08 | **BLOCKING** | `src/api-builder/client.ts` | `send` | 37–42 | Retry fallback points to Vite dev server, not backend |
| E09 | **BLOCKING** | `src/api-builder/client.ts` | module level | 2 | Imports from `axiosConfig` — crashes if env var is missing |
| E10 | **HIGH** | `src/contexts/AuthContext.tsx` | `getHomePath` | 118–130 | Wrong redirect paths — missing slugs and wrong suffix |
| E11 | **HIGH** | `src/contexts/AuthContext.tsx` | `initializeAuth` | 61 | `/verify` called without company/app slugs on load |
| E12 | **HIGH** | `src/pages/user/MyProgress.tsx` | `loadProgress` | 87–93 | Wrong max score values (40/15 vs 30/25) |
| E13 | **HIGH** | `src/pages/user/Dashboard.tsx` | `handleLoadTeamMembers` | 420–422 | Filter excludes all of manager's role, not just self |
| E14 | **HIGH** | `src/pages/admin/AddUser.tsx` | `formik.onSubmit` | 106–116 | `company_id` never sent → users created without company |
| E15 | **HIGH** | `src/pages/admin/AddUser.tsx` | `fetchData` | 63–66 | Teams/roles fetched from undocumented public endpoints |
| E16 | **HIGH** | `src/App.tsx` | `App` | 256–264 | 404 catch-all route commented out → blank pages |
| E17 | **HIGH** | `src/pages/user/PastRecordings.tsx` | `useEffect` | 33–35 | Missing `user` dep → loads unfiltered on mount |
| E18 | **HIGH** | `src/pages/admin/CompanyDocuments.tsx` | `useEffect` | 64–67 | Missing `teamId` dep → filter doesn't auto-reload |
| E19 | **HIGH** | `src/components/AppShell.tsx` | `computeBackTarget` | 47–48 | Back button sends authenticated user to login → redirect flash |
| E20 | **HIGH** | `src/pages/user/Dashboard.tsx` | `UserDashboard` | 151–154 | `console.log` in render body → runs every render |
| E21 | **MEDIUM** | `src/api-builder/manifest.json` | `audio_recordings.fields` | 35, 37, 38 | Duplicate field entries |
| E22 | **MEDIUM** | `src/pages/user/MyProgress.tsx` | module level | 14 | `import {} from "react-router-dom"` — empty import |
| E23 | **MEDIUM** | `src/utils/errorLogger.ts` | — | — | File is empty — any caller will get runtime TypeError |
| E24 | **MEDIUM** | `src/pages/user/More.tsx` | `onClick` | 147–150 | Dead navigation block: item ID never exists + route missing |
| E25 | **MEDIUM** | `src/pages/user/AnalysisDetail.tsx` | `AnalysisDetail` | 110–113 | `company` and `app` params destructured but never used |
| E26 | **MEDIUM** | `src/utils/analysisFormatter.ts` | `generateRecommendations` | 252–265 | `Math.random()` → non-deterministic analysis output |
| E27 | **MEDIUM** | Multiple files | Multiple handlers | See above | Debug `console.log` statements left in production |
| E28 | **MEDIUM** | `src/pages/user/Dashboard.tsx` | `useEffect` | 185 | `handleLoadTeamMembers()` called without await or catch |
