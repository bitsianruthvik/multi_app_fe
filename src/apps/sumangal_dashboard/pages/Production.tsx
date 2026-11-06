import { Stack } from '@mui/material';
import { SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { dateLabel, monthLabel, num, tonnes } from '../format';
import { Big, Grid, Lines, ReportTable, RowBars } from '../components/Charts';
import { Page } from '../components/Page';

interface Stage { stage: string; tonnes: number | null; kgPerDay: number | null; workDays: number; pieces: number }
interface Report {
  stages: Stage[]; months: { mo: string; injection: number | null; melting: number | null; inspection: number | null; dispatched: number | null }[];
  wip: { me: string; injected: number | null; poured: number | null; inspected: number | null }[]; now: { injected?: number | null; poured?: number | null; inspected?: number | null }; clearedNotShipped: number | null; asOf: string;
}
const short = (iso: string) => monthLabel(iso.slice(0, 7));

/** Kg through each stage, and how much sits between stages. */
export default function Production() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/production${f.query()}` : null);
  const cols: DataColumn<Stage>[] = [
    { key: 'stage', header: 'Stage', render: (r) => <b>{r.stage}</b> },
    { key: 'tonnes', header: 'Tonnes', numeric: true, align: 'right', sortValue: (r) => r.tonnes, render: (r) => tonnes(r.tonnes) },
    { key: 'perDay', header: 'Kg per working day', numeric: true, align: 'right', sortValue: (r) => r.kgPerDay, render: (r) => num(r.kgPerDay) },
    { key: 'days', header: 'Working days', numeric: true, align: 'right', sortValue: (r) => r.workDays, render: (r) => num(r.workDays) },
    { key: 'pieces', header: 'Pieces', numeric: true, align: 'right', sortValue: (r) => r.pieces, render: (r) => num(r.pieces) },
  ];
  return (
    <Page title="Production" question="How much goes through each stage, and how much sits between stages." filters={f} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote="Working days are the days a stage has entries in the ERP. Weights use the ERP’s raw casting weight. Material between stages is stage quantities subtracted, for batches started since April 2024, and is always shown up to the last data date.">
      {d && (
        <>
          <SectionCard title={`Between stages on ${dateLabel(d.asOf)}`}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={4} useFlexGap flexWrap="wrap">
              <Big value={tonnes(d.now.injected)} label="Injected, not poured" />
              <Big value={tonnes(d.now.poured)} label="Poured, not inspected" />
              <Big value={tonnes(d.now.inspected)} label="Inspected, not cleared" />
              <Big value={tonnes(d.clearedNotShipped)} label="Cleared, not shipped" help="Open lines where this is the largest pile" />
            </Stack>
          </SectionCard>
          <Grid>
            <SectionCard title="Kg per working day, by stage">
              <RowBars rows={d.stages.map((s) => ({ key: s.stage, label: s.stage, value: s.kgPerDay }))} format={(v) => `${num(v)} kg`} />
            </SectionCard>
            <Stack spacing={2.25}>
              <SectionCard title="Tonnes by month">
                <Lines labels={d.months.map((m) => monthLabel(m.mo))} format={(v) => `${v} t`} height={230} series={[{ label: 'Injection', data: d.months.map((m) => m.injection) }, { label: 'Melting', data: d.months.map((m) => m.melting) }, { label: 'Inspection', data: d.months.map((m) => m.inspection) }, { label: 'Dispatched', data: d.months.map((m) => m.dispatched) }]} />
              </SectionCard>
              <SectionCard title="Between stages over time" subtitle="Tonnes at month end">
                <Lines labels={d.wip.map((s) => short(s.me))} format={(v) => `${v} t`} height={230} series={[{ label: 'Injected, not poured', data: d.wip.map((s) => s.injected) }, { label: 'Poured, not inspected', data: d.wip.map((s) => s.poured) }, { label: 'Inspected, not cleared', data: d.wip.map((s) => s.inspected) }]} />
              </SectionCard>
            </Stack>
          </Grid>
          <SectionCard title="All stages" flush><ReportTable rows={d.stages} columns={cols} getRowId={(r) => r.stage} bare pageSize={15} /></SectionCard>
        </>
      )}
    </Page>
  );
}
