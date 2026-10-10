import type { Model } from './model';
import { dayLabel, firstPeriodFrom } from './periods';
import type { MaterialState } from './types';

/**
 * Material, as the SERVER decided it (CF_ERP_BUYING_V2.md §4–5). The browser does not compute
 * readiness: each unit carries `material` on the snapshot, and this file only turns that answer
 * into the plan period the work may start in. Units compete for stock on the server, in claim
 * order — nothing here hands anything out.
 *
 *   waiting  → `short` is set (the unit cannot be planned); `short.text` is the backend's sentence
 *   dated    → work may start in the plan period on/after `earliest` (null = any week)
 *   late     → flagged; placeable unless the server gave an `earliest`
 *   no `material` field (an old snapshot or fixture) → no gate at all
 */
export interface MaterialResult {
  /** First plan period the work may start in; −1 = no gate (any week), P = after the plan */
  period: number;
  /** The server's ready date (null when it waits, or needs nothing) */
  date: string | null;
  /** Always null now (the PO a date came from is in the server's sentence) */
  source: string | null;
  /** set when the unit waits for stock */
  short: { itemId: string; qty: number; text: string } | null;
  state: MaterialState | null;
  /** The server's sentence for the whole unit */
  text: string | null;
}

/** Kept for callers that still pass a supply around; there is no supply in the browser any more. */
export interface SupplyState { readonly none: true }
/** Always empty (the server assigns cover). */
export type Takes = number[];

const NONE: MaterialResult = { period: -1, date: null, source: null, short: null, state: null, text: null };
const cache = new WeakMap<Model, (MaterialResult | undefined)[]>();

const fmtQty = (q: number) => (Math.abs(q) >= 10 ? String(Math.round(q)) : String(Number(q.toFixed(2))));

/** What the server said about unit `u`, as a MaterialResult. */
export function materialOf(m: Model, u: number): MaterialResult {
  let arr = cache.get(m);
  if (!arr) { arr = new Array(m.N); cache.set(m, arr); }
  const hit = arr[u];
  if (hit) return hit;
  const mat = m.units[u].material;
  let r: MaterialResult;
  if (!mat) r = NONE;
  else if (mat.state === 'waiting') {
    const reason = mat.reasons?.find((x) => x.state === 'waiting' && x.short > 0) ?? mat.reasons?.find((x) => x.state === 'waiting') ?? mat.reasons?.[0];
    const named = reason?.skipped && !mat.text && !reason.text
      ? `Waiting for stock: ${reason.item.code} short by ${fmtQty(reason.short)}. Buying was skipped for it.`
      : null;
    const text = mat.text || reason?.text || named || 'Waiting for material — see Purchase.';
    r = { period: -1, date: null, source: null, short: { itemId: String(reason?.item.id ?? ''), qty: reason?.short ?? 0, text }, state: 'waiting', text };
  } else {
    const gate = mat.earliest ? Math.min(firstPeriodFrom(m.periods, mat.earliest), m.P) : -1;
    r = { period: gate, date: mat.readyDate ?? null, source: null, short: null, state: mat.state, text: mat.text || null };
  }
  arr[u] = r;
  return r;
}

/** Plain words for "cannot go before this week". */
export const earliestWords = (m: Model, r: MaterialResult) =>
  r.period >= m.P ? 'after the last week of this plan' : `the week of ${dayLabel(m.periods[Math.max(0, r.period)].start)} or later`;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const newSupply = (_m: Model): SupplyState => ({ none: true });
export const cloneSupply = (s: SupplyState): SupplyState => s;

/** What the server said — nothing is taken. */
export const trialMaterial = (m: Model, _s: SupplyState, u: number) => materialOf(m, u);

/** The unit's material, as the server answered; nothing is taken from anywhere. */
export function takeMaterial(m: Model, _s: SupplyState, u: number): { res: MaterialResult; takes: Takes } {
  return { res: materialOf(m, u), takes: [] };
}

/** Nothing to give back. */
export function release(_m: Model, _s: SupplyState, takes: Takes) {
  takes.length = 0;
}
