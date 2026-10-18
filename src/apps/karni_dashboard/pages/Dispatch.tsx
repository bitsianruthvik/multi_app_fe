import { useState } from 'react';
import { Box } from '@mui/material';
import { DataTable, DetailTabs, KpiGrid, KpiTile, SectionCard, type DataColumn } from '@shared/ui';
import { useReport, type DispatchReport } from '../api';
import { ReportPage, CardGrid } from '../components/ReportPage';
import { Donut, RankBars, TrendBars } from '../components/Charts';
import { useFilters } from '../filters';
import { dayLabel, inr, inrShort, qty, qtyShort } from '../format';

type Cust = DispatchReport['byCustomer'][number];
type Item = DispatchReport['byItem'][number];
type Doc = DispatchReport['documents'][number];

/** Deliveries: what left the gates, by day, customer and item. */
export default function Dispatch() {
  const f = useFilters('30d');
  const { data: d, error, loading, reload } = useReport<DispatchReport>(`/dispatch${f.query()}`);
  const [tab, setTab] = useState('customers');
  const custCols: DataColumn<Cust>[] = [
    { key: 'cardName', header: 'Customer', render: (r) => r.cardName, sortValue: (r) => r.cardName },
    { key: 'lines', header: 'Lines', numeric: true, align: 'right', render: (r) => r.lines, sortValue: (r) => r.lines },
    { key: 'qty', header: 'Quantity', numeric: true, align: 'right', render: (r) => qty(r.qty), sortValue: (r) => r.qty },
    { key: 'value', header: 'Value', numeric: true, align: 'right', render: (r) => inr(r.value), sortValue: (r) => r.value },
  ];
  const itemCols: DataColumn<Item>[] = [
    { key: 'itemCode', header: 'Item', render: (r) => r.itemCode, sortValue: (r) => r.itemCode },
    { key: 'itemName', header: 'Description', render: (r) => r.itemName, sortValue: (r) => r.itemName },
    { key: 'group', header: 'Group', render: (r) => r.group, sortValue: (r) => r.group },
    { key: 'qty', header: 'Quantity', numeric: true, align: 'right', render: (r) => `${qty(r.qty)} ${r.uom || ''}`, sortValue: (r) => r.qty },
    { key: 'value', header: 'Value', numeric: true, align: 'right', render: (r) => inr(r.value), sortValue: (r) => r.value },
  ];
  const docCols: DataColumn<Doc>[] = [
    { key: 'docDate', header: 'Date', render: (r) => r.docDate, sortValue: (r) => r.docDate },
    { key: 'docNum', header: 'Delivery', render: (r) => r.docNum, sortValue: (r) => r.docNum },
    { key: 'unit', header: 'Unit', render: (r) => r.unit || '—', sortValue: (r) => r.unit || '' },
    { key: 'cardName', header: 'Customer', render: (r) => r.cardName, sortValue: (r) => r.cardName },
    { key: 'qty', header: 'Quantity', numeric: true, align: 'right', render: (r) => qty(r.qty), sortValue: (r) => r.qty },
    { key: 'value', header: 'Value', numeric: true, align: 'right', render: (r) => inr(r.value), sortValue: (r) => r.value },
  ];
  return (
    <ReportPage title="Dispatch" subtitle={d ? `${d.from} to ${d.to}` : undefined} filters={f}
      asOf={d?.asOf} loading={loading} error={error} reload={reload} hasData={!!d}>
      {d && (
        <>
          <KpiGrid min={190}>
            <KpiTile label="Quantity dispatched" display={qtyShort(d.qty)} tone="primary" spark={d.daily.map((x) => x.qty)} />
            <KpiTile label="Value dispatched" display={inrShort(d.value)} spark={d.daily.map((x) => x.value)} />
            <KpiTile label="Deliveries" display={`${d.deliveries}`} />
            <KpiTile label="Customers served" display={`${d.customers}`} />
          </KpiGrid>
          <SectionCard title="Dispatch by day" subtitle={`${d.from} to ${d.to} · quantity`}>
            <TrendBars format={qtyShort} labels={d.daily.map((x) => dayLabel(x.date))} series={[{ label: 'Quantity', data: d.daily.map((x) => x.qty) }]} />
          </SectionCard>
          <CardGrid cols="1fr 1fr">
            <SectionCard title="Top customers" subtitle="By value dispatched">
              <RankBars rows={d.byCustomer.map((c) => ({ key: c.cardCode, label: c.cardName, value: c.value, sub: `${qty(c.qty)} qty` }))} format={inrShort} limit={8} />
            </SectionCard>
            <SectionCard title="By item group" subtitle="Quantity dispatched">
              <Donut data={d.byGroup.map((g) => ({ label: g.group, value: g.qty }))} format={qtyShort} />
            </SectionCard>
          </CardGrid>
          <SectionCard flush>
            <Box sx={{ px: 2, pt: 1 }}>
              <DetailTabs active={tab} onTab={setTab} tabs={[
                { value: 'customers', label: 'Customers', count: d.byCustomer.length },
                { value: 'items', label: 'Items', count: d.byItem.length },
                { value: 'docs', label: 'Deliveries', count: d.documents.length },
              ]} />
            </Box>
            {tab === 'customers' && <DataTable bare rows={d.byCustomer} columns={custCols} getRowId={(r) => r.cardCode} exportName="dispatch-by-customer" />}
            {tab === 'items' && <DataTable bare rows={d.byItem} columns={itemCols} getRowId={(r) => r.itemCode} storageKey="kd-dispatch-items" exportName="dispatch-by-item" />}
            {tab === 'docs' && <DataTable bare rows={d.documents} columns={docCols} getRowId={(r) => r.docEntry} exportName="delivery-register" />}
          </SectionCard>
        </>
      )}
    </ReportPage>
  );
}
