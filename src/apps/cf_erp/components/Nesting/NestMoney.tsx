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
 * say, and a customer's plate is left out: it costs us nothing.
 */
export function NestMoney({ orderId, lineId }: { orderId: number; lineId: number }) {
  const costs = useLoad(() => cfApi.get<OrderCosts>(`/orders/${orderId}/costs`).catch(() => null), [orderId, lineId]);
  const n = costs.data?.lines.find((l) => l.line.id === lineId)?.nest;
  if (!n || n.lots === 0) return null;
  const allTheirs = n.customerLots === n.lots;
  if (allTheirs) return <Box data-testid="nest-money" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>The steel is the customer&rsquo;s, so it costs us nothing.</Box>;
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
    </Box>
  );
}
