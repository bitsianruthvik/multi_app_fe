import { Box, Typography } from '@mui/material';
import { SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { monthLabel, num, pct, tonnes } from '../format';
import { Lines, ReportTable } from '../components/Charts';
import { Page } from '../components/Page';
import { StepStrip } from '../components/Timelines';
import { TL } from '../components/timelineStyle';

type Legs = { o2b: number | null; b2inj: number | null; inj2pour: number | null; pour2ins: number | null; ins2ship: number | null; promised: number | null };
interface Cust extends Legs { id: number; customer: string; lines: number; tonnes: number | null; onTimePct: number | null }
interface Report { legs: { key: string; label: string; days: number | null; slow: number | null }[]; promised: number | null; lines: number; months: (Legs & { mo: string; lines: number })[]; customers: Cust[] }

/** Where the days go between order and shipment, stage by stage. */
export default function TimeSpent() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/time-spent${f.query()}` : null);
  const n = (v: number | null) => (v == null ? '—' : v);
  const cols: DataColumn<Cust>[] = [
    { key: 'customer', header: 'Customer', alwaysVisible: true, sortValue: (r) => r.customer, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 600, maxWidth: 220 }} title={r.customer}>{r.customer}</Typography> },
    { key: 'tonnes', header: 'Shipped', numeric: true, align: 'right', sortValue: (r) => r.tonnes, render: (r) => tonnes(r.tonnes) },
    { key: 'o2b', header: 'Order to start', numeric: true, align: 'right', sortValue: (r) => r.o2b, render: (r) => n(r.o2b) },
    { key: 'b2inj', header: 'Start to wax done', numeric: true, align: 'right', sortValue: (r) => r.b2inj, render: (r) => n(r.b2inj) },
    { key: 'inj2pour', header: 'Wax to poured', numeric: true, align: 'right', sortValue: (r) => r.inj2pour, render: (r) => n(r.inj2pour) },
    { key: 'pour2ins', header: 'Poured to passed', numeric: true, align: 'right', sortValue: (r) => r.pour2ins, render: (r) => <Box component="span" sx={{ color: TL.post, fontWeight: 700 }}>{n(r.pour2ins)}</Box> },
    { key: 'ins2ship', header: 'Passed to shipped', numeric: true, align: 'right', sortValue: (r) => r.ins2ship, render: (r) => n(r.ins2ship) },
    { key: 'promised', header: 'Promised', numeric: true, align: 'right', sortValue: (r) => r.promised, render: (r) => n(r.promised) },
    { key: 'ontime', header: 'Shipped on time', numeric: true, align: 'right', sortValue: (r) => r.onTimePct, render: (r) => pct(r.onTimePct) },
  ];
  return (
    <Page title="Where the time goes" question="How many days each stage takes between the order and the shipment." filters={f} filterKeys={['customer', 'market', 'finish', 'metal']} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote="Order lines fully shipped in the period, so slow and fast lines both count. A stage is done on the day good pieces there first reach the ordered quantity. Medians per order line, in days. Promised is order date to delivery date.">
      {d && (
        <>
          <SectionCard title={`The usual order line, from order to shipment (${num(d.lines)} lines)`} info="Median days for each stage of order lines fully shipped in the period, in order from order to shipment, with the median promised days (order date to delivery date). The slowest 10% figure is the 90th percentile for each stage.">
            <StepStrip legs={d.legs} promised={d.promised} />
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Slowest 10%: {d.legs.map((l) => `${l.label.toLowerCase()} ${l.slow ?? '—'} days`).join(' · ')}</Typography>
          </SectionCard>
          <SectionCard title="Days per stage, by month shipped" subtitle="Median per order line" info="Median days for each stage, grouped by the month the order line was fully shipped, for lines shipped in the selected period.">
            <Lines labels={d.months.map((m) => monthLabel(m.mo))} format={(v) => `${v}d`} height={300} series={[
              { label: 'Poured to passed inspection', data: d.months.map((m) => m.pour2ins), color: TL.post },
              { label: 'Start to wax done', data: d.months.map((m) => m.b2inj), color: '#85b7eb' },
              { label: 'Wax done to poured', data: d.months.map((m) => m.inj2pour), color: 'var(--c-primary-600)' },
              { label: 'Passed to shipped', data: d.months.map((m) => m.ins2ship), color: '#5f5e5a' },
              { label: 'Order to start', data: d.months.map((m) => m.o2b), color: '#b4b2a9' },
            ]} />
          </SectionCard>
          <SectionCard title="By customer" subtitle="Days per stage, median" flush info="Customers with at least 5 order lines fully shipped in the period, with tonnes shipped, median days for each stage, median promised days, and the share of those lines shipped by their delivery date.">
            <ReportTable rows={d.customers} columns={cols} getRowId={(r) => r.id} bare pageSize={12} defaultSortKey="tonnes" defaultSortDir="desc" onRowClick={(r) => f.setValue('customer', String(r.id))} empty="Nothing for these filters." />
          </SectionCard>
        </>
      )}
    </Page>
  );
}
