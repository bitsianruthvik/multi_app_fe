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
