import type { Model } from './model';

/**
 * Booking (planner v2, TM/CF_ERP_PLANNER_V2_PLAN.md). A unit's work is a chain of steps
 * (`m.stepFn` / `m.stepMin`); a step books into what its machine type has LEFT in a week
 * (`rem`, flat [f * P + p] = capacity − what is booked already) and the next step may start in the
 * same week the previous one finished. Machine types that never run out (contractors) and those
 * with no shift time at all (`m.noCap`) take no time: their minutes land in the current week.
 *
 * Cells booked are returned as flat triples [f, p, minutes, f, p, minutes, …].
 */
export type Cells = number[];

const EPS = 1e-6;
const free = (m: Model, f: number) => m.unlimited[f] || m.noCap[f];

/**
 * Book u's chain BACKWARDS so its last step finishes in week `s` — each step as late as the
 * capacity left allows — but not before week `floor` (its material). What does not fit by the floor
 * is booked in the floor week anyway (it shows as overload). Takes the minutes out of `rem`.
 */
export function bookBackward(m: Model, rem: Float64Array, u: number, s: number, floor: number, cells: Cells): { start: number; overflow: number } {
  const { P } = m;
  const lo = Math.max(0, Math.min(floor, s));
  const fs = m.stepFn[u], ms = m.stepMin[u];
  let p = s, overflow = 0;
  for (let k = fs.length - 1; k >= 0; k--) {
    const f = fs[k];
    let need = ms[k];
    if (free(m, f)) { rem[f * P + p] -= need; cells.push(f, p, need); continue; }
    while (need > EPS) {
      const i = f * P + p;
      if (rem[i] > EPS) {
        const t = Math.min(rem[i], need);
        rem[i] -= t;
        need -= t;
        cells.push(f, p, t);
      }
      if (need <= EPS) break;
      if (p > lo) p--;
      else { rem[i] -= need; cells.push(f, p, need); overflow += need; need = 0; }
    }
  }
  return { start: fs.length ? p : s, overflow };
}

/**
 * Book u's chain FORWARDS from week `a` — each step as early as the capacity left allows — to finish
 * by week `s`. What would run past `s` is booked in week `s` anyway (it shows as overload). This is
 * how an auto-placed card books: auto-plan put it at the week its chain finishes this way.
 */
export function bookForward(m: Model, rem: Float64Array, u: number, a: number, s: number, cells: Cells): { start: number; overflow: number } {
  const { P } = m;
  const fs = m.stepFn[u], ms = m.stepMin[u];
  let p = Math.max(0, Math.min(a, s)), overflow = 0;
  for (let k = 0; k < fs.length; k++) {
    const f = fs[k];
    let need = ms[k];
    if (free(m, f)) { rem[f * P + p] -= need; cells.push(f, p, need); continue; }
    while (need > EPS) {
      const i = f * P + p;
      if (rem[i] > EPS) {
        const t = Math.min(rem[i], need);
        rem[i] -= t;
        need -= t;
        cells.push(f, p, t);
      }
      if (need <= EPS) break;
      if (p < s) p++;
      else { rem[i] -= need; cells.push(f, p, need); overflow += need; need = 0; }
    }
  }
  // The bar starts at the first week anything is booked (a first step may skip full weeks).
  let start = s;
  for (let i = 1; i < cells.length; i += 3) if (cells[i] < start) start = cells[i];
  return { start: fs.length ? start : s, overflow };
}

/**
 * The week u's chain would finish if it started in week `a` and every step went as EARLY as the
 * capacity left allows (nothing is taken). P when it cannot finish inside the horizon.
 */
export function forwardEnd(m: Model, rem: Float64Array, u: number, a: number): number {
  const { P } = m;
  if (a >= P) return P;
  const fs = m.stepFn[u], ms = m.stepMin[u];
  const used = new Map<number, number>();
  let p = Math.max(0, a);
  for (let k = 0; k < fs.length; k++) {
    const f = fs[k];
    if (free(m, f)) continue;
    let need = ms[k];
    while (need > EPS) {
      if (p >= P) return P;
      const i = f * P + p;
      const avail = rem[i] - (used.get(i) ?? 0);
      if (avail > EPS) {
        const t = Math.min(avail, need);
        used.set(i, (used.get(i) ?? 0) + t);
        need -= t;
      }
      if (need > EPS) p++;
    }
  }
  return p;
}

/** A stretched bar: each machine type's minutes spread evenly over weeks a…s (capacity ignored). */
export function bookSpread(m: Model, rem: Float64Array, u: number, a: number, s: number, cells: Cells) {
  const { P } = m;
  const lo = Math.max(0, Math.min(a, s));
  const n = s - lo + 1;
  const fs = m.workFn[u], ms = m.workMin[u];
  for (let k = 0; k < fs.length; k++) {
    const per = ms[k] / n;
    for (let p = lo; p <= s; p++) { rem[fs[k] * P + p] -= per; cells.push(fs[k], p, per); }
  }
}

/** Give booked cells back to `rem`. */
export function unbook(m: Model, rem: Float64Array, cells: Cells) {
  for (let i = 0; i < cells.length; i += 3) rem[cells[i] * m.P + cells[i + 1]] += cells[i + 2];
}

/** The earliest week u's chain can finish in an EMPTY shop when it starts in week a (P = never). */
export function emptyShopEnd(m: Model, u: number, a: number): number {
  return forwardEnd(m, m.cap, u, Math.max(0, a));
}

/** Percent used; 999 for minutes on zero capacity; 0 for unlimited. */
export function pctOf(minutes: number, capacity: number): number {
  if (!Number.isFinite(capacity)) return 0;
  if (capacity <= 0) return minutes > 1e-9 ? 999 : 0;
  return (minutes / capacity) * 100;
}
