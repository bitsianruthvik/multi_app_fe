import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, IconButton, Switch, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import { autoPlan, canPlace, evaluate, feedback } from '../lib/planner';
import { periodContaining } from '../lib/planner/periods';
import type { AutoPlanResult, Plan as PlanMap, PlannerSnapshot, PlannerUnit } from '../lib/planner/types';
import { getPlanner, putEntries, putLevel, putPriorities, putSettings, putTargets, type EntryWrite } from '../api/planner';
import { CfApiError } from '../api/client';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { appPath } from '../navMeta';
import { toastMessage } from '../components/Plan/toastMessage';
import { useToast } from '../components/toastContext';
import { EmptyState, ErrorNotice, PageHeader, SkeletonRows } from '../components/ui';
import { AutoPlanBanner } from '../components/Plan/AutoPlanBanner';
import { Board, type HoverInfo } from '../components/Plan/Board';
import { OrdersRail } from '../components/Plan/OrdersRail';
import { Scoreboard } from '../components/Plan/Scoreboard';
import { UnitSheet } from '../components/Plan/UnitSheet';
import { dropLine, unitMap } from '../components/Plan/model';

const SAVE_DELAY = 700;
const HOVER_EVERY = 100;

/** The snapshot's saved entries as a plan; entries outside the horizon are left alone. */
function planFrom(s: PlannerSnapshot): PlanMap {
  const out: PlanMap = {};
  const periods = s.horizon.periods;
  for (const [k, e] of Object.entries(s.entries ?? {})) {
    const i = periodContaining(periods, e.shipDate);
    if (i >= 0 && i < periods.length) out[k] = { period: periods[i].key, pinned: !!e.pinned };
  }
  return out;
}

/**
 * Production › Plan: what ships when, for this month and the next two. Orders are
 * ranked on the left, the board shows one card per thing to ship, the strip at the
 * bottom shows how busy each function is. Every move is checked and re-scored at
 * once, and saved by itself.
 */
export default function Plan() {
  const company = useCompanySlug();
  const toast = useToast();
  const canEdit = useIsPermitted()('cf_erp_production_manage');
  const load = useLoad(() => getPlanner(), []);
  const [snap, setSnap] = useState<PlannerSnapshot | null>(null);
  const [plan, setPlan] = useState<PlanMap>({});
  const [preview, setPreview] = useState<AutoPlanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saved = useRef<PlanMap>({});
  const latest = useRef({ snap, plan });
  latest.current = { snap, plan };
  const hoverTimer = useRef<number | undefined>(undefined);
  const hoverLast = useRef(0);
  const hoverAt = useRef<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!load.data) return;
    setSnap(load.data);
    const p = planFrom(load.data);
    setPlan(p);
    saved.current = p;
  }, [load.data]);
  useEffect(() => () => { window.clearTimeout(hoverTimer.current); window.clearTimeout(saveTimer.current); }, []);

  const units = useMemo(() => (snap ? unitMap(snap) : new Map<string, PlannerUnit>()), [snap]);
  const unitLines = useMemo(() => new Map([...units].map(([k, u]) => [k, String(u.lineId)])), [units]);
  const evaluation = useMemo(() => (snap ? evaluate(snap, plan) : null), [snap, plan]);
  const previewEval = useMemo(() => (snap && preview ? evaluate(snap, preview.plan) : null), [snap, preview]);
  const shown = previewEval ?? evaluation;
  const months = useMemo(() => [...new Set((snap?.horizon.periods ?? []).map((p) => p.month))], [snap]);
  const periodLabels = useMemo(() => new Map((snap?.horizon.periods ?? []).map((p) => [p.key, p.label])), [snap]);

  // Autosave: the difference between what the server has and what is on the board.
  useEffect(() => {
    if (!snap || !canEdit) return;
    const periods = new Map(snap.horizon.periods.map((p) => [p.key, p.start]));
    const changes: EntryWrite[] = [];
    for (const [k, e] of Object.entries(plan)) {
      const was = saved.current[k];
      if (!was || was.period !== e.period || was.pinned !== e.pinned) changes.push({ unitKey: k, shipDate: periods.get(e.period) ?? null, pinned: e.pinned });
    }
    for (const k of Object.keys(saved.current)) if (!plan[k]) changes.push({ unitKey: k, shipDate: null, pinned: false });
    if (!changes.length) return;
    window.clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = window.setTimeout(() => {
      const sent = latest.current.plan;
      putEntries(changes)
        .then(() => { saved.current = sent; setSaveState('saved'); })
        .catch((e) => { setSaveState('idle'); toast.error(e instanceof CfApiError ? e.message : 'Could not save the plan.'); });
    }, SAVE_DELAY);
  }, [plan, snap, canEdit, toast]);

  const fail = useCallback((e: unknown) => toast.error(e instanceof CfApiError ? e.message : 'Could not save that.'), [toast]);

  // ── moves ──
  const clearHover = useCallback(() => { window.clearTimeout(hoverTimer.current); hoverAt.current = null; setHover(null); setDragKey(null); }, []);

  const onHover = useCallback((key: string, period: string) => {
    if (hoverAt.current === period) return;
    hoverAt.current = period;
    window.clearTimeout(hoverTimer.current);
    const wait = Math.max(0, HOVER_EVERY - (Date.now() - hoverLast.current));
    hoverTimer.current = window.setTimeout(() => {
      const { snap: s, plan: p } = latest.current;
      if (!s) return;
      hoverLast.current = Date.now();
      const check = canPlace(s, p, key, period);
      const ev = evaluate(s, { ...p, [key]: { period, pinned: true } });
      setHover({ key, period, ok: check.ok, reason: check.reason, load: ev.load });
    }, wait);
  }, []);

  const onDrop = useCallback((key: string, period: string | null) => {
    const { snap: s, plan: p } = latest.current;
    clearHover();
    if (!s || !evaluation) return;
    if (period == null) {
      if (!p[key]) return;
      const next = { ...p }; delete next[key];
      setPlan(next);
      toastMessage(toast, feedback(evaluation, evaluate(s, next)), 'Taken off the plan');
      return;
    }
    if (p[key]?.period === period) return;
    const check = canPlace(s, p, key, period);
    if (!check.ok) { toast.error(check.reason ?? 'It cannot go there.'); return; }
    const next = { ...p, [key]: { period, pinned: true } };
    setPlan(next);
    toastMessage(toast, feedback(evaluation, evaluate(s, next)), 'Moved');
  }, [clearHover, evaluation, toast]);

  const onPin = useCallback((key: string, pinned: boolean) => setPlan((p) => (p[key] ? { ...p, [key]: { ...p[key], pinned } } : p)), []);
  const onUnplan = useCallback((key: string) => setPlan((p) => { const n = { ...p }; delete n[key]; return n; }), []);

  // ── auto-plan ──
  function runAutoPlan() {
    if (!snap || !evaluation) return;
    setBusy(true);
    window.setTimeout(() => {
      try {
        const r = autoPlan(snap, plan, {});
        setPreview(r);
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not make a plan.'); }
      setBusy(false);
    }, 20);
  }
  const previewLines = useMemo(() => (preview && evaluation && previewEval ? [...preview.notes, ...feedback(evaluation, previewEval)] : []), [preview, evaluation, previewEval]);
  function applyPreview() { if (preview) { setPlan(preview.plan); setPreview(null); } }

  // ── writes that are not entries ──
  function setTarget(month: string, value: number) {
    setSnap((s) => (s ? { ...s, targets: { ...s.targets, [month]: value } } : s));
    putTargets({ [month]: value }).catch((e) => { fail(e); load.reload(); });
  }
  function setMinLines(n: number) {
    setSnap((s) => (s ? { ...s, settings: { ...s.settings, minLinesPerMonth: n } } : s));
    putSettings({ minLinesPerMonth: n }).catch((e) => { fail(e); load.reload(); });
  }
  function reorder(ids: (number | string)[]) {
    const rank = new Map(ids.map((id, i) => [String(id), i + 1]));
    setSnap((s) => (s ? { ...s, orders: [...s.orders].sort((a, b) => rank.get(String(a.id))! - rank.get(String(b.id))!).map((o) => ({ ...o, priority: rank.get(String(o.id))! })) } : s));
    putPriorities(ids).catch((e) => { fail(e); load.reload(); });
  }
  function setLevel(lineId: number | string, level: string) {
    setPreview(null);
    setSnap((s) => (s ? { ...s, orders: s.orders.map((o) => ({ ...o, lines: o.lines.map((l) => (String(l.id) === String(lineId) ? { ...l, level } : l)) })) } : s));
    setPlan((p) => dropLine(p, units, lineId));
    putLevel(lineId, level).catch((e) => { fail(e); load.reload(); });
  }

  // ── render ──
  if (load.error && !snap) return <Box><PageHeader title="Plan" /><ErrorNotice error={load.error} onRetry={load.reload} /></Box>;
  if (!snap || !shown || !evaluation) return <Box><PageHeader title="Plan" /><SkeletonRows rows={5} height={56} /></Box>;

  const editable = canEdit && !preview;
  const minLines = snap.settings.minLinesPerMonth;
  const hasMarks = snap.units.some((u) => u.isMark);
  const open = openKey ? units.get(openKey) ?? null : null;

  if (snap.orders.length === 0) {
    return (
      <Box>
        <PageHeader title="Plan" subtitle="What ships when, this month and the next two." />
        <EmptyState icon={<CalendarMonthRounded />} title="Nothing to plan yet" hint={<>Confirm an order in <Link to={appPath(company, 'orders')}>Sales</Link> and it shows up here.</>} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <PageHeader title="Plan" subtitle="What ships when, this month and the next two."
        actions={(
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Typography aria-live="polite" sx={{ fontSize: 12.5, color: 'var(--c-text-3)', minWidth: 48 }}>
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
            </Typography>
            {canEdit && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 13 }}>
                <Switch size="small" checked={minLines > 0} onChange={(_, on) => setMinLines(on ? 1 : 0)} inputProps={{ 'aria-label': 'Ship at least some lines every month' }} />
                <span>Ship at least</span>
                <IconButton size="small" aria-label="One less" disabled={minLines <= 1} onClick={() => setMinLines(minLines - 1)}><RemoveRounded sx={{ fontSize: 16 }} /></IconButton>
                <b style={{ minWidth: 14, textAlign: 'center', opacity: minLines > 0 ? 1 : 0.4 }}>{Math.max(minLines, 1)}</b>
                <IconButton size="small" aria-label="One more" disabled={minLines < 1} onClick={() => setMinLines(minLines + 1)}><AddRounded sx={{ fontSize: 16 }} /></IconButton>
                <span>{minLines === 1 ? 'line' : 'lines'} a month</span>
              </Box>
            )}
            {canEdit && <Button variant="contained" startIcon={<AutoAwesomeRounded />} disabled={busy || !!preview} onClick={runAutoPlan}>{busy ? 'Planning…' : 'Auto-plan'}</Button>}
          </Box>
        )} />

      {!hasMarks && (
        <Box sx={{ p: 1.25, borderRadius: '10px', background: 'var(--c-info-50)', color: 'var(--c-info-800)', fontSize: 13 }}>
          Tick “Ships as one unit” on the template that leaves the gate (for example Girder segment) in{' '}
          <Link to={appPath(company, 'definitions')}>Definitions</Link>, so lines can be counted as shipped.
        </Box>
      )}

      <Scoreboard months={months} evaluation={shown} targets={snap.targets} canEdit={editable} onTarget={setTarget} />

      {preview && <AutoPlanBanner lines={previewLines} buyListPath={appPath(company, 'buy-list')} onApply={applyPreview} onDiscard={() => setPreview(null)} />}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '280px minmax(0, 1fr)' }, gap: 1.5, alignItems: 'start' }}>
        <OrdersRail orders={snap.orders} evaluation={shown} unitLines={unitLines} canEdit={editable} onReorder={reorder} onLevel={setLevel} />
        <Board snapshot={snap} evaluation={shown} units={units} canEdit={editable} dragKey={dragKey} hover={hover} selectedKey={openKey}
          onOpen={setOpenKey} onDragStart={setDragKey} onDragEnd={clearHover} onHover={onHover} onDrop={onDrop} />
      </Box>

      <UnitSheet unit={open} snapshot={snap} evaluation={shown} periodLabel={(k) => periodLabels.get(k) ?? k} canEdit={editable}
        buyListPath={appPath(company, 'buy-list')} onClose={() => setOpenKey(null)} onUnplan={onUnplan} onPin={onPin} />
    </Box>
  );
}
