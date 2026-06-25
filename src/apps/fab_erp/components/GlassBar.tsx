import { Box, type BoxProps } from '@mui/material';

/**
 * The ONE glass component in fab_erp — used for the sticky top bar and for
 * modal/command-palette scrims, where content actually scrolls/sits behind
 * it (DESIGN_SYSTEM.md §5.3). Everything else (stat strips, filter bars,
 * detail headers, board columns) uses Surface instead.
 *
 * The `.glass` class carries the @supports / prefers-reduced-transparency
 * fallbacks defined in src/theme/tokens.css — don't inline backdrop-filter
 * elsewhere or those fallbacks won't apply.
 */
export function GlassBar({ sx, className, ...props }: BoxProps) {
  return (
    <Box
      {...props}
      className={['glass', className].filter(Boolean).join(' ')}
      sx={{
        borderBottom: '1px solid var(--glass-border)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        ...sx,
      }}
    />
  );
}
