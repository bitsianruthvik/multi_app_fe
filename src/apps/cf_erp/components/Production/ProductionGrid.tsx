import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, MenuItem, Select, Typography } from '@mui/material';
import { SheetGrid, type SheetCell } from '@shared/ui';
import { CfApiError } from '../../api/client';
import { getGridChildren, getLineGrid, type GridRow, type LineGridResponse } from '../../api/trackerGrid';
import {
  GRID_TONE, codePrefix, emptyGrid, gridCellState, gridCellText, gridCellTitle, gridFromNodes, gridNeedsChildren, isOwn,
  mergeGridBranch, naTitle, openBeyond, openGridToLevel, opHeadPct, rollupTint, visibleGridRows, type GridState,
} from '../../lib/trackerGrid';
import { pctText } from '../../lib/trackerTree';
import { ErrorNotice, Mono, SkeletonRows } from '../ui';
import { CompletionBar, OpLegend } from '../Tracker/TreeParts';
import { PieceDrawer } from '../Tracker/PieceDrawer';

const PCT = 'pct';
/** How far the grid opens when it first arrives: the line and its top pieces, so the level under them shows. */
const OPEN_LEVEL = 2;
/** What the server sends without being asked for more (trackerTreeService GRID_DEFAULT_DEPTH). */
const DEFAULT_DEPTH = 2;
const LEVELS = [1, 2, 3, 4];
const ALL = 50;

/** The code in full, the part the parent already says stepped back. */
function CodeCell({ row, parent }: { row: GridRow; parent: GridRow | undefined }) {
  const prefix = codePrefix(row, parent);
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }} title={`${row.code}${row.name ? ` — ${row.name}` : ''}`}>
      <Mono sx={{ fontSize: 12, color: 'var(--c-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flexShrink: 1 }}>
        {prefix && <Box component="span" data-testid="code-prefix" sx={{ color: 'var(--c-text-3)' }}>{prefix}</Box>}
        <Box component="span" data-testid="code-own" sx={{ fontWeight: row.kind === 'line' ? 700 : 600 }}>{row.code.slice(prefix.length)}</Box>
      </Mono>
      {row.name && (
        <Box component="span" sx={{ fontSize: 11.5, color: 'var(--c-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 2, minWidth: 0 }}>
          {row.name}{row.kind === 'piece' && row.qty && row.qty !== 1 ? ` ×${row.qty}` : ''}
        </Box>
      )}
      {row.blockedCount > 0 && (
        <Box component="span" data-testid="row-blocked" title={[row.blockedAt ? `First: ${row.blockedAt}` : null, row.blockedReason].filter(Boolean).join(' — ')}
          sx={{ flexShrink: 0, fontSize: 11, color: 'var(--c-danger-700)', fontWeight: 500 }}>
          {row.childCount > 0 ? `${row.blockedCount} blocked` : 'blocked'}
        </Box>
      )}
    </Box>
  );
}

/**
 * Production › Tracker on an order line, as a grid (user, 2026-10-01): the
 * frozen piece codes down the left — line › span › girder line › segment ›
 * parts, the code in full — and the line's operations across in flow order,
 * like Times and Contractors. A cell is that piece's step for that operation
 * (✓ done, 2/6 partly, ▸ running, ! blocked with the reason on hover, a dot
 * not started, hatched where the operation is not in its flow); a row above
 * shows how much of each operation under it is done. Click a cell for the
 * piece's steps and their actions. A big line comes a branch at a time.
 */
export function ProductionGrid({ lineId, canAct, onChanged }: {
  lineId: number;
  /** May start / record / hold / resume here (production permission and a confirmed order). */
  canAct: boolean;
  /** Work was recorded: the caller's figures (the release header) are stale. */
  onChanged?: () => void;
}) {
  const [resp, setResp] = useState<LineGridResponse | null>(null);
  const [tree, setTree] = useState<GridState>(emptyGrid);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [level, setLevel] = useState(OPEN_LEVEL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<CfApiError | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<{ nodeId: string; focus: number[] } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const live = useRef({ tree, open });
  live.current = { tree, open };

  const fail = (e: unknown) => setError(e instanceof CfApiError ? e : new CfApiError(0, String(e)));

  // The first read, and a new "open to level": the server sends that many levels, all opened.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getLineGrid(lineId, { depth: level > DEFAULT_DEPTH ? level : undefined })
      .then((r) => {
        if (!alive) return;
        const t = gridFromNodes(r.nodes);
        setResp(r);
        setTree(t);
        setOpen(openGridToLevel(t, level));
        setError(null);
      })
      .catch((e) => { if (alive) fail(e); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [lineId, level, tick]);

  /** After work is recorded: everything on screen again, in ONE read (the open branches ride along). */
  const refresh = useCallback(async () => {
    const { tree: t, open: o } = live.current;
    try {
      const r = await getLineGrid(lineId, { depth: level > DEFAULT_DEPTH ? level : undefined, open: openBeyond(t, o, Math.max(level, DEFAULT_DEPTH)) });
      setResp(r);
      setTree(gridFromNodes(r.nodes));
    } catch (e) { fail(e); }
  }, [lineId, level]);

  const toggle = useCallback(async (id: string) => {
    const { tree: t, open: o } = live.current;
    const n = t.byId.get(id);
    if (!n) return;
    if (o.has(id) && t.loaded.has(id)) { setOpen((s) => { const x = new Set(s); x.delete(id); return x; }); return; }
    if (gridNeedsChildren(t, n)) {
      setBusy((s) => new Set(s).add(id));
      try {
        const r = await getGridChildren(id, 1);
        setTree((cur) => mergeGridBranch(cur, id, r.node, r.nodes));
      } catch (e) { fail(e); return; } finally {
        setBusy((s) => { const x = new Set(s); x.delete(id); return x; });
      }
    }
    setOpen((s) => new Set(s).add(id));
  }, []);

  const rows = useMemo(() => visibleGridRows(tree, open), [tree, open]);
  const ops = useMemo(() => resp?.operations ?? [], [resp]);
  const opName = useMemo(() => new Map(ops.map((o) => [String(o.id), o.name])), [ops]);

  const cellAt = (rowKey: string, colKey: string): SheetCell => {
    const row = tree.byId.get(rowKey);
    if (!row) return { text: '', tone: 'blank' };
    if (colKey === PCT) {
      return { text: pctText(row.completion), tone: 'muted', ink: row.completion != null && row.completion >= 1 ? GRID_TONE.done.ink : undefined,
        title: `${pctText(row.completion)} of the work ${row.childCount ? 'on and under' : 'on'} ${row.code} is done${row.weight === 'minutes' ? ' (by planned minutes)' : row.weight === 'count' ? ' (by operations)' : ''}` };
    }
    const c = row.cells[colKey];
    const name = opName.get(colKey) ?? 'This operation';
    if (!c) return { text: '', applies: false, why: naTitle(name, row.code, row.childCount === 0) };
    const state = gridCellState(c);
    return {
      text: gridCellText(c),
      state: isOwn(c) ? c.state : `rollup-${state}`,
      tint: isOwn(c) ? GRID_TONE[c.state].tint : rollupTint(c.done, c.total),
      ink: isOwn(c) && c.state === 'todo' && c.ready ? 'var(--c-success-700)' : GRID_TONE[state].ink,
      tone: isOwn(c) ? 'strong' : 'muted',
      title: gridCellTitle(c, name, row.code),
    };
  };

  const openDrawer = (row: GridRow, focus: number[]) => setDrawer({ nodeId: row.id, focus });
  const onCellClick = (rowKey: string, colKey: string) => {
    const row = tree.byId.get(rowKey);
    if (!row || row.kind !== 'piece') return;
    const c = colKey === PCT ? null : row.cells[colKey];
    if (colKey !== PCT && !c) return;                      // hatched: nothing to open
    if (c && isOwn(c)) { openDrawer(row, c.stepIds); return; }
    // A gathered cell (or the % column): what it counts is under the row — open it; a piece with steps of its own shows them.
    if (row.childCount > 0 && !open.has(row.id)) { void toggle(row.id); return; }
    if (row.ownSteps) openDrawer(row, []);
  };

  if (error && !resp) return <ErrorNotice error={error} onRetry={() => setTick((t) => t + 1)} />;
  if (!resp) return <SkeletonRows rows={6} height={32} />;
  if (!resp.released) return <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>This line is not released, so nothing is tracked yet.</Typography>;
  const s = resp.summary;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.25, minWidth: 0 }} data-testid="production-grid">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, md: 2.5 }, flexWrap: 'wrap' }}>
        {s && (
          <>
            <Box>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 0.25 }}>Done</Typography>
              <CompletionBar value={s.completion} width={120} title={s.weight === 'minutes' ? 'Weighed by planned minutes' : 'Counted by operations (not every step has planned minutes)'} />
            </Box>
            <Fig label="Operations done" value={`${s.stepsDone.toLocaleString()} of ${s.steps.toLocaleString()}`} />
            <Fig label="Ready to start" value={s.ready.toLocaleString()} />
            <Fig label="Running now" value={s.runningSteps.toLocaleString()} />
            <Fig label="Pieces blocked" value={s.blockedPieces.toLocaleString()} danger={s.blockedPieces > 0} />
          </>
        )}
        <Box sx={{ flex: '1 1 auto' }} />
        <Select size="small" value={level} onChange={(e) => setLevel(Number(e.target.value))} sx={{ height: 32, fontSize: 13 }} inputProps={{ 'aria-label': 'Open to level' }}>
          {LEVELS.map((l) => <MenuItem key={l} value={l}>Open to level {l}</MenuItem>)}
          <MenuItem value={ALL}>Open every level</MenuItem>
        </Select>
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <OpLegend />
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <Box component="span" aria-hidden sx={{ width: 20, height: 18, borderRadius: '5px', border: '1px solid var(--c-border)', background: 'var(--c-surface-3)', backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, var(--c-text-3) 22%, transparent) 4px 5px)' }} />
          <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Not in its flow</Typography>
        </Box>
        <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>· A row with pieces under it shows how much of each operation below is done.</Typography>
      </Box>
      <ErrorNotice error={error} onRetry={() => { setError(null); void refresh(); }} />
      {ops.length === 0
        ? <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Nothing on this line has a step — it is bought in, so only its material is tracked.</Typography>
        : (
          <Box sx={{ opacity: loading ? 0.6 : 1, transition: 'opacity var(--t-fast) var(--ease)' }}>
            <SheetGrid ariaLabel="Production by piece and operation" cornerHeader="Piece" rowHeaderWidth={400} rowHeight={30} hint={null} narrowReadOnly={false}
              busy={loading || busy.size > 0} onProblem={setProblem} historyKey={String(lineId)}
              columns={[
                { key: PCT, label: 'Done', header: 'Done', width: 62, align: 'right' as const },
                ...ops.map((o) => ({
                  key: String(o.id), label: o.name, width: 92, align: 'left' as const,
                  header: (
                    <Box sx={{ lineHeight: 1.2 }} title={`${o.name}${o.code ? ` (${o.code})` : ''} — ${o.done} of ${o.total} done on this line`}>
                      <Box component="span" sx={{ display: 'block', whiteSpace: 'normal', fontSize: 11.5 }}>{o.name}</Box>
                      <Box component="span" sx={{ display: 'block', fontSize: 10.5, fontWeight: 400, color: 'var(--c-text-3)' }}>{opHeadPct(o)}</Box>
                    </Box>
                  ),
                })),
              ]}
              rows={rows.map(({ row, depth, open: isOpen, hasChildren }) => ({
                key: row.id, depth, label: row.code, collapsible: hasChildren, collapsed: hasChildren ? !isOpen : undefined,
                header: <CodeCell row={row} parent={row.parentId ? tree.byId.get(row.parentId) : undefined} />,
              }))}
              cellAt={cellAt} onToggleRow={(k) => { void toggle(k); }} onCellClick={onCellClick} />
          </Box>
        )}
      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
        {canAct ? 'Click a cell to see that piece’s steps — start, record, hold or resume them there.' : 'Click a cell to see that piece’s steps. Your role, or the order’s status, does not allow recording work here.'}
        {resp.returned < resp.total ? ` ${resp.total.toLocaleString()} pieces in all — open a row for what is under it.` : ''}
      </Typography>
      {problem && <Typography role="status" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{problem}</Typography>}
      <PieceDrawer nodeId={drawer?.nodeId ?? null} focusStepIds={drawer?.focus} readOnly={!canAct} basisNote={resp.basisNote}
        onClose={() => setDrawer(null)} onChanged={() => { void refresh(); onChanged?.(); }} />
    </Box>
  );
}

function Fig({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{label}</Typography>
      <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: danger ? 'var(--c-danger-700)' : 'var(--c-text)' }}>{value}</Typography>
    </Box>
  );
}
