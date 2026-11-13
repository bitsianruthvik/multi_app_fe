import { useEffect, useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import AutoFixHighRounded from '@mui/icons-material/AutoFixHighRounded';
import CampaignRounded from '@mui/icons-material/CampaignRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import {
  closeWeekPlan, getWeekPlan, publishWeekPlan, raiseConsumableMr, runWeekPlan, setWeekNotes, dayText, tonnesText, type WeekScreen,
} from '../../api/planning';
import { CfApiError } from '../../api/client';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { useUrlParam } from '../../hooks/useUrlState';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { appPath } from '../../navMeta';
import { Badge, EmptyState, ErrorNotice, InfoTip, ListSkeleton, Mono, PageHeader, SectionCard, StatStrip } from '../../components/ui';
import { FacetChip } from '../../components/FilterBar';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ContractorTable, PivotTable, PlanStatus, ReasonList, WeekBars } from '../../components/Planning/parts';
import { useToast } from '../../components/toastContext';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/**
 * PLANNING › WEEK PLAN (§105): the month planned again from this week's reality — still for the month's tonnes. The
 * plan (orders × operations, what finishes, the load by day), the plan against what happened, what went right and
 * wrong (with why), what moved against the frozen month plan, the contractors and the consumables. Publish = the MD is
 * told; close = the week is history.
 */
export default function WeekPlan() {
  const company = useCompanySlug();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_production_manage');
  const [weekParam, setWeekParam] = useUrlParam('week', '');
  const [tab, setTab] = useUrlParam('view', '');
  const screen = useLoad(() => getWeekPlan(weekParam ? { week: weekParam } : {}), [weekParam]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [closing, setClosing] = useState(false);
  const [notes, setNotes] = useState('');
  const s = screen.data;
  useEffect(() => { setNotes(s?.plan?.review?.notes ?? ''); }, [s?.plan?.id, s?.plan?.review?.notes]);
  if (screen.error) return <ErrorNotice error={screen.error} onRetry={screen.reload} />;
  if (!s) return <ListSkeleton rows={8} />;
  const p = s.plan; const a = s.actual; const r = p?.result ?? null;
  const started = s.week.start <= s.today;
  const view = tab || (p?.status === 'closed' ? 'review' : started && a ? 'actual' : 'plan');
  const act = async (name: string, fn: () => Promise<WeekScreen>, done: string) => {
    setBusy(name); setError(null);
    try { screen.setData(await fn()); toast.success(done); invalidateNavCounts(); } catch (e) { setError(e as CfApiError); } finally { setBusy(null); }
  };
  const short = (r?.consumables ?? []).filter((c) => c.short > 0.0005);

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      <PageHeader title={<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>Week {s.week.no} · {dayText(s.week.start)} – {dayText(s.week.end)} <PlanStatus status={p?.status ?? null} /></Box>}
        subtitle={p ? (p.status === 'draft' ? 'A draft from today\'s reality. Publish it and it is the plan in force — the MD is told.' : p.status === 'published' ? `Published${p.publishedAt ? ` ${dayText(String(p.publishedAt).slice(0, 10))}` : ''}. Close the week when it ends; plan it again if reality moves.` : 'Closed — what happened is kept beside what was planned.')
          : 'No plan for this week yet.'}
        actions={canManage && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {p?.status !== 'closed' && <Button variant={p ? 'outlined' : 'contained'} startIcon={<AutoFixHighRounded />} disabled={!!busy || !s.frozen} onClick={() => void act('run', () => runWeekPlan({ weekStart: s.week.start }), 'Planned from today\'s reality.')} data-testid="week-run">{busy === 'run' ? 'Planning…' : p ? 'Plan again' : 'Plan this week'}</Button>}
            {p?.status === 'draft' && <Button variant="contained" startIcon={<CampaignRounded />} disabled={!!busy} onClick={() => void act('publish', () => publishWeekPlan(p.id), 'Published — the MD is told.')} data-testid="week-publish">Publish</Button>}
            {p?.status === 'published' && started && <Button variant="outlined" startIcon={<LockRounded />} disabled={!!busy} onClick={() => setClosing(true)} data-testid="week-close">Close the week</Button>}
          </Box>
        )} />
      <ErrorNotice error={error} />
      {!s.frozen && <Typography sx={{ fontSize: 13, color: 'var(--c-warning-800)', background: 'var(--c-warning-50)', border: '1px solid var(--c-warning-200)', borderRadius: 'var(--r-sm)', p: 1.25 }}>
        This month has no frozen plan yet. <Box component={Link} to={appPath(company, 'planning-month')} sx={{ color: 'inherit', fontWeight: 600 }}>Make the month plan</Box> and have the MD freeze it — the week plans come out of it.</Typography>}
      <SectionCard>
        <WeekBars weeks={s.weeks.map((w) => ({ no: w.no, start: w.start, end: w.end, current: w.current, active: w.start === s.week.start, planned: w.tonnesWeek, done: w.doneTonnes ?? (w.start === s.week.start && a ? a.doneTonnes : null), onClick: () => setWeekParam(w.start) }))} height={84} />
      </SectionCard>
      {!p ? (
        <EmptyState title={`Week ${s.week.no} is not planned yet`} hint={s.frozen ? 'Plan it from today\'s reality: what is done, the machines as they are, the material dates as they stand.' : undefined} />
      ) : (
        <>
          <StatStrip stats={[
            { label: 'Planned this week', value: Math.round(p.tonnesWeek ?? 0), display: tonnesText(p.tonnesWeek), tone: 'primary' as const },
            { label: 'Done', value: Math.round(a?.doneTonnes ?? 0), display: a ? tonnesText(a.doneTonnes) : '—', tone: 'success' as const, hint: a ? `${tonnesText(a.donePlannedTonnes)} of the planned units, ${tonnesText(a.extraTonnes)} ahead of plan` : undefined },
            { label: 'Month forecast', value: Math.round(p.tonnesMonth ?? 0), display: tonnesText(p.tonnesMonth), hint: 'Done since the plan was frozen, plus what this plan still finishes in the month' },
            { label: 'Frozen month plan', value: Math.round(s.frozen?.tonnes ?? 0), display: tonnesText(s.frozen?.tonnes), hint: s.frozenWeekTonnes != null ? `It had ${tonnesText(s.frozenWeekTonnes)} for this week` : undefined },
            { label: 'Against the frozen plan', value: Math.round(Math.abs((p.tonnesMonth ?? 0) - (s.frozen?.tonnes ?? 0))), display: s.frozen && p.tonnesMonth != null ? `${p.tonnesMonth - s.frozen.tonnes >= 0 ? '+' : '−'}${tonnesText(Math.abs(p.tonnesMonth - s.frozen.tonnes))}` : '—', tone: s.frozen && p.tonnesMonth != null && p.tonnesMonth - s.frozen.tonnes < -0.05 ? 'danger' as const : 'success' as const },
          ]} />
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {[['plan', 'The plan'], ['actual', 'Plan vs progress'], ['review', 'What went right and wrong'], ['changes', 'Against the month plan'], ['resources', 'Contractors and consumables']].map(([k, l]) => <FacetChip key={k} label={l} active={view === k} onClick={() => setTab(k)} />)}
          </Box>

          {view === 'plan' && r && (
            <Box sx={{ display: 'grid', gap: 2 }}>
              <SectionCard flush title={<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>Orders × operations<InfoTip text="Hours of work this week per order and operation (machine type), and the tonnes each order finishes in the week. This is what the MD sees." /></Box>}>
                <PivotTable pivot={r.pivot} tonnesLabel="Finishes" />
              </SectionCard>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                <SectionCard title={`Finishing this week (${r.finishing.length})`}>
                  {r.finishing.length ? r.finishing.map((u) => (
                    <Box key={u.key} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 1.5, py: 0.5, borderTop: '1px solid var(--c-divider)', fontSize: 13 }}>
                      <Box sx={{ minWidth: 0 }}><Mono>{u.code}</Mono> <Box component={Link} to={appPath(company, `orders/${u.orderId}`)} sx={{ ...linkSx, color: 'var(--c-text-2)' }}>{u.order}</Box></Box>
                      <Mono>{tonnesText(u.tonnes)}</Mono><span>{dayText(u.finish)}</span>
                    </Box>
                  )) : <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No shipping unit finishes this week — the work feeds later weeks.</Typography>}
                </SectionCard>
                <SectionCard title="Load by day (hours)">
                  <Box sx={{ overflowX: 'auto' }}>
                    <Box component="table" sx={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: 12.5 }}>
                      <thead><tr><Box component="th" sx={{ textAlign: 'left', p: '4px 6px', color: 'var(--c-text-2)' }}>Operation</Box>
                        {[...new Set(r.load.flatMap((l) => Object.keys(l.byDay)))].sort().map((d) => <Box component="th" key={d} sx={{ textAlign: 'right', p: '4px 6px', color: 'var(--c-text-2)' }}>{dayText(d)}</Box>)}</tr></thead>
                      <tbody>{r.load.map((l) => (
                        <Box component="tr" key={l.fn} sx={{ borderTop: '1px solid var(--c-divider)' }}>
                          <Box component="td" sx={{ p: '4px 6px', whiteSpace: 'nowrap' }}>{l.name}</Box>
                          {[...new Set(r.load.flatMap((x) => Object.keys(x.byDay)))].sort().map((d) => <Box component="td" key={d} sx={{ textAlign: 'right', p: '4px 6px', fontVariantNumeric: 'tabular-nums', color: l.byDay[d] ? undefined : 'var(--c-text-3)' }}>{l.byDay[d] ? Math.round(l.byDay[d]) : '·'}</Box>)}
                        </Box>
                      ))}</tbody>
                    </Box>
                  </Box>
                </SectionCard>
              </Box>
            </Box>
          )}

          {view === 'actual' && (a ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
              <SectionCard title="Shipping units: planned and done" subtitle={`As of ${dayText(a.asOf)}`}>
                {a.units.map((u) => (
                  <Box key={u.key} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 70px 110px', gap: 1, py: 0.6, borderTop: '1px solid var(--c-divider)', alignItems: 'center', fontSize: 13 }}>
                    <Box sx={{ minWidth: 0 }}><Mono>{u.code}</Mono> <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{u.order}</Box></Box>
                    <Mono>{tonnesText(u.tonnes)}</Mono>
                    {u.done ? <Badge family="success" noIcon label="Done" /> : u.gone ? <Badge family="neutral" noIcon label="Changed" /> : (
                      <Box title={`${Math.round((u.progress ?? 0) * 100)} % done`} sx={{ height: 8, borderRadius: 4, background: 'var(--c-divider)', overflow: 'hidden' }}><Box sx={{ width: `${Math.round((u.progress ?? 0) * 100)}%`, height: '100%', background: 'var(--c-warning-500)' }} /></Box>
                    )}
                  </Box>
                ))}
                {a.extra.map((u) => (
                  <Box key={u.key} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 70px 110px', gap: 1, py: 0.6, borderTop: '1px solid var(--c-divider)', alignItems: 'center', fontSize: 13 }}>
                    <Box sx={{ minWidth: 0 }}><Mono>{u.code}</Mono> <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{u.order}</Box></Box>
                    <Mono>{tonnesText(u.tonnes)}</Mono><Badge family="info" noIcon label="Ahead of plan" />
                  </Box>
                ))}
                {!a.units.length && !a.extra.length && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Nothing was planned to finish this week.</Typography>}
              </SectionCard>
              <SectionCard title="Hours: planned, run, stopped">
                {a.load.map((l) => {
                  const max = Math.max(l.plannedHours, l.runHours + l.stopHours, 1);
                  return (
                    <Box key={l.fn} sx={{ py: 0.75, borderTop: '1px solid var(--c-divider)' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{l.name}</span><Box component="span" sx={{ color: 'var(--c-text-2)', fontVariantNumeric: 'tabular-nums' }}>{l.runHours} of {l.plannedHours} h{l.stopHours ? ` · ${l.stopHours} h stopped` : ''}</Box></Box>
                      <Box sx={{ position: 'relative', height: 8, mt: 0.5, borderRadius: 4, background: 'var(--c-divider)' }}>
                        <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(l.plannedHours / max) * 100}%`, border: '1px solid var(--c-primary-400, #60a5fa)', borderRadius: 4 }} />
                        <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(l.runHours / max) * 100}%`, background: 'var(--c-success-500)', borderRadius: 4 }} />
                        <Box sx={{ position: 'absolute', left: `${(l.runHours / max) * 100}%`, top: 0, bottom: 0, width: `${(l.stopHours / max) * 100}%`, background: 'var(--c-danger-400, #f87171)', borderRadius: 4 }} />
                      </Box>
                    </Box>
                  );
                })}
                {!a.load.length && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No machine hours were planned this week.</Typography>}
                {a.stops.length > 0 && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 1 }}>Stops: {a.stops.slice(0, 6).map((x) => `${x.code} ${x.hours} h${x.reason ? ` (${x.reason})` : ''}`).join(' · ')}</Typography>}
              </SectionCard>
            </Box>
          ) : <EmptyState title="The week has not started" hint="Progress shows here from its first day." />)}

          {view === 'review' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
              <SectionCard title="What went right"><ReasonList rows={p.review?.right ?? a?.right ?? []} tone="good" empty="Nothing to show yet." /></SectionCard>
              <SectionCard title="What went wrong, and why"><ReasonList rows={p.review?.wrong ?? a?.wrong ?? []} tone="bad" empty="Nothing went wrong against the plan." /></SectionCard>
              <Box sx={{ gridColumn: '1 / -1' }}>
                <SectionCard title="The planner's notes" actions={canManage && <Button size="small" disabled={notes === (p.review?.notes ?? '')} onClick={() => void act('notes', () => setWeekNotes(p.id, notes), 'Notes saved.')}>Save notes</Button>}>
                  <TextField fullWidth multiline minRows={3} placeholder="What should be done differently next week?" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canManage} inputProps={{ 'data-testid': 'week-notes' }} />
                </SectionCard>
              </Box>
            </Box>
          )}

          {view === 'changes' && r && (
            <SectionCard title="Against the frozen month plan" subtitle={r.against ? `${tonnesText(r.against.outTonnes)} left the month, ${tonnesText(r.against.inTonnes)} came in.` : 'No frozen plan to compare with.'}>
              {r.against && (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>No longer this month</Typography>
                    {r.against.out.length ? r.against.out.map((u) => <Typography key={u.key} sx={{ fontSize: 13, py: 0.25 }}><Mono>{u.code}</Mono> <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{u.order} · {tonnesText(u.tonnes)} · was {dayText(u.was)}, now {u.now ? dayText(u.now) : 'beyond the plan'}</Box></Typography>) : <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>None.</Typography>}
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>Now this month</Typography>
                    {r.against.into.length ? r.against.into.map((u) => <Typography key={u.key} sx={{ fontSize: 13, py: 0.25 }}><Mono>{u.code}</Mono> <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{u.order} · {tonnesText(u.tonnes)} · now {dayText(u.now)}</Box></Typography>) : <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>None.</Typography>}
                  </Box>
                </Box>
              )}
              {(r.suggestions?.options.length ?? 0) > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>More machines would add</Typography>
                  {r.suggestions!.options.map((o) => <Typography key={o.key} sx={{ fontSize: 13, py: 0.25 }}><Box component="span" sx={{ color: 'var(--c-success-700)', fontWeight: 600 }}>+{Math.round(o.gain * 10) / 10} t</Box> · {o.label}</Typography>)}
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5 }}>Add machines on the <Box component={Link} to={appPath(company, 'planning-month')} sx={{ color: 'inherit', fontWeight: 600 }}>month plan</Box>; the next week plan uses them.</Typography>
                </Box>
              )}
            </SectionCard>
          )}

          {view === 'resources' && r && (
            <Box sx={{ display: 'grid', gap: 2 }}>
              <SectionCard title="Contractors" actions={<Button size="small" component={Link} to={appPath(company, 'production-orders')}>Change work orders</Button>}>
                <ContractorTable contractors={(a?.contractors ?? r.contractors.contractors)} workOrders={a?.workOrders ?? r.contractors.orders} />
              </SectionCard>
              <SectionCard title={<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>Consumables this week<InfoTip text="What the week's run hours use up (set per operation), against what Stores has and what is on order. Raise an MR for what is short — it carries the day it is needed by." /></Box>}
                actions={canManage && short.length > 0 && <Button size="small" variant="contained" onClick={async () => {
                  try { const x = await raiseConsumableMr({ month: r.month, items: short.map((c) => ({ itemId: c.itemId, qty: c.short, needBy: c.needBy })) }); toast.success(`${x.requisition.code} went to Stores${x.needBy ? ` — needed by ${dayText(x.needBy)}` : ''}.`); } catch (e) { toast.error((e as Error).message); }
                }} data-testid="week-consumable-mr">Raise an MR for what is short</Button>}>
                {r.consumables.length ? r.consumables.map((c) => (
                  <Box key={c.itemId} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) repeat(4, 90px)', gap: 1, py: 0.5, borderTop: '1px solid var(--c-divider)', fontSize: 13, alignItems: 'baseline' }}>
                    <Box sx={{ minWidth: 0 }}><Mono>{c.code}</Mono> {c.name}{c.needBy ? <Box component="span" sx={{ color: 'var(--c-text-3)' }}> · from {dayText(c.needBy)}</Box> : null}</Box>
                    <Box sx={{ textAlign: 'right' }}>needs {c.need}</Box><Box sx={{ textAlign: 'right' }}>stock {c.inStock}</Box><Box sx={{ textAlign: 'right' }}>on order {c.onOrder}</Box>
                    <Box sx={{ textAlign: 'right', color: c.short > 0 ? 'var(--c-danger-700)' : 'var(--c-success-700)', fontWeight: 600 }}>{c.short > 0 ? `short ${c.short}` : 'enough'}</Box>
                  </Box>
                )) : <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No operation has consumables set yet. Once an operation says what it uses per run hour, the plan shows what Stores must have and by when.</Typography>}
              </SectionCard>
            </Box>
          )}
        </>
      )}
      <ConfirmDialog open={closing} title={`Close week ${s.week.no}?`} confirmLabel="Close the week"
        body="What happened is kept beside the plan — done, hours, stops, why. A closed week is not planned again. Then plan the next week from that day's reality."
        onClose={() => setClosing(false)} onConfirm={async () => { screen.setData(await closeWeekPlan(p!.id, notes.trim() || undefined)); toast.success('Week closed.'); setTab('review'); }} />
    </Box>
  );
}
