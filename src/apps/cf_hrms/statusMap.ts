import { registerStatusTones, registerStatusLabels } from '@shared/ui';

/**
 * Every status value cf_hrms uses, registered once so a `<StatusBadge status=…>`
 * agrees with itself on every screen. Imported for its side effect by
 * `components/shell/CfHrmsShell.tsx`, which every route renders inside.
 *
 * Tone is meaning, not decoration (DESIGN_SYSTEM.md §5.1):
 *   success — settled, correct, in force
 *   info    — live and moving
 *   warning — waiting on a person
 *   danger  — refused, or a real operational problem
 *   neutral — structural, historical, or simply a fact
 *
 * The judgement calls worth stating, because they are easy to get wrong:
 *
 *   VACANT is **neutral**, not danger. Karni has 156 vacancies against 169
 *   sanctioned seats. A screen that paints that red every day is a screen
 *   people stop reading, and a vacancy is a fact about a growing plant, not an
 *   error somebody must fix today.
 *
 *   EXITED and ENDED are **neutral**, not danger. Someone leaving is ordinary,
 *   and history should not look like failure.
 *
 *   DRAFT is **warning** because it means unfinished work someone still owes,
 *   whereas PLANNED is **info** because it means agreed work that has not
 *   started yet. Same "not active now", different obligation.
 *
 *   UNVERIFIED is **warning** and EXPIRED is **danger**: an unchecked document
 *   needs attention, an expired licence may stop someone working today.
 */
registerStatusTones({
  // Lifecycle shared by most masters
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  DRAFT: 'warning',
  RETIRED: 'neutral',
  // FROZEN is `info`, not `warning`: a frozen seat is a deliberate management
  // hold, and on a vacancy report it is the thing that *explains* why a seat is
  // not being filled. Nobody is being waited on, so it does not earn amber.
  FROZEN: 'info',
  CLOSED: 'neutral',

  // Employment
  NOTICE: 'warning',
  EXITED: 'neutral',

  // Work assignments
  PLANNED: 'info',
  SUSPENDED: 'warning',
  ENDED: 'neutral',

  // Attendance
  PRESENT: 'success',
  ABSENT: 'danger',
  LEAVE: 'info',
  WEEKLY_OFF: 'neutral',
  HOLIDAY: 'neutral',
  HALF_DAY: 'warning',
  UNKNOWN: 'warning',

  // Requests and approvals
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',

  // Documents
  UNVERIFIED: 'warning',
  VERIFIED: 'success',
  EXPIRED: 'danger',

  // Open points
  OPEN: 'warning',
  RESOLVED: 'success',
  DISMISSED: 'neutral',

  // Import runs
  parsed: 'info',
  validated: 'info',
  committed: 'success',
  discarded: 'neutral',

  // Position fill — see the note above on VACANT
  VACANT: 'neutral',
  FILLED: 'success',
});

/**
 * Sentence case, once, for every status the app shows. Without this a badge
 * falls back to the raw enum and the screen shouts ACTIVE / EXITED / PENDING in
 * capitals — which reads as an error state even when it is the ordinary one,
 * and makes a page of badges look like a page of alarms.
 */
registerStatusLabels({
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  DRAFT: 'Draft',
  RETIRED: 'Retired',
  FROZEN: 'Frozen',
  CLOSED: 'Closed',
  NOTICE: 'On notice',
  EXITED: 'Exited',
  PLANNED: 'Planned',
  SUSPENDED: 'Suspended',
  ENDED: 'Ended',
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LEAVE: 'On leave',
  WEEKLY_OFF: 'Weekly off',
  HOLIDAY: 'Holiday',
  HALF_DAY: 'Half day',
  UNKNOWN: 'Not marked',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  UNVERIFIED: 'Not verified',
  VERIFIED: 'Verified',
  EXPIRED: 'Expired',
  OPEN: 'Open',
  RESOLVED: 'Resolved',
  DISMISSED: 'Dismissed',
  VACANT: 'Vacant',
  FILLED: 'Filled',
  parsed: 'Parsed',
  validated: 'Validated',
  committed: 'Committed',
  discarded: 'Discarded',
});

/**
 * NOTE — per-screen `map={…}` props still exist on several screens, because the
 * phases that built them ran before this file did and each was told not to touch
 * shared app files. A per-screen map WINS over this registry, so a disagreement
 * shows up as two screens disagreeing about the same word. One was already found
 * and settled that way (FROZEN, above). When those screens are next touched,
 * delete the `map`/`labelMap` props and let this file answer.
 *
 * Relationship-type tones (PRIMARY_MANAGER, DOTTED_LINE, PROJECT_MANAGER …) are a
 * DIFFERENT vocabulary — a kind of authority, not a lifecycle state — and belong
 * in the reporting components that use them, not here.
 */
