import { Box } from '@mui/material';
import { Surface } from '../Surface';

/**
 * Horizontal bar chart — the shape every "X by category" breakdown in this app
 * actually wants (wait time by reason, downtime by cause, load by machine).
 *
 * Horizontal, not vertical, on purpose: the categories here are text labels of
 * unpredictable length ("Lack of consumable", "Minor operational delay"). On a
 * vertical chart those become rotated, truncated, or overlapping axis labels;
 * horizontally they get a full readable column.
 *
 * Bars are scaled to the largest value, not to the total — the question these
 * charts answer is "which is worst", so the biggest bar should fill the track.
 * The value column carries the absolute figure plus its share, so the reader
 * gets rank, magnitude and proportion without a legend.
 *
 * Colour is per-row and optional. Where a row's colour already carries meaning
 * elsewhere (a wait reason, a machine state) pass it so the chart agrees with
 * the rest of the screen; otherwise rows fall back to the brand accent and the
 * bar length alone does the work.
 */

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** CSS colour (token reference). Defaults to the brand accent. */
  color?: string;
  /** Pre-formatted value, e.g. "2h 15m". Falls back to a rounded number. */
  display?: string;
}

export function BarChart({
  data,
  labelWidth = 150,
  valueWidth = 120,
  emptyMessage = 'Nothing to show for this range.',
  showShare = true,
}: {
  data: BarDatum[];
  labelWidth?: number;
  valueWidth?: number;
  emptyMessage?: string;
  /** Append each row's % of the total to the value column. */
  showShare?: boolean;
}) {
  if (data.length === 0) {
    return (
      <Box sx={{ fontSize: 13, color: 'var(--c-text-2)', py: 2 }}>{emptyMessage}</Box>
    );
  }

  // Guard both divisors: a dataset of all-zeros must render flat bars, not NaN.
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }} role="list">
      {data.map((d) => {
        const color = d.color ?? 'var(--c-chart-1)';
        const share = Math.round((d.value / total) * 100);
        return (
          <Box key={d.key} role="listitem" sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box sx={{ width: labelWidth, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
              <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} aria-hidden />
              <Box sx={{ fontSize: 12.5, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.label}
              </Box>
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box
                sx={{
                  // 2% floor so a tiny-but-present value stays visible; a bar
                  // that rounds to nothing reads as "no data", which is wrong.
                  width: `${Math.max((d.value / max) * 100, 2)}%`,
                  height: 16,
                  borderRadius: 'var(--r-sm)',
                  background: color,
                  transition: 'width var(--t-mid) var(--ease)',
                }}
              />
            </Box>
            <Box
              sx={{
                width: valueWidth, flexShrink: 0, textAlign: 'right',
                fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
                fontSize: 12.5, color: 'var(--c-text-2)',
              }}
            >
              {d.display ?? Math.round(d.value).toLocaleString()}
              {showShare && ` · ${share}%`}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * A titled card wrapper for one chart — the §4.9 analytical-dashboard unit.
 * `window` states the time range in the subtitle, because a chart whose range
 * is ambiguous is worse than no chart.
 */
export function ChartCard({
  title,
  window,
  action,
  children,
}: {
  title: string;
  window?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Surface e={1} sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex', alignItems: 'flex-start', gap: 1.5,
          px: 2.5, py: 1.75, borderBottom: '1px solid var(--c-divider)',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box component="h2" sx={{ m: 0, fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>
            {title}
          </Box>
          {window && (
            <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.25 }}>{window}</Box>
          )}
        </Box>
        {action}
      </Box>
      <Box sx={{ px: 2.5, py: 2 }}>{children}</Box>
    </Surface>
  );
}
