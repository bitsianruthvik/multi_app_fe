import type { ReactNode } from 'react';
import { Box, Stack, Tooltip, Typography } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { useChartPalette } from '@shared/ui';

/**
 * Chart building blocks for the dashboard. Colours come from the platform
 * chart palette, in order (DESIGN_SYSTEM.md §5.1). Every chart sits in a
 * SectionCard whose subtitle states its window.
 */
export interface Series { label: string; data: number[]; format?: (v: number) => string; stack?: string }

export function TrendBars({ labels, series, height = 280, format, stacked = false }: {
  labels: string[]; series: Series[]; height?: number; format: (v: number) => string; stacked?: boolean;
}) {
  const palette = useChartPalette();
  if (!labels.length) return <Empty />;
  return (
    <Box>
      {series.length > 1 && <Legend items={series.map((s, i) => ({ label: s.label, color: palette[i % palette.length] }))} />}
      <BarChart
        height={height}
        xAxis={[{ scaleType: 'band', data: labels, tickLabelStyle: { fontSize: 11 } }]}
        yAxis={[{ valueFormatter: (v: number | null) => format(v ?? 0), width: 76, tickLabelStyle: { fontSize: 11 } }]}
        series={series.map((s, i) => ({
          data: s.data, label: s.label, color: palette[i % palette.length],
          valueFormatter: (v: number | null) => (s.format || format)(v ?? 0), ...(stacked ? { stack: s.stack || 'all' } : {}),
        }))}
        hideLegend
        borderRadius={4}
        margin={{ left: 8, right: 8, top: 12, bottom: 8 }}
        grid={{ horizontal: true }}
      />
    </Box>
  );
}

export function Donut({ data, format, height = 240, center }: {
  data: { label: string; value: number }[]; format: (v: number) => string; height?: number; center?: ReactNode;
}) {
  const palette = useChartPalette();
  const rows = data.filter((d) => d.value > 0);
  if (!rows.length) return <Empty />;
  const total = rows.reduce((t, d) => t + d.value, 0);
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
      <Box sx={{ position: 'relative', width: height, height, flexShrink: 0 }}>
        <PieChart
          height={height} width={height} hideLegend
          margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
          series={[{
            data: rows.map((d, i) => ({ id: d.label, value: d.value, label: d.label, color: palette[i % palette.length] })),
            innerRadius: height * 0.3, outerRadius: height * 0.46, paddingAngle: 1.5, cornerRadius: 4,
            valueFormatter: (v) => format(v.value),
          }]}
        />
        {center && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
            {center}
          </Box>
        )}
      </Box>
      <Stack spacing={0.75} sx={{ minWidth: 0, flex: 1, width: '100%' }}>
        {rows.slice(0, 8).map((d, i) => (
          <Stack key={d.label} direction="row" spacing={1} alignItems="center" sx={{ fontSize: 13 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '3px', background: palette[i % palette.length], flexShrink: 0 }} />
            <Typography noWrap sx={{ fontSize: 13, flex: 1, minWidth: 0 }}>{d.label}</Typography>
            <Typography sx={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--c-text-2)' }}>{format(d.value)}</Typography>
            <Typography sx={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--c-text-3)', width: 44, textAlign: 'right' }}>
              {((d.value / total) * 100).toFixed(0)}%
            </Typography>
          </Stack>
        ))}
        {rows.length > 8 && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>+ {rows.length - 8} more</Typography>}
      </Stack>
    </Stack>
  );
}

/** A ranked list with in-row bars: the clearest way to show a top-N. */
export function RankBars({ rows, format, limit = 10, onClick, colorIndex = 0 }: {
  rows: { key: string; label: string; value: number; sub?: string }[]; format: (v: number) => string; limit?: number;
  onClick?: (key: string) => void; colorIndex?: number;
}) {
  const palette = useChartPalette();
  const list = rows.filter((r) => r.value > 0).slice(0, limit);
  if (!list.length) return <Empty />;
  const max = Math.max(...list.map((r) => r.value));
  return (
    <Stack spacing={1.1}>
      {list.map((r, i) => (
        <Box key={r.key} onClick={onClick ? () => onClick(r.key) : undefined}
          sx={{ cursor: onClick ? 'pointer' : 'default', borderRadius: 1, '&:hover': onClick ? { background: 'var(--c-surface-2)' } : undefined, px: 0.5, py: 0.25 }}>
          <Stack direction="row" spacing={1} alignItems="baseline">
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', fontFamily: 'var(--font-mono)', width: 18 }}>{i + 1}</Typography>
            <Typography noWrap sx={{ fontSize: 13, flex: 1, minWidth: 0 }} title={r.label}>{r.label}</Typography>
            <Typography sx={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{format(r.value)}</Typography>
          </Stack>
          <Box sx={{ ml: '26px', mt: 0.4, height: 6, borderRadius: 3, background: 'var(--c-surface-3)', overflow: 'hidden' }}>
            <Box sx={{ width: `${(r.value / max) * 100}%`, height: '100%', borderRadius: 3, background: palette[colorIndex % palette.length], transition: 'width .6s var(--ease)' }} />
          </Box>
          {r.sub && <Typography sx={{ ml: '26px', fontSize: 11.5, color: 'var(--c-text-3)', mt: 0.25 }}>{r.sub}</Typography>}
        </Box>
      ))}
    </Stack>
  );
}

/** One stacked bar across the card: how a total splits into parts (e.g. ageing buckets). */
export function SplitBar({ parts, format }: { parts: { label: string; value: number; color: string }[]; format: (v: number) => string }) {
  const total = parts.reduce((t, p) => t + Math.max(0, p.value), 0);
  if (!total) return <Empty />;
  return (
    <Box>
      <Box sx={{ display: 'flex', height: 18, borderRadius: 2, overflow: 'hidden', background: 'var(--c-surface-3)' }}>
        {parts.filter((p) => p.value > 0).map((p) => (
          <Tooltip key={p.label} title={`${p.label}: ${format(p.value)}`}>
            <Box sx={{ width: `${(p.value / total) * 100}%`, background: p.color, transition: 'width .6s var(--ease)' }} />
          </Tooltip>
        ))}
      </Box>
      <Box sx={{ display: 'grid', gap: 1, mt: 1.5, gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: `repeat(${parts.length}, 1fr)` } }}>
        {parts.map((p) => (
          <Box key={p.label}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Box sx={{ width: 8, height: 8, borderRadius: '2px', background: p.color }} />
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{p.label}</Typography>
            </Stack>
            <Typography sx={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{format(p.value)}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** A thin progress meter with its percentage. */
export function Meter({ pct, tone = 'primary' }: { pct: number; tone?: 'primary' | 'success' | 'warning' | 'danger' }) {
  const v = Math.max(0, Math.min(100, pct || 0));
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 110 }}>
      <Box sx={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--c-surface-3)', overflow: 'hidden' }}>
        <Box sx={{ width: `${v}%`, height: '100%', background: `var(--c-${tone}-600)` }} />
      </Box>
      <Typography sx={{ fontSize: 12, fontFamily: 'var(--font-mono)', width: 40, textAlign: 'right' }}>{v.toFixed(0)}%</Typography>
    </Stack>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
      {items.map((i) => (
        <Stack key={i.label} direction="row" spacing={0.75} alignItems="center">
          <Box sx={{ width: 10, height: 10, borderRadius: '3px', background: i.color }} />
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{i.label}</Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function Empty() {
  return <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)', py: 4, textAlign: 'center' }}>Nothing in this period.</Typography>;
}
