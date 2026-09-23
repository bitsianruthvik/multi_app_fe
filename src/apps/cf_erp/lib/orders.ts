import type { OrderStatus } from '../api/types';

/** A sales order's stages, in words. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Draft',
  inquiry: 'Inquiry',
  quoted: 'Quoted',
  confirmed: 'Confirmed',
  closed: 'Closed',
  lost: 'Lost',
  cancelled: 'Cancelled',
};

/**
 * The button that moves an order to a stage, from the stage it is in. Moves the
 * backend allows (salesOrderService TRANSITIONS) and nothing else is offered.
 */
export function transitionLabel(from: OrderStatus, to: OrderStatus): string {
  if (to === 'inquiry') return from === 'lost' ? 'Reopen as inquiry' : 'Back to inquiry';
  return {
    draft: 'Back to draft',
    quoted: 'Mark quoted',
    confirmed: 'Confirm',
    closed: 'Close',
    lost: 'Mark lost',
    cancelled: 'Cancel order',
  }[to];
}

/** Moves that need a second look before they happen. */
export const CONFIRM_MOVE: Partial<Record<OrderStatus, string>> = {
  closed: 'A closed order is done: its lines and structure can no longer change.',
  cancelled: 'A cancelled order stops here. It stays on record, and its structure can no longer change.',
  lost: 'The inquiry is marked lost. It can be reopened later.',
};

export const OPEN_STATUSES: OrderStatus[] = ['draft', 'inquiry', 'quoted', 'confirmed'];
