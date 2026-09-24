import { PageHeader, EmptyState } from '@shared/ui';

/**
 * Home — cockpit.
 *
 * STUB. The route, nav entry and breadcrumb are already wired; this file is the
 * only thing left to build. See TM/CF_HRMS_PLAN.md for the model and
 * DESIGN_SYSTEM.md §4 for the archetype this screen should follow.
 */
export default function Home() {
  return (
    <>
      <PageHeader title="Home" subtitle="cockpit" />
      <EmptyState
        title="Not built yet"
        hint="This screen is scaffolded but has no content. See CF_HRMS_PLAN.md."
      />
    </>
  );
}
