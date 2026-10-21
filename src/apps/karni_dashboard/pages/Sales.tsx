import { useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { DetailTabs, KpiGrid, KpiTile, SectionCard, SideSheet, type DataColumn } from '@shared/ui';
import { ReportTable } from '../components/ReportTable';
import { useReport, type CustomerSales, type SalesReport } from '../api';
import { ReportPage, CardGrid } from '../components/ReportPage';
import { Donut, RankBars, TrendBars } from '../components/Charts';
import { useFilters } from '../filters';
import { dayLabel, inr, inrShort, monthLabel, qty, qtyShort } from '../format';

type Cust = SalesReport['customers'][number];
type Item = SalesReport['items'][number];
type Person = SalesReport['salesPersons'][number];
type Doc = SalesReport['documents'][number];

export default function Sales() {
  const f = useFilters('fy');
  const { data: d, error, loading, reload } = useReport<SalesReport>(`/sales${f.query()}`);
  const [tab, setTab] = useState('customers');
  const [customer, setCustomer] = useState<string | null>(null);
  const share = (v: number) => (d?.total ? `${((v / d.total) * 100).toFixed(1)}%` : '—');

  const custCols: DataColumn<Cust>[] = [
    { key: 'cardName', header: 'Customer', render: (r) => r.cardName, sortValue: (r) => r.cardName, exportValue: (r) => r.cardName, alwaysVisible: true },
    { key: 'cardCode', header: 'Code', render: (r) => r.cardCode, sortValue: (r) => r.cardCode, defaultHidden: true },
    { key: 'docs', header: 'Documents', numeric: true, align: 'right', render: (r) => r.docs, sortValue: (r) => r.docs },
    { key: 'sales', header: 'Sales', numeric: true, align: 'right', render: (r) => inr(r.sales), sortValue: (r) => r.sales },
    { key: 'share', header: 'Share', numeric: true, align: 'right', render: (r) => share(r.sales), sortValue: (r) => r.sales },
  ];
  const itemCols: DataColumn<Item>[] = [
    { key: 'itemCode', header: 'Item', render: (r) => r.itemCode, sortValue: (r) => r.itemCode },
    { key: 'itemName', header: 'Description', render: (r) => r.itemName, sortValue: (r) => r.itemName },
    { key: 'group', header: 'Group', render: (r) => r.group, sortValue: (r) => r.group },
    { key: 'qty', header: 'Quantity', numeric: true, align: 'right', render: (r) => `${qty(r.qty)} ${r.uom || ''}`, sortValue: (r) => r.qty },
    { key: 'sales', header: 'Sales', numeric: true, align: 'right', render: (r) => inr(r.sales), sortValue: (r) => r.sales },
    { key: 'rate', header: 'Avg rate', numeric: true, align: 'right', render: (r) => (r.qty ? inr(r.sales / r.qty) : '—'), sortValue: (r) => (r.qty ? r.sales / r.qty : 0) },
  ];
  const personCols: DataColumn<Person>[] = [
    { key: 'name', header: 'Sales employee', render: (r) => r.name, sortValue: (r) => r.name },
    { key: 'docs', header: 'Documents', numeric: true, align: 'right', render: (r) => r.docs, sortValue: (r) => r.docs },
    { key: 'sales', header: 'Sales', numeric: true, align: 'right', render: (r) => inr(r.sales), sortValue: (r) => r.sales },
    { key: 'share', header: 'Share', numeric: true, align: 'right', render: (r) => share(r.sales), sortValue: (r) => r.sales },
  ];
  const docCols: DataColumn<Doc>[] = [
    { key: 'docDate', header: 'Date', render: (r) => r.docDate, sortValue: (r) => r.docDate },
    { key: 'kind', header: 'Type', render: (r) => r.kind, sortValue: (r) => r.kind },
    { key: 'docNum', header: 'No.', render: (r) => r.docNum, sortValue: (r) => r.docNum },
    { key: 'unit', header: 'Unit', render: (r) => r.unit || '—', sortValue: (r) => r.unit || '' },
    { key: 'cardName', header: 'Customer', render: (r) => r.cardName, sortValue: (r) => r.cardName },
    { key: 'net', header: 'Items', numeric: true, align: 'right', render: (r) => inr(r.net), sortValue: (r) => r.net },
    { key: 'charges', header: 'Charges', numeric: true, align: 'right', render: (r) => (r.charges ? inr(r.charges) : '—'), sortValue: (r) => r.charges, defaultHidden: true },
    { key: 'tax', header: 'Tax', numeric: true, align: 'right', render: (r) => inr(r.tax), sortValue: (r) => r.tax, defaultHidden: true },
    { key: 'total', header: 'Incl. tax', numeric: true, align: 'right', render: (r) => inr(r.total), sortValue: (r) => r.total },
  ];
  const daily = !!d && d.daily.length > 0;

  return (
    <ReportPage title="Sales" subtitle={d ? `${d.from} to ${d.to}` : undefined} filters={f}
      asOf={d?.asOf} loading={loading} error={error} reload={reload} hasData={!!d}>
      {d && (
        <>
          <KpiGrid min={180}>
            <KpiTile label="Sales (items, excl. tax)" display={inrShort(d.total)} tone="primary" spark={(daily ? d.daily : d.monthly).map((x) => x.sales)}
              hint="Item line totals of invoices minus credit notes, as SAP's sales reports count them. Freight and other charges on the invoice are not included."
              footer={`Invoiced ${inrShort(d.invoiced)} − credit notes ${inrShort(d.creditNotes)}${d.interUnit ? ` · excludes ${inrShort(d.interUnit)} inter-unit` : ''}`} />
            <KpiTile label="Tax" display={inrShort(d.tax)} footer={d.charges ? `Freight and other charges ${inrShort(d.charges)}` : undefined} />
            <KpiTile label="Quantity sold" display={qtyShort(d.qty)} />
            <KpiTile label="Customers" display={`${d.customerCount}`} />
            <KpiTile label="Invoices and credit notes" display={`${d.documentCount}`} footer={`Avg ${inrShort(d.documentCount ? d.total / d.documentCount : 0)} per document`} />
          </KpiGrid>
          <SectionCard title={daily ? 'Sales by day' : 'Sales by month'} subtitle={`${d.from} to ${d.to}`}>
            <TrendBars format={inrShort}
              labels={daily ? d.daily.map((x) => dayLabel(x.date)) : d.monthly.map((m) => monthLabel(m.month))}
              series={[{ label: 'Sales', data: daily ? d.daily.map((x) => x.sales) : d.monthly.map((m) => m.sales) }]} />
          </SectionCard>
          <CardGrid cols="1fr 1fr 1fr">
            <SectionCard title="By unit"><Donut height={180} data={d.byUnit.map((u) => ({ label: u.unit, value: u.sales }))} format={inrShort} /></SectionCard>
            <SectionCard title="By item group"><Donut height={180} data={d.itemGroups.map((g) => ({ label: g.group, value: g.sales }))} format={inrShort} /></SectionCard>
            <SectionCard title="Top customers"><RankBars limit={6} rows={d.customers.map((c) => ({ key: c.cardCode, label: c.cardName, value: c.sales }))} format={inrShort} onClick={setCustomer} /></SectionCard>
          </CardGrid>
          <SectionCard flush>
            <Box sx={{ px: 2, pt: 1 }}>
              <DetailTabs active={tab} onTab={setTab} tabs={[
                { value: 'customers', label: 'Customers', count: d.customers.length },
                { value: 'items', label: 'Items', count: d.items.length },
                { value: 'people', label: 'Sales employees', count: d.salesPersons.length },
                { value: 'docs', label: 'Documents', count: d.documentCount },
              ]} />
            </Box>
            {tab === 'customers' && <ReportTable bare rows={d.customers} columns={custCols} getRowId={(r) => r.cardCode} onRowClick={(r) => setCustomer(r.cardCode)} storageKey="kd-sales-cust" exportName="sales-by-customer" />}
            {tab === 'items' && <ReportTable bare rows={d.items} columns={itemCols} getRowId={(r) => r.itemCode} storageKey="kd-sales-items" exportName="sales-by-item" />}
            {tab === 'people' && <ReportTable bare rows={d.salesPersons} columns={personCols} getRowId={(r) => r.code} exportName="sales-by-employee" />}
            {tab === 'docs' && <ReportTable bare rows={d.documents} columns={docCols} getRowId={(r) => `${r.kind}-${r.docEntry}`} storageKey="kd-sales-docs" exportName="sales-register" />}
          </SectionCard>
          <CustomerSheet cardCode={customer} query={f.query()} onClose={() => setCustomer(null)} />
        </>
      )}
    </ReportPage>
  );
}

function CustomerSheet({ cardCode, query, onClose }: { cardCode: string | null; query: string; onClose: () => void }) {
  const { data } = useReport<CustomerSales>(cardCode ? `/sales/customer/${encodeURIComponent(cardCode)}${query}` : null, false);
  const c = cardCode && data?.cardCode === cardCode ? data : null;
  return (
    <SideSheet open={!!cardCode} onClose={onClose} title={c?.cardName || 'Customer'} subtitle={c ? `${c.from} to ${c.to}` : undefined} width={560}>
      {c && (
        <Stack spacing={2.5}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
            <Fig label="Sales" value={inrShort(c.total)} />
            <Fig label="Account balance" value={inrShort(c.balance)} />
            <Fig label="Credit limit" value={c.creditLimit ? inrShort(c.creditLimit) : '—'} />
          </Box>
          <TrendBars height={180} format={inrShort} labels={c.monthly.map((m) => monthLabel(m.month))} series={[{ label: 'Sales', data: c.monthly.map((m) => m.sales) }]} />
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 1 }}>Items bought</Typography>
            <RankBars limit={25} rows={c.items.map((i) => ({ key: i.itemCode, label: i.itemName, value: i.sales, sub: `${qty(i.qty)} ${i.uom || ''}` }))} format={inrShort} />
          </Box>
        </Stack>
      )}
    </SideSheet>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ p: 1.25, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)' }}>
      <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>{label}</Typography>
      <Typography sx={{ fontSize: 17, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{value}</Typography>
    </Box>
  );
}
