/**
 * The ONE unit list (EU-16 item 5). `pcs` and `nos` used to be typed directly
 * by three different screens — the catalog quick-add dialog defaulted to
 * `pcs`, the BOM designer's new-item dialog defaulted to `nos`, and the
 * importer offered `pcs` — none of which are in this list, so a fresh item
 * could carry a unit no dropdown here would ever offer again.
 *
 * `PC` is the list's own answer to "one piece"; existing rows already storing
 * the lowercase `pcs`/`nos` spellings are NOT rewritten (a display-only
 * concern — see `displayUnit` below), only new writes are steered onto `PC`.
 */
export const STANDARD_UOMS = [
  { label: 'EA',    value: 'EA' },
  { label: 'PC',    value: 'PC' },
  { label: 'KG',    value: 'KG' },
  { label: 'G',     value: 'G' },
  { label: 'MG',    value: 'MG' },
  { label: 'TON',   value: 'TON' },
  { label: 'L',     value: 'L' },
  { label: 'ML',    value: 'ML' },
  { label: 'M',     value: 'M' },
  { label: 'CM',    value: 'CM' },
  { label: 'MM',    value: 'MM' },
  { label: 'M2',    value: 'M2' },
  { label: 'M3',    value: 'M3' },
  { label: 'BOX',   value: 'BOX' },
  { label: 'SET',   value: 'SET' },
  { label: 'PAIR',  value: 'PAIR' },
  { label: 'ROLL',  value: 'ROLL' },
  { label: 'SHEET', value: 'SHEET' },
  { label: 'PACK',  value: 'PACK' },
  { label: 'DZ',    value: 'DZ' },
];

/** The unit a fresh row (no unit typed yet) should default to. */
export const DEFAULT_UOM = 'PC';

/**
 * Display-only remap for the two legacy spellings this list retired. Stored
 * values are never rewritten by this map — only how they render.
 */
const LEGACY_UOM_DISPLAY: Record<string, string> = { pcs: 'PC', nos: 'PC' };

/** What to show for a stored unit, keeping `pcs`/`nos` rows readable. */
export function displayUom(unit: string | null | undefined): string {
  if (!unit) return '';
  return LEGACY_UOM_DISPLAY[unit.trim().toLowerCase()] ?? unit;
}
