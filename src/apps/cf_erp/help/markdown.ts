/**
 * The help topics' Markdown — exactly the subset in TM/CF_ERP_HELP_SPEC.md, parsed to a small tree that
 * MarkdownView.tsx turns into React elements. No HTML is ever passed through: a `<b>` in a topic is shown as text.
 *
 *   blocks:  ## / ### headings (a single # reads as ##), paragraphs, `-` / `*` lists, `1.` lists (one level of
 *            nesting by indent), `>` blockquotes (a "> Note:" is a note).
 *   inline:  **bold**, *italic* / _italic_, `code`, [text](help:<id>) / [text](/route) / [text](https://…), \-escapes.
 * Pure — scripts/cf_erp_help_test.mjs runs it in node.
 */
export type HelpLink =
  | { kind: 'help'; id: string }
  | { kind: 'route'; path: string }
  | { kind: 'external'; href: string }
  | { kind: 'none' };

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'b'; c: Inline[] }
  | { t: 'i'; c: Inline[] }
  | { t: 'link'; link: HelpLink; c: Inline[] };

export interface ListItem { c: Inline[]; sub: ListBlock | null }
export interface ListBlock { t: 'ul' | 'ol'; start: number; items: ListItem[] }
export type Block =
  | { t: 'h'; level: 2 | 3; c: Inline[]; text: string }
  | { t: 'p'; c: Inline[] }
  | ListBlock
  | { t: 'quote'; note: boolean; blocks: Block[] };

/**
 * What a link's target is. `help:<id>` opens a topic in the panel; a `/route` stays inside the app (company added by
 * routeHref); http(s) opens outside; anything else (javascript:, data:, a bare word) is not a link at all.
 */
export function classifyLink(href: string): HelpLink {
  const h = href.trim();
  const help = /^help:([a-z0-9][a-z0-9-]*)$/i.exec(h);
  if (help) return { kind: 'help', id: help[1].toLowerCase() };
  if (h.startsWith('/') && !h.startsWith('//')) return { kind: 'route', path: h };
  if (/^https?:\/\/[^\s]+$/i.test(h)) return { kind: 'external', href: h };
  return { kind: 'none' };
}

/**
 * A route link inside the company. Topics may write the full pattern (/:company/cf_erp/orders), the app path
 * (/cf_erp/orders) or the screen alone (/orders); all land on /<company>/cf_erp/orders.
 */
export function routeHref(path: string, company: string): string {
  if (path.startsWith('/:company/')) return `/${company}${path.slice('/:company'.length)}`;
  if (path === '/cf_erp' || path.startsWith('/cf_erp/') || path.startsWith('/cf_erp?')) return `/${company}${path}`;
  return `/${company}/cf_erp${path === '/' ? '' : path}`;
}

// ── inline ──

const ESCAPABLE = '\\`*_[]()#>-.!+';

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => { if (text) { out.push({ t: 'text', v: text }); text = ''; } };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\' && i + 1 < src.length && ESCAPABLE.includes(src[i + 1])) { text += src[i + 1]; i += 2; continue; }
    if (c === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i) { flush(); out.push({ t: 'code', v: src.slice(i + 1, end) }); i = end + 1; continue; }
    }
    if ((c === '*' && src[i + 1] === '*') || (c === '_' && src[i + 1] === '_')) {
      const mark = c + c;
      const end = src.indexOf(mark, i + 2);
      if (end > i + 2) { flush(); out.push({ t: 'b', c: parseInline(src.slice(i + 2, end)) }); i = end + 2; continue; }
    }
    if (c === '*' || c === '_') {
      // _ inside a word (file_name) is not emphasis; nor is a * followed by a space (a times sign).
      const prev = src[i - 1];
      const opens = src[i + 1] !== undefined && !/\s/.test(src[i + 1]) && !(c === '_' && prev && /\w/.test(prev));
      if (opens) {
        let end = i + 1;
        for (; end < src.length; end += 1) {
          if (src[end] === '\\') { end += 1; continue; }
          if (src[end] === c && src[end + 1] !== c && !/\s/.test(src[end - 1]) && !(c === '_' && /\w/.test(src[end + 1] ?? ''))) break;
        }
        if (end < src.length && end > i + 1) { flush(); out.push({ t: 'i', c: parseInline(src.slice(i + 1, end)) }); i = end + 1; continue; }
      }
    }
    if (c === '[') {
      const close = findClose(src, i);
      if (close > 0 && src[close + 1] === '(') {
        const paren = src.indexOf(')', close + 2);
        if (paren > 0) {
          flush();
          const inner = parseInline(src.slice(i + 1, close)).map(stripLinks).flat();
          out.push({ t: 'link', link: classifyLink(src.slice(close + 2, paren)), c: inner });
          i = paren + 1;
          continue;
        }
      }
    }
    text += c;
    i += 1;
  }
  flush();
  return out;
}

/** The `]` that closes the `[` at `open`, minding nested brackets and escapes; -1 when none. */
function findClose(src: string, open: number): number {
  let depth = 0;
  for (let j = open; j < src.length; j += 1) {
    if (src[j] === '\\') { j += 1; continue; }
    if (src[j] === '[') depth += 1;
    else if (src[j] === ']') { depth -= 1; if (depth === 0) return j; }
  }
  return -1;
}

/** A link inside a link's text becomes its text. */
function stripLinks(n: Inline): Inline[] {
  if (n.t === 'link') return n.c.flatMap(stripLinks);
  if (n.t === 'b' || n.t === 'i') return [{ ...n, c: n.c.flatMap(stripLinks) }];
  return [n];
}

export function inlineText(c: Inline[]): string {
  return c.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : inlineText(n.c))).join('');
}

// ── blocks ──

const LIST_RE = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
const indentOf = (s: string) => (/^\s*/.exec(s)?.[0] ?? '').replace(/\t/g, '    ').length;

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i += 1; continue; }

    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      const c = parseInline(h[2]);
      blocks.push({ t: 'h', level: h[1].length >= 3 ? 3 : 2, c, text: inlineText(c) });
      i += 1;
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) { inner.push(lines[i].replace(/^\s{0,3}>\s?/, '')); i += 1; }
      const sub = parseMarkdown(inner.join('\n'));
      const first = sub[0];
      const note = !!first && first.t === 'p' && /^\s*(\*\*)?(note|tip|important|warning)\b/i.test(inlineText(first.c));
      blocks.push({ t: 'quote', note, blocks: sub });
      continue;
    }

    if (LIST_RE.test(line)) {
      const [list, next] = parseList(lines, i, indentOf(line));
      blocks.push(list);
      i = next;
      continue;
    }

    // A paragraph: lines up to a blank one or the start of another block.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^\s{0,3}#{1,6}\s/.test(lines[i]) && !/^\s{0,3}>/.test(lines[i]) && !LIST_RE.test(lines[i])) {
      para.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ t: 'p', c: parseInline(para.join(' ')) });
  }
  return blocks;
}

/** A list from line `i` at `indent`; returns it and the line after it. One deeper level becomes `sub`. */
function parseList(lines: string[], start: number, indent: number): [ListBlock, number] {
  const first = LIST_RE.exec(lines[start])!;
  const ordered = /\d/.test(first[2]);
  const list: ListBlock = { t: ordered ? 'ol' : 'ul', start: ordered ? Number.parseInt(first[2], 10) : 1, items: [] };
  let i = start;
  let cur: { text: string[]; sub: ListBlock | null } | null = null;
  const push = () => { if (cur) list.items.push({ c: parseInline(cur.text.join(' ')), sub: cur.sub }); };
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      // A blank line ends the list unless the next line carries on with it.
      const nxt = lines[i + 1];
      if (nxt !== undefined && (LIST_RE.test(nxt) ? indentOf(nxt) >= indent && (/\d/.test(LIST_RE.exec(nxt)![2]) === ordered || indentOf(nxt) > indent) : indentOf(nxt) > indent && nxt.trim() !== '')) { i += 1; continue; }
      break;
    }
    const m = LIST_RE.exec(line);
    const ind = indentOf(line);
    if (m && ind < indent) break; // back out to the list this one sits in
    if (m && ind <= indent + 1) {
      if (/\d/.test(m[2]) !== ordered) break; // a different kind of list starts
      push();
      cur = { text: [m[3]], sub: null };
      i += 1;
      continue;
    }
    if (m && ind > indent + 1 && cur) {
      const [sub, next] = parseList(lines, i, ind);
      if (cur.sub && cur.sub.t === sub.t) cur.sub.items.push(...sub.items); else cur.sub = cur.sub ?? sub;
      i = next;
      continue;
    }
    if (ind > indent && cur && !/^\s{0,3}(#{1,6}\s|>)/.test(line)) { cur.text.push(line.trim()); i += 1; continue; }
    if (ind <= indent && !m) {
      // A lazy continuation line (no indent) right after an item's text belongs to it.
      if (cur && lines[i - 1]?.trim() !== '' && !/^\s{0,3}(#{1,6}\s|>)/.test(line)) { cur.text.push(line.trim()); i += 1; continue; }
      break;
    }
    break;
  }
  push();
  return [list, i];
}

/** The words of a topic without its marks — for search. */
export function plainText(md: string): string {
  const walk = (bs: Block[]): string[] => bs.flatMap((b) => {
    if (b.t === 'h') return [b.text];
    if (b.t === 'p') return [inlineText(b.c)];
    if (b.t === 'quote') return walk(b.blocks);
    return b.items.flatMap((it) => [inlineText(it.c), ...(it.sub ? walk([it.sub]) : [])]);
  });
  return walk(parseMarkdown(md)).join('\n');
}
