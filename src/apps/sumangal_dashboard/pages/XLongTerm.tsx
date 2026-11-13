import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { crore, monthLabel, num, pct, perKg, tonnes } from '../format';
import { Bars, Grid, Lines, ReportTable } from '../components/Charts';
import { Page } from '../components/Page';
import { Open } from '../components/Intent';

interface Month { mo: string; sales: number; soldT: number | null; pricePerKg: number | null; pouredT: number | null; dispatchedT: number | null; orderedT: number | null; onTimePct: number | null; rejectionPct: number | null; pourToPass: number | null; orderToShip: number | null; kgPerPourDay: number | null; customers: number; topShare: number | null; top5Share: number | null; exportShare: number | null }
interface Side { first: string; last: string; sales: number; tonnes: number | null; pricePerKg: number | null; customers: number; topShare: number | null; top5Share: number | null; onTimePct: number | null; parts: { lines: number; newLines: number; newTonnes: number | null; tonnes: number | null } }
interface Cmp { key: string; name: string; now: number; prev: number; change: number; changePct: number | null; nowT: number | null; prevT: number | null; nowPrice: number | null; prevPrice: number | null; nowOnTime: number | null; prevOnTime: number | null }
interface Report { months: Month[]; now: Side; prev: Side; prevPartial: boolean; customers: Cmp[]; metals: Cmp[]; markets: Cmp[]; finishes: Cmp[] }

const delta = (a: number | null, b: number | null, fmt: (v: number) => string, goodUp = true) => {
  if (a == null || b == null) return null; const up = a > b; const same = a === b;
  return <Box component="span" sx={{ fontWeight: 700, color: same ? 'var(--c-text-3)' : up === goodUp ? 'var(--c-success-600)' : 'var(--c-danger-600)' }}>{same ? 'no change' : `${up ? '+' : '−'}${fmt(Math.abs(a - b))}`}</Box>;
};
function Pair({ label, now, prev, change }: { label: string; now: ReactNode; prev: ReactNode; change: ReactNode }) {
  return (
    <Box sx={{ p: 1.75, borderRadius: 2, border: '1px solid var(--c-border)' }}>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', fontWeight: 600 }}>{label}</Typography>
      <Typography sx={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.25 }}>{now}</Typography>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>was {prev} · {change}</Typography>
    </Box>
  );
}

/** Long-term planning: the last twelve months against the twelve before, and every measure month by month. */
export default function XLongTerm() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? '/intent/long-term' : null);
  const L = d ? d.months.map((m) => monthLabel(m.mo)) : [];
  const col = (k: keyof Month) => (d ? d.months.map((m) => m[k] as number | null) : []);
  const cmpCols = (first: string): DataColumn<Cmp>[] => [
    { key: 'name', header: first, alwaysVisible: true, sortValue: (r) => r.name, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 600, maxWidth: 240 }} title={r.name}>{r.name}</Typography> },
    { key: 'now', header: 'Sales, last 12 months', numeric: true, align: 'right', sortValue: (r) => r.now, render: (r) => crore(r.now) },
    { key: 'prev', header: '12 months before', numeric: true, align: 'right', sortValue: (r) => r.prev, render: (r) => crore(r.prev) },
    { key: 'change', header: 'Change', numeric: true, align: 'right', sortValue: (r) => r.change, render: (r) => <Box component="span" sx={{ fontWeight: 700, color: r.change > 0 ? 'var(--c-success-600)' : r.change < 0 ? 'var(--c-danger-600)' : undefined }}>{r.change > 0 ? '+' : r.change < 0 ? '−' : ''}{crore(Math.abs(r.change))}{r.changePct != null ? ` (${r.changePct > 0 ? '+' : ''}${r.changePct}%)` : ''}</Box> },
    { key: 't', header: 'Tonnes', numeric: true, align: 'right', sortValue: (r) => r.nowT, render: (r) => `${tonnes(r.prevT)} → ${tonnes(r.nowT)}` },
    { key: 'price', header: '₹ a kg', numeric: true, align: 'right', sortValue: (r) => r.nowPrice, render: (r) => `${perKg(r.prevPrice)} → ${perKg(r.nowPrice)}` },
    { key: 'ot', header: 'Shipped on time', numeric: true, align: 'right', sortValue: (r) => r.nowOnTime, render: (r) => `${pct(r.prevOnTime)} → ${pct(r.nowOnTime)}` },
  ];
  return (
    <Page title="Long term" question="The last twelve months against the twelve before, and how each measure has moved month by month." filters={f} filterKeys={[]} period={false} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote={`Complete calendar months only. ${d?.prevPartial ? 'The earlier twelve months start at the edge of the two-year snapshot, so their first month may be short. ' : ''}New parts are order lines for a part ordered for the first time. Kg per pouring day is metal poured over days with a pour. Nothing here is a forecast.`}>
      {d && (
        <>
          <SectionCard title={`${monthLabel(d.now.first)} to ${monthLabel(d.now.last)}, against ${monthLabel(d.prev.first)} to ${monthLabel(d.prev.last)}`}>
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: 'repeat(4, minmax(0,1fr))' } }}>
              <Pair label="Sales" now={crore(d.now.sales)} prev={crore(d.prev.sales)} change={delta(d.now.sales, d.prev.sales, crore)} />
              <Pair label="Tonnes sold" now={tonnes(d.now.tonnes)} prev={tonnes(d.prev.tonnes)} change={delta(d.now.tonnes, d.prev.tonnes, (v) => tonnes(v))} />
              <Pair label="Price a kg" now={perKg(d.now.pricePerKg)} prev={perKg(d.prev.pricePerKg)} change={delta(d.now.pricePerKg, d.prev.pricePerKg, perKg)} />
              <Pair label="Order lines shipped on time" now={pct(d.now.onTimePct)} prev={pct(d.prev.onTimePct)} change={delta(d.now.onTimePct, d.prev.onTimePct, (v) => `${v} pts`)} />
              <Pair label="Customers billed" now={num(d.now.customers)} prev={num(d.prev.customers)} change={delta(d.now.customers, d.prev.customers, (v) => num(v))} />
              <Pair label="Largest customer's share" now={pct(d.now.topShare)} prev={pct(d.prev.topShare)} change={delta(d.now.topShare, d.prev.topShare, (v) => `${v} pts`, false)} />
              <Pair label="Five largest customers' share" now={pct(d.now.top5Share)} prev={pct(d.prev.top5Share)} change={delta(d.now.top5Share, d.prev.top5Share, (v) => `${v} pts`, false)} />
              <Pair label="Ordered for the first time" now={`${tonnes(d.now.parts.newTonnes)} · ${num(d.now.parts.newLines)} lines`} prev={`${tonnes(d.prev.parts.newTonnes)} · ${num(d.prev.parts.newLines)} lines`} change={delta(d.now.parts.newTonnes, d.prev.parts.newTonnes, (v) => tonnes(v))} />
            </Box>
          </SectionCard>

          <Grid>
            <SectionCard title="Sales by month" action={<Open to="customers" label="Customers" />}><Bars labels={L} data={col('sales')} format={crore} height={230} /></SectionCard>
            <SectionCard title="Ordered, poured and dispatched" subtitle="Tonnes a month"><Lines labels={L} format={(v) => `${v} t`} height={230} series={[{ label: 'Ordered', data: col('orderedT'), color: '#b4b2a9' }, { label: 'Poured', data: col('pouredT'), color: '#eb6834' }, { label: 'Dispatched', data: col('dispatchedT'), color: 'var(--c-primary-600)' }]} /></SectionCard>
          </Grid>
          <Grid>
            <SectionCard title="Shipped on time and rejected" subtitle="Per cent, by month" action={<Open to="journey" label="Order journey" />}><Lines labels={L} format={(v) => `${v}%`} height={230} series={[{ label: 'Order lines shipped on time', data: col('onTimePct'), color: 'var(--c-primary-600)' }, { label: 'Rejected, of metal poured', data: col('rejectionPct'), color: '#e24b4a' }]} /></SectionCard>
            <SectionCard title="Days it takes" subtitle="Median per order line, by month shipped" action={<Open to="time-spent" label="Where the time goes" />}><Lines labels={L} format={(v) => `${v}d`} height={230} series={[{ label: 'Order to shipment', data: col('orderToShip'), color: 'var(--c-primary-600)' }, { label: 'Poured to passed inspection', data: col('pourToPass'), color: '#eb6834' }]} /></SectionCard>
          </Grid>
          <Grid>
            <SectionCard title="Who the sales depend on" subtitle="Share of the month's sales"><Lines labels={L} format={(v) => `${v}%`} height={230} series={[{ label: 'Largest customer', data: col('topShare'), color: '#e24b4a' }, { label: 'Five largest customers', data: col('top5Share'), color: '#b4b2a9' }, { label: 'Export', data: col('exportShare'), color: 'var(--c-primary-600)' }]} /></SectionCard>
            <SectionCard title="Price and pouring rate"><Lines labels={L} format={(v) => num(v)} height={230} series={[{ label: 'Price, ₹ a kg', data: col('pricePerKg'), color: 'var(--c-primary-600)' }, { label: 'Kg poured per pouring day', data: col('kgPerPourDay'), color: '#eb6834' }]} /></SectionCard>
          </Grid>

          <SectionCard title="Customers: last 12 months against the 12 before" subtitle="Largest first" flush><ReportTable rows={d.customers} columns={cmpCols('Customer')} getRowId={(r) => r.key} bare pageSize={12} defaultSortKey="now" defaultSortDir="desc" /></SectionCard>
          <Grid>
            <SectionCard title="By metal" flush><ReportTable rows={d.metals} columns={cmpCols('Metal').slice(0, 5)} getRowId={(r) => r.key} bare pageSize={8} defaultSortKey="now" defaultSortDir="desc" /></SectionCard>
            <SectionCard title="By market and finish" flush><ReportTable rows={[...d.markets, ...d.finishes]} columns={cmpCols('Market or finish').slice(0, 5)} getRowId={(r) => r.key} bare pageSize={8} defaultSortKey="now" defaultSortDir="desc" /></SectionCard>
          </Grid>
        </>
      )}
    </Page>
  );
}
