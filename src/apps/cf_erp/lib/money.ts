import type { KgQty, PriceBasis, StockOwner } from '../api/money';
import { qtyText } from './inventory';

/** What a missing cost reads as. Never ₹0: zero is a price, this is "nobody has said". */
export const NOT_COSTED = 'not costed';

export const BASIS_LABEL: Record<PriceBasis, string> = { unit: 'per piece', kg: 'per kg', tonne: 'per tonne', metre: 'per metre' };
export const BASIS_OPTIONS: { value: PriceBasis; label: string }[] = (['unit', 'kg', 'tonne', 'metre'] as PriceBasis[]).map((value) => ({ value, label: BASIS_LABEL[value] }));

const fmt = (digits: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const FORMATS = { 0: fmt(0), 2: fmt(2) };

/**
 * Rupees with Indian grouping: ₹12,34,567. Lists show no decimals (digits 0), a
 * detail shows paise (digits 2). null / undefined / NaN is "not costed" (or
 * whatever `missing` says), never ₹0.
 */
export function rupeeText(n: number | null | undefined, digits: 0 | 2 = 0, missing: string = NOT_COSTED): string {
  if (n == null || !Number.isFinite(Number(n))) return missing;
  const v = Number(n);
  const body = FORMATS[digits].format(Math.abs(v));
  return `${v < 0 && Number(body.replace(/[,.]/g, '')) !== 0 ? '-' : ''}₹${body}`;
}

/** A unit price: paise when it has them, else whole rupees — ₹85,000 or ₹1,250.50. */
export function priceText(n: number | null | undefined, missing: string = NOT_COSTED): string {
  if (n == null || !Number.isFinite(Number(n))) return missing;
  return rupeeText(n, Math.abs(Number(n) - Math.round(Number(n))) < 0.005 ? 0 : 2, missing);
}

/** "₹85,000 per tonne". */
export function rateText(rate: number | null | undefined, basis: PriceBasis | null | undefined, missing = 'no rate'): string {
  return rate == null ? missing : `${priceText(rate)} ${BASIS_LABEL[basis ?? 'unit']}`;
}

/** What a rate multiplies, as the line shows it: "× 669.29 t". */
export function billedText(billed: number | null | undefined, uom: string | null | undefined): string | null {
  if (billed == null) return null;
  return `× ${Number(Number(billed).toFixed(3))}${uom ? ` ${uom}` : ''}`;
}

/** Kilograms, without trailing zeros: 1,250.5 kg. */
export function kgText(n: number | null | undefined): string {
  return n == null ? '—' : `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(n)} kg`;
}

/** A date from an ISO string or date-only text: 2026-09-30. */
export const dayText = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : '');

/** The owner's label: a customer's name, or "Ours". */
export function ownerLabel(owner: StockOwner | null | undefined): string {
  return owner ? (owner.party.name ?? owner.party.code ?? 'Customer') : 'Ours';
}

/** A quantity and its weight: "12 nos · 1,250 kg". A weight nobody knows is left out, not zero. */
export function qtyKgText(p: KgQty, uom: string): string {
  return `${qtyText(p.qty)} ${uom}${p.kg != null && uom.toLowerCase() !== 'kg' ? ` · ${kgText(p.kg)}` : ''}`;
}

/** The estimated margin: what the order sells for less the material that went into it. Before labour, so it is an upper bound. */
export function materialMargin(orderTotal: number | null | undefined, issuedValue: number): { margin: number; pct: number | null } | null {
  if (orderTotal == null || !(orderTotal > 0)) return null;
  const margin = Math.round((orderTotal - issuedValue) * 100) / 100;
  return { margin, pct: Math.round((margin / orderTotal) * 1000) / 10 };
}
