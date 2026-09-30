import { Box, Typography } from '@mui/material';
import type { OrderTotal } from '../api/types';
import { rupeeText } from '../lib/money';
import { Mono } from './ui';

/** The order's total, with what is missing from it said plainly — a partial total must not pass for a whole one. */
export function OrderTotalBar({ total, lineCount }: { total: OrderTotal; lineCount?: number }) {
  // Nothing priced yet: say so, rather than a ₹0 that reads as a price.
  const nothingPriced = lineCount != null && lineCount > 0 && total.unpricedLines.length >= lineCount;
  const list = (nos: number[]) => nos.join(', ');
  return (
    <Box data-testid="order-total" sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'baseline', gap: 1.5, px: 2, py: 1.25, borderTop: '1px solid var(--c-divider)' }}>
      {!total.complete && (
        <Typography data-testid="order-total-warning" sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>
          Not the whole order:{' '}
          {total.unpricedLines.length > 0 && <>line{total.unpricedLines.length === 1 ? '' : 's'} {list(total.unpricedLines)} ha{total.unpricedLines.length === 1 ? 's' : 've'} no rate</>}
          {total.unpricedLines.length > 0 && total.unmeasuredLines.length > 0 && '; '}
          {total.unmeasuredLines.length > 0 && <>line{total.unmeasuredLines.length === 1 ? '' : 's'} {list(total.unmeasuredLines)} {total.unmeasuredLines.length === 1 ? 'has' : 'have'} no weight or length yet</>}.
        </Typography>
      )}
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Order total, before tax</Typography>
      {nothingPriced
        ? <Mono muted sx={{ fontSize: 14 }}>not priced</Mono>
        : <Mono sx={{ fontWeight: 600, fontSize: 14 }}>{rupeeText(total.amount)}</Mono>}
    </Box>
  );
}
