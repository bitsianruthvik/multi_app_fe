# `@shared/ui` — the platform component kit

This folder is the **implementation of `multi_app_fe/DESIGN_SYSTEM.md`**. That document is the
reasoning; this is the code. Read §5 (tokens), §4 (archetypes) and §7 (recipes) before adding
anything here.

**The rule: a new app imports from `@shared/ui`. If a component is missing, it is added to the
kit, not to the app.** An app's own `components/` folder holds only what is genuinely specific to
its domain — a BOM tree, an org chart, a shift grid. A table, a dialog, a badge or a nav row is
never app-specific.

`fab_erp` and `cf_erp` predate the kit and keep their own copies of these components. Both are in
production and their copies have drifted; they migrate later, as separate work. Do not "fix" them
by pointing them here piecemeal.

---

## Using it

```tsx
import { ThemeScope, CommandPaletteProvider, AppShell } from '@shared/ui';
import { SECTIONS, COUNT_META } from './navMeta';

<ThemeScope appSlug="cf_hrms">
  <CommandPaletteProvider appSlug="cf_hrms" sections={SECTIONS} actions={QUICK_ACTIONS}>
    <AppShell
      appSlug="cf_hrms"
      sections={SECTIONS}
      brand={{ label: 'HRMS' }}
      counts={counts}
      countMeta={COUNT_META}
      quickCreate={QUICK_CREATE}
    >
      <Routes>…</Routes>
    </AppShell>
  </CommandPaletteProvider>
</ThemeScope>
```

`ThemeScope` sets `data-ui="platform"` on `<html>` (which switches the tokens on), nests the MUI
theme, namespaces stored UI preferences to the app slug, and mounts the toast stack. The palette
sits inside it and outside the shell, so `⌘K` works on every route.

Then a screen is just:

```tsx
import { PageHeader, FilterBar, DataTable, EmptyState, StatusBadge } from '@shared/ui';
```

## What's in it

| Group | Components |
|---|---|
| **Primitives** | `Surface` · `GlassBar` · `Mono` · `CapsLabel` · `PageHeader` · `SectionCard` · `StickyActionBar` · `StatusBadge` · `ToneBadge` · `StatStrip` · `EmptyState` · `Callout` · `StageIcon` · skeletons |
| **Collections** | `EntityList` / `EntityRow` · `DataTable` · `SheetGrid` · `FilterBar` / `FacetChip` · `SortableTableHead` · `NumberCell` / `QtyCell` / `DateCell` |
| **Records** | `DetailLayout` · `DetailHeader` · `DetailTabs` · `CrossLink` · `FactItem` · `RunPanel` · `PipelineBoard` |
| **Overlays** | `FormDialog` · `ConfirmDialog` · `PromptDialog` · `ErrorNotice` · `SideSheet` · `ToastProvider` / `useToast` · `ShortcutsHelp` · `CommandPaletteProvider` |
| **Shell** | `ThemeScope` · `AppShell` · `TopNav` · `SectionNav` · `MobileNavSheet` · `useDetailTitle` |
| **Hooks** | `useCountUp` · `useSortableData` · `useIsPermitted` · `useCompanySlug` · `useShortcutsHelp` |
| **Contracts** | `NavSection` / `NavScreen` / `BadgeTone` / `CountMeta` / `Can` · `resolveNav` · `appPath` · status registry |
| **Tokens** | `tokens.css` — every colour, shadow, radius, font and duration, light and dark |

## The four rules the kit is built on

1. **No app knowledge.** Nothing here imports from `@apps/*`. Anything app-shaped — statuses, API
   clients, routes, entity types — arrives as a prop, a type parameter or a registration.
2. **Tokens only.** No hex, no px shadow, no font name in a component. Everything reads
   `var(--…)`. A value changes in `tokens.css` and every screen follows.
3. **Behaviour is not negotiable.** Column control, density, CSV export, selection, keyboard row
   navigation, focus-visible, reduced motion, touch fallbacks for hover-revealed actions — these
   are why the kit exists. A "simpler" version that drops them is a regression, not a
   simplification.
4. **The nav has one source.** `NavSection[]` drives the top nav, the section row, the breadcrumb,
   the palette and the mobile sheet. A second list is how a nav and a breadcrumb start disagreeing.

## Status colours

The kit knows five tones (`neutral` `success` `warning` `danger` `info`) and no statuses. An app
registers its vocabulary once, next to its navMeta:

```ts
registerStatusTones({ draft: 'warning', confirmed: 'success', cancelled: 'danger' });
registerStatusLabels({ ready_to_ship: 'Ready to ship' });
```

After that `<StatusBadge status={row.status} />` is correct everywhere. A one-off screen can still
pass `tone` or `map` directly. An unregistered status renders neutral — which is the failure mode
to watch for: a grey chip where a green one belonged.

## Adding a component

1. Check it is genuinely general. "Two apps would want this" is the bar; one app's need is that
   app's component.
2. Check DESIGN_SYSTEM.md for the archetype and recipe it belongs to. If the document has no
   opinion yet, **add the opinion there first**, then build to it.
3. Write it with zero app imports, tokens only, and a comment that says *why* it exists — what
   goes wrong without it — not what it renders.
4. Export it from `index.ts`, and list it in the table above.

## Adding a token

Add it to `tokens.css` in both the light block and the dark block. A token that only exists in
light mode is a bug waiting for someone to switch themes at 6pm.

## SheetGrid

The Excel-like grid: click / Shift-click / drag selects, column and row headers select a whole
column or row (`rowSelect` widens a row header to a subtree), Ctrl+C copies TSV, Ctrl+V pastes TSV
(refused whole if any target is read-only), double-click / Enter / F2 / typing edits, Escape
cancels, Delete clears, arrows and Tab move. The screen supplies `cellAt(rowKey, colKey)` (text,
`editable`, `tone`, `kind`, `mark`) and receives `onWrites`; the grid never writes anything itself.
`tone`: `muted` computed, `strong` typed over, `warning`, `blank` (no box, never written).
Extras: `lead` / `trail` row slots, `rowProps` / `rowSx` per row, `onProblem`, and a ref with
`clearSelection()`. **Undo / redo:** every `onWrites` call (edit, paste, Delete) is one history entry (50 max); Ctrl/Cmd+Z undoes, Ctrl+Y / Ctrl+Shift+Z redoes, never while an editor is open, a new write clears redo, cells that became read-only are skipped with an `onProblem` message. The restore text is `cell.restore ?? cell.text` read before the write — set `restore` where `text` would not put the cell back (a formula cell: `restore: ''`). `historyKey` resets history when it changes; the ref also has `selectCell(rowKey, colKey)` (select and scroll to one cell), `undo()`, `redo()`, `canUndo`, `canRedo`, and `onHistoryChange` reports them. **Fill:** Ctrl/Cmd+D copies the top row of the selection into the other selected rows, per column (a single row copies from the row above); Ctrl/Cmd+R does the same rightward from the left column. Only editable, non-blank cells are written; the rest are counted in an `onProblem` message ("N cells skipped"). One history entry. **Option matching** (paste, and typing in an option editor): exact value/label (case-insensitive), else a label starting with the text then a space/dash/end ("BO" → "BO — no impact test"), else a unique whole-word match; ambiguous input is refused naming the candidates. `matchOption(options, text)` is exported. Tests: `node scripts/sheet_grid_test.mjs`.

**Not applicable (`applies: false`).** When a grid's columns are shared by rows that do not all use them (BOM values per spec, operations per flow), return `{ text: '', applies: false, why: 'Not a value of Web plate' }` for the cells a row does not have. The cell is drawn low-light (`--c-surface-3` with a faint diagonal hatch, no text, theme tokens only), is never editable, is stepped over by Tab / Shift+Tab and by Enter-to-next-row inside an editor, and is left alone by paste, Ctrl+D / Ctrl+R and Delete. A paste or fill that touches n/a cells writes the rest and reports "N cells don't apply to their row and were skipped" (a paste onto n/a cells only writes nothing and says so). `why` is the tooltip. Keep it distinct from the other states: `editable: false` = applies but cannot be typed (stays normal contrast, "—" when empty); `tone: 'warning'` / `tint` = applies and a required value is missing (amber); `tone: 'blank'` = no box at all. Cells that apply get a faint row emphasis on hover; n/a cells do not. Clicking an n/a cell still selects it (so it can be copied or its tooltip read), arrows still step onto it.
