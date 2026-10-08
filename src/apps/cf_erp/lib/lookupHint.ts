/**
 * Where the caret is in relation to a LOOKUP( … ) call — pure, so the editor can
 * show a hint under the text and narrow the type-ahead to what fits there.
 *
 *   LOOKUP(machine.CUT_SPEED, item.THICKNESS)
 *          ^ argument 0 (the chart)  ^ argument 1 (the piece's value)
 */
export interface LookupArg { from: number; to: number; text: string }

export interface LookupCall {
  /** Start of the word LOOKUP. */
  start: number;
  /** One past the end of the call: after its `)`, or the end of what is typed when it is not closed yet. */
  end: number;
  /** Index of the `(`; null while only the word LOOKUP is typed. */
  open: number | null;
  /** Index of the matching `)`; null when not closed. */
  close: number | null;
  /** The argument the caret is in (0 = the chart, 1 = the first key, 2 = the second key). */
  arg: number;
  /** The caret is directly in LOOKUP's own brackets (not inside a nested MAX( … ), say). */
  direct: boolean;
  /** Every argument typed so far, trimmed, with where it sits in the text. */
  args: LookupArg[];
}

const isWordChar = (c: string | undefined) => !!c && /[A-Za-z0-9_.]/.test(c);

/** The arguments between `from` and `to`, split at the commas that are not inside nested brackets. */
function splitArgs(text: string, from: number, to: number): LookupArg[] {
  const out: LookupArg[] = [];
  let depth = 0, begin = from;
  const push = (end: number) => {
    const raw = text.slice(begin, end);
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    out.push({ from: begin + lead, to: begin + lead + t.length, text: t });
  };
  for (let i = from; i < to; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) { push(i); begin = i + 1; }
  }
  push(to);
  return out;
}

/**
 * The LOOKUP call the caret is inside (the innermost one), or the word LOOKUP
 * just typed with no bracket yet; null anywhere else.
 */
export function lookupAt(text: string, caret: number): LookupCall | null {
  const at = Math.max(0, Math.min(caret, text.length));
  // Brackets open at the caret, innermost last.
  const stack: { name: string; open: number; commas: number }[] = [];
  for (let i = 0; i < at; i++) {
    const c = text[i];
    if (c === '(') {
      const m = /([A-Za-z_][A-Za-z0-9_.]*)\s*$/.exec(text.slice(0, i));
      stack.push({ name: m && !m[1].includes('.') ? m[1].toUpperCase() : '', open: i, commas: 0 });
    } else if (c === ')') stack.pop();
    else if (c === ',' && stack.length) stack[stack.length - 1].commas++;
  }
  for (let s = stack.length - 1; s >= 0; s--) {
    if (stack[s].name !== 'LOOKUP') continue;
    const open = stack[s].open;
    // Find the bracket that closes it, past the caret.
    let depth = stack.length - s, close: number | null = null;
    for (let i = at; i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') { depth--; if (depth === 0) { close = i; break; } }
    }
    const inner = close ?? text.length;
    const word = /LOOKUP\s*$/i.exec(text.slice(0, open));
    return {
      start: word ? word.index : open,
      end: close != null ? close + 1 : text.length, open, close,
      arg: stack[s].commas, direct: s === stack.length - 1, args: splitArgs(text, open + 1, inner),
    };
  }
  // Just the word, with the caret at its end.
  const typed = /(?:^|[^A-Za-z0-9_.])(LOOKUP)$/i.exec(text.slice(0, at));
  if (typed && text[at] !== '(' && !isWordChar(text[at])) {
    return { start: at - 6, end: at, open: null, close: null, arg: 0, direct: true, args: [] };
  }
  return null;
}

/** `machine.CODE` → CODE, for the chart typed as the first argument (null when it is something else). */
export function chartCodeOf(arg: string | undefined): string | null {
  const m = /^machine\.([A-Za-z_][A-Za-z0-9_]*)$/i.exec((arg ?? '').trim());
  return m ? m[1] : null;
}
