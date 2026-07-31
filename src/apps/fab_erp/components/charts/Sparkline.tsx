import { Box } from '@mui/material';
import { useId } from 'react';

/**
 * A tiny inline trend line for stat tiles (Factory Pulse, §6.1 of the
 * elevation plan).
 *
 * Hand-rolled SVG on purpose: a cockpit renders six of these at once, and
 * pulling a charting library in for a 60×20 polyline would cost more bundle
 * than the whole page. It also means it inherits the token palette via
 * `currentColor` rather than needing colours resolved in JS.
 *
 * `values` is oldest→newest. Fewer than 2 points renders nothing (a one-point
 * "trend" is a lie).
 */
export function Sparkline({
  values,
  width = 64,
  height = 20,
  tone = 'primary',
  ariaLabel,
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'muted';
  /** Describe the trend for screen readers; the shape alone conveys nothing. */
  ariaLabel?: string;
}) {
  const gradientId = useId();
  if (values.length < 2) return null;

  const color =
    tone === 'success' ? 'var(--c-success-600)'
    : tone === 'warning' ? 'var(--c-warning-600)'
    : tone === 'danger' ? 'var(--c-danger-600)'
    : tone === 'muted' ? 'var(--c-text-3)'
    : 'var(--c-primary-500)';

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero; draw it down the middle instead.
  const span = max - min || 1;
  const pad = 2;
  const stepX = (width - pad * 2) / (values.length - 1);

  const points = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${pad},${height - pad} ${line} ${(width - pad).toFixed(1)},${height - pad}`;
  const [lastX, lastY] = points[points.length - 1];

  return (
    <Box
      component="svg"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={ariaLabel ?? `Trend, ${values.length} points`}
      sx={{ color, display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2} fill="currentColor" />
    </Box>
  );
}
