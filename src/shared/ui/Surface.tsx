import { Box, type BoxProps } from '@mui/material';

/**
 * The solid surface primitive (DESIGN_SYSTEM.md §5.2/§7.1) — very nearly
 * everything in the kit is built on it.
 *
 * Depth comes from a two-layer soft shadow plus a hairline border, not from
 * glass. Glass survives in exactly two places (the sticky top bar, and modal /
 * command-palette panels and scrims) — see GlassBar.
 */
export function Surface({
  e = 1,
  bordered = true,
  sx,
  ...props
}: BoxProps & { e?: 0 | 1 | 2 | 3; bordered?: boolean }) {
  return (
    <Box
      {...props}
      sx={{
        background: 'var(--c-surface)',
        border: bordered ? '1px solid var(--c-border)' : 'none',
        borderRadius: 'var(--r-md)',
        boxShadow: e === 0 ? 'none' : `var(--e-${e})`,
        ...sx,
      }}
    />
  );
}
