/**
 * Moves on a plan — pure, so the page, the keyboard and the tests all do exactly the same thing.
 * A moved unit is always PINNED (auto-plan never moves what a person put somewhere).
 *
 *   dragTo(snapshot, plan, keys, anchorKey, target)   the drop of a drag (target: period key, or null = off the plan)
 *   shiftBy(snapshot, plan, keys, delta)              arrow keys: every planned unit ±delta weeks (clamped)
 *   unplan(plan, keys)
 *   reorderKeys(list, moving, beforeKey)              the new order of a list after moving some keys before another
 *   rankLine(snapshot, ranks, lineId, orderedKeys)    a line's rank map after a reorder
 *   rankChanges(snapshot, saved, current)             lines whose unit order changed → { lineId, unitKeys }
 */
import { getModel } from './model';
import type { Plan, PlannerSnapshot } from './types';

export type Ranks = Record<string, number>;

const periodIndex = (s: PlannerSnapshot) => getModel(s).periodIdx;

/**
 * The plan after dropping `keys` (the dragged unit is `anchorKey`) on `target`.
 * target null → all off the plan. A planned anchor moves by whole periods and the other
 * PLANNED units move by the same number (clamped to the horizon); unplanned ones land on the target.
 * An unplanned anchor: everything lands on the target.
 */
export function dragTo(snapshot: PlannerSnapshot, plan: Plan, keys: string[], anchorKey: string, target: string | null): Plan {
  if (target == null) return unplan(plan, keys);
  const idx = periodIndex(snapshot);
  const periods = snapshot.horizon.periods;
  const t = idx.get(target);
  if (t === undefined) return plan;
  const a = plan[anchorKey] ? idx.get(plan[anchorKey].period) : undefined;
  const delta = a === undefined ? null : t - a;
  const next: Plan = { ...plan };
  for (const k of keys) {
    const cur = plan[k] ? idx.get(plan[k].period) : undefined;
    const to = delta == null || cur === undefined ? t : Math.min(periods.length - 1, Math.max(0, cur + delta));
    next[k] = { period: periods[to].key, pinned: true };
  }
  return next;
}

/** Every PLANNED unit of `keys` ±delta periods (clamped); `placeUnplanned` puts the unplanned ones in that period. */
export function shiftBy(snapshot: PlannerSnapshot, plan: Plan, keys: string[], delta: number, placeUnplanned?: string): Plan {
  const idx = periodIndex(snapshot);
  const periods = snapshot.horizon.periods;
  const next: Plan = { ...plan };
  let changed = false;
  for (const k of keys) {
    const cur = plan[k] ? idx.get(plan[k].period) : undefined;
    if (cur === undefined) {
      if (placeUnplanned && idx.has(placeUnplanned)) { next[k] = { period: placeUnplanned, pinned: true }; changed = true; }
      continue;
    }
    const to = Math.min(periods.length - 1, Math.max(0, cur + delta));
    if (to !== cur || !plan[k].pinned) { next[k] = { period: periods[to].key, pinned: true }; changed = true; }
  }
  return changed ? next : plan;
}

export function unplan(plan: Plan, keys: string[]): Plan {
  if (!keys.some((k) => k in plan)) return plan;
  const next: Plan = { ...plan };
  for (const k of keys) delete next[k];
  return next;
}

/** `list` with `moving` (kept in their order in `list`) taken out and put before `beforeKey` (null = at the end). */
export function reorderKeys(list: string[], moving: string[], beforeKey: string | null): string[] {
  const set = new Set(moving);
  const kept = list.filter((k) => !set.has(k));
  const moved = list.filter((k) => set.has(k));
  let at = beforeKey == null ? kept.length : kept.indexOf(beforeKey);
  if (at < 0) at = kept.length;
  return [...kept.slice(0, at), ...moved, ...kept.slice(at)];
}

/** Ranks with one line's order replaced by `orderedKeys` (1 = first); the line's older ranks are dropped. */
export function rankLine(snapshot: PlannerSnapshot, ranks: Ranks, lineId: string | number, orderedKeys: string[]): Ranks {
  const m = getModel(snapshot);
  const next: Ranks = {};
  for (const [k, r] of Object.entries(ranks)) {
    const i = m.unitIdx.get(k);
    if (i === undefined || String(m.units[i].lineId) !== String(lineId)) next[k] = r;
  }
  orderedKeys.forEach((k, i) => { next[k] = i + 1; });
  return next;
}

/** The lines whose unit order differs between two rank maps, with the new order to save. */
export function rankChanges(snapshot: PlannerSnapshot, saved: Ranks, current: Ranks): { lineId: string | number; unitKeys: string[] }[] {
  const m = getModel(snapshot);
  const lineOf = (k: string) => { const i = m.unitIdx.get(k); return i === undefined ? null : String(m.units[i].lineId); };
  const listOf = (r: Ranks) => {
    const by = new Map<string, [string, number][]>();
    for (const [k, n] of Object.entries(r)) {
      const l = lineOf(k);
      if (l == null) continue;
      if (!by.has(l)) by.set(l, []);
      by.get(l)!.push([k, n]);
    }
    return new Map([...by].map(([l, xs]) => [l, xs.sort((a, b) => a[1] - b[1]).map((x) => x[0])]));
  };
  const a = listOf(saved), b = listOf(current);
  const out: { lineId: string | number; unitKeys: string[] }[] = [];
  const idOf = new Map(m.units.map((u) => [String(u.lineId), u.lineId]));
  for (const l of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(l) ?? [], y = b.get(l) ?? [];
    if (x.length !== y.length || x.some((k, i) => k !== y[i])) out.push({ lineId: idOf.get(l) ?? l, unitKeys: y });
  }
  return out;
}
