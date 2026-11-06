import { useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { SectionCard, Surface, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { dateLabel, num, tonnes } from '../format';
import { ReportTable } from '../components/Charts';
import { Page } from '../components/Page';
import { CustomerSheet, LineSheet } from '../components/Sheets';

interface Row { id: number; orderNo: string; customer: string; customerId: number; part: string; due: string | null; pending: number; tonnes: number | null; at: string; daysOverdue: number; daysToDue: number | null; sincePour: number | null; lastPour: string | null }
interface List { lines: number; tonnes: number | null; rows: Row[] }
interface Report { dueNotPoured: List; pastDue: List; waitingAfterPour: List; readyToShip: List; dueSoon: { lines: number; tonnes: number | null } }
type Key = 'dueNotPoured' | 'pastDue' | 'waitingAfterPour' | 'readyToShip';

const text = (v: string, w: number) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: w }} title={v}>{v}</Typography>;
const red = (v: number | string) => <Box component="span" sx={{ color: 'var(--c-danger-600)', fontWeight: 700 }}>{v}</Box>;
const common: DataColumn<Row>[] = [
  { key: 'order', header: 'Order', sortValue: (r) => r.orderNo, render: (r) => r.orderNo },
  { key: 'customer', header: 'Customer', sortValue: (r) => r.customer, render: (r) => text(r.customer, 190) },
  { key: 'part', header: 'Part', sortValue: (r) => r.part, render: (r) => text(r.part, 230) },
  { key: 'pending', header: 'Pending pcs', numeric: true, align: 'right', sortValue: (r) => r.pending, render: (r) => num(r.pending) },
  { key: 'tonnes', header: 'Pending t', numeric: true, align: 'right', sortValue: (r) => r.tonnes, render: (r) => r.tonnes ?? '—' },
];
const dueCol: DataColumn<Row> = { key: 'due', header: 'Delivery date', sortValue: (r) => r.due, render: (r) => dateLabel(r.due) };
const atCol: DataColumn<Row> = { key: 'at', header: 'Most pieces are', sortValue: (r) => r.at, render: (r) => r.at };

const LISTS: { key: Key; title: string; help: string; sortKey: string; sortDir: 'asc' | 'desc'; first: DataColumn<Row>[]; last: DataColumn<Row>[] }[] = [
  { key: 'dueNotPoured', title: 'Due in 30 days, not poured', help: 'Most pieces haven’t been poured yet', sortKey: 'days', sortDir: 'asc', first: [{ key: 'days', header: 'Days to delivery', numeric: true, align: 'right', sortValue: (r) => r.daysToDue, render: (r) => red(r.daysToDue ?? '—') }, dueCol], last: [atCol] },
  { key: 'pastDue', title: 'Past due', help: 'Delivery date gone, not fully shipped', sortKey: 'days', sortDir: 'desc', first: [{ key: 'days', header: 'Days past due', numeric: true, align: 'right', sortValue: (r) => r.daysOverdue, render: (r) => red(r.daysOverdue) }, dueCol], last: [atCol] },
  { key: 'waitingAfterPour', title: 'Waiting 60+ days since pouring', help: 'Most pieces poured but not inspected', sortKey: 'days', sortDir: 'desc', first: [{ key: 'days', header: 'Days since last pour', numeric: true, align: 'right', sortValue: (r) => r.sincePour, render: (r) => red(r.sincePour ?? '—') }, dueCol], last: [] },
  { key: 'readyToShip', title: 'Cleared, not shipped', help: 'Most pieces cleared for dispatch', sortKey: 'tonnes', sortDir: 'desc', first: [dueCol], last: [] },
];

/** Open orders sorted into four lists. Every row is an order someone can chase. */
export default function ActionList() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/actions${f.query()}` : null);
  const [active, setActive] = useState<Key>('dueNotPoured');
  const [line, setLine] = useState<number | null>(null);
  const [customer, setCustomer] = useState<number | null>(null);
  const meta = LISTS.find((l) => l.key === active) ?? LISTS[0];
  const list = d?.[active];
  return (
    <Page title="Action list" question="Open orders that need chasing, as of the last data date." filters={f} period={false} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote="A line appears by where most of its pending pieces are, worked out from the stage quantities in the ERP. Select a row for the line’s dates and quantities.">
      {d && list && (
        <>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: 'repeat(4, minmax(0,1fr))' } }}>
            {LISTS.map((l) => {
              const x = d[l.key]; const on = active === l.key;
              return (
                <Surface key={l.key} e={1} role="button" tabIndex={0} onClick={() => setActive(l.key)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(l.key); } }}
                  sx={{ p: 1.75, cursor: 'pointer', outline: on ? '2px solid var(--c-primary-500)' : 'none', background: on ? 'var(--c-primary-50)' : undefined, '&:hover': { boxShadow: 'var(--e-2)' } }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, minHeight: 38 }}>{l.title}</Typography>
                  <Stack direction="row" spacing={1} alignItems="baseline">
                    <Typography sx={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{num(x.lines)}</Typography>
                    <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>lines · {tonnes(x.tonnes, 1)}</Typography>
                  </Stack>
                </Surface>
              );
            })}
          </Box>
          <SectionCard title={meta.title} subtitle={meta.help} flush>
            <ReportTable key={active} rows={list.rows} columns={[...meta.first, ...common, ...meta.last]} getRowId={(r) => r.id} bare pageSize={15} defaultSortKey={meta.sortKey} defaultSortDir={meta.sortDir} onRowClick={(r) => setLine(r.id)} empty="Nothing on this list." />
          </SectionCard>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Everything due in the next 30 days: {num(d.dueSoon.lines)} lines, {tonnes(d.dueSoon.tonnes, 1)}.</Typography>
          {line != null && <LineSheet id={line} onClose={() => setLine(null)} onCustomer={(id) => { setLine(null); setCustomer(id); }} />}
          {customer != null && <CustomerSheet id={customer} filters={f} onClose={() => setCustomer(null)} onLine={setLine} />}
        </>
      )}
    </Page>
  );
}
