import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@core/contexts/AuthContext';
import type { OpFigures, OperationNames, TreeNode } from '../api/trackerTree';
import type { DashOrder, DashOrderLine } from '../api/dashboard';

/**
 * Dashboard › By order: "Own steps" / "Including everything below" (user, 2026-10-17). One choice
 * for the whole tab — every level of the tree, the order card's % and the line rows follow it —
 * remembered per user on this device.
 *
 *   own  a node's OWN steps: a piece's own operations; a line's = its top pieces' own steps; an
 *        order's = its lines' (the server's `own` figures, trackerTreeService / dashboardService)
 *   all  the node and everything below it (what the tab always showed)
 */
export type StepsView = 'own' | 'all';
export const STEPS_VIEWS: { key: StepsView; label: string; hint: string }[] = [
  { key: 'own', label: 'Own steps', hint: 'Only the steps of the row itself.' },
  { key: 'all', label: 'Including everything below', hint: 'The row and every part under it, added up.' },
];
export const DEFAULT_STEPS_VIEW: StepsView = 'all';
const KEY = (userId: number | string | null | undefined) => `cf_erp.dash.stepsView.${userId ?? 'anyone'}`;
const EVENT = 'cf-erp-steps-view';

export function loadStepsView(userId: number | string | null | undefined): StepsView {
  try {
    const v = window.localStorage.getItem(KEY(userId));
    return v === 'own' || v === 'all' ? v : DEFAULT_STEPS_VIEW;
  } catch { return DEFAULT_STEPS_VIEW; }
}
export function saveStepsView(userId: number | string | null | undefined, v: StepsView) {
  try { window.localStorage.setItem(KEY(userId), v); } catch { /* private window: not remembered */ }
}

/** The choice, shared by every part of the tab that shows it (a change anywhere moves them all). */
export function useStepsView(): [StepsView, (v: StepsView) => void] {
  const { user } = useAuth();
  const uid = (user as { id?: number } | null)?.id ?? null;
  const [view, setView] = useState<StepsView>(() => loadStepsView(uid));
  useEffect(() => { setView(loadStepsView(uid)); }, [uid]);
  useEffect(() => {
    const on = (e: Event) => { const v = (e as CustomEvent<StepsView>).detail; if (v === 'own' || v === 'all') setView(v); };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const set = useCallback((v: StepsView) => {
    saveStepsView(uid, v);
    setView(v);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: v }));
  }, [uid]);
  return [view, set];
}

export interface OpTotal {
  operationId: number; code: string | null; name: string;
  done: number; total: number; minutes: number | null; minutesDone: number | null;
  /** 0–100: by minutes when every step has a time, else by count; null when nothing to do. */
  pct: number | null;
}

const r6 = (n: number) => Number(n.toFixed(6));
const pctOf = (f: { done: number; total: number; minutes?: number | null; minutesDone?: number | null }): number | null => {
  if (f.minutes != null && f.minutes > 0 && f.minutesDone != null) return Math.min(100, (f.minutesDone / f.minutes) * 100);
  return f.total > 0 ? Math.min(100, (f.done / f.total) * 100) : null;
};

/** A piece's own operations, folded per operation (passes added up), in flow order. */
export function ownOpFigures(node: TreeNode): OpFigures[] {
  const by = new Map<number, OpFigures & { known: boolean }>();
  for (const o of node.ops) {
    const b = by.get(o.operationId) ?? { operationId: o.operationId, done: 0, total: 0, minutes: 0, minutesDone: 0, known: true };
    b.done = r6(b.done + o.done);
    b.total = r6(b.total + o.total);
    if (o.minutes == null) b.known = false;
    else { b.minutes = r6((b.minutes ?? 0) + o.minutes); b.minutesDone = r6((b.minutesDone ?? 0) + (o.total > 0 ? o.minutes * (o.done / o.total) : 0)); }
    by.set(o.operationId, b);
  }
  return [...by.values()].map(({ known, ...b }) => (known ? b : { ...b, minutes: null, minutesDone: null }));
}

/** Per operation, as the view asks: own = the node's own steps; all = the node and everything below. */
export function opTotals(node: TreeNode, view: StepsView, names: OperationNames = {}): OpTotal[] {
  let figs: OpFigures[];
  if (view === 'own') figs = node.kind === 'piece' ? ownOpFigures(node) : node.own?.byOperation ?? [];
  else figs = node.byOperation && node.byOperation.length ? node.byOperation : ownOpFigures(node);
  return figs.filter((f) => f.total > 0).map((f) => {
    const n = names[String(f.operationId)];
    return {
      operationId: f.operationId, code: n?.code ?? null, name: n?.name ?? `Operation ${f.operationId}`,
      done: f.done, total: f.total, minutes: f.minutes ?? null, minutesDone: f.minutesDone ?? null, pct: pctOf(f),
    };
  });
}

/** The node's completion (0–1) in the view; null = nothing to count. Falls back to the subtree figure on an older server. */
export function viewCompletion(node: TreeNode, view: StepsView): number | null {
  if (view === 'all' || !node.own) return node.completion;
  return node.own.completion;
}

/** What the completion is weighed by, in words, for the bar's tooltip. */
export function viewWeightText(node: TreeNode, view: StepsView): string | undefined {
  const w = view === 'own' && node.own ? node.own.weight : node.weight;
  const scope = view === 'own' ? 'Its own steps only' : 'It and everything below it';
  if (!w) return `${scope}.`;
  return `${scope}, weighed by ${w === 'minutes' ? 'planned minutes' : 'operations counted'}.`;
}

/** A line's % in the view (the dashboard's per-line figure). null = no steps of its own. */
export const lineViewPct = (l: DashOrderLine, view: StepsView): number | null =>
  (view === 'own' ? (l.own ? l.own.progressPct : l.progressPct) : l.progressPct);

/** The order card's % in the view. null = no line has steps of its own. */
export const orderViewPct = (o: DashOrder, view: StepsView): number | null =>
  (view === 'own' ? (o.progress.own ? o.progress.own.pct : o.progress.pct) : o.progress.pct);

/** "3 of 4 · 40 of 90 min" — one operation's total for its pill's tooltip. */
export function opTotalTitle(t: OpTotal): string {
  const count = `${t.name}: ${fmt(t.done)} of ${fmt(t.total)} done`;
  const mins = t.minutes != null ? ` · ${fmt(Math.round(t.minutesDone ?? 0))} of ${fmt(Math.round(t.minutes))} min` : ' · no planned time on every step';
  return `${count}${mins}${t.pct != null ? ` · ${Math.round(t.pct)}%` : ''}`;
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))));
