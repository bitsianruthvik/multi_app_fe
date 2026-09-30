import { Box } from '@mui/material';
import type { BuyRow } from '../api/types';
import { plannedChipText } from '../lib/buyList';

/** Marks a buy-list row that is planned material of a confirmed, frozen line — not yet released to the floor. */
export function PlannedChip({ row }: { row: Pick<BuyRow, 'source'> }) {
  return (
    <Box data-testid="planned-chip" component="span" title="This line is confirmed and its design is frozen, but it is not released to the floor yet. Buying now means the steel is here when it is."
      sx={{ display: 'inline-block', mt: 0.25, fontSize: 11, px: 0.75, borderRadius: 'var(--r-sm)', background: 'var(--c-info-50)', color: 'var(--c-info-800)', border: '1px solid var(--c-info-200)' }}>
      {plannedChipText(row)}
    </Box>
  );
}
