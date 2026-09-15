export type StatusFamily = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/**
 * Single source of truth mapping every domain status string (across order
 * types, routing/process approval states, GRN states, stock levels) to a
 * StatusBadge family, so colors never drift between screens
 * (DESIGN_SYSTEM.md §5.1 / §7.9).
 */
const STATUS_FAMILY: Record<string, StatusFamily> = {
  // warning — not-yet-final / needs attention
  draft: 'warning',
  pending: 'warning',

  // info — active / in motion
  sent: 'info',
  released: 'info',
  in_progress: 'info',
  in_production: 'info',
  in_transit: 'info',
  scheduled: 'info',

  // `ready_to_ship` sat unmapped and so rendered as an anonymous grey chip on
  // the one screen where "the order is made, go and load it" is the most
  // consequential thing it could say.
  ready_to_ship: 'success',

  // success — final / good outcome
  confirmed: 'success',
  approved: 'success',
  shipped: 'success',
  received: 'success',
  completed: 'success',
  converted: 'success',

  // danger — stopped / wrong
  cancelled: 'danger',

  // ── Task lifecycle ──────────────────────────────────────────────────────
  // These were missing entirely, so every one of them fell through to
  // 'neutral': on the Task Queue a DONE task and a BLOCKED task rendered as
  // the same grey chip, on the single screen where that distinction is the
  // whole point. `in_progress` above already covered the running case, which
  // is why the omission wasn't obvious.
  //
  // `blocked` is the danger one — it is the only task state where something is
  // actually wrong and someone has to act. `eligible` is neutral: ready and
  // waiting is not a problem. `paused` is a warning: deliberately stopped, but
  // it shouldn't stay that way. Kept in step with the --c-task-* tokens the
  // DAG uses, so the queue and the canvas never disagree.
  eligible: 'neutral',
  blocked: 'danger',
  paused: 'warning',
  done: 'success',

  // neutral — structural / terminal-but-not-an-outcome
  closed: 'neutral',
  archived: 'neutral',
  superseded: 'neutral',
};

export function statusFamily(status: string): StatusFamily {
  return STATUS_FAMILY[status] ?? 'neutral';
}

/**
 * ONE STATUS VOCABULARY (U4/EU-19 item 9).
 *
 * `OrderProductionPlan.tsx` kept its own `STATUS_LABEL` for purchase- and
 * manufacturing-order statuses, and `SalesOrderDetail.tsx` kept its own
 * `SO_STATUSES` list for the sales-order status picker — three places a status
 * string could be spelled out, this file included, and nothing stopped them
 * drifting (a status added to one map and not the others silently fell back to
 * the raw snake_case string on whichever screen was missed).
 *
 * Every label any screen has ever needed lives here now; a status with no
 * entry still renders — `statusLabel` falls back to the same
 * underscore-to-space substitution every screen already did on a miss.
 */
export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  sent: 'Sent',
  released: 'Released',
  in_progress: 'In progress',
  in_production: 'In production',
  in_transit: 'In transit',
  scheduled: 'Scheduled',
  ready_to_ship: 'Ready to ship',
  confirmed: 'Confirmed',
  approved: 'Approved',
  shipped: 'Shipped',
  received: 'Received',
  completed: 'Completed',
  converted: 'Converted',
  cancelled: 'Cancelled',
  closed: 'Closed',
  archived: 'Archived',
  superseded: 'Superseded',
  eligible: 'Eligible',
  blocked: 'Blocked',
  paused: 'Paused',
  done: 'Done',
  // Production/purchase-order statuses that had no counterpart above.
  waiting: 'Deployed · waiting for material',
  requested: 'Requested',
  ordered: 'Ordered',
  partially_received: 'Partly received',
  waiting_material: 'Waiting for material',
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
}

/** A status family, as a MUI `Chip`/`Button` `color`. */
export function chipColorForStatus(status: string): 'default' | 'warning' | 'info' | 'success' | 'error' {
  const family = statusFamily(status);
  if (family === 'success') return 'success';
  if (family === 'warning') return 'warning';
  if (family === 'danger') return 'error';
  if (family === 'info') return 'info';
  return 'default';
}

/**
 * The statuses a person sets BY HAND on a sales order's Overview tab
 * (formerly `SalesOrderDetail.tsx`'s own `SO_STATUSES`). The rest —
 * `scheduled`, `in_production`, `ready_to_ship` — are consequences the system
 * works out from task progress, and `confirmed` is reached only by finishing
 * the wizard, never picked from a dropdown.
 */
export const MANUAL_ORDER_STATUSES = ['draft', 'shipped', 'closed', 'cancelled'];
