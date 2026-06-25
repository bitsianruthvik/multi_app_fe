import React from 'react';
import { Box, Typography } from '@mui/material';
import { Surface } from './Surface';
import { useCountUp } from '../hooks/useCountUp';

export interface Stat {
  label: string;
  value: number;
  /** Optional non-numeric display (e.g. "92%"); overrides the counted value. */
  display?: string;
  icon?: React.ReactNode;
  /** Accent the value — e.g. 'danger' for overdue counts. */
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  onClick?: () => void;
}

const TONE_COLOR: Record<NonNullable<Stat['tone']>, string> = {
  default: 'var(--c-text)',
  primary: 'var(--c-primary-600)',
  success: 'var(--c-success-600)',
  warning: 'var(--c-warning-600)',
  danger: 'var(--c-danger-600)',
  info: 'var(--c-info-600)',
};

function StatCard({ stat }: { stat: Stat }) {
  const n = useCountUp(stat.value);
  const color = TONE_COLOR[stat.tone ?? 'default'];
  return (
    <Surface
      e={1}
      onClick={stat.onClick}
      sx={{
        p: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        cursor: stat.onClick ? 'pointer' : 'default',
        transition: 'box-shadow var(--t-fast) var(--ease), transform var(--t-fast) var(--ease)',
        ...(stat.onClick && { '&:hover': { boxShadow: 'var(--e-2)', transform: 'translateY(-1px)' } }),
      }}
    >
      {stat.icon && (
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: 'var(--r-sm)',
            display: 'grid',
            placeItems: 'center',
            background: 'var(--c-primary-50)',
            color: 'var(--c-primary-600)',
            flexShrink: 0,
            '& svg': { fontSize: 20 },
          }}
        >
          {stat.icon}
        </Box>
      )}
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 0.25 }}>{stat.label}</Typography>
        <Typography
          sx={{
            fontFamily: 'var(--font-mono)',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 24,
            fontWeight: 600,
            lineHeight: 1.1,
            color,
          }}
        >
          {stat.display ?? n}
        </Typography>
      </Box>
    </Surface>
  );
}

/** Responsive grid of stat cards with count-up numbers (DESIGN_SYSTEM.md §4.1/§7.5). */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 1.5,
        mb: 3,
      }}
    >
      {stats.map((s, i) => (
        <StatCard key={i} stat={s} />
      ))}
    </Box>
  );
}
