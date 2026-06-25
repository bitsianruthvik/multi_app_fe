import { Box, type BoxProps } from '@mui/material';

/**
 * The solid surface primitive used everywhere in fab_erp instead of glass
 * (DESIGN_SYSTEM.md §5.2/§7.1). Glass is reserved for exactly two places:
 * the top bar and modal/command-palette scrims — see GlassBar.tsx.
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
