/**
 * Machine AREAS — the planner's functions (machine types) grouped the way a works manager talks
 * about the shop: Cutting, Drilling, Assembly, Welding, Finishing …
 *
 * The group is a level of the machine-type tree (Family › Subfamily › Variant, `PlannerFunction.path`,
 * root first). `machineAreas` picks the SHALLOWEST level that splits the shop into 4–10 areas; when
 * no level does, the level whose count is nearest 7. On the local plant that is the Subfamily
 * (8 areas under the one Family "Machines"). A type with no node at that level is its own area.
 * Unlimited functions (contractors, "no machine type") are never mixed into an area: each is a
 * row of its own at the end, shown in hours without a percentage.
 *
 * Usage per area × period is simply Σ of its functions' load cells (minutes and capacity) from
 * `evaluate(...).load` — capacity per function is Σ of its machines' shift minutes, and the
 * machines of different types never overlap, so the sums are exact.
 */
import { pctOf } from './load';
import type { Evaluation, PlannerFunction, PlannerSnapshot } from './types';

export interface MachineArea {
  key: string;
  name: string;
  fnKeys: string[];
  machines: number;
  /** contractors / no machine type: never runs out, shown in hours only */
  unlimited: boolean;
}

export interface AreaSet {
  /** the tree depth the areas are taken at; null = no tree (each machine type is an area) */
  depth: number | null;
  /** the level's name ('Subfamily'), or 'Machine type' */
  level: string;
  areas: MachineArea[];
}

export const AREA_MIN = 4;
export const AREA_MAX = 10;

const isUnlimited = (f: PlannerFunction) => !!f.unlimited || f.key === 'contractor';

/**
 * Group the snapshot's functions into machine areas (see the header for how the level is chosen).
 * `working` = the machine types some unit actually needs. A plant's asset register also files
 * electricals, vehicles, cranes… as machine types; left in, they decide the level and crowd the
 * panel with areas that never carry plan work. When given (and not empty), only those count.
 */
export function machineAreas(functions: PlannerFunction[], working?: Set<string>): AreaSet {
  const useful = working && working.size > 0 ? functions.filter((f) => working.has(f.key)) : functions;
  const limited = useful.filter((f) => !isUnlimited(f));
  const maxDepth = Math.max(-1, ...limited.map((f) => (f.path?.length ?? 0) - 1));
  const nodeAt = (f: PlannerFunction, d: number) => f.path?.find((n) => n.depth === d) ?? null;

  let depth: number | null = null;
  if (maxDepth >= 0) {
    const counts: { d: number; n: number }[] = [];
    for (let d = 0; d <= maxDepth; d++) {
      const keys = new Set(limited.map((f) => { const n = nodeAt(f, d); return n ? `n${n.id}` : `f${f.key}`; }));
      counts.push({ d, n: keys.size });
    }
    const inRange = counts.find((c) => c.n >= AREA_MIN && c.n <= AREA_MAX);
    depth = inRange ? inRange.d : [...counts].sort((a, b) => Math.abs(a.n - 7) - Math.abs(b.n - 7) || a.d - b.d)[0].d;
  }

  // The working types chose the level and which areas show; each shown area then counts every
  // machine type under it, idle ones too, so its capacity is the whole area's.
  const shownAreas = new Set(limited.map((f) => { const n = depth == null ? null : nodeAt(f, depth); return n ? `a${n.id}` : `f${f.key}`; }));
  const members = functions.filter((f) => !isUnlimited(f) && shownAreas.has((() => { const n = depth == null ? null : nodeAt(f, depth); return n ? `a${n.id}` : `f${f.key}`; })()));
  const byKey = new Map<string, MachineArea>();
  let level = 'Machine type';
  for (const f of members) {
    const n = depth == null ? null : nodeAt(f, depth);
    if (n?.level) level = n.level;
    const key = n ? `a${n.id}` : `f${f.key}`;
    let a = byKey.get(key);
    if (!a) { a = { key, name: n ? n.name : f.name, fnKeys: [], machines: 0, unlimited: false }; byKey.set(key, a); }
    a.fnKeys.push(f.key);
    a.machines += Number(f.machines) || 0;
  }
  const areas = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const f of useful.filter(isUnlimited)) areas.push({ key: `f${f.key}`, name: f.name, fnKeys: [f.key], machines: 0, unlimited: true });
  return { depth, level, areas };
}

export interface UsageCell {
  minutes: number;
  /** null = unlimited */
  capacity: number | null;
  /** percent used; 999 = work on no shift time; 0 when unlimited */
  pct: number;
}

export interface UsageRow {
  key: string;
  name: string;
  machines: number;
  unlimited: boolean;
  fnKeys: string[];
  cells: Record<string, UsageCell>;
  total: UsageCell;
}

function sumCells(evaluation: Evaluation, fnKeys: string[], periodKeys: string[], unlimited: boolean): { cells: Record<string, UsageCell>; total: UsageCell } {
  const cells: Record<string, UsageCell> = {};
  let tm = 0, tc = 0;
  for (const p of periodKeys) {
    let m = 0, c = 0;
    for (const f of fnKeys) {
      const cell = evaluation.load[f]?.[p];
      if (!cell) continue;
      m += cell.minutes;
      c += cell.capacity ?? 0;
    }
    tm += m; tc += c;
    cells[p] = { minutes: m, capacity: unlimited ? null : c, pct: unlimited ? 0 : pctOf(m, c) };
  }
  return { cells, total: { minutes: tm, capacity: unlimited ? null : tc, pct: unlimited ? 0 : pctOf(tm, tc) } };
}

/** One row per area (planned minutes ÷ shift minutes per period, and over the whole horizon). */
/** The machine types the snapshot's units need work from — the `working` set for machineAreas. */
export function workingFunctions(snapshot: PlannerSnapshot): Set<string> {
  const out = new Set<string>();
  for (const u of snapshot.units) for (const [k, m] of Object.entries(u.work ?? {})) if (Number(m) > 0) out.add(k);
  return out;
}

export function areaUsage(snapshot: PlannerSnapshot, evaluation: Evaluation, set: AreaSet): UsageRow[] {
  const periods = snapshot.horizon.periods.map((p) => p.key);
  return set.areas.map((a) => ({ key: a.key, name: a.name, machines: a.machines, unlimited: a.unlimited, fnKeys: a.fnKeys, ...sumCells(evaluation, a.fnKeys, periods, a.unlimited) }));
}

/** The machine types inside one area, as rows of their own (the area's "expand"). */
export function functionUsage(snapshot: PlannerSnapshot, evaluation: Evaluation, area: MachineArea): UsageRow[] {
  const periods = snapshot.horizon.periods.map((p) => p.key);
  const fns = new Map(snapshot.functions.map((f) => [f.key, f]));
  return area.fnKeys.map((k) => {
    const f = fns.get(k);
    const unlimited = f ? isUnlimited(f) : true;
    return { key: `fn:${k}`, name: f?.name ?? k, machines: Number(f?.machines) || 0, unlimited, fnKeys: [k], ...sumCells(evaluation, [k], periods, unlimited) };
  });
}

/** green under 75 %, amber 75–100 %, red beyond; 'none' when nothing is planned or it cannot run out. */
export type Band = 'none' | 'ok' | 'warn' | 'over';
export function usageBand(c: UsageCell | undefined, unlimited = false): Band {
  if (!c || c.minutes <= 1e-9 || unlimited) return 'none';
  if (c.pct < 75) return 'ok';
  if (c.pct <= 100 + 1e-9) return 'warn';
  return 'over';
}

/**
 * The units loading some functions in one period, most minutes first — what the hover names and
 * what a click on a usage cell highlights. A unit's minutes spread evenly over its lead
 * (evaluate's rule), so its share of a period is its work on those functions ÷ its lead.
 */
export function cellDrivers(snapshot: PlannerSnapshot, evaluation: Evaluation, fnKeys: string[], periodKey: string): { unitKey: string; minutes: number }[] {
  const idx = new Map(snapshot.horizon.periods.map((p, i) => [p.key, i]));
  const at = idx.get(periodKey);
  if (at === undefined) return [];
  const units = new Map(snapshot.units.map((u) => [u.key, u]));
  const out: { unitKey: string; minutes: number }[] = [];
  for (const [key, ev] of Object.entries(evaluation.units)) {
    if (!ev.period || !ev.leadStart) continue;
    const s = idx.get(ev.period), a = idx.get(ev.leadStart);
    if (s === undefined || a === undefined || at < a || at > s) continue;
    const u = units.get(key);
    if (!u) continue;
    let m = 0;
    for (const f of fnKeys) m += Number(u.work?.[f]) || 0;
    if (m > 0) out.push({ unitKey: key, minutes: m / (s - a + 1) });
  }
  return out.sort((x, y) => y.minutes - x.minutes || x.unitKey.localeCompare(y.unitKey));
}
