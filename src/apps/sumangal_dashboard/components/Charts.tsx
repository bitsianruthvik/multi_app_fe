import type { ReactNode } from 'react';
import { Box, Stack, Tooltip, Typography } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { DataCards, DataTable, ToneBadge, useChartPalette } from '@shared/ui';
import { useMediaQuery, useTheme } from '@mui/material';
import type { ComponentProps } from 'react';
import { onTimeTone, pct } from '../format';

/** A report's table: the full DataTable on tablets and computers, the same columns as cards on phones. */
export function ReportTable<T>(props: ComponentProps<typeof DataTable<T>>) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  if (phone) {
    const { rows, columns, getRowId, onRowClick, empty, defaultSortKey, defaultSortDir } = props;
    return <DataCards rows={rows} columns={columns} getRowId={getRowId} onRowClick={onRowClick} empty={empty} defaultSortKey={defaultSortKey} defaultSortDir={defaultSortDir} />;
  }
  return <DataTable {...props} />;
}

const Nothing = () => <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)', py: 3, textAlign: 'center' }}>Nothing for these filters.</Typography>;

export function OnTimeBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return <span>—</span>;
  return <ToneBadge label={pct(value)} tone={onTimeTone(value)} />;
}

/** A figure with a bar behind it, for reading a column at a glance. */
export function ValueBar({ value, max, label, color = 'var(--c-primary-500)' }: { value: number; max: number; label: ReactNode; color?: string }) {
  return (
    <Box sx={{ minWidth: 90 }}>
      <Typography sx={{ fontSize: 'inherit', fontVariantNumeric: 'tabular-nums' }}>{label}</Typography>
      <Box sx={{ height: 4, borderRadius: 2, background: 'var(--c-surface-3)', mt: 0.4, overflow: 'hidden' }}>
        <Box sx={{ width: `${max ? Math.max(1, (value / max) * 100) : 0}%`, height: '100%', background: color }} />
      </Box>
    </Box>
  );
}

export function Bars({ labels, data, format, height = 240, color, max }: { labels: string[]; data: (number | null)[]; format: (v: number) => string; height?: number; color?: string; max?: number }) {
  const palette = useChartPalette();
  if (!labels.length) return <Nothing />;
  const every = Math.max(1, Math.ceil(labels.length / 12));
  return (
    <BarChart height={height} hideLegend borderRadius={3} grid={{ horizontal: true }} margin={{ left: 4, right: 8, top: 10, bottom: 4 }}
      xAxis={[{ scaleType: 'band', data: labels, tickLabelStyle: { fontSize: 11 }, tickLabelInterval: (_v: unknown, i: number) => i % every === 0 }]}
      yAxis={[{ valueFormatter: (v: number | null) => format(v ?? 0), width: 62, tickLabelStyle: { fontSize: 11 }, ...(max != null ? { max } : {}) }]}
      series={[{ data, color: color || palette[0], valueFormatter: (v: number | null) => (v == null ? '—' : format(v)) }]} />
  );
}

export function Lines({ labels, series, format, height = 280 }: { labels: string[]; series: { label: string; data: (number | null)[]; color?: string }[]; format: (v: number) => string; height?: number }) {
  const palette = useChartPalette();
  if (!labels.length) return <Nothing />;
  const every = Math.max(1, Math.ceil(labels.length / 12));
  return (
    <Box>
      {series.length > 1 && (
        <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" sx={{ mb: 0.5 }}>
          {series.map((s, i) => (
            <Stack key={s.label} direction="row" spacing={0.75} alignItems="center">
              <Box sx={{ width: 14, height: 3, borderRadius: 2, background: s.color || palette[i % palette.length] }} />
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{s.label}</Typography>
            </Stack>
          ))}
        </Stack>
      )}
      <LineChart height={height} hideLegend grid={{ horizontal: true }} margin={{ left: 4, right: 12, top: 10, bottom: 4 }}
        xAxis={[{ scaleType: 'point', data: labels, tickLabelStyle: { fontSize: 11 }, tickLabelInterval: (_v: unknown, i: number) => i % every === 0 }]}
        yAxis={[{ valueFormatter: (v: number | null) => format(v ?? 0), width: 56, tickLabelStyle: { fontSize: 11 }, min: 0 }]}
        series={series.map((s, i) => ({ label: s.label, data: s.data, color: s.color || palette[i % palette.length], showMark: labels.length <= 14, curve: 'linear' as const, valueFormatter: (v: number | null) => (v == null ? '—' : format(v)) }))} />
    </Box>
  );
}

/** Rows of label + bar + figure: quicker to read than an axis, and each row can be clicked. */
export function RowBars({ rows, format, onClick, selected, color = 'var(--c-primary-500)' }: {
  rows: { key: string; label: ReactNode; value: number | null; sub?: ReactNode; hot?: boolean }[]; format: (v: number) => string; onClick?: (key: string) => void; selected?: string | null; color?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  if (!rows.length) return <Nothing />;
  return (
    <Stack spacing={0.5}>
      {rows.map((r) => (
        <Box key={r.key} onClick={onClick ? () => onClick(r.key) : undefined} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
          onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(r.key); } } : undefined}
          sx={{ px: 1, py: 0.75, borderRadius: 1.5, cursor: onClick ? 'pointer' : 'default', background: selected === r.key ? 'var(--c-primary-50)' : undefined, outline: selected === r.key ? '1px solid var(--c-primary-200)' : undefined, '&:hover': onClick ? { background: selected === r.key ? 'var(--c-primary-50)' : 'var(--c-surface-2)' } : undefined }}>
          <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="baseline">
            <Typography sx={{ fontSize: 13.5, fontWeight: r.hot ? 700 : 500, minWidth: 0 }} noWrap>{r.label}</Typography>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{r.value == null ? '—' : format(r.value)}</Typography>
          </Stack>
          <Box sx={{ height: 7, borderRadius: 4, background: 'var(--c-surface-3)', mt: 0.5, overflow: 'hidden' }}>
            <Box sx={{ width: `${((r.value ?? 0) / max) * 100}%`, height: '100%', borderRadius: 4, background: r.hot ? 'var(--c-danger-600)' : color, transition: 'width .4s var(--ease)' }} />
          </Box>
          {r.sub && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.4 }}>{r.sub}</Typography>}
        </Box>
      ))}
    </Stack>
  );
}

/** The days an order line spends at each stage, as one strip that adds up. */
export function StageStrip({ parts, colors }: { parts: { key: string; label: string; days: number }[]; colors?: string[] }) {
  const palette = useChartPalette(); const list = colors || palette;
  const total = parts.reduce((t, p) => t + p.days, 0);
  return (
    <Box sx={{ display: 'flex', height: 22, borderRadius: 1.5, overflow: 'hidden', background: 'var(--c-surface-3)' }}>
      {parts.filter((p) => p.days > 0).map((p) => {
        const i = parts.findIndex((x) => x.key === p.key);
        return (
          <Tooltip key={p.key} title={`${p.label}: ${Math.round(p.days)} days`} arrow>
            <Box sx={{ width: `${(p.days / total) * 100}%`, background: list[i % list.length], display: 'grid', placeItems: 'center', color: '#fff', fontSize: 11, fontWeight: 700, borderRight: '1px solid var(--c-surface)', overflow: 'hidden' }}>
              {p.days / total > 0.08 ? Math.round(p.days) : ''}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

export function StageLegend({ parts, colors }: { parts: { key: string; label: string }[]; colors?: string[] }) {
  const palette = useChartPalette(); const list = colors || palette;
  return (
    <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
      {parts.map((p, i) => (
        <Stack key={p.key} direction="row" spacing={0.6} alignItems="center">
          <Box sx={{ width: 10, height: 10, borderRadius: '3px', background: list[i % list.length] }} />
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{p.label}</Typography>
        </Stack>
      ))}
    </Stack>
  );
}

export function Big({ value, label, tone, help, size = 30 }: { value: ReactNode; label: ReactNode; tone?: 'success' | 'warning' | 'danger'; help?: ReactNode; size?: number }) {
  const color = tone ? `var(--c-${tone}-600)` : 'var(--c-text)';
  return (
    <Box>
      <Typography sx={{ fontSize: size, fontWeight: 800, color, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 600, mt: 0.5 }}>{label}</Typography>
      {help && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.25, lineHeight: 1.4 }}>{help}</Typography>}
    </Box>
  );
}

export function Grid({ cols = '1fr 1fr', children }: { cols?: string; children: ReactNode }) {
  return <Box sx={{ display: 'grid', gap: 2.25, gridTemplateColumns: { xs: 'minmax(0,1fr)', md: cols }, '& > *': { minWidth: 0 } }}>{children}</Box>;
}
