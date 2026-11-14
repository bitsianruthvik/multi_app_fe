import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import ScaleRounded from '@mui/icons-material/ScaleRounded';
import SpeedRounded from '@mui/icons-material/SpeedRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import RecyclingRounded from '@mui/icons-material/RecyclingRounded';
import { KpiGrid, KpiTile, SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters, type Filters } from '../filters';
import { dayCount, monthLabel, num, pct, tonnes } from '../format';
import { Bars, Big, Grid, ReportTable, RowBars } from '../components/Charts';
import { Page } from '../components/Page';

interface Part { die: number; name: string; tonnes: number | null; pieces: number; rejectedKg: number; rejectionPct: number | null }
interface Wait { key: number; part: string; customer: string; pieces: number; kg: number; days: number | null; due: string | null }
interface Report {
  stage: string; previous: string | null; kpis: { tonnes: number | null; pieces: number; workDays: number; kgPerDay: number | null; rejectedKg: number; rejectionPct: number | null; gapDays: number | null; gapSlow: number | null };
  months: { mo: string; tonnes: number | null; kgPerDay: number | null; rejectionPct: number | null; gapDays: number | null }[]; parts: Part[]; reasons: { reason: string; kg: number; pieces: number }[]; metals: { label: string; tonnes: number | null }[];
  breaks: { dim: string; rows: { label: string; tonnes: number | null; pieces: number }[] }[];
  waiting: { label: string; tonnes: number | null; lines: number; bands: { label: string; tonnes: number | null; lines: number }[] | null; rows: Wait[] } | null;
}

const text = (v: string, w: number) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: w }} title={v}>{v}</Typography>;

/** One production step: its output, what's waiting for it, how long it takes to arrive, and what it rejects. */
export default function Step({ slug, title, question, extra }: { slug: string; title: string; question: string; extra?: (f: Filters) => ReactNode }) {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/step/${slug}${f.query()}` : null);
  const partCols: DataColumn<Part>[] = [
    { key: 'name', header: 'Part', sortValue: (r) => r.name, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 600, maxWidth: 340 }} title={r.name}>{r.name}</Typography> },
    { key: 'tonnes', header: 'Tonnes', numeric: true, align: 'right', sortValue: (r) => r.tonnes, render: (r) => r.tonnes ?? '—' },
    { key: 'pieces', header: 'Pieces', numeric: true, align: 'right', sortValue: (r) => r.pieces, render: (r) => num(r.pieces) },
    ...(slug === 'dispatch' || slug === 'heat-treatment' ? [] : [
      { key: 'rej', header: 'Rejected kg here', numeric: true, align: 'right', sortValue: (r) => r.rejectedKg, render: (r) => num(r.rejectedKg) } as DataColumn<Part>,
      { key: 'pct', header: 'Rejected %', numeric: true, align: 'right', sortValue: (r) => r.rejectionPct, render: (r) => pct(r.rejectionPct, 1) } as DataColumn<Part>,
    ]),
  ];
  const waitCols: DataColumn<Wait>[] = [
    { key: 'part', header: 'Part', sortValue: (r) => r.part, render: (r) => text(r.part, 300) },
    { key: 'customer', header: 'Customer', sortValue: (r) => r.customer, render: (r) => text(r.customer, 200) },
    { key: 'pieces', header: 'Pieces', numeric: true, align: 'right', sortValue: (r) => r.pieces, render: (r) => num(r.pieces) },
    { key: 'kg', header: 'Kg', numeric: true, align: 'right', sortValue: (r) => r.kg, render: (r) => num(r.kg) },
    ...(d?.waiting?.bands ? [{ key: 'days', header: 'Days waiting', numeric: true, align: 'right', sortValue: (r) => r.days, render: (r) => r.days ?? '—' } as DataColumn<Wait>] : []),
  ];
  const hasRejects = slug !== 'dispatch' && slug !== 'heat-treatment';
  return (
    <Page title={title} question={question} filters={f} filterKeys={['finish', 'metal']} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote={d?.previous ? `${slug === 'heat-treatment' ? 'A casting can be treated more than once, so output can exceed metal poured. ' : ''}Days from ${d.previous.toLowerCase()} run from the first entry there to the first entry here, per batch line. Waiting is pieces passed on by the step before and not yet entered here, for batches started since April 2024, always as of the last data date.` : undefined}>
      {d && (
        <>
          <KpiGrid>
            <KpiTile label="Output" info="Tonnes through this step in the selected date range, by the ERP’s raw casting weight. Pieces are shown under the figure."icon={<ScaleRounded />} display={tonnes(d.kpis.tonnes)} footer={`${num(d.kpis.pieces)} pieces`} />
            <KpiTile label="Kg per working day" info="Kilograms through this step in the selected date range, divided by its working days in the same range. Working days are days with entries at this step; for Dispatched they are days with dispatches."icon={<SpeedRounded />} display={num(d.kpis.kgPerDay)} footer={`${num(d.kpis.workDays)} working days`} />
            {d.previous && <KpiTile label={`Days from ${d.previous.toLowerCase()}`} info="Median days from the previous step to this step, per batch line, for batches entered in the selected date range. The footer gives the 90th percentile: 10% of batch lines take longer than that."icon={<ScheduleRounded />} display={dayCount(d.kpis.gapDays)} footer={`Median. 90th percentile ${dayCount(d.kpis.gapSlow)}`} />}
            {hasRejects && <KpiTile label="Rejected here" info="Rejected weight recorded at this step in the selected date range (rejected pieces times raw casting weight), as a percentage of the kg through this step. The footer gives the rejected kg."icon={<RecyclingRounded />} display={pct(d.kpis.rejectionPct, 2)} footer={`${num(d.kpis.rejectedKg)} kg`} />}
          </KpiGrid>
          {d.waiting && (
            <SectionCard title={`Waiting here now: ${d.waiting.label.toLowerCase()}`} flush info="Weight waiting for this step as of the last data date. For Dispatched it is open order lines that are cleared and not shipped, at their pending quantity; for other steps it is pieces the step before passed on that this step has not yet entered. Where bands are shown, they split the tonnes by days waiting.">
              <Box sx={{ p: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                  <Box sx={{ flexShrink: 0, minWidth: 160 }}><Big value={tonnes(d.waiting.tonnes)} label={`${num(d.waiting.lines)} ${d.waiting.bands ? 'batch lines' : 'order lines'}`} /></Box>
                  {d.waiting.bands && <Box sx={{ flex: 1, minWidth: 0 }}><RowBars rows={d.waiting.bands.map((b) => ({ key: b.label, label: b.label, value: b.tonnes, sub: `${num(b.lines)} batch lines` }))} format={(v) => `${v} t`} /></Box>}
                </Stack>
              </Box>
              <ReportTable rows={d.waiting.rows} columns={waitCols} getRowId={(r) => r.key} bare pageSize={8} defaultSortKey="kg" defaultSortDir="desc" empty="Nothing waiting." />
            </SectionCard>
          )}
          <Grid>
            <SectionCard title="Tonnes by month" info="Tonnes through this step in each month of the selected date range."><Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.tonnes)} format={(v) => `${v} t`} height={230} /></SectionCard>
            {d.previous
              ? <SectionCard title={`Median days from ${d.previous.toLowerCase()}, by month`} info="Median days from the previous step to this step for batch lines in each month of the selected date range."><Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.gapDays)} format={(v) => `${v}d`} height={230} /></SectionCard>
              : <SectionCard title="Kg per working day, by month" info="Kilograms through this step per working day in each month of the selected date range."><Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.kgPerDay)} format={(v) => num(v)} height={230} /></SectionCard>}
          </Grid>
          {d.breaks.length > 0 && <Box sx={{ display: 'grid', gap: 2.25, gridTemplateColumns: { xs: 'minmax(0,1fr)', md: `repeat(${Math.min(2, d.breaks.length)}, minmax(0,1fr))` } }}>
            {d.breaks.map((b) => <SectionCard key={b.dim} title={b.dim === 'Where' ? 'Where it was treated' : `By ${b.dim.toLowerCase()}`} info="Tonnes through this step in the selected date range for the 10 largest values of the grouping named in the title, with pieces under each."><RowBars rows={b.rows.map((r) => ({ key: r.label, label: r.label, value: r.tonnes, sub: `${num(r.pieces)} pieces` }))} format={(v) => `${num(v)} t`} /></SectionCard>)}
          </Box>}
          {hasRejects && d.reasons.length > 0 && (
            <Grid>
              <SectionCard title="Rejection reasons here" info="Rejected weight at this step by reason in the selected date range, largest first (top 8). Pieces are shown under each reason."><RowBars rows={d.reasons.map((r) => ({ key: r.reason, label: r.reason, value: r.kg, sub: `${num(r.pieces)} pieces` }))} format={(v) => `${num(v)} kg`} /></SectionCard>
              <SectionCard title="Rejected here, by month" subtitle="Rejected kg over kg entering this step" info="This step’s rejected kg as a percentage of the kg through this step in each month of the selected date range, using the same definitions as Rejected here."><Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.rejectionPct)} format={(v) => `${v}%`} height={250} /></SectionCard>
            </Grid>
          )}
          <SectionCard title="Parts through this step" subtitle="Largest first" flush info="Each part’s tonnes and pieces through this step in the selected date range, largest first (up to 25 parts). Rejected kg and rejected % are this step’s rejections for that part; hidden for Dispatched and Heat treatment."><ReportTable rows={d.parts} columns={partCols} getRowId={(r) => r.die} bare pageSize={10} defaultSortKey="tonnes" defaultSortDir="desc" empty="Nothing for these filters." /></SectionCard>
          {extra?.(f)}
        </>
      )}
    </Page>
  );
}
