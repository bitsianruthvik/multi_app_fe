/**
 * Dashboard › By order › "Where each line stands": every released line opens
 * into its piece-code tree (span › girder line › segment › parts) from the
 * Tracker's tree API, one level at a time. By default the lines are open one
 * level (spans / shipping units) — "they track in the top 1-2 levels" — and
 * "Open to" takes it deeper, down to every part. Nothing is read until the
 * order card is opened; each open reads only the next level (the server holds
 * a line's tree for 30 s). What is open is remembered per order on this device.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, ButtonGroup, CircularProgress, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import type { DashOrder, DashOrderLine } from '../../api/dashboard';
import { getTreeChildren, type OperationNames, type TreeNode } from '../../api/trackerTree';
import { useCompanySlug } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { AUTO_OPEN_MAX_LINES, DEFAULT_LEVEL, TREE_LEVELS, levelDepth, lineNodeId, loadSavedTree, nodesToFill, openForLevel, opsSummary, saveTree, type TreeLevel } from '../../lib/dashboardTree';
import { emptyTree, mergeBranch, needsChildren, refreshNodes, visibleRows, type TreeState } from '../../lib/trackerTree';
import { tonnesText } from '../../lib/dashboard';
import { Mono } from '../ui';
import { PieceDrawer } from '../Tracker/PieceDrawer';
import { BlockedMark, CompletionBar, OpStrip } from '../Tracker/TreeParts';
import { Dot } from './DashParts';

const COLS = { xs: 'minmax(0, 1fr) auto', md: 'minmax(220px, 2fr) 44px 150px auto minmax(110px, 1.5fr)' };
const rowSx = { display: 'grid', gridTemplateColumns: COLS, columnGap: 1.5, rowGap: 0.25, alignItems: 'center', px: 1, py: 0.5, minHeight: 34, borderBottom: '1px solid var(--c-divider)' };

/** A child's code repeats its parent's; the part it adds is what a person reads, so the rest steps back. */
function CodeText({ node, parent, onOpen }: { node: TreeNode; parent: TreeNode | undefined; onOpen: (n: TreeNode) => void }) {
  const prefix = parent?.kind === 'piece' && node.code.startsWith(parent.code) ? parent.code : '';
  return (
    <Box component="button" type="button" data-testid="tree-code" title={`Open ${node.code}`} onClick={(e: React.MouseEvent) => { e.stopPropagation(); onOpen(node); }}
      sx={{ all: 'unset', cursor: 'pointer', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: 12.5, '&:hover': { textDecoration: 'underline' }, '&:focus-visible': { outline: '2px solid var(--c-primary-500)' } }}>
      {prefix && <Box component="span" sx={{ color: 'var(--c-text-3)' }}>{prefix}</Box>}
      <Box component="span" sx={{ fontWeight: 600, color: 'var(--c-text)' }}>{node.code.slice(prefix.length)}</Box>
    </Box>
  );
}

function Chevron({ show, open, busy }: { show: boolean; open: boolean; busy: boolean }) {
  return (
    <Box component="span" aria-hidden sx={{ width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--c-text-3)' }}>
      {busy ? <CircularProgress size={12} /> : show ? <ChevronRightRounded fontSize="small" sx={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform var(--t-fast) var(--ease)' }} /> : null}
    </Box>
  );
}

function PieceRow({ node, parent, depth, open, busy, onToggle, onOpen }: {
  node: TreeNode; parent: TreeNode | undefined; depth: number; open: boolean; busy: boolean; onToggle: (n: TreeNode) => void; onOpen: (n: TreeNode) => void;
}) {
  const has = node.childCount > 0;
  const act = () => (has ? onToggle(node) : onOpen(node));
  const summary = opsSummary(node);
  return (
    <Box data-testid="tree-row" data-node={node.id} data-depth={depth} role="treeitem" aria-expanded={has ? open : undefined} tabIndex={0}
      onClick={act}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); }
        else if (e.key === 'ArrowRight' && has && !open) { e.preventDefault(); onToggle(node); }
        else if (e.key === 'ArrowLeft' && has && open) { e.preventDefault(); onToggle(node); }
      }}
      sx={{ ...rowSx, cursor: 'pointer', '&:hover': { background: 'var(--c-surface-2)' }, '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: -2 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, pl: `${depth * 16}px` }}>
        <Chevron show={has} open={open} busy={busy} />
        <CodeText node={node} parent={parent} onOpen={onOpen} />
        {node.running > 0 && <Dot color="var(--c-info-600)" pulse label={`${node.running} running now`} />}
        {node.name && <Typography noWrap sx={{ fontSize: 12.5, color: 'var(--c-text-2)', minWidth: 0 }} title={node.name}>{node.name}</Typography>}
      </Box>
      <Box sx={{ display: { xs: 'none', md: 'block' }, fontSize: 12, color: 'var(--c-text-3)', textAlign: 'right' }}>
        {node.qty != null && node.qty !== 1 ? <Mono>×{node.qty}</Mono> : null}
      </Box>
      <Box sx={{ justifySelf: { xs: 'end', md: 'stretch' } }}>
        {node.completion != null ? <CompletionBar value={node.completion} width={96} title={node.weight ? `Weighed by ${node.weight === 'minutes' ? 'planned minutes' : 'operations counted'}.` : undefined} /> : null}
      </Box>
      <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, pl: { xs: `${depth * 16 + 24}px`, md: 0 } }}>
        <BlockedMark node={node} />
        {node.blockedCount > 0 && node.blockedReason && <Typography noWrap sx={{ fontSize: 11.5, color: 'var(--c-danger-700)', maxWidth: 260, minWidth: 0 }} title={node.blockedReason}>{node.blockedReason}</Typography>}
        <Box sx={{ display: { xs: 'inline', md: 'none' }, fontSize: 11.5, color: 'var(--c-text-3)', ml: 'auto' }}>{summary}</Box>
      </Box>
      <Box sx={{ display: { xs: 'none', md: 'flex' }, minWidth: 0 }}>
        {node.ops.length > 0 ? <OpStrip ops={node.ops} /> : <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{summary}</Typography>}
      </Box>
    </Box>
  );
}

export function OrderTree({ order }: { order: DashOrder }) {
  const company = useCompanySlug();
  const released = order.lineRows.filter((l) => l.released && l.releaseId != null);
  const saved = useRef(loadSavedTree(order.id));
  const [trees, setTrees] = useState<Record<number, TreeState>>({});
  const [open, setOpen] = useState<Set<string>>(() => new Set(saved.current?.open ?? []));
  const [level, setLevel] = useState<TreeLevel | null>(saved.current ? saved.current.level : DEFAULT_LEVEL);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [, setNames] = useState<OperationNames>({});
  const [drawer, setDrawer] = useState<{ id: string; lineId: number } | null>(null);
  const started = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const mark = (id: string, on: boolean) => setBusy((b) => { const n = new Set(b); if (on) n.add(id); else n.delete(id); return n; });
  const fail = (lineId: number, e: unknown) => setErrors((x) => ({ ...x, [lineId]: e instanceof Error ? e.message : String(e) }));

  /** Read a line `depth` levels deep, then whatever else is open and still unread, a level at a time. */
  const fillLine = useCallback(async (lineId: number, depth: number, openSet: Set<string>, base?: TreeState): Promise<TreeState | null> => {
    const id = lineNodeId(lineId);
    mark(id, true);
    try {
      const r = await getTreeChildren(id, depth);
      let st = base ?? emptyTree();
      st = { byId: new Map(st.byId).set(r.node.id, r.node), loaded: st.loaded };
      st = mergeBranch(st, r.node.id, r.node, r.nodes);
      let ops = r.operations;
      for (let wave = 0; wave < 8; wave++) {
        const need = nodesToFill(st, openSet);
        if (!need.length) break;
        const got = await Promise.all(need.map((n) => getTreeChildren(n.id, 1)));
        got.forEach((g, i) => { st = mergeBranch(st, need[i].id, g.node, g.nodes); ops = { ...ops, ...g.operations }; });
      }
      if (!alive.current) return null;
      const final = st;
      setTrees((t) => ({ ...t, [lineId]: final }));
      setNames((n) => ({ ...n, ...ops }));
      setErrors((x) => { const rest = { ...x }; delete rest[lineId]; return rest; });
      return final;
    } catch (e) { if (alive.current) fail(lineId, e); return null; } finally { if (alive.current) mark(id, false); }
  }, []);

  /** "Open to level n": every released line, n levels down. */
  const pick = useCallback(async (l: TreeLevel) => {
    setLevel(l);
    if (l === 0) { setOpen(new Set()); return; }
    const got = await Promise.all(released.map((ln) => fillLine(ln.id, levelDepth(l), new Set())));
    if (!alive.current) return;
    setOpen(openForLevel(got.filter((s): s is TreeState => !!s), l));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillLine, order.id]);

  // The first time this order's card is open: restore what the device remembers, else lines + the top level.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const s = saved.current;
    if (!s) { if (released.length && released.length <= AUTO_OPEN_MAX_LINES) void pick(DEFAULT_LEVEL); return; }
    const openLines = released.filter((l) => s.open.includes(lineNodeId(l.id)));
    const depth = Math.max(1, levelDepth(s.level ?? 1));
    void Promise.all(openLines.map((l) => fillLine(l.id, depth, new Set(s.open))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (started.current) saveTree(order.id, { level, open: [...open] }); }, [open, level, order.id]);

  const toggleLine = (l: DashOrderLine) => {
    const id = lineNodeId(l.id);
    setLevel(null);
    if (open.has(id)) { setOpen((o) => { const n = new Set(o); n.delete(id); return n; }); return; }
    const next = new Set(open).add(id);
    setOpen(next);
    if (!trees[l.id]) void fillLine(l.id, 1, next);
  };
  const toggleNode = async (lineId: number, n: TreeNode) => {
    setLevel(null);
    if (open.has(n.id)) { setOpen((o) => { const x = new Set(o); x.delete(n.id); return x; }); return; }
    const st = trees[lineId];
    if (st && needsChildren(st, n)) {
      mark(n.id, true);
      try {
        const g = await getTreeChildren(n.id, 1);
        if (!alive.current) return;
        setTrees((t) => ({ ...t, [lineId]: mergeBranch(t[lineId] ?? st, n.id, g.node, g.nodes) }));
        setNames((x) => ({ ...x, ...g.operations }));
      } catch (e) { if (alive.current) fail(lineId, e); return; } finally { if (alive.current) mark(n.id, false); }
    }
    setOpen((o) => new Set(o).add(n.id));
  };
  const changed = (lineId: number) => (node: TreeNode) => setTrees((t) => (t[lineId] ? { ...t, [lineId]: refreshNodes(t[lineId], [node]) } : t));

  if (!order.lineRows.length) return null;
  return (
    <Box data-testid="order-tree" sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 0.75 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>Where each line stands</Typography>
        <Box sx={{ flex: 1 }} />
        {released.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Open to</Typography>
            <ButtonGroup size="small" aria-label="Open to level" data-testid="level-picker">
              {TREE_LEVELS.map((l) => (
                <Button key={String(l.key)} data-level={String(l.key)} onClick={() => void pick(l.key)} variant={level === l.key ? 'contained' : 'outlined'} aria-pressed={level === l.key}
                  sx={{ px: 1, py: 0.1, fontSize: 12, textTransform: 'none', minWidth: 0 }}>{l.label}</Button>
              ))}
            </ButtonGroup>
          </Box>
        )}
        <Typography sx={{ fontSize: 12 }}>
          <Link data-testid="open-production" to={appPath(company, `orders/${order.id}?tab=production`)} style={{ color: 'var(--c-primary-700)' }}>Open in Production</Link>
        </Typography>
      </Box>
      <Box role="tree" aria-label={`${order.code} by line and piece code`} sx={{ border: '1px solid var(--c-divider)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
        {order.lineRows.map((l) => {
          const id = lineNodeId(l.id);
          const isOpen = open.has(id);
          const st = trees[l.id];
          const rel = l.released && l.releaseId != null;
          const rows = rel && isOpen && st ? visibleRows(st, open).slice(1) : [];
          return (
            <Box key={l.id} data-testid="tree-line" data-line={l.id} data-released={rel ? 'true' : 'false'}>
              <Box role="treeitem" aria-expanded={rel ? isOpen : undefined} tabIndex={0} data-testid="tree-line-head"
                onClick={() => { if (rel) toggleLine(l); }}
                onKeyDown={(e: React.KeyboardEvent) => { if (e.target === e.currentTarget && rel && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleLine(l); } }}
                sx={{ ...rowSx, background: 'var(--c-surface-2)', cursor: rel ? 'pointer' : 'default', borderBottomColor: 'var(--c-border)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                  <Chevron show={rel} open={isOpen} busy={busy.has(id)} />
                  <Mono sx={{ fontSize: 12.5, fontWeight: 700 }}>Line {l.lineNo}</Mono>
                  <Typography noWrap sx={{ fontSize: 12.5, color: 'var(--c-text-2)', minWidth: 0 }} title={l.item.name ?? ''}>{l.item.code ? `${l.item.code} · ` : ''}{l.item.name}{l.quantity !== 1 ? ` ×${l.quantity}` : ''}</Typography>
                </Box>
                <Box sx={{ display: { xs: 'none', md: 'block' } }} />
                <Box sx={{ justifySelf: { xs: 'end', md: 'stretch' } }}>{rel ? <CompletionBar value={l.progressPct / 100} width={96} /> : null}</Box>
                <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, fontSize: 11.5, color: 'var(--c-text-3)', pl: { xs: 3, md: 0 } }}>
                  {rel && l.tonnes != null ? <>{tonnesText(l.tonnesMade, '—')} of {tonnesText(l.tonnes)}</> : null}
                </Box>
                <Box sx={{ display: { xs: 'none', md: 'flex' }, justifyContent: 'flex-end' }}>
                  {rel && (
                    <Typography sx={{ fontSize: 11.5 }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                      <Link to={appPath(company, `orders/${order.id}?tab=production&line=${l.id}`)} style={{ color: 'var(--c-primary-700)' }}>Open in Production</Link>
                    </Typography>
                  )}
                </Box>
              </Box>
              {!rel && (
                <Typography data-testid="tree-unreleased" sx={{ fontSize: 12, color: 'var(--c-text-3)', px: 1, py: 0.75, pl: 4.5, borderBottom: '1px solid var(--c-divider)' }}>
                  Not released yet — nothing to track below the line
                </Typography>
              )}
              {errors[l.id] && (
                <Box data-testid="tree-error" sx={{ px: 1, py: 0.75, pl: 4.5, fontSize: 12, color: 'var(--c-danger-700)', display: 'flex', gap: 1, alignItems: 'center' }}>
                  <span>Could not read this line: {errors[l.id]}</span>
                  <Button size="small" onClick={() => { const next = new Set(open).add(id); setOpen(next); void fillLine(l.id, 1, next, st); }}>Try again</Button>
                </Box>
              )}
              {rel && isOpen && !st && !errors[l.id] && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', px: 1, py: 0.75, pl: 4.5 }}>Reading…</Typography>}
              {rows.map((r) => (
                <PieceRow key={r.node.id} node={r.node} parent={r.node.parentId ? st?.byId.get(r.node.parentId) : undefined} depth={r.depth - 1}
                  open={r.open} busy={busy.has(r.node.id)} onToggle={(n) => void toggleNode(l.id, n)} onOpen={(n) => setDrawer({ id: n.id, lineId: l.id })} />
              ))}
            </Box>
          );
        })}
      </Box>
      <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', mt: 0.75 }}>Percentages are weighed by planned minutes where the flows carry them, otherwise by operations counted. Click a code to see its steps.</Typography>
      <PieceDrawer nodeId={drawer?.id ?? null} basisNote={null} onClose={() => setDrawer(null)} onChanged={drawer ? changed(drawer.lineId) : () => undefined} />
    </Box>
  );
}
