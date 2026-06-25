import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { Surface } from './Surface';
import { useCountUp } from '../hooks/useCountUp';

/**
 * Cockpit work-queue card (DESIGN_SYSTEM.md §4.1/§7.5): accent icon tile + title +
 * count line + one primary action. A to-do surface, not a chart.
 */
export function WorkQueueCard({
  icon,
  title,
  count,
  unit,
  description,
  actionLabel,
  onAction,
  tone = 'primary',
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  unit?: string;
  description?: string;
  actionLabel: string;
  onAction: () => void;
  tone?: 'primary' | 'warning' | 'danger' | 'info' | 'success';
}) {
  const n = useCountUp(count);
  const toneFill = `var(--c-${tone === 'primary' ? 'primary-50' : tone + '-50'})`;
  const toneFg = `var(--c-${tone === 'primary' ? 'primary-600' : tone + '-600'})`;

  return (
    <Surface
      e={1}
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        transition: 'box-shadow var(--t-fast) var(--ease), transform var(--t-fast) var(--ease)',
        '&:hover': { boxShadow: 'var(--e-2)', transform: 'translateY(-1px)' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 'var(--r-sm)',
            display: 'grid',
            placeItems: 'center',
            background: toneFill,
            color: toneFg,
            flexShrink: 0,
            '& svg': { fontSize: 22 },
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 500, color: 'var(--c-text)' }}>{title}</Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
            <Box component="span" sx={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: toneFg }}>
              {n}
            </Box>{' '}
            {unit ?? 'items'}
          </Typography>
        </Box>
      </Box>

      {description && (
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5 }}>{description}</Typography>
      )}

      <Button
        onClick={onAction}
        endIcon={<ArrowForwardRounded />}
        size="small"
        sx={{
          alignSelf: 'flex-start',
          mt: 'auto',
          px: 1.25,
          color: 'var(--c-primary-700)',
          fontWeight: 500,
          '&:hover': { background: 'var(--c-primary-50)' },
        }}
      >
        {actionLabel}
      </Button>
    </Surface>
  );
}
