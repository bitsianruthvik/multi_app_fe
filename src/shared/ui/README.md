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
| **Collections** | `EntityList` / `EntityRow` · `DataTable` · `FilterBar` / `FacetChip` · `SortableTableHead` · `NumberCell` / `QtyCell` / `DateCell` |
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
