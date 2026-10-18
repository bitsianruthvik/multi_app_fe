import { useEffect, useState } from 'react';
import { Box, Dialog, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import CalculateRounded from '@mui/icons-material/CalculateRounded';
import { getCosting, getCostSheet, type CostRow, type CostSheet, type ScrapOffcuts } from '../api/accounts';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useUrlParam } from '../hooks/useUrlState';
import { useFullScreen } from '../hooks/useFullScreen';
import { appPath } from '../navMeta';
import { rupeeText } from '../lib/money';
import { marginFamily } from '../lib/accounts';
import { DataTable, type DataColumn } from '../components/DataTable';
import { Badge, EmptyState, ErrorNotice, ListSkeleton, Mono, PageHeader } from '../components/ui';
import { FullScreenFrame, FullScreenToggle } from '../components/FullScreen';
import { DialogCloseButton } from '../components/FormDialog';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };
const KIND_WORD: Record<string, string> = { material: 'Material', consumable: 'Consumable', customer: 'Customer\'s (₹0)', scrap: 'Scrap (credit)', offcut: 'Offcut (credit)' };

const kg = (n: number | null | undefined) => (n == null ? '—' : `${Number(Number(n).toFixed(1)).toLocaleString('en-IN')} kg`);

/**
 * SCRAP & OFFCUTS (2026-10-18): what the order actually left (scrap into the scrap area, offcut lots cut from its plates)
 * against what the acceptance charges the customer for them — and every figure valued at nothing, with where to fix it.
 */
export function ScrapOffcutsBlock({ so }: { so: ScrapOffcuts }) {
  const company = useCompanySlug();
  const a = so.actual;
  return (
    <Box data-testid="cs-scrap-offcuts">
      <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>Scrap and offcuts</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', columnGap: 2, rowGap: 0.3, fontSize: 13 }}>
        <span>Scrap (into the scrap area)</span><Mono muted>{kg(a.scrapKg)}</Mono>
        <span data-testid="cs-scrap-value">{a.scrapKg > 0 && so.ratePerKg == null ? <Box component="span" sx={{ color: 'var(--c-warning-800)' }}>not costed</Box> : <Mono>{rupeeText(a.scrapValue, 2)}</Mono>}</span>
        <span>Offcuts kept ({a.offcutLots} lot{a.offcutLots === 1 ? '' : 's'})</span><Mono muted>{kg(a.offcutKg)}</Mono><Mono>{rupeeText(a.offcutValue, 2)}</Mono>
      </Box>
      {so.charges.length > 0 ? so.charges.map((c) => (
        <Typography key={c.key} data-testid="cs-scrap-charge" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5 }}>
          Charged to the customer — {c.label}: {c.of === 'material_pct' ? `${c.rate ?? '—'} % of material` : `estimate ${kg(c.estimate)} × ${rupeeText(c.rate, 2)}/kg`} = {rupeeText(c.contract)}; earned so far {rupeeText(c.earned)}
          {c.actualKg != null ? ` · actual ${kg(c.actualKg)}${c.onActual != null ? ` would be ${rupeeText(c.onActual)}` : ''}` : ''}.
        </Typography>
      )) : <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 0.5 }}>Not charged to the customer (no scrap & offcuts charge in the acceptance).</Typography>}
      {so.flags.length > 0 && (
        <Box data-testid="cs-flags" sx={{ mt: 0.75, display: 'grid', gap: 0.25 }}>
          {so.flags.map((f, i) => (
            <Typography key={i} data-testid="cs-flag" data-code={f.code} sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>
              {f.message}{f.fix && <> <Box component={Link} to={appPath(company, f.fix.to)} sx={{ color: 'inherit' }}>{f.fix.label}</Box></>}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}

/** The cost sheet of one order, in plain rows: what it earned, what it used, what came back, the margin. */
export function CostSheetBody({ sheet }: { sheet: CostSheet }) {
  const row = (label: string, value: number, sign: '' | '−' | '+' = '', test?: string, strong = false) => (
    <Box key={label} data-testid={test} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.6, borderBottom: '1px solid var(--c-divider)', fontWeight: strong ? 600 : 400 }}>
      <Typography sx={{ fontSize: 14, fontWeight: 'inherit' }}>{sign ? `${sign} ` : ''}{label}</Typography>
      <Mono sx={{ fontWeight: strong ? 600 : 400 }}>{rupeeText(value, 2)}</Mono>
    </Box>
  );
  return (
    <Box sx={{ display: 'grid', gap: 2 }} data-testid="cost-sheet">
      {!sheet.hasTerms && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No accepted terms yet: nothing is charged. The costs below are what the order used so far.</Typography>}
      <Box>
        {row('Charged so far', sheet.charged, '', 'cs-charged', true)}
        {row('Material issued (at cost)', sheet.material, '−', 'cs-material')}
        {row('Consumables issued', sheet.consumables, '−', 'cs-consumables')}
        {row('Contractor work (later)', sheet.contractor, '−', 'cs-contractor')}
        {row('Credits: scrap and offcuts', sheet.credits, '+', 'cs-credits')}
        <Box data-testid="cs-margin" sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, pt: 1, alignItems: 'baseline' }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700 }}>Margin</Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Mono sx={{ fontWeight: 700, fontSize: 15 }}>{rupeeText(sheet.margin, 2)}</Mono>
            {sheet.marginPct != null && <Badge family={marginFamily(sheet.marginPct)} noIcon label={`${sheet.marginPct} %`} />}
          </Box>
        </Box>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.5 }}>
          Contract value {rupeeText(sheet.contract)} · invoiced {rupeeText(sheet.invoiced)} · received {rupeeText(sheet.received)}.
          {sheet.customerMaterial.quantity > 0 ? ' The customer\'s own material is used at ₹0.' : ''}
          {sheet.uncostedRows > 0 ? ` ${sheet.uncostedRows} stock row${sheet.uncostedRows === 1 ? ' has' : 's have'} no cost and ${sheet.uncostedRows === 1 ? 'is' : 'are'} left out.` : ''}
        </Typography>
      </Box>
      {sheet.earned.rows.length > 0 && (
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>What is charged so far</Typography>
          {sheet.earned.rows.map((r) => (
            <Box key={r.key} data-testid="cs-earned" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, py: 0.4, fontSize: 13 }}>
              <span>{r.label}{r.earnedQuantity != null && r.unit ? ` — ${r.earnedQuantity} of ${r.quantity} ${r.unit}` : ''} <Box component="span" sx={{ color: 'var(--c-text-3)' }}>· {r.note}</Box></span>
              <Mono>{rupeeText(r.amount, 2)}</Mono>
            </Box>
          ))}
        </Box>
      )}
      {sheet.scrapOffcuts && <ScrapOffcutsBlock so={sheet.scrapOffcuts} />}
      {sheet.items.length > 0 && (
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>Items</Typography>
          {sheet.items.map((i) => (
            <Box key={`${i.kind}-${i.itemId}`} data-testid="cs-item" sx={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr) auto auto', gap: 1, py: 0.3, fontSize: 12.5 }}>
              <span>{KIND_WORD[i.kind] ?? i.kind}</span>
              <span>{i.code ?? ''} {i.name ?? ''}</span>
              <Mono muted>{Number(i.quantity.toFixed(3))} {i.uom ?? ''}</Mono>
              <Mono>{i.kind === 'customer' ? '₹0' : rupeeText(i.value, 2)}</Mono>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function SheetDialog({ orderId, onClose }: { orderId: number | null; onClose: () => void }) {
  const fs = useFullScreen('accounts-cost-sheet');
  const sheet = useLoad(() => (orderId ? getCostSheet(orderId) : Promise.resolve(null)), [orderId]);
  return (
    <Dialog open={!!orderId} onClose={onClose} maxWidth="md" fullWidth fullScreen={fs.on} data-testid="cost-sheet-dialog">
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1 }}>Cost sheet{sheet.data ? ` — ${sheet.data.order.code}` : ''}<Box sx={{ fontSize: 13, fontWeight: 400, color: 'var(--c-text-2)' }}>{sheet.data?.order.customer ?? ''}</Box></Box>
        <FullScreenToggle on={fs.on} onToggle={fs.toggle} />
        <DialogCloseButton onClose={onClose} />
      </DialogTitle>
      <DialogContent>
        <ErrorNotice error={sheet.error} onRetry={sheet.reload} />
        {!sheet.data && !sheet.error && <ListSkeleton rows={5} />}
        {sheet.data && <CostSheetBody sheet={sheet.data} />}
      </DialogContent>
    </Dialog>
  );
}

/**
 * ACCOUNTS › ORDER COSTING (§74): one row per accepted sales order — what it has earned by its charges against what it
 * used (material at cost, consumables), less contractor work (later), plus scrap and offcut credits — and the margin.
 * A row opens the order's cost sheet.
 */
export default function OrderCosting() {
  const company = useCompanySlug();
  const fs = useFullScreen('accounts-costing');
  const [search, setSearch] = useUrlParam('search', '');
  const [typed, setTyped] = useState(search);
  const [open, setOpen] = useUrlParam('order', '');
  const list = useLoad(() => getCosting(search || undefined), [search]);
  useEffect(() => { const t = window.setTimeout(() => { if (typed !== search) setSearch(typed); }, 300); return () => window.clearTimeout(t); }, [typed, search, setSearch]);
  const money = (k: keyof CostRow) => (r: CostRow) => <Mono>{rupeeText(Number(r[k] ?? 0))}</Mono>;
  const columns: DataColumn<CostRow>[] = [
    { key: 'order', header: 'Order', alwaysVisible: true, sortValue: (r) => r.order.code, render: (r) => <Mono><Box component={Link} to={appPath(company, `orders/${r.order.id}`)} sx={linkSx} onClick={(e) => e.stopPropagation()}>{r.order.code}</Box></Mono> },
    { key: 'customer', header: 'Customer', sortValue: (r) => r.order.customer ?? '', render: (r) => r.order.customer ?? '—' },
    { key: 'contract', header: 'Contract', numeric: true, defaultHidden: true, sortValue: (r) => r.contract, render: money('contract') },
    { key: 'charged', header: 'Charged so far', numeric: true, sortValue: (r) => r.charged, render: money('charged') },
    { key: 'material', header: 'Material', numeric: true, sortValue: (r) => r.material, render: money('material') },
    { key: 'consumables', header: 'Consumables', numeric: true, sortValue: (r) => r.consumables, render: money('consumables') },
    { key: 'contractor', header: 'Contractor', numeric: true, defaultHidden: true, sortValue: (r) => r.contractor, render: money('contractor') },
    { key: 'credits', header: 'Credits', numeric: true, sortValue: (r) => r.credits, render: money('credits') },
    // Scrap & offcuts (2026-10-18): the actual kg, and what the customer is charged for them so far.
    { key: 'scrap', header: 'Scrap / offcuts', numeric: true, defaultHidden: true, sortValue: (r) => (r.scrapKg ?? 0) + (r.offcutKg ?? 0),
      render: (r) => <Mono muted>{kg(r.scrapKg)} / {kg(r.offcutKg)}</Mono>, exportValue: (r) => `${r.scrapKg ?? 0} / ${r.offcutKg ?? 0}` },
    { key: 'scrapCharged', header: 'Scrap charged', numeric: true, defaultHidden: true, sortValue: (r) => r.scrapCharged ?? 0, render: money('scrapCharged') },
    { key: 'flags', header: 'Not costed', numeric: true, sortValue: (r) => r.flags ?? 0,
      render: (r) => (r.flags ? <Badge family="warning" noIcon label={`${r.flags}`} /> : <Mono muted>—</Mono>) },
    {
      key: 'margin', header: 'Margin', numeric: true, alwaysVisible: true, sortValue: (r) => r.margin,
      render: (r) => <Box sx={{ display: 'inline-flex', gap: 0.75, alignItems: 'center' }}><Mono>{rupeeText(r.margin)}</Mono>{r.marginPct != null && <Badge family={marginFamily(r.marginPct)} noIcon label={`${r.marginPct} %`} />}</Box>,
    },
  ];
  const t = list.data?.totals;
  return (
    <FullScreenFrame on={fs.on} onExit={() => fs.set(false)}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
        <PageHeader title="Order costing" subtitle="Charged so far, less material and consumables, plus scrap credits — the margin of each order."
          actions={(
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField size="small" placeholder="Search orders" value={typed} onChange={(e) => setTyped(e.target.value)} inputProps={{ 'aria-label': 'Search orders' }} />
              <FullScreenToggle on={fs.on} onToggle={fs.toggle} />
            </Box>
          )} />
        <ErrorNotice error={list.error} onRetry={list.reload} />
        {t && (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }} data-testid="costing-totals">
            All orders: charged {rupeeText(t.charged)} · material {rupeeText(t.material)} · consumables {rupeeText(t.consumables)} · credits {rupeeText(t.credits)} · margin {rupeeText(t.margin)}.
            {list.data!.generalThisMonth.value > 0 ? ` General (overhead) issues this month: ${rupeeText(list.data!.generalThisMonth.value)}.` : ''}
          </Typography>
        )}
        <DataTable rows={list.data?.rows ?? []} columns={columns} getRowId={(r) => r.order.id} loading={list.loading && !list.data} storageKey="accounts-costing" exportName="order-costing"
          onRowClick={(r) => setOpen(String(r.order.id))}
          empty={<EmptyState icon={<CalculateRounded />} title="No accepted orders yet." body="An order appears here once its customer acceptance is approved." />} />
        <SheetDialog orderId={open ? Number(open) : null} onClose={() => setOpen('')} />
      </Box>
    </FullScreenFrame>
  );
}
