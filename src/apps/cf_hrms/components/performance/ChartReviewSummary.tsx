/**
 * The org chart panel's performance line (CF_HRMS_HIRING_SPEC.md §20.3): for a
 * filled position, the person's latest rating (from their last final review that
 * is done) and how many of their actions are open. Only for logins with
 * performance view — the caller checks; a person outside the login's department
 * answers 403 and nothing is shown.
 */
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { ToneBadge } from '@shared/ui';
import { reviewApi, type ReviewSummary } from '../../api/reviews';

export function ChartReviewSummary({ employeeId, company }: { employeeId: number; company: string }) {
  const [data, setData] = useState<ReviewSummary | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    reviewApi.summary(employeeId).then((d) => { if (live) setData(d); }).catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [employeeId]);
  if (!data || (!data.latestRating && data.openActions === 0)) return null;
  return (
    <Box data-chart-review="" sx={{ mt: 1.5 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', mb: 0.5 }}>Performance</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', fontSize: 13 }}>
        {data.latestRating ? (
          <Box component={RouterLink} to={reviewApi.reviewPath(company, data.latestRating.reviewId)} sx={{ color: 'inherit', textDecoration: 'none' }}>
            <ToneBadge tone="info" noIcon label={`Rated ${data.latestRating.value} — ${data.latestRating.label}`} title={`Final review of ${data.latestRating.periodName}`} />
          </Box>
        ) : (
          <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Not rated yet</Typography>
        )}
        {data.openActions > 0 && (
          <ToneBadge
              tone={data.overdueActions ? 'warning' : 'neutral'}
              noIcon
            label={`${data.openActions} open action${data.openActions === 1 ? '' : 's'}${data.overdueActions ? `, ${data.overdueActions} overdue` : ''}`}
            title="Actions on their plans that are not done yet"
          />
        )}
      </Box>
    </Box>
  );
}
