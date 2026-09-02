/**
 * SCurve.tsx — cumulative planned work against cumulative earned work.
 *
 * The one question a monthly review always asks: are we behind, and by how much.
 * The vertical gap between the two lines is the answer, in the direction a reader
 * expects — earned below planned means late.
 *
 * WHY EARNED VALUE AND NOT HOURS SPENT
 * ------------------------------------
 * The obvious "actual" line — hours the shop put in — is not comparable to the
 * plan. A task that took twice as long as planned would push it ABOVE the planned
 * line while the job fell further behind, so the chart would read "ahead" at the
 * exact moment the shop was losing. The actual line therefore credits each
 * COMPLETED task with its PLANNED minutes: both series are in the same currency
 * and measure the same thing, how much of the plan is finished.
 *
 * THE COLOUR, WHICH WAS COMPUTED AND NOT CHOSEN
 * ---------------------------------------------
 * Two peer hues were tried first and the pairs that survived contrast and
 * colour-blindness checks in LIGHT mode failed in dark — a reminder that a dark
 * palette is selected, never flipped. The pair that passed both was violet +
 * amber, and amber is this app's reserved `warning` token, which a series must
 * not borrow.
 *
 * So the plan is drawn as what it actually is: a TARGET, not a peer category. One
 * coloured series (violet — validated in both modes against the real surfaces)
 * and a neutral dashed reference line at 6.35:1 light / 7.78:1 dark. That also
 * gives this page one idiom to learn instead of two — **dashed means the plan**,
 * here and on the ghost bars over the board.
 */

import { useMemo, useState } from 'react';
import { Box, Stack, Typography, useTheme } from '@mui/material';

import type { ActualsCurve } from '../../api/actuals';

const PAD = { top: 14, right: 58, bottom: 22, left: 40 };
const H = 168;

/** "18h 20m" from minutes — the shop floor talks in hours. */
function fmtMin(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`;
}

function shortDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function SCurve({ curve, nowYMD }: { curve: ActualsCurve; nowYMD: string | null }) {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(720);

  /** Validated against the real surfaces in both modes — see the header. */
  const ink = {
    earned: dark ? '#8B5CF6' : '#6D28D9',
    earnedFill: dark ? 'rgba(139,92,246,.18)' : 'rgba(109,40,217,.12)',
    planned: dark ? '#A7ABC6' : '#5A5E78',
    grid: dark ? 'rgba(255,255,255,.07)' : 'rgba(26,28,46,.07)',
    axis: dark ? '#6E7290' : '#8A8EA8',
    now: dark ? '#22D3EE' : '#0891B2',
  };

  const n = curve.days.length;
  const total = curve.totalPlannedMin;

  const geom = useMemo(() => {
    const plotW = Math.max(60, width - PAD.left - PAD.right);
    const plotH = H - PAD.top - PAD.bottom;
    // One axis, always 0–100% of the plan. Never a second y-scale: two measures
    // of different scale on one chart is the single worst chart mistake, and
    // here they are the same measure anyway.
    const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const y = (min: number) => PAD.top + plotH - (total > 0 ? Math.min(1, min / total) : 0) * plotH;
    return { plotW, plotH, x, y };
  }, [width, n, total]);

  const paths = useMemo(() => {
    if (n === 0) return { planned: '', earned: '', area: '' };
    const line = (vals: number[]) => vals
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${geom.x(i).toFixed(1)},${geom.y(v).toFixed(1)}`)
      .join(' ');
    const earned = line(curve.earnedCumMin);
    const base = PAD.top + geom.plotH;
    const area = `${earned} L${geom.x(n - 1).toFixed(1)},${base} L${geom.x(0).toFixed(1)},${base} Z`;
    return { planned: line(curve.plannedCumMin), earned, area };
  }, [curve, geom, n]);

  if (n === 0 || total === 0) {
    return (
      <Box sx={{ px: 2, py: 3 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          No plan covers this window, so there is nothing to compare against.
        </Typography>
      </Box>
    );
  }

  const at = hover != null ? Math.max(0, Math.min(n - 1, hover)) : null;
  const lastP = curve.plannedCumMin[n - 1];
  const lastE = curve.earnedCumMin[n - 1];
  const pct = (v: number) => `${Math.round((v / total) * 100)}%`;
  const nowIdx = nowYMD ? curve.days.indexOf(nowYMD) : -1;

  /** Gridlines every 25%, plus their labels. Recessive by design. */
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  /** A date label roughly weekly — thirty-one of them do not fit and are not read. */
  const step = Math.max(1, Math.ceil(n / 5));

  return (
    <Box
      ref={(el: HTMLDivElement | null) => {
        if (el) {
          const w = Math.round(el.getBoundingClientRect().width);
          if (w > 0 && w !== width) setWidth(w);
        }
      }}
      sx={{ width: '100%' }}
    >
      {/* The legend is always present for two series, and both lines are also
          labelled where they end — identity is never colour alone. */}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ px: 1, pb: 0.5 }} flexWrap="wrap" useFlexGap>
        <Typography variant="caption" sx={{ fontWeight: 700 }}>Progress against plan</Typography>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <svg width="18" height="8" aria-hidden><line x1="0" y1="4" x2="18" y2="4" stroke={ink.earned} strokeWidth="2" /></svg>
          <Typography variant="caption">Earned</Typography>
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <svg width="18" height="8" aria-hidden><line x1="0" y1="4" x2="18" y2="4" stroke={ink.planned} strokeWidth="2" strokeDasharray="4 3" /></svg>
          <Typography variant="caption">Planned</Typography>
        </Stack>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" sx={{ color: lastE >= lastP ? 'success.main' : 'warning.main', fontWeight: 600 }}>
          {lastE >= lastP
            ? `${fmtMin(lastE - lastP)} ahead of plan`
            : `${fmtMin(lastP - lastE)} behind plan`}
        </Typography>
      </Stack>

      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        style={{ display: 'block', touchAction: 'none' }}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const rel = ((e.clientX - r.left) / r.width) * width;
          setHover(Math.round(((rel - PAD.left) / geom.plotW) * (n - 1)));
        }}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Cumulative progress against plan. Earned ${pct(lastE)}, planned ${pct(lastP)} of the plan by ${curve.days[n - 1]}.`}
      >
        {ticks.map((t) => {
          const y = PAD.top + geom.plotH - t * geom.plotH;
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={width - PAD.right} y2={y} stroke={ink.grid} strokeWidth="1" />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize="10" fill={ink.axis}>
                {Math.round(t * 100)}%
              </text>
            </g>
          );
        })}

        {/* The final date is always worth labelling, but not on top of the one
            before it — at a 31-day month the stepped labels land on the 29th and
            the forced last on the 31st, close enough to overlap. Dropped when it
            would collide. */}
        {curve.days.map((d, i) => {
          const stepped = i % step === 0;
          const isLast = i === n - 1;
          const lastStepped = Math.floor((n - 1) / step) * step;
          const crowded = isLast && !stepped && (i - lastStepped) < Math.max(2, step / 2);
          if (!stepped && !(isLast && !crowded)) return null;
          return (
            <text key={d} x={geom.x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill={ink.axis}>
              {shortDay(d)}
            </text>
          );
        })}

        {nowIdx >= 0 && (
          <line
            x1={geom.x(nowIdx)} y1={PAD.top} x2={geom.x(nowIdx)} y2={PAD.top + geom.plotH}
            stroke={ink.now} strokeWidth="1.5"
          />
        )}

        <path d={paths.area} fill={ink.earnedFill} stroke="none" />
        <path d={paths.planned} fill="none" stroke={ink.planned} strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />
        <path d={paths.earned} fill="none" stroke={ink.earned} strokeWidth="2" strokeLinejoin="round" />

        {/* Direct labels at the line ends — two series, so both get one. */}
        <text x={width - PAD.right + 6} y={geom.y(lastE) + 3} fontSize="10" fontWeight={700} fill={ink.earned}>
          {pct(lastE)}
        </text>
        <text x={width - PAD.right + 6} y={geom.y(lastP) + 3} fontSize="10" fill={ink.planned}>
          {pct(lastP)}
        </text>

        {at != null && (
          <g>
            <line x1={geom.x(at)} y1={PAD.top} x2={geom.x(at)} y2={PAD.top + geom.plotH} stroke={ink.axis} strokeWidth="1" strokeDasharray="2 2" />
            {/* A 2px surface ring keeps the markers legible where the lines cross. */}
            <circle cx={geom.x(at)} cy={geom.y(curve.plannedCumMin[at])} r="4" fill={ink.planned} stroke={dark ? '#161826' : '#FFFFFF'} strokeWidth="2" />
            <circle cx={geom.x(at)} cy={geom.y(curve.earnedCumMin[at])} r="4.5" fill={ink.earned} stroke={dark ? '#161826' : '#FFFFFF'} strokeWidth="2" />
          </g>
        )}
      </svg>

      {at != null && (
        <Stack direction="row" spacing={2} sx={{ px: 1, pt: 0.5 }} flexWrap="wrap" useFlexGap>
          <Typography variant="caption" sx={{ fontWeight: 600 }}>{shortDay(curve.days[at])}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            earned {pct(curve.earnedCumMin[at])} ({fmtMin(curve.earnedCumMin[at])})
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            planned {pct(curve.plannedCumMin[at])} ({fmtMin(curve.plannedCumMin[at])})
          </Typography>
        </Stack>
      )}
    </Box>
  );
}
