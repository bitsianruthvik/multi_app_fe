/**
 * My place › "My plan" (CF_HRMS_HIRING_SPEC.md §18.3): the person's own plan
 * for the current period, read-only — KRAs with weights, the KPIs under each
 * with their targets. A draft says so: the manager may still change it.
 *
 * For a manager it also lists "My team's plans", each opening the plan page in
 * team mode (`my-place/team-plans/:id`). Somebody with no team gets a 403
 * `NOT_YOUR_TEAM` there — that simply means "no team", and nothing is shown.
 */
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Stack, Typography } from '@mui/material';
import { Callout, SectionCard } from '@shared/ui';
import { teamPlanApi, type MyPlans, type PlanRow } from '../../api/performance';
import { PlanReadOnly, PlanStatusBadge } from './PlanParts';
import { countWords, periodDates } from './planWords';

export function MyPlanSection({ company }: { company: string }) {
  const [mine, setMine] = useState<MyPlans | null>(null);
  const [mineFailed, setMineFailed] = useState(false);
  const [team, setTeam] = useState<PlanRow[]>([]);

  useEffect(() => {
    let live = true;
    teamPlanApi.myPlans()
      .then((m) => { if (live) setMine(m); })
      .catch(() => { if (live) setMineFailed(true); });
    // Only a manager has a team; anything else (NOT_YOUR_TEAM, no right) shows nothing.
    teamPlanApi.list()
      .then((r) => { if (live) setTeam(r.items ?? []); })
      .catch(() => { if (live) setTeam([]); });
    return () => { live = false; };
  }, []);

  return (
    <>
      {mine && (
        <SectionCard
          title="My plan"
          subtitle={!mine.linked || !mine.plans.length ? mine.line ?? 'There is no plan for you for this period yet.' : 'What you are measured on this period.'}
        >
          {mine.linked && mine.plans.length > 0 && (
            <Stack spacing={3}>
              {mine.plans.map((pl) => (
                <Box key={pl.plan.id} data-my-plan={pl.plan.id}>
                  <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{pl.plan.period.name}</Typography>
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{periodDates(pl.plan.period.start, pl.plan.period.end)}</Typography>
                    <PlanStatusBadge status={pl.plan.status} />
                  </Stack>
                  {pl.plan.status === 'DRAFT' && (
                    <Callout tone="neutral" title="Draft — your manager may still change it" sx={{ mb: 1.5 }} />
                  )}
                  <PlanReadOnly plan={pl} />
                </Box>
              ))}
            </Stack>
          )}
          {mine.linked && mine.past.length > 0 && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 2 }}>
              Earlier: {mine.past.map((p) => `${p.period.name} (${p.status.toLowerCase()})`).join(' · ')}
            </Typography>
          )}
        </SectionCard>
      )}
      {mineFailed && (
        <SectionCard title="My plan" subtitle="Your plan could not be loaded just now." >
          <span />
        </SectionCard>
      )}

      {team.length > 0 && (
        <SectionCard title="My team's plans" subtitle="Drafts you may change before HR activates them.">
          {team.map((p) => (
            <Box
              key={p.id}
              component={RouterLink}
              to={`/${company}/cf_hrms/my-place/team-plans/${p.id}`}
              data-team-plan={p.id}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', py: 1, px: 1,
                textDecoration: 'none', color: 'inherit', borderBottom: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)',
                '&:last-of-type': { borderBottom: 0 },
                '&:hover': { background: 'var(--c-surface-2)' },
              }}
            >
              <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{p.employeeName}</Typography>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                  {[p.period.name, p.positionTitle ?? p.roleTitle].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>{countWords(p.kraCount, p.kpiCount)}</Typography>
              <PlanStatusBadge status={p.status} />
            </Box>
          ))}
        </SectionCard>
      )}
    </>
  );
}
