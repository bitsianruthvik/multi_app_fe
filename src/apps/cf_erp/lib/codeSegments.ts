/**
 * A row's code with the numbers its # stands for: the backend cuts the code at
 * each # (placeholderService.segmentsOf) and says what each one runs over, so
 * the screen only prints them — it never works the numbering out.
 *
 *   SO260002-CG#-L4   →   SO260002-CG(1,2,3)-L4     up to 6 numbers, listed
 *   IDP#              →   IDP(1–16)                  more than 6, as a range
 */
export type CodeSegment = { text: string } | { from: number; to: number; values?: number[] };

/** How many numbers are listed before a run is shortened to a range. */
export const MAX_LISTED = 6;

export function numbersText(seg: { from: number; to: number; values?: number[] }): string {
  if (seg.values && seg.values.length <= MAX_LISTED) return seg.values.join(',');
  return seg.from === seg.to ? String(seg.from) : `${seg.from}–${seg.to}`;
}

/** The code as drawn, with each # replaced by its numbers in brackets; the plain code where the backend gave no segments. */
export function codeWithNumbers(code: string, segments?: CodeSegment[] | null): string {
  if (!segments?.length) return code;
  return segments.map((s) => ('text' in s ? s.text : `(${numbersText(s)})`)).join('');
}

/** Whether the code carries any # at all (so there is something for the tooltip to explain). */
export const hasNumbers = (segments?: CodeSegment[] | null): boolean => !!segments?.some((s) => !('text' in s));

export const CODE_NUMBERS_TITLE = 'Codes are given when the design is frozen. The numbers in brackets are the copies this row stands for.';
