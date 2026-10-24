import type { ReactNode } from 'react';
import { Box } from '@mui/material';

/** The strip under the header while editing (spec §34.5: edit mode is visibly different). */
export function EditBanner({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <Box
      role="status"
      data-editbanner=""
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 1,
        px: 1.5,
        py: 0.75,
        borderRadius: 'var(--r-sm)',
        border: '1px dashed var(--c-primary-500)',
        background: 'var(--c-primary-50)',
        color: 'var(--c-primary-800, var(--c-text))',
        fontSize: 13,
      }}
    >
      <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>{children}</Box>
      {action}
    </Box>
  );
}

