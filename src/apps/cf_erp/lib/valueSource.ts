/**
 * Where a formula value on a row comes from, in the words the grid shows
 * (user, 2026-10-12: "use the true shape wherever possible … give an option to override manually,
 * and show it somewhere that a manual value was filled").
 *
 * The backend says it per cell (orderValuesService cells: `from`, `calculated`, `noCalc`; a resolved
 * spec's `derived`): 'calculated' — worked out by a formula; 'drawing' — worked out from the part's
 * drawing; 'typed' — a person typed over the calculated value, which is given beside it. Pure: no
 * React, no requests — scripts/cf_erp_value_source_test.mjs reads these sentences.
 */
export type ValueFrom = 'calculated' | 'drawing' | 'typed';

export interface ValueSource {
  from: ValueFrom;
  /** The calculated value a typed one replaced, in words — null when there is none yet. */
  calculated: string | null;
  /** Why there is no calculated value ("waiting for LENGTH"), when there is none. */
  noCalc: string | null;
}

export interface SourceMark {
  from: ValueFrom;
  /** The one-letter marker in the corner of the cell. */
  glyph: string;
  /** Two or three words, for a screen reader and for lists. */
  label: string;
  /** The tooltip. */
  title: string;
  /** Typed over a calculated value, on a cell that may be changed: one click goes back to it. */
  canGoBack: boolean;
}

export const SOURCE_LABEL: Record<ValueFrom, string> = {
  calculated: 'worked out',
  drawing: 'from the drawing',
  typed: 'typed by hand',
};

const GLYPH: Record<ValueFrom, string> = { calculated: 'ƒ', drawing: '▱', typed: '✎' };

/** The sentence for a value typed over a calculated one. */
export function typedTitle(s: Pick<ValueSource, 'calculated' | 'noCalc'>, editable: boolean): string {
  if (s.calculated != null) return `Typed by hand — the calculated value is ${s.calculated}.${editable ? ' Click to go back.' : ''}`;
  return `Typed by hand — nothing is calculated here yet${s.noCalc ? ` (${s.noCalc})` : ''}.${editable ? ' Click to take the typed value away.' : ''}`;
}

/** What a cell says about where its value comes from; null for a value no formula gives. */
export function sourceMark(s: ValueSource | null | undefined, editable: boolean): SourceMark | null {
  if (!s?.from) return null;
  if (s.from === 'typed') return { from: 'typed', glyph: GLYPH.typed, label: SOURCE_LABEL.typed, title: typedTitle(s, editable), canGoBack: editable };
  const what = s.from === 'drawing' ? 'From the drawing' : 'Worked out';
  return { from: s.from, glyph: GLYPH[s.from], label: SOURCE_LABEL[s.from], title: `${what}${editable ? ' — type over it to set it by hand' : ''}.`, canGoBack: false };
}

/** The same, read off a resolved specification (a record's own page, a catalog BOM). */
export function sourceOfDerived(d: { source?: string | null; calculated?: { display?: string | null } | null; waiting?: string[] | null; problem?: string | null } | null | undefined): ValueSource | null {
  if (!d?.source || !['calculated', 'drawing', 'typed'].includes(d.source)) return null;
  const from = d.source as ValueFrom;
  const waiting = d.waiting?.length ? `waiting for ${d.waiting.slice(0, 3).join(', ')}${d.waiting.length > 3 ? ` and ${d.waiting.length - 3} more` : ''}` : null;
  return { from, calculated: from === 'typed' ? d.calculated?.display ?? null : null, noCalc: from === 'typed' && !d.calculated ? waiting ?? d.problem ?? null : null };
}
