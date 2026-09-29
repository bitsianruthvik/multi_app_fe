import { addLoad, earliestForMaterial, leadStart, pctOf } from './load';
import { newSupply, takeMaterial, type MaterialResult } from './material';
import { activeUnits, getModel, materialWords, type Model } from './model';
import type { CanPlaceResult, EngineOptions, Evaluation, LineEval, LoadCell, MonthEval, Plan, PlannerSnapshot, UnitEval } from './types';

export const fmtQty = (q: number) => (Math.abs(q) >= 10 ? String(Math.round(q)) : String(Number(q.toFixed(2))));

/** Ship period position of each active unit (−1 unplanned). */
function shipPeriods(m: Model, plan: Plan, act: number[]): Int32Array {
  const ship = new Int32Array(m.N).fill(-1);
  for (const u of act) {
    const e = plan[m.units[u].key];
    if (e) ship[u] = m.periodIdx.get(e.period) ?? -1;
  }
  return ship;
}

/** Material in plan order: planned units by (ship period, priority), then unplanned by priority. */
function allocate(m: Model, act: number[], ship: Int32Array): Map<number, MaterialResult> {
  const planned = act.filter((u) => ship[u] >= 0).sort((a, b) => ship[a] - ship[b] || m.prio[a] - m.prio[b]);
  const unplanned = act.filter((u) => ship[u] < 0).sort((a, b) => m.prio[a] - m.prio[b]);
  const s = newSupply(m);
  const out = new Map<number, MaterialResult>();
  for (const u of planned) out.set(u, takeMaterial(m, s, u).res);
  for (const u of unplanned) out.set(u, takeMaterial(m, s, u).res);
  return out;
}

export function notOrderedReason(m: Model, r: MaterialResult): string {
  const it = m.snap.supply?.[r.short!.itemId];
  const name = it ? it.code || it.name : `item ${r.short!.itemId}`;
  const uom = it?.uom ? ` ${it.uom}` : '';
  return `Not ordered: ${name} is short by ${fmtQty(r.short!.qty)}${uom} (see the Buy list)`;
}

function materialLateReason(m: Model, u: number, r: MaterialResult, s: number): string {
  const words = materialWords(r.date!, r.source);
  if (r.period >= m.P) return `Material arrives ${words}, after the last week of this plan`;
  const earliest = earliestForMaterial(m, u, r.period);
  const lead = m.lead[u];
  const need = lead > 1 ? `its ${lead}-week lead` : 'its work';
  if (earliest >= m.P) return `Material arrives ${words}; ${need} cannot finish inside this plan`;
  const at = s >= 0 ? ` (work would start in ${m.periods[leadStart(m, u, s)].label})` : '';
  return `Material arrives ${words}; ${need} must start in ${m.periods[r.period].label} or later${at}, so ship it in ${m.periods[earliest].label} or later`;
}

/** Evaluate a plan: month scoreboard, function load, per-card state, lines, score. */
export function evaluate(snapshot: PlannerSnapshot, plan: Plan, opts?: EngineOptions): Evaluation {
  const m = getModel(snapshot);
  const act = activeUnits(m, plan, opts);
  const ship = shipPeriods(m, plan, act);
  const mat = allocate(m, act, ship);
  const { P, F, periods } = m;

  const load = new Float64Array(F * P);
  for (const u of act) if (ship[u] >= 0) addLoad(m, load, u, ship[u], 1);

  // load cells
  const loadOut: Record<string, Record<string, LoadCell>> = {};
  const over = new Uint8Array(F * P);
  let overloadedCells = 0;
  for (let f = 0; f < F; f++) {
    const row: Record<string, LoadCell> = {};
    for (let p = 0; p < P; p++) {
      const c = m.cap[f * P + p];
      const minutes = load[f * P + p];
      const pct = pctOf(minutes, c);
      if (pct > 100 + 1e-9) { over[f * P + p] = 1; overloadedCells++; }
      row[periods[p].key] = { minutes, capacity: Number.isFinite(c) ? c : null, pct };
    }
    loadOut[m.fnKeys[f]] = row;
  }

  // lines
  const planned = new Map<string, number>();
  const last = new Map<string, number>();
  for (const u of act) {
    const s = ship[u];
    if (s < 0) continue;
    for (const [g, n] of m.covers[u]) {
      planned.set(g, (planned.get(g) ?? 0) + n);
      if ((last.get(g) ?? -1) < s) last.set(g, s);
    }
  }
  const lines: Record<string, LineEval> = {};
  const lineShip = new Map<string, number>();
  for (const g of m.groups) {
    const total = m.groupTotal.get(g) ?? 1;
    const done = planned.get(g) ?? 0;
    const s = done >= total ? last.get(g)! : -1;
    if (s >= 0) lineShip.set(g, s);
    lines[g] = { period: s >= 0 ? periods[s].key : null, month: s >= 0 ? periods[s].month : null, marks: total, marksPlanned: done };
  }

  // months
  const months: Record<string, MonthEval> = {};
  const monthMin = new Float64Array(F * m.months.length);
  const monthCap = new Float64Array(F * m.months.length);
  for (let f = 0; f < F; f++) for (let p = 0; p < P; p++) {
    const mi = m.periodMonth[p];
    monthMin[f * m.months.length + mi] += load[f * P + p];
    monthCap[f * m.months.length + mi] += m.cap[f * P + p];
  }
  m.months.forEach((ym, mi) => {
    let fn: string | null = null, name = '', pct = 0;
    for (let f = 0; f < F; f++) {
      if (m.unlimited[f]) continue;
      const x = pctOf(monthMin[f * m.months.length + mi], monthCap[f * m.months.length + mi]);
      if (x > pct) { pct = x; fn = m.fnKeys[f]; name = m.fnNames[f]; }
    }
    const t = snapshot.targets?.[ym];
    months[ym] = { tonnes: 0, target: t == null ? null : Number(t), linesShipped: 0, marksShipped: 0, bottleneck: { fn, name, pct } };
  });
  for (const [, s] of lineShip) months[periods[s].month].linesShipped++;

  // units
  const unitsOut: Record<string, UnitEval> = {};
  let tonnesInHorizon = 0, lateUnits = 0, unplannedUnits = 0, blockedUnits = 0;
  for (const u of act) {
    const unit = m.units[u];
    const s = ship[u];
    const r = mat.get(u)!;
    const ls = s >= 0 ? leadStart(m, u, s) : -1;
    let blocked: string | null = null;
    let blockedKind: UnitEval['blockedKind'] = null;
    if (r.short) { blocked = notOrderedReason(m, r); blockedKind = 'not_ordered'; }
    else if (s >= 0 && r.period > ls) { blocked = materialLateReason(m, u, r, s); blockedKind = 'material_late'; }
    const committed = m.committed[u];
    const late = s >= 0 && !!committed && periods[s].end > committed;
    let overload = false;
    if (s >= 0) {
      const fs = m.workFn[u];
      for (let k = 0; k < fs.length && !overload; k++) for (let p = ls; p <= s; p++) if (over[fs[k] * P + p]) { overload = true; break; }
    }
    const completesLines: string[] = [];
    if (s >= 0) {
      for (const g of m.covers[u].keys()) if (lineShip.get(g) === s) completesLines.push(g);
      const mo = months[periods[s].month];
      mo.tonnes += Number(unit.tonnes) || 0;
      for (const n of m.covers[u].values()) mo.marksShipped += n;
      tonnesInHorizon += Number(unit.tonnes) || 0;
    } else unplannedUnits++;
    if (late) lateUnits++;
    if (blocked) blockedUnits++;
    unitsOut[unit.key] = {
      period: s >= 0 ? periods[s].key : null,
      pinned: s >= 0 ? !!plan[unit.key]?.pinned : false,
      leadStart: s >= 0 ? periods[ls].key : null,
      lead: m.lead[u],
      materialDate: r.short ? null : r.date,
      materialSource: r.short ? null : r.source,
      blocked, blockedKind, late, overload, completesLines,
    };
  }

  return {
    months, load: loadOut, units: unitsOut, lines,
    score: { tonnesInHorizon, linesShipped: lineShip.size, lateUnits, overloadedCells, unplannedUnits, blockedUnits },
    labels: m.labels,
  };
}

/**
 * Can this card ship in this period? Refuses material and lead violations with a plain reason;
 * overload is allowed (the board shows it red).
 */
export function canPlace(snapshot: PlannerSnapshot, plan: Plan, unitKey: string, period: string, opts?: EngineOptions): CanPlaceResult {
  const m = getModel(snapshot);
  const u = m.unitIdx.get(unitKey);
  if (u === undefined) return { ok: false, reason: 'This card is not in the plan any more — reload.' };
  const s = m.periodIdx.get(period);
  if (s === undefined) return { ok: false, reason: 'That week is outside the plan.' };
  const next: Plan = { ...plan, [unitKey]: { period, pinned: plan[unitKey]?.pinned ?? true } };
  const act = activeUnits(m, next, opts);
  if (!act.includes(u)) return { ok: false, reason: 'This card sits above the level the line is planned at — change the line’s level first.' };
  const ship = shipPeriods(m, next, act);
  const r = allocate(m, act, ship).get(u)!;
  if (r.short) return { ok: false, reason: notOrderedReason(m, r), earliest: null };
  if (r.period > leadStart(m, u, s)) {
    const e = r.period >= m.P ? m.P : earliestForMaterial(m, u, r.period);
    return { ok: false, reason: materialLateReason(m, u, r, s), earliest: e < m.P ? m.periods[e].key : null };
  }
  return { ok: true };
}
