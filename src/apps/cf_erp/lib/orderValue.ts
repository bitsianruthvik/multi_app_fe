import { rupeeText } from './money';

/**
 * ONE ORDER VALUE (backend services/orderValueService.js, 2026-10-18). The accepted terms once they exist, else the
 * estimate from the line rates; a screen that shows an order's value shows this, with its label.
 */
export interface OrderValue {
  amount: number | null;
  basis: 'accepted' | 'awaiting_approval' | 'estimate' | 'none';
  label: string;
  /** The line-rate figure (qty × the rate typed at Add line), null when no line has a rate. */
  estimate: number | null;
  estimateComplete: boolean;
  accepted: number | null;
  /** A rate change (or first terms) waiting for Management. */
  pendingValue: number | null;
  /** There are terms and the line-rate estimate is not the same. */
  differs: boolean;
  version?: number;
}

/** "₹38,72,227", "accepted · estimate ₹6,91,46,903" — the main figure and the words under / after it. Pure. */
export function orderValueParts(v: OrderValue | null | undefined): { main: string; tag: string; detail: string | null; muted: boolean } {
  if (!v || v.amount == null) return { main: 'not priced', tag: '', detail: null, muted: true };
  const est = v.differs && v.estimate != null ? `estimate ${rupeeText(v.estimate)}` : null;
  if (v.basis === 'accepted') {
    const pending = v.pendingValue != null && Math.abs(v.pendingValue - v.amount) >= 1 ? `rate change ${rupeeText(v.pendingValue)} waiting` : null;
    return { main: rupeeText(v.amount), tag: 'accepted', detail: [est, pending].filter(Boolean).join(' · ') || null, muted: false };
  }
  if (v.basis === 'awaiting_approval') return { main: rupeeText(v.amount), tag: 'terms awaiting approval', detail: est, muted: false };
  return { main: rupeeText(v.amount), tag: v.estimateComplete ? 'estimate' : 'estimate, part', detail: null, muted: false };
}

/** One line of text: "₹38,72,227 accepted · estimate ₹6,91,46,903". */
export function orderValueText(v: OrderValue | null | undefined): string {
  const p = orderValueParts(v);
  return [p.main, p.tag].filter(Boolean).join(' ') + (p.detail ? ` · ${p.detail}` : '');
}
