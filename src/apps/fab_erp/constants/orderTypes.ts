/**
 * What the three order types are, and which of them owns the setup wizard.
 *
 * `fab_orders` is one table holding three quite different documents:
 *
 *   sales         — what a customer asked for. Created by hand.
 *   purchase      — steel ordered from a supplier. RAISED from a sales order's
 *                   Procurement tab; never typed in directly.
 *   manufacturing — the production order, i.e. the task DAG the sales order's
 *                   wizard already produced. Raised from the Production tab.
 *
 * Their own module rather than constants inside SalesOrders.tsx because the
 * order detail page needs them too, and a page file that exports non-components
 * breaks Vite's fast refresh (react-refresh/only-export-components).
 */

/** How each type reads on screen. Display only — not the creatable set. */
export const ORDER_TYPE_LABELS: Record<string, string> = {
  sales: 'Sales',
  purchase: 'Purchase',
  manufacturing: 'Production',
};

export const orderTypeLabel = (t: string) => ORDER_TYPE_LABELS[t] ?? t.replace(/_/g, ' ');

/**
 * The setup wizard belongs to SALES orders and nothing else.
 *
 * It walks lines → BOM → nesting → flow allocation → project tree, every step of
 * which is a question about a thing being built for a customer. A purchase order
 * is a list of steel bought from a supplier, and a manufacturing order is the DAG
 * the sales order's wizard already produced — offering either of them "Continue
 * setup" invites someone to nest plate for a document that has no geometry.
 *
 * This gate exists because both are raised as `draft`, and the wizard's entry
 * points keyed on status alone, so both showed the button.
 */
export const hasSetupWizard = (orderType: string) => orderType === 'sales';

/**
 * Which types a person can create by hand, and how the others come into being.
 *
 * Only `sales` is creatable. The other two are RAISED — a purchase order from a
 * sales order's Procurement tab or from the Buy-machine / spares flows, a
 * production order from the Production tab. Both already carry the context that
 * makes them meaningful (what shortfall, which resource, which task DAG), and a
 * hand-typed one would start with none of it.
 *
 * The copy is here rather than inline in the picker because the picker's job is
 * to answer "why can't I create one of those?" — a type screen that simply
 * omits two of the three types reads like a bug.
 */
export const CREATABLE_ORDER_TYPES = ['sales'] as const;

export const ORDER_TYPE_ORIGIN: Record<string, string> = {
  sales: 'Created here.',
  purchase: 'Raised from a sales order’s Procurement tab, or from Buy machine / Order spares on a resource.',
  manufacturing: 'Raised from a sales order’s Production tab once its setup is complete.',
};

/**
 * WHICH FIELDS BELONG TO WHICH ORDER TYPE.
 *
 * `fab_orders` is one 40-column table serving three different documents, so
 * every screen that renders "the order" was rendering all of it: a sales order
 * asked for an MRP controller, a purchase order offered a customer PO ref.
 *
 * One definition, consumed by BOTH the create screen and the detail Overview
 * tab, because those two drifting apart is exactly how a field gets set at
 * creation and then becomes invisible — or worse, editable in one place only.
 *
 * `create` is deliberately a SUBSET of `detail`. Creating an order should ask
 * the fewest questions that make it real; everything else is knowable later and
 * belongs on the record, not in the way. That is why customer PO ref is on the
 * sales detail but not its create screen — it is a genuine sales field, but you
 * rarely have the customer's PO number at the moment you open the order.
 */
export interface OrderFieldSet {
  /** Asked when creating. Keep this short. */
  create: string[];
  /** Shown and editable on the detail Overview tab. */
  detail: string[];
}

export const ORDER_FIELDS: Record<string, OrderFieldSet> = {
  sales: {
    create: ['type', 'customerId', 'priority', 'requiredDate'],
    detail: [
      'orderNumber', 'type', 'status', 'priority',
      'customerName', 'customerPoRef',
      'requiredDate', 'confirmedDate', 'scheduledShipDate',
      'plantId', 'currency', 'paymentTerms', 'notes',
    ],
  },
  purchase: {
    create: [],
    detail: [
      'orderNumber', 'type', 'status', 'priority',
      'supplierId', 'requiredDate', 'plantId',
      'currency', 'paymentTerms', 'notes',
    ],
  },
  manufacturing: {
    create: [],
    detail: [
      'orderNumber', 'type', 'status', 'priority',
      'requiredDate', 'scheduledShipDate', 'plantId', 'mrpController', 'notes',
    ],
  },
};

/** Does this type show this field on that surface? Unknown types show everything. */
export const showsField = (orderType: string, field: string, surface: 'create' | 'detail') => {
  const set = ORDER_FIELDS[orderType];
  if (!set) return true;
  return set[surface].includes(field);
};
