import { Box, Typography } from '@mui/material';
import { plannedUnitsSentence, type PlannedUnits } from '../../api/requisitions';

/**
 * The planned cards a PO change (a new date, a smaller quantity, a cancel) made late or waiting: one sentence, then each
 * card with the server's own words (old date, new date, the week to move it to). Shown after a PO line edit and after a cancel.
 */
export function PlannedUnitsNote({ planned }: { planned: PlannedUnits | null | undefined }) {
  if (!planned || planned.units.length === 0) return null;
  return (
    <Box data-testid="po-late-note" role="status" sx={{ mb: 1, color: 'var(--c-warning-800)', fontSize: 13 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{plannedUnitsSentence(planned)}</Typography>
      {planned.units.map((u) => <Box key={u.unitKey} data-testid="po-late-unit" sx={{ fontSize: 12.5 }}>{u.code}: {u.message}</Box>)}
    </Box>
  );
}
