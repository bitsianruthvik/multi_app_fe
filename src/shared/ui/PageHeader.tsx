import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';

/**
 * The standard page title block (DESIGN_SYSTEM.md §7.5): title 22/600, optional
 * subtitle, right-aligned actions. Every screen body starts with one, so page
 * titles never drift in size, weight or spacing.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 2,
        flexWrap: 'wrap',
        mb: 2.5,
      }}
    >
      <Box sx={{ minWidth: 0, flex: '1 1 320px' }}>
        <Typography
          component="h1"
          sx={{
            fontFamily: 'var(--font-ui)',
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--c-text)',
            lineHeight: 1.3,
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)', mt: 0.5, maxWidth: 820 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>
      )}
    </Box>
  );
}
