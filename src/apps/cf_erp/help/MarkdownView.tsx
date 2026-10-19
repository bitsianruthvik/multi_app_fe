import { Fragment, useMemo, type MouseEvent, type ReactNode } from 'react';
import { Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { parseMarkdown, routeHref, type Block, type Inline, type ListBlock } from './markdown';

/**
 * A help topic's Markdown as React elements (markdown.ts parses the spec's subset). Text is always text: nothing
 * from a topic reaches the page as HTML. `help:<id>` links call onOpenTopic; `/route` links stay inside the company
 * and call onNavigate (the panel closes); http(s) opens in a new tab; anything else is plain text.
 */
export interface MarkdownLinks {
  company: string;
  onOpenTopic: (id: string) => void;
  /** Called when a route link is followed (the drawer closes itself). */
  onNavigate?: () => void;
  /** Topic ids that exist — a help: link to anything else is shown as text with a note. Omit to trust every id. */
  known?: (id: string) => boolean;
}

const linkSx = { color: 'var(--c-primary-700)', textDecoration: 'underline', textUnderlineOffset: '2px', cursor: 'pointer' } as const;

function renderInline(nodes: Inline[], links: MarkdownLinks, keyBase: string): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyBase}.${i}`;
    switch (n.t) {
      case 'text': return <Fragment key={key}>{n.v}</Fragment>;
      case 'code': return <Box key={key} component="code" sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.92em', px: 0.5, py: '1px', borderRadius: '4px', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>{n.v}</Box>;
      case 'b': return <strong key={key}>{renderInline(n.c, links, key)}</strong>;
      case 'i': return <em key={key}>{renderInline(n.c, links, key)}</em>;
      case 'link': {
        const inner = renderInline(n.c, links, key);
        const l = n.link;
        if (l.kind === 'help') {
          if (links.known && !links.known(l.id)) return <Box key={key} component="span" title="This topic has not been written yet">{inner}</Box>;
          return (
            <Box key={key} component="a" href={`?topic=${encodeURIComponent(l.id)}`} data-help-topic={l.id} sx={linkSx}
              onClick={(e: MouseEvent) => { e.preventDefault(); links.onOpenTopic(l.id); }}>{inner}</Box>
          );
        }
        if (l.kind === 'route') {
          return <Box key={key} component={RouterLink} to={routeHref(l.path, links.company)} onClick={() => links.onNavigate?.()} sx={linkSx}>{inner}</Box>;
        }
        if (l.kind === 'external') {
          return <Box key={key} component="a" href={l.href} target="_blank" rel="noopener noreferrer" sx={linkSx}>{inner}</Box>;
        }
        return <Fragment key={key}>{inner}</Fragment>;
      }
      default: return null;
    }
  });
}

function renderList(b: ListBlock, links: MarkdownLinks, key: string): ReactNode {
  return (
    <Box key={key} component={b.t} start={b.t === 'ol' && b.start !== 1 ? b.start : undefined} sx={{ m: 0, mb: 1.25, pl: 3, '& > li': { mb: 0.5 }, '& li > ul, & li > ol': { mt: 0.5, mb: 0 } }}>
      {b.items.map((it, i) => (
        <li key={`${key}.${i}`}>
          {renderInline(it.c, links, `${key}.${i}`)}
          {it.sub && renderList(it.sub, links, `${key}.${i}.s`)}
        </li>
      ))}
    </Box>
  );
}

function renderBlocks(blocks: Block[], links: MarkdownLinks, keyBase: string): ReactNode[] {
  return blocks.map((b, i) => {
    const key = `${keyBase}${i}`;
    if (b.t === 'h') {
      return b.level === 2
        ? <Box key={key} component="h2" sx={{ fontSize: 16, fontWeight: 600, color: 'var(--c-text)', mt: 2.5, mb: 1, '&:first-of-type': { mt: 0 } }}>{renderInline(b.c, links, key)}</Box>
        : <Box key={key} component="h3" sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', mt: 2, mb: 0.75 }}>{renderInline(b.c, links, key)}</Box>;
    }
    if (b.t === 'p') return <Box key={key} component="p" sx={{ m: 0, mb: 1.25 }}>{renderInline(b.c, links, key)}</Box>;
    if (b.t === 'quote') {
      return (
        <Box key={key} component="blockquote" data-note={b.note ? 'true' : undefined} sx={{
          m: 0, mb: 1.5, px: 1.5, py: 1, borderRadius: 'var(--r-md)', '& > p:last-child, & > ul:last-child, & > ol:last-child': { mb: 0 },
          background: b.note ? 'var(--c-info-50)' : 'var(--c-surface-2)', border: `1px solid ${b.note ? 'var(--c-info-200)' : 'var(--c-border)'}`,
          color: b.note ? 'var(--c-info-800)' : 'var(--c-text)',
        }}>
          {renderBlocks(b.blocks, links, `${key}.`)}
        </Box>
      );
    }
    return renderList(b, links, key);
  });
}

export function MarkdownView({ source, links }: { source: string; links: MarkdownLinks }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <Box className="cf-help-md" sx={{ fontSize: 14, lineHeight: 1.6, color: 'var(--c-text)', minWidth: 0, overflowWrap: 'anywhere' }}>
      {renderBlocks(blocks, links, 'b')}
    </Box>
  );
}
