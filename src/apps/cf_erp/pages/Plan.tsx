import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Box, Button, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import RedoRounded from '@mui/icons-material/RedoRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import {
  areaUsage, autoPlan, cellDrivers, entriesDiff, evaluate, feedback, functionUsage, machineAreas, workingFunctions, planFromEntries,
  dragTo, rankChanges, rankLine, refusedMoves, reorderKeys, shiftBy, stretchTo, unitPriority, unplan,
} from '../lib/planner';
import type { AutoPlanResult, Evaluation, Plan as PlanMap, PlannerSnapshot, PlannerUnit, UsageRow } from '../lib/planner';
import { getPlanner, putChanges, refusedUnits, putLevel, putLineSplit, putPriorities, putTargets } from '../api/planner';
import { CfApiError } from '../api/client';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { appPath } from '../navMeta';
import { toastMessage } from '../components/Plan/toastMessage';
import { useToast } from '../components/toastContext';
import { EmptyState, ErrorNotice, PageHeader, SkeletonRows } from '../components/ui';
import { AutoPlanBanner } from '../components/Plan/AutoPlanBanner';
import { Scoreboard } from '../components/Plan/Scoreboard';
import { UnitSheet } from '../components/Plan/UnitSheet';
import { PlanGrid, type DragInfo } from '../components/Plan/PlanGrid';
import { UsagePanel, type CellRef } from '../components/Plan/UsagePanel';
import { HEAD_H, ROW_H, useGeometry } from '../components/Plan/geometry';
import { commit, redo, startHistory, undo, type History, type PlanDoc } from '../components/Plan/history';
import { EXPAND_ALL, buildRows, childIndex, loadExpand, maxTreeDepth, saveExpand, toLevel, toggle, type ExpandState, type TreeRow } from '../components/Plan/tree';
import { dropLine, hoursText, shortCode, unitMap } from '../components/Plan/model';

const MAX_NOTES = 4;

/** Is the key press meant for a text box (then the page's shortcuts stay out of it)? */
const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

/** Height of the plan's body that is not under the sticky header or the usage panel. */
const bodyHeight = (el: HTMLElement) => (el.clientHeight || 0) - HEAD_H - ((el.querySelector('[data-testid="usage-panel"]') as HTMLElement | null)?.offsetHeight ?? 0);

/** Periods a unit's lead covers in an evaluation (start..ship), as keys. */
function leadPeriods(s: PlannerSnapshot, ev: Evaluation, key: string): string[] {
  const u = ev.units[key];
  if (!u?.period || !u.leadStart) return [];
  const ps = s.horizon.periods;
  const a = ps.findIndex((p) => p.key === u.leadStart), b = ps.findIndex((p) => p.key === u.period);
  return a < 0 || b < 0 ? [] : ps.slice(a, b + 1).map((p) => p.key);
}

/**
 * Production › Plan: what ships when, this month and the next two. The plan is a tree —
 * order › line › the units it schedules (girder lines, segments …) › what is inside them — with the
 * weeks to the right. Drag a bar to another week, drag the grip to change a unit's place in its
 * line, select several (Shift / Ctrl-click) and move them together, or use the arrow keys. Every
 * move is scored at once (machine-area usage at the bottom, warnings beside the pointer) and
 * kept on the page until Save; Ctrl+Z / Ctrl+Y undo and redo.
 */
export default function Plan() {
  const company = useCompanySlug();
  const toast = useToast();
  const canEdit = useIsPermitted()('cf_erp_production_manage');
  const load = useLoad(() => getPlanner(), []);
  const [snap, setSnap] = useState<PlannerSnapshot | null>(null);
  const [hist, setHist] = useState<History | null>(null);
  const [saved, setSaved] = useState<PlanDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<AutoPlanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [splitBusy, setSplitBusy] = useState(false);
  /** The server refused a save for material: what it said, until dismissed. */
  const [refusal, setRefusal] = useState<{ message: string; problems: string[] } | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ trial: PlanMap; info: DragInfo } | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const selAnchor = useRef<string | null>(null);
  const [highlight, setHighlight] = useState<{ label: string; keys: Set<string>; cell: CellRef } | null>(null);
  const storeKey = `cf_erp.plan.tree.${company}`;
  const [expand, setExpand] = useState<ExpandState>(() => loadExpand(storeKey));
  const [usageCollapsed, setUsageCollapsed] = useState(() => { try { return window.localStorage.getItem(`${storeKey}.usage`) === 'closed'; } catch { return false; } });
  const [levelMenu, setLevelMenu] = useState<HTMLElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!load.data) return;
    const doc: PlanDoc = { plan: planFromEntries(load.data), ranks: { ...(load.data.ranks ?? {}) } };
    setSnap(load.data);
    setHist(startHistory(doc));
    setSaved(doc);
    setDrag(null);
    setPreview(null);
  }, [load.data]);
  useEffect(() => saveExpand(storeKey, expand), [storeKey, expand]);
  useEffect(() => { try { window.localStorage.setItem(`${storeKey}.usage`, usageCollapsed ? 'closed' : 'open'); } catch { /* not remembered */ } }, [storeKey, usageCollapsed]);

  const present = hist?.present ?? null;
  /** the snapshot with the page's (unsaved) unit order — the engine reads ranks from it */
  const view = useMemo(() => (snap && present ? { ...snap, ranks: present.ranks } : null), [snap, present?.ranks]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = useMemo(() => present?.plan ?? {}, [present]);
  const units = useMemo(() => (snap ? unitMap(snap) : new Map<string, PlannerUnit>()), [snap]);
  const children = useMemo(() => (snap ? childIndex(snap) : new Map<string, PlannerUnit[]>()), [snap]);
  const prio = useMemo(() => (view ? unitPriority(view) : new Map<string, number>()), [view]);
  const evaluation = useMemo(() => (view ? evaluate(view, plan) : null), [view, plan]);
  const trialEval = useMemo(() => (view && drag ? evaluate(view, drag.trial) : null), [view, drag]);
  const previewEval = useMemo(() => (view && preview ? evaluate(view, preview.plan) : null), [view, preview]);
  const shown = trialEval ?? previewEval ?? evaluation;
  const months = useMemo(() => [...new Set((snap?.horizon.periods ?? []).map((p) => p.month))], [snap]);
  const periodLabels = useMemo(() => new Map((snap?.horizon.periods ?? []).map((p) => [p.key, p.label])), [snap]);
  const orderCode = useMemo(() => new Map((snap?.orders ?? []).map((o) => [String(o.id), o.code])), [snap]);
  const codeOf = useCallback((k: string) => { const u = units.get(k); return u ? shortCode(u, orderCode.get(String(u.orderId))) : k; }, [units, orderCode]);

  const areaSet = useMemo(() => machineAreas(snap?.functions ?? [], snap ? workingFunctions(snap) : undefined), [snap]);
  const usage = useMemo(() => (view && shown ? areaUsage(view, shown, areaSet) : []), [view, shown, areaSet]);
  const baseUsage = useMemo(() => (view && evaluation ? areaUsage(view, evaluation, areaSet) : []), [view, evaluation, areaSet]);
  const rows = useMemo(() => (snap && shown ? buildRows(snap, shown, prio, children, expand) : []), [snap, shown, prio, children, expand]);
  const maxDepth = useMemo(() => (shown ? maxTreeDepth(shown, children) : 3), [shown, children]);
  const geometry = useGeometry(scrollerRef, snap?.horizon.periods.length ?? 0);

  // ── changes since the last save ──
  const changes = useMemo(() => {
    if (!view || !saved || !present) return { entries: [], ranks: [], count: 0 };
    const entries = entriesDiff(view, saved.plan, present.plan);
    const ranks = rankChanges(view, saved.ranks, present.ranks);
    return { entries, ranks, count: entries.length + ranks.length };
  }, [view, saved, present]);
  const dirty = changes.count > 0;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const fail = useCallback((e: unknown, fallback = 'Could not save that.') => toast.error(e instanceof CfApiError ? e.message : fallback), [toast]);
  const put = useCallback((doc: PlanDoc) => setHist((h) => (h ? commit(h, doc) : h)), []);
  const putPlan = useCallback((next: PlanMap) => { if (present && next !== present.plan) put({ plan: next, ranks: present.ranks }); }, [present, put]);

  const save = useCallback(() => {
    if (!present || !changes.count || saving) return;
    setSaving(true);
    const sent = present;
    putChanges({ entries: changes.entries, ranks: changes.ranks })
      .then(() => { setSaved(sent); setRefusal(null); toast.success(`Plan saved — ${changes.count} ${changes.count === 1 ? 'change' : 'changes'}`); })
      .catch((e) => {
        const refused = refusedUnits(e);
        if (!refused.length && !(e instanceof CfApiError && e.code === 'MATERIAL_NOT_READY')) { fail(e, 'Could not save the plan.'); return; }
        // The server refused for material: say why, and put the refused cards back where they were saved.
        const err = e as CfApiError;
        setRefusal({ message: err.message, problems: err.problems });
        const keys = new Set(refused.map((r) => r.unitKey));
        if (keys.size && saved) {
          setHist((h) => {
            if (!h) return h;
            const plan = { ...h.present.plan };
            for (const k of keys) { if (saved.plan[k]) plan[k] = saved.plan[k]; else delete plan[k]; }
            return commit(h, { plan, ranks: h.present.ranks });
          });
        }
      })
      .finally(() => setSaving(false));
  }, [present, changes, saving, saved, toast, fail]);
  const discard = useCallback(() => { if (saved) { setHist(startHistory(saved)); setDrag(null); } }, [saved]);
  const doUndo = useCallback(() => setHist((h) => (h ? undo(h) : h)), []);
  const doRedo = useCallback(() => setHist((h) => (h ? redo(h) : h)), []);

  // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z / Ctrl+S anywhere on the page (not inside a text box).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || typing(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); doRedo(); } else if (k === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUndo, doRedo, save]);

  // ── dragging: live trial, notes beside the pointer ──
  const affected = useMemo(() => {
    if (!view || !drag || !trialEval) return new Set<string>();
    return new Set(drag.info.keys.flatMap((k) => leadPeriods(view, trialEval, k)));
  }, [view, drag, trialEval]);
  const dragNotes = useMemo(() => {
    if (!drag || !trialEval) return [];
    const notes: string[] = [];
    for (const k of drag.info.keys) {
      const ev = trialEval.units[k];
      if (!ev?.period) continue;
      if (ev.blocked) notes.push(`${codeOf(k)}: ${ev.blocked}`);
      else if (ev.materialState === 'late' && ev.materialText) notes.push(`${codeOf(k)}: ${ev.materialText}`);
      if (ev.late) notes.push(`${codeOf(k)} ships after the promised date`);
    }
    usage.forEach((r, i) => {
      if (r.unlimited) return;
      for (const p of affected) {
        const now = r.cells[p], was = baseUsage[i]?.cells[p];
        if (now && now.pct > 100 + 1e-9 && now.minutes > (was?.minutes ?? 0) + 1e-6) notes.push(`${r.name} ${now.pct >= 999 ? 'has no shifts' : `${Math.round(now.pct)}%`} in ${periodLabels.get(p) ?? p}`);
      }
    });
    return notes.length > MAX_NOTES ? [...notes.slice(0, MAX_NOTES), `and ${notes.length - MAX_NOTES} more`] : notes;
  }, [drag, trialEval, usage, baseUsage, affected, codeOf, periodLabels]);

  const onPreview = useCallback((trial: PlanMap | null, info: DragInfo | null) => setDrag(trial && info ? { trial, info } : null), []);
  const onDrop = useCallback((trial: PlanMap, info: DragInfo) => {
    setDrag(null);
    if (!view || !evaluation || !present) return;
    if (trial === present.plan) return;
    putPlan(trial);
    const lines = feedback(evaluation, evaluate(view, trial));
    toastMessage(toast, lines, info.target === 'backlog' ? 'Taken off the plan' : 'Moved');
  }, [view, evaluation, present, putPlan, toast]);

  /** The grip of a bar (or the sheet): start a unit's work in this week, or null for the shortest bar. */
  const onStretch = useCallback((key: string, start: string | null) => {
    setDrag(null);
    if (!view || !evaluation || !present) return;
    const next = stretchTo(view, present.plan, key, start);
    if (next === present.plan) return;
    putPlan(next);
    toastMessage(toast, feedback(evaluation, evaluate(view, next)), start ? 'Stretched' : 'Back to the shortest bar');
  }, [view, evaluation, present, putPlan, toast]);
  /** "Plan as early as possible": put the unit in the first week it can ship (kept there). */
  const onEarliest = useCallback((key: string, week: string) => {
    if (!view || !evaluation || !present) return;
    const next = dragTo(view, present.plan, [key], key, week);
    if (next === present.plan) return;
    putPlan(next);
    toastMessage(toast, feedback(evaluation, evaluate(view, next)), 'Planned as early as possible');
  }, [view, evaluation, present, putPlan, toast]);
  /** "Plan its parts separately" / "Plan … as one unit again": saved at once, then the board is read again. */
  const onSplit = useCallback((target: PlannerUnit, split: boolean) => {
    if (splitBusy) return;
    if (dirty) { toast.error('Save or discard your changes first.'); return; }
    if (target.bomLineId == null) return;
    const code = shortCode(target, orderCode.get(String(target.orderId)));
    setSplitBusy(true);
    putLineSplit(target.lineId, target.bomLineId, split)
      .then(() => { setOpenKey(null); load.reload(); toast.success(split ? `${code}: its parts are planned separately now` : `${code} is planned as one unit again`); })
      .catch((e) => fail(e, 'Could not change that.'))
      .finally(() => setSplitBusy(false));
  }, [splitBusy, dirty, toast, orderCode, load, fail]);

  // ── selection and keys ──
  const visibleUnits = useMemo(() => rows.filter((r) => r.kind === 'unit').map((r) => r.unitKey!), [rows]);
  const onUnitClick = useCallback((key: string, mods: { shift: boolean; ctrl: boolean }) => {
    if (mods.ctrl) {
      setSelection((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
      selAnchor.current = key;
    } else if (mods.shift && selAnchor.current) {
      const a = visibleUnits.indexOf(selAnchor.current), b = visibleUnits.indexOf(key);
      if (a >= 0 && b >= 0) setSelection(visibleUnits.slice(Math.min(a, b), Math.max(a, b) + 1));
      else setSelection([key]);
    } else {
      setSelection([key]);
      selAnchor.current = key;
    }
  }, [visibleUnits]);
  // drop selected keys that are no longer on the plan (level change, reload)
  useEffect(() => { if (shown) setSelection((s) => { const n = s.filter((k) => k in shown.units); return n.length === s.length ? s : n; }); }, [shown]);

  const lineOrder = useCallback((lineId: string) => {
    if (!evaluation) return [];
    return Object.keys(evaluation.units).filter((k) => String(units.get(k)?.lineId) === lineId).sort((a, b) => (prio.get(a) ?? 0) - (prio.get(b) ?? 0));
  }, [evaluation, units, prio]);
  const onRank = useCallback((lineId: string, keys: string[], before: string | null) => {
    if (!view || !present) return;
    const list = lineOrder(lineId);
    const next = reorderKeys(list, keys, before);
    if (next.join() === list.join()) return;
    put({ plan: present.plan, ranks: rankLine(view, present.ranks, lineId, next) });
  }, [view, present, lineOrder, put]);

  const onGridKey = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (typing(e.target) || !view || !present) return;
    const sel = selection.filter((k) => units.has(k));
    if (e.key === 'Escape') { setSelection([]); setHighlight(null); return; }
    if (!sel.length) {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && visibleUnits.length) { e.preventDefault(); setSelection([visibleUnits[0]]); selAnchor.current = visibleUnits[0]; }
      return;
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && canEdit && !preview) {
      e.preventDefault();
      const step = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 4 : 1);
      const next = shiftBy(view, present.plan, sel, step, e.key === 'ArrowRight' ? view.horizon.periods[0]?.key : undefined);
      const bad = next === present.plan ? [] : refusedMoves(view, present.plan, next);
      if (bad.length) toast.error(`${codeOf(bad[0].unitKey)}: ${bad[0].reason}`);
      else putPlan(next);
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey && canEdit && !preview) {
      e.preventDefault();
      const lineId = String(units.get(sel[0])?.lineId);
      const mine = sel.filter((k) => String(units.get(k)?.lineId) === lineId);
      const list = lineOrder(lineId);
      const rest = list.filter((k) => !mine.includes(k));
      const firstAt = list.indexOf(mine[0]);
      const before = e.key === 'ArrowUp'
        ? rest[Math.max(0, list.slice(0, firstAt).filter((k) => !mine.includes(k)).length - 1)] ?? null
        : (() => { const lastAt = list.indexOf(mine[mine.length - 1]); const after = list.slice(lastAt + 1).filter((k) => !mine.includes(k)); return after[1] ?? null; })();
      if (e.key === 'ArrowDown' && list.slice(list.indexOf(mine[mine.length - 1]) + 1).every((k) => mine.includes(k))) return;
      onRank(lineId, mine, before);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const at = visibleUnits.indexOf(sel[sel.length - 1]);
      const next = visibleUnits[Math.min(visibleUnits.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) { setSelection([next]); selAnchor.current = next; }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && canEdit && !preview) {
      e.preventDefault();
      putPlan(unplan(present.plan, sel));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setOpenKey(sel[0]);
    }
  }, [view, present, selection, units, visibleUnits, canEdit, preview, putPlan, lineOrder, onRank, toast, codeOf]);

  // keep the selected row on screen when it moves by keyboard
  useEffect(() => {
    const el = scrollerRef.current;
    const k = selection[selection.length - 1];
    if (!el || !k) return;
    const i = rows.findIndex((r) => r.unitKey === k && r.kind === 'unit');
    if (i < 0) return;
    const top = i * ROW_H, h = bodyHeight(el);
    if (h > 0 && (top < el.scrollTop || top + ROW_H > el.scrollTop + h)) el.scrollTop = Math.max(0, top - h / 3);
  }, [selection]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── usage panel ──
  const driversText = useCallback((row: UsageRow, period: string) => {
    if (!view || !shown) return [];
    return cellDrivers(view, shown, row.fnKeys, period).slice(0, 3).map((d) => `${codeOf(d.unitKey)} ${hoursText(d.minutes)}`);
  }, [view, shown, codeOf]);
  const onCellClick = useCallback((row: UsageRow, period: string | null) => {
    if (!view || !shown || !period) return;
    if (highlight?.cell.row === row.key && highlight.cell.period === period) { setHighlight(null); return; }
    const keys = cellDrivers(view, shown, row.fnKeys, period).map((d) => d.unitKey);
    setHighlight({ label: `${keys.length} ${keys.length === 1 ? 'unit loads' : 'units load'} ${row.name} in ${periodLabels.get(period) ?? period}`, keys: new Set(keys), cell: { row: row.key, period } });
    // open the orders and lines that hold them
    const ids = new Set<string>();
    for (const k of keys) { const u = units.get(k); if (u) { ids.add(`o:${u.orderId}`); ids.add(`l:${u.lineId}`); } }
    setExpand((x) => ({ ...x, open: [...new Set([...x.open, ...ids])], closed: x.closed.filter((c) => !ids.has(c)) }));
  }, [view, shown, highlight, periodLabels, units]);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !highlight || !highlight.keys.size) return;
    const i = rows.findIndex((r) => r.kind === 'unit' && highlight.keys.has(r.unitKey!));
    const h = bodyHeight(el);
    if (i >= 0 && h > 0 && (i * ROW_H < el.scrollTop || (i + 1) * ROW_H > el.scrollTop + h)) el.scrollTop = Math.max(0, i * ROW_H - ROW_H * 2);
  }, [highlight]); // eslint-disable-line react-hooks/exhaustive-deps
  const fnRows = useCallback((areaKey: string) => {
    const a = areaSet.areas.find((x) => x.key === areaKey);
    return a && view && shown ? functionUsage(view, shown, a) : [];
  }, [areaSet, view, shown]);

  // ── auto-plan ──
  function runAutoPlan() {
    if (!view || !present) return;
    setBusy(true);
    window.setTimeout(() => {
      try { setPreview(autoPlan(view, present.plan, {})); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not make a plan.'); }
      setBusy(false);
    }, 20);
  }
  const previewLines = useMemo(() => (preview && evaluation && previewEval ? [...preview.notes, ...feedback(evaluation, previewEval)] : []), [preview, evaluation, previewEval]);
  function applyPreview() { if (preview) { putPlan(preview.plan); setPreview(null); } }

  // ── writes that are not plan entries (saved at once, as before) ──
  function setTarget(month: string, value: number) {
    setSnap((s) => (s ? { ...s, targets: { ...s.targets, [month]: value } } : s));
    putTargets({ [month]: value }).catch((e) => { fail(e); load.reload(); });
  }
  const onOrderRank = useCallback((ids: string[]) => {
    const rank = new Map(ids.map((id, i) => [id, i + 1]));
    setSnap((s) => (s ? { ...s, orders: [...s.orders].sort((a, b) => rank.get(String(a.id))! - rank.get(String(b.id))!).map((o) => ({ ...o, priority: rank.get(String(o.id))! })) } : s));
    const byId = new Map((snap?.orders ?? []).map((o) => [String(o.id), o.id]));
    putPriorities(ids.map((id) => byId.get(id) ?? id)).then(() => toast.info('Priority saved')).catch((e) => { fail(e); load.reload(); });
  }, [snap, toast, fail, load]);
  const onLevel = useCallback((lineId: string, level: string) => {
    setPreview(null);
    setSnap((s) => (s ? { ...s, orders: s.orders.map((o) => ({ ...o, lines: o.lines.map((l) => (String(l.id) === lineId ? { ...l, level } : l)) })) } : s));
    if (present) putPlan(dropLine(present.plan, units, lineId));
    putLevel(lineId, level).catch((e) => { fail(e); load.reload(); });
  }, [present, putPlan, units, fail, load]);
  const onToggle = useCallback((r: TreeRow) => setExpand((x) => toggle(x, r.id, r.depth)), []);

  // ── render ──
  if (load.error && !snap) return <Box><PageHeader title="Plan" /><ErrorNotice error={load.error} onRetry={load.reload} /></Box>;
  if (!snap || !view || !shown || !evaluation || !present || !hist) return <Box><PageHeader title="Plan" /><SkeletonRows rows={5} height={56} /></Box>;

  const editable = canEdit && !preview;
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

  const levelLabels = ['Orders', 'Lines', 'Plan units', ...Array.from({ length: Math.max(0, maxDepth - 3) }, (_, i) => `${i + 1} ${i ? 'levels' : 'level'} inside`)];
  const allOpen = expand.level >= maxDepth && !expand.closed.length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <PageHeader title="Plan" subtitle="What ships when, this month and the next two."
        actions={(
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            {(snap.materialReady?.counts?.waiting ?? 0) > 0 && (
              <Typography data-testid="material-waiting" sx={{ fontSize: 13, color: 'var(--c-warning-800)' }}>
                {snap.materialReady!.counts.waiting} {snap.materialReady!.counts.waiting === 1 ? 'card waits' : 'cards wait'} for stock
              </Typography>
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

      {refusal && (
        <Box role="alert" data-testid="save-refused" sx={{ p: 1.5, borderRadius: '10px', background: 'var(--c-danger-50, var(--c-surface-2))', border: '1px solid var(--c-danger-200, var(--c-border))', display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, fontSize: 14, color: 'var(--c-danger-800)' }}>Not saved — the material does not allow it yet. The cards were put back.</Typography>
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, fontSize: 13 }}>
              {(refusal.problems.length ? refusal.problems : [refusal.message]).map((p, i) => <li key={i}>{p}</li>)}
            </Box>
          </Box>
          <IconButton size="small" aria-label="Dismiss" onClick={() => setRefusal(null)}><CloseRounded sx={{ fontSize: 16 }} /></IconButton>
        </Box>
      )}

      {preview && <AutoPlanBanner lines={previewLines} buyListPath={appPath(company, 'purchase')} onApply={applyPreview} onDiscard={() => setPreview(null)} />}

      {/* toolbar: expand · selection · highlight · undo/redo · save */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minHeight: 40 }}>
        <Button size="small" variant="outlined" startIcon={<UnfoldMoreRounded />} onClick={(e) => setLevelMenu(e.currentTarget)} aria-haspopup="menu" data-testid="expand-menu">
          Show: {expand.level >= EXPAND_ALL ? 'Everything' : levelLabels[Math.min(expand.level, levelLabels.length) - 1] ?? 'Everything'}
        </Button>
        <Menu anchorEl={levelMenu} open={!!levelMenu} onClose={() => setLevelMenu(null)}>
          {levelLabels.map((label, i) => (
            <MenuItem key={label} selected={expand.level === i + 1} onClick={() => { setExpand(toLevel(i + 1)); setLevelMenu(null); }} sx={{ fontSize: 13 }}>
              {i + 1}. {label}
            </MenuItem>
          ))}
          <MenuItem selected={expand.level >= EXPAND_ALL} onClick={() => { setExpand(toLevel(EXPAND_ALL)); setLevelMenu(null); }} sx={{ fontSize: 13 }}>Everything</MenuItem>
        </Menu>
        <Tooltip title={allOpen ? 'Collapse to orders' : 'Expand everything'}>
          <IconButton size="small" aria-label={allOpen ? 'Collapse all' : 'Expand all'} data-testid="expand-all" onClick={() => setExpand(toLevel(allOpen ? 1 : EXPAND_ALL))}>
            {allOpen ? <UnfoldLessRounded fontSize="small" /> : <UnfoldMoreRounded fontSize="small" />}
          </IconButton>
        </Tooltip>

        <Typography component="div" sx={{ fontSize: 12.5, color: 'var(--c-text-3)', ml: 0.5 }} aria-live="polite">
          {selection.length
            ? <>{selection.length} selected{editable ? ' · ← → move a week (Shift: 4) · Alt+↑↓ reorder · Delete takes it off' : ''} · Esc clears</>
            : editable ? 'Drag a bar to another week · drag its left edge to stretch · Shift/Ctrl-click to pick several' : ''}
        </Typography>

        {highlight && (
          <Box data-testid="highlight-chip" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, pl: 1.25, pr: 0.25, py: 0.25, borderRadius: '999px', background: 'var(--c-info-50)', color: 'var(--c-info-800)', fontSize: 12.5 }}>
            {highlight.label}
            <IconButton size="small" aria-label="Stop highlighting" onClick={() => setHighlight(null)}><CloseRounded sx={{ fontSize: 15 }} /></IconButton>
          </Box>
        )}

        <Box sx={{ flex: 1 }} />
        {canEdit && (
          <Box data-testid="save-bar" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, pl: 1, pr: 0.5, py: 0.25, borderRadius: '10px', border: '1px solid', borderColor: dirty ? 'var(--c-primary-300, var(--c-border))' : 'var(--c-border)', background: dirty ? 'var(--c-primary-50, var(--c-surface))' : 'var(--c-surface)' }}>
            <Tooltip title="Undo (Ctrl+Z)"><span><IconButton size="small" aria-label="Undo" disabled={!hist.past.length} onClick={doUndo}><UndoRounded fontSize="small" /></IconButton></span></Tooltip>
            <Tooltip title="Redo (Ctrl+Y)"><span><IconButton size="small" aria-label="Redo" disabled={!hist.future.length} onClick={doRedo}><RedoRounded fontSize="small" /></IconButton></span></Tooltip>
            <Typography data-testid="change-count" sx={{ fontSize: 13, minWidth: 92, color: dirty ? 'var(--c-text)' : 'var(--c-text-3)' }}>
              {dirty ? `${changes.count} ${changes.count === 1 ? 'change' : 'changes'}` : 'All saved'}
            </Typography>
            <Button size="small" disabled={!dirty || saving} onClick={discard}>Discard</Button>
            <Button size="small" variant="contained" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>
          </Box>
        )}
      </Box>

      <PlanGrid snapshot={view} evaluation={shown} plan={present.plan} rows={rows} units={units} geometry={geometry} canEdit={editable}
        selection={selection} highlight={highlight?.keys ?? null} dragTarget={drag?.info.target ?? null} dragNotes={dragNotes}
        onToggle={onToggle} onUnitClick={onUnitClick} onOpen={setOpenKey} onPreview={onPreview} onDrop={onDrop} onRefuse={(why) => toast.error(why)} onStretch={onStretch} onSplit={onSplit} splitBusy={splitBusy}
        onRank={onRank} onOrderRank={onOrderRank} onLevel={onLevel} onKeyDown={onGridKey} scrollerRef={scrollerRef}
        footer={(
          <UsagePanel rows={usage} level={areaSet.level} periods={snap.horizon.periods} geometry={geometry} fnRows={fnRows}
            targetPeriods={affected} live={!!drag} selected={highlight?.cell ?? null} onCellClick={onCellClick} drivers={driversText}
            collapsed={usageCollapsed} onCollapsed={setUsageCollapsed} />
        )} />

      <UnitSheet unit={open} snapshot={view} evaluation={shown} plan={present.plan} busy={splitBusy} onStretch={onStretch} onEarliest={onEarliest} onSplit={onSplit} periodLabel={(k) => periodLabels.get(k) ?? k} canEdit={editable}
        buyListPath={appPath(company, 'purchase')} onClose={() => setOpenKey(null)}
        onUnplan={(key) => putPlan(unplan(present.plan, [key]))}
        onPin={(key, pinned) => { if (present.plan[key]) putPlan({ ...present.plan, [key]: { ...present.plan[key], pinned } }); }} />
    </Box>
  );
}
