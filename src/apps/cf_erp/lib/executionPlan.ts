import type {
  DispatchLevel, ExecutionPlan, ExecutionPlanInput, ExecutionPlanLine, ExecutionPlanView, PlanChoice, PlanGroup, PlanOption, PlanOptionGroup, PlanPiece,
  ProductionLevel,
} from '../api/executionPlan';

/**
 * Words and list maths for the EXECUTION PLAN step (components/OrderStructure/ExecutionPlanPanel.tsx, init.sql §72).
 * The rules themselves are the server's (executionPlanModel.js): this file only encodes choices for the selects,
 * works out batches from what the person types (§97) and builds what is sent.
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
  assembly: 'One production order for each sub-assembly (e.g. each Girder line), and one for the rest of each unit.',
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

/** Whether production at this level is split into pieces that can be batched (per unit / per sub-assembly). */
export const isSplit = (level: ProductionLevel | null | undefined) => level === 'unit' || level === 'assembly';

/**
 * What the screen holds before it is saved: the order's choice, each line's own (null = the same as the whole order)
 * and each line's batches (wherever they are stored — the order's row or the line's own).
 */
export interface PlanDraft {
  production: PlanChoice<ProductionLevel>;
  dispatch: PlanChoice<DispatchLevel>;
  own: Record<number, ExecutionPlan | null>;
  groups: Record<number, PlanGroup[]>;
}

const copyGroups = (gs: PlanGroup[] | undefined | null): PlanGroup[] => (gs ?? []).map((g) => ({ name: g.name ?? null, keys: [...g.keys] }));

export const draftOf = (view: ExecutionPlanView): PlanDraft => ({
  production: { ...view.plan.production },
  dispatch: { ...view.plan.dispatch },
  own: Object.fromEntries(view.lines.map((l) => [l.lineId, l.own ? { production: { ...l.own.production }, dispatch: { ...l.own.dispatch } } : null])),
  groups: Object.fromEntries(view.lines.map((l) => [l.lineId, copyGroups(l.groups)])),
});

const sameChoice = (a: PlanChoice | null | undefined, b: PlanChoice | null | undefined) =>
  (a?.level ?? null) === (b?.level ?? null) && (a?.levelId ?? null) === (b?.levelId ?? null);
const samePlan = (a: ExecutionPlan | null, b: ExecutionPlan | null) =>
  (!a && !b) || (!!a && !!b && sameChoice(a.production, b.production) && sameChoice(a.dispatch, b.dispatch));
const groupsWord = (gs: PlanGroup[] | undefined | null) => JSON.stringify((gs ?? []).map((g) => [g.name ?? null, g.keys]));
export const sameGroups = (a: PlanGroup[] | undefined | null, b: PlanGroup[] | undefined | null) => groupsWord(a) === groupsWord(b);

/** A line's production choice in the draft: its own, else the order's. */
export const lineProduction = (draft: PlanDraft, lineId: number): PlanChoice<ProductionLevel> => draft.own[lineId]?.production ?? draft.production;

/** Whether the draft differs from what is saved (or, with nothing saved, whether anything was chosen at all). */
export function draftChanged(draft: PlanDraft, view: ExecutionPlanView): boolean {
  if (!sameChoice(draft.production, view.plan.production) || !sameChoice(draft.dispatch, view.plan.dispatch)) return true;
  return view.lines.some((l) => !samePlan(draft.own[l.lineId] ?? null, l.own) || !sameGroups(draft.groups[l.lineId], l.groups));
}

/**
 * The PUT body for a draft: the order's choice with the batches of every line that follows it, and every line's own
 * (or null) with its batches. Frozen lines are not sent (their plan is fixed), but their batches stay in the order's.
 */
export const inputOf = (draft: PlanDraft, view: ExecutionPlanView, dryRun = false): ExecutionPlanInput => {
  const followers = view.lines.filter((l) => l.made && !draft.own[l.lineId]);
  const groups = isSplit(draft.production.level) ? followers.flatMap((l) => draft.groups[l.lineId] ?? []).filter((g) => g.keys.length) : [];
  return {
    production: draft.production,
    dispatch: draft.dispatch,
    ...(groups.length || view.plan.groups?.length ? { groups } : {}),
    lines: view.lines.filter((l) => l.made && !l.frozen).map((l) => {
      const own = draft.own[l.lineId] ?? null;
      if (!own) return { lineId: l.lineId, own: null };
      const gs = isSplit(own.production.level) ? (draft.groups[l.lineId] ?? []).filter((g) => g.keys.length) : [];
      return { lineId: l.lineId, own: gs.length || l.groups?.length ? { ...own, groups: gs } : own };
    }),
    ...(dryRun ? { dryRun: true } : {}),
  };
};

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

/** An option's words without jargon: "Per Girder line — …", "Same as the whole order: …". */
export const plainLabel = (label: string | null | undefined) => String(label ?? '')
  .replace(/^Per sub-assembly: /, 'Per ')
  .replace(/^As the order: /, 'Same as the whole order: ');

/* ── BATCHES (§97, 2026-11-01) ─────────────────────────────────────────────────
 * "They can group different things in a level into a PO … it can break into different sizes for each PO." The person
 * types batch sizes ("4, 8") and the pieces fill the batches in tree order; a click on a piece moves it to the next
 * batch, so rows can be mixed freely. Pieces in no batch are a production order each, as before.
 */

/** "4, 8" / "4 8" / "4+8" → [4, 8]. Never throws; anything else is ignored. */
export function parseSizes(text: string | null | undefined): number[] {
  return (String(text ?? '').match(/\d+/g) ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
}

/** The pieces in tree order, cut into batches of these sizes; what is left over stays on its own. */
export function groupsFromSizes(pieces: PlanPiece[], sizes: number[]): PlanGroup[] {
  const out: PlanGroup[] = [];
  let at = 0;
  for (const s of sizes) {
    if (at >= pieces.length) break;
    out.push({ name: null, keys: pieces.slice(at, at + s).map((p) => p.key) });
    at += s;
  }
  return out;
}

/** Batches of n, the last one smaller when it does not divide: 12 of 5 → [5, 5, 2]. */
export function equalSizes(total: number, n: number): number[] {
  if (!Number.isInteger(n) || n <= 0 || total <= 0) return [];
  const out: number[] = [];
  for (let left = total; left > 0; left -= n) out.push(Math.min(n, left));
  return out;
}

/** The batch each piece is in (by index), from the batches. */
export function batchIndex(groups: PlanGroup[]): Map<string, number> {
  const m = new Map<string, number>();
  groups.forEach((g, i) => g.keys.forEach((k) => { if (!m.has(k)) m.set(k, i); }));
  return m;
}

/** The batches tidied: keys in tree order, no unknown keys, no empty batch. */
export function tidyGroups(groups: PlanGroup[], pieces: PlanPiece[]): PlanGroup[] {
  const order = new Map(pieces.map((p, i) => [p.key, i]));
  return groups
    .map((g) => ({ name: g.name ?? null, keys: g.keys.filter((k) => order.has(k)).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)) }))
    .filter((g) => g.keys.length > 0);
}

/**
 * A click on a piece: on to the next batch. On its own → batch 1; the last batch → a new batch (when it shares the
 * one it leaves), else back on its own.
 */
export function movePiece(groups: PlanGroup[], key: string, pieces: PlanPiece[]): PlanGroup[] {
  const at = batchIndex(groups).get(key) ?? -1;
  const next = groups.map((g) => ({ ...g, keys: g.keys.filter((k) => k !== key) }));
  const to = at + 1;
  if (to < groups.length) next[to].keys.push(key);
  else if (at === -1 || groups[at].keys.length > 1) next.push({ name: null, keys: [key] });
  return tidyGroups(next, pieces);
}

/** The batch sizes as typed: "4, 8". */
export const sizesText = (groups: PlanGroup[]) => groups.map((g) => g.keys.length).join(', ');

/** A plain plural: "Girder line" → "Girder lines" (a word ending in s stays). */
export const plural = (word: string, n: number) => (n === 1 || /s$/i.test(word) ? word : `${word}s`);

/**
 * What a line's batches make, in a few lines: [{ title: "PO 1 — 4 Girder lines", labels }], then the pieces on their
 * own ("8 Girder lines on their own — one production order each"). `noun`: what a piece is called.
 */
export function batchSummary(pieces: PlanPiece[], groups: PlanGroup[], noun: string): { batches: { title: string; labels: string[] }[]; alone: PlanPiece[] } {
  const label = new Map(pieces.map((p) => [p.key, p.label]));
  const batches = tidyGroups(groups, pieces).map((g, i) => ({
    title: `${g.name || `Batch ${i + 1}`} — ${g.keys.length} ${plural(noun, g.keys.length)}`,
    labels: g.keys.map((k) => label.get(k) ?? k),
  }));
  const used = batchIndex(groups);
  return { batches, alone: pieces.filter((p) => !used.has(p.key)) };
}
