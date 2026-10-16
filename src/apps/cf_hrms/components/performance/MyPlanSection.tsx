/**
 * My place › "My plan" (CF_HRMS_HIRING_SPEC.md §18.3): the person's own plan
 * for the current period, read-only — KRAs with weights, the KPIs under each
 * with their targets. A draft says so: the manager may still change it.
 *
 * AT A GLANCE FIRST: the KPI scorecard (KpiScorecard — the same card as the org
 * chart panel, from `GET /user/me/scorecard`): each KPI with its KRA, target,
 * value so far and the gap. The plan it summarises is not listed again: its
 * full read-only view (weights, months, corrections) opens below the card on
 * "Show the full plan". With no plan yet, the card shows the job's KPIs.
 *
 * For a manager it also lists "My team's plans", each opening the plan page in
 * team mode (`my-place/team-plans/:id`). Somebody with no team gets a 403
 * `NOT_YOUR_TEAM` there — that simply means "no team", and nothing is shown.
 */
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Callout, SectionCard } from '@shared/ui';
import { teamPlanApi, type MyPlans, type PlanRow, type Scorecard } from '../../api/performance';
import { getMyScorecard } from '../../api/self';
import { KpiScorecard } from './KpiScorecard';
import { PlanReadOnly, PlanStatusBadge } from './PlanParts';
import { AchievementChip } from './ActualParts';
import { countWords, periodDates } from './planWords';

export function MyPlanSection({ company }: { company: string }) {
  const [mine, setMine] = useState<MyPlans | null>(null);
  const [mineFailed, setMineFailed] = useState(false);
  const [team, setTeam] = useState<PlanRow[]>([]);
  const [card, setCard] = useState<Scorecard | null>(null);
  /** The plans whose full read-only view is open. */
  const [full, setFull] = useState<Set<number>>(new Set());

  useEffect(() => {
    let live = true;
    teamPlanApi.myPlans()
      .then((m) => { if (live) setMine(m); })
      .catch(() => { if (live) setMineFailed(true); });
    getMyScorecard()
      .then((c) => { if (live) setCard(c); })
      .catch(() => { if (live) setCard(null); });
    // Only a manager has a team; anything else (NOT_YOUR_TEAM, no right) shows nothing.
    teamPlanApi.list()
      .then((r) => { if (live) setTeam(r.items ?? []); })
      .catch(() => { if (live) setTeam([]); });
    return () => { live = false; };
  }, []);

  const cardPlanId = card?.source === 'PLAN' ? card.plan?.id ?? null : null;
  const jobCard = card?.source === 'JOB' && card.kpis.length > 0;
  const toggleFull = (id: number) => setFull((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <>
      {mine && (
        <SectionCard
          title="My plan"
          subtitle={!mine.linked || !mine.plans.length
            ? (jobCard ? 'What your job measures. There is no plan for you for this period yet.' : mine.line ?? 'There is no plan for you for this period yet.')
            : 'What you are measured on this period.'}
        >
          {jobCard && (
            <Box data-my-scorecard="JOB">
              <KpiScorecard reloadKey="me|job" load={() => Promise.resolve(card!)} />
            </Box>
          )}
          {mine.linked && mine.plans.length > 0 && (
            <Stack spacing={3}>
              {mine.plans.map((pl) => {
                // The plan the scorecard summarises: the card, then its full view on request — never both lists at once.
                const summarised = pl.plan.id === cardPlanId;
                return (
                  <Box key={pl.plan.id} data-my-plan={pl.plan.id}>
                    {!summarised && (
                      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
                        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{pl.plan.period.name}</Typography>
                        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{periodDates(pl.plan.period.start, pl.plan.period.end)}</Typography>
                        <PlanStatusBadge status={pl.plan.status} />
                      </Stack>
                    )}
                    {pl.plan.status === 'DRAFT' && (
                      <Callout tone="neutral" title="Draft — your manager may still change it" sx={{ mb: 1.5 }} />
                    )}
                    {summarised ? (
                      <>
                        <Box data-my-scorecard="PLAN">
                          <KpiScorecard reloadKey={`me|${pl.plan.id}`} load={() => Promise.resolve(card!)} />
                        </Box>
                        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 1 }}>
                          {periodDates(pl.plan.period.start, pl.plan.period.end)}
                        </Typography>
                        <Button size="small" sx={{ mt: 0.5, px: 0 }} aria-expanded={full.has(pl.plan.id)} onClick={() => toggleFull(pl.plan.id)}>
                          {full.has(pl.plan.id) ? 'Hide the full plan' : 'Show the full plan — weights, each month and corrections'}
                        </Button>
                        {full.has(pl.plan.id) && (
                          <Box sx={{ mt: 1 }}>
                            <PlanReadOnly plan={pl} history={(kpiId) => teamPlanApi.myActualHistory(pl.plan.id, kpiId)} />
                          </Box>
                        )}
                      </>
                    ) : (
                      <PlanReadOnly plan={pl} history={(kpiId) => teamPlanApi.myActualHistory(pl.plan.id, kpiId)} />
                    )}
                  </Box>
                );
              })}
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
        <SectionCard
          title="My team's plans"
          subtitle="Drafts you may change before HR activates them; actuals you enter once a plan is active."
          actions={team.some((p) => p.status === 'ACTIVE') ? (
            <Button component={RouterLink} to={`/${company}/cf_hrms/my-place/team-actuals`} size="small" variant="outlined">Enter actuals for my team</Button>
          ) : undefined}
        >
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
              {p.status !== 'DRAFT' && <AchievementChip achievement={p.score} band={p.band} />}
              <PlanStatusBadge status={p.status} />
            </Box>
          ))}
        </SectionCard>
      )}
    </>
  );
}
