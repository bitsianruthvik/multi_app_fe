import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Box, IconButton, Menu, MenuItem, Select } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded';
import { dragTo, stretchTo } from '../../lib/planner/moves';
import { canStretch, refusedMoves } from '../../lib/planner/evaluate';
import type { Evaluation, Plan, PlannerOrder, PlannerSnapshot, PlannerUnit } from '../../lib/planner/types';
import { HEAD_H, ROW_H, type Geometry } from './geometry';
import { hoursText, monthName, shortCode, shortDate, splitAction, tonnes } from './model';

/** Tonnes for a narrow cell: whole tonnes from 100 up. */
const tonnesShort = (n: number) => (n >= 100 ? Math.round(n).toLocaleString() : tonnes(n));
import type { TreeRow } from './tree';

type Target = string | 'backlog';

interface DragState {
  mode: 'move' | 'rank' | 'order' | 'stretch';
  keys: string[];
  anchor: string;
  lineId?: string;
  x0: number;
  y0: number;
  started: boolean;
  shift: boolean;
  ctrl: boolean;
  target?: Target;
  before?: string | null;
  /** stretch: the column last looked at, what dropping there does (a start key, null = clear, undefined = refused) and why not */
  idx?: number;
  stretch?: string | null;
  refused?: string;
}

export interface DragInfo {
  /** 'backlog' = off the plan */
  target: Target | null;
  keys: string[];
}

const BACKLOG: Target = 'backlog';

/**
 * The plan: a tree of rows on the left (order › line › unit › inside), the weeks on the right.
 * A plan unit is a bar from the week its work starts to the week it ships; drag it sideways to
 * move it (whole weeks — it snaps), drag it onto "Not planned" to take it off, drag the grip on
 * the left to change its place in the line. Everything selected moves together. All with pointer
 * events (no drag library): pointer down → 4 px → drag; Esc cancels.
 */
export function PlanGrid(props: {
  snapshot: PlannerSnapshot;
  /** what to draw — the trial evaluation while dragging */
  evaluation: Evaluation;
  /** the committed plan (a drag starts from it) */
  plan: Plan;
  rows: TreeRow[];
  units: Map<string, PlannerUnit>;
  geometry: Geometry;
  canEdit: boolean;
  selection: string[];
  highlight: Set<string> | null;
  /** the period a drag points at (header + column outline) */
  dragTarget: string | null;
  dragNotes: string[];
  onToggle: (row: TreeRow) => void;
  onUnitClick: (key: string, mods: { shift: boolean; ctrl: boolean }) => void;
  onOpen: (key: string) => void;
  onPreview: (trial: Plan | null, info: DragInfo | null) => void;
  onDrop: (trial: Plan, info: DragInfo) => void;
  /** a drop the server would refuse (waiting for stock, or before its earliest week): why */
  onRefuse?: (reason: string) => void;
  /** the left grip of a bar: start it in this week (null = back to the shortest bar) */
  onStretch: (unitKey: string, startPeriodKey: string | null) => void;
  /** "Plan its parts separately" (split) or "Plan … as one unit again" (!split) for this row */
  onSplit: (target: PlannerUnit, split: boolean) => void;
  splitBusy: boolean;
  onRank: (lineId: string, keys: string[], beforeKey: string | null) => void;
  onOrderRank: (orderIds: string[]) => void;
  onLevel: (lineId: string, level: string) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  footer: ReactNode;
}) {
  const { snapshot, evaluation, rows, units, geometry: g, canEdit, selection, highlight, dragTarget, dragNotes, scrollerRef } = props;
  const periods = snapshot.horizon.periods;
  const today = snapshot.horizon.from;
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(800);
  const [ui, setUi] = useState<{ mode: DragState['mode']; x: number; y: number; line: number | null; keys: string[]; anchor: string; start?: string | null; reason?: string } | null>(null);
  const [menu, setMenu] = useState<{ el: HTMLElement; key: string } | null>(null);
  const drag = useRef<DragState | null>(null);
  const latest = useRef(props);
  latest.current = props;

  const orders = useMemo(() => new Map(snapshot.orders.map((o) => [String(o.id), o])), [snapshot.orders]);
  const lines = useMemo(() => new Map(snapshot.orders.flatMap((o) => o.lines.map((l) => [String(l.id), l] as const))), [snapshot.orders]);
  const pIdx = useMemo(() => new Map(periods.map((p, i) => [p.key, i])), [periods]);
  const selected = useMemo(() => new Set(selection), [selection]);
  const todayIdx = periods.findIndex((p) => today >= p.start && today <= p.end);

  // Tonnes shipping per period for order and line rows, and what is left to plan.
  const sums = useMemo(() => {
    const byOrder = new Map<string, Map<string, number>>();
    const byLine = new Map<string, Map<string, number>>();
    const totals = new Map<string, { planned: number; all: number; toPlan: number; late: number }>();
    const add = (m: Map<string, Map<string, number>>, k: string, p: string, t: number) => {
      let x = m.get(k); if (!x) { x = new Map(); m.set(k, x); }
      x.set(p, (x.get(p) ?? 0) + t);
    };
    const tot = (k: string) => { let t = totals.get(k); if (!t) { t = { planned: 0, all: 0, toPlan: 0, late: 0 }; totals.set(k, t); } return t; };
    for (const [key, ev] of Object.entries(evaluation.units)) {
      const u = units.get(key);
      if (!u) continue;
      const t = Number(u.tonnes) || 0;
      for (const k of [`o${u.orderId}`, `l${u.lineId}`]) {
        const x = tot(k);
        x.all += t;
        if (ev.period) x.planned += t; else x.toPlan += 1;
        if (ev.late) x.late += 1;
      }
      if (ev.period) { add(byOrder, String(u.orderId), ev.period, t); add(byLine, String(u.lineId), ev.period, t); }
    }
    return { byOrder, byLine, totals };
  }, [evaluation.units, units]);

  // Virtual rows: only what is on screen (+ a margin) is drawn.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const read = () => setViewH(el.clientHeight || 800);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollerRef]);
  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - 8);
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW_H) + 8);

  // ── dragging ─────────────────────────────────────────────────────────────────────────────
  const targetAt = (clientX: number): Target | undefined => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const rect = el.getBoundingClientRect();
    const vx = clientX - rect.left;
    const { geometry } = latest.current;
    if (vx < geometry.treeW) return undefined;
    if (vx < geometry.treeW + geometry.backW) return BACKLOG;
    const x = vx + el.scrollLeft - geometry.treeW - geometry.backW;
    const i = Math.floor(x / geometry.colW);
    const ps = latest.current.snapshot.horizon.periods;
    if (i < 0 || i >= ps.length) return undefined;
    return ps[i].key;
  };
  /** stretch mode: the week column under the pointer, clamped to the grid (left of it = the first week) */
  const stretchIndex = (clientX: number): number => {
    const el = scrollerRef.current;
    const { geometry, snapshot: s } = latest.current;
    if (!el) return 0;
    const x = clientX - el.getBoundingClientRect().left + el.scrollLeft - geometry.treeW - geometry.backW;
    return Math.min(s.horizon.periods.length - 1, Math.max(0, Math.floor(x / geometry.colW)));
  };
  const rowAt = (clientY: number): { i: number; frac: number } => {
    const el = scrollerRef.current!;
    const rect = el.getBoundingClientRect();
    const y = clientY - rect.top + el.scrollTop - HEAD_H;
    const f = y / ROW_H;
    return { i: Math.floor(f), frac: f - Math.floor(f) };
  };

  /** rank mode: where the moving units would go, and the row the indicator sits on */
  const rankSpot = (d: DragState, clientY: number): { before: string | null; line: number } | null => {
    const rs = latest.current.rows;
    const mine = rs.map((r, i) => ({ r, i })).filter(({ r }) => r.lineId === d.lineId && (r.kind === 'unit' || r.kind === 'child'));
    const tops = mine.filter(({ r }) => r.kind === 'unit');
    if (!tops.length) return null;
    const { i, frac } = rowAt(clientY);
    if (i < mine[0].i) return { before: tops[0].r.unitKey!, line: tops[0].i };
    const endRow = mine[mine.length - 1].i + 1;
    if (i >= endRow) return { before: null, line: endRow };
    const row = rs[i];
    const carrier = row.kind === 'unit' ? row.unitKey! : row.carrierKey!;
    const at = tops.findIndex(({ r }) => r.unitKey === carrier);
    if (row.kind === 'unit' && frac < 0.5) return { before: carrier, line: tops[at].i };
    const next = tops[at + 1];
    return next ? { before: next.r.unitKey!, line: next.i } : { before: null, line: endRow };
  };
  const orderSpot = (clientY: number): { before: string | null; line: number } => {
    const rs = latest.current.rows;
    const orderRows = rs.map((r, i) => ({ r, i })).filter(({ r }) => r.kind === 'order');
    const { i, frac } = rowAt(clientY);
    if (i < 0) return { before: orderRows[0]?.r.orderId ?? null, line: 0 };
    if (i >= rs.length) return { before: null, line: rs.length };
    const oi = orderRows.findIndex(({ r }) => r.orderId === rs[i].orderId);
    if (rs[i].kind === 'order' && frac < 0.5) return { before: rs[i].orderId, line: orderRows[oi].i };
    const next = orderRows[oi + 1];
    return next ? { before: next.r.orderId, line: next.i } : { before: null, line: rs.length };
  };

  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.started) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return;
      if (!latest.current.canEdit) return;
      d.started = true;
    }
    const el = scrollerRef.current;
    const box = el?.getBoundingClientRect();
    if (el && box && box.width > 0) { // edge scrolling (only when laid out)
      const rect = box;
      if (d.mode === 'move' || d.mode === 'stretch') {
        if (e.clientX > rect.right - 36) el.scrollLeft += 18;
        else if (e.clientX < rect.left + latest.current.geometry.treeW + latest.current.geometry.backW + 16) el.scrollLeft -= 18;
      } else if (e.clientY > rect.bottom - 36) el.scrollTop += 18;
      else if (e.clientY < rect.top + HEAD_H + 16) el.scrollTop -= 18;
    }
    let line: number | null = null;
    if (d.mode === 'move') {
      const t = targetAt(e.clientX);
      if (t !== undefined && t !== d.target) {
        d.target = t;
        const p = latest.current;
        const trial = dragTo(p.snapshot, p.plan, d.keys, d.anchor, t === BACKLOG ? null : t);
        // A card that waits for stock, or would ship/start before its material's earliest week, cannot go there.
        const bad = t === BACKLOG ? [] : refusedMoves(p.snapshot, p.plan, trial);
        if (bad.length) {
          const u = p.units.get(bad[0].unitKey);
          d.refused = `${u ? shortCode(u, orders.get(String(u.orderId))?.code) : bad[0].unitKey}: ${bad[0].reason}${bad.length > 1 ? ` (and ${bad.length - 1} more ${bad.length === 2 ? 'card' : 'cards'})` : ''}`;
          p.onPreview(null, null);
        } else {
          d.refused = undefined;
          p.onPreview(trial, { target: t, keys: d.keys });
        }
      }
    } else if (d.mode === 'stretch') {
      const i = stretchIndex(e.clientX);
      if (i !== d.idx) {
        d.idx = i;
        const p = latest.current;
        const ps = p.snapshot.horizon.periods;
        const cur = p.plan[d.anchor];
        const si = cur ? ps.findIndex((x) => x.key === cur.period) : -1;
        const li = ps.findIndex((x) => x.key === p.evaluation.units[d.anchor]?.leadStart);
        let trial: Plan | null = null;
        d.refused = undefined;
        if (!cur) d.stretch = undefined;
        else if (i === li) d.stretch = cur.start ?? null; // where it already starts: nothing to change
        else if (i >= si) { d.stretch = null; trial = stretchTo(p.snapshot, p.plan, d.anchor, null); } // at or past the ship week: back to the shortest
        else {
          const c = canStretch(p.snapshot, p.plan, d.anchor, ps[i].key);
          if (c.ok) { d.stretch = ps[i].key; trial = stretchTo(p.snapshot, p.plan, d.anchor, ps[i].key); } else { d.stretch = undefined; d.refused = c.reason ?? 'It cannot start there.'; }
        }
        p.onPreview(trial, trial ? { target: ps[i].key, keys: d.keys } : null);
      }
    } else if (d.mode === 'rank') {
      const s = rankSpot(d, e.clientY);
      if (s) { d.before = s.before; line = s.line; }
    } else {
      const s = orderSpot(e.clientY);
      d.before = s.before; line = s.line;
    }
    setUi({ mode: d.mode, x: e.clientX, y: e.clientY, line, keys: d.keys, anchor: d.anchor, start: d.stretch, reason: d.refused });
  };

  const stop = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onEsc, true);
    drag.current = null;
    setUi(null);
  };
  const onEsc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !drag.current) return;
    e.preventDefault(); e.stopPropagation();
    const was = drag.current;
    stop();
    if (was.started && (was.mode === 'move' || was.mode === 'stretch')) latest.current.onPreview(null, null);
  };
  const onUp = () => {
    const d = drag.current;
    stop();
    if (!d) return;
    const p = latest.current;
    if (!d.started) {
      if (d.mode === 'move') p.onUnitClick(d.anchor, { shift: d.shift, ctrl: d.ctrl });
      return;
    }
    if (d.mode === 'stretch') {
      const cur = p.plan[d.anchor]?.start ?? null;
      if (d.stretch === undefined || d.stretch === cur) { p.onPreview(null, null); return; } // refused, or no change
      p.onStretch(d.anchor, d.stretch);
    } else if (d.mode === 'move') {
      if (d.target === undefined) { p.onPreview(null, null); return; }
      if (d.refused) { p.onPreview(null, null); p.onRefuse?.(d.refused); return; }
      const trial = dragTo(p.snapshot, p.plan, d.keys, d.anchor, d.target === BACKLOG ? null : d.target);
      p.onDrop(trial, { target: d.target, keys: d.keys });
    } else if (d.mode === 'rank') {
      if (d.before !== undefined && d.lineId) p.onRank(d.lineId, d.keys, d.before);
    } else if (d.before !== undefined) {
      const ids = p.snapshot.orders.map((o) => String(o.id)).filter((id) => id !== d.anchor);
      const at = d.before == null ? ids.length : ids.indexOf(d.before);
      ids.splice(at < 0 ? ids.length : at, 0, d.anchor);
      if (ids.join() !== p.snapshot.orders.map((o) => String(o.id)).join()) p.onOrderRank(ids);
    }
  };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = (e: ReactPointerEvent, mode: DragState['mode'], anchor: string, keys: string[], lineId?: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    scrollerRef.current?.focus({ preventScroll: true });
    drag.current = { mode, anchor, keys, lineId, x0: e.clientX, y0: e.clientY, started: false, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onEsc, true);
  };
  const moveKeys = (key: string) => (selected.has(key) ? selection : [key]);
  const rankKeys = (key: string, lineId: string) => {
    if (!selected.has(key)) return [key];
    return selection.filter((k) => String(units.get(k)?.lineId) === lineId);
  };

  // ── drawing ──────────────────────────────────────────────────────────────────────────────
  const months = useMemo(() => {
    const out: { month: string; from: number; span: number }[] = [];
    periods.forEach((p, i) => {
      const lastM = out[out.length - 1];
      if (lastM && lastM.month === p.month) lastM.span += 1; else out.push({ month: p.month, from: i, span: 1 });
    });
    return out;
  }, [periods]);
  const monthStart = useMemo(() => new Set(months.map((m) => m.from)), [months]);
  const stickyTree = { position: 'sticky' as const, left: 0, zIndex: 3, width: g.treeW, flex: 'none', background: 'var(--c-surface)' };
  const stickyBack = { position: 'sticky' as const, left: g.treeW, zIndex: 3, width: g.backW, flex: 'none', background: 'var(--c-surface)', borderLeft: '1px solid var(--c-border)', borderRight: '1px solid var(--c-border)' };
  const dragging = !!ui && ui.mode === 'move';
  const draggedKeys = useMemo(() => new Set(dragging && ui ? ui.keys : []), [dragging, ui]);

  const chevron = (r: TreeRow, label: string) => (r.hasChildren ? (
    <Box component="button" type="button" tabIndex={-1} aria-label={`${r.open ? 'Collapse' : 'Expand'} ${label}`} aria-expanded={r.open} data-testid={`toggle-${r.id}`}
      onClick={(e) => { e.stopPropagation(); props.onToggle(r); }}
      sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, flex: 'none', border: 0, borderRadius: '4px', background: 'none', p: 0, cursor: 'pointer', color: 'var(--c-text-3)', '&:hover': { background: 'var(--c-surface-2)', color: 'var(--c-text)' } }}>
      {r.open ? <ExpandMoreRounded sx={{ fontSize: 18 }} /> : <ChevronRightRounded sx={{ fontSize: 18 }} />}
    </Box>
  ) : <Box sx={{ width: 22, flex: 'none' }} />);

  const grip = (label: string, onDown: (e: ReactPointerEvent) => void) => (canEdit ? (
    <Box role="button" tabIndex={-1} aria-label={label} title={label} onPointerDown={onDown}
      sx={{ display: 'flex', alignItems: 'center', width: 16, flex: 'none', cursor: 'grab', color: 'var(--c-text-3)', opacity: 0.55, touchAction: 'none', '&:hover': { opacity: 1 } }}>
      <DragIndicatorRounded sx={{ fontSize: 16 }} />
    </Box>
  ) : null);

  const periodSums = (m: Map<string, number> | undefined, strong: boolean) => periods.map((p, i) => {
    const t = m?.get(p.key) ?? 0;
    if (!t) return null;
    return (
      <Box key={p.key} sx={{ position: 'absolute', left: g.colX(i), width: g.colW, top: 0, height: ROW_H, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: strong ? 'var(--c-text-2)' : 'var(--c-text-3)', fontWeight: strong ? 600 : 400 }}>
        {tonnes(t)} t
      </Box>
    );
  });

  const unitBar = (u: PlannerUnit, faint: boolean, carrier?: string) => {
    const ev = evaluation.units[carrier ?? u.key];
    if (!ev?.period || !ev.leadStart) return null;
    const s = pIdx.get(ev.period)!, a = pIdx.get(ev.leadStart)!;
    const left = g.colX(a) + 3;
    const width = (s - a + 1) * g.colW - 6;
    if (faint) {
      return <Box aria-hidden sx={{ position: 'absolute', left, width, top: 13, height: 8, borderRadius: '4px', border: '1px dashed var(--c-border-strong, var(--c-border))', background: 'var(--c-surface-2)' }} />;
    }
    const sel = selected.has(u.key);
    const lifted = draggedKeys.has(u.key);
    const matNote = !ev.blocked && ev.materialState && ev.materialState !== 'ready' ? ev.materialText : null;
    const warn = !!ev.blocked || ev.materialState === 'late';
    const late = ev.late;
    const lit = highlight?.has(u.key);
    const shipW = g.colW - 6;
    const stretched = ev.start != null;
    const startLabel = stretched ? periods[pIdx.get(ev.start!) ?? a]?.label ?? '' : '';
    const label = `${u.code}: ships ${periods[s].label}${a < s ? `, work from ${periods[a].label}` : ''}${stretched ? `. Stretched from ${startLabel}` : ''}${ev.pinned ? ', kept here' : ''}${ev.blocked ? `. ${ev.blocked}` : matNote ? `. ${matNote}` : ''}${late ? '. After the promised date' : ''}`;
    return (
      <Box role="button" aria-label={label} aria-pressed={sel} data-testid={`bar-${u.key}`} data-period={ev.period}
        title={[`${u.code} — ${tonnes(u.tonnes)} t`, `Ships ${periods[s].label} (${shortDate(periods[s].start)}–${shortDate(periods[s].end)})`, a < s ? `Work from ${periods[a].label}` : '', stretched ? `Stretched from ${startLabel}` : '', ev.blocked ?? matNote ?? '', late ? 'After the promised date' : '', canEdit ? 'Drag to move · drag the left edge to stretch · double-click for details' : 'Double-click for details'].filter(Boolean).join('\n')}
        onPointerDown={(e) => begin(e, 'move', u.key, moveKeys(u.key))}
        onDoubleClick={() => props.onOpen(u.key)}
        sx={{
          position: 'absolute', left, width, top: 5, height: ROW_H - 10, borderRadius: '6px', display: 'flex', alignItems: 'stretch', overflow: 'hidden',
          cursor: canEdit ? 'grab' : 'pointer', touchAction: 'none', userSelect: 'none',
          background: stretched
            ? 'repeating-linear-gradient(135deg, var(--c-primary-50, var(--c-surface-2)) 0 6px, var(--c-surface) 6px 12px)'
            : 'var(--c-primary-50, var(--c-surface-2))',
          border: `1px solid ${late ? 'var(--c-danger-600)' : warn ? 'var(--c-warning-600)' : 'var(--c-primary-300, var(--c-border))'}`,
          outline: sel ? '2px solid var(--c-primary-600)' : lit ? '2px solid var(--c-info-600, var(--c-primary-400))' : 'none', outlineOffset: 1,
          boxShadow: lifted ? 'var(--e-3, 0 6px 16px rgba(0,0,0,.18))' : 'none',
          transition: lifted ? 'none' : 'left 160ms ease, width 160ms ease',
          zIndex: lifted ? 2 : 1,
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', pl: '10px', fontSize: 11, color: 'var(--c-primary-700)' }}>{stretched && width > shipW + 24 ? '↔' : ''}</Box>
        {canEdit && (
          <Box role="button" tabIndex={-1} aria-label={`Stretch: start ${u.code} earlier`} title={stretched ? 'Drag to change the start · double-click for the shortest bar' : 'Drag left to start earlier (spreads the work thinner)'}
            data-testid={`stretch-${u.key}`}
            onPointerDown={(e) => begin(e, 'stretch', u.key, [u.key])}
            onDoubleClick={(e) => { e.stopPropagation(); if (stretched) props.onStretch(u.key, null); }}
            sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, cursor: 'ew-resize', touchAction: 'none', zIndex: 1, background: stretched ? 'var(--c-primary-300, var(--c-border))' : 'transparent', '&:hover': { background: 'var(--c-primary-300, var(--c-border))' } }} />
        )}
        <Box sx={{ width: Math.min(shipW, width), flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25, px: 0.5,
          background: late ? 'var(--c-danger-600)' : 'var(--c-primary-600, var(--c-primary-500))', color: 'var(--c-on-primary, #fff)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {ev.pinned && <LockRounded sx={{ fontSize: 11, opacity: 0.85 }} />}
          {warn && <WarningAmberRounded sx={{ fontSize: 12, color: 'var(--c-warning-200, #fde68a)' }} />}
          {(ev.completesLines?.length ?? 0) > 0 && <CheckRounded sx={{ fontSize: 12 }} />}
          <span>{tonnes(u.tonnes)}t</span>
        </Box>
      </Box>
    );
  };

  const unitChip = (u: PlannerUnit) => {
    const ev = evaluation.units[u.key];
    if (!ev || ev.period) return null;
    const sel = selected.has(u.key);
    const matNote = !ev.blocked && ev.materialState && ev.materialState !== 'ready' ? ev.materialText : null;
    return (
      <Box role="button" aria-label={`${u.code}: not planned${ev.blocked ? `. ${ev.blocked}` : matNote ? `. ${matNote}` : ''}`} aria-pressed={sel} data-testid={`chip-${u.key}`}
        title={[`${u.code} — ${tonnes(u.tonnes)} t, not planned`, ev.blocked ?? matNote ?? '', canEdit ? 'Drag onto a week to plan it' : ''].filter(Boolean).join('\n')}
        onPointerDown={(e) => begin(e, 'move', u.key, moveKeys(u.key))}
        onDoubleClick={() => props.onOpen(u.key)}
        sx={{ position: 'absolute', left: 4, right: 4, top: 6, height: ROW_H - 12, borderRadius: '6px', border: `1px dashed ${ev.blocked ? 'var(--c-warning-600)' : 'var(--c-border-strong, var(--c-text-3))'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25, fontSize: 11, color: 'var(--c-text-2)', background: 'var(--c-surface)',
          cursor: canEdit ? 'grab' : 'pointer', touchAction: 'none', userSelect: 'none',
          outline: sel ? '2px solid var(--c-primary-600)' : 'none', outlineOffset: 1 }}>
        {ev.blocked && <WarningAmberRounded sx={{ fontSize: 12, color: 'var(--c-warning-600)' }} />}
        {tonnes(u.tonnes)} t
      </Box>
    );
  };

  const orderRow = (r: TreeRow, o: PlannerOrder, rank: number) => {
    const t = sums.totals.get(`o${o.id}`);
    return (
      <>
        <Box sx={{ ...stickyTree, display: 'flex', alignItems: 'center', gap: 0.5, pl: 0.5, pr: 1, background: 'var(--c-surface-2)', borderTop: '1px solid var(--c-border)' }}>
          {chevron(r, o.code)}
          {grip(`Drag to change ${o.code}'s priority`, (e) => begin(e, 'order', String(o.id), [String(o.id)]))}
          <Box component="span" title="Priority" sx={{ fontSize: 11, color: 'var(--c-text-3)', width: 16, textAlign: 'right', flex: 'none' }}>{rank}</Box>
          <Box sx={{ minWidth: 0, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: 12.5 }} title={`${o.code} · ${o.customer}${o.committedDate ? ` · due ${shortDate(o.committedDate)}` : ''}`}>
            <b style={{ fontFamily: 'var(--font-mono, monospace)' }}>{o.code}</b>
            <span style={{ color: 'var(--c-text-3)' }}> · {o.customer}{o.committedDate ? ` · due ${shortDate(o.committedDate)}` : ''}</span>
          </Box>
          {(t?.late ?? 0) > 0 && <ScheduleRounded titleAccess={`${t!.late} after the promised date`} sx={{ fontSize: 14, color: 'var(--c-danger-600)' }} />}
        </Box>
        <Box sx={{ ...stickyBack, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: (t?.toPlan ?? 0) > 0 ? 'var(--c-warning-800)' : 'var(--c-text-3)', background: 'var(--c-surface-2)', borderTop: '1px solid var(--c-border)' }}>
          {(t?.toPlan ?? 0) > 0 ? `${t!.toPlan} to plan` : ''}
        </Box>
        <Box sx={{ position: 'absolute', left: g.treeW + g.backW, right: 0, top: 0, height: ROW_H, background: 'var(--c-surface-2)', opacity: 0.55, borderTop: '1px solid var(--c-border)', zIndex: 0 }} />
        {periodSums(sums.byOrder.get(String(o.id)), true)}
        <Box sx={{ position: 'absolute', left: g.colX(periods.length), width: g.totalW, top: 0, height: ROW_H, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', pr: 1, fontSize: 11.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
          title="Tonnes planned of the tonnes to plan">
          {t ? `${tonnesShort(t.planned)}/${tonnesShort(t.all)} t` : ''}
        </Box>
      </>
    );
  };

  const lineRow = (r: TreeRow) => {
    const l = lines.get(r.lineId!);
    if (!l) return null;
    const t = sums.totals.get(`l${l.id}`);
    return (
      <>
        <Box sx={{ ...stickyTree, display: 'flex', alignItems: 'center', gap: 0.5, pl: 2.5, pr: 1 }}>
          {chevron(r, l.name)}
          <Box sx={{ minWidth: 0, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: 12.5 }} title={l.name}>{l.lineNo}. {l.name}</Box>
          {l.levels.length > 1 && (
            <Select variant="standard" disableUnderline value={l.levels.some((x) => x.value === l.level) ? l.level : ''} disabled={!canEdit}
              onChange={(e) => props.onLevel(String(l.id), String(e.target.value))} inputProps={{ 'aria-label': `Plan ${l.name} by` }}
              renderValue={(v) => `by ${(l.levels.find((x) => x.value === v)?.label ?? '').toLowerCase()}`}
              sx={{ fontSize: 11.5, color: 'var(--c-primary-700)', maxWidth: 130, '& .MuiSelect-select': { py: 0, pr: '18px !important' } }}>
              {l.levels.map((x) => <MenuItem key={x.value} value={x.value} sx={{ fontSize: 13 }}>{x.label}</MenuItem>)}
            </Select>
          )}
        </Box>
        <Box sx={{ ...stickyBack, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--c-warning-800)' }}>
          {(t?.toPlan ?? 0) > 0 ? `${t!.toPlan} to plan` : ''}
        </Box>
        {periodSums(sums.byLine.get(String(l.id)), false)}
        <Box sx={{ position: 'absolute', left: g.colX(periods.length), width: g.totalW, top: 0, height: ROW_H, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', pr: 1, fontSize: 11.5, color: 'var(--c-text-2)', fontVariantNumeric: 'tabular-nums' }}>
          {t ? `${tonnesShort(t.planned)}/${tonnesShort(t.all)} t` : ''}
        </Box>
      </>
    );
  };

  const workMin = (u: PlannerUnit) => Object.entries(u.work || {}).reduce((s, [k, v]) => (k === 'contractor' || k === 'unassigned' ? s : s + (Number(v) || 0)), 0);

  const unitRow = (r: TreeRow, u: PlannerUnit, child: boolean) => {
    const order = orders.get(String(u.orderId));
    const sel = !child && selected.has(u.key);
    const ev = evaluation.units[u.key];
    const indent = child ? 4.5 + (r.depth - 3) * 1.5 : 3;
    return (
      <>
        <Box onClick={child ? undefined : (e) => props.onUnitClick(u.key, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey })}
          onDoubleClick={() => props.onOpen(child ? r.carrierKey! : u.key)}
          sx={{ ...stickyTree, display: 'flex', alignItems: 'center', gap: 0.5, pl: indent, pr: 1, cursor: child ? 'default' : 'pointer', background: sel ? 'var(--c-primary-50, var(--c-surface-2))' : 'var(--c-surface)' }}>
          {chevron(r, u.code)}
          {!child && grip(`Drag to change ${u.code}'s place in the line`, (e) => begin(e, 'rank', u.key, rankKeys(u.key, String(u.lineId)), String(u.lineId)))}
          <Box sx={{ minWidth: 0, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: child ? 12 : 12.5, color: child ? 'var(--c-text-2)' : 'var(--c-text)' }} title={`${u.code}\n${u.name}`}>
            <span style={{ fontFamily: (u.quantity ?? 1) > 1 ? 'inherit' : 'var(--font-mono, monospace)', fontWeight: child ? 400 : 600 }}>{shortCode(u, order?.code)}</span>
            {(u.quantity ?? 1) <= 1 && <span style={{ color: 'var(--c-text-3)' }}> {u.name}</span>}
          </Box>
          {!child && (ev?.blocked || ev?.materialState === 'late') && <WarningAmberRounded titleAccess={ev.blocked ?? ev.materialText ?? ''} sx={{ fontSize: 14, color: 'var(--c-warning-600)' }} />}
          {!child && ev?.late && <ScheduleRounded titleAccess="After the promised date" sx={{ fontSize: 14, color: 'var(--c-danger-600)' }} />}
          <Box component="span" sx={{ fontSize: 11.5, color: 'var(--c-text-2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{tonnes(u.tonnes)} t</Box>
          {!child && canEdit && splitAction(snapshot.units, u, order?.code) && (
            <IconButton size="small" aria-label={`More for ${u.code}`} data-testid={`menu-${u.key}`} sx={{ p: 0.25 }}
              onClick={(e) => { e.stopPropagation(); setMenu({ el: e.currentTarget, key: u.key }); }}
              onDoubleClick={(e) => e.stopPropagation()}>
              <MoreHorizRounded sx={{ fontSize: 16 }} />
            </IconButton>
          )}
        </Box>
        <Box sx={{ ...stickyBack }}>{!child && unitChip(u)}</Box>
        {unitBar(u, child, child ? r.carrierKey : undefined)}
        <Box sx={{ position: 'absolute', left: g.colX(periods.length), width: g.totalW, top: 0, height: ROW_H, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', pr: 1, fontSize: 11.5, color: 'var(--c-text-3)', fontVariantNumeric: 'tabular-nums' }}
          title="Machine hours this holds">
          {hoursText(workMin(u))}
        </Box>
      </>
    );
  };

  const orderRank = new Map(snapshot.orders.map((o, i) => [String(o.id), i + 1]));
  const dimmed = (r: TreeRow) => !!highlight && (r.kind === 'unit' ? !highlight.has(r.unitKey!) : r.kind === 'child' ? !highlight.has(r.carrierKey!) : false);
  const targetIdx = dragTarget ? pIdx.get(dragTarget) ?? -1 : -1;

  return (
    <Box ref={scrollerRef} tabIndex={0} role="region" aria-label="Plan: orders, lines and units by week. Arrow keys move the selected units a week."
      data-testid="plan-grid" onKeyDown={props.onKeyDown}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      sx={{ position: 'relative', overflow: 'auto', height: 'calc(100vh - 190px)', minHeight: 440, border: '1px solid var(--c-border)', borderRadius: '10px', background: 'var(--c-surface)', outline: 'none', '&:focus-visible': { boxShadow: '0 0 0 2px var(--c-focus, var(--c-primary-500))' } }}>
      <Box sx={{ width: g.width, position: 'relative', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* header */}
        <Box sx={{ position: 'sticky', top: 0, zIndex: 6, height: HEAD_H, background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)', display: 'flex', flex: 'none' }}>
          <Box sx={{ ...stickyTree, zIndex: 7, display: 'flex', alignItems: 'flex-end', px: 1, pb: 0.5, fontSize: 12, color: 'var(--c-text-3)' }}>Order › line › unit</Box>
          <Box sx={{ ...stickyBack, zIndex: 7, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', pb: 0.5, fontSize: 11.5, color: dragTarget === BACKLOG ? 'var(--c-danger-800)' : 'var(--c-text-3)', background: dragTarget === BACKLOG ? 'var(--c-danger-50)' : 'var(--c-surface)' }}>Not planned</Box>
          <Box sx={{ position: 'relative', flex: 'none', width: g.colW * periods.length + g.totalW }}>
            {months.map((m) => (
              <Box key={m.month} sx={{ position: 'absolute', left: m.from * g.colW, width: m.span * g.colW, top: 0, height: HEAD_H / 2, px: 1, display: 'flex', alignItems: 'center', fontSize: 12.5, fontWeight: 600, borderLeft: '1px solid var(--c-border)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {monthName(m.month)}
              </Box>
            ))}
            {periods.map((p, i) => (
              <Box key={p.key} data-testid={`head-${p.key}`} title={`${shortDate(p.start)} – ${shortDate(p.end)}`}
                sx={{ position: 'absolute', left: i * g.colW, width: g.colW, top: HEAD_H / 2, height: HEAD_H / 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                  color: i === targetIdx ? 'var(--c-primary-800, var(--c-primary-700))' : i === todayIdx ? 'var(--c-text)' : 'var(--c-text-3)', fontWeight: i === targetIdx || i === todayIdx ? 600 : 400,
                  background: i === targetIdx ? 'var(--c-primary-50, var(--c-surface-2))' : undefined,
                  borderLeft: `1px solid ${monthStart.has(i) ? 'var(--c-border)' : 'var(--c-divider)'}` }}>
                {p.label.split(' · ')[0]}
              </Box>
            ))}
            <Box sx={{ position: 'absolute', left: periods.length * g.colW, width: g.totalW, top: HEAD_H / 2, height: HEAD_H / 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', pr: 1, fontSize: 11, color: 'var(--c-text-3)', borderLeft: '1px solid var(--c-border)' }}>Total</Box>
          </Box>
        </Box>

        {/* body */}
        <Box sx={{ position: 'relative', height: rows.length * ROW_H, flex: 'none' }}>
          {periods.map((p, i) => (
            <Box key={p.key} aria-hidden sx={{ position: 'absolute', top: 0, bottom: 0, left: g.colX(i), width: g.colW,
              borderLeft: `1px solid ${monthStart.has(i) ? 'var(--c-border)' : 'var(--c-divider)'}`,
              background: i === targetIdx ? 'var(--c-primary-50, var(--c-surface-2))' : i === todayIdx ? 'var(--c-surface-2)' : undefined, opacity: i === targetIdx ? 0.9 : 1 }} />
          ))}
          <Box aria-hidden sx={{ position: 'absolute', top: 0, bottom: 0, left: g.colX(periods.length), width: g.totalW, borderLeft: '1px solid var(--c-border)' }} />
          {rows.slice(first, last).map((r, j) => {
            const i = first + j;
            const u = r.unitKey ? units.get(r.unitKey) : undefined;
            const o = orders.get(r.orderId);
            let body: ReactNode = null;
            if (r.kind === 'order' && o) body = orderRow(r, o, orderRank.get(r.orderId) ?? 0);
            else if (r.kind === 'line') body = lineRow(r);
            else if (u) body = unitRow(r, u, r.kind === 'child');
            return (
              <Box key={r.id} data-testid={`row-${r.id}`} data-kind={r.kind}
                sx={{ position: 'absolute', top: i * ROW_H, left: 0, width: g.width, height: ROW_H, display: 'flex', borderBottom: '1px solid var(--c-divider)', opacity: dimmed(r) ? 0.35 : 1 }}>
                {body}
              </Box>
            );
          })}
          {ui && ui.line != null && (
            <Box aria-hidden sx={{ position: 'absolute', left: 0, width: g.treeW + g.backW, top: ui.line * ROW_H - 1, height: 3, borderRadius: 2, background: 'var(--c-primary-600)', zIndex: 8 }} />
          )}
        </Box>
        <Box sx={{ flex: 1 }} />
        {props.footer}
      </Box>

      {(() => {
        const mu = menu ? units.get(menu.key) : undefined;
        const act = mu ? splitAction(snapshot.units, mu, orders.get(String(mu.orderId))?.code) : null;
        return (
          <Menu anchorEl={menu?.el ?? null} open={!!menu && !!act} onClose={() => setMenu(null)}>
            {act && <MenuItem disabled={props.splitBusy} sx={{ fontSize: 13 }} onClick={() => { setMenu(null); props.onSplit(act.target, act.split); }}>{act.label}</MenuItem>}
          </Menu>
        );
      })()}

      {ui && (
        <Box role="status" aria-live="polite" data-testid="drag-hint"
          sx={{ position: 'fixed', left: ui.x + 16, top: ui.y + 16, zIndex: 1500, pointerEvents: 'none', maxWidth: 320, p: '6px 10px', borderRadius: '8px', background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--e-3, 0 6px 16px rgba(0,0,0,.18))', fontSize: 12, lineHeight: 1.45 }}>
          {ui.mode === 'move' ? (
            <>
              <b>{ui.keys.length > 1 ? `${ui.keys.length} units` : (() => { const u = units.get(ui.anchor); return u ? shortCode(u, orders.get(String(u.orderId))?.code) : ''; })()}</b>
              {' → '}{dragTarget === BACKLOG ? 'not planned' : dragTarget ? `${periods[pIdx.get(dragTarget) ?? 0]?.label} (${shortDate(periods[pIdx.get(dragTarget) ?? 0]?.start ?? '')})` : '…'}
              {ui.reason ? <Box sx={{ color: 'var(--c-danger-800)' }}>⚠ {ui.reason}</Box> : dragNotes.length ? dragNotes.map((n) => <Box key={n} sx={{ color: 'var(--c-warning-800)' }}>⚠ {n}</Box>) : dragTarget && dragTarget !== BACKLOG ? <Box sx={{ color: 'var(--c-success-800)' }}>Fits — no conflicts</Box> : null}
            </>
          ) : ui.mode === 'stretch' ? (
            <>
              <b>{(() => { const u = units.get(ui.anchor); return u ? shortCode(u, orders.get(String(u.orderId))?.code) : ''; })()}</b>
              {ui.reason ? '' : ui.start ? ` starts ${periods[pIdx.get(ui.start) ?? 0]?.label}` : ' back to the shortest bar'}
              {ui.reason ? <Box sx={{ color: 'var(--c-warning-800)' }}>⚠ {ui.reason}</Box> : dragNotes.map((n) => <Box key={n} sx={{ color: 'var(--c-warning-800)' }}>⚠ {n}</Box>)}
            </>
          ) : ui.mode === 'rank' ? 'Drop to set its place in the line' : 'Drop to set the order’s priority'}
        </Box>
      )}
    </Box>
  );
}
