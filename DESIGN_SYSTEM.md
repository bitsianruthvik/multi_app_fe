# Fab ERP — Design System & UX Handbook

> **Audience:** the implementing model/engineer (Sonnet) building the Fab ERP UI screen by screen.
> **Goal:** give you everything needed to design *any* screen — including ones not listed here — so
> the whole app feels like one deliberate, modern, accessible product instead of "a sidebar with
> tables." When you meet a new screen, **map it onto one of the 8 archetypes** (§4), pull the
> matching recipe (§7), and apply the tokens (§5). Do not invent a new visual language per screen.
> Consistency is the product.

### Locked design decisions (confirmed with the client)
- **Accent:** violet `#7C3AED`, used *sparingly* on a near-ink + slate structure. We moved off blue
  entirely — "enterprise blue" was the dated signal.
- **Glass:** **demoted.** Surfaces are solid with a soft two-layer shadow elevation system. Glass is
  used in exactly **two** places: the sticky top bar, and modal / command-palette scrims. Nowhere
  else. (Glassmorphism reads muddy on a calm data background and costs contrast — solid is cleaner
  and more legible.)
- **Fonts:** **Geist** for UI/headings, **JetBrains Mono** for codes & quantities (tabular figures
  so numbers align in columns).

---

## 0. How to use this document

For each screen you build:
1. Identify its **archetype** (§4) — there are only 8. The route→archetype map is §8.
2. Copy the matching **recipe** (§7) and fill in the entity-specific bits.
3. Use only the **tokens** (§5). Never hardcode hex, px shadows, or font names in components.
4. Add the relevant **micro-interactions** (§5.7) — purposeful feedback, never decoration.
5. Run the **accessibility checklist** (§6) before calling it done.

When unsure how a new screen should look, follow the **decision procedure** (§9).

---

## 1. Design principles

1. **Flow over inventory.** Organize around *what the user does next*, not around database tables.
   Every role lands on work, not a 10-item menu.
2. **Two worlds, clearly separated.** *Configure* (build the factory model) and *Operate* (run daily
   production) are different mindsets — reflected in nav grouping, density, and tone (§2, §3).
3. **Legibility is sacred.** Color, depth, and motion serve clarity. The moment an effect costs
   readability, it loses. Data surfaces are calm, high-contrast, solid.
4. **Show relationships.** The ERP is a graph: an item has a BOM, a routing, stock, suppliers, and
   appears on orders. Every detail screen surfaces its neighbors as one-click cross-links (§4.3).
5. **Progressive disclosure.** Default views are sparse and scannable; depth lives one click down.
6. **Restraint reads as modern.** Near-ink structure + one earned accent + crisp solid surfaces +
   a quiet distinctive font + motion only where it confirms an action. That — not flashy effects —
   is what makes it look current.

---

## 2. Information architecture — how the whole app fits together

### 2.1 The two worlds

```
┌─────────────────────────────  CONFIGURE  ───────────────────────────────┐
│  (build the factory model — relatively static, Engineering/Admin)         │
│   Plants ──┬── Stock Locations                                            │
│            └── Shift Calendars ── Shifts / Working days                   │
│   Resource Types ── Resources (machines/labor)   ◄── use Calendars        │
│   Item Taxonomy:  Category ─ Group ─ Sub-group                            │
│        └ Item Catalog (parts)                                             │
│             ├── Material BOM ── BOM Items      (what goes into what)      │
│             ├── Routing Plan ── Op Steps ── deps/inputs/outputs/formulas  │
│             ├── Stock policy / batches                                    │
│             └── Suppliers ── Supplier×Item (lead time, cost, MOQ)         │
│   Item Metrics / Constants / Process Master / Templates (formula inputs)  │
└───────────────────────────────────────────────────────────────────────────┘
                                   │  feeds
                                   ▼
┌──────────────────────────────  OPERATE  ─────────────────────────────────┐
│  (run production — daily flow, PM / Planner / Stores)                     │
│   Sales Order ──► MRP run ──► Planned Orders ──► Workbench (firm)          │
│        (demand)   (explode    (suggestions)     ──► Manufacturing Orders   │
│                    BOM vs                            └► Scheduler (Gantt)   │
│                    stock) ──► Purchase Orders ──► GRN ──► Stock on hand    │
│   Order lifecycle:  Capture ─ Planned ─ Scheduled ─ In production ─ Shipped│
└───────────────────────────────────────────────────────────────────────────┘
```

**Key teaching:** Items, BOMs, and routings are **not a parallel flow to orders** — they are the
*fuel* the order flow burns. MRP reads an item's BOM + stock to decide what to make/buy; the
scheduler reads routings + resources + calendars to place work in time. So the UI must let a planner
glance "sideways" into the model mid-operation (open the BOM behind a planned order) and let an
engineer see "is the model complete enough to run?" (§4.8).

### 2.2 The entity relationship web (drives detail-screen cross-links, §4.3)

| From | Links to (render as clickable chips/rows) |
|---|---|
| **Item (catalog)** | its BOM(s) · Routing Plan(s) · Stock balance/batches · Suppliers · Orders containing it · Taxonomy |
| **Material BOM** | parent Item · component Items · Routing Plan(s) built on it |
| **Routing Plan** | its BOM → Item · each Op Step's Resource Type · formulas |
| **Resource Type** | its Resources · Plant · Shift Calendar · routing steps using it |
| **Order** | its Lines (→Item) · BOM/Routing used · child/parent orders (MRP tree) · Schedule entries · Supplier (PO) |
| **Supplier** | Supplier×Item rows (→Item) · GRNs · POs |
| **GRN** | Supplier · Lines (→Item + Batch) · resulting Stock ledger entries |
| **Plant** | Stock Locations · Resources · Calendars |

### 2.3 Roles → flow (confirm against the client's real org)

| Role | Lives in | Primary actions |
|---|---|---|
| **PM / Sales** (`fab_erp_projects_*`) | Operate · Orders | capture/confirm orders, watch due dates & exceptions, ship |
| **Planner** (`fab_erp_planning_*`, `fab_erp_scheduler_*`) | Operate · MRP→Workbench→Scheduler | run MRP, firm planned orders, resolve schedule conflicts |
| **Stores / Buyer** (`fab_erp_grn_*`, `fab_erp_inventory_*`) | Operate · Procurement | raise POs for shortages, receive (GRN), watch low stock |
| **Engineering / Admin** (`fab_erp_items_*`, `_resources_*`, `_templates_*`, `_calendars_*`) | Configure | define items/BOMs/routings/resources/calendars; check readiness |

Gate with `usePermission(tag)`. A role simply sees fewer cockpit cards and nav entries — same
components, filtered.

---

## 3. Navigation model

Three-zone shell:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  TOP BAR  (the ONE glass surface, sticky)                                  │
│  [≡] Company / Fab ERP / <breadcrumb>        [⌘K search]   [bell] [avatar] │
├───────────┬──────────────────────────────────────────────────────────────┤
│ SIDE RAIL │  PAGE CONTENT (solid canvas)                                   │
│ (solid)   │   PageHeader (title + actions) → optional StatStrip (solid)    │
│  ◆ Home   │   archetype body (list / detail / board / canvas / run)        │
│ OPERATE   │                                                                │
│  Orders   │                                                                │
│  Planning │                                                                │
│  Schedule │                                                                │
│  Receiving│                                                                │
│ CONFIGURE │                                                                │
│  Items    │                                                                │
│  BOMs     │                                                                │
│  Routings │                                                                │
│  Resources│                                                                │
│  Calendars│                                                                │
│  Suppliers│                                                                │
└───────────┴──────────────────────────────────────────────────────────────┘
```

- Rail is **grouped into `OPERATE` and `CONFIGURE`** with an 11px caps label between — this alone
  teaches the two-world model. Each item respects `permission`. The rail is **solid** (surface color),
  1px right border, not glass.
- **Home (cockpit)** is the default landing (`/:company/fab_erp/home`) — update `routes.tsx` (the
  current redirect points at `resource-types`) and `index.ts` `buildUserNav`.
- **`⌘K` command palette** (glass panel — allowed use) is the accelerator: jump to any entity, run
  MRP, create an order. Scales better than an ever-growing menu.
- **Breadcrumbs** in the top bar locate detail screens in the flow (`Orders / SO00012 / Lines`).
- Rail collapses to icon-only exactly as today's `Sidebar.tsx`; keep that behavior and the
  `--sidebar-*` CSS-var contract — only restyle and regroup.

---

## 4. The 8 screen archetypes

Every screen is one of these. (Glass appears in none of them except where the top bar/modal overlaps —
all panels below are **solid** with elevation.)

### 4.1 Cockpit (role landing)
**Purpose:** "what needs me today." **Route:** `/home`. **Who:** all roles (content filtered).
**Anatomy:** greeting + `StatStrip` (solid `e1` cards, numbers count up) → grid of **Work-Queue
cards** (solid `e1`), each a pending queue + count + one primary action ("3 orders to confirm →
Confirm"), derived from real queries, permission-gated. **Don't** make it a chart dashboard — it's a
*to-do surface*, actions first.

### 4.2 Collection / List
**Purpose:** browse/find one entity type. **Routes:** Items, Resources, Suppliers, Plants, Routing
Plans, GRNs, Orders (list mode), Batches, Calendars, Metrics, Constants. **Anatomy:** PageHeader
(title + primary "New") → **FilterBar** (search + facet chips, solid, sticky, `e1`) → **EntityList**
(solid rows). Rows: code (mono) · primary name · meta · `StatusBadge` · hover-revealed actions. Click
row → Detail. Empty state when no rows. **Don't** use MUI's default DataGrid chrome — use `EntityRow`.

### 4.3 Record / Detail
**Purpose:** one entity + its related sub-collections. **Routes:** Item, Supplier, Order, GRN detail.
**Anatomy:** **DetailHeader** (solid `e2`: identity block + status + key facts + actions) →
**relationship strip** of cross-link chips (§2.2) → **section tabs** for sub-collections (Item →
Overview · BOM · Routing · Stock · Suppliers · Orders), each body solid. **Always render the
cross-links** — this is principle #4.

### 4.4 Pipeline / Board
**Purpose:** see lifecycle of many orders at once; advance them. **Route:** Orders (board = *default*
view, with a list toggle). **Anatomy:** horizontal columns = lifecycle stages (Capture · Planned ·
Scheduled · In production · Received/Shipped). Cards = orders, colored by stage accent. Column = solid
surface, sticky solid header (stage + count). Click card → Order detail. Optional drag to advance
(only across *legal* status transitions; illegal columns aren't drop targets). **Don't** board
entities without a real lifecycle.

### 4.5 Canvas / Builder
**Purpose:** visually edit structure. **Routes:** BOM Designer, Routing Plan Builder, Scheduler
(Gantt). **Anatomy:** full-bleed canvas (solid, light grid) with **floating solid panels** (`e2`/`e3`)
docked at edges (palette, properties, zoom, legend); selection opens a solid inspector. **Accessibility:**
provide a keyboard/list fallback (an editable list of steps/nodes) — never mouse-only.

### 4.6 Run / Process
**Purpose:** trigger a computation, review, commit. **Routes:** MRP run, Workbench (firm), Scheduler
(run). **Anatomy:** a **RunPanel** (solid `e2`) with params + a primary "Run" → three visible states
(*idle / running / results*) → results table/tree (solid) → commit action ("Firm selected", "Convert
to POs"). Show a plain-language summary of what the run will do, before and after.

### 4.7 Hierarchy / Tree
**Purpose:** nested data. **Routes:** Item taxonomy (Category→Group→Sub-group), BOM explosion,
Workbench order tree. **Anatomy:** indented outline rows with expand/collapse (200ms), depth via
indentation + a hairline guide, each row an `EntityRow`. Often embedded in a Detail tab or Run result.

### 4.8 Setup / Readiness
**Purpose:** entry to the *Configure* world; show how ready the model is to run. **Route:** a new
Configure landing (optional, high-value). **Anatomy:** checklist of model prerequisites with
completeness ("Plants ✓ · Items 50 · BOMs 12 · Routings 8 · Calendars ✓ · Resources 30"), each
linking to its Collection screen, plus warnings ("4 items have no BOM"). Makes Configure feel guided.

---

## 5. Visual language (tokens)

All tokens are CSS variables, themed light/dark automatically. **Never hardcode hex, shadow, or font
in components** — reference `var(--…)`. MUI `sx`/`styled` reads CSS vars directly.

### 5.1 Color palette

**Accent — Violet** (used sparingly: primary actions, active nav, focus ring, key numbers):

| Token | Light | Use |
|---|---|---|
| `--c-primary-50` | `#F5F1FE` | tint fill, hover bg |
| `--c-primary-100` | `#EADDFD` | selected bg |
| `--c-primary-200` | `#D9C2FB` | border on tint |
| `--c-primary-400` | `#A570EF` | soft accents, charts |
| `--c-primary-500` | `#7C3AED` | **brand** (icons, active rail, focus ring — non-text) |
| `--c-primary-600` | `#6D28D9` | **buttons / white-text surfaces** (AA on white) |
| `--c-primary-700` | `#5B21B6` | button hover · text on violet tints |
| `--c-primary-900` | `#4C1D95` | strong text on tints |

**Semantics** (meaning-bearing — never decorative). 5 families only; accent violet is *not* a status
family so status never competes with the brand:

| Family | Fill `-50` | Solid `-600` | Text-on-fill | Meaning (statuses) |
|---|---|---|---|---|
| Emerald (success) | `#E7F6EF` | `#0E9F6E` | `#075E45` | confirmed, shipped, approved, in-stock, completed |
| Amber (warning) | `#FBF0DD` | `#D97706` | `#7A3E06` | draft, pending, due-soon, low-stock |
| Rose (danger) | `#FCE9EC` | `#E11D48` | `#8A1230` | overdue, cancelled, conflict, error |
| Sky (info/active) | `#E2F1FB` | `#0284C7` | `#0A4A75` | sent, in-transit, in-progress, scheduled, released |
| Slate (neutral) | `#F1F2F7` | `#5A5E78` | `#2C2E40` | closed, generic, structural |

**Board stage accents** (categorical, *not* status — used only for §4.4 column headers/card edges):
Capture `#D97706` · Planned `#0284C7` · Scheduled `#7C3AED` · In production `#DB5A2C` · Shipped
`#0E9F6E`.

**Neutrals (cool slate):**

| Token | Light | Dark | Use |
|---|---|---|---|
| `--c-canvas` | `#F6F7FB` | `#0C0E17` | app background |
| `--c-surface` | `#FFFFFF` | `#15172480`→use `#161826` | solid panels, tables, cards |
| `--c-surface-2` | `#F7F8FD` | `#1C1F2E` | insets, stat cards, table head |
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
Dark mode: same offsets, `rgba(0,0,0,.4–.55)`. Borders: `1px solid var(--c-border)`. Drop the old
heavy single `0 4px 12px rgba(0,0,0,.08)` shadow everywhere.

### 5.3 Glass (exactly two uses)

Glass survives **only** on (a) the sticky **top bar** and (b) **modal / command-palette panels &
scrims** — places where real content scrolls/sits behind it. Tokens:
```
--glass-bg:     rgba(255,255,255,.72);   /* dark: rgba(22,24,36,.72) */
--glass-border: rgba(255,255,255,.60);   /* dark: rgba(255,255,255,.10) */
--glass-blur:   blur(16px) saturate(150%);
```
**Mandatory fallbacks** (a11y):
```css
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass { background: var(--c-surface); }
}
@media (prefers-reduced-transparency: reduce) {
  .glass { background: var(--c-surface); backdrop-filter: none; -webkit-backdrop-filter: none; }
}
```
Text on glass uses the strong opacity above and must stay ≥4.5:1. **Do not** add glass anywhere else —
no glass stat cards, filter bars, detail headers, or board columns. Those are solid (§5.2).

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
gap 12. Form/detail max width 880; lists/boards full width. Cockpit/stat grid
`repeat(auto-fit, minmax(220px,1fr))` gap 12. Radius: `--r-sm 8` (chips/inputs/buttons) · `--r-md 12`
(cards/panels) · `--r-lg 16` (modals). No rounded corners on single-sided accent borders. Icons: MUI
`*Rounded`, 18–20px inline / 24 max, inherit `currentColor`; every status/semantic icon pairs with a
text label.

### 5.6 Motion tokens
```
--t-fast: 120ms;  /* hover, press */
--t-mid:  200ms;  /* panels, tabs, expand */
--t-slow: 320ms;  /* page, board reflow */
--ease:   cubic-bezier(.2,.8,.2,1);
```
Global guard:
```css
@media (prefers-reduced-motion: reduce){ *{ transition:none!important; animation:none!important; transform:none!important; } }
```

### 5.7 Micro-interaction catalog (purposeful — each answers "did that work?")

Implement these as shared hooks/components (§7) and apply consistently. All reduced-motion-safe.

1. **Stat count-up** — numbers in StatStrip/StatCard animate 0→value over ~900ms ease-out on mount.
2. **Status change → success pulse + toast** — on confirm/firm/receive, the `StatusBadge` recolors
   and emits a soft pulse ring (700ms); a toast (`aria-live="polite"`) slides up and auto-dismisses.
3. **Optimistic row update** — on save, the row drops to ~60% opacity ("saving…"); snaps back on
   success; subtle 2px shake + rose tint on error. Never block the whole screen for a row edit.
4. **Hover-reveal actions** — row/card edit/delete fade in (opacity 0→1, 140ms) on hover & on
   keyboard focus-within (so they're reachable without a mouse).
5. **Skeleton loaders** — lists and detail bodies show shimmer skeletons while fetching, never a
   centered spinner. Spinners only for button-local busy (replace the label inline).
6. **Button press** — `scale(.97)` on `:active`; primary buttons swap label for an inline spinner
   while submitting.
7. **Tab / panel switch** — content cross-fades 160ms + 4px slide; never a hard cut.
8. **Command palette** — backdrop fades, panel `scale(.98→1)` over 160ms; fully keyboard-driven.
9. **Pipeline drag** — dragged card lifts to `e-3`; legal drop columns highlight, illegal ones are
   inert; card snaps on drop with a 200ms settle.
10. **Tree expand/collapse** — height + opacity 200ms.
11. **Toast stack** — slide-up + fade in, stack vertically, auto-dismiss ~2s, dismissible.

Rule: if an interaction doesn't communicate state or confirm an action, cut it.

---

## 6. Accessibility contract (non-negotiable — acceptance criteria)

1. **Contrast:** body ≥ **4.5:1**, large/UI text & icons ≥ **3:1**. The §5.1 pairs are pre-checked on
   solid surfaces. On the top-bar glass, keep text ≥4.5:1 against the effective background.
2. **Never color alone.** Status = icon **+** label **+** color (enforced by `StatusBadge`). Errors &
   required fields show icon/text, not just red.
3. **Focus visible on everything interactive** incl. board cards & nav:
   `outline: 2px solid var(--c-primary-500); outline-offset: 2px;` via `:focus-visible`. Never strip
   outlines without a replacement.
4. **Keyboard:** all actions Tab-reachable; dialogs/drawers trap focus & close on Esc; canvases (§4.5)
   have a list/keyboard alternative; `⌘K` palette fully keyboard-driven; hover-only actions also appear
   on `:focus-within`.
5. **Reduced transparency / no backdrop-filter:** the two glass surfaces degrade to solid (§5.3).
   App must be fully usable with transparency off.
6. **Reduced motion:** honor `prefers-reduced-motion` (§5.6). No essential info depends on animation;
   count-ups jump to final value, skeletons still show, pulses are skipped.
7. **Targets:** interactive hit area ≥ 40×40 (≥44 touch). Icon-only buttons get `aria-label`.
8. **Semantics:** real `<button>`/`<a>`; `<th scope>`; `<nav aria-label>`; ordered headings;
   `aria-live="polite"` for toasts and run-progress.

---

## 7. Component recipe library

Put these in `src/shared/components/`. Imports assume existing aliases (`@core/...`, `../api/client`).
Styling = CSS vars + MUI `sx`.

### 7.1 `Surface` — the solid primitive (used for ~everything)
```tsx
import { Box, type BoxProps } from '@mui/material';
export function Surface({ e = 1, bordered = true, sx, ...p }:
  BoxProps & { e?: 0 | 1 | 2 | 3; bordered?: boolean }) {
  return (
    <Box {...p} sx={{
      background: 'var(--c-surface)',
      border: bordered ? '1px solid var(--c-border)' : 'none',
      borderRadius: 'var(--r-md)',
      boxShadow: e === 0 ? 'none' : `var(--e-${e})`,
      ...sx,
    }} />
  );
}
```

### 7.2 `GlassBar` — the ONE glass component (top bar; same pattern for modal/palette panel)
```tsx
import { Box, type BoxProps } from '@mui/material';
export function GlassBar({ sx, ...p }: BoxProps) {
  return (
    <Box {...p} className="glass" sx={{
      background: 'var(--glass-bg)',
      backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
      borderBottom: '1px solid var(--glass-border)',
      position: 'sticky', top: 0, zIndex: 10, ...sx,
    }} />
  );
}
```
The `.glass` class lets the §5.3 `@supports` / `prefers-reduced-transparency` fallbacks target it.

### 7.3 `StatusBadge` — enforces icon + label + color
```tsx
import { Box } from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import HourglassEmptyRounded from '@mui/icons-material/HourglassEmptyRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import RemoveCircleOutlineRounded from '@mui/icons-material/RemoveCircleOutlineRounded';

const FAMILY = {
  success: ['#E7F6EF', '#075E45', CheckCircleRounded],
  warning: ['#FBF0DD', '#7A3E06', HourglassEmptyRounded],
  danger:  ['#FCE9EC', '#8A1230', ErrorOutlineRounded],
  info:    ['#E2F1FB', '#0A4A75', SyncRounded],
  neutral: ['#F1F2F7', '#2C2E40', RemoveCircleOutlineRounded],
} as const;

export function StatusBadge({ family, label }:
  { family: keyof typeof FAMILY; label: string }) {
  const [bg, fg, Icon] = FAMILY[family];
  return (
    <Box component="span" sx={{
      display:'inline-flex', alignItems:'center', gap:'6px', background:bg, color:fg,
      borderRadius:'var(--r-sm)', padding:'3px 9px', fontSize:12, fontWeight:500, whiteSpace:'nowrap',
    }}>
      <Icon sx={{ fontSize:14 }} aria-hidden />{label.replace(/_/g,' ')}
    </Box>
  );
}
```
Map every domain status → a family **once** in `src/shared/statusMap.ts` so colors never drift.

### 7.4 `useCountUp` (micro-interaction §5.7-1)
```tsx
import { useEffect, useState } from 'react';
export function useCountUp(to: number, ms = 900) {
  const [n, setN] = useState(to);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(to); return; }
    let raf = 0, start = 0;
    const step = (t: number) => {
      if (!start) start = t;
      const p = Math.min((t - start) / ms, 1);
      setN(Math.round((1 - Math.pow(1 - p, 3)) * to));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return n;
}
```

### 7.5 Remaining recipes (build to the same spec)
- **`PageHeader`** — title 22/600 + optional subtitle + right-aligned actions (mb 2.5).
- **`StatStrip` + `StatCard`** — grid `auto-fit minmax(220px,1fr)`; each card a `Surface e={1}`, label
  12 `--c-text-2`, value 24/600 via `useCountUp`, mono+tabular for numbers.
- **`FilterBar`** — `Surface e={1}`, `position:sticky; top:12`, flex row of search + facet chips.
- **`EntityList` + `EntityRow`** — column flex gap .75; row = `Surface e={1}` (hover → `--c-surface-2`):
  mono code (`--c-text-3`) · name 14/500 (ellipsis, flex 1) · meta 12 `--c-text-2` · `StatusBadge` ·
  hover/focus-within-revealed actions.
- **`DetailLayout`** — `Surface e={2}` header → cross-link chip row (from §2.2, **always**) → MUI
  `Tabs` (textTransform none) → solid tab body.
- **`PipelineBoard` + `PipelineColumn` + `OrderCard`** — flex row, columns `flex:1 0 220px`; column
  header `Surface e={1}` sticky with stage accent (§5.1 board colors) + count; cards `Surface e={1}`,
  left edge = stage accent (radius 0 on that edge).
- **`WorkQueueCard`** (cockpit) — `Surface e={1}`: accent icon tile + title + count line + one primary
  button.
- **`RunPanel`** — `Surface e={2}` params + primary Run; render `idle | running | results`; results in
  a solid table/tree.
- **`BuilderFrame`** — full-height solid canvas slot + edge-docked `Surface e={2/3}` toolbars
  (absolute) + a solid inspector; include a `<details>` keyboard node list for a11y.
- **`TreeRow`** — `EntityRow` variant, `paddingLeft = depth*20 + 12`, expand chevron, 200ms expand.
- **`EmptyState`** — centered icon + one line + primary action.
- **`CommandPalette`** (`⌘K`) — glass panel (allowed), `e-3`, fuzzy list, full keyboard.
- **`FormDialog` / `FormDrawer`** — `--r-lg`, solid body (inputs never glass), `e-3`; surface backend
  `message` on error (not the generic axios string — see the Orders fix already shipped).
- **`Skeleton`, `useToast`/`Toast`** — per §5.7-5 and §5.7-2/11.

---

## 8. Route → archetype map

| Route | Archetype | Notes |
|---|---|---|
| `/home` | **Cockpit** (4.1) | new default landing; role-filtered work queues |
| `/orders` | **Pipeline** (4.4) default + **List** (4.2) toggle | board is the headline; keep list for power users |
| `/orders/:id` | **Detail** (4.3) | header + cross-links (lines→items, BOM, schedule, supplier) + tabs |
| `/mrp` | **Run** (4.6) | params → planned-order results → "firm" hand-off |
| `/workbench` | **Run** (4.6) + **Tree** (4.7) | planned-order tree, firm-tree action |
| `/scheduler` | **Canvas** (4.5) | Gantt + docked solid toolbars; keep list fallback |
| `/grn`, `/grn-detail` | **Run/Form** (4.6) + **Detail** (4.3) | receive flow → lines → stock |
| `/item-catalog` | **List** (4.2) | facet chips by category/group/type |
| `/item-catalog/:id` | **Detail** (4.3) | tabs: Overview · BOM · Routing · Stock · Suppliers · Orders |
| BOM designer (in item detail) | **Canvas** (4.5) / **Tree** (4.7) | structural editor |
| `/routing-plans` | **List** (4.2) | |
| `/routing-plans/:id` | **Canvas** (4.5) | node-graph builder + solid inspector |
| `/resource-types` | **List**/**Detail** | types → resources + machines tab |
| `/plants` | **List** → **Detail** | plant → stock locations, resources, calendars |
| `/suppliers`, `/suppliers/:id` | **List** + **Detail** | supplier → supplier×item, GRNs |
| `/shift-calendars` | **List** + **Detail** | calendar → shifts, working days |
| `/item-metrics`, `/constants` | **List** (4.2) | simple reference tables |
| `/item-batches` | **List** (4.2) | stock batch table |
| (new) Configure landing | **Readiness** (4.8) | model-completeness checklist |

---

## 9. Designing a screen you haven't seen — decision procedure

1. **What is the user doing here?** Deciding next action → Cockpit · Finding one record → List ·
   Studying/editing one record + relations → Detail · Watching many move through stages → Pipeline ·
   Editing a structure visually → Canvas · Triggering a calc & acting on results → Run · Reading
   nested data → Tree · Setting up the model → Readiness.
2. **Pick the recipe(s)** (§7) for that archetype. Don't invent layout.
3. **Surfaces are solid** (`Surface` + elevation). Glass only if you're literally building the top bar
   or a modal/palette. If tempted to put a panel on glass — don't.
4. **Wire cross-links** (§2.2) if it's a Detail — always.
5. **Tokens only** (§5): violet accent used sparingly, semantic colors for meaning, Geist + mono,
   elevation not heavy shadows, motion tokens.
6. **Add the relevant micro-interactions** (§5.7).
7. **Run the a11y checklist** (§6). Especially "never color alone" and focus-visible.
8. **Match neighbors.** Open a built screen of the same archetype and mirror its structure, density,
   and spacing. Sameness is the goal.

---

## 10. Install once

1. **Fonts** — add the Geist + JetBrains Mono `<link>` (§5.4) to `index.html`.
2. **`src/theme/tokens.css`** (imported in `main.tsx`) — define all §5 CSS variables for `:root`
   (light) and the dark selector; the optional canvas tint; the `.glass` class; the `@supports` /
   `prefers-reduced-transparency` / `prefers-reduced-motion` fallbacks; and the global `:focus-visible`
   outline.
3. **`theme.ts` (MUI) deltas:**
   - `palette.primary = { main:'#6D28D9', light:'#A570EF', dark:'#5B21B6', contrastText:'#fff' }`.
   - `palette.secondary.main = '#0D9488'` (teal, supporting).
   - `palette.background.default = 'var(--c-canvas)'`, `paper = 'var(--c-surface)'`.
   - `typography.fontFamily = "var(--font-ui)"`; keep the §5.4 scale; weights 400/500/600 only.
   - Replace `MuiCard`/`MuiPaper` heavy shadow with `border: 1px solid var(--c-border)` + `--e-1`;
     remove `elevation1` heavy shadow.
   - Restyle `MuiAppBar` to `GlassBar`; **`MuiDrawer`/side rail = solid** (`--c-surface`, 1px border),
     keeping the `--sidebar-*` contract from `Sidebar.tsx`.
   - Keep radius/typography from §5.4–5.5; keep both light & dark (fully tokenized, free to maintain).
4. **Shared primitives** — add `Surface`, `GlassBar`, `StatusBadge`, `useCountUp`, `statusMap.ts`
   first; the rest of §7 follows.

**Migration order (low risk → high visibility):**
1. Fonts + tokens.css + theme deltas + `Surface`/`GlassBar`/`StatusBadge` — palette/font alone
   modernizes everything.
2. Re-shell: grouped solid rail + glass top bar + breadcrumbs + `/home` cockpit.
3. Convert **Orders** to Pipeline + Detail (the screen the client complained about — fastest win).
4. Roll List/Detail across Items, Suppliers, Plants, Resources, Calendars, Routing, GRN.
5. Polish Canvas screens (Scheduler, Routing builder, BOM) with docked solid panels.
6. Add the Configure **Readiness** landing.

---

*Build every screen from this document. If something here is wrong for the client's real workflow,
fix it **here first**, then implement — so the system stays the single source of truth.*
