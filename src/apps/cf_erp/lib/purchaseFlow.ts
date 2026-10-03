import type { Comparison } from '../api/procurement';
import type { Award, PurchaseLaneKey, StockCheckLine } from '../api/purchase';
import type { PurchaseStatus } from '../api/types';
import { rupeeText } from './money';
import { canAward, cellFor, isExpired, type Choices } from './procurement';

/**
 * The purchase order's stage logic — pure, so the page and its test read the same thing.
 * Stages: Requested -> Stock checked -> RFQ out -> Quotes in -> Ordered -> Received (Part received sits on the last).
 */

export interface StripStep { key: Exclude<PurchaseLaneKey, 'part_received'>; label: string }

export const STRIP_STEPS: StripStep[] = [
  { key: 'requested', label: 'Requested' },
  { key: 'stock_checked', label: 'Stock checked' },
  { key: 'rfq_out', label: 'RFQ out' },
  { key: 'quotes_in', label: 'Quotes in' },
  { key: 'ordered', label: 'Ordered' },
  { key: 'received', label: 'Received' },
];

/** A purchase order's lane. `stockChecked` and `quotes` only matter before it is placed. */
export function poLane(status: PurchaseStatus, stockChecked: boolean, quotes: number): PurchaseLaneKey | null {
  if (status === 'requested' || status === 'draft') return stockChecked ? 'stock_checked' : 'requested';
  if (status === 'quoting') return quotes > 0 ? 'quotes_in' : 'rfq_out';
  if (status === 'ordered') return 'ordered';
  if (status === 'partially_received') return 'part_received';
  if (status === 'received') return 'received';
  return null;
}

export type StripState = 'done' | 'current' | 'ahead';

/** Each step of the strip with its state; a part-received order has Ordered done and Received under way. */
export function stripModel(lane: PurchaseLaneKey | null): { key: StripStep['key']; label: string; state: StripState }[] {
  const at = lane == null ? -1 : STRIP_STEPS.findIndex((s) => s.key === (lane === 'part_received' ? 'received' : lane));
  return STRIP_STEPS.map((s, i) => ({
    key: s.key,
    label: s.key === 'received' && lane === 'part_received' ? 'Part received' : s.label,
    state: lane === 'received' && i === at ? 'done' : i < at ? 'done' : i === at ? 'current' : 'ahead',
  }));
}

/** Before an order is placed the PO is still being prepared: stock check, RFQ, quotes. */
export const isPreOrder = (status: PurchaseStatus) => status === 'requested' || status === 'quoting' || status === 'draft';

// ---- Stock check ----------------------------------------------------------------------------------------------------

/** The most that can be held for a line: what is free, never more than the line. */
export const maxHold = (l: Pick<StockCheckLine, 'quantity' | 'freeInStock'>) => Math.max(0, Math.min(l.quantity, l.freeInStock));

/** Why a typed hold cannot be used, in words; null when it is fine. Empty means zero. */
export function holdProblem(l: StockCheckLine, text: string): string | null {
  const t = text.replace(/[,\s]/g, '');
  if (t === '') return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return `${l.item.code ?? l.item.name}: "${text}" is not a number.`;
  const n = Number(t);
  if (n > l.quantity + 1e-9) return `${l.item.code ?? l.item.name}: the line is only ${l.quantity}.`;
  if (n > l.freeInStock + 1e-9) return `${l.item.code ?? l.item.name}: only ${l.freeInStock} is free in stock.`;
  return null;
}

/** The holds as typed (text per line id), as POST /stock-check wants them: every line, zero when empty. */
export function holdsBody(lines: StockCheckLine[], typed: Record<number, string>): { lineId: number; hold: number }[] {
  return lines.map((l) => {
    const n = Number((typed[l.lineId] ?? '').replace(/[,\s]/g, ''));
    return { lineId: l.lineId, hold: Number.isFinite(n) && n > 0 ? n : 0 };
  });
}

/** The prefill: the system proposes what to hold. */
export const proposedHolds = (lines: StockCheckLine[]): Record<number, string> =>
  Object.fromEntries(lines.map((l) => [l.lineId, l.proposeHold > 0 ? String(l.proposeHold) : '']));

// ---- Quotes and awards ----------------------------------------------------------------------------------------------

/** Per line: the server's recommendation where its cell can be awarded, else the cheapest unexpired awardable cell is left to the person. */
export function recommendedChoices(c: Comparison): Choices {
  const out: Choices = {};
  const rec = new Map((c.recommendation?.perLine ?? []).map((r) => [r.rfqLineId, r.supplierId]));
  for (const line of c.lines) {
    const sid = rec.get(line.rfqLine.id);
    const cell = sid != null ? cellFor(line, sid) : undefined;
    out[line.rfqLine.id] = sid != null && canAward(cell) && !isExpired(cell) ? sid : null;
  }
  return out;
}

/** The body of POST /place: one award per chosen line whose cell can be awarded. */
export function awardsFromChoices(c: Comparison, choices: Choices): Award[] {
  const out: Award[] = [];
  for (const line of c.lines) {
    const sid = choices[line.rfqLine.id];
    const cell = sid != null ? cellFor(line, sid) : undefined;
    if (canAward(cell)) out.push({ rfqLineId: line.rfqLine.id, quoteLineId: cell.quoteLineId });
  }
  return out;
}

/** How many purchase orders placing these choices makes: one per supplier, plus one left behind for lines nobody won. */
export function orderCountFor(c: Comparison, choices: Choices): number {
  const suppliers = new Set<number>();
  let left = 0;
  for (const line of c.lines) {
    const sid = choices[line.rfqLine.id];
    if (sid != null && canAward(cellFor(line, sid))) suppliers.add(sid); else left += 1;
  }
  return suppliers.size + (left > 0 && suppliers.size > 0 ? 1 : 0);
}

// ---- Board words -----------------------------------------------------------------------------------------------------

export const NOT_PRICED = 'not priced';

/** A card's or lane's value in words: never ₹0 for an unknown price. */
export const valueText = (value: number | null | undefined) => (value == null ? NOT_PRICED : rupeeText(value, 0));

// ---- Request items ---------------------------------------------------------------------------------------------------

export interface RequestRow { key: number; itemId: number; code: string | null; name: string; uom: string; quantity: string }

/** The rows the dialog starts with: what the order is short of, one per item. */
export function rowsFromShortfall(shortfall: { item: { id: number; code: string | null; name: string; uom: string }; uom?: string; toBuy: number }[]): RequestRow[] {
  return shortfall.map((s, i) => ({ key: i + 1, itemId: s.item.id, code: s.item.code, name: s.item.name, uom: s.uom ?? s.item.uom, quantity: String(s.toBuy) }));
}

/** The body of POST /orders/:id/purchase-request: rows with a quantity above zero. */
export function requestBody(rows: RequestRow[]) {
  return rows
    .map((r) => ({ itemId: r.itemId, quantity: Number(r.quantity.replace(/[,\s]/g, '')) }))
    .filter((l) => Number.isFinite(l.quantity) && l.quantity > 0);
}

