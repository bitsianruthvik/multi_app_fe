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
  ships: [string, number][];
}
interface Report {
  asOf: string;
  mode: 'asis' | 'historic';
  from: string;
  to: string;
  rows: Row[];
  bins: { label: string; dispatches: number }[];
  months: { mo: string; dispatches: number; customers: number }[];
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

  const cols: DataColumn<Row>[] = [
    { key: 'name', header: 'Customer', alwaysVisible: true, sortValue: (r) => r.name, render: (r) => <Typography sx={{ fontSize: 'inherit', fontWeight: 600, maxWidth: 220 }} noWrap title={r.name}>{r.name}</Typography> },
    { key: 'revenue', header: 'Revenue', numeric: true, align: 'right', sortValue: (r) => r.revenue, render: (r) => fmtCr(r.revenue) },
    { key: 'dispatches', header: 'Dispatches', numeric: true, align: 'right', sortValue: (r) => r.dispatches, render: (r) => fmtN(r.dispatches) },
    { key: 'total', header: 'Total', numeric: true, align: 'right', sortValue: (r) => r.totalT, render: (r) => fmtT(r.totalT) },
    { key: 'medT', header: 'Median per dispatch', numeric: true, align: 'right', sortValue: (r) => r.medianT, render: (r) => fmtT(r.medianT) },
    { key: 'midT', header: 'Middle half per dispatch', numeric: true, align: 'right', render: (r) => rangeT(r.p25T, r.p75T) },
    { key: 'medGap', header: 'Median gap', numeric: true, align: 'right', sortValue: (r) => r.medianGapDays, render: (r) => fmtDays(r.medianGapDays) },
    { key: 'midGap', header: 'Middle half gap', numeric: true, align: 'right', render: (r) => rangeDays(r.p25GapDays, r.p75GapDays) },
  ];

  const footnote = asis
    ? 'Last 90 days to the last data date. Top ten by invoiced value in the same window. A dispatch is all of one customer’s dispatched weight on one day. Gap is the days between one dispatch and the next for that customer.'
    : 'Chosen dates. Top ten by invoiced value in the same dates. A dispatch is all of one customer’s dispatched weight on one day. Gap is the days between one dispatch and the next for that customer; the middle half (25th to 75th percentile) is shown in the table.';

  return (
    <Page
      title={asis ? 'Dispatch · As-is' : 'Dispatch · Historic'}
      question={asis
        ? 'The top ten customers by revenue over the last 90 days: how much goes out in each dispatch and how often.'
        : 'The top ten customers by revenue in the chosen dates: is there a pattern in how much they take per dispatch, and how often they dispatch.'}
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

          <SectionCard title="Top ten: size and rhythm" subtitle="Select a heading to sort" flush
            info="One row per customer in the top ten, ordered by revenue. Median per dispatch and median gap are the usual figures. Middle half gives the 25th to 75th percentile, so the middle half of their dispatches or gaps falls between the two figures shown.">
            <ReportTable rows={rows} columns={cols} getRowId={(r) => r.id} bare pageSize={10} defaultSortKey="revenue" defaultSortDir="desc" empty="No dispatches for these filters." />
          </SectionCard>
        </>
      )}
    </Page>
  );
}
