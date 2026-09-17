/**
 * fitModel — the month fit itself. Pure functions, no React, no network.
 *
 * One bucket per station: the working minutes it has left this month. Every
 * open piece of work is poured in until a station it needs is full. There is no
 * sequencing inside the month, deliberately — this screen decides WHAT goes in
 * the month and whether the plant should be bigger; the Board decides when.
 *
 * Three rules carry the whole thing:
 *
 *   1. A person's mark beats the engine, always, and is inherited down the
 *      tree. Marking a girder "later" takes its parts with it; marking one part
 *      back "this month" wins over the girder's mark.
 *   2. Committed work goes first. Orders due by the month's end are placed
 *      before anything is pulled ahead, in date order, so pulling ahead can
 *      never be the reason a promise is missed.
 *   3. A row's own work waits for its parts. A girder's assembly tasks are only
 *      placed once everything beneath it is in — otherwise the month fills with
 *      assemblies that have nothing to assemble.
 *
 * What it does NOT know: that a part cannot be fabricated before its blank is
 * cut. Blanks and parts are not linked row to row, so the page warns when a
 * fabrication order runs ahead of its cutting order rather than pretending to
 * enforce it.
 */

import type {
  FitNode, FitOrder, FitPo, FitStation, MarkState, MonthFitResponse,
} from '../../api/monthFit';

// ── the tree ─────────────────────────────────────────────────────────────────

export interface ModelNode {
  /** `${orderId}:${poId}:${key}` — also the key a mark is stored under. */
  id: string;
  orderId: number;
  poId: number;
  parent: ModelNode | null;
  children: ModelNode[];
  src: FitNode;
  ownMin: number;
}

export interface ModelPo {
  id: string;
  orderId: number;
  src: FitPo;
  roots: ModelNode[];
}

export interface ModelOrder {
  id: string;
  src: FitOrder;
  pos: ModelPo[];
  /** Promised by the end of the month being looked at (or already overdue). */
  due: boolean;
}

export interface Model {
  orders: ModelOrder[];
  monthEnd: string;
}

export const poMarkId = (orderId: number, poId: number) => `${orderId}:${poId}:po`;

const sumOwn = (own: Record<string, number>) => Object.values(own).reduce((a, b) => a + b, 0);

export function buildModel(res: MonthFitResponse): Model {
  const orders: ModelOrder[] = res.orders.map((o) => {
    const pos: ModelPo[] = o.pos.map((po) => {
      const byKey = new Map<string, ModelNode>();
      for (const n of po.nodes) {
        byKey.set(n.key, {
          id: `${o.id}:${po.id}:${n.key}`, orderId: o.id, poId: po.id,
          parent: null, children: [], src: n, ownMin: sumOwn(n.own),
        });
      }
      const roots: ModelNode[] = [];
      for (const node of byKey.values()) {
        const parent = node.src.parentKey ? byKey.get(node.src.parentKey) : undefined;
        if (parent) { node.parent = parent; parent.children.push(node); } else roots.push(node);
      }
      const byLabel = (a: ModelNode, b: ModelNode) =>
        a.src.label.localeCompare(b.src.label, undefined, { numeric: true });
      for (const node of byKey.values()) node.children.sort(byLabel);
      roots.sort(byLabel);
      return { id: poMarkId(o.id, po.id), orderId: o.id, src: po, roots };
    });
    return { id: `o${o.id}`, src: o, pos, due: !!o.committed && o.committed <= res.monthEnd };
  });

  /**
   * Committed-this-month first, then everything else, both in date order. This
   * is the order the engine fills in AND the order the page lists in, so what a
   * planner reads top to bottom is what the engine tried first.
   */
  const rank = (o: ModelOrder) => o.src.priorityRank ?? Number.MAX_SAFE_INTEGER;
  orders.sort((a, b) =>
    Number(b.due) - Number(a.due)
    || String(a.src.committed ?? '9999').localeCompare(String(b.src.committed ?? '9999'))
    || rank(a) - rank(b)
    || a.src.id - b.src.id);
  return { orders, monthEnd: res.monthEnd };
}

// ── capacity ─────────────────────────────────────────────────────────────────

export interface Tweak { machines: number; shifts: number }
export type Tweaks = Record<number, Tweak>;

export const MAX_SHIFTS = 3;

/**
 * Minutes a station has once the what-if is applied.
 *
 * Scaled from what the calendar actually gave — one machine, one shift, this
 * month, holidays and all — rather than from a nominal "8 hours × days", so a
 * second shift is worth exactly what the first one was.
 */
export function capacityOf(st: FitStation, tweak: Tweak | undefined, fallbackPerUnit: number): number {
  if (st.unbounded) return Infinity;
  const up = Math.max(0, st.machines - st.machinesDown);
  const perUnit = up > 0 && st.shifts > 0 ? st.capacityMin / (up * st.shifts) : fallbackPerUnit;
  const machines = Math.max(0, (tweak?.machines ?? st.machines) - st.machinesDown);
  const shifts = tweak?.shifts ?? st.shifts;
  return perUnit * machines * shifts;
}

function fallbackPerUnit(stations: FitStation[]): number {
  let best = 0;
  for (const st of stations) {
    const up = st.machines - st.machinesDown;
    if (!st.unbounded && up > 0 && st.shifts > 0) best = Math.max(best, st.capacityMin / (up * st.shifts));
  }
  return best;
}

// ── the fit ──────────────────────────────────────────────────────────────────

/**
 * Where one row's own work ended up.
 *   in / in-forced   this month (engine / a person)
 *   no-room          the engine wanted it and a station was full
 *   waits            its parts are not all in, so there is nothing to work on
 *   out-forced       a person moved it to later
 *   manual-out       auto-fill is off and nobody has pulled it in
 */
export type AtomState = 'in' | 'in-forced' | 'no-room' | 'waits' | 'out-forced' | 'manual-out';

export const isIn = (s: AtomState | undefined) => s === 'in' || s === 'in-forced';

export interface NodeSum {
  inMin: number;
  outMin: number;
  inAtoms: number;
  outAtoms: number;
  noRoomMin: number;
}

export interface StationView {
  id: number;
  name: string;
  machines: number;
  shifts: number;
  baseMachines: number;
  baseShifts: number;
  machinesDown: number;
  capMin: number;
  loadMin: number;
  util: number;
  unbounded: boolean;
  changed: boolean;
  /** Minutes of work this station turned away. More than zero means it is A limit, even if not THE limit. */
  blockedMin: number;
}

export interface FitResult {
  atomState: Map<string, AtomState>;
  sums: Map<string, NodeSum>;
  stations: StationView[];
  /** Minutes turned away per station — the evidence for the bottleneck. */
  blocked: Record<string, number>;
  bottleneckId: number | null;
  outputTonnes: number;
  cutTonnes: number;
  pulledAheadTonnes: number;
  /** Committed-this-month work that did not get in, in minutes. */
  missedMin: number;
  /** Orders whose fabrication is further into the month than their cutting. */
  aheadOfCutting: Set<number>;
}

export function effectiveMark(node: ModelNode, marks: Map<string, MarkState>): MarkState | null {
  for (let cur: ModelNode | null = node; cur; cur = cur.parent) {
    const m = marks.get(cur.id);
    if (m) return m;
  }
  return marks.get(poMarkId(node.orderId, node.poId)) ?? null;
}

const EMPTY: NodeSum = { inMin: 0, outMin: 0, inAtoms: 0, outAtoms: 0, noRoomMin: 0 };
const add = (a: NodeSum, b: NodeSum): NodeSum => ({
  inMin: a.inMin + b.inMin, outMin: a.outMin + b.outMin,
  inAtoms: a.inAtoms + b.inAtoms, outAtoms: a.outAtoms + b.outAtoms,
  noRoomMin: a.noRoomMin + b.noRoomMin,
});

export function runFit(
  model: Model,
  baseStations: FitStation[],
  tweaks: Tweaks,
  marks: Map<string, MarkState>,
  auto: boolean,
): FitResult {
  const fallback = fallbackPerUnit(baseStations);
  const cap: Record<string, number> = {};
  const load: Record<string, number> = {};
  const blocked: Record<string, number> = {};
  for (const st of baseStations) { cap[st.id] = capacityOf(st, tweaks[st.id], fallback); load[st.id] = 0; }

  const atomState = new Map<string, AtomState>();
  const eachNode = (fn: (n: ModelNode) => void) => {
    const walk = (n: ModelNode) => { n.children.forEach(walk); fn(n); };
    for (const o of model.orders) for (const po of o.pos) po.roots.forEach(walk);
  };
  const take = (n: ModelNode) => {
    for (const [k, v] of Object.entries(n.src.own)) if (k in load) load[k] += v;
  };

  // 1. What a person decided. Placed first and unconditionally: a forced piece
  //    that overfills a station shows as an overload, not as a silent refusal.
  eachNode((n) => {
    if (n.ownMin <= 0) return;
    const m = effectiveMark(n, marks);
    if (m === 'in') { atomState.set(n.id, 'in-forced'); take(n); }
    else if (m === 'out') atomState.set(n.id, 'out-forced');
    else if (!auto) atomState.set(n.id, 'manual-out');
  });

  // 2. The engine, for everything nobody has decided. Post-order, so a row is
  //    only reached once everything beneath it has an answer.
  if (auto) {
    const place = (n: ModelNode): boolean => {
      let partsIn = true;
      for (const c of n.children) if (!place(c)) partsIn = false;
      if (n.ownMin <= 0) return partsIn;
      const decided = atomState.get(n.id);
      if (decided) return partsIn && isIn(decided);
      if (!partsIn) { atomState.set(n.id, 'waits'); return false; }

      const short = Object.entries(n.src.own)
        .filter(([k, v]) => k in load && load[k] + v > cap[k] + 0.5);
      if (short.length > 0) {
        for (const [k, v] of short) blocked[k] = (blocked[k] ?? 0) + v;
        atomState.set(n.id, 'no-room');
        return false;
      }
      atomState.set(n.id, 'in');
      take(n);
      return true;
    };
    for (const o of model.orders) for (const po of o.pos) po.roots.forEach(place);
  }

  // 3. Roll the answers up the tree.
  const sums = new Map<string, NodeSum>();
  const roll = (n: ModelNode): NodeSum => {
    let s = EMPTY;
    for (const c of n.children) s = add(s, roll(c));
    if (n.ownMin > 0) {
      const st = atomState.get(n.id);
      s = add(s, isIn(st)
        ? { ...EMPTY, inMin: n.ownMin, inAtoms: 1 }
        : { ...EMPTY, outMin: n.ownMin, outAtoms: 1, noRoomMin: st === 'no-room' || st === 'waits' ? n.ownMin : 0 });
    }
    sums.set(n.id, s);
    return s;
  };
  let missedMin = 0;
  const aheadOfCutting = new Set<number>();
  for (const o of model.orders) {
    let os = EMPTY;
    const share: Partial<Record<string, number>> = {};
    for (const po of o.pos) {
      let ps = EMPTY;
      for (const r of po.roots) ps = add(ps, roll(r));
      sums.set(po.id, ps);
      os = add(os, ps);
      const total = ps.inMin + ps.outMin;
      if (total > 0 && po.src.purpose !== 'unreleased') share[po.src.purpose] = ps.inMin / total;
    }
    sums.set(o.id, os);
    if (o.due) missedMin += os.noRoomMin;
    if (share.cutting != null && share.fabrication != null && share.fabrication > share.cutting + 0.05) {
      aheadOfCutting.add(o.src.id);
    }
  }

  // 4. Tonnes. A row counts when ALL its remaining work is in, and it counts at
  //    the highest such row — a whole girder, not its forty parts. The same row
  //    can sit under two production orders (released and not yet released), so
  //    it is judged across both and counted once.
  let outputTonnes = 0;
  let cutTonnes = 0;
  let pulledAheadTonnes = 0;
  for (const o of model.orders) {
    const merged = new Map<string, { allIn: boolean; tonnes: number; parentKey: string | null; isBlank: boolean }>();
    for (const po of o.pos) {
      const visit = (n: ModelNode) => {
        n.children.forEach(visit);
        if (n.src.kind !== 'item') return;
        const allIn = (sums.get(n.id)?.outAtoms ?? 0) === 0;
        const seen = merged.get(n.src.key);
        if (seen) seen.allIn = seen.allIn && allIn;
        else merged.set(n.src.key, { allIn, tonnes: n.src.tonnes, parentKey: n.src.parentKey, isBlank: n.src.isBlank });
      };
      po.roots.forEach(visit);
    }
    for (const row of merged.values()) {
      if (!row.allIn) continue;
      const parent = row.parentKey ? merged.get(row.parentKey) : undefined;
      if (parent?.allIn) continue;
      if (row.isBlank) cutTonnes += row.tonnes;
      else {
        outputTonnes += row.tonnes;
        if (!o.due) pulledAheadTonnes += row.tonnes;
      }
    }
  }

  let bottleneckId: number | null = null;
  let worst = 0;
  for (const [k, v] of Object.entries(blocked)) if (v > worst) { worst = v; bottleneckId = Number(k); }

  const stations: StationView[] = baseStations.map((st) => {
    const t = tweaks[st.id];
    const capMin = cap[st.id];
    return {
      id: st.id, name: st.name,
      machines: t?.machines ?? st.machines, shifts: t?.shifts ?? st.shifts,
      baseMachines: st.machines, baseShifts: st.shifts, machinesDown: st.machinesDown,
      capMin, loadMin: load[st.id],
      util: capMin === Infinity ? 0 : (capMin > 0 ? load[st.id] / capMin : (load[st.id] > 0 ? Infinity : 0)),
      unbounded: st.unbounded,
      changed: !!t && (t.machines !== st.machines || t.shifts !== st.shifts),
      blockedMin: blocked[st.id] ?? 0,
    };
  });

  return {
    atomState, sums, stations, blocked, bottleneckId,
    outputTonnes, cutTonnes, pulledAheadTonnes, missedMin, aheadOfCutting,
  };
}

// ── the suggestor ────────────────────────────────────────────────────────────

export const TIGHT_AT = 0.85;

export interface Suggestion {
  id: string;
  stationId: number;
  title: string;
  effect: string;
  tweak: Tweak;
}

export const hours = (min: number) => `${Math.round(min / 60).toLocaleString()} h`;
export const tonnes = (t: number) => `${t >= 100 ? Math.round(t).toLocaleString() : t.toFixed(1)} t`;
const pct = (v: number) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : 'over');

function bumps(st: StationView): Array<{ title: string; tweak: Tweak }> {
  const out: Array<{ title: string; tweak: Tweak }> = [];
  if (st.shifts < MAX_SHIFTS) out.push({ title: `Add a shift at ${st.name}`, tweak: { machines: st.machines, shifts: st.shifts + 1 } });
  out.push({ title: `Add a machine at ${st.name}`, tweak: { machines: st.machines + 1, shifts: st.shifts } });
  return out;
}

/**
 * Two lists, in the order a plant should act on them.
 *
 *   keepFed  stations that are nearly full but are NOT the limit. They set no
 *            output today, yet one bad day on any of them starves or blocks the
 *            station that does — so they are cheap insurance, and come first.
 *   lift     ways to make the limiting station itself bigger, each with what it
 *            would actually buy, found by re-running the fit with it applied.
 */
export function suggest(
  model: Model, baseStations: FitStation[], tweaks: Tweaks,
  marks: Map<string, MarkState>, auto: boolean, fit: FitResult,
): { keepFed: Suggestion[]; lift: Suggestion[] } {
  const bott = fit.stations.find((s) => s.id === fit.bottleneckId) ?? null;
  const keepFed: Suggestion[] = [];
  const lift: Suggestion[] = [];

  for (const st of fit.stations) {
    // A station that turned work away is itself a limit, not a feeder: giving it
    // more room just lets the engine fill it again, so "it drops to" would lie.
    if (st.unbounded || st.id === bott?.id || st.blockedMin > 0 || st.util < TIGHT_AT) continue;
    const b = bumps(st)[0];
    const after = runFit(model, baseStations, { ...tweaks, [st.id]: b.tweak }, marks, auto)
      .stations.find((s) => s.id === st.id);
    keepFed.push({
      id: `fed-${st.id}`, stationId: st.id, tweak: b.tweak,
      title: `${st.name} is at ${pct(st.util)}`,
      effect: `${b.title} and it drops to ${pct(after?.util ?? 0)}.${bott ? ` One bad day there and ${bott.name} stands idle.` : ''}`,
    });
  }

  if (bott) {
    for (const b of bumps(bott)) {
      const next = runFit(model, baseStations, { ...tweaks, [bott.id]: b.tweak }, marks, auto);
      const parts: string[] = [];
      const dOut = next.outputTonnes - fit.outputTonnes;
      if (Math.abs(dOut) >= 0.05) parts.push(`Output ${dOut > 0 ? '+' : '−'}${tonnes(Math.abs(dOut))}`);
      if (fit.missedMin > 0) parts.push(`committed work with no room: ${hours(fit.missedMin)} → ${hours(next.missedMin)}`);
      const nextBott = next.stations.find((s) => s.id === next.bottleneckId);
      const tail = nextBott && nextBott.id !== bott.id ? ` Then ${nextBott.name} becomes the limit.`
        : (!nextBott ? ' Then nothing is turned away.' : '');
      lift.push({
        id: `lift-${bott.id}-${b.tweak.machines}-${b.tweak.shifts}`, stationId: bott.id, tweak: b.tweak,
        title: b.title,
        effect: `${parts.length ? `${parts.join('. ')}.` : 'No more whole pieces finish, because another station is full too.'}${tail}`,
      });
    }
  }
  return { keepFed, lift };
}
