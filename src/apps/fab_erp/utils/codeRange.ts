/**
 * codeRange.ts — how a row's code reads on screen when the row is several pieces.
 *
 * A row's code is its FIRST piece (SPAN1-L1-1); a qty-4 row also has a last
 * (SPAN1-L1-4). The screen shows `SPAN1-L1-1…4`: the first code, then only
 * the digits that differ. The order prefix (customer + order number, the same
 * on every row) is hidden; the full codes are one hover away.
 */

/** The code without the order prefix, when it carries one. */
export const stripPrefix = (code: string, prefix: string | null | undefined): string =>
  (prefix && code.startsWith(prefix) ? code.slice(prefix.length) : code);

/**
 * The tail of `last` that differs from `first`, starting at the number —
 * "4" for SPAN1-L1-1 → SPAN1-L1-4, "12" for …-TF1 → …-TF12.
 */
export const rangeTail = (first: string, last: string): string => {
  let i = 0;
  while (i < first.length && i < last.length && first[i] === last[i]) i++;
  while (i > 0 && /\d/.test(last[i - 1])) i--;
  return last.slice(i);
};

/** `SPAN1-L1-1…4`, or just the code when the row is one piece. */
export const codeRangeLabel = (
  code: string | null | undefined,
  last: string | null | undefined,
  prefix: string | null | undefined,
): string | null => {
  if (!code) return null;
  const shown = stripPrefix(code, prefix);
  return last && last !== code ? `${shown}…${rangeTail(code, last)}` : shown;
};
