import { Box } from '@mui/material';
import type { OrderValue } from '../lib/orderValue';
import { orderValueParts } from '../lib/orderValue';
import { Mono } from './ui';

/** The order's ONE value with what it is: "₹38,72,227 accepted · estimate ₹6,91,46,903" (lib/orderValue). */
export function OrderValueText({ value, compact = false }: { value: OrderValue | null | undefined; compact?: boolean }) {
  const p = orderValueParts(value);
  if (p.muted) return <Mono muted>{p.main}</Mono>;
  return (
    <Box component="span" data-testid="order-value" data-basis={value?.basis} sx={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 0.75 }}>
      <Mono>{p.main}</Mono>
      {p.tag && <Box component="span" sx={{ fontSize: 12, color: value?.basis === 'estimate' ? 'var(--c-warning-800)' : 'var(--c-text-3)' }}>{p.tag}</Box>}
      {!compact && p.detail && <Box component="span" data-testid="order-value-detail" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>· {p.detail}</Box>}
    </Box>
  );
}
