import type { FlowStep, FlowStepTime, FlowStepTimePart, FlowStepsPayload, TimeView, TimingRule, WaitRelation } from '../api/types';

/**
 * The flow page's steps as data — the picture both of its modes draw, and edit mode's pending draft.
 * Nothing is sent while a flow is being edited: the page works on a DRAFT and Save sends the whole of
 * it once (PUT /flows/:id/steps).
 *
 * A flow is drawn in LANES. Lane 1 (lanes[0]) is the trunk: the flow starts and ends in it. A SPLIT
 * opens another lane beside a point of an existing one; from there the two run side by side. A MERGE
 * closes a lane into a step of another lane — the meeting step — which then waits for both. Every lane
 * a split opened must be closed again before the flow can be saved.
 *
 * What the draft holds is only the drawing: each lane's steps top to bottom, the step it split after
 * (`from`) and the step it closes into (`into`). What each step STARTS AFTER is worked out from that
 * (graphOf), never typed: inside a lane the step above; the first step of a lane, the step the lane
 * split after; a meeting step, also the last step of every lane that closes into it. Rows — and so
 * the numbers 10, 20, 30 … — are how deep a step sits in that order (layoutOf).
 *
 * Every function returns a new draft and leaves its argument alone, so Cancel is "throw the draft
 * away", and Undo is "take the one before".
 */

export interface DraftOperation { id: number; code: string; name: string; status: 'active' | 'inactive' }

export interface DraftWait {
  key: string;
  /** The saved rule's id; null for one added in this edit. */
  id: number | null;
  relation: WaitRelation;
  targetDefinitionId: number | null;
  targetOperationId: number | null;
  requiredStatus: 'started' | 'done';
  notes: string | null;
  /** The rule in one sentence. */
  text: string;
}
export type NewWait = Omit<DraftWait, 'key' | 'id'>;

export interface DraftStep {
  key: string;
  /** The saved step's id; null for one added in this edit. */
  id: number | null;
  operation: DraftOperation;
  stepName: string;
  notes: string;
  waits: DraftWait[];
  /** Steps it ALSO starts after that lanes cannot draw (a legacy flow's criss-cross). Kept, shown in words, removable. */
  extra: string[];
}

export interface DraftLane {
  key: string;
  /** Its steps, top to bottom. */
  steps: string[];
  /** The step it split after; null = it starts with the flow. */
  from: string | null;
  /** The meeting step it closes into (a step of another lane); null = still open. The trunk never closes. */
  into: string | null;
}

export interface FlowDraft {
  steps: Record<string, DraftStep>;
  /** Left to right as drawn. lanes[0] is the trunk and is always there. */
  lanes: DraftLane[];
  /** The next key for something new. */
  next: number;
}

/** A gap of a lane: before its step `index` (index = its length: after its last step). */
export interface Gap { lane: string; index: number }

const TRUNK = 'trunk';
const uniq = <T,>(list: T[]) => [...new Set(list)];

/* ---------------------------------------------------------------------------
 * Reading the saved steps
 * ------------------------------------------------------------------------ */

/** What each saved step starts after and its lane. A flow from before lanes says neither: it is read by its numbers. */
export function orderOfSaved(steps: FlowStep[]): Map<number, { lane: number; after: number[] }> {
  const out = new Map<number, { lane: number; after: number[] }>();
  const sorted = [...steps].sort((a, b) => a.sequence - b.sequence || a.id - b.id);
  if (sorted.every((s) => Array.isArray(s.after))) {
    const ids = new Set(sorted.map((s) => s.id));
    for (const s of sorted) out.set(s.id, { lane: s.lane ?? 0, after: (s.after ?? []).filter((a) => ids.has(a)) });
    return out;
  }
  // Same number = side by side, each after every step of the number before.
  let before: number[] = [];
  let row: number[] = [];
  let seq: number | null = null;
  for (const s of sorted) {
    if (seq !== s.sequence) { if (row.length) before = row; row = []; seq = s.sequence; }
    out.set(s.id, { lane: row.length, after: [...before] });
    row.push(s.id);
  }
  return out;
}

/** Depth of every node of an order (1 = starts after nothing); null if it has a circle. */
function depthsOf<K>(keys: K[], afterOf: (k: K) => K[]): Map<K, number> | null {
  const depth = new Map<K, number>();
  const busy = new Set<K>();
  let circle = false;
  const visit = (k: K): number => {
    const known = depth.get(k);
    if (known != null) return known;
    if (busy.has(k)) { circle = true; return 0; }
    busy.add(k);
    let d = 1;
    for (const a of afterOf(k)) d = Math.max(d, visit(a) + 1);
    busy.delete(k);
    depth.set(k, d);
    return d;
  };
  for (const k of keys) visit(k);
  return circle ? null : depth;
}

/** The saved steps as a draft: lanes rebuilt from each step's lane and what it starts after. */
export function draftOf(steps: FlowStep[]): FlowDraft {
  const order = orderOfSaved(steps);
  const key = (id: number) => `s${id}`;
  const depth = depthsOf(steps.map((s) => s.id), (id) => order.get(id)?.after ?? []) ?? new Map(steps.map((s, i) => [s.id, i + 1]));
  const sorted = [...steps].sort((a, b) => (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0) || (order.get(a.id)?.lane ?? 0) - (order.get(b.id)?.lane ?? 0) || a.id - b.id);
  const out: FlowDraft = { steps: {}, lanes: [], next: 1 };
  const made: { lane: DraftLane; col: number; start: number }[] = [];
  const open = new Map<number, DraftLane>();          // column -> the lane open in it
  const laneOf = new Map<string, DraftLane>();
  const tail = (l: DraftLane) => l.steps[l.steps.length - 1];
  const openTail = (k: string) => { const l = laneOf.get(k); return !!l && l.into == null && tail(l) === k; };
  for (const s of sorted) {
    const k = key(s.id);
    const col = order.get(s.id)?.lane ?? 0;
    const afters = (order.get(s.id)?.after ?? []).map(key);
    let lane = open.get(col);
    let rest: string[];
    if (lane && afters.includes(tail(lane))) {
      rest = afters.filter((a) => a !== tail(lane as DraftLane));
      lane.steps.push(k);
    } else {
      // A lane starts here: it split after the step that is not simply another lane's end, if there is one.
      const origin = afters.find((a) => !openTail(a)) ?? afters[0] ?? null;
      lane = { key: made.length ? `l${s.id}` : TRUNK, steps: [k], from: origin, into: null };
      made.push({ lane, col, start: depth.get(s.id) ?? 0 });
      rest = afters.filter((a) => a !== origin);
    }
    laneOf.set(k, lane);
    open.set(col, lane);
    const extra: string[] = [];
    for (const a of rest) {
      const closing = laneOf.get(a);
      // A lane that ends at `a` and is still open closes into this step. The trunk never closes.
      if (closing && closing !== lane && closing !== made[0].lane && openTail(a)) {
        closing.into = k;
        for (const [c, l] of open) if (l === closing) open.delete(c);
      } else extra.push(a);
    }
    out.steps[k] = {
      key: k, id: s.id, operation: { ...s.operation }, stepName: s.stepName ?? '', notes: s.notes ?? '', extra,
      waits: s.waits.map((w) => ({
        key: `w${w.id}`, id: w.id, relation: w.relation, targetDefinitionId: w.targetDefinition?.id ?? null, targetOperationId: w.targetOperation?.id ?? null,
        requiredStatus: w.requiredStatus, notes: w.notes ?? null, text: w.text,
      })),
    };
  }
  if (!made.length) return { ...out, lanes: [{ key: TRUNK, steps: [], from: null, into: null }] };
  const [trunk, ...others] = made;
  out.lanes = [trunk.lane, ...others.sort((a, b) => a.col - b.col || a.start - b.start).map((m) => m.lane)];
  return out;
}

/* ---------------------------------------------------------------------------
 * The order and the picture, worked out from the lanes
 * ------------------------------------------------------------------------ */

const laneOfStep = (draft: FlowDraft, stepKey: string) => draft.lanes.find((l) => l.steps.includes(stepKey)) ?? null;
const lastOf = (lane: DraftLane) => (lane.steps.length ? lane.steps[lane.steps.length - 1] : null);

/** What every step starts after: stepKey -> the keys of the steps before it. */
export function graphOf(draft: FlowDraft): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const lane of draft.lanes) {
    lane.steps.forEach((k, i) => out.set(k, i > 0 ? [lane.steps[i - 1]] : lane.from && draft.steps[lane.from] ? [lane.from] : []));
  }
  for (const lane of draft.lanes) {
    const end = lastOf(lane);
    if (lane.into && end && out.has(lane.into)) out.get(lane.into)?.push(end);
  }
  for (const [k, after] of out) out.set(k, uniq([...after, ...(draft.steps[k]?.extra ?? []).filter((a) => a !== k && out.has(a))]));
  return out;
}

export interface LaneBox {
  lane: DraftLane;
  /** Its column, 0 = the trunk. Lane NUMBER = col + 1. */
  col: number;
  /** The first row it is open in, and the last. */
  start: number;
  end: number;
}

export interface FlowLayout {
  /** stepKey -> its row, 1-based: how deep it sits in the order. */
  row: Map<string, number>;
  rows: number;
  cols: number;
  lanes: LaneBox[];
  /** stepKey -> the columns its card covers (a step alone in its row runs full width; a meeting step covers the lanes it closes). */
  span: Map<string, [number, number]>;
  after: Map<string, string[]>;
  /** True when the draft has a circle (no operation here makes one; a guard for the drawing). */
  circle: boolean;
}

export function layoutOf(draft: FlowDraft): FlowLayout {
  const after = graphOf(draft);
  const keys = draft.lanes.flatMap((l) => l.steps);
  const depth = depthsOf(keys, (k) => after.get(k) ?? []);
  const row = depth ?? new Map(keys.map((k, i) => [k, i + 1]));
  const rows = keys.reduce((m, k) => Math.max(m, row.get(k) ?? 0), 0);
  const boxes: LaneBox[] = [];
  draft.lanes.forEach((lane, i) => {
    const first = lane.steps.length ? row.get(lane.steps[0]) ?? 1 : 1;
    const start = i === 0 ? 1 : Math.min(first, lane.from && row.has(lane.from) ? (row.get(lane.from) as number) + 1 : first);
    const end = i === 0 ? Math.max(rows, 1) : lane.into && row.has(lane.into) ? Math.max(start, (row.get(lane.into) as number) - 1) : Math.max(rows, start);
    // Left to right as the lanes are listed: a lane goes right of every lane before it that is open at the same time.
    let col = 0;
    for (const b of boxes) if (b.start <= end + 1 && start <= b.end + 1) col = Math.max(col, b.col + 1);
    boxes.push({ lane, col, start, end });
  });
  const cols = boxes.reduce((m, b) => Math.max(m, b.col + 1), 1);
  // Spans: a card widens over the columns no lane is open in on its row.
  const span = new Map<string, [number, number]>();
  const busy = (r: number, c: number) => boxes.some((b) => b.col === c && b.start <= r && r <= b.end);
  for (let r = 1; r <= rows; r++) {
    const here = boxes.flatMap((b) => b.lane.steps.filter((k) => row.get(k) === r).map((k) => ({ k, col: b.col }))).sort((a, b) => a.col - b.col);
    const taken = new Set(here.map((h) => h.col));
    for (const h of here) {
      let lo = h.col, hi = h.col;
      while (hi + 1 < cols && !busy(r, hi + 1) && !taken.has(hi + 1)) { hi += 1; taken.add(hi); }
      while (lo - 1 >= 0 && !busy(r, lo - 1) && !taken.has(lo - 1)) { lo -= 1; taken.add(lo); }
      span.set(h.k, [lo, hi]);
    }
  }
  return { row, rows, cols, lanes: boxes, span, after, circle: !depth };
}

/** Lane number (1 = the trunk) of each lane, as drawn. */
export function laneNumbers(draft: FlowDraft, layout: FlowLayout = layoutOf(draft)): Map<string, number> {
  return new Map(layout.lanes.map((b) => [b.lane.key, b.col + 1]));
}

/** What stops a save, in words. Empty = it can be saved. The server says the same. */
export function problemsOf(draft: FlowDraft, layout: FlowLayout = layoutOf(draft)): string[] {
  const out: string[] = [];
  if (layout.circle) out.push('Some steps would wait for each other, so none could start. Undo the last change.');
  layout.lanes.forEach((b, i) => {
    const end = lastOf(b.lane);
    if (i > 0 && b.lane.into == null && end) out.push(`Lane ${b.col + 1} (ends at ${draft.steps[end].operation.code}) is still open — merge it back before saving.`);
  });
  return out;
}

/** The picture as text, rows × lanes — for a test, a log or a report. */
export function diagramOf(draft: FlowDraft, layout: FlowLayout = layoutOf(draft)): string {
  const cell = (text: string) => text.padEnd(8);
  const lines = [`${cell('row')}${Array.from({ length: layout.cols }, (_, c) => cell(`Lane ${c + 1}`)).join('')}`.trimEnd()];
  for (let r = 1; r <= layout.rows; r++) {
    const cells = Array.from({ length: layout.cols }, (_, c) => {
      const box = layout.lanes.find((b) => b.col === c && b.lane.steps.some((k) => layout.row.get(k) === r));
      const k = box?.lane.steps.find((s) => layout.row.get(s) === r);
      if (k) return cell(draft.steps[k].operation.code);
      return cell(layout.lanes.some((b) => b.col === c && b.start <= r && r <= b.end) ? '|' : '');
    });
    lines.push(`${cell(String(r * 10))}${cells.join('')}`.trimEnd());
  }
  return lines.join('\n');
}

/* ---------------------------------------------------------------------------
 * Changing the draft
 * ------------------------------------------------------------------------ */

const newStep = (key: string, operation: DraftOperation): DraftStep => ({ key, id: null, operation: { ...operation }, stepName: '', notes: '', waits: [], extra: [] });
const withLane = (draft: FlowDraft, laneKey: string, fn: (l: DraftLane) => DraftLane): DraftLane[] => draft.lanes.map((l) => (l.key === laneKey ? fn(l) : l));
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * A new step in a lane, at a gap. `beforeSplit`: the gap sits right under a step that lanes split
 * after — put the new step BEFORE the split (those lanes then split after it) rather than beside them.
 */
export function addStep(draft: FlowDraft, gap: Gap, operation: DraftOperation, { beforeSplit = false }: { beforeSplit?: boolean } = {}): FlowDraft {
  const lane = draft.lanes.find((l) => l.key === gap.lane);
  if (!lane) return draft;
  const i = clamp(gap.index, 0, lane.steps.length);
  const key = `n${draft.next}`;
  const above = i > 0 ? lane.steps[i - 1] : null;
  let lanes = withLane(draft, lane.key, (l) => ({ ...l, steps: [...l.steps.slice(0, i), key, ...l.steps.slice(i)] }));
  if (beforeSplit && above) lanes = lanes.map((l) => (l.from === above ? { ...l, from: key } : l));
  return { steps: { ...draft.steps, [key]: newStep(key, operation) }, lanes, next: draft.next + 1 };
}

/** True when lanes split right after the step above this gap — Add then asks "beside them, or before the split?". */
export function splitsAbove(draft: FlowDraft, gap: Gap): boolean {
  const lane = draft.lanes.find((l) => l.key === gap.lane);
  const above = lane && gap.index > 0 ? lane.steps[gap.index - 1] : null;
  return !!above && draft.lanes.some((l) => l.from === above);
}

/**
 * SPLIT: opens a lane beside this point, with its first step. From here down the lane it split from
 * and the new one run side by side. The new lane is drawn immediately right of the lane it split from
 * (and of the lanes that one already opened and has not closed above this point) — every lane further
 * right moves one over.
 */
export function splitAt(draft: FlowDraft, gap: Gap, operation: DraftOperation): FlowDraft {
  const at = draft.lanes.findIndex((l) => l.key === gap.lane);
  if (at < 0) return draft;
  const lane = draft.lanes[at];
  const i = clamp(gap.index, 0, lane.steps.length);
  const from = i > 0 ? lane.steps[i - 1] : lane.from;
  const layout = layoutOf(draft);
  const fromRow = from ? layout.row.get(from) ?? 0 : 0;
  // The lanes that came out of this one and are still open below the split point stay to its left.
  const family = new Set([lane.key]);
  let grown = true;
  while (grown) {
    grown = false;
    for (const l of draft.lanes) {
      const parent = l.from ? laneOfStep(draft, l.from) : null;
      if (!family.has(l.key) && parent && family.has(parent.key)) { family.add(l.key); grown = true; }
    }
  }
  let place = at + 1;
  draft.lanes.forEach((l, idx) => {
    const stillOpen = l.into == null || (layout.row.get(l.into) ?? 0) > fromRow;
    if (idx > at && family.has(l.key) && stillOpen) place = Math.max(place, idx + 1);
  });
  const key = `n${draft.next}`;
  const opened: DraftLane = { key: `nl${draft.next}`, steps: [key], from: from ?? null, into: null };
  return { steps: { ...draft.steps, [key]: newStep(key, operation) }, lanes: [...draft.lanes.slice(0, place), opened, ...draft.lanes.slice(place)], next: draft.next + 1 };
}

export interface Merge {
  /** The lanes that end here. */
  closing: string[];
  /** The lane the flow continues in — the meeting step is one of its steps. */
  target: string;
  /** The meeting step: an existing step of the target lane, or the operation of a new one at its end. */
  at: string | { operation: DraftOperation };
}

/**
 * MERGE: closes lanes into a step of another lane. That meeting step then starts after the step
 * above it in its own lane AND the last step of every lane closed into it.
 */
export function mergeLanes(draft: FlowDraft, merge: Merge): { draft: FlowDraft; error: string | null } {
  const refuse = (error: string) => ({ draft, error });
  const target = draft.lanes.find((l) => l.key === merge.target);
  if (!target) return refuse('Choose the lane to continue in.');
  const closing = uniq(merge.closing).filter((k) => k !== merge.target);
  if (!closing.length) return refuse('Choose the lanes that meet here.');
  for (const k of closing) {
    const i = draft.lanes.findIndex((l) => l.key === k);
    if (i < 0) return refuse('That lane is no longer there.');
    if (i === 0) return refuse('Lane 1 is the trunk — the other lanes close into it, not it into them.');
    if (draft.lanes[i].into != null) return refuse('That lane is already closed.');
    if (!draft.lanes[i].steps.length) return refuse('An empty lane cannot be merged.');
  }
  let next: FlowDraft = draft;
  let meeting: string;
  if (typeof merge.at === 'string') {
    if (!target.steps.includes(merge.at)) return refuse('The step they meet at is not in the lane they continue in.');
    meeting = merge.at;
  } else {
    meeting = `n${draft.next}`;
    next = { steps: { ...draft.steps, [meeting]: newStep(meeting, merge.at.operation) }, lanes: withLane(draft, target.key, (l) => ({ ...l, steps: [...l.steps, meeting] })), next: draft.next + 1 };
  }
  next = { ...next, lanes: next.lanes.map((l) => (closing.includes(l.key) ? { ...l, into: meeting } : l)) };
  if (layoutOf(next).circle) return refuse('They cannot meet there: one of these lanes only starts further down. Pick a step below where it splits off.');
  return { draft: next, error: null };
}

export interface MergeChoice { key: string; number: number; ends: string | null; /** It can END here (open, not the trunk, has a step). */ closable: boolean; isGapLane: boolean }

/**
 * What Merge can offer at a gap: every lane, left to right — the ones still open can END here, and any
 * of them can be the one the flow continues in (a lane that closed further up takes the meeting step
 * at its end, before its own merge). `available` = there is a lane to close.
 */
export function mergeChoices(draft: FlowDraft, gap: Gap): { lanes: MergeChoice[]; below: string | null; available: boolean } {
  const layout = layoutOf(draft);
  const mine = layout.lanes.find((b) => b.lane.key === gap.lane);
  if (!mine) return { lanes: [], below: null, available: false };
  const below = mine.lane.steps[gap.index] ?? null;
  const closable = (b: LaneBox) => b.lane !== layout.lanes[0].lane && b.lane.into == null && b.lane.steps.length > 0;
  const lanes = layout.lanes
    .map((b) => ({ key: b.lane.key, number: b.col + 1, ends: lastOf(b.lane) ? draft.steps[lastOf(b.lane) as string].operation.code : null, closable: closable(b), isGapLane: b === mine }));
  // The gap's own lane can only close at its END; a lane cannot close above its own steps.
  const gapLaneCloses = closable(mine) && below == null;
  const others = lanes.filter((l) => !l.isGapLane);
  const available = others.some((l) => l.closable) || (gapLaneCloses && others.length > 0);
  return { lanes: lanes.map((l) => (l.isGapLane ? { ...l, closable: gapLaneCloses } : l)), below, available };
}

/** The steps of `target` the closing lanes could meet at without a circle, top to bottom — and the one to suggest. */
export function meetingSteps(draft: FlowDraft, closing: string[], target: string, gap: Gap | null = null): { steps: string[]; suggested: string | null } {
  const lane = draft.lanes.find((l) => l.key === target);
  if (!lane) return { steps: [], suggested: null };
  const from = gap && gap.lane === target ? gap.index : 0;
  const steps = lane.steps.filter((k, i) => i >= from && !mergeLanes(draft, { closing, target, at: k }).error);
  const layout = layoutOf(draft);
  const lowest = closing.reduce((m, k) => { const l = draft.lanes.find((x) => x.key === k); const end = l ? lastOf(l) : null; return Math.max(m, end ? layout.row.get(end) ?? 0 : 0); }, 0);
  const suggested = gap && gap.lane === target && lane.steps[gap.index] && steps.includes(lane.steps[gap.index]) ? lane.steps[gap.index]
    : steps.find((k) => (layout.row.get(k) ?? 0) > lowest) ?? null;
  return { steps, suggested };
}

/** Takes a step out of the picture, mending what pointed at it. A lane left with no step goes with it (the trunk stays). */
function detach(draft: FlowDraft, stepKey: string): FlowDraft {
  const lane = laneOfStep(draft, stepKey);
  if (!lane) return draft;
  const i = lane.steps.indexOf(stepKey);
  const above = i > 0 ? lane.steps[i - 1] : lane.from;
  const below = lane.steps[i + 1] ?? null;
  const lanes = draft.lanes
    .map((l) => {
      let out = l;
      if (out.key === lane.key) out = { ...out, steps: out.steps.filter((k) => k !== stepKey) };
      // A lane that split after it now splits after the step above it; one that met at it meets at the step below (or is open again).
      if (out.from === stepKey) out = { ...out, from: above ?? null };
      if (out.into === stepKey) out = { ...out, into: below };
      return out;
    })
    .filter((l, idx) => idx === 0 || l.steps.length > 0);
  // A lane that closed into the emptied lane's meeting step is unaffected; one that split from a lane now gone keeps `from` (mended above).
  const steps = Object.fromEntries(Object.entries(draft.steps).filter(([k]) => k !== stepKey).map(([k, s]) => [k, s.extra.includes(stepKey) ? { ...s, extra: s.extra.filter((a) => a !== stepKey) } : s]));
  return { ...draft, steps, lanes };
}

/** Removes a step. Removing a lane's only step removes the lane. */
export const removeStep = (draft: FlowDraft, stepKey: string): FlowDraft => detach(draft, stepKey);

/**
 * Moves a step to a gap — up or down its own lane, or into another lane. A step that lanes meet at,
 * or split after, keeps doing so while it moves within its lane; a move that would make a lane wait
 * for itself is refused in words. A meeting step does not leave its lane.
 */
export function moveStep(draft: FlowDraft, stepKey: string, to: Gap): { draft: FlowDraft; error: string | null } {
  const lane = laneOfStep(draft, stepKey);
  const dest = draft.lanes.find((l) => l.key === to.lane);
  if (!lane || !dest) return { draft, error: null };
  const code = draft.steps[stepKey].operation.code;
  if (lane.key === dest.key) {
    const i = lane.steps.indexOf(stepKey);
    const j = clamp(to.index, 0, lane.steps.length);
    if (j === i || j === i + 1) return { draft, error: null };
    const steps = lane.steps.filter((k) => k !== stepKey);
    steps.splice(j > i ? j - 1 : j, 0, stepKey);
    const next = { ...draft, lanes: withLane(draft, lane.key, (l) => ({ ...l, steps })) };
    if (layoutOf(next).circle) {
      return { draft, error: `${code} cannot move there: a lane that meets at it, or splits after it, would end up waiting for itself. Keep it between where that lane splits off and where it meets.` };
    }
    return { draft: next, error: null };
  }
  if (draft.lanes.some((l) => l.into === stepKey)) {
    return { draft, error: `${code} is where lanes meet. It can move up and down its own lane, not into another — remove it, or move the steps around it.` };
  }
  const step = draft.steps[stepKey];
  const without = detach(draft, stepKey);
  const there = without.lanes.find((l) => l.key === dest.key);
  if (!there) return { draft, error: null };
  const j = clamp(to.index, 0, there.steps.length);
  const next: FlowDraft = { ...without, steps: { ...without.steps, [stepKey]: { ...step, extra: [] } }, lanes: withLane(without, there.key, (l) => ({ ...l, steps: [...l.steps.slice(0, j), stepKey, ...l.steps.slice(j)] })) };
  if (layoutOf(next).circle) return { draft, error: `${code} cannot move there: a step would end up waiting for itself.` };
  return { draft: next, error: null };
}

/** One place up or down its lane, or across to the lane on its left / right at the same height — the keyboard's way of dragging. */
export function moveStepBy(draft: FlowDraft, stepKey: string, direction: 'up' | 'down' | 'left' | 'right'): { draft: FlowDraft; error: string | null } {
  const lane = laneOfStep(draft, stepKey);
  if (!lane) return { draft, error: null };
  const i = lane.steps.indexOf(stepKey);
  if (direction === 'up') return i === 0 ? { draft, error: null } : moveStep(draft, stepKey, { lane: lane.key, index: i - 1 });
  if (direction === 'down') return i === lane.steps.length - 1 ? { draft, error: null } : moveStep(draft, stepKey, { lane: lane.key, index: i + 2 });
  const side = sideLane(draft, stepKey, direction);
  return side ? moveStep(draft, stepKey, side) : { draft, error: null };
}

/** The gap in the lane just left / right of a step, at its height; null when there is none. */
export function sideLane(draft: FlowDraft, stepKey: string, direction: 'left' | 'right'): Gap | null {
  const layout = layoutOf(draft);
  const mine = layout.lanes.find((b) => b.lane.steps.includes(stepKey));
  const r = layout.row.get(stepKey);
  if (!mine || r == null) return null;
  const beside = layout.lanes
    .filter((b) => b !== mine && b.start <= r && r <= b.end + 1 && (direction === 'left' ? b.col < mine.col : b.col > mine.col))
    .sort((a, b) => (direction === 'left' ? b.col - a.col : a.col - b.col))[0];
  if (!beside) return null;
  return { lane: beside.lane.key, index: beside.lane.steps.filter((k) => (layout.row.get(k) ?? 0) < r).length };
}

const mapStep = (draft: FlowDraft, stepKey: string, fn: (s: DraftStep) => DraftStep): FlowDraft => (draft.steps[stepKey] ? { ...draft, steps: { ...draft.steps, [stepKey]: fn(draft.steps[stepKey]) } } : draft);

export const setOperation = (draft: FlowDraft, stepKey: string, operation: DraftOperation) => mapStep(draft, stepKey, (s) => ({ ...s, operation: { ...operation } }));

export const editStep = (draft: FlowDraft, stepKey: string, patch: { stepName?: string; notes?: string }) => mapStep(draft, stepKey, (s) => ({ ...s, ...patch }));

/** Drops one of the "also starts after" links lanes cannot draw. */
export const removeExtra = (draft: FlowDraft, stepKey: string, afterKey: string) => mapStep(draft, stepKey, (s) => ({ ...s, extra: s.extra.filter((a) => a !== afterKey) }));

/** What makes two waits "the same rule" — the server's unique key: who, made from what, at which step. */
const waitId = (w: Pick<DraftWait, 'relation' | 'targetDefinitionId' | 'targetOperationId'>) => `${w.relation}:${w.targetDefinitionId ?? 0}:${w.targetOperationId ?? 0}`;

/** True when the step already waits for exactly that. */
export const waitClash = (step: DraftStep, wait: NewWait) => step.waits.some((w) => waitId(w) === waitId(wait));

export function addWait(draft: FlowDraft, stepKey: string, wait: NewWait): FlowDraft {
  return { ...mapStep(draft, stepKey, (s) => ({ ...s, waits: [...s.waits, { ...wait, key: `nw${draft.next}`, id: null }] })), next: draft.next + 1 };
}

export const removeWait = (draft: FlowDraft, stepKey: string, waitKey: string) => mapStep(draft, stepKey, (s) => ({ ...s, waits: s.waits.filter((w) => w.key !== waitKey) }));

export const findStep = (draft: FlowDraft, stepKey: string): DraftStep | null => draft.steps[stepKey] ?? null;

/** Every step, top to bottom, left to right. */
export function stepsInOrder(draft: FlowDraft, layout: FlowLayout = layoutOf(draft)): DraftStep[] {
  const col = new Map(layout.lanes.flatMap((b) => b.lane.steps.map((k) => [k, b.col] as const)));
  return Object.values(draft.steps)
    .filter((s) => layout.row.has(s.key))
    .sort((a, b) => (layout.row.get(a.key) ?? 0) - (layout.row.get(b.key) ?? 0) || (col.get(a.key) ?? 0) - (col.get(b.key) ?? 0));
}

/** What Save sends: every step top to bottom with its lane and the steps it starts after. */
export function payloadOf(draft: FlowDraft): FlowStepsPayload {
  const layout = layoutOf(draft);
  const col = new Map(layout.lanes.flatMap((b) => b.lane.steps.map((k) => [k, b.col] as const)));
  return {
    steps: stepsInOrder(draft, layout).map((s) => ({
      ...(s.id != null ? { id: s.id } : {}),
      key: s.key,
      operationId: s.operation.id,
      stepName: s.stepName.trim() || null,
      notes: s.notes.trim() || null,
      lane: col.get(s.key) ?? 0,
      after: layout.after.get(s.key) ?? [],
      waits: s.waits.map((w) => (w.id != null ? { id: w.id } : {
        relation: w.relation, targetDefinitionId: w.targetDefinitionId, targetOperationId: w.targetOperationId, requiredStatus: w.requiredStatus, notes: w.notes,
      })),
    })),
  };
}

/* ---------------------------------------------------------------------------
 * What changed
 * ------------------------------------------------------------------------ */

export interface StepMark { kind: 'new' | 'changed'; /** What changed, in words — the badge's tooltip. */ what: string[] }

export interface FlowChanges {
  /** How many things are waiting to be saved; 0 = nothing to save. */
  count: number;
  added: number;
  removed: number;
  replaced: number;
  edited: number;
  waitsAdded: number;
  waitsRemoved: number;
  orderChanged: boolean;
  /** stepKey → its badge. A step with no entry is as saved. */
  steps: Map<string, StepMark>;
  /** Saved steps whose place in the order changed the most (the ones that were moved). */
  moved: Set<string>;
  /** The saved steps that are gone — listed under the picture until Save. */
  removedSteps: FlowStep[];
  /** "2 steps added · 1 removed · order changed" */
  words: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** For each of `keep`, which of `keep` come before it — through any step. */
function comesBefore<K>(keys: K[], afterOf: (k: K) => K[], keep: Set<K>): Map<K, Set<K>> {
  const memo = new Map<K, Set<K>>();
  const up = (k: K): Set<K> => {
    const known = memo.get(k);
    if (known) return known;
    const set = new Set<K>();
    memo.set(k, set);
    for (const a of afterOf(k)) { set.add(a); for (const x of up(a)) set.add(x); }
    return set;
  };
  return new Map(keys.filter((k) => keep.has(k)).map((k) => [k, new Set([...up(k)].filter((x) => keep.has(x)))]));
}

/** The draft against the saved steps: what is new, gone, changed or moved, and how many things that is. */
export function changesOf(original: FlowStep[], draft: FlowDraft): FlowChanges {
  const saved = new Map(original.map((s) => [s.id, s]));
  const steps = new Map<string, StepMark>();
  let added = 0, replaced = 0, edited = 0, waitsAdded = 0, waitsRemoved = 0;
  const staying = new Set<number>();
  const keyOfId = new Map<number, string>();
  for (const s of Object.values(draft.steps)) {
    const was = s.id != null ? saved.get(s.id) : undefined;
    if (!was) { added += 1; steps.set(s.key, { kind: 'new', what: ['Added — not saved yet'] }); continue; }
    staying.add(was.id);
    keyOfId.set(was.id, s.key);
    const what: string[] = [];
    if (s.operation.id !== was.operation.id) { replaced += 1; what.push(`Operation was ${was.operation.code}`); }
    if (s.stepName.trim() !== (was.stepName ?? '').trim() || s.notes.trim() !== (was.notes ?? '').trim()) { edited += 1; what.push('Name or notes changed'); }
    const plus = s.waits.filter((w) => w.id == null).length;
    const minus = was.waits.filter((w) => !s.waits.some((x) => x.id === w.id)).length;
    waitsAdded += plus; waitsRemoved += minus;
    if (plus) what.push(`${plural(plus, 'wait', 'waits')} added`);
    if (minus) what.push(`${plural(minus, 'wait', 'waits')} removed`);
    if (what.length) steps.set(s.key, { kind: 'changed', what });
  }
  const removedSteps = original.filter((s) => !staying.has(s.id));
  // Order: which of the steps that stay come before which — as saved, and as drawn now.
  const order = orderOfSaved(original);
  const before = comesBefore([...saved.keys()], (id) => order.get(id)?.after ?? [], staying);
  const graph = graphOf(draft);
  const stayingKeys = new Set([...staying].map((id) => keyOfId.get(id) as string));
  const now = comesBefore([...graph.keys()], (k) => graph.get(k) ?? [], stayingKeys);
  const differs = new Map<string, number>();
  for (const id of staying) {
    const k = keyOfId.get(id) as string;
    const a = new Set([...(before.get(id) ?? [])].map((x) => keyOfId.get(x) as string));
    const b = now.get(k) ?? new Set<string>();
    for (const x of new Set([...a, ...b])) {
      if (a.has(x) !== b.has(x)) { differs.set(k, (differs.get(k) ?? 0) + 1); differs.set(x, (differs.get(x) ?? 0) + 1); }
    }
  }
  const orderChanged = differs.size > 0;
  const most = Math.max(0, ...differs.values());
  const moved = new Set([...differs].filter(([, n]) => n === most).map(([k]) => k));
  const removed = removedSteps.length;
  const words = [
    added && `${plural(added, 'step', 'steps')} added`,
    removed && `${removed} removed`,
    replaced && `${plural(replaced, 'operation', 'operations')} replaced`,
    edited && `${plural(edited, 'step', 'steps')} edited`,
    waitsAdded && `${plural(waitsAdded, 'wait', 'waits')} added`,
    waitsRemoved && `${plural(waitsRemoved, 'wait', 'waits')} removed`,
    orderChanged && 'order changed',
  ].filter(Boolean).join(' · ');
  return {
    count: added + removed + replaced + edited + waitsAdded + waitsRemoved + (orderChanged ? 1 : 0),
    added, removed, replaced, edited, waitsAdded, waitsRemoved, orderChanged, steps, moved, removedSteps, words,
  };
}

/* ---------------------------------------------------------------------------
 * The operation's times on a step card
 * ------------------------------------------------------------------------ */

/** One time of a step as the time helpers (lib/formulaBuilder) read it; null when it is not set. */
export function timeViewOf(part: FlowStepTimePart | null | undefined): TimeView | null {
  if (!part || (part.minutes == null && part.expression == null && !part.formula)) return null;
  return { minutes: part.minutes, formula: part.formula, ...(part.expression != null ? { expression: part.expression } : {}), ...(part.display != null ? { display: part.display } : {}) };
}

/** The step's time as the rule the time dialog edits; null when the operation has no rule yet (the dialog then asks for a machine type first). */
export function ruleOfTime(operationId: number, time: FlowStepTime | null | undefined): TimingRule | null {
  if (!time || time.ruleId == null || !time.subject) return null;
  return {
    id: time.ruleId, operationId, subject: time.subject, eligible: time.eligible !== false,
    setup: timeViewOf(time.setup), work: timeViewOf(time.work), effectiveFrom: null, effectiveTo: null, notes: null,
  };
}

/** A rule from the operations list (its `mainRule`) in the shape a step carries. */
export function timeOfRule(rule: TimingRule | null | undefined, rules = rule ? 1 : 0): FlowStepTime {
  const part = (t: TimeView | null): FlowStepTimePart => ({ minutes: t?.minutes ?? null, expression: t?.expression ?? null, display: t?.display ?? null, formula: t?.formula ?? null });
  return { setup: part(rule?.setup ?? null), work: part(rule?.work ?? null), ruleId: rule?.id ?? null, subject: rule?.subject ?? null, eligible: rule ? rule.eligible : null, rules };
}
