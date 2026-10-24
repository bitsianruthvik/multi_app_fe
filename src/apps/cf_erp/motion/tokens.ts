/**
 * Motion tokens (TM/CF_ERP_MOTION_SPEC.md rule 1). Use these, never literals.
 * The same values exist as CSS custom properties in motion.css (--m-*), so
 * sx / CSS can say `var(--m-dur-base) var(--m-ease-standard)`.
 */

/** Milliseconds. */
export const duration = {
  /** Press feedback, colour changes, tooltips. */
  fast: 140,
  /** Most enters: fade, rise, pop, menus. */
  base: 200,
  /** Upper end of "most things": dialogs, snackbars, collapse. */
  slow: 260,
  /** Large panels / page-level transitions only (drawers). */
  panel: 300,
  /** A refused-action nudge, one pass. */
  nudge: 280,
  /** A highlight flash (colour only) when a value changes. */
  flash: 900,
  /** CountUp on first show. */
  countUp: 800,
  /** A milestone celebration, start to clean-up. */
  celebrate: 1000,
} as const;

export const easing = {
  /** Enter / standard. */
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  /** Exit. */
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
} as const;

/** Stagger limits (rule 4): only the first `max` children, the whole run ≤ `total` ms. */
export const stagger = { max: 12, step: 35, total: 400 } as const;

/** Press feedback scale for buttons. */
export const pressScale = 0.98;

/** `transition` shorthand for the given properties, e.g. transition(['opacity','transform']). */
export function transition(props: string[], ms: number = duration.base, ease: string = easing.standard): string {
  return props.map((p) => `${p} ${ms}ms ${ease}`).join(', ');
}
