import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Button, MenuItem, Stack, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import MoreTimeRounded from '@mui/icons-material/MoreTimeRounded';
import EventSeatRounded from '@mui/icons-material/EventSeatRounded';
import CurrencyRupeeRounded from '@mui/icons-material/CurrencyRupeeRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import {
  Callout, ErrorNotice, KpiGrid, KpiTile, PageHeader, SectionCard, StatSkeleton, useChartPalette, useCompanySlug,
} from '@shared/ui';
import { useCan } from '../access/can';
import { NoAccessNote } from '../access/Guard';
import { OrgUnitMultiSelect } from '../components/list/OrgUnitFilter';
import { useOrgUnitOptions } from '../components/orgUnits';
import { MonthPicker } from '../components/attendance/AttendanceParts';
import { thisMonth, dayLabel } from '../api/attendance';
import { dashboardApi, rupeesShort, shortMonth, type Dashboard as Dash } from '../api/dashboard';

/**
 * Home › Dashboard (CF_HRMS_HIRING_SPEC.md §42.1): headcount, absenteeism, overtime, manpower shortage and
 * payroll cost for the org units, month and shift chosen. Each tile is shown only with its right (the server
 * leaves the others out and says why), and each opens the list behind it. A department-scoped login sees its
 * own org units only.
 */

function usePhone() {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('sm'));
}

/** One bar per org unit (horizontal), the platform palette in order. */
function UnitBars({ rows, series, format }: {
  rows: { name: string }[];
  series: { label: string; data: (number | null)[] }[];
  format: (v: number) => string;
}) {
  const palette = useChartPalette();
  const phone = usePhone();
  if (!rows.length) return <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Nothing to show.</Typography>;
  const labels = rows.map((r) => (r.name.length > 26 ? `${r.name.slice(0, 25)}…` : r.name));
  return (
    <BarChart
      layout="horizontal"
      height={Math.max(120, rows.length * (series.length > 1 ? 34 : 28) + 40)}
      yAxis={[{ scaleType: 'band', data: labels, width: phone ? 96 : 150, tickLabelStyle: { fontSize: phone ? 10 : 11.5 } }]}
      xAxis={[{ valueFormatter: (v: number | null) => format(v ?? 0), tickLabelStyle: { fontSize: 10.5 } }]}
      series={series.map((s, i) => ({ data: s.data.map((v) => v ?? 0), label: s.label, color: palette[i % palette.length], valueFormatter: (v: number | null) => format(v ?? 0), stack: series.length > 1 ? 'all' : undefined }))}
      hideLegend={series.length < 2}
      borderRadius={3}
      margin={{ left: 4, right: 12, top: 8, bottom: 4 }}
      grid={{ vertical: true }}
    />
  );
}

/** "Open the list" — the screen behind a tile. */
function OpenList({ onClick, label = 'Open the list' }: { onClick: () => void; label?: string }) {
  return <Button size="small" endIcon={<ArrowForwardRounded />} onClick={onClick}>{label}</Button>;
}

function Hidden({ why }: { why?: string }) {
  return why ? <NoAccessNote>{why}</NoAccessNote> : null;
}

const pct = (v: number | null | undefined) => (v == null ? '—' : `${v}%`);
const num = (v: number) => v.toLocaleString('en-IN');

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, fontSize: 13, py: 0.25 }}>
      <Box sx={{ color: 'var(--c-text-2)', minWidth: 96 }}>{label}</Box>
      <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</Box>
    </Box>
  );
}

export default function Dashboard() {
  const can = useCan();
  const company = useCompanySlug();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const month = params.get('month') || thisMonth();
  const units = params.get('department') || '';
  const shift = params.get('shift') || '';
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace: true });
  };
  const unitOptions = useOrgUnitOptions(can.org.view || can.positions.view);
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => {
    setData(null);
    dashboardApi.get({ month, department: units || undefined, shift: shift || undefined }).then((d) => { setData(d); setError(null); }).catch(setError);
  }, [month, units, shift]);
  useEffect(load, [load]);
  const go = (path: string) => navigate(`/${company}/cf_hrms/${path}`);
  const withUnits = (path: string) => (units ? `${path}${path.includes('?') ? '&' : '?'}department=${units}` : path);

  const h = data?.headcount;
  const a = data?.absenteeism;
  const o = data?.overtime;
  const m = data?.manpower;
  const p = data?.payroll;
  const rows = useMemo(() => data?.breakdown ?? [], [data]);

  return (
    <Box data-page="dashboard">
      <PageHeader
        title="Dashboard"
        subtitle={data ? `${data.label}${data.on !== data.today ? ` · figures for the day ${dayLabel(data.on)}` : ' · today'}${data.scope === 'UNITS' ? ' · your org units only' : ''}` : 'Headcount, absence, overtime, manpower and pay — by org unit.'}
        actions={(
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <MonthPicker month={month} onChange={(v) => set({ month: v })} />
            {unitOptions.length > 0 && <OrgUnitMultiSelect value={units} onChange={(v) => set({ department: v })} options={unitOptions} />}
            <TextField select size="small" label="Shift" value={shift} onChange={(e) => set({ shift: e.target.value })} sx={{ minWidth: 140 }} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} data-field="dash-shift">
              <MenuItem value="">Every shift</MenuItem>
              {(data?.shifts ?? []).map((s) => <MenuItem key={s.id} value={String(s.id)}>{s.name}</MenuItem>)}
            </TextField>
          </Box>
        )}
      />
      <ErrorNotice error={error} onRetry={load} />
      {data && !data.live && a && <Callout title="Attendance is not live" sx={{ mb: 2 }}>Absence and overtime start once attendance is live (Attendance › Close month).</Callout>}
      {!data ? <StatSkeleton /> : (
        <Stack spacing={2.5}>
          <KpiGrid min={180}>
            {h && <KpiTile label="Headcount" display={num(h.total)} icon={<GroupsRounded />} spark={h.trend.map((t) => t.count)} onClick={() => go(withUnits(data.drill.headcount))}
              footer={`${h.joiners.length} joined · ${h.leavers.length} left in ${shortMonth(data.month)}`} />}
            {a && <KpiTile label={`Absent ${data.on === data.today ? 'today' : dayLabel(data.on)}`} display={pct(a.today.rate)} tone={(a.today.rate ?? 0) > 10 ? 'danger' : 'default'} icon={<EventBusyRounded />}
              spark={a.daily.map((d) => d.rate ?? 0)} onClick={() => go(`attendance?tab=today&date=${data.on}${units ? `&department=${units}` : ''}`)}
              footer={`${a.today.absent} absent · ${a.today.leave} on leave · ${a.today.notPunched} not punched`} />}
            {a && <KpiTile label="Absenteeism, month" display={pct(a.month.rate)} icon={<EventBusyRounded />} spark={a.trend.map((t) => t.rate ?? 0)}
              onClick={() => go(`attendance?tab=month&month=${data.month}${units ? `&department=${units}` : ''}`)} footer={`${a.month.absentDays} absent days`} />}
            {o && <KpiTile label="Overtime" display={`${num(o.month.hours)} h`} icon={<MoreTimeRounded />} spark={o.trend.map((t) => t.hours)}
              onClick={() => go(`attendance?tab=month&month=${data.month}${units ? `&department=${units}` : ''}`)} footer={o.costHidden ? 'Cost: needs access to pay' : `Cost ${o.cost == null ? '— no run yet' : rupeesShort(o.cost)}`} />}
            {m && <KpiTile label={`Short ${m.date === data.today ? 'today' : dayLabel(m.date)}`} display={num(m.totals.short)} tone={m.totals.short > 0 ? 'warning' : 'default'} icon={<EventSeatRounded />}
              onClick={() => go(withUnits(`manpower?date=${m.date}${shift ? `&shift=${shift}` : ''}`))} footer={`${m.totals.required} required · ${m.totals.filled} filled · ${m.totals.present ?? '—'} present`} />}
            {p && <KpiTile label="Payroll cost" display={rupeesShort(p.month.cost)} icon={<CurrencyRupeeRounded />} spark={p.trend.map((t) => t.cost ?? 0)}
              onClick={() => go(data.drill.payroll)} footer={p.run ? `${p.month.people} people · run ${p.run.status.toLowerCase()}` : `No ${shortMonth(data.month)} run yet`} />}
          </KpiGrid>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
            <SectionCard title="Headcount" subtitle={h ? `On ${dayLabel(data.on)}, by org unit (each with everything under it)` : undefined} actions={h ? <OpenList onClick={() => go(withUnits(data.drill.headcount))} /> : undefined}>
              {h ? (
                <Box data-tile="headcount">
                  <UnitBars rows={h.byUnit} series={[{ label: 'People', data: h.byUnit.map((x) => x.count) }]} format={(v) => num(v)} />
                  <Row label="By kind">{h.byKind.map((k) => `${k.kind} ${k.count}`).join(' · ') || '—'}</Row>
                  <Row label="By shift">{h.byShift.map((k) => `${k.name} ${k.count}`).join(' · ') || '—'}</Row>
                  <Row label="Top roles">{h.byRole.slice(0, 5).map((k) => `${k.title} ${k.count}`).join(' · ') || '—'}</Row>
                  <Row label="Joined">{h.joiners.length ? h.joiners.map((j) => `${j.name} (${dayLabel(j.date)})`).join(', ') : 'Nobody'}</Row>
                  <Row label="Left">{h.leavers.length ? h.leavers.map((j) => `${j.name} (${dayLabel(j.date)})`).join(', ') : 'Nobody'}</Row>
                </Box>
              ) : <Hidden why={data.hidden.headcount} />}
            </SectionCard>

            <SectionCard title="Absenteeism" subtitle={a ? 'Absent days ÷ (present + absent + leave), this month by org unit' : undefined}
              actions={a ? <OpenList label="The muster" onClick={() => go(`attendance?tab=month&month=${data.month}${units ? `&department=${units}` : ''}`)} /> : undefined}>
              {a ? (
                <Box data-tile="absenteeism">
                  <UnitBars rows={a.byUnit} series={[{ label: 'Absenteeism', data: a.byUnit.map((x) => x.rate) }]} format={(v) => `${v}%`} />
                  <Row label="The day">{`${a.today.present} in · ${a.today.absent} absent · ${a.today.leave} on leave · ${a.today.notPunched} not punched · ${a.today.off} off`}</Row>
                  <Row label="Six months">{a.trend.map((t) => `${shortMonth(t.month)} ${pct(t.rate)}`).join(' · ')}</Row>
                </Box>
              ) : <Hidden why={data.hidden.absenteeism} />}
            </SectionCard>

            <SectionCard title="Overtime" subtitle={o ? `Hours this month by org unit${o.costHidden ? '' : ', and the cost from the payroll run'}` : undefined}
              actions={o ? <OpenList label="The muster" onClick={() => go(`attendance?tab=month&month=${data.month}`)} /> : undefined}>
              {o ? (
                <Box data-tile="overtime">
                  <UnitBars rows={o.byUnit} series={[{ label: 'Hours', data: o.byUnit.map((x) => x.hours) }]} format={(v) => `${v} h`} />
                  <Row label="Six months">{o.trend.map((t) => `${shortMonth(t.month)} ${t.hours} h${t.cost != null ? ` (${rupeesShort(t.cost)})` : ''}`).join(' · ')}</Row>
                  {o.costHidden && <NoAccessNote>The cost needs access to pay.</NoAccessNote>}
                </Box>
              ) : <Hidden why={data.hidden.overtime} />}
            </SectionCard>

            <SectionCard title="Manpower" subtitle={m ? `On ${dayLabel(m.date)}: required, present and short (required − present − off)` : undefined}
              actions={m ? <OpenList label="Manpower report" onClick={() => go(withUnits(`manpower?date=${m.date}${shift ? `&shift=${shift}` : ''}`))} /> : undefined}>
              {m ? (
                <Box data-tile="manpower">
                  <UnitBars rows={m.byUnit} series={[{ label: 'Present', data: m.byUnit.map((x) => x.present ?? 0) }, { label: 'Short', data: m.byUnit.map((x) => x.short) }]} format={(v) => num(v)} />
                  <Row label="By shift">{m.byShift.map((s) => `${s.name}: ${s.required} req · ${s.short} short`).join(' · ') || '—'}</Row>
                  {!m.attendanceKnown && <NoAccessNote>Who came in is not known for this day: short = vacant.</NoAccessNote>}
                </Box>
              ) : <Hidden why={data.hidden.manpower} />}
            </SectionCard>

            <SectionCard title="Payroll cost" subtitle={p ? 'Gross + reimbursements + employer contributions of the run, by org unit' : undefined}
              actions={p ? <OpenList label={p.run ? 'Open the run' : 'Payroll runs'} onClick={() => go(data.drill.payroll)} /> : undefined}>
              {p ? (
                <Box data-tile="payroll">
                  {p.run ? <UnitBars rows={p.byUnit} series={[{ label: 'Cost', data: p.byUnit.map((x) => x.cost) }]} format={(v) => rupeesShort(v)} />
                    : <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>There is no {data.label} payroll run yet.</Typography>}
                  <Row label="Six months">{p.trend.map((t) => `${shortMonth(t.month)} ${t.cost == null ? '—' : rupeesShort(t.cost)}`).join(' · ')}</Row>
                </Box>
              ) : <Hidden why={data.hidden.payroll} />}
            </SectionCard>
          </Box>
          {rows.length === 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No org units in this selection.</Typography>}
        </Stack>
      )}
    </Box>
  );
}
