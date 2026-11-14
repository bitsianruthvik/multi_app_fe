import { Typography } from '@mui/material';
import { KpiGrid, KpiTile, SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../../api';
import { useFilters } from '../../filters';
import { dateLabel, monthLabel } from '../../format';
import { ReportTable, RowBars, Lines, Bars } from '../../components/Charts';
import { Page } from '../../components/Page';
import { StackedBars, TreeTable, type TreeNode } from '../../components/FlowParts';
import { fmtDays, fmtN, fmtPct } from '../../components/flowFormat';

interface Part { id: number; name: string; units: number }
interface TreeLevel { key: 'planned' | 'toPlan'; label: string; lines: number; units: number; subBatches?: number; parts: Part[] }
interface CustomerRow { id: number; name: string; orders: number; lines: number; orderedUnits: number; plannedUnits: number; toPlanUnits: number; stages: Record<string, number>; tree: TreeLevel[] }
interface PendingLine { id: number; ono: string; customer: string; part: string; od: string; dd: string | null; castDue: string | null; ordered: number; planned: number; toPlan: number; days: number | null; stages: Record<string, number> }
interface AsIsReport { asOf: string; mode: 'asis'; kpis: { lines: number; orders: number; toPlanUnits: number; plannedUnits: number; oldestDays: number | null; dueSoonUnplanned: number }; rows: CustomerRow[]; lines: PendingLine[] }

interface Metrics { lines: number; medianDaysToPlan: number | null; oneBatchPct: number | null; accuratePct: number | null; planInTimePct: number | null; reworkPct: number | null; onTimeShippedPct: number | null }
interface Group extends Metrics { label: string }
interface HistoricReport { asOf: string; mode: 'historic'; kpis: Metrics; byPart: Group[]; byType: Group[]; byMonth: (Metrics & { mo: string })[]; accuracy: { label: string; lines: number }[]; compare: Group[] }
type Report = AsIsReport | HistoricReport;

const stageSummary = (s: Record<string, number>) => Object.entries(s).filter(([, u]) => u > 0).map(([k, u]) => `${k} ${fmtN(u)}`).join(', ') || '—';

function AsIsView({ d }: { d: AsIsReport }) {
  const k = d.kpis;
  const top = [...d.rows].sort((a, b) => (b.toPlanUnits + b.plannedUnits) - (a.toPlanUnits + a.plannedUnits)).slice(0, 12);
  const treeRows: TreeNode[] = d.rows.map((c) => ({
    key: `c${c.id}`,
    label: c.name,
    cells: [String(c.orders), fmtN(c.orderedUnits), fmtN(c.plannedUnits), fmtN(c.toPlanUnits)],
    children: c.tree.map((node) => ({
      key: `c${c.id}-${node.key}`,
      label: node.label,
      cells: node.key === 'planned'
        ? [`${node.lines} lines, ${node.subBatches ?? 0} sub-batches`, '', fmtN(node.units), '']
        : [`${node.lines} lines`, '', '', fmtN(node.units)],
      children: node.parts.map((p) => ({
        key: `c${c.id}-${node.key}-${p.id}`,
        label: p.name,
        cells: node.key === 'planned' ? ['', '', fmtN(p.units), ''] : ['', '', '', fmtN(p.units)],
      })),
    })),
  }));
  const lineCols: DataColumn<PendingLine>[] = [
    { key: 'ono', header: 'Order no', sortValue: (r) => r.ono, render: (r) => r.ono },
    { key: 'customer', header: 'Customer', sortValue: (r) => r.customer, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 180 }} title={r.customer}>{r.customer}</Typography> },
    { key: 'part', header: 'Part', sortValue: (r) => r.part, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 220 }} title={r.part}>{r.part}</Typography> },
    { key: 'od', header: 'Order date', sortValue: (r) => r.od, render: (r) => dateLabel(r.od) },
    { key: 'dd', header: 'Committed date', sortValue: (r) => r.dd, render: (r) => dateLabel(r.dd) },
    { key: 'castDue', header: 'Casting date', sortValue: (r) => r.castDue, render: (r) => dateLabel(r.castDue) },
    { key: 'ordered', header: 'Ordered', numeric: true, align: 'right', sortValue: (r) => r.ordered, render: (r) => fmtN(r.ordered) },
    { key: 'planned', header: 'Planned', numeric: true, align: 'right', sortValue: (r) => r.planned, render: (r) => fmtN(r.planned) },
    { key: 'toPlan', header: 'To plan', numeric: true, align: 'right', sortValue: (r) => r.toPlan, render: (r) => fmtN(r.toPlan) },
    { key: 'days', header: 'Days since order', numeric: true, align: 'right', sortValue: (r) => r.days, render: (r) => fmtDays(r.days) },
    { key: 'stages', header: 'In production', sortValue: (r) => stageSummary(r.stages), render: (r) => <Typography sx={{ fontSize: 'inherit' }}>{stageSummary(r.stages)}</Typography> },
  ];
  return (
    <>
      <KpiGrid>
        <KpiTile label="Pending orders" display={fmtN(k.orders)} footer="Not fully planned into batches" info="Number of sales orders that are not yet fully planned. An order counts once even if several of its lines are pending. Completed and short-closed lines are left out." />
        <KpiTile label="Pending lines" display={fmtN(k.lines)} footer="Order lines not fully planned" info="Number of order lines that are not yet fully planned into batches. Completed and short-closed lines are left out." />
        <KpiTile label="Pieces still to plan" display={fmtN(k.toPlanUnits)} footer="Pieces" info="Pieces ordered but not yet covered by batches, summed over pending lines. Each line counts its ordered pieces minus the pieces in batches, never less than zero. Unit is pieces." />
        <KpiTile label="Pieces in sub-batches" display={fmtN(k.plannedUnits)} footer="Pieces" info="Pieces already in batches that have been started, summed over pending lines. Unit is pieces. Pieces in batches not yet started are not counted here." />
        <KpiTile label="Oldest pending order" display={fmtDays(k.oldestDays)} footer="Days since order date" info="Days from the order date to today for the oldest order line that still has pieces to plan. Unit is days. Lines with nothing left to plan are left out." />
        <KpiTile label="Due within 30 days, nothing planned" display={fmtN(k.dueSoonUnplanned)} footer="Lines" info="Number of pending lines whose committed date is within the next 30 days and that still have pieces to plan. Unit is lines. Lines without a committed date are left out." />
      </KpiGrid>
      <SectionCard title="Planned and yet to plan, by customer" subtitle="Top 12 by pieces" info="Pieces by customer for pending order lines, for the 12 customers with the most pieces to plan plus planned. Pieces are the ordered quantity split into pieces already in sub-batches and pieces yet to plan. Lines not pending are left out.">
        <StackedBars labels={top.map((c) => c.name)} format={fmtN} height={320} horizontal series={[
          { label: 'In sub-batches', data: top.map((c) => c.plannedUnits) },
          { label: 'Yet to plan', data: top.map((c) => c.toPlanUnits) },
        ]} />
      </SectionCard>
      <SectionCard flush title="Pending by customer, order and part" info="Customers with pending order lines. Each opens to the two states of their pieces, In sub-batches and Yet to plan, and each state opens to the parts. Orders is the number of pending sales orders. Ordered, Planned and To plan are pieces.">
        <TreeTable head={['Customer', 'Orders', 'Ordered', 'Planned', 'To plan']} rows={treeRows} empty="No pending orders for these filters." />
      </SectionCard>
      <SectionCard flush title="Pending order lines, soonest committed date first" info="Pending order lines, sorted by committed delivery date, soonest first. Ordered, Planned and To plan are pieces. Days since order counts from the order date to today. In production lists each stage the line’s pieces are in, with the piece count, and leaves out stages with none.">
        <ReportTable rows={d.lines} columns={lineCols} getRowId={(r) => r.id} bare pageSize={15} defaultSortKey="dd" defaultSortDir="asc" empty="No pending lines for these filters." />
      </SectionCard>
    </>
  );
}

function HistoricView({ d }: { d: HistoricReport }) {
  const k = d.kpis;
  const compareCols: DataColumn<Group>[] = [
    { key: 'label', header: 'Group', sortValue: (r) => r.label, render: (r) => r.label },
    { key: 'lines', header: 'Lines', numeric: true, align: 'right', sortValue: (r) => r.lines, render: (r) => fmtN(r.lines) },
    { key: 'med', header: 'Median days to plan', numeric: true, align: 'right', sortValue: (r) => r.medianDaysToPlan, render: (r) => fmtDays(r.medianDaysToPlan) },
    { key: 'one', header: 'One batch', numeric: true, align: 'right', sortValue: (r) => r.oneBatchPct, render: (r) => fmtPct(r.oneBatchPct) },
    { key: 'acc', header: 'Accurate', numeric: true, align: 'right', sortValue: (r) => r.accuratePct, render: (r) => fmtPct(r.accuratePct) },
    { key: 'inTime', header: 'Planned in time', numeric: true, align: 'right', sortValue: (r) => r.planInTimePct, render: (r) => fmtPct(r.planInTimePct) },
    { key: 'ship', header: 'On time shipped', numeric: true, align: 'right', sortValue: (r) => r.onTimeShippedPct, render: (r) => fmtPct(r.onTimeShippedPct) },
  ];
  const months = d.byMonth.map((m) => monthLabel(m.mo));
  return (
    <>
      <KpiGrid>
        <KpiTile label="Lines planned" display={fmtN(k.lines)} footer="In the chosen dates" info="Number of order lines whose first batch started in the chosen dates. Lines with no batch start are left out. Unit is lines." />
        <KpiTile label="Median days to plan" display={fmtDays(k.medianDaysToPlan)} footer="Order date to first batch" info="Middle value of the days from each line’s order date to the start of its first batch, across the lines planned in the chosen dates. Half the lines took longer and half took less. Unit is days." />
        <KpiTile label="Planned in one batch" display={fmtPct(k.oneBatchPct)} footer="Of lines planned" info="Share of planned lines whose pieces all went into a single batch, as a percent of the lines planned in the chosen dates. Lines split into several batches are the rest." />
        <KpiTile label="Accurate" display={fmtPct(k.accuratePct)} footer="Batches within 95 to 105%" info="Share of planned lines whose batches add up to 95 to 105 percent of the ordered pieces. Unit is percent of lines planned in the chosen dates." />
        <KpiTile label="Planned within delivery date" display={fmtPct(k.planInTimePct)} footer="First batch on or before committed date" info="Share of planned lines whose first batch started on or before the committed delivery date. Lines without a committed date are not counted as in time." />
        <KpiTile label="On time shipped" display={fmtPct(k.onTimeShippedPct)} footer="Of shipped lines" info="Share of shipped lines whose last dispatch was on or before the committed delivery date, as a percent of shipped lines in the chosen dates. Lines not yet shipped are left out." />
      </KpiGrid>
      <SectionCard title="Days to plan, by part" subtitle="Median, top 15 parts" info="Median days from order date to first batch, for each of the 15 parts with the most planned lines in the chosen dates. Unit is days. The figure beside each part is its median and the note under it is its number of lines.">
        <RowBars rows={d.byPart.slice(0, 15).map((g) => ({ key: g.label, label: g.label, value: g.medianDaysToPlan, sub: `${fmtN(g.lines)} lines` }))} format={fmtDays} />
      </SectionCard>
      <SectionCard title="One batch or split, by order type" info="For each order type, the share of planned lines made as one batch and the share split into several batches. Each type’s bar adds up to 100 percent of its planned lines. Unit is percent of lines.">
        <StackedBars horizontal height={Math.max(200, d.byType.length * 36)} format={fmtPct} labels={d.byType.map((g) => g.label)} series={[
          { label: 'One batch', data: d.byType.map((g) => g.oneBatchPct ?? 0) },
          { label: 'Split', data: d.byType.map((g) => 100 - (g.oneBatchPct ?? 0)) },
        ]} />
      </SectionCard>
      <SectionCard title="Planning over time, by month planned" info="By the month each line’s first batch started: the median days from order to first batch in days, and the share of lines made in one batch and accurate, in percent. Each point covers the lines planned in that month only.">
        <Lines labels={months} format={fmtDays} height={240} series={[{ label: 'Median days to plan', data: d.byMonth.map((m) => m.medianDaysToPlan) }]} />
        <Lines labels={months} format={fmtPct} height={240} series={[
          { label: 'One batch %', data: d.byMonth.map((m) => m.oneBatchPct) },
          { label: 'Accurate %', data: d.byMonth.map((m) => m.accuratePct) },
        ]} />
      </SectionCard>
      <SectionCard title="How close the batches came to the ordered pieces" info="Planned lines counted by how close their batches came to the ordered pieces: under 95 percent, 95 to 105 percent, and over 105 percent. Unit is lines.">
        <Bars labels={d.accuracy.map((a) => a.label)} data={d.accuracy.map((a) => a.lines)} format={fmtN} height={220} />
      </SectionCard>
      <SectionCard flush title="What worked and what did not" info="Planned lines split into groups, with the same measures for each group: median days to plan, one batch, accurate, planned within the delivery date, and on time shipped. Percent figures are shares of the group’s lines, and on time shipped is a share of its shipped lines.">
        <ReportTable rows={d.compare} columns={compareCols} getRowId={(r) => r.label} bare defaultSortKey="lines" defaultSortDir="desc" empty="Nothing for these filters." />
      </SectionCard>
    </>
  );
}

/** Planning: as-is (pending orders and what the plan still needs) or historic (how well orders were planned). */
export default function FlowPlanning({ mode }: { mode: 'asis' | 'historic' }) {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/flow/planning${f.query({ mode })}` : null);
  const asis = mode === 'asis';
  return (
    <Page
      title={asis ? 'Planning · As-is' : 'Planning · Historic'}
      question={asis
        ? 'Orders not yet fully planned into batches: what is planned into sub-batches, what is still to plan, and when each is due.'
        : 'How quickly and how accurately orders were planned, for orders whose first batch started in the chosen dates, and what worked.'}
      filters={f}
      filterKeys={['finish', 'metal', 'market', 'customer']}
      period={mode === 'historic'}
      loading={loading}
      error={error}
      reload={reload}
      hasData={!!d}
      footnote={asis
        ? 'Pending means the batches planned so far add up to less than the ordered pieces. Planned means pieces in batches already started. Stage pieces are what the ERP records in each stage. Committed date is the delivery date; casting date is the work order’s casting date.'
        : 'Orders whose first batch started in the chosen dates (the planning date). Days to plan is order date to first batch. Accurate means the batches add up to 95 to 105 percent of ordered pieces. On time shipped counts shipped lines whose last dispatch was on or before the delivery date.'}
    >
      {d && asis && <AsIsView d={d as AsIsReport} />}
      {d && !asis && <HistoricView d={d as HistoricReport} />}
    </Page>
  );
}
