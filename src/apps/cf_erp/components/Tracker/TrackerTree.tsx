import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from 'react';
import { Alert, Box, CircularProgress, FormControlLabel, MenuItem, Select, Switch, Typography, useMediaQuery } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import { CfApiError } from '../../api/client';
import { getTrackerTree, getTreeChildren, type TrackerTreeResponse, type TreeNode } from '../../api/trackerTree';
import { useUrlParam } from '../../hooks/useUrlState';
import {
  byOperationLines, emptyTree, fromNodes, mergeBranch, needsChildren, openAllLoaded, openToLevel, opsDoneText, pctText, refreshNodes, visibleRows,
  type TreeState, type VisibleRow,
} from '../../lib/trackerTree';
import { EmptyState, ErrorNotice, Mono, SkeletonRows, Surface } from '../ui';
import { FilterBar } from '../FilterBar';
import { BlockedMark, CompletionBar, OpLegend, OpStrip } from './TreeParts';
import { PieceDrawer } from './PieceDrawer';

/** How far the tree opens: pieces down to this level under the line (1 = the top piece). */
const LEVELS = [1, 2, 3, 4, 5];
const ALL_LEVELS = 99;
const DEFAULT_LEVEL = 2;
const ROW_WIDE = 42;
const ROW_NARROW = 64;
const OVERSCAN = 12;

/** "o12" / "l34" / "all" in the URL → the read's scope. */
function scopeOf(v: string): { orderId: number | null; lineId: number | null } {
  const m = /^([ol])(\d+)$/.exec(v);
  if (!m) return { orderId: null, lineId: null };
  return m[1] === 'o' ? { orderId: Number(m[2]), lineId: null } : { orderId: null, lineId: Number(m[2]) };
}

/** A child's code repeats its parent's; the part it adds is what a person reads, so the rest steps back. */
function CodeText({ node, parent }: { node: TreeNode; parent: TreeNode | undefined }) {
  const prefix = parent?.kind === 'piece' && node.code.startsWith(parent.code) ? parent.code : '';
  return (
    <Mono sx={{ fontSize: 12.5, color: 'var(--c-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
      {prefix && <Box component="span" sx={{ color: 'var(--c-text-3)' }}>{prefix}</Box>}
      <Box component="span" sx={{ fontWeight: node.kind === 'piece' ? 600 : 700 }}>{node.code.slice(prefix.length)}</Box>
    </Mono>
  );
}

function Row({ row, parent, wide, height, busy, names, onToggle, onOpen }: {
  row: VisibleRow; parent: TreeNode | undefined; wide: boolean; height: number; busy: boolean;
  names: TrackerTreeResponse['operations']; onToggle: (n: TreeNode) => void; onOpen: (n: TreeNode) => void;
}) {
  const { node, depth, open, hasChildren } = row;
  const leaf = !hasChildren;
  const act = () => (leaf ? onOpen(node) : onToggle(node));
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); }
    else if (e.key === 'ArrowRight' && hasChildren && !open) { e.preventDefault(); onToggle(node); }
    else if (e.key === 'ArrowLeft' && hasChildren && open) { e.preventDefault(); onToggle(node); }
  };
  const barTitle = [
    `${pctText(node.completion)} of the work under ${node.kind === 'line' ? 'this line' : node.kind === 'order' ? 'this order' : 'this piece'} is done${node.weight === 'minutes' ? ', weighed by planned minutes' : node.weight === 'count' ? ', counted by operations' : ''}.`,
    ...byOperationLines(node, names),
  ].join('\n');
  const showBar = node.kind !== 'piece' || hasChildren;
  return (
    <Box
      role="treeitem" aria-level={depth + 1} aria-expanded={hasChildren ? open : undefined} tabIndex={0}
      data-testid="tree-row" data-node={node.id}
      onClick={act} onKeyDown={key}
      sx={{
        height, boxSizing: 'border-box', px: 1.5, cursor: 'pointer', borderBottom: '1px solid var(--c-divider)',
        display: 'grid', alignItems: 'center', columnGap: 1.5,
        gridTemplateColumns: wide ? 'minmax(0, 1fr) minmax(120px, 0.8fr) 150px 104px' : 'minmax(0, 1fr) auto',
        gridTemplateRows: wide ? '1fr' : '1fr 1fr',
        background: node.match ? 'var(--c-primary-50)' : node.kind === 'order' ? 'var(--c-surface-2)' : 'transparent',
        '&:hover': { background: 'var(--c-surface-2)' },
        '&:focus-visible': { outline: '2px solid var(--c-primary-400)', outlineOffset: -2 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, alignSelf: 'stretch', gridColumn: wide ? 'auto' : '1 / -1' }}>
        {Array.from({ length: depth }, (_, i) => (
          <Box key={i} aria-hidden sx={{ width: wide ? 18 : 10, flexShrink: 0, alignSelf: 'stretch', borderLeft: '1px solid var(--c-divider)' }} />
        ))}
        <Box sx={{ width: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-3)' }}>
          {busy ? <CircularProgress size={14} /> : hasChildren ? (open ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />) : null}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
          <Box
            component="span" title={node.kind === 'piece' ? `${node.code} — open its steps` : node.code}
            onClick={node.kind === 'piece' && hasChildren ? (e) => { e.stopPropagation(); onOpen(node); } : undefined}
            sx={{ minWidth: 0, display: 'flex', ...(node.kind === 'piece' && hasChildren ? { '&:hover': { textDecoration: 'underline' } } : {}) }}
          >
            <CodeText node={node} parent={parent} />
          </Box>
          {node.name && (
            <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 40 }}>
              {node.name}{node.kind === 'piece' && node.qty && node.qty !== 1 ? ` ×${node.qty}` : ''}
              {hasChildren && node.kind === 'piece' ? ` · ${node.childCount}` : ''}
            </Typography>
          )}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, pl: wide ? 0 : 3 }}>
        <OpStrip ops={node.ops} />
        {leaf && node.ops.length > 0 && wide && <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>{opsDoneText(node.ops)}</Typography>}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: wide ? 'flex-start' : 'flex-end', gap: 1 }}>
        {showBar && <CompletionBar value={node.completion} title={barTitle} width={wide ? 88 : 56} />}
        {!wide && <BlockedMark node={node} />}
      </Box>
      {wide && <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}><BlockedMark node={node} /></Box>}
    </Box>
  );
}

/**
 * Production › Tracker › Progress: the frozen piece codes as a tree, order ›
 * line › SPAN-01-1 › G2 › 3 › TF1, each row with its operations on the right
 * and, higher up, how much of what is under it is done. A big line comes a
 * branch at a time; the rows on screen are the only ones drawn.
 */
export function TrackerTree() {
  const wide = useMediaQuery('(min-width: 900px)');
  const rowH = wide ? ROW_WIDE : ROW_NARROW;
  const [scope, setScope] = useUrlParam('order', 'all');
  const [levelParam, setLevelParam] = useUrlParam('level', String(DEFAULT_LEVEL));
  const [blockedParam, setBlockedParam] = useUrlParam('blocked', '0');
  const level = Number(levelParam) || DEFAULT_LEVEL;
  const onlyBlocked = blockedParam === '1';
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [resp, setResp] = useState<TrackerTreeResponse | null>(null);
  const [tree, setTree] = useState<TreeState>(emptyTree);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<CfApiError | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [piece, setPiece] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(640);

  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 350); return () => clearTimeout(t); }, [search]);

  const { orderId, lineId } = scopeOf(scope);
  const query = useMemo(() => ({
    orderId, lineId, search: term || null, onlyBlocked,
    depth: level === ALL_LEVELS ? 50 : level + 2,
  }), [orderId, lineId, term, onlyBlocked, level]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getTrackerTree(query)
      .then((r) => {
        if (!alive) return;
        const next = fromNodes(r.nodes);
        setResp(r);
        setTree(next);
        setOpen(query.search || query.onlyBlocked ? openAllLoaded(next) : openToLevel(next, level === ALL_LEVELS ? ALL_LEVELS : level + 1));
        setError(null);
        if (listRef.current) listRef.current.scrollTop = 0;
        setScrollTop(0);
      })
      .catch((e) => { if (alive) setError(e instanceof CfApiError ? e : new CfApiError(0, String(e))); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [query, level, tick]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const measure = () => setViewH(el.clientHeight || 640);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [resp]);

  const toggle = useCallback(async (n: TreeNode) => {
    if (open.has(n.id)) { setOpen((s) => { const x = new Set(s); x.delete(n.id); return x; }); return; }
    if (needsChildren(tree, n)) {
      setBusy((s) => new Set(s).add(n.id));
      try {
        const r = await getTreeChildren(n.id, 1);
        setTree((t) => mergeBranch(t, n.id, r.node, r.nodes));
      } catch (e) {
        setError(e instanceof CfApiError ? e : new CfApiError(0, String(e)));
        return;
      } finally {
        setBusy((s) => { const x = new Set(s); x.delete(n.id); return x; });
      }
    }
    setOpen((s) => new Set(s).add(n.id));
  }, [open, tree]);

  // After work is recorded in the drawer: the piece at once, then the figures above it with a quiet re-read.
  const changed = useCallback((node: TreeNode) => {
    setTree((t) => refreshNodes(t, [node]));
    getTrackerTree(query).then((r) => { setResp(r); setTree((t) => refreshNodes(t, r.nodes)); }).catch(() => { /* the next read catches up */ });
  }, [query]);

  const rows = useMemo(() => visibleRows(tree, open, { onlyBlocked }), [tree, open, onlyBlocked]);
  const start = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewH) / rowH) + OVERSCAN);
  const s = resp?.summary;
  const names = resp?.operations ?? {};
  const choices = resp?.orders ?? [];

  return (
    <Box>
      <FilterBar search={search} onSearch={setSearch} placeholder="Search a code, e.g. G2-3-TF1">
        <Select size="small" value={scope} onChange={(e) => setScope(String(e.target.value))} sx={{ minWidth: 200, maxWidth: 320, height: 32, fontSize: 13 }}
          inputProps={{ 'aria-label': 'Which order' }}>
          <MenuItem value="all">All released lines</MenuItem>
          {choices.flatMap((o) => [
            <MenuItem key={`o${o.id}`} value={`o${o.id}`}>
              <Mono sx={{ mr: 1 }}>{o.code}</Mono>{o.customer || o.title ? <Box component="span" sx={{ color: 'var(--c-text-3)' }}>{o.customer ?? o.title}</Box> : null}
              {!o.open && <Box component="span" sx={{ ml: 1, color: 'var(--c-text-3)' }}>({o.status})</Box>}
            </MenuItem>,
            ...(o.lines.length > 1 ? o.lines.map((l) => (
              <MenuItem key={`l${l.id}`} value={`l${l.id}`} sx={{ pl: 4, fontSize: 13 }}>Line {l.lineNo} · {l.itemName}</MenuItem>
            )) : []),
          ])}
        </Select>
        <Select size="small" value={level} onChange={(e) => setLevelParam(String(e.target.value))} sx={{ height: 32, fontSize: 13 }} inputProps={{ 'aria-label': 'Open to level' }}
          disabled={!!term || onlyBlocked}>
          {LEVELS.map((l) => <MenuItem key={l} value={l}>Open to level {l}</MenuItem>)}
          <MenuItem value={ALL_LEVELS}>Open every level</MenuItem>
        </Select>
        <FormControlLabel sx={{ ml: 0.5, mr: 0 }}
          control={<Switch size="small" checked={onlyBlocked} onChange={(e) => setBlockedParam(e.target.checked ? '1' : '0')} />}
          label={<Typography sx={{ fontSize: 13 }}>Show only blocked</Typography>} />
      </FilterBar>

      {s && s.pieces > 0 && (
        <Surface e={1} sx={{ p: 1.5, mb: 1.5, display: 'flex', alignItems: 'center', gap: { xs: 1.5, md: 3 }, flexWrap: 'wrap' }}>
          <Box>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 0.25 }}>Done</Typography>
            <CompletionBar value={s.completion} width={140} title={s.weight === 'minutes' ? 'Weighed by planned minutes' : 'Counted by operations (not every step has planned minutes)'} />
          </Box>
          <Fig label="Operations done" value={`${s.stepsDone.toLocaleString()} of ${s.steps.toLocaleString()}`} />
          <Fig label="Running now" value={s.runningSteps.toLocaleString()} />
          <Fig label="Pieces blocked" value={s.blockedPieces.toLocaleString()} tone={s.blockedPieces ? 'danger' : undefined} />
          <Box sx={{ flex: '1 1 auto' }} />
          <OpLegend />
        </Surface>
      )}

      <ErrorNotice error={error} onRetry={() => setTick((t) => t + 1)} />
      {resp?.truncated && (
        <Alert severity="info" sx={{ mb: 1.5 }}>Only the first {resp.returned.toLocaleString()} rows are shown — narrow the search or pick one order.</Alert>
      )}
      {loading && !resp ? <SkeletonRows rows={8} height={rowH} /> : error && !resp ? null : rows.length === 0 && !loading ? (
        <EmptyState icon={<AccountTreeRounded />}
          title={!choices.length ? 'Nothing released yet' : term ? 'No code matches' : onlyBlocked ? 'Nothing is blocked' : 'Nothing released here'}
          hint={!choices.length ? 'Release a line of a confirmed order — its pieces appear here as a tree.' : term ? 'Try fewer characters of the code.' : onlyBlocked ? 'Every piece can go ahead once what it waits for is done.' : 'Pick another order.'} />
      ) : (
        <Surface e={1} sx={{ overflow: 'hidden', position: 'relative', opacity: loading ? 0.6 : 1, transition: 'opacity var(--t-fast) var(--ease)' }}>
          {wide && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(120px, 0.8fr) 150px 104px', columnGap: 1.5, px: 1.5, py: 0.75, borderBottom: '1px solid var(--c-border)', fontSize: 11.5, color: 'var(--c-text-3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span>Piece</span><span>Its operations</span><span>Done below</span><Box component="span" sx={{ textAlign: 'right' }}>Blocked</Box>
            </Box>
          )}
          <Box ref={listRef} role="tree" aria-label="Progress by piece" onScroll={(e: UIEvent<HTMLDivElement>) => setScrollTop(e.currentTarget.scrollTop)}
            sx={{ maxHeight: 'max(360px, calc(100vh - 330px))', overflowY: 'auto', overflowX: 'hidden' }}>
            <Box sx={{ height: rows.length * rowH, position: 'relative' }}>
              <Box sx={{ position: 'absolute', top: start * rowH, left: 0, right: 0 }}>
                {rows.slice(start, end).map((r) => (
                  <Row key={r.node.id} row={r} parent={r.node.parentId ? tree.byId.get(r.node.parentId) : undefined} wide={wide} height={rowH}
                    busy={busy.has(r.node.id)} names={names} onToggle={(n) => { void toggle(n); }} onOpen={(n) => n.kind === 'piece' && setPiece(n.id)} />
                ))}
              </Box>
            </Box>
          </Box>
        </Surface>
      )}
      <PieceDrawer nodeId={piece} basisNote={resp?.basisNote ?? null} onClose={() => setPiece(null)} onChanged={changed} />
    </Box>
  );
}

function Fig({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{label}</Typography>
      <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: tone === 'danger' ? 'var(--c-danger-700)' : 'var(--c-text)' }}>{value}</Typography>
    </Box>
  );
}
