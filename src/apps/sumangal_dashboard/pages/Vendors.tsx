import { useState } from 'react';
import { Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import ScaleRounded from '@mui/icons-material/ScaleRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import HourglassBottomRounded from '@mui/icons-material/HourglassBottomRounded';
import { ErrorNotice, KpiGrid, KpiTile, ListSkeleton, SectionCard, SideSheet, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { dateLabel, dayCount, monthLabel, num, tonnes } from '../format';
import { Bars, Big, Grid, ReportTable, RowBars } from '../components/Charts';
import { Page } from '../components/Page';

interface Vendor { key: string; process: string; vendor: string; lines: number; tonnes: number | null; medianDays: number | null; slowDays: number | null; openTonnes: number | null; oldOpenTonnes: number | null; rejectedPcs: number; prevDays: number | null; nowDays: number | null }
interface Span { first: string; last: string }
interface Report {
  kpis: { vendors: number; tonnes: number | null; lines: number; medianDays: number | null; openTonnes: number | null; oldOpenTonnes: number | null }; processes: { process: string; vendors: number; tonnes: number | null; medianDays: number | null; slowDays: number | null; openTonnes: number | null }[];
  vendors: Vendor[]; quarters: { quarter: string; tonnes: number | null; medianDays: number | null; returned: number | null }[]; quarterProcess: string; now: Span; prev: Span;
}
interface Detail { vendor: string; process: string | null; lines: number; tonnes: number | null; medianDays: number | null; slowDays: number | null; openTonnes: number | null; oldOpenTonnes: number | null; months: { mo: string; tonnes: number | null; medianDays: number | null }[]; open: { no: string; sent: string; part: string; sentPcs: number; backPcs: number; kg: number; days: number }[]; parts: { die: number; name: string; tonnes: number | null; medianDays: number | null }[]; poValue: number | null }
const span = (s: Span) => `${monthLabel(s.first)} to ${monthLabel(s.last)}`;

function VendorSheet({ vendor, process, onClose }: { vendor: string; process: string; onClose: () => void }) {
  const { data: d, error } = useReport<Detail>(`/vendor?vendor=${encodeURIComponent(vendor)}&process=${encodeURIComponent(process)}`);
  type Open = Detail['open'][number];
  const cols: DataColumn<Open>[] = [
    { key: 'days', header: 'Days out', numeric: true, align: 'right', sortValue: (r) => r.days, render: (r) => <b>{r.days}</b> },
    { key: 'sent', header: 'Sent', sortValue: (r) => r.sent, render: (r) => dateLabel(r.sent) },
    { key: 'part', header: 'Part', sortValue: (r) => r.part, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 190 }} title={r.part}>{r.part}</Typography> },
    { key: 'pcs', header: 'Back / sent', numeric: true, align: 'right', render: (r) => `${num(r.backPcs)} / ${num(r.sentPcs)}` },
    { key: 'kg', header: 'Kg out', numeric: true, align: 'right', sortValue: (r) => r.kg, render: (r) => num(r.kg) },
  ];
  return (
    <SideSheet open onClose={onClose} title={vendor} subtitle={`${process} · all two years of data`} width={640}>
      {error ? <ErrorNotice error={error} /> : !d ? <ListSkeleton rows={6} /> : (
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <Big size={24} value={tonnes(d.tonnes)} label="Sent" help={`${num(d.lines)} lines`} info="Metal sent out to this vendor in all the loaded data, not only the date range above. Lines are outward slips." />
            <Big size={24} value={dayCount(d.medianDays)} label="Median days away" help={`90th percentile ${dayCount(d.slowDays)}`} info="Median number of days from sending a job out to its return, for jobs already back. The 90th percentile is the time that the slowest one in ten takes or more." />
            <Big size={24} value={tonnes(d.openTonnes, 1)} label="Not yet back" help={`${tonnes(d.oldOpenTonnes, 1)} out over 60 days`} info="Metal sent out that has not come back yet. The note below counts what has been out for more than 60 days." />
          </Box>
          <SectionCard title="Median days away, by month sent" info="Median days away for this vendor’s lines, by the month they were sent. Uses all loaded data for this vendor (and its process, if one is picked), not the selected date range."><Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.medianDays)} format={(v) => `${v}d`} height={190} /></SectionCard>
          <SectionCard title="Tonnes sent, by month" info="Tonnes sent to this vendor, by the month of the outward date. Uses all loaded data for this vendor (and its process, if one is picked), not the selected date range."><Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.tonnes)} format={(v) => `${v} t`} height={170} /></SectionCard>
          <SectionCard title="Biggest parts" info="Up to eight parts this vendor has cast, largest by tonnes sent, each with its median days away. Uses all loaded data for this vendor, not the selected date range."><RowBars rows={d.parts.map((p) => ({ key: String(p.die), label: p.name, value: p.tonnes, sub: `Median ${dayCount(p.medianDays)}` }))} format={(v) => `${v} t`} /></SectionCard>
          {d.open.length > 0 && <SectionCard title="Still out" subtitle="Longest first" flush info="Up to 20 lines sent to this vendor with pieces still not back, longest out first. Days out counts from the sent date to the data date, and Kg out is the part of the sent weight not yet back. Uses all loaded data, not the selected date range."><ReportTable rows={d.open} columns={cols} getRowId={(r) => `${r.no}${r.part}${r.sent}${r.kg}`} bare pageSize={8} defaultSortKey="days" defaultSortDir="desc" /></SectionCard>}
        </Stack>
      )}
    </SideSheet>
  );
}

/** Castings sent out for work: to whom, how much, and how long it takes to come back. */
export default function Vendors() {
  const f = useFilters();
  const [process, setProcess] = useState('');
  const [pick, setPick] = useState<Vendor | null>(null);
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/vendors${f.query(process ? { process } : {})}` : null);
  const cols: DataColumn<Vendor>[] = [
    { key: 'vendor', header: 'Vendor', alwaysVisible: true, sortValue: (r) => r.vendor, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 600, maxWidth: 230 }} title={r.vendor}>{r.vendor}</Typography> },
    { key: 'process', header: 'Sent for', sortValue: (r) => r.process, render: (r) => r.process },
    { key: 'tonnes', header: 'Sent', numeric: true, align: 'right', sortValue: (r) => r.tonnes, render: (r) => tonnes(r.tonnes) },
    { key: 'median', header: 'Median days', numeric: true, align: 'right', sortValue: (r) => r.medianDays, render: (r) => <b>{r.medianDays ?? '—'}</b> },
    { key: 'slow', header: '90th percentile', numeric: true, align: 'right', sortValue: (r) => r.slowDays, render: (r) => r.slowDays ?? '—' },
    { key: 'trend', header: d ? `${span(d.prev)} → ${span(d.now)}` : 'Change', numeric: true, align: 'right', sortValue: (r) => (r.nowDays != null && r.prevDays != null ? r.nowDays - r.prevDays : null), render: (r) => { if (r.nowDays == null || r.prevDays == null) return '—'; const c = r.nowDays - r.prevDays; return <Box component="span" sx={{ fontWeight: 700, color: c > 0 ? 'var(--c-danger-600)' : c < 0 ? 'var(--c-success-600)' : undefined }}>{r.prevDays} → {r.nowDays}</Box>; } },
    { key: 'open', header: 'Not yet back', numeric: true, align: 'right', sortValue: (r) => r.openTonnes, render: (r) => tonnes(r.openTonnes, 1) },
    { key: 'old', header: 'Out over 60 days', numeric: true, align: 'right', sortValue: (r) => r.oldOpenTonnes, render: (r) => tonnes(r.oldOpenTonnes, 1) },
    { key: 'rej', header: 'Rejected pcs', numeric: true, align: 'right', sortValue: (r) => r.rejectedPcs, render: (r) => (r.rejectedPcs ? num(r.rejectedPcs) : '—'), defaultHidden: true },
  ];
  return (
    <Page title="Job-work vendors" question="Castings sent out: to whom, how much, and how long they take to come back." filters={f} filterKeys={[]} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote="Days run from the outward date to the last inward entry for that line, for lines with an inward entry. Lines sent recently may not be back yet, so each quarter shows the share returned. One casting can go to more than one process.">
      {d && (
        <>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField select size="small" label="Sent for" value={process} onChange={(e) => setProcess(e.target.value)} sx={{ minWidth: 220 }}>
              <MenuItem value="">All processes</MenuItem>
              {d.processes.map((p) => <MenuItem key={p.process} value={p.process}>{p.process}</MenuItem>)}
            </TextField>
          </Stack>
          <KpiGrid>
            <KpiTile label="Vendors" info="Number of different job-work vendors that had castings sent out in the selected date range, narrowed to the Sent for choice if one is picked. "icon={<GroupsRounded />} display={num(d.kpis.vendors)} />
            <KpiTile label="Sent" info="Castings sent out to job-work vendors in the selected date range, in tonnes, from the outward weight. The footer counts the outward lines." icon={<ScaleRounded />}display={tonnes(d.kpis.tonnes)} footer={`${num(d.kpis.lines)} lines`} />
            <KpiTile label="Median days away" info="Median days from the outward date to the last inward entry, for each sent line in the selected date range. Lines with no inward entry yet are not counted." icon={<ScheduleRounded />}display={dayCount(d.kpis.medianDays)} />
            <KpiTile label="Not yet back" info="Tonnes still out with vendors in the selected date range: for each sent line, the share of its weight not yet received back, added up. The footer is the part of that which has been out for more than 60 days, counted to the data date." icon={<HourglassBottomRounded />}display={tonnes(d.kpis.openTonnes, 1)} footer={`${tonnes(d.kpis.oldOpenTonnes, 1)} out over 60 days`} />
          </KpiGrid>
          <SectionCard title="All vendors" subtitle="Largest first. Select a vendor for more." flush info="One row per vendor and process with at least 1 tonne sent in the selected date range, largest first. 90th percentile is the day count within which 9 in 10 of its returned lines came back. Trend compares median days away for the 6 full months before the data date with the 6 months before those, whatever the date range.">
            <ReportTable rows={d.vendors} columns={cols} getRowId={(r) => r.key} bare pageSize={15} defaultSortKey="tonnes" defaultSortDir="desc" onRowClick={setPick} empty="No vendors for this period." />
          </SectionCard>
          <Grid>
            <SectionCard title="Median days away, by process" info="The processes with castings sent in the selected date range (up to nine, largest by tonnes sent first), with their median days away. Each row also shows tonnes sent, number of vendors and the 90th percentile. Click a process to filter the page to it."><RowBars rows={d.processes.slice(0, 9).map((p) => ({ key: p.process, label: p.process, value: p.medianDays, sub: `${tonnes(p.tonnes)} sent · ${num(p.vendors)} vendors · 90th percentile ${dayCount(p.slowDays)}` }))} format={dayCount} onClick={(k) => setProcess(process === k ? '' : k)} selected={process} /></SectionCard>
            <SectionCard title={`${d.quarterProcess}: median days by quarter sent`} info="For the process picked in Sent for (Machining if none is picked), the median days away for lines sent in each calendar quarter of the selected date range. The line under the bars gives tonnes sent and the % of those lines that have come back.">
              <Bars labels={d.quarters.map((q) => q.quarter)} data={d.quarters.map((q) => q.medianDays)} format={(v) => `${v}d`} height={240} />
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{d.quarters.map((q) => `${q.quarter}: ${tonnes(q.tonnes)}, ${q.returned}% back`).join(' · ')}</Typography>
            </SectionCard>
          </Grid>
          {pick && <VendorSheet vendor={pick.vendor} process={pick.process} onClose={() => setPick(null)} />}
        </>
      )}
    </Page>
  );
}
