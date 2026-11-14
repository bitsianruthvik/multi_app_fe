import type { OpState, OperationNames, TreeNode, TreeOp } from '../api/trackerTree';
import type { TreeState } from './trackerTree';

/**
 * THE TRACKER'S OPERATION LANES (user, 2026-11-14: "a way to view all operations or only operations of a current
 * level … something like a gantt chart … every row will have different operations. Dont try to fit everything in
 * one order"). Each row carries ITS OWN operations, in its own flow order — never a column per operation shared by
 * every row. Two ways to draw a row:
 *   - route: the operations one after another, each as wide as its planned minutes (equal when not every one has a
 *     time), coloured by state, a running one glowing;
 *   - timeline: on a date axis shared by the rows, each operation's planned slot (the planner's, outlined) and what
 *     the floor did (started → finished, filled; a running one reaches to now).
 * And two scopes: the row's own operations, or everything under it rolled up per operation (in the read's flow
 * order — a subtree mixes flows, so the consensus order is the honest one there).
 * Pure, so it can be reasoned about apart from the drawing.
 */

export type LaneMode = 'route' | 'timeline';
export type LaneScope = 'own' | 'all';

export interface LaneOp {
  key: string;
  operationId: number;
  name: string;
  code: string | null;
  done: number;
  total: number;
  state: OpState;
  ready: boolean;
  reason: string | null;
  /** Planned minutes; null when not every step under it has a time. */
  minutes: number | null;
  /** Steps folded into it (1 for a row's own step). */
  steps: number;
  running: number;
  blocked: number;
  /** epoch ms; null = not known */
  start: number | null;
  end: number | null;
  plannedStart: number | null;
  plannedEnd: number | null;
  /** One of the row's own steps, for opening the piece on it. */
  stepId: number | null;
}

const ms = (v: string | null | undefined) => { if (!v) return null; const t = Date.parse(v); return Number.isNaN(t) ? null : t; };
const min = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.min(a, b));
const max = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.max(a, b));

function fromOp(o: TreeOp, names: OperationNames, now: number): LaneOp {
  const fin = ms(o.finishedAt);
  // A step recorded as finished without a start (caught up afterwards) is a mark at its finish.
  const start = ms(o.startedAt) ?? fin;
  return {
    key: `s${o.stepId}`, operationId: o.operationId, name: o.name, code: names[o.operationId]?.code ?? null,
    done: o.done, total: o.total, state: o.state, ready: !!o.ready, reason: o.reason ?? null,
    minutes: o.minutes ?? null, steps: 1, running: o.state === 'running' ? 1 : 0, blocked: o.state === 'blocked' ? 1 : 0,
    start, end: fin ?? (o.state === 'running' && start != null ? now : null),
    plannedStart: ms(o.plannedStart), plannedEnd: ms(o.plannedEnd), stepId: o.stepId,
  };
}

/** A row's own operations, in its own flow order (passes kept apart). */
export function ownLane(n: TreeNode, names: OperationNames, now = Date.now()): LaneOp[] {
  return n.ops.map((o) => fromOp(o, names, now));
}

/** Whether every node under `id` has been read (so a roll-up from the loaded rows is the whole subtree). */
export function subtreeLoaded(state: TreeState, kids: Map<string, string[]>, id: string): boolean {
  const stack = [id];
  while (stack.length) {
    const x = stack.pop() as string;
    const n = state.byId.get(x);
    if (!n) return false;
    if (n.childCount > 0 && !state.loaded.has(x)) return false;
    stack.push(...(kids.get(x) ?? []));
  }
  return true;
}

function stateOf(a: { done: number; total: number; running: number; blocked: number; anyReady: boolean; allDone: boolean }): { state: OpState; ready: boolean } {
  if (a.allDone) return { state: 'done', ready: false };
  if (a.blocked) return { state: 'blocked', ready: false };
  if (a.running) return { state: 'running', ready: false };
  if (a.done > 0) return { state: 'partial', ready: false };
  return { state: 'todo', ready: a.anyReady };
}

/**
 * Everything under a node (its own steps included), one entry per operation, in `opOrder`. From the loaded rows
 * when the whole subtree is loaded (then with dates); else from the server's counts (no dates).
 */
export function subtreeLane(n: TreeNode, state: TreeState, kids: Map<string, string[]>, names: OperationNames, opOrder: number[], now = Date.now()): LaneOp[] {
  const rank = new Map(opOrder.map((id, i) => [id, i]));
  const sort = (xs: LaneOp[]) => xs.sort((a, b) => (rank.get(a.operationId) ?? 1e9) - (rank.get(b.operationId) ?? 1e9));
  if (!n.childCount) {
    // A leaf: its own steps, one entry per operation (passes folded).
    return foldByOperation(ownLane(n, names, now), names, sort);
  }
  if (subtreeLoaded(state, kids, n.id)) {
    const all: LaneOp[] = [];
    const stack = [n.id];
    while (stack.length) {
      const x = state.byId.get(stack.pop() as string);
      if (!x) continue;
      for (const o of x.ops) all.push(fromOp(o, names, now));
      stack.push(...(kids.get(x.id) ?? []));
    }
    return foldByOperation(all, names, sort);
  }
  return sort((n.byOperation ?? []).map((b) => {
    const allDone = b.total > 0 && b.done >= b.total;
    const st = stateOf({ done: b.done, total: b.total, running: 0, blocked: 0, anyReady: false, allDone });
    return {
      key: `o${b.operationId}`, operationId: b.operationId, name: names[b.operationId]?.name ?? `Operation ${b.operationId}`, code: names[b.operationId]?.code ?? null,
      done: b.done, total: b.total, state: st.state, ready: false, reason: null, minutes: b.minutes ?? null, steps: 0, running: 0, blocked: 0,
      start: null, end: null, plannedStart: null, plannedEnd: null, stepId: null,
    };
  }));
}

function foldByOperation(ops: LaneOp[], names: OperationNames, sort: (xs: LaneOp[]) => LaneOp[]): LaneOp[] {
  const by = new Map<number, LaneOp & { allDone: boolean; anyReady: boolean; minutesKnown: boolean }>();
  for (const o of ops) {
    const e = by.get(o.operationId);
    if (!e) {
      by.set(o.operationId, { ...o, key: `o${o.operationId}`, name: names[o.operationId]?.name ?? o.name, allDone: o.state === 'done', anyReady: o.ready, minutesKnown: o.minutes != null });
      continue;
    }
    e.done += o.done; e.total += o.total; e.steps += o.steps; e.running += o.running; e.blocked += o.blocked;
    e.allDone = e.allDone && o.state === 'done'; e.anyReady = e.anyReady || o.ready;
    e.minutesKnown = e.minutesKnown && o.minutes != null; e.minutes = e.minutesKnown ? (e.minutes ?? 0) + (o.minutes ?? 0) : null;
    e.start = min(e.start, o.start); e.end = max(e.end, o.end);
    e.plannedStart = min(e.plannedStart, o.plannedStart); e.plannedEnd = max(e.plannedEnd, o.plannedEnd);
    if (!e.reason && o.reason) e.reason = o.reason;
  }
  return sort([...by.values()].map(({ allDone, anyReady, minutesKnown, ...e }) => {
    void minutesKnown;
    const st = stateOf({ done: e.done, total: e.total, running: e.running, blocked: e.blocked, anyReady, allDone });
    // An operation not finished everywhere has no end yet, unless something of it is running now.
    const end = allDone ? e.end : e.running ? e.end : null;
    return { ...e, state: st.state, ready: st.ready, end, done: Number(e.done.toFixed(3)), total: Number(e.total.toFixed(3)) };
  }));
}

/** The date range a set of lanes spans (padded), or null when none has a date. */
export function rangeOf(lanes: LaneOp[][], now = Date.now()): { from: number; to: number } | null {
  let lo: number | null = null;
  let hi: number | null = null;
  let running = false;
  for (const lane of lanes) for (const o of lane) {
    lo = min(lo, min(o.start, o.plannedStart));
    hi = max(hi, max(max(o.end, o.start), max(o.plannedEnd, o.plannedStart)));
    if (o.running) running = true;
  }
  if (lo == null || hi == null) return null;
  if (running) hi = Math.max(hi, now);
  const span = Math.max(hi - lo, 3600_000);
  return { from: lo - span * 0.02, to: hi + span * 0.04 };
}

/** About `n` tick marks across a range, on whole hours or days. */
export function ticksOf(r: { from: number; to: number }, n = 6): { at: number; label: string }[] {
  const span = r.to - r.from;
  const hour = 3600_000;
  const day = 24 * hour;
  const steps = [hour, 2 * hour, 3 * hour, 6 * hour, 12 * hour, day, 2 * day, 7 * day, 14 * day, 30 * day];
  const step = steps.find((s) => span / s <= n) ?? steps[steps.length - 1];
  const out: { at: number; label: string }[] = [];
  const first = new Date(r.from);
  if (step >= day) first.setHours(0, 0, 0, 0); else first.setMinutes(0, 0, 0);
  for (let t = first.getTime(); t <= r.to; t += step) {
    if (t < r.from) continue;
    const d = new Date(t);
    const label = step >= day
      ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
      : `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${String(d.getHours()).padStart(2, '0')}:00`;
    out.push({ at: t, label });
  }
  return out;
}

const num = (x: number) => String(Number(x.toFixed(3)));
const when = (t: number | null) => (t == null ? null : new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
const hrs = (m: number | null) => (m == null ? null : m >= 90 ? `${num(m / 60)} h` : `${num(m)} min`);

/** The hover sentence for one operation of a lane. */
export function laneTitle(o: LaneOp): string {
  const count = o.total > 1 ? `${num(o.done)} of ${num(o.total)} done` : null;
  const what = {
    done: 'done', running: 'running now', partial: 'partly done', blocked: `blocked${o.reason ? `: ${o.reason}` : ''}`, todo: o.ready ? 'ready to start' : 'not started',
  }[o.state];
  return [
    `${o.name}${o.code ? ` (${o.code})` : ''} — ${what}`,
    count,
    o.steps > 1 ? `${o.steps} steps` : null,
    hrs(o.minutes) ? `Planned time ${hrs(o.minutes)}` : null,
    o.plannedStart != null ? `Planned ${when(o.plannedStart)} → ${when(o.plannedEnd)}` : null,
    o.start != null ? `Started ${when(o.start)}${o.state === 'done' && o.end != null ? ` · finished ${when(o.end)}` : ''}` : null,
  ].filter(Boolean).join('\n');
}
