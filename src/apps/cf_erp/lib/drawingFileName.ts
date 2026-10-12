import { MAX_LISTED, type CodeSegment } from './codeSegments';

/**
 * The file name that sends a drawing to a row's copies: the code with its numbers in brackets,
 * exactly as the code preview prints them — `L(1,5)-1-TFL1.dxf`, or `L(2–4)-…` for a run.
 * The server reads the same syntax back (lib/drawingName.js), so what is copied here is what
 * is matched there. Several rows: each # is given the numbers of ALL of them.
 */

type Numeric = { from: number; to: number; values?: number[] };
const isNumeric = (s: CodeSegment): s is Numeric => !('text' in s);

/** The numbers a run stands for (a long unlisted run is its two ends). */
function numbersOf(s: Numeric): number[] {
  if (s.values?.length) return s.values;
  if (s.to - s.from > 5000) return [s.from, s.to];
  const out: number[] = [];
  for (let n = s.from; n <= s.to; n++) out.push(n);
  return out;
}

/** The segments of several rows as one: same text, each # with the numbers of every row. Null when the rows are not built alike. */
export function mergeSegments(list: CodeSegment[][]): CodeSegment[] | null {
  if (!list.length) return null;
  const first = list[0];
  if (list.some((l) => l.length !== first.length)) return null;
  const out: CodeSegment[] = [];
  for (let i = 0; i < first.length; i++) {
    const at = list.map((l) => l[i]);
    const head = at[0];
    if (isNumeric(head)) {
      if (!at.every(isNumeric)) return null;
      // Rows that all say the same keep it as the code printed it.
      const key = (s: Numeric) => `${s.from}:${s.to}:${(s.values ?? []).join()}`;
      if (at.every((s) => key(s as Numeric) === key(head))) { out.push(head); continue; }
      const all = [...new Set(at.flatMap((s) => numbersOf(s as Numeric)))].sort((a, b) => a - b);
      const contiguous = all.length === all[all.length - 1] - all[0] + 1;
      // Few numbers are listed (the way the preview lists them); a long unbroken run is a range.
      out.push({ from: all[0], to: all[all.length - 1], ...(all.length <= MAX_LISTED || !contiguous ? { values: all } : {}) });
    } else {
      if (!at.every((s) => !isNumeric(s) && (s as { text: string }).text === (head as { text: string }).text)) return null;
      out.push(head);
    }
  }
  return out;
}

/** Numbers for a file name: a run of 3 or more in a row is a range with an en dash, two stay listed — (8,9,10,12) → (8–10,12). */
export function numbersForName(nums: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < nums.length;) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    if (j - i >= 2) out.push(`${nums[i]}–${nums[j]}`);
    else for (let k = i; k <= j; k++) out.push(String(nums[k]));
    i = j + 1;
  }
  return out.join(',');
}

/** The segments as a file name prints them (the grid's code preview keeps its own rule). */
export function segmentsForName(segs: CodeSegment[]): string {
  return segs.map((s) => {
    if (!isNumeric(s)) return s.text;
    if (!s.values?.length && s.to - s.from > 5000) return `(${s.from}–${s.to})`;
    return `(${numbersForName(numbersOf(s).slice().sort((a, b) => a - b))})`;
  }).join('');
}

/** A name a file system takes: no slashes, colons and the like. */
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();

export interface NamedRow { code: string | null; segments?: CodeSegment[] | null }

/** `L(1,5)-1-TFL1.dxf` for these rows, or null when none of them has a code to build it from. */
export function drawingFileName(rows: NamedRow[], ext = 'dxf'): string | null {
  const withCode = rows.filter((r) => r.code || r.segments?.length);
  if (!withCode.length) return null;
  const segs = withCode.map((r) => r.segments ?? null);
  const merged = segs.every((s) => s && s.length) ? mergeSegments(segs as CodeSegment[][]) : null;
  const text = merged ? segmentsForName(merged) : withCode[0].segments?.length ? segmentsForName(withCode[0].segments) : withCode[0].code ?? '';
  const name = safe(text);
  return name ? `${name}.${ext}` : null;
}
