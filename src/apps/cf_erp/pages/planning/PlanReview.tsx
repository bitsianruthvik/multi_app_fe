import { useState } from 'react';
import { Box, Collapse, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { getPlanReview, listPlanMonths, monthText, tonnesText, dayText } from '../../api/planning';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { useUrlParam } from '../../hooks/useUrlState';
import { appPath } from '../../navMeta';
import { EmptyState, ErrorNotice, InfoTip, ListSkeleton, PageHeader, SectionCard, StatStrip } from '../../components/ui';
import { ContractorTable, PlanStatus, ReasonList, WeekBars } from '../../components/Planning/parts';

const CAUSE: Record<string, string> = { material: 'Material came late', machine: 'Machines stopped', hours: 'Fewer hours run than planned', contractor: 'Contractors behind', changed: 'Orders changed', behind: 'Not finished in the week' };

/**
 * PLANNING › PAST PLANS (§105): a month looked back on — the frozen plan against what finished, week by week; what
 * went right and wrong each week and why; the causes of the month with the tonnes they touched; the contractors; and
 * the machines the plan could have used and did not.
 */
export default function PlanReview() {
  const company = useCompanySlug();
  const [monthParam, setMonthParam] = useUrlParam('month', '');
  const months = useLoad(() => listPlanMonths(), []);
  const review = useLoad(() => getPlanReview(monthParam || undefined), [monthParam]);
  const [open, setOpen] = useState<number | null>(null);
  const r = review.data;
  if (review.error) return <ErrorNotice error={review.error} onRetry={review.reload} />;
  if (!r) return <ListSkeleton rows={8} />;
  const list = [...new Set([...(months.data?.months ?? []).map((m) => m.month), r.month])].sort().reverse();
  const gap = r.frozen ? (r.forecastTonnes ?? r.doneTonnes) - r.frozen.tonnes : null;
  const shown = open ?? r.weeks.find((w) => w.current)?.no ?? null;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      <PageHeader title={<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>Past plans · {monthText(r.month)}
        <InfoTip text="Each month's frozen plan beside what happened: the tonnes finished each week, why units missed (material, machine stops, hours, contractors, changes), and what more could have been done." /></Box>}
        subtitle="Where the plan held, where it slipped, and why."
        actions={<TextField select size="small" value={r.month} onChange={(e) => setMonthParam(e.target.value)} sx={{ minWidth: 180 }} inputProps={{ 'aria-label': 'Month' }}>
          {list.map((m) => <MenuItem key={m} value={m}>{monthText(m)}</MenuItem>)}
        </TextField>} />
      {!r.frozen ? <EmptyState title={`${monthText(r.month)} has no frozen plan`} hint="A month is reviewed against the plan the MD froze." action={<Box component={Link} to={appPath(company, 'planning-month')} sx={{ fontSize: 14 }}>Open the month plan</Box>} /> : (
        <>
          <StatStrip stats={[
            { label: 'Frozen plan', value: Math.round(r.frozen.tonnes), display: tonnesText(r.frozen.tonnes), hint: `v${r.frozen.version}${r.frozen.frozenAt ? `, frozen ${dayText(String(r.frozen.frozenAt).slice(0, 10))}` : ''}` },
            { label: 'Done so far', value: Math.round(r.doneTonnes), display: tonnesText(r.doneTonnes), tone: 'success' as const },
            { label: 'Forecast', value: Math.round(r.forecastTonnes ?? 0), display: r.forecastTonnes == null ? '—' : tonnesText(r.forecastTonnes) },
            { label: 'Against the plan', value: Math.round(Math.abs(gap ?? 0)), display: gap == null ? '—' : `${gap >= 0 ? '+' : '−'}${tonnesText(Math.abs(gap))}`, tone: gap != null && gap < -0.05 ? 'danger' as const : 'success' as const },
            { label: 'Best possible then', value: Math.round(r.frozen.boundTonnes ?? 0), display: tonnesText(r.frozen.boundTonnes), hint: 'The most any plan could have finished with the machines and material dates known when it was frozen' },
          ]} />
          <SectionCard title="Week by week" subtitle="Frozen plan · the week's own plan · done. Click a week for what went right and wrong.">
            <WeekBars weeks={r.weeks.map((w) => ({ no: w.no, start: w.start, end: w.end, current: w.current, active: shown === w.no, frozen: w.frozenTonnes, planned: w.plannedTonnes, done: w.doneTonnes, onClick: () => setOpen(w.no) }))} />
          </SectionCard>
          <Box sx={{ display: 'grid', gap: 1 }} data-testid="review-weeks">
            {r.weeks.filter((w) => w.status || w.past || w.current).map((w) => {
              const isOpen = shown === w.no;
              const delta = w.doneTonnes != null && w.plannedTonnes != null ? w.doneTonnes - w.plannedTonnes : null;
              return (
                <Box key={w.no} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface, #fff)' }}>
                  <Box onClick={() => setOpen(isOpen ? -1 : w.no)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen(isOpen ? -1 : w.no); }}
                    sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', gap: 2, alignItems: 'center', p: '10px 14px', cursor: 'pointer' }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Week {w.no} <Box component="span" sx={{ fontWeight: 400, color: 'var(--c-text-2)' }}>· {dayText(w.start)} – {dayText(w.end)}{w.current ? ' · this week' : ''}</Box></Typography>
                    <PlanStatus status={w.status} />
                    <Typography sx={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: delta != null && delta < -0.05 ? 'var(--c-danger-700)' : 'var(--c-text-2)' }}>
                      {w.plannedTonnes != null ? `${tonnesText(w.doneTonnes ?? 0)} done of ${tonnesText(w.plannedTonnes)}` : 'not planned'}
                    </Typography>
                    <IconButton size="small" aria-label={`${isOpen ? 'Hide' : 'Show'} week ${w.no}`}><ExpandMoreRounded sx={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} /></IconButton>
                  </Box>
                  <Collapse in={isOpen} unmountOnExit>
                    <Box sx={{ borderTop: '1px solid var(--c-divider)', p: 2, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                      <Box><Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5, color: 'var(--c-success-700)' }}>What went right</Typography><ReasonList rows={w.right} tone="good" empty="Nothing recorded." /></Box>
                      <Box><Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5, color: 'var(--c-danger-700)' }}>What went wrong, and why</Typography><ReasonList rows={w.wrong} tone="bad" empty="Nothing went wrong against the plan." /></Box>
                      {w.load.length > 0 && (
                        <Box sx={{ gridColumn: '1 / -1' }}>
                          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>Hours</Typography>
                          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{w.load.map((l) => `${l.name}: ${l.runHours} of ${l.plannedHours} h${l.stopHours ? ` (${l.stopHours} h stopped)` : ''}`).join(' · ')}</Typography>
                        </Box>
                      )}
                      {w.notes && <Box sx={{ gridColumn: '1 / -1' }}><Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>The planner's notes</Typography><Typography sx={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{w.notes}</Typography></Box>}
                      {w.id && <Box sx={{ gridColumn: '1 / -1' }}><Box component={Link} to={`${appPath(company, 'planning-week')}?week=${w.start}`} sx={{ fontSize: 13 }}>Open the week's plan</Box></Box>}
                    </Box>
                  </Collapse>
                </Box>
              );
            })}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            <SectionCard title="Why tonnes were lost this month">
              {r.causes.length ? r.causes.map((c) => (
                <Box key={c.kind} sx={{ py: 0.75, borderTop: '1px solid var(--c-divider)' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}><Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{CAUSE[c.kind] ?? c.kind}</Typography><Typography sx={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{c.tonnes ? tonnesText(c.tonnes) : ''} · {c.count}×</Typography></Box>
                  {c.examples.map((e, i) => <Typography key={i} sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{e}</Typography>)}
                </Box>
              )) : <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Nothing has gone wrong against the plan.</Typography>}
            </SectionCard>
            <SectionCard title={<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>What could have been done<InfoTip text="Machines that were available when the plan was frozen and were not put in it, with the tonnes each would have added." /></Box>}>
              {r.notTaken.length ? r.notTaken.map((o) => <Typography key={o.key} sx={{ fontSize: 13, py: 0.4 }}><Box component="span" sx={{ color: 'var(--c-success-700)', fontWeight: 600 }}>+{Math.round(o.gain * 10) / 10} t</Box> · {o.label}</Typography>)
                : <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>The plan used every machine that would have added tonnes.</Typography>}
              {r.frozen.priorityTonnes != null && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 1 }}>Working strictly by priority would have planned {tonnesText(r.frozen.priorityTonnes)}; the optimised plan was {tonnesText(r.frozen.tonnes)}.</Typography>}
            </SectionCard>
          </Box>
          <SectionCard title="Contractors this month"><ContractorTable contractors={r.contractors} workOrders={r.workOrders} /></SectionCard>
        </>
      )}
    </Box>
  );
}
