import { useState } from 'react';
import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import InventoryRounded from '@mui/icons-material/InventoryRounded';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import { KpiGrid, KpiTile, SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { dateLabel, dayCount, monthLabel, num, pct, tonnes } from '../format';
import { Bars, Grid, OnTimeBadge, ReportTable, RowBars } from '../components/Charts';
import { ON_TIME_HELP, Page } from '../components/Page';
import { CustomerSheet, LineSheet } from '../components/Sheets';
import { LateLinesPanel } from '../components/LateLinesPanel';
import { PlanPanel } from '../components/PlanPanel';

interface OpenRow { id: number; orderNo: string; customer: string; customerId: number; part: string; finish: string; due: string | null; ordered: number; shipped: number; pending: number; tonnes: number | null; at: string; daysOverdue: number }
interface CustomerRow { id: number; name: string; lines: number; onTimePct: number | null; medianDelay: number | null; leadDays: number | null; promisedDays: number | null; openLines: number; openTonnes: number | null; overdueLines: number }
interface Report {
  kpis: { openLines: number; openTonnes: number | null; overdueLines: number; overdueTonnes: number | null; lines: number; onTime: number; onTimePct: number | null; medianDelay: number | null; leadDays: number | null; promisedDays: number | null };
  bands: { label: string; lines: number; tonnes: number | null }[]; at: { label: string; lines: number; tonnes: number | null }[]; customers: CustomerRow[]; trend: { mo: string; onTimePct: number | null }[]; list: OpenRow[];
}

/** What's pending, what's past due, and delivery by customer. */
export default function Orders() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/orders${f.query()}` : null);
  const [line, setLine] = useState<number | null>(null);
  const [customer, setCustomer] = useState<number | null>(null);
  const [tab, setTab] = useState<'open' | 'late' | 'plan'>('open');
  const openCols: DataColumn<OpenRow>[] = [
    { key: 'overdue', header: 'Days past due', numeric: true, align: 'right', sortValue: (r) => r.daysOverdue, render: (r) => (r.daysOverdue > 0 ? <Box component="span" sx={{ color: 'var(--c-danger-600)', fontWeight: 700 }}>{r.daysOverdue}</Box> : '—') },
    { key: 'due', header: 'Delivery date', sortValue: (r) => r.due, render: (r) => dateLabel(r.due) },
    { key: 'order', header: 'Order', sortValue: (r) => r.orderNo, render: (r) => r.orderNo },
    { key: 'customer', header: 'Customer', sortValue: (r) => r.customer, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 190 }} title={r.customer}>{r.customer}</Typography> },
    { key: 'part', header: 'Part', sortValue: (r) => r.part, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 220 }} title={r.part}>{r.part}</Typography> },
    { key: 'pending', header: 'Pending pcs', numeric: true, align: 'right', sortValue: (r) => r.pending, render: (r) => num(r.pending) },
    { key: 'tonnes', header: 'Pending t', numeric: true, align: 'right', sortValue: (r) => r.tonnes, render: (r) => r.tonnes ?? '—' },
    { key: 'at', header: 'Most pieces are', sortValue: (r) => r.at, render: (r) => r.at },
  ];
  const custCols: DataColumn<CustomerRow>[] = [
    { key: 'name', header: 'Customer', sortValue: (r) => r.name, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 600, maxWidth: 240 }} title={r.name}>{r.name}</Typography> },
    { key: 'lines', header: 'Lines due', numeric: true, align: 'right', sortValue: (r) => r.lines, render: (r) => num(r.lines) },
    { key: 'onTime', header: 'On time', align: 'center', sortValue: (r) => r.onTimePct, render: (r) => <OnTimeBadge value={r.onTimePct} /> },
    { key: 'delay', header: 'Median days late', numeric: true, align: 'right', sortValue: (r) => r.medianDelay, render: (r) => r.medianDelay ?? '—' },
    { key: 'lead', header: 'Actual days', numeric: true, align: 'right', sortValue: (r) => r.leadDays, render: (r) => r.leadDays ?? '—' },
    { key: 'promised', header: 'Promised days', numeric: true, align: 'right', sortValue: (r) => r.promisedDays, render: (r) => r.promisedDays ?? '—' },
    { key: 'open', header: 'Open t', numeric: true, align: 'right', sortValue: (r) => r.openTonnes, render: (r) => r.openTonnes ?? '—' },
    { key: 'overdue', header: 'Past due lines', numeric: true, align: 'right', sortValue: (r) => r.overdueLines, render: (r) => num(r.overdueLines) },
  ];
  return (
    <Page title="Orders and delivery" question="What is pending, what is past due, and how delivery is going." filters={f} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote="Open orders are as of the last data date, whatever the period. On-time figures cover lines whose delivery date falls in the period. Plan vs actual quantities cover lines that have fully shipped.">
      {d && (
        <>
          <KpiGrid>
            <KpiTile label="Open orders" icon={<InventoryRounded />} display={tonnes(d.kpis.openTonnes)} footer={`${num(d.kpis.openLines)} lines`} info="Tonnes still to ship on every open order line as of the last data date, whatever the selected period. The footer gives the number of open lines." />
            <KpiTile label="Past due" icon={<EventBusyRounded />} display={`${num(d.kpis.overdueLines)} lines`} tone={d.kpis.overdueLines ? 'danger' : 'default'} footer={tonnes(d.kpis.overdueTonnes)} info="Open order lines whose delivery date is before the last data date. The figure is the number of lines, and the footer gives their tonnes still to ship." />
            <KpiTile label="On time" icon={<LocalShippingRounded />} display={pct(d.kpis.onTimePct)} hint={ON_TIME_HELP} footer={`${num(d.kpis.onTime)} of ${num(d.kpis.lines)} lines due`} info="Share of order lines due in the selected period that were fully shipped by their delivery date. Lines not fully shipped by then count as late. The footer gives the on-time lines out of lines due." />
            <KpiTile label="Median delay when late" icon={<ScheduleRounded />} display={dayCount(d.kpis.medianDelay)} footer={`Actual ${dayCount(d.kpis.leadDays)}, promised ${dayCount(d.kpis.promisedDays)}`} info="Median days from the delivery date to full shipment, for lines due in the period that shipped late. The footer compares the median days from order date to shipment (actual) with the median days from order date to delivery date (promised)." />
          </KpiGrid>
          <Stack direction="row">
            <ToggleButtonGroup size="small" exclusive value={tab} onChange={(_, v) => v && setTab(v)}>
              <ToggleButton value="open" sx={{ textTransform: 'none', px: 2 }}>Open orders</ToggleButton>
              <ToggleButton value="late" sx={{ textTransform: 'none', px: 2 }}>Late lines</ToggleButton>
              <ToggleButton value="plan" sx={{ textTransform: 'none', px: 2 }}>Plan vs actual</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          {tab === 'late' && <LateLinesPanel filters={f} onLine={setLine} />}
          {tab === 'plan' && <PlanPanel filters={f} />}
          {tab === 'open' && (<>
          <Grid>
            <SectionCard title="Open orders by delivery date" subtitle="Tonnes pending" info="Tonnes still to ship on open order lines, grouped by how far the delivery date is from the last data date: overdue bands first, then dates ahead. Lines with no delivery date are in the last band. Not limited to the selected period.">
              <RowBars rows={d.bands.map((b) => ({ key: b.label, label: b.label, value: b.tonnes, hot: b.label.includes('overdue'), sub: `${num(b.lines)} lines` }))} format={(v) => `${v} t`} />
            </SectionCard>
            <SectionCard title="On time by month due" info="Share of order lines on time, grouped by the month of their delivery date, for lines due in the selected period. It uses the same on-time rule as the On time tile."><Bars labels={d.trend.map((t) => monthLabel(t.mo))} data={d.trend.map((t) => t.onTimePct)} format={(v) => `${v}%`} height={290} max={100} /></SectionCard>
          </Grid>
          <SectionCard title="Delivery by customer" subtitle="Select a customer for more" flush info="Customers with order lines due in the selected period: lines due, share on time, median days late, actual and promised days from order date, tonnes still open and past due lines. Open tonnes and past due lines are as of the last data date, not the period.">
            <ReportTable rows={d.customers} columns={custCols} getRowId={(r) => r.id} bare pageSize={15} defaultSortKey="lines" defaultSortDir="desc" onRowClick={(r) => setCustomer(r.id)} empty="No lines due for these filters." />
          </SectionCard>
          <SectionCard title="Open order lines" subtitle="Longest past due first. Select a line for detail." flush info="Every open order line as of the last data date, not limited to the selected period. Days past due counts from the delivery date to the last data date. Most pieces are is the stage where most of the line’s pending pieces sit.">
            <ReportTable rows={d.list} columns={openCols} getRowId={(r) => r.id} bare pageSize={15} defaultSortKey="overdue" defaultSortDir="desc" onRowClick={(r) => setLine(r.id)} empty="No open lines for these filters." />
          </SectionCard>
          </>)}
          {customer != null && <CustomerSheet id={customer} filters={f} onClose={() => setCustomer(null)} onLine={setLine} />}
          {line != null && <LineSheet id={line} onClose={() => setLine(null)} />}
        </>
      )}
    </Page>
  );
}
