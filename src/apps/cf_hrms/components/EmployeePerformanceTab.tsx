/**
 * The employee page's Performance tab (CF_HRMS_HIRING_SPEC.md §18.3): the
 * plan(s) of the current period first, then upcoming, past and — quietly —
 * cancelled ones. Each opens the plan page.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import AssignmentTurnedInOutlined from '@mui/icons-material/AssignmentTurnedInOutlined';
import { EmptyState, ErrorNotice, ListSkeleton, SectionCard, ToneBadge } from '@shared/ui';
import { performanceApi, type EmployeePlans, type PlanRow } from '../api/performance';
import { PlanStatusBadge } from './performance/PlanParts';
import { countWords, frequencyWord, periodDates } from './performance/planWords';

function PlanLine({ plan, company, quiet = false }: { plan: PlanRow; company: string; quiet?: boolean }) {
  return (
    <Box
      component={RouterLink}
      to={`/${company}/cf_hrms/plans/${plan.id}`}
      data-employee-plan={plan.id}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', py: 1.25, px: 1,
        textDecoration: 'none', color: 'inherit', borderBottom: '1px solid var(--c-border)',
        borderRadius: 'var(--r-sm)', opacity: quiet ? 0.75 : 1,
        '&:last-of-type': { borderBottom: 0 },
        '&:hover': { background: 'var(--c-surface-2)' },
      }}
    >
      <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{plan.period.name}</Typography>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
          {periodDates(plan.period.start, plan.period.end)} · {frequencyWord(plan.frequency)}
          {plan.positionCode || plan.positionTitle ? ` · ${[plan.positionCode, plan.positionTitle ?? plan.roleTitle].filter(Boolean).join(' ')}` : ''}
        </Typography>
        {plan.cancelReason && quiet && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Reason: {plan.cancelReason}</Typography>
        )}
      </Box>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>{countWords(plan.kraCount, plan.kpiCount)}</Typography>
      {!quiet && (plan.weightsSet
        ? (plan.weightsOk ? <ToneBadge tone="success" label="Weights add up" /> : <ToneBadge tone="warning" label={`Weights add to ${plan.weightTotal}%`} />)
        : <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>No weights set</Typography>)}
      <PlanStatusBadge status={plan.status} />
    </Box>
  );
}

export function EmployeePerformanceTab({ employeeId, company, canEdit }: { employeeId: number; company: string; canEdit: boolean }) {
  const [data, setData] = useState<EmployeePlans | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    performanceApi.employeePlans(employeeId).then((d) => { setData(d); setError(null); }).catch(setError);
  }, [employeeId]);
  useEffect(() => { load(); }, [load]);

  if (error && !data) return <ErrorNotice error={error} onRetry={load} />;
  if (!data) return <ListSkeleton rows={3} />;

  const none = !data.current.length && !data.past.length && !data.upcoming.length && !data.cancelled.length;
  if (none) {
    return (
      <EmptyState
        icon={<AssignmentTurnedInOutlined />}
        title="No plans yet"
        hint="A plan is made for each person, period by period, from the KRAs and KPIs of their job."
        action={canEdit ? <Button size="small" variant="outlined" component={RouterLink} to={`/${company}/cf_hrms/plans`}>Go to plans</Button> : undefined}
      />
    );
  }

  return (
    <Stack spacing={2}>
      <SectionCard title="This period" subtitle={data.current.length ? undefined : 'No plan for the period running now.'}>
        {data.current.map((p) => <PlanLine key={p.id} plan={p} company={company} />)}
      </SectionCard>
      {data.upcoming.length > 0 && (
        <SectionCard title="Upcoming">
          {data.upcoming.map((p) => <PlanLine key={p.id} plan={p} company={company} />)}
        </SectionCard>
      )}
      {data.past.length > 0 && (
        <SectionCard title="Past plans">
          {data.past.map((p) => <PlanLine key={p.id} plan={p} company={company} />)}
        </SectionCard>
      )}
      {data.cancelled.length > 0 && (
        <SectionCard title="Cancelled" subtitle="Kept as they were; they do not count.">
          {data.cancelled.map((p) => <PlanLine key={p.id} plan={p} company={company} quiet />)}
        </SectionCard>
      )}
    </Stack>
  );
}
