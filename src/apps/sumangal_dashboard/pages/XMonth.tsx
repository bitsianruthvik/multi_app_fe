import { Box, Typography } from '@mui/material';
import { SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { dateLabel, monthLabel, num } from '../format';
import { Lines, ReportTable } from '../components/Charts';
import { Page } from '../components/Page';
import { Fact, FactRow, Open, StackBar, Swatches } from '../components/Intent';

interface Range { low: number; usual: number; high: number }
interface Load { key: string; lines: number; customers: number; tonnes: number; stages: Record<string, number> }
interface Ship { id: number; customer: string; usualGap: number; last: string; next: string; daysToNext: number; readyTonnes: number; dueTonnes: number; dueLines: number; openTonnes: number }
interface Cust { id: number; customer: string; lines: number; tonnes: number; pastDue: number; notPoured: number; poured: number; ready: number }
interface Mat { id: number; item: string; group: string; unit: string; stock: number; perMonth: number; coverDays: number | null; leadDays: number | null; short: boolean; lastVendor: string | null }
interface Report { asOf: string; load: Load[]; stageBuckets: string[]; months: { mo: string; orderedT: number | null; pouredT: number | null; dispatchedT: number | null }[]; poured: Range; dispatched: Range; ordered: Range; shipments: Ship[]; byCustomer: Cust[]; materials: Mat[] }
const COLORS = ['#b4b2a9', '#85b7eb', '#eb6834', '#7f77dd', '#1d9e75'];
const label = (k: string) => (/^\d{4}-\d{2}$/.test(k) ? monthLabel(k) : k);
const red = (v: React.ReactNode) => <Box component="span" sx={{ color: 'var(--c-danger-600)', fontWeight: 700 }}>{v}</Box>;
const name = (v: string, w: number) => <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 600, maxWidth: w }} title={v}>{v}</Typography>;

/** Monthly planning: what is due month by month and how far along it is, against what the plant usually pours and ships. */
export default function XMonth() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/intent/month${f.query()}` : null);
  const max = d ? Math.max(1, ...d.load.map((l) => l.tonnes), d.poured.high) : 1;
  const shipCols: DataColumn<Ship>[] = [
    { key: 'next', header: 'Next expected', sortValue: (r) => r.next, render: (r) => dateLabel(r.next) },
    { key: 'dn', header: 'In days', numeric: true, align: 'right', sortValue: (r) => r.daysToNext, render: (r) => (r.daysToNext < 0 ? red(`${-r.daysToNext} past`) : r.daysToNext) },
    { key: 'customer', header: 'Customer', sortValue: (r) => r.customer, render: (r) => name(r.customer, 240) },
    { key: 'gap', header: 'Usual gap, days', numeric: true, align: 'right', sortValue: (r) => r.usualGap, render: (r) => r.usualGap },
    { key: 'last', header: 'Last shipment', sortValue: (r) => r.last, render: (r) => dateLabel(r.last) },
    { key: 'ready', header: 'Ready now', numeric: true, align: 'right', sortValue: (r) => r.readyTonnes, render: (r) => `${r.readyTonnes} t` },
    { key: 'due', header: 'Due within 30 days', numeric: true, align: 'right', sortValue: (r) => r.dueTonnes, render: (r) => `${r.dueTonnes} t · ${r.dueLines} lines` },
    { key: 'open', header: 'All open', numeric: true, align: 'right', sortValue: (r) => r.openTonnes, render: (r) => `${r.openTonnes} t` },
  ];
  const custCols: DataColumn<Cust>[] = [
    { key: 'customer', header: 'Customer', sortValue: (r) => r.customer, render: (r) => name(r.customer, 240) },
    { key: 'tonnes', header: 'To ship', numeric: true, align: 'right', sortValue: (r) => r.tonnes, render: (r) => `${r.tonnes} t` },
    { key: 'lines', header: 'Lines', numeric: true, align: 'right', sortValue: (r) => r.lines, render: (r) => num(r.lines) },
    { key: 'pastDue', header: 'Past due', numeric: true, align: 'right', sortValue: (r) => r.pastDue, render: (r) => (r.pastDue ? red(`${r.pastDue} t`) : '—') },
    { key: 'notPoured', header: 'Not yet poured', numeric: true, align: 'right', sortValue: (r) => r.notPoured, render: (r) => (r.notPoured ? red(`${r.notPoured} t`) : '—') },
    { key: 'poured', header: 'Poured, not inspected', numeric: true, align: 'right', sortValue: (r) => r.poured, render: (r) => `${r.poured} t` },
    { key: 'ready', header: 'Inspected or cleared', numeric: true, align: 'right', sortValue: (r) => r.ready, render: (r) => `${r.ready} t` },
  ];
  const matCols: DataColumn<Mat>[] = [
    { key: 'item', header: 'Material', sortValue: (r) => r.item, render: (r) => name(r.item, 240) }, { key: 'group', header: 'Group', sortValue: (r) => r.group, render: (r) => r.group },
    { key: 'perMonth', header: 'Used a month', numeric: true, align: 'right', sortValue: (r) => r.perMonth, render: (r) => `${num(r.perMonth)} ${r.unit}` },
    { key: 'stock', header: 'In stock', numeric: true, align: 'right', sortValue: (r) => r.stock, render: (r) => `${num(r.stock)} ${r.unit}` },
    { key: 'cover', header: 'Days of use in stock', numeric: true, align: 'right', sortValue: (r) => r.coverDays, render: (r) => (r.short ? red(r.coverDays) : r.coverDays ?? '—') },
    { key: 'lead', header: 'Lead time, days', numeric: true, align: 'right', sortValue: (r) => r.leadDays, render: (r) => r.leadDays ?? '—' },
    { key: 'vendor', header: 'Last bought from', render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 200 }}>{r.lastVendor ?? '—'}</Typography> },
  ];
  return (
    <Page title="This month" question="What is due month by month, how far along it is, and what the plant usually pours and ships in a month." filters={f} filterKeys={['customer', 'market', 'finish', 'metal']} period={false} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote="Open order lines by the month of their delivery date, as of the last data date. Each line's unshipped pieces are placed at the furthest stage they have reached. The usual month is the median of the last 12 complete months; low and high are the lowest and highest of those months. Next expected shipment is a customer's last shipment plus their usual gap; customers with no shipment in three usual gaps are left out.">
      {d && (
        <>
          <SectionCard title="What the plant manages in a month" subtitle="The last 12 complete months">
            <FactRow cols={3}>
              <Fact label="Poured" value={`${d.poured.usual} t`} sub={`Lowest ${d.poured.low} t · highest ${d.poured.high} t`} />
              <Fact label="Dispatched" value={`${d.dispatched.usual} t`} sub={`Lowest ${d.dispatched.low} t · highest ${d.dispatched.high} t`} />
              <Fact label="Ordered by customers" value={`${d.ordered.usual} t`} sub={`Lowest ${d.ordered.low} t · highest ${d.ordered.high} t`} />
            </FactRow>
          </SectionCard>

          <SectionCard title="Still to ship, by month due" subtitle={`Against the usual month's dispatch of ${d.dispatched.usual} t (dashed line)`} action={<Open to="orders" label="Open orders" />}>
            <Swatches items={d.stageBuckets.map((s, i) => ({ label: s, color: COLORS[i] }))} />
            <Box sx={{ mt: 1.5, position: 'relative' }}>
              <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `calc(110px + (100% - 110px - 190px) * ${d.dispatched.usual / max})`, borderLeft: '2px dashed var(--c-text-3)', zIndex: 1 }} />
              {d.load.map((l) => (
                <Box key={l.key} sx={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr) 190px', alignItems: 'center', gap: 0, py: 0.75, borderTop: '1px solid var(--c-border)' }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: l.key === 'Past due' ? 'var(--c-danger-600)' : 'var(--c-text)' }}>{label(l.key)}</Typography>
                  <StackBar max={max} parts={d.stageBuckets.map((s, i) => ({ key: s, value: l.stages[s], color: COLORS[i] }))} height={18} />
                  <Typography sx={{ fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}><b>{l.tonnes} t</b> · {num(l.lines)} lines · {num(l.customers)} customers</Typography>
                </Box>
              ))}
            </Box>
            <Box sx={{ mt: 1.5, overflowX: 'auto' }}>
              <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', '& td, & th': { py: 0.5, px: 1, textAlign: 'right', borderTop: '1px solid var(--c-border)' }, '& th': { color: 'var(--c-text-3)', fontWeight: 600 }, '& td:first-of-type, & th:first-of-type': { textAlign: 'left' } }}>
                <thead><tr><th>Tonnes</th>{d.stageBuckets.map((s) => <th key={s}>{s}</th>)}</tr></thead>
                <tbody>{d.load.map((l) => <tr key={l.key}><td><b>{label(l.key)}</b></td>{d.stageBuckets.map((s) => <td key={s}>{l.stages[s] || '—'}</td>)}</tr>)}</tbody>
              </Box>
            </Box>
          </SectionCard>

          <SectionCard title="Due in the next 60 days or already past due, by customer" subtitle="Where each customer's unshipped tonnes stand" flush>
            <ReportTable rows={d.byCustomer} columns={custCols} getRowId={(r) => r.id} bare pageSize={10} defaultSortKey="tonnes" defaultSortDir="desc" onRowClick={(r) => f.setValue('customer', String(r.id))} empty="Nothing due." />
          </SectionCard>

          <SectionCard title="Shipments expected in the next 30 days" subtitle="From each customer's usual gap between shipments" action={<Open to="rhythm" label="Customer rhythm" />} flush>
            <ReportTable rows={d.shipments} columns={shipCols} getRowId={(r) => r.id} bare pageSize={10} defaultSortKey="next" defaultSortDir="asc" empty="No shipments expected from the usual gaps." />
          </SectionCard>

          <SectionCard title="Ordered, poured and dispatched, by month" subtitle="Tonnes">
            <Lines labels={d.months.map((m) => monthLabel(m.mo))} format={(v) => `${v} t`} height={260} series={[{ label: 'Ordered by customers', data: d.months.map((m) => m.orderedT), color: '#b4b2a9' }, { label: 'Poured', data: d.months.map((m) => m.pouredT), color: '#eb6834' }, { label: 'Dispatched', data: d.months.map((m) => m.dispatchedT), color: 'var(--c-primary-600)' }]} />
          </SectionCard>

          <SectionCard title="Materials: monthly use against stock" subtitle="The 25 most-used materials of the last 90 days" action={<Open to="material-suppliers" label="Suppliers" />} flush>
            <ReportTable rows={d.materials} columns={matCols} getRowId={(r) => r.id} bare pageSize={10} defaultSortKey="perMonth" defaultSortDir="desc" />
          </SectionCard>
        </>
      )}
    </Page>
  );
}
