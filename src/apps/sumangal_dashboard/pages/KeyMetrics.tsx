import type { ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { InfoButton, SectionCard } from '@shared/ui';
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
function Metric({ label, value, sub, to, tone, info }: { label: string; value: ReactNode; sub?: ReactNode; to: string; tone?: Tone; info?: string }) {
  const go = useGo();
  return (
    <Box onClick={() => go(to)} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go(to)}
      sx={{ cursor: 'pointer', p: 2, borderRadius: 2, border: '1px solid var(--c-border)', background: 'var(--c-surface)', display: 'flex', flexDirection: 'column', gap: 0.5, minHeight: 132, transition: 'border-color .15s, box-shadow .15s', '&:hover': { borderColor: 'var(--c-primary-500)', boxShadow: '0 2px 10px rgba(0,0,0,.06)' }, '&:focus-visible': { outline: '2px solid var(--c-primary-500)' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: -0.5 }}>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', fontWeight: 600, flex: 1, minWidth: 0 }}>{label}</Typography>
        {info && <InfoButton text={info} label={`About: ${label}`} />}
      </Box>
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
          <SectionCard title="Sales and delivery" info="Sales, the largest customer’s share, order lines shipped on time and open orders. Sales and on-time figures follow the selected period. Open orders are as of the last data date.">
            <Row>
              <Metric label="Sales" info="Sales value of the order lines in the selected date range, in crore of rupees, from the ERP’s sales records. The line under it gives the average price per kg and the number of customers." value={crore(d.sales.sales)} sub={`${perKg(d.sales.pricePerKg)} a kg · ${num(d.sales.customers)} customers`} to="customers" />
              <Metric label="Largest customer" info="The share of the sales value in the selected date range that the single biggest customer accounts for." value={pct(d.sales.topShare)} sub={`${d.sales.topName ?? '—'}, of sales`} to="customers" />
              <Metric label="Order lines shipped on time" info="Share of order lines due in the selected date range that were fully shipped by their delivery date. The line under it gives how many lines were due and the median days late for the late ones." value={pct(d.delivery.onTimePct)} tone={d.delivery.onTimePct != null && d.delivery.onTimePct < 50 ? 'bad' : undefined} sub={`${num(d.delivery.lines)} lines due · late ones a median ${dayCount(d.delivery.medianDelay)} late`} to="journey" />
              <Metric label="Open orders" info="Metal in order lines not yet fully shipped on the last data date, in tonnes. The line under it gives the number of lines and how much is already past its delivery date." value={tonnes(d.delivery.openTonnes)} sub={`${num(d.delivery.openLines)} lines · ${tonnes(d.delivery.overdueTonnes, 1)} past due (${num(d.delivery.overdueLines)} lines)`} to="orders" />
            </Row>
          </SectionCard>

          <SectionCard title="Production" info="Metal poured, rejections, order-to-shipment time and the slow inspection stage. Poured and rejected follow the selected period. Order-to-shipment and the stage times use order lines fully shipped in the period.">
            <Row>
              <Metric label="Poured" info="Metal poured in the selected date range, in tonnes." value={tonnes(d.production.pouredT)} sub="Metal poured in the period" to="production" />
              <Metric label="Rejected" info="Share of the metal poured in the selected date range that was rejected, by weight. The line under it gives the rejected weight in tonnes." value={pct(d.production.rejectionPct, 1)} sub={`${num(d.production.rejectedKg / 1000)} t of the metal poured`} to="quality" />
              <Metric label="Order to shipment" info="Median time for an order line from order to shipment, built up from the stage medians. Promised is the median days from order to delivery date. Shown red when the time is longer than promised." value={dayCount(d.production.orderToShip)} tone={d.production.orderToShip != null && d.production.promised != null && d.production.orderToShip > d.production.promised ? 'bad' : undefined} sub={`Median order line · promised ${dayCount(d.production.promised)}`} to="time-spent" />
              <Metric label="Poured to passed inspection" info="Median days from pouring to passing inspection, for order lines in the selected date range. The slowest tenth is shown under it." value={dayCount(d.production.pourToPass)} tone="bad" sub={`The longest stage · slowest 10% take ${dayCount(d.production.slowPourToPass)}`} to="step-inspection" />
            </Row>
          </SectionCard>

          <SectionCard title="Shipping" info="Tonnes dispatched in the selected period, and castings ready to ship, customers past their usual shipment and missed shipments. The ready and shipment-rhythm figures are as of the last data date and do not follow the period.">
            <Row>
              <Metric label="Dispatched" info="Metal shipped out in the selected date range, in tonnes. The line under it gives the number of days on which a dispatch was made." value={tonnes(d.shipping.dispatchedT)} sub={`${num(d.shipping.shipments)} dispatch days by customer`} to="step-dispatch" />
              <Metric label="Ready, not shipped" info="Castings that passed inspection and are cleared but not shipped on the last data date, in tonnes. The line under it gives how much of that is past its delivery date." value={tonnes(d.shipping.readyT, 1)} sub={`${tonnes(d.shipping.readyPastDueT, 1)} of it past due · as of the last data date`} to="ready-waiting" />
              <Metric label="Customers past their usual shipment" info="Number of customers whose time since their last shipment has passed their usual gap between shipments. Opens the ready and waiting screen." value={num(d.shipping.pastUsualSlot)} sub="Their usual gap since the last shipment has passed" to="ready-waiting" />
              <Metric label="Missed shipments with castings ready" info="Expected shipments that did not go out for customers who ship regularly, at a time when castings were ready for them. Counted on the customer shipping rhythm screen." value={num(d.shipping.missedWithStock)} sub={`Across ${num(d.shipping.regularCustomers)} customers who ship regularly`} to="rhythm" />
            </Row>
          </SectionCard>

          <SectionCard title="Vendors and purchases" info="Job work sent to outside vendors and what is still out, material purchases, and the actions to take now. Vendor and purchase figures follow the selected period. The actions are open order lines as of the last data date.">
            <Row>
              <Metric label="Job work sent out" info="Metal sent to outside job-work vendors in the selected date range, in tonnes, counted once per process. A casting can go to several processes. The line under it gives the median days until it came back." value={tonnes(d.vendors.sentT)} sub={`Counted once per process (a casting can go to several) · back in a median ${dayCount(d.vendors.medianDays)}`} to="vendors" />
              <Metric label="Not yet back from vendors" info="Metal sent to vendors that has not come back on the last data date, in tonnes. The line under it gives how much has been out for more than 60 days." value={tonnes(d.vendors.notBackT, 1)} sub={`${tonnes(d.vendors.oldNotBackT, 1)} out over 60 days`} to="vendors" />
              <Metric label="Material purchases" info="Value of material purchases in the selected date range, in crore of rupees, from goods received notes. The line under it gives the number of suppliers." value={crore(d.vendors.purchases)} sub={`${num(d.vendors.suppliers)} suppliers`} to="material-suppliers" />
              <Metric label="To act on now" info="Lines past their delivery date on the last data date. The line under it gives lines due within 30 days that are not yet poured, and lines waiting 60 or more days after pouring." value={num(d.actions.pastDue)} tone={d.actions.pastDue ? 'bad' : undefined} sub={`lines past due · ${num(d.actions.dueNotPoured)} due soon, not poured · ${num(d.actions.waitingAfterPour)} waiting 60+ days after pouring`} to="actions" />
            </Row>
          </SectionCard>

          <Grid>
            <SectionCard title="Sales by month" info="Sales invoiced in each calendar month of the selected period. Values are in rupees, shown in crore." action={<Button size="small" endIcon={<ArrowForwardRounded fontSize="small" />} onClick={() => go('what-changed')} sx={{ textTransform: 'none' }}>What changed</Button>}>
              <Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.sales)} format={crore} height={220} />
            </SectionCard>
            <SectionCard title="Dispatched by month" info="Tonnes dispatched in each calendar month that has sales in the selected period." action={<Button size="small" endIcon={<ArrowForwardRounded fontSize="small" />} onClick={() => go('rhythm')} sx={{ textTransform: 'none' }}>Shipping</Button>}>
              <Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.dispatchedT)} format={(v) => `${num(v)} t`} height={220} />
            </SectionCard>
          </Grid>
        </>
      )}
    </Page>
  );
}
