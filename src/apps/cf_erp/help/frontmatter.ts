/**
 * The header of a help topic (TM/CF_ERP_HELP_SPEC.md "A topic file"): a small YAML subset between two `---` lines.
 * Pure — the help test (scripts/cf_erp_help_test.mjs) runs it in node.
 *
 *   key: value            # a trailing comment is dropped
 *   key: "quoted # kept"
 *   key: [a, "b", c]      # an inline list
 *   key:                  # or a block list
 *     - a
 *     - b
 */
export type FrontValue = string | number | boolean | null | string[];

export interface Frontmatter {
  /** The fields as written (lists are string lists). */
  data: Record<string, FrontValue>;
  /** The Markdown after the closing `---`. */
  body: string;
  /** Problems found while reading the header, in words. */
  errors: string[];
}

/** Drops a `# comment` that is outside quotes (YAML needs a space before `#`). */
function stripComment(s: string): string {
  let quote: string | null = null;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))) {
    return t[0] === '"' ? t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\') : t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

/** Splits `a, "b, c", d` on the commas outside quotes. */
function splitList(inner: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (const c of inner) {
    if (quote) { cur += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === ',') { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map(unquote).filter((x) => x !== '');
}

function scalar(raw: string): FrontValue {
  const t = raw.trim();
  if (t === '') return null;
  if (t.startsWith('[')) {
    if (!t.endsWith(']')) return splitList(t.slice(1));
    return splitList(t.slice(1, -1));
  }
  if (t[0] === '"' || t[0] === "'") return unquote(t);
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null' || t === '~') return null;
  return t;
}

export function parseFrontmatter(raw: string): Frontmatter {
  const text = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).replace(/\r\n?/g, '\n');
  const errors: string[] = [];
  const data: Record<string, FrontValue> = {};
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') {
    return { data, body: text, errors: ['no front matter (the file must start with a --- line)'] };
  }
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end < 0) return { data, body: text, errors: ['the front matter is not closed (no second --- line)'] };

  let listKey: string | null = null;
  const blockKeys = new Set<string>();
  for (let i = 1; i < end; i += 1) {
    const line = stripComment(lines[i]).replace(/\s+$/, '');
    if (line.trim() === '') continue;
    const item = /^\s+-\s+(.*)$/.exec(line) ?? (listKey ? /^-\s+(.*)$/.exec(line) : null);
    if (item && listKey) {
      const cur = data[listKey];
      (cur as string[]).push(unquote(item[1]));
      continue;
    }
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) { errors.push(`line ${i + 1}: cannot read "${lines[i].trim()}"`); listKey = null; continue; }
    const [, key, rest] = m;
    if (key in data) errors.push(`"${key}" is given twice`);
    if (rest.trim() === '') { data[key] = []; listKey = key; blockKeys.add(key); continue; }
    listKey = null;
    data[key] = scalar(rest);
  }
  // A `key:` with nothing under it is an empty value, not an empty list.
  for (const k of blockKeys) if ((data[k] as string[]).length === 0) data[k] = null;
  return { data, body: lines.slice(end + 1).join('\n').replace(/^\n+/, ''), errors };
}
