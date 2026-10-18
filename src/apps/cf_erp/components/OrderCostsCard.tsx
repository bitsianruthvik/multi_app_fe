import { Box, Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { getCostSheet, type CostSheet } from '../api/accounts';
import { useCompanySlug } from '../hooks/useLoad';
import { appPath } from '../navMeta';
import { cfApi } from '../api/client';
import type { OrderCosts } from '../api/money';
import type { SalesOrder } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { kgText, materialMargin, rupeeText } from '../lib/money';
import { DataTable, type DataColumn } from './DataTable';
import { Money } from './Money';
import { Mono, SectionCard } from './ui';

type Row = OrderCosts['lines'][number];

/**
 * The order's costs, kept quiet: what stock has cost us so far on this order
 * — material issued at cost, scrap, and each nest's steel, wastage and offcuts —
 * and, at the foot, the order total less that material. It says "material
 * margin (before labour)" because that is all it is. A customer's own material
 * is never counted: it costs us nothing.
 */
/**
 * §74: the order's COST SHEET (Accounts › Order costing — the same numbers): charged so far, material, consumables,
 * credits, margin. Shown when the person may see it; else the card keeps its material margin.
 */
function SheetFoot({ sheet }: { sheet: CostSheet }) {
  const company = useCompanySlug();
  return (
    <Box data-testid="order-cost-sheet" sx={{ px: 2.5, py: 1.5, borderTop: '1px solid var(--c-divider)', display: 'grid', gap: 0.5, justifyItems: 'end' }}>
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', textAlign: 'right' }}>
        Charged so far <Mono>{rupeeText(sheet.charged)}</Mono> · material <Mono>{rupeeText(sheet.material)}</Mono> · consumables <Mono>{rupeeText(sheet.consumables)}</Mono> · credits <Mono>{rupeeText(sheet.credits)}</Mono>
      </Typography>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Margin (before labour)</Typography>
        <Mono sx={{ fontWeight: 600, fontSize: 14 }}>{rupeeText(sheet.margin)}{sheet.marginPct != null ? ` · ${sheet.marginPct}%` : ''}</Mono>
        <Button size="small" component={Link} to={appPath(company, `order-costing?order=${sheet.order.id}`)}>Open the cost sheet</Button>
      </Box>
      {/* Never ₹0 silently (2026-10-18): what is not costed, with where to fix it. */}
      {(sheet.scrapOffcuts?.flags ?? []).map((f, i) => (
        <Typography key={i} data-testid="order-cost-flag" sx={{ fontSize: 12.5, color: 'var(--c-warning-800)', textAlign: 'right' }}>
          {f.message}{f.fix && <> <Box component={Link} to={appPath(company, f.fix.to)} sx={{ color: 'inherit' }}>{f.fix.label}</Box></>}
        </Typography>
      ))}
    </Box>
  );
}

export function OrderCostsCard({ order }: { order: SalesOrder }) {
  const costs = useLoad(() => cfApi.get<OrderCosts>(`/orders/${order.id}/costs`), [order.id]);
  const sheet = useLoad(() => getCostSheet(order.id), [order.id]);
  if (costs.error) return null;           // no inventory permission, or nothing to say: stay out of the way
  const c = costs.data;
  if (!c) return null;
  const s = sheet.error ? null : sheet.data;
  const t = c.totals;
  // §61: steel cut from untracked offcuts is never issued from stock — it is its own column, and part of the material.
  const loose = t.untrackedValue ?? 0;
  const anyLoose = c.lines.some((l) => (l.nest.untracked?.pieces ?? 0) > 0);
  const anything = t.issuedValue > 0 || t.scrapValue > 0 || t.plateValue > 0 || anyLoose || c.lines.some((l) => l.nest.lots > 0 || l.issued.uncostedRows > 0 || l.issued.quantity > 0);
  if (!anything && s?.hasTerms) {
    return <SectionCard flush title="Costs" subtitle="Nothing has been issued to this order yet."><SheetFoot sheet={s} /></SectionCard>;
  }
  if (!anything) {
    return (
      <SectionCard title="Costs" subtitle="Material at cost, once stock is issued to this order.">
        <Typography sx={{ color: 'var(--c-text-3)', fontSize: 13.5 }}>Nothing has been issued to this order yet.</Typography>
      </SectionCard>
    );
  }
  const columns: DataColumn<Row>[] = [
    { key: 'line', header: 'Line', alwaysVisible: true, render: (l) => <><Mono muted>{l.line.lineNo}</Mono> <Mono>{l.line.item.code ?? l.line.item.name}</Mono></> },
    {
      key: 'issued', header: 'Material issued', numeric: true, alwaysVisible: true, sortValue: (l) => l.issued.value,
      render: (l) => (l.issued.quantity === 0 && l.issued.uncostedRows === 0 ? <Mono muted>—</Mono>
        : l.issued.value === 0 && l.issued.uncostedRows > 0 ? <Money value={null} />
          : <><Money value={l.issued.value} />{l.issued.uncostedRows > 0 && <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 11.5 }}> + {l.issued.uncostedRows} not costed</Box>}</>),
    },
    { key: 'scrap', header: 'Scrap', numeric: true, sortValue: (l) => l.scrap.value, render: (l) => (l.scrap.value > 0 ? <Money value={l.scrap.value} /> : <Mono muted>—</Mono>) },
    {
      key: 'plate', header: 'Steel bought', numeric: true, sortValue: (l) => l.nest.plateValue,
      render: (l) => (l.nest.lots === 0 ? <Mono muted>—</Mono>
        : l.nest.customerLots === l.nest.lots ? <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>customer&rsquo;s</Box>
          : l.nest.plateValue === 0 && l.nest.uncostedLots > 0 ? <Money value={null} /> : <Money value={l.nest.plateValue} />),
    },
    {
      key: 'wastage', header: 'Wastage', numeric: true, sortValue: (l) => l.nest.wastageValue,
      render: (l) => (l.nest.plateValue > 0 ? <><Money value={l.nest.wastageValue} /><Mono muted> · {kgText(l.nest.wastageKg)}</Mono></> : <Mono muted>—</Mono>),
    },
    {
      key: 'offcut', header: 'Offcuts', numeric: true, sortValue: (l) => l.nest.offcutValue,
      render: (l) => (l.nest.plateValue > 0 ? <><Money value={l.nest.offcutValue} /><Mono muted> · {kgText(l.nest.offcutKg)}</Mono></> : <Mono muted>—</Mono>),
    },
    ...(anyLoose ? [{
      key: 'untracked', header: 'From offcuts', numeric: true, sortValue: (l: Row) => l.nest.untracked?.value ?? 0,
      render: (l: Row) => {
        const u = l.nest.untracked;
        if (!u?.pieces) return <Mono muted>—</Mono>;
        return <span title={`${u.pieces} piece${u.pieces === 1 ? '' : 's'} cut from untracked offcuts, at the plate rate`}><Money value={u.value === 0 && u.uncostedPieces > 0 ? null : u.value} /><Mono muted> · {kgText(u.kg)}</Mono></span>;
      },
    }] : []),
  ];
  const total = order.total;
  // ONE order value (2026-10-18): the terms sent / accepted once they exist, else the line-rate estimate.
  const value = order.value?.amount ?? total?.amount;
  const material = t.issuedValue + loose;
  const m = materialMargin(value, material);
  const nothingCosted = material === 0 && t.uncostedRows > 0;
  // Before anything is issued there is no margin to show — a 100% would read as a result.
  const nothingIssued = material === 0 && t.uncostedRows === 0;
  return (
    <SectionCard flush title="Costs" subtitle="What stock has cost on this order so far, at cost. Labour is not in it.">
      <DataTable bare rows={c.lines} columns={columns} getRowId={(l) => l.line.id} storageKey="order-costs" />
      {s?.hasTerms ? <SheetFoot sheet={s} /> : <Box data-testid="order-margin" sx={{ px: 2.5, py: 1.5, borderTop: '1px solid var(--c-divider)', display: 'grid', gap: 0.5, justifyItems: 'end' }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Order value {order.value ? `(${order.value.label})` : total && !total.complete ? '(not complete)' : ''}</Typography>
          {value != null && value > 0 ? <Mono>{rupeeText(value)}</Mono> : <Money value={null} missing="not priced" />}
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>less material</Typography>
          <Money value={nothingCosted ? null : material} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Material margin (before labour)</Typography>
          {nothingIssued ? <Money value={null} missing="no material issued yet" /> : m && !nothingCosted ? <Mono sx={{ fontWeight: 600, fontSize: 14 }}>{rupeeText(m.margin)}{m.pct != null ? ` · ${m.pct}%` : ''}</Mono> : <Money value={null} missing="not worked out" />}
        </Box>
        {(t.uncostedRows > 0 || (total && !total.complete) || t.customerIssuedValue > 0 || loose > 0) && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', textAlign: 'right' }}>
            {[
              t.uncostedRows > 0 ? `${t.uncostedRows} issue${t.uncostedRows === 1 ? '' : 's'} had no cost and ${t.uncostedRows === 1 ? 'is' : 'are'} left out, so the margin reads high` : null,
              total && !total.complete ? 'the order total is missing some lines' : null,
              t.customerIssuedValue > 0 ? 'the customer’s own material is not counted' : null,
              loose > 0 ? `material includes ${rupeeText(loose)} of steel cut from untracked offcuts, at the plate rate` : null,
            ].filter(Boolean).join(' · ')}.
          </Typography>
        )}
      </Box>}
    </SectionCard>
  );
}
