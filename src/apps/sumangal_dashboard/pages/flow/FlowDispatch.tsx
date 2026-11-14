import type { ReactNode } from 'react';
import { Typography } from '@mui/material';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import ScaleRounded from '@mui/icons-material/ScaleRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import { KpiGrid, KpiTile, SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../../api';
import { useFilters } from '../../filters';
import { monthLabel } from '../../format';
import { Bars, Grid, ReportTable, RowBars } from '../../components/Charts';
import { Page } from '../../components/Page';
import { fmtCr, fmtDays, fmtN, fmtT } from '../../components/flowFormat';

interface Row {
  id: number;
  name: string;
  revenue: number;
  dispatches: number;
  totalT: number;
  medianT: number | null;
  p25T: number | null;
  p75T: number | null;
  medianGapDays: number | null;
  p25GapDays: number | null;
  p75GapDays: number | null;
  pcsMedian: number | null;
  mainWeight: string | null;
  mainFinish: string | null;
  ships: [string, number][];
}
interface Wait {
  lots: number;
  kgT: number;
  kgShare: number | null;
  waitMedDays: number | null;
  overTwoWeeks: number | null;
}
interface Insights {
  lots: number;
  lines: number;
  lateDrivers: {
    lateT: number;
    lateShare: number | null;
    exportShare: number | null;
    clearedByDueT: number;
    clearedAfterDueT: number;
    clearToShipLateDays: number | null;
    clearToShipOnTimeDays: number | null;
  };
  consolidation: { bands: (Wait & { label: string })[]; single: Wait; multi: Wait };
  leadSplit: { label: string; lines: number; splitShare: number | null; overrunDays: number | null; lateShare: number | null }[];
  cadence: { missed: number; nothingReady: number; nothingReadyShare: number | null; readyTonsMedian: number | null };
}
interface Report {
  asOf: string;
  mode: 'asis' | 'historic';
  from: string;
  to: string;
  rows: Row[];
  bins: { label: string; dispatches: number }[];
  months: { mo: string; dispatches: number; customers: number }[];
  insights: Insights;
}

/** The middle value of a list, ignoring blanks. Null when there is nothing to take it from. */
function median(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
const oneDp = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 1 });
const rangeT = (a: number | null, b: number | null) => (a == null || b == null ? '—' : `${oneDp(a)}–${oneDp(b)} t`);
const rangeDays = (a: number | null, b: number | null) => (a == null || b == null ? '—' : `${Math.round(a)}–${Math.round(b)} days`);
/** The insights carry shares as fractions (0 to 1). */
const pctF = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

/** One line under an insight chart: the figures it rests on, in plain words. */
function Takeaway({ children }: { children: ReactNode }) {
  return <Typography sx={{ mt: 1.5, fontSize: 13, lineHeight: 1.55, color: 'var(--c-text-2)' }}>{children}</Typography>;
}
function Sample({ children }: { children: ReactNode }) {
  return <Typography sx={{ mt: 0.75, fontSize: 12, color: 'var(--c-text-3)' }}>{children}</Typography>;
}

export default function FlowDispatch({ mode }: { mode: 'asis' | 'historic' }) {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/flow/dispatch${f.query({ mode })}` : null);
  const asis = mode === 'asis';
  const windowWords = asis ? 'the last 90 days' : 'the chosen dates';
  const rows = d?.rows ?? [];
  const dispatches = rows.reduce((t, r) => t + r.dispatches, 0);
  const tonnes = rows.reduce((t, r) => t + r.totalT, 0);
  const medianShip = median(rows.flatMap((r) => r.ships.map(([, t]) => t)));
  const medianGap = median(rows.map((r) => r.medianGapDays));
  const ins = d?.insights;
  const band = (label: string) => ins?.consolidation.bands.find((b) => b.label === label);
  const big = band('2 t and over');
  const lead = (label: string) => ins?.leadSplit.find((b) => b.label === label);
  const lateD = ins?.lateDrivers;

  const cols: DataColumn<Row>[] = [
    { key: 'name', header: 'Customer', alwaysVisible: true, sortValue: (r) => r.name, render: (r) => <Typography sx={{ fontSize: 'inherit', fontWeight: 600, maxWidth: 220 }} noWrap title={r.name}>{r.name}</Typography> },
    { key: 'revenue', header: 'Revenue', numeric: true, align: 'right', sortValue: (r) => r.revenue, render: (r) => fmtCr(r.revenue) },
    { key: 'dispatches', header: 'Dispatches', numeric: true, align: 'right', sortValue: (r) => r.dispatches, render: (r) => fmtN(r.dispatches) },
    { key: 'total', header: 'Total', numeric: true, align: 'right', sortValue: (r) => r.totalT, render: (r) => fmtT(r.totalT) },
    { key: 'medT', header: 'Median per dispatch', numeric: true, align: 'right', sortValue: (r) => r.medianT, render: (r) => fmtT(r.medianT) },
    { key: 'midT', header: 'Middle half per dispatch', numeric: true, align: 'right', render: (r) => rangeT(r.p25T, r.p75T) },
    { key: 'pcs', header: 'Median pieces per dispatch', numeric: true, align: 'right', sortValue: (r) => r.pcsMedian, render: (r) => fmtN(r.pcsMedian) },
    { key: 'wt', header: 'Mostly part weight', sortValue: (r) => r.mainWeight ?? '', render: (r) => r.mainWeight ?? '—' },
    { key: 'fin', header: 'Mostly finish', sortValue: (r) => r.mainFinish ?? '', render: (r) => r.mainFinish ?? '—' },
    { key: 'medGap', header: 'Median gap', numeric: true, align: 'right', sortValue: (r) => r.medianGapDays, render: (r) => fmtDays(r.medianGapDays) },
    { key: 'midGap', header: 'Middle half gap', numeric: true, align: 'right', render: (r) => rangeDays(r.p25GapDays, r.p75GapDays) },
  ];

  const footnote = asis
    ? 'Last 90 days to the last data date. Top ten by invoiced value in the same window. A dispatch is all of one customer’s dispatched weight on one day. Gap is the days between one dispatch and the next for that customer. Finish, metal and market filters apply to the top ten and the insights; shipment-level figures use the market and customer filters only.'
    : 'Chosen dates. Top ten by invoiced value in the same dates. A dispatch is all of one customer’s dispatched weight on one day. Gap is the days between one dispatch and the next for that customer; the middle half (25th to 75th percentile) is shown in the table. Finish, metal and market filters apply to the top ten and the insights; shipment-level figures use the market and customer filters only.';

  return (
    <Page
      title={asis ? 'Dispatch · As-is' : 'Dispatch · Historic'}
      question={asis
        ? 'The top ten customers by revenue over the last 90 days: how much goes out in each dispatch and how often, and what holds the dispatch back.'
        : 'The top ten customers by revenue in the chosen dates: their dispatch size and rhythm, and what drives the dispatch cycle beyond the truck.'}
      filters={f}
      filterKeys={['finish', 'metal', 'market']}
      period={mode === 'historic'}
      loading={loading}
      error={error}
      reload={reload}
      hasData={!!d}
      footnote={footnote}
    >
      {d && (
        <>
          <KpiGrid>
            <KpiTile label="Customers in the top ten" icon={<GroupsRounded />} display={fmtN(rows.length)}
              info={`The ten customers with the highest invoiced value in ${windowWords}. Every chart and the table on this screen use this same set.`} />
            <KpiTile label="Dispatches" icon={<LocalShippingRounded />} display={fmtN(dispatches)}
              info={`A dispatch is one customer’s shipment on one day, with all their dispatched weight that day. This counts those dispatches across the top ten in ${windowWords}.`} />
            <KpiTile label="Tonnes dispatched" icon={<ScaleRounded />} display={fmtT(tonnes)}
              info={`The total weight dispatched to the top ten in ${windowWords}, added up across all their dispatches.`} />
            <KpiTile label="Median tonnes per dispatch" icon={<ScaleRounded />} display={fmtT(medianShip)}
              info="Half of the dispatches across the top ten were heavier than this figure and half were lighter. Volume per dispatch is the tonnes on that day." />
            <KpiTile label="Median days between dispatches" icon={<ScheduleRounded />} display={fmtDays(medianGap)}
              info="Frequency is the days between one dispatch and the next for the same customer. This is each customer’s usual gap, taken as the middle value across the top ten." />
          </KpiGrid>

          <Grid>
            <SectionCard title="Volume per dispatch" subtitle="Number of dispatches in each size band" info="Every dispatch by the top ten in the window, counted by its tonnes and grouped into five bands. It shows whether most dispatches are small loads or large ones.">
              <Bars labels={d.bins.map((b) => b.label)} data={d.bins.map((b) => b.dispatches)} format={fmtN} height={240} />
            </SectionCard>
            <SectionCard title="Typical tonnes per dispatch, by customer" subtitle="Median tonnes on one dispatch" info="The usual weight of one dispatch for each of the top ten, ordered by revenue. The middle half of each customer’s dispatches is in the table below.">
              <RowBars rows={rows.map((r) => ({ key: String(r.id), label: r.name, value: r.medianT }))} format={fmtT} />
            </SectionCard>
          </Grid>

          <Grid>
            <SectionCard title="How often each customer dispatches" subtitle="Median days between one dispatch and the next" info="The usual number of days between one dispatch and the next for each customer in the top ten. A shorter bar means the customer dispatches more often.">
              <RowBars rows={rows.map((r) => ({ key: String(r.id), label: r.name, value: r.medianGapDays }))} format={fmtDays} />
            </SectionCard>
            <SectionCard title="Dispatches per month" subtitle="All of the top ten, by month" info="How many dispatches the top ten made in each month of the window. Use it to see whether dispatching is steady or comes in waves.">
              <Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.dispatches)} format={fmtN} height={240} />
            </SectionCard>
          </Grid>

          <Typography sx={{ mt: 3, mb: -1, fontSize: 15, fontWeight: 600 }}>What drives the dispatch cycle</Typography>
          <Typography sx={{ mb: 0.5, fontSize: 12.5, color: 'var(--c-text-3)' }}>
            Beyond the truck itself: where dispatches wait, split or fall late. All figures come from every shipment, order line and customer rhythm in the same window and filters.
          </Typography>

          {ins && ins.lots === 0 && (
            <Typography sx={{ p: 2, fontSize: 13, color: 'var(--c-text-3)' }}>No shipments in these filters, so there is nothing to explain yet.</Typography>
          )}

          {ins && ins.lots > 0 && lateD && (
            <Grid>
              <SectionCard title="Late dispatch is decided before the truck" subtitle="Tonnes shipped after the customer’s due date, by whether they had cleared by then"
                info="Each lot of a shipment is compared with its customer due date. ‘Cleared by the due date’ means the last of its pieces was cleared on or before that date, so it was ready and still went late. ‘Cleared after’ means the plant was still finishing it on the due date.">
                <Bars labels={['Cleared by the due date, still shipped late', 'Cleared after the due date']} data={[lateD.clearedByDueT, lateD.clearedAfterDueT]} format={fmtT} height={220} />
                <Takeaway>
                  {fmtT(lateD.lateT)} shipped after its due date ({pctF(lateD.lateShare)} of tonnes, {pctF(lateD.exportShare)} of it export). Only {fmtT(lateD.clearedByDueT)} of that had cleared by the due date. Clearance to dispatch took {lateD.clearToShipLateDays ?? '—'} day(s) on late shipments and {lateD.clearToShipOnTimeDays ?? '—'} day(s) on on-time ones, so the delay sits in clearance, not on the way out.
                </Takeaway>
                <Sample>Based on {fmtN(ins.lots)} shipments in this window.</Sample>
              </SectionCard>

              <SectionCard title="Big shipments wait to be made up" subtitle="Median days a cleared piece waited for its shipment, by shipment size"
                info="For each piece cleared and later dispatched, the wait is the days from its clearance to its shipment. The median is the wait that half of the tonnes in each size band were under. ‘Over two weeks’ is the share of tonnes that waited longer.">
                <Bars labels={ins.consolidation.bands.map((b) => b.label)} data={ins.consolidation.bands.map((b) => b.waitMedDays)} format={fmtDays} height={220} />
                <Takeaway>
                  Shipments of 2 t and over carry {pctF(big?.kgShare)} of the tonnes. Their cleared pieces waited a median {big?.waitMedDays ?? '—'} days, and {pctF(big?.overTwoWeeks)} of that tonnage waited over two weeks. Shipments combining more than one sales order waited {ins.consolidation.multi.waitMedDays ?? '—'} days against {ins.consolidation.single.waitMedDays ?? '—'} days for single-order shipments.
                </Takeaway>
                <Sample>Based on {fmtN(ins.consolidation.multi.lots + ins.consolidation.single.lots)} shipments in this window.</Sample>
              </SectionCard>
            </Grid>
          )}

          {ins && ins.lots > 0 && (
            <Grid>
              <SectionCard title="Long quoted lead times split orders" subtitle="Share of order lines sent in more than one dispatch, by quoted lead time"
                info="Quoted lead time is the days from the order date to the customer’s due date. A line is split when it went out in more than one dispatch. Only lines that were fully dispatched in this window are counted.">
                <Bars labels={ins.leadSplit.map((b) => b.label)} data={ins.leadSplit.map((b) => (b.splitShare == null ? null : Math.round(b.splitShare * 100)))} format={(v) => `${Math.round(v)}%`} height={220} />
                <Takeaway>
                  Lines quoted at 200 days and over split {pctF(lead('200 days and over')?.splitShare)} of the time, against {pctF(lead('Under 60 days')?.splitShare)} for lines quoted under 60 days. {pctF(lead('60–120 days')?.lateShare)} of lines in the 60–120 day band finished after their due date.
                </Takeaway>
                <Sample>Based on {fmtN(ins.lines)} order lines fully dispatched in this window.</Sample>
              </SectionCard>

              <SectionCard title="Missed customer shipments were production gaps" subtitle="Expected shipments that did not come, by whether anything was cleared for them"
                info="The customer’s usual shipment rhythm shows when the next shipment is due. When one did not come, this counts whether any of that customer’s kilograms had been cleared by then. Nothing cleared means the plant had nothing ready to send.">
                <Bars labels={['Nothing cleared for them', 'Some cleared, not sent']} data={[ins.cadence.nothingReady, Math.max(0, ins.cadence.missed - ins.cadence.nothingReady)]} format={fmtN} height={220} />
                <Takeaway>
                  {fmtN(ins.cadence.nothingReady)} of {fmtN(ins.cadence.missed)} expected shipments ({pctF(ins.cadence.nothingReadyShare)}) did not come because nothing had cleared for that customer. Where something had cleared, the median was {fmtT(ins.cadence.readyTonsMedian)}.
                </Takeaway>
                {ins.cadence.missed < 10 && <Sample>Only {fmtN(ins.cadence.missed)} missed shipments in this window, so read this as indicative.</Sample>}
              </SectionCard>
            </Grid>
          )}

          <SectionCard title="Top ten: size and rhythm" subtitle="Select a heading to sort" flush
            info="One row per customer in the top ten, ordered by revenue. Median per dispatch and median gap are the usual figures. Middle half gives the 25th to 75th percentile, so the middle half of their dispatches or gaps falls between the two figures shown. Median pieces per dispatch and the mostly-weight and mostly-finish columns show what kind of part each customer takes, by the tonnes it carries.">
            <ReportTable rows={rows} columns={cols} getRowId={(r) => r.id} bare pageSize={10} defaultSortKey="revenue" defaultSortDir="desc" empty="No dispatches for these filters." />
          </SectionCard>
        </>
      )}
    </Page>
  );
}
