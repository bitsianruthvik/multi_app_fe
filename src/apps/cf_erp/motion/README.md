# CF_ERP motion

The shared pieces for TM/CF_ERP_MOTION_SPEC.md (read it first). Motion tells the user something (saved, moved, finished,
loading), never decoration. Import from `../motion` (relative to your file), never write durations or easings as literals.

`motion.css` (keyframes, helper classes, reduced-motion kill-switch) is loaded once by
`components/shell/CfErpThemeScope.tsx`. Do not import it anywhere else: the jsdom test scripts bundle components without it.

| Piece | What it does |
|---|---|
| `duration`, `easing`, `transition()` | Tokens: fast 120 / base 160 / slow 200 / panel 280 ms, nudge 240, flash 600, countUp 600, celebrate 900; standard and exit easings. CSS twins: `--m-dur-*`, `--m-ease-standard`, `--m-ease-exit`. |
| `useReducedMotion()` | Live `prefers-reduced-motion: reduce`. No `matchMedia` (SSR, jsdom) → `false`, never throws. `prefersReducedMotion()` is the non-hook version; `motionOff()` is also true in jsdom. |
| `<FadeIn>` | One-time enter (`variant` fade / rise / pop) on mount. Content is in the DOM at once. |
| `<Stagger max={12}>` | Staggered enter for the first N children only (N ≤ 12, whole run ≤ 300 ms). No wrapper: children must take `className` / `style`. |
| `<FlashOnChange value>` | Brief colour highlight when `value` changes; never on first render. |
| `<CountUp value>` | Counts up from 0 on first show only (≤ 600 ms). Shows the final value at once under reduced motion / in jsdom; while counting the final value is there for screen readers. |
| `<SuccessCheck>` | A check mark that draws itself once. `role="img"`, label "Done" (pass `label=""` if decorative). |
| `celebrate(anchor?)` | Rare-milestone burst (≤ 900 ms) at the anchor or screen centre; removes itself; once per action. |
| `nudge(el)` | One "nope" shake (≤ 250 ms) on a refused action. Pair it with the message saying why. |
| `.cfm-shimmer` | Loading placeholder shimmer (the only looping motion allowed). |
| `.cfm-interactive` | Hover elevation for a clickable Card / Paper that is not `role="button"` / `<a>`. |

## Examples

```tsx
import { FadeIn, Stagger, FlashOnChange, CountUp, SuccessCheck, celebrate, nudge, duration, easing } from '../motion';

<FadeIn variant="rise"><EmptyState … /></FadeIn>

<Stagger max={12}>{cards.map((c) => <OrderCard key={c.id} {...c} />)}</Stagger>

<FlashOnChange value={order.status}><StatusChip status={order.status} /></FlashOnChange>

<CountUp value={stat.value} format={(n) => formatINR(n)} />

{saved && <SuccessCheck size={18} />}

const onConfirm = async (e: React.MouseEvent<HTMLElement>) => {
  const anchor = e.currentTarget;            // keep before the await
  const r = await markPaid(id);
  if (r.fullyPaid) celebrate(anchor);        // milestones only, never routine saves
};

if (!canRelease) { nudge(releaseBtnRef.current); toast.error('Lock the BOM first'); }

<Box sx={{ transition: `opacity ${duration.base}ms ${easing.standard}` }} />
// or in CSS: transition: opacity var(--m-dur-base) var(--m-ease-standard);
```

## MUI theme (`muiMotion.ts`, wired in `../theme.ts`)

- `theme.transitions` durations/easings come from the tokens: Dialog and Snackbar enter 200 / leave 160 ms,
  Tooltip 160, Collapse 200 (pass `timeout="auto"` for big panels), `transitions.create()` defaults to 200 ms.
- Drawer 280 / 200 ms; Menu and Popover 160 / 120 ms (instead of MUI's height-based "auto").
- Dialog paper rises 6 px as it fades in.
- Button, IconButton, ToggleButton, Fab: scale 0.98 while pressed (off under reduced motion). Not on list items, tabs,
  switches or table rows.
- Card / Paper hover elevation only when interactive: `role="button"`, rendered as `<a>`, a Card holding a
  CardActionArea, or the `cfm-interactive` class.

## Rules of thumb

- Animate only opacity / transform / colour. No layout animation on big lists; no per-row enter past the first ~12 rows.
- Nothing may delay a click, key, save or navigation. Shop-floor screens: feedback and loading only.
- Reduced motion is handled here (CSS kill-switch + the hook); never check it ad hoc.
- Tests run in jsdom: elements must be present at once; the pieces here guarantee that.
