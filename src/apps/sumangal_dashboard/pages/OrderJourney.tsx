import { useMemo, useState } from 'react';
import { Button, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { SectionCard } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { num, tonnes } from '../format';
import { RowBars } from '../components/Charts';
import { Page } from '../components/Page';
import { Legend, OrderGantt, type OrderRow } from '../components/Timelines';
import { ORDER_LEGEND } from '../components/timelineStyle';

interface Order extends OrderRow { customerId: number; lines: number; cls: string }
interface Report { classes: { label: string; lines: number; tonnes: number | null }[]; orders: Order[]; totalOrders: number; asOf: string }
const TONE: Record<string, string> = { 'Shipped on time': 'var(--c-success-600)', 'Ready on time, shipped late': '#f0a800', 'Poured on time, finished late': '#eb6834', 'Poured late': 'var(--c-danger-600)', Open: 'var(--c-text-3)' };
const VIEWS = [['shipped', 'Shipped'], ['late', 'Shipped late'], ['ontime', 'On time'], ['open', 'Still open']] as const;

/** Each sales order from the day it came in to the day it shipped, against its due date. */
export default function OrderJourney() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/journey${f.query()}` : null);
  const [view, setView] = useState<(typeof VIEWS)[number][0]>('shipped');
  const [count, setCount] = useState(30);
  const rows = useMemo(() => (d?.orders ?? []).filter((o) => (view === 'open' ? o.open : view === 'shipped' ? !o.open : view === 'ontime' ? o.cls === 'Shipped on time' : !o.open && o.cls !== 'Shipped on time')), [d, view]);
  const shown = rows.slice(0, count);
  const from = shown.length ? shown.reduce((m, o) => (o.od < m ? o.od : m), shown[0].od) : d?.asOf ?? '2025-01-01';
  let to: string = d?.asOf ?? from;
  for (const o of shown) for (const x of [o.due, o.shipped, ...o.ships.map((s) => s[0])]) if (x && x > to) to = x;
  return (
    <Page title="Order journey" question="Each sales order from the day it came in to the day it shipped, against its due date." filters={f} filterKeys={['customer', 'market', 'finish', 'metal']} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote="Order lines placed in the period. A stage is done on the day good pieces there first reach the ordered quantity. Ready means all ordered pieces passed inspection. An order takes the result of its latest line. Short-closed lines are left out.">
      {d && (
        <>
          <SectionCard title="Did each order line make its due date?" subtitle="Tonnes ordered, by what happened">
            <RowBars rows={d.classes.map((c) => ({ key: c.label, label: c.label, value: c.tonnes, sub: `${num(c.lines)} lines` }))} format={(v) => `${num(v)} t`} />
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 1 }}>
              {d.classes.map((c) => <span key={c.label} style={{ marginRight: 14 }}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: TONE[c.label], marginRight: 5 }} />{c.label}: {tonnes(c.tonnes)}</span>)}
            </Typography>
          </SectionCard>
          <SectionCard title="Order timelines" subtitle={`Newest first · ${num(rows.length)} of ${num(d.totalOrders)} orders · pick a customer above to follow one`}
            action={<ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && (setView(v), setCount(30))}>{VIEWS.map(([k, l]) => <ToggleButton key={k} value={k} sx={{ px: 1.5, textTransform: 'none' }}>{l}</ToggleButton>)}</ToggleButtonGroup>}>
            <Legend items={ORDER_LEGEND} />
            {shown.length ? <OrderGantt rows={shown} from={from} to={to} asOf={d.asOf} label={(r) => `${r.no} · ${(r as Order).customer.split(' ')[0]} · ${r.tonnes >= 1 ? `${r.tonnes.toFixed(1)} t` : `${Math.round(r.tonnes * 1000)} kg`}`} /> : <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)', py: 2 }}>No orders for these filters.</Typography>}
            {rows.length > count && <Stack alignItems="center" sx={{ mt: 1 }}><Button size="small" onClick={() => setCount((c) => c + 30)}>Show 30 more</Button></Stack>}
          </SectionCard>
        </>
      )}
    </Page>
  );
}
