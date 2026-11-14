import { Typography } from '@mui/material';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import LayersRounded from '@mui/icons-material/LayersRounded';
import DateRangeRounded from '@mui/icons-material/DateRangeRounded';
import { KpiGrid, KpiTile, SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { dayCount, num, pct, tonnes } from '../format';
import { Grid, ReportTable, RowBars, ValueBar } from '../components/Charts';
import { Page } from '../components/Page';

interface Row { id: number; customer: string; shipments: number; shipKg: number | null; shipMedKg: number | null; orders: number; orderKg: number | null; orderMedKg: number | null; ordersPerShipment: number | null; placedApart: number | null; tonnes: number | null }
interface Report { kpis: { orderKg: number | null; shipKg: number | null; multiPct: number | null; placedApart: number | null }; customers: Row[]; spread: { label: string; tonnes: number | null }[]; per: { label: string; tonnes: number | null }[] }
const kg = (v: number | null) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)} t` : `${num(v)} kg`);

/** Sales order size against shipment size: how many orders go out together, and how far apart they were placed. */
export default function OrdersPerShipment() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/orders-per-shipment${f.query()}` : null);
  const k = d?.kpis;
  const max = d ? Math.max(1, ...d.customers.flatMap((r) => [r.orderKg || 0, r.shipKg || 0])) : 1;
  const cols: DataColumn<Row>[] = [
    { key: 'customer', header: 'Customer', alwaysVisible: true, sortValue: (r) => r.customer, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 600, maxWidth: 220 }} title={r.customer}>{r.customer}</Typography> },
    { key: 'order', header: 'Average sales order', sortValue: (r) => r.orderKg, render: (r) => <ValueBar value={r.orderKg || 0} max={max} label={`${kg(r.orderKg)} · ${num(r.orders)} orders`} color="var(--c-text-3)" /> },
    { key: 'ship', header: 'Average shipment', sortValue: (r) => r.shipKg, render: (r) => <ValueBar value={r.shipKg || 0} max={max} label={`${kg(r.shipKg)} · ${num(r.shipments)} shipments`} /> },
    { key: 'per', header: 'Orders in one shipment', numeric: true, align: 'right', sortValue: (r) => r.ordersPerShipment, render: (r) => r.ordersPerShipment ?? '—' },
    { key: 'apart', header: 'Placed apart, days', numeric: true, align: 'right', sortValue: (r) => r.placedApart, render: (r) => r.placedApart ?? '—' },
    { key: 'tonnes', header: 'Shipped', numeric: true, align: 'right', sortValue: (r) => r.tonnes, render: (r) => tonnes(r.tonnes) },
  ];
  return (
    <Page title="Orders per shipment" question="Is the shipment bigger than the order, and how far apart were the orders in one shipment placed?" filters={f} filterKeys={['customer', 'market']} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote="A shipment is one dispatch document. Sales orders are counted by their order date in the period; shipments by dispatch date. Orders in one shipment and days placed apart are medians per shipment.">
      {d && k && (
        <>
          <KpiGrid>
            <KpiTile label="Average sales order" info="Average kg per sales order, counting orders by order date in the selected date range, for the customer and market filters."icon={<ReceiptLongRounded />} display={kg(k.orderKg)} />
            <KpiTile label="Average shipment" info="Average kg per shipment, counting shipments by dispatch date in the selected date range. A shipment is one dispatch document."icon={<LocalShippingRounded />} display={kg(k.shipKg)} />
            <KpiTile label="Shipped in shipments with more than one order" info="Share of tonnes shipped in the selected date range that went out in shipments carrying more than one sales order."icon={<LayersRounded />} display={pct(k.multiPct)} footer="Of tonnes" />
            <KpiTile label="Orders in those shipments placed apart" info="Median days from the first to the last sales order date, across shipments in the selected date range that carried more than one order."icon={<DateRangeRounded />} display={dayCount(k.placedApart)} footer="Median, first to last order date" />
          </KpiGrid>
          <SectionCard title="By customer" subtitle="Grey: average sales order. Blue: average shipment." flush info="One row per customer with at least 3 t shipped in the selected date range, largest first. Shows the average sales order and average shipment in kg, order and shipment counts, median orders per shipment, median days the orders were placed apart, and tonnes shipped. Select a row to filter the page to that customer.">
            <ReportTable rows={d.customers} columns={cols} getRowId={(r) => r.id} bare pageSize={12} defaultSortKey="tonnes" defaultSortDir="desc" onRowClick={(r) => f.setValue('customer', String(r.id))} empty="Nothing for these filters." />
          </SectionCard>
          <Grid>
            <SectionCard title="Tonnes shipped, by orders in the shipment" info="Tonnes shipped in the selected date range, grouped by how many sales orders each shipment carried: 1, 2, 3, 4 to 5, or 6 or more."><RowBars rows={d.per.map((p) => ({ key: p.label, label: `${p.label} order${p.label === '1' ? '' : 's'}`, value: p.tonnes }))} format={(v) => `${num(v)} t`} /></SectionCard>
            <SectionCard title="Tonnes shipped, by how far apart its orders were placed" info="Tonnes shipped in the selected date range, grouped by the days between the first and last sales order date in each shipment, from same day to over 180 days."><RowBars rows={d.spread.map((p) => ({ key: p.label, label: p.label, value: p.tonnes }))} format={(v) => `${num(v)} t`} /></SectionCard>
          </Grid>
        </>
      )}
    </Page>
  );
}
