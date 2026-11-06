import { useMemo, useState } from 'react';
import { Box, Stack, Tooltip, Typography } from '@mui/material';
import CurrencyRupeeRounded from '@mui/icons-material/CurrencyRupeeRounded';
import ScaleRounded from '@mui/icons-material/ScaleRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import { KpiGrid, KpiTile, SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { crore, dayCount, monthLabel, num, onTimeTone, perKg, pct } from '../format';
import { Bars, Grid, OnTimeBadge, ReportTable, RowBars, ValueBar } from '../components/Charts';
import { ON_TIME_HELP, Page } from '../components/Page';
import { CustomerSheet, LineSheet } from '../components/Sheets';

interface Row { id: number; name: string; sales: number; kg: number; pricePerKg: number | null; share: number | null; orders: number; tonnesPerOrder: number | null; billedEvery: number | null; invoices: number; parts: number; creditDays: number | null; onTimePct: number | null; medianDelay: number | null; leadDays: number | null; promisedDays: number | null; dueLines: number }
interface Report {
  kpis: { sales: number; kg: number; pricePerKg: number | null; tonnes: number | null; customers: number; topShare: number | null; onTimePct: number | null };
  rows: Row[]; tiers: { label: string; customers: number; sales: number; share: number | null; pricePerKg: number | null; onTimePct: number | null }[];
  months: { mo: string; sales: number }[]; billing: { mo: string; billed: number }[]; credit: { days: number; billed: number }[];
}

const BAND = [
  { key: 'danger', label: 'Under 20% on time', color: 'var(--c-danger-600)' },
  { key: 'warning', label: '20–50% on time', color: 'var(--c-warning-600)' },
  { key: 'success', label: 'Over 50% on time', color: 'var(--c-success-600)' },
  { key: 'neutral', label: 'No lines due', color: 'var(--c-text-3)' },
] as const;
const W = 760; const H = 340; const L = 58; const R = 16; const T = 14; const B = 44;
/** Enough of a name to recognise it on the map: one word, or two when the first is short. */
const shortName = (n: string) => { const w = n.trim().split(/\s+/); return (w[0].length <= 3 && w[1] ? `${w[0]} ${w[1]}` : w[0]).replace(/[.,]+$/, ''); };

/** Each customer as a dot: right = more sales, up = higher price per kg, colour = delivery. */
function CustomerMap({ rows, average, onPick }: { rows: Row[]; average: number | null; onPick: (id: number) => void }) {
  const dots = rows.filter((r) => r.pricePerKg != null && r.sales >= 2000000);
  if (!dots.length) return <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)', py: 4, textAlign: 'center' }}>No customer over ₹20 L for these filters.</Typography>;
  const crs = dots.map((r) => r.sales / 1e7); const xMin = Math.log10(Math.min(...crs) * 0.8); const xMax = Math.log10(Math.max(...crs) * 1.25);
  const prices = dots.map((r) => r.pricePerKg as number); const yMin = Math.log10(Math.min(...prices) * 0.85); const yMax = Math.log10(Math.max(...prices) * 1.15);
  const x = (cr: number) => L + ((Math.log10(cr) - xMin) / Math.max(0.01, xMax - xMin)) * (W - L - R);
  const y = (v: number) => T + (1 - (Math.log10(v) - yMin) / Math.max(0.01, yMax - yMin)) * (H - T - B);
  const xTicks = [0.2, 0.5, 1, 2, 5, 10, 20, 50].filter((t) => Math.log10(t) >= xMin && Math.log10(t) <= xMax);
  const yTicks = [200, 300, 500, 700, 1000, 1500, 2000, 3000, 5000].filter((t) => Math.log10(t) >= yMin && Math.log10(t) <= yMax);
  const sorted = [...dots].sort((p, n) => n.sales - p.sales); const labelled = new Set(sorted.slice(0, 8).map((r) => r.id));
  return (
    <Box>
      <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ mb: 0.5 }}>
        {BAND.slice(0, 3).map((b) => <Stack key={b.key} direction="row" spacing={0.6} alignItems="center"><Box sx={{ width: 10, height: 10, borderRadius: '50%', background: b.color }} /><Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{b.label}</Typography></Stack>)}
      </Stack>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Customers by sales and price per kg, coloured by on-time delivery">
        {yTicks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--c-border)" /><text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--c-text-3)">₹{t}</text></g>)}
        {xTicks.map((t) => <text key={t} x={x(t)} y={H - B + 18} textAnchor="middle" fontSize="11" fill="var(--c-text-3)">₹{t} Cr</text>)}
        <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" fontSize="12" fill="var(--c-text-2)">Sales (log scale)</text>
        <text x={12} y={(T + H - B) / 2} transform={`rotate(-90 12 ${(T + H - B) / 2})`} textAnchor="middle" fontSize="12" fill="var(--c-text-2)">Price per kg (log scale)</text>
        {average != null && <g><line x1={L} x2={W - R} y1={y(average)} y2={y(average)} stroke="var(--c-text-3)" strokeDasharray="5 4" /><text x={W - R} y={y(average) - 5} textAnchor="end" fontSize="11" fill="var(--c-text-3)">Overall ₹{average}</text></g>}
        {sorted.map((r) => {
          const cr = r.sales / 1e7; const cx = x(cr); const cy = y(r.pricePerKg as number); const rad = 5 + Math.sqrt(cr) * 1.6; const band = BAND.find((b) => b.key === onTimeTone(r.onTimePct)) ?? BAND[3];
          return (
            <Tooltip key={r.id} arrow title={<>{r.name}<br />{crore(r.sales)} · ₹{r.pricePerKg}/kg · {pct(r.onTimePct)} on time</>}>
              <g role="button" tabIndex={0} aria-label={r.name} style={{ cursor: 'pointer' }} onClick={() => onPick(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') onPick(r.id); }}>
                <circle cx={cx} cy={cy} r={rad} fill={band.color} fillOpacity={0.75} stroke="var(--c-surface)" strokeWidth={1.5} />
                {labelled.has(r.id) && <text x={cx > W - 130 ? cx - rad - 4 : cx + rad + 4} y={cy + 4} textAnchor={cx > W - 130 ? 'end' : 'start'} fontSize="11.5" fontWeight="600" fill="var(--c-text)">{shortName(r.name)}</text>}
              </g>
            </Tooltip>
          );
        })}
      </svg>
      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Select a dot to see that customer. Customers under ₹20 L aren’t plotted.</Typography>
    </Box>
  );
}

export default function Customers() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/customers${f.query()}` : null);
  const [customer, setCustomer] = useState<number | null>(null);
  const [line, setLine] = useState<number | null>(null);
  const maxSales = useMemo(() => Math.max(1, ...(d?.rows ?? []).map((r) => r.sales)), [d]);
  const cols: DataColumn<Row>[] = [
    { key: 'name', header: 'Customer', alwaysVisible: true, sortValue: (r) => r.name, render: (r) => <Typography sx={{ fontSize: 'inherit', fontWeight: 600, maxWidth: 240 }} noWrap title={r.name}>{r.name}</Typography> },
    { key: 'sales', header: 'Sales', sortValue: (r) => r.sales, render: (r) => <ValueBar value={r.sales} max={maxSales} label={`${crore(r.sales)} · ${pct(r.share)}`} /> },
    { key: 'price', header: 'Price/kg', numeric: true, align: 'right', sortValue: (r) => r.pricePerKg, render: (r) => perKg(r.pricePerKg) },
    { key: 'orders', header: 'Orders', numeric: true, align: 'right', sortValue: (r) => r.orders, render: (r) => num(r.orders) },
    { key: 'size', header: 'Tonnes/order', numeric: true, align: 'right', sortValue: (r) => r.tonnesPerOrder, render: (r) => r.tonnesPerOrder ?? '—' },
    { key: 'billed', header: 'Billed every', numeric: true, align: 'right', sortValue: (r) => r.billedEvery, render: (r) => dayCount(r.billedEvery) },
    { key: 'onTime', header: 'On time', align: 'center', sortValue: (r) => r.onTimePct, render: (r) => <OnTimeBadge value={r.onTimePct} /> },
    { key: 'delay', header: 'Median days late', numeric: true, align: 'right', sortValue: (r) => r.medianDelay, render: (r) => r.medianDelay ?? '—' },
    { key: 'lead', header: 'Actual / promised days', numeric: true, align: 'right', sortValue: (r) => r.leadDays, render: (r) => (r.leadDays == null ? '—' : `${r.leadDays} / ${r.promisedDays}`) },
    { key: 'credit', header: 'Credit days', numeric: true, align: 'right', sortValue: (r) => r.creditDays, render: (r) => r.creditDays ?? '—' },
    { key: 'parts', header: 'Parts', numeric: true, align: 'right', sortValue: (r) => r.parts, render: (r) => num(r.parts), defaultHidden: true },
  ];
  return (
    <Page title="Customers" question="Who buys, how often, at what price, and how delivery goes." filters={f} loading={loading} error={error} reload={reload} hasData={!!d}>
      {d && (
        <>
          <KpiGrid>
            <KpiTile label="Sales" icon={<CurrencyRupeeRounded />} display={crore(d.kpis.sales)} tone="primary" spark={d.months.map((m) => m.sales)} footer="Invoice value before tax" />
            <KpiTile label="Price per kg" icon={<ScaleRounded />} display={perKg(d.kpis.pricePerKg)} footer={`${num(d.kpis.tonnes)} t invoiced`} />
            <KpiTile label="Customers billed" icon={<GroupsRounded />} display={num(d.kpis.customers)} footer={d.kpis.topShare != null ? `Largest: ${d.kpis.topShare}% of sales` : undefined} />
            <KpiTile label="Lines on time" icon={<LocalShippingRounded />} display={pct(d.kpis.onTimePct)} hint={ON_TIME_HELP} />
          </KpiGrid>
          <Grid cols="3fr 2fr">
            <SectionCard title="Customer map" subtitle="Sales, price per kg and delivery"><CustomerMap rows={d.rows} average={d.kpis.pricePerKg} onPick={setCustomer} /></SectionCard>
            <SectionCard title="By size of customer">
              <Stack spacing={1.25}>
                {d.tiers.map((t) => (
                  <Box key={t.label} sx={{ p: 1.25, borderRadius: 1.5, background: 'var(--c-surface-2)' }}>
                    <Stack direction="row" justifyContent="space-between"><Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{t.label}</Typography><Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{pct(t.share)} of sales</Typography></Stack>
                    <Box sx={{ height: 7, borderRadius: 4, background: 'var(--c-surface-3)', my: 0.6, overflow: 'hidden' }}><Box sx={{ width: `${t.share ?? 0}%`, height: '100%', background: 'var(--c-primary-500)' }} /></Box>
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{crore(t.sales)}</Typography>
                      <Tooltip title="Invoice value per kg invoiced"><Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{perKg(t.pricePerKg)}/kg</Typography></Tooltip>
                      <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{pct(t.onTimePct)} on time</Typography>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </SectionCard>
          </Grid>
          <SectionCard title="All customers" subtitle="Select a customer for more. Select a heading to sort." flush>
            <ReportTable rows={d.rows} columns={cols} getRowId={(r) => r.id} bare pageSize={15} defaultSortKey="sales" defaultSortDir="desc" onRowClick={(r) => setCustomer(r.id)} empty="No customers for these filters." />
          </SectionCard>
          <Grid>
            <SectionCard title="Invoices by due date" subtitle="Invoice value by the due date on the invoice"><Bars labels={d.billing.map((m) => monthLabel(m.mo))} data={d.billing.map((m) => m.billed)} format={crore} height={210} /></SectionCard>
            <SectionCard title="Credit on invoices" subtitle="Sales by days between invoice date and due date">
              <RowBars rows={d.credit.map((c) => ({ key: String(c.days), label: `${c.days} days`, value: c.billed }))} format={crore} />
            </SectionCard>
          </Grid>
          {customer != null && <CustomerSheet id={customer} filters={f} onClose={() => setCustomer(null)} onLine={setLine} />}
          {line != null && <LineSheet id={line} onClose={() => setLine(null)} />}
        </>
      )}
    </Page>
  );
}
