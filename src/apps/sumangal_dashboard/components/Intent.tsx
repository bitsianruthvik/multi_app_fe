import type { ReactNode } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { useGo } from '../useGo';

/** Small building blocks shared by the screens of the by-intent layout. */

/** A plain "open the screen behind this" button. */
export function Open({ to, label = 'Open' }: { to: string; label?: string }) {
  const go = useGo();
  return <Button size="small" endIcon={<ArrowForwardRounded fontSize="small" />} onClick={() => go(to)} sx={{ textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</Button>;
}

/** A line of months as a tiny chart; the last point is marked. */
export function Spark({ values, width = 120, height = 28, color = 'var(--c-primary-500)', mark = 'var(--c-text)' }: { values: (number | null)[]; width?: number; height?: number; color?: string; mark?: string }) {
  const v = values.map((x) => (x == null ? null : Number(x))); const nums = v.filter((x): x is number => x != null);
  if (nums.length < 2) return <Box sx={{ width, height }} />;
  const lo = Math.min(...nums), hi = Math.max(...nums); const span = hi - lo || 1; const x = (i: number) => 2 + (i / (v.length - 1)) * (width - 4); const y = (n: number) => height - 3 - ((n - lo) / span) * (height - 6);
  const pts = v.map((n, i) => (n == null ? null : `${x(i).toFixed(1)},${y(n).toFixed(1)}`)).filter(Boolean).join(' ');
  const lastI = v.reduce<number>((m, n, i) => (n != null ? i : m), 0);
  return (
    <svg width={width} height={height} role="img" aria-label="Trend by month">
      <polyline points={pts} style={{ fill: 'none', stroke: color, strokeWidth: 1.5 }} />
      <circle cx={x(lastI)} cy={y(v[lastI] as number)} r={3} style={{ fill: mark }} />
    </svg>
  );
}

/** One horizontal bar split into parts, sized against `max`. */
export function StackBar({ parts, max, height = 16 }: { parts: { key: string; value: number; color: string }[]; max: number; height?: number }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <Box sx={{ display: 'flex', height, width: `${max ? Math.max(1, (total / max) * 100) : 0}%`, borderRadius: 1, overflow: 'hidden', background: 'var(--c-surface-3)' }} title={parts.map((p) => `${p.key}: ${p.value}`).join(' · ')}>
      {parts.filter((p) => p.value > 0).map((p) => <Box key={p.key} sx={{ width: `${(p.value / total) * 100}%`, background: p.color, borderRight: '1px solid var(--c-surface)' }} />)}
    </Box>
  );
}

export function Swatches({ items }: { items: { label: string; color: string }[] }) {
  return (
    <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
      {items.map((i) => <Stack key={i.label} direction="row" spacing={0.75} alignItems="center"><Box sx={{ width: 12, height: 12, borderRadius: 0.5, background: i.color }} /><Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{i.label}</Typography></Stack>)}
    </Stack>
  );
}

/** A figure with what it is and a second line under it. */
export function Fact({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'good' }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', fontWeight: 600 }}>{label}</Typography>
      <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', color: tone === 'bad' ? 'var(--c-danger-600)' : tone === 'good' ? 'var(--c-success-600)' : 'var(--c-text)' }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', lineHeight: 1.4 }}>{sub}</Typography>}
    </Box>
  );
}

export const FactRow = ({ children, cols = 4 }: { children: ReactNode; cols?: number }) => <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: `repeat(${cols}, minmax(0,1fr))` } }}>{children}</Box>;
