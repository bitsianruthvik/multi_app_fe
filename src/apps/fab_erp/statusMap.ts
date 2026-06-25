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

  // success — final / good outcome
  confirmed: 'success',
  approved: 'success',
  shipped: 'success',
  received: 'success',
  completed: 'success',
  converted: 'success',

  // danger — stopped / wrong
  cancelled: 'danger',

  // neutral — structural / terminal-but-not-an-outcome
  closed: 'neutral',
  archived: 'neutral',
  superseded: 'neutral',
};

export function statusFamily(status: string): StatusFamily {
  return STATUS_FAMILY[status] ?? 'neutral';
}
