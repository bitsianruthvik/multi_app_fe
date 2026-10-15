/**
 * My place › "My reviews" and "My actions" (CF_HRMS_HIRING_SPEC.md §20.3).
 *
 *   My reviews     my check-ins and final reviews; an open one says "Write your part"
 *                  and opens the review page where I write my comment and blockers
 *   My actions     the actions I own; I mark them done (with a note, if I like)
 *   My team's reviews   for a manager: the open reviews of the people below them,
 *                  each opening the review in team mode. Anyone else gets an empty
 *                  list there, and nothing is shown.
 *
 * Nothing is shown at all for somebody with no reviews and no actions.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { SectionCard, useToast } from '@shared/ui';
import { myReviewApi, teamReviewApi, type MyReviews, type Review } from '../../api/reviews';
import { ActionsList, DueChip, ReviewStatusBadge } from './ReviewParts';

function ReviewRow({ r, to, who }: { r: Review; to: string; who?: boolean }) {
  const open = r.status === 'OPEN' || r.status === 'EMPLOYEE_DONE';
  return (
    <Box
      component={RouterLink}
      to={to}
      data-review-row={r.id}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', py: 1, px: 1, textDecoration: 'none', color: 'inherit',
        borderBottom: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', '&:last-of-type': { borderBottom: 0 }, '&:hover': { background: 'var(--c-surface-2)' },
      }}
    >
      <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{who ? `${r.employeeName} · ` : ''}{r.title}</Typography>
        {!who && r.can?.writeOwn && <Typography sx={{ fontSize: 12.5, color: 'var(--c-primary-600)' }}>Write your part</Typography>}
        {r.rating && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Rating {r.rating.value} — {r.rating.label}</Typography>}
      </Box>
      <DueChip dueDate={r.dueDate} overdue={r.overdue} daysOverdue={r.daysOverdue} open={open} />
      <ReviewStatusBadge status={r.status} />
    </Box>
  );
}

export function MyReviewsSection({ company }: { company: string }) {
  const toast = useToast();
  const [mine, setMine] = useState<MyReviews | null>(null);
  const [team, setTeam] = useState<Review[]>([]);

  const load = useCallback(() => {
    myReviewApi.mine().then(setMine).catch(() => setMine(null));
    // Only a manager has a team; anything else shows nothing.
    teamReviewApi.list()
      .then((r) => setTeam((r.items ?? []).filter((x) => x.status === 'OPEN' || x.status === 'EMPLOYEE_DONE')))
      .catch(() => setTeam([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const openActions = (mine?.actions ?? []).filter((a) => a.status === 'OPEN');
  const doneActions = (mine?.actions ?? []).filter((a) => a.status !== 'OPEN').slice(0, 5);

  return (
    <>
      {mine?.linked && mine.reviews.length > 0 && (
        <SectionCard title="My reviews" subtitle="Your check-ins and final reviews. Write your part while a review is open; your manager closes it.">
          <Box data-my-reviews="">
            {mine.reviews.map((r) => <ReviewRow key={r.id} r={r} to={myReviewApi.reviewPath(company, r.id)} />)}
          </Box>
        </SectionCard>
      )}
      {mine?.linked && mine.actions.length > 0 && (
        <SectionCard title="My actions" subtitle="What you agreed to do. Mark one done when it is.">
          <ActionsList
            actions={openActions.map((a) => ({ ...a, can: { done: true, edit: false, drop: false } }))}
            empty="Nothing open — well done."
            onDone={async (a, note) => { await myReviewApi.actionDone(a.id, note); toast.success('Action done.'); load(); }}
          />
          {doneActions.length > 0 && (
            <Box sx={{ mt: 1.5 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-2)' }}>Recently closed</Typography>
              <ActionsList actions={doneActions.map((a) => ({ ...a, can: { done: false, edit: false, drop: false } }))} />
            </Box>
          )}
        </SectionCard>
      )}
      {team.length > 0 && (
        <SectionCard title="My team’s reviews" subtitle="Open reviews of the people below you: write your part, rate a final review, close it.">
          <Box data-team-reviews="">
            {team.map((r) => <ReviewRow key={r.id} r={r} who to={teamReviewApi.reviewPath(company, r.id)} />)}
          </Box>
        </SectionCard>
      )}
    </>
  );
}
