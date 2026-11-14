import { useState, type ReactNode } from 'react';
import { Box, MenuItem, TextField, Typography } from '@mui/material';
import { SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { crore, dateLabel, monthLabel, num, pct, perKg } from '../format';
import { ReportTable } from '../components/Charts';
import { Page } from '../components/Page';
import { Open } from '../components/Intent';

interface Vendor { vendor: string; tonnes: number; share: number | null; lines: number; medianDays: number | null; slowDays: number | null; rejectedPct: number | null; openTonnes: number }
interface Supplier { supplier: string; qty: number; value: number; rate: number; lastRate: number; lastDate: string; receipts: number }
interface Extra { die: number; part: string; customer: string; lines: number; tonnes: number; extraPct: number; lossPct: number | null; gap: number | null; secondBatches: number; late: number; pouredTonnes: number }
interface Cust { id: number; customer: string; sales: number; share: number | null; pricePerKg: number | null; onTimePct: number | null; orderToShip: number | null; promised: number | null; rejectionPct: number | null; customerRejPcs: number; readyLateT: number; finishedLateT: number }
interface CRej { key: string; part: string; customer: string; reason: string; pieces: number; kg: number; entries: number; last: string }
interface Report { window: { from: string; to: string }; vendorChoice: { process: string; tonnes: number; vendors: Vendor[] }[]; supplierChoice: { item: string; group: string; value: number; suppliers: Supplier[] }[]; extraVsLoss: Extra[]; customers: Cust[]; customerRejections: CRej[] }

const name = (v: string, w: number) => <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 600, maxWidth: w }} title={v}>{v}</Typography>;
const red = (v: ReactNode) => <Box component="span" sx={{ color: 'var(--c-danger-600)', fontWeight: 700 }}>{v}</Box>;
const green = (v: ReactNode) => <Box component="span" sx={{ color: 'var(--c-success-600)', fontWeight: 700 }}>{v}</Box>;
/** Marks the best and worst value in a small group, so the eye lands on the difference. */
const rank = (v: number | null, all: (number | null)[], lowIsGood = true, fmt: (n: number) => ReactNode = (n) => n) => {
  if (v == null) return '—'; const xs = all.filter((x): x is number => x != null); if (xs.length < 2) return fmt(v); const lo = Math.min(...xs), hi = Math.max(...xs); if (lo === hi) return fmt(v);
  return v === (lowIsGood ? lo : hi) ? green(fmt(v)) : v === (lowIsGood ? hi : lo) ? red(fmt(v)) : fmt(v);
};

/** Tactical decisions: the figures side by side for the choices the plant makes. */
export default function XDecisions() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/intent/decisions${f.query()}` : null);
  const [process, setProcess] = useState(''); const [item, setItem] = useState('');
  const proc = d?.vendorChoice.find((p) => p.process === process) ?? d?.vendorChoice[0];
  const mat = d?.supplierChoice.find((p) => p.item === item) ?? d?.supplierChoice[0];
  const vCols: DataColumn<Vendor>[] = proc ? [
    { key: 'vendor', header: 'Vendor', render: (r) => name(r.vendor, 260) },
    { key: 'tonnes', header: 'Sent', numeric: true, align: 'right', sortValue: (r) => r.tonnes, render: (r) => `${r.tonnes} t · ${pct(r.share)}` },
    { key: 'median', header: 'Usual days away', numeric: true, align: 'right', sortValue: (r) => r.medianDays, render: (r) => rank(r.medianDays, proc.vendors.map((x) => x.medianDays)) },
    { key: 'slow', header: 'Slowest 10%, days', numeric: true, align: 'right', sortValue: (r) => r.slowDays, render: (r) => rank(r.slowDays, proc.vendors.map((x) => x.slowDays)) },
    { key: 'rej', header: 'Came back rejected', numeric: true, align: 'right', sortValue: (r) => r.rejectedPct, render: (r) => rank(r.rejectedPct, proc.vendors.map((x) => x.rejectedPct), true, (n) => `${n}%`) },
    { key: 'open', header: 'Not yet back', numeric: true, align: 'right', sortValue: (r) => r.openTonnes, render: (r) => `${r.openTonnes} t` },
    { key: 'lines', header: 'Lines', numeric: true, align: 'right', sortValue: (r) => r.lines, render: (r) => num(r.lines) },
  ] : [];
  const sCols: DataColumn<Supplier>[] = mat ? [
    { key: 'supplier', header: 'Supplier', render: (r) => name(r.supplier, 260) },
    { key: 'value', header: 'Bought', numeric: true, align: 'right', sortValue: (r) => r.value, render: (r) => crore(r.value) },
    { key: 'qty', header: 'Quantity', numeric: true, align: 'right', sortValue: (r) => r.qty, render: (r) => num(r.qty) },
    { key: 'rate', header: 'Average rate', numeric: true, align: 'right', sortValue: (r) => r.rate, render: (r) => rank(r.rate, mat.suppliers.map((x) => x.rate), true, (n) => `₹${n}`) },
    { key: 'last', header: 'Latest rate', numeric: true, align: 'right', sortValue: (r) => r.lastRate, render: (r) => rank(r.lastRate, mat.suppliers.map((x) => x.lastRate), true, (n) => `₹${n}`) },
    { key: 'date', header: 'Latest receipt', sortValue: (r) => r.lastDate, render: (r) => dateLabel(r.lastDate) },
    { key: 'n', header: 'Receipts', numeric: true, align: 'right', sortValue: (r) => r.receipts, render: (r) => num(r.receipts) },
  ] : [];
  const eCols: DataColumn<Extra>[] = [
    { key: 'part', header: 'Part', sortValue: (r) => r.part, render: (r) => name(r.part, 280) }, { key: 'customer', header: 'Customer', sortValue: (r) => r.customer, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 200 }}>{r.customer}</Typography> },
    { key: 'extra', header: 'Extra started', numeric: true, align: 'right', sortValue: (r) => r.extraPct, render: (r) => `${r.extraPct}%` },
    { key: 'loss', header: 'Actually rejected', numeric: true, align: 'right', sortValue: (r) => r.lossPct, render: (r) => pct(r.lossPct, 1) },
    { key: 'gap', header: 'Rejected minus extra', numeric: true, align: 'right', sortValue: (r) => r.gap, render: (r) => (r.gap == null ? '—' : r.gap > 0 ? red(`+${r.gap} pts`) : green(`${r.gap} pts`)) },
    { key: 'second', header: 'Lines needing another batch', numeric: true, align: 'right', sortValue: (r) => r.secondBatches, render: (r) => (r.secondBatches ? `${r.secondBatches} of ${r.lines}` : `— of ${r.lines}`) },
    { key: 'late', header: 'Lines shipped late', numeric: true, align: 'right', sortValue: (r) => r.late, render: (r) => r.late || '—' },
    { key: 'poured', header: 'Poured', numeric: true, align: 'right', sortValue: (r) => r.pouredTonnes, render: (r) => `${r.pouredTonnes} t` },
  ];
  const cCols: DataColumn<Cust>[] = [
    { key: 'customer', header: 'Customer', alwaysVisible: true, sortValue: (r) => r.customer, render: (r) => name(r.customer, 230) },
    { key: 'sales', header: 'Sales', numeric: true, align: 'right', sortValue: (r) => r.sales, render: (r) => `${crore(r.sales)} · ${pct(r.share)}` },
    { key: 'price', header: '₹ a kg', numeric: true, align: 'right', sortValue: (r) => r.pricePerKg, render: (r) => perKg(r.pricePerKg) },
    { key: 'ot', header: 'On time', numeric: true, align: 'right', sortValue: (r) => r.onTimePct, render: (r) => pct(r.onTimePct) },
    { key: 'days', header: 'Days taken / promised', numeric: true, align: 'right', sortValue: (r) => r.orderToShip, render: (r) => (r.orderToShip == null ? '—' : <>{r.promised != null && r.orderToShip > r.promised ? red(r.orderToShip) : r.orderToShip} / {r.promised ?? '—'}</>) },
    { key: 'rej', header: 'Rejected in plant', numeric: true, align: 'right', sortValue: (r) => r.rejectionPct, render: (r) => pct(r.rejectionPct, 1) },
    { key: 'crej', header: 'Rejected by customer, pcs', numeric: true, align: 'right', sortValue: (r) => r.customerRejPcs, render: (r) => (r.customerRejPcs ? red(num(r.customerRejPcs)) : '—') },
    { key: 'late1', header: 'Late: not finished in time', numeric: true, align: 'right', sortValue: (r) => r.finishedLateT, render: (r) => (r.finishedLateT ? `${r.finishedLateT} t` : '—') },
    { key: 'late2', header: 'Late: ready, shipped late', numeric: true, align: 'right', sortValue: (r) => r.readyLateT, render: (r) => (r.readyLateT ? `${r.readyLateT} t` : '—') },
  ];
  const rCols: DataColumn<CRej>[] = [
    { key: 'part', header: 'Part', sortValue: (r) => r.part, render: (r) => name(r.part, 260) }, { key: 'customer', header: 'Customer', sortValue: (r) => r.customer, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 200 }}>{r.customer}</Typography> },
    { key: 'reason', header: 'Reason given', sortValue: (r) => r.reason, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 280 }} title={r.reason}>{r.reason}</Typography> },
    { key: 'pcs', header: 'Pieces', numeric: true, align: 'right', sortValue: (r) => r.pieces, render: (r) => num(r.pieces) }, { key: 'kg', header: 'Kg', numeric: true, align: 'right', sortValue: (r) => r.kg, render: (r) => num(r.kg) },
    { key: 'n', header: 'Entries', numeric: true, align: 'right', sortValue: (r) => r.entries, render: (r) => r.entries }, { key: 'last', header: 'Latest', sortValue: (r) => r.last, render: (r) => dateLabel(r.last) },
  ];
  const pick = (label: string, value: string, set: (v: string) => void, opts: string[]) => <TextField select size="small" label={label} value={value} onChange={(e) => set(e.target.value)} sx={{ minWidth: 240 }}>{opts.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}</TextField>;
  return (
    <Page title="Decisions" question="The figures side by side for the choices the plant makes: which vendor, which supplier, how much extra, which customer." filters={f} filterKeys={[]} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote="Green marks the best figure in a group and red the worst; they compare what the ERP recorded and are not a recommendation. Extra started is the batch quantity over the ordered quantity (median per part); actually rejected is rejected weight over poured weight for that part. Came back rejected is rejected pieces over pieces received back from the vendor. Purchase lines with a rate over 100 times the item's usual rate are left out.">
      {d && (
        <>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Covers {monthLabel(d.window.from.slice(0, 7))} to {monthLabel(d.window.to.slice(0, 7))}.</Typography>
          {proc && <SectionCard info="For the chosen process, the vendors that received at least 1 tonne in the period, largest first (up to 8). Share is the vendor’s tonnes over the process total; usual days away is the median days out (sent to returned); slowest 10% is the 90th-percentile days; came back rejected is rejected pieces over pieces received back; not yet back is open tonnes sent to it. Processes with only one vendor are left out." title="Which vendor for a process?"subtitle="How long each takes and how much comes back rejected" action={<Open to="vendors" label="Job-work vendors" />} flush>
            <Box sx={{ p: 2, pb: 1 }}>{pick('Process', proc.process, setProcess, d.vendorChoice.map((p) => p.process))}</Box>
            <ReportTable rows={proc.vendors} columns={vCols} getRowId={(r) => r.vendor} bare pageSize={8} defaultSortKey="tonnes" defaultSortDir="desc" />
          </SectionCard>}
          {mat && <SectionCard info="For the chosen material, bought from more than one supplier in the period. Each supplier shows value bought in rupees, quantity, average rate (value over quantity for the period), latest rate (rate of its last receipt), date of the last receipt, and number of receipts (purchase lines). Purchase lines with a rate over 100 times the item’s usual rate are left out." title="Which supplier for a material?"subtitle="What each supplier charged for the same item" action={<Open to="material-suppliers" label="Material suppliers" />} flush>
            <Box sx={{ p: 2, pb: 1 }}>{pick('Material (bought from more than one supplier)', mat.item, setItem, d.supplierChoice.map((p) => p.item))}</Box>
            <ReportTable rows={mat.suppliers} columns={sCols} getRowId={(r) => r.supplier} bare pageSize={8} defaultSortKey="value" defaultSortDir="desc" />
          </SectionCard>}
          <SectionCard info="For each part with at least 3 order lines and 1 tonne poured in the period: extra started (median planned quantity over ordered quantity, minus 1, as a percent), actually rejected (rejected weight over poured weight), and the gap in points between them. It also counts lines needing another batch and lines shipped after their delivery date. Largest gap first, so parts where more is rejected than extra started come first." title="How much extra to start for each part?"subtitle="Parts where more is rejected than the extra started come first. Parts with at least 3 order lines and 1 t poured." action={<Open to="planning" label="Planning" />} flush>
            <ReportTable rows={d.extraVsLoss} columns={eCols} getRowId={(r) => r.die} bare pageSize={10} defaultSortKey="gap" defaultSortDir="desc" empty="No parts with enough orders in this period." />
          </SectionCard>
          <SectionCard info="Up to 30 customers by sales in the period, with sales and share of the total, price a kg, on-time share of order lines due, median days taken against promised days, rejected in the plant as a share of metal poured, pieces rejected by the customer, and tonnes late in two kinds. Not finished in time counts the order journey classes ‘Poured on time, finished late’ and ‘Poured late’; ready but shipped late counts ‘Ready on time, shipped late’." title="How is each customer served?"subtitle="Money, price, delivery and rejections in one row" action={<Open to="customers" label="Customers" />} flush>
            <ReportTable rows={d.customers} columns={cCols} getRowId={(r) => r.id} bare pageSize={10} defaultSortKey="sales" defaultSortDir="desc" />
          </SectionCard>
          <SectionCard info="Customer rejection entries dated in the period, grouped by part and reason (top 60 by pieces), with the pieces, kilograms, number of entries, and latest entry date. Reasons are shown as recorded, with underscores as dashes." title="What do customers reject?"subtitle="Customer rejection entries, by part and reason" action={<Open to="quality" label="Rejection in the plant" />} flush>
            <ReportTable rows={d.customerRejections} columns={rCols} getRowId={(r) => r.key} bare pageSize={10} defaultSortKey="pcs" defaultSortDir="desc" empty="No customer rejections in this period." />
          </SectionCard>
        </>
      )}
    </Page>
  );
}
