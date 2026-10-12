import { PageHeader, EmptyState } from '@shared/ui';

/**
 * Open points — unresolved organisation questions.
 *
 * STUB. The route, nav entry and breadcrumb are already wired; this file is the
 * only thing left to build. See TM/CF_HRMS_PLAN.md for the model and
 * DESIGN_SYSTEM.md §4 for the archetype this screen should follow.
 */
export default function OpenPoints() {
  return (
    <>
      <PageHeader title="Open points" subtitle="unresolved organisation questions" />
      <EmptyState
        title="Not built yet"
        hint="This screen is scaffolded but has no content. See CF_HRMS_PLAN.md."
      />
    </>
  );
}
