import { Box, Button, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import DateRangeRounded from '@mui/icons-material/DateRangeRounded';
import TodayRounded from '@mui/icons-material/TodayRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { dismissPlanAlert, getPlanningHome, monthText, raiseConsumableMr, tonnesText, dayText, type PlanAlert } from '../../api/planning';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { appPath } from '../../navMeta';
import { ErrorNotice, InfoTip, ListSkeleton, PageHeader, SectionCard, StatStrip } from '../../components/ui';
import { AlertList, PlanStatus, WeekBars } from '../../components/Planning/parts';
import { useToast } from '../../components/toastContext';

/**
 * PLANNING (home, §105): where the month stands in one look — the frozen month plan, this week's plan, tomorrow's
 * roster — each with its next step, the month's tonnes (plan, done, forecast) and what has changed against the plan.
 */
export default function PlanningHome() {
  const company = useCompanySlug();
  const toast = useToast();
  const navigate = useNavigate();
  const canManage = useIsPermitted()('cf_erp_production_manage');
  const home = useLoad(() => getPlanningHome(), []);
  const h = home.data;
  if (home.error) return <ErrorNotice error={home.error} onRetry={home.reload} />;
  if (!h) return <ListSkeleton rows={6} />;
  const to = (p: string) => appPath(company, p);
  const frozen = h.monthPlan;
  const gap = frozen && h.forecastTonnes != null ? h.forecastTonnes - frozen.tonnes : null;
  const dismiss = async (a: PlanAlert) => { try { await dismissPlanAlert(a.id); home.reload(); } catch (e) { toast.error((e as Error).message); } };
  const act = async (a: PlanAlert) => {
    if (!a.impact?.itemId || !a.impact.qty) return;
    try {
      const r = await raiseConsumableMr({ month: h.month, items: [{ itemId: a.impact.itemId, qty: a.impact.qty, needBy: a.impact.needBy ?? null }] });
      toast.success(`${r.requisition.code} went to Stores${r.needBy ? ` — needed by ${dayText(r.needBy)}` : ''}.`);
    } catch (e) { toast.error((e as Error).message); }
  };
  const stage = (icon: React.ReactNode, title: string, status: React.ReactNode, line: string, action: { label: string; to: string; primary?: boolean }, test: string) => (
    <Box data-testid={test} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', p: 2, display: 'grid', gap: 1, background: 'var(--c-surface, #fff)', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ color: 'var(--c-primary-600)', display: 'flex' }}>{icon}</Box>
        <Typography sx={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{title}</Typography>
        {status}
      </Box>
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', minHeight: 38 }}>{line}</Typography>
      <Box><Button component={Link} to={to(action.to)} variant={action.primary ? 'contained' : 'outlined'} size="small" endIcon={<ArrowForwardRounded />}>{action.label}</Button></Box>
    </Box>
  );
  const wk = h.week;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      <PageHeader title={<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>Planning · {monthText(h.month)}
        <InfoTip text="The month plan is made at the start of the month for the most tonnes of finished shipping units and frozen by the MD. Each week it is planned again from that day's reality, still for the month's tonnes. Each day's roster is what production works to. Whatever changes against the plan shows here as an alert." /></Box>}
        subtitle="The month plan, this week, tomorrow — and what has changed." />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
        {stage(<CalendarMonthRounded />, 'Month plan', <PlanStatus status={h.working?.status ?? frozen?.status ?? null} />,
          frozen ? `Frozen at ${tonnesText(frozen.tonnes)} (v${frozen.version}).${h.working ? ` A v${h.working.version} ${h.working.status === 'pending' ? 'is with the MD' : 'draft is open'}.` : ''}`
            : h.working ? (h.working.status === 'pending' ? `${tonnesText(h.working.tonnes)} — waiting for the MD to freeze it.` : `A draft at ${tonnesText(h.working.tonnes)} — send it to the MD to freeze it.`)
              : 'No plan for this month yet. Choose the machines, rank the orders and optimise.',
          { label: frozen ? 'Open the month plan' : h.working ? 'Open the draft' : 'Make the month plan', to: 'planning-month', primary: canManage && !frozen }, 'home-month')}
        {stage(<DateRangeRounded />, `Week ${wk.week.no} · ${dayText(wk.week.start)} – ${dayText(wk.week.end)}`, <PlanStatus status={wk.plan?.status ?? null} />,
          wk.plan ? `${tonnesText(wk.plan.tonnesWeek)} to finish this week${wk.actual ? ` — ${tonnesText(wk.actual.doneTonnes)} done so far` : ''}.` : 'This week has no plan yet. Plan it from today\'s reality.',
          { label: wk.plan ? 'Open the week' : 'Plan this week', to: 'planning-week', primary: canManage && !!frozen && !wk.plan }, 'home-week')}
        {stage(<TodayRounded />, `Roster for ${dayText(h.tomorrow.date)}`, <PlanStatus status={h.tomorrow.status} />,
          h.tomorrow.status === 'published' ? 'Published — production sees it under Production › Roster.' : h.tomorrow.status === 'draft' ? 'Saved, not published to production yet.' : 'Tomorrow\'s work is suggested from today\'s reality. Arrange it and publish.',
          { label: 'Open the roster', to: 'planning-day', primary: canManage && !!wk.plan && h.tomorrow.status !== 'published' }, 'home-day')}
      </Box>
      <StatStrip stats={[
        { label: 'Frozen plan', value: Math.round(frozen?.tonnes ?? 0), display: frozen ? tonnesText(frozen.tonnes) : '—', hint: 'Tonnes of shipping units the frozen month plan finishes this month' },
        { label: 'Done so far', value: Math.round(h.doneTonnes), display: tonnesText(h.doneTonnes), tone: 'success' as const },
        { label: 'Forecast', value: Math.round(h.forecastTonnes ?? 0), display: h.forecastTonnes == null ? '—' : tonnesText(h.forecastTonnes), hint: 'Done plus what the latest week plan still finishes this month' },
        { label: 'Against the plan', value: Math.round(Math.abs(gap ?? 0)), display: gap == null ? '—' : `${gap >= 0 ? '+' : '−'}${tonnesText(Math.abs(gap))}`, tone: gap == null ? undefined : gap < -0.05 ? 'danger' as const : 'success' as const },
        { label: 'Alerts', value: h.alerts.length, tone: h.alerts.some((a) => a.severity === 'danger') ? 'danger' as const : h.alerts.length ? 'warning' as const : undefined },
      ]} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.1fr) minmax(0, 1fr)' }, gap: 2 }}>
        <SectionCard title="What changed against the plan" subtitle={h.alertSource ? `Compared with ${h.alertSource}.` : 'Alerts start once a month plan is frozen.'}>
          <AlertList alerts={h.alerts} onDismiss={canManage ? dismiss : undefined} onAct={canManage ? act : undefined} />
        </SectionCard>
        <SectionCard title="The month, week by week" subtitle="Frozen plan · week plan · done. Click a week to open it.">
          <WeekBars weeks={wk.weeks.map((w) => ({
            no: w.no, start: w.start, end: w.end, current: w.current,
            frozen: frozen?.weeks.find((x) => x.no === w.no)?.tonnes ?? null, planned: w.tonnesWeek, done: w.doneTonnes,
            onClick: () => navigate(`${to('planning-week')}?week=${w.start}`),
          }))} />
        </SectionCard>
      </Box>
    </Box>
  );
}
