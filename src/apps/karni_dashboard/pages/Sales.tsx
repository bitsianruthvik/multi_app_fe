import { useState } from 'react';
import { Box, Stack, TextField, useTheme } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { DataTable, SectionCard, StatStrip, type DataColumn } from '@shared/ui';
import { useReport, type SalesReport } from '../api';
import { ReportPage } from '../components/ReportPage';
import { inr, inrShort, monthLabel } from '../format';

type Cust = SalesReport['customers'][number];
type Person = SalesReport['salesPersons'][number];
type Doc = SalesReport['documents'][number];

export default function Sales() {
  const theme = useTheme();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const { data, error, loading, reload } = useReport<SalesReport>(`/sales${q.toString() ? `?${q}` : ''}`);

  const custCols: DataColumn<Cust>[] = [
    { key: 'cardName', header: 'Customer', render: (r) => r.cardName, sortValue: (r) => r.cardName, alwaysVisible: true },
    { key: 'cardCode', header: 'Code', render: (r) => r.cardCode, sortValue: (r) => r.cardCode, defaultHidden: true },
    { key: 'docs', header: 'Documents', numeric: true, align: 'right', render: (r) => r.docs, sortValue: (r) => r.docs },
    { key: 'sales', header: 'Sales', numeric: true, align: 'right', render: (r) => inr(r.sales), sortValue: (r) => r.sales },
    { key: 'share', header: 'Share', numeric: true, align: 'right',
      render: (r) => (data?.total ? `${((r.sales / data.total) * 100).toFixed(1)}%` : '—'), sortValue: (r) => r.sales },
  ];
  const personCols: DataColumn<Person>[] = [
    { key: 'name', header: 'Sales employee', render: (r) => r.name, sortValue: (r) => r.name },
    { key: 'docs', header: 'Documents', numeric: true, align: 'right', render: (r) => r.docs, sortValue: (r) => r.docs },
    { key: 'sales', header: 'Sales', numeric: true, align: 'right', render: (r) => inr(r.sales), sortValue: (r) => r.sales },
  ];
  const docCols: DataColumn<Doc>[] = [
    { key: 'docDate', header: 'Date', render: (r) => r.docDate, sortValue: (r) => r.docDate },
    { key: 'kind', header: 'Type', render: (r) => r.kind, sortValue: (r) => r.kind },
    { key: 'docNum', header: 'No.', render: (r) => r.docNum, sortValue: (r) => r.docNum },
    { key: 'cardName', header: 'Customer', render: (r) => r.cardName, sortValue: (r) => r.cardName },
    { key: 'net', header: 'Excl. tax', numeric: true, align: 'right', render: (r) => inr(r.net), sortValue: (r) => r.net },
    { key: 'total', header: 'Incl. tax', numeric: true, align: 'right', render: (r) => inr(r.total), sortValue: (r) => r.total },
  ];

  return (
    <ReportPage title="Sales" subtitle={data ? `${data.from} to ${data.to}` : undefined}
      asOf={data?.asOf} loading={loading} error={error} reload={reload} hasData={!!data}
      actions={
        <Stack direction="row" spacing={1}>
          <TextField size="small" type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Stack>
      }>
      {data && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <StatStrip stats={[
            { label: 'Sales (excl. tax)', value: data.total, display: inrShort(data.total), tone: 'primary' },
            { label: 'Customers', value: data.customers.length },
            { label: 'Documents', value: data.documentCount },
            { label: 'Average per document', value: data.documentCount ? data.total / data.documentCount : 0,
              display: inrShort(data.documentCount ? data.total / data.documentCount : 0) },
          ]} />
          <SectionCard title="By month">
            <BarChart height={280}
              xAxis={[{ scaleType: 'band', data: data.monthly.map((m) => monthLabel(m.month)) }]}
              yAxis={[{ valueFormatter: (v: number) => inrShort(v), width: 72 }]}
              series={[{ data: data.monthly.map((m) => m.sales), label: 'Sales', color: theme.palette.primary.main, valueFormatter: (v) => inr(v ?? 0) }]}
              hideLegend />
          </SectionCard>
          <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' } }}>
            <SectionCard title="By customer" flush>
              <DataTable rows={data.customers} columns={custCols} getRowId={(r) => r.cardCode}
                storageKey="kd-sales-customers" exportName="sales-by-customer" bare />
            </SectionCard>
            <SectionCard title="By sales employee" flush>
              <DataTable rows={data.salesPersons} columns={personCols} getRowId={(r) => r.code}
                exportName="sales-by-employee" bare />
            </SectionCard>
          </Box>
          <SectionCard title="Documents" subtitle={data.documentCount > 500 ? `Latest 500 of ${data.documentCount}` : undefined} flush>
            <DataTable rows={data.documents} columns={docCols} getRowId={(r) => `${r.kind}-${r.docEntry}`}
              storageKey="kd-sales-docs" exportName="sales-documents" bare />
          </SectionCard>
        </Box>
      )}
    </ReportPage>
  );
}
