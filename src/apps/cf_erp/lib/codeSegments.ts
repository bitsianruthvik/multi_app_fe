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

/** Whether two segments are the same (text equal, or the same run of numbers). */
const sameSeg = (a: CodeSegment, b: CodeSegment): boolean => ('text' in a && 'text' in b ? a.text === b.text
  : !('text' in a) && !('text' in b) && a.from === b.from && a.to === b.to && (a.values ?? []).join() === (b.values ?? []).join());

/** The joining separator a child's own part starts with (-, _, ., /, spaces) is not part of it. */
const stripLead = (s: string): string => s.replace(/^[^A-Za-z0-9#(]+/, '');

/**
 * Only the part of a row's code that this row adds to its parent's: the parent's segments are a
 * prefix of the child's, so what is left over (minus the joining separator) is the row's own part,
 * brackets drawn as in the full code. Without segments it falls back to the code string minus the
 * parent's code as a prefix; an empty string where neither works.
 */
export function ownCodePart(code: string, segments: CodeSegment[] | null | undefined, parentCode: string | null | undefined, parentSegments: CodeSegment[] | null | undefined): string {
  if (!code) return '';
  if (segments?.length && parentSegments?.length) {
    let i = 0, lead = '', ok = true;
    for (; i < parentSegments.length && ok; i++) {
      const p = parentSegments[i], c = segments[i];
      if (!c) { ok = false; break; }
      if ('text' in p && 'text' in c && i === parentSegments.length - 1 && c.text.startsWith(p.text) && c.text !== p.text) lead = c.text.slice(p.text.length);
      else if (!sameSeg(p, c)) ok = false;
    }
    if (ok) {
      const rest: CodeSegment[] = [...(lead ? [{ text: lead }] : []), ...segments.slice(i)];
      const first = rest[0];
      if (first && 'text' in first) rest[0] = { text: stripLead(first.text) };
      const out = codeWithNumbers('', rest.filter((s) => !('text' in s) || s.text));
      if (out) return out;
    }
  }
  if (parentCode && code.startsWith(parentCode) && code.length > parentCode.length) return stripLead(code.slice(parentCode.length));
  return '';
}
