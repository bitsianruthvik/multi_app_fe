import type { MrFor } from '../api/purchaseRequests';
import type { NewMr, ProcurementInput, ProcurementMethod, ProcurementSettings, ReorderRow } from '../api/stores';

/**
 * THE STORES CHAIN (§79) — the small checks and sums of Stores' screens: the New MR dialog, the "To reorder" list and the
 * Procurement card. Every rule is the server's too; this only says a problem before a round trip.
 */

const num = (v: string) => (v.trim() === '' ? NaN : Number(v));

/** The "For" choices of the New MR dialog, in the order Stores use them. A maintenance order raises its MR from its own screen. */
export const NEW_MR_FOR: { value: MrFor; label: string; hint: string }[] = [
  { value: 'stock', label: 'Stock', hint: 'Refill stock — everything on it is bought.' },
  { value: 'general', label: 'General', hint: 'Consumables, the office, anything not for an order (overhead) — or name a sales order to charge it.' },
  { value: 'sales_order', label: 'Sales order', hint: "Charged to the order's cost sheet." },
];

export interface DraftRow { item: { id: number; code: string | null; name: string; uom?: string | null } | null; qty: string }

/** Every problem of the New MR form at once — the same rules createRequisition says. */
export function newMrProblems(forType: MrFor, orderId: number | null, rows: DraftRow[]): string[] {
  const out: string[] = [];
  if (forType === 'sales_order' && orderId == null) out.push('Pick the sales order.');
  if (forType === 'stock' && orderId != null) out.push('An MR for stock is for no order.');
  const filled = rows.filter((r) => r.item || r.qty.trim() !== '');
  if (!filled.some((r) => r.item)) out.push('Add at least one item.');
  filled.forEach((r, k) => {
    if (!r.item) out.push(`Row ${k + 1}: pick the item.`);
    const q = num(r.qty);
    if (!Number.isFinite(q) || q <= 0) out.push(`Row ${k + 1}: the quantity is a number above zero.`);
  });
  return out;
}

/** The body of POST /requisitions from the form (blank rows dropped). */
export function newMrBody(forType: MrFor, orderId: number | null, note: string, rows: DraftRow[]): NewMr {
  return {
    forType,
    ...(forType !== 'stock' && orderId != null ? { orderId } : {}),
    ...(note.trim() ? { note: note.trim() } : {}),
    lines: rows.filter((r) => r.item && Number.isFinite(num(r.qty))).map((r) => ({ itemId: r.item!.id, qty: num(r.qty) })),
  };
}

/** Keeps one empty row at the end, so the next item can be typed at once (keyboard first). */
export function withSpareRow(rows: DraftRow[]): DraftRow[] {
  const last = rows[rows.length - 1];
  return !last || last.item || last.qty.trim() !== '' ? [...rows, { item: null, qty: '' }] : rows;
}

/** The ticked rows of "To reorder" with the typed quantities → the raise body. */
export function reorderBody(rows: ReorderRow[], ticked: ReadonlySet<number>, qty: Record<number, string>): { itemId: number; qty: number }[] {
  return rows.filter((r) => ticked.has(r.item.id)).map((r) => ({ itemId: r.item.id, qty: num(qty[r.item.id] ?? String(r.suggest)) }));
}

export function reorderProblems(rows: ReorderRow[], ticked: ReadonlySet<number>, qty: Record<number, string>): string[] {
  const out: string[] = [];
  if (!ticked.size) out.push('Tick at least one row.');
  for (const r of rows.filter((x) => ticked.has(x.item.id))) {
    const q = num(qty[r.item.id] ?? String(r.suggest));
    if (!Number.isFinite(q) || q <= 0) out.push(`${r.item.code ?? r.item.name}: the quantity is a number above zero.`);
  }
  return out;
}

/** Which fields the Procurement card shows for a method. */
export function procurementFields(method: ProcurementMethod | null): { minMax: boolean; period: boolean; buying: boolean } {
  const buying = method === 'buy_on_requirement' || method === 'buy_min_max' || method === 'buy_periodic' || method === 'subcontract';
  return { minMax: method === 'buy_min_max', period: method === 'buy_periodic', buying };
}

export interface ProcurementForm {
  method: ProcurementMethod | '';
  minQty: string; maxQty: string; periodDays: string; leadTimeDays: string; orderMultiple: string; minOrderQty: string;
  vendors: { id: number; name: string }[];
}

export function procurementForm(s: ProcurementSettings | null): ProcurementForm {
  const t = (n: number | null | undefined) => (n == null ? '' : String(n));
  return {
    method: s?.method ?? '', minQty: t(s?.minQty), maxQty: t(s?.maxQty), periodDays: t(s?.periodDays), leadTimeDays: t(s?.leadTimeDays),
    orderMultiple: t(s?.orderMultiple), minOrderQty: t(s?.minOrderQty), vendors: (s?.preferredVendors ?? []).map((v) => ({ id: v.id, name: v.name })),
  };
}

export function procurementProblems(f: ProcurementForm): string[] {
  const out: string[] = [];
  if (!f.method) return out;
  const bad = (v: string, { min = 0, int = false } = {}) => v.trim() !== '' && (!Number.isFinite(num(v)) || num(v) < min || (int && !Number.isInteger(num(v))));
  if (f.method === 'buy_min_max') {
    if (f.minQty.trim() === '' || f.maxQty.trim() === '') out.push('Give the minimum and the maximum stock.');
    else if (bad(f.minQty) || bad(f.maxQty)) out.push('Minimum and maximum are numbers, zero or more.');
    else if (num(f.maxQty) <= num(f.minQty)) out.push('The maximum is above the minimum.');
  }
  if (f.method === 'buy_periodic' && (f.periodDays.trim() === '' || bad(f.periodDays, { min: 1, int: true }))) out.push('Every N days: a whole number, 1 or more.');
  if (bad(f.leadTimeDays, { int: true })) out.push('Lead time is whole days, zero or more.');
  if (bad(f.minOrderQty)) out.push('The minimum order is a number, zero or more.');
  if (f.orderMultiple.trim() !== '' && (bad(f.orderMultiple) || num(f.orderMultiple) <= 0)) out.push('The order multiple is above zero (blank for none).');
  return out;
}

export function procurementBody(f: ProcurementForm): ProcurementInput {
  if (!f.method) return { method: null };
  const n = (v: string) => (v.trim() === '' ? null : Number(v));
  const { minMax, period } = procurementFields(f.method);
  return {
    method: f.method,
    minQty: minMax ? n(f.minQty) : null, maxQty: minMax ? n(f.maxQty) : null, periodDays: period ? n(f.periodDays) : null,
    leadTimeDays: n(f.leadTimeDays), orderMultiple: n(f.orderMultiple), minOrderQty: n(f.minOrderQty),
    preferredVendorIds: f.vendors.map((v) => v.id),
  };
}

/** "SO260014 · line 2", "For stock", "General · SO260014" — what an MR is for, in short. */
export function mrForWords(m: { forType: MrFor; forLabel?: string; order: { code: string } | null; line: { lineNo: number; name?: string } | null; maintenanceOrderId?: number | null }): string {
  if (m.line && m.order) return `${m.order.code} · line ${m.line.lineNo}`;
  if (m.forType === 'stock') return 'For stock';
  const what = m.forType === 'maintenance_order' ? `Maintenance order${m.maintenanceOrderId ? ` #${m.maintenanceOrderId}` : ''}` : (m.forLabel ?? m.forType);
  return m.order ? `${what} · ${m.order.code}` : what;
}
