/**
 * The money of a GRN, worked out while it is typed (init.sql §80). The SAME arithmetic as the backend's
 * `services/grnMoney.js` (the server is the one that books it; this only previews it) — `cf_erp_grn_money_test.mjs`
 * runs both on the same cases. Pure: no React, no fetch.
 */

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 1e4) / 1e4;
const numOf = (s: string | number | null | undefined): number | null => {
  if (s == null || String(s).trim() === '') return null;
  const n = Number(String(s).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
};

export type SupplyKind = 'intra' | 'inter' | 'none';
export type DiscountMode = 'pct' | 'amt';

/** How the bill is taxed: the supplier's state against the company's. Unregistered / composition / overseas suppliers charge none. */
export function supplyKind(args: { companyState: string | null; supplierState: string | null; registration?: string | null }): SupplyKind | null {
  const reg = args.registration ?? 'regular';
  if (reg === 'unregistered' || reg === 'composition' || reg === 'overseas') return 'none';
  if (!args.companyState || !args.supplierState) return null;
  return args.companyState === args.supplierState ? 'intra' : 'inter';
}

/** Cents-exact shares of `total` in proportion to `weights` (largest remainder); zero weights share equally. */
export function shareOut(total: number, weights: number[]): number[] {
  const cents = Math.round(total * 100);
  const n = weights.length;
  if (!n) return [];
  const sum = weights.reduce((t, w) => t + Math.max(0, w || 0), 0);
  const w = sum > 0 ? weights.map((x) => Math.max(0, x || 0) / sum) : weights.map(() => 1 / n);
  const raw = w.map((x) => x * cents);
  const floors = raw.map((x) => Math.floor(x + 1e-9));
  let left = cents - floors.reduce((t, x) => t + x, 0);
  const order = raw.map((x, i) => ({ i, frac: x - Math.floor(x + 1e-9) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k += 1, left -= 1) floors[order[k].i] += 1;
  return floors.map((x) => x / 100);
}

export interface GrnLineIn {
  quantity: string; unitPrice: string; mrp: string; discountMode: DiscountMode; discountValue: string; gstRate: string;
}
export interface GrnChargeIn { amount: string; taxable: boolean; gstRate: string }
export interface GrnLineOut {
  quantity: number; gross: number; discount: number; taxable: number; cgst: number; sgst: number; igst: number; tax: number; lineTotal: number;
  freightShare: number; landedValue: number; landedUnitCost: number | null;
}
export interface GrnChargeOut { amount: number; tax: number; cgst: number; sgst: number; igst: number }
export interface GrnTotals { gross: number; discount: number; taxable: number; charges: number; cgst: number; sgst: number; igst: number; tax: number; landed: number; total: number }

function taxOn(amount: number, rate: number | null, kind: SupplyKind | null): { cgst: number; sgst: number; igst: number; tax: number } {
  if (rate == null || kind == null || kind === 'none') return { cgst: 0, sgst: 0, igst: 0, tax: 0 };
  if (kind === 'inter') { const igst = r2((amount * rate) / 100); return { cgst: 0, sgst: 0, igst, tax: igst }; }
  const half = r2((amount * rate) / 200);
  return { cgst: half, sgst: half, igst: 0, tax: r2(half * 2) };
}

export function computeGrn(args: {
  lines: GrnLineIn[]; freight: GrnChargeIn; other: GrnChargeIn; kind: SupplyKind | null; reverseCharge?: boolean;
}): { lines: GrnLineOut[]; freight: GrnChargeOut; other: GrnChargeOut; totals: GrnTotals } {
  const { kind } = args;
  const rows = args.lines.map((l) => {
    const quantity = numOf(l.quantity) ?? 0;
    const gross = r2(quantity * (numOf(l.unitPrice) ?? 0));
    const dv = numOf(l.discountValue);
    const discount = dv == null || dv <= 0 ? 0 : Math.min(l.discountMode === 'pct' ? r2((gross * dv) / 100) : r2(dv), gross);
    const taxable = r2(gross - discount);
    return { quantity, gross, discount, taxable, ...taxOn(taxable, numOf(l.gstRate), kind) };
  });
  const charge = (c: GrnChargeIn): GrnChargeOut => {
    const amount = r2(Math.max(0, numOf(c.amount) ?? 0));
    const t = amount > 0 && c.taxable ? taxOn(amount, numOf(c.gstRate), kind) : { cgst: 0, sgst: 0, igst: 0, tax: 0 };
    return { amount, ...t };
  };
  const freight = charge(args.freight);
  const other = charge(args.other);
  const charges = r2(freight.amount + other.amount);
  const shares = shareOut(charges, rows.map((r) => r.taxable));
  const lines: GrnLineOut[] = rows.map((r, i) => {
    const freightShare = shares[i] ?? 0;
    const landedValue = r2(r.taxable + freightShare);
    return { ...r, lineTotal: r2(r.taxable + r.tax), freightShare, landedValue, landedUnitCost: r.quantity > 0 ? r4(landedValue / r.quantity) : null };
  });
  const sum = (k: 'gross' | 'discount' | 'taxable' | 'cgst' | 'sgst' | 'igst') => r2(lines.reduce((t, r) => t + r[k], 0));
  const cgst = r2(sum('cgst') + freight.cgst + other.cgst);
  const sgst = r2(sum('sgst') + freight.sgst + other.sgst);
  const igst = r2(sum('igst') + freight.igst + other.igst);
  const tax = r2(cgst + sgst + igst);
  const taxable = sum('taxable');
  return {
    lines, freight, other,
    totals: { gross: sum('gross'), discount: sum('discount'), taxable, charges, cgst, sgst, igst, tax, landed: r2(taxable + charges), total: r2(taxable + charges + (args.reverseCharge ? 0 : tax)) },
  };
}

export interface GrnHeaderIn { invoiceNo: string; invoiceDate: string; invoicePending: boolean; areaId: string }
export interface GrnCheckLine { included: boolean; label: string; outstanding: number; in: GrnLineIn }

/**
 * Everything the server would refuse, said here before the round trip (the first sentence blocks Receive).
 * `needsState`: the company / supplier GST state still has to be picked on the screen.
 */
export function grnBlockers(args: {
  header: GrnHeaderIn; lines: GrnCheckLine[]; kind: SupplyKind | null; needsState: string | null;
  freight: GrnChargeIn; other: GrnChargeIn; batchMissing?: string | null;
}): string[] {
  const out: string[] = [];
  const { header, kind } = args;
  const chosen = args.lines.filter((l) => l.included);
  if (!chosen.length) out.push('Tick at least one line that arrived.');
  if (!header.areaId) out.push('Say which area it went into.');
  if (!header.invoicePending) {
    if (!header.invoiceNo.trim()) out.push('Enter the supplier invoice number, or tick "Invoice to follow".');
    if (!header.invoiceDate.trim()) out.push('Enter the supplier invoice date, or tick "Invoice to follow".');
  }
  if (args.needsState) out.push(args.needsState);
  for (const l of chosen) {
    const q = numOf(l.in.quantity);
    if (q == null || q <= 0) out.push(`${l.label}: type how much arrived.`);
    else if (q > l.outstanding + 1e-6) out.push(`${l.label}: only ${l.outstanding} is still outstanding.`);
    if (numOf(l.in.unitPrice) == null) out.push(`${l.label}: the unit price is required.`);
    if (kind !== 'none' && numOf(l.in.gstRate) == null) out.push(`${l.label}: the GST rate is required.`);
    const dv = numOf(l.in.discountValue);
    if (dv != null && dv > 0 && l.in.discountMode === 'pct' && dv > 100) out.push(`${l.label}: a discount cannot be more than 100%.`);
  }
  for (const [name, c] of [['Freight', args.freight], ['Other charges', args.other]] as const) {
    if ((numOf(c.amount) ?? 0) > 0 && c.taxable && kind !== 'none' && numOf(c.gstRate) == null) out.push(`${name} is taxable — give its GST rate.`);
  }
  if (args.batchMissing) out.push(args.batchMissing);
  return out;
}
