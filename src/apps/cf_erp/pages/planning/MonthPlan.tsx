import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Checkbox, Collapse, IconButton, MenuItem, Slider, TextField, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import AutoFixHighRounded from '@mui/icons-material/AutoFixHighRounded';
import SendRounded from '@mui/icons-material/SendRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import {
  getMonthPlan, getPlanContractors, runMonthPlan, sendMonthPlan, withdrawMonthPlan, monthText, tonnesText, dayText,
  type AreaMachines, type MachineOption, type MonthResult, type PlanUnit,
} from '../../api/planning';
import { CfApiError } from '../../api/client';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { useUrlParam } from '../../hooks/useUrlState';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { appPath } from '../../navMeta';
import { PlanGantt } from '../../components/Planning/PlanGantt';
import { Badge, ErrorNotice, InfoTip, ListSkeleton, Mono, PageHeader, SectionCard, StatStrip } from '../../components/ui';
import { DataTable, type DataColumn } from '../../components/DataTable';
import { FacetChip } from '../../components/FilterBar';
import { FormDialog } from '../../components/FormDialog';
import { ContractorTable, Fold, Headline, PivotTable, PlanStatus, StepGuide, WeekBars } from '../../components/Planning/parts';
import { useToast } from '../../components/toastContext';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };
const monthsAround = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return [-2, -1, 0, 1].map((d) => { const t = new Date(Date.UTC(y, mo - 1 + d, 1)); return t.toISOString().slice(0, 7); });
};
const WHY: Record<string, string> = { material: 'Material', capacity: 'Machine hours', work: 'More work than days', horizon: 'Beyond the plan' };

/**
 * PLANNING › MONTH PLAN (§105): the planner's three choices on the left — the orders in priority order, how far an
 * order may slip for tonnes, the machines in the plan (fabrication machines, by area) — and the optimised plan on the
 * right: tonnes by week, the load, every shipping unit, the orders × operations pivot, and how more machines would add
 * tonnes. Optimise, save the draft, send it to the MD; approved = frozen.
 */
export default function MonthPlan() {
  const company = useCompanySlug();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_production_manage');
  const [monthParam, setMonthParam] = useUrlParam('month', '');
  const [tab, setTab] = useUrlParam('view', 'gantt');
  const screen = useLoad(() => getMonthPlan(monthParam || undefined), [monthParam]);
  const contractors = useLoad(() => getPlanContractors(), []);
  const s = screen.data;
  // The working choices (start from the stored plan's; a run replaces the result).
  const [ranks, setRanks] = useState<number[]>([]);
  const [machineIds, setMachineIds] = useState<number[]>([]);
  const [tolerance, setTolerance] = useState(3);
  const [result, setResult] = useState<MonthResult | null>(null);
  const [areas, setAreas] = useState<AreaMachines[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | 'run' | 'save' | 'send'>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [openArea, setOpenArea] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => {
    if (!s) return;
    setRanks(s.result.orders.map((o) => o.id)); setMachineIds(s.inputs.machineIds); setTolerance(s.inputs.toleranceDays);
    setResult(s.result); setAreas(s.areas); setDirty(s.fresh);
  }, [s]);
  const inPlan = useMemo(() => new Set(machineIds), [machineIds]);
  if (screen.error) return <ErrorNotice error={screen.error} onRetry={screen.reload} />;
  if (!s || !result) return <ListSkeleton rows={8} />;
  const month = s.month;
  const status = s.plan?.status ?? null;
  const locked = status === 'pending' || !canManage;
  const frozenShown = status === 'frozen' && !dirty;

  const run = async (save: boolean) => {
    setBusy(save ? 'save' : 'run'); setError(null);
    try {
      const r = await runMonthPlan({ month, machineIds, ranks, toleranceDays: tolerance, save });
      setResult(r.result); setAreas(r.areas); setMachineIds(r.inputs.machineIds);
      if (save) { toast.success(`Saved as the draft — ${tonnesText(r.result.tonnes)} this month.`); setDirty(false); screen.reload(); invalidateNavCounts(); } else setDirty(true);
    } catch (e) { setError(e as CfApiError); } finally { setBusy(null); }
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= ranks.length || from === to) return;
    const next = ranks.slice(); const [x] = next.splice(from, 1); next.splice(to, 0, x); setRanks(next); setDirty(true);
  };
  const toggle = (ids: number[], on: boolean) => { const set = new Set(machineIds); for (const id of ids) { if (on) set.add(id); else set.delete(id); } setMachineIds([...set]); setDirty(true); };
  const take = (o: MachineOption) => { setMachineIds([...new Set([...machineIds, ...o.machineIds])]); setDirty(true); toast.info('Added to the plan — optimise again to see it.'); };
  const orderOf = new Map(result.orders.map((o) => [o.id, o]));

  const unitCols: DataColumn<PlanUnit>[] = [
    { key: 'unit', header: 'Shipping unit', alwaysVisible: true, sortValue: (u) => u.code, render: (u) => <Box><Mono>{u.code}</Mono>{u.name && u.name !== u.code ? <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', ml: 0.75 }}>{u.name}</Typography> : null}</Box> },
    { key: 'order', header: 'Order', sortValue: (u) => u.order, render: (u) => <Box component={Link} to={appPath(company, `orders/${u.orderId}`)} sx={linkSx}>{u.order}</Box> },
    { key: 'tonnes', header: 'Tonnes', numeric: true, sortValue: (u) => u.tonnes, render: (u) => <Mono>{u.tonnes}</Mono> },
    { key: 'start', header: 'Starts', sortValue: (u) => u.start, render: (u) => dayText(u.start) },
    { key: 'finish', header: 'Finishes', sortValue: (u) => u.finish ?? '9999', render: (u) => (u.finish ? dayText(u.finish) : 'beyond the plan') },
    { key: 'in', header: 'This month', sortValue: (u) => (u.inMonth ? 0 : 1), render: (u) => (u.inMonth ? <Badge family="success" noIcon label={`Week ${u.week}`} /> : <Badge family="warning" noIcon label="Not this month" />) },
    { key: 'why', header: 'Why not', render: (u) => (u.reason ? <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{WHY[u.reason.kind]}{u.reason.fnName ? ` · ${u.reason.fnName}` : ''}</Typography> : '') },
    { key: 'material', header: 'Material', sortValue: (u) => u.materialDate ?? '', render: (u) => (u.materialDate ? <Typography sx={{ fontSize: 12.5, color: u.materialAssumed ? 'var(--c-warning-700)' : undefined }}>{dayText(u.materialDate)}{u.materialAssumed ? ' (assumed)' : ''}</Typography> : <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>in stock</Typography>) },
  ];

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      <PageHeader title={<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>Month plan <PlanStatus status={dirty && status !== 'pending' ? 'draft' : status} />
        {s.plan && <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>v{s.plan.version}</Typography>}</Box>}
        subtitle={status === 'pending' ? 'With the MD. It is frozen once approved; withdraw it to change it.' : frozenShown ? `Frozen${s.plan?.frozenAt ? ` on ${dayText(String(s.plan.frozenAt).slice(0, 10))}` : ''}. Change a choice and optimise to draft a new version.` : 'Rank the orders, choose the machines, optimise — then send it to the MD to freeze it.'}
        actions={(
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField select size="small" value={month} onChange={(e) => setMonthParam(e.target.value)} sx={{ minWidth: 170 }} inputProps={{ 'aria-label': 'Month' }}>
              {[...new Set([...monthsAround(s.today.slice(0, 7)), month])].sort().map((m) => <MenuItem key={m} value={m}>{monthText(m)}</MenuItem>)}
            </TextField>
            {canManage && status !== 'pending' && <Button variant={dirty ? 'contained' : 'outlined'} startIcon={<AutoFixHighRounded />} disabled={!!busy} onClick={() => void run(false)} data-testid="month-optimise">{busy === 'run' ? 'Optimising…' : 'Optimise'}</Button>}
            {canManage && status !== 'pending' && dirty && <Button variant="outlined" disabled={!!busy} onClick={() => void run(true)} data-testid="month-save">{busy === 'save' ? 'Saving…' : 'Save draft'}</Button>}
            {canManage && status === 'draft' && !dirty && s.plan && <Button variant="contained" startIcon={<SendRounded />} onClick={() => { setNote(''); setSending(true); }} data-testid="month-send">Send to the MD</Button>}
            {canManage && status === 'pending' && s.plan && <Button variant="outlined" onClick={async () => { try { await withdrawMonthPlan(s.plan!.id); toast.success('Taken back — it is a draft again.'); screen.reload(); } catch (e) { toast.error((e as Error).message); } }}>Withdraw</Button>}
          </Box>
        )} />
      <ErrorNotice error={error} />
      {s.plan?.note && status === 'draft' && <Typography sx={{ fontSize: 13, color: 'var(--c-warning-800)', background: 'var(--c-warning-50)', border: '1px solid var(--c-warning-200)', borderRadius: 'var(--r-sm)', p: 1.25 }}>{s.plan.note}</Typography>}
      <StepGuide steps={['Rank the orders, pick the machines', 'Optimise and save', 'Send to the MD', 'Frozen']}
        current={status === 'frozen' && !dirty ? 3 : status === 'pending' ? 2 : dirty ? 1 : status === 'draft' ? 2 : 0}
        hint={status === 'frozen' && !dirty ? 'This plan is frozen. The week plans and the alerts compare against it. Change a choice below to draft a new version.'
          : status === 'pending' ? 'Waiting for the MD. Nothing can change until it is approved or you withdraw it.'
            : dirty ? <>Press <b>Optimise</b> to see the plan your choices give, then <b>Save draft</b>.</>
              : status === 'draft' ? <>The draft is saved. Press <b>Send to the MD</b> to have it frozen.</> : 'Start by checking the order of priority.'} />
      <Headline testId="month-headline" main={<>{tonnesText(result.tonnes)} finishes in {monthText(month)}</>}
        sub={<>{result.tonnes - result.priorityTonnes > 0.05 ? <><b>{tonnesText(result.tonnes - result.priorityTonnes)} more</b> than working strictly in priority order. </> : 'The same as working strictly in priority order. '}
          {result.notInMonth > 0 ? `${result.notInMonth} shipping unit${result.notInMonth === 1 ? '' : 's'} finish after the month${result.boundBy ? ` — ${result.boundBy} is what holds it back` : ''}. ` : 'Everything finishes inside the month. '}
          {result.assumedMaterial > 0 ? `${result.assumedMaterial} unit${result.assumedMaterial === 1 ? ' has' : 's have'} no material date yet (assumed two weeks out).` : ''}</>} />
      <StatStrip stats={[
        { label: 'Finishes this month', value: Math.round(result.tonnes), display: tonnesText(result.tonnes), tone: 'primary' as const, hint: 'Tonnes of shipping units whose last work ends by the month\'s last day' },
        { label: 'By priority alone', value: Math.round(result.priorityTonnes), display: tonnesText(result.priorityTonnes), hint: 'What working the orders strictly in priority order would finish — the optimiser\'s gain is the difference' },
        { label: 'Best possible', value: Math.round(result.boundTonnes), display: tonnesText(result.boundTonnes), hint: `No plan can finish more than this${result.boundBy ? ` — ${result.boundBy} is the limit` : ''}. The plan is within ${result.gapPct} % of it.` },
        { label: 'Not this month', value: result.notInMonth, tone: result.notInMonth ? 'warning' as const : undefined, hint: 'Shipping units the plan finishes after the month' },
        { label: 'Material assumed', value: result.assumedMaterial, tone: result.assumedMaterial ? 'warning' as const : undefined, hint: 'Units whose material has no date yet — assumed two weeks after the plan starts' },
      ]} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(300px, 380px) minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
        {/* ── The planner's choices ── */}
        <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <SectionCard title={<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>Orders, most important first<InfoTip text="Drag an order up or down (or use the arrows). The optimiser works for tonnes but may not finish an order later than it would finish in this order, plus the slip you allow below." /></Box>}>
            <Box data-testid="month-ranks" sx={{ display: 'grid', gap: 0.5 }}>
              {ranks.map((id, i) => {
                const o = orderOf.get(id);
                if (!o) return null;
                return (
                  <Box key={id} draggable={!locked} onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag != null) move(drag, i); setDrag(null); }}
                    sx={{ display: 'grid', gridTemplateColumns: '20px 22px minmax(0, 1fr) auto', gap: 0.75, alignItems: 'center', p: '6px 8px', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', background: drag === i ? 'var(--c-primary-50)' : 'var(--c-surface, #fff)', cursor: locked ? 'default' : 'grab' }}>
                    <DragIndicatorRounded sx={{ fontSize: 16, color: 'var(--c-text-3)' }} />
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</Typography>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 500 }}><Box component={Link} to={appPath(company, `orders/${o.id}`)} sx={linkSx}>{o.code}</Box> <Box component="span" sx={{ color: 'var(--c-text-3)', fontWeight: 400 }}>{o.customer ?? ''}</Box></Typography>
                      <Typography noWrap sx={{ fontSize: 12, color: o.late ? 'var(--c-danger-700)' : 'var(--c-text-2)' }}>
                        {tonnesText(o.tonnesInMonth)} of {tonnesText(o.tonnes)} this month · finishes {o.finish ? dayText(o.finish) : 'beyond the plan'}{o.committedDate ? ` · due ${dayText(o.committedDate)}` : ''}
                      </Typography>
                    </Box>
                    {!locked && (
                      <Box sx={{ display: 'flex' }}>
                        <IconButton size="small" aria-label={`Move ${o.code} up`} disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUpwardRounded sx={{ fontSize: 16 }} /></IconButton>
                        <IconButton size="small" aria-label={`Move ${o.code} down`} disabled={i === ranks.length - 1} onClick={() => move(i, i + 1)}><ArrowDownwardRounded sx={{ fontSize: 16 }} /></IconButton>
                      </Box>
                    )}
                  </Box>
                );
              })}
              {!ranks.length && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No production order is in Planning or Released yet. Send production orders to planning from an order's Production setup.</Typography>}
            </Box>
          </SectionCard>

          <Fold testId="month-fold-machines-slip" title="Slip allowed for tonnes" summary={tolerance === 0 ? 'None — strict priority' : `An order may finish up to ${tolerance} day${tolerance === 1 ? '' : 's'} later when that adds tonnes`}>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1 }}>How many days later than its priority-order finish an order may end, when that lets the month finish more tonnes. 0 = strict priority.</Typography>
            <Box sx={{ px: 1 }}>
              <Slider value={tolerance} min={0} max={30} step={1} disabled={locked} valueLabelDisplay="auto" marks={[{ value: 0, label: '0' }, { value: 7, label: '7' }, { value: 15, label: '15' }, { value: 30, label: '30 days' }]}
                onChange={(_, v) => { setTolerance(v as number); setDirty(true); }} aria-label="Days an order may slip" data-testid="month-tolerance" />
            </Box>
          </Fold>

          <Fold testId="month-fold-machines" title="Machines in the plan" summary={`${machineIds.length} of ${areas.reduce((t, a) => t + a.total, 0)} fabrication machines${areas.some((a) => a.on < a.total) ? ' — some are switched off and can be added' : ''}`}>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1 }}>Only fabrication machines are listed (machines an operation can run on — not electrical panels, utilities or vehicles). Machines switched on are in the plan; tick others to add their shift hours.</Typography>
            <Box data-testid="month-machines" sx={{ display: 'grid', gap: 0.5 }}>
              {areas.map((a) => {
                const ids = a.machines.map((m) => m.id);
                const n = ids.filter((id) => inPlan.has(id)).length;
                const open = openArea === a.area;
                return (
                  <Box key={a.area} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)' }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto auto', alignItems: 'center', gap: 0.5, p: '2px 6px' }}>
                      <Checkbox size="small" disabled={locked} checked={n === ids.length && n > 0} indeterminate={n > 0 && n < ids.length} onChange={(e) => toggle(ids, e.target.checked)} slotProps={{ input: { 'aria-label': `All ${a.area} machines` } }} />
                      <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{a.area}</Typography>
                      <Typography sx={{ fontSize: 12.5, color: n < a.total ? 'var(--c-primary-700)' : 'var(--c-text-2)', fontVariantNumeric: 'tabular-nums' }}>{n} of {a.total}</Typography>
                      <IconButton size="small" aria-label={`${open ? 'Hide' : 'Show'} ${a.area} machines`} onClick={() => setOpenArea(open ? null : a.area)}><ExpandMoreRounded sx={{ fontSize: 18, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} /></IconButton>
                    </Box>
                    <Collapse in={open} unmountOnExit>
                      <Box sx={{ maxHeight: 260, overflowY: 'auto', borderTop: '1px solid var(--c-divider)', p: '4px 6px' }}>
                        {!locked && a.on < a.total && <Button size="small" onClick={() => toggle(a.machines.filter((m) => m.on).map((m) => m.id), true)} sx={{ mb: 0.5 }}>Only those switched on ({a.on})</Button>}
                        {a.machines.map((m) => (
                          <Box key={m.id} component="label" sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', gap: 0.5, cursor: locked ? 'default' : 'pointer' }}>
                            <Checkbox size="small" disabled={locked} checked={inPlan.has(m.id)} onChange={(e) => toggle([m.id], e.target.checked)} />
                            <Typography noWrap sx={{ fontSize: 13 }}><Mono>{m.code}</Mono> {m.name} <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 12 }}>· {m.typeName}{!m.on ? ' · not switched on' : ''}{m.contractor ? ` · with ${m.contractor.name}` : ''}</Box></Typography>
                            <Typography sx={{ fontSize: 12, color: m.hours ? 'var(--c-text-2)' : 'var(--c-warning-700)', fontVariantNumeric: 'tabular-nums' }}>{m.hours ? `${m.hours} h` : 'no shifts'}</Typography>
                          </Box>
                        ))}
                      </Box>
                    </Collapse>
                  </Box>
                );
              })}
            </Box>
          </Fold>

          <Fold testId="month-fold-contractors" title="Contractors" summary={contractors.data ? (contractors.data.contractors.length ? `${contractors.data.contractors.length} with work orders` : 'No work given out yet') : 'Loading…'}>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1 }}>Work given to contractors is planned without the plant's machine hours. Give steps of a production order to a vendor in <Box component={Link} to={appPath(company, 'planning-vendors')} sx={{ color: 'inherit', fontWeight: 600 }}>Planning › Vendors</Box>.</Typography>
            {contractors.data ? <ContractorTable contractors={contractors.data.contractors} /> : null}
          </Fold>
        </Box>

        {/* ── The plan ── */}
        <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
          {dirty && status !== 'pending' && canManage && (
            <Typography data-testid="month-dirty" sx={{ fontSize: 13, color: 'var(--c-primary-800, #1e40af)', background: 'var(--c-primary-50)', border: '1px solid var(--c-primary-200, #bfdbfe)', borderRadius: 'var(--r-sm)', p: 1.25 }}>
              {s.fresh && !s.plan ? 'This is a first run from the defaults — nothing is saved yet.' : 'Your choices changed.'} <b>Optimise</b> to see the plan, <b>Save draft</b> to keep it.
            </Typography>
          )}
          {(result.suggestions?.options.length ?? 0) > 0 && (
            <SectionCard title={<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>More machines, more tonnes<InfoTip text="Machines that are available but not in the plan, tried one by one and together: how many more tonnes the month would finish with each. The best first." /></Box>}>
              <Box data-testid="month-suggestions" sx={{ display: 'grid', gap: 0.75 }}>
                {result.suggestions!.options.map((o, i) => (
                  <Box key={o.key} sx={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', gap: 1, alignItems: 'center', p: '6px 10px', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', background: i === 0 ? 'var(--c-success-50, #f0fdf4)' : undefined }}>
                    <Typography sx={{ fontWeight: 700, color: 'var(--c-success-700)', fontVariantNumeric: 'tabular-nums' }}>+{Math.round(o.gain * 10) / 10} t</Typography>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 13.5 }}>{o.label}</Typography>
                      <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{tonnesText(o.tonnes)} this month{i === 0 ? ' — the most' : ''}</Typography>
                    </Box>
                    {!locked && <Button size="small" startIcon={<AddRounded />} onClick={() => take(o)}>Add</Button>}
                  </Box>
                ))}
                {(result.suggestions!.noSpare.length > 0) && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>No spare machine for: {result.suggestions!.noSpare.join(', ')} — these would need buying, a contractor or another shift.</Typography>}
              </Box>
            </SectionCard>
          )}
          <SectionCard flush title="The plan"
            actions={(
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {[['gantt', 'Gantt'], ['weeks', 'By week'], ['load', 'Machine load'], ['units', `Shipping units (${result.units.length})`], ['pivot', 'Orders × operations']].map(([k, l]) => <FacetChip key={k} label={l} active={tab === k} onClick={() => setTab(k)} />)}
              </Box>
            )}>
            {/* §110 (2026-11-14): the plan as a Gantt — orders, their units, each unit's own steps — with load and finish charts. */}
            {tab === 'gantt' && <PlanGantt units={result.units} orders={result.orders} from={result.from} to={result.last} today={s.today} title={`What the plan does, ${monthText(month)}`} />}
            {tab === 'weeks' && (
              <Box sx={{ p: 2, display: 'grid', gap: 2 }}>
                <WeekBars weeks={result.weeks.map((w) => ({ no: w.no, start: w.start, end: w.end, planned: w.tonnes, current: s.today >= w.start && s.today <= w.end }))} />
                <Box sx={{ overflowX: 'auto' }}>
                  <Box component="table" sx={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: 13 }} data-testid="month-orders-weeks">
                    <thead><tr>
                      <Box component="th" sx={{ textAlign: 'left', p: '6px 8px', fontSize: 12, color: 'var(--c-text-2)' }}>Order</Box>
                      {result.weeks.map((w) => <Box component="th" key={w.no} sx={{ textAlign: 'right', p: '6px 8px', fontSize: 12, color: 'var(--c-text-2)' }}>W{w.no}</Box>)}
                      <Box component="th" sx={{ textAlign: 'right', p: '6px 8px', fontSize: 12, color: 'var(--c-text-2)' }}>Month</Box>
                      <Box component="th" sx={{ textAlign: 'right', p: '6px 8px', fontSize: 12, color: 'var(--c-text-2)' }}>Of</Box>
                      <Box component="th" sx={{ textAlign: 'left', p: '6px 8px', fontSize: 12, color: 'var(--c-text-2)' }}>Finishes</Box>
                    </tr></thead>
                    <tbody>
                      {result.orders.map((o) => (
                        <Box component="tr" key={o.id} sx={{ borderTop: '1px solid var(--c-divider)' }}>
                          <Box component="td" sx={{ p: '6px 8px', whiteSpace: 'nowrap' }}><Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', mr: 0.75 }}>{o.rank}</Typography><Box component={Link} to={appPath(company, `orders/${o.id}`)} sx={linkSx}><Mono>{o.code}</Mono></Box></Box>
                          {o.byWeek.map((t, i) => <Box component="td" key={i} sx={{ p: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: t ? undefined : 'var(--c-text-3)' }}>{t ? Math.round(t * 10) / 10 : '·'}</Box>)}
                          <Box component="td" sx={{ p: '6px 8px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{Math.round(o.tonnesInMonth * 10) / 10}</Box>
                          <Box component="td" sx={{ p: '6px 8px', textAlign: 'right', color: 'var(--c-text-2)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(o.tonnes * 10) / 10}</Box>
                          <Box component="td" sx={{ p: '6px 8px', color: o.late ? 'var(--c-danger-700)' : undefined, whiteSpace: 'nowrap' }}>{o.finish ? dayText(o.finish) : 'beyond'}{o.late ? ` · due ${dayText(o.committedDate)}` : ''}</Box>
                        </Box>
                      ))}
                    </tbody>
                  </Box>
                </Box>
              </Box>
            )}
            {tab === 'load' && (
              <Box sx={{ p: 2, display: 'grid', gap: 1 }} data-testid="month-load">
                {result.load.map((l) => (
                  <Box key={l.fn} sx={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 240px) minmax(0, 1fr) 120px', gap: 1.5, alignItems: 'center' }}>
                    <Box sx={{ minWidth: 0 }}><Typography noWrap sx={{ fontSize: 13.5 }}>{l.name}</Typography><Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{l.area ?? ''} · {l.machines} machine{l.machines === 1 ? '' : 's'}</Typography></Box>
                    <Tooltip title={l.byWeek.map((w, i) => `W${i + 1}: ${w.hours} of ${w.capacityHours} h`).join(' · ')}>
                      <Box sx={{ height: 10, borderRadius: 5, background: 'var(--c-divider)', overflow: 'hidden' }}>
                        <Box sx={{ width: `${Math.min(100, l.usedPct)}%`, height: '100%', background: l.usedPct >= 95 ? 'var(--c-danger-500)' : l.usedPct >= 75 ? 'var(--c-warning-500)' : 'var(--c-primary-500)' }} />
                      </Box>
                    </Tooltip>
                    <Typography sx={{ fontSize: 12.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: l.usedPct >= 95 ? 'var(--c-danger-700)' : 'var(--c-text-2)' }}>{l.hours} of {l.capacityHours} h · {l.capacityHours ? `${l.usedPct} %` : 'no hours'}</Typography>
                  </Box>
                ))}
                {!result.load.length && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No work in the plan yet.</Typography>}
              </Box>
            )}
            {tab === 'units' && <DataTable bare rows={result.units} columns={unitCols} getRowId={(u) => u.key} storageKey="month-plan-units" exportName={`month-plan-${month}`} defaultSortKey="finish"
              empty={<Typography sx={{ color: 'var(--c-text-3)', p: 2, fontSize: 13 }}>Nothing to plan — no production order is in Planning or Released.</Typography>} />}
            {tab === 'pivot' && <PivotTable pivot={result.pivot} tonnesLabel="This month" />}
          </SectionCard>
        </Box>
      </Box>

      <FormDialog open={sending} onClose={() => setSending(false)} title={`Send the ${monthText(month)} plan to the MD`} submitLabel="Send"
        subtitle={`${tonnesText(result.tonnes)} this month across ${result.orders.length} orders. It is frozen once the MD approves; the week plans and the alerts then compare against it.`}
        onSubmit={async () => { await sendMonthPlan(s.plan!.id, note.trim() || undefined); toast.success('Sent to the MD.'); invalidateNavCounts(); screen.reload(); }}>
        <TextField autoFocus fullWidth multiline minRows={2} label="Note for the MD (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </FormDialog>
    </Box>
  );
}
