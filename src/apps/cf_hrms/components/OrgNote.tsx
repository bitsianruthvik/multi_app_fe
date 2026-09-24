/**
 * `OrgNote` was written here before the kit had a callout. It now IS the kit's
 * `Callout` — kept only as a name the Organisation screens already import.
 *
 * Prefer `import { Callout } from '@shared/ui'` in new code. When the seven
 * Organisation screens are next touched, switch them over and delete this file.
 * The rule is in DESIGN_SYSTEM.md: a missing component is added to the kit, not
 * to the app.
 *
 * The dark-mode workaround this file used to carry is gone: `tokens.css` now
 * re-tones every tint fill and its text for dark, so tinted surfaces no longer
 * glare at night.
 */
export { Callout as OrgNote } from '@shared/ui';
