import { evaluate } from './evaluate';
import { addLoad, earliestForMaterial, fits } from './load';
import { newSupply, release, takeMaterial, trialMaterial, type Takes } from './material';
import { activeUnits, getModel, type Model } from './model';
import { monthLong } from './periods';
import type { AutoPlanOptions, AutoPlanResult, Plan, PlannerSnapshot } from './types';

/**
 * Auto-plan (TM/CF_ERP_PLANNER_PLAN.md §3). Deterministic; never moves a pinned card; never adds
 * load to a cell that would go over capacity (pins may already overload — they stay).
 *
 * 1. Place the pins (their load and material first).
 * 2. Packages = lines (shipping groups) in priority order; a card covering several lines (a span)
 *    joins them into one package.
 * 3. For each month: place each package WHOLE in its earliest feasible periods if it completes
 *    inside the month (material gate, lead, capacity). A package that fails because a card above
 *    line depth does not fit is split into its lines, which are tried at once.
 *    Then, if partial lines are allowed, fill spare capacity with cards of the highest-priority
 *    unfinished lines. Then, while fewer than `minLinesPerMonth` lines ship, complete the smallest
 *    remaining line by lifting the lowest-priority unpinned cards out of the month.
 * 4. Re-check with `evaluate`; any card the material order leaves late is taken off again.
 */

interface Pkg {
  units: number[];
  prio: number;
}

type Fail = 'short' | 'late' | 'cap' | null;

const unitMinutes = (m: Model, u: number) => {
  let t = 0;
  const fs = m.workFn[u], ms = m.workMin[u];
  for (let k = 0; k < fs.length; k++) if (!m.unlimited[fs[k]]) t += ms[k];
  return t;
};

function makePackages(m: Model, units: number[]): Pkg[] {
  const parent = new Map<string, string>();
  const find = (g: string): string => {
    let r = g;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let x = g;
    while (parent.get(x) !== r) { const n = parent.get(x)!; parent.set(x, r); x = n; }
    return r;
  };
  for (const u of units) {
    const gs = [...m.covers[u].keys()];
    for (const g of gs) if (!parent.has(g)) parent.set(g, g);
    for (let k = 1; k < gs.length; k++) {
      const a = find(gs[0]), b = find(gs[k]);
      if (a !== b) parent.set(b, a);
    }
  }
  const byRoot = new Map<string, Pkg>();
  for (const u of units) {
    const first = m.covers[u].keys().next().value ?? `u${u}`;
    const r = parent.has(first) ? find(first) : first;
    let p = byRoot.get(r);
    if (!p) { p = { units: [], prio: Infinity }; byRoot.set(r, p); }
    p.units.push(u);
    p.prio = Math.min(p.prio, m.prio[u]);
  }
  const out = [...byRoot.values()];
  for (const p of out) p.units.sort((a, b) => m.prio[a] - m.prio[b]);
  return out.sort((a, b) => a.prio - b.prio);
}

/** Descendants that each cover one line (the split of a span into its girder lines). */
function expand(m: Model, u: number): number[] {
  const out: number[] = [];
  for (const c of m.children[u]) {
    if (m.covers[c].size > 1 && m.children[c].length) out.push(...expand(m, c));
    else out.push(c);
  }
  return out;
}

export function autoPlan(snapshot: PlannerSnapshot, plan: Plan, options: AutoPlanOptions = {}): AutoPlanResult {
  const m = getModel(snapshot);
  const minLines = Math.max(0, options.minLinesPerMonth ?? snapshot.settings?.minLinesPerMonth ?? 1);
  const allowPartial = options.allowPartialLines ?? snapshot.settings?.allowPartialLines ?? true;
  const { P, periods } = m;

  const pins: Plan = {};
  for (const [k, e] of Object.entries(plan || {})) if (e?.pinned) pins[k] = e;
  const act = activeUnits(m, pins, options);

  const ship = new Int32Array(m.N).fill(-1);
  const pinned = new Uint8Array(m.N);
  const takesOf = new Map<number, Takes>();
  const rem = Float64Array.from(m.cap);
  const supply = newSupply(m);

  const place = (u: number, s: number, takes: Takes) => {
    ship[u] = s;
    addLoad(m, rem, u, s, -1);
    takesOf.set(u, takes);
  };
  const unplace = (u: number) => {
    addLoad(m, rem, u, ship[u], 1);
    const t = takesOf.get(u);
    if (t) release(m, supply, t);
    takesOf.delete(u);
    ship[u] = -1;
  };

  // 1. pins
  const pinList = act.filter((u) => {
    const e = pins[m.units[u].key];
    const s = e ? m.periodIdx.get(e.period) : undefined;
    if (s === undefined) return false;
    ship[u] = s;
    pinned[u] = 1;
    return true;
  }).sort((a, b) => ship[a] - ship[b] || m.prio[a] - m.prio[b]);
  for (const u of pinList) {
    const s = ship[u];
    place(u, s, takeMaterial(m, supply, u).takes);
  }

  const fail: { why: Fail } = { why: null };
  /** Place u at its earliest feasible ship period in [a, b]; −1 if none (fail.why says why). */
  const tryEarliest = (u: number, a: number, b: number): number => {
    const r = trialMaterial(m, supply, u);
    if (r.short) { fail.why = 'short'; return -1; }
    if (r.period >= P) { fail.why = 'late'; return -1; }
    const from = earliestForMaterial(m, u, r.period, a);
    if (from > b) { fail.why = 'late'; return -1; }
    for (let s = from; s <= b; s++) {
      if (fits(m, rem, u, s)) {
        place(u, s, takeMaterial(m, supply, u).takes);
        return s;
      }
    }
    fail.why = 'cap';
    return -1;
  };
  /** Place all given units inside [a, b] or none. */
  const placeAll = (units: number[], a: number, b: number): number => {
    const done: number[] = [];
    for (const u of units) {
      if (ship[u] >= 0) continue;
      if (tryEarliest(u, a, b) < 0) {
        for (let k = done.length - 1; k >= 0; k--) unplace(done[k]);
        return u;
      }
      done.push(u);
    }
    return -1;
  };

  // 2. packages
  let pending = makePackages(m, act.filter((u) => !pinned[u]));
  const splits: { code: string; groups: string[]; month: number; word: string }[] = [];
  const liftNotes: string[] = [];
  /** Months that ship fewer lines than asked, and why the next line did not fit. */
  const shorts: { mi: number; shipped: number; why: Set<Fail> }[] = [];

  const shippingIn = (a: number, b: number): Set<string> => {
    const cnt = new Map<string, number>(), last = new Map<string, number>();
    for (let u = 0; u < m.N; u++) {
      const s = ship[u];
      if (s < 0) continue;
      for (const [g, n] of m.covers[u]) {
        cnt.set(g, (cnt.get(g) ?? 0) + n);
        if ((last.get(g) ?? -1) < s) last.set(g, s);
      }
    }
    const out = new Set<string>();
    for (const [g, n] of cnt) {
      const s = last.get(g)!;
      if (n >= (m.groupTotal.get(g) ?? 1) && s >= a && s <= b) out.add(g);
    }
    return out;
  };

  const levelWord = (u: number) => {
    const unit = m.units[u];
    const l = m.lines.get(String(unit.lineId))?.line;
    const w = l?.levels?.find((x) => String(x.value) === String(unit.depth))?.label;
    return w ? w.toLowerCase() : 'line';
  };

  // 3. months
  for (let mi = 0; mi < m.months.length; mi++) {
    const [a, b] = m.monthRange[mi];

    // whole packages
    for (let i = 0; i < pending.length;) {
      const pkg = pending[i];
      const failed = placeAll(pkg.units, a, b);
      if (failed >= 0 && fail.why !== 'late' && m.covers[failed].size > 1 && m.children[failed].length) {
        const parts = expand(m, failed);
        const groups = [...m.covers[failed].keys()];
        splits.push({ code: m.labels.units[m.units[failed].key], groups, month: mi, word: parts.length ? levelWord(parts[0]) : 'line' });
        const fresh = makePackages(m, [...pkg.units.filter((u) => u !== failed), ...parts]);
        pending.splice(i, 1, ...fresh);
        pending.sort((x, y) => x.prio - y.prio); // stable: fresh packages keep their place among equals
        i = pending.indexOf(fresh[0]);
        continue;
      }
      i++;
    }

    // partial fill
    if (allowPartial) for (const pkg of pending) for (const u of pkg.units) if (ship[u] < 0) tryEarliest(u, a, b);

    // at least N lines a month
    let shipping = shippingIn(a, b);
    let lifted = 0;
    while (shipping.size < minLines) {
      const open = pending.filter((p) => p.units.some((u) => ship[u] < 0));
      if (!open.length) break;
      const cands = open
        .map((p) => ({ p, left: p.units.filter((u) => ship[u] < 0).reduce((t, u) => t + unitMinutes(m, u), 0) }))
        .sort((x, y) => x.left - y.left || x.p.prio - y.p.prio)
        .slice(0, 5);
      let ok = false;
      const why = new Set<Fail>();
      for (const { p } of cands) {
        if (placeAll(p.units, a, b) < 0) { ok = true; break; }
        if (fail.why) why.add(fail.why); // why this line did not fit as things stand
        const own = new Set(p.units);
        const liftable: number[] = [];
        for (let u = 0; u < m.N; u++) {
          if (ship[u] < a || ship[u] > b || pinned[u] || own.has(u)) continue;
          let partOfShippingLine = false;
          for (const g of m.covers[u].keys()) if (shipping.has(g)) { partOfShippingLine = true; break; }
          if (!partOfShippingLine) liftable.push(u);
        }
        liftable.sort((x, y) => m.prio[y] - m.prio[x]);
        const out: [number, number][] = [];
        for (const u of liftable) {
          out.push([u, ship[u]]);
          unplace(u);
          if (placeAll(p.units, a, b) < 0) { ok = true; break; }
        }
        if (ok) { lifted += out.length; break; }
        for (let k = out.length - 1; k >= 0; k--) {
          const [u, s] = out[k];
          place(u, s, takeMaterial(m, supply, u).takes);
        }
      }
      if (!ok) {
        shorts.push({ mi, shipped: shipping.size, why });
        break;
      }
      shipping = shippingIn(a, b);
    }
    if (lifted) liftNotes.push(`To ship a line in ${monthLong(m.months[mi])}, moved ${lifted} lower-priority card${lifted > 1 ? 's' : ''} out of ${monthLong(m.months[mi])}.`);

    pending = pending.filter((p) => p.units.some((u) => ship[u] < 0));
  }

  // output plan: pins exactly as given + what was placed
  const out: Plan = { ...pins };
  for (let u = 0; u < m.N; u++) if (ship[u] >= 0 && !pinned[u]) out[m.units[u].key] = { period: periods[ship[u]].key, pinned: false };

  // 4. repair: material in plan order can differ from placement order
  let ev = evaluate(snapshot, out, options);
  for (let round = 0; round < 5; round++) {
    const bad = Object.entries(ev.units).filter(([k, x]) => x.period && x.blocked && !out[k]?.pinned).map(([k]) => k);
    if (!bad.length) break;
    for (const k of bad) delete out[k];
    ev = evaluate(snapshot, out, options);
  }

  // notes
  const notes: string[] = [];
  const pinCount = Object.keys(pins).length;
  if (pinCount) notes.push(`Kept ${pinCount} pinned card${pinCount > 1 ? 's' : ''} where ${pinCount > 1 ? 'they are' : 'it is'}.`);
  for (const ym of m.months) {
    const mo = ev.months[ym];
    const t = Math.round(mo.tonnes);
    const goal = mo.target != null ? ` of the ${Math.round(mo.target)} t goal` : '';
    const lines = `${mo.linesShipped} line${mo.linesShipped === 1 ? '' : 's'} ship${mo.linesShipped === 1 ? 's' : ''}`;
    const limit = mo.bottleneck.fn && mo.bottleneck.pct >= 85 ? ` ${mo.bottleneck.name} is the limit (${Math.round(mo.bottleneck.pct)}%).` : '';
    notes.push(`${monthLong(ym)}: ${t} t${goal}, ${lines}.${limit}`);
  }
  for (const sp of splits) {
    const n = sp.groups.length;
    const word = n > 1 ? `${sp.word}s` : sp.word;
    // "2 ship in October, 2 in November" — months in order, from the month of the split
    const parts: string[] = [];
    for (let k = sp.month; k < m.months.length; k++) {
      const c = sp.groups.filter((g) => ev.lines[g]?.month === m.months[k]).length;
      if (c) parts.push(parts.length ? `${c} in ${monthLong(m.months[k])}` : `${c} ship${c === 1 ? 's' : ''} in ${monthLong(m.months[k])}`);
    }
    notes.push(`Split ${sp.code} into ${n} ${word} — ${parts.length ? parts.join(', ') : `none fits in these ${m.months.length} months`}.`);
  }
  notes.push(...liftNotes);

  // Months short of lines, with the reason — consecutive months with the same words are one note.
  const shortWords = (x: { shipped: number; why: Set<Fail> }) => {
    const what = x.shipped ? `only ${x.shipped} whole line${x.shipped > 1 ? 's' : ''}` : 'no whole line';
    const parts: string[] = [];
    if (x.why.has('short')) parts.push('the material for another is not ordered');
    if (x.why.has('late')) parts.push('the material for another comes too late');
    if (x.why.has('cap')) parts.push('another does not fit the capacity left');
    return { what, why: parts.length ? parts.join(', or ') : 'not enough capacity or material for another' };
  };
  for (let i = 0; i < shorts.length;) {
    const w = shortWords(shorts[i]);
    let j = i + 1;
    while (j < shorts.length && shorts[j].mi === shorts[j - 1].mi + 1) {
      const n = shortWords(shorts[j]);
      if (n.what !== w.what || n.why !== w.why) break;
      j++;
    }
    const names = shorts.slice(i, j).map((x) => monthLong(m.months[x.mi]));
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    notes.push(`${list} ship${names.length === 1 ? 's' : ''} ${w.what} — ${w.why}.`);
    i = j;
  }

  // Why the cards left off the board wait, counted. These come first (after the pins): they are
  // what the planner can act on.
  const why = waitingReasons(m, ev, out);
  const lastMonth = monthLong(m.months[m.months.length - 1]);
  const cards = (n: number) => `${n} card${n === 1 ? '' : 's'}`;
  const reasons: string[] = [];
  if (why.notOrdered) reasons.push(`${cards(why.notOrdered)} wait${why.notOrdered === 1 ? 's' : ''} for material that isn't ordered — see the Buy list.`);
  if (why.dueAfter) reasons.push(`${cards(why.dueAfter)} wait${why.dueAfter === 1 ? 's' : ''} for material due after ${lastMonth}.`);
  if (why.tooLate) reasons.push(`${cards(why.tooLate)} get${why.tooLate === 1 ? 's' : ''} ${why.tooLate === 1 ? 'its' : 'their'} material too late to finish by the end of ${lastMonth}.`);
  if (why.capacity) reasons.push(`${cards(why.capacity)} ${why.capacity === 1 ? "doesn't" : "don't"} fit the capacity left.`);
  notes.splice(pinCount ? 1 : 0, 0, ...reasons);
  return { plan: out, notes };
}

/**
 * Why each unplaced card is off the board. Material is handed out in plan order, as `evaluate`
 * does (planned cards by ship period and priority, then the unplaced by priority), so a card
 * "waits for material" exactly when the board would say so.
 */
function waitingReasons(m: Model, ev: ReturnType<typeof evaluate>, plan: Plan) {
  const act: number[] = [];
  for (const k of Object.keys(ev.units)) { const u = m.unitIdx.get(k); if (u !== undefined) act.push(u); }
  const ship = new Int32Array(m.N).fill(-1);
  for (const u of act) { const e = plan[m.units[u].key]; if (e) ship[u] = m.periodIdx.get(e.period) ?? -1; }
  const s = newSupply(m);
  const planned = act.filter((u) => ship[u] >= 0).sort((a, b) => ship[a] - ship[b] || m.prio[a] - m.prio[b]);
  for (const u of planned) takeMaterial(m, s, u);
  const out = { notOrdered: 0, dueAfter: 0, tooLate: 0, capacity: 0 };
  for (const u of act.filter((x) => ship[x] < 0).sort((a, b) => m.prio[a] - m.prio[b])) {
    if (m.units[u].done) continue;
    const r = takeMaterial(m, s, u).res;
    if (r.short) out.notOrdered++;
    else if (r.period >= m.P) out.dueAfter++;
    else if (earliestForMaterial(m, u, r.period) >= m.P) out.tooLate++;
    else out.capacity++;
  }
  return out;
}
