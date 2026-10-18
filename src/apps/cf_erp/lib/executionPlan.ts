import type {
  DispatchLevel, ExecutionPlan, ExecutionPlanInput, ExecutionPlanView, PlanChoice, ProductionLevel,
} from '../api/executionPlan';

/**
 * Words and list maths for the EXECUTION PLAN step (components/OrderStructure/ExecutionPlanPanel.tsx, init.sql §72).
 * The rules themselves are the server's (executionPlanModel.js): this file only encodes choices for the selects and
 * builds what is sent.
 */

export const PRODUCTION_WORDS: Record<ProductionLevel, string> = {
  order: 'Whole order',
  line: 'Per line',
  unit: 'Per unit',
  assembly: 'Per sub-assembly',
};
export const PRODUCTION_HELP: Record<ProductionLevel, string> = {
  order: 'One production order for every line together.',
  line: 'One production order for each line. The usual choice.',
  unit: 'One production order for each unit of a line — each span of a line of 3.',
  assembly: 'One production order for each sub-assembly of a BOM level (e.g. each Girder line), and one for the rest of each unit.',
};
export const DISPATCH_WORDS: Record<DispatchLevel, string> = {
  same: 'Same as production orders',
  line: 'Per line',
  unit: 'Per unit',
  assembly: 'Per sub-assembly',
};

const RANK: Record<string, number> = { order: 0, line: 1, unit: 2, assembly: 3 };

/** A dispatch level that can never fit inside the production order (per line when production is per unit). */
export const dispatchTooBig = (production: ProductionLevel, dispatch: DispatchLevel) =>
  dispatch !== 'same' && RANK[dispatch] < RANK[production];

/** A choice as one select value: "line", "assembly:6094". */
export const encodeChoice = (c: PlanChoice | null | undefined) => (!c ? '' : c.level === 'assembly' ? `assembly:${c.levelId ?? ''}` : c.level);
export function decodeChoice<L extends string>(value: string): PlanChoice<L> {
  const [level, id] = value.split(':');
  return { level: level as L, levelId: level === 'assembly' && id ? Number(id) : null };
}

/** What the screen holds before it is saved: the order's choice and each line's own (null = as the order). */
export interface PlanDraft {
  production: PlanChoice<ProductionLevel>;
  dispatch: PlanChoice<DispatchLevel>;
  own: Record<number, ExecutionPlan | null>;
}

export const draftOf = (view: ExecutionPlanView): PlanDraft => ({
  production: { ...view.plan.production },
  dispatch: { ...view.plan.dispatch },
  own: Object.fromEntries(view.lines.map((l) => [l.lineId, l.own ? { production: { ...l.own.production }, dispatch: { ...l.own.dispatch } } : null])),
});

const sameChoice = (a: PlanChoice | null | undefined, b: PlanChoice | null | undefined) =>
  (a?.level ?? null) === (b?.level ?? null) && (a?.levelId ?? null) === (b?.levelId ?? null);
const samePlan = (a: ExecutionPlan | null, b: ExecutionPlan | null) =>
  (!a && !b) || (!!a && !!b && sameChoice(a.production, b.production) && sameChoice(a.dispatch, b.dispatch));

/** Whether the draft differs from what is saved (or, with nothing saved, whether anything was chosen at all). */
export function draftChanged(draft: PlanDraft, view: ExecutionPlanView): boolean {
  if (!sameChoice(draft.production, view.plan.production) || !sameChoice(draft.dispatch, view.plan.dispatch)) return true;
  return view.lines.some((l) => !samePlan(draft.own[l.lineId] ?? null, l.own));
}

/** The PUT body for a draft: the order's choice, and every line's own (or null). Frozen lines are sent as they are. */
export const inputOf = (draft: PlanDraft, view: ExecutionPlanView, dryRun = false): ExecutionPlanInput => ({
  production: draft.production,
  dispatch: draft.dispatch,
  lines: view.lines.filter((l) => l.made && !l.frozen).map((l) => ({ lineId: l.lineId, own: draft.own[l.lineId] ?? null })),
  ...(dryRun ? { dryRun: true } : {}),
});

/** How many production orders a line makes, said in a few words ("3", "with the order", "none"). */
export function lineCountWords(l: { made: boolean; plan: ExecutionPlan; productionCount: number }): string {
  if (!l.made) return 'None — from stock';
  if (l.plan.production.level === 'order') return 'With the order';
  return String(l.productionCount);
}

/** "Saved by Asha on 18 Oct" / "Not saved yet — the default is shown". */
export function savedWords(view: ExecutionPlanView): string {
  if (!view.saved?.at) return 'Not saved yet — the default is shown. Check it and save.';
  const when = new Date(view.saved.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return `Saved${view.saved.by?.name ? ` by ${view.saved.by.name}` : ''} on ${when}.`;
}
