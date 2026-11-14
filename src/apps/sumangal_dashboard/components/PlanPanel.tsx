import { Box, Stack, Typography } from '@mui/material';
import { ErrorNotice, ListSkeleton, SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import type { Filters } from '../filters';
import { dayCount, num, pct } from '../format';
import { Big, Grid, ReportTable, RowBars } from './Charts';

interface Finish { finish: string; lines: number; plannedPct: number | null; pouredPct: number | null; shippedPct: number | null; pourHit: number | null; inspHit: number | null }
interface Report {
  stage: { label: string; pcs: number; pct: number | null }[]; milestones: { label: string; lines: number; hitPct: number | null; medianDays: number | null }[]; buffer: number | null;
  byFinish: Finish[]; machining: { lines: number; planned: number; actual: number }; lines: number;
}

export function PlanPanel({ filters: f }: { filters: Filters }) {
  const { data: d, error, reload } = useReport<Report>(f.ready ? `/plan${f.query()}` : null);
  const cols: DataColumn<Finish>[] = [
    { key: 'finish', header: 'Finish code', sortValue: (r) => r.finish, render: (r) => <b>{r.finish}</b> },
    { key: 'lines', header: 'Lines', numeric: true, align: 'right', sortValue: (r) => r.lines, render: (r) => num(r.lines) },
    { key: 'planned', header: 'Planned vs ordered', numeric: true, align: 'right', sortValue: (r) => r.plannedPct, render: (r) => pct(r.plannedPct) },
    { key: 'poured', header: 'Poured vs ordered', numeric: true, align: 'right', sortValue: (r) => r.pouredPct, render: (r) => pct(r.pouredPct) },
    { key: 'shipped', header: 'Shipped vs ordered', numeric: true, align: 'right', sortValue: (r) => r.shippedPct, render: (r) => pct(r.shippedPct) },
    { key: 'pourHit', header: 'Last pour by casting date', numeric: true, align: 'right', sortValue: (r) => r.pourHit, render: (r) => pct(r.pourHit) },
    { key: 'inspHit', header: 'Last inspection by casting date', numeric: true, align: 'right', sortValue: (r) => r.inspHit, render: (r) => pct(r.inspHit) },
  ];
  if (error) return <ErrorNotice error={error} onRetry={reload} />;
  if (!d) return <ListSkeleton rows={6} />;
  return (
    <>
          <SectionCard title="Against the work order’s casting date" subtitle="Lines reaching each step by the casting delivery date on the work order" info="Share of order lines whose last pour, first inspection and last inspection happened by the casting delivery date on the work order. Lines count if their casting date is in the period and on or before the last data date. The small line gives the median days before or after that date, and the gap is the median days from casting date to customer delivery date.">
            <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}>
              {d.milestones.map((m) => <Big key={m.label} value={pct(m.hitPct)} label={m.label} help={m.medianDays == null ? undefined : m.medianDays <= 0 ? `Median ${Math.abs(m.medianDays)} days before the date` : `Median ${m.medianDays} days after the date`} />)}
            </Box>
            {d.buffer != null && <Typography sx={{ mt: 2, fontSize: 13, color: 'var(--c-text-2)' }}>Median gap from casting date to customer delivery date: {dayCount(d.buffer)}.</Typography>}
          </SectionCard>
          <Grid>
            <SectionCard title="Quantity, order to shipment" subtitle={`${num(d.lines)} shipped lines. Ordered = 100%.`} info="For order lines fully shipped in the period, the pieces at each stage (ordered, planned, poured, passed inspection, shipped) as a percent of the ordered pieces.">
              <RowBars rows={d.stage.map((s) => ({ key: s.label, label: s.label, value: s.pct, sub: `${num(s.pcs)} pieces` }))} format={(v) => `${v.toFixed(0)}%`} />
            </SectionCard>
            <SectionCard title="Machining order dates" subtitle="Fields filled in on machining order lines" info="Machining order lines, counted by whether a planned date is filled in and whether an actual date is also filled in. Counted across all machining order lines, not limited to the selected period or filters.">
              <Stack direction="row" spacing={3}>
                <Big value={num(d.machining.lines)} label="Lines" />
                <Big value={num(d.machining.planned)} label="With a planned date" />
                <Big value={num(d.machining.actual)} label="Also with an actual date" />
              </Stack>
            </SectionCard>
          </Grid>
          <SectionCard title="By finish code" flush info="For each finish code, the order lines fully shipped in the period, with planned, poured and shipped pieces as a percent of ordered pieces. The last two columns give the share of those lines whose last pour and last inspection met the casting delivery date."><ReportTable rows={d.byFinish} columns={cols} getRowId={(r) => r.finish} bare pageSize={10} defaultSortKey="lines" defaultSortDir="desc" empty="Nothing for these filters." /></SectionCard>
    </>
  );
}
