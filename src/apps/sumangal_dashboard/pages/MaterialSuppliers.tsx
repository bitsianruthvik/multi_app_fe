import { useState } from 'react';
import { Box, MenuItem, TextField, Typography } from '@mui/material';
import CurrencyRupeeRounded from '@mui/icons-material/CurrencyRupeeRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import CategoryRounded from '@mui/icons-material/CategoryRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import { KpiGrid, KpiTile, SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { crore, dayCount, monthLabel, num, pct } from '../format';
import { Bars, Grid, ReportTable, RowBars, ValueBar } from '../components/Charts';
import { Page } from '../components/Page';

interface Row { supplier: string; value: number; share: number | null; receipts: number; items: number; leadDays: number | null }
interface Item { item: string; group: string; qty: number; value: number; rate: number | null; prevRate: number | null; nowRate: number | null }
interface Span { first: string; last: string }
interface Report { kpis: { value: number; suppliers: number; topShare: number | null; topName: string | null; items: number; leadDays: number | null }; excluded: { lines: number; value: number; items: string[] }; rows: Row[]; groups: { group: string; value: number }[]; items: Item[]; months: { mo: string; value: number }[]; now: Span; prev: Span }
const span = (s: Span) => `${monthLabel(s.first)} to ${monthLabel(s.last)}`;

/** Scrap, alloys and other materials: who supplies them, for how much, and how quickly. */
export default function MaterialSuppliers() {
  const f = useFilters();
  const [group, setGroup] = useState('');
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/material-suppliers${f.query(group ? { group } : {})}` : null);
  const max = d ? Math.max(1, ...d.rows.map((r) => r.value)) : 1;
  const cols: DataColumn<Row>[] = [
    { key: 'supplier', header: 'Supplier', sortValue: (r) => r.supplier, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 600, maxWidth: 260 }} title={r.supplier}>{r.supplier}</Typography> },
    { key: 'value', header: 'Purchases', sortValue: (r) => r.value, render: (r) => <ValueBar value={r.value} max={max} label={`${crore(r.value)} · ${pct(r.share)}`} /> },
    { key: 'receipts', header: 'Receipts', numeric: true, align: 'right', sortValue: (r) => r.receipts, render: (r) => num(r.receipts) },
    { key: 'items', header: 'Items', numeric: true, align: 'right', sortValue: (r) => r.items, render: (r) => num(r.items) },
    { key: 'lead', header: 'Median days, PO to receipt', numeric: true, align: 'right', sortValue: (r) => r.leadDays, render: (r) => r.leadDays ?? '—' },
  ];
  const itemCols: DataColumn<Item>[] = [
    { key: 'item', header: 'Item', sortValue: (r) => r.item, render: (r) => <b>{r.item}</b> },
    { key: 'group', header: 'Group', sortValue: (r) => r.group, render: (r) => r.group },
    { key: 'value', header: 'Purchases', numeric: true, align: 'right', sortValue: (r) => r.value, render: (r) => crore(r.value) },
    { key: 'qty', header: 'Quantity', numeric: true, align: 'right', sortValue: (r) => r.qty, render: (r) => num(r.qty) },
    { key: 'rate', header: 'Average rate', numeric: true, align: 'right', sortValue: (r) => r.rate, render: (r) => (r.rate == null ? '—' : `₹${r.rate}`) },
    { key: 'trend', header: d ? `${span(d.prev)} → ${span(d.now)}` : 'Rate', numeric: true, align: 'right', render: (r) => { if (r.prevRate == null || r.nowRate == null) return '—'; const c = r.nowRate - r.prevRate; return <Box component="span" sx={{ fontWeight: 700, color: c > 0 ? 'var(--c-danger-600)' : c < 0 ? 'var(--c-success-600)' : undefined }}>₹{r.prevRate} → ₹{r.nowRate}</Box>; } },
  ];
  return (
    <Page title="Material suppliers" question="Who supplies materials, for how much, and how quickly." filters={f} filterKeys={[]} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote={`Purchases are inward quantity times rate. Days run from the purchase order date to the goods receipt, where the receipt names a purchase order line.${d?.excluded.lines ? ` ${num(d.excluded.lines)} inward lines with a rate over 100 times the item’s usual rate are typing errors and aren’t counted (${crore(d.excluded.value)}: ${d.excluded.items.join(', ')}).` : ''}`}>
      {d && (
        <>
          <TextField select size="small" label="Material group" value={group} onChange={(e) => setGroup(e.target.value)} sx={{ maxWidth: 240 }}>
            <MenuItem value="">All groups</MenuItem>
            {d.groups.map((g) => <MenuItem key={g.group} value={g.group}>{g.group}</MenuItem>)}
          </TextField>
          <KpiGrid>
            <KpiTile label="Purchases" info="Value, in ₹ crore, of material purchases (inward quantity times rate) dated in the selected date range. Rates that are typing errors are left out, and the Material group choice applies."icon={<CurrencyRupeeRounded />} display={crore(d.kpis.value)} />
            <KpiTile label="Suppliers" info="Number of suppliers with purchases in the selected date range and Material group. The footer is the largest supplier’s share of those purchases."icon={<GroupsRounded />} display={num(d.kpis.suppliers)} footer={d.kpis.topShare != null ? `Largest: ${d.kpis.topShare}%` : undefined} />
            <KpiTile label="Items bought" info="Number of different items bought in the selected date range and Material group."icon={<CategoryRounded />} display={num(d.kpis.items)} />
            <KpiTile label="PO to receipt" info="Median days from the purchase order date to the goods receipt, for receipts dated in the selected date range that name a purchase order line. It covers all materials, whatever Material group is picked."icon={<ScheduleRounded />} display={dayCount(d.kpis.leadDays)} footer="Median, all materials" />
          </KpiGrid>
          <SectionCard title="By supplier" flush info="One row per supplier with purchases in the selected date range and Material group, largest first. Receipts counts the inward documents, and Items counts the different items. Median days is purchase order to goods receipt for that supplier’s receipts in the date range."><ReportTable rows={d.rows} columns={cols} getRowId={(r) => r.supplier} bare pageSize={12} defaultSortKey="value" defaultSortDir="desc" empty="Nothing for this period." /></SectionCard>
          <Grid>
            <SectionCard title="By material group" info="Purchases in the selected date range for each material group, largest first. Click a group to filter the page to it. This list is not narrowed by the Material group choice."><RowBars rows={d.groups.map((g) => ({ key: g.group, label: g.group, value: g.value }))} format={crore} onClick={(k) => setGroup(group === k ? '' : k)} selected={group} /></SectionCard>
            <SectionCard title="Purchases by month" info="Purchases in ₹ crore by the month of the inward date, for the selected date range and Material group."><Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.value)} format={crore} height={260} /></SectionCard>
          </Grid>
          <SectionCard title="Top items and their rates" flush info="The 25 items with the highest purchases in the selected date range and Material group. Average rate is purchases divided by quantity for that range, in ₹ per item unit. Trend compares the average rate for the 6 full months before the data date with the 6 months before those, whatever the date range; red is up and green is down."><ReportTable rows={d.items} columns={itemCols} getRowId={(r) => r.item} bare pageSize={12} defaultSortKey="value" defaultSortDir="desc" /></SectionCard>
        </>
      )}
    </Page>
  );
}
