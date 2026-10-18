import type { BillingCard, CardStatus } from '../api/accounts';
import { rupeeText } from './money';

/**
 * Words and small rules of the Accounts screens (§74), kept pure so the screens and the tests share them.
 */

export const LANE_HELP: Record<CardStatus, string> = {
  upcoming: 'Not due yet. A card moves to Due by itself when its milestone happens.',
  due: 'Ready to bill. Tick cards of one order and raise one invoice.',
  billed: 'On an invoice. Red when past its due date and not paid.',
  paid: 'Paid in full.',
};

/** One short sentence: when a card is (or was) due, and what it waits for. */
export function cardWhen(c: BillingCard): string {
  if (c.status === 'paid') return `Paid · invoice ${c.invoice?.invoiceNo ?? ''}`.trim();
  if (c.status === 'billed') {
    const inv = c.invoice;
    if (!inv) return 'Billed';
    if (c.overdue) return `Overdue by ${c.daysOverdue} day${c.daysOverdue === 1 ? '' : 's'} · ${rupeeText(inv.outstanding)} owed`;
    return `Invoice ${inv.invoiceNo}${inv.dueDate ? ` · pay by ${inv.dueDate}` : ''}${inv.received > 0 ? ` · ${rupeeText(inv.received)} received` : ''}`;
  }
  if (c.status === 'due') {
    const d = c.daysDue ?? 0;
    return d > 0 ? `Due since ${c.dueOn} (${d} day${d === 1 ? '' : 's'})` : `Due from today${c.dueOn ? ` (${c.dueOn})` : ''}`;
  }
  return c.dueOn ? `Due on ${c.dueOn}` : c.milestone.trigger;
}

/** The cards that may go on one invoice: due, and of one order. Pure. */
export function canInvoiceTogether(cards: BillingCard[]): { ok: boolean; reason: string | null } {
  if (!cards.length) return { ok: false, reason: 'Tick at least one due card.' };
  if (cards.some((c) => c.status !== 'due')) return { ok: false, reason: 'Only due cards are invoiced.' };
  if (new Set(cards.map((c) => c.orderId)).size > 1) return { ok: false, reason: 'One invoice is for one order — tick cards of the same order.' };
  return { ok: true, reason: null };
}

/** Adds or removes a card from the ticked set; a card of another order starts a new set. Pure. */
export function toggleCard(selected: BillingCard[], card: BillingCard): BillingCard[] {
  if (selected.some((c) => c.id === card.id)) return selected.filter((c) => c.id !== card.id);
  if (selected.length && selected[0].orderId !== card.orderId) return [card];
  return [...selected, card];
}

/** Margin colour: below 0 is a loss. */
export const marginFamily = (pct: number | null | undefined): 'danger' | 'warning' | 'success' | 'neutral' => (pct == null ? 'neutral' : pct < 0 ? 'danger' : pct < 10 ? 'warning' : 'success');

/** A total of amounts, to the paisa. */
export const sumAmounts = (cards: { amount: number }[]) => Math.round(cards.reduce((t, c) => t + c.amount, 0) * 100) / 100;

/** Today as YYYY-MM-DD in this browser. */
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
