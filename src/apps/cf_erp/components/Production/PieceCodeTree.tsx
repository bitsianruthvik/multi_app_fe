import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Box, Button, IconButton, InputBase, Typography } from '@mui/material';
import SearchRounded from '@mui/icons-material/SearchRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import type { PieceCodeHole, PieceCodeItem, PieceCodeNode, PieceCodesPreview } from '../../api/pieceCodes';
import { qtyText } from '../../lib/inventory';
import { Badge } from '../ui';
import {
  CHILD_PAGE, MATCH_PAGE, TOP, codeParts, revealPlan, searchRows, searchTerms, subtreeSizes, textParts, treeRows,
  type PieceIndex, type PieceRow,
} from './pieceCodeModel';

const count = (n: number) => n.toLocaleString();
const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;
const rowKey = (r: PieceRow) => (r.kind === 'node' ? `n${r.k}` : r.kind === 'more' ? `m${r.parentK}` : 'mm');

/*
 * The rows are plain elements styled ONCE, from the tree (TREE_SX), not a
 * styled component each: a search can put 400 rows on screen, and per-row
 * styling was most of what drawing them cost.
 */
const TREE_SX = {
  '& .pc-row': {
    display: 'flex', alignItems: 'flex-start', gap: '4px', padding: '4px 8px 4px 4px', minWidth: 0,
    borderBottom: '1px solid var(--c-divider)', outline: 'none',
    // Rows off screen skip their layout and paint until they scroll into view.
    contentVisibility: 'auto', containIntrinsicSize: 'auto 36px',
  },
  '& .pc-row:last-of-type': { borderBottom: 0 },
  '& .pc-row[data-act]': { cursor: 'pointer' },
  '& .pc-row:hover': { background: 'var(--c-surface-2)' },
  '& .pc-row[data-bad], & .pc-row[data-bad]:hover': { background: 'var(--c-danger-50)' },
  '& .pc-row:focus-visible': { outline: '2px solid var(--c-focus)', outlineOffset: '-2px' },
  '& .pc-guide': { width: { xs: 10, sm: 18 }, flexShrink: 0, alignSelf: 'stretch', borderLeft: '1px solid var(--c-divider)' },
  '& .pc-toggle': {
    width: 26, height: 26, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '50%', color: 'var(--c-text-2)', cursor: 'pointer',
    '&:hover': { background: 'var(--c-surface-3)' },
    '& svg': { width: 20, height: 20, fill: 'currentColor', transition: 'transform var(--t-fast) var(--ease)' },
  },
  '& .pc-toggle[data-open] svg': { transform: 'rotate(90deg)' },
  '& .pc-gap': { width: 26, flexShrink: 0 },
  '& .pc-body': { flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: '8px', rowGap: '2px', padding: '3px 0' },
  '& .pc-row[data-context] .pc-body': { opacity: 0.72 },
  '& .pc-code': { fontFamily: 'var(--font-mono)', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere', minWidth: 0, color: 'var(--c-text)', fontWeight: 500 },
  '& .pc-inherited': { color: 'var(--c-text-3)', fontWeight: 400 },
  '& .pc-qty': { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--c-text-2)' },
  '& .pc-name': { fontSize: 12.5, color: 'var(--c-text-2)', minWidth: 0, flex: '1 1 140px', overflowWrap: 'anywhere' },
  '& .pc-size': { fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'nowrap' },
  '& mark': { background: 'var(--c-warning-200)', color: 'inherit', borderRadius: '2px', padding: 0 },
  '& .pc-more': { alignItems: 'center', padding: '6px 8px 6px 4px', cursor: 'pointer', color: 'var(--c-primary-700)', fontSize: 13, fontWeight: 500 },
} as const;

/** One step of indentation with the hairline that shows which parent a row belongs to — narrower on a phone. */
function Guides({ depth }: { depth: number }) {
  return <>{Array.from({ length: depth }, (_, i) => <span key={i} aria-hidden className="pc-guide" />)}</>;
}

/** Material's chevron, drawn inline: an icon component per row is a styled component per row. */
const CHEVRON = <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path d="M9.29 6.71a.996.996 0 0 0 0 1.41L13.17 12l-3.88 3.88a.996.996 0 1 0 1.41 1.41l4.59-4.59a.996.996 0 0 0 0-1.41L10.7 6.7c-.38-.38-1.02-.38-1.41.01z" /></svg>;

/** The code, what it inherits from its parent quiet and what it adds plain, search words marked. Wraps rather than widening the page. */
function CodeText({ code, parentCode, terms, title }: { code: string; parentCode: string | null; terms: string[]; title: string }) {
  const parts = codeParts(code, parentCode, terms);
  return (
    <span className="pc-code" title={title}>
      {parts.map((p, i) => {
        const cls = p.inherited ? 'pc-inherited' : undefined;
        return p.mark ? <mark key={i} className={cls}>{p.text}</mark> : <span key={i} className={cls}>{p.text}</span>;
      })}
    </span>
  );
}

function Marked({ text, terms }: { text: string; terms: string[] }) {
  return <>{textParts(text, terms).map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}</>;
}

/**
 * Everything a row draws, as values that stay equal between renders — so a
 * memoised row is redrawn only when IT changes, not when a branch above it opens.
 */
interface NodeRowProps {
  depth: number;
  open: boolean;
  hasKids: boolean;
  match: boolean;
  node: PieceCodeNode;
  item: PieceCodeItem | undefined;
  parentCode: string | null;
  terms: string[];
  searching: boolean;
  below: number;
  duplicate: boolean;
  taken: boolean;
  hole: PieceCodeHole | undefined;
  showBuiltIn: boolean;
  tabbable: boolean;
  onToggle: (k: number) => void;
  onReveal: (k: number) => void;
  onKey: (e: KeyboardEvent<HTMLDivElement>, key: string) => void;
  onFocusRow: (key: string) => void;
  setRef: (key: string, el: HTMLDivElement | null) => void;
}

/** A click that was really a text selection (somebody copying a code) opens nothing. */
const selecting = () => (window.getSelection()?.toString() ?? '') !== '';
const NO_TERMS: string[] = [];

const NodeRow = memo(function NodeRow({
  depth, open, hasKids, match, node, item, parentCode, terms, searching, below, duplicate, taken, hole, showBuiltIn, tabbable,
  onToggle, onReveal, onKey, onFocusRow, setRef,
}: NodeRowProps) {
  const key = `n${node.k}`;
  const group = !node.pieceNo;
  const title = hole
    ? `Coding rule ${hole.schemeCode} cannot make this code — it needs ${hole.missing.join(', ')}. This is the built-in code.`
    : node.rule ? `Coded by rule ${node.rule}` : 'No coding rule applies — the built-in code';
  const act = () => {
    if (selecting()) return;
    if (searching) onReveal(node.k);
    else if (hasKids) onToggle(node.k);
  };
  const bad = duplicate || taken || !!hole;
  return (
    <div role="treeitem" aria-level={depth + 1} aria-expanded={!searching && hasKids ? open : undefined}
      tabIndex={tabbable ? 0 : -1} ref={(el) => setRef(key, el)} className="pc-row"
      data-act={searching || hasKids ? '' : undefined} data-bad={bad ? '' : undefined} data-context={searching && !match ? '' : undefined}
      onKeyDown={(e) => onKey(e, key)} onFocus={() => onFocusRow(key)} onClick={act}>
      <Guides depth={depth} />
      {!searching && hasKids
        ? <span className="pc-toggle" aria-hidden data-open={open ? '' : undefined} onClick={(e) => { e.stopPropagation(); onToggle(node.k); }}>{CHEVRON}</span>
        : <span className="pc-gap" aria-hidden />}
      <span className="pc-body">
        <CodeText code={node.code} parentCode={parentCode} terms={terms} title={title} />
        {group && <span className="pc-qty" title={`${qtyText(node.quantity)} identical ${node.quantity === 1 ? 'part' : 'parts'}, one code`}>×{qtyText(node.quantity)}</span>}
        <span className="pc-name">{item?.name ? <Marked text={item.name} terms={terms} /> : null}</span>
        {duplicate && <Badge family="danger" label="Duplicate" title="Another piece gets this code too. Release refuses until the coding rule tells them apart." />}
        {taken && <Badge family="danger" label="Already used" title="A piece of another release already has this code. Release refuses." />}
        {hole && <Badge family="danger" label={`Needs ${hole.missing.join(', ')}`} title={title} />}
        {showBuiltIn && !node.rule && !hole && <Badge family="neutral" noIcon label="Built-in code" title="No coding rule applies, so release gives it the built-in code." />}
        {!searching && hasKids && !open && <span className="pc-size">{plural(below, 'part', 'parts')}</span>}
      </span>
    </div>
  );
});

/** A "show more" row: a treeitem that loads the next page when it is pressed. */
function MoreRow({ row, label, tabbable, onMore, onKey, onFocusRow, setRef }: {
  row: PieceRow; label: string; tabbable: boolean;
  onMore: (row: PieceRow) => void;
  onKey: (e: KeyboardEvent<HTMLDivElement>, key: string) => void;
  onFocusRow: (key: string) => void;
  setRef: (key: string, el: HTMLDivElement | null) => void;
}) {
  const key = rowKey(row);
  return (
    <div role="treeitem" aria-level={row.depth + 1} tabIndex={tabbable ? 0 : -1} ref={(el) => setRef(key, el)} className="pc-row pc-more"
      onKeyDown={(e) => onKey(e, key)} onFocus={() => onFocusRow(key)} onClick={() => onMore(row)}>
      <Guides depth={row.depth} />
      <span className="pc-gap" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

/**
 * Every piece release would make, as a tree: top pieces first, each opened on
 * demand, a hundred children at a time. A search shows the matches with the
 * pieces that lead to them; choosing one opens it in the whole tree.
 *
 * Built for a two-span bridge — ~6,000 nodes — so only what is open is ever
 * drawn: the rows are worked out from the open set (pieceCodeModel), rows off
 * screen skip layout, and nothing is drawn for a closed branch.
 */
export function PieceCodeTree({ data, ix, query, onQueryChange }: {
  data: PieceCodesPreview;
  ix: PieceIndex;
  query: string;
  onQueryChange: (q: string) => void;
}) {
  const deferred = useDeferredValue(query);
  const terms = useMemo(() => searchTerms(deferred), [deferred]);
  const termsKey = terms.join(' ');
  const searching = terms.length > 0;
  // Closed by default. A line of one opens its one top piece, since that is all there is to open.
  const [open, setOpen] = useState<Set<number>>(() => new Set(ix.tops.length === 1 ? ix.tops : []));
  const [pages, setPages] = useState<Map<number, number>>(() => new Map());
  const [more, setMore] = useState<{ key: string; limit: number }>({ key: '', limit: MATCH_PAGE });
  const matchLimit = more.key === termsKey ? more.limit : MATCH_PAGE;
  const sizes = useMemo(() => subtreeSizes(ix), [ix]);
  const view = useMemo(
    () => (searching ? searchRows(ix, terms, matchLimit) : { rows: treeRows(ix, open, pages), matches: 0 }),
    [ix, searching, terms, matchLimit, open, pages],
  );
  const rows = view.rows;
  const showBuiltIn = data.summary.builtIn > 0 && data.summary.builtIn < data.summary.nodes;

  // Roving focus: one row is in the Tab order; the arrows move it. The handlers
  // read the rows through a ref so they stay the same function, and a memoised
  // row is not redrawn just because another row appeared.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const rowsRef = useRef(rows);
  const indexRef = useRef(new Map<string, number>());
  const pagesRef = useRef(pages);
  useLayoutEffect(() => {
    rowsRef.current = rows;
    indexRef.current = new Map(rows.map((r, i) => [rowKey(r), i]));
    pagesRef.current = pages;
  }, [rows, pages]);
  const pending = useRef<string | null>(null);
  const focusable = rows.some((r) => rowKey(r) === focusKey) ? focusKey : rows[0] ? rowKey(rows[0]) : null;

  // A piece chosen from a search is focused once the whole tree is back and it is on screen.
  useEffect(() => {
    const key = pending.current;
    if (!key || searching) return;
    const el = refs.current.get(key);
    if (!el) return;
    pending.current = null;
    el.scrollIntoView({ block: 'center' });
    el.focus({ preventScroll: true });
  }, [rows, searching]);

  const setRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) refs.current.set(key, el); else refs.current.delete(key);
  }, []);
  const onFocusRow = useCallback((key: string) => setFocusKey(key), []);
  const onToggle = useCallback((k: number) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  }), []);
  const onReveal = useCallback((k: number) => {
    const plan = revealPlan(ix, k, pagesRef.current);
    setPages(plan.pages);
    setOpen((prev) => new Set([...prev, ...plan.open]));
    pending.current = `n${k}`;
    setFocusKey(`n${k}`);
    onQueryChange('');
  }, [ix, onQueryChange]);
  const onMore = useCallback((row: PieceRow) => {
    if (row.kind === 'more') setPages((prev) => new Map(prev).set(row.parentK, (prev.get(row.parentK) ?? CHILD_PAGE) + CHILD_PAGE));
    else if (row.kind === 'moreMatches') setMore({ key: termsKey, limit: row.shown + MATCH_PAGE });
  }, [termsKey]);

  const focusAt = useCallback((i: number) => {
    const target = rowsRef.current[i];
    if (!target) return;
    const key = rowKey(target);
    setFocusKey(key);
    refs.current.get(key)?.focus();
  }, []);

  const onKey = useCallback((e: KeyboardEvent<HTMLDivElement>, key: string) => {
    const all = rowsRef.current;
    const i = indexRef.current.get(key) ?? -1;
    const row = all[i];
    if (!row || e.target !== e.currentTarget) return;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusAt(i + 1); break;
      case 'ArrowUp': e.preventDefault(); focusAt(i - 1); break;
      case 'Home': e.preventDefault(); focusAt(0); break;
      case 'End': e.preventDefault(); focusAt(all.length - 1); break;
      case 'ArrowRight':
        e.preventDefault();
        if (row.kind === 'node' && row.hasKids && !row.open && !searching) onToggle(row.k); else focusAt(i + 1);
        break;
      case 'ArrowLeft': {
        e.preventDefault();
        if (row.kind === 'node' && row.hasKids && row.open && !searching) { onToggle(row.k); break; }
        for (let j = i - 1; j >= 0; j -= 1) if (all[j].depth < row.depth) { focusAt(j); break; }
        break;
      }
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (row.kind !== 'node') onMore(row);
        else if (searching) onReveal(row.k);
        else if (row.hasKids) onToggle(row.k);
        break;
      default:
    }
  }, [focusAt, onMore, onReveal, onToggle, searching]);

  const status = searching
    ? view.matches === 0
      ? 'Nothing matches.'
      : `${plural(view.matches, 'match', 'matches')}${view.matches > matchLimit ? ` — the first ${count(Math.min(matchLimit, view.matches))} shown` : ''}. Choose one to open it in the whole tree.`
    : `${plural(ix.tops.length, 'top piece', 'top pieces')}. Open one to see what goes into it.`;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1, px: 1.25, height: 34, flex: '1 1 240px', minWidth: 0,
          borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)',
          '&:focus-within': { borderColor: 'var(--c-primary-400)' },
        }}>
          <SearchRounded sx={{ fontSize: 18, color: 'var(--c-text-3)' }} aria-hidden />
          <InputBase value={query} onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) { e.stopPropagation(); onQueryChange(''); }
              if (e.key === 'ArrowDown' && rows.length) { e.preventDefault(); focusAt(0); }
            }}
            placeholder="Find a code or a name" inputProps={{ 'aria-label': 'Find a piece by code or name', spellCheck: false }}
            sx={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--c-text)' }} />
          {!!query && (
            <IconButton size="small" aria-label="Clear the search" onClick={() => onQueryChange('')} sx={{ p: 0.25, color: 'var(--c-text-3)' }}>
              <CloseRounded sx={{ fontSize: 16 }} />
            </IconButton>
          )}
        </Box>
        {!searching && open.size > 0 && (
          <Button size="small" startIcon={<UnfoldLessRounded />} onClick={() => setOpen(new Set())} sx={{ color: 'var(--c-text-2)' }}>Close all</Button>
        )}
      </Box>
      <Typography role="status" aria-live="polite" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{status}</Typography>
      <Box role="tree" aria-label={`Pieces of line ${data.line.lineNo} and their codes`} aria-busy={deferred !== query || undefined}
        sx={{
          maxHeight: { xs: '65vh', md: 560 }, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain',
          border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface)',
          ...TREE_SX,
        }}>
        {rows.length === 0 && (
          <Typography sx={{ p: 2, fontSize: 13, color: 'var(--c-text-2)' }}>
            {searching ? `No piece has "${query.trim()}" in its code or name.` : 'Nothing to show.'}
          </Typography>
        )}
        {rows.map((r) => {
          const key = rowKey(r);
          if (r.kind === 'node') {
            const node = ix.nodes[r.k];
            return (
              <NodeRow key={key} depth={r.depth} open={r.open} hasKids={r.hasKids} match={r.match} node={node} item={data.items[String(node.itemId)]}
                parentCode={node.parentK != null ? ix.nodes[node.parentK].code : null}
                terms={searching ? terms : NO_TERMS} searching={searching} below={sizes[r.k]}
                duplicate={ix.duplicate[r.k] === 1} taken={ix.taken[r.k] === 1} hole={ix.hole.get(r.k)} showBuiltIn={showBuiltIn}
                tabbable={focusable === key} onToggle={onToggle} onReveal={onReveal} onKey={onKey} onFocusRow={onFocusRow} setRef={setRef} />
            );
          }
          const parent = r.kind === 'more' && r.parentK !== TOP ? ix.nodes[r.parentK] : null;
          const next = r.kind === 'more' ? Math.min(CHILD_PAGE, r.total - r.shown) : Math.min(MATCH_PAGE, r.total - r.shown);
          const label = r.kind === 'more'
            ? `Show ${count(next)} more of ${count(r.total)}${parent ? ` under ${parent.code}` : ''}`
            : `Show ${count(next)} more matches — ${count(r.shown)} of ${count(r.total)} shown`;
          return <MoreRow key={key} row={r} label={label} tabbable={focusable === key} onMore={onMore} onKey={onKey} onFocusRow={onFocusRow} setRef={setRef} />;
        })}
      </Box>
    </Box>
  );
}
