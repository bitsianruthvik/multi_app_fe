import type { Invoice, InvoiceProblem, InvoiceStatus, LineTax, TransportMode } from '../api/gst';
import { rupeeText } from './money';

/** What a rate nobody has set reads as. Never "0%": zero is a rate, this is "nobody has said". */
export const NO_GST_RATE = 'no GST rate';

/** GSTINs are typed in capitals; spaces are never part of one. */
export const normGstin = (s: string) => s.replace(/\s+/g, '').toUpperCase();

/** 18 → "18%", 0.25 → "0.25%", 2.5 → "2.5%". null → "no GST rate". */
export function gstRateText(rate: number | null | undefined, missing: string = NO_GST_RATE): string {
  if (rate == null || !Number.isFinite(Number(rate))) return missing;
  return `${Number(Number(rate).toFixed(2))}%`;
}

/** The header chip on an item or a template: "HSN 7308 · GST 18%". Nothing set at all = no chip. */
export function hsnChipText(hsn: string | null | undefined, rate: number | null | undefined, isService = false): string | null {
  const code = (hsn ?? '').trim();
  if (!code && rate == null) return null;
  const left = code ? `${isService ? 'SAC' : 'HSN'} ${code}` : 'no HSN';
  return `${left} · ${rate == null ? NO_GST_RATE : `GST ${gstRateText(rate)}`}`;
}

/** Under an order line's amount: "GST 18% ₹1,80,000", or the server's note on why there is none. Null when there is nothing to say. */
export function lineTaxText(tax: Pick<LineTax, 'gstRate' | 'taxTotal' | 'taxNote'> | null | undefined): string | null {
  if (!tax) return null;
  if (tax.taxTotal != null && tax.gstRate != null) return `GST ${gstRateText(tax.gstRate)} ${rupeeText(tax.taxTotal)}`;
  return tax.taxNote ?? null;
}

/** The tax part of the order total, as the parts a person adds up: CGST + SGST inside the state, IGST across states. */
export function taxPartsText(t: { cgst?: number | null; sgst?: number | null; igst?: number | null; isIgst?: boolean }, digits: 0 | 2 = 0): { label: string; text: string }[] {
  return t.isIgst
    ? [{ label: 'IGST', text: rupeeText(t.igst ?? null, digits) }]
    : [{ label: 'CGST', text: rupeeText(t.cgst ?? null, digits) }, { label: 'SGST', text: rupeeText(t.sgst ?? null, digits) }];
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = { draft: 'Draft', issued: 'Issued', cancelled: 'Cancelled' };

/** What the list shows where a number would be: a draft has none yet. */
export const invoiceNoText = (inv: { invoiceNo: string | null; status: InvoiceStatus }) => inv.invoiceNo ?? (inv.status === 'draft' ? 'Draft' : '—');

export const TRANSPORT_MODES: { value: TransportMode; label: string }[] = [
  { value: 'road', label: 'Road' }, { value: 'rail', label: 'Rail' }, { value: 'air', label: 'Air' }, { value: 'ship', label: 'Ship' },
];

/** The e-way bill threshold hint (informational, never blocks). */
export const EWAY_THRESHOLD = 50000;
export const ewayHint = (grandTotal: number | null | undefined): string | null =>
  grandTotal != null && grandTotal > EWAY_THRESHOLD ? `Over ${rupeeText(EWAY_THRESHOLD)} — the truck needs an e-way bill.` : null;

type RawProblem = Invoice['problems'][number];

/** The problems list as { text, fix }, whichever shape the server used. */
export function normalizeProblems(list: RawProblem[] | null | undefined): InvoiceProblem[] {
  return (list ?? []).map((p): InvoiceProblem => {
    if (typeof p === 'string') return { text: p, fix: null };
    const o = p as { text?: string; label?: string; fix?: { label: string; to: string } | null; to?: string };
    const text = o.text ?? o.label ?? '';
    const fix = o.fix ?? (o.to ? { label: o.label && o.text ? o.label : 'Fix it', to: o.to } : null);
    return { text, fix };
  }).filter((p) => p.text);
}

/**
 * The wording of the Issue confirmation. Plain: what happens and what stops
 * being changeable, so nobody issues by reflex.
 */
export function issueConfirmText(inv: Pick<Invoice, 'order' | 'customer' | 'totals'>): { title: string; lead: string; frozen: string[]; after: string } {
  return {
    title: `Issue this invoice to ${inv.customer.name ?? 'the customer'}?`,
    lead: `Issuing gives it the next invoice number and freezes it — ${rupeeText(inv.totals.grandTotal, 2)} for ${inv.order.code}.`,
    frozen: ['the buyer and ship-to address', 'the lines, rates and tax', 'the totals and invoice date'],
    after: 'After that nothing on it can be changed. A mistake is cancelled (within the portal window) and invoiced again, or corrected with a credit note.',
  };
}

/** Indian-grouped rupees with paise, or "—" when the server has no figure. */
export const money2 = (n: number | null | undefined) => rupeeText(n, 2, '—');
