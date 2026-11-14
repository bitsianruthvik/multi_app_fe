import type { ReactNode } from 'react';
import CurrencyRupeeRounded from '@mui/icons-material/CurrencyRupeeRounded';
import InventoryRounded from '@mui/icons-material/InventoryRounded';
import ListAltRounded from '@mui/icons-material/ListAltRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import ScaleRounded from '@mui/icons-material/ScaleRounded';
import { KpiGrid, KpiTile, SectionCard } from '@shared/ui';
import { useReport } from '../../api';
import { useFilters } from '../../filters';
import { Grid, RowBars } from '../../components/Charts';
import { Page } from '../../components/Page';
import { StackedBars, TreeTable, type TreeNode } from '../../components/FlowParts';
import { fmtCr, fmtN, fmtPct, fmtT } from '../../components/flowFormat';

interface Summary {
  orders: number;
  lines: number;
  units: number;
  tonnes: number;
  invoiced: number;
  shippedUnits?: number;
  stages?: { units: Record<string, number>; tonnes: Record<string, number> };
}
interface PartRow extends Summary { id: number; name: string }
interface TypeRow extends Summary { key: string; label: string; parts: PartRow[] }
interface Customer extends Summary { id: number; name: string; types: TypeRow[] }
interface Report { asOf: string; mode: 'asis' | 'historic'; rows: Customer[]; totals: Summary }

const STAGES = ['Not injected', 'Injected, not poured', 'Poured, not inspected', 'Inspected, not shipped'];
const shipPct = (x: Summary) => (x.units ? ((x.shippedUnits ?? 0) / x.units) * 100 : null);
const cellsOf = (x: Summary, asis: boolean): ReactNode[] => [
  fmtN(x.orders), fmtN(x.lines), fmtN(x.units), fmtT(x.tonnes), fmtCr(x.invoiced),
  ...(asis ? [fmtPct(shipPct(x))] : []),
];

const INFO = {
  asis: {
    orders: 'Orders that still have an open line: not fully shipped and not short-closed, as of the data date. The date range does not apply. Counts orders, not lines.',
    lines: 'Order lines that are not fully shipped and not short-closed, as of the data date. One order can have several open lines.',
    units: 'Pieces ordered on the open lines, meaning the full ordered quantity, including pieces already shipped. Counted in pieces.',
    tonnes: 'Ordered weight on the open lines, including pieces already shipped. Shown in tonnes, where one tonne is 1,000 kg.',
    invoiced: 'Amount invoiced so far on the open lines, in rupees, shown in crore (one crore is ten million rupees). Invoices are counted to the data date.',
    chartA: 'Invoiced value so far on each customer’s open lines, in crore of rupees. Shows the top 15 customers by value. The date range does not apply.',
    chartB: 'Ordered pieces on open lines for the 12 customers with the most pieces. The green part is shipped; the other parts are pieces the ERP records in each stage. Short-closed lines are left out.',
    tree: 'Each customer, opened to its order types (metal and finish) and then to its part types. Pieces and tonnes are ordered quantities; invoiced is the amount invoiced so far. Shipped % is shipped pieces over ordered pieces.',
  },
  historic: {
    orders: 'Orders with at least one line whose order date falls in the chosen dates. Short-closed lines are left out. Counts orders, not lines.',
    lines: 'Order lines whose order date falls in the chosen dates. Short-closed lines are left out.',
    units: 'Pieces ordered on those lines, in pieces, for orders that came in during the chosen dates.',
    tonnes: 'Ordered weight on those lines, shown in tonnes, where one tonne is 1,000 kg.',
    invoiced: 'Amount invoiced so far on those lines, in rupees, shown in crore (one crore is ten million rupees). Invoices are counted to the data date.',
    chartA: 'Invoiced value so far on each customer’s lines ordered in the chosen dates, in crore of rupees. Shows the top 15 customers by value. Short-closed lines are left out.',
    tree: 'Each customer, opened to its order types (metal and finish) and then to its part types. Pieces and tonnes are ordered quantities; invoiced is the amount invoiced so far.',
  },
};

export default function FlowCustomer({ mode }: { mode: 'asis' | 'historic' }) {
  const f = useFilters();
  const asis = mode === 'asis';
  const info = INFO[mode] as typeof INFO.asis;
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/flow/customers${f.query({ mode })}` : null);

  const title = asis ? 'Customer · As-is' : 'Customer · Historic';
  const question = asis
    ? 'What is open now, by customer, and how much of it has shipped or sits in each stage.'
    : 'Orders that came in during the chosen dates, by customer: value, tonnes and units.';
  const footnote = asis
    ? 'Open order lines (not fully shipped, not short-closed). Value is the invoiced amount so far on those lines. Tonnes and pieces are ordered quantities; stage pieces are what the ERP records in each stage.'
    : 'Order lines whose order date falls in the chosen dates (short-closed lines left out). Value is the amount invoiced so far on those lines.';

  const top15 = d ? d.rows.slice(0, 15).map((c) => ({ key: String(c.id), label: c.name, value: c.invoiced })) : [];
  const top12 = d ? [...d.rows].sort((a, b) => b.units - a.units).slice(0, 12) : [];
  const tree: TreeNode[] = d ? d.rows.map((c) => ({
    key: `c-${c.id}`,
    label: c.name,
    cells: cellsOf(c, asis),
    children: c.types.map((t) => ({
      key: `${c.id}-${t.key}`,
      label: t.label,
      cells: cellsOf(t, asis),
      children: t.parts.map((p) => ({ key: `${c.id}-${t.key}-${p.id}`, label: p.name, cells: cellsOf(p, asis) })),
    })),
  })) : [];
  const head = ['Customer, order type, part', 'Orders', 'Lines', 'Pieces', 'Tonnes', 'Invoiced', ...(asis ? ['Shipped %'] : [])];

  return (
    <Page title={title} question={question} filters={f} filterKeys={['finish', 'metal', 'market', 'customer']}
      period={!asis} loading={loading} error={error} reload={reload} hasData={!!d} footnote={footnote}>
      {d && (
        <>
          <KpiGrid>
            <KpiTile label={asis ? "Open orders" : "Orders"} icon={<ReceiptLongRounded />} display={fmtN(d.totals.orders)} info={info.orders} />
            <KpiTile label={asis ? "Open lines" : "Lines"} icon={<ListAltRounded />} display={fmtN(d.totals.lines)} info={info.lines} />
            <KpiTile label="Pieces" icon={<InventoryRounded />} display={fmtN(d.totals.units)} info={info.units} />
            <KpiTile label="Tonnes" icon={<ScaleRounded />} display={fmtT(d.totals.tonnes)} info={info.tonnes} />
            <KpiTile label="Invoiced so far" icon={<CurrencyRupeeRounded />} display={fmtCr(d.totals.invoiced)} info={info.invoiced} tone="primary" />
          </KpiGrid>

          {asis ? (
            <Grid cols="1fr 1fr">
              <SectionCard title={asis ? "Open value by customer" : "Value by customer"} subtitle="Invoiced so far, top 15" info={info.chartA}>
                <RowBars rows={top15} format={fmtCr} />
              </SectionCard>
              <SectionCard title="Where the open pieces are, by customer" subtitle="Top 12 by pieces" info={info.chartB}>
                <StackedBars
                  labels={top12.map((c) => c.name)}
                  format={fmtN}
                  series={[
                    { label: 'Shipped', data: top12.map((c) => c.shippedUnits ?? 0), color: 'var(--c-success-600)' },
                    ...STAGES.map((s) => ({ label: s, data: top12.map((c) => c.stages?.units[s] ?? 0) })),
                  ]}
                />
              </SectionCard>
            </Grid>
          ) : (
            <SectionCard title="Value by customer" subtitle="Invoiced so far, top 15" info={info.chartA}>
              <RowBars rows={top15} format={fmtCr} />
            </SectionCard>
          )}

          <SectionCard flush title="Customers, order types and part types" subtitle="Open the rows to drill down" info={info.tree}>
            <TreeTable head={head} rows={tree} empty="No orders for these filters." />
          </SectionCard>
        </>
      )}
    </Page>
  );
}
