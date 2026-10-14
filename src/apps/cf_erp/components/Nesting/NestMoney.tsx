import { Box } from '@mui/material';
import { cfApi } from '../../api/client';
import type { OrderCosts } from '../../api/money';
import { useLoad } from '../../hooks/useLoad';
import { kgText, rupeeText } from '../../lib/money';
import { Money } from '../Money';
import { Mono } from '../ui';

/**
 * What the saved nest's steel cost, beside its kilograms: steel bought in
 * rupees, what the wastage is worth, what the offcuts are worth (they are not
 * lost — they go back to stock). Read from the order's costs, so it is the
 * same number the Costs card shows. Nothing is drawn until there is a cost to
 * say, and a customer's plate is left out: it costs us nothing. Pieces cut from
 * untracked offcuts (§61) are on no plate: their steel, at the plate rate, is said
 * on its own.
 */
export function NestMoney({ orderId, lineId }: { orderId: number; lineId: number }) {
  const costs = useLoad(() => cfApi.get<OrderCosts>(`/orders/${orderId}/costs`).catch(() => null), [orderId, lineId]);
  const n = costs.data?.lines.find((l) => l.line.id === lineId)?.nest;
  if (!n || (n.lots === 0 && !n.untracked?.pieces)) return null;
  const u = n.untracked?.pieces ? n.untracked : null;
  const loose = u ? (
    <span data-testid="nest-money-untracked">From untracked offcuts <Money value={u.value === 0 && u.uncostedPieces > 0 ? null : u.value} /> <Mono muted>({kgText(u.kg)}, at the plate rate{u.uncostedPieces > 0 && u.value > 0 ? `, ${u.uncostedPieces} not costed` : ''})</Mono></span>
  ) : null;
  if (n.lots === 0) return <Box data-testid="nest-money" sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, fontSize: 13, color: 'var(--c-text-2)' }}>{loose}</Box>;
  const allTheirs = n.customerLots === n.lots;
  if (allTheirs) return <Box data-testid="nest-money" sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, fontSize: 12.5, color: 'var(--c-text-3)' }}><span>The steel on the plates is the customer&rsquo;s, so it costs us nothing.</span>{loose}</Box>;
  const none = n.plateValue === 0 && n.uncostedLots > 0;
  return (
    <Box data-testid="nest-money" sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, fontSize: 13, color: 'var(--c-text-2)' }}>
      <span>Steel bought <Money value={none ? null : n.plateValue} /></span>
      {!none && (
        <>
          <span>Wastage <Mono>{rupeeText(n.wastageValue)}</Mono> <Mono muted>({kgText(n.wastageKg)})</Mono></span>
          <span>Offcuts <Mono>{rupeeText(n.offcutValue)}</Mono> <Mono muted>({kgText(n.offcutKg)}, back to stock)</Mono></span>
        </>
      )}
      {n.uncostedLots > 0 && !none && <Box component="span" sx={{ color: 'var(--c-text-3)' }}>{n.uncostedLots} plate{n.uncostedLots === 1 ? '' : 's'} not costed</Box>}
      {n.customerLots > 0 && <Box component="span" sx={{ color: 'var(--c-text-3)' }}>{n.customerLots} customer plate{n.customerLots === 1 ? '' : 's'} not counted</Box>}
      {loose}
    </Box>
  );
}
