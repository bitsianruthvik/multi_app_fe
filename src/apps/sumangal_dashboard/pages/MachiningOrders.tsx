import { Box, Typography } from '@mui/material';
import CurrencyRupeeRounded from '@mui/icons-material/CurrencyRupeeRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import InventoryRounded from '@mui/icons-material/InventoryRounded';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import { KpiGrid, KpiTile, SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { crore, dateLabel, monthLabel, num, pct } from '../format';
import { Bars, ReportTable, ValueBar } from '../components/Charts';
import { Page } from '../components/Page';

interface Row { vendor: string; lines: number; value: number; share: number | null; ordered: number; received: number; openPcs: number; pastPlanLines: number }
interface Open { key: string; no: string; vendor: string; part: string; date: string; planned: string | null; ordered: number; received: number; open: number; daysPastPlan: number }
interface Report { kpis: { value: number; lines: number; vendors: number; openPcs: number; pastPlanLines: number }; rows: Row[]; months: { mo: string; value: number }[]; openList: Open[] }

/** Machining purchase orders: value, quantities and what's still to come back. */
export default function MachiningOrders() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/machining-orders${f.query()}` : null);
  const max = d ? Math.max(1, ...d.rows.map((r) => r.value)) : 1;
  const cols: DataColumn<Row>[] = [
    { key: 'vendor', header: 'Vendor', sortValue: (r) => r.vendor, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 600, maxWidth: 260 }} title={r.vendor}>{r.vendor}</Typography> },
    { key: 'value', header: 'Order value', sortValue: (r) => r.value, render: (r) => <ValueBar value={r.value} max={max} label={`${crore(r.value)} · ${pct(r.share)}`} /> },
    { key: 'lines', header: 'Lines', numeric: true, align: 'right', sortValue: (r) => r.lines, render: (r) => num(r.lines) },
    { key: 'ordered', header: 'Ordered pcs', numeric: true, align: 'right', sortValue: (r) => r.ordered, render: (r) => num(r.ordered) },
    { key: 'received', header: 'Received pcs', numeric: true, align: 'right', sortValue: (r) => r.received, render: (r) => num(r.received) },
    { key: 'open', header: 'Open pcs', numeric: true, align: 'right', sortValue: (r) => r.openPcs, render: (r) => num(r.openPcs) },
    { key: 'past', header: 'Past planned date', numeric: true, align: 'right', sortValue: (r) => r.pastPlanLines, render: (r) => num(r.pastPlanLines) },
  ];
  const openCols: DataColumn<Open>[] = [
    { key: 'past', header: 'Days past plan', numeric: true, align: 'right', sortValue: (r) => r.daysPastPlan, render: (r) => (r.daysPastPlan ? <Box component="span" sx={{ color: 'var(--c-danger-600)', fontWeight: 700 }}>{r.daysPastPlan}</Box> : '—') },
    { key: 'planned', header: 'Planned date', sortValue: (r) => r.planned, render: (r) => dateLabel(r.planned) },
    { key: 'no', header: 'Order', sortValue: (r) => r.no, render: (r) => r.no },
    { key: 'vendor', header: 'Vendor', sortValue: (r) => r.vendor, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 190 }} title={r.vendor}>{r.vendor}</Typography> },
    { key: 'part', header: 'Part', sortValue: (r) => r.part, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 220 }} title={r.part}>{r.part}</Typography> },
    { key: 'open', header: 'Open pcs', numeric: true, align: 'right', sortValue: (r) => r.open, render: (r) => num(r.open) },
    { key: 'of', header: 'Of ordered', numeric: true, align: 'right', sortValue: (r) => r.ordered, render: (r) => num(r.ordered) },
  ];
  return (
    <Page title="Machining orders" question="What's on order with machining vendors, and what's still to come back." filters={f} filterKeys={[]} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote="From the ERP’s machining purchase orders, by order date. Open pieces are ordered minus received. Planned date is the completion date on the order line.">
      {d && (
        <>
          <KpiGrid>
            <KpiTile label="Order value" icon={<CurrencyRupeeRounded />} display={crore(d.kpis.value)} footer={`${num(d.kpis.vendors)} vendors`} />
            <KpiTile label="Order lines" icon={<ReceiptLongRounded />} display={num(d.kpis.lines)} />
            <KpiTile label="Open pieces" icon={<InventoryRounded />} display={num(d.kpis.openPcs)} />
            <KpiTile label="Open lines past planned date" icon={<EventBusyRounded />} display={num(d.kpis.pastPlanLines)} tone={d.kpis.pastPlanLines ? 'danger' : 'default'} />
          </KpiGrid>
          <SectionCard title="By vendor" flush><ReportTable rows={d.rows} columns={cols} getRowId={(r) => r.vendor} bare pageSize={12} defaultSortKey="value" defaultSortDir="desc" empty="No orders for this period." /></SectionCard>
          <SectionCard title="Order value by month"><Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.value)} format={crore} height={220} /></SectionCard>
          <SectionCard title="Open order lines" subtitle="Longest past planned date first" flush><ReportTable rows={d.openList} columns={openCols} getRowId={(r) => r.key} bare pageSize={12} defaultSortKey="past" defaultSortDir="desc" empty="No open lines." /></SectionCard>
        </>
      )}
    </Page>
  );
}
