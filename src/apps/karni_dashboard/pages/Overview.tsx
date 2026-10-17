import { useNavigate } from 'react-router-dom';
import { Box, useTheme } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { DataTable, SectionCard, StatStrip, useCompanySlug, type DataColumn } from '@shared/ui';
import { useReport, type Overview as OverviewData } from '../api';
import { ReportPage } from '../components/ReportPage';
import { inr, inrShort, monthLabel } from '../format';

type Top = OverviewData['topCustomers'][number];

export default function Overview() {
  const { data, error, loading, reload } = useReport<OverviewData>('/overview');
  const theme = useTheme();
  const company = useCompanySlug();
  const navigate = useNavigate();
  const go = (p: string) => () => navigate(`/${company}/karni_dashboard/${p}`);

  const topCols: DataColumn<Top>[] = [
    { key: 'cardName', header: 'Customer', render: (r) => r.cardName, sortValue: (r) => r.cardName },
    { key: 'sales', header: 'Sales (excl. tax)', numeric: true, align: 'right', render: (r) => inr(r.sales), sortValue: (r) => r.sales },
  ];

  return (
    <ReportPage title="Overview" subtitle={data ? `Financial year from ${data.fyStart}` : undefined}
      asOf={data?.asOf} loading={loading} error={error} reload={reload} hasData={!!data}>
      {data && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <StatStrip stats={[
            { label: 'Sales today', value: data.salesToday, display: inrShort(data.salesToday), onClick: go('sales') },
            { label: 'Sales this month', value: data.salesMonth, display: inrShort(data.salesMonth), tone: 'primary', onClick: go('sales') },
            { label: 'Sales this year', value: data.salesFy, display: inrShort(data.salesFy), tone: 'primary', onClick: go('sales') },
            { label: 'Receivables', value: data.receivables, display: inrShort(data.receivables), onClick: go('receivables'),
              hint: `${inrShort(data.receivablesOverdue)} overdue` },
          ]} />
          <StatStrip stats={[
            { label: 'Overdue receivables', value: data.receivablesOverdue, display: inrShort(data.receivablesOverdue),
              tone: data.receivablesOverdue > 0 ? 'warning' : 'success', onClick: go('receivables') },
            { label: 'Open sales orders', value: data.openSalesOrders.count, display: `${data.openSalesOrders.count} · ${inrShort(data.openSalesOrders.value)}`,
              hint: `${data.openSalesOrders.late} past due date`, onClick: go('sales-orders') },
            { label: 'Open purchase orders', value: data.openPurchaseOrders.count, display: `${data.openPurchaseOrders.count} · ${inrShort(data.openPurchaseOrders.value)}`,
              hint: `${data.openPurchaseOrders.late} past due date`, onClick: go('purchase-orders') },
            { label: 'Payables', value: data.payables, display: inrShort(data.payables), onClick: go('payables') },
          ]} />
          <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' } }}>
            <SectionCard title="Sales by month" subtitle="Last 12 months, excl. tax, net of credit notes">
              <BarChart
                height={300}
                xAxis={[{ scaleType: 'band', data: data.monthly.map((m) => monthLabel(m.month)) }]}
                yAxis={[{ valueFormatter: (v: number) => inrShort(v), width: 72 }]}
                series={[{ data: data.monthly.map((m) => m.sales), label: 'Sales', color: theme.palette.primary.main, valueFormatter: (v) => inr(v ?? 0) }]}
                hideLegend
              />
            </SectionCard>
            <SectionCard title="Top customers this year" flush>
              <DataTable rows={data.topCustomers} columns={topCols} getRowId={(r) => r.cardCode} pageSize={10} bare />
            </SectionCard>
          </Box>
        </Box>
      )}
    </ReportPage>
  );
}
