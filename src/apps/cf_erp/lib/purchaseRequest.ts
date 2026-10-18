import type { MrScreenLine, PrLine, PrQuote, PrStatus, PrVendor, PurchaseRequest } from '../api/purchaseRequests';
import type { PurchaseStage, PurchaseType } from '../api/types';
import { qtyText } from './inventory';

/**
 * PURCHASE FLOW v3 (§71) — the small sums and words of the MR screen and the PR grid. Every status and figure comes
 * from the server; this only checks what is typed and fills the "Raise PO" dialog.
 */

/** §71: a PO's stage in words (the server sends the same words as `stageLabel`). */
export const PO_STAGE_LABEL: Record<PurchaseStage, string> = {
  pending_approval: 'Pending MD approval', requested: 'Not placed', waiting: 'Waiting for goods', part_received: 'Part received',
  closed: 'Closed', closed_short: 'Closed short', cancelled: 'Cancelled',
};
/** The stage filter chips of the Purchase orders screen, in the order a PO moves. */
export const PO_STAGE_FILTERS: { value: string; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'pending_approval', label: 'Pending MD approval' },
  { value: 'waiting', label: 'Waiting for goods' },
  { value: 'part_received', label: 'Part received' },
  { value: 'closed', label: 'Closed' },
  { value: 'closed_short', label: 'Closed short' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];
export const PO_TYPE_LABEL: Record<PurchaseType, string> = { material: 'Material', contractor: 'Contractor' };
export const PR_STATUS_LABEL: Record<PrStatus, string> = { open: 'Open', partly_ordered: 'Partly ordered', ordered: 'Ordered', closed: 'Closed' };

const EPS = 1e-6;
const r6 = (n: number) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;
const num = (v: string) => (v.trim() === '' ? NaN : Number(v));

/** What to buy once "take from stock" is typed: required − take, never below zero. */
export function toBuyOf(required: number, take: number): number {
  return Math.max(0, r6(required - (Number.isFinite(take) ? take : 0)));
}

/** The problem with one typed "take from stock", in words — or null. */
export function takeProblem(l: Pick<MrScreenLine, 'required' | 'takeMax' | 'item'>, text: string): string | null {
  const t = num(text);
  if (!Number.isFinite(t) || t < 0) return 'A number, zero or more.';
  if (t > l.required + EPS) return `The line needs ${qtyText(l.required)} ${l.item.uom}.`;
  if (t > l.takeMax + EPS) return `At most ${qtyText(l.takeMax)} ${l.item.uom} now.`;
  return null;
}

/** A quote cell in short: "₹62,000/nos · 7 d". */
export function quoteWords(q: PrQuote | undefined, uom: string): string {
  if (!q) return '';
  const rate = `₹${q.rate.toLocaleString('en-IN', { maximumFractionDigits: 4 })}/${uom}`;
  return q.deliveryDays != null ? `${rate} · ${q.deliveryDays} d` : rate;
}

/** The cheapest rate quoted for a line, over every vendor column (null = nobody quoted). */
export function cheapestOf(pr: Pick<PurchaseRequest, 'vendors'>, lineId: number): number | null {
  const rates = pr.vendors.map((v) => v.quotes[lineId]?.rate).filter((x): x is number => typeof x === 'number');
  return rates.length ? Math.min(...rates) : null;
}

/** The "Raise PO" dialog's rows for one vendor: their quoted lines, quantity filled in as needed − PO raised. */
export function poDraftOf(pr: Pick<PurchaseRequest, 'lines'>, vendor: Pick<PrVendor, 'quotes'>): { line: PrLine; quote: PrQuote; quantity: string; max: number }[] {
  return pr.lines.filter((l) => vendor.quotes[l.id] && l.needed > EPS)
    .map((l) => ({ line: l, quote: vendor.quotes[l.id], quantity: String(l.open), max: l.open }));
}

/** The PO's expected delivery date the dialog proposes: today + the longest quoted delivery days (null = none quoted). */
export function latestDelivery(today: string, days: (number | null)[]): string | null {
  const most = days.filter((d): d is number => typeof d === 'number');
  if (!most.length || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + Math.max(...most))).toISOString().slice(0, 10);
}

/** The problem with one typed PO quantity — or null. 0 = skip the line. */
export function poQtyProblem(text: string, max: number, uom: string): string | null {
  const q = num(text);
  if (!Number.isFinite(q) || q < 0) return 'A number, zero or more.';
  if (q > max + EPS) return `At most ${qtyText(max)} ${uom}.`;
  return null;
}
