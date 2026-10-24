import type {
  DispatchLevel, ExecutionPlan, ExecutionPlanInput, ExecutionPlanLine, ExecutionPlanView, PlanChoice, PlanOption, PlanOptionGroup, ProductionLevel,
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
  if (!view.saved?.at && view.nothingToChoose) return 'Nothing to choose — the default is the plan, no save needed.';
  if (!view.saved?.at) return 'Not saved yet — the default is shown. Check it and save.';
  const when = new Date(view.saved.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return `Saved${view.saved.by?.name ? ` by ${view.saved.by.name}` : ''} on ${when}.`;
}

/* ── Choose by result (2026-10-24) ─────────────────────────────────────────────
 * The server labels every option with what it produces and hides the ones that give the same as a simpler one
 * (executionPlanModel.choicesOf). These read its answer — and, from an older server without `options`, build plain
 * options from the words so the screen still works.
 */
type Kind = 'production' | 'dispatch';
const plainOptions = <L extends string>(kind: Kind, levels: { id: number; name: string }[]): PlanOptionGroup<L> => {
  const words = (kind === 'production' ? PRODUCTION_WORDS : DISPATCH_WORDS) as Record<string, string>;
  const base = (kind === 'production' ? ['order', 'line', 'unit'] : ['same', 'line', 'unit']).map((level) => ({ level, levelId: null }));
  const all = [...base, ...levels.map((lv) => ({ level: 'assembly', levelId: lv.id }))];
  return {
    note: null,
    options: all.map((c) => {
      const name = c.level === 'assembly' ? `Per sub-assembly: ${levels.find((lv) => lv.id === c.levelId)?.name ?? ''}` : words[c.level];
      return { key: encodeChoice(c), choice: c as PlanChoice<L>, name, label: name, count: null, problem: null, hidden: false, sameAs: null };
    }),
  };
};

/** A bar's options (the order's choice). */
export function barOptions<K extends Kind>(view: ExecutionPlanView, kind: K): PlanOptionGroup<K extends 'production' ? ProductionLevel : DispatchLevel> {
  return (view.options?.[kind] ?? plainOptions(kind, view.levels)) as PlanOptionGroup<K extends 'production' ? ProductionLevel : DispatchLevel>;
}

/** A line's select options. */
export function lineOptionGroup<K extends Kind>(line: ExecutionPlanLine, kind: K): PlanOptionGroup<K extends 'production' ? ProductionLevel : DispatchLevel> {
  return (line.options?.[kind] ?? plainOptions(kind, line.levels)) as PlanOptionGroup<K extends 'production' ? ProductionLevel : DispatchLevel>;
}

/** The options shown: every one not folded into a simpler one — and always the one chosen now (`current`). */
export const visibleOptions = <L extends string>(group: PlanOptionGroup<L>, current: string | null | undefined): PlanOption<L>[] =>
  group.options.filter((o) => !o.hidden || o.key === current);

/** The per-line table matters only when the order has more than one line. */
export const showsLineTable = (view: ExecutionPlanView) => view.lines.length > 1;
