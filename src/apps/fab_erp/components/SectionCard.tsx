import { Box } from '@mui/material';
import type { ReactNode } from 'react';
import { Surface } from './Surface';

/**
 * A titled solid panel — the repeated shape on every detail tab and settings
 * screen (DESIGN_SYSTEM.md §7 addition).
 *
 * Exists because "section heading + optional action + bordered body" was being
 * re-declared with slightly different padding and heading sizes on ~20 screens.
 * `flush` drops the body padding for panels whose child is a DataTable or list
 * that should bleed to the card edge.
 */
export function SectionCard({
  title,
  subtitle,
  action,
  children,
  flush = false,
  e = 1,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  e?: 0 | 1 | 2 | 3;
}) {
  return (
    <Surface e={e} sx={{ overflow: 'hidden' }}>
      {(title || action) && (
        <Box
          sx={{
            display: 'flex', alignItems: 'flex-start', gap: 1.5,
            px: 2.5, py: 1.75,
            borderBottom: '1px solid var(--c-divider)',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {title && (
              <Box component="h2" sx={{ m: 0, fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>
                {title}
              </Box>
            )}
            {subtitle && (
              <Box sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.25 }}>{subtitle}</Box>
            )}
          </Box>
          {action && <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>{action}</Box>}
        </Box>
      )}
      <Box sx={flush ? undefined : { px: 2.5, py: 2 }}>{children}</Box>
    </Surface>
  );
}

/**
 * Bottom-sticky action bar for detail and settings screens with pending
 * changes. Stays in the viewport so a long form never hides its own save
 * button — the classic "scroll to the bottom to find out you can save" failure.
 */
export function StickyActionBar({
  children,
  message,
  visible = true,
}: {
  children: ReactNode;
  /** Left-side status line, e.g. "3 unsaved changes". */
  message?: ReactNode;
  visible?: boolean;
}) {
  if (!visible) return null;
  return (
    <Box
      sx={{
        position: 'sticky',
        bottom: 0,
        zIndex: 'var(--z-sticky)',
        mt: 3,
        mx: -3,
        px: 3,
        py: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        background: 'var(--c-surface)',
        borderTop: '1px solid var(--c-border)',
        boxShadow: 'var(--e-2)',
      }}
    >
      {message && <Box sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{message}</Box>}
      <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>{children}</Box>
    </Box>
  );
}
