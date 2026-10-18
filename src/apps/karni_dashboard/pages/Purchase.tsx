import { useState } from 'react';
import { Box } from '@mui/material';
import { DataTable, DetailTabs, KpiGrid, KpiTile, SectionCard, ToneBadge, type DataColumn } from '@shared/ui';
import { useReport, type PurchaseReport } from '../api';
import { ReportPage, CardGrid } from '../components/ReportPage';
import { Donut, Meter, RankBars, TrendBars } from '../components/Charts';
import { useFilters } from '../filters';
import { dayLabel, inr, inrShort, monthLabel, pct, qty } from '../format';

type Vendor = PurchaseReport['byVendor'][number];
type Item = PurchaseReport['byItem'][number];
type Fill = PurchaseReport['poVsGrn']['vendors'][number];
type Line = PurchaseReport['poVsGrn']['lines'][number];

/** Purchase register, PO vs GRN and goods received. */
export default function Purchase() {
  const f = useFilters('fy');
  const { data: d, error, loading, reload } = useReport<PurchaseReport>(`/purchase${f.query()}`);
  const [tab, setTab] = useState('vendors');
  const fill = d && d.poVsGrn.ordered ? (d.poVsGrn.received / d.poVsGrn.ordered) * 100 : null;
  const vendorCols: DataColumn<Vendor>[] = [
    { key: 'cardName', header: 'Vendor', render: (r) => r.cardName, sortValue: (r) => r.cardName },
    { key: 'lines', header: 'Lines', numeric: true, align: 'right', render: (r) => r.lines, sortValue: (r) => r.lines },
    { key: 'qty', header: 'Quantity', numeric: true, align: 'right', render: (r) => qty(r.qty), sortValue: (r) => r.qty },
    { key: 'spend', header: 'Spend (excl. tax)', numeric: true, align: 'right', render: (r) => inr(r.spend), sortValue: (r) => r.spend },
  ];
  const itemCols: DataColumn<Item>[] = [
    { key: 'itemCode', header: 'Item', render: (r) => r.itemCode, sortValue: (r) => r.itemCode },
    { key: 'itemName', header: 'Description', render: (r) => r.itemName, sortValue: (r) => r.itemName },
    { key: 'group', header: 'Group', render: (r) => r.group, sortValue: (r) => r.group },
    { key: 'qty', header: 'Quantity', numeric: true, align: 'right', render: (r) => `${qty(r.qty)} ${r.uom || ''}`, sortValue: (r) => r.qty },
    { key: 'avgPrice', header: 'Avg price', numeric: true, align: 'right', render: (r) => (r.avgPrice != null ? inr(r.avgPrice) : '—'), sortValue: (r) => r.avgPrice ?? 0 },
    { key: 'spend', header: 'Spend', numeric: true, align: 'right', render: (r) => inr(r.spend), sortValue: (r) => r.spend },
  ];
  const fillCols: DataColumn<Fill>[] = [
    { key: 'cardName', header: 'Vendor', render: (r) => r.cardName, sortValue: (r) => r.cardName },
    { key: 'lines', header: 'PO lines', numeric: true, align: 'right', render: (r) => r.lines, sortValue: (r) => r.lines },
    { key: 'ordered', header: 'Ordered', numeric: true, align: 'right', render: (r) => qty(r.ordered), sortValue: (r) => r.ordered },
    { key: 'received', header: 'Received', numeric: true, align: 'right', render: (r) => qty(r.received), sortValue: (r) => r.received },
    { key: 'pending', header: 'Pending', numeric: true, align: 'right', render: (r) => qty(r.pending), sortValue: (r) => r.pending },
    { key: 'fill', header: 'Fill rate', render: (r) => <Meter pct={r.fill ?? 0} tone={(r.fill ?? 0) >= 90 ? 'success' : (r.fill ?? 0) >= 60 ? 'warning' : 'danger'} />, sortValue: (r) => r.fill ?? 0, exportValue: (r) => r.fill ?? '' },
    { key: 'late', header: 'Late lines', numeric: true, align: 'right', render: (r) => r.late || '—', sortValue: (r) => r.late },
  ];
  const lineCols: DataColumn<Line>[] = [
    { key: 'docNum', header: 'PO', render: (r) => r.docNum, sortValue: (r) => r.docNum },
    { key: 'docDate', header: 'Date', render: (r) => r.docDate, sortValue: (r) => r.docDate },
    { key: 'unit', header: 'Unit', render: (r) => r.unit || '—', sortValue: (r) => r.unit || '' },
    { key: 'cardName', header: 'Vendor', render: (r) => r.cardName, sortValue: (r) => r.cardName },
    { key: 'itemName', header: 'Item', render: (r) => r.itemName, sortValue: (r) => r.itemName },
    { key: 'ordered', header: 'Ordered', numeric: true, align: 'right', render: (r) => qty(r.ordered), sortValue: (r) => r.ordered },
    { key: 'received', header: 'Received', numeric: true, align: 'right', render: (r) => qty(r.received), sortValue: (r) => r.received },
    { key: 'pending', header: 'Pending', numeric: true, align: 'right', render: (r) => `${qty(r.pending)} ${r.uom || ''}`, sortValue: (r) => r.pending },
    { key: 'shipDate', header: 'Due', render: (r) => r.shipDate || '—', sortValue: (r) => r.shipDate || '' },
    { key: 'late', header: 'Status', render: (r) => <ToneBadge label={r.late ? 'Late' : 'Open'} tone={r.late ? 'warning' : 'info'} />, sortValue: (r) => (r.late ? 1 : 0) },
  ];
  return (
    <ReportPage title="Purchase" subtitle={d ? `${d.from} to ${d.to}` : undefined} filters={f}
      asOf={d?.asOf} loading={loading} error={error} reload={reload} hasData={!!d}>
      {d && (
        <>
          <KpiGrid min={190}>
            <KpiTile label="Purchases (excl. tax)" display={inrShort(d.spend)} tone="primary" spark={d.monthly.map((m) => m.spend)} />
            <KpiTile label="Vendors" display={`${d.vendors}`} footer={`${d.invoices} A/P invoices`} />
            <KpiTile label="PO fill rate" display={pct(fill)} tone={fill != null && fill < 80 ? 'warning' : 'success'} footer="Received ÷ ordered, POs in this period" />
            <KpiTile label="Late PO lines" display={`${d.poVsGrn.lateLines}`} tone={d.poVsGrn.lateLines ? 'danger' : 'success'} onClick={() => setTab('pending')} />
          </KpiGrid>
          <CardGrid cols="3fr 2fr">
            <SectionCard title="Purchases by month" subtitle={`${d.from} to ${d.to}`}>
              <TrendBars format={inrShort} labels={d.monthly.map((m) => monthLabel(m.month))} series={[{ label: 'Purchases', data: d.monthly.map((m) => m.spend) }]} />
            </SectionCard>
            <SectionCard title="By item group"><Donut data={d.byGroup.map((g) => ({ label: g.group, value: g.spend }))} format={inrShort} /></SectionCard>
          </CardGrid>
          <CardGrid cols="1fr 1fr">
            <SectionCard title="Goods received" subtitle="Last 30 days · GRN value">
              <TrendBars height={220} format={inrShort} labels={d.grnDaily.map((x) => dayLabel(x.date))} series={[{ label: 'GRN', data: d.grnDaily.map((x) => x.value) }]} />
            </SectionCard>
            <SectionCard title="Top vendors" subtitle="By spend">
              <RankBars rows={d.byVendor.map((v) => ({ key: v.cardCode, label: v.cardName, value: v.spend }))} format={inrShort} limit={7} />
            </SectionCard>
          </CardGrid>
          <SectionCard flush>
            <Box sx={{ px: 2, pt: 1 }}>
              <DetailTabs active={tab} onTab={setTab} tabs={[
                { value: 'vendors', label: 'Vendors', count: d.byVendor.length },
                { value: 'items', label: 'Items', count: d.byItem.length },
                { value: 'fill', label: 'PO vs GRN', count: d.poVsGrn.vendors.length },
                { value: 'pending', label: 'Pending PO lines', count: d.poVsGrn.lines.length },
              ]} />
            </Box>
            {tab === 'vendors' && <DataTable bare rows={d.byVendor} columns={vendorCols} getRowId={(r) => r.cardCode} exportName="purchase-by-vendor" />}
            {tab === 'items' && <DataTable bare rows={d.byItem} columns={itemCols} getRowId={(r) => r.itemCode} storageKey="kd-purchase-items" exportName="purchase-by-item" />}
            {tab === 'fill' && <DataTable bare rows={d.poVsGrn.vendors} columns={fillCols} getRowId={(r) => r.cardCode} exportName="po-vs-grn" />}
            {tab === 'pending' && <DataTable bare rows={d.poVsGrn.lines} columns={lineCols} getRowId={(r) => `${r.docEntry}-${r.lineNum}`} storageKey="kd-po-lines" exportName="pending-po-lines" />}
          </SectionCard>
        </>
      )}
    </ReportPage>
  );
}
