import type { ReactNode } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { Surface } from './Surface';
import { useCountUp } from './hooks/useCountUp';

export interface Stat {
  label: string;
  value: number;
  /** A non-numeric display ("92%", "4 of 7") shown instead of the counted value. */
  display?: string;
  icon?: ReactNode;
  /**
   * Colours the value — but only while it is above zero, so "Overdue 0" stays
   * calm. A red zero trains people to ignore red.
   */
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  /** A longer explanation, on hover. Use it to say what the number counts. */
  hint?: string;
  onClick?: () => void;
}

const TONE_COLOR: Record<string, string> = {
  primary: 'var(--c-primary-600)',
  success: 'var(--c-success-600)',
  warning: 'var(--c-warning-600)',
  danger: 'var(--c-danger-600)',
  info: 'var(--c-info-600)',
};

function StatCard({ stat }: { stat: Stat }) {
  const n = useCountUp(stat.value);
  const color =
    stat.tone && TONE_COLOR[stat.tone] && stat.value > 0 ? TONE_COLOR[stat.tone] : 'var(--c-text)';
  const card = (
    <Surface
      e={1}
      onClick={stat.onClick}
      sx={{
        p: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        minWidth: 0,
        cursor: stat.onClick ? 'pointer' : 'default',
        transition: 'box-shadow var(--t-fast) var(--ease), transform var(--t-fast) var(--ease)',
        ...(stat.onClick && {
          '&:hover': { boxShadow: 'var(--e-2)', transform: 'translateY(-1px)' },
        }),
      }}
    >
      {stat.icon && (
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: 'var(--r-sm)',
            display: { xs: 'none', sm: 'grid' },
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
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 0.25 }}>
          {stat.label}
        </Typography>
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
  return stat.hint ? (
    <Tooltip title={stat.hint} placement="top-start">
      {card}
    </Tooltip>
  ) : (
    card
  );
}

/**
 * Responsive grid of stat cards with count-up numbers (DESIGN_SYSTEM.md §4.1,
 * §4.2, §7.5).
 *
 * Above a list, derive the figures from the rows already loaded so they always
 * describe the *filtered* set — a strip that disagrees with the table beneath
 * it is worse than no strip. Earn the space: prefer a metric that names a
 * failure mode the reader can fix over a restatement of the row count.
 */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'repeat(2, minmax(0, 1fr))',
          sm: 'repeat(auto-fit, minmax(200px, 1fr))',
        },
        gap: 1.5,
        mb: 3,
      }}
    >
      {/* The key includes the value, not just the index. A stat card owns an
          animated counter, and animation state must never outlive the number it
          describes: keying on the value means a changed figure produces a fresh
          card that initialises from the truth — which is also the intended
          visual, since the number re-counts when it changes. */}
      {stats.map((s, i) => (
        <StatCard key={`${i}:${s.label}:${s.display ?? s.value}`} stat={s} />
      ))}
    </Box>
  );
}
