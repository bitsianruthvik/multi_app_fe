import { useNavigate } from 'react-router-dom';
import { Box, Stack, Typography } from '@mui/material';
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded';
import CalendarTodayRounded from '@mui/icons-material/CalendarTodayRounded';
import SavingsRounded from '@mui/icons-material/SavingsRounded';
import AccountBalanceWalletRounded from '@mui/icons-material/AccountBalanceWalletRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import ShoppingCartRounded from '@mui/icons-material/ShoppingCartRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import { KpiTile, KpiGrid, SectionCard, pctChange, useCompanySlug } from '@shared/ui';
import { useReport, type DueSoon, type Overview as OverviewData } from '../api';
import { ReportPage, CardGrid } from '../components/ReportPage';
import { TrendBars, Donut, RankBars, SplitBar } from '../components/Charts';
import { useFilters } from '../filters';
import { inr, inrShort, monthLabel, qtyShort } from '../format';

/** A comparison is shown only when the earlier period has real data (at least 5% of now). */
const comparable = (now: number, before: number) => before > Math.abs(now) * 0.05;

export default function Overview() {
  const f = useFilters();
  const { data, error, loading, reload } = useReport<OverviewData>(`/overview${f.query(false)}`);
  const company = useCompanySlug();
  const navigate = useNavigate();
  const go = (p: string) => () => navigate(`/${company}/karni_dashboard/${p}`);
  const d = data;

  return (
    <ReportPage title="Overview" subtitle={d ? `Financial year from ${d.fyStart}` : undefined} filters={f} range={false}
      asOf={d?.asOf} loading={loading} error={error} reload={reload} hasData={!!d}>
      {d && (
        <>
          <KpiGrid>
            <KpiTile label="Sales this month" icon={<TrendingUpRounded />} display={inrShort(d.salesMonth)} tone="primary" onClick={go('sales?range=month')}
              delta={{ pct: pctChange(d.salesMonth, d.salesPrevMonthSamePeriod), label: 'vs same days last month' }}
              spark={d.daily.map((x) => x.sales)} hint="Excl. tax, net of credit notes. Sparkline: last 30 days" />
            <KpiTile label="Sales this financial year" icon={<CalendarTodayRounded />} display={inrShort(d.salesFy)} onClick={go('sales')}
              delta={{ pct: comparable(d.salesFy, d.salesPrevFySamePeriod) ? pctChange(d.salesFy, d.salesPrevFySamePeriod) : null, label: comparable(d.salesFy, d.salesPrevFySamePeriod) ? 'vs same period last year' : 'no comparable data last year in SAP' }}
              footer={d.interUnitFy ? `Excludes ${inrShort(d.interUnitFy)} inter-unit billing` : undefined}
              spark={d.monthly.map((m) => m.sales)} />
            <KpiTile label="Collections this month" icon={<SavingsRounded />} display={inrShort(d.collectionsMonth)} onClick={go('receivables')}
              spark={d.monthly.map((m) => m.collections)} footer={`Sales today ${inrShort(d.salesToday)}`} />
            <KpiTile label="Receivables" icon={<AccountBalanceWalletRounded />} display={inrShort(d.receivables)} onClick={go('receivables')}
              tone={d.receivablesOverdue > 0 ? 'warning' : 'default'}
              footer={<><b style={{ color: 'var(--c-warning-600)' }}>{inrShort(d.receivablesOverdue)}</b> overdue</>} />
          </KpiGrid>
          <KpiGrid>
            <KpiTile label="Open sales orders" icon={<ReceiptLongRounded />} display={`${d.openSalesOrders.count}`} onClick={go('sales-orders')}
              footer={<>{inrShort(d.openSalesOrders.value)} · <b style={{ color: d.openSalesOrders.late ? 'var(--c-danger-600)' : undefined }}>{d.openSalesOrders.late} past due</b></>} />
            <KpiTile label="Open purchase orders" icon={<ShoppingCartRounded />} display={`${d.openPurchaseOrders.count}`} onClick={go('purchase')}
              footer={<>{inrShort(d.openPurchaseOrders.value)} · {d.openPurchaseOrders.late} past due</>} />
            <KpiTile label="Production this month" icon={<PrecisionManufacturingRounded />} display={qtyShort(d.productionMonthQty)} onClick={go('production?range=month')}
              footer="Output from production receipts (kg)" />
            <KpiTile label="Payables" icon={<PaymentsRounded />} display={inrShort(d.payables)} onClick={go('payables')}
              footer={<>{inrShort(d.payablesOverdue)} overdue · paid {inrShort(d.paymentsMonth)} this month</>} />
          </KpiGrid>

          <SectionCard title="Today" subtitle={d.today}>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' } }}>
              <TodayFigure label="Sales orders booked" value={`${d.todayActivity.ordersCount}`} sub={inrShort(d.todayActivity.ordersValue)} onClick={go('sales-orders')} />
              <TodayFigure label="Deliveries" value={`${d.todayActivity.deliveriesCount}`} sub={`${qtyShort(d.todayActivity.deliveriesQty)} qty`} onClick={go('dispatch?range=today')} />
              <TodayFigure label="Goods received (GRN)" value={`${d.todayActivity.grnCount}`} sub={inrShort(d.todayActivity.grnValue)} onClick={go('purchase')} />
              <TodayFigure label="Production output" value={qtyShort(d.todayActivity.productionQty)} sub={`${d.todayActivity.productionDocs} receipts`} onClick={go('production?range=today')} />
            </Box>
          </SectionCard>

          <CardGrid cols="3fr 2fr">
            <SectionCard title="Sales and collections" subtitle="Last 12 months · sales excl. tax, net of credit notes">
              <TrendBars labels={d.monthly.map((m) => monthLabel(m.month))} format={inrShort}
                series={[{ label: 'Sales', data: d.monthly.map((m) => m.sales) }, { label: 'Collections', data: d.monthly.map((m) => m.collections) }]} />
            </SectionCard>
            <SectionCard title="Sales by unit" subtitle="This financial year">
              <Donut data={d.byUnit.map((u) => ({ label: u.unit, value: u.sales }))} format={inrShort}
                center={<Box><Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>Total</Typography>
                  <Typography sx={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{inrShort(d.salesFy)}</Typography></Box>} />
            </SectionCard>
          </CardGrid>

          <CardGrid cols="1fr 1fr">
            <SectionCard title="Top customers" subtitle="This financial year, excl. tax">
              <RankBars rows={d.topCustomers.map((c) => ({ key: c.cardCode, label: c.cardName, value: c.sales }))} format={inrShort}
                onClick={() => navigate(`/${company}/karni_dashboard/sales`)} />
            </SectionCard>
            <SectionCard title="Receivables by age" subtitle="Open A/R invoices, days past due date">
              <SplitBar format={inrShort} parts={[
                { label: 'Not due', value: d.receivablesAgeing.notDue, color: 'var(--c-success-600)' },
                { label: '1–30', value: d.receivablesAgeing.d0_30, color: 'var(--c-info-600)' },
                { label: '31–60', value: d.receivablesAgeing.d31_60, color: 'var(--c-warning-600)' },
                { label: '61–90', value: d.receivablesAgeing.d61_90, color: 'var(--c-chart-7)' },
                { label: '90+', value: d.receivablesAgeing.d90plus, color: 'var(--c-danger-600)' },
              ]} />
              <Box sx={{ mt: 3, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                <DueList title="Customers to pay in the next 7 days" due={d.dueIn7Receivable} onClick={go('receivables')} />
                <DueList title="We pay vendors in the next 7 days" due={d.dueIn7Payable} onClick={go('payables')} />
              </Box>
            </SectionCard>
          </CardGrid>
        </>
      )}
    </ReportPage>
  );
}

function TodayFigure({ label, value, sub, onClick }: { label: string; value: string; sub: string; onClick: () => void }) {
  return (
    <Box onClick={onClick} sx={{ cursor: 'pointer', p: 1.5, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)', '&:hover': { background: 'var(--c-primary-50)' } }}>
      <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{label}</Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{value}</Typography>
      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{sub}</Typography>
    </Box>
  );
}

function DueList({ title, due, onClick }: { title: string; due: DueSoon; onClick: () => void }) {
  return (
    <Box onClick={onClick} sx={{ cursor: 'pointer' }}>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 0.5 }}>{title}</Typography>
      <Typography sx={{ fontSize: 20, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{inrShort(due.amount)}</Typography>
      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 1 }}>{due.count} invoices</Typography>
      <Stack spacing={0.5}>
        {due.docs.slice(0, 4).map((x) => (
          <Stack key={x.docEntry} direction="row" spacing={1} sx={{ fontSize: 12 }}>
            <Typography noWrap sx={{ fontSize: 12, flex: 1, minWidth: 0 }}>{x.cardName}</Typography>
            <Typography sx={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{inr(x.balance)}</Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
