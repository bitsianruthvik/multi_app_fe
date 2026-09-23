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

/**
 * The move that carries the sale forward — the one transition that gets the
 * primary button, so a row of stage buttons has a single obvious next step.
 * A confirmed order has none: closing it is an end-of-life action, not a nudge.
 */
export const NEXT_STAGE: Partial<Record<OrderStatus, OrderStatus>> = {
  draft: 'confirmed',
  inquiry: 'quoted',
  quoted: 'confirmed',
  lost: 'inquiry',
};

/** Moves that need a second look before they happen. */
export const CONFIRM_MOVE: Partial<Record<OrderStatus, string>> = {
  confirmed: 'Confirming commits the order and fixes its stage: from here it can only be closed or cancelled, never moved back to inquiry or quoted.',
  closed: 'A closed order is done: its lines and structure can no longer change.',
  cancelled: 'A cancelled order stops here. It stays on record, and its structure can no longer change.',
  lost: 'The inquiry is marked lost. It can be reopened later.',
};

export const OPEN_STATUSES: OrderStatus[] = ['draft', 'inquiry', 'quoted', 'confirmed'];

/**
 * Which grant a BOM change needs. The backend works it out from the BOM's
 * parent (routes/boms.js `permFor`), because the two are different jobs: an
 * order's Custom BOM is order design, a Standard or Template BOM is catalog
 * design. The screens must ask the same question, or a button 403s.
 */
export const bomPermission = (custom: boolean) => (custom ? 'cf_erp_orders_manage' : 'cf_erp_catalog_manage');
