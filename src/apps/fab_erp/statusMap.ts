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
