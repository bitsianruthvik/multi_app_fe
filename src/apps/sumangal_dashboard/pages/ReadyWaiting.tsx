import { Box, Typography } from '@mui/material';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import { KpiGrid, KpiTile, SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { dateLabel, num, tonnes } from '../format';
import { ReportTable, RowBars } from '../components/Charts';
import { Page } from '../components/Page';

interface Row { id: number; customer: string; tonnes: number; lines: number; oldest: number; pastDue: number; rhythm: string; median: number | null; last: string | null; next: string | null; daysToNext: number | null }
interface Report { kpis: { tonnes: number; customers: number; pastDue: number; overdueSlot: number }; rows: Row[]; age: { label: string; tonnes: number | null }[]; asOf: string }

/** What has passed inspection and is cleared, but not shipped, set against each customer's next expected shipment. */
export default function ReadyWaiting() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/ready-waiting${f.query()}` : null);
  const k = d?.kpis;
  const cols: DataColumn<Row>[] = [
    { key: 'customer', header: 'Customer', alwaysVisible: true, sortValue: (r) => r.customer, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 600, maxWidth: 230 }} title={r.customer}>{r.customer}</Typography> },
    { key: 'tonnes', header: 'Ready', numeric: true, align: 'right', sortValue: (r) => r.tonnes, render: (r) => `${r.tonnes} t` },
    { key: 'lines', header: 'Order lines', numeric: true, align: 'right', sortValue: (r) => r.lines, render: (r) => num(r.lines) },
    { key: 'oldest', header: 'Oldest, days', numeric: true, align: 'right', sortValue: (r) => r.oldest, render: (r) => r.oldest },
    { key: 'pastDue', header: 'Of it past due', numeric: true, align: 'right', sortValue: (r) => r.pastDue, render: (r) => (r.pastDue ? <Box component="span" sx={{ color: 'var(--c-danger-600)', fontWeight: 700 }}>{r.pastDue} t</Box> : '—') },
    { key: 'rhythm', header: 'Usual rhythm', sortValue: (r) => r.median, render: (r) => r.rhythm },
    { key: 'last', header: 'Last shipment', sortValue: (r) => r.last, render: (r) => dateLabel(r.last) },
    { key: 'next', header: 'Next expected', sortValue: (r) => r.next, render: (r) => dateLabel(r.next) },
    { key: 'dn', header: 'Days to next', numeric: true, align: 'right', sortValue: (r) => r.daysToNext, render: (r) => (r.daysToNext == null ? '—' : r.daysToNext < 0 ? <Box component="span" sx={{ color: 'var(--c-danger-600)', fontWeight: 700 }}>{-r.daysToNext} overdue</Box> : r.daysToNext) },
  ];
  return (
    <Page title="Ready and waiting" question="Castings that passed inspection and are cleared but not shipped, and when each customer's next shipment is due." filters={f} filterKeys={['customer']} period={false} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote="As of the last data date. Ready is cleared for dispatch and not shipped, on open order lines, never more than the line still has to ship. Next expected is the last shipment plus that customer's usual gap between shipments.">
      {d && k && (
        <>
          <KpiGrid>
            <KpiTile label="Ready, not shipped" info="Tonnes cleared for dispatch and not shipped, as of the last data date. Only open order lines count, never more than the line still has to ship. The customer filter applies; the date range does not."icon={<Inventory2Rounded />} display={tonnes(k.tonnes, 1)} />
            <KpiTile label="Customers" info="Number of customers with cleared, unshipped castings as of the last data date."icon={<GroupsRounded />} display={num(k.customers)} />
            <KpiTile label="Of it past its due date" info="The part of the ready tonnes that sits on order lines whose due date is before the last data date."icon={<EventBusyRounded />} display={tonnes(k.pastDue, 1)} tone={k.pastDue ? 'warning' : 'default'} />
            <KpiTile label="Customers past their usual shipment" info="Customers whose next expected shipment, the last shipment plus their usual gap between shipments, is already before the last data date. Shows how many."icon={<LocalShippingRounded />} display={num(k.overdueSlot)} tone={k.overdueSlot ? 'warning' : 'default'} />
          </KpiGrid>
          <SectionCard title="By customer" subtitle="Largest first" flush info="One row per customer with ready castings, largest first. Shows ready tonnes, order lines, the oldest ready line in days since it was cleared, tonnes past due, the usual rhythm (from the median gap between shipments), the last shipment and next expected shipment. Days to next counts down to the next expected shipment; overdue values are shown in red.">
            <ReportTable rows={d.rows} columns={cols} getRowId={(r) => r.id} bare pageSize={15} defaultSortKey="tonnes" defaultSortDir="desc" empty="Nothing ready and waiting." />
          </SectionCard>
          <SectionCard title="How long it has been ready" info="Ready tonnes grouped by days since they were cleared: up to 7 days, 8 to 30 days, and over 30 days."><RowBars rows={d.age.map((a) => ({ key: a.label, label: `Cleared ${a.label.toLowerCase()} ago`, value: a.tonnes }))} format={(v) => `${v} t`} /></SectionCard>
        </>
      )}
    </Page>
  );
}
