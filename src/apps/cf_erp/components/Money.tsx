import { Box } from '@mui/material';
import { NOT_COSTED, rupeeText } from '../lib/money';
import { Mono } from './ui';

/**
 * An amount in rupees. A missing amount reads "not costed" in muted text — never
 * ₹0 — so a list cannot look cheaper than it is. `missing` changes the words
 * for an amount that is not a cost ("no rate").
 */
export function Money({ value, digits = 0, missing = NOT_COSTED, strong = false }: { value: number | null | undefined; digits?: 0 | 2; missing?: string; strong?: boolean }) {
  if (value == null || !Number.isFinite(Number(value))) {
    return <Box component="span" data-testid="not-costed" sx={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>{missing}</Box>;
  }
  return <Mono sx={strong ? { fontWeight: 600, fontSize: 13 } : undefined}><span data-testid="money">{rupeeText(value, digits)}</span></Mono>;
}

/** The owner of a stock row: a muted "Ours", or the customer's name in a chip so theirs never passes for ours. */
export function OwnerTag({ name }: { name: string | null }) {
  if (!name) return <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>Ours</Box>;
  return <Mono chip>{name}</Mono>;
}

/** A row's value: its amount, or "not costed"; a part-costed row says so. */
export function StockValue({ value, uncostedQty }: { value: number | null | undefined; uncostedQty?: number }) {
  if (value == null || (value === 0 && (uncostedQty ?? 0) > 0)) return <Money value={null} />;
  return <><Money value={value} />{(uncostedQty ?? 0) > 0 && <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 11.5 }}> + part not costed</Box>}</>;
}
