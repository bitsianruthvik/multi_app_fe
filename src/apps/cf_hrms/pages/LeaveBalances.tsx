import { PageHeader, EmptyState } from '@shared/ui';

/**
 * Leave balances — entitlement and usage.
 *
 * STUB. The route, nav entry and breadcrumb are already wired; this file is the
 * only thing left to build. See TM/CF_HRMS_PLAN.md for the model and
 * DESIGN_SYSTEM.md §4 for the archetype this screen should follow.
 */
export default function LeaveBalances() {
  return (
    <>
      <PageHeader title="Leave balances" subtitle="entitlement and usage" />
      <EmptyState
        title="Not built yet"
        hint="This screen is scaffolded but has no content. See CF_HRMS_PLAN.md."
      />
    </>
  );
}
