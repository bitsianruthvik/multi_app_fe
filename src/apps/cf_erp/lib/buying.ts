import type { BoardCard, BoardColumn, BuyingStage, BuyingStageKey, OrderBuyRow, ProcurementTrace, TraceDoc, ReceiptRef } from '../api/buying';
import { rupeeText } from './money';

/**
 * The Buying board's words and the stage bar's model — pure, so the screens and
 * their tests read the same thing.
 */

export const NOT_PRICED = 'not priced';

/** A card's or column's value, in words: never ₹0 for an unknown price. */
export function boardValueText(value: number | null | undefined, unpriced = 0, total?: number): string {
  if (value == null) return NOT_PRICED;
  const base = rupeeText(value, 0);
  if (unpriced > 0 && total !== undefined && unpriced < total) return `${base} + ${unpriced} unpriced`;
  return base;
}

export function cardValueText(c: Pick<BoardCard, 'value' | 'valueState' | 'unpricedLines'>): string {
  if (c.value == null || c.valueState === 'none') return NOT_PRICED;
  return c.valueState === 'part' ? `${rupeeText(c.value, 0)} + ${c.unpricedLines} unpriced` : rupeeText(c.value, 0);
}

export const VALUE_BASIS_WORD: Record<BoardCard['valueBasis'], string> = {
  estimate: 'estimated', quoted: 'cheapest quote', awarded: 'awarded price', mixed: 'quotes and estimates', ordered: 'on the order',
};

export function ageText(days: number | null | undefined): string {
  if (days == null) return '';
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

export const DOC_NOUN: Record<BoardCard['type'], string> = { request: 'Purchase request', rfq: 'RFQ', po: 'Purchase order', to_buy: 'Buy list' };

/** The list screen a column's "N more" opens, as an app path with its query. */
export function moreHref(c: Pick<BoardColumn, 'moreLink'>): string {
  const q = new URLSearchParams(c.moreLink.query).toString();
  return q ? `${c.moreLink.path}?${q}` : c.moreLink.path;
}

// ---------------------------------------------------------------------------
// The stage bar
// ---------------------------------------------------------------------------

export type StageBarState = 'done' | 'current' | 'ahead' | 'todo';
export interface StageBarLink { key: string; label: string; link: string; current: boolean; title: string }
export interface StageBarStep { key: BuyingStageKey; label: string; hint: string; state: StageBarState; links: StageBarLink[] }

const docLink = (d: TraceDoc, current: boolean): StageBarLink => ({
  key: `${d.type}:${d.id}`, label: d.code, link: d.link, current,
  title: `${DOC_NOUN[d.type]} ${d.code} — ${d.statusLabel}${d.ended === 'passed' ? ' (passed on to the next document)' : ''}`,
});
const receiptLink = (r: ReceiptRef): StageBarLink => ({
  key: `grn:${r.id}`, label: r.code, link: r.link, current: false, title: `Receipt ${r.code} against ${r.purchaseOrder.code}, ${String(r.date).slice(0, 10)}`,
});

/**
 * Each stage of the sequence with its state and the documents standing at it.
 * `current` = the document's own stage; `done` = before it; `ahead` = after it
 * but reached by a document it led to (its RFQ, its PO); `todo` = not reached.
 * The To buy stage is shown done once any document exists (it is where they
 * all started) and carries no link. Receipts sit on the PO's receiving stage.
 */
export function stageBarModel(trace: ProcurementTrace, stages: BuyingStage[] = trace.stages): StageBarStep[] {
  const idx = (k: BuyingStageKey | null) => (k ? stages.findIndex((s) => s.key === k) : -1);
  const cancelled = trace.ended === 'cancelled';
  const cur = cancelled ? -1 : idx(trace.stage);
  const reached = Math.max(cur, idx(trace.reached));
  const others = [...trace.requests, ...trace.rfqs, ...trace.purchaseOrders].filter((d) => d.ended !== 'cancelled');
  return stages.map((s, i) => {
    const links: StageBarLink[] = [];
    if (trace.document.stage === s.key) links.push(docLink(trace.document, true));
    for (const d of others) if (d.stage === s.key) links.push(docLink(d, false));
    if (s.key === 'received' || s.key === 'part_received') {
      const poAt = new Map([...trace.purchaseOrders, ...(trace.type === 'po' ? [trace.document] : [])].map((p) => [p.id, p.stage]));
      for (const r of trace.receipts) {
        const at = poAt.get(r.purchaseOrder.id) === 'received' ? 'received' : 'part_received';
        if (at === s.key) links.push(receiptLink(r));
      }
    }
    const state: StageBarState = cancelled ? (i === 0 ? 'done' : 'todo')
      : i === cur ? 'current' : i < cur ? 'done' : i <= reached ? 'ahead' : 'todo';
    return { key: s.key, label: s.label, hint: s.hint, state, links };
  });
}

/** One plain sentence under the bar: where this document stands and what carries it on. */
export function stageBarSummary(trace: ProcurementTrace): string {
  const noun = DOC_NOUN[trace.type];
  const label = trace.stages.find((s) => s.key === trace.stage)?.label ?? '';
  if (trace.ended === 'cancelled') return `This ${noun.toLowerCase()} was cancelled.`;
  const next = trace.type === 'request' ? [...trace.rfqs, ...trace.purchaseOrders] : trace.type === 'rfq' ? trace.purchaseOrders : [];
  if (trace.ended === 'passed' && next.length) return `${label} — carried on by ${next.map((d) => d.code).join(', ')}.`;
  if (trace.type === 'po' && trace.receipts.length) return `${label} — ${trace.receipts.length} ${trace.receipts.length === 1 ? 'receipt' : 'receipts'} so far.`;
  return `${label}.`;
}

/** Counts per stage for an order: what the order body's strip shows. */
export function stageCounts(columns: BoardColumn[]): Record<string, { count: number; value: number | null }> {
  return Object.fromEntries(columns.map((c) => [c.key, { count: c.count, value: c.value }]));
}

/** What this order still has to raise: the rows with something left to request, one per item. */
export function stillToRequest(rows: OrderBuyRow[]): { itemId: number; quantity: number }[] {
  const byItem = new Map<number, number>();
  for (const r of rows) if (r.toRequest > 0) byItem.set(r.item.id, (byItem.get(r.item.id) ?? 0) + r.toRequest);
  return [...byItem].map(([itemId, quantity]) => ({ itemId, quantity: Math.round(quantity * 1e6) / 1e6 }));
}
