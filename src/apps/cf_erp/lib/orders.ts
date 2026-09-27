import type { OrderStatus, SalesOrder } from '../api/types';

/** A sales order's stages, in words. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Draft',
  inquiry: 'Inquiry',
  quoted: 'Quoted',
  confirmed: 'Confirmed',
  closed: 'Closed',
  lost: 'Lost',
  cancelled: 'Cancelled',
  revised: 'Revised',
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
    // Never a move anyone makes: an order becomes revised when a later revision replaces it.
    revised: 'Revised',
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

/**
 * The stages at which an order stops changing. Everything made for it is
 * frozen from here — lines, structures and details alike. A revised order is
 * one a later revision replaced: it is kept exactly as it was.
 */
export const LOCKED_STATUSES: OrderStatus[] = ['closed', 'lost', 'cancelled', 'revised'];

/** An order's revision beside its code: "rev 2". */
export const revisionLabel = (revision: number) => `rev ${revision}`;

/**
 * Whether an order's code needs its revision beside it. Only once there is
 * more than one: "rev 1" on every order nobody has revised would be noise.
 */
export const showRevision = (o: Pick<SalesOrder, 'revision' | 'status'>) => o.revision > 1 || o.status === 'revised';

/** Why an earlier revision's lines are not released here. */
export const REVISED_NOT_RELEASED = 'A later revision replaced this one. Lines are released from the latest revision.';
