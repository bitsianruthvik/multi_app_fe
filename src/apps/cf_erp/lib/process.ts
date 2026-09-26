import type {
  OrderProcessLine, OrderStage, OrderType, ProcessRule, ProcessStage, ProcessStageInput, RecordStatus,
  StageBlocker, StageDecidedBy, StageKind, StageState,
} from '../api/types';

/**
 * Words and list maths for processes — how an order is worked through the
 * office, stage by stage.
 *
 * A process is not a flow. In this app a flow is how a girder is *made* (cut,
 * weld, paint); a process is the office's running order for a whole sales
 * order. The two would be confused daily, so nothing here ever says "flow",
 * "step" or "routing", and every sentence a user reads is built in this file
 * rather than glued together in the page.
 */

/** Said in place of hiding a control, so a read-only role learns why it cannot act. */
export const NO_MANAGE = 'You can see processes, but your role cannot change them. Ask an administrator for the setup permission.';

/** How a whole process reads on the list when nothing points at it. */
export const APPLIES_TO_NOTHING = 'Nothing yet';

const ORDER_TYPE_WORD: Record<OrderType, string> = { customer: 'customer orders', stock: 'stock orders' };
const ONE_ORDER_WORD: Record<OrderType, string> = { customer: 'A customer order', stock: 'A stock order' };

/** The choices on the rule dialog, in the same words the rule is read back in. */
export const ORDER_TYPE_CHOICES: { value: '' | OrderType; label: string }[] = [
  { value: '', label: 'Any kind of order' },
  { value: 'customer', label: 'Customer orders' },
  { value: 'stock', label: 'Stock orders' },
];

/** How narrow a rule is. A narrower rule beats a wider one. */
export type RuleScope = 'customer_and_type' | 'customer' | 'order_type' | 'default';

export const SCOPE_RANK: Record<RuleScope, number> = { customer_and_type: 3, customer: 2, order_type: 1, default: 0 };

export const SCOPE_WORD: Record<RuleScope, string> = {
  customer_and_type: 'Customer and kind',
  customer: 'One customer',
  order_type: 'One kind of order',
  default: 'House default',
};

type RuleLike = Pick<ProcessRule, 'customer' | 'orderType'>;

export function ruleScope(rule: RuleLike): RuleScope {
  if (rule.customer && rule.orderType) return 'customer_and_type';
  if (rule.customer) return 'customer';
  if (rule.orderType) return 'order_type';
  return 'default';
}

/** Who a rule covers, in the fewest words: "Kerney, customer orders" · "Everything else". */
export function ruleTitle(rule: RuleLike): string {
  const who = rule.customer?.name;
  const what = rule.orderType ? ORDER_TYPE_WORD[rule.orderType] : null;
  if (who && what) return `${who}, ${what}`;
  if (who) return `${who}, any order`;
  if (what) return `Any customer, ${what}`;
  return 'Everything else';
}

/** The same rule as a full sentence, so nobody has to decode the short form. */
export function ruleSentence(rule: RuleLike): string {
  const who = rule.customer?.name;
  if (who && rule.orderType) return `${ONE_ORDER_WORD[rule.orderType]} from ${who} follows this process.`;
  if (who) return `Any order from ${who} follows this process, whatever kind it is.`;
  if (rule.orderType) return `${ONE_ORDER_WORD[rule.orderType]} follows this process, whoever it is for.`;
  return 'Any order that no narrower rule claims follows this process.';
}

/** Most specific first — the order an order picks them in. */
export function sortRules<T extends RuleLike>(rules: T[]): T[] {
  return [...rules].sort((a, b) => SCOPE_RANK[ruleScope(b)] - SCOPE_RANK[ruleScope(a)] || ruleTitle(a).localeCompare(ruleTitle(b)));
}

/** Every rule on a process in words — the list's "Applies to" column. */
export function appliesTo(rules: RuleLike[]): string {
  return rules.length ? sortRules(rules).map(ruleTitle).join(' · ') : '';
}

/** A process is the house default when one of its rules names neither a customer nor a kind. */
export const isHouseDefault = (rules: RuleLike[]) => rules.some((r) => ruleScope(r) === 'default');

/**
 * Only an active process is handed to a new order: a draft is one somebody is
 * still writing, an obsolete one is retired. A rule pointing at either does
 * nothing, silently — which is why the API reports it, and why this screen
 * says it in the API's own words (processService.resolveProcess).
 */
export const notActiveReason = (code: string, status: RecordStatus) =>
  `A rule points at ${code}, but it is ${status === 'draft' ? 'still a draft' : 'obsolete'} — activate it before orders can follow it.`;

/** Why a kind cannot be added twice, in the API's words. */
export const ALREADY_ADDED = 'Already in this process — a stage happens once.';

/**
 * Kinds of stage the app cannot work yet.
 *
 * A stage listed here has a real kind on the backend and a real state, but no
 * screen, so it reports "to do" for ever. While it is required that is a gate
 * nobody can pass, and marking the stage optional is the way out — which is
 * why the warning below says so rather than leaving people to find out.
 *
 * `nesting` was here until its screen shipped (2026-09-25). Delete an entry the
 * day its screen ships; the map is allowed to be empty.
 */
const NO_SCREEN_YET: Record<string, string> = {};

export const noScreenYet = (stageKey: string): string | null => NO_SCREEN_YET[stageKey] ?? null;

/** The same warning with what it costs, and what to do about it. */
export function noScreenWarning(stage: Pick<ProcessStage, 'stageKey' | 'requirement'>): string | null {
  const base = noScreenYet(stage.stageKey);
  if (!base) return null;
  return stage.requirement === 'required'
    ? `${base} While it must be worked, an order with a material that answers NESTING with yes can never be confirmed — mark it optional until nesting is built.`
    : `${base} It is optional, so it does not hold an order up.`;
}

const prettyKey = (key: string) => key.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());

export const kindOf = (stageKey: string, kinds: StageKind[]) => kinds.find((k) => k.key === stageKey) ?? null;

/** What a stage is called: its own name if it was given one, else the kind's. */
export function stageTitle(stage: Pick<ProcessStage, 'stageKey' | 'label'>, kinds: StageKind[]): string {
  return stage.label?.trim() || kindOf(stage.stageKey, kinds)?.label || prettyKey(stage.stageKey);
}

/** The kind's own name, shown beside a stage that was renamed. */
export function kindName(stageKey: string, kinds: StageKind[]): string {
  return kindOf(stageKey, kinds)?.label ?? prettyKey(stageKey);
}

/** What the override specification does — the whole point of setting one. */
export function overrideSentence(stage: Pick<ProcessStage, 'overrideSpec'>): string {
  return stage.overrideSpec
    ? `A line whose item says no to ${stage.overrideSpec.name} skips this stage.`
    : 'No specification: whether the stage applies is worked out from the order’s own data.';
}

export const requirementWord = (r: ProcessStage['requirement']) => (r === 'optional' ? 'Optional' : 'Must be worked');

export const requirementHelp = (r: ProcessStage['requirement']) =>
  r === 'optional' ? 'The order can move past this stage without it.' : 'The order waits here until this stage is done.';

/** The whole list with one stage moved — reordering is the normal edit here. */
export function moveStage(stages: ProcessStage[], index: number, dir: -1 | 1): ProcessStage[] {
  const to = index + dir;
  if (to < 0 || to >= stages.length) return stages;
  const next = [...stages];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** Numbered 1…n, so what is on screen is what was sent. */
export const renumber = (stages: ProcessStage[]) => stages.map((s, i) => ({ ...s, sequence: i + 1 }));

/**
 * One stage as the API wants it. `settings` goes back exactly as it came:
 * what a stage's screen is configured with belongs to that screen, and this
 * page must not be the thing that quietly drops it.
 */
export function toStageInput(stage: ProcessStage): ProcessStageInput {
  return {
    stageKey: stage.stageKey,
    label: stage.label,
    requirement: stage.requirement,
    overrideSpecId: stage.overrideSpec?.id ?? null,
    settings: stage.settings ?? null,
  };
}

// ── Walking an order through its process ─────────────────────────────────────

/**
 * Everything below builds the words the order's stage tabs say. The tabs ARE
 * the process: one per stage, in the process's own sequence, each marked with
 * the chosen line's state. They render one object — GET /orders/:id/process —
 * and decide nothing for themselves: the state, the detail and the blockers are
 * the API's, and these functions only choose the English around them.
 *
 * The one rule the tabs live by: nothing is ever locked. Every stage is one
 * click away at any time, a stage that is unfinished offers to be skipped
 * rather than going dead, and Confirm is the single hard gate.
 */

/** A state in one or two words. */
export const STATE_WORD: Record<StageState, string> = {
  todo: 'To do',
  partial: 'Part done',
  done: 'Done',
  not_applicable: 'Not needed',
};

/** The same state as a sentence, for hover text. */
export const STATE_HELP: Record<StageState, string> = {
  todo: 'Nothing here has been done yet.',
  partial: 'Some of this is done; some is still outstanding.',
  done: 'Nothing is outstanding here.',
  not_applicable: 'This stage is not needed here.',
};

/**
 * Whether a stage stops being a gate — the same test the API applies
 * (processService `satisfied`), so the button and the backend agree about what
 * "done" means. Optional stages count as satisfied whatever they report.
 */
export const stageSatisfied = (s: Pick<OrderStage, 'state' | 'requirement'>) =>
  s.state === 'done' || s.state === 'not_applicable' || s.requirement === 'optional';

/** The first stage that still holds this list up — where the work is. Null when nothing does. */
export const firstOpenStage = (stages: OrderStage[]): string | null =>
  stages.find((s) => !stageSatisfied(s))?.stageKey ?? null;

/**
 * Where an order opens when a link names no tab: on the stage that needs work,
 * not wherever somebody stopped last time — the point of a process the API
 * works out. Failing that, the first stage with anything still outstanding
 * (an optional one), and failing that, the start of the road.
 */
export const landingStage = (stages: OrderStage[]): string | null =>
  firstOpenStage(stages)
  ?? stages.find((s) => s.state === 'todo' || s.state === 'partial')?.stageKey
  ?? stages[0]?.stageKey
  ?? null;

/**
 * The forward button. Never dead: a stage that is not finished offers to be
 * left for later, by name, rather than refusing to move.
 */
export const forwardLabel = (next: OrderStage, satisfied: boolean) =>
  `${satisfied ? 'Next' : 'Skip for now'}: ${next.label}`;

export const forwardHelp = (next: OrderStage, satisfied: boolean) =>
  satisfied
    ? `Move on to ${next.label}.`
    : `Leave this for later and move on to ${next.label}. Nothing is lost, and its tab stays one click away.`;

/**
 * A stage tab read aloud: its name, where it sits in the sequence, how far this
 * line has got, and whether it is the next one that needs work. The tab itself
 * shows only a mark, so the words live here.
 */
export function stageTabName(stage: OrderStage, position: number, of: number, next: boolean): string {
  const optional = stage.requirement === 'optional' ? ', optional' : '';
  return `${stage.label}, stage ${position} of ${of}${optional}: ${STATE_WORD[stage.state].toLowerCase()}${next ? ' — the next stage that needs work' : ''}`;
}

/** Beside the line switcher: the marks on the tabs are this line's, not the order's. */
export const WORKING_ON_HELP = 'The stages show this line’s own state.';

/** In place of the line switcher, while there is nothing to switch between. */
export const NO_LINES_YET = 'No lines yet, so the stages show the order’s own state.';

/** A process was found but it has no stages — an empty row of tabs would say nothing at all. */
export const noStagesReason = (p: { code: string; name: string }) =>
  `This order follows ${p.name} (${p.code}), which has no stages yet — so there is nothing to walk through. Add stages to the process and they appear here as tabs.`;

/** Who decided a stage applies — worth naming, because the two look identical. */
export const DECIDED_BY_HELP: Record<StageDecidedBy, string> = {
  always: 'Every order has this stage.',
  data: 'Worked out from this order’s own data.',
  declared: 'A specification on the item settled it, rather than the data.',
};

/** A stage that this line does not need, said plainly rather than hidden. */
export const notForThisLine = (stage: OrderStage, lineNo: number) =>
  `${stage.label} is not needed for line ${lineNo}.`;

/**
 * The next line this stage does apply to, starting after the one being worked
 * on and wrapping round. Null when no other line needs it either.
 */
export function nextLineFor(lines: OrderProcessLine[], stageKey: string, fromLineId: number | null): OrderProcessLine | null {
  if (!lines.length) return null;
  const at = lines.findIndex((l) => l.lineId === fromLineId);
  for (let i = 1; i <= lines.length; i += 1) {
    const l = lines[(Math.max(at, 0) + i) % lines.length];
    if (l.lineId === fromLineId) continue;
    if (l.stages.find((s) => s.stageKey === stageKey)?.applies) return l;
  }
  return null;
}

/** One line in the switcher: enough to recognise it without reading the table. */
export const lineLabel = (l: OrderProcessLine) =>
  `Line ${l.lineNo} · ${l.item?.code ?? l.item?.name ?? 'nothing chosen'} ×${l.quantity}`;

/** A blocker's owner, for the list under a refused Confirm. */
export const blockerWho = (b: StageBlocker) => (b.lineNo != null ? `Line ${b.lineNo}` : 'This order');

/**
 * Stages the app can describe but cannot yet work.
 *
 * Each has a real kind on the backend and a real state, so the process is
 * honest about the stage happening — but no screen exists to do it on. Saying
 * that plainly, and pointing at where the work is done today, beats a panel
 * that looks like a screen and does nothing. Delete an entry the day its
 * screen ships.
 */
export const UNBUILT_STAGE: Record<string, { what: string; today: string; soon: string }> = {
  buying: {
    what: 'Buying is getting in the material the order consumes but does not make.',
    today: 'Shortages are raised from the buy list under Inventory, which turns them into purchase orders.',
    soon: 'A buying screen that works from this order alone is still to come.',
  },
};

export const isUnbuilt = (stageKey: string) => Object.prototype.hasOwnProperty.call(UNBUILT_STAGE, stageKey);

/** What confirming does, said before the button rather than after it. */
export const CONFIRM_WHAT_HAPPENS = [
  'The order is committed: it stops being an inquiry and becomes a job.',
  'Its lines can be released to production, one whole line at a time.',
  'It can only be closed or cancelled from then on — never moved back to inquiry or quoted.',
];

export const CONFIRM_WHAT_DOES_NOT = [
  'Nothing is released to the shop floor, and no material is reserved or issued.',
  'Nothing is bought: shortages still go through the buy list.',
  'A structure that is still being drawn stays editable until its line is released.',
];

/**
 * Confirming is the process's one hard gate — and the order's header has a
 * Confirm button of its own that the gate does not touch. Saying so is the
 * difference between a screen that explains itself and one that looks broken.
 */
export const CONFIRM_STILL_ON_THE_PAGE = 'The order’s own Confirm button, at the top of the page, still works; the process is asking for these to be settled first.';
