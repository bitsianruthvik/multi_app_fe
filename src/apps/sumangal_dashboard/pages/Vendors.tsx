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
            <Big size={24} value={tonnes(d.tonnes)} label="Sent" help={`${num(d.lines)} lines`} />
            <Big size={24} value={dayCount(d.medianDays)} label="Median days away" help={`90th percentile ${dayCount(d.slowDays)}`} />
            <Big size={24} value={tonnes(d.openTonnes, 1)} label="Not yet back" help={`${tonnes(d.oldOpenTonnes, 1)} out over 60 days`} />
          </Box>
          <SectionCard title="Median days away, by month sent"><Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.medianDays)} format={(v) => `${v}d`} height={190} /></SectionCard>
          <SectionCard title="Tonnes sent, by month"><Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.tonnes)} format={(v) => `${v} t`} height={170} /></SectionCard>
          <SectionCard title="Biggest parts"><RowBars rows={d.parts.map((p) => ({ key: String(p.die), label: p.name, value: p.tonnes, sub: `Median ${dayCount(p.medianDays)}` }))} format={(v) => `${v} t`} /></SectionCard>
          {d.open.length > 0 && <SectionCard title="Still out" subtitle="Longest first" flush><ReportTable rows={d.open} columns={cols} getRowId={(r) => `${r.no}${r.part}${r.sent}${r.kg}`} bare pageSize={8} defaultSortKey="days" defaultSortDir="desc" /></SectionCard>}
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
            <KpiTile label="Vendors" icon={<GroupsRounded />} display={num(d.kpis.vendors)} />
            <KpiTile label="Sent" icon={<ScaleRounded />} display={tonnes(d.kpis.tonnes)} footer={`${num(d.kpis.lines)} lines`} />
            <KpiTile label="Median days away" icon={<ScheduleRounded />} display={dayCount(d.kpis.medianDays)} />
            <KpiTile label="Not yet back" icon={<HourglassBottomRounded />} display={tonnes(d.kpis.openTonnes, 1)} footer={`${tonnes(d.kpis.oldOpenTonnes, 1)} out over 60 days`} />
          </KpiGrid>
          <SectionCard title="All vendors" subtitle="Largest first. Select a vendor for more." flush>
            <ReportTable rows={d.vendors} columns={cols} getRowId={(r) => r.key} bare pageSize={15} defaultSortKey="tonnes" defaultSortDir="desc" onRowClick={setPick} empty="No vendors for this period." />
          </SectionCard>
          <Grid>
            <SectionCard title="Median days away, by process"><RowBars rows={d.processes.slice(0, 9).map((p) => ({ key: p.process, label: p.process, value: p.medianDays, sub: `${tonnes(p.tonnes)} sent · ${num(p.vendors)} vendors · 90th percentile ${dayCount(p.slowDays)}` }))} format={dayCount} onClick={(k) => setProcess(process === k ? '' : k)} selected={process} /></SectionCard>
            <SectionCard title={`${d.quarterProcess}: median days by quarter sent`}>
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
