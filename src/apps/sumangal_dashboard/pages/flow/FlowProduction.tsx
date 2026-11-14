import { useState } from 'react';
import { Box, MenuItem, Select, ToggleButton, ToggleButtonGroup, Typography, type SelectChangeEvent } from '@mui/material';
import { KpiGrid, KpiTile, SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../../api';
import { useFilters } from '../../filters';
import { dateLabel, monthLabel } from '../../format';
import { Lines, ReportTable } from '../../components/Charts';
import { StackedBars } from '../../components/FlowParts';
import { fmtDays, fmtN, fmtT } from '../../components/flowFormat';
import { Page } from '../../components/Page';

type Mode = 'asis' | 'historic';
type Gran = 'day' | 'week' | 'month' | 'year';

const STAGES = ['Not injected', 'Injected, not poured', 'Poured, not inspected', 'Inspected, not shipped'];
const GRANS: { value: Gran; label: string }[] = [
  { value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' },
];

interface AsisReport {
  asOf: string;
  lastDay: string | null;
  wip: { stage: string; units: number; tonnes: number; buckets: Record<string, number | null> }[];
  work: { stage: string; todayKg: number | null; avg90Kg: number | null; vsAvgPct: number | null }[];
  ageBuckets: string[];
}
interface HistoricReport {
  asOf: string; from: string; to: string; g: Gran; stages: string[];
  avgWip: Record<string, number | null>;
  avgAge: Record<string, number | null>;
  timeline: { date: string; tonnes: Record<string, number | null> }[];
  stage: string;
  aging: { date: string; buckets: Record<string, number | null> }[];
  ageBuckets: string[];
}
type WorkRow = AsisReport['work'][number];

const sumOf = (xs: (number | null | undefined)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
const fmtKg = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString('en-IN'));

const WORK_COLS: DataColumn<WorkRow>[] = [
  { key: 'stage', header: 'Step', render: (r) => <b>{r.stage}</b>, sortValue: (r) => r.stage },
  { key: 'today', header: 'Today (kg)', numeric: true, align: 'right', sortValue: (r) => r.todayKg, render: (r) => fmtKg(r.todayKg) },
  { key: 'avg', header: '90-day average per working day (kg)', numeric: true, align: 'right', sortValue: (r) => r.avg90Kg, render: (r) => fmtKg(r.avg90Kg) },
  {
    key: 'vs', header: 'vs average (%)', numeric: true, align: 'right', sortValue: (r) => r.vsAvgPct,
    render: (r) => (r.vsAvgPct == null ? '—' : `${r.vsAvgPct > 0 ? '+' : ''}${r.vsAvgPct}%`),
  },
];

const ASIS_NOTE = 'Work in progress is the pieces the ERP records between stages on open order lines, shown as tonnes. Waiting time is days since the stage began, from the line’s dates. Inspected, not shipped joins ‘Inspected, not cleared’ and ‘Cleared, not shipped’. Today is the last working day in the data; the benchmark is the average per working day over the 90 days before it.';
const HIST_NOTE = 'Each order line’s whole weight is counted in the stage it was in on that day, from its order, injection, pour and inspection dates; shipped lines are left out after shipment. Averages are over the month ends in the chosen dates. Waiting time is the weighted average days since entering the stage.';

function AsisBody({ d }: { d: AsisReport }) {
  const totalT = sumOf(d.wip.map((s) => s.tonnes));
  const units = sumOf(d.wip.map((s) => s.units));
  const over60 = sumOf(d.wip.map((s) => s.buckets['Over 60 days']));
  const share = totalT ? (over60 / totalT) * 100 : null;
  const todayT = sumOf(d.work.map((s) => s.todayKg)) / 1000;
  const avgT = sumOf(d.work.map((s) => s.avg90Kg)) / 1000;

  return (
    <>
      <KpiGrid>
        <KpiTile label="WIP, tonnes" display={fmtT(totalT)} info="Tonnes of pieces the ERP records between stages on open order lines: not injected, injected but not poured, poured but not inspected, and inspected but not shipped. Pieces are converted to tonnes using each line’s weight per piece. Shipped and closed lines are left out; the filters apply, the date range does not." />
        <KpiTile label="WIP, pieces" display={fmtN(units)} info="Number of pieces the ERP records between the same four steps as the tonnes figure, on open order lines. Counted as pieces, not weight. Shipped and closed lines are left out." />
        <KpiTile label="Waiting over 60 days" display={share == null ? '—' : `${share.toFixed(0)}%`} info="Share of the work-in-progress tonnes that has waited more than 60 days in its current step, counted from the day that step began. Piles with no date count in the total but not in this share." />
        <KpiTile label="Today’s work" display={fmtT(todayT)} info="Tonnes that went through the work steps on the last working day in the data, summed across each step’s kilograms. Today is the last day with entries in the ERP. The filters apply." />
        <KpiTile label="Average 90-day work" display={fmtT(avgT)} info="Tonnes a working day through the work steps, averaged over the 90 days before the last data day and summed across steps. Each step’s average is its kilograms divided by the days it had entries. This is the benchmark for today’s work." />
      </KpiGrid>

      <SectionCard title="Work in progress by step and how long it has waited" info="Tonnes of work in progress at each of the four steps, split by how many days each pile has been in that step: 0 to 7, 8 to 30, 31 to 60, over 60 days, and no date. Days run from the day the step began to the last data date. Shipped lines are left out.">
        <StackedBars labels={d.wip.map((s) => s.stage)} series={d.ageBuckets.map((b) => ({ label: b, data: d.wip.map((s) => s.buckets[b] ?? 0) }))} format={fmtT} height={280} />
      </SectionCard>

      <SectionCard flush title="Today against the 90-day average" info="Each work step’s kilograms on the last working day, against its average per working day over the 90 days before it. The percentage shows how far today is above or below that average; it does not say whether that is good or bad. Steps with no work in either window are left out.">
        <Box sx={{ px: 2, pt: 1.5 }}>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Today is {dateLabel(d.lastDay)}.</Typography>
        </Box>
        <ReportTable rows={d.work} columns={WORK_COLS} getRowId={(r) => r.stage} bare pageSize={15} />
      </SectionCard>
    </>
  );
}

interface HistoricBodyProps {
  d: HistoricReport;
  setG: (g: Gran) => void;
  stage: string;
  setStage: (s: string) => void;
}

function HistoricBody({ d, setG, stage, setStage }: HistoricBodyProps) {
  const dateAxis = (iso: string) => (d.g === 'month' ? monthLabel(iso.slice(0, 7)) : d.g === 'year' ? iso.slice(0, 4) : dateLabel(iso));

  return (
    <>
      <KpiGrid>
        {STAGES.map((s) => (
          <KpiTile key={`wip-${s}`} label={`Average WIP, ${s}`} display={fmtT(d.avgWip[s])} info={`Average tonnes of work in progress at the step “${s}”, across the month ends in the chosen dates. Each month end counts each open line’s whole weight in the step it was in on that day.`} />
        ))}
        {STAGES.map((s) => (
          <KpiTile key={`age-${s}`} label={`Average wait, ${s}`} display={fmtDays(d.avgAge[s])} info={`Weighted average days since pieces entered the step “${s}”, across the month ends in the chosen dates. Each line is weighted by its tonnes, and the month ends are then averaged.`} />
        ))}
      </KpiGrid>

      <SectionCard
        title="Work in progress over time, by step"
        actions={
          <ToggleButtonGroup size="small" exclusive value={d.g} onChange={(_, v: Gran | null) => { if (v) setG(v); }}>
            {GRANS.map((o) => (
              <ToggleButton key={o.value} value={o.value} sx={{ textTransform: 'none', px: 1.25, py: 0.25, fontSize: 12 }}>{o.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        }
        info="Tonnes of work in progress at each step on each date in the chosen range, stepping by the chosen granularity. Each line’s whole weight is counted in the step it was in on that day. Shipped lines are left out after shipment, and the filters apply."
      >
        <Lines
          labels={d.timeline.map((p) => dateAxis(p.date))}
          format={fmtT}
          height={300}
          series={STAGES.map((s) => ({ label: s, data: d.timeline.map((p) => p.tonnes[s] ?? null) }))}
        />
      </SectionCard>

      <SectionCard
        title="How long each pile has waited, by month"
        actions={
          <Select size="small" value={stage} onChange={(e: SelectChangeEvent<string>) => setStage(e.target.value)} sx={{ minWidth: 200, fontSize: 13 }}>
            {STAGES.map((s) => <MenuItem key={s} value={s} sx={{ fontSize: 13 }}>{s}</MenuItem>)}
          </Select>
        }
        info="Tonnes sitting in the selected step on each month end, split by how many days they had been there: 0 to 7, 8 to 30, 31 to 60, over 60 days, and no date. Choose the step with the selector above the chart."
      >
        <StackedBars
          labels={d.aging.map((p) => monthLabel(p.date.slice(0, 7)))}
          series={d.ageBuckets.map((b) => ({ label: b, data: d.aging.map((p) => p.buckets[b] ?? 0) }))}
          format={fmtT}
          height={280}
        />
      </SectionCard>
    </>
  );
}

/** Production as it stands now, or over a chosen range of dates. */
export default function FlowProduction({ mode }: { mode: Mode }) {
  const f = useFilters();
  const historic = mode === 'historic';
  const [g, setG] = useState<Gran>('month');
  const [stage, setStage] = useState<string>(STAGES[1]);
  const extra: Record<string, string> = historic ? { mode, g, stage } : { mode };
  const { data: d, error, loading, reload } = useReport<AsisReport | HistoricReport>(f.ready ? `/flow/production${f.query(extra)}` : null);

  return (
    <Page
      title={historic ? 'Production · Historic' : 'Production · As-is'}
      question={historic
        ? 'Average work in progress and waiting time across the chosen dates, and how each step’s work in progress moved over time.'
        : 'Work in progress across the production steps now, how long each pile has been waiting, and today’s work against the last 90 days.'}
      filters={f}
      filterKeys={['finish', 'metal', 'market', 'customer']}
      period={historic}
      loading={loading}
      error={error}
      reload={reload}
      hasData={!!d}
      footnote={historic ? HIST_NOTE : ASIS_NOTE}
    >
      {d && !historic && 'wip' in d && <AsisBody d={d} />}
      {d && historic && 'timeline' in d && <HistoricBody d={d} setG={setG} stage={stage} setStage={setStage} />}
    </Page>
  );
}
