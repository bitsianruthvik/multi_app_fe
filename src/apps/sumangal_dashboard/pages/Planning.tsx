import { Typography } from '@mui/material';
import CallSplitRounded from '@mui/icons-material/CallSplitRounded';
import PlaylistAddRounded from '@mui/icons-material/PlaylistAddRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import EventAvailableRounded from '@mui/icons-material/EventAvailableRounded';
import { KpiGrid, KpiTile, SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { dateLabel, dayCount, monthLabel, num, pct, tonnes } from '../format';
import { Bars, Grid, ReportTable, RowBars } from '../components/Charts';
import { Page } from '../components/Page';

interface Extra { id: number; no: string; customer: string; part: string; od: string; batches: number; later: number; rework: number; tonnes: number; cls: string }
interface Report {
  kpis: { lines: number; orders: number; oneBatchPct: number | null; planned: number | null; startDays: number | null; sameDayPct: number | null; multiOrders: number; extraLines: number; extraTonnes: number | null; reworkLines: number; subsMedian: number | null };
  plannedBands: { label: string; lines: number }[]; startBands: { label: string; lines: number }[]; subBands: { label: string; lines: number }[]; months: { mo: string; lines: number; startDays: number | null }[]; extraList: Extra[];
}

/** How a sales order becomes production: one work order, one batch per line, split into sub-batches. */
export default function Planning() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/planning${f.query()}` : null);
  const k = d?.kpis;
  const cols: DataColumn<Extra>[] = [
    { key: 'od', header: 'Ordered', sortValue: (r) => r.od, render: (r) => dateLabel(r.od) },
    { key: 'no', header: 'Order', sortValue: (r) => r.no, render: (r) => r.no },
    { key: 'customer', header: 'Customer', sortValue: (r) => r.customer, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 200 }} title={r.customer}>{r.customer}</Typography> },
    { key: 'part', header: 'Part', sortValue: (r) => r.part, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 240 }} title={r.part}>{r.part}</Typography> },
    { key: 'later', header: 'Later batches', numeric: true, align: 'right', sortValue: (r) => r.later, render: (r) => r.later || '—' },
    { key: 'rework', header: 'Rework batches', numeric: true, align: 'right', sortValue: (r) => r.rework, render: (r) => r.rework || '—' },
    { key: 'tonnes', header: 'Tonnes', numeric: true, align: 'right', sortValue: (r) => r.tonnes, render: (r) => r.tonnes },
    { key: 'cls', header: 'Result', sortValue: (r) => r.cls, render: (r) => r.cls },
  ];
  return (
    <Page title="Planning" question="How each sales order is turned into production: batches, how much extra, and how soon it starts." filters={f} filterKeys={['customer', 'market', 'finish', 'metal']} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote="Order lines placed in the period. In the ERP a sales order gets one work order with the same lines and quantities; each line gets a production plan and a batch; the batch is split into lettered sub-batches (A, B, C...). Extra put into production is the batch quantity over the ordered quantity. Later batches are regular batches started after the line's first one; rework batches come from plans marked ReWork.">
      {d && k && (
        <>
          <KpiGrid>
            <KpiTile label="Lines made as one batch" icon={<CallSplitRounded />} display={pct(k.oneBatchPct)} footer={`${num(k.lines)} lines, ${num(k.orders)} orders`} />
            <KpiTile label="Put into production" icon={<PlaylistAddRounded />} display={k.planned ? `${Math.round(k.planned * 100)}%` : '—'} footer="Of the ordered quantity, median" />
            <KpiTile label="Order to production start" icon={<ScheduleRounded />} display={dayCount(k.startDays)} footer="Median" />
            <KpiTile label="Orders with all lines started the same day" icon={<EventAvailableRounded />} display={pct(k.sameDayPct)} footer={`Of ${num(k.multiOrders)} orders with more than one line`} />
          </KpiGrid>
          <Grid cols="1fr 1fr 1fr">
            <SectionCard title="How much is put into production"><RowBars rows={d.plannedBands.map((b) => ({ key: b.label, label: b.label, value: b.lines }))} format={(v) => `${num(v)} lines`} /></SectionCard>
            <SectionCard title="Days from order to start"><RowBars rows={d.startBands.map((b) => ({ key: b.label, label: b.label, value: b.lines }))} format={(v) => `${num(v)} lines`} /></SectionCard>
            <SectionCard title="Sub-batches per order line" subtitle={`Median ${k.subsMedian ?? '—'}`}><RowBars rows={d.subBands.map((b) => ({ key: b.label, label: b.label, value: b.lines }))} format={(v) => `${num(v)} lines`} /></SectionCard>
          </Grid>
          <SectionCard title="Days from order to start, by month ordered" subtitle="Median"><Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.startDays)} format={(v) => `${v}d`} height={220} /></SectionCard>
          <SectionCard title={`Lines that needed another batch: ${num(k.extraLines)} (${tonnes(k.extraTonnes)})`} subtitle={`${num(k.reworkLines)} of them had a rework batch`} flush>
            <ReportTable rows={d.extraList} columns={cols} getRowId={(r) => r.id} bare pageSize={10} defaultSortKey="od" defaultSortDir="desc" empty="None in this period." />
          </SectionCard>
        </>
      )}
    </Page>
  );
}
