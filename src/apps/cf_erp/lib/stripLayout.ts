/**
 * The order screens' strip layout (SheetGrid `rowColumns`): each row shows only
 * the cells that are its own, with a short label above them (user, 2026-10-02:
 * "only those cells relevant to it with a short name of the cell above it").
 * Pure, so the rules are tested (scripts/cf_erp_bom_grid_test.mjs).
 */

/**
 * The dimensions, in the order they lead a row (user, 2026-10-02: thickness,
 * length, width). Matched by specification CODE — the codes every tenant uses
 * (THICKNESS / LENGTH / WIDTH, checked in the local DB 2026-10-02).
 */
export const DIMENSION_CODES = ['THICKNESS', 'LENGTH', 'WIDTH'] as const;
const DIMS = new Set<string>(DIMENSION_CODES);
export const isDimension = (code: string) => DIMS.has(code);

/**
 * A row's spec cells in the order they are drawn. A row with ANY of the three
 * dimensions shows ALL THREE first, Thk · L · W — a missing one is drawn as a
 * cell that does not apply, so rows line up; a row with none skips them
 * altogether. Every other spec follows in its existing order.
 */
export function dimensionsFirst(codes: readonly string[]): string[] {
  const rest = codes.filter((c) => !DIMS.has(c));
  return codes.some((c) => DIMS.has(c)) ? [...DIMENSION_CODES, ...rest] : rest;
}

/** Well-known specs get a word a fitter would write on a drawing. */
const SHORT: Record<string, string> = {
  THICKNESS: 'Thk', LENGTH: 'L', WIDTH: 'W', DEPTH: 'D', DIAMETER: 'Dia', SECTION_AREA: 'Area', WEIGHT: 'Wt',
  DENSITY: 'Density', CUT_LENGTH: 'Cut L', SPAN_LENGTH: 'Span L', MAX_THICKNESS: 'Max thk', GRADE: 'Grade',
  MATERIAL: 'Material', IMPACT_CLASS: 'Impact', PART_FUNCTION: 'Function', DRAWING_MARK: 'Dwg mark', HEAT_NO: 'Heat no',
  BOLT_CLASS: 'Bolt cl', SKEW_ANGLE: 'Skew', GIRDER_SPACING: 'Spacing', PIERCINGS: 'Pierce', HOLED: 'Holed',
  NESTING: 'Nesting', NEST_MANUAL: 'Nest by hand', SHIP_UNIT: 'Ship unit',
};
const MAX = 14;

/**
 * The label above a cell: a known short word, else the name, cut to fit a
 * cell (the tooltip carries the whole name). Specifications have no short-name
 * field of their own, so this is the one place the words are chosen.
 */
export function shortLabel(code: string, name?: string | null): string {
  if (SHORT[code]) return SHORT[code];
  const text = (name || code).trim();
  return text.length <= MAX ? text : `${text.slice(0, MAX - 1).trimEnd()}…`;
}

/** An operation's label: its name when short, else its code. */
export function opShortLabel(op: { code?: string | null; name: string }): string {
  if (op.name.length <= MAX) return op.name;
  return op.code && op.code.length <= MAX ? op.code : `${op.name.slice(0, MAX - 1).trimEnd()}…`;
}
