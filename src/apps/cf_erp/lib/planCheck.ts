/**
 * Is this work in the plan? (2026-10-17, services/planCheckService.js). WARN ONLY: a start is never
 * held for it. The floor's queue marks each job `planned`; the tracker's start asks
 * GET /tracker/plan-check. Pure helpers, so the words are the same everywhere.
 */
export const UNPLANNED_TEXT = 'This work is not in the plan.';
export const UNPLANNED_HINT = 'It has no ship week on the plan. You can still start it.';

export interface UnplannedStep {
  stepId: number; orderId: number | null; orderCode: string | null; lineId: number | null; lineNo: number | null;
  pieceCode: string | null; operation: string | null;
}
export interface PlanCheck { checked: number; unplanned: UnplannedStep[]; message: string | null }

/** "SO-1 · line 2" */
export const placeText = (u: { orderCode: string | null; lineNo?: number | null }): string =>
  [u.orderCode ?? 'Order', u.lineNo != null ? `line ${u.lineNo}` : null].filter(Boolean).join(' · ');

/** Each order line once, in the order first seen. */
export function unplannedPlaces(list: { orderCode: string | null; lineNo?: number | null }[]): string[] {
  const out: string[] = [];
  for (const u of list) { const t = placeText(u); if (!out.includes(t)) out.push(t); }
  return out;
}

/** The picked floor jobs the queue says are not in the plan (planned === false; unknown counts as planned). */
export const unplannedPicked = <T extends { planned?: boolean | null }>(steps: T[]): T[] => steps.filter((s) => s.planned === false);
