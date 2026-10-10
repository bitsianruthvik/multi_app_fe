/**
 * A role's or a seat's job content, fetched and drawn — the read-only use of
 * `JobContent` that the org chart panel and the Departments side sheet share.
 *
 * It asks `GET /roles/:id/job-content` or `GET /positions/:id/job-content`
 * (both `cf_hrms_org_view`), which read the one content resolver. The seat read
 * is the role's content with that seat's own changes applied and marked.
 */
import type { ReactNode } from 'react';
import { Box, Skeleton, Stack } from '@mui/material';
import { ErrorNotice } from '@shared/ui';
import type { JobContentData } from '../api/jobContent';
import { JobContent, type JobContentProps } from './JobContent';
import { useJobContent, type JobTarget } from './useJobContent';

export function JobContentPanel({
  target,
  asOf,
  after,
  ...view
}: {
  target: JobTarget | null;
  asOf?: string;
  /** Under the content once it has loaded — the Edit link. */
  after?: (data: JobContentData) => ReactNode;
} & Omit<JobContentProps, 'content'>) {
  const { data, error, loading, reload } = useJobContent(target, asOf);
  if (!target) return null;
  return (
    <Box>
      {loading && !data && (
        <Stack spacing={1} aria-busy="true" aria-label="Loading the job content">
          <Skeleton variant="rounded" height={44} />
          <Skeleton variant="rounded" height={44} />
        </Stack>
      )}
      {!!error && <ErrorNotice error={error} fallback="The job content could not be loaded." onRetry={reload} />}
      {data && (
        <>
          <JobContent content={data} {...view} />
          {after?.(data)}
        </>
      )}
    </Box>
  );
}

export default JobContentPanel;
