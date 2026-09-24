# Platform Design System & UX Handbook

> **Audience:** anyone — model or engineer — building a screen for **any app on this platform**,
> current or future. Fab ERP, CF_ERP, CF_HRMS and whatever comes next are all built from this
> document.
> **Goal:** give you everything needed to design *any* screen — including ones not listed here — so
> that every app feels like one deliberate, modern, accessible product instead of "a nav bar with
> tables", and so that a person who learns one app already knows how to use the next. When you meet
> a new screen, **map it onto one of the archetypes** (§4), pull the matching recipe (§7), and apply
> the tokens (§5). Do not invent a new visual language per screen or per app. Consistency is the
> product.

### Locked design decisions
- **Accent:** violet `#7C3AED`, used *sparingly* on a near-ink + slate structure. We moved off blue
  entirely — "enterprise blue" was the dated signal.
- **Glass:** **demoted.** Surfaces are solid with a soft two-layer shadow elevation system. Glass is
  used in exactly **two** places: the sticky top bar, and modal / command-palette panels and scrims.
  Nowhere else. (Glassmorphism reads muddy on a calm data background and costs contrast — solid is
  cleaner and more legible.)
- **Fonts:** **Geist** for UI/headings, **JetBrains Mono** for codes & quantities (tabular figures
  so numbers align in columns).

These are platform-wide. An app does not get its own accent, its own type scale or its own idea
about glass. If a client genuinely needs a brand colour, it changes here, once, for everyone.

---

## The kit

**`multi_app_fe/src/shared/ui` is the implementation of this document.** This file is the
reasoning; `@shared/ui` is the code.

```tsx
import { PageHeader, DataTable, StatusBadge, EmptyState } from '@shared/ui';
```

A new app imports from it and builds screens out of it. It ships the shell (`ThemeScope`,
`AppShell`, `TopNav`, `SectionNav`, `MobileNavSheet`), the primitives, the collections, the record
layouts, the overlays, the hooks and `tokens.css`. See `src/shared/ui/README.md` for the full list
and for how to use it.

**If a component you need is missing, add it to the kit — not to your app.** An app's own
`components/` folder holds only what is genuinely specific to its domain: a BOM designer, an org
chart, a shift grid. A table, a dialog, a badge, a filter bar or a nav row is never app-specific,
and a second copy of one is how two apps start looking like two products.

**`fab_erp` and `cf_erp` predate the kit.** Both are in production and both carry their own copies
of these components, which have drifted from each other. They keep those copies for now and migrate
later, as separate work. Inside those two apps, keep importing from their own `./components`; do
not mix kits within one screen. Fab ERP's app-specific information architecture — the part that
used to be §2 and §8 of this document — now lives in
`src/apps/fab_erp/DESIGN_SYSTEM_APPENDIX.md`.

---

## 0. How to use this document

For each screen you build:
1. Identify its **archetype** (§4). Each app maps its own routes to archetypes in its appendix.
2. Copy the matching **recipe** (§7) — which is to say, use the kit component — and fill in the
   entity-specific bits.
3. Use only the **tokens** (§5). Never hardcode hex, px shadows, or font names in components.
4. Add the relevant **micro-interactions** (§5.7) — purposeful feedback, never decoration.
5. Run the **accessibility checklist** (§6) before calling it done.

When unsure how a new screen should look, follow the **decision procedure** (§9).

---

## 1. Design principles

1. **Flow over inventory.** Organize around *what the user does next*, not around database tables.
   Every role lands on work, not a 10-item menu.
2. **Group by mindset, not by table.** Most business apps contain two or three distinct mindsets —
   *define the model* versus *run the operation*, *configure* versus *do*. Reflect that split in
   nav grouping, density and tone. What the groups are is each app's own question (see its
   appendix); that there are groups, and that they mean something, is not.
3. **Legibility is sacred.** Color, depth, and motion serve clarity. The moment an effect costs
   readability, it loses. Data surfaces are calm, high-contrast, solid.
4. **Show relationships.** Every one of these apps is a graph: a record has parents, children,
   documents, history, and appears on other records. Every detail screen surfaces its neighbours as
   one-click cross-links (§4.3). A detail page with no way sideways sends people back to a list to
   search again.
5. **Progressive disclosure.** Default views are sparse and scannable; depth lives one click down.
6. **Restraint reads as modern.** Near-ink structure + one earned accent + crisp solid surfaces +
   a quiet distinctive font + motion only where it confirms an action. That — not flashy effects —
   is what makes it look current.

---

## 2. Information architecture

**Each app's own.** How its world divides, which entity links to which, and which role lives where
are app questions, not platform questions — and getting them right is most of the design work.

Write them down, per app, in `src/apps/<slug>/DESIGN_SYSTEM_APPENDIX.md`:

- **The worlds** — the two or three mindsets the app contains, and which screens belong to each.
- **The entity relationship web** — a table of *from* → *links to*. This is not documentation for
  its own sake: it is the source for the cross-link chips every Detail screen renders (§4.3). If a
  row is missing from the table, that link is missing from the product.
- **Roles → flow** — for each role, where it lives and what it primarily does. A role should see
  fewer cockpit cards and fewer nav entries, never different components.

Fab ERP's: `src/apps/fab_erp/DESIGN_SYSTEM_APPENDIX.md`.

---

## 3. Navigation model — the shell

Two thin rows and a command palette. **There is no side rail.** (There was until 2026-07-30; it
cost ~240px of width permanently, which the widest screens in a data app — a Gantt, a swimlane
canvas, a board, a fifteen-column table — all wanted back. Depth moved to row 2 and to `⌘K`.)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ROW 1 — sticky glass top bar (52px) — the ONE glass surface                   │
│ [◆ App]  Section  Section  Section          [⌘K Search] [+] [☾] [bell] [av]   │
├──────────────────────────────────────────────────────────────────────────────┤
│ ROW 2 — solid section nav (40px): the active section's screens + count badges │
│  Queue ·34 open   Board   Month   Actuals   Engine   Machines ·9 running      │
├──────────────────────────────────────────────────────────────────────────────┤
│ MAIN (solid canvas, scrolls)                                                  │
│   PageHeader (title + actions) → optional StatStrip → archetype body          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Row 1 — primary sections and the chrome that works
- The **app mark** on the left links to the home/cockpit route.
- The **primary sections**, each underlined when active. The underline sits on the bar's own bottom
  border, so the active section reads as connected to the row beneath it. A section appears only if
  the user can reach at least one screen inside it, and it links to the first screen they can
  actually reach — never to a page that will bounce them.
- A **visible search field**, not a magnifier icon. It is the clearest signal the app has global
  search and it is where a new user looks first. Clicking it opens the `⌘K` palette.
- **Create** (`+`), a menu of permission-filtered quick actions. Hidden entirely when the user can
  create nothing.
- **Theme toggle**, light/dark.
- **Notifications** — only if the app actually has them. A bell that never lights up is furniture.
- **Avatar → account menu**: name and email, app switcher, sign out.

### 3.2 Row 2 — the active section's screens, with live counts
Solid surface (not glass), the screens of the active section, each with an optional **count badge**.

The badges are the point. A row of inert labels tells you nothing; a row that reads
"Queue · 34 open · Machines · 9 running" tells you where the work is *before* you click. That is
what makes two thin rows better than the rail they replaced, not merely narrower.

- A count that is only a **size** (items, machines, employees) stays neutral. A count of **waiting
  work** takes a tone (`warning`/`danger` read as "needs you") and a suffix that makes it a phrase.
- Counts are **advisory**: a failed fetch renders no badge, never an error. Navigation must work
  with the backend down.
- The row **never wraps** to two lines; on a narrow screen it scrolls horizontally.
- It renders **nothing** when the section has one permitted screen — a one-item second row is chrome
  that earns no space.

### 3.3 Row 2 on a detail route — the breadcrumb
On a detail route (`…/<screen>/<id>`) row 2 is replaced by a breadcrumb: a back-arrow link to the
collection, a chevron, and the record's own label in mono.

This swap is deliberate. A sub-nav is useless once you are three levels deep; what you need there is
to know where you are and how to get back out.

The leaf label is **published by the page**, via `useDetailTitle(order.code)` — so it reads
"Orders / SO-20260715-0002", not "Orders / 81". The shell cannot derive it: it has no idea which
resource an id belongs to, and refetching the record just to title a breadcrumb would double every
detail page's requests. The page already has the record, so it hands the label up. Until it does,
the breadcrumb falls back to the URL segment.

### 3.4 `navMeta.ts` — the single nav source
Each app declares its navigation **once**, as `NavSection[]` in `src/apps/<slug>/navMeta.ts`. Five
consumers read it and only it:

1. the top nav's section row,
2. the section nav's screen row and its count badges,
3. the breadcrumb's collection label,
4. the `⌘K` palette's "Go to" group,
5. the mobile nav sheet.

Adding a screen is one entry in one array; everything else picks it up. **A second nav-shaped list
anywhere is how a nav and a breadcrumb start disagreeing** — that exact failure once left a third
of an app showing a raw de-hyphenated slug as its breadcrumb, with four entries for deleted routes.

The contract (`NavScreen`, `NavSection`, `BadgeTone`, `CountMeta`) is exported from `@shared/ui`:

```ts
interface NavScreen {
  key?: string;          // stable id; defaults to path
  label: string;         // sentence case
  path: string;          // segment under /:company/:appSlug/
  permission?: string;   // feature_tag gate; undefined = always visible
  countKey?: string;     // resolves to a row-2 badge
  keywords?: string[];   // extra terms the palette matches on
  hasDetail?: boolean;   // has /<path>/:id routes
}
interface NavSection { key: string; label: string; screens: NavScreen[] }
```

Alongside it, a `CountMetaMap` says which counts read as "needs you" (`{ openTasks: { tone: 'info',
suffix: 'open' } }`). Tone lives with the nav data, not inside the nav component, so the component
stays app-agnostic.

### 3.5 `⌘K` command palette
The accelerator that lets navigation stop growing. Bound globally, opens from anywhere, fully
keyboard-driven. Four groups, in the order intent actually arrives: **Recent** (with no query the
palette is a launcher), **Actions** (permission-gated verbs), **Go to** (every nav screen, from
navMeta), **Records** (live entity search, if the app supplies a search function).

Its panel and scrim are one of the two sanctioned glass surfaces (§5.3).

Matching is **scored, not fuzzy**: exact, prefix, substring, word-initial, then keywords — and
nothing weaker is accepted. A plain subsequence match is far too permissive on short queries, and
buries the real result under a coincidence.

### 3.6 Mobile
Below the `md` breakpoint, row 1 shows a hamburger and row 2 is suppressed entirely. The hamburger
opens a **nav sheet**: a left drawer listing every section and every permitted screen as one
scrollable list.

On a phone there is no room for two horizontal rows, and a horizontally scrolling primary nav hides
items with no affordance at all. A full-height sheet showing everything at once is both simpler and
more complete.

### 3.7 The main region
Solid canvas, its own scroll, a 200ms route cross-fade, and a page-level error boundary so one
broken screen never takes the shell down with it. Padding 24 desktop / 16 mobile.

---

## 4. The screen archetypes

Every screen is one of these. (Glass appears in none of them except where the top bar or a modal
overlaps — all panels below are **solid** with elevation.)

Each app maps its routes to archetypes in its appendix. When a new screen doesn't obviously fit
one, that is usually a sign it is two screens.

### 4.1 Cockpit (role landing)
**Purpose:** "what needs me today." **Kind of screen:** the route a role lands on after login.
**Anatomy:** greeting + `StatStrip` (solid `e1` cards, numbers count up) → grid of **work-queue
cards** (solid `e1`), each a pending queue + count + one primary action ("3 orders to confirm →
Confirm"), derived from real queries, permission-gated. **Don't** make it a chart dashboard — it's a
*to-do surface*, actions first. (Fab ERP: `/home`, `/task-queue`.)

### 4.2 Collection / List
**Purpose:** browse and find one entity type. **Kind of screen:** the plural of anything — items,
orders, employees, suppliers, batches. **Anatomy:** `PageHeader` (title + primary "New") →
**`FilterBar`** (search + facet chips, solid, sticky, `e1`) → **`EntityList`** or **`DataTable`**.
Rows: code (mono) · primary name · meta · `StatusBadge` · hover-revealed actions. Click row →
Detail. `EmptyState` when there are no rows. **Don't** use MUI's default DataGrid chrome.

**Add a `StatStrip` above the FilterBar.** Derive 2–4 metrics from the rows already loaded — no
extra request — and make them describe the **filtered** set, so the numbers always agree with the
list beneath. Earn the space: prefer a metric that names a *failure mode* the user can fix ("No
time formula 4", "Unclassified 7", "Overdue 2") over a restatement of the row count.

#### Choosing `EntityRow` vs `DataTable` vs neither
- **≤4 meaningful attributes**, or rows that are primarily a name you click → `EntityList`/`EntityRow`.
- **≥5 attributes**, or the user compares values down a column → `DataTable` (sort, column control,
  density, selection, CSV, pagination).
- **Neither** if any cell contains an input, or any row expands. `DataTable` has no editing model and
  no row expansion, so converting such a screen *deletes* functionality. A virtualized grid with
  per-column filters and resizable columns is also correctly excluded — it is a different component,
  not a worse table.

  **Read the cells before counting them.** A grep for `<Table` counts `TableHead`/`TableSortLabel`
  and tells you nothing about whether a screen is a naive table or a purpose-built grid — that
  mistake has been made three times on this codebase.

### 4.3 Record / Detail
**Purpose:** one entity plus its related sub-collections. **Kind of screen:** the singular of
anything you clicked from a list. **Anatomy:** **`DetailHeader`** (solid `e2`: identity block +
status + key facts + actions) → **relationship strip** of cross-link chips (§2) → **section tabs**
for sub-collections (an item → Overview · BOM · Flow · Stock · Suppliers · Orders; an employee →
Overview · Assignments · Documents · Leave · History), each body solid. **Always render the
cross-links** — this is principle #4. Publish the record's label with `useDetailTitle` so the
breadcrumb reads as a name (§3.3).

### 4.4 Pipeline / Board
**Purpose:** see many records move through a lifecycle at once, and advance them. **Anatomy:**
horizontal columns = lifecycle stages. Cards = records, coloured by stage accent. Column = solid
surface, sticky solid header (stage + count). Click card → Detail. Optional drag to advance, but
only across *legal* transitions — illegal columns are not drop targets. **Don't** board entities
without a real lifecycle; a board whose records never move between columns is a list with extra
steps.

### 4.5 Canvas / Builder
**Purpose:** visually edit structure. **Kind of screen:** a BOM designer, a flow editor, an org
chart, a Gantt. **Anatomy:** full-bleed canvas (solid, light grid) with **floating solid panels**
(`e2`/`e3`) docked at edges (palette, properties, zoom, legend); selection opens a solid inspector.
**Accessibility:** provide a keyboard/list fallback (an editable list of steps or nodes) — never
mouse-only.

### 4.6 Run / Process
**Purpose:** trigger a computation, review it, commit. **Anatomy:** a **`RunPanel`** (solid `e2`)
with params and a primary "Run" → three visible states (*idle / running / results*) → results
table or tree (solid) → a commit action. Show a plain-language summary of what the run will do,
before and after. Someone about to change a hundred records by pressing one button deserves a
sentence telling them so.

### 4.7 Hierarchy / Tree
**Purpose:** nested data. **Kind of screen:** a taxonomy, a BOM explosion, a reporting line, an
approval chain. **Anatomy:** indented outline rows with expand/collapse (200ms), depth via
indentation plus a hairline guide, each row an `EntityRow`. Often embedded in a Detail tab or a Run
result rather than being a route of its own.

### 4.8 Setup / Readiness
**Purpose:** the entry to the *configure* world; show how ready the model is to be used. **Anatomy:**
a checklist of prerequisites with completeness ("Departments ✓ · Roles 24 · Positions 61 ·
Shifts ✓"), each linking to its Collection screen, plus warnings ("4 roles have no KRAs"). It is
what makes a configuration area feel guided instead of like a folder of tables.

### 4.9 Analytical dashboard
**Purpose:** understand a trend or a distribution — reading, not acting. **Anatomy:** `PageHeader`
(+ range/scope controls in `actions`) → optional `StatStrip` of headline figures → a grid of
`SectionCard`s each holding **one** chart with its own legend and empty state. Charts use the §5.1
chart palette — never a private hex, never a status colour for a data series. Every chart states its
window ("last 7 days") in its card subtitle; a chart whose time range is ambiguous is worse than no
chart. **Don't** mix an analytical dashboard with a to-do surface — the cockpit (4.1) is where
action lives. If a number here needs acting on, link it to the screen that acts.

### 4.10 Settings / Configuration
**Purpose:** change how the system behaves, not what data it holds. **Anatomy:** 880px max width →
labelled `SectionCard` groups of related fields, each field with helper text explaining its
consequence → `StickyActionBar` with Save, disabled until dirty. Destructive or wide-blast-radius
settings state their effect in the helper text, not in a tooltip. **Don't** auto-save;
configuration changes should be deliberate and reviewable before commit.

---

## 5. Visual language (tokens)

All tokens are CSS variables, themed light/dark automatically, defined in
`src/shared/ui/tokens.css` and switched on by `data-ui="platform"` on `<html>` (set by
`ThemeScope`). **Never hardcode hex, shadow, or font in components** — reference `var(--…)`. MUI
`sx`/`styled` reads CSS vars directly.

### 5.1 Color palette

**Accent — Violet** (used sparingly: primary actions, active nav, focus ring, key numbers):

| Token | Light | Use |
|---|---|---|
| `--c-primary-50` | `#F5F1FE` | tint fill, hover bg |
| `--c-primary-100` | `#EADDFD` | selected bg |
| `--c-primary-200` | `#D9C2FB` | border on tint |
| `--c-primary-400` | `#A570EF` | soft accents, charts |
| `--c-primary-500` | `#7C3AED` | **brand** (icons, active nav, focus ring — non-text) |
| `--c-primary-600` | `#6D28D9` | **buttons / white-text surfaces** (AA on white) |
| `--c-primary-700` | `#5B21B6` | button hover · text on violet tints |
| `--c-primary-900` | `#4C1D95` | strong text on tints |

**Semantics** (meaning-bearing — never decorative). 5 families only; accent violet is *not* a status
family, so status never competes with the brand:

| Family | Fill `-50` | Solid `-600` | Text-on-fill `-800` | Meaning |
|---|---|---|---|---|
| Emerald (success) | `#E7F6EF` | `#0E9F6E` | `#075E45` | confirmed, approved, completed, in stock, active |
| Amber (warning) | `#FBF0DD` | `#D97706` | `#7A3E06` | draft, pending, due soon, low stock, paused |
| Rose (danger) | `#FCE9EC` | `#E11D48` | `#8A1230` | overdue, cancelled, blocked, conflict, error |
| Sky (info/active) | `#E2F1FB` | `#0284C7` | `#0A4A75` | sent, in transit, in progress, scheduled, released |
| Slate (neutral) | `#F1F2F7` | `#5A5E78` | `#2C2E40` | closed, generic, structural, eligible |

Each family also has a `-200` tint border, for a bordered panel on a `-50` fill that should match
its family instead of falling back to the neutral `--c-border`.

**Mapping an app's statuses to families is done once, in one place** (`registerStatusTones` at app
setup — §7.3). A status with no entry renders neutral, and that is the failure to watch for: an
anonymous grey chip on the one screen where "this is done, go and act" is the most consequential
thing it could say.

**Lifecycle stage accents** (`--c-stage-1` … `--c-stage-6`): categorical, *not* status — for board
column headers and card edges (§4.4). An app maps its own stages onto the ramp, cool → warm →
resolved.

**Run states** (`--c-state-running` / `-idle` / `-down` / `-off` / `-wait`): a fixed small state
scale for live operational screens, deliberately kept apart from the open-ended status families.

**Chart palette** (`--c-chart-1` … `--c-chart-8`, plus `-grid`, `-axis`, `-tooltip-bg`,
`-tooltip-text`): categorical, hue- and lightness-spaced, deliberately distinct from the status
families so a series never reads as a status. Series 1 is the brand violet. Use in order; do not
reorder per chart.

**Neutrals (cool slate):**

| Token | Light | Dark | Use |
|---|---|---|---|
| `--c-canvas` | `#F6F7FB` | `#0C0E17` | app background |
| `--c-surface` | `#FFFFFF` | `#161826` | solid panels, tables, cards |
| `--c-surface-2` | `#F7F8FD` | `#1C1F2E` | insets, stat cards, table head |
| `--c-surface-3` | `#EFF1F8` | `#232637` | a third level where two aren't enough |
| `--c-text` | `#1A1C2E` | `#EAECF8` | primary text |
| `--c-text-2` | `#5A5E78` | `#A7ABC6` | secondary text |
| `--c-text-3` | `#8A8EA8` | `#6E7290` | hints, mono codes |
| `--c-border` | `#E4E6F0` | `rgba(255,255,255,.09)` | borders |
| `--c-divider` | `#ECEDF5` | `rgba(255,255,255,.06)` | dividers |

Optional very subtle canvas tint (≤10% so it never affects text contrast on solid panels):
```
background:
  radial-gradient(60rem 40rem at 8% -10%, rgba(124,58,237,.06), transparent 60%),
  var(--c-canvas);
```

### 5.2 Elevation (replaces glass as the depth mechanism)

Solid surfaces get a **two-layer soft shadow** + (usually) a 1px border. Three levels:

```
--e-1: 0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06);  /* resting cards, stat/list rows, filter bar */
--e-2: 0 2px 4px rgba(16,24,40,.04), 0 6px 16px rgba(16,24,40,.08); /* detail header, run panel, popovers, hover lift */
--e-3: 0 8px 24px rgba(16,24,40,.12), 0 2px 6px rgba(16,24,40,.06); /* modals, command palette, dropdowns, dragged card */
```
Dark mode: same offsets, `rgba(0,0,0,.40–.55)`. Borders: `1px solid var(--c-border)`. Never a heavy
single `0 4px 12px rgba(0,0,0,.08)` shadow.

There is also `--z-sticky` / `--z-topnav` / `--z-sheet` / `--z-palette` / `--z-toast`, so every
overlay reads its stacking order from the token set instead of guessing a number.

### 5.3 Glass (exactly two uses)

Glass survives **only** on (a) the sticky **top bar** and (b) **modal / command-palette panels &
scrims** — places where real content scrolls or sits behind it. Tokens:
```
--glass-bg:     rgba(255,255,255,.72);   /* dark: rgba(22,24,36,.72) */
--glass-border: rgba(255,255,255,.60);   /* dark: rgba(255,255,255,.10) */
--glass-blur:   blur(16px) saturate(150%);
```
**Mandatory fallbacks** (a11y), already in `tokens.css` and keyed on the `.glass` class:
```css
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass { background: var(--c-surface); }
}
@media (prefers-reduced-transparency: reduce) {
  .glass { background: var(--c-surface); backdrop-filter: none; -webkit-backdrop-filter: none; }
}
```
Use the `.glass` class (or `GlassBar`) rather than inlining `backdrop-filter`, or those fallbacks
won't apply. Text on glass must stay ≥4.5:1. **Do not** add glass anywhere else — no glass stat
cards, filter bars, detail headers, or board columns. Those are solid (§5.2).

### 5.4 Typography

Load once (Geist + JetBrains Mono):
```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
```
```
--font-ui:   'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace;
```
Use `--font-ui` everywhere; **`--font-mono` for entity codes, quantities, money, IDs, dates in
tables**, with `font-variant-numeric: tabular-nums` on numeric columns so they align. Weights: **400**
and **500** on data; **600** only for page/section titles. Never 700.

Scale: page title 22/600 · section 18/600 · subsection 16/500 · body 14/400 (lh 1.5) · body-strong
14/500 · meta 12/400 · mono 12 · caps-label 11/600 letter-spacing .06em uppercase. Sentence case only.

### 5.5 Spacing, shape, icons
4px scale: `4 8 12 16 20 24 32 40`. Page padding 24 (desktop) / 16 (mobile). Card padding 16–20. Card
gap 12. Form/settings max width 880; lists/boards full width. Stat grid
`repeat(auto-fit, minmax(200px,1fr))` gap 12, two columns on a phone. Radius: `--r-sm 8`
(chips/inputs/buttons) · `--r-md 12` (cards/panels) · `--r-lg 16` (modals). No rounded corners on
single-sided accent borders. Icons: MUI `*Rounded`, 18–20px inline / 24 max, inherit `currentColor`;
every status/semantic icon pairs with a text label.

**Row density** is global, not per-screen: `--row-h` / `--row-px` / `--row-fs` are retuned by one
`data-density` attribute on `<html>`, so every table and list in the app agrees and the choice
survives a reload. Someone who wants compact rows wants them everywhere.

### 5.6 Motion tokens
```
--t-fast: 120ms;  /* hover, press */
--t-mid:  200ms;  /* panels, tabs, expand */
--t-slow: 320ms;  /* page, board reflow */
--ease:   cubic-bezier(.2,.8,.2,1);
```
The global reduced-motion guard is in `tokens.css`; you do not need to repeat it per component.

### 5.7 Micro-interaction catalog (purposeful — each answers "did that work?")

All of these are implemented in the kit and are reduced-motion-safe.

1. **Stat count-up** — numbers in `StatStrip` animate toward their value over ~900ms. They animate
   *from the previous value*, not from zero, and always land exactly on the target — a stat that
   lies is worse than a stat that doesn't animate.
2. **Status change → toast** — on a state change, the `StatusBadge` recolors and a toast
   (`aria-live="polite"`) slides up and auto-dismisses. Errors stay longer than confirmations: a
   message someone needs to read is not the same as one confirming what they already know.
3. **Optimistic row update** — on save, the row drops to ~60% opacity ("saving…"); snaps back on
   success; subtle shake + rose tint on error. Never block the whole screen for a row edit.
4. **Hover-reveal actions** — row/card actions fade in on hover *and* on keyboard focus-within, so
   they are reachable without a mouse. On a touch screen, which has no hover at all, they are
   always visible — a button nobody can see is a button nobody has.
5. **Skeleton loaders** — lists and detail bodies show shimmer skeletons shaped like what is
   coming, never a centered spinner. Spinners only for button-local busy.
6. **Button press** — `scale(.97)` on `:active`; primary buttons swap their label for an inline
   spinner while submitting.
7. **Tab / panel / route switch** — content cross-fades ~160–200ms with a 4px slide; never a hard cut.
8. **Command palette** — backdrop fades, panel `scale(.98→1)` over 160ms; fully keyboard-driven.
9. **Board drag** — the dragged card lifts to `e-3`; legal drop columns highlight, illegal ones are
   inert; the card snaps on drop with a 200ms settle.
10. **Tree expand/collapse** — height + opacity 200ms.
11. **Toast stack** — slide-up + fade, stacked, capped at four, dismissible.

Rule: if an interaction doesn't communicate state or confirm an action, cut it.

---

## 6. Accessibility contract (non-negotiable — acceptance criteria)

1. **Contrast:** body ≥ **4.5:1**, large/UI text & icons ≥ **3:1**. The §5.1 pairs are pre-checked on
   solid surfaces. On the top-bar glass, keep text ≥4.5:1 against the effective background.
2. **Never color alone.** Status = icon **+** label **+** color (enforced by `StatusBadge`). Errors &
   required fields show icon/text, not just red.
3. **Focus visible on everything interactive** incl. board cards & nav:
   `outline: 2px solid var(--c-focus); outline-offset: 2px;` via `:focus-visible` (global, in
   `tokens.css`). Never strip outlines without a replacement.
4. **Keyboard:** all actions Tab-reachable; dialogs/drawers trap focus and close on Esc; canvases
   (§4.5) have a list/keyboard alternative; `⌘K` fully keyboard-driven; tables support ↑/↓ row
   traversal and Enter to open; hover-only actions also appear on `:focus-within`.
5. **Reduced transparency / no backdrop-filter:** the two glass surfaces degrade to solid (§5.3).
   The app must be fully usable with transparency off.
6. **Reduced motion:** honor `prefers-reduced-motion` (§5.6). No essential information depends on
   animation; count-ups jump to their final value, skeletons still show, pulses are skipped.
7. **Targets:** interactive hit area ≥ 40×40 (≥44 touch). Icon-only buttons get `aria-label`.
8. **Semantics:** real `<button>`/`<a>`; `<th scope>` and `aria-sort`; `<nav aria-label>`; ordered
   headings; `aria-live="polite"` for toasts and run progress; `aria-busy` on loading regions.
9. **Every dialog has a visible way out.** Escape works but is invisible; a close button is not
   optional, and Cancel is not a substitute (Cancel reads as "abandon what I typed", which is not
   what someone means when they opened a panel to look at something).

---

## 7. Component recipe library

These live in **`@shared/ui`** (`src/shared/ui`). Import them; do not re-implement them. What
follows is the *contract* each one must honour — read it before changing one, and write to it if you
are adding a component the kit doesn't have yet.

### 7.1 `Surface` — the solid primitive (used for ~everything)
`e={0|1|2|3}` picks the elevation, `bordered` the hairline. Background `--c-surface`, radius
`--r-md`. Everything in the kit is built on it, which is why depth never drifts between screens.

### 7.2 `GlassBar` — the ONE glass component
Carries the `.glass` class so the §5.3 fallbacks apply. Sticky, `--z-topnav`. Used by the top bar;
the same pattern (class + `--e-3`) is what the command palette panel uses.

### 7.3 `StatusBadge` — enforces icon + label + color
Five tones; the badge draws a family glyph, the label text and the family fill. Domain statuses map
to tones **once per app**:

```ts
registerStatusTones({ draft: 'warning', confirmed: 'success', cancelled: 'danger' });
registerStatusLabels({ ready_to_ship: 'Ready to ship' });
```

After that `<StatusBadge status={row.status} />` is correct everywhere in the app. A one-off screen
can pass `tone` or a `map` directly. `ToneBadge` is the same pill when the text is not a status.

### 7.4 `useCountUp` (micro-interaction §5.7-1)
Animates from the current on-screen value to the target, commits the exact target synchronously on
change and on teardown, and jumps straight to it under reduced motion. Those two properties are the
whole point: a dropped frame, a backgrounded tab or an unmount must never leave a number stranded.

### 7.5 The rest of the kit
- **`PageHeader`** — title 22/600 + optional subtitle + right-aligned actions (mb 2.5).
- **`SectionCard` + `StickyActionBar`** — a titled solid panel; `flush` lets a table bleed to the
  card edge. The action bar stays in the viewport so a long form never hides its own Save button.
- **`StatStrip` + `Stat`** — grid `auto-fit minmax(200px,1fr)`; each card a `Surface e={1}`, label
  12 `--c-text-2`, value 24/600 via `useCountUp`, mono + tabular. A tone colours the value **only
  while it is above zero** — a red zero trains people to ignore red.
- **`FilterBar` + `FacetChip`** — `Surface e={1}`, sticky, search + facets. The search box has a
  clear button and clears on Escape; clearing a search should not mean select-all-and-delete.
- **`EntityList` + `EntityRow`** — row = `Surface e={1}`: mono code · name 14/500 (ellipsis, flex 1)
  · meta 12 · trailing badges · hover/focus-within-revealed actions (always visible on touch).
- **`DataTable`** — sort (stable, nulls last, numeric-aware for DECIMAL-as-string), column
  visibility, global density, selection + bulk bar, CSV export, client pagination, sticky header,
  ↑/↓ row traversal, skeleton rows, `bare` for a table already inside a card. Deliberately not
  virtualized; a screen that needs windowing wants a purpose-built grid, not this.
- **`SortableTableHead`** — for a hand-laid-out `<Table>` that cannot be a `DataTable`.
- **`NumberCell` / `QtyCell` / `DateCell`** — mono, tabular, right-aligned, em dash for null. They
  exist so the numeric rule is enforced once instead of as an `sx` prop on every column. They also
  coerce DECIMAL-as-string, which is what MySQL actually returns.
- **`DetailLayout` / `DetailHeader` / `DetailTabs` / `CrossLink` / `FactItem`** — `Surface e={2}`
  header → cross-link chip row (**always**) → optional band → tabs → solid tab body with cross-fade.
  A tab may carry a `dot` when the tabs are a *sequence* rather than peers.
- **`PipelineBoard` + `PipelineCard`** — columns `flex:1 0 248px`; sticky solid column header with
  the stage accent + count; cards `Surface e={1}` with the stage accent as a left edge.
- **`RunPanel`** — `Surface e={2}` params + primary Run; renders `idle | running | results`.
- **`EmptyState`** — centered icon + one line + an explanation + the primary action. An empty list
  is a moment of doubt ("is it broken, or is there nothing?") — say which.
- **`Callout`** — a short piece of *teaching* attached to a screen: tone-coloured left edge, neutral
  body. **Not an `Alert`.** An alert says something went wrong; a callout says how to think about the
  screen you are on. Reach for it only where a screen fails if the reader brings the wrong mental
  model and better table design would not fix it — "a machine is never a manager", "a shift with no
  hours is flexible, not half-filled-in". In both cases the screen looks perfectly usable while being
  used wrongly, which is when a sentence earns its space. Default tone is `neutral`; a page that
  greets you with a yellow banner every visit teaches you to skip banners. Never use it to narrate
  what the table already shows.
- **`Skeletons`** — `SkeletonBlock`, `ListSkeleton`, `StatSkeleton`, `DetailSkeleton`,
  `ChartSkeleton`, `CardGridSkeleton`. Each is shaped like the thing it stands in for.
- **`FormDialog`** — solid body, `--r-lg`, `e-3`. `onSubmit` may throw: the backend's own message
  (and any itemised problems) appear in-dialog and the input survives; resolving closes it. Enter
  submits from any field but a textarea, a button, or an open picker.
- **`ConfirmDialog` / `PromptDialog`** — a confirm echoes the entity's name back in mono, because
  "Are you sure?" gives someone nothing to check against; a prompt collects the one line of text an
  action needs and shows a refusal in place.
- **`SideSheet`** — right-docked solid panel for a record peek or an edit that shouldn't lose the
  reader's place in the list.
- **`ToastProvider` / `useToast`** — per §5.7-2/11.
- **`CommandPalette`** — glass panel, `e-3`, scored matching, fully keyboard-driven (§3.5).
- **`ShortcutsHelp`** — the `?` sheet. Keep it in step with the real bindings; a sheet listing a key
  that doesn't work is a bug, not documentation.
- **`AppShell` / `TopNav` / `SectionNav` / `MobileNavSheet` / `ThemeScope`** — §3.

---

## 8. Route → archetype map

**Each app's own**, in `src/apps/<slug>/DESIGN_SYSTEM_APPENDIX.md`. Keep it complete: it is the
cheapest way to notice that a screen has quietly become a fifth thing, or that two routes are the
same screen twice.

Fab ERP's: `src/apps/fab_erp/DESIGN_SYSTEM_APPENDIX.md` (§A8).

---

## 9. Designing a screen you haven't seen — decision procedure

1. **What is the user doing here?** Deciding what to do next → Cockpit · Finding one record → List ·
   Studying or editing one record and its relations → Detail · Watching many records move through
   stages → Pipeline · Editing a structure visually → Canvas · Triggering a calculation and acting
   on the result → Run · Reading nested data → Tree · Setting the model up → Readiness · Reading a
   trend → Analytical dashboard · Changing how the system behaves → Settings.
2. **Use the kit component** (§7) for that archetype. Don't invent layout.
3. **Surfaces are solid** (`Surface` + elevation). Glass only if you are literally building the top
   bar or a modal/palette. If tempted to put a panel on glass — don't.
4. **Wire the cross-links** (§2, your app's appendix) if it's a Detail — always.
5. **Tokens only** (§5): violet accent used sparingly, semantic colors for meaning, Geist + mono,
   elevation not heavy shadows, motion tokens.
6. **Add the relevant micro-interactions** (§5.7).
7. **Run the a11y checklist** (§6). Especially "never color alone", focus-visible, and a visible way
   out of every dialog.
8. **Match neighbours.** Open a built screen of the same archetype — in *any* app on this platform —
   and mirror its structure, density and spacing. Sameness is the goal.

---

## 10. Standing up a new app

1. **Fonts** — the Geist + JetBrains Mono `<link>` (§5.4) is already in `index.html`.
2. **`navMeta.ts`** — declare `NavSection[]` and your `CountMetaMap` (§3.4). This is the first file
   to write; the shell, the palette and the breadcrumb all follow from it.
3. **Status vocabulary** — `registerStatusTones` / `registerStatusLabels` once, next to navMeta
   (§7.3).
4. **Wrap the routes**:
   ```tsx
   <ThemeScope appSlug="my_app">
     <CommandPaletteProvider appSlug="my_app" sections={SECTIONS} actions={ACTIONS}>
       <AppShell appSlug="my_app" sections={SECTIONS} brand={{ label: 'My App' }}
                 counts={counts} countMeta={COUNT_META} quickCreate={QUICK_CREATE}>
         <Routes>…</Routes>
       </AppShell>
     </CommandPaletteProvider>
   </ThemeScope>
   ```
   `ThemeScope` sets `data-ui="platform"` on `<html>` (switching the tokens on), nests the MUI
   theme, namespaces stored UI preferences to the app slug, and mounts the toast stack.
5. **Write the appendix** — `src/apps/<slug>/DESIGN_SYSTEM_APPENDIX.md`: the worlds, the entity
   web, roles → flow, and the route → archetype map (§2, §8).
6. **Build screens out of the kit.** If something is missing, add it to `@shared/ui` — never to your
   app's `components/`.

---

*Build every screen from this document. If something here is wrong for a client's real workflow,
fix it **here first**, then implement — so the system stays the single source of truth. What is true
of one app only belongs in that app's appendix, not in this file.*
