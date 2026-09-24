import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import InboxRounded from '@mui/icons-material/InboxRounded';
import { Surface } from './Surface';

/**
 * Centred empty state (DESIGN_SYSTEM.md §7.5): icon, one line, an explanation
 * and the primary action.
 *
 * An empty list is a moment of doubt — "is it broken, or is there genuinely
 * nothing?" — so say which, and offer the way out.
 */
export function EmptyState({
  icon,
  title,
  hint,
  body,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  /** One sentence of explanation. `body` is the alias. */
  hint?: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}) {
  const text = hint ?? body;
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
      {text && (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', maxWidth: 420 }}>{text}</Typography>
      )}
      {action && <Box sx={{ mt: 1.5 }}>{action}</Box>}
    </Surface>
  );
}
