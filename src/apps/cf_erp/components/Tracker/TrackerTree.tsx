import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type UIEvent } from 'react';
import { Alert, Box, Button, CircularProgress, FormControlLabel, MenuItem, Select, Switch, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import { Link } from 'react-router-dom';
import { InfoButton } from '@shared/ui';
import { CfApiError } from '../../api/client';
import { getTrackerTree, getTreeChildren, type TrackerTreeResponse, type TreeLevel, type TreeNode } from '../../api/trackerTree';
import { useCompanySlug } from '../../hooks/useLoad';
import { useUrlParam } from '../../hooks/useUrlState';
import { appPath } from '../../navMeta';
import {
  byOperationLines, childrenIndex, emptyTree, fromNodes, mergeBranch, needsChildren, openAllLoaded, openToLevel, pctText, refreshNodes, visibleRows,
  type TreeState, type VisibleRow,
} from '../../lib/trackerTree';
import { ownLane, rangeOf, subtreeLane, ticksOf, type LaneMode, type LaneOp, type LaneScope } from '../../lib/opLanes';
import { EmptyState, ErrorNotice, Mono, SkeletonRows, Surface } from '../ui';
import { ViewDrawingButton } from '../Drawings/RowDrawingViewer';
import { FilterBar } from '../FilterBar';
import { BlockedMark, CompletionBar } from './TreeParts';
import { LaneLegend, RouteLane, TimelineAxis, TimelineLane } from './OpLane';
import { PieceDrawer } from './PieceDrawer';

/** "Everything" in the level picker. */
const ALL_LEVELS = 99;
/** When the tree arrives, it opens down to the deepest level that keeps about this many rows on screen. */
const AUTO_ROWS = 400;
const ROW_WIDE = 40;
const ROW_NARROW = 64;
const OVERSCAN = 12;
/** Column widths in px (2026-11-14: the user drags them; kept per browser). The operations take what is left. */
const DEFAULT_COLS = { piece: 380, done: 132 };
const COLS_KEY = 'cf-tracker-cols';
const clampCols = (c: { piece: number; done: number }) => ({ piece: Math.max(160, Math.min(1100, Math.round(c.piece))), done: Math.max(56, Math.min(260, Math.round(c.done))) });
function readCols() {
  try { const v = JSON.parse(localStorage.getItem(COLS_KEY) ?? 'null'); if (v && typeof v.piece === 'number' && typeof v.done === 'number') return clampCols(v); } catch { /* no storage */ }
  return DEFAULT_COLS;
}

/** A drag handle on a column's right edge; double-click puts the width back. */
function ColHandle({ onDrag, onReset }: { onDrag: (dx: number) => void; onReset: () => void }) {
  const start = (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.preventDefault(); e.stopPropagation();
    let x = e.clientX;
    const move = (ev: PointerEvent) => { const dx = ev.clientX - x; x = ev.clientX; if (dx) onDrag(dx); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.style.cursor = ''; };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    document.body.style.cursor = 'col-resize';
  };
  return (
    <Box component="span" role="separator" aria-orientation="vertical" aria-label="Drag to resize the column; double-click to reset" title="Drag to resize · double-click to reset"
      onPointerDown={start} onDoubleClick={onReset}
      sx={{ position: 'absolute', top: -6, bottom: -6, right: -10, width: 9, cursor: 'col-resize', zIndex: 1, display: 'flex', justifyContent: 'center',
        '&::after': { content: '""', width: '2px', borderRadius: 1, background: 'var(--c-border)' }, '&:hover::after': { background: 'var(--c-primary-500)' } }} />
  );
}

/** "o12" / "l34" / "w56" (a production order, §76) / "all" / "latest" in the URL → the read's scope. */
function scopeOf(v: string): { orderId: number | 'latest' | null; lineId: number | null; productionOrderId: number | null } {
  if (v === 'latest') return { orderId: 'latest', lineId: null, productionOrderId: null };
  const m = /^([olw])(\d+)$/.exec(v);
  if (!m) return { orderId: null, lineId: null, productionOrderId: null };
  if (m[1] === 'w') return { orderId: null, lineId: null, productionOrderId: Number(m[2]) };
  return m[1] === 'o' ? { orderId: Number(m[2]), lineId: null, productionOrderId: null } : { orderId: null, lineId: Number(m[2]), productionOrderId: null };
}

/** A URL parameter on the Tracker page; plain state when the tree sits inside another page (the order's Production step). */
function useParam(embedded: boolean, key: string, initial: string): [string, (v: string) => void] {
  const url = useUrlParam(key, initial);
  const local = useState(initial);
  return embedded ? local : url;
}

/** The deepest level whose rows, with everything above them, stay about AUTO_ROWS. */
function autoLevel(levels: TreeLevel[]): number {
  let rows = 0;
  let pick = levels[0]?.level ?? 2;
  for (const l of levels) { rows += l.count; if (rows > AUTO_ROWS && l.level > (levels[0]?.level ?? 2)) break; pick = l.level; }
  return pick;
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

function Row({ row, parent, wide, height, gridCols, busy, lane, mode, range, now, names, onToggle, onOpen }: {
  row: VisibleRow; parent: TreeNode | undefined; wide: boolean; height: number; gridCols: string; busy: boolean;
  lane: LaneOp[]; mode: LaneMode; range: { from: number; to: number } | null; now: number;
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
    `${pctText(node.completion)} of the work ${node.kind === 'piece' && hasChildren ? 'on and under this piece' : node.kind === 'piece' ? 'on this piece' : node.kind === 'line' ? 'of this line' : 'of this order'} is done${node.weight === 'minutes' ? ', weighed by planned minutes' : node.weight === 'count' ? ', counted by operations' : ''}.`,
    ...byOperationLines(node, names),
  ].join('\n');
  // A piece's lane opens the piece; a segment of a rolled-up lane on a parent opens it too (its steps are there).
  const openPiece = node.kind === 'piece' ? () => onOpen(node) : undefined;
  return (
    <Box
      role="treeitem" aria-level={depth + 1} aria-expanded={hasChildren ? open : undefined} tabIndex={0}
      data-testid="tree-row" data-node={node.id}
      onClick={act} onKeyDown={key}
      sx={{
        height, boxSizing: 'border-box', px: 1.5, cursor: 'pointer', borderBottom: '1px solid var(--c-divider)',
        display: 'grid', alignItems: 'center', columnGap: 1.5,
        gridTemplateColumns: wide ? gridCols : 'minmax(0, 1fr) auto',
        gridTemplateRows: wide ? '1fr' : '1fr 1fr',
        background: node.match ? 'var(--c-primary-50)' : node.kind === 'order' ? 'var(--c-surface-2)' : 'transparent',
        '&:hover': { background: 'var(--c-surface-2)' },
        '&:focus-visible': { outline: '2px solid var(--c-primary-400)', outlineOffset: -2 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, alignSelf: 'stretch', gridColumn: wide ? 'auto' : '1 / 2' }}>
        {Array.from({ length: depth }, (_, i) => (
          <Box key={i} aria-hidden sx={{ width: wide ? 14 : 8, flexShrink: 0, alignSelf: 'stretch', borderLeft: '1px solid var(--c-divider)' }} />
        ))}
        <Box sx={{ width: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-3)' }}>
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
          {node.kind === 'piece' && node.orderId != null && node.lineId != null && node.itemId != null && wide && (
            <ViewDrawingButton icon label="View drawing" target={{ orderId: node.orderId, lineId: node.lineId, rowId: node.itemId, label: node.code }} />
          )}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, pl: wide ? 0 : 3, gridColumn: wide ? 'auto' : '1 / -1', gridRow: wide ? 'auto' : 2 }}>
        {mode === 'route'
          ? <RouteLane ops={lane} onOpen={openPiece} />
          : <TimelineLane ops={lane} range={range} now={now} onOpen={openPiece} />}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: wide ? 'flex-start' : 'flex-end', gap: 1 }}>
        {(node.kind !== 'piece' || hasChildren || node.ops.length > 0) && <CompletionBar value={node.completion} title={barTitle} width={wide ? 70 : 48} />}
        {!wide && <BlockedMark node={node} />}
      </Box>
      {wide && <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}><BlockedMark node={node} /></Box>}
    </Box>
  );
}

const LANE_INFO = (
  <Box sx={{ display: 'grid', gap: 1 }}>
    <Typography sx={{ fontSize: 13 }}>Every row shows its <b>own</b> operations in its own order — a girder and a cut plate do not share a column.</Typography>
    <Typography sx={{ fontSize: 13 }}><b>Route</b>: the operations one after another, each as wide as its planned time (equal widths when some have no time).</Typography>
    <Typography sx={{ fontSize: 13 }}><b>Timeline</b>: on a date axis. The outline is the planner&rsquo;s slot; the filled bar is when the floor started and finished it. A running step reaches the red &ldquo;now&rdquo; line and glows.</Typography>
    <Typography sx={{ fontSize: 13 }}><b>This level</b>: only the row&rsquo;s own steps. <b>Everything under it</b>: the row and all the pieces below it, one bar per operation.</Typography>
    <Typography sx={{ fontSize: 13 }}>Click a piece&rsquo;s bar to open its steps and record work.</Typography>
  </Box>
);

/**
 * Production › Tracker › Progress (2026-11-14 redesign, user: "a way to view all operations or only operations of a
 * current level … like a gantt chart … every row will have different operations"): the frozen piece codes as a tree,
 * order › line › SPAN-01-1 › G2 › 3 › TF1, each row with ITS OWN operations on the right — as a route or on a
 * timeline, the row's own steps or everything under it (lib/opLanes.ts). One order at a time by default (the open
 * order released last), read whole, so every level is there; "All released lines" still comes a branch at a time.
 * Also the order's Production step (lineId: one line, no picker) — it replaced the grid with an operation per
 * column, which forced every row into one order of operations.
 */
export function TrackerTree({ lineId = null, readOnly = false, onChanged }: {
  /** Embedded on one released line (the order's Production step): no picker, no URL state. */
  lineId?: number | null;
  /** Hide the step actions in the piece drawer (no production permission, or an order that is not confirmed). */
  readOnly?: boolean;
  /** Work was recorded in the drawer. */
  onChanged?: () => void;
}) {
  const embedded = lineId != null;
  const company = useCompanySlug();
  const wide = useMediaQuery('(min-width: 900px)');
  const rowH = wide ? ROW_WIDE : ROW_NARROW;
  const [scopeParam, setScope] = useParam(embedded, 'order', 'latest');
  const scope = embedded ? `l${lineId}` : scopeParam;
  const [levelParam, setLevelParam] = useParam(embedded, 'level', '');
  const [blockedParam, setBlockedParam] = useParam(embedded, 'blocked', '0');
  const [modeParam, setMode] = useParam(embedded, 'lane', 'route');
  const [opsParam, setOpsScope] = useParam(embedded, 'ops', 'own');
  const mode: LaneMode = modeParam === 'timeline' ? 'timeline' : 'route';
  const opsScope: LaneScope = opsParam === 'all' ? 'all' : 'own';
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
  // "now" moves on a minute at a time, so a running bar grows while the page is open.
  const [cols, setColsRaw] = useState(readCols);
  const setCols = (f: (c: typeof DEFAULT_COLS) => typeof DEFAULT_COLS) => setColsRaw((c) => { const n = clampCols(f(c)); try { localStorage.setItem(COLS_KEY, JSON.stringify(n)); } catch { /* no storage */ } return n; });
  const gridCols = `${cols.piece}px minmax(0, 1fr) ${cols.done}px 88px`;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(t); }, []);

  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 350); return () => clearTimeout(t); }, [search]);

  const { orderId, lineId: scopeLine, productionOrderId } = scopeOf(scope);
  const oneOrder = scope !== 'all';
  const level = levelParam === '' ? null : Number(levelParam) || null;
  // One order is read whole (every level); all released lines come to the level asked and a branch at a time.
  const depth = oneOrder || level === ALL_LEVELS ? 50 : (level ?? 3) + 1;
  const query = useMemo(() => ({
    orderId, lineId: scopeLine, productionOrderId, search: term || null, onlyBlocked, depth,
  }), [orderId, scopeLine, productionOrderId, term, onlyBlocked, depth]);
  const levelRef = useRef(level);
  useEffect(() => { levelRef.current = level; }, [level]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getTrackerTree(query)
      .then((r) => {
        if (!alive) return;
        let next = fromNodes(r.nodes);
        if (embedded) {
          // On the order's own page the order row says nothing new: the line is the top.
          const byId = new Map(next.byId);
          for (const n of r.nodes) if (n.kind === 'order') byId.delete(n.id);
          next = { byId, loaded: next.loaded };
        }
        setResp(r);
        setTree(next);
        const target = levelRef.current ?? autoLevel(r.levels ?? []);
        setOpen(query.search || query.onlyBlocked ? openAllLoaded(next) : openToLevel(next, target));
        setError(null);
        if (listRef.current) listRef.current.scrollTop = 0;
        setScrollTop(0);
      })
      .catch((e) => { if (alive) setError(e instanceof CfApiError ? e : new CfApiError(0, String(e))); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [query, tick, embedded]);

  // A new "open down to" on a tree already read whole: just open it, no new read.
  useEffect(() => {
    if (!resp || term || onlyBlocked) return;
    setOpen(openToLevel(tree, level ?? autoLevel(resp.levels ?? [])));
    // Only the level choice reopens; a read sets its own opening above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

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
    onChanged?.();
  }, [query, onChanged]);

  const rows = useMemo(() => visibleRows(tree, open, { onlyBlocked }), [tree, open, onlyBlocked]);
  const kids = useMemo(() => childrenIndex(tree.byId), [tree]);
  const names = useMemo(() => resp?.operations ?? {}, [resp]);
  const opOrder = useMemo(() => resp?.opOrder ?? [], [resp]);
  const start = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewH) / rowH) + OVERSCAN);
  // Lanes for the rows on screen only (a roll-up walks the subtree).
  const lanes = useMemo(() => {
    const m = new Map<string, LaneOp[]>();
    for (const r of rows.slice(start, end)) {
      m.set(r.node.id, opsScope === 'all' || r.node.kind !== 'piece' ? subtreeLane(r.node, tree, kids, names, opOrder, now) : ownLane(r.node, names, now));
    }
    return m;
  }, [rows, start, end, opsScope, tree, kids, names, opOrder, now]);
  // The timeline's axis spans every visible row, so it does not jump while scrolling.
  const range = useMemo(() => {
    if (mode !== 'timeline') return null;
    const all = rows.map((r) => (opsScope === 'all' || r.node.kind !== 'piece' ? subtreeLane(r.node, tree, kids, names, opOrder, now) : ownLane(r.node, names, now)));
    return rangeOf(all, now);
  }, [mode, rows, opsScope, tree, kids, names, opOrder, now]);
  const ticks = useMemo(() => (range ? ticksOf(range, wide ? 7 : 4) : []), [range, wide]);

  const s = resp?.summary;
  const choices = resp?.orders ?? [];
  const levels = resp?.levels ?? [];
  const shownLevel = level ?? (levels.length ? autoLevel(levels) : null);
  // Opens the tree at once, not only through the level: Collapse / Expand all used to do nothing when the level
  // was already that one (after branches were opened by hand) — 2026-11-14 fix.
  const setLevel = (v: number) => {
    setLevelParam(String(v));
    if (!term && !onlyBlocked && (oneOrder || v !== ALL_LEVELS)) setOpen(openToLevel(tree, v));
  };
  const topLevel = levels[0]?.level ?? 2;

  return (
    <Box>
      <FilterBar search={search} onSearch={setSearch} placeholder="Search a code, e.g. G2-3-TF1">
        {!embedded && (
          <Select size="small" value={scope === 'latest' ? (resp?.scope.orderId != null ? `o${resp.scope.orderId}` : '') : scope}
            onChange={(e) => setScope(String(e.target.value))} sx={{ minWidth: 200, maxWidth: 320, height: 32, fontSize: 13 }}
            inputProps={{ 'aria-label': 'Which order' }} displayEmpty renderValue={(v) => {
              if (!v) return 'Pick an order';
              if (v === 'all') return 'All released lines';
              const o = choices.find((c) => `o${c.id}` === v);
              if (o) return `${o.code}${o.customer ?? o.title ? ` · ${o.customer ?? o.title}` : ''}`;
              for (const c of choices) {
                const l = c.lines.find((x) => `l${x.id}` === v); if (l) return `${c.code} · line ${l.lineNo}`;
                const p = (c.productionOrders ?? []).find((x) => `w${x.id}` === v); if (p) return p.code;
              }
              return String(v);
            }}>
            <MenuItem value="all">All released lines</MenuItem>
            {choices.flatMap((o) => [
              <MenuItem key={`o${o.id}`} value={`o${o.id}`}>
                <Mono sx={{ mr: 1 }}>{o.code}</Mono>{o.customer || o.title ? <Box component="span" sx={{ color: 'var(--c-text-3)' }}>{o.customer ?? o.title}</Box> : null}
                {!o.open && <Box component="span" sx={{ ml: 1, color: 'var(--c-text-3)' }}>({o.status})</Box>}
              </MenuItem>,
              ...(o.lines.length > 1 ? o.lines.map((l) => (
                <MenuItem key={`l${l.id}`} value={`l${l.id}`} sx={{ pl: 4, fontSize: 13 }}>Line {l.lineNo} · {l.itemName}</MenuItem>
              )) : []),
              // §76: each released production order of the order.
              ...(o.productionOrders ?? []).map((p) => (
                <MenuItem key={`w${p.id}`} value={`w${p.id}`} sx={{ pl: 4, fontSize: 13 }}><Mono sx={{ mr: 1 }}>{p.code}</Mono>{p.label}</MenuItem>
              )),
            ])}
          </Select>
        )}
        <Select<number | ''> size="small" value={shownLevel ?? ''} displayEmpty onChange={(e) => setLevel(Number(e.target.value))} sx={{ height: 32, fontSize: 13, maxWidth: 300 }}
          inputProps={{ 'aria-label': 'Open down to' }} disabled={!!term || onlyBlocked || !levels.length}
          renderValue={(v) => {
            if (v === '') return 'Open down to…';
            if (Number(v) === ALL_LEVELS) return 'Every level open';
            const l = levels.find((x) => x.level === Number(v));
            return l ? `Down to ${l.names.join(' / ')}` : 'Open down to…';
          }}>
          {levels.map((l) => (
            <MenuItem key={l.level} value={l.level} sx={{ fontSize: 13 }}>
              <Box component="span" sx={{ color: 'var(--c-text-3)', mr: 1, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{l.level - topLevel + 1}</Box>
              {l.names.join(' / ')}
              <Box component="span" sx={{ color: 'var(--c-text-3)', ml: 1 }}>{l.count.toLocaleString()}</Box>
            </MenuItem>
          ))}
          <MenuItem value={ALL_LEVELS} sx={{ fontSize: 13 }}>Every level</MenuItem>
        </Select>
        <Button size="small" variant="text" startIcon={<UnfoldMoreRounded fontSize="small" />} onClick={() => setLevel(ALL_LEVELS)} disabled={!!term || onlyBlocked}>Expand all</Button>
        <Button size="small" variant="text" startIcon={<UnfoldLessRounded fontSize="small" />} onClick={() => setLevel(topLevel)} disabled={!!term || onlyBlocked}>Collapse</Button>
        <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v) => v && setMode(v)} aria-label="How operations are drawn" sx={{ height: 32 }}>
          <ToggleButton value="route" sx={{ px: 1.25, fontSize: 12.5, textTransform: 'none' }}>Route</ToggleButton>
          <ToggleButton value="timeline" sx={{ px: 1.25, fontSize: 12.5, textTransform: 'none' }}>Timeline</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup size="small" exclusive value={opsScope} onChange={(_, v) => v && setOpsScope(v)} aria-label="Which operations" sx={{ height: 32 }}>
          <ToggleButton value="own" sx={{ px: 1.25, fontSize: 12.5, textTransform: 'none' }}>This level</ToggleButton>
          <ToggleButton value="all" sx={{ px: 1.25, fontSize: 12.5, textTransform: 'none' }}>Everything under it</ToggleButton>
        </ToggleButtonGroup>
        <FormControlLabel sx={{ ml: 0.5, mr: 0 }}
          control={<Switch size="small" checked={onlyBlocked} onChange={(e) => setBlockedParam(e.target.checked ? '1' : '0')} />}
          label={<Typography sx={{ fontSize: 13 }}>Only blocked</Typography>} />
        <InfoButton text={LANE_INFO} label="How to read the operations" />
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
          <LaneLegend mode={mode} />
        </Surface>
      )}

      <ErrorNotice error={error} onRetry={() => setTick((t) => t + 1)} />
      {resp?.truncated && (
        <Alert severity="info" sx={{ mb: 1.5 }}>Only the first {resp.returned.toLocaleString()} rows are shown — narrow the search or pick one order.</Alert>
      )}
      {mode === 'timeline' && resp && !range && rows.length > 0 && (
        <Alert severity="info" sx={{ mb: 1.5 }}>Nothing on screen has started or been planned yet, so there are no dates to draw. Run the plan in Planning, or start work on the floor.</Alert>
      )}
      {loading && !resp ? <SkeletonRows rows={8} height={rowH} /> : error && !resp ? null : rows.length === 0 && !loading ? (
        <Box>
          <EmptyState icon={<AccountTreeRounded />}
            title={!choices.length ? 'Nothing released yet' : term ? 'No code matches' : onlyBlocked ? 'Nothing is blocked' : 'Nothing released here'}
            hint={!choices.length
              ? (resp?.unreleased?.length ? 'These production orders are waiting to be released — open one to release it.' : 'Release a line of a confirmed order — its pieces appear here as a tree.')
              : term ? 'Try fewer characters of the code.' : onlyBlocked ? 'Every piece can go ahead once what it waits for is done.' : 'Pick another order.'} />
          {!choices.length && !!resp?.unreleased?.length && (
            <Surface e={1} sx={{ maxWidth: 560, mx: 'auto', mt: 1 }}>
              {resp.unreleased.map((p) => (
                <Box key={p.id} component={Link} to={appPath(company, `production-orders/${p.id}`)}
                  sx={{ display: 'flex', gap: 1.5, alignItems: 'center', px: 1.5, py: 1, borderBottom: '1px solid var(--c-divider)', color: 'inherit', textDecoration: 'none', '&:hover': { background: 'var(--c-surface-2)' } }}>
                  <Mono>{p.code}</Mono>
                  <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label ?? p.orderCode}</Typography>
                  <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{p.status.replace(/_/g, ' ')}</Typography>
                </Box>
              ))}
            </Surface>
          )}
        </Box>
      ) : (
        <Surface e={1} sx={{ overflow: 'hidden', position: 'relative', opacity: loading ? 0.6 : 1, transition: 'opacity var(--t-fast) var(--ease)' }}>
          {wide && (
            <Box sx={{ display: 'grid', gridTemplateColumns: gridCols, columnGap: 1.5, px: 1.5, py: 0.75, borderBottom: '1px solid var(--c-border)', fontSize: 11.5, color: 'var(--c-text-3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', alignItems: 'end' }}>
              <Box component="span" sx={{ position: 'relative' }}>Piece<ColHandle onDrag={(dx) => setCols((c) => ({ ...c, piece: c.piece + dx }))} onReset={() => setCols((c) => ({ ...c, piece: DEFAULT_COLS.piece }))} /></Box>
              <Box component="span" sx={{ position: 'relative' }}>
                {mode === 'timeline' && range ? <TimelineAxis ticks={ticks} range={range} /> : <span>{opsScope === 'all' ? 'Operations, with everything under it' : 'Its own operations, in order'}</span>}
                <ColHandle onDrag={(dx) => setCols((c) => ({ ...c, done: c.done - dx }))} onReset={() => setCols((c) => ({ ...c, done: DEFAULT_COLS.done }))} />
              </Box>
              <span>Done</span><Box component="span" sx={{ textAlign: 'right' }}>Blocked</Box>
            </Box>
          )}
          <Box ref={listRef} role="tree" aria-label="Progress by piece" onScroll={(e: UIEvent<HTMLDivElement>) => setScrollTop(e.currentTarget.scrollTop)}
            sx={{ maxHeight: embedded ? 'max(360px, calc(100vh - 380px))' : 'max(360px, calc(100vh - 330px))', overflowY: 'auto', overflowX: 'hidden' }}>
            <Box sx={{ height: rows.length * rowH, position: 'relative' }}>
              <Box sx={{ position: 'absolute', top: start * rowH, left: 0, right: 0 }}>
                {rows.slice(start, end).map((r) => (
                  <Row key={r.node.id} row={r} parent={r.node.parentId ? tree.byId.get(r.node.parentId) : undefined} wide={wide} height={rowH} gridCols={gridCols}
                    busy={busy.has(r.node.id)} lane={lanes.get(r.node.id) ?? []} mode={mode} range={range} now={now} names={names}
                    onToggle={(n) => { void toggle(n); }} onOpen={(n) => n.kind === 'piece' && setPiece(n.id)} />
                ))}
              </Box>
            </Box>
          </Box>
        </Surface>
      )}
      <PieceDrawer nodeId={piece} basisNote={resp?.basisNote ?? null} onClose={() => setPiece(null)} onChanged={changed} readOnly={readOnly} />
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
