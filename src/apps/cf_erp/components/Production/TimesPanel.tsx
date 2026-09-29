import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, FormControlLabel, Switch, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { SheetGrid, type SheetCell, type SheetWrite } from '@shared/ui';
import { CfApiError } from '../../api/client';
import { getTimes, putTimes } from '../../api/production';
import type { TimeCell, TimeRow, TimesView, TimeWrite } from '../../api/types';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { ErrorNotice, SkeletonRows } from '../ui';
import { useTreeRows } from './treeRows';

const NONE: TimeRow[] = [];
/** Minutes with one decimal at most, and no trailing ".0". */
const minutes = (n: number) => String(Math.round(n * 10) / 10);
const hours = (m: number) => `${Math.round((m / 60) * 10) / 10} h`;
const TOTAL = 'total';

/** What one typed change would do to the same item elsewhere: the same value on the same operation. */
type Spread = { label: string; clear: boolean; cells: TimeWrite[] };

/**
 * Times: how long each operation takes on each BOM row, per piece. The formula
 * fills every box; typing over one is an override (strong, with a dot), and
 * clearing it gives the formula back. One idea, so no save button — an edit is
 * saved as it is made. Rows with no operation (raw materials, no flow) are
 * hidden until "Show all rows".
 */
export function TimesPanel({ orderId, lineId }: { orderId: number; lineId: number }) {
  const company = useCompanySlug();
  const canProduce = useIsPermitted()('cf_erp_production_manage');
  const load = useLoad(() => getTimes(orderId, lineId), [orderId, lineId]);
  const [view, setView] = useState<TimesView | null>(null);
  const [setup, setSetup] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [spread, setSpread] = useState<Spread | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { if (load.data) setView(load.data); }, [load.data]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => { setSpread(null); }, [lineId]);

  // Rows with a box, plus whatever leads down to one.
  const shown = useMemo(() => {
    const rows = view?.rows ?? NONE;
    if (showAll) return rows;
    const keep = new Set<string>();
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (keep.has(r.key) || Object.keys(r.cells).length) { keep.add(r.key); if (r.parentKey) keep.add(r.parentKey); }
    }
    return rows.filter((r) => keep.has(r.key));
  }, [view, showAll]);
  // Open far enough to see the assemblies: span → girder line → segment, deeper only if the boxes start deeper.
  const openDepth = useMemo(() => {
    const shallow = Math.min(3, ...shown.filter((r) => Object.keys(r.cells).length).map((r) => r.depth));
    return Math.min(3, Math.max(2, shallow));
  }, [shown]);
  const tree = useTreeRows(shown, { openDepth, resetKey: lineId });
  const operations = useMemo(() => {
    if (!view) return [];
    if (showAll) return view.operations;
    const used = new Set<string>();
    for (const r of shown) for (const k of Object.keys(r.cells)) used.add(k);
    return view.operations.filter((o) => used.has(String(o.id)));
  }, [view, shown, showAll]);
  const noRate = useMemo(() => {
    const names: string[] = [];
    for (const o of operations) if (shown.some((r) => { const c = r.cells[o.id]; return c && c.work == null; })) names.push(o.name);
    return names;
  }, [operations, shown]);

  if (load.error && !view) return <ErrorNotice error={load.error} onRetry={load.reload} />;
  if (!view) return <SkeletonRows rows={4} height={36} />;

  const editable = view.line.editable && canProduce && !view.line.released;
  const rowByKey = new Map(view.rows.map((r) => [r.key, r]));
  const cellOf = (row: TimeRow, opKey: string): TimeCell | undefined => row.cells[opKey];
  const rowMinutes = (row: TimeRow) => Object.values(row.cells).reduce((sum, c) => c.work == null ? sum : sum + ((c.setup ?? 0) + c.work * row.totalQty) * (c.passes ?? 1), 0);
  const field = setup ? 'setup' : 'work';

  const cellAt = (rowKey: string, colKey: string): SheetCell => {
    const row = rowByKey.get(rowKey);
    if (colKey === TOTAL) { const m = row ? rowMinutes(row) : 0; return { text: m ? hours(m) : '', tone: 'muted', editable: false, why: 'Setup plus work for every piece, added up.' }; }
    const c = row ? cellOf(row, colKey) : undefined;
    if (!row || !c) return { text: '', tone: 'blank' };
    const value = setup ? c.setup : c.work, formula = setup ? c.formulaSetup : c.formulaWork, over = setup ? c.setupOverridden : c.overridden;
    const why = !view.line.editable || view.line.released ? (view.line.why || 'Times are fixed at release.') : !canProduce ? 'Your role cannot change times.' : undefined;
    const lines = [c.machine ? `Machine: ${c.machine}` : null, over && formula != null ? `Formula says ${minutes(formula)}` : null, value == null ? c.missing || 'No time from the formula.' : null].filter(Boolean);
    return {
      text: value == null ? '' : minutes(value), input: value == null ? '' : minutes(value), kind: 'number',
      restore: over && value != null ? minutes(value) : '',
      editable, why, tone: over ? 'strong' : 'muted', title: lines.join(' · ') || undefined,
      mark: over ? <Box component="span" sx={{ display: 'block', width: 6, height: 6, borderRadius: '50%', background: 'var(--c-primary-600)' }} /> : undefined,
    };
  };

  /** The same item on other rows (hidden ones too), same operation, only where it is in their flow and would change. */
  const spreadOf = (typed: { row: TimeRow; opId: number; n: number | null }[]): Spread | null => {
    const cells = new Map<string, TimeWrite>();
    const others = new Set<string>();
    const names = new Set<string>();
    for (const { row, opId, n } of typed) {
      if (row.itemId == null) continue;
      for (const o of view.rows) {
        if (o.key === row.key || o.itemId !== row.itemId) continue;
        const c = o.cells[opId];
        if (!c) continue;
        const now = setup ? c.setup : c.work, over = setup ? c.setupOverridden : c.overridden;
        if (n == null ? !over : over && now != null && Math.abs(now - n) < 1e-9) continue;
        cells.set(`${o.key}:${opId}`, { bomLineId: o.bomLineId, operationId: opId, [field]: n });
        others.add(o.key); names.add(row.name);
      }
    }
    if (!cells.size) return null;
    const clear = typed.every((t) => t.n == null), k = others.size;
    const what = names.size === 1 ? `${[...names][0]} rows` : 'rows of the same item';
    return { clear, cells: [...cells.values()], label: clear ? `Clear on the ${k} other ${what} too` : `Apply to the ${k} other ${what}` };
  };

  const save = (cells: TimeWrite[], after?: () => void) => {
    setProblem(null);
    // One save at a time, in the order they were made, so a slow reply never overwrites a newer one.
    queue.current = queue.current.then(async () => {
      try {
        setView(await putTimes(orderId, lineId, cells));
        after?.();
        setSaved(true); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setSaved(false), 2500);
      } catch (e) {
        setProblem(e instanceof CfApiError ? e.message : 'Could not save that.');
        load.reload();
      }
    });
  };

  const onWrites = (writes: SheetWrite[]) => {
    const cells: TimeWrite[] = [];
    const typed: { row: TimeRow; opId: number; n: number | null }[] = [];
    for (const w of writes) {
      const row = rowByKey.get(w.rowKey);
      if (!row || w.colKey === TOTAL) continue;
      const t = w.text.trim().replace(',', '.');
      const n = t === '' ? null : Number(t);
      if (n !== null && (!Number.isFinite(n) || n < 0)) { setProblem(`“${w.text}” is not a number of minutes.`); return; }
      cells.push({ bomLineId: row.bomLineId, operationId: Number(w.colKey), [field]: n });
      typed.push({ row, opId: Number(w.colKey), n });
    }
    if (!cells.length) return;
    const next = spreadOf(typed);
    setSpread(null);
    save(cells, () => setSpread(next));
  };

  const grand = view.totals.all;
  const head = (name: string, m: number | undefined) => (
    <Box sx={{ lineHeight: 1.2 }}>
      <Box component="span" sx={{ display: 'block' }}>{name}</Box>
      <Box component="span" sx={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--c-text-3)' }}>{m ? hours(m) : ' '}</Box>
    </Box>
  );
  const hiddenCount = view.rows.length - shown.length;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', minHeight: 36 }}>
        <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)', flex: '1 1 260px' }}>
          {view.line.released
            ? 'Times are fixed at release — they are on the production steps now.'
            : `${setup ? 'Setup minutes, once per run.' : 'Work minutes per piece.'} Grey is the formula; type over a box to change it, clear it to go back.`}
        </Typography>
        {saved && <Typography role="status" sx={{ fontSize: 12.5, color: 'var(--c-success-800)' }}>Saved</Typography>}
        {(hiddenCount > 0 || showAll) && <FormControlLabel control={<Switch size="small" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />}
          label={<Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Show all rows</Typography>} sx={{ mr: 0 }} />}
        <FormControlLabel control={<Switch size="small" checked={setup} onChange={(e) => setSetup(e.target.checked)} />}
          label={<Typography sx={{ fontSize: 13 }}>Show setup</Typography>} sx={{ mr: 0 }} />
      </Box>
      {!view.line.released && !view.line.editable && view.line.why && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{view.line.why}</Typography>}
      {noRate.length > 0 && (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
          <Tooltip title={noRate.join(', ')}><Box component="span">{noRate.length} {noRate.length === 1 ? 'operation has' : 'operations have'} no rate yet</Box></Tooltip>
          {' — set them in '}<Link to={appPath(company, 'operations')}>Operations</Link>
        </Typography>
      )}
      {spread && (
        <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 13, color: 'var(--c-text-2)' }}>
          <Button size="small" onClick={() => { const cells = spread.cells; setSpread(null); save(cells); }}>{spread.label}</Button>
          <Button size="small" color="inherit" onClick={() => setSpread(null)} sx={{ color: 'var(--c-text-3)' }}>Dismiss</Button>
        </Box>
      )}
      <ErrorNotice error={load.error} onRetry={load.reload} />
      {view.operations.length === 0
        ? <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Nothing on this line has a flow yet, so there are no operations to time.</Typography>
        : <SheetGrid ariaLabel="Times" cornerHeader="Piece" rowHeaderWidth={300} busy={load.loading} onProblem={setProblem} hint={null} historyKey={`${lineId}:${setup}`}
          columns={[
            ...operations.map((o) => ({ key: String(o.id), label: o.name, header: head(o.name, view.totals.byOperation[o.id]), width: 110, align: 'right' as const })),
            { key: TOTAL, label: 'Total', header: head('Total', grand), width: 90, align: 'right' as const },
          ]}
          rows={tree.visible.map((r) => ({
            key: r.key, label: r.name, depth: r.depth, collapsible: tree.hasChildren(r.key), collapsed: tree.isCollapsed(r.key),
            header: <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }}>
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.flowName ? `Flow: ${r.flowName}` : undefined}>{r.name}</Box>
              {r.totalQty > 1 && <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 11, flexShrink: 0 }}>×{r.totalQty}</Box>}
            </Box>,
          }))}
          cellAt={cellAt} onWrites={onWrites} onToggleRow={tree.toggle} rowSelect={tree.subtree} />}
      {problem && <Typography role="alert" sx={{ fontSize: 13, color: 'var(--c-danger-800)' }}>{problem}</Typography>}
    </Box>
  );
}
