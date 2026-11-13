import { useState } from 'react';
import { Box, Tab, Tabs, Typography } from '@mui/material';
import { SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { dateLabel, num, tonnes } from '../format';
import { Grid, ReportTable } from '../components/Charts';
import { Page } from '../components/Page';
import { Open } from '../components/Intent';

interface Stage { stage: string; lastDate: string; lastKg: number; usualKg: number; days: { dt: string; kg: number }[] }
interface Waiting { stage: string; tonnes: number; lines: number; oldestDays: number; over30: number }
interface Line { id: number; orderNo: string; customer: string; part: string; due: string | null; tonnes: number; pending: number; daysOverdue: number; at: string }
interface Inspect { key: number; part: string; customer: string; kg: number; pieces: number; days: number | null; due: string | null }
interface Ship { id: number; customer: string; tonnes: number; lines: number; oldest: number; pastDue: number; rhythm: string; next: string | null; daysToNext: number | null }
interface Out { key: number; vendor: string; process: string; no: string; part: string; sent: string; days: number; kg: number; sentPcs: number; backPcs: number }
interface Mach { key: string; no: string; vendor: string; part: string; planned: string | null; open: number; ordered: number; daysPastPlan: number }
interface Mat { id: number; item: string; group: string; unit: string; stock: number; perDay: number; coverDays: number | null; leadDays: number | null; short: boolean; lastBuy: string | null; lastVendor: string | null }
interface Report {
  asOf: string; stages: Stage[]; waiting: Waiting[];
  toPour: { lines: number; tonnes: number; rows: Line[] }; pastDue: { lines: number; tonnes: number; rows: Line[] }; toInspect: { lines: number; tonnes: number; rows: Inspect[] };
  toShip: { tonnes: number; rows: Ship[] }; atVendors: { tonnes: number; rows: Out[] }; machining: { lines: number; rows: Mach[] }; materials: Mat[];
}
const t = (v: string, w: number, bold = false) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: w, fontWeight: bold ? 600 : 400 }} title={v}>{v}</Typography>;
const red = (v: React.ReactNode) => <Box component="span" sx={{ color: 'var(--c-danger-600)', fontWeight: 700 }}>{v}</Box>;

/** Day-to-day running: what each step did on its last working day, what is waiting where, and the work lists. */
export default function XToday() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? '/intent/today' : null);
  const [tab, setTab] = useState('pour');
  const maxKg = d ? Math.max(1, ...d.stages.flatMap((s) => s.days.map((x) => x.kg))) : 1;
  const lineCols: DataColumn<Line>[] = [
    { key: 'due', header: 'Due', sortValue: (r) => r.due, render: (r) => dateLabel(r.due) },
    { key: 'late', header: 'Days late', numeric: true, align: 'right', sortValue: (r) => r.daysOverdue, render: (r) => (r.daysOverdue ? red(r.daysOverdue) : '—') },
    { key: 'order', header: 'Order', sortValue: (r) => r.orderNo, render: (r) => r.orderNo },
    { key: 'customer', header: 'Customer', sortValue: (r) => r.customer, render: (r) => t(r.customer, 200) },
    { key: 'part', header: 'Part', sortValue: (r) => r.part, render: (r) => t(r.part, 260, true) },
    { key: 'pending', header: 'Pieces to ship', numeric: true, align: 'right', sortValue: (r) => r.pending, render: (r) => num(r.pending) },
    { key: 'tonnes', header: 'Tonnes', numeric: true, align: 'right', sortValue: (r) => r.tonnes, render: (r) => r.tonnes },
    { key: 'at', header: 'Mostly at', sortValue: (r) => r.at, render: (r) => r.at },
  ];
  const inspCols: DataColumn<Inspect>[] = [
    { key: 'part', header: 'Part', sortValue: (r) => r.part, render: (r) => t(r.part, 300, true) }, { key: 'customer', header: 'Customer', sortValue: (r) => r.customer, render: (r) => t(r.customer, 220) },
    { key: 'kg', header: 'Kg', numeric: true, align: 'right', sortValue: (r) => r.kg, render: (r) => num(r.kg) }, { key: 'pcs', header: 'Pieces', numeric: true, align: 'right', sortValue: (r) => r.pieces, render: (r) => num(r.pieces) },
    { key: 'days', header: 'Days since poured', numeric: true, align: 'right', sortValue: (r) => r.days, render: (r) => (r.days != null && r.days > 60 ? red(r.days) : r.days ?? '—') }, { key: 'due', header: 'Due', sortValue: (r) => r.due, render: (r) => dateLabel(r.due) },
  ];
  const shipCols: DataColumn<Ship>[] = [
    { key: 'customer', header: 'Customer', sortValue: (r) => r.customer, render: (r) => t(r.customer, 260, true) }, { key: 'tonnes', header: 'Ready', numeric: true, align: 'right', sortValue: (r) => r.tonnes, render: (r) => `${r.tonnes} t` },
    { key: 'pastDue', header: 'Of it past due', numeric: true, align: 'right', sortValue: (r) => r.pastDue, render: (r) => (r.pastDue ? red(`${r.pastDue} t`) : '—') }, { key: 'oldest', header: 'Oldest, days', numeric: true, align: 'right', sortValue: (r) => r.oldest, render: (r) => r.oldest },
    { key: 'rhythm', header: 'Usual rhythm', render: (r) => r.rhythm }, { key: 'next', header: 'Next expected', sortValue: (r) => r.next, render: (r) => dateLabel(r.next) },
    { key: 'dn', header: 'Days to next', numeric: true, align: 'right', sortValue: (r) => r.daysToNext, render: (r) => (r.daysToNext == null ? '—' : r.daysToNext < 0 ? red(`${-r.daysToNext} past`) : r.daysToNext) },
  ];
  const outCols: DataColumn<Out>[] = [
    { key: 'days', header: 'Days out', numeric: true, align: 'right', sortValue: (r) => r.days, render: (r) => (r.days > 60 ? red(r.days) : r.days) }, { key: 'vendor', header: 'Vendor', sortValue: (r) => r.vendor, render: (r) => t(r.vendor, 220, true) },
    { key: 'process', header: 'Sent for', sortValue: (r) => r.process, render: (r) => r.process }, { key: 'part', header: 'Part', sortValue: (r) => r.part, render: (r) => t(r.part, 240) },
    { key: 'sent', header: 'Sent', sortValue: (r) => r.sent, render: (r) => dateLabel(r.sent) }, { key: 'pcs', header: 'Back / sent', numeric: true, align: 'right', render: (r) => `${num(r.backPcs)} / ${num(r.sentPcs)}` }, { key: 'kg', header: 'Kg out', numeric: true, align: 'right', sortValue: (r) => r.kg, render: (r) => num(r.kg) },
  ];
  const machCols: DataColumn<Mach>[] = [
    { key: 'past', header: 'Days past plan', numeric: true, align: 'right', sortValue: (r) => r.daysPastPlan, render: (r) => red(r.daysPastPlan) }, { key: 'planned', header: 'Planned', sortValue: (r) => r.planned, render: (r) => dateLabel(r.planned) },
    { key: 'no', header: 'Order', render: (r) => r.no }, { key: 'vendor', header: 'Vendor', sortValue: (r) => r.vendor, render: (r) => t(r.vendor, 220, true) }, { key: 'part', header: 'Part', render: (r) => t(r.part, 260) },
    { key: 'open', header: 'Open pcs', numeric: true, align: 'right', sortValue: (r) => r.open, render: (r) => num(r.open) }, { key: 'of', header: 'Of ordered', numeric: true, align: 'right', render: (r) => num(r.ordered) },
  ];
  const matCols: DataColumn<Mat>[] = [
    { key: 'item', header: 'Material', sortValue: (r) => r.item, render: (r) => t(r.item, 240, true) }, { key: 'group', header: 'Group', sortValue: (r) => r.group, render: (r) => r.group },
    { key: 'stock', header: 'In stock', numeric: true, align: 'right', sortValue: (r) => r.stock, render: (r) => `${num(r.stock)} ${r.unit}` }, { key: 'perDay', header: 'Used a day', numeric: true, align: 'right', sortValue: (r) => r.perDay, render: (r) => r.perDay },
    { key: 'cover', header: 'Days of use in stock', numeric: true, align: 'right', sortValue: (r) => r.coverDays, render: (r) => (r.short ? red(r.coverDays) : r.coverDays ?? '—') }, { key: 'lead', header: 'Lead time, days', numeric: true, align: 'right', sortValue: (r) => r.leadDays, render: (r) => r.leadDays ?? '—' },
    { key: 'lastBuy', header: 'Last bought', sortValue: (r) => r.lastBuy, render: (r) => dateLabel(r.lastBuy) }, { key: 'vendor', header: 'From', render: (r) => t(r.lastVendor ?? '—', 200) },
  ];
  const TABS: [string, string, number | string][] = d ? [['pour', 'To pour', d.toPour.lines], ['pastdue', 'Past due', d.pastDue.lines], ['inspect', 'To inspect', `${tonnes(d.toInspect.tonnes)}`], ['ship', 'Ready to ship', `${d.toShip.tonnes} t`], ['vendors', 'At vendors', `${d.atVendors.tonnes} t`], ['mach', 'Machining late', d.machining.lines], ['mat', 'Materials short', d.materials.length]] : [];
  return (
    <Page title="Today" question="What each step did on its last working day, what is waiting where, and the lists to work from." filters={f} filterKeys={[]} period={false} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote="As of the last data date in the snapshot. A step's usual day is the median of its working days in the last 60 days. Waiting is pieces passed on by the step before and not yet entered here. Days of use in stock is store stock divided by the average daily issue of the last 90 days; lead time is the item master's purchase lead time.">
      {d && (
        <>
          <Grid>
            <SectionCard title={`Each step's last working day (data to ${dateLabel(d.asOf)})`} subtitle="Bars: the last 14 working days. Number: last day against the usual day.">
              <Box>
                {d.stages.map((s) => (
                  <Box key={s.stage} sx={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr) 150px', gap: 1.5, alignItems: 'center', py: 0.6, borderTop: '1px solid var(--c-border)' }}>
                    <Box><Typography sx={{ fontSize: 13, fontWeight: 600 }}>{s.stage}</Typography><Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{dateLabel(s.lastDate)}</Typography></Box>
                    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: 26 }}>
                      {s.days.map((x, i) => <Box key={x.dt} title={`${dateLabel(x.dt)}: ${num(x.kg)} kg`} sx={{ flex: 1, height: `${Math.max(6, Math.min(100, (x.kg / Math.min(maxKg, s.usualKg * 3 || maxKg)) * 100))}%`, borderRadius: '2px 2px 0 0', background: i === s.days.length - 1 ? 'var(--c-primary-600)' : 'var(--c-primary-200, #c9c2f5)' }} />)}
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: s.lastKg < s.usualKg * 0.5 ? 'var(--c-danger-600)' : 'var(--c-text)' }}>{num(s.lastKg)} kg</Typography>
                      <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>usual {num(s.usualKg)} kg</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </SectionCard>
            <SectionCard title="Waiting at each step now" subtitle="Passed on by the step before, not yet entered here" action={<Open to="production" label="All steps" />}>
              <Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 80px 70px 110px 110px', gap: 1, pb: 0.5, fontSize: 11.5, color: 'var(--c-text-3)', fontWeight: 600 }}><span>Waiting for</span><span style={{ textAlign: 'right' }}>Tonnes</span><span style={{ textAlign: 'right' }}>Lines</span><span style={{ textAlign: 'right' }}>Over 30 days</span><span style={{ textAlign: 'right' }}>Oldest</span></Box>
                {d.waiting.map((w) => (
                  <Box key={w.stage} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 80px 70px 110px 110px', gap: 1, py: 0.8, borderTop: '1px solid var(--c-border)', fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
                    <b>{w.stage === 'Cleared' ? 'Clearance for dispatch' : w.stage}</b><span style={{ textAlign: 'right', fontWeight: 700 }}>{w.tonnes} t</span><span style={{ textAlign: 'right' }}>{num(w.lines)}</span>
                    <span style={{ textAlign: 'right' }}>{w.over30 ? red(`${w.over30} t`) : '—'}</span><span style={{ textAlign: 'right', color: 'var(--c-text-2)' }}>{num(w.oldestDays)} days</span>
                  </Box>
                ))}
              </Box>
            </SectionCard>
          </Grid>

          <SectionCard title="Work lists" flush>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ px: 1.5, borderBottom: '1px solid var(--c-border)' }}>
              {TABS.map(([k, l, n]) => <Tab key={k} value={k} label={`${l} · ${n}`} sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44 }} />)}
            </Tabs>
            {tab === 'pour' && <><Hint>Due in the next 30 days, with less than the ordered quantity poured. Soonest first.</Hint><ReportTable rows={d.toPour.rows} columns={lineCols} getRowId={(r) => r.id} bare pageSize={12} defaultSortKey="due" defaultSortDir="asc" empty="Nothing due soon is unpoured." /></>}
            {tab === 'pastdue' && <><Hint>Open order lines past their delivery date. Most overdue first.</Hint><ReportTable rows={d.pastDue.rows} columns={lineCols} getRowId={(r) => r.id} bare pageSize={12} defaultSortKey="late" defaultSortDir="desc" empty="Nothing is past due." /></>}
            {tab === 'inspect' && <><Hint>Poured and not yet inspected ({num(d.toInspect.lines)} batch lines in all). Biggest first; the 40 biggest are listed.</Hint><ReportTable rows={d.toInspect.rows} columns={inspCols} getRowId={(r) => r.key} bare pageSize={12} defaultSortKey="kg" defaultSortDir="desc" /></>}
            {tab === 'ship' && <><Hint>Cleared and not shipped, by customer, with the customer's next expected shipment.</Hint><ReportTable rows={d.toShip.rows} columns={shipCols} getRowId={(r) => r.id} bare pageSize={12} defaultSortKey="tonnes" defaultSortDir="desc" empty="Nothing is ready and waiting." /></>}
            {tab === 'vendors' && <><Hint>Castings sent for job work and not fully back. Longest out first; the 40 longest are listed.</Hint><ReportTable rows={d.atVendors.rows} columns={outCols} getRowId={(r) => r.key} bare pageSize={12} defaultSortKey="days" defaultSortDir="desc" /></>}
            {tab === 'mach' && <><Hint>Machining order lines with pieces still to come, past their planned completion date.</Hint><ReportTable rows={d.machining.rows} columns={machCols} getRowId={(r) => r.key} bare pageSize={12} defaultSortKey="past" defaultSortDir="desc" empty="No machining lines are past plan." /></>}
            {tab === 'mat' && <><Hint>Materials whose stock covers fewer days than their lead time (red), or 14 days of use or less.</Hint><ReportTable rows={d.materials} columns={matCols} getRowId={(r) => r.id} bare pageSize={12} defaultSortKey="cover" defaultSortDir="asc" empty="No material is short." /></>}
          </SectionCard>
        </>
      )}
    </Page>
  );
}
const Hint = ({ children }: { children: React.ReactNode }) => <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', px: 2, py: 1 }}>{children}</Typography>;
