import React from 'react';
import { Box, Typography } from '@mui/material';
import InboxRounded from '@mui/icons-material/InboxRounded';
import { Surface } from './Surface';

/** Centered empty state (DESIGN_SYSTEM.md §7.5): icon + one line + primary action. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Surface
      e={0}
      sx={{
        py: 7,
        px: 3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 1,
        background: 'var(--c-surface-2)',
        borderStyle: 'dashed',
      }}
    >
      <Box sx={{ color: 'var(--c-text-3)', '& svg': { fontSize: 44 }, mb: 0.5 }}>
        {icon ?? <InboxRounded />}
      </Box>
      <Typography sx={{ fontSize: 15, fontWeight: 500, color: 'var(--c-text)' }}>{title}</Typography>
      {hint && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', maxWidth: 360 }}>{hint}</Typography>}
      {action && <Box sx={{ mt: 1.5 }}>{action}</Box>}
    </Surface>
  );
}
