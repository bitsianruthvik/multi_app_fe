import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Standard page title block (DESIGN_SYSTEM.md §7.5): title 22/600 + optional
 * subtitle, right-aligned actions. Used at the top of every screen body.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
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
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component="h1"
          sx={{ fontFamily: 'var(--font-ui)', fontSize: 22, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1.3 }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)', mt: 0.5 }}>{subtitle}</Typography>
        )}
      </Box>
      {actions && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>{actions}</Box>}
    </Box>
  );
}
