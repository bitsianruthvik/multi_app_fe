import { Box, Stack, Typography } from '@mui/material';
import { ErrorNotice, ListSkeleton, SectionCard, SideSheet, ToneBadge } from '@shared/ui';
import { useReport } from '../api';
import { crore, dateLabel, dayCount, monthLabel, num, onTimeTone, perKg, pct } from '../format';
import type { Filters } from '../filters';
import { Bars, Big, RowBars } from './Charts';

interface CustomerDetail {
  name: string; country: string | null; terms: string | null; sales: number; kg: number; pricePerKg: number | null; rejectionPct: number | null; creditDays: number | null;
  delivery: { lines: number; onTimePct: number | null; medianDelay: number | null }; months: { mo: string; sales: number }[]; parts: { die: number; name: string; sales: number; pricePerKg: number | null }[];
  stages: { key: string; label: string; days: number | null }[]; open: { id: number; part: string; due: string | null; daysOverdue: number; pending: number }[];
}
interface LineDetail {
  orderNo: string; customer: string; customerId: number; part: string; finish: string; metal: string; weight: string; ordered: string; due: string | null; shipped: string | null; castingDue: string | null; lastPour: string | null; firstInspection: string | null; lastInspection: string | null;
  qty: number; planned: number; poured: number; okQty: number; shippedQty: number; daysLate: number | null; daysOverdue: number | null; steps: { key: string; label: string; days: number | null }[] | null; at: string;
}

interface PartDetail { name: string; pouredT: number | null; rejectedKg: number; pct: number | null; reasons: { reason: string; kg: number; pieces: number }[]; areas: { area: string; kg: number }[]; months: { mo: string; pouredKg: number; rejectedKg: number }[]; open: { id: number; orderNo: string; customer: string; due: string | null; pending: number; daysOverdue: number }[] }

/** Everything recorded for one part: reasons, stages, months and open orders, across the whole data. */
export function PartSheet({ id, filters, onClose }: { id: number; filters: Filters; onClose: () => void }) {
  const { data: d, error } = useReport<PartDetail>(`/parts/${id}${filters.query({ from: '', to: '' })}`);
  return (
    <SideSheet open onClose={onClose} title={d?.name ?? 'Part'} subtitle="All two years of data" width={600}>
      {error ? <ErrorNotice error={error} /> : !d ? <ListSkeleton rows={6} /> : (
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <Big size={24} value={pct(d.pct, 1)} label="Rejected" help="Of metal poured" />
            <Big size={24} value={`${num(d.rejectedKg)} kg`} label="Rejected weight" />
            <Big size={24} value={`${d.pouredT ?? '—'} t`} label="Poured" />
          </Box>
          <SectionCard info="Kilograms of this part rejected in each month of the data, from the rejection records. Only the page’s other filters apply, not the date range." title="Rejected kg by month"><Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.rejectedKg)} format={(v) => `${num(v)} kg`} height={190} color="var(--c-danger-600)" /></SectionCard>
          <SectionCard info="This part’s rejected kilograms by recorded reason, largest first (top 8), with pieces for each reason. Underscores are shown as dashes." title="By reason"><RowBars rows={d.reasons.map((r) => ({ key: r.reason, label: r.reason, value: r.kg, sub: `${num(r.pieces)} pieces` }))} format={(v) => `${num(v)} kg`} /></SectionCard>
          <SectionCard info="This part’s rejected kilograms by production area where the rejection was recorded, largest first." title="Where it was rejected"><RowBars rows={d.areas.map((a) => ({ key: a.area, label: a.area, value: a.kg }))} format={(v) => `${num(v)} kg`} /></SectionCard>
          {d.open.length > 0 && (
            <SectionCard info="This part’s open order lines (not fully shipped), most overdue first, up to 10. Each shows order number, customer, pieces still to ship and delivery date, and is shown in red when past its delivery date." title="Open orders for this part">
              <Stack spacing={0.75}>
                {d.open.map((l) => <Stack key={l.id} direction="row" justifyContent="space-between" spacing={1}><Typography noWrap sx={{ fontSize: 13, minWidth: 0 }}>{l.orderNo} · {l.customer}</Typography><Typography sx={{ fontSize: 12.5, color: l.daysOverdue ? 'var(--c-danger-600)' : 'var(--c-text-2)', flexShrink: 0 }}>{num(l.pending)} pcs · {dateLabel(l.due)}</Typography></Stack>)}
              </Stack>
            </SectionCard>
          )}
        </Stack>
      )}
    </SideSheet>
  );
}

/** Everything recorded for one customer. */
export function CustomerSheet({ id, filters, onClose, onLine }: { id: number; filters: Filters; onClose: () => void; onLine: (id: number) => void }) {
  const { data: d, error } = useReport<CustomerDetail>(`/customers/${id}${filters.query()}`);
  const tone = onTimeTone(d?.delivery.onTimePct);
  return (
    <SideSheet open onClose={onClose} title={d?.name ?? 'Customer'} subtitle={d ? [d.country, d.terms].filter(Boolean).join(' · ') : undefined} width={640}>
      {error ? <ErrorNotice error={error} /> : !d ? <ListSkeleton rows={6} /> : (
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
            <Big size={24} value={crore(d.sales)} label="Sales" help={`${num(d.kg / 1000)} t at ${perKg(d.pricePerKg)}/kg`} />
            <Big size={24} value={pct(d.delivery.onTimePct)} tone={tone === 'neutral' ? undefined : tone} label="On time" help={`${num(d.delivery.lines)} lines due${d.delivery.medianDelay ? `, median ${d.delivery.medianDelay} days late` : ''}`} />
            <Big size={24} value={d.creditDays != null ? `${d.creditDays}d` : '—'} label="Credit on invoices" />
            <Big size={24} value={pct(d.rejectionPct, 1)} label="Rejected" help="Of metal poured" />
          </Box>
          <SectionCard info="Sales in rupees for each month of this customer’s data, with the page’s filters and date range applied." title="Sales by month"><Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.sales)} format={crore} height={190} /></SectionCard>
          <SectionCard info="Median days this customer’s order lines spent in each stage, for lines whose delivery date is in the date range and on or before the data date. Stages run from order to plan, through to cleared, to fully shipped." title="Median days at each stage"><RowBars rows={d.stages.map((s) => ({ key: s.key, label: s.label, value: s.days }))} format={dayCount} /></SectionCard>
          <SectionCard info="The customer’s eight largest parts by sales in the date range, with sales in rupees and price a kg. The bar length is each part’s sales." title="Biggest parts" subtitle="By sales"><RowBars rows={d.parts.map((p) => ({ key: String(p.die), label: p.name, value: p.sales, sub: `${perKg(p.pricePerKg)}/kg` }))} format={crore} /></SectionCard>
          {d.open.length > 0 && (
            <SectionCard info="This customer’s open order lines (not fully shipped), most overdue first, up to 15. Each shows its pieces still to ship and delivery date, with a red tag for days past due. Click a line to open it; the list is not limited by date range." title="Open order lines" subtitle="Longest past due first">
              <Stack spacing={0.5}>
                {d.open.map((l) => (
                  <Box key={l.id} role="button" tabIndex={0} onClick={() => onLine(l.id)} onKeyDown={(e) => { if (e.key === 'Enter') onLine(l.id); }} sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 1, borderRadius: 1.5, cursor: 'pointer', '&:hover': { background: 'var(--c-surface-2)' } }}>
                    {l.daysOverdue > 0 && <ToneBadge label={`${l.daysOverdue}d past due`} tone="danger" />}
                    <Typography noWrap sx={{ fontSize: 13, flex: 1, minWidth: 0 }}>{l.part}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', flexShrink: 0 }}>{num(l.pending)} pcs · {dateLabel(l.due)}</Typography>
                  </Box>
                ))}
              </Stack>
            </SectionCard>
          )}
        </Stack>
      )}
    </SideSheet>
  );
}

/** Everything recorded for one order line. */
export function LineSheet({ id, onClose, onCustomer }: { id: number; onClose: () => void; onCustomer?: (id: number) => void }) {
  const { data: d, error } = useReport<LineDetail>(`/lines/${id}`);
  return (
    <SideSheet open onClose={onClose} title={d?.part || 'Order line'} subtitle={d ? `Order ${d.orderNo} · ${d.customer}` : undefined} width={580}>
      {error ? <ErrorNotice error={error} /> : !d ? <ListSkeleton rows={5} /> : (
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <Big size={17} value={dateLabel(d.ordered)} label="Ordered" />
            <Big size={17} value={dateLabel(d.due)} label="Delivery date" />
            <Big size={17} value={d.shipped ? dateLabel(d.shipped) : 'Still open'} tone={(d.daysLate ?? 0) > 0 || d.daysOverdue ? 'danger' : undefined} label={d.shipped ? 'Fully shipped' : d.at} help={d.daysLate != null ? (d.daysLate > 0 ? `${d.daysLate} days late` : 'On time') : d.daysOverdue ? `${d.daysOverdue} days past due` : undefined} />
          </Box>
          {d.steps && <SectionCard info="Days this order line spent at each stage, from order to fully shipped, as recorded for the line. A stage with no value has no bar." title="Days at each stage"><RowBars rows={d.steps.map((s) => ({ key: s.key, label: s.label, value: s.days }))} format={dayCount} /></SectionCard>}
          <SectionCard info="This line’s ordered, planned, poured, passed-inspection and shipped pieces, as recorded for the line." title="Quantities"><RowBars rows={[{ key: 'o', label: 'Ordered', value: d.qty }, { key: 'p', label: 'Planned', value: d.planned }, { key: 'c', label: 'Poured', value: d.poured }, { key: 'k', label: 'Passed inspection', value: d.okQty }, { key: 's', label: 'Shipped', value: d.shippedQty }]} format={(v) => `${num(v)} pcs`} /></SectionCard>
          <SectionCard info="The dates recorded for this line: casting date on the work order, last pour, first inspection and last inspection, shown with its finish, metal and weight." title="Dates in the ERP">
            <Stack spacing={0.75}>
              {[['Casting date on work order', d.castingDue], ['Last pour', d.lastPour], ['First inspection', d.firstInspection], ['Last inspection', d.lastInspection]].map(([k, v]) => <Stack key={k as string} direction="row" justifyContent="space-between"><Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{k}</Typography><Typography sx={{ fontSize: 13, fontWeight: 600 }}>{dateLabel(v)}</Typography></Stack>)}
            </Stack>
            <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}><ToneBadge label={d.finish} tone="neutral" /><ToneBadge label={d.metal} tone="neutral" /><ToneBadge label={d.weight} tone="neutral" /></Stack>
          </SectionCard>
          {onCustomer && <Typography role="button" tabIndex={0} onClick={() => onCustomer(d.customerId)} sx={{ fontSize: 13, color: 'var(--c-primary-600)', cursor: 'pointer', fontWeight: 600 }}>See everything for {d.customer}</Typography>}
        </Stack>
      )}
    </SideSheet>
  );
}
