/**
 * Undo / redo for the plan screen. A "doc" is everything the Save button writes: where each unit
 * ships (the plan) and the hand-dragged order of each line's units (ranks). Every move commits a
 * new doc; Ctrl+Z / Ctrl+Y walk the stack. Pure.
 */
import type { Plan } from '../../lib/planner/types';
import type { Ranks } from '../../lib/planner/moves';

export interface PlanDoc { plan: Plan; ranks: Ranks }
export interface History { past: PlanDoc[]; present: PlanDoc; future: PlanDoc[] }

export const HISTORY_LIMIT = 100;

export const startHistory = (doc: PlanDoc): History => ({ past: [], present: doc, future: [] });

/** A new present; the redo stack is dropped. Committing the same doc is a no-op. */
export function commit(h: History, doc: PlanDoc): History {
  if (doc.plan === h.present.plan && doc.ranks === h.present.ranks) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: doc, future: [] };
}
export function undo(h: History): History {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}
export function redo(h: History): History {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
