import { Box, type BoxProps } from '@mui/material';

/**
 * Monospace text for entity codes, ids, quantities, money and dates in tables
 * (DESIGN_SYSTEM.md §5.4).
 *
 * `tabular` turns on tabular figures so numeric columns align; `chip` renders
 * the subtle inset pill used for a code in a list row; `muted` drops it to the
 * hint colour for a code that is context rather than identity.
 */
export function Mono({
  tabular = false,
  chip = false,
  muted = false,
  sx,
  ...props
}: BoxProps & { tabular?: boolean; chip?: boolean; muted?: boolean }) {
  return (
    <Box
      component="span"
      {...props}
      sx={{
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        fontVariantNumeric: tabular ? 'tabular-nums' : undefined,
        color: chip ? 'var(--c-text-2)' : muted ? 'var(--c-text-3)' : 'inherit',
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

/** The 11px uppercase label used above a fact or a group of fields (§5.4). */
export function CapsLabel({ sx, ...props }: BoxProps) {
  return (
    <Box
      component="span"
      {...props}
      sx={{
        display: 'block',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        color: 'var(--c-text-3)',
        ...sx,
      }}
    />
  );
}
