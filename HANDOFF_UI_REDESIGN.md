# Hand-off: Fab ERP roles + full UI/UX redesign

> **For:** the implementing engineer (Sonnet). **You are picking this up cold** — read this whole
> file plus [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) before writing code. The design system is the
> single source of truth for *how things look*; this file is *what to do*.
>
> **Two tasks, in order:**
> 1. Divide the app's scope into multiple **roles** with scoped **access**.
> 2. Go through **every screen** and apply the UI/UX from `DESIGN_SYSTEM.md`.

---

## Ground rules (apply to both tasks)

- **Local-first.** Do everything against the local stack (`.\start-dev.bat`, backend `:4000`,
  frontend `:5173`, MySQL `sqldb`). **Do NOT deploy** to Render/Vercel/TiDB — the user pushes to
  live only after they approve locally.
- **Behavior-preserving.** This is a roles + visual/structural refactor. Do not change business
  logic, API contracts, or data. If a screen works today, it must still work after.
- **Verify continuously.** After each screen/change run `cd multi_app_fe && npm run lint` and keep
  `npm run build` green. Don't batch 20 broken screens.
- **One source of truth.** If something in `DESIGN_SYSTEM.md` is wrong for the real workflow, fix the
  doc first, then implement.
- **Work screen-by-screen / role-by-role.** Small, verifiable commits. Don't rewrite everything in
  one pass.

### Key files you'll touch
| Concern | Path |
|---|---|
| Design system (read first) | `multi_app_fe/DESIGN_SYSTEM.md` |
| Nav definition | `multi_app_fe/src/apps/fab_erp/index.ts` (`buildUserNav`) |
| Routes | `multi_app_fe/src/apps/fab_erp/routes.tsx` |
| Sidebar shell (CSS-var contract) | `multi_app_fe/src/core/components/Sidebar.tsx` |
| MUI theme | `multi_app_fe/src/theme.ts` |
| Permission hook | `@core/hooks/usePermission` → `usePermission('feature_tag')` |
| Screens | `multi_app_fe/src/apps/fab_erp/pages/*` and `.../components/*` |
| Backend write-permission map | `multi_app_be/apps/fab_erp/config/resourcePermissions.js` |
| Role/permission tables | `roles`, `features`, `features_capability`, `role_capability`, `app_user_access` |
| Seed pattern to copy | `seed_placebo.sql` (root) |

---

## TASK 1 — Roles & accesses

**Goal:** stop showing every user all 10 modules. Partition the app's capabilities into four
purposeful roles (plus Admin), so each user sees a scoped, role-appropriate slice. This is both a
**data** change (roles + capabilities in the DB) and a **UX** change (nav grouping + cockpit per
role). The frontend already gates nav items by `permission` tag, so most access falls out of
assigning the right feature_tags to each role.

### 1a. Confirm the role model
Use the four roles from `DESIGN_SYSTEM.md` §2.3 (plus existing **Admin** = full access, which already
bypasses checks via `role === 'admin'`):

| Role (slug) | World | Owns |
|---|---|---|
| `pm` (PM / Sales) | Operate | Orders: capture, confirm, track, ship |
| `planner` | Operate | MRP, Planning Workbench, Scheduler |
| `stores` (Stores / Buyer) | Operate | Purchase orders, GRN/receiving, stock |
| `engineer` (Engineering) | Configure | Items, BOMs, routings, resources, calendars, taxonomy |
| `admin` | both | everything |

> `pm` and `planner` already exist per company. Add `stores` and `engineer`. Confirm the real org's
> role names with the user if they differ — but build to these unless told otherwise.

### 1b. Build the access matrix (verify exact tags against `resourcePermissions.js` + the `features` table)
Proposed feature_tag grants per role. `view` = read screen; `manage` = write. **Verify each tag
exists** before seeding (don't invent tags):

| Capability area | `pm` | `planner` | `stores` | `engineer` |
|---|:--:|:--:|:--:|:--:|
| `fab_erp_projects_*` (Orders, Workbench) | view+manage | view | view | — |
| `fab_erp_planning_*` (MRP) | — | view+manage | — | — |
| `fab_erp_scheduler_*` | — | view+manage | — | — |
| `fab_erp_grn_*` (GRN, Suppliers) | — | — | view+manage | — |
| `fab_erp_inventory_*` (stock, batches) | view | view | view+manage | view |
| `fab_erp_stock_location_manage` | — | — | manage | — |
| `fab_erp_items_meta_*` | view | view | view | view+manage |
| `fab_erp_taxonomy_manage` | — | — | — | manage |
| `fab_erp_formulas_*` | — | — | — | view+manage |
| `fab_erp_templates_*` | — | — | — | view+manage |
| `fab_erp_process_master_manage` | — | — | — | manage |
| `fab_erp_resources_*` (incl. routing plans) | — | view | — | view+manage |
| `fab_erp_resource_type_properties_manage` | — | — | — | manage |
| `fab_erp_calendars_*` | — | view | — | view+manage |

(`view+manage` = include both the `_view` and `_manage` tags. Read-only roles get only `_view`.)

### 1c. Seed the roles + capabilities (data)
- Follow the `seed_placebo.sql` pattern: insert `roles` rows (`stores`, `engineer`) per company,
  insert `features_capability` rows whose `features_json` holds the feature **ids** for that role's
  tag set, and `role_capability` rows linking role→capability→app→company.
- Do it for the demo companies you're testing with locally (e.g. `placebo`, `starhub`). Create a
  reusable `seed_roles.sql` so it's repeatable per company.
- Make sure each role maps to real `features.id` values (look them up; don't hardcode stale ids).
- **Reminder:** permission resolution uses `JSON_CONTAINS` (already fixed) — your `features_json`
  arrays must contain integer ids.

### 1d. Make access actually scope the UI (frontend)
- **Regroup the nav** in `buildUserNav` (`index.ts`) into two sections — `OPERATE` and `CONFIGURE` —
  matching `DESIGN_SYSTEM.md` §3. Add a section-label concept to `Sidebar.tsx`'s `NavItem`/render so
  it shows the 11px caps group labels. Keep the existing collapse behavior and `--sidebar-*` CSS-var
  contract.
- Nav items already filter by `permission`; once 1c is seeded, each role auto-sees only its items.
  Verify: log in as each role and confirm the rail shows the right subset.
- **Cockpit (`/home`) content is role-aware** — each role's work-queue cards are gated with
  `usePermission(tag)` and built from real queries (e.g. PM: orders where `status='draft'`). See
  Task 2 / archetype 4.1.
- Backend writes are already gated by `resourcePermissions.js` against the JWT's `uiPermissions`;
  confirm the new roles' tags line up with those required tags (e.g. Orders write needs
  `fab_erp_projects_manage`, which only `pm`/`admin` have).

### Task 1 acceptance
- Logging in as `pm`, `planner`, `stores`, `engineer`, `admin` each shows a **different, sensible**
  nav (grouped Operate/Configure) and a different cockpit.
- A role cannot reach (or write) a screen outside its access — verify both the hidden nav and that a
  direct URL/API write is rejected (403) for an ungranted action.
- `seed_roles.sql` exists and is re-runnable per company.

---

## TASK 2 — Apply the UI/UX to every screen

**Goal:** bring every Fab ERP screen up to `DESIGN_SYSTEM.md` — violet accent, solid surfaces with
elevation (glass only on top bar + modals), Geist + JetBrains Mono, the 8 archetypes, and the
purposeful micro-interactions.

### 2a. Install the foundation — DONE, scoped to fab_erp only

The platform's `src/styles/theme.css` / `theme.ts` are shared by `audio_intelligence` and
`sales_control` too, so this was implemented as a **fab_erp-scoped override**, not a global edit
(user decision: "fab_erp only, scoped override"). What actually landed, for reference:

1. `index.html` — Geist + JetBrains Mono `<link>` tags. ✅ (global, harmless — unused font names
   don't affect other apps' rendering.)
2. `src/theme/tokens.css` (imported once in `main.tsx`) — all §5 CSS variables, the `.glass` class,
   `@supports`/`prefers-reduced-transparency`/`prefers-reduced-motion` fallbacks, and
   `:focus-visible`. **Every selector is anchored to `html[data-app='fab_erp']`** (not bare
   `[data-app='fab_erp']` — see pitfall below), so audio_intelligence/sales_control never match.
3. `src/core/components/AppShell.tsx` — `FabErpThemeScope` wraps fab_erp routes only (matched via
   `useMatch('/:company/fab_erp/*')`). It (a) sets `data-app="fab_erp"` on `document.documentElement`
   in a `useEffect` — **not** a wrapper `<div>` — because MUI's Drawer/Menu/Dialog/Tooltip portal to
   `document.body`, which would sit outside a wrapper's DOM subtree and never inherit the CSS vars;
   and (b) wraps children in a nested `<ThemeProvider theme={createFabErpTheme(mode)}>` for the
   MUI palette/typography/component overrides, which propagate via React context so portals are fine.
4. `src/apps/fab_erp/theme.ts` — `createFabErpTheme(mode)`, a standalone MUI theme (violet palette,
   Geist typography, solid-elevation component overrides). Deliberately NOT derived from the shared
   `createAppTheme` to keep zero coupling.
5. Shared primitives went in **`src/apps/fab_erp/components/`** (`Surface.tsx`, `GlassBar.tsx`,
   `StatusBadge.tsx`) and **`src/apps/fab_erp/hooks/useCountUp.ts`** / **`src/apps/fab_erp/statusMap.ts`**
   — NOT `src/shared/components/` as originally written above. They read fab_erp-only CSS vars
   (`--c-*`, `--e-*`), so putting them in the genuinely-platform-shared folder would silently break
   if another app ever imported them.

**Pitfall hit and fixed, worth knowing if you touch this again:**
- A CSS comment containing a literal `*/` substring (e.g. writing `--sidebar-*/--color-*` in prose)
  closes the comment block early and silently corrupts everything until the next real `*/` — this
  ate the entire first rule block in `tokens.css` until caught via DOM inspection. Same issue hit a
  JSDoc comment in `theme.ts`. Avoid `*/` appearing in any comment text, including inside word-glob
  patterns like `foo-*/bar-*`.
- `data-app` lives on `<html>`, which **is** `:root`. A bare `[data-app='fab_erp']` selector ties in
  specificity with the platform's existing `:root { --sidebar-bg: ... }` rules (in `theme.css` and
  `index.css`), and since `index.css` imports last, it silently won the tie. Fixed by anchoring to
  `html[data-app='fab_erp']`, which has strictly higher specificity than `:root` regardless of
  import order.

Verified via the Claude Preview tool: fab_erp shows violet accent/avatar + dark violet-tinted sidebar;
navigating to the company app-selector (outside fab_erp) confirmed `data-app` is removed from `<html>`.

> Get the user to eyeball this locally before going further on 2b/2c.

### 2b. Re-shell the app
- Grouped solid rail (from Task 1d) + **glass top bar** with breadcrumbs + `⌘K` command-palette stub
  + avatar/notifications.
- Add the **`/home` cockpit** route and make it the default landing (update `routes.tsx` — currently
  redirects to `resource-types` — and `buildUserNav`).

### 2c. Convert screens, one at a time, using the route→archetype map
Work in this order (the screen the client complained about first). For each screen: identify its
archetype from `DESIGN_SYSTEM.md` §8, copy the matching §7 recipe, apply tokens (§5), add the
relevant micro-interactions (§5.7), then run the §6 a11y checklist. Match already-converted neighbors.

| Order | Screen(s) | Archetype |
|---|---|---|
| 1 | `/home` cockpit | Cockpit (4.1) |
| 2 | Orders (`SalesOrders.tsx`) + Order detail (`SalesOrderDetail.tsx`) | Pipeline (4.4) + List toggle; Detail (4.3) |
| 3 | Item Catalog (`ItemCatalog.tsx`) + detail (`ItemCatalogDetail.tsx`) | List (4.2); Detail (4.3) with BOM/Routing/Stock/Suppliers/Orders tabs |
| 4 | Suppliers + `SupplierDetail` | List + Detail |
| 5 | Plants, Resource Catalog (`ResourceTypes.tsx`), Shift Calendars | List → Detail |
| 6 | Routing Plans (`RoutingPlans.tsx`) + builder (`RoutingPlanBuilder.tsx`) | List; Canvas (4.5) |
| 7 | BOM Designer (`components/BomDesigner.tsx`) | Canvas (4.5) / Tree (4.7) |
| 8 | MRP (`MrpRun.tsx`), Planning Workbench (`PlanningWorkbench.tsx`) | Run (4.6) + Tree (4.7) |
| 9 | Scheduler (`SchedulerPage.tsx`) | Canvas (4.5) — docked solid toolbars; keep list fallback |
| 10 | GRN (`GrnEntry.tsx`, `GrnDetail.tsx`) | Run/Form (4.6) + Detail (4.3) |
| 11 | Item Metrics, Constants, Item Batches | List (4.2) |
| 12 | (new) Configure landing | Readiness (4.8) |

For **Detail** screens, always render the cross-link relationship strip from §2.2 (Item → BOM →
Routing → Stock → Suppliers → Orders, etc.). This is the feature that makes the app feel "thought
out."

### 2d. Cross-cutting requirements (every screen)
- **Status anywhere** → use `StatusBadge` (icon + label + color). Never color-only.
- **All numbers/codes** in mono with `tabular-nums`.
- **Loading** → skeletons, not centered spinners (button-local spinners are fine).
- **Errors** → surface the backend `message` (the Orders dialogs already do this; replicate the
  pattern, don't show the generic axios string).
- **Empty states** → icon + line + primary action.
- **A11y** → run the §6 checklist: focus-visible, keyboard reach, hover actions also on
  `:focus-within`, 40×40 targets, `aria-label` on icon buttons, glass fallbacks intact.

### Task 2 acceptance
- Every route in §8 matches its archetype and uses the shared recipes/tokens — no raw hex, no heavy
  legacy shadows, no Inter, no stray glass panels.
- `npm run lint` clean and `npm run build` green.
- App is fully usable with `prefers-reduced-transparency`, `prefers-reduced-motion`, and keyboard
  only.
- Each archetype looks consistent across the entities that use it (all Lists look alike, all Details
  look alike).

---

## Suggested overall sequence
1. Task 1 (roles + access + grouped nav) — establishes who sees what.
2. Task 2a–2b (foundation + shell) — instant visual modernization; checkpoint with the user.
3. Task 2c screens 1–3 (Cockpit, Orders, Items) — the high-visibility core; checkpoint again.
4. Remaining screens 4–12.
5. Hand back to the user for local approval → they deploy to live.

Check in with the user at the checkpoints (after 2b, and after Orders/Items) rather than building all
12 screens unreviewed.
