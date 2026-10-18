import type { ReactNode } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import { Surface } from './Surface';
import { useChartPalette } from './hooks/useChartPalette';

export interface KpiDelta {
  /** Change in percent against the comparison period; null when there is nothing to compare with. */
  pct: number | null;
  /** What it is compared with, e.g. "vs same days last month". */
  label: string;
  /** Whether a rise is good news (sales) or bad news (overdue). */
  goodWhen?: 'up' | 'down';
}

const TONE = {
  default: 'var(--c-text)',
  primary: 'var(--c-primary-600)',
  success: 'var(--c-success-600)',
  warning: 'var(--c-warning-600)',
  danger: 'var(--c-danger-600)',
  info: 'var(--c-info-600)',
} as const;

/**
 * A headline figure for an analytical dashboard (DESIGN_SYSTEM.md §4.9): the
 * value, how it moved against a stated comparison, and a sparkline of its
 * recent shape. The comparison is always named — a bare arrow is a claim with
 * no evidence. Clickable when it leads to the screen that explains it.
 */
export function KpiTile({
  label, display, delta, spark, tone = 'default', icon, hint, onClick, footer,
}: {
  label: string;
  display: ReactNode;
  delta?: KpiDelta;
  spark?: number[];
  tone?: keyof typeof TONE;
  icon?: ReactNode;
  hint?: string;
  onClick?: () => void;
  footer?: ReactNode;
}) {
  const palette = useChartPalette();
  const up = (delta?.pct ?? 0) >= 0;
  const good = delta?.goodWhen === 'down' ? !up : up;
  const tile = (
    <Surface
      e={1}
      onClick={onClick}
      sx={{
        p: 2, display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0, position: 'relative', overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow var(--t-fast) var(--ease), transform var(--t-fast) var(--ease)',
        ...(onClick && { '&:hover': { boxShadow: 'var(--e-2)', transform: 'translateY(-1px)' } }),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {icon && (
          <Box sx={{
            width: 28, height: 28, borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center', flexShrink: 0,
            background: 'var(--c-primary-50)', color: 'var(--c-primary-600)', '& svg': { fontSize: 17 },
          }}>{icon}</Box>
        )}
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', fontWeight: 500 }} noWrap>{label}</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1 }}>
        <Typography sx={{
          fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 26, fontWeight: 600, lineHeight: 1.1,
          color: TONE[tone], whiteSpace: 'nowrap',
        }}>{display}</Typography>
        {spark && spark.length > 1 && (
          <Box sx={{ width: 96, height: 34, flexShrink: 0 }} aria-hidden>
            <SparkLineChart data={spark} height={34} width={96} area curve="natural" color={palette[0]} />
          </Box>
        )}
      </Box>
      {delta && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 12, color: 'var(--c-text-3)' }}>
          {delta.pct == null ? (
            <span>— {delta.label}</span>
          ) : (
            <>
              <Box component="span" sx={{
                display: 'inline-flex', alignItems: 'center', fontWeight: 600, px: 0.6, py: 0.1, borderRadius: '4px',
                color: good ? 'var(--c-success-800)' : 'var(--c-danger-800)', background: good ? 'var(--c-success-50)' : 'var(--c-danger-50)',
                '& svg': { fontSize: 13 },
              }}>
                {up ? <ArrowUpwardRounded /> : <ArrowDownwardRounded />}{Math.abs(delta.pct).toFixed(1)}%
              </Box>
              <span>{delta.label}</span>
            </>
          )}
        </Box>
      )}
      {footer && <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{footer}</Box>}
    </Surface>
  );
  return hint ? <Tooltip title={hint} placement="top-start">{tile}</Tooltip> : tile;
}

/** A responsive row of KPI tiles. */
export function KpiGrid({ children, min = 220 }: { children: ReactNode; min?: number }) {
  return (
    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(1, minmax(0, 1fr))', sm: `repeat(auto-fit, minmax(${min}px, 1fr))` } }}>
      {children}
    </Box>
  );
}
