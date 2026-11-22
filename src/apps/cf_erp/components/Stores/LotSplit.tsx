import { Box, Button, Typography } from '@mui/material';
import { getItemLedger, qtyText } from '../../api/storesDesk';
import { useLoad } from '../../hooks/useLoad';
import { Badge, ErrorNotice, Mono, SkeletonRows } from '../ui';

const th = { fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--c-text-3)', textAlign: 'left', p: '6px 10px', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' } as const;
const td = { p: '7px 10px', borderBottom: '1px solid var(--c-divider)', fontSize: 13, verticalAlign: 'top' } as const;
const num = { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } as const;
const money = (n: number | null | undefined) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);

/**
 * A Stock line opened by a double-click (user, 2026-11-23: "the stock on a line should be splittable by batch or lot upon
 * double click with extra details coming up too"): the item's lots in the store — area, brand, vendor and the vendor's
 * lot number, the day it came in, how much, how much of it is held for a request, whose it is, and (for Stores) its cost —
 * then where else it is, who has some of it, and what is on order. "Every entry" opens the item's full ledger.
 */
export function LotSplit({ itemId, from, to, showCost, onEntries }: { itemId: number; from: string; to: string; showCost: boolean; onEntries: () => void }) {
  const led = useLoad(() => getItemLedger(itemId, { from, to }), [itemId, from, to]);
  if (led.error) return <Box sx={{ p: 1.5 }}><ErrorNotice error={led.error} onRetry={led.reload} /></Box>;
  if (!led.data) return <Box sx={{ p: 1.5 }}><SkeletonRows rows={2} /></Box>;
  const d = led.data;
  // stock with no lot (an item still counted by quantity): what an area holds beyond its lots
  const loose = d.areas.filter((a) => a.store).map((a) => ({ area: a, quantity: a.quantity - d.lots.filter((l) => l.area.id === a.id).reduce((t, l) => t + l.quantity, 0) }))
    .filter((x) => Math.abs(x.quantity) > 1e-9);
  const total = d.lots.reduce((t, l) => t + l.quantity, 0) + loose.reduce((t, x) => t + x.quantity, 0);
  const elsewhere = d.areas.filter((a) => !a.store);
  const rows = d.lots.length + loose.length;
  return (
    <Box data-testid="lot-split" sx={{ p: 1.5, display: 'grid', gap: 1.25, background: 'var(--c-neutral-50)', minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{rows ? `${qtyText(total)} ${d.item.uom} in the store · ${[d.lots.length ? `${d.lots.length} lot${d.lots.length === 1 ? '' : 's'}` : null, loose.length ? 'not in a lot yet' : null].filter(Boolean).join(' + ')}` : 'Nothing in the store'}</Typography>
        {d.item.min != null && <Badge family="neutral" label={`min ${qtyText(d.item.min)}${d.item.max != null ? ` · max ${qtyText(d.item.max)}` : ''}`} noIcon />}
        {d.item.returnable && <Badge family="info" label="Returnable" noIcon />}
        <Button size="small" onClick={onEntries} sx={{ ml: 'auto' }} data-testid="lot-entries">Every entry</Button>
      </Box>
      {rows > 0 && (
        <Box sx={{ overflowX: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm, 6px)', background: 'var(--c-surface)' }}>
          <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>
              <Box component="th" sx={th}>Lot</Box><Box component="th" sx={th}>Area</Box><Box component="th" sx={th}>Brand</Box><Box component="th" sx={th}>Vendor</Box>
              <Box component="th" sx={th}>Vendor's lot no.</Box><Box component="th" sx={th}>Came in</Box><Box component="th" sx={{ ...th, ...num }}>Quantity</Box>
              <Box component="th" sx={{ ...th, ...num }}>Held</Box>{showCost && <Box component="th" sx={{ ...th, ...num }}>Unit cost</Box>}
            </tr></thead>
            <tbody>
              {d.lots.map((l) => (
                <tr key={`${l.id}:${l.area.id}`} data-testid="lot-row">
                  <Box component="td" sx={td}><Mono>{l.code}</Mono>{l.status !== 'available' && <Box><Badge family="warning" label={l.status === 'on_hold' ? 'On hold' : l.status} noIcon /></Box>}{l.owner && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{l.owner.name}'s</Typography>}</Box>
                  <Box component="td" sx={td}>{l.area.name}</Box>
                  <Box component="td" sx={td}>{l.brand ? l.brand.name : <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>not recorded</Typography>}</Box>
                  <Box component="td" sx={td}>{l.vendor?.name ?? '—'}</Box>
                  <Box component="td" sx={td}>{l.supplierRef ?? '—'}</Box>
                  <Box component="td" sx={{ ...td, whiteSpace: 'nowrap' }}>{l.receivedOn ?? '—'}</Box>
                  <Box component="td" sx={{ ...td, ...num, fontWeight: 600 }}>{qtyText(l.quantity)}</Box>
                  <Box component="td" sx={{ ...td, ...num }}>{l.held ? qtyText(l.held) : '—'}</Box>
                  {showCost && <Box component="td" sx={{ ...td, ...num }}>{money(l.unitCost)}</Box>}
                </tr>
              ))}
              {loose.map((x) => (
                <tr key={`loose${x.area.id}`} data-testid="lot-row">
                  <Box component="td" sx={td}><Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>not in a lot</Typography></Box>
                  <Box component="td" sx={td}>{x.area.name}</Box>
                  <Box component="td" sx={td}>—</Box><Box component="td" sx={td}>—</Box><Box component="td" sx={td}>—</Box><Box component="td" sx={td}>—</Box>
                  <Box component="td" sx={{ ...td, ...num, fontWeight: 600 }}>{qtyText(x.quantity)}</Box>
                  <Box component="td" sx={{ ...td, ...num }}>—</Box>{showCost && <Box component="td" sx={{ ...td, ...num }}>—</Box>}
                </tr>
              ))}
            </tbody>
          </Box>
        </Box>
      )}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--c-text-2)' }}>
        {elsewhere.length > 0 && <span>Also in {elsewhere.map((a) => `${a.name} ${qtyText(a.quantity)}`).join(', ')}</span>}
        {d.outWith.length > 0 && <span>Out with {d.outWith.map((o) => `${o.holder ?? o.order ?? '—'} ${qtyText(o.left)}`).join(', ')}</span>}
        {d.onOrder.length > 0 && <span>On order {d.onOrder.map((o) => `${o.code} ${qtyText(o.quantity)}${o.expected ? ` (due ${o.expected})` : ''}`).join(', ')}</span>}
      </Box>
    </Box>
  );
}
