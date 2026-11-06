import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { ErrorNotice, ListSkeleton, SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import type { Filters } from '../filters';
import { dateLabel, monthLabel } from '../format';
import { Bars, Grid, ReportTable } from './Charts';

interface Late { id: number; orderNo: string; customer: string; part: string; finish: string; due: string; shipped: string; daysLate: number; tonnes: number | null; longestStage: string; longestDays: number }
interface Report {
  stages: { key: string; label: string; lateDays: number | null; onTimeDays: number | null }[]; trend: { mo: string; onTimePct: number | null }[]; lateList: Late[];
}

export function LateLinesPanel({ filters: f, onLine }: { filters: Filters; onLine: (id: number) => void }) {
  const { data: d, error, reload } = useReport<Report>(f.ready ? `/delays${f.query()}` : null);
  const cols: DataColumn<Late>[] = [
    { key: 'late', header: 'Days late', numeric: true, align: 'right', sortValue: (r) => r.daysLate, render: (r) => <Box component="span" sx={{ color: 'var(--c-danger-600)', fontWeight: 700 }}>{r.daysLate}</Box> },
    { key: 'order', header: 'Order', sortValue: (r) => r.orderNo, render: (r) => r.orderNo },
    { key: 'customer', header: 'Customer', sortValue: (r) => r.customer, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 190 }} title={r.customer}>{r.customer}</Typography> },
    { key: 'part', header: 'Part', sortValue: (r) => r.part, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 210 }} title={r.part}>{r.part}</Typography> },
    { key: 'due', header: 'Delivery date', sortValue: (r) => r.due, render: (r) => dateLabel(r.due) },
    { key: 'shipped', header: 'Fully shipped', sortValue: (r) => r.shipped, render: (r) => dateLabel(r.shipped) },
    { key: 'stage', header: 'Longest stage', sortValue: (r) => r.longestStage, render: (r) => `${r.longestStage} (${r.longestDays}d)` },
  ];
  if (error) return <ErrorNotice error={error} onRetry={reload} />;
  if (!d) return <ListSkeleton rows={6} />;
  return (
    <>
      <Grid>
        <SectionCard title="Median days at each stage" subtitle="Between the dates recorded for each line’s last piece" flush>
          <Table size="small">
            <TableHead><TableRow><TableCell sx={{ fontWeight: 700 }}>Stage</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>Late lines</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>On-time lines</TableCell></TableRow></TableHead>
            <TableBody>{d.stages.map((s) => <TableRow key={s.key}><TableCell>{s.label}</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{s.lateDays ?? '—'}</TableCell><TableCell align="right">{s.onTimeDays ?? '—'}</TableCell></TableRow>)}</TableBody>
          </Table>
        </SectionCard>
        <SectionCard title="On time by month due"><Bars labels={d.trend.map((t) => monthLabel(t.mo))} data={d.trend.map((t) => t.onTimePct)} format={(v) => `${v}%`} height={250} max={100} /></SectionCard>
      </Grid>
      <SectionCard title="Lines that shipped late" subtitle="Latest first. Select a line for detail." flush>
        <ReportTable rows={d.lateList} columns={cols} getRowId={(r) => r.id} bare pageSize={15} defaultSortKey="late" defaultSortDir="desc" onRowClick={(r) => onLine(r.id)} empty="No late lines for these filters." />
      </SectionCard>
    </>
  );
}
