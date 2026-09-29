import type { Model } from './model';

/**
 * Lead and load. A unit's lead (1..4 periods, computed in the model as
 * max(1, ceil(bottleneck minutes / (0.6 × that function's average period capacity))), capped at 4)
 * ends at its ship period; its minutes spread evenly over the lead periods. A lead that would start
 * before the horizon is squeezed into the periods that exist (conservative: the load shows).
 */
export const leadStart = (m: Model, u: number, s: number) => Math.max(0, s - m.lead[u] + 1);

/** Add (sign 1) or remove (sign −1) a unit's load at ship period s into a flat [f * P + p] table. */
export function addLoad(m: Model, table: Float64Array, u: number, s: number, sign: 1 | -1) {
  const a = leadStart(m, u, s);
  const n = s - a + 1;
  const fs = m.workFn[u], ms = m.workMin[u];
  for (let k = 0; k < fs.length; k++) {
    const per = (sign * ms[k]) / n;
    const base = fs[k] * m.P;
    for (let p = a; p <= s; p++) table[base + p] += per;
  }
}

/** True when the unit at ship period s fits in the remaining capacity `rem` (flat, capacity − load). */
export function fits(m: Model, rem: Float64Array, u: number, s: number): boolean {
  const a = leadStart(m, u, s);
  const n = s - a + 1;
  const fs = m.workFn[u], ms = m.workMin[u];
  for (let k = 0; k < fs.length; k++) {
    const f = fs[k];
    if (m.unlimited[f]) continue;
    const per = ms[k] / n;
    const base = f * m.P;
    for (let p = a; p <= s; p++) if (rem[base + p] < per - 1e-6) return false;
  }
  return true;
}

/** Percent used; 999 for minutes on zero capacity; 0 for unlimited. */
export function pctOf(minutes: number, capacity: number): number {
  if (!Number.isFinite(capacity)) return 0;
  if (capacity <= 0) return minutes > 1e-9 ? 999 : 0;
  return (minutes / capacity) * 100;
}

/** Earliest ship period ≥ `from` such that the lead starts on/after the material period. */
export function earliestForMaterial(m: Model, u: number, matPeriod: number, from = 0): number {
  if (matPeriod <= 0) return from;
  return Math.max(from, matPeriod + m.lead[u] - 1);
}
