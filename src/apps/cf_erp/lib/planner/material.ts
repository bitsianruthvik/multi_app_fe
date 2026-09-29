import type { Model } from './model';

/**
 * Material gate. Supply lots (stock first, then POs by date) are handed to units in the order they
 * are offered; a unit takes the earliest lots with quantity left. Its material period is the latest
 * lead-start period among the lots it took (received stock = the period containing its date, an
 * open PO = the first period starting on/after its expected date). A unit whose need cannot be
 * covered takes nothing and is "not ordered".
 */
export interface SupplyState {
  rem: Float64Array;
  /** first lot with quantity left, per item */
  ptr: Int32Array;
}

export interface MaterialResult {
  /** −1 when the unit needs nothing */
  period: number;
  date: string | null;
  source: string | null;
  /** set when not covered */
  short: { itemId: string; qty: number } | null;
}

/** Lots taken: flat pairs [lot, qty, lot, qty, …] */
export type Takes = number[];

const EPS = 1e-9;

export function newSupply(m: Model): SupplyState {
  return { rem: Float64Array.from(m.lotQty), ptr: Int32Array.from(m.itemLots.map((r) => r[0])) };
}

export function cloneSupply(s: SupplyState): SupplyState {
  return { rem: Float64Array.from(s.rem), ptr: Int32Array.from(s.ptr) };
}

function walk(m: Model, s: SupplyState, u: number, takes: Takes | null): MaterialResult {
  const items = m.matItem[u], qtys = m.matQty[u];
  let period = -1, date: string | null = null, source: string | null = null;
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    let need = qtys[k];
    if (it < 0) return { period: -1, date: null, source: null, short: { itemId: m.matItemId[u][k], qty: need } };
    const [, end] = m.itemLots[it];
    let l = s.ptr[it];
    while (need > EPS * Math.max(1, qtys[k]) && l < end) {
      const avail = s.rem[l];
      if (avail > EPS) {
        const t = Math.min(avail, need);
        need -= t;
        if (takes) { takes.push(l, t); s.rem[l] -= t; }
        if (m.lotPeriod[l] > period) period = m.lotPeriod[l];
        if (date === null || m.lotDate[l] > date) { date = m.lotDate[l]; source = m.lotSource[l]; }
      }
      if (s.rem[l] <= EPS || !takes) l++;
    }
    if (takes) {
      let p = s.ptr[it];
      while (p < end && s.rem[p] <= EPS) p++;
      s.ptr[it] = p;
    }
    if (need > EPS * Math.max(1, qtys[k])) {
      if (takes) release(m, s, takes);
      return { period: -1, date: null, source: null, short: { itemId: m.matItemId[u][k], qty: need } };
    }
  }
  return { period, date, source, short: null };
}

/** What the unit would get, without taking anything. */
export const trialMaterial = (m: Model, s: SupplyState, u: number) => walk(m, s, u, null);

/** Take the unit's material; on shortage nothing is taken. */
export function takeMaterial(m: Model, s: SupplyState, u: number): { res: MaterialResult; takes: Takes } {
  const takes: Takes = [];
  const res = walk(m, s, u, takes);
  return { res, takes: res.short ? [] : takes };
}

/** Give lots back (unplace / rollback). */
export function release(m: Model, s: SupplyState, takes: Takes) {
  for (let i = 0; i < takes.length; i += 2) {
    const l = takes[i];
    s.rem[l] += takes[i + 1];
    const it = m.lotItem[l];
    if (l < s.ptr[it]) s.ptr[it] = l;
  }
  takes.length = 0;
}
