import type { Family } from '../components/ui';
import type { Comparison, ComparisonCell, ComparisonLine, HistoryEntry, RequestLineStatus, RequestStatus, RfqStatus, RfqSupplierStatus } from '../api/procurement';

/** What a missing quote reads as. Never ₹0: zero is a price, this is "the supplier did not say". */
export const NOT_QUOTED = 'not quoted';

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  draft: 'Draft', submitted: 'Waiting for approval', approved: 'Approved', rejected: 'Rejected', closed: 'Closed', cancelled: 'Cancelled',
};
export const REQUEST_STATUS_FAMILY: Record<RequestStatus, Family> = {
  draft: 'warning', submitted: 'info', approved: 'success', rejected: 'danger', closed: 'neutral', cancelled: 'neutral',
};
export const REQUEST_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Waiting for approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const REQUEST_LINE_LABEL: Record<RequestLineStatus, string> = { open: 'Open', in_rfq: 'In an RFQ', ordered: 'Ordered', cancelled: 'Cancelled' };

export const RFQ_STATUS_LABEL: Record<RfqStatus, string> = { draft: 'Draft', sent: 'Out for quotes', closed: 'Quotes in', awarded: 'Awarded', cancelled: 'Cancelled' };
export const RFQ_STATUS_FAMILY: Record<RfqStatus, Family> = { draft: 'warning', sent: 'info', closed: 'info', awarded: 'success', cancelled: 'neutral' };
export const RFQ_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Out for quotes' },
  { value: 'closed', label: 'Quotes in' },
  { value: 'awarded', label: 'Awarded' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const SUPPLIER_STATUS_LABEL: Record<RfqSupplierStatus, string> = { invited: 'Not sent yet', sent: 'Sent, waiting', quoted: 'Quote in', declined: 'Declined' };
export const SUPPLIER_STATUS_FAMILY: Record<RfqSupplierStatus, Family> = { invited: 'warning', sent: 'info', quoted: 'success', declined: 'neutral' };

/** "Alok Mehta approved this on 2026-10-01 — note". The history list's one line. */
export function historyText(h: HistoryEntry): string {
  const by = typeof h.by === 'string' ? h.by : h.by?.name;
  const what = (h.action ?? h.status ?? 'changed').replace(/_/g, ' ');
  return `${by ? `${by} — ` : ''}${what}`;
}

// ---- Quote entry --------------------------------------------------------------------------------------------------

export type QuoteCol = 'unitPrice' | 'gstRate' | 'leadTimeDays' | 'qtyOffered' | 'remark';
export const QUOTE_COLS: QuoteCol[] = ['unitPrice', 'gstRate', 'leadTimeDays', 'qtyOffered', 'remark'];

/** One line of a quote as typed: text, so a half-typed number is never lost. */
export type QuoteDraftLine = Record<QuoteCol, string>;
export const emptyQuoteLine = (): QuoteDraftLine => ({ unitPrice: '', gstRate: '', leadTimeDays: '', qtyOffered: '', remark: '' });

/** Strips what Excel and people add around a number: ₹, Rs, commas, spaces, a % or "days". */
const cleanNumber = (raw: string) => raw.replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '').replace(/%$/, '').replace(/days?$/i, '');

/**
 * One typed or pasted cell, made tidy. `ok:false` carries the reason in plain words; an empty cell is fine
 * (not quoted / not stated).
 */
export function readQuoteCell(col: QuoteCol, raw: string): { ok: true; text: string } | { ok: false; why: string } {
  const text = raw.trim();
  if (col === 'remark') return { ok: true, text };
  if (text === '') return { ok: true, text: '' };
  const cleaned = cleanNumber(text);
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return { ok: false, why: `"${text}" is not a number` };
  const n = Number(cleaned);
  if (col === 'gstRate' && n > 100) return { ok: false, why: `GST of ${n}% is not possible` };
  if (col === 'leadTimeDays' && !Number.isInteger(n)) return { ok: false, why: `Lead time is whole days, not "${text}"` };
  return { ok: true, text: String(n) };
}

const num = (text: string): number | null => (text.trim() === '' ? null : Number(text));

/** The body line the server wants. An empty price is null — not quoted — never 0. */
export function quoteLineBody(rfqLineId: number, d: QuoteDraftLine) {
  return {
    rfqLineId, unitPrice: num(d.unitPrice), gstRate: num(d.gstRate), leadTimeDays: num(d.leadTimeDays), qtyOffered: num(d.qtyOffered),
    remark: d.remark.trim() || null,
  };
}

/** How many lines have a price: a quote with none is a declined quote in disguise. */
export const pricedLines = (draft: Record<number, QuoteDraftLine>) => Object.values(draft).filter((d) => d.unitPrice.trim() !== '').length;

// ---- Comparison ---------------------------------------------------------------------------------------------------

/** An expired quote: its validity date has passed. */
export const isExpired = (c: ComparisonCell | undefined | null) => !!c && c.unitPrice != null && (c.expired ?? !c.valid);

/** A cell that can be awarded: it has a price and the server named the quote line. An expired quote may still be awarded on purpose, but is never recommended. */
export const canAward = (c: ComparisonCell | undefined | null): c is ComparisonCell & { quoteLineId: number } =>
  !!c && c.unitPrice != null && c.quoteLineId != null;

export const cellFor = (line: ComparisonLine, supplierId: number) => line.cells.find((c) => c.supplierId === supplierId);

/** The cheapest awardable cell on a line, by landed unit price (the server's flag first, then our own count). */
export function cheapestCell(line: ComparisonLine): ComparisonCell | null {
  const ok = line.cells.filter((c) => canAward(c) && !isExpired(c));
  if (!ok.length) return null;
  return ok.find((c) => c.cheapest) ?? [...ok].sort((a, b) => (a.landedUnit ?? Infinity) - (b.landedUnit ?? Infinity))[0];
}

/** line id -> supplier id, for every line that has one. */
export type Choices = Record<number, number | null>;

/** The awards the server already holds, as supplier-per-line choices. */
export function currentChoices(c: Comparison): Choices {
  const out: Choices = {};
  for (const line of c.lines) {
    const hit = line.cells.find((x) => x.awarded) ?? line.cells.find((x) => c.awards?.some((a) => a.rfqLineId === line.rfqLine.id && a.quoteLineId != null && a.quoteLineId === x.quoteLineId));
    out[line.rfqLine.id] = hit?.supplierId ?? null;
  }
  return out;
}

/** "Award cheapest on every line": the cheapest awardable supplier per line; a line nobody can supply stays open. */
export function cheapestChoices(c: Comparison): Choices {
  const out: Choices = {};
  for (const line of c.lines) out[line.rfqLine.id] = cheapestCell(line)?.supplierId ?? null;
  return out;
}

/** The body of POST /award for a set of choices — a line with no choice is sent as null so it is un-awarded. */
export function awardBody(c: Comparison, choices: Choices): { rfqLineId: number; quoteLineId: number | null }[] {
  return c.lines.map((line) => {
    const sid = choices[line.rfqLine.id];
    const cell = sid != null ? cellFor(line, sid) : undefined;
    return { rfqLineId: line.rfqLine.id, quoteLineId: canAward(cell) ? cell.quoteLineId : null };
  });
}

export const sameChoices = (a: Choices, b: Choices) => {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) if ((a[Number(id)] ?? null) !== (b[Number(id)] ?? null)) return false;
  return true;
};

/** What each supplier would be paid for what is chosen now (net of tax, freight included in the landed figure). */
export function awardedTotals(c: Comparison, choices: Choices): Map<number, { lines: number; amount: number | null; landed: number | null }> {
  const out = new Map<number, { lines: number; amount: number | null; landed: number | null }>();
  for (const line of c.lines) {
    const sid = choices[line.rfqLine.id];
    const cell = sid != null ? cellFor(line, sid) : undefined;
    if (sid == null || !cell) continue;
    const t = out.get(sid) ?? { lines: 0, amount: 0, landed: 0 };
    t.lines += 1;
    t.amount = cell.amount == null || t.amount == null ? null : t.amount + cell.amount;
    const landed = cell.landedUnit == null ? null : cell.landedUnit * line.rfqLine.quantity;
    t.landed = landed == null || t.landed == null ? null : t.landed + landed;
    out.set(sid, t);
  }
  return out;
}

export const mailtoHref = (to: string | null, subject: string, body: string) =>
  `mailto:${to ? encodeURIComponent(to).replace(/%40/g, '@') : ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
