import type { Valuation } from '../api/money';
import type { PurchaseOrderRow, SalesOrder } from '../api/types';
import type { Stat } from '../components/ui';
import { rupeeText } from './money';

/** The four money numbers of the home page. Each is optional: a missing permission just leaves its tile out. */
export interface MoneyTiles { stockValue: Valuation | null; openPurchases: PurchaseOrderRow[] | null; orderBook: SalesOrder[] | null }

/** Tiles for the money strip — only the ones whose number could be read. A missing amount is "not costed", never ₹0. */
export function moneyStats(m: MoneyTiles, go: (path: string) => void): Stat[] {
  const out: Stat[] = [];
  if (m.stockValue) {
    const ours = m.stockValue.ours;
    const none = ours.value === 0 && ours.uncostedQty > 0;
    out.push({ label: 'Stock value (ours)', value: ours.value, display: none ? 'not costed' : rupeeText(ours.value), hint: ours.uncostedQty > 0 ? 'Some stock has no cost and is left out' : 'All our stock, at cost', onClick: () => go('stock') });
    const theirs = m.stockValue.groups.filter((g) => g.owner && g.customers.quantity > 0);
    const lots = theirs.reduce((t, g) => t + g.rows, 0);
    out.push({ label: 'Customer material held', value: lots, display: lots === 0 ? 'none' : `${lots} lot${lots === 1 ? '' : 's'}`, hint: lots === 0 ? 'Nothing a customer sent is on our shelves' : `From ${theirs.length} customer${theirs.length === 1 ? '' : 's'} — not ours, not in the value`, onClick: () => go('stock') });
  }
  if (m.openPurchases) {
    const amount = m.openPurchases.reduce((t, p) => t + (p.totals.amount ?? 0), 0);
    const unpriced = m.openPurchases.reduce((t, p) => t + (p.totals.unpricedLines ?? 0), 0);
    out.push({ label: 'Open purchase orders', value: amount, display: amount === 0 && unpriced > 0 ? 'not priced' : rupeeText(amount), hint: unpriced ? `${unpriced} line${unpriced === 1 ? ' has' : 's have'} no price and ${unpriced === 1 ? 'is' : 'are'} left out` : `${m.openPurchases.length} open, before tax`, onClick: () => go('purchase-orders') });
  }
  if (m.orderBook) {
    const amount = m.orderBook.reduce((t, o) => t + (o.total?.amount ?? 0), 0);
    const partial = m.orderBook.filter((o) => o.total && !o.total.complete).length;
    out.push({ label: 'Order book', value: amount, display: rupeeText(amount), hint: partial ? `${partial} order${partial === 1 ? ' is' : 's are'} not fully priced` : `${m.orderBook.length} confirmed, before tax`, onClick: () => go('orders?status=confirmed') });
  }
  return out;
}

