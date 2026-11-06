import type { ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { SectionCard } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { crore, dayCount, monthLabel, num, pct, perKg, tonnes } from '../format';
import { Bars, Grid } from '../components/Charts';
import { Page } from '../components/Page';

interface Summary {
  sales: { sales: number; pricePerKg: number | null; customers: number; topShare: number | null; topName: string | null };
  delivery: { onTimePct: number | null; lines: number; medianDelay: number | null; openTonnes: number | null; openLines: number; overdueTonnes: number | null; overdueLines: number };
  actions: { pastDue: number; pastDueT: number | null; dueNotPoured: number; waitingAfterPour: number; waitingAfterPourT: number | null; readyToShip: number };
  production: { pouredT: number | null; rejectionPct: number | null; rejectedKg: number; orderToShip: number | null; promised: number | null; pourToPass: number | null; slowPourToPass: number | null };
  shipping: { dispatchedT: number | null; shipments: number; readyT: number; readyPastDueT: number; pastUsualSlot: number; regularCustomers: number; missedWithStock: number };
  vendors: { sentT: number | null; medianDays: number | null; notBackT: number | null; oldNotBackT: number | null; purchases: number; suppliers: number };
  months: { mo: string; sales: number; dispatchedT: number | null }[];
}
type Tone = 'good' | 'bad' | undefined;
const TONE = { good: 'var(--c-success-600)', bad: 'var(--c-danger-600)' };

/** One figure, what it means, and a way into the screen that explains it. */
function Metric({ label, value, sub, to, tone }: { label: string; value: ReactNode; sub?: ReactNode; to: string; tone?: Tone }) {
  const go = useGo();
  return (
    <Box onClick={() => go(to)} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go(to)}
      sx={{ cursor: 'pointer', p: 2, borderRadius: 2, border: '1px solid var(--c-border)', background: 'var(--c-surface)', display: 'flex', flexDirection: 'column', gap: 0.5, minHeight: 132, transition: 'border-color .15s, box-shadow .15s', '&:hover': { borderColor: 'var(--c-primary-500)', boxShadow: '0 2px 10px rgba(0,0,0,.06)' }, '&:focus-visible': { outline: '2px solid var(--c-primary-500)' } }}>
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', fontWeight: 600 }}>{label}</Typography>
      <Typography sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums', color: tone ? TONE[tone] : 'var(--c-text)' }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', lineHeight: 1.4 }}>{sub}</Typography>}
      <Box sx={{ flex: 1 }} />
      <Button size="small" endIcon={<ArrowForwardRounded fontSize="small" />} sx={{ alignSelf: 'flex-start', px: 0, minWidth: 0, textTransform: 'none', fontWeight: 600 }} tabIndex={-1}>View details</Button>
    </Box>
  );
}
/** Goes to another screen of the dashboard, keeping the period and filters chosen here. */
function useGo() {
  const navigate = useNavigate(); const { company } = useParams(); const { search } = useLocation();
  return (path: string) => navigate(`/${company}/sumangal_dashboard/${path}${search}`);
}
const Row = ({ children }: { children: ReactNode }) => <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0,1fr))', lg: 'repeat(4, minmax(0,1fr))' } }}>{children}</Box>;

/** The key figures of the whole dashboard on one page, each a way into its detailed screen. */
export default function KeyMetrics() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Summary>(f.ready ? `/summary${f.query()}` : null);
  const go = useGo();
  return (
    <Page title="Key metrics" question="The main figures for the period. Select any of them for the screen behind it." filters={f} filterKeys={['customer', 'market', 'finish', 'metal']} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote="Each figure comes from the same report as the screen it opens, with the same period and filters. On time means an order line's full quantity was dispatched by its delivery date.">
      {d && (
        <>
          <SectionCard title="Sales and delivery">
            <Row>
              <Metric label="Sales" value={crore(d.sales.sales)} sub={`${perKg(d.sales.pricePerKg)} a kg · ${num(d.sales.customers)} customers`} to="customers" />
              <Metric label="Largest customer" value={pct(d.sales.topShare)} sub={`${d.sales.topName ?? '—'}, of sales`} to="customers" />
              <Metric label="Order lines shipped on time" value={pct(d.delivery.onTimePct)} tone={d.delivery.onTimePct != null && d.delivery.onTimePct < 50 ? 'bad' : undefined} sub={`${num(d.delivery.lines)} lines due · late ones a median ${dayCount(d.delivery.medianDelay)} late`} to="journey" />
              <Metric label="Open orders" value={tonnes(d.delivery.openTonnes)} sub={`${num(d.delivery.openLines)} lines · ${tonnes(d.delivery.overdueTonnes, 1)} past due (${num(d.delivery.overdueLines)} lines)`} to="orders" />
            </Row>
          </SectionCard>

          <SectionCard title="Production">
            <Row>
              <Metric label="Poured" value={tonnes(d.production.pouredT)} sub="Metal poured in the period" to="production" />
              <Metric label="Rejected" value={pct(d.production.rejectionPct, 1)} sub={`${num(d.production.rejectedKg / 1000)} t of the metal poured`} to="quality" />
              <Metric label="Order to shipment" value={dayCount(d.production.orderToShip)} tone={d.production.orderToShip != null && d.production.promised != null && d.production.orderToShip > d.production.promised ? 'bad' : undefined} sub={`Median order line · promised ${dayCount(d.production.promised)}`} to="time-spent" />
              <Metric label="Poured to passed inspection" value={dayCount(d.production.pourToPass)} tone="bad" sub={`The longest stage · slowest 10% take ${dayCount(d.production.slowPourToPass)}`} to="step-inspection" />
            </Row>
          </SectionCard>

          <SectionCard title="Shipping">
            <Row>
              <Metric label="Dispatched" value={tonnes(d.shipping.dispatchedT)} sub={`${num(d.shipping.shipments)} dispatch days by customer`} to="step-dispatch" />
              <Metric label="Ready, not shipped" value={tonnes(d.shipping.readyT, 1)} sub={`${tonnes(d.shipping.readyPastDueT, 1)} of it past due · as of the last data date`} to="ready-waiting" />
              <Metric label="Customers past their usual shipment" value={num(d.shipping.pastUsualSlot)} sub="Their usual gap since the last shipment has passed" to="ready-waiting" />
              <Metric label="Missed shipments with castings ready" value={num(d.shipping.missedWithStock)} sub={`Across ${num(d.shipping.regularCustomers)} customers who ship regularly`} to="rhythm" />
            </Row>
          </SectionCard>

          <SectionCard title="Vendors and purchases">
            <Row>
              <Metric label="Job work sent out" value={tonnes(d.vendors.sentT)} sub={`Counted once per process (a casting can go to several) · back in a median ${dayCount(d.vendors.medianDays)}`} to="vendors" />
              <Metric label="Not yet back from vendors" value={tonnes(d.vendors.notBackT, 1)} sub={`${tonnes(d.vendors.oldNotBackT, 1)} out over 60 days`} to="vendors" />
              <Metric label="Material purchases" value={crore(d.vendors.purchases)} sub={`${num(d.vendors.suppliers)} suppliers`} to="material-suppliers" />
              <Metric label="To act on now" value={num(d.actions.pastDue)} tone={d.actions.pastDue ? 'bad' : undefined} sub={`lines past due · ${num(d.actions.dueNotPoured)} due soon, not poured · ${num(d.actions.waitingAfterPour)} waiting 60+ days after pouring`} to="actions" />
            </Row>
          </SectionCard>

          <Grid>
            <SectionCard title="Sales by month" action={<Button size="small" endIcon={<ArrowForwardRounded fontSize="small" />} onClick={() => go('what-changed')} sx={{ textTransform: 'none' }}>What changed</Button>}>
              <Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.sales)} format={crore} height={220} />
            </SectionCard>
            <SectionCard title="Dispatched by month" action={<Button size="small" endIcon={<ArrowForwardRounded fontSize="small" />} onClick={() => go('rhythm')} sx={{ textTransform: 'none' }}>Shipping</Button>}>
              <Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.dispatchedT)} format={(v) => `${num(v)} t`} height={220} />
            </SectionCard>
          </Grid>
        </>
      )}
    </Page>
  );
}
