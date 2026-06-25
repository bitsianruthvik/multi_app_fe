import { Box, type BoxProps } from '@mui/material';

/**
 * Monospace text for entity codes, IDs, quantities, money, dates-in-tables
 * (DESIGN_SYSTEM.md §5.4). `tabular` turns on tabular-nums so numeric columns
 * align. `chip` renders the subtle inset pill used for codes in list rows.
 */
export function Mono({
  tabular = false,
  chip = false,
  sx,
  ...props
}: BoxProps & { tabular?: boolean; chip?: boolean }) {
  return (
    <Box
      component="span"
      {...props}
      sx={{
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        fontVariantNumeric: tabular ? 'tabular-nums' : undefined,
        color: chip ? 'var(--c-text-2)' : 'inherit',
        ...(chip && {
          background: 'var(--c-surface-2)',
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-sm)',
          padding: '2px 7px',
          whiteSpace: 'nowrap',
        }),
        ...sx,
      }}
    />
  );
}
