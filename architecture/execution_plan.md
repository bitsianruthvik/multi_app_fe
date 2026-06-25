# Frontend Remediation — Execution Plan

> Created: 2026-05-17
> Scope: **READ/WRITE ONLY** inside `C:\Users\Digital Initiatives\Desktop\TM\multi_app_fe`.
> **DO NOT TOUCH** any file under `C:\Users\Digital Initiatives\Desktop\TM\multi_app_be`. Backend may be **read** for reference (e.g., `architecture/API_REFERENCE.md`) but never modified.
> Source: `multi_app_fe/architecture/todo.md`

---

## Selection — Top 10 Items (by impact × blast-radius)

| # | Todo ID | Item | Rationale |
|---|---------|------|-----------|
| 1 | 1.1 + 1.14 + 1.15 | Auth/API client consolidation (token, env var, slug reactivity) | Foundational — every other API call depends on it |
| 2 | 1.16 | `uiPermissions` hook + gating | Security gap; unlocks admin route hardening |
| 3 | 1.6 + 1.7 + 1.8 + 1.11 | Audio pipeline endpoint alignment | FE silently calls undocumented/wrong endpoints |
| 4 | 1.9 + 1.13 | Admin CRUD via `base_resource` + manifest expansion | Removes 4 undocumented admin endpoints |
| 5 | 1.17 + 1.20 + U1 | Admin dashboard live aggregates | Replaces hardcoded zeros with real data |
| 6 | P1 + U8 | Dashboard god-component split + phase indicator | 1 911-line file; biggest perf+UX win |
| 7 | P2 | Route-level code splitting | First-load bundle reduction |
| 8 | P3 + P4 + U9 | AudioRecorder: AudioContext lifecycle, rAF cleanup, near/far UX | Memory leaks + UX clarity in single hot file |
| 9 | P5 + P9 + U10 | `AnalysisDetail` memoization + auto-expand weakest section | Single file, perf + UX combined |
| 10 | P6 + P7 + P8 + 1.19 | `CallHistory` / `MyProgress`: pagination, field selection, polling cleanup, drop raw fetch | Network + memory + bugfix bundle |

---

## Groups (5) — Each Dispatched as ONE Sub-Agent

Grouping rule: items that touch overlapping files run in a single sub-agent to avoid merge conflicts and re-reads. Independent groups run **in parallel** to save wall-clock + tokens.

### Group A — API Client & Auth Foundation
**Covers:** Top-10 items 1, 2
**Files (write):**
- `src/contexts/AuthContext.tsx`
- `src/api/client.ts`
- `src/utils/axiosConfig.ts`
- `src/shared/services/apiClient.ts` (if exists under `src/shared/...` — locate first)
- New: `src/hooks/usePermission.ts`
**Sub-agent:** `general-purpose` (must run **first**; everything else builds on these clients)
**Run mode:** Foreground, sequential before B–E.
**Token-saving directives for agent:**
- Read only the 4 client files + `architecture/API_REFERENCE.md` (BE — read-only).
- Decide: **keep localStorage Bearer** (smaller diff, current behaviour). Document decision in code comment header of `client.ts`.
- Make `shared/services/apiClient.ts` attach `Authorization` header and read `VITE_API_BASE_URL`.
- Move slug extraction inside the axios request interceptor (per-request).
- Remove module-level `console.debug` from `axiosConfig.ts`.
- Add `usePermission(tag)` hook reading `user.uiPermissions` from AuthContext; export from `src/hooks/index.ts` (create if missing).
- Do **not** refactor unrelated code. Do **not** add backwards-compat shims.

---

### Group B — Audio Pipeline Endpoint Alignment
**Covers:** Top-10 item 3
**Files (write):**
- `src/pages/user/AudioReview.tsx`
- `src/components/AudioRecorder.tsx` (URL + FormData call paths only — perf changes are Group D)
- `src/pages/user/AnalysisDetail.tsx` (only if it issues `/analyze_by_id_async`)
**Sub-agent:** `general-purpose`
**Run mode:** Parallel with C, D, E (after A completes).
**Directives:**
- Switch `/api/transcribe` → `POST /api/${company}/${app}/audio/transcribe` body `{ audio_id }`.
- Replace `/api/query/v1/debug/audio/:id` with api-builder `query({ resource:"audio_recordings", filters:{ "id.eq": id } })`.
- Remove `/analyze_by_id_async` triggers — analysis is automatic post-transcription; poll `audio_recordings.status` instead.
- Switch `AudioRecorder` upload from base64 `base_resource` insert to `POST /api/${company}/${app}/audio/upload` `FormData{ audio_file, title, status, idempotencyKey }`.
- Use the consolidated `src/api/client.ts` (from Group A) — never `shared/services/apiClient.ts` for authed calls.

---

### Group C — Admin: Endpoints, Manifest & Live Dashboard
**Covers:** Top-10 items 4, 5
**Files (write):**
- `src/api-builder/manifest.json`
- `src/pages/admin/AddUser.tsx`
- `src/pages/admin/AddFeature.tsx`
- `src/pages/admin/AddCapability.tsx`
- `src/pages/admin/RoleMapping.tsx`
- `src/pages/admin/Dashboard.tsx`
**Sub-agent:** `general-purpose`
**Run mode:** Parallel with B, D, E.
**Directives:**
- Extend `manifest.json` with: `companies`, `apps`, `roles`, `teams`, `features`, `features_capability`, `role_capability`, `company_documents`, `team_documents`. Field lists per BE `resourceDef.json` (read `multi_app_be/architecture/API_REFERENCE.md` only).
- Replace `/admin/add-user|add-feature|add-feature-capability` and RoleMapping inserts with `base_resource` `operation:"insert"` calls.
- Replace admin `Dashboard.tsx` hardcoded zeros with `aggregate:{ functions:[{fn:"COUNT", field:"*", alias:"total"}] }` queries on `users`, `audio_recordings`, `features` + a `GET /api/admin/jobs/status` call for queue health.
- Use `usePermission` (Group A) to gate the sidebar items.

---

### Group D — Recorder + Analysis Hot-Path Performance
**Covers:** Top-10 items 8, 9
**Files (write):**
- `src/components/AudioRecorder.tsx`
- `src/pages/user/AnalysisDetail.tsx`
- `src/utils/analysisFormatter.ts` (only if a module-level cache is added)
**Sub-agent:** `general-purpose`
**Run mode:** Parallel with B, C, E. **Coordinate with Group B** on `AudioRecorder.tsx`: B owns endpoint/URL/body changes; D owns lifecycle/refs/UX. They edit disjoint regions — run D **after** B to avoid edit conflicts.
**Directives:**
- `AudioContext` + `GainNode` + `BiquadFilterNode`: create lazily in a `useRef`, init on first start, `close()` in `useEffect` cleanup.
- Store `requestAnimationFrame` id in a ref; `cancelAnimationFrame` in cleanup.
- Add tooltip/info icon explaining Near vs Far mode (one short sentence each).
- `AnalysisDetail`: wrap `formatAnalysis(raw)` in `useMemo([rawAnalysis])`.
- Auto-expand the lowest-scoring accordion on mount; add red/amber/green chip on every accordion summary.

---

### Group E — Lists, Polling, Code-Splitting & God-Component Split
**Covers:** Top-10 items 6, 7, 10
**Files (write):**
- `src/App.tsx` (lazy + Suspense)
- `src/pages/user/Dashboard.tsx` → split into:
  - `src/pages/user/dashboard/QuickCapture.tsx`
  - `src/pages/user/dashboard/BrandDashboard.tsx`
  - `src/pages/user/dashboard/FullDashboard.tsx`
  - `src/pages/user/dashboard/HistoryDrawer.tsx`
  - `src/pages/user/dashboard/PhaseIndicator.tsx`
- `src/pages/user/CallHistory.tsx`
- `src/pages/user/MyProgress.tsx`
- `src/pages/user/PastRecordings.tsx`
**Sub-agent:** `general-purpose`
**Run mode:** Parallel with B, C, D (after A).
**Directives:**
- `App.tsx`: every route element → `React.lazy(() => import(...))`, wrap `<Routes>` in `<Suspense fallback={<CircularProgress/>}>`. Prioritise admin + AnalysisDetail + MyProgress.
- Split `Dashboard.tsx` strictly by phase. Wrap drawer + history list in `React.memo`. Add `PhaseIndicator` (segmented control) at top.
- Add `pagination:{ limit:50 }` and explicit `fields:[...]` (no `audio_data`) to every list query in `CallHistory.tsx`, `MyProgress.tsx`, `PastRecordings.tsx`.
- `CallHistory.tsx` polling: store interval id in ref, `clearInterval` in cleanup.
- `PastRecordings.tsx`: replace raw `fetch()` with `query(...)` from api-builder.

---

## Execution Order

```
Phase 1 (sequential, blocking):
  Group A   ── API client foundation, usePermission

Phase 2 (parallel, after A merges):
  Group B   ── Audio endpoints
  Group C   ── Admin CRUD + manifest + live dashboard
  Group E   ── Lists/Dashboard split/Code-splitting

Phase 3 (after B):
  Group D   ── AudioRecorder lifecycle + AnalysisDetail perf/UX
```

Phase 2 groups are dispatched in **one message with three parallel `Agent` calls** to minimise orchestrator round-trips.

---

## Cross-Group Guardrails (every sub-agent must follow)

1. **Never** read or write anything under `C:\Users\Digital Initiatives\Desktop\TM\multi_app_be\` except the two reference docs (`API_REFERENCE.md`, `routes.md`, `data-access.md`) — read-only.
2. No new dependencies without listing them in the agent's report.
3. No backwards-compat shims, no commented-out old code, no migration notes in code comments.
4. Match existing code style (MUI `sx`, TS strictness, file casing).
5. Each agent reports back: files changed, files created, any deferred items, any backend behaviour assumptions it made.
6. Do **not** delete `shared/services/apiClient.ts` in Group A — Group B still imports it during its turn; mark it for removal but leave the export surface until B switches over.

---

## Token-Efficiency Tactics

- Each group is bounded to a small file set; agents are instructed not to grep the whole tree.
- Group A's output (the new `client.ts` contract + `usePermission` signature) is summarised in the parent context and passed verbatim into B/C/D/E prompts — those agents never re-read the file.
- The 1 911-line `Dashboard.tsx` is only opened by Group E. Other groups must not read it.
- BE docs are read once (by A) and cached in the parent's context summary; B/C reference the summary, not the file.

---

## Deferred (Not in Top 10 — Track for Next Pass)

1.2, 1.3, 1.4, 1.5, 1.10, 1.12, 1.18 · U2, U3, U4, U5, U6, U7 · P10 (subsumed into Group A partially)

---

## Post-Review Corrections (2026-05-17)

After reading the actual source:

- **Group A** is smaller than originally scoped: `src/api/client.ts` is already correct. Work reduces to (a) fix `shared/services/apiClient.ts` env var + auth header, (b) move slug extraction into axios request interceptor, (c) drop module-level `console.debug`, (d) add `usePermission` hook.
- **Group C** must extend `src/api-builder/index.ts` `query()` to accept an `aggregate` argument (with field-validation bypass when aggregate is present), bump `manifest.json` `schemaVersion` `"1.2" → "1.3"` so cached manifests are invalidated, and add `created_at` filter ops to `audio_recordings`.
- **Group E — P1 deferred**: full split of `Dashboard.tsx` (1 910 lines) is too high-risk for this batch. Implement only U8 (phase indicator) inline. All other Group E items (code-splitting, pagination, polling cleanup, PastRecordings refactor) proceed.
- **`initRegistryRefresh()`** default URL `/schema/resources` is unreachable on backend — guard so accidental call no-ops cleanly. Not currently invoked from `App.tsx`.
