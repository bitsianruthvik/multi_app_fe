/**
 * The money view and customer material (CF_ERP_MONEY_PLAN). Every amount is INR, net of
 * tax. A null cost means "not costed" — never zero.
 */
export type PriceBasis = 'unit' | 'kg' | 'tonne' | 'metre';

/** Who owns a lot of stock: null on a row means ours. */
export interface StockOwner { party: { id: number; code: string | null; name: string | null }; order: { id: number; code: string | null } | null }

export interface ItemPrices {
  itemId: number;
  listPrice: number | null;
  priceBasis: PriceBasis;
  listUnitPrice: number | null;
  lastPurchasePrice: number | null;
  lastPurchaseDate: string | null;
  lastPurchaseOrder: { id: number; code: string } | null;
  lastPurchaseSupplier: { id: number; name: string } | null;
}

export interface MoneyBucket { quantity: number; value: number; uncostedQty: number }

export interface ItemCost {
  item: { id: number; code: string | null; name: string; uom: string };
  lastReceipt: { unitCost: number; date: string | null; movement: { id: number; code: string }; party: { id: number; name: string } | null } | null;
  averageCost: number | null;
  costedQty: number | null;
  stock: { ours: MoneyBucket; customers: MoneyBucket };
}

export interface ValuationGroup {
  key: string;
  item?: { id: number; code: string | null; name: string; uom: string };
  area?: { id: number; code: string; name: string };
  owner?: { id: number; code: string | null; name: string | null } | null;
  ours: MoneyBucket;
  customers: MoneyBucket;
  rows: number;
}
export interface Valuation { groupBy: 'item' | 'area' | 'owner'; ours: MoneyBucket; customers: MoneyBucket; groups: ValuationGroup[] }

export interface OrderCostLine {
  line: { id: number; lineNo: number; orderId: number; revision: number; item: { id: number; code: string | null; name: string } };
  issued: { value: number; quantity: number; uncostedRows: number };
  customerIssued: { value: number; quantity: number; uncostedRows: number };
  scrap: { value: number; uncostedRows: number };
  nest: { lots: number; customerLots: number; plateValue: number; wastageKg: number; wastageValue: number; offcutKg: number; offcutValue: number; uncostedLots: number };
}
export interface OrderCosts {
  order: { id: number; code: string; revision: number; customer: { id: number; code: string | null; name: string | null } | null };
  lines: OrderCostLine[];
  notOnALine: { issued: { value: number }; customerIssued: { value: number }; scrap: { value: number } };
  totals: { issuedValue: number; customerIssuedValue: number; scrapValue: number; plateValue: number; wastageValue: number; offcutValue: number; uncostedRows: number };
}

export interface KgQty { qty: number; kg: number | null }
export interface ReconItem {
  item: { id: number; code: string | null; name: string };
  uom: string;
  kgPerUnit: number | null;
  received: KgQty; issued: KgQty; scrapped: KgQty; returned: KgQty; adjusted: KgQty; withUs: KgQty; balanceOnHand: KgQty;
  balances: boolean;
}
export interface ReconOffcut { id: number; offcutNo: string; status: string; lineNo: number; weightKg: number | null; areaMm2: number; thicknessMm: number | null; grade: string | null }
export interface Tally { count: number; kg: number }
export interface MaterialReconciliation {
  order: { id: number; code: string; revision: number };
  customer: { id: number; code: string | null; name: string | null };
  items: ReconItem[];
  offcuts: { total: Tally; returned: Tally; used: Tally; scrapped: Tally; withUs: Tally; list: ReconOffcut[] };
  scrap: { fromNestsKg: number; scrappedStockKg: number; returnedKg: number; withUsKg: number };
  totals: { receivedKg: number; issuedKg: number; scrappedKg: number; returnedKg: number; withUsKg: number; owedBackKg: number; unweighedItems: number };
}

export interface BuyListTotal { estCost: number; items: number; unpricedItems: number }
