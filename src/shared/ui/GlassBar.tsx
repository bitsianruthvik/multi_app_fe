import { Box, type BoxProps } from '@mui/material';

/**
 * The ONE glass component (DESIGN_SYSTEM.md §5.3) — the sticky top bar, and the
 * same pattern for a modal / command-palette panel, where real content actually
 * sits and scrolls behind it. Everything else (stat strips, filter bars, detail
 * headers, board columns) is a solid `Surface`.
 *
 * The `.glass` class carries the @supports and prefers-reduced-transparency
 * fallbacks defined in tokens.css — don't inline `backdrop-filter` elsewhere or
 * those fallbacks won't apply and the app stops being usable with transparency
 * turned off.
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
        zIndex: 'var(--z-topnav)',
        ...sx,
      }}
    />
  );
}
